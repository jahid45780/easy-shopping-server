require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const FASHION_CAT = new ObjectId('6a12284b194de63256e4b323'); // Fashion & Personal Style
const now = new Date();
const ts = Date.now();

const PRICE = 2583.9;
const SIZES = ['Un-Stitched', 'X-Small', 'Small', 'Medium', 'Large'];

// One variant per size — same price & stock as shown on MoveOn
const variants = SIZES.map((size) => ({
    _id: new ObjectId(),
    label: size,
    color: '',
    colorHex: '',
    size,
    description: '',
    price: PRICE,
    originalPrice: null,
    discount: 0,
    stock: 10,
    sku: `SKU-COCO-${size.replace(/\s/g, '').toUpperCase()}-${ts}`,
    images: [],
    note: '',
}));

const product = {
    name: 'Coco by Zara Shahjahan Prints Vol-05 Unstitched Linen 3Pc Suit D-01A Amber Days',
    slug: 'coco-by-zara-shahjahan-prints-vol-05-unstitched-linen-3pc-suit-d-01a-amber-days-' + ts,
    sku: 'SKU-COCO-D01A-' + ts,
    description: `Coco by Zara Shahjahan Prints Vol-05 — D-01A "Amber Days".
A premium unstitched 3-piece linen suit from Pakistan's iconic Zara Shahjahan label.
Rich amber-plum base with delicate floral embroidery and a contrast polka-dot dupatta.

What's included (3 Pieces):
• Embroidered Linen Shirt / Kameez
• Printed Linen Dupatta
• Linen Trouser fabric

Premium soft linen — breathable, elegant, and perfect for autumn & winter wear.
Available unstitched or get it stitched online in your size.`,
    tagline: 'Coco by Zara Shahjahan Vol-05 — Premium Pakistani Linen',
    brand: 'Zara Shahjahan',
    priceType: 'fixed',
    productType: 'variable',

    price: PRICE,
    originalPrice: null,
    discount: 0,

    thumbnail: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop',
    images: [
        'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1583391733956-62e7a9f7b4e2?w=800&auto=format&fit=crop',
    ],

    category: FASHION_CAT,

    variants,
    stock: 50,

    status: 'active',
    visibility: 'visible',
    isDeleted: false,

    tags: ['linen', 'suit', 'unstitched', '3pc', 'women', 'pakistan', 'zara shahjahan', 'coco', 'fashion', 'kameez'],
    colors: ['Amber Plum'],
    colorHex: ['#7a2e43'],
    sizes: SIZES,
    aiLabels: [],

    deliveryInfo: 'Imported from Pakistan Store. Delivery 7-12 working days to Bangladesh. Stitching available on request.',
    paymentInfo: 'bKash, Nagad, Rocket, VISA, Mastercard, Cash on Delivery accepted.',
    termsInfo: '',

    rating: 4.8,
    reviewCount: 24,
    totalSold: 37,
    viewCount: 540,
    likeCount: 48,
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
        console.log(`   price: ৳${PRICE} | sizes: ${SIZES.join(', ')}`);
        const total = await col.countDocuments();
        console.log(`🎉 Total products in DB: ${total}`);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await client.close();
    }
}

run();
