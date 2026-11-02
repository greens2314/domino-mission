import { EMERGENCY_FEE, FREE_ORDERS, PIECES } from './catalog';
import type { PackageKind, PieceKind, PurchaseLine, PurchaseOrder } from './types';

export function priceOf(kind: PieceKind, pkg: PackageKind, quantity: number): number {
  const unit = pkg === 'single' ? PIECES[kind].single : PIECES[kind].tenPack;
  return unit * quantity;
}

export function emergencyFeeFor(orderNo: number): number {
  return orderNo > FREE_ORDERS ? EMERGENCY_FEE : 0;
}

export type CartItem = { kind: PieceKind; package: PackageKind; quantity: number };

export function buildOrder(cart: CartItem[], orderNo: number, at: string): PurchaseOrder {
  const lines: PurchaseLine[] = cart
    .filter((c) => c.quantity > 0)
    .map((c) => {
      const unitCost = c.package === 'single' ? PIECES[c.kind].single : PIECES[c.kind].tenPack;
      return { kind: c.kind, package: c.package, quantity: c.quantity, unitCost, subtotal: unitCost * c.quantity };
    });
  const emergencyFee = emergencyFeeFor(orderNo);
  const total = lines.reduce((s, l) => s + l.subtotal, 0) + emergencyFee;
  return { orderNo, at, lines, emergencyFee, total };
}

/** Pieces added to inventory by an order. */
export function piecesFromOrder(order: PurchaseOrder): Partial<Record<PieceKind, number>> {
  const out: Partial<Record<PieceKind, number>> = {};
  for (const l of order.lines) {
    const n = l.package === 'ten-pack' ? l.quantity * 10 : l.quantity;
    out[l.kind] = (out[l.kind] ?? 0) + n;
  }
  return out;
}
