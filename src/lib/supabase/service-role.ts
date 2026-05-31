import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

// Runtime guard to prevent client-side execution in all conditions
if (typeof window !== 'undefined') {
  throw new Error('Security Violation: createServiceRoleClient cannot be imported or executed in a browser environment.');
}

export function createServiceRoleClient() {
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
