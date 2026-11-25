'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import { readActiveOrder } from '@/lib/active-order';
import { SETTLEMENT_LABELS, type Settlement } from '@/lib/orders';
import Notice from '@/components/Notice';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  image_url: string | null;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

interface MenuInteractiveProps {
  venue: {
    name: string;
    slug: string;
    currency: string;
  };
  location: {
    label: string;
    qrToken: string;
  };
  categories: Category[];
}

/** Cart is item id → quantity. Names and prices always come from the menu, never from the cart. */
type Cart = Record<string, number>;

const MAX_QTY = 50;
const NOTE_MAX = 280;
const SETTLEMENTS: Settlement[] = ['pay_at_venue', 'charge_to_room'];
const CART_KEY_PREFIX = 'tapmeza.cart.';

function readStoredCart(qrToken: string): Cart {
  try {
    const raw = window.sessionStorage.getItem(CART_KEY_PREFIX + qrToken);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const cart: Cart = {};
    for (const [id, qty] of Object.entries(parsed)) {
      if (typeof qty === 'number' && Number.isInteger(qty) && qty > 0) cart[id] = Math.min(qty, MAX_QTY);
    }
    return cart;
  } catch (err) {
    console.warn('Could not restore the cart:', err);
    return {};
  }
}

function writeStoredCart(qrToken: string, cart: Cart): void {
  try {
    if (Object.keys(cart).length === 0) window.sessionStorage.removeItem(CART_KEY_PREFIX + qrToken);
    else window.sessionStorage.setItem(CART_KEY_PREFIX + qrToken, JSON.stringify(cart));
  } catch (err) {
    console.warn('Could not save the cart:', err);
  }
}

const RETRY_MESSAGE = 'Your order did not go through. Please try again.';
const INACTIVE_MESSAGE = "This QR code isn't active. Please ask a member of staff.";
const UNAVAILABLE_MESSAGE = 'Something in your order is no longer available. Reload the menu and try again.';

/** Plain-language wording for each reason the order route can refuse an order. */
const ORDER_ERROR_MESSAGES: Record<string, string> = {
  LOCATION_NOT_FOUND: INACTIVE_MESSAGE,
  VENUE_OR_LOCATION_INACTIVE: INACTIVE_MESSAGE,
  ITEMS_UNAVAILABLE: UNAVAILABLE_MESSAGE,
  ZONE_RESTRICTED: UNAVAILABLE_MESSAGE,
};

function readOrderResponse(data: unknown): { orderId?: string; errorMessage: string } {
  if (typeof data !== 'object' || data === null) return { errorMessage: RETRY_MESSAGE };
  const body = data as { orderId?: unknown; error?: { code?: unknown; message?: unknown } | null };
  const code = typeof body.error?.code === 'string' ? body.error.code : '';
  // The daypart message names the dish, so it is shown as sent.
  const serverMessage = code === 'DAYPART_RESTRICTED' && typeof body.error?.message === 'string' ? body.error.message : undefined;
  return {
    orderId: typeof body.orderId === 'string' ? body.orderId : undefined,
    errorMessage: ORDER_ERROR_MESSAGES[code] ?? serverMessage ?? RETRY_MESSAGE,
  };
}

export default function MenuInteractive({ venue, location, categories }: MenuInteractiveProps) {
  const router = useRouter();
  const [cart, setCart] = useState<Cart>({});
  const [cartRestored, setCartRestored] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [guestNote, setGuestNote] = useState('');
  const [settlement, setSettlement] = useState<Settlement>('pay_at_venue');
  const [isPlacing, setIsPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const tabsRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const jumpLockRef = useRef(false);

  const itemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const category of categories) for (const item of category.items) map.set(item.id, item);
    return map;
  }, [categories]);

  const lines = useMemo(
    () =>
      Object.entries(cart).flatMap(([id, qty]) => {
        const item = itemsById.get(id);
        return item ? [{ item, qty }] : [];
      }),
    [cart, itemsById]
  );
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const totalMinor = lines.reduce((sum, line) => sum + line.item.price_minor * line.qty, 0);

  const changeQty = useCallback((id: string, delta: number) => {
    setCart((prev) => {
      const qty = Math.min(MAX_QTY, (prev[id] ?? 0) + delta);
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }, []);

  // Restore what this phone had in the cart (a reload or Back must not wipe it), and any order in progress.
  useEffect(() => {
    const stored = readStoredCart(location.qrToken);
    const stillOnMenu: Cart = {};
    for (const [id, qty] of Object.entries(stored)) if (itemsById.has(id)) stillOnMenu[id] = qty;
    setCart(stillOnMenu);
    setCartRestored(true);
    setActiveOrderId(readActiveOrder(location.qrToken));
  }, [location.qrToken, itemsById]);

  useEffect(() => {
    if (cartRestored) writeStoredCart(location.qrToken, cart);
  }, [cart, cartRestored, location.qrToken]);

  // Highlight the section being read. Observers only — no work on every scroll frame.
  useEffect(() => {
    if (categories.length < 2) return;
    const visible = new Set<string>();
    const lastId = categories[categories.length - 1]?.id;
    let atEnd = false;

    const update = () => {
      if (jumpLockRef.current) return;
      const next = atEnd && window.scrollY > 8 ? lastId : categories.find((c) => visible.has(c.id))?.id;
      if (next) setActiveCategory(next);
    };

    const band = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.category;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        update();
      },
      { rootMargin: '-56px 0px -80% 0px' }
    );
    const end = new IntersectionObserver((entries) => {
      atEnd = entries[entries.length - 1]?.isIntersecting ?? false;
      update();
    });

    for (const el of sectionRefs.current.values()) band.observe(el);
    if (endRef.current) end.observe(endRef.current);
    return () => {
      band.disconnect();
      end.disconnect();
    };
  }, [categories]);

  // Keep the active tab in view within the tab strip.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !tab) return;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
  }, [activeCategory]);

  const jumpTo = (id: string) => {
    setActiveCategory(id);
    jumpLockRef.current = true;
    window.setTimeout(() => {
      jumpLockRef.current = false;
    }, 800);
    sectionRefs.current.get(id)?.scrollIntoView({ block: 'start' });
  };

  const closeCart = useCallback(() => {
    if (!isPlacing) setIsCartOpen(false);
  }, [isPlacing]);

  useEffect(() => {
    if (isCartOpen && itemCount === 0) setIsCartOpen(false);
  }, [isCartOpen, itemCount]);

  useEffect(() => {
    if (!isCartOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCart();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCartOpen, closeCart]);

  const placeOrder = async () => {
    if (isPlacing || itemCount === 0) return;
    setIsPlacing(true);
    setOrderError(null);

    let response: Response;
    try {
      response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken: location.qrToken,
          items: lines.map((line) => ({ menuItemId: line.item.id, qty: line.qty })),
          note: guestNote.trim() || undefined,
          settlement,
        }),
      });
    } catch (err) {
      console.error('Order request did not reach the server:', err);
      setOrderError('No connection. Check your signal and try again.');
      setIsPlacing(false);
      return;
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch (err) {
      console.error('Order response was not readable:', err);
    }
    const { orderId, errorMessage } = readOrderResponse(data);

    if (!response.ok || !orderId) {
      console.error('Order was rejected:', response.status, data);
      setOrderError(errorMessage);
      setIsPlacing(false);
      return;
    }

    // Stay in the "placing" state until the status screen replaces this one, so a second tap can't re-order.
    writeStoredCart(location.qrToken, {});
    router.push(`/o/${venue.slug}/${location.qrToken}/order/${orderId}`);
  };

  if (categories.length === 0) {
    return <Notice title="Nothing to order right now">Please ask a member of staff.</Notice>;
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-xl items-start justify-between gap-3 px-4 pt-5 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{venue.name}</h1>
          <p className="text-muted">{location.label}</p>
        </div>
        {activeOrderId && (
          <Link
            href={`/o/${venue.slug}/${location.qrToken}/order/${activeOrderId}`}
            className="btn btn-secondary min-h-11 shrink-0 px-4 text-sm"
          >
            Track order
          </Link>
        )}
      </header>

      {categories.length > 1 && (
        <nav aria-label="Menu sections" className="sticky top-0 z-20 border-b border-line bg-canvas">
          <div ref={tabsRef} className="no-scrollbar relative mx-auto flex max-w-xl overflow-x-auto px-1">
            {categories.map((category) => {
              const isActive = category.id === activeCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => jumpTo(category.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`h-12 shrink-0 border-b-2 px-3 font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'border-ink text-ink' : 'border-transparent text-muted'
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className={`mx-auto max-w-xl px-4 ${itemCount > 0 ? 'pb-28' : 'pb-10'}`}>
        {categories.map((category) => (
          <section
            key={category.id}
            data-category={category.id}
            aria-labelledby={`category-${category.id}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(category.id, el);
              else sectionRefs.current.delete(category.id);
            }}
            className="scroll-mt-12"
          >
            <h2 id={`category-${category.id}`} className="pt-6 text-lg font-bold">
              {category.name}
            </h2>
            <ul className="divide-y divide-line">
              {category.items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  qty={cart[item.id] ?? 0}
                  currency={venue.currency}
                  onChange={changeQty}
                />
              ))}
            </ul>
          </section>
        ))}
        <div ref={endRef} aria-hidden className="h-px" />
      </main>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="btn btn-primary mx-auto grid h-14 w-full max-w-xl grid-cols-[1fr_auto_1fr] px-4"
          >
            <span className="justify-self-start rounded-full bg-on-accent/20 px-2.5 py-0.5 text-sm tabular-nums">
              {itemCount}
            </span>
            <span>View order</span>
            <span className="justify-self-end tabular-nums">{formatMinor(totalMinor, venue.currency)}</span>
          </button>
        </div>
      )}

      {isCartOpen && (
        <div className="fixed inset-0 z-50">
          <div aria-hidden onClick={closeCart} className="absolute inset-0 animate-fade-in bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-xl animate-sheet-up flex-col rounded-t-2xl bg-surface"
          >
            <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
              <div className="min-w-0">
                <h2 id="cart-title" className="text-lg font-bold">
                  Your order
                </h2>
                <p className="truncate text-sm text-muted">{location.label}</p>
              </div>
              <button type="button" onClick={closeCart} disabled={isPlacing} aria-label="Close" className="icon-btn">
                <X size={22} aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              <ul className="divide-y divide-line border-y border-line">
                {lines.map(({ item, qty }) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted tabular-nums">
                        {formatMinor(item.price_minor * qty, venue.currency)}
                      </p>
                    </div>
                    <QtyControl
                      name={item.name}
                      qty={qty}
                      disabled={isPlacing}
                      onChange={(delta) => changeQty(item.id, delta)}
                    />
                  </li>
                ))}
              </ul>

              <label htmlFor="guest-note" className="sr-only">
                Note for staff
              </label>
              <textarea
                id="guest-note"
                rows={2}
                value={guestNote}
                onChange={(event) => setGuestNote(event.target.value.slice(0, NOTE_MAX))}
                disabled={isPlacing}
                maxLength={NOTE_MAX}
                placeholder="Allergies or requests (optional)"
                className="field mt-4 resize-none py-3"
              />
              {guestNote.length > NOTE_MAX - 40 && (
                <p className="mt-1 text-right text-sm text-muted tabular-nums">
                  {guestNote.length}/{NOTE_MAX}
                </p>
              )}

              <fieldset className="mt-3 grid grid-cols-2 gap-2" disabled={isPlacing}>
                <legend className="sr-only">Payment</legend>
                {SETTLEMENTS.map((option) => {
                  const isSelected = option === settlement;
                  return (
                    <label
                      key={option}
                      className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                        isSelected ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted'
                      }`}
                    >
                      <input
                        type="radio"
                        name="settlement"
                        value={option}
                        checked={isSelected}
                        onChange={() => setSettlement(option)}
                        className="sr-only"
                      />
                      {isSelected && <Check size={16} strokeWidth={2.5} aria-hidden />}
                      {SETTLEMENT_LABELS[option]}
                    </label>
                  );
                })}
              </fieldset>
            </div>

            <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {orderError && (
                <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium">
                  {orderError}
                </p>
              )}
              <button
                type="button"
                onClick={placeOrder}
                disabled={isPlacing}
                className={`btn btn-primary h-14 w-full px-5 ${isPlacing ? '' : 'justify-between'}`}
              >
                {isPlacing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" aria-hidden />
                    Placing order…
                  </>
                ) : (
                  <>
                    <span>{orderError ? 'Try again' : 'Place order'}</span>
                    <span className="tabular-nums">{formatMinor(totalMinor, venue.currency)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuItemRowProps {
  item: MenuItem;
  qty: number;
  currency: string;
  onChange: (id: string, delta: number) => void;
}

/** Memoised so tapping + on one item re-renders that row only. */
const MenuItemRow = memo(function MenuItemRow({ item, qty, currency, onChange }: MenuItemRowProps) {
  return (
    <li className="py-4">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="leading-snug font-semibold">{item.name}</h3>
          {item.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted">{item.description}</p>
          )}
        </div>
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            className="size-20 shrink-0 rounded-xl bg-fill object-cover"
          />
        )}
      </div>
      <div className="mt-1 flex min-h-11 items-center justify-between gap-3">
        <span className="font-medium tabular-nums">{formatMinor(item.price_minor, currency)}</span>
        <QtyControl name={item.name} qty={qty} onChange={(delta) => onChange(item.id, delta)} />
      </div>
    </li>
  );
});

interface QtyControlProps {
  name: string;
  qty: number;
  disabled?: boolean;
  onChange: (delta: number) => void;
}

/** A single + until the item is in the order, then − qty +. Same control on the menu and in the cart. */
function QtyControl({ name, qty, disabled = false, onChange }: QtyControlProps) {
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={disabled}
        aria-label={`Add ${name}`}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent transition-colors active:bg-accent active:text-on-accent disabled:opacity-50"
      >
        <Plus size={22} strokeWidth={2.5} aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex h-11 shrink-0 items-center rounded-full bg-accent text-on-accent">
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={disabled}
        aria-label={qty === 1 ? `Remove ${name}` : `One less ${name}`}
        className="grid size-11 place-items-center rounded-full active:bg-accent-strong disabled:opacity-50"
      >
        {qty === 1 ? <Trash2 size={18} aria-hidden /> : <Minus size={20} strokeWidth={2.5} aria-hidden />}
      </button>
      <span aria-live="polite" className="min-w-5 text-center font-semibold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={disabled || qty >= MAX_QTY}
        aria-label={`One more ${name}`}
        className="grid size-11 place-items-center rounded-full active:bg-accent-strong disabled:opacity-50"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
