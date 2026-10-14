import { CourierPayout } from './courierPayout.model';
import { Order } from '../order/order.model';
import SteadfastService from '../courier/steadfast.service';
import AppError from '../../utils/AppError';

/* ─────────────────────────────────────────────────────────────────────
 * Reading a Steadfast payment statement
 *
 * Steadfast's docs don't pin down the JSON of GET /payments/{id}, so the
 * statement is read defensively: every figure is looked up under the names
 * Steadfast uses elsewhere (cod_amount, delivery_charge, cod_charge …), first
 * on the payment itself and then summed over its consignments. If the answer
 * holds no COD figure at all we refuse with a 502 and save nothing, rather than
 * record a wrong number.
 * ──────────────────────────────────────────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 3,14,210.50 / "৳ 1,000" / 1000 → number; anything else → null. */
function num(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
        const s = v.replace(/[৳,\s]|tk|bdt/gi, '');
        if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** First key in `keys` holding a usable number. */
function pickNum(o: Record<string, any> | undefined, keys: string[]): number | null {
    if (!o) return null;
    for (const k of keys) {
        const n = num(o[k]);
        if (n !== null) return n;
    }
    return null;
}

function pickStr(o: Record<string, any> | undefined, keys: string[]): string {
    if (!o) return '';
    for (const k of keys) {
        const v = o[k];
        if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v).trim();
    }
    return '';
}

/** Sum a field over the consignments; null when no consignment carries it. */
function sumNum(list: Record<string, any>[], keys: string[]): number | null {
    let seen = false;
    let total = 0;
    for (const c of list) {
        const n = pickNum(c, keys);
        if (n !== null) { seen = true; total += n; }
    }
    return seen ? total : null;
}

/** Steadfast's timestamps carry no zone and are Bangladesh time (UTC+6). */
function parseBdDate(v: unknown): Date | null {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    if (typeof v !== 'string' || !v.trim()) return null;
    let s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00+06:00`;
    else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = `${s.replace(' ', 'T')}+06:00`;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

const KEYS = {
    cod: {
        payment: ['total_cod_amount', 'total_cod', 'cod_amount', 'total_collected_amount', 'collected_amount', 'total_collection', 'total_cash_collection', 'cash_collection'],
        parcel: ['cod_amount', 'collected_amount', 'cash_collection', 'collection_amount', 'amount_collected'],
    },
    bills: {
        payment: ['total_delivery_charge', 'delivery_charge', 'total_delivery_fee', 'delivery_fee', 'total_delivery_bill', 'delivery_bill', 'delivery_charges'],
        parcel: ['delivery_charge', 'delivery_fee', 'delivery_bill', 'shipping_charge'],
    },
    fee: {
        payment: ['total_cod_charge', 'cod_charge', 'total_cod_fee', 'cod_fee', 'total_cod_commission', 'cod_commission'],
        parcel: ['cod_charge', 'cod_fee', 'cod_commission'],
    },
    paid: ['paid_amount', 'total_paid_amount', 'payable_amount', 'net_payable', 'net_amount', 'payment_amount', 'total_amount', 'amount'],
    date: ['paid_at', 'payment_date', 'paid_date', 'date', 'created_at', 'updated_at'],
    parcelId: ['consignment_id', 'cid', 'id'],
    tracking: ['tracking_code', 'tracking_id', 'tracking_number'],
    invoice: ['invoice', 'invoice_id', 'merchant_invoice'],
    parcelStatus: ['delivery_status', 'status'],
};

/** Locate the payment object and its consignment list inside whatever came back. */
function unwrap(data: any): { payment: Record<string, any>; parcels: Record<string, any>[] } {
    const layers = [data?.data?.payment, data?.payment, data?.data, data];
    const payment = (layers.find(isObj) || {}) as Record<string, any>;
    const lists = [
        payment.consignments, payment.consignment, payment.parcels, payment.items, payment.orders,
        data?.consignments, data?.data?.consignments,
        Array.isArray(data?.data) ? data.data : null,
    ];
    const parcels = ((lists.find((l) => Array.isArray(l)) || []) as unknown[]).filter(isObj);
    return { payment, parcels };
}

export interface MappedStatement {
    codCollected: number;
    deliveryBills: number;
    codFee: number;
    amount: number;
    parcelCount: number;
    receivedAt: Date | null;
    warnings: string[];
}

function mapStatement(data: any): MappedStatement {
    const { payment, parcels } = unwrap(data);
    const warnings: string[] = [];

    const cod = pickNum(payment, KEYS.cod.payment) ?? sumNum(parcels, KEYS.cod.parcel);
    let bills = pickNum(payment, KEYS.bills.payment) ?? sumNum(parcels, KEYS.bills.parcel);
    let fee = pickNum(payment, KEYS.fee.payment) ?? sumNum(parcels, KEYS.fee.parcel);
    const paid = pickNum(payment, KEYS.paid);

    if (cod === null) {
        throw new AppError(
            502,
            'Steadfast answered, but not with a payment statement we can read (no COD figure in it). Nothing was saved. Record this payout manually instead.'
        );
    }

    // Fill one missing charge from Steadfast's own paid-out total when we can.
    if (paid !== null) {
        if (bills === null && fee !== null) bills = round2(cod - paid - fee);
        else if (fee === null && bills !== null) fee = round2(cod - paid - bills);
        else if (bills === null && fee === null) {
            bills = round2(cod - paid);
            fee = 0;
            warnings.push('Steadfast did not split its charges, so the whole deduction is shown as delivery bills.');
        }
    }
    if (bills === null) {
        throw new AppError(
            502,
            'Steadfast\'s statement has COD figures but no delivery charges we can read. Nothing was saved. Record this payout manually instead.'
        );
    }
    if (fee === null) {
        fee = 0;
        warnings.push('The statement shows no COD fee, so it was taken as ৳0.');
    }
    if (bills < 0 || fee < 0) {
        throw new AppError(502, 'Steadfast\'s figures don\'t add up (a charge came out negative). Nothing was saved. Record this payout manually instead.');
    }

    const amount = round2(cod - bills - fee);
    if (paid !== null && Math.abs(paid - amount) > 1) {
        warnings.push(`Steadfast's own total (৳${paid}) differs from COD − charges (৳${amount}); the amount is stored as COD − charges.`);
    }

    const receivedAt = parseBdDate(pickStr(payment, KEYS.date));
    return {
        codCollected: round2(cod),
        deliveryBills: round2(bills),
        codFee: round2(fee),
        amount,
        parcelCount: parcels.length,
        receivedAt,
        warnings,
    };
}

/* ─── References ─────────────────────────────────────────────────────── */

/**
 * A Steadfast payment id as we store it: "sfc-31801786" / "SFC31801786" / "31801786" →
 * "SFC-31801786". Only for ids known to be Steadfast's (a pull from their API).
 */
function canonicalRef(ref: string): string {
    const s = String(ref || '').trim().toUpperCase();
    const m = s.match(/^(?:SFC-?)?(\d+)$/);
    return m ? `SFC-${m[1]}` : s;
}

/**
 * A reference typed on a manual payout. Only one that is clearly a Steadfast id ("SFC…")
 * is canonicalised; anything else — a bank or transfer reference, even an all-digit one —
 * is kept as typed, so it never poses as (and later blocks) a real Steadfast statement.
 */
function manualRef(ref: string): string {
    const s = String(ref || '').trim();
    return /^SFC-?\d+$/i.test(s) ? canonicalRef(s) : s;
}

/** Steadfast ids are always stored canonically (see above), so an exact match finds a duplicate. */
async function assertRefFree(ref: string, exceptId?: string) {
    if (!ref) return;
    const q: any = { reference: ref };
    if (exceptId) q._id = { $ne: exceptId };
    const dup: any = await CourierPayout.findOne(q).select('reference receivedAt').lean();
    if (dup) {
        const when = new Date(dup.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });
        throw new AppError(409, `${dup.reference} is already recorded (received ${when}).`);
    }
}

/** A unique-index race still reads as a friendly duplicate message. */
function rethrowDuplicate(e: any, ref: string): never {
    if (e?.code === 11000) throw new AppError(409, `${ref} is already recorded.`);
    throw e;
}

/* ─── Periods ────────────────────────────────────────────────────────── */

function dateRange(from?: string, to?: string) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lt = new Date(to);
    return Object.keys(range).length ? range : null;
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Delivered orders in a period, dated by their "delivered" timeline entry. */
async function deliveredOrderTotals(range: Record<string, Date> | null) {
    const pipeline: any[] = [
        { $match: { status: 'delivered' } },
        {
            $addFields: {
                deliveredAt: {
                    $ifNull: [
                        {
                            $max: {
                                $map: {
                                    input: { $filter: { input: { $ifNull: ['$timeline', []] }, as: 't', cond: { $eq: ['$$t.status', 'delivered'] } } },
                                    as: 't',
                                    in: '$$t.createdAt',
                                },
                            },
                        },
                        '$updatedAt',
                    ],
                },
                viaSteadfast: {
                    $gt: [
                        { $size: { $filter: { input: { $ifNull: ['$packages', []] }, as: 'p', cond: { $gt: [{ $ifNull: ['$$p.consignmentId', ''] }, ''] } } } },
                        0,
                    ],
                },
            },
        },
    ];
    if (range) pipeline.push({ $match: { deliveredAt: range } });
    pipeline.push({
        $group: {
            _id: null,
            orders: { $sum: 1 },
            viaSteadfast: { $sum: { $cond: ['$viaSteadfast', 1, 0] } },
            shippingCharged: { $sum: { $ifNull: ['$shippingCost', 0] } },
            codOrders: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, 1, 0] } },
            codExpected: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, { $ifNull: ['$total', 0] }, 0] } },
        },
    });
    const [row] = await Order.aggregate(pipeline);
    return {
        orders: row?.orders || 0,
        viaSteadfast: row?.viaSteadfast || 0,
        shippingCharged: round2(row?.shippingCharged || 0),
        codOrders: row?.codOrders || 0,
        codExpected: round2(row?.codExpected || 0),
    };
}

async function payoutTotals(match: Record<string, any>) {
    const [row] = await CourierPayout.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                count: { $sum: 1 },
                received: { $sum: '$amount' },
                // A manual payout may be recorded without a breakdown (COD collected = 0):
                // its money is real, but it can't be set against COD collected or charges.
                receivedWithBreakdown: { $sum: { $cond: [{ $gt: ['$codCollected', 0] }, '$amount', 0] } },
                withoutBreakdown: { $sum: { $cond: [{ $gt: ['$codCollected', 0] }, 0, 1] } },
                codCollected: { $sum: '$codCollected' },
                deliveryBills: { $sum: '$deliveryBills' },
                codFee: { $sum: '$codFee' },
                parcels: { $sum: '$parcelCount' },
                steadfast: { $sum: { $cond: [{ $eq: ['$source', 'steadfast'] }, 1, 0] } },
                lastReceivedAt: { $max: '$receivedAt' },
            },
        },
    ]);
    return {
        count: row?.count || 0,
        steadfast: row?.steadfast || 0,
        manual: (row?.count || 0) - (row?.steadfast || 0),
        received: round2(row?.received || 0),
        receivedWithBreakdown: round2(row?.receivedWithBreakdown || 0),
        withoutBreakdown: row?.withoutBreakdown || 0,
        codCollected: round2(row?.codCollected || 0),
        deliveryBills: round2(row?.deliveryBills || 0),
        codFee: round2(row?.codFee || 0),
        parcels: row?.parcels || 0,
        lastReceivedAt: row?.lastReceivedAt || null,
    };
}

/* ─── Service ────────────────────────────────────────────────────────── */

const CourierPayoutService = {
    async list(opts: { from?: string; to?: string; source?: string; search?: string; page?: string | number; limit?: string | number }) {
        const page = Math.max(1, Number(opts.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
        const range = dateRange(opts.from, opts.to);

        // Period + source drive the totals; search only narrows the table.
        const periodMatch: Record<string, any> = {};
        if (range) periodMatch.receivedAt = range;
        const scopedMatch: Record<string, any> = { ...periodMatch };
        if (opts.source === 'steadfast' || opts.source === 'manual') scopedMatch.source = opts.source;
        const rowMatch: Record<string, any> = { ...scopedMatch };
        if (opts.search?.trim()) {
            const rx = new RegExp(escapeRx(opts.search.trim()), 'i');
            rowMatch.$or = [{ reference: rx }, { note: rx }];
        }

        const [payouts, total, summary, periodPayouts, orders] = await Promise.all([
            CourierPayout.find(rowMatch)
                .select('-raw')
                .sort({ receivedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('createdBy', 'firstName lastName')
                .lean(),
            CourierPayout.countDocuments(rowMatch),
            payoutTotals(scopedMatch),
            // Economics always compares ALL payouts of the period with the orders of the period.
            opts.source === 'steadfast' || opts.source === 'manual' ? payoutTotals(periodMatch) : null,
            deliveredOrderTotals(range),
        ]);

        const all = periodPayouts || summary;
        const paidToCourier = round2(all.deliveryBills + all.codFee);
        const economics = {
            // Delivery: what customers paid us for delivery vs what the courier billed us.
            shippingCharged: orders.shippingCharged,
            deliveredOrders: orders.orders,
            deliveredViaSteadfast: orders.viaSteadfast,
            deliveryBills: all.deliveryBills,
            codFee: all.codFee,
            paidToCourier,
            deliveryNet: round2(orders.shippingCharged - paidToCourier),
            // Cash: what the courier collected at the door vs what reached us — compared only
            // over payouts that carry a breakdown. Payouts without one are counted apart:
            // their charges are unknown, so they are also missing from paidToCourier.
            codCollected: all.codCollected,
            received: all.received,
            receivedWithBreakdown: all.receivedWithBreakdown,
            keptByCourier: round2(all.codCollected - all.receivedWithBreakdown),
            withoutBreakdown: all.withoutBreakdown,
            receivedWithoutBreakdown: round2(all.received - all.receivedWithBreakdown),
            // Our own books, for reconciliation: delivered COD orders in the period.
            codOrders: orders.codOrders,
            codExpected: orders.codExpected,
        };

        return {
            data: { payouts, summary, economics },
            meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    },

    /** One payout with its statement's parcels matched against our orders. */
    async getOne(id: string) {
        const payout: any = await CourierPayout.findById(id).populate('createdBy', 'firstName lastName').lean();
        if (!payout) throw new AppError(404, 'Payout not found');

        const { parcels: rawParcels } = unwrap(payout.raw);
        const parcels = rawParcels.map((c) => ({
            consignmentId: pickStr(c, KEYS.parcelId),
            trackingCode: pickStr(c, KEYS.tracking),
            invoice: pickStr(c, KEYS.invoice),
            status: pickStr(c, KEYS.parcelStatus),
            codCollected: pickNum(c, KEYS.cod.parcel) ?? 0,
            deliveryCharge: pickNum(c, KEYS.bills.parcel) ?? 0,
            codFee: pickNum(c, KEYS.fee.parcel) ?? 0,
        }));

        // Match parcels to our orders by consignment id, falling back to the invoice
        // we sent when booking ("KM-0001-ab12c" → order "KM-0001").
        const cids = parcels.map((p) => p.consignmentId).filter(Boolean);
        const orderNos = parcels.map((p) => p.invoice.split('-').slice(0, 2).join('-')).filter(Boolean);
        const orders: any[] = parcels.length
            ? await Order.find({ $or: [{ 'packages.consignmentId': { $in: cids } }, { orderId: { $in: orderNos } }] })
                .select('orderId total shippingCost paymentMethod status packages.consignmentId')
                .lean()
            : [];
        const byCid = new Map<string, any>();
        const byNo = new Map<string, any>();
        for (const o of orders) {
            byNo.set(o.orderId, o);
            for (const p of o.packages || []) if (p.consignmentId) byCid.set(String(p.consignmentId), o);
        }

        return {
            ...payout,
            parcels: parcels.map((p) => {
                const o = byCid.get(p.consignmentId) || byNo.get(p.invoice.split('-').slice(0, 2).join('-'));
                return {
                    ...p,
                    order: o ? {
                        _id: o._id,
                        orderId: o.orderId,
                        total: o.total,
                        shippingCost: o.shippingCost || 0,
                        paymentMethod: o.paymentMethod,
                        status: o.status,
                    } : null,
                };
            }),
        };
    },

    async createManual(payload: any, userId?: string) {
        const reference = payload.reference ? manualRef(payload.reference) : '';
        await assertRefFree(reference);
        try {
            return await CourierPayout.create({
                receivedAt: new Date(payload.receivedAt),
                source: 'manual',
                reference,
                codCollected: payload.codCollected ?? 0,
                deliveryBills: payload.deliveryBills ?? 0,
                codFee: payload.codFee ?? 0,
                amount: round2(payload.amount),
                note: payload.note || '',
                createdBy: userId || null,
            });
        } catch (e) {
            rethrowDuplicate(e, reference);
        }
    },

    /** Fetch one payment from Steadfast (read-only on their side) and store it. */
    async pullFromSteadfast(paymentId: string, note: string | undefined, userId?: string) {
        const reference = canonicalRef(paymentId);
        await assertRefFree(reference);   // don't even ask Steadfast for a statement we already have

        const { data } = await SteadfastService.getPayment(paymentId);
        const m = mapStatement(data);

        try {
            const payout = await CourierPayout.create({
                receivedAt: m.receivedAt || new Date(),
                source: 'steadfast',
                reference,
                codCollected: m.codCollected,
                deliveryBills: m.deliveryBills,
                codFee: m.codFee,
                amount: m.amount,
                parcelCount: m.parcelCount,
                note: note || '',
                raw: data,
                createdBy: userId || null,
            });
            const warnings = [...m.warnings];
            if (!m.receivedAt) warnings.push('The statement has no date, so today was used. Edit it if the money arrived earlier.');
            const plain: any = payout.toObject();
            delete plain.raw;
            return { payout: plain, warnings };
        } catch (e) {
            rethrowDuplicate(e, reference);
        }
    },

    async update(id: string, payload: any) {
        const payout: any = await CourierPayout.findById(id);
        if (!payout) throw new AppError(404, 'Payout not found');

        if (payload.reference !== undefined) {
            const reference = payload.reference ? manualRef(payload.reference) : '';
            if (payout.source === 'steadfast' && !reference) {
                throw new AppError(400, 'A payout pulled from Steadfast keeps its payment id.');
            }
            await assertRefFree(reference, id);
            payout.reference = reference;
        }
        if (payload.receivedAt !== undefined) payout.receivedAt = new Date(payload.receivedAt);
        if (payload.note !== undefined) payout.note = payload.note;
        for (const k of ['codCollected', 'deliveryBills', 'codFee'] as const) {
            if (payload[k] !== undefined) payout[k] = round2(payload[k]);
        }

        if (payout.source === 'steadfast') {
            // A statement's amount is always its own arithmetic.
            payout.amount = round2(payout.codCollected - payout.deliveryBills - payout.codFee);
        } else if (payload.amount !== undefined) {
            payout.amount = round2(payload.amount);
        }

        try {
            await payout.save();
        } catch (e) {
            rethrowDuplicate(e, payout.reference);
        }
        const plain: any = payout.toObject();
        delete plain.raw;
        return plain;
    },

    async delete(id: string) {
        const payout = await CourierPayout.findByIdAndDelete(id).select('-raw');
        if (!payout) throw new AppError(404, 'Payout not found');
        return payout;
    },
};

// Pure helpers, exported for tests.
export { mapStatement, canonicalRef, manualRef, parseBdDate };

export default CourierPayoutService;
