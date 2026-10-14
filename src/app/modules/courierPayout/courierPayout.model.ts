import { Schema, model } from 'mongoose';

// ── Courier payout = money the courier (Steadfast) sent us ───────────
// Customers pay cash at the door; Steadfast collects it, deducts its delivery
// bills and COD fee, and pays the rest out in "payments" (statements). Each row
// here is one of those payments, pulled from their API or typed in by hand.
// Money is a plain Number in BDT, like order.model.ts.

export const PAYOUT_SOURCES = ['steadfast', 'manual'] as const;
export type PayoutSource = (typeof PAYOUT_SOURCES)[number];

const courierPayoutSchema = new Schema(
    {
        receivedAt: { type: Date, required: true },
        source: { type: String, enum: PAYOUT_SOURCES, default: 'manual' },
        // Steadfast payment id ("SFC-31801786") or a bank / transfer reference.
        // Unique when present (see the partial index below); '' = none.
        reference: { type: String, default: '', trim: true },
        codCollected: { type: Number, default: 0 },   // cash Steadfast collected from customers
        deliveryBills: { type: Number, default: 0 },  // delivery charges Steadfast deducted
        codFee: { type: Number, default: 0 },         // Steadfast's cash-handling fee
        // What actually reached us. For Steadfast statements it is always
        // codCollected − deliveryBills − codFee; manual entries type it in.
        amount: { type: Number, required: true },
        parcelCount: { type: Number, default: 0 },    // parcels on the statement (0 = unknown / manual)
        note: { type: String, default: '', trim: true },
        raw: { type: Schema.Types.Mixed, default: null }, // the statement exactly as Steadfast returned it
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

courierPayoutSchema.index({ receivedAt: -1 });
// A reference can appear only once, but many rows may have none ('').
courierPayoutSchema.index(
    { reference: 1 },
    { unique: true, partialFilterExpression: { reference: { $gt: '' } } }
);

export const CourierPayout = model('CourierPayout', courierPayoutSchema);
