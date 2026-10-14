import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import config from '../config';

// ── Which storage backend? ──────────────────────────────────────────────────
// If Cloudinary creds are present we upload to the cloud; otherwise we fall
// back to LOCAL DISK storage.
export const isCloudinaryEnabled = Boolean(
    config.cloudinary.cloud_name && config.cloudinary.api_key && config.cloudinary.api_secret,
);

// Folder where locally-uploaded files are written (fallback if Cloudinary is not configured).
export const uploadsDir = path.join(process.cwd(), 'uploads');
export const UPLOAD_DIR = uploadsDir;
if (!isCloudinaryEnabled && !fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Configure Cloudinary (only used when enabled) ───────────────────────────
cloudinary.config({
    cloud_name: config.cloudinary.cloud_name,
    api_key:    config.cloudinary.api_key,
    api_secret: config.cloudinary.api_secret,
});

// Cloudinary storage — stores uploads directly to the cloud and provides live HTTPS url.
const cloudStorage = new CloudinaryStorage({
    cloudinary,
    params: async (_req: any, _file: any) => ({
        folder:         'shohozkitchen/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'],
        transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }],
        public_id:      `product_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    }),
});

// Local disk storage — writes files into uploadsDir with a unique name.
const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `product_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
    },
});

// ── Multer upload — up to 10 files, 10MB each ────────────────────────────────
export const upload = multer({
    storage: isCloudinaryEnabled ? cloudStorage : diskStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpg, png, webp, gif, avif, svg)'));
        }
    },
});

// ── Resolve the public URL for an uploaded file ──────────────────────────────
// Cloudinary sets `file.path` to the full secure live URL (https://res.cloudinary.com/...).
// For disk storage we build an absolute URL to the statically-served /uploads route.
export function fileToUrl(req: Request, file: Express.Multer.File): string {
    if (isCloudinaryEnabled && (file as any).path) {
        return (file as any).path;
    }
    const base = (config.backend_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    return `${base}/uploads/${file.filename}`;
}

export { cloudinary };
