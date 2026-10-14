import { round2, toDhakaDay } from '../expense/expense.utils';

/*
 * Pure ledger maths for investors. No database access, so it can be tested offline.
 *
 * Ledger order: by day, money in before money out on the same day (money that came
 * in and went out on one day is fine), then by when it was recorded.
 * Rule: an investor's running balance may never drop below zero at any point.
 */

export interface LedgerTx {
    _id?: unknown;
    type: 'in' | 'out';
    amount: number;
    date: Date | string;
    createdAt?: Date | string;
}

const time = (d: Date | string | undefined) => (d ? new Date(d).getTime() : 0);

export const ledgerCompare = (a: LedgerTx, b: LedgerTx): number =>
    time(a.date) - time(b.date)
    || (a.type === b.type ? 0 : a.type === 'in' ? -1 : 1)
    || time(a.createdAt) - time(b.createdAt)
    || String(a._id ?? '').localeCompare(String(b._id ?? ''));

/** Transactions in ledger order with the running balance after each one. */
export function runLedger<T extends LedgerTx>(txs: T[]) {
    let balance = 0;
    let moneyIn = 0;
    let moneyOut = 0;
    let firstNegative: (T & { balance: number }) | null = null;
    const rows = [...txs].sort(ledgerCompare).map((t) => {
        const amount = round2(t.amount);
        if (t.type === 'in') moneyIn = round2(moneyIn + amount);
        else moneyOut = round2(moneyOut + amount);
        balance = round2(balance + (t.type === 'in' ? amount : -amount));
        const row = { ...t, amount, balance };
        if (balance < 0 && !firstNegative) firstNegative = row;
        return row;
    });
    return { rows, moneyIn, moneyOut, balance, firstNegative: firstNegative as (T & { balance: number }) | null };
}

/**
 * One investor's figures for a period ([start, end) instants; either may be open).
 * moneyIn / moneyOut count only the period; balance is as at the end of the period;
 * opening is the balance before it starts.
 */
export function periodFigures(txs: LedgerTx[], range: { start?: Date; end?: Date } = {}) {
    const start = range.start?.getTime();
    const end = range.end?.getTime();
    let moneyIn = 0;
    let moneyOut = 0;
    let opening = 0;
    let count = 0;
    for (const t of txs) {
        const at = time(t.date);
        if (end !== undefined && at >= end) continue;
        const amount = round2(t.amount);
        const signed = t.type === 'in' ? amount : -amount;
        if (start !== undefined && at < start) { opening = round2(opening + signed); continue; }
        if (t.type === 'in') moneyIn = round2(moneyIn + amount);
        else moneyOut = round2(moneyOut + amount);
        count += 1;
    }
    return { moneyIn, moneyOut, net: round2(moneyIn - moneyOut), opening, balance: round2(opening + moneyIn - moneyOut), count };
}

/** ৳1,10,000 / −৳0.01 */
export const takaText = (n: number) => {
    const v = Number(n || 0);
    return `${v < 0 ? '−' : ''}৳${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

export const dayText = (d: Date | string) => {
    const day = toDhakaDay(d);
    if (!day) return '';
    return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Why a change was refused: it would take the balance below zero on some day. */
export const negativeBalanceMessage = (name: string, row: { date: Date | string; balance: number }) =>
    `That would take ${name}'s balance below zero on ${dayText(row.date)} (it would be ${takaText(row.balance)}). `
    + 'Money taken out can never be more than what they have put in up to that day.';

/** "+880 1712-345 678" / "8801712345678" / "01712345678" → "01712345678"; other numbers keep their digits (and a leading +). */
export const normalizePhone = (raw: unknown): string => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    const plus = s.startsWith('+');
    const digits = s.replace(/\D/g, '');
    const bd = digits.match(/^(?:88)?(01[3-9]\d{8})$/);
    if (bd) return bd[1];
    return (plus ? '+' : '') + digits;
};

/** A phone we accept: a Bangladeshi mobile, or any 6–15 digit number (with an optional +). */
export const isValidPhone = (raw: unknown): boolean => {
    const p = normalizePhone(raw);
    if (!p) return true;
    return /^01[3-9]\d{8}$/.test(p) || /^\+?\d{6,15}$/.test(p);
};
