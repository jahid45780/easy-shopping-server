import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../app/modules/user/user.model';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// The admin's credentials come from .env — never from source, which is public.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

async function setupAdmin() {
    try {
        await mongoose.connect(process.env.DATABASE_URL || '');
        console.log('Connected to DB\n');

        const existing = await User.findOne({ email: ADMIN_EMAIL });

        if (existing) {
            console.log(`✅ ${ADMIN_EMAIL} already exists!`);
            console.log(`   Role: ${existing.role}`);
            console.log(`   Status: ${existing.status}`);

            // Make sure it's admin role
            if (existing.role !== 'admin' && existing.role !== 'superadmin') {
                existing.role = 'admin';
                await existing.save();
                console.log('   → Updated role to admin!');
            }
        } else {
            if (ADMIN_PASSWORD.length < 10) {
                throw new Error('Set ADMIN_PASSWORD in .env (at least 10 characters) before creating the admin.');
            }
            const admin = await User.create({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                firstName: 'Admin',
                lastName: 'Shohoz Kitchen',
                role: 'admin',
                status: 'active',
                isEmailVerified: true,
            });
            console.log('✅ Admin created!');
            console.log(`   Email: ${ADMIN_EMAIL}`);
            console.log('   Password: the ADMIN_PASSWORD value from .env');
            console.log(`   Role: ${admin.role}`);
        }

    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
    } finally {
        await mongoose.disconnect();
    }
}

setupAdmin();
