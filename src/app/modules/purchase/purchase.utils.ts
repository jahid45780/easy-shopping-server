import AppError from '../../utils/AppError';

// ════════════════════════════════════════════════════════════════════════
//  Purchase arithmetic and rules — pure functions, no database.
//  Imported by purchase.service and by the offline tests.
// ════════════════════════════════════════════════════════════════════════

export const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bdt = (n: number) => `৳${round2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* ─── Reference numbers ──────────────────────────────────────────────── */

export const REFERENCE_PREFIX = 'PO';

/** The counter key for a Dhaka day: '2026-08-30' → 'PO260830'. */
export function referenceKey(day: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!m) throw new Error(`Invalid day "${day}"`);
    return `${REFERENCE_PREFIX}${m[1].slice(2)}${m[2]}${m[3]}`;
}

/** '2026-08-30', 10 → 'PO26083000010' (a 5-digit sequence; it simply grows past 99999). */
export function formatReference(day: string, seq: number): string {
    if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid sequence ${seq}`);
    return `${referenceKey(day)}${String(seq).padStart(5, '0')}`;
}

/** 'PO26083000010' → { key: 'PO260830', seq: 10 }; anything else → null. */
export function parseReference(ref: string): { key: string; seq: number } | null {
    const m = /^PO(\d{6})(\d{5,})$/.exec(String(ref || ''));
    return m ? { key: `PO${m[1]}`, seq: Number(m[2]) } : null;
}

/* ─── Money ──────────────────────────────────────────────────────────── */

export interface ItemLike {
    _id?: unknown;
    name?: string;
    qty: number;
    unitCost: number;
    receivedQty?: number;
}

export interface PurchaseLike {
    status?: string;
    currency?: string;
    exchangeRate?: number;
    items: ItemLike[];
    shippingCost?: number;
    customsDuty?: number;
    otherCost?: number;
    discount?: number;
    payments?: { amount: number }[];
    receipts?: unknown[];
}

/** BDT per 1 unit of the purchase currency (always 1 for BDT). */
export const effectiveRate = (p: { currency?: string; exchangeRate?: number }) =>
    !p.currency || p.currency === 'BDT' ? 1 : num(p.exchangeRate);

/** shipping + customs + other − discount, BDT. */
export const extraCosts = (p: PurchaseLike) =>
    num(p.shippingCost) + num(p.customsDuty) + num(p.otherCost) - num(p.discount);

export interface Totals {
    subtotal: number;      // purchase currency
    subtotalBdt: number;
    grandTotal: number;    // subtotalBdt + shipping + customs + other − discount
    paid: number;
    due: number;           // what is still owed; 0 once cancelled
}

export function computeTotals(p: PurchaseLike): Totals {
    const rate = effectiveRate(p);
    const raw = (p.items || []).reduce((s, i) => s + num(i.qty) * num(i.unitCost), 0);
    const subtotalBdt = round2(raw * rate);
    const grandTotal = round2(subtotalBdt + extraCosts(p));
    const paid = round2((p.payments || []).reduce((s, x) => s + num(x.amount), 0));
    const due = p.status === 'cancelled' ? 0 : round2(Math.max(0, grandTotal - paid));
    return { subtotal: round2(raw), subtotalBdt, grandTotal, paid, due };
}

/**
 * Landed cost per unit in BDT, one per item (same order as `items`): the item's own
 * cost converted to BDT, plus its share of shipping + customs + other − discount.
 * The share follows the line's value; when every line is free it follows quantity.
 * Never negative.
 */
export function landedUnitCosts(p: PurchaseLike): number[] {
    const rate = effectiveRate(p);
    const items = p.items || [];
    const lines = items.map((i) => num(i.qty) * num(i.unitCost) * rate);
    const subtotalBdt = lines.reduce((s, v) => s + v, 0);
    const totalQty = items.reduce((s, i) => s + num(i.qty), 0);
    const extras = extraCosts(p);
    return items.map((i, k) => {
        const qty = num(i.qty);
        if (qty <= 0) return 0;
        const share = subtotalBdt > 0 ? lines[k] / subtotalBdt : totalQty > 0 ? qty / totalQty : 0;
        return round2(Math.max(0, (lines[k] + extras * share) / qty));
    });
}

/** A grand total below zero means the discount is bigger than the bill. */
export function assertTotalsValid(t: Totals) {
    if (t.grandTotal < 0) {
        throw new AppError(400, `The discount is larger than the whole bill (the total would be ${bdt(t.grandTotal)})`);
    }
    if (t.paid > t.grandTotal + 0.001) {
        throw new AppError(400, `${bdt(t.paid)} has already been paid on this purchase — more than the new total of ${bdt(t.grandTotal)}. Remove a payment first.`);
    }
}

/** A new payment may not take `paid` past the grand total. */
export function assertPaymentFits(p: { status?: string; grandTotal: number; paid: number }, amount: number) {
    if (p.status === 'cancelled') throw new AppError(400, 'This purchase is cancelled — no more payments can be recorded');
    if (!(amount > 0)) throw new AppError(400, 'The amount must be more than 0');
    const room = round2(p.grandTotal - p.paid);
    if (round2(p.paid + amount) > round2(p.grandTotal)) {
        throw new AppError(400, room <= 0
            ? 'This purchase is already fully paid'
            : `Only ${bdt(room)} is due on this purchase — a payment cannot be more than that`);
    }
}

/* ─── Status rules ───────────────────────────────────────────────────── */

export const hasReceipts = (p: PurchaseLike) =>
    (p.receipts?.length || 0) > 0 || (p.items || []).some((i) => num(i.receivedQty) > 0);

export const remainingQty = (i: ItemLike) => Math.max(0, num(i.qty) - num(i.receivedQty));

/** Supplier, items, prices and extra costs change only on an untouched draft or confirmed PO. */
export const itemsEditable = (p: PurchaseLike) =>
    (p.status === 'draft' || p.status === 'confirmed') && !hasReceipts(p);

export const canCancel = (p: PurchaseLike) => p.status !== 'cancelled' && !hasReceipts(p);

export const canDelete = (p: PurchaseLike) =>
    (p.status === 'draft' || p.status === 'cancelled') && !hasReceipts(p) && !(p.payments?.length);

/** Why goods cannot be received right now, or null when they can. */
export function receiveBlockReason(p: PurchaseLike): string | null {
    if (p.status === 'draft') return 'Confirm this purchase before receiving goods';
    if (p.status === 'cancelled') return 'A cancelled purchase cannot receive goods';
    if (!(p.items || []).some((i) => remainingQty(i) > 0)) return 'Everything on this purchase has already been received';
    return null;
}

/** Status after goods arrive: all received → received, some → partially_received. */
export function statusFromReceipts(items: ItemLike[]): 'confirmed' | 'partially_received' | 'received' {
    const got = items.reduce((s, i) => s + num(i.receivedQty), 0);
    if (got <= 0) return 'confirmed';
    return items.every((i) => num(i.receivedQty) >= num(i.qty)) ? 'received' : 'partially_received';
}

/** Why a delete is refused, or null when it is allowed. */
export function deleteBlockReason(p: PurchaseLike): string | null {
    if (hasReceipts(p)) return 'Goods have been received on this purchase, so it stays on the books';
    if (p.payments?.length) return 'This purchase has payments — remove them first, or cancel it instead';
    if (p.status !== 'draft' && p.status !== 'cancelled') return 'Only a draft or a cancelled purchase can be deleted — cancel it first';
    return null;
}

export interface ReceiveLineInput {
    itemId: string;
    qty: number;
    variantId?: string | null;
    skipStock?: boolean;
}

/**
 * Check receive lines against what is still due on each item. The same item may appear
 * on several lines (say, two variants); together they may not exceed what remains.
 * Returns the quantity received per item id.
 */
export function checkReceiveLines(items: ItemLike[], lines: ReceiveLineInput[]): Map<string, number> {
    if (!lines?.length) throw new AppError(400, 'Enter how many arrived for at least one item');
    const byId = new Map(items.map((i) => [String(i._id), i]));
    const totals = new Map<string, number>();
    for (const l of lines) {
        const item = byId.get(String(l.itemId));
        if (!item) throw new AppError(400, 'A line refers to an item that is not on this purchase');
        if (!Number.isInteger(l.qty) || l.qty < 1) throw new AppError(400, `Quantity for "${item.name}" must be a whole number of at least 1`);
        totals.set(String(l.itemId), (totals.get(String(l.itemId)) || 0) + l.qty);
    }
    for (const [id, qty] of totals) {
        const item = byId.get(id)!;
        const left = remainingQty(item);
        if (qty > left) {
            throw new AppError(400, left <= 0
                ? `Everything of "${item.name}" has already been received`
                : `Only ${left.toLocaleString('en-IN')} of "${item.name}" ${left === 1 ? 'is' : 'are'} left to receive`);
        }
    }
    return totals;
}
