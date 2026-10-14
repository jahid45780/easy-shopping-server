import mongoose from 'mongoose';
import app from '../src/app';
import { IncomingMessage, ServerResponse } from 'http';

// ── MongoDB Connection (Vercel-optimized with caching) ─────────
interface CachedConnection {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

declare global {
    var mongooseCache: CachedConnection | undefined;
}

const cached: CachedConnection = global.mongooseCache || { conn: null, promise: null };
if (!global.mongooseCache) global.mongooseCache = cached;

async function connectDB() {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        const dbUrl = process.env.DATABASE_URL || '';
        console.log('[Vercel] Connecting to MongoDB...');
        cached.promise = mongoose.connect(dbUrl, {
            bufferCommands: false,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
    }

    try {
        cached.conn = await cached.promise;
        console.log('[Vercel] MongoDB connected successfully');
    } catch (error) {
        cached.promise = null;
        console.error('[Vercel] MongoDB connection error:', error);
        throw error;
    }

    return cached.conn;
}

// ── Export handler: connect DB first, then delegate to Express ──
export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        await connectDB();
    } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            success: false,
            message: 'Database connection failed',
            error: error instanceof Error ? error.message : 'Unknown error',
        }));
        return;
    }
    return app(req, res);
}

