import { z } from 'zod';

export const createCouponValidation = z.object({
    body: z.object({
        code: z.string().min(1).max(20),
        description: z.string().optional(),
        discountType: z.enum(['percentage', 'fixed', 'free_shipping']).default('percentage'),
        discountValue: z.number().min(0).optional().default(0),
        maxDiscount: z.number().nullable().optional(),
        minOrderAmount: z.number().min(0).default(0),
        usageLimit: z.number().optional(),
        usagePerUser: z.number().int().min(1).optional(),
        applicableTo: z.enum(['all', 'specific_products', 'specific_categories']).optional(),
        specificProducts: z.array(z.string()).optional(),
        specificCategories: z.array(z.string()).optional(),
        startDate: z.string().or(z.date()).nullable().optional(),
        expiresAt: z.string().or(z.date()),
        isActive: z.boolean().default(true),
    }),
});

export const validateCouponValidation = z.object({
    body: z.object({
        code: z.string().min(1, 'Coupon code is required'),
        orderAmount: z.number().min(0),
        // Optional cart items so a product/category-scoped coupon can preview the
        // discount on just the eligible items.
        items: z.array(z.object({ product: z.string(), amount: z.number().min(0) })).optional(),
    }),
});
