import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// Minimal inline schema — just enough to match by slug and update images
const productSchema = new mongoose.Schema(
    {
        slug: String,
        name: String,
        thumbnail: String,
        images: [String],
    },
    { strict: false, timestamps: true }
);
const Product = mongoose.model('Product', productSchema);

// Curated, stable Unsplash photos that match each product.
// Slug keys come from the seed (see shohozkitchen_server/src/scripts/seed.ts).
const updates: { slug: string; thumbnail: string; images: string[] }[] = [
    {
        slug: 'silk-blend-saree',
        thumbnail:
            'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80',
        images: [
            'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80',
            'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800&q=80',
            'https://images.unsplash.com/photo-1623091410901-00e2d268901a?w=800&q=80',
        ],
    },
    {
        slug: 'women-hoodie-sweatshirt',
        thumbnail:
            'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80',
        images: [
            'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80',
            'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80',
            'https://images.unsplash.com/photo-1571945153237-4929e783af4a?w=800&q=80',
        ],
    },
    {
        slug: 'premium-leather-wallet-slim',
        thumbnail:
            'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80',
        images: [
            'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80',
            'https://images.unsplash.com/photo-1517254797898-04edd251bfb3?w=800&q=80',
            'https://images.unsplash.com/photo-1606503825008-909a67e63c3d?w=800&q=80',
        ],
    },
];

async function run() {
    await mongoose.connect(process.env.DATABASE_URL!);
    console.log('✅ MongoDB Connected\n');

    for (const u of updates) {
        // Try exact slug first, then a forgiving regex match for variations
        let product = await Product.findOne({ slug: u.slug });

        if (!product) {
            const regex = new RegExp(u.slug.split('-').slice(0, 3).join('.*'), 'i');
            product = await Product.findOne({ slug: regex });
        }

        if (!product) {
            // Last resort — fuzzy name match
            const nameRegex = new RegExp(
                u.slug
                    .split('-')
                    .slice(0, 2)
                    .join('.*'),
                'i'
            );
            product = await Product.findOne({ name: nameRegex });
        }

        if (!product) {
            console.log(`⚠️  not found:   ${u.slug}`);
            continue;
        }

        product.thumbnail = u.thumbnail;
        product.images = u.images;
        await product.save();
        console.log(`✅ updated:     ${product.name}  (slug: ${product.slug})`);
    }

    await mongoose.disconnect();
    console.log('\n🎉 Done.');
}

run().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
});
