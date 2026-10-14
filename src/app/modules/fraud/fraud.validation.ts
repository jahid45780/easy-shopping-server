import { z } from 'zod';

const note = z.string({ invalid_type_error: 'Note must be text' }).trim().max(500, 'Note is too long (max 500 characters)');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Not a valid id');

export const listFlagsValidation = z.object({
    query: z.object({
        status: z.enum(['review', 'cleared', 'cancelled', 'all']).optional(),
        search: z.string().max(80, 'Search is too long').optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
});

export const orderIdValidation = z.object({
    params: z.object({ orderId: objectId }),
});

export const reviewFlagValidation = z.object({
    params: z.object({ id: objectId }),
    body: z
        .object({
            status: z.enum(['cleared', 'review'], {
                errorMap: () => ({ message: 'Status must be "cleared" or "review"' }),
            }),
            note: note.optional(),
        })
        .strict(),
});

export const cancelFlaggedOrderValidation = z.object({
    params: z.object({ id: objectId }),
    body: z.object({ note: note.optional() }).strict(),
});

export const lookupValidation = z.object({
    query: z.object({
        q: z.string({ required_error: 'Enter a phone number or an email' })
            .trim()
            .min(1, 'Enter a phone number or an email')
            .max(100, 'That is too long for a phone number or email'),
    }),
});
