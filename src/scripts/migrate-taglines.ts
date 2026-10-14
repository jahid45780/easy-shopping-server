/**
 * Migration Script: Add tagline & priceType to existing products
 * Run: npx ts-node src/scripts/migrate-taglines.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

// Taglines pool — will be assigned based on product characteristics
const TAGLINES: Record<string, string[]> = {
    // For products with warranty
    warranty: [
        '1 (One) Year Service Warranty',
        '2 Years Manufacturer Warranty',
        '6 Months Replacement Warranty',
        '1 Year Brand Warranty Included',
        '3 Years Extended Warranty',
    ],
    // For tools/hardware/machinery
    tools: [
        'Lower price than others but quality higher',
        'Industrial grade quality at best price',
        'Professional quality, affordable price',
        'Best quality guaranteed at lowest price',
        'Heavy duty build for professional use',
    ],
    // For electronics
    electronics: [
        '1 (One) Year Service Warranty',
        'Genuine product with brand warranty',
        'Latest model at unbeatable price',
        'Original product, best price guaranteed',
        'Premium quality with warranty support',
    ],
    // Generic / default
    default: [
        'Lower price than others but quality higher',
        'Best quality at most affordable price',
        'Premium quality, competitive pricing',
        'Trusted quality, unbeatable value',
        'Top rated product at best price',
    ],
};

// Category name keywords to match
function getTaglineForProduct(product: any): string {
    const categoryName = (product.categoryName || '').toLowerCase();
    const productName = (product.name || '').toLowerCase();
    const brand = (product.brand || '').toLowerCase();

    // Check if product has warranty info
    const hasWarranty = product.warranty?.hasWarranty;

    let pool: string[];

    if (hasWarranty) {
        pool = TAGLINES.warranty;
    } else if (
        categoryName.includes('tool') || categoryName.includes('hardware') ||
        categoryName.includes('cutting') || categoryName.includes('machine') ||
        productName.includes('disc') || productName.includes('machine') ||
        productName.includes('grind') || productName.includes('drill') ||
        productName.includes('saw') || productName.includes('blade')
    ) {
        pool = TAGLINES.tools;
    } else if (
        categoryName.includes('electronic') || categoryName.includes('electric') ||
        productName.includes('motor') || productName.includes('power') ||
        productName.includes('battery') || productName.includes('cable')
    ) {
        pool = TAGLINES.electronics;
    } else {
        pool = TAGLINES.default;
    }

    // Use a deterministic index based on product name hash
    const hash = (product.name || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    return pool[hash % pool.length];
}

function getPriceType(product: any): string {
    const price = product.price || 0;
    // Higher priced items tend to be negotiable, lower priced ones fixed
    if (price > 5000) return 'negotiable';
    if (price < 500) return 'fixed';
    // Random based on name hash
    const hash = (product.name || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    return hash % 3 === 0 ? 'fixed' : 'negotiable';
}

async function migrateTaglines() {
    try {
        console.log('🔄 Connecting to database...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            console.error('❌ Database connection not available');
            process.exit(1);
        }

        const productsCollection = db.collection('products');

        // Get all products with category populated
        const products = await productsCollection.aggregate([
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            }
        ]).toArray();

        console.log(`📦 Found ${products.length} products to update`);

        let updatedCount = 0;

        for (const product of products) {
            const categoryName = product.categoryInfo?.[0]?.name || '';
            const productWithCategory = { ...product, categoryName };

            const tagline = getTaglineForProduct(productWithCategory);
            const priceType = getPriceType(productWithCategory);

            await productsCollection.updateOne(
                { _id: product._id },
                {
                    $set: {
                        tagline,
                        priceType,
                    }
                }
            );

            updatedCount++;
            console.log(`  ✅ ${product.name} → "${tagline}" (${priceType})`);
        }

        console.log(`\n✅ Updated ${updatedCount} products with taglines & priceType`);

        // Show sample
        const sample = await productsCollection.findOne({});
        if (sample) {
            console.log('\n📋 Sample product:');
            console.log(`   Name: ${sample.name}`);
            console.log(`   Tagline: ${sample.tagline}`);
            console.log(`   PriceType: ${sample.priceType}`);
        }

        console.log('\n🎉 Migration completed!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔒 Disconnected from database');
        process.exit(0);
    }
}

migrateTaglines();
