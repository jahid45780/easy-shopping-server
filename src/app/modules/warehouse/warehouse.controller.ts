import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import WarehouseService from './warehouse.service';
import { listWarehousesQuery, warehouseBody, warehouseUpdateBody } from './warehouse.validation';

// validateRequest (on the routes) only checks the request; parsing again here hands the
// service the cleaned values (trimmed strings).
const WarehouseController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const warehouses = await WarehouseService.list(listWarehousesQuery.parse(req.query));
        sendResponse(res, { statusCode: 200, success: true, message: 'Warehouses fetched', data: warehouses });
    }),
    create: catchAsync(async (req: Request, res: Response) => {
        const warehouse = await WarehouseService.create(warehouseBody.parse(req.body));
        sendResponse(res, { statusCode: 201, success: true, message: 'Warehouse added', data: warehouse });
    }),
    update: catchAsync(async (req: Request, res: Response) => {
        const warehouse = await WarehouseService.update(req.params.id, warehouseUpdateBody.parse(req.body));
        sendResponse(res, { statusCode: 200, success: true, message: 'Warehouse updated', data: warehouse });
    }),
    delete: catchAsync(async (req: Request, res: Response) => {
        const result = await WarehouseService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Warehouse deleted', data: result });
    }),
};

export default WarehouseController;
