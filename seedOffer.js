// Seeds one active "Flash Sale" offer so the backend-driven storefront row shows.
// Run: node seedOffer.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const DATABASE_URL =
    process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';
const DB_NAME = process.env.DB_NAME || 'shohozkitchen';

async function run() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await client.connect();
        console.log('✅ MongoDB connected (shohozkitchen)');
        const db = client.db(DB_NAME);
        const products = db.collection('products');
        const offers = db.collection('offers');

        // Prefer products that actually have a discount; fall back to newest.
        let picks = await products
            .find({
                $or: [
                    { discount: { $gt: 0 } },
                    { $expr: { $gt: ['$originalPrice', '$price'] } },
                ],
            })
            .limit(12)
            .toArray();

        if (picks.length < 3) {
            picks = await products.find({}).sort({ createdAt: -1 }).limit(12).toArray();
        }

        if (picks.length === 0) {
            console.log('⚠️  No products found — seed products first.');
            return;
        }

        const productIds = picks.map((p) => p._id);
        const now = new Date();
        const endTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // +8 hours

        // Replace any existing flash-sale so re-running stays idempotent.
        await offers.deleteMany({ type: 'flash-sale' });

        const offer = {
            title: 'Flash',
            subtitle: 'UP TO 70% OFF',
            type: 'flash-sale',
            products: productIds,
            bannerImage: '',
            link: '/products?sort=-discount',
            startTime: now,
            endTime,
            isActive: true,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
        };

        const res = await offers.insertOne(offer);
        console.log(`🎉 Flash Sale offer created: ${res.insertedId}`);
        console.log(`   products: ${productIds.length}`);
        console.log(`   ends at:  ${endTime.toISOString()}`);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await client.close();
    }
}

run();
