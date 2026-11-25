'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { importMenu } from '@/app/admin/menu/actions';
import type { AdminZone } from '@/app/admin/menu/types';
import {
  CATEGORY_NAME_MAX,
  DESCRIPTION_MAX,
  IMPORT_MAX_FILES,
  IMPORT_MAX_UPLOAD_BYTES,
  IMPORT_PDF_TYPE,
  NAME_MAX,
  type ImportEvent,
  type ImportedMenu,
} from '@/lib/menu-import/limits';
import { decimalToMinor, formatMinor } from '@/lib/money';
import { ZonePicker } from '@/components/admin/MenuEditor';

interface MenuImportProps {
  currency: string;
  zones: AdminZone[];
  /** What is already on the menu, so a repeat import does not offer the same items again. */
  existing: { name: string; itemNames: string[] }[];
}

interface PickedFile {
  key: string;
  file: File;
  isPdf: boolean;
  previewUrl: string | null;
}

interface DraftItem {
  key: string;
  name: string;
  description: string;
  price: string;
  unsure: boolean;
}

interface DraftCategory {
  key: string;
  name: string;
  items: DraftItem[];
}

interface Draft {
  categories: DraftCategory[];
  notes: string[];
  menuCurrency: string | null;
  alreadyOnMenu: number;
}

type Stage = 'choose' | 'reading' | 'review';

/** Photo sizes to try, largest first, until every page fits in one upload. */
const PHOTO_SIZES = [
  { longEdge: 2400, quality: 0.85 },
  { longEdge: 2000, quality: 0.8 },
  { longEdge: 1600, quality: 0.75 },
  { longEdge: 1280, quality: 0.7 },
] as const;

const DRAFT_KEY = 'tapmeza.menu-import.draft';
const CONNECTION_MESSAGE = 'The connection dropped before the menu was read. Please try again.';

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `${Date.now().toString(36)}-${keyCounter}`;
}

/** Shrinks a photo in the browser, so a 6 MB phone picture uploads quickly on a slow connection. */
async function shrinkPhoto(file: File, longEdge: number, quality: number): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let release = () => {};
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const bitmap = source;
    release = () => bitmap.close();
  } catch (bitmapError) {
    console.warn('createImageBitmap failed, falling back to an <img> decode:', bitmapError);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    source = image;
  }

  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const scale = Math.min(1, longEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    release();
    throw new Error('Canvas is not available');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  release();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Photo could not be encoded'))), 'image/jpeg', quality);
  });
}

/** Builds the upload: PDFs as they are, photos at the largest size that keeps the whole upload within the limit. */
async function buildUpload(files: PickedFile[]): Promise<FormData | null> {
  const pdfs = files.filter((entry) => entry.isPdf);
  const photos = files.filter((entry) => !entry.isPdf);
  const pdfBytes = pdfs.reduce((sum, entry) => sum + entry.file.size, 0);

  for (const size of PHOTO_SIZES) {
    const shrunk = await Promise.all(photos.map((entry) => shrinkPhoto(entry.file, size.longEdge, size.quality)));
    const total = pdfBytes + shrunk.reduce((sum, blob) => sum + blob.size, 0);
    if (total > IMPORT_MAX_UPLOAD_BYTES) continue;

    const form = new FormData();
    let photoIndex = 0;
    for (const entry of files) {
      if (entry.isPdf) {
        form.append('files', entry.file);
      } else {
        const blob = shrunk[photoIndex];
        photoIndex += 1;
        if (blob) form.append('files', new File([blob], `page-${photoIndex}.jpg`, { type: 'image/jpeg' }));
      }
    }
    return form;
  }
  return null;
}

async function readRefusal(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === 'string') return body.error.message;
  } catch (err) {
    console.warn('Import refusal was not readable:', err);
  }
  return response.status === 413
    ? 'Those files are too large. Import fewer pages at a time.'
    : 'The menu could not be read. Please try again.';
}

function isImportEvent(value: unknown): value is ImportEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'progress' || type === 'result' || type === 'error';
}

function loadStoredDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) return null;
    return {
      categories: parsed.categories,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      menuCurrency: typeof parsed.menuCurrency === 'string' ? parsed.menuCurrency : null,
      alreadyOnMenu: typeof parsed.alreadyOnMenu === 'number' ? parsed.alreadyOnMenu : 0,
    };
  } catch (err) {
    console.warn('Could not restore the import in progress:', err);
    return null;
  }
}

function storeDraft(draft: Draft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    console.warn('Could not save the import in progress:', err);
  }
}

export default function MenuImport({ currency, zones, existing }: MenuImportProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('choose');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [isTouch, setIsTouch] = useState(false);
  const [readingStep, setReadingStep] = useState<'preparing' | 'reading'>('preparing');
  const [itemsFound, setItemsFound] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [zoneIds, setZoneIds] = useState<string[]>(() => zones.map((zone) => zone.id));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const filesRef = useRef<PickedFile[]>([]);

  // Pick up an import that was being checked when the page was reloaded or closed.
  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
    const stored = loadStoredDraft();
    if (stored) {
      setDraft(stored);
      setStage('review');
    }
  }, []);

  useEffect(() => {
    if (stage !== 'review' || !draft) return;
    const timer = window.setTimeout(() => storeDraft(draft), 400);
    return () => window.clearTimeout(timer);
  }, [stage, draft]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      for (const entry of filesRef.current) if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    },
    []
  );

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    const accepted: PickedFile[] = [];
    let problem: string | null = null;
    for (const file of Array.from(list)) {
      const isPdf = file.type === IMPORT_PDF_TYPE;
      if (!isPdf && !file.type.startsWith('image/')) {
        problem = 'Use photos or a PDF.';
        continue;
      }
      if (isPdf && file.size > IMPORT_MAX_UPLOAD_BYTES) {
        problem = 'That PDF is too large (4 MB at most). Take photos of the pages instead.';
        continue;
      }
      accepted.push({ key: newKey(), file, isPdf, previewUrl: isPdf ? null : URL.createObjectURL(file) });
    }
    const next = [...files, ...accepted];
    if (next.length > IMPORT_MAX_FILES) {
      problem = `Import up to ${IMPORT_MAX_FILES} pages at a time.`;
      for (const dropped of next.slice(IMPORT_MAX_FILES)) if (dropped.previewUrl) URL.revokeObjectURL(dropped.previewUrl);
    }
    setFiles(next.slice(0, IMPORT_MAX_FILES));
    if (problem) setError(problem);
  };

  const removeFile = (key: string) => {
    setFiles((prev) => {
      const target = prev.find((entry) => entry.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((entry) => entry.key !== key);
    });
  };

  /** Turns what the AI read into an editable draft, leaving out anything already on the menu. */
  const toDraft = useCallback(
    (menu: ImportedMenu): Draft => {
      const existingNames = new Map(
        existing.map((category) => [
          category.name.trim().toLowerCase(),
          new Set(category.itemNames.map((name) => name.trim().toLowerCase())),
        ])
      );
      let alreadyOnMenu = 0;
      const categories = menu.categories
        .map((category) => {
          const taken = existingNames.get(category.name.trim().toLowerCase());
          const items = category.items.filter((item) => {
            const duplicate = taken?.has(item.name.trim().toLowerCase()) ?? false;
            if (duplicate) alreadyOnMenu += 1;
            return !duplicate;
          });
          return { key: newKey(), name: category.name, items: items.map((item) => ({ key: newKey(), ...item })) };
        })
        .filter((category) => category.items.length > 0);
      return { categories, notes: menu.notes, menuCurrency: menu.currency, alreadyOnMenu };
    },
    [existing]
  );

  const readMenu = async () => {
    if (files.length === 0) return;
    setError(null);
    setItemsFound(0);
    setReadingStep('preparing');
    setStage('reading');

    const controller = new AbortController();
    abortRef.current = controller;
    const stop = (message: string | null) => {
      if (message) setError(message);
      setStage('choose');
    };

    let form: FormData | null;
    try {
      form = await buildUpload(files);
    } catch (err) {
      console.error('Photos could not be prepared for upload:', err);
      return stop('One of those photos could not be opened. Use a JPG or PNG, or take the photo again.');
    }
    if (controller.signal.aborted) return;
    if (!form) return stop('Those pages are too large to send together. Import fewer pages at a time.');

    setReadingStep('reading');
    let menu: ImportedMenu | null = null;
    let failure: string | null = null;
    try {
      const response = await fetch('/api/admin/menu/import', { method: 'POST', body: form, signal: controller.signal });
      if (!response.ok || !response.body) return stop(await readRefusal(response));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let lineEnd = buffered.indexOf('\n');
        while (lineEnd >= 0) {
          const line = buffered.slice(0, lineEnd).trim();
          buffered = buffered.slice(lineEnd + 1);
          lineEnd = buffered.indexOf('\n');
          if (!line) continue;
          const event: unknown = JSON.parse(line);
          if (!isImportEvent(event)) continue;
          if (event.type === 'progress') setItemsFound(event.items);
          else if (event.type === 'result') menu = event.menu;
          else failure = event.message;
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Menu import request failed:', err);
      return stop(CONNECTION_MESSAGE);
    }

    if (failure) return stop(failure);
    if (!menu) return stop(CONNECTION_MESSAGE);

    const nextDraft = toDraft(menu);
    if (nextDraft.categories.length === 0) return stop('Everything on that menu is already on your menu.');
    setDraft(nextDraft);
    storeDraft(nextDraft);
    setStage('review');
    window.scrollTo(0, 0);
  };

  const cancelReading = () => {
    abortRef.current?.abort();
    setStage('choose');
  };

  const startAgain = () => {
    storeDraft(null);
    setDraft(null);
    setError(null);
    setStage('choose');
  };

  const updateCategory = useCallback((categoryKey: string, name: string) => {
    setDraft((prev) =>
      prev && { ...prev, categories: prev.categories.map((c) => (c.key === categoryKey ? { ...c, name } : c)) }
    );
  }, []);

  const removeCategory = useCallback((categoryKey: string) => {
    setDraft((prev) => prev && { ...prev, categories: prev.categories.filter((c) => c.key !== categoryKey) });
  }, []);

  const updateItem = useCallback((categoryKey: string, itemKey: string, patch: Partial<DraftItem>) => {
    setDraft(
      (prev) =>
        prev && {
          ...prev,
          categories: prev.categories.map((c) =>
            c.key === categoryKey
              ? { ...c, items: c.items.map((item) => (item.key === itemKey ? { ...item, ...patch, unsure: false } : item)) }
              : c
          ),
        }
    );
  }, []);

  const removeItem = useCallback((categoryKey: string, itemKey: string) => {
    setDraft(
      (prev) =>
        prev && {
          ...prev,
          categories: prev.categories
            .map((c) => (c.key === categoryKey ? { ...c, items: c.items.filter((item) => item.key !== itemKey) } : c))
            .filter((c) => c.items.length > 0),
        }
    );
  }, []);

  const removeUnpriced = () => {
    setDraft(
      (prev) =>
        prev && {
          ...prev,
          categories: prev.categories
            .map((c) => ({ ...c, items: c.items.filter((item) => decimalToMinor(item.price) !== null) }))
            .filter((c) => c.items.length > 0),
        }
    );
  };

  const counts = useMemo(() => {
    let items = 0;
    let unpriced = 0;
    let unnamed = 0;
    let unsure = 0;
    for (const category of draft?.categories ?? []) {
      if (!category.name.trim()) unnamed += 1;
      for (const item of category.items) {
        items += 1;
        if (!item.name.trim()) unnamed += 1;
        if (decimalToMinor(item.price) === null) unpriced += 1;
        else if (item.unsure) unsure += 1;
      }
    }
    return { items, unpriced, unnamed, unsure };
  }, [draft]);

  const save = async () => {
    if (!draft || isSaving || counts.unpriced > 0 || counts.unnamed > 0) return;
    setIsSaving(true);
    setError(null);
    let result: Awaited<ReturnType<typeof importMenu>>;
    try {
      result = await importMenu({
        zoneIds,
        categories: draft.categories.map((category) => ({
          name: category.name,
          items: category.items.map((item) => ({ name: item.name, description: item.description, price: item.price })),
        })),
      });
    } catch (err) {
      console.error('Menu import save did not reach the server:', err);
      result = { ok: false, error: 'That could not be saved. Check the connection and try again.' };
    }
    if (!result.ok) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    storeDraft(null);
    router.push('/admin/menu');
    router.refresh();
  };

  if (stage === 'reading') {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <Loader2 size={32} className="animate-spin text-accent" aria-hidden />
        <h1 className="mt-2 text-xl font-bold">
          {readingStep === 'preparing' ? 'Preparing your photos…' : 'Reading your menu…'}
        </h1>
        <p role="status" className="text-muted tabular-nums">
          {itemsFound > 0 ? `${itemsFound} ${itemsFound === 1 ? 'item' : 'items'} found` : 'This can take a minute.'}
        </p>
        <button type="button" onClick={cancelReading} className="btn btn-secondary mt-4">
          Cancel
        </button>
      </main>
    );
  }

  if (stage === 'review' && draft) {
    const blocked = counts.unpriced > 0 || counts.unnamed > 0;
    const currencyDiffers = draft.menuCurrency !== null && draft.menuCurrency !== currency.toUpperCase();
    return (
      <main className="mx-auto max-w-3xl px-4 pb-32">
        <button type="button" onClick={startAgain} disabled={isSaving} className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-muted">
          <ArrowLeft size={18} aria-hidden />
          Start again
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Check your menu</h1>

        {(counts.unpriced > 0 || counts.unsure > 0 || currencyDiffers || draft.notes.length > 0 || draft.alreadyOnMenu > 0) && (
          <ul className="mt-4 space-y-2">
            {counts.unpriced > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft py-2 pr-2 pl-4">
                <span className="text-sm font-medium">
                  {counts.unpriced} {counts.unpriced === 1 ? 'item needs' : 'items need'} a price.
                </span>
                <button type="button" onClick={removeUnpriced} className="btn btn-secondary min-h-11 px-4 text-sm">
                  Remove {counts.unpriced === 1 ? 'it' : 'them'}
                </button>
              </li>
            )}
            {counts.unsure > 0 && (
              <li className="rounded-xl bg-warn-soft px-4 py-3 text-sm font-medium">
                {counts.unsure} {counts.unsure === 1 ? 'item was' : 'items were'} hard to read. Check the ones marked below.
              </li>
            )}
            {currencyDiffers && (
              <li className="rounded-xl bg-warn-soft px-4 py-3 text-sm font-medium">
                These prices look like {draft.menuCurrency}, but your venue charges in {currency}. Check every price.
              </li>
            )}
            {draft.notes.map((note, index) => (
              <li key={index} className="rounded-xl bg-fill px-4 py-3 text-sm">
                {note}
              </li>
            ))}
            {draft.alreadyOnMenu > 0 && (
              <li className="rounded-xl bg-fill px-4 py-3 text-sm">
                {draft.alreadyOnMenu} {draft.alreadyOnMenu === 1 ? 'item is' : 'items are'} already on your menu and left out.
              </li>
            )}
          </ul>
        )}

        {zones.length > 0 && (
          <fieldset className="mt-6">
            <legend className="mb-1.5 text-sm font-medium">Show these items in</legend>
            <ZonePicker zones={zones} selected={zoneIds} onChange={setZoneIds} />
            {zoneIds.length === 0 && (
              <p className="mt-2 text-sm font-medium text-warn">Guests will not see these items until a place is chosen.</p>
            )}
          </fieldset>
        )}

        {draft.categories.map((category) => (
          <section key={category.key} className="pt-8">
            <div className="flex items-center gap-2">
              <input
                value={category.name}
                onChange={(event) => updateCategory(category.key, event.target.value)}
                maxLength={CATEGORY_NAME_MAX}
                aria-label="Category name"
                aria-invalid={!category.name.trim()}
                className={`field flex-1 text-lg font-bold ${category.name.trim() ? '' : 'border-danger'}`}
              />
              <button
                type="button"
                onClick={() => removeCategory(category.key)}
                aria-label={`Remove category ${category.name}`}
                className="icon-btn"
              >
                <Trash2 size={20} aria-hidden />
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {category.items.map((item) => (
                <DraftItemRow
                  key={item.key}
                  categoryKey={category.key}
                  item={item}
                  currency={currency}
                  onChange={updateItem}
                  onRemove={removeItem}
                />
              ))}
            </ul>
          </section>
        ))}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl">
            {error && (
              <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium">
                {error}
              </p>
            )}
            <button type="button" onClick={save} disabled={isSaving || blocked} className="btn btn-primary h-14 w-full">
              {isSaving && <Loader2 size={20} className="animate-spin" aria-hidden />}
              {blocked
                ? 'Fix the items marked in red'
                : `Add ${counts.items} ${counts.items === 1 ? 'item' : 'items'} to the menu`}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`mx-auto max-w-xl px-4 ${files.length > 0 ? 'pb-32' : 'pb-16'}`}>
      <Link href="/admin/menu" className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-muted">
        <ArrowLeft size={18} aria-hidden />
        Menu
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Import your menu</h1>
      <p className="mt-1 text-muted">Add every page. You check it all before anything is saved.</p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {files.length > 0 && (
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((entry, index) => (
            <li key={entry.key} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-fill">
              {entry.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.previewUrl} alt={`Page ${index + 1}`} className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-muted">
                  <FileText size={28} aria-hidden />
                  <span className="line-clamp-2 text-[0.8125rem] break-all">{entry.file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(entry.key)}
                aria-label={`Remove page ${index + 1}`}
                className="absolute top-1 right-1 grid size-11 place-items-center rounded-full bg-surface text-ink shadow-sm"
              >
                <X size={20} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid gap-2">
        {isTouch && (
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className={`btn ${files.length === 0 ? 'btn-primary h-14' : 'btn-secondary'}`}
          >
            <Camera size={20} aria-hidden />
            {files.length === 0 ? 'Take a photo' : 'Take another photo'}
          </button>
        )}
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          className={`btn ${files.length === 0 && !isTouch ? 'btn-primary h-14' : 'btn-secondary'}`}
        >
          <Upload size={20} aria-hidden />
          {files.length === 0 ? 'Choose photos or a PDF' : 'Add more photos or a PDF'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={readMenu} className="btn btn-primary mx-auto flex h-14 w-full max-w-xl">
            Read {files.length === 1 ? 'this page' : `these ${files.length} pages`}
          </button>
        </div>
      )}
    </main>
  );
}

interface DraftItemRowProps {
  categoryKey: string;
  item: DraftItem;
  currency: string;
  onChange: (categoryKey: string, itemKey: string, patch: Partial<DraftItem>) => void;
  onRemove: (categoryKey: string, itemKey: string) => void;
}

/** Memoised so typing in one item does not re-render a menu of several hundred. */
const DraftItemRow = memo(function DraftItemRow({ categoryKey, item, currency, onChange, onRemove }: DraftItemRowProps) {
  const nameMissing = !item.name.trim();
  const priceMinor = decimalToMinor(item.price);
  const priceMissing = priceMinor === null;
  const needsFixing = nameMissing || priceMissing;

  return (
    <li
      className={`rounded-xl border p-3 ${needsFixing ? 'border-danger' : item.unsure ? 'border-warn bg-warn-soft' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={item.name}
          onChange={(event) => onChange(categoryKey, item.key, { name: event.target.value })}
          maxLength={NAME_MAX}
          aria-label="Item name"
          aria-invalid={nameMissing}
          className={`field basis-full font-medium sm:flex-1 sm:basis-0 ${nameMissing ? 'border-danger' : ''}`}
        />
        <input
          value={item.price}
          onChange={(event) => onChange(categoryKey, item.key, { price: event.target.value })}
          inputMode="decimal"
          placeholder={`Price (${currency})`}
          aria-label={`Price in ${currency}`}
          aria-invalid={priceMissing}
          className={`field min-w-0 flex-1 tabular-nums sm:w-32 sm:flex-none ${priceMissing ? 'border-danger' : ''}`}
        />
        {/* The price as guests will see it: far easier to proof-read than a run of digits. */}
        {priceMinor !== null && (
          <span className="w-24 shrink-0 text-right text-sm text-muted tabular-nums">{formatMinor(priceMinor, currency)}</span>
        )}
        <button
          type="button"
          onClick={() => onRemove(categoryKey, item.key)}
          aria-label={`Remove ${item.name || 'item'}`}
          className="icon-btn"
        >
          <Trash2 size={20} aria-hidden />
        </button>
      </div>
      <input
        value={item.description}
        onChange={(event) => onChange(categoryKey, item.key, { description: event.target.value })}
        maxLength={DESCRIPTION_MAX}
        placeholder="Description (optional)"
        aria-label="Description"
        className="field mt-2"
      />
      {item.unsure && !needsFixing && <p className="mt-2 text-sm font-medium">Hard to read. Check this one.</p>}
    </li>
  );
});
