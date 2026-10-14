import { z } from 'zod';

const orderItemValidation = z.object({
    product: z.string().min(1, 'Product ID required'),
    quantity: z.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1').max(10000, 'Quantity is too large'),
});

// Upper limits keep customer-typed text to a sane size (it is stored and pattern-matched later).
const shippingAddressValidation = z.object({
    fullName: z.string().min(1, 'Full name required').max(120, 'Full name is too long'),
    phone: z.string().min(1, 'Phone required').max(30, 'Phone number is too long'),
    email: z.string().max(254, 'Email is too long').optional(),
    address: z.string().min(1, 'Address required').max(500, 'Address is too long'),
    area: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
});

const paymentDetailsValidation = z.object({
    senderNumber: z.string().optional(),
    transactionId: z.string().optional(),
    paymentTime: z.string().optional(),
}).optional();

export const createOrderValidation = z.object({
    body: z.object({
        items: z.array(orderItemValidation).min(1, 'At least one item required'),
        shippingAddress: shippingAddressValidation,
        paymentMethod: z.enum(['cod', 'bkash', 'rocket', 'nagad', 'sslcommerz']).default('bkash'),
        paymentDetails: paymentDetailsValidation,
        couponCode: z.string().optional(),
        note: z.string().optional(),
        // Delivery zone chosen from the checkout dropdown (deterministic rate).
        zoneId: z.string().optional(),
        // Inside / Outside Dhaka picked at checkout → the flat charge from Settings.
        deliveryArea: z.enum(['inside_dhaka', 'outside_dhaka']).optional(),
    }),
});

export const updateOrderStatusValidation = z.object({
    body: z.object({
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt', 'delivered', 'cancelled', 'returned', 'refunded']),
        note: z.string().optional(),
    }),
});
