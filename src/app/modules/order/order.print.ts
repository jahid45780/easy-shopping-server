import { Request, Response } from 'express';
import { z } from 'zod';
import { Order } from './order.model';
import { Product } from '../product/product.model';
import AppError from '../../utils/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';

/**
 * Print data for shipping labels and order invoices (admin → Orders → Print).
 *
 * POST /api/orders/admin/print  { ids: string[] }  (1–100 order _ids)
 *
 * Returns, in the requested order, just what the printed documents need: the lines
 * with each product's SKU (the variant SKU when the line was bought as a variant),
 * the shipping address, money (paid / due), the customer note and the Steadfast
 * consignment id. The documents themselves are rendered in the browser as HTML,
 * because customer names and addresses are often in Bangla.
 *
 * Kept in its own file so the order controller / service stay untouched.
 */

const MAX_IDS = 100;

export const orderPrintValidation = z.object({
    body: z.object({
        ids: z
            .array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid order id'))
            .min(1, 'Select at least one order')
            .max(MAX_IDS, `You can print up to ${MAX_IDS} orders at a time`),
    }),
});

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const same = (a: unknown, b: unknown) => text(a).toLowerCase() === text(b).toLowerCase();

/** Placeholder emails created for guest / phone orders — never printed. */
const isPlaceholderEmail = (email: string) => /@guest\.shohozkitchen\.com$/i.test(email);

/**
 * What has been paid and what is still owed — the same rule the admin Orders page
 * uses (money() in dashboard/admin/orders/page.tsx), so the paper matches the screen.
 */
function money(o: any) {
    const total = num(o.total);
    if (o.paymentStatus === 'paid') return { paid: total, due: 0, refunded: false };
    if (o.paymentStatus === 'refunded') return { paid: 0, due: 0, refunded: true };
    // A cancelled order is owed nothing.
    if (o.status === 'cancelled') return { paid: 0, due: 0, refunded: false };
    return { paid: 0, due: total, refunded: false };
}

/** The variant a line was bought as — first variant whose colour and size agree (as checkout matches). */
function matchVariant(variants: any[] | undefined, color?: string, size?: string): any | null {
    if (!color && !size) return null;
    return (variants || []).find((v: any) => (!color || same(v.color, color)) && (!size || same(v.size, size))) || null;
}

async function getOrdersPrintData(rawIds: string[]) {
    // Keep the requested order; drop repeats.
    const ids = Array.from(new Set(rawIds.map((id) => id.toLowerCase())));

    const orders: any[] = await Order.find({ _id: { $in: ids } })
        .select('orderId user items packages shippingAddress subtotal shippingCost discount total status paymentMethod paymentStatus note createdAt')
        .populate('user', 'firstName lastName email phone')
        .lean();
    if (!orders.length) throw new AppError(404, 'No orders found to print');

    // Every product on these orders, in one query — only what the SKU needs.
    const productIds = Array.from(new Set(orders.flatMap((o) => (o.items || []).map((it: any) => String(it.product)))));
    const products: any[] = await Product.find({ _id: { $in: productIds } })
        .select('sku variants.color variants.size variants.sku')
        .lean();
    const productById = new Map(products.map((p) => [String(p._id), p]));

    const byId = new Map(orders.map((o) => [String(o._id).toLowerCase(), o]));

    return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((o: any) => {
            const addr = o.shippingAddress || {};
            const user = o.user && typeof o.user === 'object' ? o.user : null;
            const userName = user ? `${text(user.firstName)} ${text(user.lastName)}`.trim() : '';
            const email = [text(addr.email), text(user?.email)].find((e) => e && !isPlaceholderEmail(e)) || '';
            const m = money(o);
            const consignmentIds: string[] = (o.packages || []).map((p: any) => text(p.consignmentId)).filter(Boolean);

            return {
                _id: String(o._id),
                orderId: text(o.orderId) || String(o._id),
                createdAt: o.createdAt,
                status: o.status || 'pending',
                paymentMethod: o.paymentMethod || '',
                paymentStatus: o.paymentStatus || 'pending',
                customer: {
                    name: text(addr.fullName) || userName,
                    phone: text(addr.phone) || text(user?.phone),
                    email,
                },
                shippingAddress: {
                    fullName: text(addr.fullName) || userName,
                    phone: text(addr.phone) || text(user?.phone),
                    address: text(addr.address),
                    area: text(addr.area),
                    city: text(addr.city),
                    postalCode: text(addr.postalCode),
                },
                items: (o.items || []).map((it: any) => {
                    const product = productById.get(String(it.product));
                    const variant = matchVariant(product?.variants, it.color, it.size);
                    const quantity = num(it.quantity);
                    const price = num(it.price);
                    const total = num(it.total);
                    return {
                        name: text(it.name),
                        sku: text(variant?.sku) || text(product?.sku),
                        color: text(it.color),
                        size: text(it.size),
                        quantity,
                        price,
                        // Lines carry no discount of their own today; any gap between
                        // price × qty and the line total is shown as the line discount.
                        discount: Math.max(0, Math.round((price * quantity - total) * 100) / 100),
                        total,
                    };
                }),
                subtotal: num(o.subtotal),
                discount: num(o.discount),
                shippingCost: num(o.shippingCost),
                total: num(o.total),
                paid: m.paid,
                due: m.due,
                refunded: m.refunded,
                note: text(o.note),
                consignmentId: consignmentIds[0] || '',
                consignmentIds,
            };
        });
}

export const OrderPrintController = {
    getPrintData: catchAsync(async (req: Request, res: Response) => {
        const data = await getOrdersPrintData(req.body.ids);
        sendResponse(res, { statusCode: 200, success: true, message: 'Print data fetched', data });
    }),
};
