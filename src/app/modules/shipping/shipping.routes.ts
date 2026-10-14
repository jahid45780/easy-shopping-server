import express from 'express';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import ShippingController from './shipping.controller';
import { updateShippingSettingsValidation } from './shipping.validation';

const router = express.Router();

// ── PUBLIC ─────────────────────────────────────────
// Shipping quote + live settings for checkout — MUST stay above the admin guard.
router.get('/quote', ShippingController.getQuote);
router.get('/settings', ShippingController.getSettings);
// Active zones + their rate, for the checkout "Delivery Area" dropdown.
router.get('/delivery-zones', ShippingController.getDeliveryZones);

// All shipping routes below require admin auth
router.use(authMiddleware, authorizeRoles('admin'));

// Settings (admin update) — delivery charges, free-delivery rules, courier COD charge.
// Edited from both Settings (Business) and Shipping & Zones → Settings.
router.patch('/settings', validateRequest(updateShippingSettingsValidation), ShippingController.updateSettings);

// Zones
router.get('/zones', ShippingController.getZones);
router.post('/zones', ShippingController.createZone);
router.patch('/zones/:id', ShippingController.updateZone);
router.delete('/zones/:id', ShippingController.deleteZone);

// Rates
router.get('/rates', ShippingController.getRates);
router.post('/rates', ShippingController.createRate);
router.patch('/rates/:id', ShippingController.updateRate);
router.delete('/rates/:id', ShippingController.deleteRate);

// Shipments (from orders)
router.get('/shipments', ShippingController.getShipments);
router.get('/stats', ShippingController.getStats);
router.patch('/shipments/:id/status', ShippingController.updateShipmentStatus);
router.patch('/shipments/:id/tracking', ShippingController.updateTracking);

export const ShippingRoutes = router;
