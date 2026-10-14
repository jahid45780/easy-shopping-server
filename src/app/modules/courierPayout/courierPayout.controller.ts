import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import CourierPayoutService from './courierPayout.service';

const CourierPayoutController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const result = await CourierPayoutService.list(req.query as Record<string, string>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Courier payouts fetched', data: result.data, meta: result.meta });
    }),

    getOne: catchAsync(async (req: Request, res: Response) => {
        const payout = await CourierPayoutService.getOne(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Courier payout fetched', data: payout });
    }),

    createManual: catchAsync(async (req: Request, res: Response) => {
        const payout = await CourierPayoutService.createManual(req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: 'Payout recorded', data: payout });
    }),

    pull: catchAsync(async (req: Request, res: Response) => {
        const result = await CourierPayoutService.pullFromSteadfast(req.body.paymentId, req.body.note, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: 'Statement pulled from Steadfast', data: result });
    }),

    update: catchAsync(async (req: Request, res: Response) => {
        const payout = await CourierPayoutService.update(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Payout updated', data: payout });
    }),

    delete: catchAsync(async (req: Request, res: Response) => {
        await CourierPayoutService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Payout deleted' });
    }),
};

export default CourierPayoutController;
