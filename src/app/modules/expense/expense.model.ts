import { Schema, model } from 'mongoose';

// ── Expenses: what the business spends money on ─────────────────────
// Admin-only bookkeeping (no relation with orders, stock or anything else).
// Money is a plain Number in BDT rounded to 2 decimals, like order.model.ts.
// `date` is a Bangladesh calendar day stored as the UTC instant of 00:00 in
// Dhaka (see analytics.period → dhakaDayStart).

export const PAID_BY = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card', 'other'] as const;
export type PaidBy = (typeof PAID_BY)[number];

/** A head of spending (Marketing, Salary, Rent …). */
const expenseCategorySchema = new Schema(
    {
        name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 40 },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 100 },
    },
    { timestamps: true }
);

// Names are unique regardless of case ("rent" = "Rent").
expenseCategorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const ExpenseCategory = model('ExpenseCategory', expenseCategorySchema);

const expenseSchema = new Schema(
    {
        // Voucher number: seq 12 → "EXP-0012". Assigned on create, never reused.
        seq: { type: Number, required: true },
        voucherNo: { type: String, required: true },
        date: { type: Date, required: true },
        title: { type: String, required: [true, 'What the money was for is required'], trim: true, maxlength: 120 },
        category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
        paidTo: { type: String, default: '', trim: true, maxlength: 120 },
        reference: { type: String, default: '', trim: true, maxlength: 80 },
        paidBy: { type: String, enum: PAID_BY, default: 'cash' },
        amount: { type: Number, required: true, min: 0.01 },
        note: { type: String, default: '', trim: true, maxlength: 500 },
        receiptUrl: { type: String, default: '', trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

expenseSchema.index({ seq: 1 }, { unique: true });
expenseSchema.index({ date: -1, seq: -1 });
expenseSchema.index({ category: 1, date: -1 });

export const Expense = model('Expense', expenseSchema);

/**
 * Hands out voucher numbers ({ _id: 'expense', seq }) so a deleted voucher's number is never reused.
 * Also holds { _id: 'categories-seeded' }: the default categories were seeded once, never again.
 */
const expenseCounterSchema = new Schema(
    {
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 },
    },
    { versionKey: false }
);

export const ExpenseCounter = model('ExpenseCounter', expenseCounterSchema);
