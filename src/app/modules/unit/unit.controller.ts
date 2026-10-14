import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import UnitService from './unit.service';

const UnitController = {
    getAll: catchAsync(async (req: Request, res: Response) => {
        const units = await UnitService.getAll(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Units fetched', data: units });
    }),
    create: catchAsync(async (req: Request, res: Response) => {
        const unit = await UnitService.create(req.body);
        sendResponse(res, { statusCode: 201, success: true, message: 'Unit created', data: unit });
    }),
    update: catchAsync(async (req: Request, res: Response) => {
        const unit = await UnitService.update(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Unit updated', data: unit });
    }),
    delete: catchAsync(async (req: Request, res: Response) => {
        await UnitService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Unit deleted' });
    }),
};

export default UnitController;
