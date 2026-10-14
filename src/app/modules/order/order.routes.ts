import express from 'express';
import OrderController from './order.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { createOrderValidation, updateOrderStatusValidation } from './order.validation';
import { OrderPrintController, orderPrintValidation } from './order.print';

const router = express.Router();

// ── Guest checkout (no auth required) ────────────
// Same validation as the authenticated checkout — without it a guest could send
// quantity <= 0 (negative-qty items skew the subtotal downward) or a malformed address.
router.post('/guest-checkout', validateRequest(createOrderValidation), OrderController.guestCheckout);

// ── Public order tracking (no auth required) ─────
router.get('/track/:orderId', OrderController.trackOrder);

// ── User routes ──────────────────────────────────
router.get('/my', authMiddleware, OrderController.getMyOrders);
router.post('/', authMiddleware, validateRequest(createOrderValidation), OrderController.create);
router.patch('/:id/cancel', authMiddleware, OrderController.cancel);


// ── Admin routes ─────────────────────────────────
// Editors (order desk) may list, open, confirm / update status, add notes and print.
// Creating orders, payments and courier tracking stay with admins.
router.post('/admin', authMiddleware, authorizeRoles('admin'), validateRequest(createOrderValidation), OrderController.createByAdmin);
router.get('/admin/all', authMiddleware, authorizeRoles('admin', 'editor'), OrderController.getAll);
router.get('/admin/stats', authMiddleware, authorizeRoles('admin', 'editor'), OrderController.getStats);
// Shipping labels / invoices for up to 100 orders (rendered as HTML in the browser).
router.post('/admin/print', authMiddleware, authorizeRoles('admin', 'editor'), validateRequest(orderPrintValidation), OrderPrintController.getPrintData);
router.get('/admin/:id', authMiddleware, authorizeRoles('admin', 'editor'), OrderController.getById);
router.patch('/admin/:id/status', authMiddleware, authorizeRoles('admin', 'editor'), validateRequest(updateOrderStatusValidation), OrderController.updateStatus);
router.patch('/admin/:id/payment', authMiddleware, authorizeRoles('admin'), OrderController.updatePaymentStatus);
router.patch('/admin/:id/note', authMiddleware, authorizeRoles('admin', 'editor'), OrderController.addNote);
router.patch('/admin/:id/tracking', authMiddleware, authorizeRoles('admin'), OrderController.updateOrderTracking);

// ── Legacy/general ───────────────────────────────
router.get('/:id', authMiddleware, OrderController.getById);

export const OrderRoutes = router;
