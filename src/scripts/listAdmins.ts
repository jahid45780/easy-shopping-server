import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../app/modules/user/user.model';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function listAdmins() {
    try {
        await mongoose.connect(process.env.DATABASE_URL || '');
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } })
            .select('email role firstName lastName status createdAt')
            .sort({ role: 1, createdAt: 1 });

        console.log(`\n📋 Admin / Super-Admin accounts in DB: ${admins.length}\n`);
        admins.forEach((u: any) => {
            console.log(`  • ${u.email}`);
            console.log(`      role:   ${u.role}`);
            console.log(`      name:   ${u.firstName} ${u.lastName}`);
            console.log(`      status: ${u.status}\n`);
        });
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

listAdmins();
