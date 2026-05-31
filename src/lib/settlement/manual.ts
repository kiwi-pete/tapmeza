import { SettlementProvider, SettlementMode } from './types';

// PHASE 2: payment provider — This manual provider is a no-op placeholder for face-to-face settlement.
// Extend or replace this when integrating Live Payment Gateways.
export const manualSettlementProvider: SettlementProvider = {
  async initiate(_orderId: string, _mode: SettlementMode) {
    // Face-to-face manual settlement always succeeds instantly on order creation
    return { ok: true };
  },
};
