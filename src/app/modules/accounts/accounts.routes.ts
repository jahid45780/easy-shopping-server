import express from 'express';
import AccountsController from './accounts.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { overviewValidation } from './accounts.validation';

// Mounted at /api/accounts — the money side of the business at a glance.
// Admin only (authorizeRoles lets superadmin through as well); read-only.
const router = express.Router();
// Money / dealers: super admin only (owner's rule — admins and editors never see it).
const admin = [authMiddleware, authorizeRoles('superadmin')];

router.get('/overview', ...admin, validateRequest(overviewValidation), AccountsController.overview);

export const AccountsRoutes = router;
