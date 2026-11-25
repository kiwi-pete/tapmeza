'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, LogOut, Settings, WifiOff, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { updateOrderStatus } from '@/app/staff/actions';
import { formatMinor } from '@/lib/money';
import {
  ACTIVE_STATUSES,
  isActiveStatus,
  SETTLEMENT_LABELS,
  type ActiveStatus,
  type OrderStatus,
  type Settlement,
} from '@/lib/orders';

interface OrderItem {
  id: string;
  name_snapshot: string;
  qty: number;
}

interface Order {
  id: string;
  status: OrderStatus;
  currency: string;
  total_minor: number;
  guest_note: string | null;
  settlement: Settlement;
  created_at: string;
  locations: {
    label: string;
  } | null;
  order_items: OrderItem[];
}

interface StaffDashboardProps {
  venue: {
    id: string;
    name: string;
  };
  /** Owners get a link to the Admin Portal. */
  canManage: boolean;
}

interface Column {
  status: ActiveStatus;
  title: string;
  /** Label of the one button that moves a ticket out of this column. */
  action: string;
  next: OrderStatus;
}

const COLUMNS: Column[] = [
  { status: 'received', title: 'New', action: 'Start preparing', next: 'preparing' },
  { status: 'preparing', title: 'Preparing', action: 'Mark ready', next: 'ready' },
  { status: 'ready', title: 'Ready', action: 'Mark delivered', next: 'delivered' },
];

const STATUS_NAMES: Record<OrderStatus, string> = {
  received: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ORDER_SELECT =
  'id, status, currency, total_minor, guest_note, settlement, created_at, locations(label), order_items(id, name_snapshot, qty)';

/** Ticket age at which the timer turns amber, then red. */
const WARN_AFTER_MIN = 10;
const LATE_AFTER_MIN = 20;
const UNDO_WINDOW_MS = 6000;
/** Ignore a second tap this soon after a ticket moves, so a double-tap can't advance its neighbour. */
const TAP_GUARD_MS = 400;
const SOUND_KEY = 'tapmeza.staff.sound';

function oldestFirst(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function ageMinutes(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
}

function ageLabel(minutes: number): string {
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function locationLabel(order: Order): string {
  return order.locations?.label ?? 'Order';
}

export default function StaffDashboard({ venue, canManage }: StaffDashboardProps) {
  const router = useRouter();
  const [supabase] = useState(createSupabaseBrowserClient);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);
  const [tab, setTab] = useState<ActiveStatus>('received');
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ order: Order; to: OrderStatus } | null>(null);

  const ordersRef = useRef<Order[]>([]);
  const busyRef = useRef(new Set<string>());
  const knownIdsRef = useRef(new Set<string>());
  const hasLoadedRef = useRef(false);
  const soundOnRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const lastMoveRef = useRef(0);
  const undoTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Two-note bell from the Web Audio API — no audio file to download.
  const playChime = useCallback(() => {
    if (!soundOnRef.current) return;
    try {
      const AudioCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = audioRef.current ?? new AudioCtor();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch((err: unknown) => console.warn('Order sound is blocked until the screen is tapped:', err));
      }
      const start = ctx.currentTime;
      const notes: [frequency: number, offset: number, volume: number][] = [
        [880, 0, 0.35],
        [1318.51, 0.12, 0.25],
        [880, 0.5, 0.35],
        [1318.51, 0.62, 0.25],
      ];
      for (const [frequency, offset, volume] of notes) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        gain.gain.setValueAtTime(0, start + offset);
        gain.gain.linearRampToValueAtTime(volume, start + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.6);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.65);
      }
    } catch (err) {
      console.error('Could not play the new-order sound:', err);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('venue_id', venue.id)
      .in('status', [...ACTIVE_STATUSES])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load orders:', error);
      if (!hasLoadedRef.current) setLoadState('failed');
      return;
    }

    const fresh = (data as unknown as Order[]) ?? [];
    const hasUnseenNew = fresh.some((o) => o.status === 'received' && !knownIdsRef.current.has(o.id));
    if (hasLoadedRef.current && hasUnseenNew) playChime();
    for (const o of fresh) knownIdsRef.current.add(o.id);
    hasLoadedRef.current = true;

    // Tickets with an update still on its way to the server keep their on-screen state.
    setOrders((prev) => {
      const pending = busyRef.current;
      if (pending.size === 0) return fresh;
      const onScreen = new Map(prev.map((o) => [o.id, o]));
      return fresh.flatMap((o) => {
        if (!pending.has(o.id)) return [o];
        const mine = onScreen.get(o.id);
        return mine ? [mine] : [];
      });
    });
    setLoadState('ready');
  }, [supabase, venue.id, playChime]);

  const fetchOrder = useCallback(
    async (orderId: string): Promise<Order | null> => {
      const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single();
      if (error) {
        console.error(`Failed to load order ${orderId}:`, error);
        return null;
      }
      return data as unknown as Order;
    },
    [supabase]
  );

  // First load, the ticket-age clock, and a resync whenever the tablet wakes or regains its connection.
  useEffect(() => {
    void loadOrders();
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    const resync = () => {
      if (document.hidden) return;
      setNow(Date.now());
      void loadOrders();
    };
    const goOffline = () => setConnection('offline');
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    window.addEventListener('offline', goOffline);
    return () => {
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
      window.removeEventListener('offline', goOffline);
    };
  }, [loadOrders]);

  // Live updates. Every (re)connect resyncs, so nothing placed during a dropout is missed.
  useEffect(() => {
    let active = true;

    const applyChange = async (orderId: string, status: unknown) => {
      if (!isActiveStatus(status)) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        return;
      }
      if (ordersRef.current.some((o) => o.id === orderId)) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        return;
      }
      const order = await fetchOrder(orderId);
      if (!active || !order || !isActiveStatus(order.status) || busyRef.current.has(orderId)) return;
      setOrders((prev) => oldestFirst([...prev.filter((o) => o.id !== order.id), order]));
      if (order.status === 'received' && !knownIdsRef.current.has(order.id)) playChime();
      knownIdsRef.current.add(order.id);
    };

    const channel = supabase
      .channel(`active-venue-orders-${venue.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `venue_id=eq.${venue.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId: unknown = payload.old.id;
            setOrders((prev) => prev.filter((o) => o.id !== deletedId));
            return;
          }
          const row = payload.new as { id?: unknown; status?: unknown };
          if (typeof row.id === 'string') void applyChange(row.id, row.status);
        }
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          void loadOrders();
        } else {
          setConnection('offline');
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, venue.id, fetchOrder, loadOrders, playChime]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SOUND_KEY) === '1';
      soundOnRef.current = saved;
      setSoundOn(saved);
    } catch (err) {
      console.warn('Could not read the sound setting:', err);
    }
    return () => window.clearTimeout(undoTimerRef.current);
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    soundOnRef.current = next;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    } catch (err) {
      console.warn('Could not save the sound setting:', err);
    }
    // Plays once on switch-on: confirms it works and unlocks audio on this tap.
    if (next) playChime();
  };

  /** Moves a ticket on screen immediately, then confirms with the server; puts it back if that fails. */
  const moveOrder = useCallback(
    async (order: Order, next: OrderStatus, offerUndo: boolean) => {
      if (busyRef.current.has(order.id)) return;
      busyRef.current.add(order.id);
      setBusyIds(new Set(busyRef.current));
      setConfirmCancelId(null);
      setActionError(null);

      setOrders((prev) => {
        const rest = prev.filter((o) => o.id !== order.id);
        return isActiveStatus(next) ? oldestFirst([...rest, { ...order, status: next }]) : rest;
      });

      window.clearTimeout(undoTimerRef.current);
      setUndo(offerUndo ? { order, to: next } : null);
      if (offerUndo) undoTimerRef.current = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);

      let failed = false;
      try {
        const result = await updateOrderStatus(order.id, next);
        if (!result.success) {
          failed = true;
          console.error('Order status update was rejected:', result.error);
        }
      } catch (err) {
        failed = true;
        console.error('Order status update did not reach the server:', err);
      }

      busyRef.current.delete(order.id);
      setBusyIds(new Set(busyRef.current));

      if (failed) {
        window.clearTimeout(undoTimerRef.current);
        setUndo(null);
        setActionError(`${locationLabel(order)} was not updated. Check the connection and try again.`);
        setOrders((prev) => {
          const rest = prev.filter((o) => o.id !== order.id);
          return isActiveStatus(order.status) ? oldestFirst([...rest, order]) : rest;
        });
        void loadOrders();
      }
    },
    [loadOrders]
  );

  const advance = (order: Order, next: OrderStatus) => {
    const tappedAt = Date.now();
    if (tappedAt - lastMoveRef.current < TAP_GUARD_MS) return;
    lastMoveRef.current = tappedAt;
    void moveOrder(order, next, true);
  };

  const undoLastMove = () => {
    if (!undo) return;
    void moveOrder({ ...undo.order, status: undo.to }, undo.order.status, false);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out failed:', error);
    router.push('/login');
    router.refresh();
  };

  const byStatus = (status: ActiveStatus) => orders.filter((o) => o.status === status);

  return (
    <div className="flex min-h-dvh flex-col bg-fill dark:bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface pr-2 pl-4">
        <h1 className="min-w-0 flex-1 truncate font-semibold">{venue.name}</h1>
        {connection !== 'offline' && (
          <span role="status" className="flex items-center gap-1.5 px-2 text-sm text-muted">
            <span className={`size-2 rounded-full ${connection === 'live' ? 'bg-accent' : 'bg-line'}`} />
            {connection === 'live' ? 'Live' : 'Connecting…'}
          </span>
        )}
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          className={`btn min-h-11 px-3 text-sm ${soundOn ? 'btn-secondary' : 'bg-warn-soft text-ink'}`}
        >
          {soundOn ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
          {soundOn ? 'Sound on' : 'Sound off'}
        </button>
        {canManage && (
          <Link href="/admin/menu" aria-label="Manage menu" title="Manage menu" className="icon-btn">
            <Settings size={20} aria-hidden />
          </Link>
        )}
        <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="icon-btn">
          <LogOut size={20} aria-hidden />
        </button>
      </header>

      {connection === 'offline' && (
        <p
          role="alert"
          className="flex items-center justify-center gap-2 bg-danger px-4 py-2 text-center text-sm font-medium text-on-danger"
        >
          <WifiOff size={16} aria-hidden className="shrink-0" />
          Offline — reconnecting. New orders are not coming through.
        </p>
      )}

      {actionError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-warn-soft py-1 pr-2 pl-4">
          <p className="text-sm font-medium">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className="icon-btn">
            <X size={20} aria-hidden />
          </button>
        </div>
      )}

      {loadState === 'failed' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-xl font-bold">Couldn&apos;t load orders</p>
          <button
            type="button"
            onClick={() => {
              setLoadState('loading');
              void loadOrders();
            }}
            className="btn btn-primary"
          >
            Try again
          </button>
        </div>
      ) : loadState === 'ready' && orders.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-xl font-semibold text-muted">No open orders</p>
        </div>
      ) : (
        <>
          <nav aria-label="Order stage" className="sticky top-14 z-10 grid grid-cols-3 border-b border-line bg-surface lg:hidden">
            {COLUMNS.map((column) => {
              const count = byStatus(column.status).length;
              const isSelected = tab === column.status;
              return (
                <button
                  key={column.status}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTab(column.status)}
                  className={`flex h-12 items-center justify-center gap-2 border-b-2 font-medium ${
                    isSelected ? 'border-ink text-ink' : 'border-transparent text-muted'
                  }`}
                >
                  {column.title}
                  <CountBadge count={count} highlight={column.status === 'received'} />
                </button>
              );
            })}
          </nav>

          <main className="grid flex-1 content-start gap-4 p-4 lg:grid-cols-3">
            {COLUMNS.map((column) => {
              const columnOrders = byStatus(column.status);
              return (
                <section
                  key={column.status}
                  aria-label={column.title}
                  className={tab === column.status ? '' : 'hidden lg:block'}
                >
                  <h2 className="mb-3 hidden items-center gap-2 font-semibold lg:flex">
                    {column.title}
                    <CountBadge count={columnOrders.length} highlight={column.status === 'received'} />
                  </h2>

                  {loadState === 'loading' ? (
                    <div className="h-40 animate-pulse rounded-2xl bg-line/60" />
                  ) : columnOrders.length === 0 ? (
                    <p className="py-10 text-center text-muted lg:hidden">No orders</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      {columnOrders.map((order) => (
                        <Ticket
                          key={order.id}
                          order={order}
                          column={column}
                          now={now}
                          busy={busyIds.has(order.id)}
                          confirmingCancel={confirmCancelId === order.id}
                          onAdvance={() => advance(order, column.next)}
                          onAskCancel={() => setConfirmCancelId(order.id)}
                          onKeep={() => setConfirmCancelId(null)}
                          onCancel={() => void moveOrder(order, 'cancelled', true)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </main>
        </>
      )}

      {undo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto flex animate-fade-in items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-5 text-canvas shadow-lg"
          >
            <span className="truncate font-medium">
              {locationLabel(undo.order)} → {STATUS_NAMES[undo.to]}
            </span>
            <button
              type="button"
              onClick={undoLastMove}
              disabled={busyIds.has(undo.order.id)}
              className="min-h-11 shrink-0 rounded-full bg-canvas px-5 font-semibold text-ink disabled:opacity-60"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CountBadge({ count, highlight }: { count: number; highlight: boolean }) {
  return (
    <span
      className={`min-w-6 rounded-full px-1.5 text-center text-sm font-semibold tabular-nums ${
        highlight && count > 0 ? 'bg-accent text-on-accent' : 'bg-line text-ink'
      }`}
    >
      {count}
    </span>
  );
}

interface TicketProps {
  order: Order;
  column: Column;
  now: number;
  busy: boolean;
  confirmingCancel: boolean;
  onAdvance: () => void;
  onAskCancel: () => void;
  onKeep: () => void;
  onCancel: () => void;
}

function Ticket({
  order,
  column,
  now,
  busy,
  confirmingCancel,
  onAdvance,
  onAskCancel,
  onKeep,
  onCancel,
}: TicketProps) {
  const minutes = ageMinutes(order.created_at, now);
  const ageStyle =
    minutes >= LATE_AFTER_MIN
      ? 'bg-danger text-on-danger'
      : minutes >= WARN_AFTER_MIN
        ? 'bg-warn-soft text-ink'
        : 'text-muted';

  return (
    <article
      className={`flex animate-ticket-in flex-col rounded-2xl border bg-surface ${
        order.status === 'received' ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h3 className="truncate text-xl font-bold">{locationLabel(order)}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${ageStyle}`}>
          {ageLabel(minutes)}
        </span>
      </div>

      <ul className="space-y-1 px-4 pt-3 text-lg leading-snug">
        {order.order_items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span className="w-7 shrink-0 font-bold tabular-nums">{item.qty}×</span>
            <span>{item.name_snapshot}</span>
          </li>
        ))}
      </ul>

      {order.guest_note && (
        <p className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2 font-medium break-words">{order.guest_note}</p>
      )}

      <p className="px-4 pt-3 text-sm text-muted">
        <span className="tabular-nums">{formatMinor(order.total_minor, order.currency)}</span> ·{' '}
        {SETTLEMENT_LABELS[order.settlement] ?? order.settlement}
      </p>

      <div className="mt-auto flex gap-2 p-4">
        {confirmingCancel ? (
          <>
            <button type="button" onClick={onKeep} className="btn btn-secondary flex-1 px-3">
              Keep
            </button>
            <button type="button" onClick={onCancel} disabled={busy} className="btn btn-danger flex-1 px-3">
              Cancel order
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onAskCancel} disabled={busy} className="btn btn-secondary px-4">
              Cancel
            </button>
            <button type="button" onClick={onAdvance} disabled={busy} className="btn btn-primary flex-1 px-3">
              {column.action}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
