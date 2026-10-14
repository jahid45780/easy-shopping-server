import express from 'express';
import SupplierController from './supplier.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    listSuppliersValidation,
    supplierIdValidation,
    createSupplierValidation,
    updateSupplierValidation,
} from './supplier.validation';

// Mounted at /api/suppliers — admin-only bookkeeping (authorizeRoles lets superadmin through too).
// Suppliers never log in; there is no supplier-facing route.
const router = express.Router();
// Money / dealers: super admin only (owner's rule — admins and editors never see it).
const admin = [authMiddleware, authorizeRoles('superadmin')];

router.get('/', ...admin, validateRequest(listSuppliersValidation), SupplierController.list);
router.post('/', ...admin, validateRequest(createSupplierValidation), SupplierController.create);
router.get('/:id', ...admin, validateRequest(supplierIdValidation), SupplierController.getOne);
router.patch('/:id', ...admin, validateRequest(updateSupplierValidation), SupplierController.update);
router.delete('/:id', ...admin, validateRequest(supplierIdValidation), SupplierController.delete);

export const SupplierRoutes = router;
