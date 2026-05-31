import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isWithinDaypart } from '@/lib/time';
import MenuInteractive from '@/components/MenuInteractive';

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
  zones: {
    id: string;
    name: string;
  } | null;
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
      zones (
        id,
        name
      ),
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

  // Reject with readable error card if location, venue, or active states are invalid
  if (
    locationError || 
    !location || 
    !location.active || 
    !location.venues || 
    !location.venues.active || 
    location.venues.slug !== venueSlug
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-brand-sand-light text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light">
        <div className="max-w-md w-full text-center space-y-4 border border-brand-sand-dark dark:border-brand-charcoal-light p-8 rounded-2xl bg-white dark:bg-brand-charcoal-dark shadow-sm">
          <div className="text-brand-turquoise text-5xl">⚠️</div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal-dark dark:text-brand-sand-light">Link Inactive</h1>
          <p className="text-base text-brand-charcoal-light dark:text-brand-sand-dark leading-relaxed">
            This QR code is no longer active or could not be resolved. Please ask venue staff for assistance.
          </p>
        </div>
      </div>
    );
  }

  const { venues: venue, zones: zone } = location;

  // 2. Fetch all menu items linked to this location's zone
  const { data: rawItemZones, error: itemZonesError } = await supabase
    .from('menu_item_zones')
    .select('menu_item_id')
    .eq('zone_id', location.zone_id);

  const menuItemIds = (rawItemZones || []).map(z => z.menu_item_id);

  let activeItems: MenuItemResult[] = [];

  if (!itemZonesError && menuItemIds.length > 0) {
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

    if (!itemsError && rawItems) {
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
      zoneName={zone?.name || 'Venue'}
      categories={groupedCategories}
    />
  );
}
