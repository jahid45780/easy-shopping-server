import crypto from 'crypto';
import { Types } from 'mongoose';
import { Order } from './order.model';
import { Product } from '../product/product.model';
import { User } from '../user/user.model';
import { Coupon } from '../coupon/coupon.model';
import AppError from '../../utils/AppError';
import QueryBuilder from '../../utils/QueryBuilder';
import { notifyOrderToWhatsApp } from '../../utils/whatsappNotify';
import { computeShippingCost, isDeliveryArea } from '../shipping/shipping.service';
import { logStockMovements, variantOf, StockMovementInput } from '../inventory/inventory.ledger';

// ── Stock ledger (Inventory → Movements) ────────────────────────
// Every place below that changes product.stock also logs a ledger row, AFTER the stock
// change succeeded, fire-and-forget: bookkeeping can never break an order flow.

/**
 * The variant an order line was bought as: the first variant whose colour and size agree
 * (case-insensitive) — the same match checkout uses for the price.
 */
function matchVariant(variants: any[] | undefined, color?: string, size?: string): any | null {
    if (!color && !size) return null;
    const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    return (variants || []).find((v: any) => (!color || same(v.color, color)) && (!size || same(v.size, size))) || null;
}

/**
 * A stock $inc for a product and, when the line was a variant, that variant too — so the
 * variant counts (shown on the storefront and in Inventory) move with the sellable total.
 */
function stockInc(delta: number, variantId: unknown, extra: Record<string, number> = {}) {
    const inc: Record<string, number> = { stock: delta, ...extra };
    if (!variantId) return { update: { $inc: inc }, options: {} as Record<string, unknown> };
    inc['variants.$[line].stock'] = delta;
    return { update: { $inc: inc }, options: { arrayFilters: [{ 'line._id': variantId }] } as Record<string, unknown> };
}

/** Put an order line's quantity back into stock; returns the product's stock + cost after. */
async function restockLine(item: any) {
    let variantId: unknown = null;
    if (item.color || item.size) {
        const p: any = await Product.findById(item.product).select('variants._id variants.color variants.size').lean();
        variantId = matchVariant(p?.variants, item.color, item.size)?._id || null;
    }
    const { update, options } = stockInc(item.quantity, variantId);
    return Product.findByIdAndUpdate(item.product, update, { ...options, new: true })
        .select('stock costPrice')
        .lean();
}

/** Ledger row for stock that came back from an order line (cancel / return). */
function restockEntry(order: any, item: any, after: any, type: 'cancel' | 'return', note: string, createdBy?: string): StockMovementInput | null {
    if (!after) return null;
    return {
        product: item.product,
        type,
        quantity: Number(item.quantity) || 0,
        balanceAfter: Number(after.stock) || 0,
        variant: variantOf(item),
        unitCost: Number(after.costPrice) > 0 ? Number(after.costPrice) : null,
        note,
        order: order?._id,
        createdBy: createdBy || null,
    };
}

function logRestock(entries: (StockMovementInput | null)[]) {
    try {
        logStockMovements(entries.filter(Boolean) as StockMovementInput[]);
    } catch {
        // never block the order flow
    }
}

/**
 * Fraud check: once an order closes (cancelled, delivered, returned…) its flag, if it is
 * still waiting for review, is closed too. Awaited, so the admin's refetch right after
 * sees it, but it never throws and does nothing for open statuses. Lazy require avoids
 * a circular import (fraud.service uses OrderService to cancel).
 */
async function closeFraudFlag(orderId: unknown, status: string, actorId?: string) {
    try {
        const { default: FraudService } = require('../fraud/fraud.service');
        await FraudService.closeForOrder(orderId, status, actorId);
    } catch {
        // never block the order flow
    }
}

// ── Status helpers ──────────────────────────────────────────────
const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt', 'delivered'];

// Add `n` business days to a date, skipping Bangladesh weekend (Fri=5, Sat=6).
function addBusinessDays(date: Date, n: number): Date {
    const result = new Date(date.getTime());
    let added = 0;
    while (added < n) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay(); // 0=Sun … 5=Fri, 6=Sat
        if (day !== 5 && day !== 6) added++;
    }
    return result;
}

// Compute the overall order status from its packages (least-advanced active package wins)
function computeOrderStatus(packages: any[]): string {
    if (!packages || packages.length === 0) return 'pending';
    const inactive = (s: string) => s === 'cancelled' || s === 'returned' || s === 'refunded';
    const active = packages.filter(p => !inactive(p.status));
    if (active.length === 0) {
        // everything cancelled/returned/refunded → reflect that
        if (packages.every(p => p.status === 'refunded')) return 'refunded';
        if (packages.every(p => p.status === 'returned')) return 'returned';
        return 'cancelled';
    }
    if (active.every(p => p.status === 'delivered')) return 'delivered';
    // otherwise the least-advanced active package determines progress
    let minIdx = STATUS_ORDER.length - 1;
    for (const p of active) {
        const idx = STATUS_ORDER.indexOf(p.status);
        if (idx >= 0 && idx < minIdx) minIdx = idx;
    }
    return STATUS_ORDER[minIdx] || 'pending';
}

// Staff notes live in the order timeline as `admin_note`; customers must never see them.
function withoutStaffNotes(order: any) {
    // toJSON (not toObject) — the schema adds its virtuals only on toJSON.
    const o = typeof order?.toJSON === 'function' ? order.toJSON() : order;
    return { ...o, timeline: (o.timeline || []).filter((t: any) => t.status !== 'admin_note') };
}

const OrderService = {
    async getAllOrders(query: Record<string, unknown>) {
        const orderQuery = new QueryBuilder(
            Order.find().populate('user', 'firstName lastName email phone').populate('items.product', 'name thumbnail'),
            query
        )
            // Admin search box: match by order number, customer name or phone.
            .search(['orderId', 'shippingAddress.fullName', 'shippingAddress.phone'])
            .filter()
            .sort()
            .paginate();

        const orders = await orderQuery.modelQuery;
        const meta = await orderQuery.countTotal();
        return { orders, meta };
    },

    async getMyOrders(userId: string, query: Record<string, unknown>) {
        const orderQuery = new QueryBuilder(
            Order.find({ user: userId }).populate('items.product', 'name thumbnail slug'),
            query
        )
            .search(['orderId'])   // search box → order number
            .filter()              // status tab → order status
            .sort()
            .paginate();

        const orders = await orderQuery.modelQuery;
        const meta = await orderQuery.countTotal();
        return { orders: orders.map(withoutStaffNotes), meta };
    },

    async getOrderById(id: string, userId?: string) {
        const filter: any = { _id: id };
        if (userId) filter.user = userId; // non-admin can only see their own

        const order = await Order.findOne(filter)
            .populate('user', 'firstName lastName email phone')
            .populate('items.product', 'name thumbnail slug price');
        if (!order) throw new AppError(404, 'Order not found');
        // A customer reading their own order gets no staff notes.
        return userId ? withoutStaffNotes(order) : order;
    },

    async createOrder(userId: string, payload: any) {
        const { items, shippingAddress, paymentMethod, paymentDetails, couponCode, note, zoneId, deliveryArea } = payload;

        // Get product details and calculate totals
        let subtotal = 0;
        const orderItems: any[] = [];

        // Resolve the price a customer actually pays RIGHT NOW:
        // If a variant (color / size) was chosen, use the variant's price.
        // Otherwise (or when deselected), fall back to the base product price.
        const resolveEffectivePrice = (product: any, item?: any): number => {
            if (item && (item.color || item.size)) {
                const variants = product.variants || [];
                const v = variants.find(
                    (vv: any) =>
                        (!item.color || String(vv.color).trim().toLowerCase() === String(item.color).trim().toLowerCase()) &&
                        (!item.size || String(vv.size).trim().toLowerCase() === String(item.size).trim().toLowerCase())
                );
                if (v) {
                    const vd = v.discount || 0;
                    return vd > 0 ? v.price - (v.price * vd) / 100 : v.price;
                }
            }
            const now = new Date();
            const start = product.offerStartDate ? new Date(product.offerStartDate) : null;
            const end = product.offerEndDate ? new Date(product.offerEndDate) : null;
            const afterStart = !start || isNaN(start.getTime()) || now.getTime() >= start.getTime();
            const beforeEnd = !end || isNaN(end.getTime()) || now.getTime() <= end.getTime();
            const offerActive = afterStart && beforeEnd;
            if (offerActive) return product.price;
            return product.originalPrice && product.originalPrice > 0 ? product.originalPrice : product.price;
        };

        const stagedItems: any[] = [];
        for (const item of items) {
            const product = await Product.findOne({ _id: item.product, isDeleted: false, status: 'active' });
            if (!product) throw new AppError(404, `Product not found: ${item.product}`);
            if (product.stock < item.quantity) throw new AppError(400, `Insufficient stock for: ${product.name}`);

            const unitPrice = resolveEffectivePrice(product, item);
            const itemTotal = unitPrice * item.quantity;
            subtotal += itemTotal;

            stagedItems.push({ product, item, itemTotal, unitPrice });
        }

        // Build order items with pre-generated _ids (so the package can reference them)
        for (const staged of stagedItems) {
            const { product, item, itemTotal, unitPrice } = staged;
            const _id = new Types.ObjectId();

            let itemThumbnail = product.thumbnail;
            if (item && (item.color || item.size)) {
                const variants = product.variants || [];
                const v = variants.find(
                    (vv: any) =>
                        (!item.color || String(vv.color).trim().toLowerCase() === String(item.color).trim().toLowerCase()) &&
                        (!item.size || String(vv.size).trim().toLowerCase() === String(item.size).trim().toLowerCase())
                );
                if (v && v.images && v.images.length > 0) {
                    itemThumbnail = v.images[0];
                }
            }

            orderItems.push({
                _id,
                product: product._id,
                name: product.name,
                thumbnail: itemThumbnail,
                price: unitPrice,
                quantity: item.quantity,
                total: itemTotal,
                color: item.color || '',
                size: item.size || '',
            });
        }

        // One fulfillment package per order (single-store: every item ships together).
        const packages = [{
            itemIds: orderItems.map((oi) => oi._id),
            status: 'pending',
            subtotal: orderItems.reduce((sum, oi) => sum + oi.total, 0),
            timeline: [{ status: 'pending', note: 'Order placed' }],
        }];

        // Apply coupon (percentage / fixed / free_shipping)
        let discount = 0;
        let couponFreeShipping = false;
        let appliedCoupon: any = null;
        if (couponCode) {
            const coupon: any = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
            const now = new Date();

            // Eligible base = the amount the discount is computed on. For product/category
            // coupons only the matching cart items count (not the whole subtotal).
            let eligibleBase = subtotal;
            const applicableTo = coupon?.applicableTo || 'all';
            if (coupon && applicableTo === 'specific_products') {
                const set = new Set((coupon.specificProducts || []).map((x: any) => x.toString()));
                eligibleBase = stagedItems.reduce((s: number, st: any) => s + (set.has(st.product._id.toString()) ? st.itemTotal : 0), 0);
            } else if (coupon && applicableTo === 'specific_categories') {
                const set = new Set((coupon.specificCategories || []).map((x: any) => x.toString()));
                eligibleBase = stagedItems.reduce((s: number, st: any) => {
                    const cat = st.product.category ? st.product.category.toString() : null;
                    const sub = st.product.subCategory ? st.product.subCategory.toString() : null;
                    const child = st.product.childCategory ? st.product.childCategory.toString() : null;
                    const match = (cat && set.has(cat)) || (sub && set.has(sub)) || (child && set.has(child));
                    return s + (match ? st.itemTotal : 0);
                }, 0);
            }

            // How many times THIS customer has already redeemed (supports usagePerUser > 1).
            const userUses = (coupon?.usedBy || []).filter((id: any) => id.toString() === userId.toString()).length;
            const perUserLimit = coupon?.usagePerUser || 1;

            const usable = coupon && coupon.expiresAt > now
                && (!coupon.startDate || new Date(coupon.startDate) <= now)
                && (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit)
                && subtotal >= (coupon.minOrderAmount || 0)
                && userUses < perUserLimit
                // Product/category coupons need at least one eligible item in the cart.
                && (coupon.discountType === 'free_shipping' || applicableTo === 'all' || eligibleBase > 0);

            if (usable) {
                appliedCoupon = coupon;
                if (coupon.discountType === 'free_shipping') {
                    couponFreeShipping = true;
                } else if (coupon.discountType === 'percentage') {
                    discount = (eligibleBase * coupon.discountValue) / 100;
                    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
                } else {
                    discount = coupon.discountValue;
                }
                // Never let the discount exceed the eligible base (guards against negative totals).
                discount = Math.min(discount, eligibleBase);
            }
        }

        // Authoritative server-side shipping charge (never trust a client-sent value).
        // Free shipping resolves via: all-items-free-delivery → coupon → subtotal
        // threshold → quantity → zone rate. Platform delivery fee is added to the
        // master order total only.
        const { shippingCost, freeReason, zoneName } = await computeShippingCost({
            city: shippingAddress?.city || '',
            subtotal,
            items: stagedItems.map((s: any) => ({ freeShipping: Boolean(s.product?.shippingConfig?.freeShipping) })),
            totalQuantity: orderItems.reduce((n: number, oi: any) => n + (oi.quantity || 0), 0),
            couponFreeShipping,
            zoneId,
            area: isDeliveryArea(deliveryArea) ? deliveryArea : undefined,
        });
        const total = Math.max(0, subtotal - discount) + shippingCost;

        // ── Reserve stock ATOMICALLY before creating the order. The earlier per-item
        //    stock check is not race-safe: two concurrent checkouts for the last unit
        //    would both pass it and both decrement, overselling into negative stock.
        //    A conditional decrement ({ stock: $gte qty }) is serialized by MongoDB, so
        //    each unit is sold at most once. On any shortfall we roll back what we already
        //    reserved and fail the whole order. ──
        const reserved: { product: any; variantId: unknown; quantity: number; balanceAfter: number; unitCost: number; color: string; size: string }[] = [];
        const rollbackReserved = async () => {
            for (const r of reserved) {
                const { update, options } = stockInc(r.quantity, r.variantId, { totalSold: -r.quantity });
                await Product.findByIdAndUpdate(r.product, update, options);
            }
        };
        for (const [idx, oi] of orderItems.entries()) {
            // orderItems were built from stagedItems in the same order.
            const variantId = matchVariant(stagedItems[idx]?.product?.variants, oi.color, oi.size)?._id || null;
            const { update, options } = stockInc(-oi.quantity, variantId, { totalSold: oi.quantity });
            const claimed = await Product.findOneAndUpdate(
                { _id: oi.product, isDeleted: false, status: 'active', stock: { $gte: oi.quantity } },
                update,
                options,
            );
            if (!claimed) {
                await rollbackReserved();
                throw new AppError(400, `Insufficient stock for "${oi.name}". Please review your cart and try again.`);
            }
            reserved.push({
                product: oi.product,
                variantId,
                quantity: oi.quantity,
                // For the stock ledger: `claimed` is the document from just before this atomic
                // decrement, so the balance after is exactly its stock minus the quantity.
                balanceAfter: Number((claimed as any).stock || 0) - oi.quantity,
                unitCost: Number((claimed as any).costPrice) || 0,
                color: oi.color,
                size: oi.size,
            });
        }

        // Create order (roll the reserved stock back if the order itself fails to persist).
        let order;
        try {
            order = await Order.create({
                user: userId,
                items: orderItems,
                packages,
                shippingAddress,
                subtotal,
                shippingCost,
                shippingFreeReason: freeReason || '',
                shippingZone: zoneName || '',
                discount,
                total,
                couponCode: appliedCoupon ? appliedCoupon.code : '',
                paymentMethod,
                paymentDetails: paymentDetails || {},
                transactionId: paymentDetails?.transactionId || '',
                note: note || '',
                timeline: [{ status: 'pending', note: 'Order placed successfully' }],
            });
        } catch (err) {
            await rollbackReserved();
            throw err;
        }

        // ── Stock ledger: one 'sale' row per reserved line. Logged only now that the order
        //    exists (a rolled-back reservation never appears); fire-and-forget. ──
        try {
            logStockMovements(reserved.map((r) => ({
                product: r.product,
                type: 'sale' as const,
                quantity: -r.quantity,
                balanceAfter: r.balanceAfter,
                variant: variantOf({ color: r.color, size: r.size }),
                unitCost: r.unitCost > 0 ? r.unitCost : null, // cost of goods at the time of sale
                note: `Order ${order.orderId || order._id}`,
                order: order._id,
                createdBy: userId,
            })));
        } catch {
            // never block order flow
        }

        // Record coupon usage ATOMICALLY: enforce the global usage limit AND
        // one-use-per-customer in a single conditional update (no TOCTOU race).
        if (appliedCoupon) {
            const userObjId = new Types.ObjectId(userId);
            await Coupon.updateOne(
                {
                    _id: appliedCoupon._id,
                    $expr: {
                        $and: [
                            // Global usage limit (null = unlimited).
                            { $or: [{ $eq: ['$usageLimit', null] }, { $lt: ['$usedCount', '$usageLimit'] }] },
                            // Per-user limit: count this customer's existing redemptions in usedBy.
                            {
                                $lt: [
                                    { $size: { $filter: { input: { $ifNull: ['$usedBy', []] }, as: 'u', cond: { $eq: ['$$u', userObjId] } } } },
                                    { $ifNull: ['$usagePerUser', 1] },
                                ],
                            },
                        ],
                    },
                },
                // Pipeline update → append the redemption (usedBy may repeat when usagePerUser > 1).
                [{
                    $set: {
                        usedCount: { $add: ['$usedCount', 1] },
                        usedBy: { $concatArrays: [{ $ifNull: ['$usedBy', []] }, [userObjId]] },
                    },
                }],
            );
        }

        // (Stock + totalSold were already decremented atomically during reservation above.)

        // Update user stats
        await User.findByIdAndUpdate(userId, { $inc: { totalOrders: 1, totalSpent: total } });

        // Send WhatsApp notification to admin (fire & forget)
        const user = await User.findById(userId);
        notifyOrderToWhatsApp({
            orderNumber: order.orderId || order._id.toString(),
            customerName: shippingAddress.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
            customerPhone: shippingAddress.phone || user?.phone || '',
            address: shippingAddress.address || '',
            items: orderItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, color: i.color, size: i.size })),
            total,
            note: note || '',
        }).catch(() => {}); // never block order flow

        // Auto-send invoice email (fire & forget; lazy require avoids circular import)
        try {
            const { default: InvoiceService } = require('../invoice/invoice.service');
            InvoiceService.emailInvoiceToCustomer(order._id.toString()).catch(() => {});
        } catch {
            // never block order flow
        }

        // ── In-app notifications: fan-out (customer + all admins) ──
        // Fire-and-forget: any failure here must NEVER break order placement.
        try {
            const { NotificationService } = require('../notification/notification.service');
            const orderIdStr = order._id.toString();

            const fanOut = async () => {
                // 1) Customer — order placed confirmation
                await NotificationService.notify({
                    user: userId,
                    type: 'order_placed',
                    title: 'Order placed',
                    message: `Your order ${order.orderId || orderIdStr} has been placed successfully.`,
                    link: '/dashboard/user/orders/' + orderIdStr,
                    meta: { orderId: orderIdStr, total },
                });


                // 2) Every admin / superadmin
                const admins = await User.find({ role: { $in: ['admin', 'superadmin', 'editor'] } }).select('_id'); // editors confirm orders
                for (const admin of admins) {
                    await NotificationService.notify({
                        user: admin._id,
                        type: 'new_order',
                        title: 'New order placed',
                        message: `A new order ${order.orderId || orderIdStr} was placed (৳${total}).`,
                        link: '/dashboard/admin/orders/' + orderIdStr,
                        meta: { orderId: orderIdStr, total },
                    });
                }
            };

            fanOut().catch(() => {});
        } catch {
            // never block order flow
        }

        // ── Fraud check: flag the order when this customer returned an order before.
        //    Runs on the next tick, un-awaited, and never throws, so it can't block or slow
        //    checkout. Guest and admin-created orders come through here too. Lazy require
        //    avoids a circular import (fraud.service uses OrderService to cancel). ──
        setImmediate(() => {
            try {
                const { default: FraudService } = require('../fraud/fraud.service');
                FraudService.checkOrder(order, { notify: true }).catch(() => {});
            } catch {
                // never block order flow
            }
        });

        return order;
    },

    // ── Guest checkout: auto-create user + place order ────────────────
    async createGuestOrder(payload: any) {
        const { shippingAddress, paymentMethod, items, couponCode, note, password } = payload;
        const { fullName, email, phone } = shippingAddress;

        if (!phone || !fullName) {
            throw new AppError(400, 'Full name and phone number are required for checkout');
        }

        // Auto-generate guest email from phone if not provided
        const guestEmail = email || `${phone.replace(/\s+/g, '')}@guest.shohozkitchen.com`;

        // Check if user already exists
        let user = await User.findOne({ $or: [{ email: guestEmail.toLowerCase() }, { phone }] });
        let isNewUser = false;

        if (!user) {
            // Auto-create a guest account.
            const nameParts = fullName.trim().split(' ');
            const firstName = nameParts[0] || 'Customer';
            const lastName = nameParts.slice(1).join(' ') || '.';

            // Never use the email/phone as the password (guessable → account takeover).
            // Generate a strong random one. The guest is auto-logged-in via the token
            // returned below, and can recover later via "forgot password" or just track
            // their order (no login needed) at /track.
            const guestPassword = password || crypto.randomBytes(24).toString('hex');

            user = await User.create({
                email: guestEmail.toLowerCase(),
                password: guestPassword,
                firstName,
                lastName,
                phone,
                role: 'user',
                status: 'active',
                isEmailVerified: false,
            });
            isNewUser = true;
        }

        // Now create order using the existing createOrder method
        const order = await this.createOrder(user._id!.toString(), payload);

        // Generate token for auto-login
        const jwt = require('jsonwebtoken');
        const appConfig = require('../../config').default;
        const accessToken = jwt.sign(
            { userId: user._id!.toString(), email: user.email, role: user.role },
            appConfig.jwt.access_secret,
            { expiresIn: appConfig.jwt.access_expires_in }
        );

        return {
            order,
            user: {
                _id: user._id!.toString(),
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                phone: user.phone,
            },
            accessToken,
            isNewUser,
        };
    },

    // ── Admin "New order": a phone / walk-in order keyed by the customer's phone ──
    // Reuses the buyer if that phone is already on file, otherwise creates one with a
    // placeholder email and a random password (no token is issued — the admin is the
    // one placing it). Pricing, shipping, stock and coupons then run through the exact
    // same createOrder path as the storefront.
    async createAdminOrder(payload: any) {
        const { fullName, phone, email } = payload.shippingAddress || {};
        if (!phone || !fullName) throw new AppError(400, 'Customer name and phone number are required');

        const cleanPhone = String(phone).replace(/\s+/g, '');
        let user = await User.findOne({ phone: cleanPhone, isDeleted: { $ne: true } });

        if (user && user.role !== 'user') {
            throw new AppError(400, 'This phone number belongs to a staff account, not a customer');
        }

        if (!user) {
            const placeholder = (email || `${cleanPhone}@guest.shohozkitchen.com`).toLowerCase().trim();
            if (await User.exists({ email: placeholder })) {
                throw new AppError(409, 'A customer already uses this email — search for them by that email instead');
            }
            const nameParts = String(fullName).trim().split(/\s+/);
            user = await User.create({
                email: placeholder,
                password: crypto.randomBytes(24).toString('hex'),
                firstName: nameParts[0] || 'Customer',
                lastName: nameParts.slice(1).join(' '),
                phone: cleanPhone,
                role: 'user',
                status: 'active',
                isEmailVerified: false,
            });
        } else if (user.status === 'blocked') {
            throw new AppError(400, 'This customer is blocked — unblock them before taking an order');
        }

        return this.createOrder(user._id!.toString(), {
            ...payload,
            shippingAddress: { ...payload.shippingAddress, phone: cleanPhone },
            paymentMethod: payload.paymentMethod || 'cod',
        });
    },

    // actorId (optional) → the admin shown as "by" on the stock ledger when a cancel restocks.
    // guard (optional) → extra conditions the order must still meet when the change is
    // claimed (Fraud check passes "still cancellable and not booked with the courier").
    async updateOrderStatus(id: string, status: string, note?: string, actorId?: string, guard?: Record<string, unknown>) {
        const order = await Order.findById(id);
        if (!order) throw new AppError(404, 'Order not found');

        const prevOrderStatus = order.status;
        // Cancelling a still-active order puts its stock back, which must happen once only.
        const restock = status === 'cancelled' && !['cancelled', 'returned', 'refunded'].includes(prevOrderStatus);

        // Claim the change atomically first: it only goes through while the order still has
        // the status read above (and meets the guard). If another admin, the customer or a
        // courier booking changed it in the meantime, nothing happens and nothing is restocked twice.
        if (restock || guard) {
            const claimed = await Order.updateOne(
                { _id: order._id, status: prevOrderStatus, ...(guard ? { $and: [guard] } : {}) },
                { $set: { status } },
            );
            if (!claimed.matchedCount) {
                throw new AppError(409, 'This order was changed by someone else just now. Reload it and try again');
            }
        }

        // Who is making this change, for the staff activity report. Stays empty for
        // customer-driven and courier-driven updates, which pass no actorId.
        const actor = actorId
            ? await User.findById(actorId).select('firstName lastName email role').lean()
            : null;
        const actorName = actor
            ? [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email || ''
            : '';

        order.status = status as any;
        order.timeline.push({ status, note: note || '', actor: actorId || null, actorName, createdAt: new Date() } as any);

        // Admin status drives all packages too (keeps the two views consistent)
        for (const pkg of (order as any).packages || []) {
            if (pkg.status === 'cancelled' || pkg.status === 'returned' || pkg.status === 'refunded') continue;
            pkg.status = status;
            pkg.timeline.push({ status, note: note || 'Updated by admin', actor: actorId || null, actorName, createdAt: new Date() });
        }

        // Update payment status when delivered
        if (status === 'delivered' && order.paymentMethod === 'cod') {
            order.paymentStatus = 'paid';
        }
        // Refund flips the payment status to refunded
        if (status === 'refunded') {
            order.paymentStatus = 'refunded';
        }

        try {
            await order.save();
        } catch (err) {
            // Undo the claim so the order is exactly as it was (nothing was restocked yet).
            if (restock || guard) {
                await Order.updateOne({ _id: order._id, status }, { $set: { status: prevOrderStatus } }).catch(() => {});
            }
            throw err;
        }

        // Restore product stock when an admin cancels a still-active order
        // (mirrors the user-cancel path so inventory is not silently lost). After the save,
        // like the user-cancel path, so a failed save can never leave stock restored twice.
        if (restock) {
            const ledger: (StockMovementInput | null)[] = [];
            for (const item of order.items) {
                const after = await restockLine(item);
                ledger.push(restockEntry(order, item, after, 'cancel', `Order ${order.orderId || order._id} cancelled`, actorId));
            }
            logRestock(ledger);
        }

        await closeFraudFlag(order._id, status, actorId);

        // ── Staff activity (fire-and-forget) — this is what the editor report counts ──
        if (actorId) {
            try {
                const { ActivityLogService } = require('../activityLog/activityLog.service');
                ActivityLogService.logActivity({
                    actor: actorId,
                    actorName,
                    action: `order_status_${status}`,
                    target: `Order:${order.orderId || order._id}`,
                    meta: {
                        orderId: order._id.toString(),
                        orderNo: order.orderId || '',
                        from: prevOrderStatus,
                        to: status,
                        role: actor?.role || '',
                        total: order.total ?? 0,
                    },
                }).catch(() => {});
            } catch {
                // never block a status update
            }
        }

        // ── Notify the customer of the status change (fire-and-forget) ──
        try {
            const { NotificationService } = require('../notification/notification.service');
            const orderIdStr = order._id.toString();
            NotificationService.notify({
                user: order.user.toString(),
                type: 'order_status',
                title: 'Order status updated',
                message: `Your order ${order.orderId || orderIdStr} is now "${status}".`,
                link: '/dashboard/user/orders/' + orderIdStr,
                meta: { orderId: orderIdStr, status },
            }).catch(() => {});
        } catch {
            // never block status update
        }

        return order;
    },

    // ── Courier-driven delivery (fully-automated status sync) ─────
    // Called by the Steadfast webhook / auto-sync when a package is reported
    // delivered. Runs the SAME money side-effects as an admin confirmation
    // (COD → paid + order-status recompute + customer
    // notify) so an automatic sync stays consistent with the manual path.
    // Idempotent and per-package; the CALLER saves the order.
    async applyCourierDelivered(order: any, pkg: any): Promise<boolean> {
        if (!pkg) return false;
        if (pkg.status === 'delivered') return false;                                  // already delivered
        if (['cancelled', 'returned', 'refunded'].includes(pkg.status)) return false;  // don't resurrect a closed package

        pkg.status = 'delivered';
        pkg.timeline.push({ status: 'delivered', note: 'Delivered — Steadfast auto-sync', createdAt: new Date() });
        // Recompute the order-level status from all its packages (multi-package safe).
        const newOrderStatus = computeOrderStatus((order as any).packages);
        if (order.status !== newOrderStatus) {
            order.status = newOrderStatus as any;
            order.timeline.push({ status: newOrderStatus, note: 'Auto-updated from courier', createdAt: new Date() });
        }
        // COD is collected on delivery → mark the order paid once fully delivered.
        if (order.status === 'delivered' && order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
            order.paymentStatus = 'paid';
        }
        if (order.status === 'delivered') await closeFraudFlag(order._id, 'delivered');

        // Notify the customer (fire-and-forget — never block the sync).
        try {
            const { NotificationService } = require('../notification/notification.service');
            const orderIdStr = order._id.toString();
            NotificationService.notify({
                user: order.user.toString(),
                type: 'order_status',
                title: 'Order delivered',
                message: `Your order ${order.orderId || orderIdStr} has been delivered.`,
                link: '/dashboard/user/orders/' + orderIdStr,
                meta: { orderId: orderIdStr, status: 'delivered' },
            }).catch(() => {});
        } catch {
            // never block a status sync on notification failure
        }
        return true;
    },

    // ── Earnings helpers (idempotent via flags) ───────────────────
    // On delivered: move pending → HELD (10 working-day hold) + total, log ledger 'earning'.
    // Held earnings become available via releaseDueEarnings once the hold elapses.
    // Release earnings whose hold has elapsed: held → available, set pkg.earningsReleased.
    // Idempotent.
    // On reverse: if it was settled, pull back from (available if released, else held) + total,
    // log a 'reversal'; if still pending, just remove from pending.
    async cancelOrder(id: string, userId: string) {
        const order = await Order.findOne({ _id: id, user: userId });
        if (!order) throw new AppError(404, 'Order not found');
        if (!['pending', 'confirmed'].includes(order.status)) {
            throw new AppError(400, 'Order cannot be cancelled at this stage');
        }

        // Claim the cancel atomically, so a cancel by an admin at the same moment can't
        // restock the same items a second time.
        const prevStatus = order.status;
        const claimed = await Order.updateOne({ _id: order._id, status: prevStatus }, { $set: { status: 'cancelled' } });
        if (!claimed.matchedCount) throw new AppError(400, 'Order cannot be cancelled at this stage');

        order.status = 'cancelled';
        order.timeline.push({ status: 'cancelled', note: 'Cancelled by user', createdAt: new Date() } as any);

        // Cancel all packages
        for (const pkg of (order as any).packages || []) {
            if (pkg.status === 'cancelled' || pkg.status === 'returned') continue;
            pkg.status = 'cancelled';
            pkg.timeline.push({ status: 'cancelled', note: 'Cancelled by user', createdAt: new Date() });
        }

        try {
            await order.save();
        } catch (err) {
            await Order.updateOne({ _id: order._id, status: 'cancelled' }, { $set: { status: prevStatus } }).catch(() => {});
            throw err;
        }
        await closeFraudFlag(order._id, 'cancelled');

        // Restore stock
        const ledger: (StockMovementInput | null)[] = [];
        for (const item of order.items) {
            const after = await restockLine(item);
            ledger.push(restockEntry(order, item, after, 'cancel', `Order ${order.orderId || order._id} cancelled by the customer`, userId));
        }
        logRestock(ledger);

        return order;
    },

    async updatePaymentStatus(id: string, paymentStatus: string) {
        const order = await Order.findById(id);
        if (!order) throw new AppError(404, 'Order not found');

        order.paymentStatus = paymentStatus as any;
        if (paymentStatus === 'paid') {
            order.transactionId = order.transactionId || `PAY-${Date.now()}`;
        }
        order.timeline.push({ status: `payment_${paymentStatus}`, note: `Payment marked as ${paymentStatus}`, createdAt: new Date() } as any);
        await order.save();
        return order;
    },

    async addAdminNote(id: string, note: string) {
        const order = await Order.findById(id);
        if (!order) throw new AppError(404, 'Order not found');

        order.timeline.push({ status: 'admin_note', note, createdAt: new Date() } as any);
        await order.save();
        return order;
    },

    async getOrderStats() {
        const [total, pending, confirmed, processing, shipped, on_the_way, out_for_delivery, delivery_attempt, delivered, cancelled, returned, refunded] = await Promise.all([
            Order.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'confirmed' }),
            Order.countDocuments({ status: 'processing' }),
            Order.countDocuments({ status: 'shipped' }),
            Order.countDocuments({ status: 'on_the_way' }),
            Order.countDocuments({ status: 'out_for_delivery' }),
            Order.countDocuments({ status: 'delivery_attempt' }),
            Order.countDocuments({ status: 'delivered' }),
            Order.countDocuments({ status: 'cancelled' }),
            Order.countDocuments({ status: 'returned' }),
            Order.countDocuments({ status: 'refunded' }),
        ]);

        const revenueData = await Order.aggregate([
            { $match: { status: 'delivered' } },
            { $group: { _id: null, totalRevenue: { $sum: '$total' } } },
        ]);

        return { total, pending, confirmed, processing, shipped, on_the_way, out_for_delivery, delivery_attempt, delivered, cancelled, returned, refunded, totalRevenue: revenueData[0]?.totalRevenue || 0 };
    },

// ════════════════════════════════════════════════════════════
    //  RETURN / REFUND (called from the return module)
    // ════════════════════════════════════════════════════════════

    // Restore stock for the items in one package (used on return/refund — goods come back).
    async _restockPackage(order: any, pkg: any, ledgerNote?: string) {
        const ids = new Set((pkg.itemIds || []).map((x: any) => x.toString()));
        const ledger: (StockMovementInput | null)[] = [];
        for (const it of (order.items || [])) {
            if (ids.has(it._id.toString())) {
                const after = await restockLine(it);
                ledger.push(restockEntry(order, it, after, 'return', ledgerNote || `Order ${order.orderId || order._id} returned`));
            }
        }
        logRestock(ledger);
    },

    // Mark the order's package as returned, then recompute order status.
    async markPackageReturned(orderId: any, note?: string) {
        const order = await Order.findById(orderId);
        if (!order) throw new AppError(404, 'Order not found');

        const pkg = (order as any).packages?.[0];
        if (pkg && pkg.status !== 'returned' && pkg.status !== 'refunded') {
            pkg.status = 'returned';
            await this._restockPackage(order, pkg); // returned goods come back into stock
            pkg.timeline.push({ status: 'returned', note: note || 'Return approved', createdAt: new Date() });

            order.status = computeOrderStatus((order as any).packages) as any;
            order.timeline.push({ status: order.status, note: note || 'Package returned', createdAt: new Date() } as any);
            await order.save();
        }
        return order;
    },

    // Mark the order's package as refunded + flip payment status, then recompute order status.
    async markPackageRefunded(orderId: any, note?: string) {
        const order = await Order.findById(orderId);
        if (!order) throw new AppError(404, 'Order not found');

        order.paymentStatus = 'refunded';

        const pkg = (order as any).packages?.[0];
        if (pkg && pkg.status !== 'refunded') {
            const prev = pkg.status;

            // Restock ONLY if the goods weren't already returned-to-stock. The normal
            // return flow is approve → refund; markPackageReturned already restocked on
            // approve, so restocking again here would double-count inventory. A direct
            // refund (prev !== 'returned') still restocks.
            if (prev !== 'returned') await this._restockPackage(order, pkg, `Order ${order.orderId || order._id} refunded`);
            pkg.status = 'refunded';
            pkg.timeline.push({ status: 'refunded', note: note || 'Refund processed', createdAt: new Date() });
        }

        order.status = computeOrderStatus((order as any).packages) as any;
        order.timeline.push({ status: order.status, note: note || 'Refund processed', createdAt: new Date() } as any);
        await order.save();
        return order;
    },

    // ════════════════════════════════════════════════════════════
    //  TRACKING (admin set) + PUBLIC TRACK
    // ════════════════════════════════════════════════════════════

    // Admin sets the master order tracking number + carrier
    async updateOrderTracking(id: string, trackingNumber: string, carrier: string) {
        const order = await Order.findById(id);
        if (!order) throw new AppError(404, 'Order not found');

        order.trackingNumber = trackingNumber;
        order.carrier = carrier;
        order.timeline.push({
            status: 'tracking_updated',
            note: `Tracking: ${trackingNumber} via ${carrier}`,
            createdAt: new Date(),
        } as any);

        await order.save();
        return order;
    },

    // Public order tracking — matches human orderId (case-insensitive) OR Mongo _id
    async trackOrder(orderId: string): Promise<any> {
        const escaped = orderId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const or: any[] = [{ orderId: new RegExp('^' + escaped + '$', 'i') }];
        if (Types.ObjectId.isValid(orderId)) or.push({ _id: orderId });

        const order = await Order.findOne({ $or: or });
        if (!order) throw new AppError(404, 'Order not found');

        const o: any = order;
        const itemsCount = (o.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);
        const customerName = (o.shippingAddress?.fullName || '').trim().split(/\s+/)[0] || '';

        // This endpoint is PUBLIC (no auth). Only expose customer-facing lifecycle events —
        // NOT internal timeline entries like `admin_note` (which can hold private admin
        // comments) or `payment_*` markers (payment status is already returned separately).
        const PUBLIC_TIMELINE_STATUSES = new Set([
            'pending', 'confirmed', 'processing', 'shipped', 'on_the_way',
            'out_for_delivery', 'delivery_attempt', 'delivered', 'cancelled', 'returned', 'refunded',
        ]);

        return {
            orderId: o.orderId,
            status: o.status,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            createdAt: o.createdAt,
            customerName,
            itemsCount,
            timeline: (o.timeline || [])
                .filter((t: any) => PUBLIC_TIMELINE_STATUSES.has(t.status))
                .map((t: any) => ({ status: t.status, note: t.note, createdAt: t.createdAt })),
            packages: (o.packages || []).map((p: any) => ({
                status: p.status,
                trackingNumber: p.trackingNumber,
                carrier: p.carrier,
                timeline: (p.timeline || []).map((t: any) => ({ status: t.status, note: t.note, createdAt: t.createdAt })),
            })),
        };
    },
};

export default OrderService;
