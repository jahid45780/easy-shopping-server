import express from 'express';
import FraudController from './fraud.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    cancelFlaggedOrderValidation,
    listFlagsValidation,
    lookupValidation,
    orderIdValidation,
    reviewFlagValidation,
} from './fraud.validation';

// Mounted at /api/fraud: orders from customers who returned an order before, plus a
// customer-history lookup. Staff who confirm orders: admin and editor (superadmin always passes).
const router = express.Router();
const admin = [authMiddleware, authorizeRoles('admin', 'editor')];

router.get('/flags', ...admin, validateRequest(listFlagsValidation), FraudController.list);
router.get('/summary', ...admin, FraudController.summary);
router.get('/lookup', ...admin, validateRequest(lookupValidation), FraudController.lookup);
router.get('/order/:orderId', ...admin, validateRequest(orderIdValidation), FraudController.getForOrder);
router.post('/scan', ...admin, FraudController.scan);
router.patch('/flags/:id', ...admin, validateRequest(reviewFlagValidation), FraudController.review);
router.post('/flags/:id/cancel-order', ...admin, validateRequest(cancelFlaggedOrderValidation), FraudController.cancelOrder);

export const FraudRoutes = router;
