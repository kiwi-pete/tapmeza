'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminContext, type AdminContext } from '@/lib/admin';
import { decimalToMinor } from '@/lib/money';
import { CATEGORY_NAME_MAX, DESCRIPTION_MAX, MENU_MAX_ITEMS_PER_SAVE, NAME_MAX } from '@/lib/menu-import/limits';
import { importSaveSchema } from '@/lib/menu-import/schema';
import type { ActionResult } from '@/app/admin/menu/types';

type Admin = Extract<AdminContext, { status: 'ok' }>;

const NOT_ALLOWED = 'Sign in as a venue manager to change the menu.';
const PRICE_HELP = 'Enter the price as a number, like 12500 or 8.50.';
const SAVE_FAILED = 'That could not be saved. Check the connection and try again.';
/** Postgres not-null violation: raised when a delete would clear the menu item link on past order lines. */
const NOT_NULL_VIOLATION = '23502';

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(NAME_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX),
  price: z.string().max(20),
  categoryId: z.string().uuid().optional(),
  newCategoryName: z.string().trim().max(CATEGORY_NAME_MAX).optional(),
  zoneIds: z.array(z.string().uuid()).max(100),
  available: z.boolean(),
});

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
});

const idSchema = z.string().uuid();

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Only zones that belong to this venue, whatever the browser sent. */
async function ownZoneIds(admin: Admin, requested: string[]): Promise<string[] | null> {
  if (requested.length === 0) return [];
  const { data, error } = await admin.supabase.from('zones').select('id').eq('venue_id', admin.venue.id);
  if (error) {
    console.error('Zone lookup failed:', error);
    return null;
  }
  const owned = new Set((data ?? []).map((zone) => zone.id as string));
  return requested.filter((id) => owned.has(id));
}

/** Finds a category by name, or creates it at the end of the menu. */
async function findOrCreateCategory(admin: Admin, name: string): Promise<string | null> {
  const { data: existing, error } = await admin.supabase
    .from('menu_categories')
    .select('id, name, sort')
    .eq('venue_id', admin.venue.id);
  if (error) {
    console.error('Category lookup failed:', error);
    return null;
  }
  const match = (existing ?? []).find((category) => sameName(category.name as string, name));
  if (match) return match.id as string;

  const nextSort = (existing ?? []).reduce((max, category) => Math.max(max, category.sort as number), -1) + 1;
  const { data: created, error: createError } = await admin.supabase
    .from('menu_categories')
    .insert({ venue_id: admin.venue.id, name, sort: nextSort })
    .select('id')
    .single();
  if (createError || !created) {
    console.error('Category creation failed:', createError);
    return null;
  }
  return created.id as string;
}

export async function saveMenuItem(input: unknown): Promise<ActionResult> {
  const admin = await getAdminContext();
  if (admin.status !== 'ok') return { ok: false, error: NOT_ALLOWED };

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Give the item a name.' };
  const item = parsed.data;

  const priceMinor = decimalToMinor(item.price);
  if (priceMinor === null) return { ok: false, error: PRICE_HELP };

  let categoryId: string | null = null;
  if (item.newCategoryName) {
    categoryId = await findOrCreateCategory(admin, item.newCategoryName);
    if (!categoryId) return { ok: false, error: SAVE_FAILED };
  } else if (item.categoryId) {
    const { data: category, error } = await admin.supabase
      .from('menu_categories')
      .select('id')
      .eq('id', item.categoryId)
      .eq('venue_id', admin.venue.id)
      .maybeSingle();
    if (error) {
      console.error('Category lookup failed:', error);
      return { ok: false, error: SAVE_FAILED };
    }
    categoryId = (category?.id as string | undefined) ?? null;
  }
  if (!categoryId) return { ok: false, error: 'Choose a category.' };

  const zoneIds = await ownZoneIds(admin, item.zoneIds);
  if (!zoneIds) return { ok: false, error: SAVE_FAILED };

  const fields = {
    name: item.name,
    description: item.description || null,
    price_minor: priceMinor,
    category_id: categoryId,
    available: item.available,
  };

  let itemId: string;
  if (item.id) {
    const { data: updated, error } = await admin.supabase
      .from('menu_items')
      .update(fields)
      .eq('id', item.id)
      .eq('venue_id', admin.venue.id)
      .select('id')
      .maybeSingle();
    if (error || !updated) {
      console.error('Menu item update failed:', error);
      return { ok: false, error: SAVE_FAILED };
    }
    itemId = updated.id as string;
  } else {
    const { data: last, error: sortError } = await admin.supabase
      .from('menu_items')
      .select('sort')
      .eq('category_id', categoryId)
      .order('sort', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sortError) {
      console.error('Menu item order lookup failed:', sortError);
      return { ok: false, error: SAVE_FAILED };
    }
    const { data: created, error } = await admin.supabase
      .from('menu_items')
      .insert({ ...fields, venue_id: admin.venue.id, sort: ((last?.sort as number | undefined) ?? -1) + 1 })
      .select('id')
      .single();
    if (error || !created) {
      console.error('Menu item creation failed:', error);
      return { ok: false, error: SAVE_FAILED };
    }
    itemId = created.id as string;
  }

  // Replace the item's zones with the chosen set.
  const { error: clearError } = await admin.supabase.from('menu_item_zones').delete().eq('menu_item_id', itemId);
  if (clearError) {
    console.error('Clearing item zones failed:', clearError);
    return { ok: false, error: SAVE_FAILED };
  }
  if (zoneIds.length > 0) {
    const { error: zoneError } = await admin.supabase
      .from('menu_item_zones')
      .insert(zoneIds.map((zoneId) => ({ menu_item_id: itemId, zone_id: zoneId })));
    if (zoneError) {
      console.error('Saving item zones failed:', zoneError);
      return { ok: false, error: 'The item was saved, but not where it is shown. Open it and save again.' };
    }
  }

  revalidatePath('/admin/menu');
  return { ok: true };
}

export async function setMenuItemAvailable(id: unknown, available: boolean): Promise<ActionResult> {
  const admin = await getAdminContext();
  if (admin.status !== 'ok') return { ok: false, error: NOT_ALLOWED };
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: SAVE_FAILED };

  const { data, error } = await admin.supabase
    .from('menu_items')
    .update({ available })
    .eq('id', parsedId.data)
    .eq('venue_id', admin.venue.id)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    console.error('Availability update failed:', error);
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePath('/admin/menu');
  return { ok: true };
}

export async function deleteMenuItem(id: unknown): Promise<ActionResult> {
  const admin = await getAdminContext();
  if (admin.status !== 'ok') return { ok: false, error: NOT_ALLOWED };
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: SAVE_FAILED };

  const { error } = await admin.supabase
    .from('menu_items')
    .delete()
    .eq('id', parsedId.data)
    .eq('venue_id', admin.venue.id);
  if (error) {
    console.error('Menu item delete failed:', error);
    return {
      ok: false,
      error:
        error.code === NOT_NULL_VIOLATION
          ? 'This item has been ordered before, so it cannot be deleted. Hide it instead.'
          : SAVE_FAILED,
    };
  }

  revalidatePath('/admin/menu');
  return { ok: true };
}

export async function saveMenuCategory(input: unknown): Promise<ActionResult> {
  const admin = await getAdminContext();
  if (admin.status !== 'ok') return { ok: false, error: NOT_ALLOWED };
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Give the category a name.' };

  if (parsed.data.id) {
    const { data, error } = await admin.supabase
      .from('menu_categories')
      .update({ name: parsed.data.name })
      .eq('id', parsed.data.id)
      .eq('venue_id', admin.venue.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      console.error('Category update failed:', error);
      return { ok: false, error: SAVE_FAILED };
    }
  } else if (!(await findOrCreateCategory(admin, parsed.data.name))) {
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePath('/admin/menu');
  return { ok: true };
}

/** Deletes a category together with its items. */
export async function deleteMenuCategory(id: unknown): Promise<ActionResult> {
  const admin = await getAdminContext();
  if (admin.status !== 'ok') return { ok: false, error: NOT_ALLOWED };
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: SAVE_FAILED };

  const { error } = await admin.supabase
    .from('menu_categories')
    .delete()
    .eq('id', parsedId.data)
    .eq('venue_id', admin.venue.id);
  if (error) {
    console.error('Category delete failed:', error);
    return {
      ok: false,
      error:
        error.code === NOT_NULL_VIOLATION
          ? 'Some of these items have been ordered before, so the category cannot be deleted. Hide the items instead.'
          : SAVE_FAILED,
    };
  }

  revalidatePath('/admin/menu');
  return { ok: true };
}

/**
 * Saves a reviewed import. Only ever adds: categories are matched by name, and an item whose name is
 * already in its category is skipped, so importing the same menu twice does not duplicate it.
 */
export async function importMenu(input: unknown): Promise<ActionResult<{ added: number; skipped: number }>> {
  const admin = await getAdminContext();
  if (admin.status !== 'ok') return { ok: false, error: NOT_ALLOWED };

  const parsed = importSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Every item needs a name, and every category needs at least one item.' };
  const draft = parsed.data;

  const itemCount = draft.categories.reduce((sum, category) => sum + category.items.length, 0);
  if (itemCount > MENU_MAX_ITEMS_PER_SAVE) {
    return { ok: false, error: `Save up to ${MENU_MAX_ITEMS_PER_SAVE} items at a time.` };
  }

  // Prices are parsed here, never taken as numbers from the browser.
  const priced = draft.categories.map((category) => ({
    name: category.name,
    items: category.items.map((item) => ({ ...item, priceMinor: decimalToMinor(item.price) })),
  }));
  if (priced.some((category) => category.items.some((item) => item.priceMinor === null))) {
    return { ok: false, error: `Every item needs a price. ${PRICE_HELP}` };
  }

  const zoneIds = await ownZoneIds(admin, draft.zoneIds);
  if (!zoneIds) return { ok: false, error: SAVE_FAILED };

  const { supabase, venue } = admin;
  const [categoriesResult, itemsResult] = await Promise.all([
    supabase.from('menu_categories').select('id, name, sort').eq('venue_id', venue.id),
    supabase.from('menu_items').select('*').eq('venue_id', venue.id),
  ]);
  if (categoriesResult.error || itemsResult.error) {
    console.error('Menu lookup before import failed:', categoriesResult.error ?? itemsResult.error);
    return { ok: false, error: SAVE_FAILED };
  }

  const existingCategories = (categoriesResult.data ?? []) as { id: string; name: string; sort: number }[];
  const existingItems = (itemsResult.data ?? []) as { name: string; category_id: string; sort?: number }[];

  // 1. Categories: reuse by name, create the rest after the current last one.
  const categoryIdByName = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  let nextCategorySort = existingCategories.reduce((max, c) => Math.max(max, c.sort), -1) + 1;
  const newCategories: { venue_id: string; name: string; sort: number }[] = [];
  for (const category of priced) {
    const key = category.name.toLowerCase();
    if (categoryIdByName.has(key) || newCategories.some((c) => c.name.toLowerCase() === key)) continue;
    newCategories.push({ venue_id: venue.id, name: category.name, sort: nextCategorySort });
    nextCategorySort += 1;
  }

  const createdCategoryIds: string[] = [];
  if (newCategories.length > 0) {
    const { data: created, error } = await supabase.from('menu_categories').insert(newCategories).select('id, name');
    if (error || !created) {
      console.error('Import could not create categories:', error);
      return { ok: false, error: SAVE_FAILED };
    }
    for (const row of created as { id: string; name: string }[]) {
      categoryIdByName.set(row.name.trim().toLowerCase(), row.id);
      createdCategoryIds.push(row.id);
    }
  }

  /** Removes what this import created, so a failure part-way leaves the menu as it was. */
  const undo = async (itemIds: string[]) => {
    // In batches, so the id list never makes the request URL too long.
    for (let start = 0; start < itemIds.length; start += 100) {
      const { error } = await supabase.from('menu_items').delete().in('id', itemIds.slice(start, start + 100));
      if (error) console.error('Import cleanup could not remove items:', error);
    }
    if (createdCategoryIds.length > 0) {
      const { error } = await supabase.from('menu_categories').delete().in('id', createdCategoryIds);
      if (error) console.error('Import cleanup could not remove categories:', error);
    }
  };

  // 2. Items: in printed order, after anything already in the category.
  const namesByCategory = new Map<string, Set<string>>();
  const lastSortByCategory = new Map<string, number>();
  for (const item of existingItems) {
    const names = namesByCategory.get(item.category_id) ?? new Set<string>();
    names.add(item.name.trim().toLowerCase());
    namesByCategory.set(item.category_id, names);
    lastSortByCategory.set(item.category_id, Math.max(lastSortByCategory.get(item.category_id) ?? -1, item.sort ?? 0));
  }

  let skipped = 0;
  const rows: {
    venue_id: string;
    category_id: string;
    name: string;
    description: string | null;
    price_minor: number;
    sort: number;
  }[] = [];
  for (const category of priced) {
    const categoryId = categoryIdByName.get(category.name.toLowerCase());
    if (!categoryId) {
      await undo([]);
      return { ok: false, error: SAVE_FAILED };
    }
    const names = namesByCategory.get(categoryId) ?? new Set<string>();
    namesByCategory.set(categoryId, names);
    for (const item of category.items) {
      const key = item.name.toLowerCase();
      if (names.has(key) || item.priceMinor === null) {
        skipped += 1;
        continue;
      }
      names.add(key);
      const sort = (lastSortByCategory.get(categoryId) ?? -1) + 1;
      lastSortByCategory.set(categoryId, sort);
      rows.push({
        venue_id: venue.id,
        category_id: categoryId,
        name: item.name,
        description: item.description || null,
        price_minor: item.priceMinor,
        sort,
      });
    }
  }

  if (rows.length === 0) {
    await undo([]);
    return { ok: true, added: 0, skipped };
  }

  const { data: createdItems, error: itemsError } = await supabase.from('menu_items').insert(rows).select('id');
  if (itemsError || !createdItems) {
    console.error('Import could not create items:', itemsError);
    await undo([]);
    return { ok: false, error: SAVE_FAILED };
  }
  const itemIds = (createdItems as { id: string }[]).map((row) => row.id);

  // 3. Where the items are shown.
  if (zoneIds.length > 0) {
    const { error: zoneError } = await supabase
      .from('menu_item_zones')
      .insert(itemIds.flatMap((itemId) => zoneIds.map((zoneId) => ({ menu_item_id: itemId, zone_id: zoneId }))));
    if (zoneError) {
      console.error('Import could not save item zones:', zoneError);
      await undo(itemIds);
      return { ok: false, error: SAVE_FAILED };
    }
  }

  revalidatePath('/admin/menu');
  return { ok: true, added: itemIds.length, skipped };
}
