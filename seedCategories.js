require('dotenv').config();
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const categorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    description: String,
    icon: String,
    image: String,
    banner: String,
    parent: { type: mongoose.Schema.Types.ObjectId, default: null },
    level: { type: Number, default: 0 },
    order: Number,
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    showInMenu: { type: Boolean, default: true },
    showInHome: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    productCount: { type: Number, default: 0 },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

const categories = [
    { name: 'Electronics', slug: 'electronics', icon: '📱', order: 1, description: 'Smartphones, gadgets, and electronic devices' },
    { name: 'Fashion & Clothing', slug: 'fashion-clothing', icon: '👗', order: 2, description: 'Trendy fashion wear for men and women' },
    { name: 'Bags & Luggage', slug: 'bags-luggage', icon: '👜', order: 3, description: 'Bags, backpacks, and travel luggage' },
    { name: 'Shoes & Footwear', slug: 'shoes-footwear', icon: '👟', order: 4, description: 'Shoes, sneakers, and sandals' },
    { name: 'Watches & Accessories', slug: 'watches-accessories', icon: '⌚', order: 5, description: 'Watches, sunglasses, and accessories' },
    { name: 'Home & Kitchen', slug: 'home-kitchen', icon: '🏠', order: 6, description: 'Home decor, kitchenware, and appliances' },
    { name: 'Health & Beauty', slug: 'health-beauty', icon: '💄', order: 7, description: 'Skincare, cosmetics, and health products' },
    { name: 'Sports & Outdoors', slug: 'sports-outdoors', icon: '⚽', order: 8, description: 'Sports gear and outdoor equipment' },
    { name: 'Toys & Kids', slug: 'toys-kids', icon: '🧸', order: 9, description: 'Toys, games, and kids essentials' },
    { name: 'Gadgets & Tools', slug: 'gadgets-tools', icon: '🔧', order: 10, description: 'Smart gadgets, tools, and tech accessories' },
];

async function seed() {
    try {
        await mongoose.connect(DATABASE_URL);
        console.log('Connected to MongoDB');

        // Delete existing categories
        await Category.deleteMany({});
        console.log('Cleared existing categories');

        // Insert new categories
        const result = await Category.insertMany(categories);
        console.log(`Inserted ${result.length} categories:`);
        result.forEach(c => console.log(`  ✅ ${c.name} (${c.icon})`));

        await mongoose.disconnect();
        console.log('\nDone!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

seed();
