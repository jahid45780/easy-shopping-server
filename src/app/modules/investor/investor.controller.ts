import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import InvestorService from './investor.service';

const InvestorController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const investors = await InvestorService.list(req.query as Record<string, string>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Investors fetched', data: investors });
    }),

    summary: catchAsync(async (req: Request, res: Response) => {
        const summary = await InvestorService.summary(req.query as Record<string, string>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Investor summary fetched', data: summary });
    }),

    getOne: catchAsync(async (req: Request, res: Response) => {
        const investor = await InvestorService.getOne(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Investor fetched', data: investor });
    }),

    create: catchAsync(async (req: Request, res: Response) => {
        const investor = await InvestorService.create(req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: 'Investor added', data: investor });
    }),

    update: catchAsync(async (req: Request, res: Response) => {
        const investor = await InvestorService.update(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Investor updated', data: investor });
    }),

    delete: catchAsync(async (req: Request, res: Response) => {
        await InvestorService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Investor deleted' });
    }),

    addTransaction: catchAsync(async (req: Request, res: Response) => {
        const tx = await InvestorService.addTransaction(req.params.id, req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: tx.type === 'in' ? 'Money in recorded' : 'Money out recorded', data: tx });
    }),

    updateTransaction: catchAsync(async (req: Request, res: Response) => {
        const tx = await InvestorService.updateTransaction(req.params.id, req.params.txId, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Transaction updated', data: tx });
    }),

    deleteTransaction: catchAsync(async (req: Request, res: Response) => {
        await InvestorService.deleteTransaction(req.params.id, req.params.txId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Transaction deleted' });
    }),
};

export default InvestorController;
