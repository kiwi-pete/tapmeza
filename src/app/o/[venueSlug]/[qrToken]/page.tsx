import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isWithinDaypart } from '@/lib/time';
import MenuInteractive from '@/components/MenuInteractive';
import Notice from '@/components/Notice';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    venueSlug: string;
    qrToken: string;
  }>;
}

interface LocationResult {
  id: string;
  label: string;
  active: boolean;
  qr_token: string;
  zone_id: string;
  venues: {
    id: string;
    slug: string;
    name: string;
    currency: string;
    timezone: string;
    active: boolean;
  } | null;
}

interface MenuItemResult {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  image_url: string | null;
  available: boolean;
  available_from: string | null;
  available_until: string | null;
  category_id: string;
  /** Position within the category. Absent until migration 0003 has been applied. */
  sort?: number;
  menu_categories: {
    id: string;
    name: string;
    sort: number;
  } | null;
}

export default async function MenuPage({ params }: PageProps) {
  const { venueSlug, qrToken } = await params;

  // Initialize service role client for secure server-side fetching (bypassing anon lock)
  const supabase = createServiceRoleClient();

  // 1. Resolve location from qrToken
  const { data: rawLocation, error: locationError } = await supabase
    .from('locations')
    .select(`
      id,
      label,
      active,
      qr_token,
      zone_id,
      venues (
        id,
        slug,
        name,
        currency,
        timezone,
        active
      )
    `)
    .eq('qr_token', qrToken)
    .maybeSingle();

  const location = rawLocation as unknown as LocationResult | null;

  // A failed lookup is not the same as a dead QR code: surface it so the customer can retry.
  if (locationError) {
    console.error('Menu location lookup failed:', locationError);
    throw new Error('Menu location lookup failed');
  }

  if (!location || !location.active || !location.venues || !location.venues.active || location.venues.slug !== venueSlug) {
    return <Notice title="This QR code isn't active">Please ask a member of staff.</Notice>;
  }

  const { venues: venue } = location;

  // 2. Fetch all menu items linked to this location's zone
  const { data: rawItemZones, error: itemZonesError } = await supabase
    .from('menu_item_zones')
    .select('menu_item_id')
    .eq('zone_id', location.zone_id);

  if (itemZonesError) {
    console.error('Menu zone lookup failed:', itemZonesError);
    throw new Error('Menu zone lookup failed');
  }

  const menuItemIds = (rawItemZones || []).map(z => z.menu_item_id);

  let activeItems: MenuItemResult[] = [];

  if (menuItemIds.length > 0) {
    // '*' rather than a column list, so this page keeps working whether or not the sort column exists yet.
    const { data: rawItems, error: itemsError } = await supabase
      .from('menu_items')
      .select(`
        *,
        menu_categories (
          id,
          name,
          sort
        )
      `)
      .eq('venue_id', venue.id)
      .eq('available', true)
      .in('id', menuItemIds);

    if (itemsError) {
      console.error('Menu items lookup failed:', itemsError);
      throw new Error('Menu items lookup failed');
    }

    if (rawItems) {
      const now = new Date();
      // Apply timezone-aware daypart filtering in-memory
      const filteredItems = (rawItems as unknown as MenuItemResult[]).filter(item =>
        isWithinDaypart(now, item.available_from, item.available_until, venue.timezone)
      );

      activeItems = filteredItems;
    }
  }

  // 3. Group and sort items by categories
  const categoriesMap: { [key: string]: { id: string; name: string; sort: number; items: MenuItemResult[] } } = {};

  activeItems.forEach(item => {
    const cat = item.menu_categories || { id: 'uncategorized', name: 'Other', sort: 999 };
    let group = categoriesMap[cat.id];
    if (!group) {
      group = {
        id: cat.id,
        name: cat.name,
        sort: cat.sort,
        items: [],
      };
      categoriesMap[cat.id] = group;
    }
    group.items.push(item);
  });

  // Categories and items in menu order (their sort number), then by name.
  // Only the fields the menu shows are sent to the browser.
  const groupedCategories = Object.values(categoriesMap)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map(category => ({
      id: category.id,
      name: category.name,
      items: category.items
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
        .map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price_minor: item.price_minor,
          image_url: item.image_url,
        })),
    }));

  return (
    <MenuInteractive
      venue={{
        name: venue.name,
        slug: venue.slug,
        currency: venue.currency,
      }}
      location={{
        label: location.label,
        qrToken: location.qr_token,
      }}
      categories={groupedCategories}
    />
  );
}
