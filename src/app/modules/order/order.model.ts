import { Schema, model } from 'mongoose';

const orderItemSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    thumbnail: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    total: { type: Number, required: true },
    color: { type: String, default: '' },
    size: { type: String, default: '' },

}, { _id: true });

// `actor` is the staff member who made the change, or null when the customer,
// a courier webhook or an automatic sync did it. Entries written before this
// field existed have neither, so the staff report only covers changes from the
// day it was added onwards.
const timelineSchema = new Schema({
    status: { type: String },
    note: { type: String, default: '' },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

// ── Package = the order's fulfillment unit (one shipment) ──
const packageSchema = new Schema({
    itemIds: [{ type: Schema.Types.ObjectId }],                         // refs to order.items[]._id in this package
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt', 'delivered', 'cancelled', 'returned', 'refunded'],
        default: 'pending',
    },
    subtotal: { type: Number, default: 0 },          // gross items total for this shipment
    trackingNumber: { type: String, default: '' },
    carrier: { type: String, default: '' },
    // ── Steadfast courier (auto booking + status sync) ──
    consignmentId: { type: String, default: '' },   // Steadfast consignment id
    courierStatus: { type: String, default: '' },    // raw Steadfast delivery_status
    courierBookedAt: { type: Date },
    // Courier COD handling charge (basis points, 100 = 1%) copied from shipping
    // settings when the parcel is booked, so a later rate change in Settings never
    // alters an already-booked parcel. Unset = booked before this snapshot existed.
    codChargeBps: { type: Number },
    timeline: { type: [timelineSchema], default: [] },
}, { _id: true });

const shippingAddressSchema = new Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, required: true },
    area: { type: String, default: '' },
    city: { type: String, default: '' },
    postalCode: { type: String, default: '' },
}, { _id: false });

const orderSchema = new Schema(
    {
        orderId: { type: String, unique: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        items: { type: [orderItemSchema], required: true },
        packages: { type: [packageSchema], default: [] }, // fulfillment shipments
        shippingAddress: { type: shippingAddressSchema, required: true },

        // Pricing
        subtotal: { type: Number, required: true },
        shippingCost: { type: Number, default: 0 },
        shippingFreeReason: { type: String, default: '' }, // '' | product | coupon | threshold | quantity
        shippingZone: { type: String, default: '' }, // name of the delivery zone the rate came from (if any)
        discount: { type: Number, default: 0 },
        total: { type: Number, required: true },
        couponCode: { type: String, default: '' },

        // Status
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt', 'delivered', 'cancelled', 'returned', 'refunded'],
            default: 'pending',
        },
        cancelReason: { type: String, default: '' },
        paymentMethod: {
            type: String,
            enum: ['cod', 'bkash', 'rocket', 'nagad', 'sslcommerz'],
            default: 'bkash',
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        transactionId: { type: String, default: '' },
        paymentDetails: {
            senderNumber: { type: String, default: '' },
            transactionId: { type: String, default: '' },
            paymentTime: { type: String, default: '' },
        },
        trackingNumber: { type: String, default: '' },
        carrier: { type: String, default: '' },

        note: { type: String, default: '' },
        timeline: { type: [timelineSchema], default: [] },
    },
    { timestamps: true, toJSON: { virtuals: true } }
);

// Auto-generate order ID
orderSchema.pre('save', async function (next) {
    if (!this.orderId) {
        const count = await (this.constructor as any).countDocuments();
        this.orderId = `KM-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

orderSchema.index({ user: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const Order = model('Order', orderSchema);
