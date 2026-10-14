import { addDays, dhakaDayStart, dhakaToday } from '../analytics/analytics.period';
import type { TransferStatus } from './transfer.model';

/*
 * Pure rules for transfers — no database access, so they can be tested offline.
 */

/* ─── References ─────────────────────────────────────────────────────── */

export const REFERENCE_PREFIX = 'TR';
export const MAX_DAILY_SEQUENCE = 9999;

/** "2026-09-19" → "TR260919". */
export const referencePrefix = (day: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid day "${day}"`);
    return `${REFERENCE_PREFIX}${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}`;
};

/** ("2026-09-19", 3) → "TR2609190003". */
export const formatReference = (day: string, seq: number): string => {
    if (!Number.isInteger(seq) || seq < 1 || seq > MAX_DAILY_SEQUENCE) throw new Error(`Invalid sequence ${seq}`);
    return `${referencePrefix(day)}${String(seq).padStart(4, '0')}`;
};

/** The sequence after the day's highest reference (null = none yet → 1). */
export const nextSequence = (lastReference: string | null | undefined, day: string): number => {
    const prefix = referencePrefix(day);
    if (!lastReference || !lastReference.startsWith(prefix)) return 1;
    const n = Number(lastReference.slice(prefix.length));
    return Number.isInteger(n) && n >= 0 ? n + 1 : 1;
};

/* ─── Status flow ────────────────────────────────────────────────────── */

/**
 * in_transit → received | cancelled.
 * received → in_transit is "Undo receive", for a receive marked by mistake.
 * cancelled is final: record a new transfer instead.
 */
export const TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
    in_transit: ['received', 'cancelled'],
    received: ['in_transit'],
    cancelled: [],
};

export const STATUS_LABEL: Record<TransferStatus, string> = {
    in_transit: 'In transit',
    received: 'Received',
    cancelled: 'Cancelled',
};

export const canTransition = (from: TransferStatus, to: TransferStatus): boolean =>
    (TRANSITIONS[from] || []).includes(to);

/** Why a status change is refused, or null when it is allowed. */
export const transitionError = (from: TransferStatus, to: TransferStatus): string | null => {
    if (from === to) return `This transfer is already ${STATUS_LABEL[to].toLowerCase()}.`;
    if (canTransition(from, to)) return null;
    if (from === 'cancelled') return 'A cancelled transfer is final. Record a new transfer instead.';
    if (from === 'received' && to === 'cancelled') return 'A received transfer can\'t be cancelled. Use "Undo receive" first if it was marked by mistake.';
    return `A transfer can't go from ${STATUS_LABEL[from].toLowerCase()} to ${STATUS_LABEL[to].toLowerCase()}.`;
};

/** Route, date and items can only be changed while the goods are still on the way. */
export const canEditContent = (status: TransferStatus): boolean => status === 'in_transit';

/**
 * Deleting: an in-transit or cancelled transfer can be deleted. A received transfer is
 * the history of goods that really moved, so it is kept; "Undo receive" first if it
 * was recorded by mistake.
 */
export const canDelete = (status: TransferStatus): boolean => status === 'in_transit' || status === 'cancelled';

/* ─── Route ──────────────────────────────────────────────────────────── */

export const sameWarehouse = (from: unknown, to: unknown): boolean =>
    !!from && !!to && String(from) === String(to);

/* ─── Items ──────────────────────────────────────────────────────────── */

export const MAX_ITEMS = 100;
export const MAX_QTY = 1_000_000;

export interface ItemInput {
    product?: string | null;
    name?: string;
    sku?: string;
    unit?: string;
    qty: number;
}

export interface NormalizedItem {
    product: string | null;
    name: string;
    sku: string;
    unit: string;
    qty: number;
}

export const isValidQty = (q: unknown): q is number =>
    typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= MAX_QTY;

/**
 * Clean the lines and merge repeats: the same product twice (or the same free-text
 * name, any case) becomes one line with the quantities added up. Throws a readable
 * message for the first bad line.
 */
export const normalizeItems = (items: ItemInput[]): NormalizedItem[] => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one item');
    const out: NormalizedItem[] = [];
    const index = new Map<string, number>();
    items.forEach((it, i) => {
        const line = `Line ${i + 1}`;
        const product = it.product ? String(it.product) : null;
        const name = String(it.name ?? '').trim().replace(/\s+/g, ' ');
        if (!product && !name) throw new Error(`${line}: choose a product or type an item name`);
        if (!isValidQty(it.qty)) throw new Error(`${line}: quantity must be a whole number from 1 to ${MAX_QTY.toLocaleString('en-IN')}`);
        const key = product ? `p:${product}` : `n:${name.toLowerCase()}`;
        const at = index.get(key);
        if (at !== undefined) {
            out[at].qty += it.qty;
            if (out[at].qty > MAX_QTY) throw new Error(`${line}: the total quantity for "${out[at].name || name}" is too large`);
            return;
        }
        index.set(key, out.length);
        out.push({ product, name, sku: String(it.sku ?? '').trim(), unit: String(it.unit ?? '').trim(), qty: it.qty });
    });
    if (out.length > MAX_ITEMS) throw new Error(`A transfer can have at most ${MAX_ITEMS} lines`);
    return out;
};

export const totalQty = (items: { qty: number }[]): number => items.reduce((n, it) => n + (Number(it.qty) || 0), 0);

/* ─── Dates (Bangladesh calendar days) ───────────────────────────────── */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** The Dhaka calendar day of an instant, YYYY-MM-DD. */
export const dhakaDayOf = (d: Date): string => new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

/**
 * The instant stored for a chosen day: today → right now (keeps same-day entries in
 * order), an earlier day → 00:00 Dhaka that day. The caller has already checked the
 * day is not in the future.
 */
export const dayToInstant = (day: string, now: Date = new Date()): Date =>
    day === dhakaDayOf(now) ? now : dhakaDayStart(day);

/** [start, end) instants for an inclusive Dhaka day range; either side may be open. */
export const dayRange = (from?: string, to?: string): { $gte?: Date; $lt?: Date } | null => {
    const r: { $gte?: Date; $lt?: Date } = {};
    if (from) r.$gte = dhakaDayStart(from);
    if (to) r.$lt = dhakaDayStart(addDays(to, 1));
    return r.$gte || r.$lt ? r : null;
};

export { dhakaToday };
