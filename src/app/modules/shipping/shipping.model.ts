import mongoose, { Schema, Document } from 'mongoose';

// ── Shipping Zone ──────────────────────────────────
export interface IShippingZone extends Document {
    name: string;
    regions: string[];
    isActive: boolean;
}

const shippingZoneSchema = new Schema<IShippingZone>({
    name: { type: String, required: true },
    regions: [{ type: String }],
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const ShippingZone = mongoose.model<IShippingZone>('ShippingZone', shippingZoneSchema);

// ── Shipping Rate ──────────────────────────────────
export interface IShippingRate extends Document {
    name: string;
    zone: mongoose.Types.ObjectId;
    minWeight: number;
    maxWeight: number;
    price: number;
    // Order subtotal at/above which this zone's shipping is free (0 = disabled).
    freeShippingMinimum: number;
    estimatedDays: string;
    isActive: boolean;
}

const shippingRateSchema = new Schema<IShippingRate>({
    name: { type: String, required: true },
    zone: { type: Schema.Types.ObjectId, ref: 'ShippingZone' },
    minWeight: { type: Number, default: 0 },
    maxWeight: { type: Number, default: 999 },
    price: { type: Number, required: true },
    freeShippingMinimum: { type: Number, default: 0 },
    estimatedDays: { type: String, default: '3-5 days' },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const ShippingRate = mongoose.model<IShippingRate>('ShippingRate', shippingRateSchema);

// ── Shipping Settings (singleton — admin-tunable global rules) ──────

/** Courier COD handling charge, in basis points (100 = 1%). Steadfast's standard rate. */
export const DEFAULT_COD_CHARGE_BPS = 100;
export const MAX_COD_CHARGE_BPS = 10000; // 100%

/** Flat delivery charges (BDT) until the admin changes them in Settings → Business. */
export const DEFAULT_INSIDE_DHAKA_RATE = 70;
export const DEFAULT_OUTSIDE_DHAKA_RATE = 130;

export interface IShippingSettings extends Document {
    _key: string;
    freeShippingThreshold: number;
    freeShippingByThresholdEnabled: boolean;
    defaultInsideDhakaRate: number;
    defaultOutsideDhakaRate: number;
    defaultEstimatedDays: string;
    quantityFreeShippingEnabled: boolean;
    minItemsForFreeShipping: number;
    // What the courier keeps for collecting cash on delivery, applied to a parcel's
    // collected amount minus its delivery charge. Integer basis points (100 = 1%).
    // Snapshotted onto order.packages[].codChargeBps at booking time, so changing
    // it only affects parcels booked afterwards.
    codChargeBps: number;
}

const shippingSettingsSchema = new Schema<IShippingSettings>({
    _key: { type: String, default: 'main', unique: true },
    freeShippingThreshold: { type: Number, default: 5000 },
    freeShippingByThresholdEnabled: { type: Boolean, default: true },
    defaultInsideDhakaRate: { type: Number, default: DEFAULT_INSIDE_DHAKA_RATE },
    defaultOutsideDhakaRate: { type: Number, default: DEFAULT_OUTSIDE_DHAKA_RATE },
    defaultEstimatedDays: { type: String, default: '3-5 days' },
    quantityFreeShippingEnabled: { type: Boolean, default: false },
    minItemsForFreeShipping: { type: Number, default: 0 },
    codChargeBps: {
        type: Number,
        default: DEFAULT_COD_CHARGE_BPS,
        min: 0,
        max: MAX_COD_CHARGE_BPS,
        validate: { validator: Number.isInteger, message: 'codChargeBps must be a whole number of basis points' },
    },
}, { timestamps: true });

export const ShippingSettings = mongoose.model<IShippingSettings>('ShippingSettings', shippingSettingsSchema);
