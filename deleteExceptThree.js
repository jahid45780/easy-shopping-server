require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

// The 3 products to KEEP (uploaded from MoveOn)
const KEEP_IDS = [
    new ObjectId('6a12cb30c13d47aa7644b52c'), // Coco by Zara Shahjahan — Amber Days
    new ObjectId('6a12cd1e8195316ac28d3e0d'), // Zeephire Lemon — IPG3630
    new ObjectId('6a12ce0709c85428c0e00b20'), // Zeephire Navy Blue — BOB4089
];

async function run() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await client.connect();
        console.log('✅ MongoDB connected');
        const col = client.db(process.env.DB_NAME || 'shohozkitchen').collection('products');

        const before = await col.countDocuments();
        console.log(`\n📦 Total documents before: ${before}`);

        // Safety: verify the 3 keepers exist
        const keepers = await col.find({ _id: { $in: KEEP_IDS } }).project({ name: 1 }).toArray();
        console.log(`\n🔒 Keeping ${keepers.length} products:`);
        keepers.forEach((k) => console.log(`   ✓ ${k.name}`));

        if (keepers.length !== 3) {
            console.error(`\n❌ ABORT: expected to find 3 keepers but found ${keepers.length}. No deletion performed.`);
            return;
        }

        // Delete everything except the 3
        const result = await col.deleteMany({ _id: { $nin: KEEP_IDS } });
        console.log(`\n🗑️  Deleted: ${result.deletedCount} products`);

        const after = await col.countDocuments();
        console.log(`📦 Total documents after: ${after}`);

        const remaining = await col.find({}).project({ name: 1 }).toArray();
        console.log(`\n✅ Remaining products:`);
        remaining.forEach((p) => console.log(`   • ${p.name}`));
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await client.close();
    }
}

run();
