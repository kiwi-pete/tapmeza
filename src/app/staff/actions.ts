'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function updateOrderStatus(
  orderId: string,
  status: 'received' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // 1. Confirm session is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthenticated: No active staff session.' };
    }

    // 2. Perform the update. The database RLS policy will restrict updates
    // unless the authenticated user is a member of the venue.
    // The database AFTER UPDATE trigger will automatically write to `order_events`
    // logging the status and `auth.uid()` as the actor.
    const { data, error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select('id, status, venue_id')
      .maybeSingle();

    if (updateError) {
      console.error('Error executing status progression:', updateError);
      return { success: false, error: updateError.message };
    }

    if (!data) {
      return { 
        success: false, 
        error: 'Update failed: Order not found or you do not have permission to manage this venue.' 
      };
    }

    return { success: true, order: data };
  } catch (err: unknown) {
    console.error('Unhandled status progression error:', err);
    return { success: false, error: 'Internal Server Error' };
  }
}
