import Link from 'next/link';
import Notice from '@/components/Notice';

export default function Home() {
  return (
    <Notice
      title="Tapmeza"
      action={
        <Link href="/login" className="btn btn-secondary">
          Staff sign in
        </Link>
      }
    >
      Scan the QR code at your table to order.
    </Notice>
  );
}
