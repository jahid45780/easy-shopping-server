import express from 'express';
import ChatController from './chat.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';

const router = express.Router();

// All chat routes require authentication.
router.use(authMiddleware);

// Conversations
router.post('/conversations', ChatController.createConversation);
router.get('/conversations', ChatController.getMyConversations);
router.get('/conversations/:id/messages', ChatController.getMessages);
router.patch('/conversations/:id/read', ChatController.markRead);

// Messages
router.post('/messages', ChatController.sendMessage);

// Unread badge
router.get('/unread-count', ChatController.getUnreadCount);

// Admin support inbox
router.get(
    '/support/conversations',
    authorizeRoles('admin', 'superadmin'),
    ChatController.getSupportConversations
);

export const ChatRoutes = router;
