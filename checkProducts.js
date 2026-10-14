require('dotenv').config();
const { MongoClient } = require('mongodb');
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

async function check() {
  const client = new MongoClient(DATABASE_URL);
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'shohozkitchen');

  const total = await db.collection('products').countDocuments();
  console.log(`\n📦 মোট products: ${total} টি`);

  // Name দিয়ে group করে দেখি কোনটা duplicate আছে কিনা
  const duplicates = await db.collection('products').aggregate([
    { $group: { _id: '$name', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  if (duplicates.length === 0) {
    console.log('✅ কোনো duplicate নেই!');
  } else {
    console.log(`\n⚠️  ${duplicates.length} টি duplicate product পাওয়া গেছে:\n`);
    duplicates.forEach(d => {
      console.log(`  ❌ "${d._id}" — ${d.count} বার`);
    });
  }

  // Category-wise count
  const catCounts = await db.collection('products').aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $project: { name: '$cat.name', count: 1 } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log('\n📊 Category-wise breakdown:');
  catCounts.forEach(c => console.log(`  ${c.name || 'Unknown'}: ${c.count} টি`));

  await client.close();
}

check().catch(console.error);
