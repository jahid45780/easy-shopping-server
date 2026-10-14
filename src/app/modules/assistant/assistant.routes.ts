import express, { Request, Response, NextFunction } from 'express';
import AssistantController from './assistant.controller';
import AppError from '../../utils/AppError';

const router = express.Router();

// ── Lightweight in-memory per-IP rate limit ─────────────────────────
// The assistant spends xAI credits, so cap abuse: max N requests / window / IP.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

const rateLimit = (req: Request, _res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    if (arr.length >= MAX_PER_WINDOW) {
        return next(new AppError(429, 'Too many messages. Please wait a moment and try again.'));
    }
    arr.push(now);
    hits.set(ip, arr);
    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (hits.size > 5000) {
        for (const [k, v] of hits) {
            if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
        }
    }
    next();
};

// Public — the website chatbot widget calls this.
router.post('/chat', rateLimit, AssistantController.chat);

export const AssistantRoutes = router;
