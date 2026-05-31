'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, ShoppingBag, X, Loader2 } from 'lucide-react';
import { formatMinor } from '@/lib/money';

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
  zoneName: string;
  categories: Category[];
}

interface CartItem {
  menuItemId: string;
  name: string;
  price_minor: number;
  qty: number;
}

export default function MenuInteractive({ venue, location, zoneName, categories }: MenuInteractiveProps) {
  const router = useRouter();
  const [cart, setCart] = useState<{ [key: string]: CartItem }>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [guestNote, setGuestNote] = useState('');
  const [settlementMode, setSettlementMode] = useState<'pay_at_venue' | 'charge_to_room'>('pay_at_venue');
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id || '');
  const [isPending, startTransition] = useTransition();
  const [orderError, setOrderError] = useState<string | null>(null);

  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const navRef = useRef<HTMLDivElement>(null);

  // Calculate cart counts and totals
  const totalItems = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = Object.values(cart).reduce((sum, item) => sum + item.price_minor * item.qty, 0);

  // Stepper functions
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev[item.id];
      if (existing) {
        if (existing.qty >= 50) return prev; // Upper bound check
        return {
          ...prev,
          [item.id]: { ...existing, qty: existing.qty + 1 },
        };
      }
      return {
        ...prev,
        [item.id]: {
          menuItemId: item.id,
          name: item.name,
          price_minor: item.price_minor,
          qty: 1,
        },
      };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: { ...existing, qty: existing.qty - 1 },
      };
    });
  };

  // Click handler to scroll to category
  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    const target = categoryRefs.current[id];
    if (target) {
      const yOffset = -120; // accounting for headers and category nav
      const y = target.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Scrollspy logic
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150; // offset
      
      for (const cat of categories) {
        const element = categoryRefs.current[cat.id];
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveCategory(cat.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories]);

  // Place Order handler
  const handlePlaceOrder = () => {
    if (totalItems === 0) return;
    setOrderError(null);

    startTransition(async () => {
      try {
        const orderItems = Object.values(cart).map(item => ({
          menuItemId: item.menuItemId,
          qty: item.qty,
        }));

        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            qrToken: location.qrToken,
            items: orderItems,
            note: guestNote.trim() || undefined,
            settlement: settlementMode,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errMsg = data.error?.message || 'Failed to place order. Please try again.';
          throw new Error(errMsg);
        }

        // Clean cart on success and navigate to dynamic polling tracker page
        setCart({});
        setIsCartOpen(false);
        router.push(`/o/${venue.slug}/${location.qrToken}/order/${data.orderId}`);
      } catch (err) {
        console.error('Order placement error:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setOrderError(errMsg || 'An unexpected connection error occurred.');
      }
    });
  };

  if (categories.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-brand-sand-light text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light">
        <div className="max-w-md w-full text-center space-y-4 border border-brand-sand-dark dark:border-brand-charcoal-light p-8 rounded-2xl bg-white dark:bg-brand-charcoal-dark shadow-sm">
          <div className="text-brand-turquoise text-5xl">🍳</div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal-dark dark:text-brand-sand-light">Kitchen Closed</h1>
          <p className="text-base text-brand-charcoal-light dark:text-brand-sand-dark leading-relaxed">
            The kitchen is currently closed or no menu items are available in this zone right now. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-sand-light text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light pb-24 font-sans antialiased">
      
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-brand-charcoal-dark/95 backdrop-blur border-b border-brand-sand-dark dark:border-brand-charcoal-light px-4 py-4 shadow-sm">
        <div className="max-w-xl mx-auto flex flex-col justify-start">
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-turquoise-dark dark:text-brand-turquoise-light leading-tight">
            {venue.name}
          </h1>
          <p className="text-sm font-semibold text-brand-charcoal-light dark:text-brand-sand-dark flex items-center gap-1.5 mt-0.5">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-turquoise animate-pulse"></span>
            {location.label} · {zoneName}
          </p>
        </div>
      </header>

      {/* 2. Sticky Category Jumps */}
      <nav ref={navRef} className="sticky top-[69px] z-20 bg-white/90 dark:bg-brand-charcoal-dark/90 backdrop-blur border-b border-brand-sand-dark dark:border-brand-charcoal-light overflow-x-auto scrollbar-none py-3 px-4 shadow-sm">
        <div className="max-w-xl mx-auto flex gap-2.5 whitespace-nowrap">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={`tap-target px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                activeCategory === cat.id
                  ? 'bg-brand-turquoise text-white shadow-sm scale-102'
                  : 'bg-brand-sand/60 text-brand-charcoal-light hover:bg-brand-sand/90 dark:bg-brand-charcoal dark:text-brand-sand-light dark:hover:bg-brand-charcoal-light'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </nav>

      {/* 3. Menu Grid / Lists */}
      <main className="max-w-xl mx-auto px-4 mt-6 space-y-8">
        {categories.map(cat => (
          <div
            key={cat.id}
            ref={el => { categoryRefs.current[cat.id] = el; }}
            className="scroll-mt-36 space-y-4"
          >
            <h2 className="text-lg font-extrabold tracking-tight text-brand-charcoal-dark dark:text-brand-sand-light border-l-4 border-brand-turquoise pl-2.5">
              {cat.name}
            </h2>
            <div className="space-y-3.5">
              {cat.items.map(item => {
                const cartQty = cart[item.id]?.qty || 0;
                return (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 bg-white dark:bg-brand-charcoal-dark border border-brand-sand-dark dark:border-brand-charcoal-light rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md"
                  >
                    {/* Item Image */}
                    {item.image_url && (
                      <div className="relative w-20 h-20 bg-brand-sand rounded-xl overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image_url}
                          alt={item.name}
                          loading="lazy"
                          className="object-cover w-full h-full"
                        />
                      </div>
                    )}

                    {/* Item Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="space-y-0.5">
                        <h3 className="text-base font-bold text-brand-charcoal-dark dark:text-brand-sand-light truncate">
                          {item.name}
                        </h3>
                        {item.description && (
                          <p className="text-xs text-brand-charcoal-light dark:text-brand-sand-dark line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-2.5">
                        <span className="text-sm font-black text-brand-turquoise-dark dark:text-brand-turquoise-light">
                          {formatMinor(item.price_minor, venue.currency)}
                        </span>

                        {/* Cart Control Steppers */}
                        {cartQty > 0 ? (
                          <div className="flex items-center bg-brand-turquoise rounded-full p-1 text-white shadow-sm scale-102 transition-transform">
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-turquoise-dark transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={15} strokeWidth={2.5} />
                            </button>
                            <span className="px-3.5 text-sm font-extrabold w-4 text-center">
                              {cartQty}
                            </span>
                            <button
                              onClick={() => addToCart(item)}
                              disabled={cartQty >= 50}
                              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-turquoise-dark transition-colors disabled:opacity-50"
                              aria-label="Increase quantity"
                            >
                              <Plus size={15} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(item)}
                            className="tap-target px-4 bg-brand-sand hover:bg-brand-sand-dark text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light dark:hover:bg-brand-charcoal-light text-xs font-bold rounded-full transition-colors flex items-center gap-1 shadow-sm border border-brand-sand-dark dark:border-brand-charcoal-light"
                          >
                            <Plus size={14} strokeWidth={2.5} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {/* 4. Bottom Sticky Cart Bar */}
      {totalItems > 0 && !isCartOpen && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-40 bg-gradient-to-t from-brand-sand-light via-brand-sand-light/95 to-transparent dark:from-brand-charcoal dark:via-brand-charcoal/95">
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full tap-target bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold rounded-2xl shadow-lg flex justify-between items-center px-6 transition-all duration-200 active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} strokeWidth={2.5} />
                <span className="text-xs bg-white/25 px-2.5 py-0.5 rounded-full font-black">
                  {totalItems}
                </span>
                <span className="text-sm tracking-wide">View Cart</span>
              </div>
              <span className="text-sm font-black">
                {formatMinor(cartTotal, venue.currency)}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Cart Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-brand-charcoal-dark/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => !isPending && setIsCartOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="absolute inset-x-0 bottom-0 max-h-[90vh] bg-white dark:bg-brand-charcoal-dark border-t border-brand-sand-dark dark:border-brand-charcoal-light rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-300">
            {/* Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-brand-sand-dark dark:border-brand-charcoal-light">
              <h3 className="text-base font-extrabold text-brand-charcoal-dark dark:text-brand-sand-light flex items-center gap-2">
                <ShoppingBag size={18} className="text-brand-turquoise" /> Your Order
              </h3>
              <button
                onClick={() => setIsCartOpen(false)}
                disabled={isPending}
                className="tap-target w-9 h-9 flex items-center justify-center rounded-full bg-brand-sand/50 text-brand-charcoal-light hover:bg-brand-sand dark:bg-brand-charcoal dark:text-brand-sand-light transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Items list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="divide-y divide-brand-sand-dark dark:divide-brand-charcoal-light">
                {Object.values(cart).map(item => (
                  <div key={item.menuItemId} className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 pr-4">
                      <h4 className="text-sm font-bold text-brand-charcoal-dark dark:text-brand-sand-light truncate">
                        {item.name}
                      </h4>
                      <p className="text-xs font-black text-brand-turquoise-dark dark:text-brand-turquoise-light mt-0.5">
                        {formatMinor(item.price_minor * item.qty, venue.currency)}
                      </p>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center bg-brand-sand dark:bg-brand-charcoal rounded-full p-0.5 border border-brand-sand-dark dark:border-brand-charcoal-light shrink-0">
                      <button
                        onClick={() => removeFromCart(item.menuItemId)}
                        disabled={isPending}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-brand-sand-dark dark:hover:bg-brand-charcoal-light transition-colors disabled:opacity-50"
                      >
                        <Minus size={13} strokeWidth={2.5} />
                      </button>
                      <span className="px-2.5 text-xs font-black w-4 text-center">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => addToCart({ id: item.menuItemId, name: item.name, price_minor: item.price_minor, description: null, image_url: null })}
                        disabled={isPending || item.qty >= 50}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-brand-sand-dark dark:hover:bg-brand-charcoal-light transition-colors disabled:opacity-50"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Guest Notes */}
              <div className="pt-4 border-t border-brand-sand-dark dark:border-brand-charcoal-light space-y-1.5">
                <label className="text-xs font-extrabold text-brand-charcoal-light dark:text-brand-sand-dark">
                  Anything we should know? (allergies, requests)
                </label>
                <textarea
                  value={guestNote}
                  onChange={e => setGuestNote(e.target.value.slice(0, 280))}
                  disabled={isPending}
                  placeholder="E.g. No seafood allergies, ice on the side, extra lime..."
                  maxLength={280}
                  className="w-full min-h-[70px] text-sm p-3 bg-brand-sand-light dark:bg-brand-charcoal/50 border border-brand-sand-dark dark:border-brand-charcoal-light rounded-xl outline-none focus:border-brand-turquoise focus:ring-1 focus:ring-brand-turquoise transition-all resize-none text-brand-charcoal-dark dark:text-brand-sand-light"
                />
                <div className="text-right text-[10px] text-brand-charcoal-light dark:text-brand-sand-dark font-mono">
                  {guestNote.length}/280
                </div>
              </div>

              {/* Settlement Options Seam */}
              <div className="pt-4 border-t border-brand-sand-dark dark:border-brand-charcoal-light space-y-2">
                <label className="text-xs font-extrabold text-brand-charcoal-light dark:text-brand-sand-dark">
                  How would you like to settle?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSettlementMode('pay_at_venue')}
                    disabled={isPending}
                    className={`tap-target px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                      settlementMode === 'pay_at_venue'
                        ? 'border-brand-turquoise bg-brand-turquoise/5 text-brand-turquoise font-black'
                        : 'border-brand-sand-dark dark:border-brand-charcoal-light bg-transparent hover:bg-brand-sand/30 dark:hover:bg-brand-charcoal-light/30'
                    }`}
                  >
                    Pay at Venue
                  </button>
                  <button
                    onClick={() => setSettlementMode('charge_to_room')}
                    disabled={isPending}
                    className={`tap-target px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                      settlementMode === 'charge_to_room'
                        ? 'border-brand-turquoise bg-brand-turquoise/5 text-brand-turquoise font-black'
                        : 'border-brand-sand-dark dark:border-brand-charcoal-light bg-transparent hover:bg-brand-sand/30 dark:hover:bg-brand-charcoal-light/30'
                    }`}
                  >
                    Charge to Room
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-5 border-t border-brand-sand-dark dark:border-brand-charcoal-light space-y-3.5 bg-brand-sand-light/50 dark:bg-brand-charcoal-dark/50">
              <div className="flex justify-between items-center font-bold">
                <span className="text-sm font-semibold text-brand-charcoal-light dark:text-brand-sand-dark">Subtotal</span>
                <span className="text-lg font-black text-brand-charcoal-dark dark:text-brand-sand-light">
                  {formatMinor(cartTotal, venue.currency)}
                </span>
              </div>

              {orderError && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold leading-relaxed animate-pulse">
                  {orderError}
                </div>
              )}

              <button
                onClick={handlePlaceOrder}
                disabled={isPending || totalItems === 0}
                className="w-full tap-target bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center gap-2 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Placing Order...
                  </>
                ) : (
                  'Confirm & Place Order'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
