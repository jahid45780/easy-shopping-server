import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AppError from '../../utils/AppError';
import { askAssistant, ChatTurn } from './assistant.service';

const AssistantController = {
    // POST /api/assistant/chat  { message, history? }
    // Public endpoint used by the website ShohozBot widget.
    chat: catchAsync(async (req: Request, res: Response) => {
        const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
        if (!message) throw new AppError(400, 'A message is required.');
        if (message.length > 2000) throw new AppError(400, 'Message is too long (max 2000 characters).');

        const history: ChatTurn[] = Array.isArray(req.body?.history)
            ? req.body.history
                  .filter((h: any) => h && (h.from === 'user' || h.from === 'bot') && typeof h.text === 'string')
                  .slice(-8)
            : [];

        try {
            const { reply } = await askAssistant(message, history);
            sendResponse(res, { statusCode: 200, success: true, message: 'ok', data: { reply } });
        } catch (err: any) {
            // AI is unavailable (no credits, network, key, etc.). Don't error out —
            // tell the client so the widget can fall back to its built-in answers.
            // eslint-disable-next-line no-console
            console.error('[Assistant] AI call failed:', err?.message || err);
            sendResponse(res, {
                statusCode: 200,
                success: true,
                message: 'ai_unavailable',
                data: { reply: null, aiUnavailable: true, reason: String(err?.message || 'AI unavailable').slice(0, 200) },
            });
        }
    }),
};

export default AssistantController;
