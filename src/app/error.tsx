'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Notice from '@/components/Notice';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Any page that fails to load lands here with a way to try again — never a blank screen. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  useEffect(() => {
    console.error('Page failed to load:', error);
  }, [error]);

  const retry = () => {
    startRetry(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <Notice
      title="Couldn't load this page"
      action={
        <button type="button" onClick={retry} disabled={isRetrying} className="btn btn-primary">
          {isRetrying && <Loader2 size={20} className="animate-spin" aria-hidden />}
          Try again
        </button>
      }
    >
      Check your connection and try again.
    </Notice>
  );
}
