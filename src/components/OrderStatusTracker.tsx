'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCheck, ChefHat, ConciergeBell, Loader2, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import { forgetActiveOrder, rememberActiveOrder } from '@/lib/active-order';
import { isOrderStatus, SETTLEMENT_LABELS, type OrderStatus, type Settlement } from '@/lib/orders';

interface OrderLine {
  name: string;
  qty: number;
  lineMinor: number;
}

interface OrderDetails {
  id: string;
  status: OrderStatus;
  currency: string;
  totalMinor: number;
  settlement: Settlement;
  venueName: string;
  venueSlug: string;
  locationLabel: string;
  qrToken: string;
  items: OrderLine[];
}

interface OrderStatusTrackerProps {
  initialOrder: OrderDetails;
}

const POLL_INTERVAL_MS = 5000;
const POLL_SLOW_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 8000;
/** After this many failed polls in a row, say so plainly and offer a retry. */
const FAILURES_BEFORE_WARNING = 3;

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'received', label: 'Received' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'On its way' },
  { status: 'delivered', label: 'Delivered' },
];

const HEADLINES: Record<OrderStatus, string> = {
  received: 'Order received',
  preparing: 'Being prepared',
  ready: 'On its way to you',
  delivered: 'Delivered — enjoy',
  cancelled: 'Order cancelled',
};

const ICONS: Record<OrderStatus, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  received: Check,
  preparing: ChefHat,
  ready: ConciergeBell,
  delivered: CheckCheck,
  cancelled: X,
};

export default function OrderStatusTracker({ initialOrder: order }: OrderStatusTrackerProps) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [failures, setFailures] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const isFinal = status === 'delivered' || status === 'cancelled';
  const stepIndex = STEPS.findIndex((step) => step.status === status);
  const menuHref = `/o/${order.venueSlug}/${order.qrToken}`;
  const StatusIcon = ICONS[status];

  // Lets the menu link back here while the order is in progress.
  useEffect(() => {
    if (isFinal) forgetActiveOrder(order.qrToken);
    else rememberActiveOrder(order.qrToken, order.id);
  }, [isFinal, order.qrToken, order.id]);

  // Poll for status: one request at a time, each with a timeout, paused while the screen is off.
  useEffect(() => {
    if (isFinal) return;

    let stopped = false;
    let inFlight = false;
    let timer: number | undefined;
    let consecutiveFailures = 0;

    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || document.hidden) return;
      const delay = consecutiveFailures >= FAILURES_BEFORE_WARNING ? POLL_SLOW_INTERVAL_MS : POLL_INTERVAL_MS;
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/orders/${order.id}/status`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Status request failed (${response.status})`);
        const data = (await response.json()) as { status?: unknown };
        if (!isOrderStatus(data.status)) throw new Error('Status response was not understood');
        if (stopped) return;
        consecutiveFailures = 0;
        setFailures(0);
        setStatus(data.status);
      } catch (err) {
        if (stopped) return;
        console.warn('Order status poll failed:', err);
        consecutiveFailures += 1;
        setFailures(consecutiveFailures);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        schedule();
      }
    };

    const checkNow = () => {
      window.clearTimeout(timer);
      if (!document.hidden) void poll();
    };

    document.addEventListener('visibilitychange', checkNow);
    window.addEventListener('online', checkNow);
    if (retryCount > 0) void poll();
    else schedule();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', checkNow);
      window.removeEventListener('online', checkNow);
    };
  }, [order.id, isFinal, retryCount]);

  const retry = () => {
    setFailures(0);
    setRetryCount((count) => count + 1);
  };

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pt-5 pb-10">
      <p className="truncate font-medium text-muted">{order.venueName}</p>

      <section aria-live="polite" className="pt-8">
        <div
          className={`grid size-16 place-items-center rounded-full ${
            status === 'cancelled' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'
          }`}
        >
          <StatusIcon size={30} aria-hidden />
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{HEADLINES[status]}</h1>
        <p className="mt-1 text-muted">
          {status === 'cancelled'
            ? 'Please ask a member of staff.'
            : `${order.locationLabel} · #${order.id.slice(-6).toUpperCase()}`}
        </p>
      </section>

      {status !== 'cancelled' && (
        <ol className="mt-6 grid grid-cols-4 gap-1.5">
          {STEPS.map((step, index) => (
            <li key={step.status} aria-current={index === stepIndex ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-accent' : 'bg-line'}`} />
              <span
                className={`mt-2 block text-[0.8125rem] leading-tight ${
                  index === stepIndex ? 'font-semibold text-ink' : 'text-muted'
                }`}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {!isFinal && failures >= FAILURES_BEFORE_WARNING && (
        <div role="alert" className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-warn-soft py-2 pr-2 pl-4">
          <p className="text-sm font-medium">No connection. This may be out of date.</p>
          <button type="button" onClick={retry} className="btn btn-secondary min-h-11 shrink-0 px-4 text-sm">
            Retry
          </button>
        </div>
      )}
      {!isFinal && failures > 0 && failures < FAILURES_BEFORE_WARNING && (
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Reconnecting…
        </p>
      )}

      <section aria-label="Your order" className="mt-8 border-t border-line pt-4">
        <ul className="space-y-2">
          {order.items.map((line, index) => (
            <li key={index} className="flex justify-between gap-4">
              <span>
                <span className="text-muted tabular-nums">{line.qty} ×</span> {line.name}
              </span>
              <span className="shrink-0 tabular-nums">{formatMinor(line.lineMinor, order.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between gap-4 border-t border-line pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMinor(order.totalMinor, order.currency)}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{SETTLEMENT_LABELS[order.settlement]}</p>
      </section>

      <Link href={menuHref} className={`btn mt-8 w-full ${isFinal ? 'btn-primary' : 'btn-secondary'}`}>
        Order more
      </Link>
    </main>
  );
}
