import { Types } from 'mongoose';
import { addDays, dhakaDayStart } from '../analytics/analytics.period';

/*
 * Pure helpers for expenses (and investors, which reuse the money and day helpers).
 * No database access here, so they can be tested offline.
 */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Round money to 2 decimals (1.005 → 1.01, not 1.00). */
export const round2 = (n: unknown): number => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
};

/** A stored instant (00:00 Dhaka) → its Dhaka calendar day, YYYY-MM-DD. */
export const toDhakaDay = (d: Date | string | null | undefined): string | null => {
    if (!d) return null;
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) return null;
    return new Date(t + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
};

/** Inclusive Dhaka days → a Mongo range on a stored date. null when neither is given. */
export const dayRange = (from?: string, to?: string): { $gte?: Date; $lt?: Date } | null => {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (from) range.$gte = dhakaDayStart(from);
    if (to) range.$lt = dhakaDayStart(addDays(to, 1));
    return range.$gte || range.$lt ? range : null;
};

/** seq 12 → "EXP-0012" */
export const voucherNo = (seq: number): string => `EXP-${String(seq).padStart(4, '0')}`;

export const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "  office   supplies " → "Office supplies" (the rest of the casing is kept as typed). */
export const cleanCategoryName = (s: string): string => {
    const t = String(s ?? '').trim().replace(/\s+/g, ' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

export interface ExpenseFilters {
    search?: string;
    category?: string;
    paidBy?: string;
    from?: string;
    to?: string;
}

/** The Mongo match for the list, summary and export filters. */
export const buildExpenseMatch = (f: ExpenseFilters, opts: { withDates?: boolean } = {}): Record<string, any> => {
    const match: Record<string, any> = {};
    if (f.category && Types.ObjectId.isValid(f.category)) match.category = new Types.ObjectId(f.category);
    if (f.paidBy) match.paidBy = f.paidBy;
    if (opts.withDates !== false) {
        const range = dayRange(f.from, f.to);
        if (range) match.date = range;
    }
    const q = String(f.search ?? '').trim();
    if (q) {
        const rx = new RegExp(escapeRx(q), 'i');
        match.$or = [{ title: rx }, { paidTo: rx }, { reference: rx }, { voucherNo: rx }, { note: rx }];
    }
    return match;
};

export const EXPENSE_SORTS: Record<string, Record<string, 1 | -1>> = {
    date_desc: { date: -1, seq: -1 },
    date_asc: { date: 1, seq: 1 },
    amount_desc: { amount: -1, date: -1, seq: -1 },
    amount_asc: { amount: 1, date: -1, seq: -1 },
    recent: { createdAt: -1, _id: -1 },
};

/** The `n` month keys (YYYY-MM) ending with the month of `endDay`, oldest first. */
export const monthKeys = (endDay: string, n = 12): string[] => {
    let [y, m] = endDay.split('-').map(Number);
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
        keys.unshift(`${y}-${String(m).padStart(2, '0')}`);
        m -= 1;
        if (m < 1) { m = 12; y -= 1; }
    }
    return keys;
};

/** First day of the month after a YYYY-MM key, YYYY-MM-DD. */
export const nextMonthStart = (key: string): string => {
    let [y, m] = key.split('-').map(Number);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, '0')}-01`;
};
