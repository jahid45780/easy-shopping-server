import express from 'express';
import UnitController from './unit.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { createUnitValidation, updateUnitValidation } from './unit.validation';

const router = express.Router();

router.get('/', authMiddleware, authorizeRoles('admin', 'editor'), UnitController.getAll);
router.post('/', authMiddleware, authorizeRoles('admin', 'editor'), validateRequest(createUnitValidation), UnitController.create);
router.patch('/:id', authMiddleware, authorizeRoles('admin'), validateRequest(updateUnitValidation), UnitController.update);
router.delete('/:id', authMiddleware, authorizeRoles('admin'), UnitController.delete);

export const UnitRoutes = router;
