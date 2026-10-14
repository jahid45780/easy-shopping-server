import { z } from 'zod';
import { isRealDay } from '../analytics/analytics.validation';
import { dhakaToday } from '../analytics/analytics.period';

/**
 * The overview's period: optional Bangladesh calendar days (YYYY-MM-DD), both
 * inclusive. Leave both out for all time; only `from` = from that day until now;
 * only `to` = from the beginning up to that day.
 */

const day = z
    .string({ invalid_type_error: 'Use the YYYY-MM-DD format' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format')
    .refine(isRealDay, 'Not a valid calendar date');

export const overviewQuery = z
    .object({
        from: day.optional(),
        to: day.optional(),
    })
    .superRefine((q, ctx) => {
        if (q.from && q.to && q.from > q.to) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
        }
        if (q.from && q.from > dhakaToday()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'The period cannot start in the future' });
        }
    });

export const overviewValidation = z.object({ query: overviewQuery });
