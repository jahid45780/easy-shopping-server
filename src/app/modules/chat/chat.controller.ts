import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AppError from '../../utils/AppError';
import { ChatService } from './chat.service';

const requireUser = (req: Request) => {
    if (!req.user) throw new AppError(401, 'You are not logged in.');
    return req.user;
};

const ChatController = {
    createConversation: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const conversation = await ChatService.findOrCreateConversation(
            user.userId,
            user.role,
            req.body
        );
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Conversation ready',
            data: conversation,
        });
    }),

    getMyConversations: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const conversations = await ChatService.getMyConversations(user.userId, user.role);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Conversations fetched',
            data: conversations,
        });
    }),

    getMessages: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 30;
        const { messages, meta } = await ChatService.getMessages(
            req.params.id,
            user.userId,
            user.role,
            page,
            limit
        );
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Messages fetched',
            data: messages,
            meta,
        });
    }),

    sendMessage: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const message = await ChatService.sendMessage(user.userId, user.role, req.body);
        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: 'Message sent',
            data: message,
        });
    }),

    markRead: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const result = await ChatService.markRead(req.params.id, user.userId, user.role);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Conversation marked read',
            data: result,
        });
    }),

    getUnreadCount: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const result = await ChatService.getUnreadTotal(user.userId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Unread count fetched',
            data: result,
        });
    }),

    getSupportConversations: catchAsync(async (req: Request, res: Response) => {
        const user = requireUser(req);
        const conversations = await ChatService.getSupportConversations(user.userId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Support conversations fetched',
            data: conversations,
        });
    }),
};

export default ChatController;
