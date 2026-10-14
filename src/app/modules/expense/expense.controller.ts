import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import ExpenseService from './expense.service';

const ExpenseController = {
    list: catchAsync(async (req: Request, res: Response) => {
        const result = await ExpenseService.list(req.query as Record<string, string>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Expenses fetched', data: result.data, meta: result.meta });
    }),

    summary: catchAsync(async (req: Request, res: Response) => {
        const summary = await ExpenseService.summary(req.query as Record<string, string>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Expense summary fetched', data: summary });
    }),

    export: catchAsync(async (req: Request, res: Response) => {
        const result = await ExpenseService.export(req.query as Record<string, string>);
        sendResponse(res, { statusCode: 200, success: true, message: 'Expenses exported', data: result });
    }),

    getOne: catchAsync(async (req: Request, res: Response) => {
        const expense = await ExpenseService.getOne(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Expense fetched', data: expense });
    }),

    create: catchAsync(async (req: Request, res: Response) => {
        const expense = await ExpenseService.create(req.body, req.user?.userId);
        sendResponse(res, { statusCode: 201, success: true, message: 'Expense recorded', data: expense });
    }),

    update: catchAsync(async (req: Request, res: Response) => {
        const expense = await ExpenseService.update(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Expense updated', data: expense });
    }),

    delete: catchAsync(async (req: Request, res: Response) => {
        await ExpenseService.delete(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Expense deleted' });
    }),

    listCategories: catchAsync(async (req: Request, res: Response) => {
        const categories = await ExpenseService.listCategories();
        sendResponse(res, { statusCode: 200, success: true, message: 'Expense categories fetched', data: categories });
    }),

    createCategory: catchAsync(async (req: Request, res: Response) => {
        const category = await ExpenseService.createCategory(req.body);
        sendResponse(res, { statusCode: 201, success: true, message: 'Category added', data: category });
    }),

    updateCategory: catchAsync(async (req: Request, res: Response) => {
        const category = await ExpenseService.updateCategory(req.params.id, req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Category updated', data: category });
    }),

    deleteCategory: catchAsync(async (req: Request, res: Response) => {
        await ExpenseService.deleteCategory(req.params.id);
        sendResponse(res, { statusCode: 200, success: true, message: 'Category deleted' });
    }),
};

export default ExpenseController;
