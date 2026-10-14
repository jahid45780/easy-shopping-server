import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import FraudService from './fraud.service';

const FraudController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const result = await FraudService.list(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Fraud flags fetched', data: result.data, meta: result.meta });
    }),

    summary: catchAsync(async (req: Request, res: Response) => {
        const data = await FraudService.summary();
        sendResponse(res, { statusCode: 200, success: true, message: 'Fraud summary fetched', data });
    }),

    getForOrder: catchAsync(async (req: Request, res: Response) => {
        const data = await FraudService.getForOrder(req.params.orderId);
        sendResponse(res, { statusCode: 200, success: true, message: data ? 'Fraud flag fetched' : 'This order is not flagged', data });
    }),

    review: catchAsync(async (req: Request, res: Response) => {
        const data = await FraudService.review(req.params.id, req.body, req.user?.userId);
        const message = req.body.status === 'cleared' ? 'Flag cleared' : 'Flag moved back to review';
        sendResponse(res, { statusCode: 200, success: true, message, data });
    }),

    cancelOrder: catchAsync(async (req: Request, res: Response) => {
        const data = await FraudService.cancelOrder(req.params.id, req.body?.note, req.user?.userId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Order cancelled and its items restocked', data });
    }),

    scan: catchAsync(async (req: Request, res: Response) => {
        const data = await FraudService.scan();
        sendResponse(res, { statusCode: 200, success: true, message: 'Open orders checked', data });
    }),

    lookup: catchAsync(async (req: Request, res: Response) => {
        const data = await FraudService.lookup(req.query.q);
        sendResponse(res, { statusCode: 200, success: true, message: 'Customer history fetched', data });
    }),
};

export default FraudController;
