import { z } from 'zod';
import { isRealDay } from '../analytics/analytics.validation';
import { CURRENCIES, PAYMENT_METHODS, PURCHASE_STATUSES, SHIPPING_MODES } from './purchase.model';

// Note: validateRequest checks the request but does not replace req.body, so the
// service trims and rounds again itself.

const objectId = (label: string) =>
    z.string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
        .regex(/^[0-9a-fA-F]{24}$/, `${label} is not valid`);

/** A Dhaka calendar day, YYYY-MM-DD. */
const day = (label: string) =>
    z.string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: use a YYYY-MM-DD date`)
        .refine(isRealDay, `${label} is not a real date`);

const money = (label: string) =>
    z.number({ invalid_type_error: `${label} must be a number` })
        .finite(`${label} must be a number`)
        .min(0, `${label} cannot be negative`)
        .max(10_000_000_000, `${label} is too large`);

const text = (label: string, max: number) => z.string().trim().max(max, `${label} is too long (max ${max})`);

const item = z.object({
    _id: objectId('Item').optional(),
    product: objectId('Product').nullable().optional(),
    variantId: objectId('Variant').nullable().optional(),
    name: z.string({ required_error: 'Every item needs a name' }).trim().min(1, 'Every item needs a name').max(200, 'Item name is too long'),
    sku: text('SKU', 60).optional(),
    qty: z.number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
        .int('Quantity must be a whole number')
        .min(1, 'Quantity must be at least 1')
        .max(1_000_000, 'Quantity is too large'),
    unitCost: money('Unit cost'),
});

const exchangeRate = z.number({ invalid_type_error: 'Exchange rate must be a number' })
    .finite()
    .positive('Exchange rate must be more than 0')
    .max(100_000, 'Exchange rate is too large');

const purchaseFields = {
    supplier: objectId('Supplier'),
    supplierInvoice: text('Supplier invoice', 80),
    shippingMode: z.enum(SHIPPING_MODES),
    orderDate: day('Order date'),
    eta: day('ETA').nullable(),
    currency: z.enum(CURRENCIES),
    exchangeRate,
    items: z.array(item).min(1, 'Add at least one item').max(200, 'A purchase can have at most 200 items'),
    shippingCost: money('Shipping cost'),
    customsDuty: money('Customs duty'),
    otherCost: money('Other cost'),
    otherCostLabel: text('Other cost label', 60),
    discount: money('Discount'),
    note: text('Note', 1000),
};

export const createPurchaseValidation = z.object({
    body: z
        .object({
            supplier: purchaseFields.supplier,
            status: z.enum(['draft', 'confirmed']).optional(),
            supplierInvoice: purchaseFields.supplierInvoice.optional(),
            shippingMode: purchaseFields.shippingMode.optional(),
            orderDate: purchaseFields.orderDate.optional(),
            eta: purchaseFields.eta.optional(),
            currency: purchaseFields.currency.optional(),
            exchangeRate: purchaseFields.exchangeRate.optional(),
            items: purchaseFields.items,
            shippingCost: purchaseFields.shippingCost.optional(),
            customsDuty: purchaseFields.customsDuty.optional(),
            otherCost: purchaseFields.otherCost.optional(),
            otherCostLabel: purchaseFields.otherCostLabel.optional(),
            discount: purchaseFields.discount.optional(),
            note: purchaseFields.note.optional(),
        })
        .superRefine((b, ctx) => {
            if (b.currency && b.currency !== 'BDT' && !b.exchangeRate) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['exchangeRate'], message: `Enter the exchange rate (BDT per 1 ${b.currency})` });
            }
        }),
});

export const updatePurchaseValidation = z.object({
    body: z
        .object({
            supplier: purchaseFields.supplier.optional(),
            status: z.enum(['draft', 'confirmed']).optional(),
            supplierInvoice: purchaseFields.supplierInvoice.optional(),
            shippingMode: purchaseFields.shippingMode.optional(),
            orderDate: purchaseFields.orderDate.optional(),
            eta: purchaseFields.eta.optional(),
            currency: purchaseFields.currency.optional(),
            exchangeRate: purchaseFields.exchangeRate.optional(),
            items: purchaseFields.items.optional(),
            shippingCost: purchaseFields.shippingCost.optional(),
            customsDuty: purchaseFields.customsDuty.optional(),
            otherCost: purchaseFields.otherCost.optional(),
            otherCostLabel: purchaseFields.otherCostLabel.optional(),
            discount: purchaseFields.discount.optional(),
            note: purchaseFields.note.optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
});

export const listPurchasesValidation = z.object({
    query: z.object({
        search: z.string().max(100).optional(),
        status: z.enum([...PURCHASE_STATUSES, 'all', 'open'] as [string, ...string[]]).optional(),
        supplier: objectId('Supplier').optional(),
        from: day('From').optional(),
        to: day('To').optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
});

export const idParamValidation = z.object({
    params: z.object({ id: objectId('Purchase') }),
});

export const paymentValidation = z.object({
    params: z.object({ id: objectId('Purchase') }),
    body: z.object({
        amount: z.number({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a number' })
            .finite()
            .positive('Amount must be more than 0')
            .max(10_000_000_000, 'Amount is too large'),
        date: day('Payment date').optional(),
        method: z.enum(PAYMENT_METHODS).optional(),
        reference: text('Reference', 80).optional(),
        note: text('Note', 300).optional(),
    }),
});

export const removePaymentValidation = z.object({
    params: z.object({ id: objectId('Purchase'), paymentId: objectId('Payment') }),
});

export const cancelValidation = z.object({
    params: z.object({ id: objectId('Purchase') }),
    body: z.object({ reason: text('Reason', 300).optional() }).optional(),
});

export const receiveValidation = z.object({
    params: z.object({ id: objectId('Purchase') }),
    body: z.object({
        warehouse: objectId('Warehouse'),
        date: day('Date received').optional(),
        addToStock: z.boolean().optional(),
        note: text('Note', 300).optional(),
        lines: z
            .array(z.object({
                itemId: objectId('Item'),
                qty: z.number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
                    .int('Quantity must be a whole number')
                    .min(1, 'Quantity must be at least 1')
                    .max(1_000_000, 'Quantity is too large'),
                variantId: objectId('Variant').nullable().optional(),
                skipStock: z.boolean().optional(),
            }))
            .min(1, 'Enter how many arrived for at least one item')
            .max(400),
    }),
});
