import { Types } from 'mongoose';
import AppError from '../../utils/AppError';
import { Purchase, PurchaseCounter, MONEY_STATUSES, PURCHASE_STATUSES } from './purchase.model';
import { Supplier } from '../supplier/supplier.model';
import { Product } from '../product/product.model';
import { Warehouse } from '../warehouse/warehouse.model';
import InventoryService from '../inventory/inventory.service';
import { addDays, dhakaDayStart, dhakaToday } from '../analytics/analytics.period';
import {
    round2, formatReference, referenceKey, parseReference, computeTotals, landedUnitCosts, effectiveRate,
    assertTotalsValid, assertPaymentFits, hasReceipts, remainingQty, itemsEditable, canCancel,
    receiveBlockReason, deleteBlockReason, statusFromReceipts, checkReceiveLines, ReceiveLineInput,
} from './purchase.utils';

// ════════════════════════════════════════════════════════════════════════
//  PURCHASES (admin only)
//  Rules — see purchase.utils for the pure versions:
//   • created as draft or confirmed; draft ⇄ confirmed while nothing is received
//   • supplier, items, prices, currency and extra costs change only on an untouched
//     draft/confirmed PO; afterwards only the note, ETA and supplier invoice (and payments)
//   • receipts move the status to partially_received / received automatically
//   • cancel only while nothing is received; delete only a draft/cancelled PO
//     with no receipts and no payments
//   • payments can never take `paid` past the grand total
// ════════════════════════════════════════════════════════════════════════

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? round2(v) : 0);
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const variantLabel = (v: { label?: string; color?: string; size?: string } | null | undefined) =>
    str(v?.label) || [str(v?.color), str(v?.size)].filter(Boolean).join(' / ') || 'Variant';

/** Fields locked once a purchase has receipts or is cancelled / received. */
const LOCKED_FIELDS = [
    'supplier', 'shippingMode', 'orderDate', 'currency', 'exchangeRate', 'items',
    'shippingCost', 'customsDuty', 'otherCost', 'otherCostLabel', 'discount',
] as const;

/* ─── Dates (Dhaka calendar days) ────────────────────────────────────── */

type Bound = string | Date | undefined | null;

/** from/to → an orderDate filter. Strings are Dhaka days (inclusive); Dates are exact instants [from, to). */
function dateRange(from: Bound, to: Bound): Record<string, Date> | null {
    const range: Record<string, Date> = {};
    if (from instanceof Date) range.$gte = from;
    else if (typeof from === 'string' && from) range.$gte = dhakaDayStart(from);
    if (to instanceof Date) range.$lt = to;
    else if (typeof to === 'string' && to) range.$lt = dhakaDayStart(addDays(to, 1));
    return Object.keys(range).length ? range : null;
}

function notInFuture(day: string | undefined, label: string) {
    if (day && day > dhakaToday()) throw new AppError(400, `${label} cannot be in the future`);
}

/* ─── Reference numbers ──────────────────────────────────────────────── */

/** Next reference for a Dhaka day, from an atomic per-day counter. */
async function nextReference(day: string): Promise<string> {
    const counter: any = await PurchaseCounter.findOneAndUpdate(
        { _id: referenceKey(day) },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
    ).lean();
    return formatReference(day, counter.seq);
}

/** After a duplicate (a counter lost or reset), move the counter past the highest reference used that day. */
async function resyncCounter(day: string) {
    const key = referenceKey(day);
    const last: any = await Purchase.findOne({ reference: { $regex: `^${key}\\d{5,}$` } })
        .sort({ reference: -1 })
        .select('reference')
        .lean();
    const seq = last ? parseReference(last.reference)?.seq || 0 : 0;
    if (seq > 0) await PurchaseCounter.updateOne({ _id: key }, { $max: { seq } }, { upsert: true });
}

const isDuplicateReference = (e: any) =>
    e?.code === 11000 && (e?.keyPattern?.reference || e?.keyValue?.reference || /reference/.test(String(e?.message)));

/* ─── Loading / saving ───────────────────────────────────────────────── */

async function loadActiveSupplier(id: unknown) {
    const supplier: any = await Supplier.findById(id).select('name isActive').lean();
    if (!supplier) throw new AppError(404, 'Supplier not found');
    if (!supplier.isActive) {
        throw new AppError(400, `"${supplier.name}" is inactive — activate the supplier first, or choose another one`);
    }
    return supplier;
}

/**
 * Load, change and save a purchase. Saves are version-checked (optimisticConcurrency),
 * so a concurrent change makes this re-read and re-apply — `apply` must be safe to rerun.
 */
async function mutatePurchase(id: string, apply: (p: any) => Promise<void> | void) {
    for (let attempt = 1; ; attempt++) {
        const p: any = await Purchase.findById(id);
        if (!p) throw new AppError(404, 'Purchase not found');
        await apply(p);
        try {
            await p.save();
            return p;
        } catch (e: any) {
            if (e?.name === 'VersionError') {
                if (attempt < 3) continue;
                throw new AppError(409, 'This purchase was changed by someone else while saving — please try again');
            }
            throw e;
        }
    }
}

/** Recompute subtotal / grand total / paid / due on a document and check them. */
function applyTotals(p: any) {
    const t = computeTotals(p);
    assertTotalsValid(t);
    p.subtotal = t.subtotal;
    p.subtotalBdt = t.subtotalBdt;
    p.grandTotal = t.grandTotal;
    p.paid = t.paid;
    p.due = t.due;
}

/**
 * Items from the request → stored items. Catalogue items snapshot the product's name,
 * SKU and unit; a variant chosen at order time is checked against the product.
 * Existing item ids are kept when the client sends them back.
 */
async function buildItems(raw: any[], existing: any[] = []) {
    const ids = [...new Set((raw || []).map((r) => r?.product).filter(Boolean).map(String))];
    const products: any[] = ids.length
        ? await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
            .select('name sku unit variants._id variants.label variants.color variants.size variants.sku')
            .lean()
        : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const existingIds = new Set((existing || []).map((i: any) => String(i._id)));

    return (raw || []).map((r, k) => {
        const line = k + 1;
        const qty = Number(r?.qty);
        if (!Number.isInteger(qty) || qty < 1) throw new AppError(400, `Line ${line}: quantity must be a whole number of at least 1`);
        const unitCost = Number(r?.unitCost);
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new AppError(400, `Line ${line}: enter a unit cost of 0 or more`);

        const out: any = {
            product: null, variantId: null, variantLabel: '', name: '', sku: '', unit: '',
            qty, unitCost: round4(unitCost), receivedQty: 0,
        };
        if (r?._id && existingIds.has(String(r._id))) out._id = r._id;

        if (r?.product) {
            const p = byId.get(String(r.product));
            if (!p) throw new AppError(400, `Line ${line}: that product no longer exists — pick it again or type the item name`);
            out.product = p._id;
            out.unit = p.unit || 'piece';
            out.name = str(r.name) || p.name;
            let sku = str(r.sku);
            if (r.variantId) {
                const v = (p.variants || []).find((x: any) => String(x._id) === String(r.variantId));
                if (!v) throw new AppError(400, `Line ${line}: that variant no longer exists on "${p.name}"`);
                out.variantId = v._id;
                out.variantLabel = variantLabel(v);
                sku = sku || str(v.sku);
            }
            out.sku = sku || str(p.sku);
        } else {
            out.name = str(r?.name);
            out.sku = str(r?.sku);
            if (!out.name) throw new AppError(400, `Line ${line}: enter the item name`);
        }
        return out;
    });
}

/* ─── Shaping responses ──────────────────────────────────────────────── */

function shapeProduct(prod: any) {
    if (!prod || typeof prod !== 'object' || !prod._id) return null;
    return {
        _id: String(prod._id),
        name: prod.name,
        sku: prod.sku || '',
        unit: prod.unit || 'piece',
        thumbnail: prod.thumbnail || '',
        status: prod.status || 'active',
        isDeleted: !!prod.isDeleted,
        stock: typeof prod.stock === 'number' ? prod.stock : 0,
        costPrice: typeof prod.costPrice === 'number' ? prod.costPrice : 0,
        variants: (prod.variants || []).map((v: any) => ({
            _id: String(v._id),
            label: variantLabel(v),
            sku: v.sku || '',
            stock: typeof v.stock === 'number' ? v.stock : 0,
        })),
    };
}

/** A purchase as the detail page reads it: per-line figures, landed costs and what can be done now. */
function decorate(p: any) {
    const rate = effectiveRate(p);
    const landed = landedUnitCosts(p);
    const items = (p.items || []).map((i: any, k: number) => ({
        ...i,
        product: shapeProduct(i.product),
        remaining: remainingQty(i),
        lineTotal: round2(i.qty * i.unitCost),
        lineTotalBdt: round2(i.qty * i.unitCost * rate),
        landedUnitCost: landed[k],
    }));
    const itemById = new Map(items.map((i: any) => [String(i._id), i]));
    const receipts = (p.receipts || []).map((r: any) => ({
        ...r,
        lines: (r.lines || []).map((l: any) => {
            const it: any = itemById.get(String(l.itemId));
            return { ...l, name: it?.name || 'Removed item', unit: it?.unit || '' };
        }),
    }));
    const receiveBlocked = receiveBlockReason(p);
    const deleteBlocked = deleteBlockReason(p);
    return {
        ...p,
        items,
        receipts,
        itemCount: items.length,
        totalQty: items.reduce((s: number, i: any) => s + i.qty, 0),
        receivedQty: items.reduce((s: number, i: any) => s + (i.receivedQty || 0), 0),
        can: {
            editItems: itemsEditable(p),
            receive: !receiveBlocked,
            cancel: canCancel(p),
            delete: !deleteBlocked,
            pay: p.status !== 'cancelled' && p.due > 0,
        },
        receiveBlockedReason: receiveBlocked,
        deleteBlockedReason: deleteBlocked,
    };
}

/* ─── Service ────────────────────────────────────────────────────────── */

const PurchaseService = {
    async list(q: Record<string, unknown>) {
        const page = Math.max(1, Math.floor(Number(q.page) || 1));
        const limit = Math.min(100, Math.max(1, Math.floor(Number(q.limit) || 20)));

        // Supplier + period drive the tiles; status and search only narrow the table.
        const base: Record<string, any> = {};
        if (typeof q.supplier === 'string' && Types.ObjectId.isValid(q.supplier)) base.supplier = new Types.ObjectId(q.supplier);
        const range = dateRange(q.from as string, q.to as string);
        if (range) base.orderDate = range;

        const rowMatch: Record<string, any> = { ...base };
        if (q.status === 'open') rowMatch.status = { $in: ['confirmed', 'partially_received'] };
        else if (typeof q.status === 'string' && (PURCHASE_STATUSES as readonly string[]).includes(q.status)) rowMatch.status = q.status;

        const search = typeof q.search === 'string' ? q.search.trim() : '';
        if (search) {
            const rx = new RegExp(escapeRx(search), 'i');
            const suppliers = await Supplier.find({ name: rx }).select('_id').limit(200).lean();
            rowMatch.$or = [
                { reference: rx },
                { supplierInvoice: rx },
                { 'items.name': rx },
                { 'items.sku': rx },
                { supplier: { $in: suppliers.map((s) => s._id) } },
            ];
        }

        const [rows, total, groups] = await Promise.all([
            Purchase.find(rowMatch)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('reference supplier supplierInvoice status shippingMode orderDate eta currency exchangeRate items.name items.qty items.receivedQty subtotal subtotalBdt grandTotal paid due payments._id receipts._id createdAt')
                .populate('supplier', 'name country isActive')
                .lean(),
            Purchase.countDocuments(rowMatch),
            Purchase.aggregate([
                { $match: base },
                { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$grandTotal' }, paid: { $sum: '$paid' }, due: { $sum: '$due' } } },
            ]),
        ]);

        const byStatus = Object.fromEntries(PURCHASE_STATUSES.map((s) => [s, 0])) as Record<string, number>;
        let sumTotal = 0, sumPaid = 0, sumDue = 0, moneyCount = 0, all = 0;
        for (const g of groups as any[]) {
            byStatus[g._id] = g.count;
            all += g.count;
            if (MONEY_STATUSES.includes(g._id)) {
                sumTotal += g.total || 0;
                sumPaid += g.paid || 0;
                sumDue += g.due || 0;
                moneyCount += g.count;
            }
        }

        const purchases = (rows as any[]).map((p) => {
            const items = p.items || [];
            const out = {
                ...p,
                itemCount: items.length,
                totalQty: items.reduce((s: number, i: any) => s + (i.qty || 0), 0),
                receivedQty: items.reduce((s: number, i: any) => s + (i.receivedQty || 0), 0),
                paymentCount: (p.payments || []).length,
                receiptCount: (p.receipts || []).length,
            };
            delete out.payments;
            delete out.receipts;
            return out;
        });

        return {
            data: {
                purchases,
                summary: {
                    total: round2(sumTotal),
                    paid: round2(sumPaid),
                    due: round2(sumDue),
                    count: moneyCount,
                    open: (byStatus.confirmed || 0) + (byStatus.partially_received || 0),
                    all,
                    byStatus,
                },
            },
            meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    },

    async getOne(id: string) {
        if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid purchase id');
        const p: any = await Purchase.findById(id)
            .populate('supplier', 'name contactPerson phone email country address isActive')
            .populate('items.product', 'name sku unit thumbnail status isDeleted stock costPrice variants._id variants.label variants.color variants.size variants.sku variants.stock')
            .populate('receipts.warehouse', 'name location isActive')
            .populate('receipts.createdBy', 'firstName lastName')
            .populate('payments.createdBy', 'firstName lastName')
            .populate('createdBy', 'firstName lastName')
            .lean();
        if (!p) throw new AppError(404, 'Purchase not found');
        return decorate(p);
    },

    async create(payload: any, userId?: string) {
        const supplier = await loadActiveSupplier(payload.supplier);
        const currency = payload.currency || 'BDT';
        const exchangeRate = currency === 'BDT' ? 1 : round4(Number(payload.exchangeRate));
        if (!(exchangeRate > 0)) throw new AppError(400, `Enter the exchange rate (BDT per 1 ${currency})`);
        notInFuture(payload.orderDate, 'The order date');

        const doc: any = {
            supplier: supplier._id,
            supplierInvoice: str(payload.supplierInvoice),
            status: payload.status === 'confirmed' ? 'confirmed' : 'draft',
            shippingMode: payload.shippingMode || '',
            orderDate: dhakaDayStart(payload.orderDate || dhakaToday()),
            eta: payload.eta ? dhakaDayStart(payload.eta) : null,
            currency,
            exchangeRate,
            items: await buildItems(payload.items),
            shippingCost: money(payload.shippingCost),
            customsDuty: money(payload.customsDuty),
            otherCost: money(payload.otherCost),
            otherCostLabel: str(payload.otherCostLabel),
            discount: money(payload.discount),
            payments: [],
            receipts: [],
            note: str(payload.note),
            createdBy: userId || null,
        };
        if (!doc.items.length) throw new AppError(400, 'Add at least one item');
        applyTotals(doc);

        const today = dhakaToday();
        for (let attempt = 0; attempt < 5; attempt++) {
            const reference = await nextReference(today);
            try {
                const created = await Purchase.create({ ...doc, reference });
                return this.getOne(String(created._id));
            } catch (e: any) {
                if (isDuplicateReference(e)) {
                    await resyncCounter(today);
                    continue;
                }
                throw e;
            }
        }
        throw new AppError(409, 'Could not assign a reference number — please try again');
    },

    async update(id: string, payload: any) {
        await mutatePurchase(id, async (p) => {
            const locked = LOCKED_FIELDS.filter((k) => payload[k] !== undefined);
            if (locked.length && !itemsEditable(p)) {
                throw new AppError(400, p.status === 'cancelled'
                    ? 'This purchase is cancelled — only the note, ETA and supplier invoice can change. Reopen it as a draft to edit more.'
                    : 'Goods have been received on this purchase — only the note, ETA and supplier invoice (and payments) can change now');
            }

            if (payload.status !== undefined && payload.status !== p.status) {
                if (hasReceipts(p)) throw new AppError(400, 'Goods have been received — the status now follows the receipts');
                if (!['draft', 'confirmed', 'cancelled'].includes(p.status)) throw new AppError(400, 'This status cannot be changed by hand');
                if (p.status === 'cancelled') {
                    p.cancelledAt = null;
                    p.cancelReason = '';
                }
                p.status = payload.status;
            }

            if (payload.supplier !== undefined && String(payload.supplier) !== String(p.supplier)) {
                p.supplier = (await loadActiveSupplier(payload.supplier))._id;
            }
            if (payload.supplierInvoice !== undefined) p.supplierInvoice = str(payload.supplierInvoice);
            if (payload.shippingMode !== undefined) p.shippingMode = payload.shippingMode || '';
            if (payload.orderDate !== undefined) {
                notInFuture(payload.orderDate, 'The order date');
                p.orderDate = dhakaDayStart(payload.orderDate);
            }
            if (payload.eta !== undefined) p.eta = payload.eta ? dhakaDayStart(payload.eta) : null;
            if (payload.note !== undefined) p.note = str(payload.note);

            if (payload.currency !== undefined || payload.exchangeRate !== undefined) {
                const currency = payload.currency ?? p.currency;
                let rate = 1;
                if (currency !== 'BDT') {
                    const switched = payload.currency !== undefined && payload.currency !== p.currency;
                    rate = payload.exchangeRate !== undefined ? round4(Number(payload.exchangeRate)) : switched ? 0 : p.exchangeRate;
                    if (!(rate > 0)) throw new AppError(400, `Enter the exchange rate (BDT per 1 ${currency})`);
                }
                p.currency = currency;
                p.exchangeRate = rate;
            }

            if (payload.items !== undefined) p.items = await buildItems(payload.items, p.items);
            for (const k of ['shippingCost', 'customsDuty', 'otherCost', 'discount'] as const) {
                if (payload[k] !== undefined) p[k] = money(payload[k]);
            }
            if (payload.otherCostLabel !== undefined) p.otherCostLabel = str(payload.otherCostLabel);

            applyTotals(p);
        });
        return this.getOne(id);
    },

    async remove(id: string) {
        const p: any = await Purchase.findById(id).lean();
        if (!p) throw new AppError(404, 'Purchase not found');
        const reason = deleteBlockReason(p);
        if (reason) throw new AppError(409, reason);
        // Only if nothing changed since we checked.
        const res = await Purchase.deleteOne({ _id: p._id, __v: p.__v });
        if (!res.deletedCount) throw new AppError(409, 'This purchase changed while deleting — please try again');
        return { reference: p.reference };
    },

    async addPayment(id: string, payload: any, userId?: string) {
        notInFuture(payload.date, 'The payment date');
        await mutatePurchase(id, (p) => {
            const amount = round2(Number(payload.amount));
            assertPaymentFits({ status: p.status, ...computeTotals(p) }, amount);
            p.payments.push({
                amount,
                date: dhakaDayStart(payload.date || dhakaToday()),
                method: payload.method || 'cash',
                reference: str(payload.reference),
                note: str(payload.note),
                createdBy: userId || null,
            });
            applyTotals(p);
        });
        return this.getOne(id);
    },

    async removePayment(id: string, paymentId: string) {
        await mutatePurchase(id, (p) => {
            const payment = p.payments.id(paymentId);
            if (!payment) throw new AppError(404, 'Payment not found');
            p.payments.pull(paymentId);
            applyTotals(p);
        });
        return this.getOne(id);
    },

    async cancel(id: string, reason?: string) {
        await mutatePurchase(id, (p) => {
            if (p.status === 'cancelled') throw new AppError(400, 'This purchase is already cancelled');
            if (hasReceipts(p)) throw new AppError(400, 'Goods have already been received on this purchase, so it cannot be cancelled');
            p.status = 'cancelled';
            p.cancelledAt = new Date();
            p.cancelReason = str(reason);
            applyTotals(p);
        });
        return this.getOne(id);
    },

    /**
     * Goods arrived. The receipt is saved first (version-checked, so two people can't
     * receive the same units), then each line flagged for stock is added through the
     * Inventory module — compare-and-set stock, moving-average cost and a ledger row
     * reading "Purchase <reference>" — at its landed cost in BDT. A line whose stock-in
     * fails keeps the receipt and records why on the line.
     */
    async receive(
        id: string,
        payload: { warehouse: string; date?: string; addToStock?: boolean; note?: string; lines: ReceiveLineInput[] },
        userId?: string,
    ) {
        const warehouse: any = await Warehouse.findById(payload.warehouse).select('name isActive').lean();
        if (!warehouse) throw new AppError(404, 'Warehouse not found');
        if (warehouse.isActive === false) throw new AppError(400, `"${warehouse.name}" is inactive — choose another warehouse or activate it`);
        notInFuture(payload.date, 'The date received');

        const addToStock = payload.addToStock !== false;
        type Planned = { index: number; productId: string; variantId: string | null; qty: number; unitCost: number; name: string };
        let plan: Planned[] = [];
        let receiptId: Types.ObjectId | null = null;
        let reference = '';

        await mutatePurchase(id, async (p) => {
            plan = [];
            const blocked = receiveBlockReason(p);
            if (blocked) throw new AppError(400, blocked);
            checkReceiveLines(p.items, payload.lines);

            const indexOf = new Map<string, number>(p.items.map((i: any, k: number) => [String(i._id), k]));
            const productIds = [...new Set(payload.lines
                .map((l) => p.items[indexOf.get(String(l.itemId))!]?.product)
                .filter(Boolean)
                .map(String))];
            const products: any[] = productIds.length
                ? await Product.find({ _id: { $in: productIds } })
                    .select('name isDeleted variants._id variants.label variants.color variants.size')
                    .lean()
                : [];
            const productById = new Map(products.map((x) => [String(x._id), x]));
            const landed = landedUnitCosts(p);

            const lines = payload.lines.map((l, index) => {
                const k = indexOf.get(String(l.itemId))!;
                const item = p.items[k];
                const line: any = {
                    itemId: item._id, qty: l.qty, variantId: item.variantId || null, variantLabel: item.variantLabel || '',
                    unitCost: landed[k], stocked: false, stockNote: '',
                };
                if (item.variantId && l.variantId && String(item.variantId) !== String(l.variantId)) {
                    throw new AppError(400, `"${item.name}" was ordered as ${item.variantLabel || 'one variant'} — it is received as that variant`);
                }
                const wantStock = addToStock && !l.skipStock;
                if (addToStock && l.skipStock) line.stockNote = 'Not added to stock (chosen when receiving)';
                if (!item.product) {
                    if (wantStock) line.stockNote = 'Not a catalogue product — no stock to update';
                    return line;
                }

                const product = productById.get(String(item.product));
                if (!product || product.isDeleted) {
                    if (wantStock) line.stockNote = 'The product has been deleted — stock not added';
                    return line;
                }
                const variants = product.variants || [];
                const wanted = item.variantId || l.variantId || null;
                let variant: any = null;
                if (variants.length && wanted) {
                    variant = variants.find((v: any) => String(v._id) === String(wanted)) || null;
                    if (!variant && wantStock) {
                        throw new AppError(400, `The variant chosen for "${item.name}" no longer exists — choose another, or don't add it to stock`);
                    }
                } else if (variants.length && wantStock) {
                    throw new AppError(400, `"${item.name}" has variants — choose which one arrived, or don't add it to stock`);
                }
                if (variant) {
                    line.variantId = variant._id;
                    line.variantLabel = variantLabel(variant);
                }
                if (wantStock) {
                    plan.push({
                        index,
                        productId: String(product._id),
                        // A product whose variants were removed since ordering takes the stock on its total.
                        variantId: variant ? String(variant._id) : null,
                        qty: l.qty,
                        unitCost: landed[k],
                        name: item.name + (variant ? ` (${variantLabel(variant)})` : ''),
                    });
                }
                return line;
            });

            for (const l of payload.lines) {
                const item = p.items[indexOf.get(String(l.itemId))!];
                item.receivedQty = (item.receivedQty || 0) + l.qty;
            }
            const receipt = p.receipts.create({
                date: dhakaDayStart(payload.date || dhakaToday()),
                warehouse: warehouse._id,
                lines,
                addedToStock: false,
                note: str(payload.note),
                createdBy: userId || null,
            });
            p.receipts.push(receipt);
            receiptId = receipt._id;
            p.status = statusFromReceipts(p.items);
            reference = p.reference;
            applyTotals(p);
        });

        // Stock, one line at a time, after the receipt is safely saved.
        const outcomes: (Planned & { ok: boolean; error?: string })[] = [];
        for (const s of plan) {
            try {
                await InventoryService.stockIn(
                    {
                        productId: s.productId,
                        variantId: s.variantId,
                        quantity: s.qty,
                        // A free line (landed cost 0) leaves the product's average cost alone.
                        unitCost: s.unitCost > 0 ? s.unitCost : null,
                        note: `Purchase ${reference}`,
                    },
                    userId,
                );
                outcomes.push({ ...s, ok: true });
            } catch (e: any) {
                outcomes.push({ ...s, ok: false, error: e?.message || 'unknown error' });
            }
        }
        if (outcomes.length && receiptId) {
            const set: Record<string, unknown> = { 'receipts.$[r].addedToStock': outcomes.some((o) => o.ok) };
            for (const o of outcomes) {
                set[`receipts.$[r].lines.${o.index}.stocked`] = o.ok;
                if (!o.ok) set[`receipts.$[r].lines.${o.index}.stockNote`] = `Stock not added: ${o.error}`.slice(0, 300);
            }
            try {
                await Purchase.updateOne({ _id: id }, { $set: set, $inc: { __v: 1 } }, { arrayFilters: [{ 'r._id': receiptId }] });
            } catch (e: any) {
                // The stock itself moved; only this bookkeeping flag is missing.
                console.error('[purchase] could not record stock outcome on the receipt:', e?.message || e);
            }
        }

        const failed = outcomes.filter((o) => !o.ok);
        return {
            purchase: await this.getOne(id),
            stocked: outcomes.filter((o) => o.ok).map((o) => ({ name: o.name, qty: o.qty, unitCost: o.unitCost })),
            warnings: failed.map((o) => `${o.name}: stock not added — ${o.error}. Add it on the Inventory page.`),
        };
    },

    /**
     * Money totals for the Accounts overview: placed purchases (confirmed, partially
     * received, received — drafts and cancelled ones excluded), dated by orderDate.
     * from/to as 'YYYY-MM-DD' are Dhaka calendar days, both inclusive; as Date objects
     * they are exact instants, from inclusive and to exclusive. Both optional.
     */
    async totals(opts: { from?: string | Date; to?: string | Date } = {}): Promise<{ total: number; paid: number; due: number; count: number }> {
        const match: Record<string, any> = { status: { $in: MONEY_STATUSES } };
        const range = dateRange(opts.from, opts.to);
        if (range) match.orderDate = range;
        const [r] = await Purchase.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: '$grandTotal' }, paid: { $sum: '$paid' }, due: { $sum: '$due' }, count: { $sum: 1 } } },
        ]);
        return { total: round2(r?.total || 0), paid: round2(r?.paid || 0), due: round2(r?.due || 0), count: r?.count || 0 };
    },

    /**
     * Cash paid to suppliers, dated by each payment's own date (any purchase status —
     * money paid on a later-cancelled PO still left the business until it is removed).
     * Same from/to rules as totals().
     */
    async paymentsMade(opts: { from?: string | Date; to?: string | Date } = {}): Promise<{ amount: number; count: number }> {
        const pipeline: any[] = [{ $match: { 'payments.0': { $exists: true } } }, { $unwind: '$payments' }];
        const range = dateRange(opts.from, opts.to);
        if (range) pipeline.push({ $match: { 'payments.date': range } });
        pipeline.push({ $group: { _id: null, amount: { $sum: '$payments.amount' }, count: { $sum: 1 } } });
        const [r] = await Purchase.aggregate(pipeline);
        return { amount: round2(r?.amount || 0), count: r?.count || 0 };
    },
};

export default PurchaseService;
