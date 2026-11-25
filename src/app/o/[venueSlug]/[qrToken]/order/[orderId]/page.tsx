import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isOrderStatus, isSettlement } from '@/lib/orders';
import OrderStatusTracker from '@/components/OrderStatusTracker';
import Notice from '@/components/Notice';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    venueSlug: string;
    qrToken: string;
    orderId: string;
  }>;
}

interface OrderResult {
  id: string;
  status: string;
  currency: string;
  total_minor: number;
  settlement: string;
  locations: {
    label: string;
    qr_token: string;
  } | null;
  venues: {
    slug: string;
    name: string;
  } | null;
  order_items: {
    name_snapshot: string;
    unit_price_minor_snapshot: number;
    qty: number;
  }[];
}

export default async function OrderStatusPage({ params }: PageProps) {
  const { venueSlug, qrToken, orderId } = await params;

  // Initialize service role client (server-side context)
  const supabase = createServiceRoleClient();

  // Retrieve order details and join location/venue configurations
  const { data: rawOrder, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      currency,
      total_minor,
      settlement,
      locations (
        label,
        qr_token
      ),
      venues (
        slug,
        name
      ),
      order_items (
        name_snapshot,
        unit_price_minor_snapshot,
        qty
      )
    `)
    .eq('id', orderId)
    .maybeSingle();

  // A failed lookup is not the same as a missing order: surface it so the customer can retry.
  if (orderError) {
    console.error('Order lookup failed:', orderError);
    throw new Error('Order lookup failed');
  }

  const order = rawOrder as unknown as OrderResult | null;

  // The order must belong to the QR code in the URL.
  if (
    !order ||
    !order.venues ||
    !order.locations ||
    order.venues.slug !== venueSlug ||
    order.locations.qr_token !== qrToken ||
    !isOrderStatus(order.status)
  ) {
    return <Notice title="Order not found">Please ask a member of staff.</Notice>;
  }

  return (
    <OrderStatusTracker
      initialOrder={{
        id: order.id,
        status: order.status,
        currency: order.currency,
        totalMinor: order.total_minor,
        settlement: isSettlement(order.settlement) ? order.settlement : 'pay_at_venue',
        venueName: order.venues.name,
        venueSlug: order.venues.slug,
        locationLabel: order.locations.label,
        qrToken: order.locations.qr_token,
        items: order.order_items.map((item) => ({
          name: item.name_snapshot,
          qty: item.qty,
          lineMinor: item.unit_price_minor_snapshot * item.qty,
        })),
      }}
    />
  );
}
