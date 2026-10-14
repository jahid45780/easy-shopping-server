require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const FASHION_CAT = new ObjectId('6a12284b194de63256e4b323'); // Fashion & Personal Style
const now = new Date();
const ts = Date.now();

const PRICE = 837.54;        // selling price
const ORIGINAL = 985.05;     // MRP (strikethrough)

// Skip the cloudflare video thumbnail — use the 2 real Shopify product photos
const IMAGES = [
    'https://cdn.shopify.com/s/files/1/2337/7003/files/20260419064908-e211974345c8497d-media_image-d794a48beb824a25b2b1e97d4b444894.jpg',
    'https://cdn.shopify.com/s/files/1/2337/7003/files/20260419163500-32e73c18ebd34fcc-media_image-ba8942e24e3c439f83a4a1d9c88429e7.jpg',
];

// Bangle sizes & stock from MoveOn purchase widget
const SIZE_STOCK = [
    { size: '2.4', stock: 0 },
    { size: '2.6', stock: 4 },
    { size: '2.8', stock: 13 },
    { size: '2.10', stock: 5 },
];

const variants = SIZE_STOCK.map(({ size, stock }) => ({
    _id: new ObjectId(),
    label: size,
    color: 'Gold',
    colorHex: '#D4AF37',
    size,
    description: '',
    price: PRICE,
    originalPrice: ORIGINAL,
    discount: 0,
    stock,
    sku: `SKU-ALS9290-${size.replace('.', '')}-${ts}`,
    images: [],
    note: '',
}));

const product = {
    name: 'Bangles in Gold Color by Aurelia.Pk — Trendy Women Bangles ALS9290',
    slug: 'bangles-in-gold-color-by-aurelia-pk-trendy-women-bangles-als9290-' + ts,
    sku: 'ALS9290',
    description: `Bangles in Gold Color by Aurelia.Pk (ALS9290) — Trendy Women Bangles.
Imported from Pakistan. A set of 2-piece elegant gold-plated bangles.

These elegant gold-plated bangles from Aurelia.Pk are a must-have accessory for any
fashion-forward woman. Crafted from metal with exquisite gold plating, they effortlessly
blend modern trends with classic elegance — a versatile choice for any jewelry collection.

• Base Material: Metal
• Color: Gold
• Work Technique: Gold Plating
• Pieces: 2 Piece set

Disclaimer: Actual product color may vary slightly from the image.`,
    tagline: 'Aurelia.Pk — Trendy Women Jewelry | Pakistan Store',
    brand: 'Aurelia.Pk',
    priceType: 'fixed',
    productType: 'variable',

    price: PRICE,
    originalPrice: ORIGINAL,
    discount: 0,

    thumbnail: IMAGES[0],
    images: IMAGES,

    category: FASHION_CAT,

    variants,
    stock: 22,

    status: 'active',
    visibility: 'visible',
    isDeleted: false,

    tags: ['bangles', 'jewelry', 'gold', 'women', 'accessories', 'aurelia', 'pakistan', 'gold plated', 'fashion'],
    colors: ['Gold'],
    colorHex: ['#D4AF37'],
    sizes: SIZE_STOCK.map((s) => s.size),
    aiLabels: [],

    specifications: [
        { key: 'Gender', value: 'Women' },
        { key: 'Category', value: 'Accessories' },
        { key: 'Outfit Type', value: 'Jewelry' },
        { key: 'Sub-Category', value: 'Bangles' },
        { key: 'Base Material', value: 'Metal' },
        { key: 'Color', value: 'Gold' },
        { key: 'Number of Pieces', value: '2 Piece' },
        { key: 'Work Technique', value: 'Gold Plating' },
    ],

    deliveryInfo: 'Imported from Pakistan Store. Delivery 7-12 working days to Bangladesh.',
    paymentInfo: 'bKash, Nagad, Rocket, VISA, Mastercard, Cash on Delivery accepted.',
    termsInfo: '',

    rating: 4.6,
    reviewCount: 21,
    totalSold: 44,
    viewCount: 680,
    likeCount: 52,
    commentCount: 0,
    shareCount: 0,
    wishlistCount: 0,

    createdAt: now,
    updatedAt: now,
};

async function run() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await client.connect();
        console.log('✅ MongoDB connected');
        const col = client.db(process.env.DB_NAME || 'shohozkitchen').collection('products');
        const res = await col.insertOne(product);
        console.log(`✅ Inserted: ${product.name}`);
        console.log(`   _id:  ${res.insertedId}`);
        console.log(`   slug: ${product.slug}`);
        console.log(`   price: ৳${PRICE} (was ৳${ORIGINAL}) | sizes: 2.4(0), 2.6(4), 2.8(13), 2.10(5) | images: ${IMAGES.length}`);
        const total = await col.countDocuments();
        console.log(`🎉 Total products in DB: ${total}`);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await client.close();
    }
}

run();
