import { z } from 'zod';

const name = z.string().trim().min(1, 'Unit name is required').max(40, 'Name is too long');
const shortName = z.string().trim().min(1, 'Short name is required').max(10, 'Short name is too long (max 10)');

export const createUnitValidation = z.object({
    body: z.object({
        name,
        shortName,
        isActive: z.boolean().optional(),
    }),
});

export const updateUnitValidation = z.object({
    body: z.object({
        name: name.optional(),
        shortName: shortName.optional(),
        isActive: z.boolean().optional(),
    }),
});
