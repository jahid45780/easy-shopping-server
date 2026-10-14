import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../app/modules/user/user.model';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function checkAndCreateAdmin() {
    try {
        const dbUrl = process.env.DATABASE_URL || '';
        console.log('Connecting to database...');
        await mongoose.connect(dbUrl);
        console.log('Connected!\n');

        // Check for existing admins
        const admins = await User.find({ role: 'admin' }).select('email firstName lastName role status createdAt');
        
        if (admins.length > 0) {
            console.log(`✅ Found ${admins.length} admin(s):\n`);
            admins.forEach((admin, i) => {
                console.log(`  ${i + 1}. ${admin.firstName} ${admin.lastName}`);
                console.log(`     Email: ${admin.email}`);
                console.log(`     Role: ${admin.role}`);
                console.log(`     Status: ${admin.status}`);
                console.log(`     Created: ${admin.createdAt}`);
                console.log('');
            });
        } else {
            console.log('❌ No admin found! Creating one...\n');
            
            // Credentials come from .env — never from source, which is public.
            const email = (process.env.ADMIN_EMAIL || 'admin@shohozkitchen.com').toLowerCase();
            const password = process.env.ADMIN_PASSWORD || '';
            if (password.length < 10) {
                throw new Error('Set ADMIN_PASSWORD in .env (at least 10 characters) before creating the admin.');
            }
            const admin = await User.create({
                email,
                password,
                firstName: 'Admin',
                lastName: ' Easy Shopping ',
                phone: '+8801700000000',
                role: 'admin',
                status: 'active',
                isEmailVerified: true,
            });

            console.log('✅ Admin created successfully!\n');
            console.log(`  📧 Email:    ${email}`);
            console.log('  🔑 Password: the ADMIN_PASSWORD value from .env');
            console.log(`  👤 Name:     ${admin.firstName} ${admin.lastName}`);
            console.log(`  🔰 Role:     ${admin.role}`);
        }

        // Also show total user count
        const totalUsers = await User.countDocuments();
        console.log(`\n📊 Total users in database: ${totalUsers}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDatabase disconnected.');
    }
}

checkAndCreateAdmin();
