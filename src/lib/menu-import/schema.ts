import { z } from 'zod';
import { decimalToMinor, minorToDecimal } from '@/lib/money';
import {
  CATEGORY_NAME_MAX,
  DESCRIPTION_MAX,
  NAME_MAX,
  type ImportedItem,
  type ImportedMenu,
} from '@/lib/menu-import/limits';

/** The menu exactly as the model read it. Field descriptions are sent to the model with the schema. */
export const extractedMenuSchema = z.object({
  currency: z
    .string()
    .nullable()
    .describe('ISO 4217 code of the currency the printed prices are in, e.g. "TZS" or "USD". null if the menu does not make it clear.'),
  notes: z
    .array(z.string())
    .describe('Short sentences for the venue owner: anything that affects what guests pay or can order, or pages that could not be read. Empty if nothing.'),
  categories: z.array(
    z.object({
      name: z.string().describe('Section heading, in normal capitalisation.'),
      items: z.array(
        z.object({
          name: z.string(),
          description: z.string().nullable().describe('As printed. null if the menu gives none.'),
          price: z
            .string()
            .nullable()
            .describe('Full amount as digits with an optional decimal point and nothing else, e.g. "12500" or "8.50". null if no price is printed.'),
          unsure: z.boolean().describe('true if any part of this item was hard to read or had to be inferred.'),
        })
      ),
    })
  ),
});

export type ExtractedMenu = z.infer<typeof extractedMenuSchema>;

/** Tidies the model's output for the review screen: trims, drops empties, and normalises every price. */
export function toImportedMenu(extracted: ExtractedMenu): ImportedMenu {
  const categories = extracted.categories
    .map((category) => ({
      name: category.name.trim().slice(0, CATEGORY_NAME_MAX),
      items: category.items
        .map((item): ImportedItem => {
          const minor = item.price === null ? null : decimalToMinor(item.price);
          return {
            name: item.name.trim().slice(0, NAME_MAX),
            description: (item.description ?? '').trim().slice(0, DESCRIPTION_MAX),
            price: minor === null ? '' : minorToDecimal(minor),
            // A price that was printed but could not be read as a number needs a human look.
            unsure: item.unsure || (item.price !== null && minor === null),
          };
        })
        .filter((item) => item.name.length > 0),
    }))
    .filter((category) => category.name.length > 0 && category.items.length > 0);

  return {
    currency: extracted.currency?.trim().toUpperCase() || null,
    notes: extracted.notes.map((note) => note.trim()).filter((note) => note.length > 0),
    categories,
  };
}

/** What the review screen sends to be saved. Prices are re-parsed on the server. */
export const importSaveSchema = z.object({
  zoneIds: z.array(z.string().uuid()).max(100),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(NAME_MAX),
              description: z.string().trim().max(DESCRIPTION_MAX),
              price: z.string().max(20),
            })
          )
          .min(1),
      })
    )
    .min(1),
});

export type ImportSaveInput = z.infer<typeof importSaveSchema>;
