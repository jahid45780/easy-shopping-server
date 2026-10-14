import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AccountsService from './accounts.service';

const AccountsController = {
    overview: catchAsync(async (req: Request, res: Response) => {
        const data = await AccountsService.getOverview(req.query as Record<string, unknown>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Accounts overview fetched', data });
    }),
};

export default AccountsController;
