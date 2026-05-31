import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const DEMO_VENUE_ID = 'a3b93478-f7b5-4b08-9df2-aef7318db402';

export async function POST() {
  try {
    const serviceRoleSupabase = createServiceRoleClient();

    // 1. Generate random sandbox user credentials
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const sandboxEmail = `tapmeza.staff.${randomId}@gmail.com`;
    const sandboxPassword = `SandboxPass123!_${randomId}`;

    // 2. Create the user as pre-confirmed using admin privileges
    // This completely bypasses "Confirm Email" SMTP blocks and MX verification checks on Supabase.
    const { data: userData, error: createError } = await serviceRoleSupabase.auth.admin.createUser({
      email: sandboxEmail,
      password: sandboxPassword,
      email_confirm: true,
    });

    if (createError || !userData.user) {
      console.error('Error creating pre-confirmed admin user:', createError);
      return NextResponse.json(
        { error: createError?.message || 'Failed to create sandbox user.' },
        { status: 500 }
      );
    }

    const userId = userData.user.id;

    // 3. Bind the user to the demo venue in the venue_members table
    const { error: insertError } = await serviceRoleSupabase
      .from('venue_members')
      .insert({
        user_id: userId,
        venue_id: DEMO_VENUE_ID,
        role: 'owner', // Grant owner permissions so they can test everything
      });

    if (insertError) {
      console.error('Error binding venue membership:', insertError);
      return NextResponse.json({ error: 'Failed to bind venue membership' }, { status: 500 });
    }

    // 4. Return the generated credentials so the client can log in immediately
    return NextResponse.json({
      success: true,
      email: sandboxEmail,
      password: sandboxPassword,
    });
  } catch (err: unknown) {
    console.error('Unhandled demo register error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
