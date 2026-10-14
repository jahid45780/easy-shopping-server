import { z } from 'zod';
import { STOCK_MOVEMENT_TYPES } from './stockMovement.model';

const objectId = (label: string) =>
    z.string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
        .regex(/^[0-9a-fA-F]{24}$/, `${label} is not valid`);

const qty = (label: string) =>
    z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .max(1_000_000, `${label} is too large`);

const money = (label: string) =>
    z.number({ invalid_type_error: `${label} must be a number` })
        .min(0, `${label} cannot be negative`)
        .max(100_000_000, `${label} is too large`);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

// ── GET /stock ───────────────────────────────────────────────────────────
export const stockQueryValidation = z.object({
    query: z.object({
        search: z.string().max(100).optional(),
        filter: z.enum(['all', 'low', 'out', 'draft']).optional(),
        sort: z.enum(['name', '-name', 'stock', '-stock', 'value', '-value', '-updatedAt']).optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
});

// ── GET /movements ───────────────────────────────────────────────────────
export const movementsQueryValidation = z.object({
    query: z.object({
        product: objectId('Product').optional(),
        type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
        search: z.string().max(100).optional(),
        from: ymd.optional(),
        to: ymd.optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
});

// ── POST /stock-in ───────────────────────────────────────────────────────
export const stockInValidation = z.object({
    body: z.object({
        productId: objectId('Product'),
        variantId: objectId('Variant').optional().nullable(),
        quantity: qty('Quantity').positive('Quantity must be at least 1'),
        unitCost: money('Unit cost').optional().nullable(),
        note: z.string().trim().max(300).optional(),
    }),
});

// ── POST /adjust ─────────────────────────────────────────────────────────
// mode 'set'    → the counted quantity becomes the new stock (logged as 'adjustment')
// mode 'remove' → take N units out (damaged, lost, …; logged as 'stock_out')
export const adjustValidation = z.object({
    body: z
        .object({
            productId: objectId('Product'),
            variantId: objectId('Variant').optional().nullable(),
            mode: z.enum(['set', 'remove'], { required_error: 'Choose how to adjust' }),
            quantity: qty('Quantity').min(0, 'Quantity cannot be negative'),
            reason: z.string({ required_error: 'A reason is required' }).trim().min(2, 'A reason is required').max(120),
            note: z.string().trim().max(300).optional(),
        })
        .refine((b) => b.mode !== 'remove' || b.quantity > 0, {
            message: 'Quantity to remove must be at least 1',
            path: ['quantity'],
        }),
});

// ── POST /quick-product ──────────────────────────────────────────────────
// A new product that arrived with a delivery: just enough to count it. It is created as a
// DRAFT and finished later on the Products page.
export const quickProductValidation = z.object({
    body: z.object({
        name: z.string({ required_error: 'Product name is required' }).trim().min(2, 'Product name is required').max(200),
        category: objectId('Category'),
        unit: z.string().trim().min(1).max(20).optional(),
        sku: z.string().trim().max(60).optional(),
        quantity: qty('Quantity').min(0, 'Quantity cannot be negative'),
        unitCost: money('Unit cost').optional().nullable(),
        price: money('Selling price').optional().nullable(),
        lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
    }),
});
