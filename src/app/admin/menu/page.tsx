import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/admin';
import { loadAdminMenu } from '@/lib/admin-menu';
import AdminBlocked from '@/components/admin/AdminBlocked';
import AdminHeader from '@/components/admin/AdminHeader';
import MenuEditor from '@/components/admin/MenuEditor';

export const dynamic = 'force-dynamic';

export default async function AdminMenuPage() {
  const admin = await getAdminContext();
  if (admin.status === 'signed-out') redirect('/login?returnTo=/admin/menu');
  if (admin.status !== 'ok') return <AdminBlocked context={admin} />;

  const { zones, categories } = await loadAdminMenu(admin);

  return (
    <>
      <AdminHeader venueName={admin.venue.name} />
      <MenuEditor currency={admin.venue.currency} zones={zones} categories={categories} />
    </>
  );
}
