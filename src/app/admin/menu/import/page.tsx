import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/admin';
import { loadAdminMenu } from '@/lib/admin-menu';
import AdminBlocked from '@/components/admin/AdminBlocked';
import AdminHeader from '@/components/admin/AdminHeader';
import MenuImport from '@/components/admin/MenuImport';

export const dynamic = 'force-dynamic';

export default async function AdminMenuImportPage() {
  const admin = await getAdminContext();
  if (admin.status === 'signed-out') redirect('/login?returnTo=/admin/menu/import');
  if (admin.status !== 'ok') return <AdminBlocked context={admin} />;

  const { zones, categories } = await loadAdminMenu(admin);

  return (
    <>
      <AdminHeader venueName={admin.venue.name} />
      <MenuImport
        currency={admin.venue.currency}
        zones={zones}
        existing={categories.map((category) => ({
          name: category.name,
          itemNames: category.items.map((item) => item.name),
        }))}
      />
    </>
  );
}
