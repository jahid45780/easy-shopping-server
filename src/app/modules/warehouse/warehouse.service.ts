import mongoose from 'mongoose';
import { Warehouse } from './warehouse.model';
import { Transfer } from '../transfer/transfer.model';
import AppError from '../../utils/AppError';

/*
 * Warehouses (godowns / stock locations) — admin-only bookkeeping. Purchases are
 * received into one and Transfers move goods between two. Product stock stays one
 * total per product; nothing here changes it.
 */

const CI = { locale: 'en', strength: 2 } as const; // case-insensitive collation
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

interface TransferCounts {
    transferCount: number;   // transfers from or to this warehouse, any status
    inTransitIn: number;     // on the way INTO this warehouse
    inTransitOut: number;    // sent OUT of it, not yet received
    lastTransferAt: Date | null;
}

async function transferCounts(): Promise<Map<string, TransferCounts>> {
    const rows = await Transfer.aggregate([
        { $project: { status: 1, transferredAt: 1, sides: [{ w: '$from', dir: 'out' }, { w: '$to', dir: 'in' }] } },
        { $unwind: '$sides' },
        {
            $group: {
                _id: '$sides.w',
                transferCount: { $sum: 1 },
                inTransitIn: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'in_transit'] }, { $eq: ['$sides.dir', 'in'] }] }, 1, 0] } },
                inTransitOut: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'in_transit'] }, { $eq: ['$sides.dir', 'out'] }] }, 1, 0] } },
                lastTransferAt: { $max: '$transferredAt' },
            },
        },
    ]);
    return new Map(rows.map((r: any) => [String(r._id), {
        transferCount: r.transferCount || 0,
        inTransitIn: r.inTransitIn || 0,
        inTransitOut: r.inTransitOut || 0,
        lastTransferAt: r.lastTransferAt || null,
    }]));
}

/**
 * Purchases received into each warehouse (purchase.receipts[].warehouse). The purchase
 * module is separate, so its collection is read directly and defensively: if it is
 * missing or shaped differently, the counts are simply 0.
 */
async function purchaseCounts(): Promise<Map<string, number>> {
    try {
        if (!mongoose.connection.db) return new Map();
        const rows = await mongoose.connection.collection('purchases').aggregate([
            { $match: { 'receipts.warehouse': { $exists: true }, isDeleted: { $ne: true } } },
            { $unwind: '$receipts' },
            { $match: { 'receipts.warehouse': { $nin: [null, ''] } } },
            { $group: { _id: { w: { $toString: '$receipts.warehouse' }, p: '$_id' } } },
            { $group: { _id: '$_id.w', n: { $sum: 1 } } },
        ]).toArray();
        return new Map(rows.map((r: any) => [String(r._id), Number(r.n) || 0]));
    } catch {
        return new Map();
    }
}

/** Purchases (any, including soft-deleted) that received goods into this warehouse. */
async function purchasesUsing(id: string): Promise<number> {
    if (!mongoose.connection.db) return 0;
    return mongoose.connection.collection('purchases').countDocuments({
        'receipts.warehouse': { $in: [new mongoose.Types.ObjectId(id), id] },
    });
}

async function assertNameFree(name: string, exceptId?: string) {
    const q: Record<string, unknown> = { name };
    if (exceptId) q._id = { $ne: exceptId };
    const dup: any = await Warehouse.findOne(q).collation(CI).select('name').lean();
    if (dup) throw new AppError(409, `A warehouse named "${dup.name}" already exists`);
}

const rethrowDuplicate = (e: any, name: string): never => {
    if (e?.code === 11000) throw new AppError(409, `A warehouse named "${name}" already exists`);
    throw e;
};

type WarehouseInput = {
    name?: string;
    location?: string;
    contactPerson?: string;
    phone?: string;
    note?: string;
    isActive?: boolean;
};

const WarehouseService = {
    /** { data: Warehouse[] } — a plain array (the Purchases page reads it too). */
    async list(query: { scope?: string; search?: string }) {
        const filter: Record<string, unknown> = {};
        if (query.scope === 'active') filter.isActive = true;
        if (query.search?.trim()) {
            const rx = new RegExp(escapeRx(query.search.trim()), 'i');
            filter.$or = [{ name: rx }, { location: rx }, { contactPerson: rx }, { phone: rx }];
        }
        const [warehouses, transfers, purchases] = await Promise.all([
            Warehouse.find(filter).collation(CI).sort({ isActive: -1, name: 1 }).lean(),
            transferCounts(),
            purchaseCounts(),
        ]);
        const none: TransferCounts = { transferCount: 0, inTransitIn: 0, inTransitOut: 0, lastTransferAt: null };
        return warehouses.map((w: any) => ({
            ...w,
            ...(transfers.get(String(w._id)) || none),
            purchaseCount: purchases.get(String(w._id)) || 0,
        }));
    },

    async create(payload: WarehouseInput) {
        const name = tidy(payload.name || '');
        if (!name) throw new AppError(400, 'Warehouse name is required');
        await assertNameFree(name);
        try {
            return await Warehouse.create({
                name,
                location: payload.location || '',
                contactPerson: payload.contactPerson || '',
                phone: payload.phone || '',
                note: payload.note || '',
                isActive: payload.isActive ?? true,
            });
        } catch (e) {
            rethrowDuplicate(e, name);
        }
    },

    async update(id: string, payload: WarehouseInput) {
        const w: any = await Warehouse.findById(id);
        if (!w) throw new AppError(404, 'Warehouse not found');
        if (payload.name !== undefined) {
            const name = tidy(payload.name);
            if (!name) throw new AppError(400, 'Warehouse name is required');
            if (name.toLowerCase() !== String(w.name).toLowerCase()) await assertNameFree(name, id);
            w.name = name;
        }
        for (const k of ['location', 'contactPerson', 'phone', 'note'] as const) {
            if (payload[k] !== undefined) w[k] = payload[k];
        }
        if (payload.isActive !== undefined) w.isActive = payload.isActive;
        try {
            await w.save();
        } catch (e) {
            rethrowDuplicate(e, w.name);
        }
        return w;
    },

    /** Only a warehouse no transfer or purchase refers to can be deleted; otherwise deactivate it. */
    async delete(id: string) {
        const w: any = await Warehouse.findById(id);
        if (!w) throw new AppError(404, 'Warehouse not found');
        const transfers = await Transfer.countDocuments({ $or: [{ from: w._id }, { to: w._id }] });
        if (transfers > 0) {
            throw new AppError(409, `"${w.name}" appears on ${transfers} transfer${transfers === 1 ? '' : 's'}, so it can't be deleted. Deactivate it instead: it stays on those records but can't be picked for new ones.`);
        }
        const purchases = await purchasesUsing(id);
        if (purchases > 0) {
            throw new AppError(409, `Goods from ${purchases} purchase${purchases === 1 ? ' were' : 's were'} received into "${w.name}", so it can't be deleted. Deactivate it instead.`);
        }
        await w.deleteOne();
        return { _id: id, name: w.name };
    },
};

export default WarehouseService;
