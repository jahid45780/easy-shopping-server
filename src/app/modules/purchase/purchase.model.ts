import { Schema, model } from 'mongoose';

// ════════════════════════════════════════════════════════════════════════
//  PURCHASE = an order we place with a supplier (a "PO")
//  Admin-only bookkeeping. Item prices are in the purchase currency (BDT, RMB or
//  USD) and converted with `exchangeRate` (BDT per 1 unit). Everything else —
//  extra costs, payments, totals — is BDT, a plain Number rounded to 2 decimals.
//  Totals are always recomputed on the server (purchase.utils → computeTotals).
//
//  Goods arrive in one or more receipts, each into a warehouse. A receipt can add
//  the goods to product stock through the Inventory module at their landed cost.
// ════════════════════════════════════════════════════════════════════════

export const PURCHASE_STATUSES = ['draft', 'confirmed', 'partially_received', 'received', 'cancelled'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Statuses whose money counts: placed orders that were not cancelled (drafts are not placed yet). */
export const MONEY_STATUSES: PurchaseStatus[] = ['confirmed', 'partially_received', 'received'];

export const SHIPPING_MODES = ['air', 'sea', 'road', 'local', ''] as const;
export const CURRENCIES = ['BDT', 'RMB', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PAYMENT_METHODS = ['cash', 'bank', 'bkash', 'nagad', 'other'] as const;

const ObjectId = Schema.Types.ObjectId;

const itemSchema = new Schema(
    {
        product: { type: ObjectId, ref: 'Product', default: null },   // null = free-text item, not in the catalogue
        variantId: { type: ObjectId, default: null },                  // ordered for one variant (else chosen when receiving)
        variantLabel: { type: String, default: '' },
        name: { type: String, required: true, trim: true, maxlength: 200 }, // snapshot, survives product renames
        sku: { type: String, trim: true, default: '', maxlength: 60 },
        unit: { type: String, trim: true, default: '' },               // snapshot of product.unit ('piece', 'kg' …)
        qty: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, required: true, min: 0 },            // in the purchase currency
        receivedQty: { type: Number, default: 0, min: 0 },
    },
    { _id: true }
);

const paymentSchema = new Schema(
    {
        amount: { type: Number, required: true, min: 0.01 },           // BDT
        date: { type: Date, required: true },                          // 00:00 Dhaka of the payment day
        method: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
        reference: { type: String, trim: true, default: '', maxlength: 80 },
        note: { type: String, trim: true, default: '', maxlength: 300 },
        createdBy: { type: ObjectId, ref: 'User', default: null },
    },
    { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const receiptLineSchema = new Schema(
    {
        itemId: { type: ObjectId, required: true },                    // items[]._id
        qty: { type: Number, required: true, min: 1 },
        variantId: { type: ObjectId, default: null },
        variantLabel: { type: String, default: '' },
        unitCost: { type: Number, default: 0 },                        // landed BDT per unit at the time of receipt
        stocked: { type: Boolean, default: false },                    // added to product stock
        stockNote: { type: String, default: '' },                      // why it was not, when it was not
    },
    { _id: false }
);

const receiptSchema = new Schema(
    {
        date: { type: Date, required: true },                          // 00:00 Dhaka of the receiving day
        warehouse: { type: ObjectId, ref: 'Warehouse', default: null },
        lines: { type: [receiptLineSchema], default: [] },
        addedToStock: { type: Boolean, default: false },
        note: { type: String, trim: true, default: '', maxlength: 300 },
        createdBy: { type: ObjectId, ref: 'User', default: null },
    },
    { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const purchaseSchema = new Schema(
    {
        reference: { type: String, required: true, trim: true },       // PO + YYMMDD (Dhaka) + 5-digit daily sequence
        supplier: { type: ObjectId, ref: 'Supplier', required: true },
        supplierInvoice: { type: String, trim: true, default: '', maxlength: 80 },
        status: { type: String, enum: PURCHASE_STATUSES, default: 'draft' },
        shippingMode: { type: String, enum: SHIPPING_MODES, default: '' },
        orderDate: { type: Date, required: true },                     // 00:00 Dhaka
        eta: { type: Date, default: null },                            // 00:00 Dhaka

        currency: { type: String, enum: CURRENCIES, default: 'BDT' },
        exchangeRate: { type: Number, default: 1, min: 0 },            // BDT per 1 unit of `currency`

        items: { type: [itemSchema], default: [] },

        // Extra costs, BDT
        shippingCost: { type: Number, default: 0, min: 0 },
        customsDuty: { type: Number, default: 0, min: 0 },
        otherCost: { type: Number, default: 0, min: 0 },
        otherCostLabel: { type: String, trim: true, default: '', maxlength: 60 },
        discount: { type: Number, default: 0, min: 0 },

        // Computed on every save (purchase.utils → computeTotals)
        subtotal: { type: Number, default: 0 },                        // purchase currency
        subtotalBdt: { type: Number, default: 0 },
        grandTotal: { type: Number, default: 0 },                      // subtotalBdt + extras − discount
        paid: { type: Number, default: 0 },
        due: { type: Number, default: 0 },                             // 0 once cancelled

        payments: { type: [paymentSchema], default: [] },
        receipts: { type: [receiptSchema], default: [] },

        note: { type: String, trim: true, default: '', maxlength: 1000 },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, trim: true, default: '', maxlength: 300 },
        createdBy: { type: ObjectId, ref: 'User', default: null },
    },
    // Every save checks the version it read, so two admins receiving or paying at the
    // same moment can never over-receive or over-pay (purchase.service → mutatePurchase).
    { timestamps: true, optimisticConcurrency: true }
);

purchaseSchema.index({ reference: 1 }, { unique: true });
purchaseSchema.index({ createdAt: -1 });
purchaseSchema.index({ orderDate: -1 });
purchaseSchema.index({ supplier: 1, orderDate: -1 });
purchaseSchema.index({ status: 1, orderDate: -1 });

export const Purchase = model('Purchase', purchaseSchema);

// ── Reference counter: one document per day, { _id: 'PO260830', seq } ──────
const purchaseCounterSchema = new Schema(
    {
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 },
    },
    { versionKey: false }
);

export const PurchaseCounter = model('PurchaseCounter', purchaseCounterSchema);
