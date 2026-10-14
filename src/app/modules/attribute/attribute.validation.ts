import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid attribute id');
const name = z.string().trim().min(1, 'Attribute name is required').max(60, 'Name is too long (max 60 characters)');
const value = z.string().trim().min(1, 'Value cannot be empty').max(60, 'Value is too long (max 60 characters)');
const valueList = z.array(value).max(500, 'Too many values (max 500)');

export const createAttributeValidation = z.object({
    body: z.object({
        name,
        values: valueList.optional(),
        isActive: z.boolean().optional(),
    }).strict(),
});

export const updateAttributeValidation = z.object({
    params: z.object({ id: objectId }),
    body: z.object({
        name: name.optional(),
        values: valueList.optional(),          // replace the whole list (also used to reorder)
        addValue: value.optional(),            // append one value (idempotent)
        addValues: valueList.min(1).optional(), // append several values (idempotent)
        removeValue: value.optional(),         // remove one value (products are never touched)
        isActive: z.boolean().optional(),
    }).strict().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
});

export const attributeIdValidation = z.object({
    params: z.object({ id: objectId }),
});
