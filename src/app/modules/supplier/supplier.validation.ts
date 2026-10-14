import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Supplier id is not valid');
const text = (label: string, max: number) => z.string().trim().max(max, `${label} is too long (max ${max})`);

const name = z.string({ required_error: 'Supplier name is required', invalid_type_error: 'Supplier name is required' })
    .trim()
    .min(2, 'Supplier name is required')
    .max(120, 'Supplier name is too long (max 120)');
const phone = z.string().trim().max(40, 'Phone is too long').regex(/^[0-9+()\-.\s/]*$/, 'Phone can only have digits, spaces and + ( ) - /');
const email = z.string().trim().max(120, 'Email is too long').refine(
    (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Enter a valid email address',
);

const fields = {
    contactPerson: text('Contact person', 80).optional(),
    phone: phone.optional(),
    email: email.optional(),
    country: text('Country', 60).optional(),
    address: text('Address', 300).optional(),
    note: text('Note', 1000).optional(),
    isActive: z.boolean().optional(),
};

export const listSuppliersValidation = z.object({
    query: z.object({
        scope: z.enum(['active', 'all']).optional(),
        search: z.string().max(100).optional(),
    }),
});

export const supplierIdValidation = z.object({
    params: z.object({ id: objectId }),
});

export const createSupplierValidation = z.object({
    body: z.object({ name, ...fields }),
});

export const updateSupplierValidation = z.object({
    params: z.object({ id: objectId }),
    body: z
        .object({ name: name.optional(), ...fields })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});
