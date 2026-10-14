/**
 * Migration Script: Update existing categories with new fields
 * Run: npx ts-node src/scripts/migrate-categories.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function migrateCategories() {
    try {
        console.log('🔄 Connecting to database...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            console.error('❌ Database connection not available');
            process.exit(1);
        }

        const categoriesCollection = db.collection('categories');

        const totalCategories = await categoriesCollection.countDocuments();
        console.log(`📁 Found ${totalCategories} categories to update`);

        const updateResult = await categoriesCollection.updateMany(
            {},
            [
                {
                    $set: {
                        description: { $ifNull: ['$description', ''] },
                        banner: { $ifNull: ['$banner', ''] },
                        isFeatured: { $ifNull: ['$isFeatured', false] },
                        showInMenu: { $ifNull: ['$showInMenu', true] },
                        showInHome: { $ifNull: ['$showInHome', true] },
                        metaTitle: { $ifNull: ['$metaTitle', ''] },
                        metaDescription: { $ifNull: ['$metaDescription', ''] },
                    }
                }
            ]
        );

        console.log(`✅ Updated ${updateResult.modifiedCount} categories with new fields`);

        const sampleCategory = await categoriesCollection.findOne({});
        if (sampleCategory) {
            console.log('\n📋 Sample category after migration:');
            console.log(`   Name: ${sampleCategory.name}`);
            console.log(`   isActive: ${sampleCategory.isActive}`);
            console.log(`   isFeatured: ${sampleCategory.isFeatured}`);
            console.log(`   showInMenu: ${sampleCategory.showInMenu}`);
            console.log(`   showInHome: ${sampleCategory.showInHome}`);
            console.log(`   description: "${sampleCategory.description}"`);
            console.log(`   banner: "${sampleCategory.banner}"`);
            console.log(`   metaTitle: "${sampleCategory.metaTitle}"`);
            console.log(`   metaDescription: "${sampleCategory.metaDescription}"`);
        }

        console.log('\n🎉 Category migration completed!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔒 Disconnected from database');
        process.exit(0);
    }
}

migrateCategories();
