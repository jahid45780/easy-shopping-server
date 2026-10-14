import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import TransferService from './transfer.service';
import { listTransfersQuery, transferBody, transferUpdateBody } from './transfer.validation';

// validateRequest (on the routes) only checks the request; parsing again here hands the
// service the cleaned values (trimmed strings).
const TransferController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const result = await TransferService.list(listTransfersQuery.parse(req.query));
        sendResponse(res, { statusCode: 200, success: true, message: 'Transfers fetched', data: result.data, meta: result.meta });
    }),

    getOne: catchAsync(async (req: Request, res: Response) => {
        const transfer = await TransferService.getOne(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Transfer fetched', data: transfer });
    }),

    create: catchAsync(async (req: Request, res: Response) => {
        const transfer = await TransferService.create(transferBody.parse(req.body) as any, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: `Transfer ${transfer.reference} recorded`, data: transfer });
    }),

    update: catchAsync(async (req: Request, res: Response) => {
        const transfer = await TransferService.update(req.params.id, transferUpdateBody.parse(req.body) as any);
        sendResponse(res, { statusCode: 200, success: true, message: 'Transfer updated', data: transfer });
    }),

    delete: catchAsync(async (req: Request, res: Response) => {
        const result = await TransferService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: `Transfer ${result.reference} deleted`, data: result });
    }),
};

export default TransferController;
