import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import DashboardService from './dashboard.service';

const DashboardController = {
    // GET /api/dashboard/summary — everything the admin home page shows, in one call.
    getSummary: catchAsync(async (req: Request, res: Response) => {
        const data = await DashboardService.getSummary();
        sendResponse(res, { statusCode: 200, success: true, message: 'Dashboard summary fetched', data });
    }),
};

export default DashboardController;
