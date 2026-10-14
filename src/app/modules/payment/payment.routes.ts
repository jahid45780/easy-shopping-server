import express from 'express';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import PaymentController from './payment.controller';
import {
    initPaymentValidation,
    bkashExecuteValidation,
    simulateConfirmValidation,
} from './payment.validation';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES (no auth) — gateways/redirects hit these.
// MUST be declared BEFORE the admin guard below.
// ─────────────────────────────────────────────────────────────────────

// Start a payment for an existing order → { redirectUrl, transactionId }
router.post('/init', authMiddleware, validateRequest(initPaymentValidation), PaymentController.init);

// SSLCommerz callbacks (gateway posts form-encoded; some setups use GET).
router.get('/sslcommerz/success', PaymentController.sslcommerzSuccess);
router.post('/sslcommerz/success', PaymentController.sslcommerzSuccess);
router.get('/sslcommerz/fail', PaymentController.sslcommerzFail);
router.post('/sslcommerz/fail', PaymentController.sslcommerzFail);
router.get('/sslcommerz/cancel', PaymentController.sslcommerzCancel);
router.post('/sslcommerz/cancel', PaymentController.sslcommerzCancel);
router.get('/sslcommerz/ipn', PaymentController.sslcommerzIpn);
router.post('/sslcommerz/ipn', PaymentController.sslcommerzIpn);

// bKash execute step.
router.post('/bkash/execute', validateRequest(bkashExecuteValidation), PaymentController.bkashExecute);

// DEV-SIMULATION confirm (called by the frontend /payment/simulate page).
// Auth + ownership required; the service also hard-disables this in production.
router.post('/simulate/confirm', authMiddleware, validateRequest(simulateConfirmValidation), PaymentController.simulateConfirm);

// Public verify.
router.get('/verify/:transactionId', PaymentController.verify);

// ─────────────────────────────────────────────────────────────────────
// AUTHENTICATED USER ROUTES (logged-in, any role) — declared per-route
// so they sit ABOVE the admin guard.
// ─────────────────────────────────────────────────────────────────────
router.get('/my', authMiddleware, PaymentController.getMyTransactions);
router.post('/:transactionId/retry', authMiddleware, PaymentController.retry);

// ─────────────────────────────────────────────────────────────────────
// ADMIN ROUTES — everything below requires admin auth.
// ─────────────────────────────────────────────────────────────────────
router.use(authMiddleware, authorizeRoles('admin'));

router.get('/admin/all', PaymentController.getAll);
router.get('/admin/stats', PaymentController.getStats);
router.patch('/admin/:id/cod-paid', PaymentController.markCODPaid);
router.post('/admin/:id/refund', PaymentController.refundPayment);

export const PaymentRoutes = router;
