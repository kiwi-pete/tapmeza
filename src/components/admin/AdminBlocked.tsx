import Link from 'next/link';
import type { AdminContext } from '@/lib/admin';
import Notice from '@/components/Notice';
import SignOutButton from '@/components/SignOutButton';

/** Shown instead of an Admin Portal page when the signed-in person may not manage this venue. */
export default function AdminBlocked({ context }: { context: Extract<AdminContext, { status: 'no-venue' | 'not-owner' }> }) {
  if (context.status === 'no-venue') {
    return (
      <Notice title="No venue linked to this account" action={<SignOutButton />}>
        Ask the venue owner to add {context.email ?? 'your account'}.
      </Notice>
    );
  }
  return (
    <Notice
      title="Only the venue owner can change the menu"
      action={
        <Link href="/staff" className="btn btn-primary">
          Go to orders
        </Link>
      }
    />
  );
}
