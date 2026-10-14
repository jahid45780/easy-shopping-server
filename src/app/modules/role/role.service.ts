import { User } from '../user/user.model';
import AppError from '../../utils/AppError';
import { ALL_PERMISSIONS } from './role.constants';

// Lean fields returned for staff listings / role updates.
const STAFF_FIELDS = 'firstName lastName email role permissions status avatar createdAt';

const RoleService = {
    // ── List every assignable permission ──
    getPermissions() {
        return ALL_PERMISSIONS;
    },

    // ── List all staff: super admins, admins and editors ──
    async getStaff() {
        return await User.find({ role: { $in: ['superadmin', 'admin', 'editor'] } })
            .select(STAFF_FIELDS)
            .sort({ createdAt: -1 });
    },

    // ── Set role + permissions on a user ──
    async updateUserRole(
        userId: string,
        payload: { role: string; permissions: string[] }
    ) {
        const user = await User.findById(userId);
        if (!user) throw new AppError(404, 'User not found');

        // Never demote the LAST super admin — that would lock everyone out of
        // super-admin-only features (Roles & Permissions, staff management, etc.).
        if (user.role === 'superadmin' && payload.role !== 'superadmin') {
            const superadminCount = await User.countDocuments({
                role: 'superadmin',
                isDeleted: { $ne: true },
            });
            if (superadminCount <= 1) {
                throw new AppError(
                    400,
                    'Cannot demote the last remaining super admin. Promote another super admin first.'
                );
            }
        }

        // Permissions only carry meaning for admins; clear them otherwise.
        const permissions =
            payload.role === 'admin' ? payload.permissions || [] : [];

        user.role = payload.role as typeof user.role;
        user.permissions = permissions;
        await user.save();

        return await User.findById(userId).select(STAFF_FIELDS);
    },
};

export default RoleService;
