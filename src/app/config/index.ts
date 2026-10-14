import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 5000,
    database_url: process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen',

    jwt: {
        access_secret: process.env.JWT_ACCESS_SECRET || 'shohozkitchen-access-secret',
        refresh_secret: process.env.JWT_REFRESH_SECRET || 'shohozkitchen-refresh-secret',
        access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
        refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,

    cloudinary: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
        api_key: process.env.CLOUDINARY_API_KEY || '',
        api_secret: process.env.CLOUDINARY_API_SECRET || '',
    },

    email: {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT) || 587,
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || '',
        from: process.env.EMAIL_FROM || 'noreply@shohozkitchen.com',
    },

    frontend_url: process.env.FRONTEND_URL || 'http://localhost:3000',

    // Every origin the browser may call this API from, comma-separated. The site
    // is reachable on more than one hostname (the live domain, its www form and
    // the hosting provider's fallback domain), but frontend_url has to stay a
    // single URL because verification and reset links are built from it.
    // Defaults to frontend_url when unset.
    cors_origins: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),

    // Public base URL of THIS backend — used to build absolute URLs for locally-stored
    // uploads (served from /uploads). Falls back to the payment backend URL, then localhost.
    backend_url: (process.env.BACKEND_URL || process.env.PAYMENT_BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, ''),

    pagination: {
        default_page: 1,
        default_limit: 10,
        max_limit: 100,
    },

    bkash: {
        app_key: process.env.BKASH_APP_KEY || '',
        app_secret: process.env.BKASH_APP_SECRET || '',
        username: process.env.BKASH_USERNAME || '',
        password: process.env.BKASH_PASSWORD || '',
        base_url: process.env.BKASH_BASE_URL || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
        sandbox: process.env.BKASH_SANDBOX ? process.env.BKASH_SANDBOX === 'true' : true,
    },

    sslcommerz: {
        store_id: process.env.SSLCZ_STORE_ID || '',
        store_passwd: process.env.SSLCZ_STORE_PASSWD || '',
        sandbox: process.env.SSLCZ_SANDBOX ? process.env.SSLCZ_SANDBOX === 'true' : true,
    },

    // Base URLs used to build gateway callback + redirect URLs.
    payment: {
        backend_url: process.env.PAYMENT_BACKEND_URL || 'http://localhost:5000',
        frontend_url: process.env.PAYMENT_FRONTEND_URL || 'http://localhost:3000',
    },

    // Google OAuth — "Sign in with Google". Authorization-code (popup) flow:
    // the browser returns a one-time code, the server exchanges it for tokens
    // using the client id + secret. client_id must match the client's
    // NEXT_PUBLIC_GOOGLE_CLIENT_ID.
    google: {
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    },

    // Steadfast Courier (Packzy) — delivery booking, status sync, COD.
    steadfast: {
        api_key: process.env.STEADFAST_API_KEY || '',
        secret_key: process.env.STEADFAST_SECRET_KEY || '',
        base_url: process.env.STEADFAST_BASE_URL || 'https://portal.packzy.com/api/v1',
        // Shared secret Steadfast must echo (query ?secret= or x-webhook-secret header) so
        // strangers can't spoof delivery-status webhooks. Empty = webhook accepts unsigned calls.
        webhook_secret: process.env.STEADFAST_WEBHOOK_SECRET || '',
        // Periodic background status pull (fallback when webhook isn't configured).
        // Opt-in: only runs when this is 'true' AND the API keys are present.
        auto_sync: process.env.STEADFAST_AUTO_SYNC === 'true',
        auto_sync_minutes: Number(process.env.STEADFAST_AUTO_SYNC_MINUTES) || 30,
    },

    // xAI Grok — powers the ShohozBot website AI assistant. Keep the key SERVER-SIDE
    // ONLY; it is never sent to the browser. Add credits at console.x.ai to activate.
    grok: {
        api_key: process.env.GROK_API_KEY || '',
        model: process.env.GROK_MODEL || 'grok-3',
        base_url: (process.env.GROK_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, ''),
    },
};
