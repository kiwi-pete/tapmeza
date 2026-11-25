'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SignOutButton() {
  const router = useRouter();
  const [supabase] = useState(createSupabaseBrowserClient);
  const [isPending, setIsPending] = useState(false);

  const signOut = async () => {
    setIsPending(true);
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out failed:', error);
    router.push('/login');
    router.refresh();
  };

  return (
    <button type="button" onClick={signOut} disabled={isPending} className="btn btn-secondary">
      Sign out
    </button>
  );
}
