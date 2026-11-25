/**
 * Utilities for working with currency stored as integer minor units (cents/senti).
 * Floats are forbidden for representing money inside core application logic.
 */

/**
 * Formats an integer minor unit amount into a readable currency string.
 * Uses minor units (e.g., 15000 senti = 150 TZS).
 * For TZS, minor units are divided by 100, but standard display shows no decimals.
 */
export function formatMinor(amountMinor: number, currency: string = 'TZS'): string {
  const majorUnit = amountMinor / 100;
  const currencyUpper = currency.toUpperCase();

  if (currencyUpper === 'TZS') {
    const formattedNum = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(majorUnit);
    return `TSh ${formattedNum}`;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyUpper,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(majorUnit);
  } catch {
    const formattedNum = majorUnit.toFixed(2);
    return `${currencyUpper} ${formattedNum}`;
  }
}

/**
 * Converts a standard decimal representation string into integer minor units.
 * For example, "150.50" becomes 15050.
 */
export function parseMinor(amountString: string): number {
  const cleanString = amountString.replace(/[^0-9.-]/g, '');
  const parsedFloat = parseFloat(cleanString);
  if (isNaN(parsedFloat)) {
    return 0;
  }
  return Math.round(parsedFloat * 100);
}
/** Largest amount a price_minor (int4) column can hold. */
const MAX_MINOR = 2_147_483_647;

/**
 * Reads a typed or printed amount ("12,500", "12500", "8.50", "8,5") as integer minor units,
 * using integer arithmetic only. Returns null when the text is not a plain amount.
 */
export function decimalToMinor(text: string): number | null {
  let cleaned = text.trim().replace(/[\s_']/g, '');
  // A lone comma followed by one or two digits is a decimal comma ("8,50"); otherwise commas group thousands.
  cleaned = /^\d+,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor <= MAX_MINOR ? minor : null;
}

/** Minor units as a plain editable amount: 1250000 → "12500", 850 → "8.50". */
export function minorToDecimal(amountMinor: number): string {
  const whole = Math.trunc(amountMinor / 100);
  const fraction = amountMinor % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function majorToMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export function minorToMajor(amountMinor: number): number {
  return amountMinor / 100;
}
