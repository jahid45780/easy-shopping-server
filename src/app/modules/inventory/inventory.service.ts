import { Types } from 'mongoose';
import { Product } from '../product/product.model';
import { Category } from '../category/category.model';
import ProductService from '../product/product.service';
import AppError from '../../utils/AppError';
import { StockMovement, STOCK_MOVEMENT_TYPES, StockMovementType } from './stockMovement.model';
import { recordStockMovements, variantOf } from './inventory.ledger';

// ════════════════════════════════════════════════════════════════════════
//  INVENTORY
//  product.stock is the sellable count — checkout reserves against it (order.service).
//  Variants carry their own stock as a breakdown, and sales / cancellations / returns
//  move the sold variant together with the total (order.service). A stock-in aimed at a
//  variant adds to the variant AND the total; an adjustment (a count or a write-off) of
//  a variant sets the total to the sum of the variants, so a count always brings the two
//  back in line. costPrice is the moving-average unit cost (BDT).
//
//  Warehouses come later: every query here is per product today. When warehouses land,
//  stock moves to a per-warehouse collection and these functions take a warehouse id.
// ════════════════════════════════════════════════════════════════════════

/** Thumbnail for quick-added drafts, served by the Next.js client from /public. */
export const DRAFT_PLACEHOLDER_THUMBNAIL = '/images/placeholder-product.svg';

const DEFAULT_LOW_STOCK = 5;
const MAX_CAS_ATTEMPTS = 5;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Filter value that matches a number, treating a missing field as 0 (legacy documents). */
const eqOrMissing = (v: unknown) => (v === undefined || v === null ? { $in: [null, 0] } : v);

function pageArgs(query: Record<string, unknown>, defLimit = 20) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || defLimit)));
    return { page, limit, skip: (page - 1) * limit };
}

type LeanVariant = { _id: Types.ObjectId; stock?: number; color?: string; size?: string; label?: string; sku?: string };
type LeanProduct = {
    _id: Types.ObjectId; name: string; sku?: string; unit?: string; status?: string;
    stock?: number; costPrice?: number; variants?: LeanVariant[];
};

type StockPlan = {
    totalDelta: number;       // change to product.stock
    variantDelta?: number;    // change to the targeted variant's stock
    costPrice?: number;       // new moving-average cost (stock-in only)
    reactivate?: boolean;     // 'out-of-stock' → 'active'
};

const PRODUCT_STOCK_FIELDS = 'name sku unit status stock costPrice variants._id variants.stock variants.color variants.size variants.label variants.sku';

/**
 * Apply a stock change atomically with compare-and-set: read the product, let `plan`
 * compute the change from what was read, then write it with a filter that only matches
 * if stock (and cost / the variant's stock) are still exactly what was read. A concurrent
 * checkout or edit makes the write miss, and we simply re-read and re-plan. Because every
 * plan is computed from the exact current values, stock can never be pushed below zero.
 */
async function applyStockChange(
    productId: string,
    variantId: string | null | undefined,
    plan: (before: LeanProduct, variant: LeanVariant | null) => StockPlan,
) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const before = (await Product.findOne({ _id: productId, isDeleted: { $ne: true } })
            .select(PRODUCT_STOCK_FIELDS)
            .lean()) as LeanProduct | null;
        if (!before) throw new AppError(404, 'Product not found');

        const variants = before.variants || [];
        let variant: LeanVariant | null = null;
        if (variants.length > 0) {
            if (!variantId) throw new AppError(400, `"${before.name}" has variants — choose which variant to update`);
            variant = variants.find((v) => String(v._id) === String(variantId)) || null;
            if (!variant) throw new AppError(404, 'That variant no longer exists on this product');
        } else if (variantId) {
            throw new AppError(400, `"${before.name}" has no variants`);
        }

        const change = plan(before, variant);
        if (change.totalDelta === 0 && !change.variantDelta && change.costPrice === undefined) {
            throw new AppError(400, 'Nothing to change — the stock is already at that count');
        }

        const filter: Record<string, unknown> = {
            _id: before._id,
            isDeleted: { $ne: true },
            stock: eqOrMissing(before.stock),
        };
        const inc: Record<string, number> = {};
        const set: Record<string, unknown> = {};
        if (change.totalDelta !== 0) inc.stock = change.totalDelta;
        const options: Record<string, unknown> = { new: true };
        if (variant) {
            // Every variant's stock must still be what was read (an adjustment's total is their sum).
            filter.variants = { $size: variants.length };
            filter.$and = variants.map((v) => ({ variants: { $elemMatch: { _id: v._id, stock: eqOrMissing(v.stock) } } }));
            if (change.variantDelta) {
                inc['variants.$[target].stock'] = change.variantDelta;
                options.arrayFilters = [{ 'target._id': variant._id }];
            }
        }
        if (change.costPrice !== undefined && change.costPrice !== num(before.costPrice)) {
            filter.costPrice = eqOrMissing(before.costPrice);
            set.costPrice = change.costPrice;
        }
        if (change.reactivate && before.status === 'out-of-stock') {
            filter.status = 'out-of-stock';
            set.status = 'active';
        }

        const update: Record<string, unknown> = {};
        if (Object.keys(inc).length) update.$inc = inc;
        if (Object.keys(set).length) update.$set = set;

        const after = (await Product.findOneAndUpdate(filter, update, options)
            .select(PRODUCT_STOCK_FIELDS)
            .lean()) as LeanProduct | null;
        if (after) {
            const afterVariant = variant
                ? (after.variants || []).find((v) => String(v._id) === String(variant!._id)) || null
                : null;
            return { before, after, variant, afterVariant, change };
        }
        // Someone else changed this product between our read and write — try again.
    }
    throw new AppError(409, 'The stock changed while saving — please try again');
}

const InventoryService = {
    // ── GET /stock — one row per product ────────────────────────────────
    async getStock(query: Record<string, unknown>) {
        const { page, limit, skip } = pageArgs(query);
        const match: Record<string, unknown> = { isDeleted: { $ne: true } };

        const search = typeof query.search === 'string' ? query.search.trim() : '';
        if (search) {
            const rx = new RegExp(escapeRegex(search), 'i');
            match.$or = [{ name: rx }, { sku: rx }, { 'variants.sku': rx }];
        }

        switch (query.filter) {
            case 'draft':
                match.status = 'draft';
                break;
            case 'out':
                match.stock = { $not: { $gt: 0 } };
                break;
            case 'low':
                match.stock = { $gt: 0 };
                match.$expr = { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', DEFAULT_LOW_STOCK] }] };
                break;
            default:
                break;
        }

        const SORTS: Record<string, Record<string, 1 | -1>> = {
            name: { name: 1, _id: 1 },
            '-name': { name: -1, _id: 1 },
            stock: { _qty: 1, name: 1 },
            '-stock': { _qty: -1, name: 1 },
            value: { value: 1, name: 1 },
            '-value': { value: -1, name: 1 },
            '-updatedAt': { updatedAt: -1, _id: -1 },
        };
        const sort = SORTS[String(query.sort || 'name')] || SORTS.name;

        const [result] = await Product.aggregate([
            { $match: match },
            {
                $addFields: {
                    _qty: { $ifNull: ['$stock', 0] },
                    _cost: { $ifNull: ['$costPrice', 0] },
                },
            },
            { $addFields: { value: { $multiply: [{ $max: ['$_qty', 0] }, '$_cost'] } } },
            { $sort: sort },
            {
                $facet: {
                    rows: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                name: 1, sku: 1, slug: 1, thumbnail: 1, status: 1, unit: 1, price: 1,
                                lowStockThreshold: 1, updatedAt: 1, value: 1,
                                stock: '$_qty', costPrice: '$_cost',
                                variants: { _id: 1, label: 1, color: 1, size: 1, sku: 1, stock: 1 },
                            },
                        },
                    ],
                    total: [{ $count: 'n' }],
                },
            },
        ]).collation({ locale: 'en', strength: 2 });

        const rows = (result?.rows || []).map((p: any) => {
            const stock = num(p.stock);
            const threshold = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : DEFAULT_LOW_STOCK;
            const variants = (p.variants || []).map((v: any) => ({
                _id: String(v._id),
                label: v.label || [v.color, v.size].filter(Boolean).join(' / ') || 'Variant',
                color: v.color || '',
                size: v.size || '',
                sku: v.sku || '',
                stock: num(v.stock),
            }));
            return {
                _id: String(p._id),
                name: p.name,
                sku: p.sku || '',
                slug: p.slug || '',
                thumbnail: p.thumbnail || '',
                status: p.status || 'active',
                unit: p.unit || 'piece',
                price: num(p.price),
                stock,
                lowStockThreshold: threshold,
                costPrice: num(p.costPrice),
                value: round2(num(p.value)),
                isOut: stock <= 0,
                isLow: stock > 0 && stock <= threshold,
                variants,
                variantTotal: variants.reduce((s: number, v: any) => s + v.stock, 0),
                updatedAt: p.updatedAt,
            };
        });

        const total = result?.total?.[0]?.n || 0;
        return { rows, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
    },

    // ── GET /summary — the four tiles ───────────────────────────────────
    async getSummary() {
        const [s] = await Product.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            {
                $project: {
                    q: { $max: [{ $ifNull: ['$stock', 0] }, 0] },
                    c: { $ifNull: ['$costPrice', 0] },
                    t: { $ifNull: ['$lowStockThreshold', DEFAULT_LOW_STOCK] },
                    status: 1,
                },
            },
            {
                $group: {
                    _id: null,
                    products: { $sum: 1 },
                    units: { $sum: '$q' },
                    value: { $sum: { $multiply: ['$q', '$c'] } },
                    low: { $sum: { $cond: [{ $and: [{ $gt: ['$q', 0] }, { $lte: ['$q', '$t'] }] }, 1, 0] } },
                    out: { $sum: { $cond: [{ $lte: ['$q', 0] }, 1, 0] } },
                    drafts: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
                    // In stock but no cost recorded yet → their value is missing from the total.
                    uncosted: { $sum: { $cond: [{ $and: [{ $gt: ['$q', 0] }, { $lte: ['$c', 0] }] }, 1, 0] } },
                },
            },
        ]);
        return {
            products: s?.products || 0,
            units: s?.units || 0,
            value: round2(s?.value || 0),
            low: s?.low || 0,
            out: s?.out || 0,
            drafts: s?.drafts || 0,
            uncosted: s?.uncosted || 0,
        };
    },

    // ── POST /stock-in — goods received ─────────────────────────────────
    async stockIn(
        payload: { productId: string; variantId?: string | null; quantity: number; unitCost?: number | null; note?: string },
        actorId?: string,
    ) {
        const qty = payload.quantity;
        const unitCost = typeof payload.unitCost === 'number' ? payload.unitCost : undefined;

        const res = await applyStockChange(payload.productId, payload.variantId, (before) => {
            const plan: StockPlan = { totalDelta: qty, variantDelta: qty, reactivate: true };
            if (unitCost !== undefined) {
                // Moving average over what is on hand. With nothing on hand, or no cost
                // recorded yet, the new purchase cost simply becomes the average.
                const onHand = Math.max(0, num(before.stock));
                const oldCost = num(before.costPrice);
                plan.costPrice = onHand <= 0 || oldCost <= 0
                    ? round2(unitCost)
                    : round2((onHand * oldCost + qty * unitCost) / (onHand + qty));
            }
            return plan;
        });

        await recordStockMovements([{
            product: res.after._id,
            type: 'stock_in',
            quantity: res.change.totalDelta,
            balanceAfter: num(res.after.stock),
            variant: res.variant ? variantOf(res.variant) : null,
            variantBalanceAfter: res.afterVariant ? num(res.afterVariant.stock) : null,
            unitCost: unitCost ?? null,
            note: payload.note || '',
            createdBy: actorId,
        }]);

        return {
            product: res.after,
            reactivated: res.before.status === 'out-of-stock' && res.after.status === 'active',
            costPrice: num(res.after.costPrice),
        };
    },

    // ── POST /adjust — stock count or write-off ─────────────────────────
    async adjust(
        payload: { productId: string; variantId?: string | null; mode: 'set' | 'remove'; quantity: number; reason: string; note?: string },
        actorId?: string,
    ) {
        const { mode, quantity } = payload;

        const res = await applyStockChange(payload.productId, payload.variantId, (before, variant) => {
            const total = num(before.stock);
            if (variant) {
                const current = num(variant.stock);
                if (mode === 'remove' && quantity > current) {
                    throw new AppError(400, `Only ${Math.max(0, current)} in stock for ${variant.label || 'this variant'}`);
                }
                const variantDelta = mode === 'set' ? quantity - current : -quantity;
                // The sellable total becomes the sum of the variants after this change. Adding
                // the variant's delta to the total instead would carry any old gap between the
                // two forward (e.g. variants generated at 0 under a total of 10: counting 4 of
                // one variant must give 4 sellable, not 14).
                const variantSum = (before.variants || []).reduce(
                    (s, v) => s + Math.max(0, num(String(v._id) === String(variant._id) ? current + variantDelta : v.stock)),
                    0,
                );
                return { variantDelta, totalDelta: variantSum - total };
            }
            if (mode === 'remove' && quantity > total) {
                throw new AppError(400, `Only ${Math.max(0, total)} in stock`);
            }
            const newTotal = mode === 'set' ? quantity : total - quantity;
            return { totalDelta: newTotal - total };
        });

        const vBefore = res.variant ? num(res.variant.stock) : null;
        const vAfter = res.afterVariant ? num(res.afterVariant.stock) : null;
        const parts = [payload.reason.trim()];
        if (payload.note?.trim()) parts.push(payload.note.trim());
        if (res.variant && res.change.variantDelta !== res.change.totalDelta) {
            parts.push(`(${variantOf(res.variant)?.label || 'variant'} ${vBefore} → ${vAfter}; product total set to the sum of its variants)`);
        }

        await recordStockMovements([{
            product: res.after._id,
            type: mode === 'remove' ? 'stock_out' : 'adjustment',
            quantity: res.change.totalDelta,
            balanceAfter: num(res.after.stock),
            variant: res.variant ? variantOf(res.variant) : null,
            variantBalanceAfter: vAfter,
            unitCost: num(res.after.costPrice) > 0 ? num(res.after.costPrice) : null,
            note: parts.join(' — '),
            createdBy: actorId,
        }]);

        return { product: res.after };
    },

    // ── POST /quick-product — new item arrived, create a DRAFT and count it ─
    async quickProduct(
        payload: {
            name: string; category: string; unit?: string; sku?: string; quantity: number;
            unitCost?: number | null; price?: number | null; lowStockThreshold?: number;
        },
        actorId?: string,
    ) {
        const name = payload.name.trim();

        const category = await Category.findOne({ _id: payload.category, isDeleted: { $ne: true } }).select('_id');
        if (!category) throw new AppError(404, 'Category not found');

        const sameName = await Product.findOne({
            name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
            isDeleted: { $ne: true },
        }).select('_id status');
        if (sameName) {
            throw new AppError(409, `A product named "${name}" already exists — add stock to it instead`);
        }

        const sku = payload.sku?.trim();
        if (sku && (await Product.exists({ sku }))) {
            throw new AppError(409, `SKU "${sku}" is already used by another product`);
        }

        const unitCost = typeof payload.unitCost === 'number' ? round2(payload.unitCost) : 0;
        const product = await ProductService.createProduct(
            {
                name,
                // Required by the model; replaced when the product is finished on the Products page.
                description: name,
                price: typeof payload.price === 'number' ? payload.price : 0,
                costPrice: unitCost,
                thumbnail: DRAFT_PLACEHOLDER_THUMBNAIL,
                images: [],
                category: payload.category,
                unit: payload.unit?.trim() || 'piece',
                stock: payload.quantity,
                ...(typeof payload.lowStockThreshold === 'number' ? { lowStockThreshold: payload.lowStockThreshold } : {}),
                ...(sku ? { sku } : {}),
                status: 'draft',
            },
            { actorId, skipOpeningMovement: true },
        );

        await recordStockMovements([{
            product: product._id,
            type: 'opening',
            quantity: payload.quantity,
            balanceAfter: num(product.stock),
            unitCost: unitCost > 0 ? unitCost : null,
            note: 'Opening stock — quick-added from Inventory as a draft',
            createdBy: actorId,
        }]);

        return product;
    },

    // ── GET /movements — the ledger ─────────────────────────────────────
    async getMovements(query: Record<string, unknown>) {
        const { page, limit, skip } = pageArgs(query);
        const match: Record<string, unknown> = {};

        if (typeof query.product === 'string' && Types.ObjectId.isValid(query.product)) {
            match.product = new Types.ObjectId(query.product);
        } else {
            const search = typeof query.search === 'string' ? query.search.trim() : '';
            if (search) {
                const rx = new RegExp(escapeRegex(search), 'i');
                const ids = await Product.find({ $or: [{ name: rx }, { sku: rx }] }).select('_id').limit(500).lean();
                match.product = { $in: ids.map((p) => p._id) };
            }
        }

        if (typeof query.type === 'string' && (STOCK_MOVEMENT_TYPES as readonly string[]).includes(query.type)) {
            match.type = query.type as StockMovementType;
        }

        // Dates are calendar days in Bangladesh time (UTC+6), inclusive on both ends.
        const range: Record<string, Date> = {};
        if (typeof query.from === 'string' && query.from) {
            const d = new Date(`${query.from}T00:00:00.000+06:00`);
            if (!isNaN(d.getTime())) range.$gte = d;
        }
        if (typeof query.to === 'string' && query.to) {
            const d = new Date(`${query.to}T23:59:59.999+06:00`);
            if (!isNaN(d.getTime())) range.$lte = d;
        }
        if (Object.keys(range).length) match.createdAt = range;

        const [rows, total] = await Promise.all([
            StockMovement.find(match)
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .populate('product', 'name sku unit thumbnail status')
                .populate('createdBy', 'firstName lastName role')
                .populate('order', 'orderId')
                .lean(),
            StockMovement.countDocuments(match),
        ]);

        return { rows, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
    },
};

export default InventoryService;
