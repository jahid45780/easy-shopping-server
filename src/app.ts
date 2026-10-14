import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import cookieParser from 'cookie-parser';

import globalErrorHandler from './app/middlewares/globalErrorHandler';
import notFoundHandler from './app/middlewares/notFoundHandler';
import config from './app/config';
import { uploadsDir } from './app/utils/cloudinary';

// ── Route Imports ────────────────────────────────────────────────
import { AuthRoutes } from './app/modules/auth/auth.routes';
import { UserRoutes } from './app/modules/user/user.routes';
import { CategoryRoutes } from './app/modules/category/category.routes';
import { ProductRoutes } from './app/modules/product/product.routes';
import { OrderRoutes } from './app/modules/order/order.routes';
import { ReviewRoutes } from './app/modules/review/review.routes';
import { CouponRoutes } from './app/modules/coupon/coupon.routes';
import { PaymentRoutes } from './app/modules/payment/payment.routes';
import { ShippingRoutes } from './app/modules/shipping/shipping.routes';
import { AnalyticsRoutes } from './app/modules/analytics/analytics.routes';
import { InquiryRoutes } from './app/modules/inquiry/inquiry.routes';
import { UploadRoutes } from './app/modules/upload/upload.routes';
import { SiteContentRoutes } from './app/modules/siteContent/siteContent.routes';
import { OfferRoutes } from './app/modules/offer/offer.routes';
import { RoleRoutes } from './app/modules/role/role.routes';
import { InvoiceRoutes } from './app/modules/invoice/invoice.routes';
import { ReturnRoutes } from './app/modules/return/return.routes';
import { ChatRoutes } from './app/modules/chat/chat.routes';
import { NotificationRoutes } from './app/modules/notification/notification.routes';
import { ActivityLogRoutes } from './app/modules/activityLog/activityLog.routes';
import { NewsletterRoutes } from './app/modules/newsletter/newsletter.routes';
import { CourierRoutes } from './app/modules/courier/courier.routes';
import { AssistantRoutes } from './app/modules/assistant/assistant.routes';
import { UnitRoutes } from './app/modules/unit/unit.routes';
import { DashboardRoutes } from './app/modules/dashboard/dashboard.routes';
import { AttributeRoutes } from './app/modules/attribute/attribute.routes';
import { InventoryRoutes } from './app/modules/inventory/inventory.routes';
import { CourierPayoutRoutes } from './app/modules/courierPayout/courierPayout.routes';
import { FraudRoutes } from './app/modules/fraud/fraud.routes';
import { SupplierRoutes } from './app/modules/supplier/supplier.routes';
import { PurchaseRoutes } from './app/modules/purchase/purchase.routes';
import { WarehouseRoutes } from './app/modules/warehouse/warehouse.routes';
import { TransferRoutes } from './app/modules/transfer/transfer.routes';
import { ExpenseRoutes } from './app/modules/expense/expense.routes';
import { InvestorRoutes } from './app/modules/investor/investor.routes';
import { AccountsRoutes } from './app/modules/accounts/accounts.routes';

const app: Application = express();

// ── Body Parsers ─────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = [
    ...config.cors_origins,
    config.frontend_url,
    'http://localhost:3000',
    'http://localhost:3001',
].filter(Boolean).map((origin) => origin.replace(/\/+$/, ''));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin.replace(/\/+$/, '')) !== -1 || config.env !== 'production') {
            callback(null, true);
        } else {
            // Production: reject unknown origins (dev stays fully open above).
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Health Check ─────────────────────────────────────────────────
app.get('/', (req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: '🛒 Shohoz Kitchen API Server is running!',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'API is healthy', uptime: process.uptime() });
});

// ── Uploaded images (stored on the VPS disk) ─────────────────────
// Serves files written by the upload routes; cached for a year (filenames are unique).
app.use('/uploads', express.static(uploadsDir, { maxAge: '1y', immutable: true }));

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/auth', AuthRoutes);
app.use('/api/users', UserRoutes);
app.use('/api/categories', CategoryRoutes);
app.use('/api/products', ProductRoutes);
app.use('/api/orders', OrderRoutes);
app.use('/api/reviews', ReviewRoutes);
app.use('/api/coupons', CouponRoutes);
app.use('/api/payments', PaymentRoutes);
app.use('/api/shipping', ShippingRoutes);
app.use('/api/analytics', AnalyticsRoutes);
app.use('/api/inquiries', InquiryRoutes);
app.use('/api/upload', UploadRoutes);
app.use('/api/site-content', SiteContentRoutes);
app.use('/api/offers', OfferRoutes);
app.use('/api/roles', RoleRoutes);
app.use('/api/invoices', InvoiceRoutes);
app.use('/api/returns', ReturnRoutes);
app.use('/api/chat', ChatRoutes);
app.use('/api/notifications', NotificationRoutes);
app.use('/api/activity-logs', ActivityLogRoutes);
app.use('/api/newsletter', NewsletterRoutes);
app.use('/api/courier', CourierRoutes);
app.use('/api/assistant', AssistantRoutes);
app.use('/api/units', UnitRoutes);
app.use('/api/dashboard', DashboardRoutes);
app.use('/api/attributes', AttributeRoutes);
app.use('/api/inventory', InventoryRoutes);
app.use('/api/courier-payouts', CourierPayoutRoutes);
app.use('/api/fraud', FraudRoutes);
app.use('/api/suppliers', SupplierRoutes);
app.use('/api/purchases', PurchaseRoutes);
app.use('/api/warehouses', WarehouseRoutes);
app.use('/api/transfers', TransferRoutes);
app.use('/api/expenses', ExpenseRoutes);
app.use('/api/investors', InvestorRoutes);
app.use('/api/accounts', AccountsRoutes);

// ── Error Handlers ────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
