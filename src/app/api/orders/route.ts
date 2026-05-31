import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isWithinDaypart } from '@/lib/time';

// 1. Define strict Zod validation schema for order requests
const orderRequestSchema = z.object({
  qrToken: z.string().min(1),
  note: z.string().max(280).optional(),
  settlement: z.enum(['pay_at_venue', 'charge_to_room']).default('pay_at_venue'),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      qty: z.number().int().min(1).max(50),
    })
  ).min(1, 'At least one item must be ordered'),
});

export async function POST(request: Request) {
  // Initialize server-only service-role client (RLS bypassed for validation path)
  const supabase = createServiceRoleClient();

  try {
    // A. Parse request body
    const bodyText = await request.text();
    let rawBody;
    try {
      rawBody = JSON.parse(bodyText);
    } catch {
      return Response.json(
        { error: { code: 'INVALID_JSON', message: 'Malformed JSON payload.' } },
        { status: 400 }
      );
    }

    const parsedResult = orderRequestSchema.safeParse(rawBody);
    if (!parsedResult.success) {
      return Response.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Invalid payload structure.', details: parsedResult.error.format() } },
        { status: 400 }
      );
    }

    const body = parsedResult.data;

    // B. Resolve location and verify active states
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select(`
        id,
        active,
        zone_id,
        venue_id,
        venues (
          id,
          active,
          currency,
          timezone
        )
      `)
      .eq('qr_token', body.qrToken)
      .maybeSingle();

    if (locationError || !location) {
      return Response.json(
        { error: { code: 'LOCATION_NOT_FOUND', message: 'This table location could not be resolved.' } },
        { status: 404 }
      );
    }

    // Cast nested joins safely
    const venue = location.venues as unknown as {
      id: string;
      active: boolean;
      currency: string;
      timezone: string;
    } | null;

    if (!location.active || !venue || !venue.active) {
      return Response.json(
        { error: { code: 'VENUE_OR_LOCATION_INACTIVE', message: 'This QR code is no longer active. Please ask staff.' } },
        { status: 400 }
      );
    }

    // C. Retrieve ordered items in a single highly efficient query
    const requestedIds = Array.from(new Set(body.items.map(item => item.menuItemId)));

    const { data: dbItems, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, price_minor, available, available_from, available_until, venue_id')
      .in('id', requestedIds)
      .eq('venue_id', venue.id)
      .eq('available', true);

    if (itemsError || !dbItems || dbItems.length !== requestedIds.length) {
      return Response.json(
        { error: { code: 'ITEMS_UNAVAILABLE', message: 'One or more ordered items are unavailable. Please refresh and try again.' } },
        { status: 400 }
      );
    }

    // Index DB items for fast retrieval
    const dbItemsMap = new Map<string, typeof dbItems[0]>();
    dbItems.forEach(item => dbItemsMap.set(item.id, item));

    // D. Verify item zone matching
    const { data: zoneMappings, error: zoneError } = await supabase
      .from('menu_item_zones')
      .select('menu_item_id')
      .in('menu_item_id', requestedIds)
      .eq('zone_id', location.zone_id);

    if (zoneError || !zoneMappings || zoneMappings.length !== requestedIds.length) {
      return Response.json(
        { error: { code: 'ZONE_RESTRICTED', message: 'One or more items are not available in this zone.' } },
        { status: 400 }
      );
    }

    // E. Verify daypart times inside local venue timezone
    const now = new Date();
    for (const itemId of requestedIds) {
      const dbItem = dbItemsMap.get(itemId)!;
      const isAvailable = isWithinDaypart(now, dbItem.available_from, dbItem.available_until, venue.timezone);
      if (!isAvailable) {
        return Response.json(
          { error: { code: 'DAYPART_RESTRICTED', message: `"${dbItem.name}" is outside its daily available hours.` } },
          { status: 400 }
        );
      }
    }

    // F. Recompute order total strictly server-side
    let calculatedTotalMinor = 0;
    body.items.forEach(cartItem => {
      const dbItem = dbItemsMap.get(cartItem.menuItemId)!;
      calculatedTotalMinor += dbItem.price_minor * cartItem.qty;
    });

    // G. Create order inside database (this fires DB triggers which write order_events row automatically)
    const { data: order, error: orderInsertError } = await supabase
      .from('orders')
      .insert({
        venue_id: venue.id,
        location_id: location.id,
        status: 'received',
        currency: venue.currency,
        total_minor: calculatedTotalMinor,
        guest_note: body.note || null,
        settlement: body.settlement,
      })
      .select('id')
      .single();

    if (orderInsertError || !order) {
      console.error('Database error creating order:', orderInsertError);
      return Response.json(
        { error: { code: 'ORDER_CREATION_FAILED', message: 'Database failure creating order. Please contact staff.' } },
        { status: 500 }
      );
    }

    // H. Insert snapped order items
    const orderItemsPayload = body.items.map(cartItem => {
      const dbItem = dbItemsMap.get(cartItem.menuItemId)!;
      return {
        order_id: order.id,
        menu_item_id: cartItem.menuItemId,
        name_snapshot: dbItem.name,
        unit_price_minor_snapshot: dbItem.price_minor,
        qty: cartItem.qty,
      };
    });

    const { error: itemsInsertError } = await supabase
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsInsertError) {
      console.error('Database error inserting order items:', itemsInsertError);
      // Clean up order to avoid dangling records (best-effort rollback)
      await supabase.from('orders').delete().eq('id', order.id);
      
      return Response.json(
        { error: { code: 'ITEMS_INSERTION_FAILED', message: 'Database failure saving order details. Please contact staff.' } },
        { status: 500 }
      );
    }

    // Return successful order confirmation details
    return Response.json(
      {
        orderId: order.id,
        totalMinor: calculatedTotalMinor,
        currency: venue.currency,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Server error during order placement:', err);
    return Response.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected database or processing error occurred.' } },
      { status: 500 }
    );
  }
}
