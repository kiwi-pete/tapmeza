/**
 * Limits and shapes for the menu import that the browser needs too.
 * Kept free of zod so the import screens do not ship the validation library.
 */

/** Limits shared by the upload screen, the import route and the save action. */
export const IMPORT_MAX_FILES = 10;
/** Vercel rejects request bodies over 4.5 MB, so uploads are kept safely under it. */
export const IMPORT_MAX_UPLOAD_BYTES = 4_000_000;
export const IMPORT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const IMPORT_PDF_TYPE = 'application/pdf';
export const MENU_MAX_ITEMS_PER_SAVE = 500;
export const NAME_MAX = 120;
export const CATEGORY_NAME_MAX = 80;
export const DESCRIPTION_MAX = 500;

/** One line sent from the import route to the browser while the menu is being read. */
export type ImportEvent =
  | { type: 'progress'; items: number }
  | { type: 'result'; menu: ImportedMenu }
  | { type: 'error'; message: string };

export interface ImportedItem {
  name: string;
  description: string;
  /** Plain amount ready for a price field ("12500"), or "" when the menu gave none. */
  price: string;
  unsure: boolean;
}

export interface ImportedMenu {
  currency: string | null;
  notes: string[];
  categories: { name: string; items: ImportedItem[] }[];
}
