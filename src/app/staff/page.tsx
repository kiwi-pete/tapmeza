import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import StaffDashboard from '@/components/StaffDashboard';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnTo=/staff');
  }

  // Use service role or normal client depending on RLS. Since normal user has RLS select privileges
  // on venue_members if user_id = auth.uid(), we can query using the normal client.
  const { data: membership, error: memberError } = await supabase
    .from('venue_members')
    .select('venue_id, role, venues(name, slug, currency, timezone)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    console.error('Error fetching venue membership:', memberError);
  }

  if (!membership) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-zinc-800 dark:text-zinc-200">
        <main className="w-full max-w-md p-8 rounded-3xl backdrop-blur-md bg-white/85 dark:bg-zinc-900/85 border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl text-center space-y-5">
          <div className="inline-flex p-3 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 font-extrabold tracking-widest text-xs uppercase">
            Access Pending
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            No Venue Association
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Your authenticated account is successfully created, but it has not been associated with any venue yet. Please contact your system administrator to bind your account.
          </p>
          <div className="pt-2">
            <a
              href="/login?error=no-venue"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-sm transition focus:outline-none focus:ring-2 focus:ring-zinc-900/30"
            >
              Return to Sign In
            </a>
          </div>
        </main>
      </div>
    );
  }

  // Cast nested single-relation object safely
  const venueData = membership.venues as unknown as {
    name: string;
    slug: string;
    currency: string;
    timezone: string;
  };

  const venue = {
    id: membership.venue_id,
    name: venueData.name,
    slug: venueData.slug,
    currency: venueData.currency,
    timezone: venueData.timezone,
    role: membership.role,
  };

  return (
    <StaffDashboard
      venue={venue}
      user={{ id: user.id, email: user.email }}
    />
  );
}
