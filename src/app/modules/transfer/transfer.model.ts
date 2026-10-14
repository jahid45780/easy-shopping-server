import { Schema, model } from 'mongoose';

// ── Transfer = goods sent from one warehouse to another ──────────────
// Admin-only bookkeeping. A transfer is a RECORD: it never changes product.stock
// or the Inventory ledger (stock stays one total per product, not per warehouse).
//
// Status flow (see transfer.rules.ts):
//   in_transit ──► received     (goods arrived; "Undo receive" puts it back in transit)
//   in_transit ──► cancelled    (final)

export const TRANSFER_STATUSES = ['in_transit', 'received', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

const transferItemSchema = new Schema(
    {
        // A catalogue product, or null for a free-text item (packaging, spare parts…).
        product: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
        // Snapshots taken when the line was saved, so the record reads the same even if
        // the product is renamed or deleted later.
        name: { type: String, required: true, trim: true, maxlength: 200 },
        sku: { type: String, trim: true, default: '', maxlength: 60 },
        unit: { type: String, trim: true, default: '', maxlength: 40 },
        qty: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const transferSchema = new Schema(
    {
        // "TR" + YYMMDD (Dhaka, the day it was recorded) + 4-digit daily sequence, e.g. TR2609190003.
        reference: { type: String, required: true, trim: true },
        from: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        to: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        items: { type: [transferItemSchema], default: [] },
        totalQty: { type: Number, default: 0 },   // sum of items[].qty, kept for summaries
        status: { type: String, enum: TRANSFER_STATUSES, default: 'in_transit' },
        transferredAt: { type: Date, required: true },
        receivedAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        note: { type: String, trim: true, default: '', maxlength: 500 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    // Every save is version-checked: two admins changing the same transfer at once
    // (receive vs cancel) can't both win. The service turns the clash into a 409.
    { timestamps: true, optimisticConcurrency: true }
);

transferSchema.index({ reference: 1 }, { unique: true });
transferSchema.index({ transferredAt: -1, createdAt: -1 });
transferSchema.index({ from: 1, transferredAt: -1 });
transferSchema.index({ to: 1, transferredAt: -1 });
transferSchema.index({ status: 1 });

export const Transfer = model('Transfer', transferSchema);
