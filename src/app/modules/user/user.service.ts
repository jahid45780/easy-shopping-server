import crypto from 'crypto';
import { User } from './user.model';
import { Product } from '../product/product.model';
import { Order } from '../order/order.model';
import AppError from '../../utils/AppError';
import QueryBuilder from '../../utils/QueryBuilder';

const UserService = {
    // Get all users (admin)
    async getAllUsers(query: Record<string, unknown>) {
        // role=staff → everyone who works in the admin panel (super admin, admin, editor).
        const q = { ...query };
        const base: Record<string, unknown> = {};
        if (q.role === 'staff') {
            delete q.role;
            base.role = { $in: ['superadmin', 'admin', 'editor'] };
        }
        const userQuery = new QueryBuilder(
            User.find(base).select('-password'),
            q
        )
            .search(['firstName', 'lastName', 'email', 'phone'])
            .filter()
            .sort()
            .paginate();

        const users = await userQuery.modelQuery;
        const meta = await userQuery.countTotal();

        // Order figures come live from the orders collection rather than the stored
        // totalOrders/totalSpent counters, which are bumped at checkout and never
        // reversed when an order is cancelled.
        //   orderCount — every order except cancelled ones
        //   spent      — only delivered orders (money the customer actually paid)
        const ids = users.map((u: any) => u._id);
        const figures = ids.length
            ? await Order.aggregate([
                { $match: { user: { $in: ids } } },
                {
                    $group: {
                        _id: '$user',
                        orderCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] } },
                        spent: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total', 0] } },
                    },
                },
            ])
            : [];
        const byUser = new Map(figures.map((f: any) => [String(f._id), f]));

        const rows = users.map((u: any) => {
            const f = byUser.get(String(u._id));
            return { ...u.toJSON(), orderCount: f?.orderCount || 0, spent: f?.spent || 0 };
        });
        return { users: rows, meta };
    },

    // Admin stats
    async getAdminStats() {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const [total, active, blocked, admins, customers, activeCustomers, blockedCustomers, newCustomersThisMonth] =
            await Promise.all([
                User.countDocuments(),
                User.countDocuments({ status: 'active' }),
                User.countDocuments({ status: 'blocked' }),
                User.countDocuments({ role: { $in: ['superadmin', 'admin', 'editor'] } }),   // all staff
                User.countDocuments({ role: 'user' }),
                User.countDocuments({ role: 'user', status: 'active' }),
                User.countDocuments({ role: 'user', status: 'blocked' }),
                User.countDocuments({ role: 'user', createdAt: { $gte: monthStart } }),
            ]);

        const [newUsersThisMonth, staffByRole, staffBlocked] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: monthStart } }),
            User.aggregate([
                { $match: { role: { $in: ['superadmin', 'admin', 'editor'] } } },
                { $group: { _id: '$role', n: { $sum: 1 } } },
            ]),
            User.countDocuments({ role: { $in: ['superadmin', 'admin', 'editor'] }, status: 'blocked' }),
        ]);
        const roleCount = (r: string) => staffByRole.find((s: { _id: string }) => s._id === r)?.n || 0;

        return {
            total, active, blocked, admins, users: total - admins, newUsersThisMonth,
            // Buyers only — what the Customers page shows.
            customers: { total: customers, active: activeCustomers, blocked: blockedCustomers, newThisMonth: newCustomersThisMonth },
            // Admin-panel accounts, per role — what the Staff page shows.
            staff: {
                total: admins,
                superadmin: roleCount('superadmin'),
                admin: roleCount('admin'),
                editor: roleCount('editor'),
                blocked: staffBlocked,
            },
        };
    },

    // Admin: add a buyer by hand (phone orders, walk-ins). Phone is the identity;
    // email is optional, so a placeholder is generated when it is missing — the same
    // convention guest checkout uses. The random password means nobody can sign in
    // until the customer resets it.
    async createCustomer(payload: { firstName: string; lastName?: string; phone: string; email?: string; defaultDiscount?: number; loyaltyPoints?: number }) {
        const phone = payload.phone.replace(/\s+/g, '');
        const email = (payload.email || `${phone}@guest.shohozkitchen.com`).toLowerCase().trim();

        const clash = await User.findOne({ $or: [{ phone }, { email }] }).select('_id phone email');
        if (clash) {
            throw new AppError(409, clash.phone === phone
                ? 'A customer with this phone number already exists'
                : 'A customer with this email already exists');
        }

        const user = await User.create({
            email,
            password: crypto.randomBytes(24).toString('hex'),
            firstName: payload.firstName.trim(),
            lastName: payload.lastName?.trim() || '',
            phone,
            role: 'user',
            status: 'active',
            isEmailVerified: false,
            loyaltyPoints: payload.loyaltyPoints || 0,
            defaultDiscount: payload.defaultDiscount || 0,
        });
        return user;
    },

    // Get single user
    async getUserById(id: string) {
        const user = await User.findById(id);
        if (!user) throw new AppError(404, 'User not found');
        return user.toObject();
    },

    // Get my profile
    async getMyProfile(userId: string) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');
        return user;
    },

    // Update my profile
    async updateMyProfile(userId: string, payload: any) {
        // If password change is requested
        if (payload.currentPassword && payload.password) {
            const user = await User.findById(userId).select('+password');
            if (!user) throw new AppError(404, 'User not found');

            const isMatch = await user.comparePassword(payload.currentPassword);
            if (!isMatch) throw new AppError(400, 'Current password is incorrect');

            user.password = payload.password;
            await user.save();
            return user;
        }

        // Normal profile update
        const allowedFields: Record<string, any> = {};
        const allowed = ['firstName', 'lastName', 'phone', 'avatar', 'name'];
        for (const key of allowed) {
            if (payload[key] !== undefined) {
                // Map 'name' to firstName/lastName
                if (key === 'name' && typeof payload.name === 'string') {
                    const parts = payload.name.trim().split(' ');
                    allowedFields.firstName = parts[0];
                    allowedFields.lastName = parts.slice(1).join(' ') || '';
                } else {
                    allowedFields[key] = payload[key];
                }
            }
        }

        const user = await User.findByIdAndUpdate(userId, allowedFields, { new: true, runValidators: true });
        if (!user) throw new AppError(404, 'User not found');
        return user;
    },

    // Admin: update user
    async adminUpdateUser(id: string, payload: any) {
        const allowedFields: Record<string, any> = {};
        // SECURITY: 'role' & 'permissions' are intentionally NOT updatable here.
        // Changing a user's role is a SUPERADMIN-only action handled exclusively by the
        // role module (PATCH /api/roles/:userId). This prevents a regular admin from
        // promoting anyone (including themselves) to admin/superadmin.
        const allowed = ['firstName', 'lastName', 'phone', 'status', 'isEmailVerified', 'loyaltyPoints', 'defaultDiscount'];
        for (const key of allowed) {
            if (payload[key] !== undefined) allowedFields[key] = payload[key];
        }
        const user = await User.findByIdAndUpdate(id, allowedFields, { new: true, runValidators: true });
        if (!user) throw new AppError(404, 'User not found');
        return user;
    },

    // Get my addresses
    async getMyAddresses(userId: string) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');
        return user.shippingAddresses;
    },

    // Add shipping address
    async addShippingAddress(userId: string, address: any) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');

        // The very first address a user adds becomes their default automatically,
        // so there's always a default for checkout to pick.
        if (user.shippingAddresses.length === 0) {
            address.isDefault = true;
        }

        // If new address is default, remove default from others
        if (address.isDefault) {
            user.shippingAddresses.forEach((addr) => (addr.isDefault = false));
        }

        // Map 'zipCode' to 'postalCode' if sent from frontend
        if (address.zipCode && !address.postalCode) {
            address.postalCode = address.zipCode;
        }

        user.shippingAddresses.push(address);
        await user.save();
        return user.shippingAddresses;
    },

    // Update shipping address
    async updateShippingAddress(userId: string, addressId: string, payload: any) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');

        const address = (user.shippingAddresses as any).id(addressId);
        if (!address) throw new AppError(404, 'Address not found');

        if (payload.isDefault) {
            user.shippingAddresses.forEach((addr) => (addr.isDefault = false));
        }

        // Map zipCode to postalCode
        if (payload.zipCode && !payload.postalCode) {
            payload.postalCode = payload.zipCode;
        }

        Object.assign(address, payload);
        await user.save();
        return user.shippingAddresses;
    },

    // Delete shipping address
    async deleteShippingAddress(userId: string, addressId: string) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');
        user.shippingAddresses = user.shippingAddresses.filter(
            (addr: any) => addr._id?.toString() !== addressId
        );
        await user.save();
        return user.shippingAddresses;
    },

    // Get wishlist (populated with products)
    async getWishlist(userId: string) {
        const user = await User.findById(userId).populate({
            path: 'wishlist',
            select: 'name images price discountPrice stock averageRating totalReviews slug',
            match: { isDeleted: false },
        });
        if (!user) throw new AppError(404, 'User not found');
        return user.wishlist;
    },

    // Toggle wishlist
    async toggleWishlist(userId: string, productId: string) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');

        const index = user.wishlist.indexOf(productId);
        if (index === -1) {
            user.wishlist.push(productId);
        } else {
            user.wishlist.splice(index, 1);
        }
        await user.save();
        return { wishlist: user.wishlist, added: index === -1 };
    },

    // Get a user's wishlist publicly (read-only share). Exposes only product data.
    async getSharedWishlist(userId: string) {
        const user = await User.findById(userId)
            .select('wishlist')
            .populate({
                path: 'wishlist',
                select: 'name images price discountPrice stock averageRating totalReviews slug',
                match: { isDeleted: false },
            });
        if (!user) throw new AppError(404, 'Wishlist not found');
        return user.wishlist;
    },

    // Merge a guest's local wishlist into the logged-in user's wishlist (no duplicates)
    async mergeWishlist(userId: string, productIds: string[]) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');

        const existing = new Set(user.wishlist.map((id) => id.toString()));
        for (const productId of productIds) {
            if (!existing.has(productId)) {
                user.wishlist.push(productId);
                existing.add(productId);
            }
        }
        await user.save();

        return await this.getWishlist(userId);
    },

    // Admin: update user status
    async updateUserStatus(id: string, status: 'active' | 'blocked' | 'pending') {
        const user = await User.findByIdAndUpdate(id, { status }, { new: true });
        if (!user) throw new AppError(404, 'User not found');
        return user;
    },

    // Admin: delete user (soft)
    async deleteUser(id: string) {
        const target = await User.findById(id);
        if (!target) throw new AppError(404, 'User not found');

        // Never delete the last remaining super admin (would lock out super-admin access).
        if (target.role === 'superadmin') {
            const superadminCount = await User.countDocuments({
                role: 'superadmin',
                isDeleted: { $ne: true },
            });
            if (superadminCount <= 1) {
                throw new AppError(400, 'Cannot delete the last remaining super admin.');
            }
        }

        const user = await User.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
        return user;
    },
};

export default UserService;
