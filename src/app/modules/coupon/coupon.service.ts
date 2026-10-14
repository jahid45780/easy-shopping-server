import { Coupon } from './coupon.model';
import { Product } from '../product/product.model';
import AppError from '../../utils/AppError';

const CouponService = {
    async getAll() {
        return await Coupon.find().sort({ createdAt: -1 });
    },

    async validate(code: string, orderAmount: number, items?: { product: string; amount: number }[]) {
        const coupon: any = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
        if (!coupon) throw new AppError(404, 'Invalid coupon code');
        const now = new Date();
        if (coupon.startDate && new Date(coupon.startDate) > now) throw new AppError(400, 'This coupon is not active yet');
        if (coupon.expiresAt < now) throw new AppError(400, 'Coupon has expired');
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new AppError(400, 'Coupon usage limit reached');
        if (orderAmount < coupon.minOrderAmount) throw new AppError(400, `Minimum order amount is ৳${coupon.minOrderAmount}`);

        // Eligible base = the amount the discount is computed on. For product/category
        // coupons, only the matching cart items count (not the whole order).
        let eligibleBase = orderAmount;
        const applicableTo = coupon.applicableTo || 'all';
        if (applicableTo !== 'all' && coupon.discountType !== 'free_shipping') {
            const list = items || [];
            if (applicableTo === 'specific_products') {
                const set = new Set((coupon.specificProducts || []).map((x: any) => x.toString()));
                eligibleBase = list.reduce((s, it) => s + (set.has(String(it.product)) ? (it.amount || 0) : 0), 0);
            } else {
                const set = new Set((coupon.specificCategories || []).map((x: any) => x.toString()));
                const prods = await Product.find({ _id: { $in: list.map((it) => it.product) } }).select('category subCategory');
                const matchOf = new Map<string, boolean>();
                prods.forEach((p: any) => matchOf.set(p._id.toString(),
                    (p.category && set.has(p.category.toString())) || (p.subCategory && set.has(p.subCategory.toString()))));
                eligibleBase = list.reduce((s, it) => s + (matchOf.get(String(it.product)) ? (it.amount || 0) : 0), 0);
            }
            if (eligibleBase <= 0) throw new AppError(400, 'This coupon does not apply to any item in your cart');
        }

        let discount = 0;
        let freeShipping = false;
        if (coupon.discountType === 'free_shipping') {
            freeShipping = true; // waives shipping only; no product discount
        } else if (coupon.discountType === 'percentage') {
            discount = (eligibleBase * coupon.discountValue) / 100;
            if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
        } else {
            discount = coupon.discountValue;
        }

        // Never let a discount exceed the eligible base (guards against negative totals).
        discount = Math.min(discount, eligibleBase);

        return { coupon, discount, freeShipping };
    },

    async create(payload: any) {
        payload.code = payload.code.toUpperCase();
        const exists = await Coupon.findOne({ code: payload.code });
        if (exists) throw new AppError(400, 'Coupon code already exists');
        return await Coupon.create(payload);
    },

    async update(id: string, payload: any) {
        const coupon = await Coupon.findByIdAndUpdate(id, payload, { new: true });
        if (!coupon) throw new AppError(404, 'Coupon not found');
        return coupon;
    },

    async delete(id: string) {
        const coupon = await Coupon.findByIdAndDelete(id);
        if (!coupon) throw new AppError(404, 'Coupon not found');
        return coupon;
    },
};

export default CouponService;
