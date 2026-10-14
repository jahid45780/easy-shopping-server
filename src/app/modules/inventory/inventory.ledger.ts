import { Types } from 'mongoose';
import { StockMovement, StockMovementType } from './stockMovement.model';

// Writing to the stock ledger. Imported by order.service and product.service, so this
// file must only depend on the StockMovement model (no service imports → no cycles).

export interface StockMovementInput {
    product: Types.ObjectId | string;
    type: StockMovementType;
    quantity: number;
    balanceAfter: number;
    variant?: { color?: string; size?: string; label?: string } | null;
    variantBalanceAfter?: number | null;
    unitCost?: number | null;
    note?: string;
    order?: Types.ObjectId | string | null;
    createdBy?: Types.ObjectId | string | null;
}

const idOrNull = (v: unknown) => (v && Types.ObjectId.isValid(String(v)) ? String(v) : null);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A readable variant label ("Red / XL") from an order line or a product variant. */
export function variantOf(src: { color?: string; size?: string; label?: string } | null | undefined) {
    const color = String(src?.color || '').trim();
    const size = String(src?.size || '').trim();
    if (!color && !size) return null;
    const label = String(src?.label || '').trim() || [color, size].filter(Boolean).join(' / ');
    return { color, size, label };
}

/**
 * Record ledger rows. NEVER throws: the stock change already happened, and bookkeeping
 * must not break an order, a cancellation or a product save. Await it when the caller
 * wants the row to exist before responding; otherwise use logStockMovements().
 */
export async function recordStockMovements(entries: StockMovementInput[]): Promise<void> {
    try {
        const rows = (entries || [])
            .filter((e) => e && idOrNull(e.product) && Number.isFinite(e.quantity) && Number.isFinite(e.balanceAfter))
            .map((e) => ({
                product: idOrNull(e.product),
                type: e.type,
                quantity: e.quantity,
                balanceAfter: e.balanceAfter,
                variant: e.variant ? variantOf(e.variant) : null,
                variantBalanceAfter: numOrNull(e.variantBalanceAfter),
                unitCost: numOrNull(e.unitCost) !== null && (e.unitCost as number) >= 0 ? e.unitCost : null,
                note: String(e.note || '').slice(0, 500),
                order: idOrNull(e.order),
                createdBy: idOrNull(e.createdBy),
            }));
        if (!rows.length) return;
        await StockMovement.insertMany(rows, { ordered: false });
    } catch (err: any) {
        console.error('[inventory] could not record stock movement:', err?.message || err);
    }
}

/** Fire-and-forget variant of recordStockMovements — for order / product flows. */
export function logStockMovements(entries: StockMovementInput[]): void {
    try {
        recordStockMovements(entries).catch(() => {});
    } catch {
        // never block the caller
    }
}
