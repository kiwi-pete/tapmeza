/**
 * Remembers the customer's in-progress order on their own phone, so the menu can
 * link back to its status screen. Browser storage only — nothing is sent anywhere.
 */

const KEY_PREFIX = 'tapmeza.order.';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface StoredOrder {
  orderId: string;
  savedAt: number;
}

export function rememberActiveOrder(qrToken: string, orderId: string): void {
  try {
    const value: StoredOrder = { orderId, savedAt: Date.now() };
    window.localStorage.setItem(KEY_PREFIX + qrToken, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not remember the active order:', err);
  }
}

export function forgetActiveOrder(qrToken: string): void {
  try {
    window.localStorage.removeItem(KEY_PREFIX + qrToken);
  } catch (err) {
    console.warn('Could not clear the active order:', err);
  }
}

export function readActiveOrder(qrToken: string): string | null {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + qrToken);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOrder>;
    if (typeof parsed.orderId !== 'string' || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      forgetActiveOrder(qrToken);
      return null;
    }
    return parsed.orderId;
  } catch (err) {
    console.warn('Could not read the active order:', err);
    return null;
  }
}
