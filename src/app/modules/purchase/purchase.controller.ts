import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import PurchaseService from './purchase.service';

const PurchaseController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const result = await PurchaseService.list(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Purchases fetched', data: result.data, meta: result.meta });
    }),

    getOne: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.getOne(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Purchase fetched', data });
    }),

    create: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.create(req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: `Purchase ${data.reference} created`, data });
    }),

    update: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.update(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Purchase updated', data });
    }),

    remove: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.remove(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: `Purchase ${data.reference} deleted`, data });
    }),

    addPayment: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.addPayment(req.params.id, req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: 'Payment recorded', data });
    }),

    removePayment: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.removePayment(req.params.id, req.params.paymentId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Payment removed', data });
    }),

    cancel: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.cancel(req.params.id, req.body?.reason);
        sendResponse(res, { statusCode: 200, success: true, message: 'Purchase cancelled', data });
    }),

    receive: catchAsync(async (req: Request, res: Response) => {
        const data = await PurchaseService.receive(req.params.id, req.body, req.user?.userId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Goods received', data });
    }),
};

export default PurchaseController;
