import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_URL = process.env.DATABASE_URL!;

// Sub-schemas
const warrantySchema = new mongoose.Schema({
    hasWarranty: { type: Boolean, default: false },
    duration: { type: Number, default: 0 },
    durationUnit: { type: String, default: 'months' },
    type: { type: String, default: '' },
}, { _id: false });

const shippingConfigSchema = new mongoose.Schema({
    freeShipping: { type: Boolean, default: false },
    shippingCost: { type: Number, default: 0 },
    estimatedDays: { type: Number, default: 3 },
}, { _id: false });

const specSchema = new mongoose.Schema({
    key: String, value: String,
}, { _id: false });

// Inline schema for seeding
const productSchema = new mongoose.Schema({
    name: String, slug: String, sku: String, description: String, shortDescription: String,
    tagline: String, priceType: String,
    price: Number, originalPrice: Number, costPrice: Number, discount: Number,
    thumbnail: String, images: [String],
    category: mongoose.Schema.Types.ObjectId, subcategory: { type: mongoose.Schema.Types.ObjectId, default: null },
    brand: String, stock: Number, unit: { type: String, default: 'piece' },
    lowStockThreshold: { type: Number, default: 5 },
    status: { type: String, default: 'active' },
    visibility: { type: String, default: 'visible' },
    isFeatured: Boolean, isNewProduct: { type: Boolean, default: true },
    isOnSale: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    tags: [String], colors: [String], colorHex: [String],
    sizes: [String], weights: [String],
    material: [String], pattern: String, gender: String, aiLabels: [String],
    specifications: [specSchema],
    highlights: [String],
    weight: Number,
    dimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
    },
    shippingConfig: { type: shippingConfigSchema, default: () => ({}) },
    warranty: { type: warrantySchema, default: () => ({}) },
    metaTitle: String, metaDescription: String, metaKeywords: [String],
    rating: { type: Number, default: 0 }, reviewCount: { type: Number, default: 0 },
    totalSold: { type: Number, default: 0 }, viewCount: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0 },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

const categorySchema = new mongoose.Schema({
    name: String, slug: String, icon: String, image: String,
    parent: { type: mongoose.Schema.Types.ObjectId, default: null },
    level: { type: Number, default: 0 }, order: Number,
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    productCount: { type: Number, default: 0 },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

// ── Category IDs (from existing DB) ─────────────────────
const CATEGORIES = {
    FASHION: '69afbf05f083c53090a6e4bd',
    ELECTRONICS: '69afbf05f083c53090a6e4be',
    HOME_LIVING: '69afbf05f083c53090a6e4c1',
};

async function seed() {
    await mongoose.connect(DB_URL);
    console.log('✅ MongoDB Connected');

    // ── Check if "Industrial & Machinery" category exists, create if not ──
    let industrialCat = await Category.findOne({ slug: 'industrial-machinery' });
    if (!industrialCat) {
        industrialCat = await Category.create({
            name: 'Industrial & Machinery',
            slug: 'industrial-machinery',
            icon: '🏭',
            image: '/products/product 01/0d9a8e30-64aa-4527-8d3b-de8402282670.jpg',
            level: 0,
            order: 7,
            isActive: true,
            productCount: 0,
        });
        console.log('✅ Created "Industrial & Machinery" category:', industrialCat._id);
    } else {
        console.log('ℹ️  "Industrial & Machinery" category already exists:', industrialCat._id);
    }

    // ── Product 01: 250L Piston Type Industrial Air Compressor ──────────
    const product01 = {
        name: '250L Piston Type Industrial Air Cooled Compressor',
        slug: '250l-piston-type-industrial-air-cooled-compressor-' + Date.now(),
        sku: 'IND-' + Date.now() + '-001',
        description: `This piston type air compressor adopts mature and stable reciprocating compression technology, has the characteristics of simple structure, convenient maintenance, economic and durable, suitable for small and medium-sized factories, automobile maintenance, woodworking processing, pneumatic equipment and other scenarios.

The core specifications are: 7.5KW motor power, exhaust capacity 900L/min (0.9m³/min), exhaust pressure 8bar (0.8MPa), speed 1060rpm, equipped with 250L large capacity gas storage tank, can stably supply compressed air, meet the needs of all kinds of pneumatic tools, small production lines and intermittent high load operation.

This 7.5KW piston air compressor with high cost performance, stability and reliability, simple maintenance and other advantages, become an ideal choice for small and medium-sized enterprises and individual businesses, help improve work efficiency, reduce operating costs!

Core Advantages:
1. Efficient and stable power output - Industrial grade crankshaft connecting rod mechanism, with high wear resistance piston ring, to ensure high compression efficiency, stable operation, suitable for long time intermittent work. 1060rpm optimizes the speed to reduce mechanical wear and prolong service life.
2. Large capacity gas storage tank, more stable air pressure - The 250L gas storage tank effectively reduces the frequent start and stop of the compressor and provides continuous and stable air output.
3. Energy saving, economical and practical - 7.5KW low power design, automatic start-stop control, avoid no-load power consumption.
4. Strong and durable, easy to maintain - Cast iron cylinder + reinforced crankshaft, strong load resistance, suitable for high pressure conditions.

Application Scenarios:
✔ Auto repair shop: tire inflation, sheet metal repair, pneumatic wrench
✔ Small manufacturing: CNC, packaging equipment, inkjet printer
✔ Woodworking & spraying: nail gun, spray gun
✔ Agriculture & breeding: feed delivery, spray disinfection

Security Features:
- Double protection of pressure switch and safety valve
- Pressure gauge + temperature monitoring
- Low noise design (≤75dB)`,
        shortDescription: '7.5KW Industrial piston air compressor with 250L tank, 900L/min exhaust, 8bar pressure. Ideal for factories, auto repair, and manufacturing.',
        tagline: 'Industrial grade performance at unbeatable price',
        priceType: 'negotiable',
        price: 85000,
        originalPrice: 120000,
        costPrice: 65000,
        discount: 29,
        thumbnail: '/products/product 01/0d9a8e30-64aa-4527-8d3b-de8402282670.jpg',
        images: [
            '/products/product 01/0d9a8e30-64aa-4527-8d3b-de8402282670.jpg',
            '/products/product 01/41c15f50-2472-4a19-a9b9-0c1a73193bef.jpg',
            '/products/product 01/4334b9b9-19d7-4d9b-b735-3742ba654e0d.jpg',
            '/products/product 01/547dd547-5bda-45dd-b4cb-61cdf49009d3.jpg',
            '/products/product 01/d22f009d-f3f2-42d9-9198-c28d2262bcdb.jpg',
            '/products/product 01/e4f9f19a-f627-4830-8a6b-f037258bdfd5.jpg',
        ],
        category: new mongoose.Types.ObjectId(industrialCat._id as string),
        brand: 'Lishan Group',
        stock: 25,
        lowStockThreshold: 3,
        unit: 'piece',
        status: 'active',
        visibility: 'visible',
        isFeatured: true,
        isNewProduct: true,
        isOnSale: true,
        tags: ['air compressor', 'industrial compressor', 'piston compressor', '250L', '7.5KW', 'factory equipment', 'auto repair', 'pneumatic tools', 'manufacturing'],
        colors: ['blue'],
        colorHex: ['#2563EB'],
        material: ['cast iron', 'carbon steel'],
        pattern: 'solid',
        gender: '',
        aiLabels: ['air compressor', 'industrial equipment', 'machinery', 'compressor', 'factory equipment'],
        specifications: [
            { key: 'Model', value: '7.5KW Air Compressor 2026' },
            { key: 'Motor (KW/HP)', value: '7.5 / 10' },
            { key: 'Piston Displacement', value: '1517 L/min' },
            { key: 'Exhaust Volume', value: '900 L/min' },
            { key: 'Exhaust Pressure', value: '8 Bar (0.8 MPa)' },
            { key: 'Cylinder', value: '90mm × 3 pieces' },
            { key: 'Stroke', value: '75mm' },
            { key: 'RPM', value: '1060 rpm' },
            { key: 'Tank Volume', value: '250 Litres' },
            { key: 'Dimensions (L×W×H)', value: '165 × 51 × 117 cm' },
            { key: 'Net Weight', value: '268 Kg' },
            { key: 'Gross Weight', value: '306 Kg' },
            { key: 'Noise Level', value: '≤75 dB' },
        ],
        highlights: [
            'Industrial grade 7.5KW motor with 1060rpm optimized speed',
            '250L large capacity gas storage tank',
            'Automatic start-stop control for energy saving',
            'Cast iron cylinder + reinforced crankshaft',
            'Low noise design (≤75dB)',
            'Double protection (pressure switch + safety valve)',
        ],
        weight: 268000, // grams
        dimensions: { length: 165, width: 51, height: 117 },
        shippingConfig: { freeShipping: false, shippingCost: 3000, estimatedDays: 7 },
        warranty: { hasWarranty: true, duration: 12, durationUnit: 'months', type: 'manufacturer' },
        metaTitle: '250L Industrial Air Compressor - 7.5KW Piston Type | Lishan Group',
        metaDescription: 'Buy 250L industrial air cooled piston compressor. 7.5KW motor, 900L/min exhaust, 8bar pressure. Ideal for factories, auto repair shops, and manufacturing.',
        metaKeywords: ['air compressor', 'industrial compressor', 'piston compressor', '250L', '7.5KW', 'Lishan'],
        rating: 4.6,
        reviewCount: 18,
        totalSold: 45,
        viewCount: 230,
    };

    // ── Product 02: Gucci × Puma T-Shirt ────────────────────────────────
    const product02 = {
        name: 'Gucci × Puma Premium Cotton T-Shirt',
        slug: 'gucci-puma-premium-cotton-t-shirt-' + Date.now(),
        sku: 'FSH-' + Date.now() + '-002',
        description: `Premium quality Gucci × Puma collaboration T-shirt crafted from 100% breathable combed cotton. This exclusive collaboration features the iconic Gucci "GG" interlocking logo on the left chest and the Puma leaping cat logo on the right, creating a unique fusion of luxury fashion and sportswear.

Key Features:
• Premium combed cotton fabric for superior softness and breathability
• Round neck design with ribbed collar for durability
• Short sleeves with a relaxed, comfortable fit
• Signature red Puma tag on the sleeve
• High-quality screen print that stays vibrant after multiple washes
• Machine washable and colorfast

Available in 8 stunning colors: Sky Blue, Maroon, Steel Grey, Royal Blue, Mustard Yellow, Baby Pink, Orange, and Black. Each color variant features carefully matched logo prints — light colors with dark logos and dark colors with gold/light logos for maximum visual impact.

Perfect for casual outings, street style, gym sessions, or everyday wear. This T-shirt combines luxury branding with athletic comfort, making it a versatile addition to any wardrobe.`,
        shortDescription: 'Exclusive Gucci × Puma collaboration T-shirt in premium combed cotton. Available in 8 vibrant colors with signature dual-brand logos.',
        tagline: 'Luxury meets sportswear — exclusive collaboration tee',
        priceType: 'fixed',
        price: 1200,
        originalPrice: 1800,
        costPrice: 500,
        discount: 33,
        thumbnail: '/products/product 02/0238beb5-c858-463e-8f7a-7bef4f0c3255.jpg',
        images: [
            '/products/product 02/0238beb5-c858-463e-8f7a-7bef4f0c3255.jpg',
            '/products/product 02/1ea795c6-a285-432b-8087-49313727d9fd.jpg',
            '/products/product 02/3342b4f0-8b0c-4b1d-9be0-b318177a0335.jpg',
            '/products/product 02/93594db0-73fa-454d-83df-88b4ebfbe392.jpg',
            '/products/product 02/9e850f2f-75a6-4c42-8d32-0498644599df.jpg',
            '/products/product 02/a3be5502-ea56-4acb-a126-e9514b129198.jpg',
            '/products/product 02/dccaa853-d212-48d5-a9a4-f36b7b710bcb.jpg',
            '/products/product 02/de742895-6317-4d1a-9ae8-3052c65e793e.jpg',
            '/products/product 02/fcd8c235-3b0b-4113-a3af-da253787d1dc.jpg',
        ],
        category: new mongoose.Types.ObjectId(CATEGORIES.FASHION),
        brand: 'Gucci × Puma',
        stock: 500,
        lowStockThreshold: 20,
        unit: 'piece',
        status: 'active',
        visibility: 'visible',
        isFeatured: true,
        isNewProduct: true,
        isOnSale: true,
        tags: ['t-shirt', 'gucci', 'puma', 'branded tee', 'cotton tee', 'men t-shirt', 'casual wear', 'collaboration', 'designer tee', 'streetwear', 'luxury'],
        colors: ['sky blue', 'maroon', 'grey', 'royal blue', 'mustard yellow', 'pink', 'orange', 'black'],
        colorHex: ['#87CEEB', '#800000', '#708090', '#4169E1', '#FFDB58', '#FFB6C1', '#FF8C00', '#1A1A1A'],
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        material: ['cotton'],
        pattern: 'graphic print',
        gender: 'unisex',
        aiLabels: ['t-shirt', 'clothing', 'casual wear', 'branded shirt', 'fashion', 'menswear', 'streetwear'],
        specifications: [
            { key: 'Material', value: '100% Premium Combed Cotton' },
            { key: 'Fit', value: 'Regular / Relaxed Fit' },
            { key: 'Neck', value: 'Round Neck (Ribbed Collar)' },
            { key: 'Sleeve', value: 'Short Sleeve' },
            { key: 'Print', value: 'Screen Print (Colorfast)' },
            { key: 'Brand', value: 'Gucci × Puma Collaboration' },
            { key: 'Available Sizes', value: 'S, M, L, XL, XXL' },
            { key: 'Care', value: 'Machine Washable' },
        ],
        highlights: [
            'Exclusive Gucci × Puma collaboration design',
            '100% premium combed cotton for supreme softness',
            'Available in 8 stunning color variants',
            'Colorfast screen print — stays vibrant after washes',
            'Sizes from S to XXL for all body types',
        ],
        weight: 200, // grams
        dimensions: { length: 30, width: 25, height: 3 },
        shippingConfig: { freeShipping: true, shippingCost: 0, estimatedDays: 3 },
        warranty: { hasWarranty: false, duration: 0, durationUnit: 'days', type: '' },
        metaTitle: 'Gucci × Puma Premium Cotton T-Shirt — 8 Colors Available',
        metaDescription: 'Buy exclusive Gucci × Puma collaboration T-shirt. Premium cotton, 8 color variants, sizes S-XXL. Free shipping!',
        metaKeywords: ['gucci puma tshirt', 't-shirt', 'branded tee', 'cotton tshirt', 'designer tee'],
        rating: 4.7,
        reviewCount: 86,
        totalSold: 340,
        viewCount: 1200,
    };

    // ── Insert both products ────────────────────────────────────────────
    const result = await Product.insertMany([product01, product02]);
    console.log(`\n✅ ${result.length} products inserted successfully!`);
    result.forEach(p => console.log(`  → ${p.name} (${p._id})`));

    // Update category product counts
    await Category.findByIdAndUpdate(industrialCat._id, { $inc: { productCount: 1 } });
    await Category.findByIdAndUpdate(CATEGORIES.FASHION, { $inc: { productCount: 1 } });
    console.log('✅ Category product counts updated');

    console.log('\n🎉 New products seeded successfully!');
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
