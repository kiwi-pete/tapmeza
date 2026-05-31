'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { updateOrderStatus } from '@/app/staff/actions';
import { formatMinor } from '@/lib/money';

interface OrderItem {
  id: string;
  name_snapshot: string;
  unit_price_minor_snapshot: number;
  qty: number;
}

interface Order {
  id: string;
  status: 'received' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  currency: string;
  total_minor: number;
  guest_note: string | null;
  settlement: 'pay_at_venue' | 'charge_to_room';
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
    slug: string;
    currency: string;
    timezone: string;
    role: string;
  };
  user: {
    id: string;
    email?: string;
  };
}

export default function StaffDashboard({ venue, user }: StaffDashboardProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  
  const [isPending, startTransition] = useTransition();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const audioRef = useRef<boolean>(false);
  audioRef.current = audioEnabled;

  // Synthesize soft bell chime using native browser Web Audio API
  const playChime = () => {
    if (!audioRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const time = ctx.currentTime;

      // Primary ring (High pitch bell chime)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, time); // A5 note
      gain1.gain.setValueAtTime(0, time);
      gain1.gain.linearRampToValueAtTime(0.12, time + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Harmony chime (Harmonious fifth)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, time + 0.06); // E6 note
      gain2.gain.setValueAtTime(0, time + 0.06);
      gain2.gain.linearRampToValueAtTime(0.08, time + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, time + 1.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(time);
      osc1.stop(time + 1.3);
      osc2.start(time + 0.06);
      osc2.stop(time + 1.6);
    } catch (err) {
      console.error('Audio synthesizer failure:', err);
    }
  };

  // Fetch initial active orders
  const fetchActiveOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          status,
          currency,
          total_minor,
          guest_note,
          settlement,
          created_at,
          locations(label),
          order_items(
            id,
            name_snapshot,
            unit_price_minor_snapshot,
            qty
          )
        `)
        .eq('venue_id', venue.id)
        .in('status', ['received', 'preparing', 'ready'])
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      setOrders((data as unknown as Order[]) || []);
    } catch (err) {
      console.error('Failed to load active orders:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, venue.id]);

  // Single-order targeted fetcher for newly inserted orders
  const fetchSingleOrderDetails = useCallback(async (orderId: string): Promise<Order | null> => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          status,
          currency,
          total_minor,
          guest_note,
          settlement,
          created_at,
          locations(label),
          order_items(
            id,
            name_snapshot,
            unit_price_minor_snapshot,
            qty
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      return data as unknown as Order;
    } catch (err) {
      console.error(`Failed to fetch complete record for order ${orderId}:`, err);
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    fetchActiveOrders();

    const timeTicker = setInterval(() => {
      setNow(Date.now());
    }, 15000);

    return () => clearInterval(timeTicker);
  }, [fetchActiveOrders]);

  useEffect(() => {
    const channel = supabase
      .channel(`active-venue-orders-${venue.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `venue_id=eq.${venue.id}`,
        },
        async (payload) => {
          const eventType = payload.eventType;

          if (eventType === 'INSERT') {
            const newOrder = await fetchSingleOrderDetails(payload.new.id);
            if (newOrder) {
              setOrders((prev) => {
                if (prev.some((o) => o.id === newOrder.id)) return prev;
                return [...prev, newOrder];
              });
              playChime();
            }
          } else if (eventType === 'UPDATE') {
            const updated = payload.new as Order;

            if (['delivered', 'cancelled'].includes(updated.status)) {
              setOrders((prev) => prev.filter((o) => o.id !== updated.id));
              if (selectedOrder?.id === updated.id) {
                setSelectedOrder(null);
                setIsCancelConfirmOpen(false);
              }
            } else {
              setOrders((prev) =>
                prev.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o))
              );
              setSelectedOrder((prev) => {
                if (prev?.id === updated.id) {
                  return { ...prev, status: updated.status };
                }
                return prev;
              });
            }
          } else if (eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
            if (selectedOrder?.id === payload.old.id) {
              setSelectedOrder(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, venue.id, selectedOrder, fetchSingleOrderDetails]);

  const handleStatusUpdate = (orderId: string, nextStatus: Order['status']) => {
    setPendingOrderId(orderId);
    startTransition(async () => {
      const res = await updateOrderStatus(orderId, nextStatus);
      if (!res.success) {
        alert(res.error || 'Failed to update order status. Please try again.');
      }
      setPendingOrderId(null);
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Helper to compute minutes elapsed
  const getElapsedString = (timestamp: string) => {
    const elapsedMs = now - new Date(timestamp).getTime();
    const elapsedMins = Math.floor(elapsedMs / 60000);
    if (elapsedMins < 1) return 'Just now';
    if (elapsedMins < 60) return `${elapsedMins}m ago`;
    const hours = Math.floor(elapsedMins / 60);
    const mins = elapsedMins % 60;
    return `${hours}h ${mins}m ago`;
  };

  // Filter orders by columns
  const receivedOrders = orders.filter((o) => o.status === 'received');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-zinc-800 dark:text-zinc-200 flex flex-col">
      
      {/* Navbar Dashboard Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200/50 dark:border-zinc-800/50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 font-extrabold text-sm tracking-wider uppercase">
            {venue.name}
          </div>
          <span className="text-zinc-300 dark:text-zinc-800">|</span>
          <h1 className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white hidden sm:block">
            Order Lifecycle progression
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Audio Chime Notification Enabler */}
          <button
            onClick={() => setAudioEnabled((prev) => !prev)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold uppercase tracking-wider transition ${
              audioEnabled
                ? 'bg-teal-500 hover:bg-teal-600 text-white shadow-md'
                : 'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {audioEnabled ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .9-1.077 1.346-1.707.707L5.586 15z"
                  />
                </svg>
                <span>Chimes Active</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .9-1.077 1.346-1.707.707L5.586 15zm10.771-4.228A4.996 4.996 0 0013 8v8a4.996 4.996 0 003.357-2.772M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9"
                  />
                </svg>
                <span>Mute Notifications</span>
              </>
            )}
          </button>

          <span className="text-zinc-300 dark:text-zinc-800">|</span>

          {/* User Signout */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium hidden md:block">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-2xl bg-zinc-200 hover:bg-rose-50 hover:text-rose-600 dark:bg-zinc-800 dark:hover:bg-rose-950/20 dark:hover:text-rose-400 transition"
              title="Logout from console"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Board Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3">
            <span className="w-10 h-10 rounded-full border-4 border-teal-500/20 border-t-teal-500 animate-spin" />
            <p className="text-sm font-semibold tracking-wide text-zinc-400">Syncing active dashboard...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto space-y-4">
            <div className="p-4 rounded-3xl bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">All Orders Completed!</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              No pending orders in the queue. New orders placed by customers at QR tables will immediately trigger alerts here.
            </p>
            {/* Quick action to trigger synthesized chime for debugging */}
            <button
              onClick={playChime}
              disabled={!audioEnabled}
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 hover:bg-teal-100 dark:hover:bg-teal-950/40 rounded-xl transition disabled:opacity-50"
            >
              Test Notification Bell
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full items-start">
            
            {/* 1. COLUMN RECEIVED */}
            <section className="flex flex-col bg-zinc-200/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 p-4 rounded-3xl space-y-4 max-h-[80vh] overflow-y-auto min-h-[400px]">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                  <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    New / Received
                  </h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  {receivedOrders.length}
                </span>
              </div>
              
              <div className="space-y-3 flex-1 overflow-y-auto">
                {receivedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    elapsed={getElapsedString(order.created_at)}
                    isPending={isPending && pendingOrderId === order.id}
                    onSelect={() => setSelectedOrder(order)}
                    onProgress={() => handleStatusUpdate(order.id, 'preparing')}
                    actionText="Accept Order"
                    accentColor="teal"
                  />
                ))}
                {receivedOrders.length === 0 && <EmptyColumnState />}
              </div>
            </section>

            {/* 2. COLUMN PREPARING */}
            <section className="flex flex-col bg-zinc-200/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 p-4 rounded-3xl space-y-4 max-h-[80vh] overflow-y-auto min-h-[400px]">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Preparing
                  </h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {preparingOrders.length}
                </span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto">
                {preparingOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    elapsed={getElapsedString(order.created_at)}
                    isPending={isPending && pendingOrderId === order.id}
                    onSelect={() => setSelectedOrder(order)}
                    onProgress={() => handleStatusUpdate(order.id, 'ready')}
                    actionText="Mark Ready"
                    accentColor="amber"
                  />
                ))}
                {preparingOrders.length === 0 && <EmptyColumnState />}
              </div>
            </section>

            {/* 3. COLUMN READY */}
            <section className="flex flex-col bg-zinc-200/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 p-4 rounded-3xl space-y-4 max-h-[80vh] overflow-y-auto min-h-[400px]">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Ready for Service
                  </h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {readyOrders.length}
                </span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto">
                {readyOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    elapsed={getElapsedString(order.created_at)}
                    isPending={isPending && pendingOrderId === order.id}
                    onSelect={() => setSelectedOrder(order)}
                    onProgress={() => handleStatusUpdate(order.id, 'delivered')}
                    actionText="Mark Delivered"
                    accentColor="emerald"
                  />
                ))}
                {readyOrders.length === 0 && <EmptyColumnState />}
              </div>
            </section>

          </div>
        )}
      </main>

      {/* Selected Order Detailed Modal Overlay */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="text-xl font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                  <span>{selectedOrder.locations?.label ?? 'Table/Spot'}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-bold uppercase">
                    {selectedOrder.status}
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1 font-mono">
                  ID: {selectedOrder.id.slice(0, 8)}...
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedOrder(null);
                  setIsCancelConfirmOpen(false);
                }}
                className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              
              {/* Order Items list */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Order Items</h4>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200/30 dark:border-zinc-800/30 p-4 space-y-3">
                  {selectedOrder.order_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between pt-3 first:pt-0">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 font-extrabold text-xs">
                          {item.qty}x
                        </span>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                            {item.name_snapshot}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {formatMinor(item.unit_price_minor_snapshot, selectedOrder.currency)} each
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold">
                        {formatMinor(item.unit_price_minor_snapshot * item.qty, selectedOrder.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guest Notes */}
              {selectedOrder.guest_note && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Guest Note</h4>
                  <div className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/40 dark:border-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-medium italic leading-relaxed">
                    &quot;{selectedOrder.guest_note}&quot;
                  </div>
                </div>
              )}

              {/* Settlement and Pricing Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/30 dark:border-zinc-800/30 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                    Payment Method
                  </span>
                  <span className="text-sm font-bold uppercase tracking-wide">
                    {selectedOrder.settlement.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/30 dark:border-zinc-800/30 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                    Order Total
                  </span>
                  <span className="text-sm font-extrabold text-teal-600 dark:text-teal-400">
                    {formatMinor(selectedOrder.total_minor, selectedOrder.currency)}
                  </span>
                </div>
              </div>

            </div>

            {/* Modal Action Footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
              
              {/* Cancel order block */}
              {isCancelConfirmOpen ? (
                <div className="flex-1 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200/40 dark:border-rose-900/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 text-center sm:text-left leading-relaxed">
                    Are you sure you want to cancel this order?
                  </span>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setIsCancelConfirmOpen(false)}
                      disabled={isPending}
                      className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        handleStatusUpdate(selectedOrder.id, 'cancelled');
                      }}
                      disabled={isPending}
                      className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                    >
                      Confirm Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setIsCancelConfirmOpen(true)}
                    className="py-3 px-6 rounded-2xl border border-rose-200/50 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-sm font-semibold transition"
                  >
                    Cancel Order
                  </button>

                  <div className="flex-1 flex gap-2">
                    {selectedOrder.status === 'received' && (
                      <button
                        onClick={() => handleStatusUpdate(selectedOrder.id, 'preparing')}
                        disabled={isPending}
                        className="flex-1 py-3 px-6 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm transition flex items-center justify-center gap-2"
                      >
                        {isPending ? 'Processing...' : 'Accept & Start Preparing'}
                      </button>
                    )}
                    {selectedOrder.status === 'preparing' && (
                      <button
                        onClick={() => handleStatusUpdate(selectedOrder.id, 'ready')}
                        disabled={isPending}
                        className="flex-1 py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition flex items-center justify-center gap-2"
                      >
                        {isPending ? 'Processing...' : 'Mark as Ready'}
                      </button>
                    )}
                    {selectedOrder.status === 'ready' && (
                      <button
                        onClick={() => handleStatusUpdate(selectedOrder.id, 'delivered')}
                        disabled={isPending}
                        className="flex-1 py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition flex items-center justify-center gap-2"
                      >
                        {isPending ? 'Processing...' : 'Mark as Delivered'}
                      </button>
                    )}
                  </div>
                </>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------
 * SUBCOMPONENTS
 * ------------------------------------------------------------------------- */

interface OrderCardProps {
  order: Order;
  elapsed: string;
  isPending: boolean;
  onSelect: () => void;
  onProgress: () => void;
  actionText: string;
  accentColor: 'teal' | 'amber' | 'emerald';
}

function OrderCard({
  order,
  elapsed,
  isPending,
  onSelect,
  onProgress,
  actionText,
  accentColor,
}: OrderCardProps) {
  
  // Format minor units to major units
  const total = formatMinor(order.total_minor, order.currency);
  
  // Count items
  const itemsCount = order.order_items.reduce((acc, curr) => acc + curr.qty, 0);

  const accentStyles = {
    teal: {
      border: 'hover:border-teal-500/50 focus-within:ring-teal-500/20',
      button: 'bg-teal-600 hover:bg-teal-700 text-white focus:ring-teal-500/30',
      pulse: 'bg-teal-500',
    },
    amber: {
      border: 'hover:border-amber-500/50 focus-within:ring-amber-500/20',
      button: 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500/30',
      pulse: 'bg-amber-500',
    },
    emerald: {
      border: 'hover:border-emerald-500/50 focus-within:ring-emerald-500/20',
      button: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500/30',
      pulse: 'bg-emerald-500',
    },
  }[accentColor];

  return (
    <article
      onClick={onSelect}
      className={`group w-full text-left p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 transition shadow-sm hover:shadow-md cursor-pointer flex flex-col space-y-3 relative overflow-hidden ${accentStyles.border} focus-within:ring-4`}
    >
      
      {/* Pulse indicators on New orders */}
      {order.status === 'received' && (
        <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-xl bg-teal-500 animate-pulse" />
      )}

      {/* Card Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-extrabold text-zinc-950 dark:text-white text-base leading-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">
            {order.locations?.label ?? 'Table Spot'}
          </h3>
          <span className="text-[10px] font-mono text-zinc-400">
            #{order.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        
        <div className="text-right space-y-0.5">
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 uppercase tracking-wide">
            {order.settlement === 'pay_at_venue' ? 'Pay Venue' : 'To Room'}
          </span>
          <span className="block text-[10px] text-zinc-400 font-semibold">{elapsed}</span>
        </div>
      </div>

      {/* Items Preview */}
      <div className="space-y-1.5 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
          Items ({itemsCount})
        </span>
        <div className="text-xs space-y-1 bg-zinc-50/50 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-200/20 dark:border-zinc-800/20">
          {order.order_items.map((item) => (
            <div key={item.id} className="flex justify-between items-center text-zinc-600 dark:text-zinc-400 font-medium">
              <span className="truncate pr-2">
                <span className="font-bold text-teal-600 dark:text-teal-400 pr-1">{item.qty}x</span> {item.name_snapshot}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Guest Note Preview */}
      {order.guest_note && (
        <div className="px-3 py-2 rounded-xl bg-amber-50/30 dark:bg-amber-950/5 border border-amber-200/20 dark:border-amber-900/20 text-[11px] text-amber-700 dark:text-amber-400 italic truncate font-medium">
          Note: &quot;{order.guest_note}&quot;
        </div>
      )}

      {/* Card Footer - Price & Buttons */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between gap-3">
        <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
          {total}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation(); // Avoid opening detailed modal overlay
            onProgress();
          }}
          disabled={isPending}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 focus:outline-none focus:ring-4 ${accentStyles.button} disabled:opacity-50`}
        >
          {isPending ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <>
              <span>{actionText}</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>

    </article>
  );
}

function EmptyColumnState() {
  return (
    <div className="py-8 px-4 border border-dashed border-zinc-200/50 dark:border-zinc-800/50 rounded-2xl text-center space-y-2">
      <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase block">No Orders</span>
    </div>
  );
}
