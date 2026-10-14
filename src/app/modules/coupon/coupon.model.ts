import { Schema, model } from 'mongoose';

const couponSchema = new Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        description: { type: String, default: '' },
        discountType: { type: String, enum: ['percentage', 'fixed', 'free_shipping'], default: 'percentage' },
        discountValue: { type: Number, required: true, min: 0, default: 0 },
        maxDiscount: { type: Number, default: null }, // max taka for percentage
        minOrderAmount: { type: Number, default: 0 },
        usageLimit: { type: Number, default: null }, // null = unlimited (global)
        usagePerUser: { type: Number, default: 1, min: 1 }, // how many times ONE customer may redeem
        usedCount: { type: Number, default: 0 },
        usedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // one entry per redemption (may repeat when usagePerUser > 1)

        // ── Applicability ──────────────────────────────────────────
        // 'all' → whole order; otherwise the discount applies only to matching items.
        applicableTo: { type: String, enum: ['all', 'specific_products', 'specific_categories'], default: 'all' },
        specificProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
        specificCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],

        startDate: { type: Date, default: null }, // coupon inactive before this (null = active immediately)
        expiresAt: { type: Date, required: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

couponSchema.index({ isActive: 1, expiresAt: 1 });

export const Coupon = model('Coupon', couponSchema);
