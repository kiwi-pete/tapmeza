'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, AlertCircle, CheckCircle, Flame, ChefHat, CheckSquare } from 'lucide-react';
import { formatMinor } from '@/lib/money';

interface OrderDetails {
  id: string;
  status: string;
  currency: string;
  totalMinor: number;
  createdAt: string;
  venueName: string;
  venueSlug: string;
  locationLabel: string;
  qrToken: string;
}

interface OrderStatusTrackerProps {
  initialOrder: OrderDetails;
}

const POLL_INTERVAL_MS = 5000;

export default function OrderStatusTracker({ initialOrder }: OrderStatusTrackerProps) {
  const [order, setOrder] = useState<OrderDetails>(initialOrder);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const [isPolledStop, setIsPolledStop] = useState(
    initialOrder.status === 'delivered' || initialOrder.status === 'cancelled'
  );

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Map status values to index for rendering progress stages
  const statusStages = ['received', 'preparing', 'ready', 'delivered'];
  const currentStageIndex = statusStages.indexOf(order.status);

  // Status visual attributes mapping
  const statusDetails: { [key: string]: { label: string; description: string; color: string; icon: React.ComponentType<{ size?: number; className?: string }> } } = {
    received: {
      label: 'Sent to the kitchen',
      description: 'Your order has been received by staff and is in line to be made.',
      color: 'bg-brand-sand text-brand-charcoal-dark border-brand-sand-dark',
      icon: ChefHat,
    },
    preparing: {
      label: 'Being prepared',
      description: 'The kitchen staff are actively preparing your freshly-made selection.',
      color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900',
      icon: Flame,
    },
    ready: {
      label: 'Ready — coming to you',
      description: 'Your order is ready and a staff member is bringing it to your spot.',
      color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900',
      icon: RefreshCw,
    },
    delivered: {
      label: 'Delivered. Thanks!',
      description: 'Enjoy your meal! Let us know if you need anything else.',
      color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900',
      icon: CheckSquare,
    },
    cancelled: {
      label: 'Order cancelled',
      description: 'Please speak with a staff member if this was unexpected.',
      color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900',
      icon: AlertCircle,
    },
  };

  const activeStatusInfo = statusDetails[order.status] || {
    label: order.status,
    description: 'Order status updated.',
    color: 'bg-white text-brand-charcoal-dark border-brand-sand-dark',
    icon: AlertCircle,
  };

  const handlePollStatus = useCallback(async (force: boolean = false) => {
    // Skip polling if stopped and not forced
    if (isPolledStop && !force) return;

    try {
      const response = await fetch(`/api/orders/${order.id}/status`);

      if (!response.ok) {
        throw new Error('Connection failed');
      }

      const data = await response.json();

      setOrder(prev => ({
        ...prev,
        status: data.status,
        totalMinor: data.totalMinor,
        currency: data.currency,
      }));

      // Reset error states on success
      setIsReconnecting(false);
      setFailureCount(0);

      // Stop polling if final lifecycle status reached
      if (data.status === 'delivered' || data.status === 'cancelled') {
        setIsPolledStop(true);
      }
    } catch (error) {
      console.warn('Status polling error:', error);
      setIsReconnecting(true);
      setFailureCount(prev => prev + 1);
    }
  }, [isPolledStop, order.id]);

  // Poll loop effect
  useEffect(() => {
    if (isPolledStop) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    // Set interval polling
    pollTimerRef.current = setInterval(() => {
      handlePollStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isPolledStop, handlePollStatus]);

  // Handle manual retry trigger
  const handleManualRetry = () => {
    setIsReconnecting(false);
    setFailureCount(0);
    handlePollStatus(true);
  };

  // Determine error layout conditions
  const hasPersistentError = failureCount >= 3;

  return (
    <div className="min-h-screen bg-brand-sand-light text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light font-sans antialiased pb-12 flex flex-col justify-between">
      
      {/* 1. Header Bar */}
      <div>
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-brand-charcoal-dark/95 backdrop-blur border-b border-brand-sand-dark dark:border-brand-charcoal-light px-4 py-4 shadow-sm">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <Link
              href={`/o/${order.venueSlug}/${order.qrToken}`}
              className="tap-target w-9 h-9 flex items-center justify-center rounded-full bg-brand-sand/50 text-brand-charcoal-light hover:bg-brand-sand dark:bg-brand-charcoal dark:text-brand-sand-light transition-colors"
            >
              <ChevronLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-brand-turquoise-dark dark:text-brand-turquoise-light leading-tight">
                {order.venueName}
              </h1>
              <p className="text-xs font-semibold text-brand-charcoal-light dark:text-brand-sand-dark">
                {order.locationLabel} · Order Status
              </p>
            </div>
          </div>
        </header>

        {/* 2. Main Tracking Panels */}
        <main className="max-w-xl mx-auto px-4 mt-8 space-y-6">
          
          {/* Summary Card */}
          <div className="bg-white dark:bg-brand-charcoal-dark border border-brand-sand-dark dark:border-brand-charcoal-light rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex justify-between items-start border-b border-brand-sand-dark dark:border-brand-charcoal-light pb-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-brand-charcoal-light dark:text-brand-sand-dark">
                  Order Reference
                </span>
                <h2 className="text-lg font-black text-brand-charcoal-dark dark:text-brand-sand-light font-mono leading-tight uppercase">
                  #{order.id.slice(-6)}
                </h2>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-brand-charcoal-light dark:text-brand-sand-dark">
                  Total
                </span>
                <p className="text-lg font-black text-brand-turquoise-dark dark:text-brand-turquoise-light leading-tight">
                  {formatMinor(order.totalMinor, order.currency)}
                </p>
              </div>
            </div>

            {/* Active Status Display */}
            <div className={`border rounded-2xl p-5 flex items-start gap-4 transition-all duration-300 ${activeStatusInfo.color}`}>
              <div className="shrink-0 mt-0.5 p-2.5 bg-white/40 rounded-xl">
                <activeStatusInfo.icon size={22} className="animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold leading-snug">
                  {activeStatusInfo.label}
                </h3>
                <p className="text-xs leading-relaxed opacity-90">
                  {activeStatusInfo.description}
                </p>
              </div>
            </div>

            {/* Visual Step-by-Step Progress Strip */}
            {order.status !== 'cancelled' && (
              <div className="pt-3 space-y-4">
                <div className="relative">
                  {/* Background Track Line */}
                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-brand-sand dark:bg-brand-charcoal-light -translate-y-1/2 rounded-full" />
                  
                  {/* Active Progress Line */}
                  <div 
                    className="absolute top-1/2 left-0 h-1 bg-brand-turquoise -translate-y-1/2 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${(Math.max(0, currentStageIndex) / (statusStages.length - 1)) * 100}%` }}
                  />

                  {/* Step Nodes */}
                  <div className="relative flex justify-between">
                    {statusStages.map((stage, idx) => {
                      const isCompleted = idx <= currentStageIndex;
                      const isActive = idx === currentStageIndex;
                      return (
                        <div
                          key={stage}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center font-bold text-[10px] transition-all duration-300 ${
                            isCompleted
                              ? 'bg-brand-turquoise border-brand-turquoise text-white scale-110 shadow-sm'
                              : 'bg-white border-brand-sand-dark text-brand-charcoal-light dark:bg-brand-charcoal-dark dark:border-brand-charcoal-light'
                          } ${isActive ? 'ring-4 ring-brand-turquoise/20' : ''}`}
                        >
                          {isCompleted ? '✓' : idx + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Progress Labels */}
                <div className="flex justify-between text-[9px] uppercase tracking-wider font-extrabold text-brand-charcoal-light dark:text-brand-sand-dark px-1">
                  <span>Sent</span>
                  <span className="text-center">Kitchen</span>
                  <span className="text-center">On Way</span>
                  <span className="text-right">Delivered</span>
                </div>
              </div>
            )}
          </div>

          {/* Polling / Connectivity Indicators */}
          {!isPolledStop && (
            <div className="flex justify-center items-center">
              {hasPersistentError ? (
                <div className="w-full bg-white dark:bg-brand-charcoal-dark border border-red-200 dark:border-red-950/40 p-4 rounded-2xl flex flex-col items-center gap-3 text-center shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                    <AlertCircle size={15} /> Connection Lost
                  </div>
                  <p className="text-[11px] text-brand-charcoal-light dark:text-brand-sand-dark">
                    We are having trouble loading updates. Tapping below will reconnect.
                  </p>
                  <button
                    onClick={handleManualRetry}
                    className="tap-target px-5 py-2 bg-brand-sand hover:bg-brand-sand-dark dark:bg-brand-charcoal dark:text-brand-sand-light dark:hover:bg-brand-charcoal-light text-xs font-extrabold rounded-full transition-colors flex items-center gap-1.5 border border-brand-sand-dark dark:border-brand-charcoal-light"
                  >
                    <RefreshCw size={13} /> Reconnect
                  </button>
                </div>
              ) : (
                isReconnecting && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-bold bg-brand-sand text-brand-charcoal-light border border-brand-sand-dark dark:bg-brand-charcoal-dark dark:text-brand-sand-dark dark:border-brand-charcoal-light animate-pulse">
                    <RefreshCw size={10} className="animate-spin" /> Reconnecting...
                  </span>
                )
              )}
            </div>
          )}
        </main>
      </div>

      {/* 3. Footer / CTAs */}
      {order.status === 'delivered' && (
        <div className="max-w-xl mx-auto w-full px-4 mt-8 shrink-0">
          <div className="bg-white dark:bg-brand-charcoal-dark border border-brand-sand-dark dark:border-brand-charcoal-light p-6 rounded-3xl text-center space-y-4 shadow-md">
            <div className="flex justify-center">
              <span className="p-3 bg-green-500/10 text-green-500 rounded-full">
                <CheckCircle size={32} />
              </span>
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-brand-charcoal-dark dark:text-brand-sand-light">
                Order Completed!
              </h4>
              <p className="text-xs text-brand-charcoal-light dark:text-brand-sand-dark">
                Thank you for ordering with us. You can place additional orders at any time.
              </p>
            </div>
            <Link
              href={`/o/${order.venueSlug}/${order.qrToken}`}
              className="w-full tap-target bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold rounded-2xl shadow-md transition-all duration-200 flex justify-center items-center active:scale-[0.99]"
            >
              Order More Items
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
