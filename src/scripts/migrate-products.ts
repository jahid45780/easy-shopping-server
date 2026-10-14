/**
 * Migration Script: Update existing products with new fields
 * Run: npx ts-node src/scripts/migrate-products.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function migrateProducts() {
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

        // Count total products
        const totalProducts = await productsCollection.countDocuments();
        console.log(`📦 Found ${totalProducts} products to update`);

        // Update all products with new default field values (only if fields don't already exist)
        const updateResult = await productsCollection.updateMany(
            {}, // all products
            [
                {
                    $set: {
                        // Add costPrice if not present
                        costPrice: { $ifNull: ['$costPrice', null] },

                        // Add lowStockThreshold if not present
                        lowStockThreshold: { $ifNull: ['$lowStockThreshold', 5] },

                        // Add visibility if not present
                        visibility: { $ifNull: ['$visibility', 'visible'] },

                        // Add isNewProduct if not present
                        isNewProduct: { $ifNull: ['$isNewProduct', false] },

                        // Add isOnSale if not present — set true if discount > 0
                        isOnSale: {
                            $ifNull: [
                                '$isOnSale',
                                { $cond: [{ $gt: ['$discount', 0] }, true, false] }
                            ]
                        },

                        // Add highlights if not present
                        highlights: { $ifNull: ['$highlights', []] },

                        // Add warranty if not present
                        warranty: {
                            $ifNull: ['$warranty', {
                                hasWarranty: false,
                                duration: 0,
                                durationUnit: 'months',
                                type: 'manufacturer'
                            }]
                        },

                        // Add shippingConfig if not present
                        shippingConfig: {
                            $ifNull: ['$shippingConfig', {
                                freeShipping: false,
                                shippingCost: 0,
                                estimatedDays: 3
                            }]
                        },
                    }
                }
            ]
        );

        console.log(`✅ Updated ${updateResult.modifiedCount} products with new fields`);

        // Log sample product to verify
        const sampleProduct = await productsCollection.findOne({});
        if (sampleProduct) {
            console.log('\n📋 Sample product after migration:');
            console.log(`   Name: ${sampleProduct.name}`);
            console.log(`   costPrice: ${sampleProduct.costPrice}`);
            console.log(`   lowStockThreshold: ${sampleProduct.lowStockThreshold}`);
            console.log(`   visibility: ${sampleProduct.visibility}`);
            console.log(`   isNewProduct: ${sampleProduct.isNewProduct}`);
            console.log(`   isOnSale: ${sampleProduct.isOnSale}`);
            console.log(`   highlights: ${JSON.stringify(sampleProduct.highlights)}`);
            console.log(`   warranty: ${JSON.stringify(sampleProduct.warranty)}`);
            console.log(`   shippingConfig: ${JSON.stringify(sampleProduct.shippingConfig)}`);
        }

        console.log('\n🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔒 Disconnected from database');
        process.exit(0);
    }
}

migrateProducts();
