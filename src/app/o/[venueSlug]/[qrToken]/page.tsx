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
    const { data: rawItems, error: itemsError } = await supabase
      .from('menu_items')
      .select(`
        id,
        name,
        description,
        price_minor,
        image_url,
        available,
        available_from,
        available_until,
        category_id,
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

  // Sort categories by sort number, and items within categories alphabetically by name
  const groupedCategories = Object.values(categoriesMap)
    .sort((a, b) => a.sort - b.sort)
    .map(category => ({
      ...category,
      items: category.items.sort((a, b) => a.name.localeCompare(b.name)),
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
