import { createServiceRoleClient } from '@/lib/supabase/service-role';

interface RouteProps {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/orders/[id]/status
 * Polls current status for a specific guest order.
 *
 * SECURITY DESIGN TRADE-OFF (Phase 1):
 * The order's UUID (v4) is highly unguessable and acts as a capability token.
 * Since the Customer App has no authenticated user accounts, possessing the order UUID
 * grants access to read the status of that specific order. This is a deliberate,
 * standard hospitality UX compromise. RLS remains locked for public roles, and
 * the service-role client is used server-side here.
 */
export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;

  // Initialize service role client (server-side only)
  const supabase = createServiceRoleClient();

  try {
    // 1. Fetch order details from database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('status, currency, total_minor, created_at')
      .eq('id', id)
      .maybeSingle();

    if (orderError) {
      console.error('Database connection error checking order status:', orderError);
      return Response.json(
        { error: { code: 'DATABASE_ERROR', message: 'Could not connect to database.' } },
        { status: 500 }
      );
    }

    if (!order) {
      return Response.json(
        { error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } },
        { status: 404 }
      );
    }

    // 2. Query the latest event to find the most accurate timestamp for updates
    const { data: latestEvent } = await supabase
      .from('order_events')
      .select('at')
      .eq('order_id', id)
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const updatedAt = latestEvent?.at || order.created_at;

    // 3. Return status payload with strict caching disabled for cellular network integrity
    return new Response(
      JSON.stringify({
        status: order.status,
        currency: order.currency,
        totalMinor: order.total_minor,
        updatedAt: updatedAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('Server error querying order status:', err);
    return Response.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected processing error occurred.' } },
      { status: 500 }
    );
  }
}
