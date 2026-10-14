/**
 * Migration Script: Set country for existing products
 * - First 3 products → Pakistan
 * - Rest → Bangladesh
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

async function migrate() {
    try {
        await mongoose.connect(DATABASE_URL);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('products');

        // Get all products with empty or no country
        const allProducts = await collection.find({
            $or: [
                { country: '' },
                { country: { $exists: false } },
                { country: null }
            ]
        }).sort({ createdAt: 1 }).toArray();

        console.log(`📦 Found ${allProducts.length} products without a country\n`);

        if (allProducts.length === 0) {
            console.log('All products already have a country set!');
            await mongoose.disconnect();
            return;
        }

        // Print all products
        allProducts.forEach((p, i) => {
            console.log(`  ${i + 1}. [${p._id}] ${p.name} — current country: "${p.country || ''}"`);
        });

        // First 3 → Pakistan, rest → Bangladesh
        const pakistanProducts = allProducts.slice(0, 3);
        const bangladeshProducts = allProducts.slice(3);

        console.log(`\n🇵🇰 Setting ${pakistanProducts.length} products to Pakistan...`);
        if (pakistanProducts.length > 0) {
            const pakistanIds = pakistanProducts.map(p => p._id);
            const r1 = await collection.updateMany(
                { _id: { $in: pakistanIds } },
                { $set: { country: 'Pakistan' } }
            );
            console.log(`   Updated: ${r1.modifiedCount}`);
            pakistanProducts.forEach(p => console.log(`   ✅ ${p.name} → Pakistan`));
        }

        console.log(`\n🇧🇩 Setting ${bangladeshProducts.length} products to Bangladesh...`);
        if (bangladeshProducts.length > 0) {
            const bangladeshIds = bangladeshProducts.map(p => p._id);
            const r2 = await collection.updateMany(
                { _id: { $in: bangladeshIds } },
                { $set: { country: 'Bangladesh' } }
            );
            console.log(`   Updated: ${r2.modifiedCount}`);
            bangladeshProducts.forEach(p => console.log(`   ✅ ${p.name} → Bangladesh`));
        }

        console.log('\n🎉 Migration complete!');

        // Verify
        const summary = await collection.aggregate([
            { $group: { _id: '$country', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('\n📊 Country Summary:');
        summary.forEach(s => {
            console.log(`   ${s._id || '(empty)'}: ${s.count} products`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

migrate();
