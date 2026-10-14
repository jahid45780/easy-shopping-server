import express from 'express';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import DashboardController from './dashboard.controller';

const router = express.Router();

// Read-only: the admin home page. No body or query, so no validation schema.
router.get('/summary', authMiddleware, authorizeRoles('admin'), DashboardController.getSummary);

export const DashboardRoutes = router;
