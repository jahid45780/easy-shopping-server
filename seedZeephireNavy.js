require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const FASHION_CAT = new ObjectId('6a12284b194de63256e4b323'); // Fashion & Personal Style
const now = new Date();
const ts = Date.now();

const PRICE = 2375.26;       // selling price
const ORIGINAL = 4750.52;    // MRP (strikethrough)

const IMAGES = [
    'https://cdn.shopify.com/s/files/1/2337/7003/files/media_image-412eca10f1b04c5988f9410fc6c72ff5_9ec6ceb9-59d5-4c21-9c25-03b4b0308e25.jpg?v=1755584482',
    'https://cdn.shopify.com/s/files/1/2337/7003/files/media_image-d53d012385944dc2a3106ff2ea4fcbc5_ee1742f5-85b2-4ddd-9eb7-e49173cd602d.jpg?v=1755584482',
    'https://cdn.shopify.com/s/files/1/2337/7003/files/media_image-6d323feb6b504c5e9d24f813ee14a91a_3a65c2fe-b540-44b3-af6c-bb1943340f80.jpg?v=1755584482',
];

// Sizes & stock from MoveOn purchase widget
const SIZE_STOCK = [
    { size: 'S', stock: 9 },
    { size: 'M', stock: 8 },
    { size: 'L', stock: 11 },
];

const variants = SIZE_STOCK.map(({ size, stock }) => ({
    _id: new ObjectId(),
    label: size,
    color: '',
    colorHex: '',
    size,
    description: '',
    price: PRICE,
    originalPrice: ORIGINAL,
    discount: 0,
    stock,
    sku: `SKU-BOB4089-${size}-${ts}`,
    images: [],
    note: '',
}));

const product = {
    name: 'Lawn Cotton Kurta Set in Navy Blue by Zeephire — BOB4089',
    slug: 'lawn-cotton-kurta-set-in-navy-blue-by-zeephire-bob4089-' + ts,
    sku: 'BOB4089',
    description: `Lawn Cotton Kurta Set in Navy Blue by Zeephire (BOB4089).
A graceful 3-piece eastern ready-to-wear kurta set, imported from Pakistan.
Deep navy blue lawn cotton with elegant embroidery — ideal for daily summer wear.

What's included (3 Pieces):
• Embroidered Lawn Cotton Top / Kurta (Straight Cut, Regular Fit)
• Lawn Trouser (Straight bottom)
• Crinkle Chiffon Dupatta

Light, breathable and refined for everyday styling.
Disclaimer: Actual product color may vary slightly from the image.`,
    tagline: 'Zeephire — Eastern Ready to Wear | Pakistan Store',
    brand: 'Zeephire',
    priceType: 'fixed',
    productType: 'variable',

    price: PRICE,
    originalPrice: ORIGINAL,
    discount: 0,

    thumbnail: IMAGES[0],
    images: IMAGES,

    category: FASHION_CAT,

    variants,
    stock: 28,

    status: 'active',
    visibility: 'visible',
    isDeleted: false,

    tags: ['kurta set', 'lawn cotton', 'navy blue', 'women', 'pakistan', 'zeephire', '3pc', 'embroidered', 'eastern', 'fashion'],
    colors: ['Navy Blue'],
    colorHex: ['#1f2a52'],
    sizes: SIZE_STOCK.map((s) => s.size),
    aiLabels: [],

    specifications: [
        { key: 'Gender', value: 'Women' },
        { key: 'Outfit Type', value: 'Eastern Ready to Wear' },
        { key: 'Sub-Category', value: 'Kurta Set' },
        { key: 'Color', value: 'Navy Blue' },
        { key: 'Number of Pieces', value: '3 Piece — Top + Bottom + Dupatta' },
        { key: 'Shirt Fabric', value: 'Lawn Cotton' },
        { key: 'Dupatta Fabric', value: 'Crinkle Chiffon' },
        { key: 'Trouser Fabric', value: 'Lawn' },
        { key: 'Top Style', value: 'Straight Cut Kurta' },
        { key: 'Top Fit', value: 'Regular Fit' },
        { key: 'Bottom Style', value: 'Straight Trouser' },
        { key: 'Work Technique', value: 'Embroidered' },
        { key: 'Lining', value: 'As Shown in Picture' },
        { key: 'Season', value: 'Summer Wear' },
        { key: 'Product Type', value: 'Daily / Basic Wear' },
    ],

    deliveryInfo: 'Imported from Pakistan Store. Delivery 7-12 working days to Bangladesh.',
    paymentInfo: 'bKash, Nagad, Rocket, VISA, Mastercard, Cash on Delivery accepted.',
    termsInfo: '',

    rating: 3.42,
    reviewCount: 281,
    totalSold: 190,
    viewCount: 2100,
    likeCount: 120,
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
        console.log(`   price: ৳${PRICE} (was ৳${ORIGINAL}) | sizes: S(9), M(8), L(11) | images: ${IMAGES.length}`);
        const total = await col.countDocuments();
        console.log(`🎉 Total products in DB: ${total}`);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await client.close();
    }
}

run();
