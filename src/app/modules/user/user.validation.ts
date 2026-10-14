import { z } from 'zod';

export const updateUserValidation = z.object({
    body: z.object({
        firstName: z.string().min(1).max(50).optional(),
        lastName: z.string().max(50).optional(),
        phone: z.string().optional(),
        avatar: z.string().url().optional(),
    }),
});

export const addAddressValidation = z.object({
    body: z.object({
        label: z.string().default('Home'),
        fullName: z.string().min(1, 'Full name is required'),
        phone: z.string().min(1, 'Phone is required'),
        address: z.string().min(1, 'Address is required'),
        area: z.string().optional(),
        city: z.string().min(1, 'City is required'),
        postalCode: z.string().optional(),
        isDefault: z.boolean().default(false),
    }),
});

export const updateAddressValidation = z.object({
    body: z.object({
        label: z.string().optional(),
        fullName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        area: z.string().optional(),
        city: z.string().optional(),
        postalCode: z.string().optional(),
        isDefault: z.boolean().optional(),
    }),
});

export const updateStatusValidation = z.object({
    body: z.object({
        status: z.enum(['active', 'blocked', 'pending']),
    }),
});

const bdPhone = z.string().trim().regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number');

export const createCustomerValidation = z.object({
    body: z.object({
        firstName: z.string().trim().min(1, 'Name is required').max(50),
        lastName: z.string().trim().max(50).optional(),
        phone: bdPhone,
        email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
        loyaltyPoints: z.number().int().min(0).optional(),
        defaultDiscount: z.number().min(0).max(100, 'Discount cannot exceed 100%').optional(),
    }),
});

export const adminUpdateUserValidation = z.object({
    body: z.object({
        firstName: z.string().trim().min(1).max(50).optional(),
        lastName: z.string().trim().max(50).optional(),
        phone: z.string().trim().optional(),
        status: z.enum(['active', 'blocked', 'pending']).optional(),
        isEmailVerified: z.boolean().optional(),
        loyaltyPoints: z.number().int('Points must be a whole number').min(0, 'Points cannot be negative').optional(),
        defaultDiscount: z.number().min(0, 'Discount cannot be negative').max(100, 'Discount cannot exceed 100%').optional(),
    }),
});
