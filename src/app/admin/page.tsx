import { redirect } from 'next/navigation';

// The menu is the Admin Portal's only section so far. Zones, QR codes and order history are still Phase 2.
export default function AdminPortalPage() {
  redirect('/admin/menu');
}
