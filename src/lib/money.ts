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
export function majorToMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export function minorToMajor(amountMinor: number): number {
  return amountMinor / 100;
}
