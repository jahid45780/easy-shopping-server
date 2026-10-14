import { z } from 'zod';

const money = z.number({ invalid_type_error: 'Must be a number' }).finite().min(0, 'Cannot be negative');
const dateLike = z
    .union([z.string(), z.date()])
    .refine((v) => !Number.isNaN(new Date(v as any).getTime()), 'Not a valid date');
const reference = z.string().trim().max(60, 'Reference is too long');
const note = z.string().trim().max(500, 'Note is too long');

export const listPayoutsValidation = z.object({
    query: z.object({
        from: dateLike.optional(),   // inclusive
        to: dateLike.optional(),     // exclusive
        source: z.enum(['steadfast', 'manual', 'all']).optional(),
        search: z.string().max(80).optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
});

export const manualPayoutValidation = z.object({
    body: z.object({
        receivedAt: dateLike,
        amount: z.number({ required_error: 'Amount received is required', invalid_type_error: 'Amount must be a number' })
            .finite()
            .positive('Amount received must be more than 0'),
        reference: reference.optional(),
        codCollected: money.optional(),
        deliveryBills: money.optional(),
        codFee: money.optional(),
        note: note.optional(),
    }),
});

export const pullPayoutValidation = z.object({
    body: z.object({
        paymentId: z.string()
            .trim()
            .min(1, 'Enter the Steadfast payment id')
            .max(40, 'That payment id is too long')
            .regex(/^[A-Za-z0-9-]+$/, 'A payment id has only letters, digits and dashes, like SFC-31801786'),
        note: note.optional(),
    }),
});

export const updatePayoutValidation = z.object({
    body: z
        .object({
            receivedAt: dateLike.optional(),
            amount: z.number().finite().positive('Amount received must be more than 0').optional(),
            reference: reference.optional(),
            codCollected: money.optional(),
            deliveryBills: money.optional(),
            codFee: money.optional(),
            note: note.optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});
