import express from 'express';
import AttributeController from './attribute.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { attributeIdValidation, createAttributeValidation, updateAttributeValidation } from './attribute.validation';

const router = express.Router();

router.get('/', authMiddleware, authorizeRoles('admin', 'editor'), AttributeController.getAll);
router.post('/', authMiddleware, authorizeRoles('admin'), validateRequest(createAttributeValidation), AttributeController.create);
router.patch('/:id', authMiddleware, authorizeRoles('admin', 'editor'), validateRequest(updateAttributeValidation), AttributeController.update);
router.delete('/:id', authMiddleware, authorizeRoles('admin'), validateRequest(attributeIdValidation), AttributeController.delete);

export const AttributeRoutes = router;
