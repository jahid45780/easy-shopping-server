import { Schema, model } from 'mongoose';

// ── Investors: capital put into the business and taken back out ─────
// Admin-only bookkeeping. None of it is income or profit and nothing else in
// the system reads it except the Accounts overview (via InvestorService.totals).
// Money is a plain Number in BDT rounded to 2 decimals. A transaction's `date`
// is a Bangladesh calendar day stored as the UTC instant of 00:00 in Dhaka.

export const INVESTOR_METHODS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card', 'other'] as const;
export type InvestorMethod = (typeof INVESTOR_METHODS)[number];

export const TX_TYPES = ['in', 'out'] as const;
export type TxType = (typeof TX_TYPES)[number];

const investorSchema = new Schema(
    {
        name: { type: String, required: [true, 'Investor name is required'], trim: true, maxlength: 80 },
        // Stored normalised (a Bangladeshi mobile as 01XXXXXXXXX); '' = none.
        phone: { type: String, default: '', trim: true, maxlength: 20 },
        email: { type: String, default: '', trim: true, lowercase: true, maxlength: 120 },
        note: { type: String, default: '', trim: true, maxlength: 500 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

investorSchema.index({ name: 1 });
// Two investors can't share a phone number, but many may have none ('').
investorSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $gt: '' } } });

export const Investor = model('Investor', investorSchema);

/** Money in (capital put in) or money out (capital taken back) for one investor. */
const investorTransactionSchema = new Schema(
    {
        investor: { type: Schema.Types.ObjectId, ref: 'Investor', required: true },
        type: { type: String, enum: TX_TYPES, required: true },
        amount: { type: Number, required: true, min: 0.01 },
        date: { type: Date, required: true },
        method: { type: String, enum: INVESTOR_METHODS, default: 'cash' },
        reference: { type: String, default: '', trim: true, maxlength: 80 },
        note: { type: String, default: '', trim: true, maxlength: 500 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

investorTransactionSchema.index({ investor: 1, date: 1, createdAt: 1 });
investorTransactionSchema.index({ date: 1 });

export const InvestorTransaction = model('InvestorTransaction', investorTransactionSchema);
