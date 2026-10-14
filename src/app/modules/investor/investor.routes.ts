import express from 'express';
import InvestorController from './investor.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import {
    listInvestorsValidation,
    summaryInvestorsValidation,
    createInvestorValidation,
    updateInvestorValidation,
    createTransactionValidation,
    updateTransactionValidation,
    idParamValidation,
    txParamValidation,
} from './investor.validation';

// Mounted at /api/investors — capital put in / taken out. Admin only on every route
// (authorizeRoles lets superadmin through as well). Investors never log in.
const router = express.Router();
// Money / dealers: super admin only (owner's rule — admins and editors never see it).
const admin = [authMiddleware, authorizeRoles('superadmin')];

router.get('/', ...admin, validateRequest(listInvestorsValidation), InvestorController.list);
router.get('/summary', ...admin, validateRequest(summaryInvestorsValidation), InvestorController.summary);
router.post('/', ...admin, validateRequest(createInvestorValidation), InvestorController.create);
router.get('/:id', ...admin, validateRequest(idParamValidation), InvestorController.getOne);
router.patch('/:id', ...admin, validateRequest(idParamValidation), validateRequest(updateInvestorValidation), InvestorController.update);
router.delete('/:id', ...admin, validateRequest(idParamValidation), InvestorController.delete);

router.post('/:id/transactions', ...admin, validateRequest(idParamValidation), validateRequest(createTransactionValidation), InvestorController.addTransaction);
router.patch('/:id/transactions/:txId', ...admin, validateRequest(txParamValidation), validateRequest(updateTransactionValidation), InvestorController.updateTransaction);
router.delete('/:id/transactions/:txId', ...admin, validateRequest(txParamValidation), InvestorController.deleteTransaction);

export const InvestorRoutes = router;
