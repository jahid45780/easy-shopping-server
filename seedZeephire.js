require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const FASHION_CAT = new ObjectId('6a12284b194de63256e4b323'); // Fashion & Personal Style
const now = new Date();
const ts = Date.now();

const PRICE = 2474.51;       // selling price
const ORIGINAL = 4949.01;    // MRP (strikethrough)
const IMG = 'https://cdn.shopify.com/s/files/1/2337/7003/files/media_image-ae2cf4368f4e40b7af763923175b691b_b304d3aa-a96d-4b81-a164-1e0cd8ac4463.jpg?v=1756790601';

// Sizes & stock from MoveOn purchase widget
const SIZE_STOCK = [
    { size: 'S', stock: 4 },
    { size: 'M', stock: 0 },
    { size: 'L', stock: 0 },
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
    discount: 0,            // keep 0 so detail page doesn't double-discount
    stock,
    sku: `SKU-IPG3630-${size}-${ts}`,
    images: [],
    note: '',
}));

const product = {
    name: 'Lawn Cotton Kurta Set in Lemon by Zeephire — IPG3630',
    slug: 'lawn-cotton-kurta-set-in-lemon-by-zeephire-ipg3630-' + ts,
    sku: 'IPG3630',
    description: `Lawn Cotton Kurta Set in Lemon by Zeephire (IPG3630).
A breezy 3-piece eastern ready-to-wear kurta set, imported from Pakistan.
Soft lemon-toned lawn cotton with delicate embroidery — perfect for daily summer wear.

What's included (3 Pieces):
• Embroidered Lawn Cotton Top / Kurta (Straight Cut, Regular Fit)
• Cotton Trouser (Flapper bottom)
• Crinkle Chiffon Dupatta

Light, breathable and elegant for everyday styling. No lining.
Disclaimer: Actual product color may vary slightly from the image.`,
    tagline: 'Zeephire — Eastern Ready to Wear | Pakistan Store',
    brand: 'Zeephire',
    priceType: 'fixed',
    productType: 'variable',

    price: PRICE,
    originalPrice: ORIGINAL,
    discount: 0,

    thumbnail: IMG,
    images: [IMG],

    category: FASHION_CAT,

    variants,
    stock: 4,

    status: 'active',
    visibility: 'visible',
    isDeleted: false,

    tags: ['kurta set', 'lawn cotton', 'lemon', 'women', 'pakistan', 'zeephire', '3pc', 'embroidered', 'eastern', 'fashion'],
    colors: ['Lemon'],
    colorHex: ['#E3D26F'],
    sizes: SIZE_STOCK.map((s) => s.size),
    aiLabels: [],

    // Rich specifications — shown in the product page Specifications table
    specifications: [
        { key: 'Gender', value: 'Women' },
        { key: 'Outfit Type', value: 'Eastern Ready to Wear' },
        { key: 'Sub-Category', value: 'Kurta Set' },
        { key: 'Color', value: 'Lemon' },
        { key: 'Number of Pieces', value: '3 Piece — Top + Bottom + Dupatta' },
        { key: 'Shirt Fabric', value: 'Lawn Cotton' },
        { key: 'Dupatta Fabric', value: 'Crinkle Chiffon' },
        { key: 'Trouser Fabric', value: 'Cotton' },
        { key: 'Top Style', value: 'Straight Cut Kurta' },
        { key: 'Top Fit', value: 'Regular Fit' },
        { key: 'Bottom Style', value: 'Flapper' },
        { key: 'Work Technique', value: 'Embroidered' },
        { key: 'Lining', value: 'No Lining' },
        { key: 'Season', value: 'Summer Wear' },
        { key: 'Product Type', value: 'Daily / Basic Wear' },
    ],

    deliveryInfo: 'Imported from Pakistan Store. Delivery 7-12 working days to Bangladesh.',
    paymentInfo: 'bKash, Nagad, Rocket, VISA, Mastercard, Cash on Delivery accepted.',
    termsInfo: '',

    rating: 4.7,
    reviewCount: 18,
    totalSold: 26,
    viewCount: 410,
    likeCount: 33,
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
        console.log(`   price: ৳${PRICE} (was ৳${ORIGINAL}) | sizes: S(4), M(0), L(0)`);
        const total = await col.countDocuments();
        console.log(`🎉 Total products in DB: ${total}`);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await client.close();
    }
}

run();
