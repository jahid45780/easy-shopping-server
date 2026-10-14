import { z } from 'zod';

const name = z.string({ required_error: 'Warehouse name is required' }).trim().min(1, 'Warehouse name is required').max(80, 'Name is too long (max 80 characters)');
const location = z.string().trim().max(200, 'Location is too long (max 200 characters)');
const contactPerson = z.string().trim().max(80, 'Contact name is too long');
const phone = z
    .string()
    .trim()
    .max(30, 'Phone number is too long')
    .refine((v) => v === '' || /^\+?[\d\s-]{6,20}$/.test(v), 'Enter a valid phone number');
const note = z.string().trim().max(500, 'Note is too long (max 500 characters)');

export const warehouseBody = z
    .object({
        name,
        location: location.optional(),
        contactPerson: contactPerson.optional(),
        phone: phone.optional(),
        note: note.optional(),
        isActive: z.boolean().optional(),
    })
    .strict();

export const warehouseUpdateBody = z
    .object({
        name: name.optional(),
        location: location.optional(),
        contactPerson: contactPerson.optional(),
        phone: phone.optional(),
        note: note.optional(),
        isActive: z.boolean().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const listWarehousesQuery = z.object({
    scope: z.enum(['active', 'all']).optional(),
    search: z.string().trim().max(80).optional(),
});

export const createWarehouseValidation = z.object({ body: warehouseBody });
export const updateWarehouseValidation = z.object({ body: warehouseUpdateBody });
export const listWarehousesValidation = z.object({ query: listWarehousesQuery });
