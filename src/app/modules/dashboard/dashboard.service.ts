import { Order } from '../order/order.model';
import { Product } from '../product/product.model';
import { User } from '../user/user.model';
import { Review } from '../review/review.model';
import { ReturnRequest } from '../return/return.model';
import { Category } from '../category/category.model';
import InventoryService from '../inventory/inventory.service';
import { IDashboardDay, IDashboardStatusCount, IDashboardSummary } from './dashboard.interface';

// ── Calendar ─────────────────────────────────────────────────────────
// The shop runs on Dhaka time. Bangladesh has no DST, so a fixed +06:00 offset
// gives exact day boundaries; Mongo groups with the same zone name.
const TZ = 'Asia/Dhaka';
const TZ_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 30;

/** Midnight (Dhaka) of the day `d` falls on, as a UTC instant. */
const dhakaDayStart = (d: Date): Date => {
    const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
    return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - TZ_OFFSET_MS);
};

/** 'YYYY-MM-DD' of the Dhaka calendar day `d` falls on. */
const dhakaKey = (d: Date): string => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);

// ── Business rules ───────────────────────────────────────────────────
// Orders in these statuses are not revenue (brief: "non-cancelled orders").
const NOT_REVENUE = ['cancelled'];

// Low-stock level for products without their own threshold (Inventory uses the same default).
const LOW_STOCK_LIMIT = 5;

// Lifecycle order, used to sort the "today by status" chips.
const STATUS_ORDER = [
    'pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery',
    'delivery_attempt', 'delivered', 'cancelled', 'returned', 'refunded',
];

// Steadfast delivery_status values that need a human (see courier.service.ts →
// mapCourierStatus): the parcel is on hold, the courier cancelled it, its state is
// unknown, or it was only partly delivered — plus the *_approval_pending variants
// Steadfast reports while its own staff review those outcomes.
const COURIER_FLAG_STATUSES = [
    'hold',
    'cancelled', 'cancelled_approval_pending',
    'unknown', 'unknown_approval_pending',
    'partial_delivered', 'partial_delivered_approval_pending',
];
// Once the shipment is closed on our side (the admin confirmed the cancel, or the
// goods came back / were refunded) the flag has been dealt with.
const CLOSED_PACKAGE_STATUSES = ['cancelled', 'returned', 'refunded'];

// Sales-by-category keeps the biggest categories and folds the rest into "Other".
const CATEGORY_ROWS = 7;
const TOP_PRODUCTS = 5;
const LATEST_ORDERS = 8;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;

const DashboardService = {
    async getSummary(): Promise<IDashboardSummary> {
        const now = new Date();
        const todayStart = dhakaDayStart(now);
        const todayKey = dhakaKey(now);
        const seriesStart = new Date(todayStart.getTime() - (SERIES_DAYS - 1) * DAY_MS);
        const previousStart = new Date(seriesStart.getTime() - SERIES_DAYS * DAY_MS);
        const revenueWindow = { createdAt: { $gte: seriesStart }, status: { $nin: NOT_REVENUE } };
        const activeProducts = { isDeleted: { $ne: true }, status: 'active' };

        const [
            dailyRows,
            todayStatusRows,
            pendingOrders,
            inventory,
            customers,
            newCustomers30d,
            courierRows,
            pendingReviews,
            pendingReturns,
            lowestStockDocs,
            latestOrderDocs,
            topProductRows,
            categoryRows,
        ] = await Promise.all([
            // Daily revenue / orders for the last 60 days (30 shown + 30 to compare with).
            Order.aggregate([
                { $match: { createdAt: { $gte: previousStart } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
                        orders: { $sum: 1 },
                        cancelled: { $sum: { $cond: [{ $in: ['$status', NOT_REVENUE] }, 1, 0] } },
                        revenue: { $sum: { $cond: [{ $in: ['$status', NOT_REVENUE] }, 0, { $ifNull: ['$total', 0] }] } },
                        delivery: { $sum: { $cond: [{ $in: ['$status', NOT_REVENUE] }, 0, { $ifNull: ['$shippingCost', 0] }] } },
                    },
                },
            ]),

            Order.aggregate([
                { $match: { createdAt: { $gte: todayStart } } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),

            Order.countDocuments({ status: 'pending' }),

            // Stock value, units and the out / low counts come from the Inventory page's own
            // summary (value at moving-average cost only, uncosted products counted apart;
            // low = at or below each product's own threshold), so the tile and the "Needs
            // attention" rows match the Inventory figures and lists they link to.
            InventoryService.getSummary(),

            User.countDocuments({ role: 'user', isDeleted: { $ne: true } }),
            User.countDocuments({ role: 'user', isDeleted: { $ne: true }, createdAt: { $gte: seriesStart } }),

            Order.aggregate([
                { $match: { 'packages.courierStatus': { $in: COURIER_FLAG_STATUSES } } },
                { $unwind: '$packages' },
                {
                    $match: {
                        'packages.courierStatus': { $in: COURIER_FLAG_STATUSES },
                        'packages.status': { $nin: CLOSED_PACKAGE_STATUSES },
                    },
                },
                { $group: { _id: '$packages.courierStatus', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),

            Review.countDocuments({ status: 'pending' }),
            ReturnRequest.countDocuments({ status: 'pending' }),

            Product.find(activeProducts)
                .sort({ stock: 1, name: 1 })
                .limit(3)
                .select('name sku stock unit')
                .lean(),

            Order.find()
                .sort({ createdAt: -1 })
                .limit(LATEST_ORDERS)
                .select('orderId user status paymentStatus paymentMethod total createdAt shippingAddress.fullName shippingAddress.phone items.quantity')
                .populate('user', 'firstName lastName')
                .lean(),

            // Best sellers by revenue (item totals) over the last 30 days.
            Order.aggregate([
                { $match: revenueWindow },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.product',
                        name: { $last: '$items.name' },
                        thumbnail: { $last: '$items.thumbnail' },
                        units: { $sum: '$items.quantity' },
                        revenue: { $sum: '$items.total' },
                    },
                },
                { $sort: { revenue: -1 } },
                { $limit: TOP_PRODUCTS },
            ]),

            // Item revenue per category over the last 30 days. Collapse to one row per
            // product first so the product lookup runs once per product, not per line.
            Order.aggregate([
                { $match: revenueWindow },
                { $unwind: '$items' },
                { $group: { _id: '$items.product', revenue: { $sum: '$items.total' }, units: { $sum: '$items.quantity' } } },
                {
                    $lookup: {
                        from: Product.collection.name,
                        let: { pid: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$_id', '$$pid'] } } },
                            { $project: { category: 1 } },
                        ],
                        as: 'p',
                    },
                },
                { $group: { _id: { $ifNull: [{ $arrayElemAt: ['$p.category', 0] }, null] }, revenue: { $sum: '$revenue' }, units: { $sum: '$units' } } },
                {
                    $lookup: {
                        from: Category.collection.name,
                        let: { cid: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$_id', '$$cid'] } } },
                            { $project: { name: 1 } },
                        ],
                        as: 'c',
                    },
                },
                {
                    $project: {
                        _id: 0,
                        categoryId: { $cond: [{ $gt: [{ $size: '$c' }, 0] }, '$_id', null] },
                        name: { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'Uncategorized'] },
                        revenue: 1,
                        units: 1,
                    },
                },
                { $sort: { revenue: -1 } },
            ]),
        ]);

        // ── Last 30 days, every day present ──
        const byDay = new Map<string, any>(dailyRows.map((r: any) => [String(r._id), r]));
        const series: IDashboardDay[] = [];
        for (let i = 0; i < SERIES_DAYS; i++) {
            const key = dhakaKey(new Date(seriesStart.getTime() + i * DAY_MS));
            const r = byDay.get(key);
            series.push({
                date: key,
                revenue: round2(num(r?.revenue)),
                orders: num(r?.orders),
                cancelled: num(r?.cancelled),
            });
        }
        const seriesKeys = new Set(series.map((d) => d.date));
        const seriesTotals = series.reduce(
            (t, d) => ({ revenue: t.revenue + d.revenue, orders: t.orders + d.orders, cancelled: t.cancelled + d.cancelled }),
            { revenue: 0, orders: 0, cancelled: 0 },
        );
        seriesTotals.revenue = round2(seriesTotals.revenue);
        const previousTotals = dailyRows
            .filter((r: any) => !seriesKeys.has(String(r._id)))
            .reduce((t: { revenue: number; orders: number }, r: any) => ({
                revenue: t.revenue + num(r.revenue),
                orders: t.orders + num(r.orders),
            }), { revenue: 0, orders: 0 });
        previousTotals.revenue = round2(previousTotals.revenue);

        const todayRow = byDay.get(todayKey);

        // ── Today by status, in lifecycle order ──
        const todayByStatus: IDashboardStatusCount[] = todayStatusRows
            .map((r: any) => ({ status: String(r._id || 'pending'), count: num(r.count) }))
            .sort((a: IDashboardStatusCount, b: IDashboardStatusCount) => {
                const ia = STATUS_ORDER.indexOf(a.status);
                const ib = STATUS_ORDER.indexOf(b.status);
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });

        // ── Courier flags ──
        const courierFlaggedByStatus: IDashboardStatusCount[] = courierRows.map((r: any) => ({ status: String(r._id), count: num(r.count) }));
        const courierFlagged = courierFlaggedByStatus.reduce((s, r) => s + r.count, 0);

        // ── Top products (with the stock they have left) ──
        const topIds = topProductRows.map((r: any) => r._id).filter(Boolean);
        const stockDocs: any[] = topIds.length
            ? await Product.find({ _id: { $in: topIds } }).select('stock').lean()
            : [];
        const stockById = new Map<string, number>(stockDocs.map((p: any) => [String(p._id), num(p.stock)]));
        const topProducts = topProductRows.map((r: any) => ({
            productId: String(r._id),
            name: r.name || 'Product',
            thumbnail: r.thumbnail || '',
            units: num(r.units),
            revenue: round2(num(r.revenue)),
            stock: stockById.has(String(r._id)) ? stockById.get(String(r._id)) : null,
        }));

        // ── Sales by category, long tail folded into "Other" ──
        const categories = categoryRows.map((r: any) => ({
            categoryId: r.categoryId ? String(r.categoryId) : null,
            name: String(r.name || 'Uncategorized'),
            revenue: round2(num(r.revenue)),
            units: num(r.units),
        }));
        const salesByCategory = categories.slice(0, CATEGORY_ROWS);
        const rest = categories.slice(CATEGORY_ROWS);
        if (rest.length) {
            salesByCategory.push({
                categoryId: null,
                name: `Other (${rest.length})`,
                revenue: round2(rest.reduce((s, c) => s + c.revenue, 0)),
                units: rest.reduce((s, c) => s + c.units, 0),
            });
        }

        return {
            generatedAt: now.toISOString(),
            timezone: TZ,
            today: todayKey,

            revenueToday: round2(num(todayRow?.revenue)),
            deliveryToday: round2(num(todayRow?.delivery)),
            ordersToday: num(todayRow?.orders),
            pendingOrders,
            stockValue: round2(num(inventory.value)),
            stockUnits: num(inventory.units),
            skuCount: num(inventory.products),
            stockUncosted: num(inventory.uncosted),
            customers,
            newCustomers30d,

            series,
            seriesTotals,
            previousTotals,

            needsAttention: {
                pendingOrders,
                courierFlagged,
                courierFlaggedByStatus,
                outOfStock: num(inventory.out),
                lowStock: num(inventory.low),
                lowStockLimit: LOW_STOCK_LIMIT,
                pendingReviews,
                pendingReturns,
            },
            lowestStock: lowestStockDocs.map((p: any) => ({
                _id: String(p._id),
                name: p.name || '',
                sku: p.sku || '',
                stock: num(p.stock),
                unit: p.unit || 'piece',
            })),

            todayByStatus,
            latestOrders: latestOrderDocs.map((o: any) => {
                const fromUser = o.user ? `${o.user.firstName || ''} ${o.user.lastName || ''}`.trim() : '';
                return {
                    _id: String(o._id),
                    orderId: o.orderId || '',
                    customer: o.shippingAddress?.fullName || fromUser || 'Guest',
                    phone: o.shippingAddress?.phone || '',
                    status: o.status || 'pending',
                    paymentStatus: o.paymentStatus || 'pending',
                    paymentMethod: o.paymentMethod || '',
                    total: num(o.total),
                    itemCount: (o.items || []).reduce((s: number, it: any) => s + num(it.quantity), 0),
                    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
                };
            }),

            topProducts,
            salesByCategory,
        };
    },
};

export default DashboardService;
