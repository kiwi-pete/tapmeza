'use client';

import { useState, useTransition, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/staff';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(
    errorParam === 'auth-callback-failed' ? 'Social login failed. Please try again.' : null
  );
  
  const [isPending, startTransition] = useTransition();
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const supabase = createSupabaseBrowserClient();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setFormError('Please enter both email and password.');
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
      // 1. Generate random sandbox user details
      const randomId = Math.floor(100000 + Math.random() * 900000);
      const sandboxEmail = `sandbox.staff.${randomId}@tapmeza.com`;
      const sandboxPassword = `SandboxPass123!_${randomId}`;

      // 2. Sign up user via browser client
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: sandboxEmail,
        password: sandboxPassword,
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (!signUpData.user) {
        throw new Error('Sign up failed: User was not created.');
      }

      // 3. Trigger server API to automatically bind user to venue_members table
      const registerRes = await fetch('/api/auth/demo-register', {
        method: 'POST',
      });

      if (!registerRes.ok) {
        const errorJson = await registerRes.json();
        throw new Error(errorJson.error || 'Failed to bind sandbox credentials on server.');
      }

      // 4. Force state transition and route to Staff Dashboard
      router.push(returnTo);
      router.refresh();
    } catch (err: unknown) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : 'Sandbox initialization failed.');
      setSandboxLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-amber-50/40 via-white to-teal-50/20 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-zinc-800 dark:text-zinc-200">
      <main className="w-full max-w-md p-8 rounded-3xl backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 font-extrabold tracking-widest text-xs uppercase mb-1">
            Tapmeza Dashboard
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-400 dark:to-emerald-400 bg-clip-text text-transparent">
            Staff Portal
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to manage your venue and track real-time orders.
          </p>
        </div>

        {/* Errors banner */}
        {formError && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-medium animate-fadeIn">
            {formError}
          </div>
        )}

        {/* Regular Login Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block px-1">
              Email Address
            </label>
            <input
              type="email"
              required
              disabled={isPending || sandboxLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-teal-500/50 dark:focus:ring-teal-400/50 focus:border-teal-500 dark:focus:border-teal-400 transition text-sm disabled:opacity-50"
              placeholder="e.g. manager@tapmeza.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block px-1">
              Password
            </label>
            <input
              type="password"
              required
              disabled={isPending || sandboxLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-teal-500/50 dark:focus:ring-teal-400/50 focus:border-teal-500 dark:focus:border-teal-400 transition text-sm disabled:opacity-50"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || sandboxLoading}
            className="w-full py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-sm transition shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/30 dark:focus:ring-white/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              'Sign In with Credentials'
            )}
          </button>
        </form>

        {/* Separator */}
        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
          <span>or continue with</span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
        </div>

        {/* Google & Sandbox Options */}
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={isPending || sandboxLoading}
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 focus:outline-none flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign In with Google
          </button>

          <button
            type="button"
            disabled={isPending || sandboxLoading}
            onClick={handleSandboxLogin}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 dark:from-teal-600 dark:to-emerald-600 text-white font-semibold text-sm transition hover:from-teal-600 hover:to-emerald-600 shadow-md hover:shadow-lg focus:outline-none flex items-center justify-center gap-2 relative overflow-hidden group"
          >
            {sandboxLoading ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
                <span>Enter Staff Demo Sandbox</span>
              </>
            )}
            <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white/10 opacity-40 group-hover:animate-shine" />
          </button>
        </div>

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center font-medium">
          Sandbox option dynamically binds authentication permissions to the &quot;Tapmeza Beach Club&quot; demo venue for testing.
        </p>

      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <span className="w-8 h-8 rounded-full border-4 border-teal-500/20 border-t-teal-500 animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
