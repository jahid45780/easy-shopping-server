import express from 'express';
import { upload } from '../../utils/cloudinary';
import { uploadController } from './upload.controller';

const router = express.Router();

// POST /api/upload/image  — single image (public: reviews, admin)
router.post(
    '/image',
    upload.single('image'),
    uploadController.uploadSingle,
);

// POST /api/upload/images — multiple up to 10 (admin / reviews)
router.post(
    '/images',
    upload.array('images', 10),
    uploadController.uploadMultiple,
);

// POST /api/upload/my-images — multiple up to 5
router.post(
    '/my-images',
    upload.array('images', 5),
    uploadController.uploadMultiple,
);

export const UploadRoutes = router;
