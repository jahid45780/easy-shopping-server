import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const productSchema = new mongoose.Schema(
    { slug: String, name: String, thumbnail: String, images: [String] },
    { strict: false, timestamps: true }
);
const Product = mongoose.model('Product', productSchema);

// Match each product by a name regex → set to the matching LOCAL image
// (these files already ship in shohozkitchen_client/public/images/)
const updates: { match: RegExp; thumbnail: string; images: string[] }[] = [
    { match: /yoga\s*mat/i,                 thumbnail: '/images/yoga_mat.png',         images: ['/images/yoga_mat.png'] },
    { match: /weighted\s*blanket/i,         thumbnail: '/images/weighted_blanket.png', images: ['/images/weighted_blanket.png'] },
    { match: /scented.*candle|candle.*set/i, thumbnail: '/images/scented_candles.png',  images: ['/images/scented_candles.png'] },
];

async function run() {
    await mongoose.connect(process.env.DATABASE_URL!);
    console.log('✅ MongoDB Connected\n');

    for (const u of updates) {
        const product = await Product.findOne({ name: u.match });
        if (!product) {
            console.log(`⚠️  not found for: ${u.match}`);
            continue;
        }
        product.thumbnail = u.thumbnail;
        product.images = u.images;
        await product.save();
        console.log(`✅ updated: ${product.name}  →  ${u.thumbnail}`);
    }

    await mongoose.disconnect();
    console.log('\n🎉 Done.');
}

run().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
});
