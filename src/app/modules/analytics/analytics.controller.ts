import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { Order } from '../order/order.model';
import { Product } from '../product/product.model';
import { User } from '../user/user.model';
import { Category } from '../category/category.model';
import AnalyticsService from './analytics.service';
import StaffAnalytics from './analytics.staff';
import { REPORT_TZ, dhakaDayStart, dhakaToday, resolvePeriod } from './analytics.period';
import { StatusBucket } from './analytics.validation';

/** Numeric query param, or the fallback when missing. Routes validate the range. */
const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

const hasPeriod = (q: Request['query']) => Boolean(q.from || q.to);

const AnalyticsController = {
    // ════════════════════════════════════════════════════════════
    //  SALES REPORT — everything computed for ?from=YYYY-MM-DD&to=YYYY-MM-DD
    //  (Dhaka calendar days, inclusive; default today)
    // ════════════════════════════════════════════════════════════

    // GET /analytics/sales-report?from&to
    getSalesReport: catchAsync(async (req: Request, res: Response) => {
        const period = resolvePeriod(req.query.from, req.query.to);
        const data = await AnalyticsService.getSalesReport(period);
        sendResponse(res, { statusCode: 200, success: true, message: 'Sales report fetched', data });
    }),

    // GET /analytics/sales-report/orders?from&to&status&page&limit
    getSalesReportOrders: catchAsync(async (req: Request, res: Response) => {
        const period = resolvePeriod(req.query.from, req.query.to);
        const { orders, meta } = await AnalyticsService.getSalesReportOrders(period, {
            status: (req.query.status as StatusBucket) || undefined,
            page: num(req.query.page, 1),
            limit: num(req.query.limit, 10),
        });
        sendResponse(res, { statusCode: 200, success: true, message: 'Orders in period fetched', data: orders, meta });
    }),

    // ════════════════════════════════════════════════════════════
    //  DASHBOARD / LEGACY ENDPOINTS
    // ════════════════════════════════════════════════════════════

    // GET /analytics/dashboard — Main dashboard summary
    getDashboardSummary: catchAsync(async (req: Request, res: Response) => {
        // "Today" is the shop's day in Bangladesh, not the server's timezone.
        const todayStart = dhakaDayStart(dhakaToday());

        const [
            totalOrders,
            totalProducts,
            totalCustomers,
            totalCategories,
            pendingOrders,
            deliveredOrders,
            paidOrders,
            pendingPayments,
            revenueData,
            todayOrders,
            todayRevenue,
        ] = await Promise.all([
            Order.countDocuments(),
            Product.countDocuments({ isDeleted: false }),
            User.countDocuments({ role: 'user' }),
            Category.countDocuments({ isActive: true }),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'delivered' }),
            // Payment-status counts (used by the Payments dashboard).
            Order.countDocuments({ paymentStatus: 'paid' }),
            Order.countDocuments({ paymentStatus: 'pending' }),
            Order.aggregate([
                { $match: { paymentStatus: 'paid' } },
                { $group: { _id: null, totalRevenue: { $sum: '$total' } } },
            ]),
            Order.countDocuments({ createdAt: { $gte: todayStart } }),
            Order.aggregate([
                { $match: { createdAt: { $gte: todayStart }, paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$total' } } },
            ]),
        ]);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Dashboard summary fetched',
            data: {
                totalRevenue: revenueData[0]?.totalRevenue || 0,
                totalOrders,
                totalProducts,
                totalCustomers,
                totalCategories,
                pendingOrders,
                deliveredOrders,
                paidOrders,
                pendingPayments,
                todayOrders,
                todayRevenue: todayRevenue[0]?.total || 0,
            },
        });
    }),

    // GET /analytics/monthly-revenue — the latest 12 months with paid orders
    getMonthlyRevenue: catchAsync(async (req: Request, res: Response) => {
        const monthlyRevenue = await Order.aggregate([
            { $match: { paymentStatus: 'paid' } },
            {
                $group: {
                    _id: {
                        year: { $year: { date: '$createdAt', timezone: REPORT_TZ } },
                        month: { $month: { date: '$createdAt', timezone: REPORT_TZ } },
                    },
                    revenue: { $sum: '$total' },
                    orders: { $sum: 1 },
                },
            },
            // Newest 12 first, then back to chronological order.
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const data = monthlyRevenue.map((item) => ({
            month: months[item._id.month - 1],
            year: item._id.year,
            revenue: item.revenue,
            orders: item.orders,
        }));

        sendResponse(res, { statusCode: 200, success: true, message: 'Monthly revenue fetched', data });
    }),

    // GET /analytics/recent-orders?limit=10
    getRecentOrders: catchAsync(async (req: Request, res: Response) => {
        const limit = num(req.query.limit, 10);
        const orders = await Order.find()
            .populate('user', 'firstName lastName email')
            .sort('-createdAt')
            .limit(limit)
            .select('orderId user total status paymentStatus paymentMethod shippingAddress items createdAt');

        sendResponse(res, { statusCode: 200, success: true, message: 'Recent orders fetched', data: orders });
    }),

    // GET /analytics/top-products?limit=10 — all-time best sellers
    getTopProducts: catchAsync(async (req: Request, res: Response) => {
        const limit = num(req.query.limit, 10);
        const topProducts = await Product.find({ isDeleted: false })
            .sort('-totalSold')
            .limit(limit)
            .select('name thumbnail price totalSold stock category averageRating');

        sendResponse(res, { statusCode: 200, success: true, message: 'Top products fetched', data: topProducts });
    }),

    // GET /analytics/sales-by-category[?from&to] — all time unless a period is given
    getSalesByCategory: catchAsync(async (req: Request, res: Response) => {
        const period = hasPeriod(req.query) ? resolvePeriod(req.query.from, req.query.to) : undefined;
        const data = await AnalyticsService.getSalesByCategory(period);
        sendResponse(res, { statusCode: 200, success: true, message: 'Sales by category fetched', data });
    }),

    // GET /analytics/revenue?startDate&endDate — paid revenue per Dhaka day
    getRevenueStats: catchAsync(async (req: Request, res: Response) => {
        const { startDate, endDate } = req.query;
        const match: Record<string, any> = { paymentStatus: 'paid' };

        if (startDate) match.createdAt = { $gte: new Date(startDate as string) };
        if (endDate) {
            match.createdAt = { ...match.createdAt, $lte: new Date(endDate as string) };
        }

        const dailyRevenue = await Order.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TZ } },
                    revenue: { $sum: '$total' },
                    orders: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        sendResponse(res, { statusCode: 200, success: true, message: 'Revenue stats fetched', data: dailyRevenue });
    }),

    // GET /analytics/low-stock[?threshold=10] — without a threshold each product's own restock level is used
    getLowStock: catchAsync(async (req: Request, res: Response) => {
        const threshold = req.query.threshold !== undefined && req.query.threshold !== '' ? Number(req.query.threshold) : undefined;
        const data = await AnalyticsService.getLowStock(threshold);
        sendResponse(res, { statusCode: 200, success: true, message: 'Low stock products fetched', data });
    }),

    // GET /analytics/returns-summary[?from&to] — all time unless a period is given
    getReturnsSummary: catchAsync(async (req: Request, res: Response) => {
        const period = hasPeriod(req.query) ? resolvePeriod(req.query.from, req.query.to) : undefined;
        const data = await AnalyticsService.getReturnsSummary(period);
        sendResponse(res, { statusCode: 200, success: true, message: 'Returns summary fetched', data });
    }),

    // GET /analytics/staff-orders[?from&to] — who confirmed how many orders in the period
    getStaffActivity: catchAsync(async (req: Request, res: Response) => {
        const period = resolvePeriod(req.query.from, req.query.to);
        const data = await StaffAnalytics.getStaffActivity(period);
        sendResponse(res, { statusCode: 200, success: true, message: 'Staff order activity fetched', data });
    }),

    // GET /analytics/my-activity[?from&to] — the signed-in staff member's own numbers
    getMyActivity: catchAsync(async (req: Request, res: Response) => {
        const period = resolvePeriod(req.query.from, req.query.to);
        const data = await StaffAnalytics.getMyActivity(period, String(req.user?.userId));
        sendResponse(res, { statusCode: 200, success: true, message: 'Your activity fetched', data });
    }),

    // GET /analytics/staff-orders/history[?from&to&actor&status&page&limit] — the raw change log
    getStaffHistory: catchAsync(async (req: Request, res: Response) => {
        const period = resolvePeriod(req.query.from, req.query.to);
        const { rows, meta } = await StaffAnalytics.getStaffHistory(period, {
            actor: req.query.actor as string | undefined,
            status: req.query.status as string | undefined,
            page: num(req.query.page, 1),
            limit: num(req.query.limit, 20),
        });
        sendResponse(res, { statusCode: 200, success: true, message: 'Staff order history fetched', meta, data: rows });
    }),

    // GET /analytics/report/pdf[?from&to] — the period's Sales report, or the all-time report without one
    getAdminReportPdf: catchAsync(async (req: Request, res: Response) => {
        if (hasPeriod(req.query)) {
            const period = resolvePeriod(req.query.from, req.query.to);
            const pdf = await AnalyticsService.generateSalesReportPdf(period);
            const name = period.from === period.to ? period.from : `${period.from}_to_${period.to}`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="ShohozKitchen-Sales-Report-${name}.pdf"`);
            res.send(pdf);
            return;
        }
        const pdf = await AnalyticsService.generateAdminReportPdf();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ShohozKitchen-Platform-Analytics.pdf"`);
        res.send(pdf);
    }),
};

export default AnalyticsController;
