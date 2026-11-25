import Link from 'next/link';
import Notice from '@/components/Notice';

// PHASE 2: Admin Portal. Menus, zones, QR codes and order history are not built yet.
export default function AdminPortalPage() {
  return (
    <Notice
      title="Admin isn't available yet"
      action={
        <Link href="/staff" className="btn btn-primary">
          Go to orders
        </Link>
      }
    >
      Menus, zones and QR codes will be managed here.
    </Notice>
  );
}
