import AppError from '../../utils/AppError';
import { MAX_RANGE_DAYS, daySpan, isRealDay } from './analytics.validation';

/**
 * Report periods are whole days in Bangladesh time. Dhaka is UTC+6 all year
 * (no daylight saving), so a fixed offset is exact.
 */
export const REPORT_TZ = 'Asia/Dhaka';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Granularity = 'hour' | 'day' | 'month';

export interface Period {
    /** YYYY-MM-DD, inclusive, Dhaka calendar */
    from: string;
    to: string;
    days: number;
    /** UTC instant of `from` 00:00 Dhaka */
    start: Date;
    /** UTC instant of the day after `to`, 00:00 Dhaka (exclusive) */
    end: Date;
    /** The same-length window right before this one, for comparisons */
    previous: { from: string; to: string; start: Date; end: Date };
    /** Bucket size for the trend chart */
    granularity: Granularity;
}

/** Today's date in Dhaka, YYYY-MM-DD. */
export const dhakaToday = (): string => new Date(Date.now() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

export const addDays = (day: string, n: number): string =>
    new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** UTC instant of 00:00 Dhaka on the given day. */
export const dhakaDayStart = (day: string): Date => new Date(Date.parse(`${day}T00:00:00Z`) - DHAKA_OFFSET_MS);

/**
 * Turn optional from/to into a concrete period. Missing both → today. Only one
 * given → that single day. Dates are re-checked here so the service is safe to
 * call without the route validator.
 */
export const resolvePeriod = (fromRaw?: unknown, toRaw?: unknown): Period => {
    const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const f = clean(fromRaw);
    const t = clean(toRaw);
    for (const d of [f, t]) {
        if (d !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isRealDay(d))) {
            throw new AppError(400, `Invalid date "${d}" — use YYYY-MM-DD`);
        }
    }
    const from = f || t || dhakaToday();
    const to = t || f || from;
    if (from > to) throw new AppError(400, '"to" must be on or after "from"');
    const days = daySpan(from, to);
    if (days > MAX_RANGE_DAYS) throw new AppError(400, `A report can cover at most ${MAX_RANGE_DAYS} days`);

    const prevTo = addDays(from, -1);
    const prevFrom = addDays(from, -days);
    return {
        from,
        to,
        days,
        start: dhakaDayStart(from),
        end: dhakaDayStart(addDays(to, 1)),
        previous: { from: prevFrom, to: prevTo, start: dhakaDayStart(prevFrom), end: dhakaDayStart(from) },
        granularity: days === 1 ? 'hour' : days <= 62 ? 'day' : 'month',
    };
};

/** Every bucket key the trend chart should show, so empty hours/days still appear. */
export const bucketKeys = (p: Period): string[] => {
    if (p.granularity === 'hour') return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
    if (p.granularity === 'day') return Array.from({ length: p.days }, (_, i) => addDays(p.from, i));
    const keys: string[] = [];
    let [y, m] = p.from.split('-').map(Number);
    const [ty, tm] = p.to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
        keys.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return keys;
};

/** $dateToString format matching bucketKeys(). */
export const bucketFormat = (g: Granularity): string => (g === 'hour' ? '%H' : g === 'day' ? '%Y-%m-%d' : '%Y-%m');
