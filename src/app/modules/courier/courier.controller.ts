import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import CourierService from './courier.service';
import config from '../../config';

const CourierController = {
    // GET /api/courier/packages?state=&search=&page=&limit=
    listPackages: catchAsync(async (req: Request, res: Response) => {
        const { state, search, page, limit } = req.query;
        const result = await CourierService.listPackages({
            state: state as string,
            search: search as string,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Courier packages fetched',
            meta: result.meta,
            data: result.data,
        });
    }),

    // POST /api/courier/orders/:orderId/packages/:packageId/book
    bookPackage: catchAsync(async (req: Request, res: Response) => {
        const pkg = await CourierService.bookPackage(req.params.orderId, req.params.packageId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Package booked with Steadfast', data: pkg });
    }),

    // POST /api/courier/bulk-book   body: { items: [{ orderId, packageId }] }
    bulkBook: catchAsync(async (req: Request, res: Response) => {
        const result = await CourierService.bulkBook(req.body?.items || []);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: `Booked ${result.booked}/${result.total} package(s) with Steadfast`,
            data: result,
        });
    }),

    // GET /api/courier/orders/:orderId/packages/:packageId/status
    refreshStatus: catchAsync(async (req: Request, res: Response) => {
        const result = await CourierService.refreshStatus(req.params.orderId, req.params.packageId);
        sendResponse(res, { statusCode: 200, success: true, message: 'Courier status refreshed', data: result });
    }),

    // POST /api/courier/bulk-status   body: { items: [{ orderId, packageId }] }
    bulkRefresh: catchAsync(async (req: Request, res: Response) => {
        const result = await CourierService.bulkRefresh(req.body?.items || []);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: `Synced ${result.ok}/${result.total} package(s)`,
            data: result,
        });
    }),

    // GET /api/courier/balance
    getBalance: catchAsync(async (_req: Request, res: Response) => {
        const balance = await CourierService.getBalance();
        sendResponse(res, { statusCode: 200, success: true, message: 'Steadfast balance fetched', data: balance });
    }),

    // POST /api/courier/webhook  (public — Steadfast calls this; guarded by shared secret)
    webhook: catchAsync(async (req: Request, res: Response) => {
        const secret = config.steadfast.webhook_secret;
        if (secret) {
            const authHeader = (req.headers['authorization'] as string) || '';
            const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const provided =
                bearerToken ||
                (req.headers['x-webhook-secret'] as string) ||
                (req.query.secret as string) ||
                '';
            if (provided !== secret) {
                return sendResponse(res, { statusCode: 401, success: false, message: 'Invalid webhook secret', data: null });
            }
        }
        const result = await CourierService.applyWebhook(req.body || {});
        sendResponse(res, { statusCode: 200, success: true, message: 'Webhook processed', data: result });
    }),
};

export default CourierController;
