import mongoose from 'mongoose';
import { Order } from '../order/order.model';
import AppError from '../../utils/AppError';
import SteadfastService from './steadfast.service';
import OrderService from '../order/order.service';
import { getCodChargeBps } from '../shipping/shipping.service';

// ── Status sets shared across booking / listing / sync ───────────────
const BOOKABLE_STATUSES = ['pending', 'confirmed', 'processing'];          // can still go to courier
const IN_TRANSIT_STATUSES = ['shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt'];
const TERMINAL_STATUSES = ['delivered', 'cancelled', 'returned', 'refunded'];

// Map a raw Steadfast delivery_status → our package lifecycle status.
// Terminal states (delivered / cancelled) are flagged for admin confirmation
// instead of auto-applied, so the existing earnings/stock logic stays the source
// of truth (a courier sync must never silently move money).
function mapCourierStatus(raw: string): { suggested: string | null; terminal: boolean } {
    const v = (raw || '').toLowerCase();
    if (v === 'delivered' || v === 'partial_delivered') return { suggested: 'delivered', terminal: true };
    if (v === 'cancelled') return { suggested: 'cancelled', terminal: true };
    // in-transit / pending / hold / in_review / *_approval_pending / unknown
    return { suggested: 'on_the_way', terminal: false };
}

// COD only collects when the order is COD and not already paid online.
// The order's (per-order) shipping fee is added to the FIRST package's COD only,
// so the courier collects items + shipping without double-charging across packages.
function codFor(order: any, pkg: any): number {
    if (order.paymentMethod !== 'cod' || order.paymentStatus === 'paid') return 0;
    const isPrimary = !!order.packages?.[0] && String(order.packages[0]._id) === String(pkg._id);
    // The primary package carries the order-level shipping fee AND the order-level
    // discount, so the sum of COD across all packages equals the order total
    // (never over-collect when a discount coupon was applied).
    const adjustment = isPrimary ? (order.shippingCost || 0) - (order.discount || 0) : 0;
    return Math.max(0, pkg.subtotal + adjustment);
}

// ── Core booking on an ALREADY-LOADED order doc (no save) ────────────
// Throws on any precondition failure so callers can report per-package errors.
async function bookPackageCore(order: any, packageId: string) {
    const pkg: any = order.packages.id(packageId);
    if (!pkg) throw new AppError(404, 'Package not found in this order.');
    if (pkg.consignmentId) throw new AppError(400, 'Already booked with Steadfast.');
    if (TERMINAL_STATUSES.includes(pkg.status)) throw new AppError(400, `Package is ${pkg.status} — cannot book.`);

    const a = order.shippingAddress;
    const fullAddress = [a.address, a.area, a.city, a.postalCode].filter(Boolean).join(', ');

    // Snapshot the current COD handling rate. Read BEFORE booking, so a settings
    // read failure can never leave a Steadfast consignment we have no record of.
    const codChargeBps = await getCodChargeBps();

    const consignment = await SteadfastService.createConsignment({
        invoice: `${order.orderId}-${String(pkg._id).slice(-5)}`,
        recipientName: a.fullName,
        recipientPhone: (a.phone || '').replace(/\D/g, '').slice(-11),
        recipientAddress: fullAddress,
        codAmount: codFor(order, pkg),
        note: order.note || '',
    });

    pkg.consignmentId = String(consignment.consignment_id);
    pkg.trackingNumber = consignment.tracking_code || '';
    pkg.carrier = 'Steadfast';
    pkg.courierStatus = String(consignment.status || 'in_review');
    pkg.courierBookedAt = new Date();
    pkg.codChargeBps = codChargeBps;   // later rate changes never alter this parcel
    if (BOOKABLE_STATUSES.includes(pkg.status)) pkg.status = 'shipped';
    pkg.timeline.push({ status: 'shipped', note: `Booked with Steadfast — tracking ${pkg.trackingNumber}` });
    return pkg;
}

// ── Core status refresh on an ALREADY-LOADED order doc (no save) ─────
async function refreshPackageCore(order: any, packageId: string) {
    const pkg: any = order.packages.id(packageId);
    if (!pkg) throw new AppError(404, 'Package not found in this order.');
    if (!pkg.trackingNumber && !pkg.consignmentId) {
        throw new AppError(400, 'Package has not been booked with Steadfast yet.');
    }

    const data = pkg.trackingNumber
        ? await SteadfastService.getStatusByTrackingCode(pkg.trackingNumber)
        : await SteadfastService.getStatusByCid(pkg.consignmentId);

    const raw = String(data?.delivery_status || '');
    pkg.courierStatus = raw;
    const { suggested, terminal } = mapCourierStatus(raw);

    // Fully-automated sync: a courier "delivered" is applied directly with its
    // money side-effects (COD → paid) via OrderService
    // (idempotent). In-transit states auto-advance. Only "cancelled" is left
    // for an admin to confirm (refund / restock stays a human decision).
    if (suggested === 'delivered') {
        await OrderService.applyCourierDelivered(order, pkg);
    } else if (suggested && !terminal && suggested !== pkg.status && IN_TRANSIT_STATUSES.includes(pkg.status)) {
        pkg.status = suggested;
        pkg.timeline.push({ status: suggested, note: `Steadfast: ${raw}` });
    }

    const stillNeedsConfirm = terminal && suggested !== 'delivered';
    return {
        courierStatus: raw,
        packageStatus: pkg.status,
        needsConfirmation: stillNeedsConfirm,   // only cancelled still needs a manual confirm
        suggestedStatus: stillNeedsConfirm ? suggested : null,
    };
}

// Group [{orderId, packageId}] → Map<orderId, packageId[]> so each order loads/saves once.
function groupByOrder(items: { orderId: string; packageId: string }[]) {
    const map = new Map<string, string[]>();
    for (const it of items || []) {
        if (!it?.orderId || !it?.packageId) continue;
        const list = map.get(it.orderId) || [];
        list.push(it.packageId);
        map.set(it.orderId, list);
    }
    return map;
}

const CourierService = {
    // ── Flattened, filterable list of shipments (the Shipments board) ──
    async listPackages(opts: {
        state?: string;       // all | to_ship | shipped | delivered | cancelled
        search?: string;      // order no / customer / phone / tracking
        page?: number;
        limit?: number;
    }) {
        const page = Math.max(1, Number(opts.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));

        const pkgMatch: any = {};

        // State filter (booking lifecycle)
        if (opts.state === 'to_ship') {
            pkgMatch['packages.consignmentId'] = { $in: [null, ''] };
            pkgMatch['packages.status'] = { $in: BOOKABLE_STATUSES };
        } else if (opts.state === 'shipped') {
            pkgMatch['packages.consignmentId'] = { $nin: [null, ''] };
            pkgMatch['packages.status'] = { $in: IN_TRANSIT_STATUSES };
        } else if (opts.state === 'delivered') {
            pkgMatch['packages.status'] = 'delivered';
        } else if (opts.state === 'cancelled') {
            pkgMatch['packages.status'] = { $in: ['cancelled', 'returned', 'refunded'] };
        }

        const searchMatch: any = {};
        if (opts.search) {
            const rx = new RegExp(opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            searchMatch.$or = [
                { orderId: rx },
                { 'shippingAddress.fullName': rx },
                { 'shippingAddress.phone': rx },
                { 'packages.trackingNumber': rx },
            ];
        }

        const basePipeline: any[] = [
            { $match: searchMatch.$or ? searchMatch : {} },
            { $unwind: { path: '$packages', includeArrayIndex: 'pkgIndex' } },
            { $match: pkgMatch },
        ];

        const rowsPipeline = [
            ...basePipeline,
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    orderId: '$_id',
                    orderNo: '$orderId',
                    packageId: '$packages._id',
                    status: '$packages.status',
                    subtotal: '$packages.subtotal',
                    itemCount: { $size: { $ifNull: ['$packages.itemIds', []] } },
                    // Up to 4 product thumbnails/details for this package (from the order's items).
                    items: {
                        $map: {
                            input: {
                                $slice: [
                                    {
                                        $filter: {
                                            input: { $ifNull: ['$items', []] },
                                            as: 'it',
                                            cond: { $in: ['$$it._id', { $ifNull: ['$packages.itemIds', []] }] },
                                        },
                                    },
                                    4,
                                ],
                            },
                            as: 'it',
                            in: {
                                thumbnail: '$$it.thumbnail',
                                name: '$$it.name',
                                quantity: '$$it.quantity',
                                color: '$$it.color',
                                size: '$$it.size',
                            },
                        },
                    },
                    consignmentId: '$packages.consignmentId',
                    trackingNumber: '$packages.trackingNumber',
                    courierStatus: '$packages.courierStatus',
                    carrier: '$packages.carrier',
                    booked: {
                        $and: [
                            { $ne: ['$packages.consignmentId', null] },
                            { $ne: ['$packages.consignmentId', ''] },
                        ],
                    },
                    paymentMethod: '$paymentMethod',
                    paymentStatus: '$paymentStatus',
                    codAmount: {
                        $cond: [
                            { $and: [{ $eq: ['$paymentMethod', 'cod'] }, { $ne: ['$paymentStatus', 'paid'] }] },
                            // First package collects items + shipping − the order-level discount.
                            { $max: [0, { $add: ['$packages.subtotal', { $cond: [{ $eq: ['$pkgIndex', 0] }, { $subtract: [{ $ifNull: ['$shippingCost', 0] }, { $ifNull: ['$discount', 0] }] }, 0] }] }] },
                            0,
                        ],
                    },
                    customer: '$shippingAddress.fullName',
                    phone: '$shippingAddress.phone',
                    city: '$shippingAddress.city',
                    // Address parts + note so the booking-confirmation modal can show
                    // exactly what will be sent to Steadfast (built client-side as
                    // [address, area, city, postalCode].filter(Boolean).join(', ')).
                    address: '$shippingAddress.address',
                    area: '$shippingAddress.area',
                    postalCode: '$shippingAddress.postalCode',
                    note: { $ifNull: ['$note', ''] },
                    createdAt: '$createdAt',
                },
            },
        ];

        const [rows, countRes] = await Promise.all([
            Order.aggregate(rowsPipeline),
            Order.aggregate([...basePipeline, { $count: 'total' }]),
        ]);

        const total = countRes[0]?.total || 0;
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    },

    // ── Single book (kept for the order-detail page) ──
    async bookPackage(orderId: string, packageId: string) {
        const order: any = await Order.findById(orderId);
        if (!order) throw new AppError(404, 'Order not found.');
        const pkg = await bookPackageCore(order, packageId);
        await order.save();
        return pkg;
    },

    // ── Bulk book — one Steadfast consignment per selected package ──
    async bulkBook(items: { orderId: string; packageId: string }[]) {
        const grouped = groupByOrder(items);
        const results: { orderId: string; packageId: string; ok: boolean; trackingNumber?: string; error?: string }[] = [];

        for (const [orderId, packageIds] of grouped) {
            const order: any = await Order.findById(orderId);
            if (!order) {
                packageIds.forEach((pid) => results.push({ orderId, packageId: pid, ok: false, error: 'Order not found.' }));
                continue;
            }
            let dirty = false;
            for (const pid of packageIds) {
                try {
                    const pkg = await bookPackageCore(order, pid);
                    dirty = true;
                    results.push({ orderId, packageId: pid, ok: true, trackingNumber: pkg.trackingNumber });
                } catch (e: any) {
                    results.push({ orderId, packageId: pid, ok: false, error: e?.message || 'Booking failed.' });
                }
            }
            if (dirty) await order.save();
        }

        const booked = results.filter((r) => r.ok).length;
        return { total: results.length, booked, failed: results.length - booked, results };
    },

    // ── Single status refresh (kept for the order-detail page) ──
    async refreshStatus(orderId: string, packageId: string) {
        const order: any = await Order.findById(orderId);
        if (!order) throw new AppError(404, 'Order not found.');
        const out = await refreshPackageCore(order, packageId);
        await order.save();
        return out;
    },

    // ── Bulk status refresh ──
    async bulkRefresh(items: { orderId: string; packageId: string }[]) {
        const grouped = groupByOrder(items);
        const results: { orderId: string; packageId: string; ok: boolean; courierStatus?: string; needsConfirmation?: boolean; error?: string }[] = [];

        for (const [orderId, packageIds] of grouped) {
            const order: any = await Order.findById(orderId);
            if (!order) {
                packageIds.forEach((pid) => results.push({ orderId, packageId: pid, ok: false, error: 'Order not found.' }));
                continue;
            }
            let dirty = false;
            for (const pid of packageIds) {
                try {
                    const out = await refreshPackageCore(order, pid);
                    dirty = true;
                    results.push({ orderId, packageId: pid, ok: true, courierStatus: out.courierStatus, needsConfirmation: out.needsConfirmation });
                } catch (e: any) {
                    results.push({ orderId, packageId: pid, ok: false, error: e?.message || 'Refresh failed.' });
                }
            }
            if (dirty) await order.save();
        }

        const ok = results.filter((r) => r.ok).length;
        return { total: results.length, ok, failed: results.length - ok, results };
    },

    // ── Webhook: Steadfast pushes a delivery-status change to us ──
    // Payload commonly carries consignment_id / invoice / status (delivery_status).
    async applyWebhook(payload: any) {
        const cid = payload?.consignment_id ?? payload?.cid;
        const invoice: string = payload?.invoice || '';
        const raw = String(payload?.delivery_status || payload?.status || '');
        if (!cid && !invoice) throw new AppError(400, 'Webhook payload missing consignment_id / invoice.');

        const order: any = cid
            ? await Order.findOne({ 'packages.consignmentId': String(cid) })
            : await Order.findOne({ orderId: invoice.split('-').slice(0, 2).join('-') });
        if (!order) return { matched: false };

        const pkg: any = cid
            ? order.packages.find((p: any) => String(p.consignmentId) === String(cid))
            : order.packages.find((p: any) => `${order.orderId}-${String(p._id).slice(-5)}` === invoice);
        if (!pkg) return { matched: false };

        pkg.courierStatus = raw;
        const { suggested, terminal } = mapCourierStatus(raw);
        if (suggested === 'delivered') {
            await OrderService.applyCourierDelivered(order, pkg);   // COD + earnings settle (idempotent)
        } else if (suggested && !terminal && suggested !== pkg.status && IN_TRANSIT_STATUSES.includes(pkg.status)) {
            pkg.status = suggested;
            const noteSuffix = payload?.tracking_message ? ` (${payload.tracking_message})` : '';
            pkg.timeline.push({ status: suggested, note: `Steadfast webhook: ${raw}${noteSuffix}` });
        }
        await order.save();
        return { matched: true, packageStatus: pkg.status, needsConfirmation: terminal && suggested !== 'delivered' };
    },

    async getBalance() {
        return SteadfastService.getBalance();
    },
};

export default CourierService;
