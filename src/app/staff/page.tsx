import { redirect } from 'next/navigation';
import { canManageVenue } from '@/lib/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import StaffDashboard from '@/components/StaffDashboard';
import Notice from '@/components/Notice';
import SignOutButton from '@/components/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnTo=/staff');
  }

  // RLS lets a signed-in user read only their own venue_members rows, so the normal client is enough.
  const { data: membership, error: memberError } = await supabase
    .from('venue_members')
    .select('venue_id, role, venues(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // A failed lookup is not the same as "no venue": surface it so staff can retry.
  if (memberError) {
    console.error('Error fetching venue membership:', memberError);
    throw new Error('Venue membership lookup failed');
  }

  // Cast nested single-relation object safely
  const venueData = membership?.venues as unknown as { name: string } | null | undefined;

  if (!membership || !venueData) {
    return (
      <Notice title="No venue linked to this account" action={<SignOutButton />}>
        Ask the venue manager to add {user.email ?? 'your account'}.
      </Notice>
    );
  }

  return (
    <StaffDashboard
      venue={{ id: membership.venue_id, name: venueData.name }}
      canManage={canManageVenue(membership.role)}
    />
  );
}
