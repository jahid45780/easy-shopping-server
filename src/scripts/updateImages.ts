import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_URL = process.env.DATABASE_URL!;

const productSchema = new mongoose.Schema({
    name: String, slug: String, thumbnail: String, images: [String],
}, { strict: false });
const Product = mongoose.model('ProductUpdate2', productSchema, 'products');

const updates = [
    {
        name: '4K Action Camera Ultra HD',
        thumbnail: '/images/action_camera.png',
        images: ['/images/action_camera.png'],
    },
    {
        name: 'Luxury Scented Soy Candle Set (3pcs)',
        thumbnail: '/images/scented_candles.png',
        images: ['/images/scented_candles.png'],
    },
    {
        name: 'Premium Weighted Blanket (7kg)',
        thumbnail: '/images/weighted_blanket.png',
        images: ['/images/weighted_blanket.png'],
    },
    {
        name: 'Pro Yoga Mat (Non-Slip, 6mm)',
        thumbnail: '/images/yoga_mat.png',
        images: ['/images/yoga_mat.png'],
    },
    {
        name: 'Premium Leather Wallet (Slim)',
        thumbnail: '/images/leather_wallet.png',
        images: ['/images/leather_wallet.png'],
    },
];

async function updateImages() {
    await mongoose.connect(DB_URL);
    console.log('✅ MongoDB Connected');

    for (const update of updates) {
        const result = await Product.findOneAndUpdate(
            { name: update.name },
            { thumbnail: update.thumbnail, images: update.images },
            { new: true }
        );
        console.log(result ? `✅ Updated: ${result.name}` : `❌ Not found: ${update.name}`);
    }

    console.log('\n🎉 All images updated!');
    process.exit(0);
}

updateImages().catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
});
