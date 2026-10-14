import express from 'express';
import PurchaseController from './purchase.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    listPurchasesValidation,
    idParamValidation,
    createPurchaseValidation,
    updatePurchaseValidation,
    paymentValidation,
    removePaymentValidation,
    cancelValidation,
    receiveValidation,
} from './purchase.validation';

// Mounted at /api/purchases — admin-only bookkeeping (authorizeRoles lets superadmin through too).
const router = express.Router();
// Money / dealers: super admin only (owner's rule — admins and editors never see it).
const admin = [authMiddleware, authorizeRoles('superadmin')];

router.get('/', ...admin, validateRequest(listPurchasesValidation), PurchaseController.list);
router.post('/', ...admin, validateRequest(createPurchaseValidation), PurchaseController.create);
router.get('/:id', ...admin, validateRequest(idParamValidation), PurchaseController.getOne);
router.patch('/:id', ...admin, validateRequest(idParamValidation), validateRequest(updatePurchaseValidation), PurchaseController.update);
router.delete('/:id', ...admin, validateRequest(idParamValidation), PurchaseController.remove);
router.post('/:id/payments', ...admin, validateRequest(paymentValidation), PurchaseController.addPayment);
router.delete('/:id/payments/:paymentId', ...admin, validateRequest(removePaymentValidation), PurchaseController.removePayment);
router.post('/:id/cancel', ...admin, validateRequest(cancelValidation), PurchaseController.cancel);
router.post('/:id/receive', ...admin, validateRequest(receiveValidation), PurchaseController.receive);

export const PurchaseRoutes = router;
