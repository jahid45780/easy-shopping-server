require('dotenv').config();
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const productSchema = new mongoose.Schema({
    name: String, slug: String, sku: String, description: String, tagline: String,
    priceType: String, productType: String, price: Number, originalPrice: Number, discount: Number,
    thumbnail: String, images: [String], category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    variants: [], stock: Number, status: String, visibility: String, isDeleted: Boolean,
    tags: [String], colors: [String], colorHex: [String], sizes: [String], aiLabels: [String],
    rating: Number, reviewCount: Number, totalSold: Number, viewCount: Number,
    likeCount: Number, commentCount: Number, shareCount: Number,
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', new mongoose.Schema({ name: String }));

async function seed() {
    try {
        await mongoose.connect(DATABASE_URL);
        console.log('Connected to MongoDB');

        // Get categories
        const cats = await Category.find({});
        const catMap = {};
        cats.forEach(c => { catMap[c.name] = c._id; });
        console.log('Found categories:', Object.keys(catMap).join(', '));

        const products = [
            {
                name: 'Apple iPhone 15 Pro Max 256GB',
                description: 'Latest Apple iPhone 15 Pro Max with A17 Pro chip, titanium design, 48MP camera system, and USB-C connector.',
                tagline: 'Premium flagship smartphone',
                price: 152000,
                originalPrice: 175000,
                thumbnail: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&q=80'],
                category: catMap['Electronics'],
                tags: ['iphone', 'apple', 'smartphone', 'mobile'],
                colors: ['Natural Titanium', 'Blue Titanium'],
                stock: 25,
                rating: 4.8, reviewCount: 156, totalSold: 342, viewCount: 5200,
            },
            {
                name: 'Samsung Galaxy Watch 6 Classic',
                description: 'Samsung Galaxy Watch 6 Classic with rotating bezel, advanced health monitoring, and Wear OS.',
                tagline: 'Smart health companion',
                price: 32000,
                originalPrice: 38000,
                thumbnail: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80'],
                category: catMap['Watches & Accessories'],
                tags: ['samsung', 'smartwatch', 'watch', 'wearable'],
                colors: ['Black', 'Silver'],
                stock: 40,
                rating: 4.5, reviewCount: 89, totalSold: 215, viewCount: 3100,
            },
            {
                name: 'Nike Air Max 270 React Running Shoes',
                description: 'Nike Air Max 270 React with plush cushioning, breathable mesh upper, and bold colorway for everyday comfort.',
                tagline: 'Ultimate comfort meets style',
                price: 8500,
                originalPrice: 12000,
                thumbnail: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80'],
                category: catMap['Shoes & Footwear'],
                tags: ['nike', 'shoes', 'running', 'sneakers', 'sports'],
                colors: ['Red', 'White', 'Black'],
                stock: 60,
                rating: 4.6, reviewCount: 234, totalSold: 890, viewCount: 7800,
            },
            {
                name: 'Leather Travel Duffle Bag Premium',
                description: 'Handcrafted genuine leather duffle bag with brass hardware, perfect for weekend getaways and business trips.',
                tagline: 'Luxury travel companion',
                price: 4500,
                originalPrice: 6200,
                thumbnail: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80'],
                category: catMap['Bags & Luggage'],
                tags: ['bag', 'leather', 'travel', 'duffle', 'luggage'],
                colors: ['Brown', 'Black'],
                stock: 30,
                rating: 4.7, reviewCount: 67, totalSold: 178, viewCount: 2400,
            },
            {
                name: 'Sony WH-1000XM5 Wireless Headphones',
                description: 'Industry-leading noise cancelling headphones with exceptional sound quality, 30-hour battery, and ultra-comfortable design.',
                tagline: 'Premium noise cancelling audio',
                price: 28000,
                originalPrice: 35000,
                thumbnail: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80'],
                category: catMap['Electronics'],
                tags: ['sony', 'headphones', 'wireless', 'noise-cancelling', 'audio'],
                colors: ['Black', 'Silver'],
                stock: 35,
                rating: 4.9, reviewCount: 312, totalSold: 567, viewCount: 9200,
            },
            {
                name: 'Premium Cotton Casual Jacket Men',
                description: 'Stylish cotton jacket with modern slim fit, multiple pockets, and premium fabric for everyday casual wear.',
                tagline: 'Effortless casual style',
                price: 3200,
                originalPrice: 4500,
                thumbnail: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80'],
                category: catMap['Fashion & Clothing'],
                tags: ['jacket', 'men', 'casual', 'cotton', 'fashion'],
                colors: ['Navy', 'Olive', 'Black'],
                stock: 50,
                rating: 4.3, reviewCount: 45, totalSold: 320, viewCount: 4100,
            },
            {
                name: 'Stainless Steel Kitchen Knife Set 5 Pieces',
                description: 'Professional 5-piece kitchen knife set with ergonomic handles, high-carbon stainless steel blades, and wooden block.',
                tagline: 'Chef-grade kitchen essentials',
                price: 2800,
                originalPrice: 3800,
                thumbnail: 'https://images.unsplash.com/photo-1593618998160-e34014e67546?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1593618998160-e34014e67546?w=800&q=80'],
                category: catMap['Home & Kitchen'],
                tags: ['kitchen', 'knife', 'cooking', 'stainless-steel'],
                colors: ['Silver'],
                stock: 45,
                rating: 4.4, reviewCount: 78, totalSold: 456, viewCount: 3600,
            },
            {
                name: 'Natural Organic Skincare Gift Set',
                description: 'Complete organic skincare set including cleanser, toner, serum, and moisturizer. Made with natural botanical extracts.',
                tagline: 'Glow naturally everyday',
                price: 3500,
                originalPrice: 4800,
                thumbnail: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&q=80'],
                category: catMap['Health & Beauty'],
                tags: ['skincare', 'organic', 'beauty', 'natural', 'gift'],
                colors: [],
                stock: 55,
                rating: 4.6, reviewCount: 123, totalSold: 678, viewCount: 5800,
            },
            {
                name: 'Professional Yoga Mat with Carrying Strap',
                description: 'Extra thick 6mm non-slip yoga mat with alignment lines. Eco-friendly TPE material, includes carrying strap and bag.',
                tagline: 'Premium fitness essential',
                price: 1800,
                originalPrice: 2500,
                thumbnail: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800&q=80'],
                category: catMap['Sports & Outdoors'],
                tags: ['yoga', 'mat', 'fitness', 'sports', 'exercise'],
                colors: ['Purple', 'Blue', 'Green'],
                stock: 80,
                rating: 4.5, reviewCount: 189, totalSold: 1234, viewCount: 8900,
            },
            {
                name: 'LEGO Creator 3-in-1 Space Shuttle',
                description: 'Build a space shuttle, astronaut figure, or spaceship with this 3-in-1 LEGO Creator set. 486 pieces for ages 8+.',
                tagline: 'Build imagination limitlessly',
                price: 4200,
                originalPrice: 5500,
                thumbnail: 'https://images.unsplash.com/photo-1587654780291-39c9404d7dd0?w=500&q=80',
                images: ['https://images.unsplash.com/photo-1587654780291-39c9404d7dd0?w=800&q=80'],
                category: catMap['Toys & Kids'],
                tags: ['lego', 'toys', 'kids', 'building', 'space'],
                colors: [],
                stock: 25,
                rating: 4.8, reviewCount: 95, totalSold: 345, viewCount: 4500,
            },
        ];

        // Add computed fields
        products.forEach(p => {
            p.slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
            p.sku = 'SKU-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
            p.status = 'active';
            p.visibility = 'visible';
            p.isDeleted = false;
            p.priceType = 'negotiable';
            p.productType = 'simple';
            if (p.originalPrice && p.originalPrice > p.price) {
                p.discount = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
            }
            p.likeCount = Math.floor(Math.random() * 50);
            p.commentCount = p.reviewCount;
            p.shareCount = Math.floor(Math.random() * 30);
        });

        const result = await Product.insertMany(products);
        console.log(`\nInserted ${result.length} products:`);
        result.forEach(p => console.log(`  ✅ ${p.name} — ৳${p.price}`));

        await mongoose.disconnect();
        console.log('\nDone!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

seed();
