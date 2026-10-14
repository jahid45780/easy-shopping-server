import express from 'express';
import WarehouseController from './warehouse.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import AppError from '../../utils/AppError';
import { createWarehouseValidation, listWarehousesValidation, updateWarehouseValidation } from './warehouse.validation';

// Mounted at /api/warehouses — stock locations. Admin-only bookkeeping (authorizeRoles
// lets superadmin through as well); there is no warehouse login or dashboard.
const router = express.Router();
const admin = [authMiddleware, authorizeRoles('admin')];

const validId = (req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(/^[a-f\d]{24}$/i.test(req.params.id) ? undefined : new AppError(404, 'Warehouse not found'));

router.get('/', ...admin, validateRequest(listWarehousesValidation), WarehouseController.list);
router.post('/', ...admin, validateRequest(createWarehouseValidation), WarehouseController.create);
router.patch('/:id', ...admin, validId, validateRequest(updateWarehouseValidation), WarehouseController.update);
router.delete('/:id', ...admin, validId, WarehouseController.delete);

export const WarehouseRoutes = router;
