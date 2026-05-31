import { createServiceRoleClient } from '@/lib/supabase/service-role';
import OrderStatusTracker from '@/components/OrderStatusTracker';

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
  created_at: string;
  venue_id: string;
  location_id: string;
  locations: {
    id: string;
    label: string;
    qr_token: string;
  } | null;
  venues: {
    id: string;
    slug: string;
    name: string;
    active: boolean;
  } | null;
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
      created_at,
      venue_id,
      location_id,
      locations (
        id,
        label,
        qr_token
      ),
      venues (
        id,
        slug,
        name,
        active
      )
    `)
    .eq('id', orderId)
    .maybeSingle();

  const order = rawOrder as unknown as OrderResult | null;

  // Render a friendly error card if the order does not exist or has a structural mismatch
  if (
    orderError || 
    !order || 
    !order.venues || 
    !order.locations || 
    order.venues.slug !== venueSlug || 
    order.locations.qr_token !== qrToken
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-brand-sand-light text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light">
        <div className="max-w-md w-full text-center space-y-4 border border-brand-sand-dark dark:border-brand-charcoal-light p-8 rounded-2xl bg-white dark:bg-brand-charcoal-dark shadow-sm">
          <div className="text-brand-turquoise text-5xl">🔍</div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal-dark dark:text-brand-sand-light">Order Not Found</h1>
          <p className="text-base text-brand-charcoal-light dark:text-brand-sand-dark leading-relaxed">
            The requested order could not be located or verified for this table. Please check with venue staff.
          </p>
        </div>
      </div>
    );
  }

  const { venues: venue, locations: location } = order;

  return (
    <OrderStatusTracker
      initialOrder={{
        id: order.id,
        status: order.status,
        currency: order.currency,
        totalMinor: order.total_minor,
        createdAt: order.created_at,
        venueName: venue.name,
        venueSlug: venue.slug,
        locationLabel: location.label,
        qrToken: location.qr_token,
      }}
    />
  );
}
