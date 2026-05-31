export type SettlementMode = 'pay_at_venue' | 'charge_to_room';

export interface Settlement {
  mode: SettlementMode;
  // PHASE 2: payment provider — extend this interface when integrating ClickPesa/Selcom/DPO/Stripe.
}

export interface SettlementProvider {
  initiate(orderId: string, mode: SettlementMode): Promise<{ ok: true } | { ok: false; error: string }>;
}
