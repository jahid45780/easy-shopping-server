import express from 'express';
import SiteContentController from './siteContent.controller';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { updateMarketingValidation, updateSeoValidation } from './siteContent.validation';

const router = express.Router();

// Public — anyone can fetch site content
router.get('/', SiteContentController.get);

// Public — get single legal page by slug
router.get('/legal/:slug', SiteContentController.getLegalPage);

// Admin — get all legal pages
router.get('/legal', authMiddleware, authorizeRoles('admin'), SiteContentController.getAllLegalPages);

// Admin — full update (SEO and marketing are stripped; they have their own routes)
router.put('/', authMiddleware, authorizeRoles('admin'), SiteContentController.update);

// Super admin — Digital marketing IDs and SEO text, each value in a fixed shape
router.put('/marketing', authMiddleware, authorizeRoles('superadmin'), validateRequest(updateMarketingValidation), SiteContentController.updateMarketing);
router.put('/seo', authMiddleware, authorizeRoles('superadmin'), validateRequest(updateSeoValidation), SiteContentController.updateSeo);

// Admin — update legal page by slug
router.put('/legal/:slug', authMiddleware, authorizeRoles('admin'), SiteContentController.updateLegalPage);

// Admin — update specific section
router.patch('/:section', authMiddleware, authorizeRoles('admin'), SiteContentController.updateSection);

export const SiteContentRoutes = router;
