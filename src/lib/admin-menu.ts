import 'server-only';

import type { AdminContext } from '@/lib/admin';
import type { AdminMenuCategory, AdminZone } from '@/app/admin/menu/types';

interface CategoryRow {
  id: string;
  name: string;
  sort: number;
}

interface ItemRow {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  available: boolean;
  /** Absent until migration 0003 has been applied. */
  sort?: number;
  menu_item_zones: { zone_id: string }[] | null;
}

/** The venue's whole menu and its zones, in display order, for the Admin Portal. */
export async function loadAdminMenu(
  admin: Extract<AdminContext, { status: 'ok' }>
): Promise<{ zones: AdminZone[]; categories: AdminMenuCategory[] }> {
  const { supabase, venue } = admin;
  const [zonesResult, categoriesResult, itemsResult] = await Promise.all([
    supabase.from('zones').select('id, name, sort').eq('venue_id', venue.id).order('sort', { ascending: true }),
    supabase.from('menu_categories').select('id, name, sort').eq('venue_id', venue.id),
    supabase.from('menu_items').select('*, menu_item_zones(zone_id)').eq('venue_id', venue.id),
  ]);

  const failure = zonesResult.error ?? categoriesResult.error ?? itemsResult.error;
  if (failure) {
    console.error('Admin menu lookup failed:', failure);
    throw new Error('Admin menu lookup failed');
  }

  const items = (itemsResult.data ?? []) as unknown as ItemRow[];
  const categories = ((categoriesResult.data ?? []) as CategoryRow[])
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: items
        .filter((item) => item.category_id === category.id)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
        .map((item) => ({
          id: item.id,
          categoryId: item.category_id,
          name: item.name,
          description: item.description ?? '',
          priceMinor: item.price_minor,
          available: item.available,
          zoneIds: (item.menu_item_zones ?? []).map((link) => link.zone_id),
        })),
    }));

  return {
    zones: ((zonesResult.data ?? []) as { id: string; name: string }[]).map((zone) => ({ id: zone.id, name: zone.name })),
    categories,
  };
}
