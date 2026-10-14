require('dotenv').config();
const { MongoClient } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

async function deleteAllProducts() {
  const client = new MongoClient(DATABASE_URL);

  try {
    console.log('🔌 MongoDB-তে connect করা হচ্ছে...');
    await client.connect();
    console.log('✅ Connected!');

    const db = client.db(process.env.DB_NAME || 'shohozkitchen');
    const collection = db.collection('products');

    const countBefore = await collection.countDocuments();
    console.log(`📦 মোট product আছে: ${countBefore} টি`);

    if (countBefore === 0) {
      console.log('⚠️  কোনো product নেই, delete করার কিছু নেই।');
      return;
    }

    const result = await collection.deleteMany({});
    console.log(`🗑️  ${result.deletedCount} টি product সফলভাবে delete হয়েছে!`);

    const countAfter = await collection.countDocuments();
    console.log(`✅ এখন database-এ product আছে: ${countAfter} টি`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('🔌 Connection বন্ধ করা হয়েছে।');
  }
}

deleteAllProducts();
