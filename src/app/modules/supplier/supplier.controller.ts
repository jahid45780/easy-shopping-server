import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import SupplierService from './supplier.service';

const SupplierController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const data = await SupplierService.list(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Suppliers fetched', data });
    }),

    getOne: catchAsync(async (req: Request, res: Response) => {
        const data = await SupplierService.getOne(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Supplier fetched', data });
    }),

    create: catchAsync(async (req: Request, res: Response) => {
        const data = await SupplierService.create(req.body);
        sendResponse(res, { statusCode: 201, success: true, message: 'Supplier added', data });
    }),

    update: catchAsync(async (req: Request, res: Response) => {
        const data = await SupplierService.update(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Supplier updated', data });
    }),

    delete: catchAsync(async (req: Request, res: Response) => {
        const data = await SupplierService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: `Supplier "${data.name}" deleted` });
    }),
};

export default SupplierController;
