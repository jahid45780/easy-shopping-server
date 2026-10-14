import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AttributeService from './attribute.service';

const AttributeController = {
    getAll: catchAsync(async (req: Request, res: Response) => {
        const attributes = await AttributeService.getAll();
        sendResponse(res, { statusCode: 200, success: true, message: 'Attributes fetched', data: attributes });
    }),
    create: catchAsync(async (req: Request, res: Response) => {
        const attribute = await AttributeService.create(req.body);
        sendResponse(res, { statusCode: 201, success: true, message: 'Attribute created', data: attribute });
    }),
    update: catchAsync(async (req: Request, res: Response) => {
        const { attribute, removed } = await AttributeService.update(req.params.id, req.body);
        const inUse = removed.filter((r) => r.products > 0);
        const message = inUse.length
            ? `Removed. ${inUse.map((r) => `"${r.value}" is still on ${r.products} product${r.products === 1 ? '' : 's'}`).join('; ')} — those products were not changed.`
            : 'Attribute updated';
        sendResponse(res, { statusCode: 200, success: true, message, data: { attribute, removed } });
    }),
    delete: catchAsync(async (req: Request, res: Response) => {
        await AttributeService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Attribute deleted' });
    }),
};

export default AttributeController;
