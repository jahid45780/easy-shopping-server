import { z } from 'zod';

/**
 * Report periods are calendar days in Bangladesh time (Asia/Dhaka, UTC+6, no DST),
 * sent as YYYY-MM-DD. `to` is inclusive: from=2026-09-17&to=2026-09-17 is one day.
 */

export const MAX_RANGE_DAYS = 366;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** true for a real calendar day (rejects 2026-02-30, 2026-13-01 …). */
export const isRealDay = (s: string): boolean => {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2000 && y <= 2100;
};

const day = z
    .string()
    .trim()
    .regex(ISO_DAY, 'Use the YYYY-MM-DD format')
    .refine(isRealDay, 'Not a valid calendar date');

const DAY_MS = 24 * 60 * 60 * 1000;
export const daySpan = (from: string, to: string): number =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/** Optional from/to, with to ≥ from and at most MAX_RANGE_DAYS days. */
export const periodQuery = z
    .object({
        from: day.optional(),
        to: day.optional(),
    })
    .superRefine((q, ctx) => {
        if (q.from && q.to && q.from > q.to) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
            return;
        }
        if (q.from && q.to && daySpan(q.from, q.to) > MAX_RANGE_DAYS) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `A report can cover at most ${MAX_RANGE_DAYS} days` });
        }
    });

const intIn = (min: number, max: number) =>
    z.coerce.number({ invalid_type_error: 'Must be a number' }).int().min(min).max(max);

/** Status buckets shown on the Sales report (the order page's statuses, folded). */
export const STATUS_BUCKETS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned', 'cancelled'] as const;
export type StatusBucket = (typeof STATUS_BUCKETS)[number];

export const salesReportValidation = z.object({ query: periodQuery });

export const salesReportOrdersValidation = z.object({
    query: z
        .object({
            from: day.optional(),
            to: day.optional(),
            status: z.enum(STATUS_BUCKETS).optional(),
            page: intIn(1, 100000).optional(),
            limit: intIn(1, 1000).optional(),
        })
        .superRefine((q, ctx) => {
            if (q.from && q.to && q.from > q.to) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
            } else if (q.from && q.to && daySpan(q.from, q.to) > MAX_RANGE_DAYS) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `A report can cover at most ${MAX_RANGE_DAYS} days` });
            }
        }),
});

/** Staff order activity: same period rules, optionally narrowed to one member/status. */
const ORDER_STATUSES = [
    'pending', 'confirmed', 'processing', 'shipped', 'on_the_way',
    'out_for_delivery', 'delivery_attempt', 'delivered', 'cancelled', 'returned', 'refunded',
] as const;

const periodRange = (q: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
    if (q.from && q.to && q.from > q.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: '"to" must be on or after "from"' });
    } else if (q.from && q.to && daySpan(q.from, q.to) > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `A report can cover at most ${MAX_RANGE_DAYS} days` });
    }
};

export const staffActivityValidation = z.object({
    query: z.object({ from: day.optional(), to: day.optional() }).superRefine(periodRange),
});

export const staffHistoryValidation = z.object({
    query: z
        .object({
            from: day.optional(),
            to: day.optional(),
            actor: z.string().trim().regex(/^[a-f\d]{24}$/i, 'Not a valid staff id').optional(),
            status: z.enum(ORDER_STATUSES).optional(),
            page: intIn(1, 100000).optional(),
            limit: intIn(1, 100).optional(),
        })
        .superRefine(periodRange),
});

export const lowStockValidation = z.object({
    query: z.object({ threshold: intIn(0, 100000).optional() }),
});

export const limitValidation = z.object({
    query: z.object({ limit: intIn(1, 100).optional() }),
});

/** Legacy /analytics/revenue params — any date string Date can parse. */
const looseDate = z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Not a valid date');
export const revenueValidation = z.object({
    query: z.object({ startDate: looseDate.optional(), endDate: looseDate.optional() }),
});
