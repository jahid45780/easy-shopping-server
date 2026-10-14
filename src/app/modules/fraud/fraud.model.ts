import { Schema, model } from 'mongoose';
import { FLAG_STATUSES, MATCH_KINDS } from './fraud.rules';

// ── Fraud flag = an order from a customer who returned an order before ──
// Raised automatically right after checkout (and by "Re-scan open orders"), then
// reviewed by an admin: cleared, or the order is cancelled. Admin-only bookkeeping;
// see fraud.rules.ts for exactly what counts as "returned before" and "same customer".

const previousReturnSchema = new Schema(
    {
        order: { type: Schema.Types.ObjectId, ref: 'Order' },
        orderRef: { type: String, default: '' },
        status: { type: String, default: 'returned' },   // returned | refunded | refused (cancelled after dispatch)
        date: { type: Date, default: null },
        reason: { type: String, default: '' },           // return-request reason, when there was one
    },
    { _id: false }
);

const fraudFlagSchema = new Schema(
    {
        order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
        orderRef: { type: String, default: '' },
        // Who placed it, as it was at checkout (phone is stored normalised: 01XXXXXXXXX).
        customer: {
            name: { type: String, default: '' },
            phone: { type: String, default: '' },
            email: { type: String, default: '' },
            user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        },
        matchedBy: { type: [{ type: String, enum: MATCH_KINDS }], default: [] },
        previousReturns: { type: [previousReturnSchema], default: [] },  // newest first, capped
        returnCount: { type: Number, default: 0 },          // exact, even when the list is capped
        previousOrderCount: { type: Number, default: 0 },   // the customer's other orders
        status: { type: String, enum: FLAG_STATUSES, default: 'review' },
        reviewNote: { type: String, default: '', trim: true },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// One flag per order: this is what makes the checkout hook and the re-scan idempotent.
fraudFlagSchema.index({ order: 1 }, { unique: true });
fraudFlagSchema.index({ status: 1, createdAt: -1 });

export const FraudFlag = model('FraudFlag', fraudFlagSchema);
