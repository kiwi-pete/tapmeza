import 'server-only';

import { cache } from 'react';
import { canManageVenue } from '@/lib/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface AdminVenue {
  id: string;
  name: string;
  currency: string;
}

export type AdminContext =
  | { status: 'ok'; supabase: ServerClient; userId: string; venue: AdminVenue }
  | { status: 'signed-out' }
  | { status: 'no-venue'; email: string | null }
  | { status: 'not-manager' };

/**
 * Who is asking, and for which venue. Every Admin Portal page, action and route starts here.
 * Reads and writes then go through the returned client, so RLS still scopes them to the venue.
 */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'signed-out' };

  const { data: membership, error } = await supabase
    .from('venue_members')
    .select('venue_id, role, venues(name, currency)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // A failed lookup is not the same as "no venue": surface it so the owner can retry.
  if (error) {
    console.error('Error fetching venue membership:', error);
    throw new Error('Venue membership lookup failed');
  }

  // Cast nested single-relation object safely
  const venueData = membership?.venues as unknown as { name: string; currency: string } | null | undefined;
  if (!membership || !venueData) return { status: 'no-venue', email: user.email ?? null };
  if (!canManageVenue(membership.role)) return { status: 'not-manager' };

  return {
    status: 'ok',
    supabase,
    userId: user.id,
    venue: { id: membership.venue_id, name: venueData.name, currency: venueData.currency },
  };
});
