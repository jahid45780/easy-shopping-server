import express from 'express';
import CourierPayoutController from './courierPayout.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    listPayoutsValidation,
    manualPayoutValidation,
    pullPayoutValidation,
    updatePayoutValidation,
} from './courierPayout.validation';

// Mounted at /api/courier-payouts — money Steadfast has sent us (admin only;
// authorizeRoles lets superadmin through as well).
const router = express.Router();
// Money / dealers: super admin only (owner's rule — admins and editors never see it).
const admin = [authMiddleware, authorizeRoles('superadmin')];

router.get('/', ...admin, validateRequest(listPayoutsValidation), CourierPayoutController.list);
router.post('/manual', ...admin, validateRequest(manualPayoutValidation), CourierPayoutController.createManual);
router.post('/pull', ...admin, validateRequest(pullPayoutValidation), CourierPayoutController.pull);
router.get('/:id', ...admin, CourierPayoutController.getOne);
router.patch('/:id', ...admin, validateRequest(updatePayoutValidation), CourierPayoutController.update);
router.delete('/:id', ...admin, CourierPayoutController.delete);

export const CourierPayoutRoutes = router;
