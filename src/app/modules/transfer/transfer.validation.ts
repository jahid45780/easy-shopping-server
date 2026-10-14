import { z } from 'zod';
import { isRealDay } from '../analytics/analytics.validation';
import { TRANSFER_STATUSES } from './transfer.model';
import { MAX_ITEMS, MAX_QTY } from './transfer.rules';

const objectId = (what: string) => z.string({ required_error: `${what} is required` }).trim().regex(/^[a-f\d]{24}$/i, `Choose a valid ${what.toLowerCase()}`);

/** A Bangladesh calendar day, YYYY-MM-DD. */
const day = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format')
    .refine(isRealDay, 'Not a valid calendar date');

const note = z.string().trim().max(500, 'Note is too long (max 500 characters)');

const item = z
    .object({
        product: objectId('Product').nullable().optional(),
        name: z.string().trim().max(200, 'Item name is too long').optional(),
        sku: z.string().trim().max(60, 'SKU is too long').optional(),
        unit: z.string().trim().max(40).optional(),
        qty: z
            .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
            .int('Quantity must be a whole number')
            .min(1, 'Quantity must be at least 1')
            .max(MAX_QTY, 'Quantity is too large'),
    })
    .refine((it) => !!it.product || !!it.name?.trim(), { message: 'Choose a product or type an item name', path: ['name'] });

const items = z.array(item).min(1, 'Add at least one item').max(MAX_ITEMS, `At most ${MAX_ITEMS} lines per transfer`);

export const transferBody = z
    .object({
        from: objectId('From warehouse'),
        to: objectId('To warehouse'),
        items,
        transferredAt: day.optional(),
        note: note.optional(),
    })
    .strict()
    .refine((b) => b.from !== b.to, { message: 'From and To must be different warehouses', path: ['to'] });

export const createTransferValidation = z.object({ body: transferBody });

export const transferUpdateBody = z
    .object({
        status: z.enum(TRANSFER_STATUSES).optional(),
        receivedAt: day.optional(),
        note: note.optional(),
        // Content — only while the transfer is in transit.
        from: objectId('From warehouse').optional(),
        to: objectId('To warehouse').optional(),
        items: items.optional(),
        transferredAt: day.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Nothing to update')
    .refine((b) => !(b.from && b.to && b.from === b.to), { message: 'From and To must be different warehouses', path: ['to'] })
    .refine(
        (b) => !b.status || (b.from === undefined && b.to === undefined && b.items === undefined && b.transferredAt === undefined),
        { message: 'Change the status on its own, not together with the route, date or items', path: ['status'] },
    )
    .refine((b) => b.receivedAt === undefined || b.status === undefined || b.status === 'received', {
        message: 'A received date only goes with "received"',
        path: ['receivedAt'],
    });

export const updateTransferValidation = z.object({ body: transferUpdateBody });

export const listTransfersQuery = z
    .object({
        search: z.string().trim().max(80).optional(),
        warehouse: objectId('Warehouse').optional(),                  // either side
        direction: z.enum(['any', 'out', 'in']).optional(),          // with `warehouse`
        fromWarehouse: objectId('From warehouse').optional(),
        toWarehouse: objectId('To warehouse').optional(),
        status: z.enum([...TRANSFER_STATUSES, 'all'] as [string, ...string[]]).optional(),
        dateFrom: day.optional(),   // inclusive, Dhaka
        dateTo: day.optional(),     // inclusive, Dhaka
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    })
    .refine((q) => !(q.dateFrom && q.dateTo && q.dateFrom > q.dateTo), { message: '"To" date must be on or after "from"', path: ['dateTo'] });

export const listTransfersValidation = z.object({ query: listTransfersQuery });
