import { Types } from 'mongoose';
import { Transfer, TransferStatus } from './transfer.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { Product } from '../product/product.model';
import AppError from '../../utils/AppError';
import {
    MAX_DAILY_SEQUENCE,
    canDelete,
    canEditContent,
    dayRange,
    dayToInstant,
    dhakaDayOf,
    dhakaToday,
    formatReference,
    nextSequence,
    normalizeItems,
    referencePrefix,
    sameWarehouse,
    totalQty,
    transitionError,
    type ItemInput,
} from './transfer.rules';

/*
 * Transfers are records only: nothing here touches product.stock or the Inventory
 * ledger. Stock stays one total per product.
 */

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const oid = (id: string) => new Types.ObjectId(id);

const WAREHOUSE_FIELDS = 'name location isActive';

/* ─── Reference numbers ──────────────────────────────────────────────── */

async function nextReference(day: string): Promise<string> {
    const prefix = referencePrefix(day);
    const last: any = await Transfer.findOne({ reference: { $regex: `^${prefix}` } })
        .sort({ reference: -1 })
        .select('reference')
        .lean();
    const seq = nextSequence(last?.reference, day);
    if (seq > MAX_DAILY_SEQUENCE) throw new AppError(409, 'Too many transfers recorded today. Try again tomorrow.');
    return formatReference(day, seq);
}

const isDuplicateReference = (e: any) => e?.code === 11000 && (e?.keyPattern?.reference || /reference/.test(String(e?.message)));

/* ─── Checks ─────────────────────────────────────────────────────────── */

/** A day chosen on the form: a real day, not in the future (Dhaka). */
function assertNotFuture(day: string, what: string) {
    if (day > dhakaToday()) throw new AppError(400, `${what} can't be in the future`);
}

/**
 * Load the route's warehouses. `mustBeActive` lists the ids that are newly chosen:
 * those must be active (an existing transfer keeps a warehouse deactivated later).
 */
async function loadRoute(from: string, to: string, mustBeActive: string[]) {
    if (sameWarehouse(from, to)) throw new AppError(400, 'From and To must be different warehouses');
    const found: any[] = await Warehouse.find({ _id: { $in: [from, to] } }).select(WAREHOUSE_FIELDS).lean();
    const byId = new Map(found.map((w) => [String(w._id), w]));
    for (const [id, side] of [[from, 'From'], [to, 'To']] as const) {
        const w = byId.get(String(id));
        if (!w) throw new AppError(404, `The ${side} warehouse no longer exists`);
        if (!w.isActive && mustBeActive.includes(String(id))) {
            throw new AppError(400, `"${w.name}" is inactive. Activate it on the Warehouses page first.`);
        }
    }
}

/** Clean the lines, then take name/SKU/unit snapshots from the catalogue for product lines. */
async function buildItems(input: ItemInput[]) {
    let items;
    try {
        items = normalizeItems(input);
    } catch (e: any) {
        throw new AppError(400, e?.message || 'Invalid items');
    }
    const ids = [...new Set(items.filter((i) => i.product).map((i) => i.product as string))];
    if (ids.length) {
        const products: any[] = await Product.find({ _id: { $in: ids } }).select('name sku unit').lean();
        const byId = new Map(products.map((p) => [String(p._id), p]));
        for (const it of items) {
            if (!it.product) continue;
            const p = byId.get(it.product);
            if (!p) throw new AppError(400, `"${it.name || 'A product'}" is no longer in the catalogue. Remove the line or add it as a free-text item.`);
            it.name = p.name;
            it.sku = p.sku || '';
            it.unit = p.unit || 'piece';
        }
    }
    return items.map((it) => ({ ...it, product: it.product ? oid(it.product) : null }));
}

function populated(q: any) {
    return q
        .populate('from', WAREHOUSE_FIELDS)
        .populate('to', WAREHOUSE_FIELDS)
        .populate('createdBy', 'firstName lastName');
}

/* ─── Service ────────────────────────────────────────────────────────── */

interface ListQuery {
    search?: string;
    warehouse?: string;
    direction?: 'any' | 'out' | 'in';
    fromWarehouse?: string;
    toWarehouse?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string | number;
    limit?: string | number;
}

const TransferService = {
    async list(q: ListQuery) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));

        // Everything except status scopes the summary; status only narrows the table,
        // so the status tiles always show their own counts.
        const scope: Record<string, any> = {};
        const and: Record<string, any>[] = [];
        if (q.warehouse) {
            const w = oid(q.warehouse);
            if (q.direction === 'out') scope.from = w;
            else if (q.direction === 'in') scope.to = w;
            else and.push({ $or: [{ from: w }, { to: w }] });
        }
        if (q.fromWarehouse) scope.from = oid(q.fromWarehouse);
        if (q.toWarehouse) scope.to = oid(q.toWarehouse);
        const range = dayRange(q.dateFrom, q.dateTo);
        if (range) scope.transferredAt = range;
        if (q.search?.trim()) {
            const rx = new RegExp(escapeRx(q.search.trim()), 'i');
            and.push({ $or: [{ reference: rx }, { 'items.name': rx }, { 'items.sku': rx }, { note: rx }] });
        }
        if (and.length) scope.$and = and;

        const rowMatch: Record<string, any> = { ...scope };
        if (q.status && q.status !== 'all') rowMatch.status = q.status;

        const [rows, total, byStatus] = await Promise.all([
            populated(
                Transfer.find(rowMatch)
                    .sort({ transferredAt: -1, createdAt: -1, _id: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
            ).lean(),
            Transfer.countDocuments(rowMatch),
            Transfer.aggregate([
                { $match: scope },
                { $group: { _id: '$status', count: { $sum: 1 }, units: { $sum: { $ifNull: ['$totalQty', 0] } } } },
            ]),
        ]);

        const pick = (s: TransferStatus) => byStatus.find((b: any) => b._id === s) || { count: 0, units: 0 };
        const inTransit = pick('in_transit');
        const received = pick('received');
        const cancelled = pick('cancelled');
        const summary = {
            total: inTransit.count + received.count + cancelled.count,
            inTransit: inTransit.count,
            received: received.count,
            cancelled: cancelled.count,
            // Units that moved or are moving — cancelled transfers don't count.
            units: inTransit.units + received.units,
            unitsInTransit: inTransit.units,
            unitsReceived: received.units,
        };

        return {
            data: { transfers: rows, summary },
            meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    },

    async getOne(id: string) {
        const t: any = await populated(Transfer.findById(id))
            .populate('items.product', 'name sku unit thumbnail slug status')
            .lean();
        if (!t) throw new AppError(404, 'Transfer not found');
        return t;
    },

    async create(payload: { from: string; to: string; items: ItemInput[]; transferredAt?: string; note?: string }, userId?: string) {
        await loadRoute(payload.from, payload.to, [payload.from, payload.to]);
        const items = await buildItems(payload.items);

        const today = dhakaToday();
        const day = payload.transferredAt || today;
        assertNotFuture(day, 'The transfer date');
        const transferredAt = dayToInstant(day);

        // The unique index on reference makes two simultaneous saves safe: the loser
        // gets a duplicate-key error and simply takes the next number.
        for (let attempt = 0; attempt < 6; attempt++) {
            const reference = await nextReference(today);
            try {
                const doc = await Transfer.create({
                    reference,
                    from: payload.from,
                    to: payload.to,
                    items,
                    totalQty: totalQty(items),
                    status: 'in_transit',
                    transferredAt,
                    note: payload.note || '',
                    createdBy: userId || null,
                });
                return this.getOne(String(doc._id));
            } catch (e) {
                if (isDuplicateReference(e)) continue;
                throw e;
            }
        }
        throw new AppError(409, 'Could not assign a reference number right now. Please try again.');
    },

    async update(
        id: string,
        payload: {
            status?: TransferStatus;
            receivedAt?: string;
            note?: string;
            from?: string;
            to?: string;
            items?: ItemInput[];
            transferredAt?: string;
        },
    ) {
        const t: any = await Transfer.findById(id);
        if (!t) throw new AppError(404, 'Transfer not found');
        const current: TransferStatus = t.status;

        /* Content — route, date, items — only while in transit. */
        const touchesContent = payload.from !== undefined || payload.to !== undefined || payload.items !== undefined || payload.transferredAt !== undefined;
        if (touchesContent) {
            if (!canEditContent(current)) {
                throw new AppError(409, current === 'received'
                    ? 'The goods have been received, so only the note can change. Use "Undo receive" first to edit it.'
                    : 'A cancelled transfer can\'t be edited.');
            }
            if (payload.from !== undefined || payload.to !== undefined) {
                const from = payload.from ?? String(t.from);
                const to = payload.to ?? String(t.to);
                const changed = [from, to].filter((w, i) => w !== String(i === 0 ? t.from : t.to));
                await loadRoute(from, to, changed);
                t.from = from;
                t.to = to;
            }
            if (payload.items !== undefined) {
                const items = await buildItems(payload.items);
                t.items = items;
                t.totalQty = totalQty(items);
            }
            if (payload.transferredAt !== undefined) {
                assertNotFuture(payload.transferredAt, 'The transfer date');
                // Keep the original time when the day did not change.
                if (payload.transferredAt !== dhakaDayOf(t.transferredAt)) t.transferredAt = dayToInstant(payload.transferredAt);
            }
        }

        /* Status */
        if (payload.status !== undefined) {
            const err = transitionError(current, payload.status);
            if (err) throw new AppError(409, err);
            if (payload.status === 'received') {
                const day = payload.receivedAt || dhakaToday();
                assertNotFuture(day, 'The received date');
                if (day < dhakaDayOf(t.transferredAt)) throw new AppError(400, 'The received date can\'t be before the transfer date');
                t.receivedAt = dayToInstant(day);
                t.cancelledAt = null;
            } else if (payload.status === 'cancelled') {
                t.cancelledAt = new Date();
                t.receivedAt = null;
            } else {
                // Undo receive
                t.receivedAt = null;
                t.cancelledAt = null;
            }
            t.status = payload.status;
        } else if (payload.receivedAt !== undefined) {
            // Correct the received date of a received transfer.
            if (current !== 'received') throw new AppError(409, 'Only a received transfer has a received date');
            assertNotFuture(payload.receivedAt, 'The received date');
            if (payload.receivedAt < dhakaDayOf(t.transferredAt)) throw new AppError(400, 'The received date can\'t be before the transfer date');
            if (payload.receivedAt !== dhakaDayOf(t.receivedAt)) t.receivedAt = dayToInstant(payload.receivedAt);
        }

        if (t.status === 'received' && t.receivedAt && dhakaDayOf(t.receivedAt) < dhakaDayOf(t.transferredAt)) {
            throw new AppError(400, 'The transfer date can\'t be after the received date');
        }

        if (payload.note !== undefined) t.note = payload.note;

        try {
            await t.save();
        } catch (e: any) {
            // Version-checked save: someone else changed this transfer after it was read.
            if (e?.name === 'VersionError') throw new AppError(409, `${t.reference} was changed by someone else just now. Reload it and try again.`);
            throw e;
        }
        return this.getOne(id);
    },

    async delete(id: string) {
        const t: any = await Transfer.findById(id).select('reference status');
        if (!t) throw new AppError(404, 'Transfer not found');
        if (!canDelete(t.status)) {
            throw new AppError(409, `${t.reference} was received, so it stays in your records. If it was recorded by mistake, use "Undo receive" first, then delete it.`);
        }
        // Only while it still has the status checked above (it may have been received meanwhile).
        const r = await Transfer.deleteOne({ _id: t._id, status: t.status });
        if (!r.deletedCount) throw new AppError(409, `${t.reference} was changed by someone else just now. Reload it and try again.`);
        return { _id: id, reference: t.reference };
    },
};

export default TransferService;
