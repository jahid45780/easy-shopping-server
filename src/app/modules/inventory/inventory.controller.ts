import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import InventoryService from './inventory.service';

const InventoryController = {
    getSummary: catchAsync(async (_req: Request, res: Response) => {
        const data = await InventoryService.getSummary();
        sendResponse(res, { statusCode: 200, success: true, message: 'Inventory summary fetched', data });
    }),

    getStock: catchAsync(async (req: Request, res: Response) => {
        const { rows, meta } = await InventoryService.getStock(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Stock fetched', data: rows, meta });
    }),

    getMovements: catchAsync(async (req: Request, res: Response) => {
        const { rows, meta } = await InventoryService.getMovements(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Stock movements fetched', data: rows, meta });
    }),

    stockIn: catchAsync(async (req: Request, res: Response) => {
        const data = await InventoryService.stockIn(req.body, req.user?.userId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: data.reactivated ? 'Stock added — product is active again' : 'Stock added',
            data,
        });
    }),

    adjust: catchAsync(async (req: Request, res: Response) => {
        const data = await InventoryService.adjust(req.body, req.user?.userId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Stock adjusted', data });
    }),

    quickProduct: catchAsync(async (req: Request, res: Response) => {
        const data = await InventoryService.quickProduct(req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: 'Draft product created with its opening stock', data });
    }),
};

export default InventoryController;
