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
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    level: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: true },
    showInMenu: { type: Boolean, default: true },
    showInHome: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    productCount: { type: Number, default: 0 },
}, { timestamps: true });

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

const productSchema = new mongoose.Schema({
    name: String,
    slug: String,
    sku: String,
    description: String,
    price: Number,
    originalPrice: Number,
    discount: Number,
    thumbnail: String,
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    childCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    brand: { type: String, default: '' },
    stock: { type: Number, default: 50 },
    status: { type: String, default: 'active' },
    approvalStatus: { type: String, default: 'approved' },
    visibility: { type: String, default: 'visible' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const HIERARCHY = [
    {
        name: 'Electronics',
        icon: '📱',
        order: 1,
        children: [
            {
                name: 'Mobile Phones',
                icon: '📞',
                children: [
                    { name: 'Smartphones', icon: '📱' },
                    { name: 'Feature Phones', icon: '☎️' },
                    { name: 'Gaming Phones', icon: '🎮' },
                ],
            },
            {
                name: 'Mobile Accessories',
                icon: '🔌',
                children: [
                    { name: 'Chargers', icon: '🔋' },
                    { name: 'Cables', icon: '🔌' },
                    { name: 'Power Banks', icon: '⚡' },
                ],
            },
        ],
    },
    {
        name: 'Fashion',
        icon: '👗',
        order: 2,
        children: [
            {
                name: "Men's Fashion",
                icon: '👔',
                children: [
                    { name: 'T-Shirts', icon: '👕' },
                    { name: 'Shirts', icon: '👔' },
                    { name: 'Panjabi', icon: '🥻' },
                ],
            },
            {
                name: "Women's Fashion",
                icon: '👗',
                children: [
                    { name: 'Saree', icon: '🥻' },
                    { name: 'Three Piece', icon: '👗' },
                    { name: 'Kurti', icon: '👚' },
                ],
            },
        ],
    },
];

async function seed() {
    try {
        await mongoose.connect(DATABASE_URL);
        console.log('Connected to MongoDB');

        // Upsert categories and build ID map
        const catMap = {}; // name -> _id

        for (const root of HIERARCHY) {
            const rootSlug = root.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            let rootDoc = await Category.findOne({ slug: rootSlug, isDeleted: false });
            if (!rootDoc) {
                rootDoc = await Category.create({
                    name: root.name,
                    slug: rootSlug,
                    icon: root.icon,
                    level: 0,
                    order: root.order || 0,
                    parent: null,
                });
            } else {
                rootDoc.level = 0;
                rootDoc.parent = null;
                rootDoc.icon = root.icon;
                await rootDoc.save();
            }
            catMap[root.name] = rootDoc._id;
            console.log(`✅ Root: ${root.name} (${rootDoc._id})`);

            for (const sub of root.children || []) {
                const subSlug = sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                let subDoc = await Category.findOne({ slug: subSlug, isDeleted: false });
                if (!subDoc) {
                    subDoc = await Category.create({
                        name: sub.name,
                        slug: subSlug,
                        icon: sub.icon,
                        level: 1,
                        parent: rootDoc._id,
                    });
                } else {
                    subDoc.level = 1;
                    subDoc.parent = rootDoc._id;
                    subDoc.icon = sub.icon;
                    await subDoc.save();
                }
                catMap[sub.name] = subDoc._id;
                console.log(`   └ Sub: ${sub.name} (${subDoc._id})`);

                for (const child of sub.children || []) {
                    const childSlug = child.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    let childDoc = await Category.findOne({ slug: childSlug, isDeleted: false });
                    if (!childDoc) {
                        childDoc = await Category.create({
                            name: child.name,
                            slug: childSlug,
                            icon: child.icon,
                            level: 2,
                            parent: subDoc._id,
                        });
                    } else {
                        childDoc.level = 2;
                        childDoc.parent = subDoc._id;
                        childDoc.icon = child.icon;
                        await childDoc.save();
                    }
                    catMap[child.name] = childDoc._id;
                    console.log(`      └── Child: ${child.name} (${childDoc._id})`);
                }
            }
        }

        // Sample products mapping to test each level
        const sampleProducts = [
            {
                name: 'Apple iPhone 15 Pro Max 256GB Titanium',
                slug: 'iphone-15-pro-max-titanium-' + Date.now(),
                sku: 'IPHONE-15-PRO-' + Date.now().toString().slice(-4),
                description: 'Latest flagship smartphone with A17 Pro chip and titanium design.',
                price: 165000,
                originalPrice: 175000,
                discount: 6,
                thumbnail: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80',
                images: [
                    'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
                ],
                category: catMap['Electronics'],
                subCategory: catMap['Mobile Phones'],
                childCategory: catMap['Smartphones'],
                brand: 'Apple',
            },
            {
                name: 'ASUS ROG Phone 7 Ultimate Gaming Smartphone',
                slug: 'asus-rog-phone-7-ultimate-' + Date.now(),
                sku: 'ROG-PHONE-7-' + Date.now().toString().slice(-4),
                description: 'Snapdragon 8 Gen 2 gaming phone with 165Hz AMOLED display.',
                price: 110000,
                originalPrice: 120000,
                discount: 8,
                thumbnail: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80',
                images: [
                    'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1567581935884-3349723552ca?w=600&auto=format&fit=crop&q=80',
                ],
                category: catMap['Electronics'],
                subCategory: catMap['Mobile Phones'],
                childCategory: catMap['Gaming Phones'],
                brand: 'ASUS',
            },
            {
                name: 'Anker 65W GaN Fast Charger 3-Port',
                slug: 'anker-65w-gan-fast-charger-' + Date.now(),
                sku: 'ANKER-65W-GAN-' + Date.now().toString().slice(-4),
                description: 'Ultra-compact high-speed fast charger for mobile phones and laptops.',
                price: 3200,
                originalPrice: 3800,
                discount: 15,
                thumbnail: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
                images: [
                    'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&auto=format&fit=crop&q=80',
                ],
                category: catMap['Electronics'],
                subCategory: catMap['Mobile Accessories'],
                childCategory: catMap['Chargers'],
                brand: 'Anker',
            },
            {
                name: 'Baseus 20000mAh 65W Power Bank PD Fast Charging',
                slug: 'baseus-20000mah-powerbank-' + Date.now(),
                sku: 'BASEUS-20000-65W-' + Date.now().toString().slice(-4),
                description: 'High capacity 20000mAh power bank with digital display.',
                price: 4500,
                originalPrice: 5200,
                discount: 13,
                thumbnail: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&auto=format&fit=crop&q=80',
                images: [
                    'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=600&auto=format&fit=crop&q=80',
                ],
                category: catMap['Electronics'],
                subCategory: catMap['Mobile Accessories'],
                childCategory: catMap['Power Banks'],
                brand: 'Baseus',
            },
            {
                name: 'Premium Silk Cotton Designer Panjabi for Men',
                slug: 'premium-silk-cotton-panjabi-' + Date.now(),
                sku: 'PANJABI-SILK-' + Date.now().toString().slice(-4),
                description: 'Handcrafted luxury embroidered Panjabi perfect for festivals and weddings.',
                price: 4800,
                originalPrice: 5500,
                discount: 12,
                thumbnail: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80',
                images: [
                    'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop&q=80',
                ],
                category: catMap['Fashion'],
                subCategory: catMap["Men's Fashion"],
                childCategory: catMap['Panjabi'],
                brand: 'Shohoz Kitchen Collection',
            },
            {
                name: 'Pure Jamdani Handloom Traditional Saree',
                slug: 'pure-jamdani-handloom-saree-' + Date.now(),
                sku: 'SAREE-JAMDANI-' + Date.now().toString().slice(-4),
                description: 'Authentic Dhakai Jamdani saree with fine woven geometric motifs.',
                price: 8500,
                originalPrice: 9900,
                discount: 14,
                thumbnail: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
                images: [
                    'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80',
                ],
                category: catMap['Fashion'],
                subCategory: catMap["Women's Fashion"],
                childCategory: catMap['Saree'],
                brand: 'Heritage Bengal',
            },
        ];

        console.log('\nInserting sample products across hierarchy...');
        for (const prod of sampleProducts) {
            await Product.create(prod);
            console.log(`  🛒 Created product: ${prod.name}`);
        }

        console.log('\n🎉 Category hierarchy & test products seeded successfully!');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error seeding:', err);
        process.exit(1);
    }
}

seed();
