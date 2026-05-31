import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const DEMO_VENUE_ID = 'a3b93478-f7b5-4b08-9df2-aef7318db402';

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: No active session' }, { status: 401 });
    }

    const serviceRoleSupabase = createServiceRoleClient();

    // Check if membership already exists
    const { data: existingMember, error: queryError } = await serviceRoleSupabase
      .from('venue_members')
      .select('*')
      .eq('user_id', user.id)
      .eq('venue_id', DEMO_VENUE_ID)
      .maybeSingle();

    if (queryError) {
      console.error('Error querying venue membership:', queryError);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!existingMember) {
      // Create owner membership for full testing capabilities
      const { error: insertError } = await serviceRoleSupabase
        .from('venue_members')
        .insert({
          user_id: user.id,
          venue_id: DEMO_VENUE_ID,
          role: 'owner'
        });

      if (insertError) {
        console.error('Error creating venue membership:', insertError);
        return NextResponse.json({ error: 'Failed to bind venue membership' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Unhandled demo register error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
