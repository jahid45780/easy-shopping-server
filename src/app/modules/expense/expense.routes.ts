import express from 'express';
import ExpenseController from './expense.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    listExpensesValidation,
    summaryExpensesValidation,
    exportExpensesValidation,
    createExpenseValidation,
    updateExpenseValidation,
    createCategoryValidation,
    updateCategoryValidation,
    idParamValidation,
} from './expense.validation';

// Mounted at /api/expenses — the admin's spending ledger. Admin only on every route
// (authorizeRoles lets superadmin through as well); nothing here is public.
const router = express.Router();
// Money / dealers: super admin only (owner's rule — admins and editors never see it).
const admin = [authMiddleware, authorizeRoles('superadmin')];

// Categories (heads of spending). Listed first so "/categories" never reads as an expense id.
router.get('/categories', ...admin, ExpenseController.listCategories);
router.post('/categories', ...admin, validateRequest(createCategoryValidation), ExpenseController.createCategory);
router.patch('/categories/:id', ...admin, validateRequest(idParamValidation), validateRequest(updateCategoryValidation), ExpenseController.updateCategory);
router.delete('/categories/:id', ...admin, validateRequest(idParamValidation), ExpenseController.deleteCategory);

router.get('/', ...admin, validateRequest(listExpensesValidation), ExpenseController.list);
router.get('/summary', ...admin, validateRequest(summaryExpensesValidation), ExpenseController.summary);
router.get('/export', ...admin, validateRequest(exportExpensesValidation), ExpenseController.export);
router.post('/', ...admin, validateRequest(createExpenseValidation), ExpenseController.create);
router.get('/:id', ...admin, validateRequest(idParamValidation), ExpenseController.getOne);
router.patch('/:id', ...admin, validateRequest(idParamValidation), validateRequest(updateExpenseValidation), ExpenseController.update);
router.delete('/:id', ...admin, validateRequest(idParamValidation), ExpenseController.delete);

export const ExpenseRoutes = router;
