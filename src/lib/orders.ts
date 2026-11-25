/**
 * Shared order vocabulary, so the Customer App, Staff App and Admin Portal
 * use the same statuses and the same wording for them.
 */

export const ORDER_STATUSES = ['received', 'preparing', 'ready', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that still need staff attention. */
export const ACTIVE_STATUSES = ['received', 'preparing', 'ready'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isActiveStatus(value: unknown): value is ActiveStatus {
  return typeof value === 'string' && (ACTIVE_STATUSES as readonly string[]).includes(value);
}

export type Settlement = 'pay_at_venue' | 'charge_to_room';

export const SETTLEMENT_LABELS: Record<Settlement, string> = {
  pay_at_venue: 'Pay at venue',
  charge_to_room: 'Charge to room',
};

export function isSettlement(value: unknown): value is Settlement {
  return value === 'pay_at_venue' || value === 'charge_to_room';
}
