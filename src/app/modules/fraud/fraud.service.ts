import { Types } from 'mongoose';
import { FraudFlag } from './fraud.model';
import { Order } from '../order/order.model';
import { User } from '../user/user.model';
import { ReturnRequest } from '../return/return.model';
import OrderService from '../order/order.service';
import AppError from '../../utils/AppError';
import {
    CANCELLABLE_STATUSES,
    FLAG_STATUSES,
    OPEN_STATUSES,
    Identity,
    MatchKind,
    accountKinds,
    cancelEligibility,
    emailPattern,
    escapeRegex,
    evaluate,
    identityOf,
    matchableEmail,
    matchedBy,
    normalizePhone,
    parseLookupQuery,
    phonePattern,
    phoneSearchDigits,
    returnInfo,
    summarizeHistory,
} from './fraud.rules';

/* ─────────────────────────────────────────────────────────────────────
 * Fraud check. Flags an order when its customer (same account, phone or email)
 * returned an order on this store before. The rules live in fraud.rules.ts.
 *
 * Everything is based on this store's own orders. Steadfast's public API (v1)
 * has no courier-history / fraud-check endpoint, so none is called.
 * ──────────────────────────────────────────────────────────────────── */

/** How many of a customer's orders are read at most (newest first). */
const MAX_CUSTOMER_ORDERS = 500;
/** How many open orders one re-scan checks at most, and how many at a time. */
const SCAN_LIMIT = 500;
const SCAN_CONCURRENCY = 5;

const ORDER_FIELDS = 'orderId user status total paymentMethod createdAt updatedAt shippingAddress.fullName shippingAddress.phone shippingAddress.email packages.status packages.consignmentId packages.courierBookedAt packages.timeline timeline';

const round2 = (n: number) => Math.round(n * 100) / 100;
const isId = (v: unknown) => typeof v === 'string' && Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v);

/**
 * Every order that belongs to this identity: the account's own orders, orders from
 * other accounts with the same phone / email, and orders shipped to the same phone /
 * email. Regex hits are re-checked with the exact rules (matchedBy).
 */
async function findCustomerOrders(identity: Identity, excludeOrderId?: unknown) {
    const accountOr: Record<string, unknown>[] = [
        ...identity.phones.map((p) => ({ phone: { $regex: phonePattern(p) } })),
        ...identity.emails.map((e) => ({ email: { $regex: emailPattern(e), $options: 'i' } })),
    ];
    const accounts = accountOr.length
        ? await User.find({ $or: accountOr }).select('_id phone email').limit(50).lean()
        : [];
    const accountMatch = new Map<string, MatchKind[]>();
    for (const a of accounts as any[]) {
        const kinds = accountKinds(a, identity);
        if (kinds.length) accountMatch.set(String(a._id), kinds);
    }

    const userIds = Array.from(new Set([identity.user, ...accountMatch.keys()].filter(isId)));
    const orderOr: Record<string, unknown>[] = [
        ...(userIds.length ? [{ user: { $in: userIds.map((id) => new Types.ObjectId(id)) } }] : []),
        ...identity.phones.map((p) => ({ 'shippingAddress.phone': { $regex: phonePattern(p) } })),
        ...identity.emails.map((e) => ({ 'shippingAddress.email': { $regex: emailPattern(e), $options: 'i' } })),
    ];
    if (!orderOr.length) return { orders: [] as any[], accountMatch };

    const filter: Record<string, unknown> = { $or: orderOr };
    if (excludeOrderId) filter._id = { $ne: excludeOrderId };
    const found = await Order.find(filter).select(ORDER_FIELDS).sort({ createdAt: -1 }).limit(MAX_CUSTOMER_ORDERS).lean();
    const orders = (found as any[]).filter((o) => matchedBy(identity, o, accountMatch).length > 0);
    return { orders, accountMatch };
}

/** Return requests on these orders (every status; the rules decide which count). */
async function requestsFor(orders: any[]) {
    if (!orders.length) return [];
    return ReturnRequest.find({ order: { $in: orders.map((o) => o._id) } })
        .select('order status reason resolvedAt createdAt updatedAt')
        .lean();
}

function paginate(query: Record<string, unknown>) {
    const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

/** Run `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
    let i = 0;
    const worker = async () => {
        while (i < items.length) {
            const item = items[i++];
            await fn(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/**
 * A flag as the admin list shows it: the live order joined in, whether it can be
 * cancelled, and whether the order is still open (a flag left in review on an order
 * that was cancelled or delivered elsewhere has nothing left to check).
 */
function present(flag: any) {
    const o = flag.order && typeof flag.order === 'object' && flag.order._id ? flag.order : null;
    const { ok } = cancelEligibility(o);
    return {
        ...flag,
        order: o
            ? { _id: o._id, orderId: o.orderId, status: o.status, total: o.total, paymentMethod: o.paymentMethod, createdAt: o.createdAt }
            : null,
        cancellable: flag.status !== 'cancelled' && !!o && ok,
        orderOpen: !!o && OPEN_STATUSES.includes(o.status),
    };
}

/** What a flag becomes when its order closes outside Fraud check, and the note it gets. */
function autoClose(orderStatus: string, existingNote?: string) {
    const what = String(orderStatus || 'closed').replace(/_/g, ' ');
    const auto = `Closed automatically: the order was ${what} outside Fraud check`;
    const note = existingNote ? `${existingNote} · ${auto}` : auto;
    return {
        status: orderStatus === 'cancelled' ? 'cancelled' : 'cleared',
        reviewNote: note.slice(0, 500),
    };
}

async function notifyAdmins(flag: any) {
    const { NotificationService } = require('../notification/notification.service');
    const admins = await User.find({ role: { $in: ['admin', 'superadmin', 'editor'] }, isDeleted: { $ne: true } }).select('_id').lean();
    const n = flag.returnCount;
    for (const admin of admins as any[]) {
        await NotificationService.notify({
            user: admin._id,
            type: 'fraud_flag',
            title: 'Order needs a fraud check',
            message: `Order ${flag.orderRef} is from a customer who returned ${n} order${n === 1 ? '' : 's'} before.`,
            link: `/dashboard/admin/fraud-check?search=${encodeURIComponent(flag.orderRef)}&status=all`,
            meta: { orderId: String(flag.order), flagId: String(flag._id) },
        });
    }
}

const FraudService = {
    /**
     * Check one order and flag it when its customer returned an order before.
     * Called fire-and-forget right after checkout, so it NEVER throws: every failure
     * becomes 'error'. Idempotent: an order already flagged is left alone.
     */
    async checkOrder(order: any, opts: { notify?: boolean } = {}): Promise<'flagged' | 'clean' | 'exists' | 'error'> {
        try {
            if (!order?._id) return 'clean';
            if (await FraudFlag.exists({ order: order._id })) return 'exists';

            const userId = order.user?._id || order.user;
            const account: any = userId ? await User.findById(userId).select('phone email firstName lastName').lean() : null;
            const identity = identityOf(order, account);
            const { orders, accountMatch } = await findCustomerOrders(identity, order._id);
            if (!orders.length) return 'clean';
            const requests = await requestsFor(orders);
            const result = evaluate(identity, orders, requests, accountMatch, order._id);
            if (!result.returnCount) return 'clean';

            const a = order.shippingAddress || {};
            let flag;
            try {
                flag = await FraudFlag.create({
                    order: order._id,
                    orderRef: order.orderId || String(order._id),
                    customer: {
                        name: a.fullName || [account?.firstName, account?.lastName].filter(Boolean).join(' '),
                        phone: normalizePhone(a.phone) || String(a.phone || '').trim(),
                        email: matchableEmail(a.email) || matchableEmail(account?.email),
                        user: userId || null,
                    },
                    matchedBy: result.matchedBy,
                    previousReturns: result.previousReturns,
                    returnCount: result.returnCount,
                    previousOrderCount: result.previousOrderCount,
                });
            } catch (err: any) {
                if (err?.code === 11000) return 'exists';   // raced with another check: fine
                throw err;
            }

            if (opts.notify) notifyAdmins(flag).catch(() => {});
            return 'flagged';
        } catch (err: any) {
            console.error(`[fraud] check failed for order ${String(order?._id)}: ${err?.message || err}`);
            return 'error';
        }
    },

    async list(query: Record<string, unknown>) {
        const { page, limit, skip } = paginate(query);
        const filter: Record<string, unknown> = {};
        const status = String(query.status || 'review');
        if ((FLAG_STATUSES as readonly string[]).includes(status)) filter.status = status;

        const search = String(query.search || '').trim();
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: 'i' };
            const or: Record<string, unknown>[] = [
                { orderRef: rx },
                { 'customer.name': rx },
                { 'customer.email': rx },
            ];
            const digits = phoneSearchDigits(search);
            if (digits && !/[a-z@]/i.test(search)) or.push({ 'customer.phone': { $regex: escapeRegex(digits) } });
            filter.$or = or;
        }

        const [rows, total] = await Promise.all([
            FraudFlag.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('order', 'orderId status total paymentMethod createdAt packages.consignmentId')
                .populate('reviewedBy', 'firstName lastName')
                .lean(),
            FraudFlag.countDocuments(filter),
        ]);
        return {
            data: (rows as any[]).map(present),
            meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    },

    async summary() {
        const groups = await FraudFlag.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
        const out = { review: 0, cleared: 0, cancelled: 0, total: 0 };
        for (const g of groups as any[]) {
            if (g._id === 'review' || g._id === 'cleared' || g._id === 'cancelled') out[g._id] = g.n;
            out.total += g.n;
        }
        return out;
    },

    /** The flag for one order, or null (the admin order page shows a banner from it). */
    async getForOrder(orderId: string) {
        if (!isId(orderId)) throw new AppError(400, 'Not a valid order id');
        const flag = await FraudFlag.findOne({ order: orderId })
            .populate('order', 'orderId status total paymentMethod createdAt packages.consignmentId')
            .populate('reviewedBy', 'firstName lastName')
            .lean();
        return flag ? present(flag) : null;
    },

    /** Clear a flag (customer checked out fine) or put it back up for review. */
    async review(id: string, payload: { status: 'cleared' | 'review'; note?: string }, actorId?: string) {
        if (!isId(id)) throw new AppError(400, 'Not a valid flag id');
        if (payload.status !== 'cleared' && payload.status !== 'review') {
            throw new AppError(400, 'Status must be "cleared" or "review"');
        }
        const flag = await FraudFlag.findById(id);
        if (!flag) throw new AppError(404, 'Fraud flag not found');
        if (flag.status === 'cancelled') {
            throw new AppError(400, 'This order was already cancelled, so the flag is closed');
        }
        flag.status = payload.status;
        if (payload.note !== undefined) flag.reviewNote = String(payload.note).trim().slice(0, 500);
        flag.reviewedBy = (actorId || null) as any;
        flag.reviewedAt = new Date();
        await flag.save();
        return this.getForOrder(String(flag.order));
    },

    /**
     * Cancel the flagged order (only before it leaves the shop). Goes through
     * OrderService.updateOrderStatus, which restocks the items, writes the stock ledger
     * and tells the customer. The flag is claimed first, so two Fraud-check cancels can't
     * both run. The order itself is claimed atomically inside updateOrderStatus, with the
     * "still cancellable, not booked with Steadfast" rule as the guard, so a cancel from
     * the Orders page, the customer or a courier booking in the meantime makes this one
     * fail cleanly instead of restocking twice or cancelling a booked parcel.
     */
    async cancelOrder(id: string, note: string | undefined, actorId?: string) {
        if (!isId(id)) throw new AppError(400, 'Not a valid flag id');
        const flag = await FraudFlag.findById(id).lean();
        if (!flag) throw new AppError(404, 'Fraud flag not found');
        if ((flag as any).status === 'cancelled') throw new AppError(400, 'This order was already cancelled');

        const order = await Order.findById((flag as any).order).select('orderId status packages.consignmentId').lean();
        const check = cancelEligibility(order);
        if (!check.ok) throw new AppError(400, check.reason);

        const cleanNote = String(note || '').trim().slice(0, 500);
        const claimed = await FraudFlag.findOneAndUpdate(
            { _id: id, status: { $ne: 'cancelled' } },
            { $set: { status: 'cancelled', reviewNote: cleanNote || (flag as any).reviewNote, reviewedBy: actorId || null, reviewedAt: new Date() } },
            { new: true },
        );
        if (!claimed) throw new AppError(409, 'Someone else has just cancelled this order');

        try {
            await OrderService.updateOrderStatus(
                String((order as any)._id),
                'cancelled',
                `Cancelled from Fraud check${cleanNote ? `: ${cleanNote}` : ''}`,
                actorId,
                {
                    status: { $in: CANCELLABLE_STATUSES },
                    // no package booked with the courier yet
                    packages: { $not: { $elemMatch: { consignmentId: { $nin: [null, ''] } } } },
                },
            );
        } catch (err: any) {
            // Put the flag back the way it was: the order was not cancelled.
            await FraudFlag.updateOne(
                { _id: id, status: 'cancelled' },
                { $set: { status: (flag as any).status, reviewNote: (flag as any).reviewNote, reviewedBy: (flag as any).reviewedBy, reviewedAt: (flag as any).reviewedAt } },
            ).catch(() => {});
            if (err?.statusCode === 409) {
                throw new AppError(409, 'The order changed while you were cancelling it (it may have been cancelled elsewhere or booked with Steadfast). Reload and check it.');
            }
            throw err;
        }
        return this.getForOrder(String((order as any)._id));
    },

    /**
     * The order closed outside Fraud check (cancelled on the Orders page or by the
     * customer, delivered, returned…): close its flag if it is still waiting for review,
     * so the review list stays a to-do list. Called fire-and-forget from OrderService;
     * never throws. Open statuses are ignored.
     */
    async closeForOrder(orderId: unknown, orderStatus: string, actorId?: string | null) {
        try {
            if (!orderId || OPEN_STATUSES.includes(orderStatus)) return;
            const flag: any = await FraudFlag.findOne({ order: orderId, status: 'review' }).select('reviewNote').lean();
            if (!flag) return;
            await FraudFlag.updateOne(
                { _id: flag._id, status: 'review' },
                { $set: { ...autoClose(orderStatus, flag.reviewNote), reviewedBy: actorId || null, reviewedAt: new Date() } },
            );
        } catch (err: any) {
            console.error(`[fraud] could not close the flag for order ${String(orderId)}: ${err?.message || err}`);
        }
    },

    /**
     * Flag every open order that has no flag yet, and close flags still in review whose
     * order has closed since (a courier-synced delivery, for example). Safe to run again and again.
     */
    async scan() {
        let closed = 0;
        const waiting: any[] = await FraudFlag.find({ status: 'review' }).select('order reviewNote').populate('order', 'status').lean();
        for (const f of waiting) {
            const st = f.order && typeof f.order === 'object' ? String(f.order.status || '') : '';
            if (!st || OPEN_STATUSES.includes(st)) continue;   // still open, or the order was deleted
            const r = await FraudFlag.updateOne(
                { _id: f._id, status: 'review' },
                { $set: { ...autoClose(st, f.reviewNote), reviewedBy: null, reviewedAt: new Date() } },
            );
            if (r.modifiedCount) closed++;
        }

        const already = await FraudFlag.distinct('order');
        const open = await Order.find({ status: { $in: OPEN_STATUSES }, _id: { $nin: already } })
            .select('_id orderId user shippingAddress createdAt')
            .sort({ createdAt: -1 })
            .limit(SCAN_LIMIT)
            .lean();
        let flagged = 0;
        let errors = 0;
        await pool(open as any[], SCAN_CONCURRENCY, async (o) => {
            const r = await this.checkOrder(o);
            if (r === 'flagged') flagged++;
            else if (r === 'error') errors++;
        });
        return { scanned: open.length, flagged, errors, limited: open.length >= SCAN_LIMIT, closed };
    },

    /** This store's own history for a phone number or email. */
    async lookup(q: unknown) {
        const parsed = parseLookupQuery(q);
        if (!parsed) throw new AppError(400, 'Enter a full phone number (like 01712345678) or an email address');
        const identity: Identity = {
            user: '',
            phones: parsed.type === 'phone' ? [parsed.value] : [],
            emails: parsed.type === 'email' ? [parsed.value] : [],
        };

        const { orders } = await findCustomerOrders(identity);
        const requests = await requestsFor(orders);
        const history = summarizeHistory(orders, requests);
        const openFlags = orders.length
            ? await FraudFlag.countDocuments({ order: { $in: orders.map((o) => o._id) }, status: 'review' })
            : 0;

        const names = orders.map((o) => o.shippingAddress?.fullName).filter(Boolean);
        const phones = Array.from(new Set(orders.map((o) => normalizePhone(o.shippingAddress?.phone)).filter(Boolean))).slice(0, 5);
        const emails = Array.from(new Set(orders.map((o) => matchableEmail(o.shippingAddress?.email)).filter(Boolean))).slice(0, 5);

        return {
            query: parsed,
            basis: 'store' as const,   // this store's orders only, never Steadfast
            customer: { name: names[0] || '', phones, emails },
            ...history,
            spent: round2(history.spent),
            openFlags,
            firstOrderAt: orders.length ? orders[orders.length - 1].createdAt : null,
            lastOrderAt: orders.length ? orders[0].createdAt : null,
            recentOrders: orders.slice(0, 10).map((o) => ({
                _id: o._id,
                orderId: o.orderId || String(o._id),
                status: o.status,
                total: o.total,
                paymentMethod: o.paymentMethod,
                createdAt: o.createdAt,
                returned: !!returnInfo(o, requests),
            })),
        };
    },
};

export default FraudService;
