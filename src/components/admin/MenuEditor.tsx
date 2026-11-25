'use client';

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import {
  deleteMenuCategory,
  deleteMenuItem,
  saveMenuCategory,
  saveMenuItem,
  setMenuItemAvailable,
} from '@/app/admin/menu/actions';
import type { ActionResult, AdminMenuCategory, AdminMenuItem, AdminZone } from '@/app/admin/menu/types';
import { CATEGORY_NAME_MAX, DESCRIPTION_MAX, NAME_MAX } from '@/lib/menu-import/limits';
import { decimalToMinor, formatMinor, minorToDecimal } from '@/lib/money';
import Sheet from '@/components/Sheet';

interface MenuEditorProps {
  currency: string;
  zones: AdminZone[];
  categories: AdminMenuCategory[];
}

type Editing =
  | { kind: 'item'; item: AdminMenuItem | null; categoryId: string | null }
  | { kind: 'category'; category: AdminMenuCategory };

const NEW_CATEGORY = '__new__';

export default function MenuEditor({ currency, zones, categories }: MenuEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  /** Availability switches flip at once; this holds the new value until the server copy arrives. */
  const [pendingAvailability, setPendingAvailability] = useState<Record<string, boolean>>({});
  const [, startRefresh] = useTransition();

  const closeSheet = useCallback(() => setEditing(null), []);

  const toggleAvailable = async (item: AdminMenuItem, available: boolean) => {
    setPageError(null);
    setPendingAvailability((prev) => ({ ...prev, [item.id]: available }));
    let result: ActionResult;
    try {
      result = await setMenuItemAvailable(item.id, available);
    } catch (err) {
      console.error('Availability change did not reach the server:', err);
      result = { ok: false, error: 'That could not be saved. Check the connection and try again.' };
    }
    if (!result.ok) setPageError(result.error);
    startRefresh(() => {
      router.refresh();
      setPendingAvailability((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    });
  };

  const onSaved = () => {
    setEditing(null);
    router.refresh();
  };

  const zoneSummary = (item: AdminMenuItem): string | null => {
    if (zones.length === 0) return null;
    const shown = zones.filter((zone) => item.zoneIds.includes(zone.id));
    if (shown.length === 0) return 'Not on any menu';
    if (shown.length === zones.length) return null;
    return shown.map((zone) => zone.name).join(', ');
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Menu</h1>
        {categories.length > 0 && (
          <div className="flex gap-2">
            <Link href="/admin/menu/import" className="btn btn-secondary px-4">
              Import menu
            </Link>
            <button
              type="button"
              onClick={() => setEditing({ kind: 'item', item: null, categoryId: null })}
              className="btn btn-primary px-4"
            >
              Add item
            </button>
          </div>
        )}
      </div>

      {pageError && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft py-1 pr-1 pl-4">
          <p className="text-sm font-medium">{pageError}</p>
          <button type="button" onClick={() => setPageError(null)} aria-label="Dismiss" className="icon-btn">
            <X size={20} aria-hidden />
          </button>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-xl font-bold">Your menu is empty</p>
          <Link href="/admin/menu/import" className="btn btn-primary">
            Import from a photo or PDF
          </Link>
          <button
            type="button"
            onClick={() => setEditing({ kind: 'item', item: null, categoryId: null })}
            className="btn btn-secondary"
          >
            Add items by hand
          </button>
        </div>
      ) : (
        categories.map((category) => (
          <section key={category.id} aria-labelledby={`category-${category.id}`} className="pt-6">
            <div className="flex items-center gap-1 border-b border-line pb-1">
              <h2 id={`category-${category.id}`} className="min-w-0 flex-1 truncate text-lg font-bold">
                {category.name}
              </h2>
              <button
                type="button"
                onClick={() => setEditing({ kind: 'category', category })}
                aria-label={`Edit category ${category.name}`}
                className="icon-btn"
              >
                <Pencil size={18} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setEditing({ kind: 'item', item: null, categoryId: category.id })}
                aria-label={`Add item to ${category.name}`}
                className="icon-btn"
              >
                <Plus size={22} aria-hidden />
              </button>
            </div>

            {category.items.length === 0 ? (
              <p className="py-4 text-muted">No items</p>
            ) : (
              <ul className="divide-y divide-line">
                {category.items.map((item) => {
                  const available = pendingAvailability[item.id] ?? item.available;
                  const where = zoneSummary(item);
                  return (
                    <li key={item.id} className="flex items-center gap-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: 'item', item, categoryId: item.categoryId })}
                        aria-label={`Edit ${item.name}`}
                        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-medium ${available ? '' : 'text-muted line-through'}`}>
                            {item.name}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            <span className="tabular-nums">{formatMinor(item.priceMinor, currency)}</span>
                            {!available && ' · Hidden from guests'}
                            {available && where && ` · ${where}`}
                          </span>
                        </span>
                        <Pencil size={16} aria-hidden className="shrink-0 text-muted" />
                      </button>
                      <Switch
                        checked={available}
                        label={`Show ${item.name} to guests`}
                        onChange={(next) => void toggleAvailable(item, next)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}

      {editing?.kind === 'item' && (
        <ItemSheet
          key={editing.item?.id ?? `new-${editing.categoryId ?? ''}`}
          item={editing.item}
          initialCategoryId={editing.categoryId}
          currency={currency}
          zones={zones}
          categories={categories}
          onClose={closeSheet}
          onSaved={onSaved}
        />
      )}
      {editing?.kind === 'category' && (
        <CategorySheet key={editing.category.id} category={editing.category} onClose={closeSheet} onSaved={onSaved} />
      )}
    </main>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-14 shrink-0 items-center justify-center"
    >
      <span className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}>
        <span
          className={`size-6 rounded-full transition-transform ${checked ? 'translate-x-5 bg-on-accent' : 'bg-surface'}`}
        />
      </span>
    </button>
  );
}

/** Runs a server action and turns a dropped connection into the same shape as a refused save. */
async function run(action: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await action();
  } catch (err) {
    console.error('Menu change did not reach the server:', err);
    return { ok: false, error: 'That could not be saved. Check the connection and try again.' };
  }
}

interface ItemSheetProps {
  item: AdminMenuItem | null;
  initialCategoryId: string | null;
  currency: string;
  zones: AdminZone[];
  categories: AdminMenuCategory[];
  onClose: () => void;
  onSaved: () => void;
}

function ItemSheet({ item, initialCategoryId, currency, zones, categories, onClose, onSaved }: ItemSheetProps) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? minorToDecimal(item.priceMinor) : '');
  const [categoryChoice, setCategoryChoice] = useState(initialCategoryId ?? categories[0]?.id ?? NEW_CATEGORY);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [zoneIds, setZoneIds] = useState<string[]>(item ? item.zoneIds : zones.map((zone) => zone.id));
  const [available, setAvailable] = useState(item?.available ?? true);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Give the item a name.');
    if (decimalToMinor(price) === null) return setError('Enter the price as a number, like 12500 or 8.50.');
    if (categoryChoice === NEW_CATEGORY && !newCategoryName.trim()) return setError('Name the new category.');

    setBusy('save');
    setError(null);
    const result = await run(() =>
      saveMenuItem({
        id: item?.id,
        name,
        description,
        price,
        categoryId: categoryChoice === NEW_CATEGORY ? undefined : categoryChoice,
        newCategoryName: categoryChoice === NEW_CATEGORY ? newCategoryName : undefined,
        zoneIds,
        available,
      })
    );
    if (result.ok) return onSaved();
    setError(result.error);
    setBusy(null);
  };

  const remove = async () => {
    if (!item || busy) return;
    setBusy('delete');
    setError(null);
    const result = await run(() => deleteMenuItem(item.id));
    if (result.ok) return onSaved();
    setError(result.error);
    setConfirmingDelete(false);
    setBusy(null);
  };

  return (
    <Sheet
      title={item ? 'Edit item' : 'Add item'}
      onClose={onClose}
      canClose={!busy}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium">
              {error}
            </p>
          )}
          {confirmingDelete ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={!!busy} className="btn btn-secondary flex-1">
                Keep
              </button>
              <button type="button" onClick={remove} disabled={!!busy} className="btn btn-danger flex-1">
                {busy === 'delete' && <Loader2 size={20} className="animate-spin" aria-hidden />}
                Delete item
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {item && (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={!!busy} className="btn btn-secondary px-4">
                  Delete
                </button>
              )}
              <button type="submit" form="item-form" disabled={!!busy} className="btn btn-primary flex-1">
                {busy === 'save' && <Loader2 size={20} className="animate-spin" aria-hidden />}
                Save
              </button>
            </div>
          )}
        </>
      }
    >
      <form id="item-form" onSubmit={save} className="space-y-4" noValidate>
        <div>
          <label htmlFor="item-name" className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <input
            id="item-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={NAME_MAX}
            autoComplete="off"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="item-price" className="mb-1.5 block text-sm font-medium">
            Price ({currency})
          </label>
          <input
            id="item-price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="field tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="item-description" className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="item-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={DESCRIPTION_MAX}
            className="field resize-none py-3"
          />
        </div>
        <div>
          <label htmlFor="item-category" className="mb-1.5 block text-sm font-medium">
            Category
          </label>
          {categories.length > 0 && (
            <select
              id="item-category"
              value={categoryChoice}
              onChange={(event) => setCategoryChoice(event.target.value)}
              className="field"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>New category…</option>
            </select>
          )}
          {categoryChoice === NEW_CATEGORY && (
            <input
              id={categories.length > 0 ? undefined : 'item-category'}
              aria-label="New category name"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              maxLength={CATEGORY_NAME_MAX}
              placeholder="e.g. Starters"
              autoComplete="off"
              className={`field ${categories.length > 0 ? 'mt-2' : ''}`}
            />
          )}
        </div>
        {zones.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Shown in</legend>
            <ZonePicker zones={zones} selected={zoneIds} onChange={setZoneIds} />
          </fieldset>
        )}
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
          <span className="font-medium">Available to order</span>
          <input
            type="checkbox"
            checked={available}
            onChange={(event) => setAvailable(event.target.checked)}
            className="size-5 accent-accent"
          />
        </label>
      </form>
    </Sheet>
  );
}

export function ZonePicker({
  zones,
  selected,
  onChange,
}: {
  zones: AdminZone[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {zones.map((zone) => {
        const isSelected = selected.includes(zone.id);
        return (
          <label
            key={zone.id}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
              isSelected ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted'
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onChange(isSelected ? selected.filter((id) => id !== zone.id) : [...selected, zone.id])}
              className="size-4 accent-accent"
            />
            {zone.name}
          </label>
        );
      })}
    </div>
  );
}

interface CategorySheetProps {
  category: AdminMenuCategory;
  onClose: () => void;
  onSaved: () => void;
}

function CategorySheet({ category, onClose, onSaved }: CategorySheetProps) {
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemCount = category.items.length;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Give the category a name.');
    setBusy('save');
    setError(null);
    const result = await run(() => saveMenuCategory({ id: category.id, name }));
    if (result.ok) return onSaved();
    setError(result.error);
    setBusy(null);
  };

  const remove = async () => {
    if (busy) return;
    setBusy('delete');
    setError(null);
    const result = await run(() => deleteMenuCategory(category.id));
    if (result.ok) return onSaved();
    setError(result.error);
    setConfirmingDelete(false);
    setBusy(null);
  };

  return (
    <Sheet
      title="Edit category"
      onClose={onClose}
      canClose={!busy}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium">
              {error}
            </p>
          )}
          {confirmingDelete ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={!!busy} className="btn btn-secondary flex-1">
                Keep
              </button>
              <button type="button" onClick={remove} disabled={!!busy} className="btn btn-danger flex-1 px-3">
                {busy === 'delete' && <Loader2 size={20} className="animate-spin" aria-hidden />}
                {itemCount === 0 ? 'Delete category' : `Delete with ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmingDelete(true)} disabled={!!busy} className="btn btn-secondary px-4">
                Delete
              </button>
              <button type="submit" form="category-form" disabled={!!busy} className="btn btn-primary flex-1">
                {busy === 'save' && <Loader2 size={20} className="animate-spin" aria-hidden />}
                Save
              </button>
            </div>
          )}
        </>
      }
    >
      <form id="category-form" onSubmit={save} noValidate>
        <label htmlFor="category-name" className="mb-1.5 block text-sm font-medium">
          Name
        </label>
        <input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={CATEGORY_NAME_MAX}
          autoComplete="off"
          className="field"
        />
      </form>
    </Sheet>
  );
}
