import { z } from 'zod';
import { isRealDay } from '../analytics/analytics.validation';
import { dhakaToday } from '../analytics/analytics.period';
import { PAID_BY } from './expense.model';

/**
 * Dates are Bangladesh calendar days sent as YYYY-MM-DD. In list filters
 * both `from` and `to` are inclusive.
 */

export const MAX_AMOUNT = 10_000_000_000; // ৳1,000 crore — anything above is a typo

export const day = z
    .string({ invalid_type_error: 'Use the YYYY-MM-DD format' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format')
    .refine(isRealDay, 'Not a valid calendar date');

/** A day that is not after today in Dhaka (money already spent). */
const pastDay = day.refine((d) => d <= dhakaToday(), 'The date cannot be in the future');

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Not a valid id');

export const money = z
    .number({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a number' })
    .finite('Amount must be a number')
    .positive('Amount must be more than 0')
    .max(MAX_AMOUNT, 'That amount is too large');

const receiptUrl = z
    .string()
    .trim()
    .max(500, 'Receipt link is too long')
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Receipt must be an uploaded file link');

const text = (max: number, label: string) => z.string().trim().max(max, `${label} is too long (max ${max})`);

export const SORTS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'recent'] as const;

/** The filters shared by the list, summary and export. */
const filterShape = {
    search: z.string().max(80, 'Search is too long').optional(),
    category: objectId.optional(),
    paidBy: z.enum(PAID_BY).optional(),
    from: day.optional(),
    to: day.optional(),
};
const checkRange = (q: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
    if (q.from && q.to && q.from > q.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
    }
};

export const listExpensesValidation = z.object({
    query: z
        .object({
            ...filterShape,
            sort: z.enum(SORTS).optional(),
            page: z.string().regex(/^\d+$/, 'page must be a whole number').optional(),
            limit: z.string().regex(/^\d+$/, 'limit must be a whole number').optional(),
        })
        .superRefine(checkRange),
});

export const summaryExpensesValidation = z.object({
    query: z.object(filterShape).superRefine(checkRange),
});

export const exportExpensesValidation = z.object({
    query: z.object({ ...filterShape, sort: z.enum(SORTS).optional() }).superRefine(checkRange),
});

const expenseBody = {
    date: pastDay,
    title: z.string({ required_error: 'Say what the money was for' }).trim().min(1, 'Say what the money was for').max(120, 'Keep "What for" under 120 characters'),
    category: objectId,
    paidTo: text(120, 'Paid to'),
    reference: text(80, 'Reference'),
    paidBy: z.enum(PAID_BY, { errorMap: () => ({ message: 'Pick how it was paid' }) }),
    amount: money,
    note: text(500, 'Note'),
    receiptUrl,
};

export const createExpenseValidation = z.object({
    body: z
        .object({
            date: expenseBody.date,
            title: expenseBody.title,
            category: z.string({ required_error: 'Pick a category' }).trim().regex(/^[a-f\d]{24}$/i, 'Pick a category'),
            amount: expenseBody.amount,
            paidTo: expenseBody.paidTo.optional(),
            reference: expenseBody.reference.optional(),
            paidBy: expenseBody.paidBy.optional(),
            note: expenseBody.note.optional(),
            receiptUrl: expenseBody.receiptUrl.optional(),
        })
        .strict(),
});

export const updateExpenseValidation = z.object({
    body: z
        .object({
            date: expenseBody.date.optional(),
            title: expenseBody.title.optional(),
            category: expenseBody.category.optional(),
            amount: expenseBody.amount.optional(),
            paidTo: expenseBody.paidTo.optional(),
            reference: expenseBody.reference.optional(),
            paidBy: expenseBody.paidBy.optional(),
            note: expenseBody.note.optional(),
            receiptUrl: expenseBody.receiptUrl.optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});

const categoryName = z
    .string({ required_error: 'Category name is required' })
    .trim()
    .min(1, 'Category name is required')
    .max(40, 'Keep the name under 40 characters');

export const createCategoryValidation = z.object({
    body: z
        .object({
            name: categoryName,
            isActive: z.boolean().optional(),
            sortOrder: z.number().int().min(0).max(10000).optional(),
        })
        .strict(),
});

export const updateCategoryValidation = z.object({
    body: z
        .object({
            name: categoryName.optional(),
            isActive: z.boolean().optional(),
            sortOrder: z.number().int().min(0).max(10000).optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});

export const idParamValidation = z.object({ params: z.object({ id: objectId }) });
