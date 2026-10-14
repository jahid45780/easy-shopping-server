import { Schema, model } from 'mongoose';

// ── Stock ledger ──────────────────────────────────────────────────────────
// One row per change to a product's stock. `quantity` is signed (+ in, − out) and
// `balanceAfter` is the product's TOTAL stock right after the change, so a product's
// rows read like a bank statement. Rows are written by:
//   • the Inventory module      → opening / stock_in / stock_out / adjustment
//   • order.service             → sale (stock reserved at checkout), cancel, return
//   • product.service           → opening (product created with stock), adjustment (form edit)
// Ledger writes never block the stock change they describe (see inventory.ledger.ts).
//
// Warehouses come later: add a `warehouse` ref here (and to the stock itself) then.
export const STOCK_MOVEMENT_TYPES = ['opening', 'stock_in', 'stock_out', 'adjustment', 'sale', 'return', 'cancel'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

const stockMovementSchema = new Schema(
    {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        // Set when the change targets one variant (colour / size) of the product.
        variant: {
            type: new Schema(
                {
                    color: { type: String, default: '' },
                    size:  { type: String, default: '' },
                    label: { type: String, default: '' },
                },
                { _id: false }
            ),
            default: null,
        },
        type:         { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
        quantity:     { type: Number, required: true },           // signed: +in / −out
        balanceAfter: { type: Number, required: true },           // product total after the change
        variantBalanceAfter: { type: Number, default: null },     // that variant's stock after (variant changes only)
        unitCost:     { type: Number, default: null, min: 0 },    // BDT per unit (purchase cost, or cost at the time of a sale)
        note:         { type: String, default: '', maxlength: 500 },
        order:        { type: Schema.Types.ObjectId, ref: 'Order', default: null },
        createdBy:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });

export const StockMovement = model('StockMovement', stockMovementSchema);
