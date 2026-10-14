import { Types } from 'mongoose';
import AppError from '../../utils/AppError';
import { Supplier } from './supplier.model';
import { Purchase, MONEY_STATUSES } from '../purchase/purchase.model';
import { Product } from '../product/product.model';

// Suppliers (admin only). Their money and "products taken" are read from purchases:
// only placed purchases count (confirmed / partially received / received), never
// drafts or cancelled ones. The purchase count covers every purchase on record.

const CI = { locale: 'en', strength: 2 } as const; // case-insensitive collation
const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidyName = (s: string) => s.trim().replace(/\s+/g, ' ');

const inMoney = { $in: ['$status', MONEY_STATUSES] };

/** Per-supplier purchase figures. */
async function purchaseStats(ids: Types.ObjectId[]) {
    if (!ids.length) return new Map<string, any>();
    const [money, products] = await Promise.all([
        Purchase.aggregate([
            { $match: { supplier: { $in: ids } } },
            {
                $group: {
                    _id: '$supplier',
                    purchaseCount: { $sum: 1 },
                    openCount: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'partially_received']] }, 1, 0] } },
                    totalPurchased: { $sum: { $cond: [inMoney, '$grandTotal', 0] } },
                    totalPaid: { $sum: { $cond: [inMoney, '$paid', 0] } },
                    due: { $sum: { $cond: [inMoney, '$due', 0] } },
                    lastOrderDate: { $max: { $cond: [inMoney, '$orderDate', null] } },
                },
            },
        ]),
        // Which products, and how many: grouped per product (or per typed name), top 3 kept.
        Purchase.aggregate([
            { $match: { supplier: { $in: ids }, status: { $in: MONEY_STATUSES } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: {
                        s: '$supplier',
                        k: { $ifNull: [{ $toString: '$items.product' }, { $toLower: '$items.name' }] },
                    },
                    name: { $last: '$items.name' },
                    qty: { $sum: '$items.qty' },
                    received: { $sum: '$items.receivedQty' },
                },
            },
            { $sort: { qty: -1 } },
            {
                $group: {
                    _id: '$_id.s',
                    productCount: { $sum: 1 },
                    unitsOrdered: { $sum: '$qty' },
                    unitsReceived: { $sum: '$received' },
                    top: { $push: { name: '$name', qty: '$qty' } },
                },
            },
            { $project: { productCount: 1, unitsOrdered: 1, unitsReceived: 1, top: { $slice: ['$top', 3] } } },
        ]),
    ]);

    const out = new Map<string, any>();
    for (const m of money as any[]) {
        out.set(String(m._id), {
            purchaseCount: m.purchaseCount || 0,
            openCount: m.openCount || 0,
            totalPurchased: round2(m.totalPurchased || 0),
            totalPaid: round2(m.totalPaid || 0),
            due: round2(m.due || 0),
            lastOrderDate: m.lastOrderDate || null,
        });
    }
    for (const p of products as any[]) {
        const s = out.get(String(p._id));
        if (s) Object.assign(s, { productCount: p.productCount, unitsOrdered: p.unitsOrdered, unitsReceived: p.unitsReceived, topProducts: p.top });
    }
    return out;
}

const EMPTY_STATS = {
    purchaseCount: 0, openCount: 0, totalPurchased: 0, totalPaid: 0, due: 0, lastOrderDate: null,
    productCount: 0, unitsOrdered: 0, unitsReceived: 0, topProducts: [] as { name: string; qty: number }[],
};

async function assertNameFree(name: string, exceptId?: string) {
    const q: Record<string, unknown> = { name };
    if (exceptId) q._id = { $ne: exceptId };
    const clash: any = await Supplier.findOne(q).collation(CI).select('name').lean();
    if (clash) throw new AppError(409, `A supplier named "${clash.name}" already exists`);
}

const rethrowDuplicate = (e: any, name: string): never => {
    if (e?.code === 11000) throw new AppError(409, `A supplier named "${name}" already exists`);
    throw e;
};

function fields(payload: any) {
    const out: Record<string, unknown> = {};
    for (const k of ['contactPerson', 'phone', 'country', 'address', 'note'] as const) {
        if (payload[k] !== undefined) out[k] = str(payload[k]);
    }
    if (payload.email !== undefined) out.email = str(payload.email).toLowerCase();
    if (payload.isActive !== undefined) out.isActive = !!payload.isActive;
    return out;
}

const SupplierService = {
    async list(query: Record<string, unknown>) {
        const filter: Record<string, unknown> = {};
        if (query.scope === 'active') filter.isActive = true;
        const search = typeof query.search === 'string' ? query.search.trim() : '';
        if (search) {
            const rx = new RegExp(escapeRx(search), 'i');
            filter.$or = [{ name: rx }, { contactPerson: rx }, { phone: rx }, { email: rx }, { country: rx }];
        }
        const suppliers = await Supplier.find(filter).sort({ name: 1 }).collation(CI).lean();
        const stats = await purchaseStats(suppliers.map((s: any) => s._id));
        return suppliers.map((s: any) => ({ ...s, ...EMPTY_STATS, ...(stats.get(String(s._id)) || {}) }));
    },

    /** One supplier with its totals, the products taken from it and its recent purchases. */
    async getOne(id: string) {
        if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid supplier id');
        const supplier: any = await Supplier.findById(id).lean();
        if (!supplier) throw new AppError(404, 'Supplier not found');
        const sid = supplier._id as Types.ObjectId;

        const [stats, products, recent] = await Promise.all([
            purchaseStats([sid]),
            Purchase.aggregate([
                { $match: { supplier: sid, status: { $in: MONEY_STATUSES } } },
                { $sort: { orderDate: 1, _id: 1 } },
                {
                    $addFields: {
                        _rate: { $cond: [{ $eq: ['$currency', 'BDT'] }, 1, { $ifNull: ['$exchangeRate', 1] }] },
                        // grandTotal / subtotalBdt spreads shipping, duty and other costs over the goods.
                        _landedFactor: { $cond: [{ $gt: ['$subtotalBdt', 0] }, { $divide: ['$grandTotal', '$subtotalBdt'] }, 1] },
                    },
                },
                { $unwind: '$items' },
                {
                    $addFields: {
                        _lineBdt: { $multiply: ['$items.qty', '$items.unitCost', '$_rate'] },
                    },
                },
                {
                    $group: {
                        _id: { $ifNull: [{ $toString: '$items.product' }, { $toLower: '$items.name' }] },
                        product: { $last: '$items.product' },
                        name: { $last: '$items.name' },
                        sku: { $last: '$items.sku' },
                        unit: { $last: '$items.unit' },
                        purchases: { $addToSet: '$_id' },
                        qtyOrdered: { $sum: '$items.qty' },
                        qtyReceived: { $sum: '$items.receivedQty' },
                        goodsCost: { $sum: '$_lineBdt' },
                        landedCost: { $sum: { $multiply: ['$_lineBdt', '$_landedFactor'] } },
                        lastOrderDate: { $last: '$orderDate' },
                        lastUnitCost: { $last: '$items.unitCost' },
                        lastCurrency: { $last: '$currency' },
                    },
                },
                { $sort: { landedCost: -1, qtyOrdered: -1 } },
                { $limit: 200 },
            ]),
            Purchase.find({ supplier: sid })
                .sort({ createdAt: -1, _id: -1 })
                .limit(10)
                .select('reference status shippingMode orderDate eta grandTotal paid due items.qty items.receivedQty createdAt')
                .lean(),
        ]);

        const productIds = (products as any[]).map((r) => r.product).filter(Boolean);
        const catalogue: any[] = productIds.length
            ? await Product.find({ _id: { $in: productIds } }).select('name thumbnail sku unit isDeleted').lean()
            : [];
        const productById = new Map(catalogue.map((p) => [String(p._id), p]));

        return {
            ...supplier,
            ...EMPTY_STATS,
            ...(stats.get(String(sid)) || {}),
            productsTaken: (products as any[]).map((r) => {
                const p = r.product ? productById.get(String(r.product)) : null;
                return {
                    key: r._id,
                    product: p ? { _id: String(p._id), name: p.name, thumbnail: p.thumbnail || '', sku: p.sku || '', unit: p.unit || 'piece', isDeleted: !!p.isDeleted } : null,
                    name: r.name,
                    sku: r.sku || p?.sku || '',
                    unit: r.unit || p?.unit || '',
                    purchaseCount: (r.purchases || []).length,
                    qtyOrdered: r.qtyOrdered || 0,
                    qtyReceived: r.qtyReceived || 0,
                    goodsCost: round2(r.goodsCost || 0),
                    landedCost: round2(r.landedCost || 0),
                    lastOrderDate: r.lastOrderDate || null,
                    lastUnitCost: r.lastUnitCost ?? 0,
                    lastCurrency: r.lastCurrency || 'BDT',
                };
            }),
            recentPurchases: (recent as any[]).map((p) => ({
                _id: String(p._id),
                reference: p.reference,
                status: p.status,
                shippingMode: p.shippingMode || '',
                orderDate: p.orderDate,
                eta: p.eta || null,
                grandTotal: p.grandTotal || 0,
                paid: p.paid || 0,
                due: p.due || 0,
                itemCount: (p.items || []).length,
                totalQty: (p.items || []).reduce((s: number, i: any) => s + (i.qty || 0), 0),
                receivedQty: (p.items || []).reduce((s: number, i: any) => s + (i.receivedQty || 0), 0),
            })),
        };
    },

    async create(payload: any) {
        const name = tidyName(str(payload.name));
        if (!name) throw new AppError(400, 'Supplier name is required');
        await assertNameFree(name);
        try {
            return await Supplier.create({ ...fields(payload), name, isActive: payload.isActive ?? true });
        } catch (e) {
            return rethrowDuplicate(e, name);
        }
    },

    async update(id: string, payload: any) {
        if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid supplier id');
        const supplier: any = await Supplier.findById(id);
        if (!supplier) throw new AppError(404, 'Supplier not found');
        if (payload.name !== undefined) {
            const name = tidyName(str(payload.name));
            if (!name) throw new AppError(400, 'Supplier name is required');
            if (name.toLowerCase() !== String(supplier.name).toLowerCase()) await assertNameFree(name, id);
            supplier.name = name;
        }
        supplier.set(fields(payload));
        try {
            await supplier.save();
        } catch (e) {
            rethrowDuplicate(e, supplier.name);
        }
        return supplier;
    },

    async delete(id: string) {
        if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid supplier id');
        const supplier: any = await Supplier.findById(id).select('name').lean();
        if (!supplier) throw new AppError(404, 'Supplier not found');
        const used = await Purchase.countDocuments({ supplier: supplier._id });
        if (used > 0) {
            throw new AppError(409, `${used} purchase${used === 1 ? ' refers' : 's refer'} to "${supplier.name}" — deactivate the supplier instead, so its history stays intact`);
        }
        await Supplier.deleteOne({ _id: supplier._id });
        return { name: supplier.name };
    },
};

export default SupplierService;
