import { z } from 'zod';
import { MAX_COD_CHARGE_BPS } from './shipping.model';

const money = (field: string) =>
    z.number({ invalid_type_error: `${field} must be a number` })
        .finite()
        .min(0, `${field} cannot be negative`);

// PATCH /shipping/settings — every field optional (partial update).
// Not .strict(): the Shipping & Zones page sends the whole settings object back
// (including _id, createdAt, …); unknown keys are ignored by the service.
export const updateShippingSettingsValidation = z.object({
    body: z.object({
        freeShippingThreshold: money('Free delivery threshold').optional(),
        freeShippingByThresholdEnabled: z.boolean().optional(),
        defaultInsideDhakaRate: money('Inside Dhaka delivery charge').optional(),
        defaultOutsideDhakaRate: money('Outside Dhaka delivery charge').optional(),
        defaultEstimatedDays: z.string().max(60, 'Delivery time is too long').optional(),
        quantityFreeShippingEnabled: z.boolean().optional(),
        minItemsForFreeShipping: z.number().int('Minimum items must be a whole number').min(0).optional(),
        codChargeBps: z.number({ invalid_type_error: 'COD charge must be a number' })
            .int('COD charge must be a whole number of basis points (0.01% steps)')
            .min(0, 'COD charge cannot be negative')
            .max(MAX_COD_CHARGE_BPS, 'COD charge cannot be more than 100%')
            .optional(),
    }),
});
