import express from 'express';
import TransferController from './transfer.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import AppError from '../../utils/AppError';
import { createTransferValidation, listTransfersValidation, updateTransferValidation } from './transfer.validation';

// Mounted at /api/transfers — goods moved between warehouses. Admin-only bookkeeping
// (authorizeRoles lets superadmin through as well). Records only: never touches stock.
const router = express.Router();
const admin = [authMiddleware, authorizeRoles('admin')];

const validId = (req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(/^[a-f\d]{24}$/i.test(req.params.id) ? undefined : new AppError(404, 'Transfer not found'));

router.get('/', ...admin, validateRequest(listTransfersValidation), TransferController.list);
router.post('/', ...admin, validateRequest(createTransferValidation), TransferController.create);
router.get('/:id', ...admin, validId, TransferController.getOne);
router.patch('/:id', ...admin, validId, validateRequest(updateTransferValidation), TransferController.update);
router.delete('/:id', ...admin, validId, TransferController.delete);

export const TransferRoutes = router;
