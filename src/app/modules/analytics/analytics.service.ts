import PDFDocument from 'pdfkit';
import { PipelineStage, Types } from 'mongoose';
import { Order } from '../order/order.model';
import { Product } from '../product/product.model';
import { Category } from '../category/category.model';
import { User } from '../user/user.model';
import { ReturnRequest } from '../return/return.model';
import { Period, REPORT_TZ, bucketFormat, bucketKeys } from './analytics.period';
import { STATUS_BUCKETS, StatusBucket } from './analytics.validation';

const INDIGO = '#4F46E5';

const fmt = (n: number): string =>
    `BDT ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ════════════════════════════════════════════════════════════
//  STATUS BUCKETS — the Sales report shows the order statuses folded into
//  seven groups. Courier sub-steps count as Shipped; refunded counts as Returned.
// ════════════════════════════════════════════════════════════

export const BUCKET_STATUSES: Record<StatusBucket, string[]> = {
    pending: ['pending'],
    confirmed: ['confirmed'],
    processing: ['processing'],
    shipped: ['shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt'],
    delivered: ['delivered'],
    returned: ['returned', 'refunded'],
    cancelled: ['cancelled'],
};

const STATUS_TO_BUCKET: Record<string, StatusBucket> = Object.entries(BUCKET_STATUSES).reduce(
    (acc, [bucket, statuses]) => {
        statuses.forEach((s) => { acc[s] = bucket as StatusBucket; });
        return acc;
    },
    {} as Record<string, StatusBucket>,
);

const emptyBuckets = (): Record<StatusBucket, number> =>
    STATUS_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {} as Record<StatusBucket, number>);

const rangeOf = (start: Date, end: Date) => ({ createdAt: { $gte: start, $lt: end } });
const NOT_CANCELLED = { status: { $ne: 'cancelled' } };
const isPaid = { $eq: ['$paymentStatus', 'paid'] };
const notCancelled = { $ne: ['$status', 'cancelled'] };

// ════════════════════════════════════════════════════════════
//  SALES REPORT (period)
// ════════════════════════════════════════════════════════════

export interface SalesReport {
    period: {
        from: string; to: string; days: number; timezone: string;
        granularity: Period['granularity'];
        previous: { from: string; to: string };
    };
    summary: {
        ordersReceived: number;
        activeOrders: number;
        orderValue: number;
        subtotal: number;
        deliveryFees: number;
        discount: number;
        itemsSold: number;
        avgOrderValue: number;
        paidValue: number;
        paidOrders: number;
        freeDeliveryOrders: number;
        customers: number;
        newCustomers: number;
        cancelledOrders: number;
        cancelledValue: number;
    };
    previous: { ordersReceived: number; orderValue: number; deliveryFees: number; itemsSold: number };
    byStatus: Record<StatusBucket, number>;
    byStatusValue: Record<StatusBucket, number>;
    statusDetail: Record<string, number>;
    trend: { key: string; orders: number; value: number }[];
    productsSold: {
        productId: string | null; name: string; thumbnail: string; sku: string; unit: string;
        stock: number | null; status: string; deleted: boolean;
        qty: number; revenue: number; orders: number;
    }[];
    byCategory: { _id: string; name: string; qty: number; revenue: number; products: number }[];
    payments: { method: string; orders: number; value: number; paid: number }[];
    returns: ReturnsSummary;
}

export interface ReturnsSummary {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    refunded: number;
    refundAmount: number;
}

/** The per-period $facet: status counts, money totals, payments, trend and products. */
export const salesFacetStage = (p: Period): PipelineStage.Facet => ({
    $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } }],
        totals: [
            { $match: NOT_CANCELLED },
            {
                $group: {
                    _id: null,
                    orders: { $sum: 1 },
                    value: { $sum: '$total' },
                    subtotal: { $sum: '$subtotal' },
                    deliveryFees: { $sum: { $ifNull: ['$shippingCost', 0] } },
                    discount: { $sum: { $ifNull: ['$discount', 0] } },
                    itemsSold: { $sum: { $sum: '$items.quantity' } },
                    paidValue: { $sum: { $cond: [isPaid, '$total', 0] } },
                    paidOrders: { $sum: { $cond: [isPaid, 1, 0] } },
                    freeDeliveryOrders: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$shippingCost', 0] }, 0] }, 1, 0] } },
                    customers: { $addToSet: '$user' },
                },
            },
            { $addFields: { customers: { $size: '$customers' } } },
        ],
        payments: [
            { $match: NOT_CANCELLED },
            {
                $group: {
                    _id: '$paymentMethod',
                    orders: { $sum: 1 },
                    value: { $sum: '$total' },
                    paid: { $sum: { $cond: [isPaid, '$total', 0] } },
                },
            },
            { $sort: { value: -1 } },
        ],
        trend: [
            {
                $group: {
                    _id: { $dateToString: { format: bucketFormat(p.granularity), date: '$createdAt', timezone: REPORT_TZ } },
                    orders: { $sum: 1 },
                    value: { $sum: { $cond: [notCancelled, '$total', 0] } },
                },
            },
        ],
        products: [
            { $match: NOT_CANCELLED },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    name: { $last: '$items.name' },
                    thumbnail: { $last: '$items.thumbnail' },
                    qty: { $sum: '$items.quantity' },
                    revenue: { $sum: '$items.total' },
                    orders: { $addToSet: '$_id' },
                },
            },
            { $addFields: { orders: { $size: '$orders' } } },
            { $sort: { qty: -1, revenue: -1 } },
        ],
    },
});

/** Totals for the comparison window (cancelled orders left out of money). */
export const previousTotalsStage = (): PipelineStage.Group => ({
    $group: {
        _id: null,
        ordersReceived: { $sum: 1 },
        orderValue: { $sum: { $cond: [notCancelled, '$total', 0] } },
        deliveryFees: { $sum: { $cond: [notCancelled, { $ifNull: ['$shippingCost', 0] }, 0] } },
        itemsSold: { $sum: { $cond: [notCancelled, { $sum: '$items.quantity' }, 0] } },
    },
});

const getSalesReport = async (p: Period): Promise<SalesReport> => {
    const range = rangeOf(p.start, p.end);

    const [facetRows, prevRows, newCustomers, returns] = await Promise.all([
        Order.aggregate([{ $match: range }, salesFacetStage(p)]),
        Order.aggregate([{ $match: rangeOf(p.previous.start, p.previous.end) }, previousTotalsStage()]),
        User.countDocuments({ role: 'user', ...range }),
        getReturnsSummary(p),
    ]);
    const f = facetRows[0] || {};

    // Live catalogue docs for what sold. `isDeleted` in the filter bypasses the
    // model's hide-deleted hook, so sales of since-deleted products still show
    // (flagged) instead of silently vanishing.
    const ids = (f.products || []).map((r: any) => r._id).filter((id: any) => id && Types.ObjectId.isValid(String(id)));
    const catalogue = ids.length
        ? await Product.find({ _id: { $in: ids }, isDeleted: { $in: [true, false, null] } })
            .select('name thumbnail sku unit stock status category isDeleted')
            .lean()
        : [];
    const catIds = [...new Set(catalogue.map((c: any) => c.category && String(c.category)).filter(Boolean))];
    const cats = catIds.length ? await Category.find({ _id: { $in: catIds } }).select('name').lean() : [];

    return buildSalesReport(p, f, prevRows[0] || {}, newCustomers, returns, catalogue, cats);
};

/**
 * Turn the raw aggregation rows into the report. Pure: `catalogue` and `cats`
 * are the live Product / Category docs for the products that sold.
 */
export const buildSalesReport = (
    p: Period,
    f: any,
    prev: any,
    newCustomers: number,
    returns: ReturnsSummary,
    catalogue: any[],
    cats: any[],
): SalesReport => {
    // ── Status buckets ──
    const byStatus = emptyBuckets();
    const byStatusValue = emptyBuckets();
    const statusDetail: Record<string, number> = {};
    let ordersReceived = 0;
    let cancelledOrders = 0;
    let cancelledValue = 0;
    for (const row of f.byStatus || []) {
        const status = String(row._id || 'pending');
        const bucket = STATUS_TO_BUCKET[status] || 'pending';
        byStatus[bucket] += row.count;
        byStatusValue[bucket] += row.value || 0;
        statusDetail[status] = row.count;
        ordersReceived += row.count;
        if (status === 'cancelled') { cancelledOrders = row.count; cancelledValue = row.value || 0; }
    }

    // ── Totals (cancelled orders excluded from money) ──
    const t = f.totals?.[0] || {};
    const activeOrders = t.orders || 0;
    const orderValue = t.value || 0;

    // ── Trend with empty buckets filled ──
    const trendMap = new Map<string, { orders: number; value: number }>(
        (f.trend || []).map((r: any) => [String(r._id), { orders: r.orders, value: r.value }]),
    );
    const trend = bucketKeys(p).map((key) => ({ key, orders: trendMap.get(key)?.orders || 0, value: trendMap.get(key)?.value || 0 }));

    // ── Products sold, joined with the live catalogue for stock + category ──
    const soldRows: any[] = f.products || [];
    const byId = new Map<string, any>(catalogue.map((c: any) => [String(c._id), c]));
    const catName = new Map<string, string>(cats.map((c: any) => [String(c._id), c.name]));

    const categoryAgg = new Map<string, { _id: string; name: string; qty: number; revenue: number; products: number }>();
    const productsSold = soldRows.map((r) => {
        const prod = r._id ? byId.get(String(r._id)) : undefined;
        const catKey = prod?.category ? String(prod.category) : 'uncategorized';
        const cat = categoryAgg.get(catKey) || { _id: catKey, name: catName.get(catKey) || 'Uncategorized', qty: 0, revenue: 0, products: 0 };
        cat.qty += r.qty || 0;
        cat.revenue += r.revenue || 0;
        cat.products += 1;
        categoryAgg.set(catKey, cat);
        return {
            productId: r._id ? String(r._id) : null,
            name: prod?.name || r.name || 'Unknown product',
            thumbnail: prod?.thumbnail || r.thumbnail || '',
            sku: prod?.sku || '',
            unit: prod?.unit || 'piece',
            stock: prod ? Number(prod.stock || 0) : null,
            status: prod?.status || '',
            deleted: !prod || !!prod.isDeleted,
            qty: r.qty || 0,
            revenue: r.revenue || 0,
            orders: r.orders || 0,
        };
    });
    const byCategory = [...categoryAgg.values()].sort((a, b) => b.revenue - a.revenue);

    return {
        period: {
            from: p.from, to: p.to, days: p.days, timezone: REPORT_TZ, granularity: p.granularity,
            previous: { from: p.previous.from, to: p.previous.to },
        },
        summary: {
            ordersReceived,
            activeOrders,
            orderValue,
            subtotal: t.subtotal || 0,
            deliveryFees: t.deliveryFees || 0,
            discount: t.discount || 0,
            itemsSold: t.itemsSold || 0,
            avgOrderValue: activeOrders ? Math.round(orderValue / activeOrders) : 0,
            paidValue: t.paidValue || 0,
            paidOrders: t.paidOrders || 0,
            freeDeliveryOrders: t.freeDeliveryOrders || 0,
            customers: t.customers || 0,
            newCustomers,
            cancelledOrders,
            cancelledValue,
        },
        previous: {
            ordersReceived: prev.ordersReceived || 0,
            orderValue: prev.orderValue || 0,
            deliveryFees: prev.deliveryFees || 0,
            itemsSold: prev.itemsSold || 0,
        },
        byStatus,
        byStatusValue,
        statusDetail,
        trend,
        productsSold,
        byCategory,
        payments: (f.payments || []).map((r: any) => ({
            method: r._id || 'unknown', orders: r.orders, value: r.value || 0, paid: r.paid || 0,
        })),
        returns,
    };
};

/** One page of the orders placed in the period, optionally one status bucket. */
const getSalesReportOrders = async (
    p: Period,
    opts: { status?: StatusBucket; page?: number; limit?: number },
) => {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(1000, Math.max(1, opts.limit || 10));
    const filter: Record<string, unknown> = rangeOf(p.start, p.end);
    if (opts.status) filter.status = { $in: BUCKET_STATUSES[opts.status] };

    const [rows, total] = await Promise.all([
        Order.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('orderId user shippingAddress.fullName shippingAddress.phone items.quantity total subtotal shippingCost discount paymentMethod paymentStatus status createdAt packages.consignmentId')
            .populate('user', 'firstName lastName phone')
            .lean(),
        Order.countDocuments(filter),
    ]);

    const orders = rows.map((o: any) => ({
        _id: String(o._id),
        orderId: o.orderId || '',
        customer: o.shippingAddress?.fullName || `${o.user?.firstName || ''} ${o.user?.lastName || ''}`.trim() || 'Guest',
        phone: o.shippingAddress?.phone || o.user?.phone || '',
        items: (o.items || []).reduce((s: number, it: any) => s + (it.quantity || 0), 0),
        subtotal: o.subtotal || 0,
        shippingCost: o.shippingCost || 0,
        discount: o.discount || 0,
        total: o.total || 0,
        paymentMethod: o.paymentMethod || '',
        paymentStatus: o.paymentStatus || '',
        status: o.status || 'pending',
        bucket: STATUS_TO_BUCKET[o.status] || 'pending',
        consignmentId: (o.packages || []).map((pk: any) => pk.consignmentId).filter(Boolean).join(', '),
        createdAt: o.createdAt,
    }));

    return { orders, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

// ════════════════════════════════════════════════════════════
//  STOCK + RETURNS
// ════════════════════════════════════════════════════════════

/**
 * Products at or below their restock level. With no threshold each product's
 * own lowStockThreshold is used; drafts (not on sale yet) are left out.
 */
const getLowStock = async (threshold?: number) => {
    const stockFilter = threshold === undefined
        ? { $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] } }
        : { stock: { $lte: threshold } };
    const products = await Product.find({ isDeleted: false, status: { $ne: 'draft' }, ...stockFilter })
        .sort({ stock: 1, name: 1 })
        .limit(50)
        .select('name thumbnail stock sku unit lowStockThreshold status')
        .lean();

    return products.map((p: any) => ({
        _id: p._id,
        name: p.name,
        thumbnail: p.thumbnail || '',
        stock: p.stock || 0,
        sku: p.sku || '',
        unit: p.unit || 'piece',
        lowStockThreshold: p.lowStockThreshold ?? 5,
        status: p.status || 'active',
    }));
};

/** Return requests by status — all time, or those raised within a period. */
const getReturnsSummary = async (p?: Period): Promise<ReturnsSummary> => {
    const agg = await ReturnRequest.aggregate([
        ...(p ? [{ $match: rangeOf(p.start, p.end) }] : []),
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                refundAmount: { $sum: '$refundAmount' },
            },
        },
    ]);

    const summary: ReturnsSummary = { total: 0, pending: 0, approved: 0, rejected: 0, refunded: 0, refundAmount: 0 };
    for (const row of agg) {
        summary.total += row.count;
        if (row._id === 'pending') summary.pending = row.count;
        if (row._id === 'approved') summary.approved = row.count;
        if (row._id === 'rejected') summary.rejected = row.count;
        if (row._id === 'refunded') {
            summary.refunded = row.count;
            summary.refundAmount += row.refundAmount || 0;
        }
    }
    return summary;
};

// ════════════════════════════════════════════════════════════
//  LIFETIME AGGREGATES (dashboard + legacy PDF)
// ════════════════════════════════════════════════════════════

const getAdminPlatformSummary = async () => {
    const [revenueData, totalOrders, totalProducts, totalCustomers] = await Promise.all([
        Order.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, totalRevenue: { $sum: '$total' } } },
        ]),
        Order.countDocuments(),
        Product.countDocuments({ isDeleted: false }),
        Order.distinct('user').then((u) => u.length),
    ]);
    return {
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        totalOrders,
        totalProducts,
        totalCustomers,
    };
};

const getAdminTopProducts = async (limit = 10) => {
    return Product.find({ isDeleted: false })
        .sort('-totalSold')
        .limit(limit)
        .select('name totalSold price rating')
        .lean();
};

/**
 * Sales per category (top 10). Without a period this is all time and counts
 * every order, as it always has; with a period it covers orders placed in it
 * and leaves cancelled orders out.
 */
const getSalesByCategory = async (p?: Period) => {
    return Order.aggregate([
        ...(p ? [{ $match: { ...rangeOf(p.start, p.end), ...NOT_CANCELLED } }] : []),
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productInfo',
            },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'categories',
                localField: 'productInfo.category',
                foreignField: '_id',
                as: 'categoryInfo',
            },
        },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                // Uncategorized / deleted-category sales roll up into one labelled bucket.
                _id: { $ifNull: ['$categoryInfo._id', 'uncategorized'] },
                name: { $first: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] } },
                totalSales: { $sum: '$items.total' },
                totalItems: { $sum: '$items.quantity' },
            },
        },
        { $sort: { totalSales: -1 } },
        { $limit: 10 },
    ]);
};

// ════════════════════════════════════════════════════════════
//  PDF GENERATION (pdfkit — buffer collect pattern from invoice)
// ════════════════════════════════════════════════════════════

type Doc = InstanceType<typeof PDFDocument>;

const drawHeader = (doc: Doc, color: string, title: string, subtitle: string, left: number, contentWidth: number) => {
    doc.rect(0, 0, doc.page.width, 90).fill(color);
    doc.fillColor('#FFFFFF').fontSize(26).font('Helvetica-Bold').text('Shohoz Kitchen', left, 24);
    doc.fontSize(13).font('Helvetica').text(title, left, 56);
    doc.fontSize(9)
        .font('Helvetica')
        .text(subtitle, left, 30, { width: contentWidth, align: 'right' });
    doc.text(
        `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: REPORT_TZ })}`,
        left,
        46,
        { width: contentWidth, align: 'right' }
    );
    doc.fillColor('#000000');
};

/** A table with a coloured header row; returns the y after the last row. */
const drawTable = (
    doc: Doc,
    y: number,
    left: number,
    contentWidth: number,
    cols: { label: string; width: number; align?: 'left' | 'right' }[],
    rows: string[][],
    emptyText: string,
): number => {
    const right = left + contentWidth;
    const header = () => {
        doc.rect(left, y, contentWidth, 22).fill(INDIGO);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
        let x = left;
        for (const c of cols) {
            const w = contentWidth * c.width;
            doc.text(c.label, x + 6, y + 7, { width: w - 12, align: c.align || 'left' });
            x += w;
        }
        y += 22;
        doc.font('Helvetica').fontSize(9);
    };
    header();
    if (!rows.length) {
        doc.fillColor('#888888').text(emptyText, left + 6, y + 6, { width: contentWidth - 12 });
        return y + 24;
    }
    for (const r of rows) {
        if (y + 20 > doc.page.height - 70) {
            doc.addPage();
            y = 50;
            header();
        }
        doc.fillColor('#222222');
        let x = left;
        cols.forEach((c, i) => {
            const w = contentWidth * c.width;
            // One line per cell: a fixed height makes pdfkit cut long names with "…".
            doc.text(r[i] ?? '', x + 6, y + 6, { width: w - 12, height: 11, align: c.align || 'left', ellipsis: true });
            x += w;
        });
        doc.moveTo(left, y + 20).lineTo(right, y + 20).strokeColor('#EEEEEE').stroke();
        y += 20;
    }
    return y;
};

/**
 * Footer line near the bottom edge. The bottom margin is lifted while it is drawn,
 * otherwise pdfkit sees text below the margin and starts a blank extra page.
 */
const drawFooter = (doc: Doc, text: string, left: number, contentWidth: number) => {
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#888888')
        .text(text, left, doc.page.height - 30, { width: contentWidth, align: 'center' });
    doc.page.margins.bottom = bottom;
};

const ensureSpace = (doc: Doc, y: number, needed: number): number => {
    if (y + needed > doc.page.height - 70) {
        doc.addPage();
        return 50;
    }
    return y;
};

const collect = (build: (doc: Doc) => void): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', (e: Error) => reject(e));
            build(doc);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });

const periodLabel = (from: string, to: string): string => {
    const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return from === to ? f(from) : `${f(from)} - ${f(to)}`;
};

const STATUS_LABEL: Record<StatusBucket, string> = {
    pending: 'Pending', confirmed: 'Confirmed', processing: 'Packed', shipped: 'Shipped',
    delivered: 'Delivered', returned: 'Returned', cancelled: 'Cancelled',
};

/** The Sales report for a period, as a PDF. */
const generateSalesReportPdf = async (p: Period): Promise<Buffer> => renderSalesReportPdf(await getSalesReport(p));

/** Draw an already-computed Sales report as a PDF. */
export const renderSalesReportPdf = (r: SalesReport): Promise<Buffer> =>
    collect((doc) => {
        const left = doc.page.margins.left;
        const right = doc.page.width - doc.page.margins.right;
        const contentWidth = right - left;

        drawHeader(doc, INDIGO, 'SALES REPORT', periodLabel(r.period.from, r.period.to), left, contentWidth);

        let y = 112;
        doc.fillColor('#555555').font('Helvetica').fontSize(10)
            .text(`Orders received and products sold - ${periodLabel(r.period.from, r.period.to)} (Bangladesh time). Cancelled orders are not counted in money totals.`, left, y, { width: contentWidth });
        y += 30;

        const stats: [string, string][] = [
            ['Orders received', String(r.summary.ordersReceived)],
            ['Total order value', fmt(r.summary.orderValue)],
            ['Delivery fees', fmt(r.summary.deliveryFees)],
            ['Items sold', String(r.summary.itemsSold)],
            ['Average order value', fmt(r.summary.avgOrderValue)],
            ['Discounts given', fmt(r.summary.discount)],
        ];
        const colW = contentWidth / 3;
        const cardH = 46;
        stats.forEach((s, i) => {
            const cx = left + (i % 3) * colW;
            const cy = y + Math.floor(i / 3) * (cardH + 8);
            doc.roundedRect(cx, cy, colW - 8, cardH, 6).fillAndStroke('#EEF0FF', INDIGO);
            doc.fillColor('#888888').font('Helvetica').fontSize(8).text(s[0], cx + 8, cy + 8, { width: colW - 24 });
            doc.fillColor('#222222').font('Helvetica-Bold').fontSize(13).text(s[1], cx + 8, cy + 22, { width: colW - 24 });
        });
        y += Math.ceil(stats.length / 3) * (cardH + 8) + 14;

        // By status
        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('By status', left, y);
        y += 20;
        const bw = contentWidth / STATUS_BUCKETS.length;
        STATUS_BUCKETS.forEach((b, i) => {
            const bx = left + i * bw;
            doc.roundedRect(bx, y, bw - 6, 40, 5).fillAndStroke('#F7F7FB', '#DDDDEE');
            doc.fillColor('#888888').font('Helvetica').fontSize(8).text(STATUS_LABEL[b], bx + 6, y + 7, { width: bw - 18 });
            doc.fillColor('#222222').font('Helvetica-Bold').fontSize(13).text(String(r.byStatus[b]), bx + 6, y + 20, { width: bw - 18 });
        });
        y += 56;

        // Products sold
        y = ensureSpace(doc, y, 80);
        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text(`Products sold (${r.productsSold.length})`, left, y);
        y += 20;
        y = drawTable(doc, y, left, contentWidth, [
            { label: 'Product', width: 0.6 },
            { label: 'Qty sold', width: 0.15, align: 'right' },
            { label: 'Revenue', width: 0.25, align: 'right' },
        ], r.productsSold.map((ps) => [ps.name, String(ps.qty), fmt(ps.revenue)]), 'No products sold in this period.');
        y += 18;

        // Sales by category
        y = ensureSpace(doc, y, 80);
        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('Sales by category', left, y);
        y += 20;
        y = drawTable(doc, y, left, contentWidth, [
            { label: 'Category', width: 0.5 },
            { label: 'Items', width: 0.2, align: 'right' },
            { label: 'Sales', width: 0.3, align: 'right' },
        ], r.byCategory.map((c) => [c.name, String(c.qty), fmt(c.revenue)]), 'No sales in this period.');
        y += 18;

        // Payment methods
        y = ensureSpace(doc, y, 80);
        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('Payment methods', left, y);
        y += 20;
        drawTable(doc, y, left, contentWidth, [
            { label: 'Method', width: 0.34 },
            { label: 'Orders', width: 0.16, align: 'right' },
            { label: 'Order value', width: 0.25, align: 'right' },
            { label: 'Paid', width: 0.25, align: 'right' },
        ], r.payments.map((m) => [m.method.toUpperCase(), String(m.orders), fmt(m.value), fmt(m.paid)]), 'No orders in this period.');

        drawFooter(doc, 'Shohoz Kitchen Admin · Internal sales report', left, contentWidth);
    });

/** The all-time platform PDF (kept for callers that send no period). */
const generateAdminReportPdf = async (): Promise<Buffer> => {
    const [summary, topProducts, byCategory] = await Promise.all([
        getAdminPlatformSummary(),
        getAdminTopProducts(10),
        getSalesByCategory(),
    ]);

    return collect((doc) => {
        const left = doc.page.margins.left;
        const right = doc.page.width - doc.page.margins.right;
        const contentWidth = right - left;

        drawHeader(doc, INDIGO, 'PLATFORM ANALYTICS', 'Admin Report', left, contentWidth);

        let y = 115;
        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('Platform Summary', left, y);
        y += 24;

        const stats: [string, string][] = [
            ['Total Revenue', fmt(summary.totalRevenue)],
            ['Total Orders', String(summary.totalOrders)],
            ['Total Products', String(summary.totalProducts)],
            ['Total Customers', String(summary.totalCustomers)],
        ];
        const colW = contentWidth / 2;
        const cardH = 46;
        stats.forEach((s, i) => {
            const cx = left + (i % 2) * colW;
            const cy = y + Math.floor(i / 2) * (cardH + 8);
            doc.roundedRect(cx, cy, colW - 8, cardH, 6).fillAndStroke('#EEF0FF', INDIGO);
            doc.fillColor('#888888').font('Helvetica').fontSize(8).text(s[0], cx + 8, cy + 8, { width: colW - 24 });
            doc.fillColor('#222222').font('Helvetica-Bold').fontSize(14).text(s[1], cx + 8, cy + 22, { width: colW - 16 });
        });
        y += Math.ceil(stats.length / 2) * (cardH + 8) + 16;

        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('Top Products', left, y);
        y += 20;
        y = drawTable(doc, y, left, contentWidth, [
            { label: 'Product', width: 0.6 },
            { label: 'Units Sold', width: 0.4, align: 'right' },
        ], (topProducts as any[]).map((p) => [p.name, String(p.totalSold || 0)]), 'No products yet.');

        y += 16;
        y = ensureSpace(doc, y, 80);
        doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('Sales by Category', left, y);
        y += 20;
        drawTable(doc, y, left, contentWidth, [
            { label: 'Category', width: 0.5 },
            { label: 'Items', width: 0.2, align: 'right' },
            { label: 'Sales', width: 0.3, align: 'right' },
        ], (byCategory as any[]).map((c) => [c.name || 'Uncategorized', String(c.totalItems || 0), fmt(c.totalSales || 0)]), 'No sales yet.');

        drawFooter(doc, 'Shohoz Kitchen Admin · Internal analytics report', left, contentWidth);
    });
};

const AnalyticsService = {
    getSalesReport,
    getSalesReportOrders,
    getLowStock,
    getReturnsSummary,
    getSalesByCategory,
    generateSalesReportPdf,
    generateAdminReportPdf,
};

export default AnalyticsService;
