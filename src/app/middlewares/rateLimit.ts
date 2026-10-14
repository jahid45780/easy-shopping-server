import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';

/**
 * Lightweight in-memory, per-IP rate limiter (no external dependency).
 *
 * Each call returns its OWN middleware with an isolated bucket, so different
 * endpoints are limited independently (login attempts don't share a counter with
 * OTP sends, etc.). Suited to a single-instance deploy; for multi-instance scaling,
 * back it with a shared store (e.g. Redis). Used to blunt brute-force (login / OTP
 * guessing) and abuse of costly endpoints (password-reset email / OTP-SMS spam).
 */
export const rateLimit = (opts: { windowMs: number; max: number; message?: string }) => {
    const { windowMs, max } = opts;
    const message = opts.message || 'Too many requests. Please try again in a little while.';
    const hits = new Map<string, number[]>();

    return (req: Request, _res: Response, next: NextFunction) => {
        const ip =
            (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            req.ip ||
            'unknown';
        const now = Date.now();
        const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);

        if (recent.length >= max) {
            return next(new AppError(429, message));
        }

        recent.push(now);
        hits.set(ip, recent);

        // Opportunistic cleanup so the map can't grow unbounded under many distinct IPs.
        if (hits.size > 5000) {
            for (const [k, v] of hits) {
                if (v.every((t) => now - t >= windowMs)) hits.delete(k);
            }
        }
        next();
    };
};

export default rateLimit;
