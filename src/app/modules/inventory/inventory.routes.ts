import express from 'express';
import InventoryController from './inventory.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    stockQueryValidation,
    movementsQueryValidation,
    stockInValidation,
    adjustValidation,
    quickProductValidation,
} from './inventory.validation';

// Mounted at /api/inventory (admin only).
const router = express.Router();

router.get('/summary', authMiddleware, authorizeRoles('admin'), InventoryController.getSummary);
router.get('/stock', authMiddleware, authorizeRoles('admin'), validateRequest(stockQueryValidation), InventoryController.getStock);
router.get('/movements', authMiddleware, authorizeRoles('admin'), validateRequest(movementsQueryValidation), InventoryController.getMovements);
router.post('/stock-in', authMiddleware, authorizeRoles('admin'), validateRequest(stockInValidation), InventoryController.stockIn);
router.post('/adjust', authMiddleware, authorizeRoles('admin'), validateRequest(adjustValidation), InventoryController.adjust);
router.post('/quick-product', authMiddleware, authorizeRoles('admin'), validateRequest(quickProductValidation), InventoryController.quickProduct);

export const InventoryRoutes = router;
