import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../app/modules/user/user.model';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// Creates (or upgrades) a SUPER ADMIN account so the Roles & Permissions panel
// can be accessed. Super admin is the only role allowed to manage staff roles.
// Credentials come from .env — never from source, which is public.
async function setupSuperAdmin() {
    const EMAIL = (process.env.SUPERADMIN_EMAIL || 'superadmin@gmail.com').toLowerCase();
    const PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
    try {
        await mongoose.connect(process.env.DATABASE_URL || '');
        console.log('✅ Connected to DB\n');

        const existing = await User.findOne({ email: EMAIL });
        if (existing) {
            existing.role = 'superadmin' as any;
            existing.status = 'active' as any;
            (existing as any).isEmailVerified = true;
            await existing.save();
            console.log('✅ Existing user upgraded to SUPER ADMIN');
        } else {
            if (PASSWORD.length < 10) {
                throw new Error('Set SUPERADMIN_PASSWORD in .env (at least 10 characters) before creating the super admin.');
            }
            await User.create({
                email: EMAIL,
                password: PASSWORD,
                firstName: 'Super',
                lastName: 'Admin',
                role: 'superadmin',
                status: 'active',
                isEmailVerified: true,
            });
            console.log('✅ Super Admin created');
        }

        console.log(`   Email:    ${EMAIL}`);
        console.log('   Password: the SUPERADMIN_PASSWORD value from .env');
        console.log(`   Role:     superadmin`);
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : error);
    } finally {
        await mongoose.disconnect();
    }
}

setupSuperAdmin();
