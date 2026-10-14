require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

// ── Category IDs (from existing DB) ──────────────────────────────
const CATEGORY_IDS = {
    fashion:      new ObjectId('6a12284b194de63256e4b323'), // Fashion & Personal Style
    electronics:  new ObjectId('6a122810194de63256e4b317'), // Electrical & Electronics
    home:         new ObjectId('6a122818194de63256e4b31d'), // Home & Lifestyle
    family:       new ObjectId('6a122808194de63256e4b311'), // Family, Kids & Daily Care
    industrial:   new ObjectId('6a1227f0194de63256e4b2ff'), // Industrial & Manufacturing
    agriculture:  new ObjectId('6a122801194de63256e4b30b'), // Agriculture & Food Industry
    automotive:   new ObjectId('6a1227ea194de63256e4b2f9'), // Automotive & Transportation
};

const now = new Date();

const PRODUCTS = [

    // ── 1. Fashion ──────────────────────────────────────────
    {
        name: "Men's Premium Cotton Polo Shirt — Classic Fit Short Sleeve",
        slug: 'mens-premium-cotton-polo-shirt-' + Date.now(),
        sku: 'SKU-POLO-001-' + Date.now(),
        description: `Premium quality 100% cotton polo shirt for men. Classic fit with ribbed collar and cuffs.
Available in multiple colors. Ideal for casual and semi-formal occasions.
Sourced directly from top Pakistani textile manufacturers — same quality exported to Europe.`,
        tagline: 'Premium Pakistani Textile — Export Quality',
        price: 580,
        originalPrice: 850,
        discount: 32,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1625910513413-2f6dd8feef44?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1625910513413-2f6dd8feef44?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.fashion,
        stock: 150,
        status: 'active',
        visibility: 'visible',
        tags: ['polo', 'men', 'cotton', 'shirt', 'fashion', 'pakistan'],
        colors: ['White', 'Navy Blue', 'Black', 'Olive'],
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        rating: 4.5,
        reviewCount: 38,
        totalSold: 120,
        viewCount: 890,
        likeCount: 64,
        deliveryInfo: 'Delivery within 3-5 working days across Bangladesh.',
        paymentInfo: 'bKash, Nagad, Rocket, Cash on Delivery, VISA/Mastercard accepted.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 2. Fashion ──────────────────────────────────────────
    {
        name: "Women's Embroidered Lawn Kameez — Summer Collection 2025",
        slug: 'womens-embroidered-lawn-kameez-summer-' + (Date.now() + 1),
        sku: 'SKU-KMEZ-002-' + Date.now(),
        description: `Beautiful embroidered lawn kameez from Pakistan's famous summer collection.
3-piece unstitched suit including kameez, dupatta and trouser cloth.
Premium lawn fabric — soft, breathable and perfect for hot weather.
Intricate embroidery on neckline and sleeves.`,
        tagline: 'Authentic Pakistani Lawn — Top Quality Fabric',
        price: 1200,
        originalPrice: 1800,
        discount: 33,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1583391733956-62e7a9f7b4e2?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.fashion,
        stock: 80,
        status: 'active',
        visibility: 'visible',
        tags: ['kameez', 'women', 'lawn', 'embroidery', 'pakistan', 'summer', 'fashion'],
        colors: ['Pink', 'Mint Green', 'Sky Blue', 'Peach'],
        sizes: ['S', 'M', 'L', 'XL'],
        rating: 4.7,
        reviewCount: 52,
        totalSold: 89,
        viewCount: 1200,
        likeCount: 95,
        deliveryInfo: 'Delivery within 3-5 working days across Bangladesh.',
        paymentInfo: 'bKash, Nagad, Rocket, Cash on Delivery accepted.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 3. Electronics ─────────────────────────────────────
    {
        name: 'Wireless Bluetooth Headphones — Active Noise Cancelling 40Hr Battery',
        slug: 'wireless-bluetooth-headphones-anc-' + (Date.now() + 2),
        sku: 'SKU-HEAD-003-' + Date.now(),
        description: `Over-ear wireless headphones with Active Noise Cancellation technology.
40 hours battery life on a single charge. Foldable design for easy portability.
Premium 40mm drivers deliver deep bass and crystal-clear highs.
Compatible with all Bluetooth 5.0 devices. Built-in mic for calls.`,
        tagline: '40Hr Battery • ANC • Premium Sound',
        price: 2800,
        originalPrice: 4200,
        discount: 33,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.electronics,
        stock: 60,
        status: 'active',
        visibility: 'visible',
        tags: ['headphones', 'bluetooth', 'anc', 'wireless', 'audio', 'electronics'],
        colors: ['Black', 'White', 'Rose Gold'],
        rating: 4.6,
        reviewCount: 74,
        totalSold: 210,
        viewCount: 2400,
        likeCount: 180,
        deliveryInfo: 'Delivery within 5-7 working days. Free delivery on orders above ৳3000.',
        paymentInfo: 'VISA, Mastercard, bKash, Nagad, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 4. Electronics ─────────────────────────────────────
    {
        name: 'Smart Watch Fitness Tracker — Heart Rate, SpO2, Sleep Monitor IP68',
        slug: 'smart-watch-fitness-tracker-ip68-' + (Date.now() + 3),
        sku: 'SKU-WTCH-004-' + Date.now(),
        description: `Feature-packed smart watch with comprehensive health monitoring.
Tracks heart rate, blood oxygen (SpO2), sleep quality, steps and calories burned.
IP68 waterproof — wear it while swimming. 1.7" color display.
Notifications for calls, WhatsApp, Facebook. 7-day battery life.
Compatible with Android 5.0+ and iOS 10+.`,
        tagline: 'IP68 Waterproof • 7-Day Battery • Full Health Monitor',
        price: 3500,
        originalPrice: 5500,
        discount: 36,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.electronics,
        stock: 45,
        status: 'active',
        visibility: 'visible',
        tags: ['smartwatch', 'fitness', 'heart rate', 'spo2', 'waterproof', 'electronics'],
        colors: ['Black', 'Silver', 'Gold'],
        rating: 4.4,
        reviewCount: 93,
        totalSold: 345,
        viewCount: 3100,
        likeCount: 230,
        deliveryInfo: 'Delivery within 5-7 working days. Free delivery on orders above ৳3000.',
        paymentInfo: 'VISA, Mastercard, bKash, Nagad, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 5. Home & Lifestyle ─────────────────────────────────
    {
        name: 'Stainless Steel Non-Stick Cookware Set — 5 Piece Kitchen Pot & Pan',
        slug: 'stainless-steel-nonstick-cookware-set-' + (Date.now() + 4),
        sku: 'SKU-COOK-005-' + Date.now(),
        description: `Premium 5-piece stainless steel cookware set with non-stick coating.
Includes: 1 large pot, 1 medium pot, 1 frying pan, 1 saucepan, 1 lid set.
Compatible with all cooktops including induction. Dishwasher safe.
PFOA-free non-stick surface. Ergonomic cool-touch handles.
Perfect for all your everyday cooking needs.`,
        tagline: 'PFOA-Free Non-Stick • Induction Compatible',
        price: 3200,
        originalPrice: 4800,
        discount: 33,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1585664811087-47f65abbad64?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.home,
        stock: 35,
        status: 'active',
        visibility: 'visible',
        tags: ['cookware', 'kitchen', 'non-stick', 'stainless steel', 'pot', 'pan', 'home'],
        colors: ['Silver', 'Black'],
        rating: 4.8,
        reviewCount: 61,
        totalSold: 178,
        viewCount: 1800,
        likeCount: 145,
        deliveryInfo: 'Delivery within 4-6 working days. Extra packaging for fragile items.',
        paymentInfo: 'bKash, Nagad, Rocket, VISA, Mastercard, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 6. Home & Lifestyle ─────────────────────────────────
    {
        name: 'LED Fairy String Lights 10M — 100 Bulbs Warm White Indoor Outdoor Decor',
        slug: 'led-fairy-string-lights-10m-warmwhite-' + (Date.now() + 5),
        sku: 'SKU-LGHT-006-' + Date.now(),
        description: `Beautiful 10-meter LED fairy string lights with 100 warm white bulbs.
8 lighting modes — steady, twinkle, flash, slow fade and more.
Low energy consumption. Safe low-voltage DC power.
Waterproof (IP44) — suitable for indoor and outdoor use.
Perfect for bedroom decoration, wedding, party, Eid decoration.`,
        tagline: '10M • 100 LED • 8 Modes • IP44 Waterproof',
        price: 350,
        originalPrice: 600,
        discount: 42,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.home,
        stock: 200,
        status: 'active',
        visibility: 'visible',
        tags: ['led', 'fairy lights', 'decoration', 'home', 'eid', 'party', 'bedroom'],
        colors: ['Warm White', 'Cool White', 'Multicolor'],
        rating: 4.6,
        reviewCount: 114,
        totalSold: 560,
        viewCount: 4200,
        likeCount: 310,
        deliveryInfo: 'Delivery within 3-5 working days across Bangladesh.',
        paymentInfo: 'bKash, Nagad, Rocket, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 7. Family, Kids & Daily Care ────────────────────────
    {
        name: 'Educational Building Blocks Set — 120 Piece STEM Toy for Kids Age 3+',
        slug: 'educational-building-blocks-120pc-stem-' + (Date.now() + 6),
        sku: 'SKU-BLOK-007-' + Date.now(),
        description: `120-piece colorful building blocks set designed to develop creativity and STEM skills.
BPA-free, non-toxic, child-safe ABS plastic material.
Compatible with all major brand bricks.
Develops spatial reasoning, fine motor skills and problem-solving.
Comes in a storage box for easy organization. Suitable for ages 3 and above.`,
        tagline: 'BPA-Free • 120 Pieces • STEM Learning',
        price: 650,
        originalPrice: 1000,
        discount: 35,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.family,
        stock: 90,
        status: 'active',
        visibility: 'visible',
        tags: ['toys', 'kids', 'building blocks', 'educational', 'stem', 'children'],
        colors: ['Multicolor'],
        sizes: ['120 Pieces'],
        rating: 4.7,
        reviewCount: 48,
        totalSold: 230,
        viewCount: 1600,
        likeCount: 175,
        deliveryInfo: 'Delivery within 3-5 working days across Bangladesh.',
        paymentInfo: 'bKash, Nagad, Rocket, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 8. Family, Kids & Daily Care ────────────────────────
    {
        name: "Baby Soft Plush Teddy Bear — 30cm Stuffed Toy Newborn Gift",
        slug: 'baby-soft-plush-teddy-bear-30cm-' + (Date.now() + 7),
        sku: 'SKU-BEAR-008-' + Date.now(),
        description: `Ultra-soft plush teddy bear perfect as a newborn or baby gift.
30cm height, made from premium hypoallergenic PP cotton filling.
Machine washable. Passed EN71 safety standard.
Super soft fabric that's gentle on baby's delicate skin.
Available in classic brown, white and pink.`,
        tagline: 'Hypoallergenic • EN71 Safe • Machine Washable',
        price: 420,
        originalPrice: 700,
        discount: 40,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1559715745-e1b33a271c8f?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1559715745-e1b33a271c8f?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.family,
        stock: 120,
        status: 'active',
        visibility: 'visible',
        tags: ['teddy bear', 'baby', 'plush', 'gift', 'newborn', 'toy', 'soft'],
        colors: ['Brown', 'White', 'Pink'],
        sizes: ['30cm'],
        rating: 4.9,
        reviewCount: 87,
        totalSold: 410,
        viewCount: 2900,
        likeCount: 295,
        deliveryInfo: 'Delivery within 3-5 working days. Gift wrapping available.',
        paymentInfo: 'bKash, Nagad, Rocket, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 9. Industrial & Manufacturing ───────────────────────
    {
        name: 'Industrial Safety Helmet — HDPE Construction Hard Hat ABS CE Certified',
        slug: 'industrial-safety-helmet-hdpe-ce-' + (Date.now() + 8),
        sku: 'SKU-HELM-009-' + Date.now(),
        description: `CE certified industrial safety helmet made from high-density polyethylene (HDPE).
Adjustable ratchet suspension system for comfortable fit (54-62cm head size).
Provides protection from falling objects, bumps and electric shock.
Ventilated design for all-day comfort. UV resistant outer shell.
Meets EN 397 safety standard. Ideal for construction, factory and industrial use.`,
        tagline: 'CE Certified • EN 397 • ABS Hard Shell',
        price: 480,
        originalPrice: 700,
        discount: 31,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1618090584126-129cd1f3fbae?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1618090584126-129cd1f3fbae?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.industrial,
        stock: 300,
        status: 'active',
        visibility: 'visible',
        tags: ['safety helmet', 'hard hat', 'construction', 'industrial', 'ce certified', 'ppe'],
        colors: ['Yellow', 'White', 'Blue', 'Orange', 'Red'],
        rating: 4.5,
        reviewCount: 29,
        totalSold: 95,
        viewCount: 780,
        likeCount: 42,
        deliveryInfo: 'Bulk orders (10+) get free delivery. Regular delivery 3-5 days.',
        paymentInfo: 'Bank transfer, bKash, Nagad, Cash on Delivery. Bulk invoice available.',
        createdAt: now,
        updatedAt: now,
    },

    // ── 10. Agriculture & Food Industry ─────────────────────
    {
        name: 'Drip Irrigation Kit — 50 Plant Garden Watering System Adjustable Nozzle',
        slug: 'drip-irrigation-kit-50plant-garden-' + (Date.now() + 9),
        sku: 'SKU-DRIP-010-' + Date.now(),
        description: `Complete drip irrigation system for up to 50 plants.
Includes: 15m main hose, 50 drip emitters, connectors, stakes, and filter.
Adjustable flow nozzles — control water per plant. Saves up to 70% water vs. hand watering.
UV-resistant PVC tubing. Easy DIY installation — no tools needed.
Perfect for vegetable gardens, flower beds, greenhouses and rooftop gardens.`,
        tagline: 'Saves 70% Water • 50 Plants • Easy DIY Setup',
        price: 950,
        originalPrice: 1500,
        discount: 37,
        priceType: 'fixed',
        productType: 'simple',
        thumbnail: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&auto=format&fit=crop',
        images: [
            'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=800&auto=format&fit=crop',
        ],
        category: CATEGORY_IDS.agriculture,
        stock: 75,
        status: 'active',
        visibility: 'visible',
        tags: ['irrigation', 'drip', 'garden', 'farming', 'agriculture', 'watering'],
        colors: ['Black', 'Green'],
        rating: 4.6,
        reviewCount: 33,
        totalSold: 88,
        viewCount: 950,
        likeCount: 67,
        deliveryInfo: 'Delivery within 4-6 working days. Bulk orders available.',
        paymentInfo: 'bKash, Nagad, Rocket, Bank Transfer, Cash on Delivery.',
        createdAt: now,
        updatedAt: now,
    },

];

// ── Main ──────────────────────────────────────────────────────────
async function seedProducts() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await client.connect();
        console.log('✅ MongoDB connected');

        const db = client.db(process.env.DB_NAME || 'shohozkitchen');
        const collection = db.collection('products');

        console.log(`\n📦 Inserting ${PRODUCTS.length} products...\n`);

        for (const product of PRODUCTS) {
            const result = await collection.insertOne(product);
            console.log(`  ✅ ${product.name.slice(0, 55)}... → ${result.insertedId}`);
        }

        const total = await collection.countDocuments();
        console.log(`\n🎉 Done! Total products in DB: ${total}`);

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.close();
        console.log('🔌 Connection closed.');
    }
}

seedProducts();
