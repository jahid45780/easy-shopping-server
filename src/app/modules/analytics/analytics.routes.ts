import express from 'express';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import AnalyticsController from './analytics.controller';
import {
    limitValidation,
    lowStockValidation,
    revenueValidation,
    salesReportOrdersValidation,
    salesReportValidation,
    staffActivityValidation,
    staffHistoryValidation,
} from './analytics.validation';

const router = express.Router();

// ── The signed-in staff member's own numbers — editors too ──
// Declared before the admin gate below on purpose: a route that answers here never
// reaches it. It only ever returns the caller's own rows.
router.get('/my-activity', authMiddleware, authorizeRoles('admin', 'editor'), validateRequest(staffActivityValidation), AnalyticsController.getMyActivity);

// ════════════════════════════════════════════════════════════
//  ADMIN ANALYTICS — everything below requires admin auth.
// ════════════════════════════════════════════════════════════
router.use(authMiddleware, authorizeRoles('admin'));

// ── Sales report (period = ?from=YYYY-MM-DD&to=YYYY-MM-DD, Dhaka days) ──
router.get('/sales-report', validateRequest(salesReportValidation), AnalyticsController.getSalesReport);
router.get('/sales-report/orders', validateRequest(salesReportOrdersValidation), AnalyticsController.getSalesReportOrders);

// ── Staff order activity (who confirmed what) — admins only, not editors ──
router.get('/staff-orders', validateRequest(staffActivityValidation), AnalyticsController.getStaffActivity);
router.get('/staff-orders/history', validateRequest(staffHistoryValidation), AnalyticsController.getStaffHistory);

// ── Dashboard ──
router.get('/dashboard', AnalyticsController.getDashboardSummary);
router.get('/monthly-revenue', AnalyticsController.getMonthlyRevenue);
router.get('/recent-orders', validateRequest(limitValidation), AnalyticsController.getRecentOrders);
router.get('/top-products', validateRequest(limitValidation), AnalyticsController.getTopProducts);
router.get('/sales-by-category', validateRequest(salesReportValidation), AnalyticsController.getSalesByCategory);
router.get('/revenue', validateRequest(revenueValidation), AnalyticsController.getRevenueStats);

// ── Stock, returns, PDF ──
router.get('/low-stock', validateRequest(lowStockValidation), AnalyticsController.getLowStock);
router.get('/returns-summary', validateRequest(salesReportValidation), AnalyticsController.getReturnsSummary);
router.get('/report/pdf', validateRequest(salesReportValidation), AnalyticsController.getAdminReportPdf);

export const AnalyticsRoutes = router;
