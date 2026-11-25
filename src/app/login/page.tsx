'use client';

import { useState, useTransition, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/staff';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(
    errorParam === 'auth-callback-failed' ? 'Google sign-in failed. Please try again.' : null
  );
  
  const [isPending, startTransition] = useTransition();
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const [supabase] = useState(createSupabaseBrowserClient);
  const isBusy = isPending || sandboxLoading;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setFormError('Enter your email and password.');
      return;
    }

    setFormError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setFormError(error.message);
      } else {
        router.push(returnTo);
        router.refresh();
      }
    });
  };

  const handleGoogleLogin = async () => {
    setFormError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
      },
    });

    if (error) {
      setFormError(error.message);
    }
  };

  const handleSandboxLogin = async () => {
    setFormError(null);
    setSandboxLoading(true);

    try {
      // 1. Request the server to create a pre-confirmed user and bind it to the demo venue
      const registerRes = await fetch('/api/auth/demo-register', {
        method: 'POST',
      });

      if (!registerRes.ok) {
        const errorJson = await registerRes.json();
        throw new Error(errorJson.error || 'The demo could not be started.');
      }

      const { email, password } = await registerRes.json();

      // 2. Sign in immediately with the pre-confirmed credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      // 3. Force state transition and route to Staff Dashboard
      router.push(returnTo);
      router.refresh();
    } catch (err: unknown) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : 'The demo could not be started.');
      setSandboxLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <p className="font-semibold text-accent">Tapmeza</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Staff sign in</h1>

      {formError && (
        <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium">
          {formError}
        </p>
      )}

      <button type="button" onClick={handleGoogleLogin} disabled={isBusy} className="btn btn-secondary mt-6 w-full">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            disabled={isBusy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isBusy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </div>
        <button type="submit" disabled={isBusy} className="btn btn-primary w-full">
          {isPending && <Loader2 size={20} className="animate-spin" aria-hidden />}
          Sign in
        </button>
      </form>

      <button
        type="button"
        onClick={handleSandboxLogin}
        disabled={isBusy}
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 self-center px-3 font-medium text-accent disabled:opacity-50"
      >
        {sandboxLoading && <Loader2 size={18} className="animate-spin" aria-hidden />}
        Try the demo venue
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center">
          <Loader2 size={28} className="animate-spin text-muted" aria-hidden />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
