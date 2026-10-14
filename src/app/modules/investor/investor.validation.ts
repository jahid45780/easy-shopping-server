import { z } from 'zod';
import { day, money } from '../expense/expense.validation';
import { dhakaToday } from '../analytics/analytics.period';
import { INVESTOR_METHODS, TX_TYPES } from './investor.model';
import { isValidPhone } from './investor.utils';

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Not a valid id');
const pastDay = day.refine((d) => d <= dhakaToday(), 'The date cannot be in the future');
const text = (max: number, label: string) => z.string().trim().max(max, `${label} is too long (max ${max})`);

const name = z
    .string({ required_error: 'Investor name is required' })
    .trim()
    .min(1, 'Investor name is required')
    .max(80, 'Keep the name under 80 characters');
const phone = z
    .string()
    .trim()
    .max(20, 'That phone number is too long')
    .refine(isValidPhone, 'Enter a valid phone number, like 01712345678');
const email = z
    .string()
    .trim()
    .max(120, 'That email is too long')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address');
const method = z.enum(INVESTOR_METHODS, { errorMap: () => ({ message: 'Pick how the money moved' }) });

const txFields = {
    amount: money,
    date: pastDay,
    method: method.optional(),
    reference: text(80, 'Reference').optional(),
    note: text(500, 'Note').optional(),
};

export const listInvestorsValidation = z.object({
    query: z
        .object({
            search: z.string().max(80, 'Search is too long').optional(),
            status: z.enum(['all', 'active', 'inactive']).optional(),
            from: day.optional(),
            to: day.optional(),
        })
        .superRefine((q, ctx) => {
            if (q.from && q.to && q.from > q.to) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
            }
        }),
});

export const summaryInvestorsValidation = z.object({
    query: z
        .object({ from: day.optional(), to: day.optional() })
        .superRefine((q, ctx) => {
            if (q.from && q.to && q.from > q.to) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
            }
        }),
});

export const createInvestorValidation = z.object({
    body: z
        .object({
            name,
            phone: phone.optional(),
            email: email.optional(),
            note: text(500, 'Note').optional(),
            isActive: z.boolean().optional(),
            // Optional first money-in, recorded together with the investor.
            initialInvestment: z.object(txFields).strict().optional(),
        })
        .strict(),
});

export const updateInvestorValidation = z.object({
    body: z
        .object({
            name: name.optional(),
            phone: phone.optional(),
            email: email.optional(),
            note: text(500, 'Note').optional(),
            isActive: z.boolean().optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});

export const createTransactionValidation = z.object({
    body: z
        .object({
            type: z.enum(TX_TYPES, { errorMap: () => ({ message: 'Choose money in or money out' }) }),
            ...txFields,
        })
        .strict(),
});

export const updateTransactionValidation = z.object({
    body: z
        .object({
            type: z.enum(TX_TYPES, { errorMap: () => ({ message: 'Choose money in or money out' }) }).optional(),
            amount: money.optional(),
            date: pastDay.optional(),
            method: method.optional(),
            reference: text(80, 'Reference').optional(),
            note: text(500, 'Note').optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});

export const idParamValidation = z.object({ params: z.object({ id: objectId }) });
export const txParamValidation = z.object({ params: z.object({ id: objectId, txId: objectId }) });
