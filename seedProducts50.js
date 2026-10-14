require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

// ── 10 Categories ──────────────────────────────────────────
const CATEGORIES = [
  { name: "Women's Fashion",   slug: 'womens-fashion',   icon: '👗' },
  { name: "Men's Fashion",     slug: 'mens-fashion',     icon: '👔' },
  { name: 'Electronics',       slug: 'electronics',      icon: '📱' },
  { name: 'Home & Living',     slug: 'home-living',      icon: '🏠' },
  { name: 'Beauty & Care',     slug: 'beauty-care',      icon: '💄' },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors',  icon: '⚽' },
  { name: 'Toys & Kids',       slug: 'toys-kids',        icon: '🧸' },
  { name: 'Bags & Luggage',    slug: 'bags-luggage',     icon: '👜' },
  { name: 'Jewelry',           slug: 'jewelry',          icon: '💍' },
  { name: 'Accessories',       slug: 'accessories',      icon: '🎒' },
];

// ── 50 Products (5 per category) ─────────────────────────────
const PRODUCTS_DATA = [
  // Women's Fashion (5)
  { name: "Carefully Selected Right Shoulder U-Neck Short-Sleeved T-Shirt for Women", price: 452, originalPrice: 570, stock: 100, category: "Women's Fashion", thumbnail: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600", description: "Summer fashion versatile basic hot girl bottoming shirt, high-end inner top. Made from premium quality fabric.", tags: ["t-shirt","women","summer","fashion"] },
  { name: "Pure Cotton Short-Sleeved T-Shirt for Women 2025 New Popular Summer Design", price: 315, originalPrice: 400, stock: 80, category: "Women's Fashion", thumbnail: "https://images.unsplash.com/photo-1554568218-0f1715e72254?w=600", description: "2025 new popular summer design niche T-shirt, fashionable versatile top for women.", tags: ["cotton","t-shirt","women","summer"] },
  { name: "Women's Fine Wool Half-Turtleneck Pullover Slim-Fit Elegant Knit", price: 1081, originalPrice: 1300, stock: 50, category: "Women's Fashion", thumbnail: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600", description: "Slim-fit elegant thin five-point sleeve knit base layer. Premium wool material for comfort.", tags: ["knitwear","women","winter","elegant"] },
  { name: "Fashion Lace Patchwork Strap Camisole Versatile All Seasons", price: 218, originalPrice: 280, stock: 120, category: "Women's Fashion", thumbnail: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=600", description: "Sexy feminine slim sleeveless base layer, versatile for all seasons. Lace patchwork design.", tags: ["camisole","women","lace","sleeveless"] },
  { name: "2026 Summer New Style Heart-Shaped White Round Neck Short-Sleeve T-Shirt", price: 216, originalPrice: 300, stock: 150, category: "Women's Fashion", thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600", description: "Fashionable versatile loose design trendy tee for women. Heart-shaped print, summer collection.", tags: ["t-shirt","women","summer","trendy"] },

  // Men's Fashion (5)
  { name: "2025 Summer Fashion Knitted Bottoming Shirt Men's Turtleneck T-Shirt", price: 508, originalPrice: 650, stock: 75, category: "Men's Fashion", thumbnail: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600", description: "European and American men's turtleneck water ripple pure color T-shirt. Casual simple style.", tags: ["t-shirt","men","summer","fashion"] },
  { name: "220g Heavyweight Raglan Long Sleeve T-Shirt Men's American Contrast", price: 439, originalPrice: 550, stock: 60, category: "Men's Fashion", thumbnail: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600", description: "Spring and autumn American contrast stitching base shirt, loose crew neck sweater.", tags: ["t-shirt","men","raglan","cotton"] },
  { name: "Summer Ice Silk Sports Men's Five-Point Shorts Quick-Dry", price: 496, originalPrice: 620, stock: 90, category: "Men's Fashion", thumbnail: "https://images.unsplash.com/photo-1591195853828-11db59a44f43?w=600", description: "Large size breathable loose casual quick-dry shorts for men. Ice silk material for comfort.", tags: ["shorts","men","sports","summer"] },
  { name: "Cross-Border Laf Basic Cardigan Pony Embroidery Hooded Sweatshirt Unisex", price: 1147, originalPrice: 1400, stock: 45, category: "Men's Fashion", thumbnail: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=600", description: "Unisex zipper jacket with pony embroidery logo. Trendy cross-border exclusive supply.", tags: ["hoodie","unisex","zipper","trendy"] },
  { name: "Cross-border New Letter Printed Top Fashion Hooded Sweat Men's Casual", price: 276, originalPrice: 360, stock: 85, category: "Men's Fashion", thumbnail: "https://images.unsplash.com/photo-1565084888279-aca607bb6766?w=600", description: "Autumn and winter hooded sweat, all-match casual plus size loose fleece-lined.", tags: ["hoodie","men","printed","casual"] },

  // Electronics (5)
  { name: "Vitamin D3 50,000 IU + K2 MK-7 200mcg 240 Softgels Virgin Coconut Oil", price: 5493, originalPrice: 6500, stock: 30, category: "Electronics", thumbnail: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600", description: "2-in-1 health support supplement. Non-GMO, easy to swallow softgels.", tags: ["supplement","health","vitamin","organic"] },
  { name: "Smart Watch Fitness Tracker with Heart Rate Monitor", price: 3500, originalPrice: 4500, stock: 40, category: "Electronics", thumbnail: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600", description: "Advanced smart watch with fitness tracking, heart rate monitor, sleep tracking and notifications.", tags: ["smartwatch","fitness","gadget","wearable"] },
  { name: "Wireless Bluetooth Earbuds Noise Cancelling TWS", price: 2800, originalPrice: 3500, stock: 55, category: "Electronics", thumbnail: "https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600", description: "True wireless stereo earbuds with active noise cancellation. 30 hours battery life.", tags: ["earbuds","wireless","bluetooth","audio"] },
  { name: "Portable Power Bank 20000mAh Fast Charging", price: 1800, originalPrice: 2300, stock: 70, category: "Electronics", thumbnail: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600", description: "20000mAh high capacity power bank with fast charging support. Dual USB + Type-C ports.", tags: ["powerbank","charging","portable","gadget"] },
  { name: "USB-C Hub 7-in-1 Multiport Adapter for Laptop", price: 1500, originalPrice: 2000, stock: 65, category: "Electronics", thumbnail: "https://images.unsplash.com/photo-1625895197185-efcec01cffe0?w=600", description: "7-in-1 USB-C hub with HDMI, USB 3.0, SD card reader, and fast charging pass-through.", tags: ["usb-hub","laptop","adapter","gadget"] },

  // Home & Living (5)
  { name: "Cross-border Sofa Cover Elastic Full Cover All-Inclusive Non-Slip", price: 883, originalPrice: 1100, stock: 40, category: "Home & Living", thumbnail: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600", description: "Fabric sofa cushion combination sofa cover towel. Easy to wash and maintain.", tags: ["sofa","cover","home","living"] },
  { name: "Side-Opening Outdoor Camping Storage Box Wooden Lid Large Capacity", price: 750, originalPrice: 950, stock: 35, category: "Home & Living", thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600", description: "Side-opening folding box for camping and car storage. Large capacity design.", tags: ["storage","camping","outdoor","box"] },
  { name: "New French Wave Skirt Goblet Bowl Ceramic High-Value Candy Plate", price: 353, originalPrice: 450, stock: 60, category: "Home & Living", thumbnail: "https://images.unsplash.com/photo-1578500351865-d6c3706f46bc?w=600", description: "Artistic living room ornaments wholesale. Premium ceramic material.", tags: ["ceramic","decor","home","plate"] },
  { name: "Reptile Pet Breeding Box Ecological Landscaping Rainforest Tank", price: 794, originalPrice: 1000, stock: 25, category: "Home & Living", thumbnail: "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=600", description: "One-to-four spray atomization cooling nozzle for reptile pet breeding.", tags: ["pet","reptile","tank","home"] },
  { name: "Trimming Color Separation Paint Brush Wall Corner Inner Decoration", price: 121, originalPrice: 160, stock: 200, category: "Home & Living", thumbnail: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600", description: "Corner paint trimming tool for home decoration. Professional quality brush set.", tags: ["brush","paint","decoration","home"] },

  // Beauty & Care (5)
  { name: "Biotherm Aquapower Toning & Moisturizing Face Lotion for Men 6.8 Fl Oz", price: 6738, originalPrice: 8000, stock: 20, category: "Beauty & Care", thumbnail: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600", description: "With Biotech Plankton & Oligo Sugars. Prevents razor burn and skin redness.", tags: ["skincare","men","moisturizer","lotion"] },
  { name: "Ms. Gabriel's Perfume Modern COOC Lasting Fruity Light Fragrance", price: 194, originalPrice: 260, stock: 80, category: "Beauty & Care", thumbnail: "https://images.unsplash.com/photo-1541643600914-78b084683702?w=600", description: "Fresh perfume shake with fruity light fragrance. Long lasting scent for daily use.", tags: ["perfume","fragrance","beauty","women"] },
  { name: "Ribs Comb Women's Hair Root Fluffy Styling High Cranial Massage Comb", price: 63, originalPrice: 90, stock: 150, category: "Beauty & Care", thumbnail: "https://images.unsplash.com/photo-1522338140262-f46f5913618a?w=600", description: "Special hair comb for long hair curly hair massage. High cranial top artifact.", tags: ["comb","hair","beauty","women"] },
  { name: "Amazon Dual-Purpose Indentation Pen Graffiti Nail Art Silicone Dotting", price: 132, originalPrice: 180, stock: 100, category: "Beauty & Care", thumbnail: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600", description: "Pottery clay sculpting and repair tool. Multi-purpose beauty tool for nail art.", tags: ["nailart","beauty","tool","crafts"] },
  { name: "Biotherm Force Supreme Gel Anti-Aging Cream for Men 3.4 Fl Oz", price: 11275, originalPrice: 16775, stock: 15, category: "Beauty & Care", thumbnail: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600", description: "Revitalizing anti-aging gel cream with Pro-Xylane and Blue Algae for firmer skin.", tags: ["skincare","men","anti-aging","cream"] },

  // Sports & Outdoors (5)
  { name: "Recovery Ring Winch Rope Snatch Recovery Ring Tow Hook Rescue", price: 525, originalPrice: 680, stock: 50, category: "Sports & Outdoors", thumbnail: "https://images.unsplash.com/photo-1558618047-f4e70e075f04?w=600", description: "Professional tow rope rescue equipment for off-road recovery. Heavy duty material.", tags: ["recovery","offroad","sports","outdoor"] },
  { name: "Wholesale Sports Thigh Protection Diving Material Leg Sleeve Basketball", price: 331, originalPrice: 420, stock: 90, category: "Sports & Outdoors", thumbnail: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600", description: "Mountaineering basketball football riding fixed anti-muscle strain protective gear.", tags: ["protection","sports","basketball","fitness"] },
  { name: "High-End Fashionable Sports Casual Sweatshirt Suit Wide-Leg Pants Set", price: 585, originalPrice: 750, stock: 45, category: "Sports & Outdoors", thumbnail: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600", description: "Autumn 2026 new tall wide-leg pants two-piece set. Trendy sports casual wear.", tags: ["sweatshirt","sports","set","women"] },
  { name: "Outdoor Camping Folding Chair Portable Lightweight Fishing Stool", price: 950, originalPrice: 1200, stock: 35, category: "Sports & Outdoors", thumbnail: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600", description: "Ultra-lightweight portable folding chair for camping, hiking and fishing activities.", tags: ["camping","chair","outdoor","portable"] },
  { name: "Fitness Resistance Bands Set Exercise Loop Bands Yoga Workout", price: 420, originalPrice: 550, stock: 110, category: "Sports & Outdoors", thumbnail: "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600", description: "Premium resistance bands for home gym workout, yoga and physical therapy exercise.", tags: ["fitness","yoga","workout","bands"] },

  // Toys & Kids (5)
  { name: "Only Music Carousel Music Box Mini Particle Assembly Building Blocks Girl", price: 839, originalPrice: 1050, stock: 30, category: "Toys & Kids", thumbnail: "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=600", description: "Creative 3001-3002 carousel music box mini particle assembly building blocks.", tags: ["toys","music","building","girls"] },
  { name: "Colorful Mermaid Doll Girl Toy Princess Children's Birthday Gift", price: 291, originalPrice: 380, stock: 60, category: "Toys & Kids", thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600", description: "Children's birthday gift doll for play at home. Colorful mermaid princess design.", tags: ["doll","girls","toy","princess"] },
  { name: "Children's Dance Clothing Yellow Pure Cotton Girls Ballet Dress Summer", price: 839, originalPrice: 1050, stock: 40, category: "Toys & Kids", thumbnail: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600", description: "Exam-grade one-piece ballet dress. Summer short-sleeve dance wear for girls.", tags: ["dance","girls","ballet","dress"] },
  { name: "Factory Direct Space Toys Sand Mold Ocean Castle Plasticine Color Mud", price: 12, originalPrice: 20, stock: 200, category: "Toys & Kids", thumbnail: "https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600", description: "Sand mold accessories for space, ocean and castle. Educational toy set.", tags: ["toys","clay","kids","educational"] },
  { name: "Red Clothes Instructor Mini Simulation Red Bird Christmas Tree Decoration", price: 36, originalPrice: 55, stock: 180, category: "Toys & Kids", thumbnail: "https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=600", description: "Christmas garland decoration red bird clip 6cm bird with feet. Festive ornament.", tags: ["christmas","decoration","toy","ornament"] },

  // Bags & Luggage (5)
  { name: "Cross-Border Hot-Selling Travel Underwear Storage Bag 600D Oxford Cloth", price: 813, originalPrice: 1020, stock: 70, category: "Bags & Luggage", thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", description: "Wool dust-proof storage bag. Multiple colors available. 600D Oxford cloth material.", tags: ["bag","travel","storage","luggage"] },
  { name: "Premium Waterproof Backpack for Men Women Laptop School Bag", price: 1800, originalPrice: 2400, stock: 55, category: "Bags & Luggage", thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", description: "Waterproof travel backpack with USB charging port. Fits 15.6 inch laptop.", tags: ["backpack","laptop","school","waterproof"] },
  { name: "Women's Genuine Leather Handbag Crossbody Shoulder Bag Luxury", price: 2500, originalPrice: 3200, stock: 30, category: "Bags & Luggage", thumbnail: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600", description: "Premium genuine leather handbag with multiple compartments. Elegant luxury design.", tags: ["handbag","leather","women","luxury"] },
  { name: "Men's Business Briefcase Waterproof Laptop Bag Office", price: 2200, originalPrice: 2800, stock: 40, category: "Bags & Luggage", thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", description: "Professional business briefcase with USB charging port. Fits 15.6 inch laptop.", tags: ["briefcase","men","laptop","office"] },
  { name: "Foldable Travel Duffle Bag Lightweight Waterproof Weekend Bag", price: 950, originalPrice: 1300, stock: 80, category: "Bags & Luggage", thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", description: "Lightweight foldable travel bag, ideal for weekend trips. Waterproof and durable.", tags: ["duffle","travel","foldable","weekend"] },

  // Jewelry (5)
  { name: "Cross-border Zircon Diamond Four-Claw Twist Diamond Set Ring Light Luxury", price: 130, originalPrice: 200, stock: 100, category: "Jewelry", thumbnail: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600", description: "Simple personality light luxury high style ring. Zircon diamond European and American style.", tags: ["ring","jewelry","zircon","luxury"] },
  { name: "Cross-border Tanjiro Ghost Extinguishing Blade Earrings Anime Ornaments", price: 42, originalPrice: 70, stock: 200, category: "Jewelry", thumbnail: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600", description: "Japanese cartoon ghost extinguishing blade earrings. Creative women's ornaments.", tags: ["earrings","anime","jewelry","accessories"] },
  { name: "Gold Plated Chain Necklace Women Minimalist Pendant Jewelry", price: 380, originalPrice: 500, stock: 90, category: "Jewelry", thumbnail: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600", description: "Elegant minimalist gold plated chain necklace with pendant. Perfect gift for women.", tags: ["necklace","gold","jewelry","pendant"] },
  { name: "Sterling Silver Bracelet Women Crystal Charm Fashion Jewelry", price: 550, originalPrice: 720, stock: 75, category: "Jewelry", thumbnail: "https://images.unsplash.com/photo-1573408301185-9519f94815e4?w=600", description: "925 sterling silver bracelet with crystal charms. Fashionable jewelry for women.", tags: ["bracelet","silver","crystal","women"] },
  { name: "Pearl Drop Earrings Elegant Wedding Bridal Jewelry Set", price: 750, originalPrice: 980, stock: 55, category: "Jewelry", thumbnail: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600", description: "Elegant pearl drop earrings for wedding and special occasions. Bridal jewelry set.", tags: ["earrings","pearl","bridal","wedding"] },

  // Accessories (5)
  { name: "Imitation Wood 3D Elephant Keychain Pendant Resin Cross-Border Hot", price: 11, originalPrice: 20, stock: 500, category: "Accessories", thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600", description: "Cross-border hot selling baby elephant keychain pendant. Resin material.", tags: ["keychain","elephant","accessories","pendant"] },
  { name: "Cross-border Wholesale Silver Laser Five-Pointed Star Sticker Waterproof", price: 77, originalPrice: 110, stock: 300, category: "Accessories", thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600", description: "Reflective gift decoration sticker. Waterproof and durable material.", tags: ["sticker","accessories","decor","star"] },
  { name: "Match Phosphorus Sheet DIY Self-Adhesive Large Dot Phosphorus Sheet", price: 88, originalPrice: 130, stock: 250, category: "Accessories", thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600", description: "Match skin wiping fire paper self-adhesive phosphorus sheet for DIY projects.", tags: ["diy","accessories","crafts","match"] },
  { name: "Premium Leather Card Holder Slim Wallet Men Women RFID Blocking", price: 650, originalPrice: 850, stock: 120, category: "Accessories", thumbnail: "https://images.unsplash.com/photo-1624913503273-5f9c4e980dba?w=600", description: "Ultra-slim RFID blocking card holder wallet. Genuine leather, fits 6-8 cards.", tags: ["wallet","cardholder","leather","rfid"] },
  { name: "Stylish Sunglasses UV400 Protection Polarized Men Women Fashion", price: 480, originalPrice: 650, stock: 95, category: "Accessories", thumbnail: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600", description: "Polarized UV400 protection sunglasses. Fashionable design for men and women.", tags: ["sunglasses","uv","fashion","accessories"] },
];

// ── Helper ────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const client = new MongoClient(DATABASE_URL);
  await client.connect();
  console.log('✅ MongoDB Connected\n');
  const db = client.db(process.env.DB_NAME || 'shohozkitchen');

  // ── Step 1: Create/Get Categories ────────────────────────────
  console.log('📁 Categories তৈরি হচ্ছে...');
  const catMap = {};
  for (const cat of CATEGORIES) {
    let existing = await db.collection('categories').findOne({ slug: cat.slug });
    if (!existing) {
      const res = await db.collection('categories').insertOne({
        ...cat, description: '', image: '', banner: '', parent: null,
        level: 0, order: 0, isActive: true, isFeatured: false,
        showInMenu: true, showInHome: true, isDeleted: false,
        productCount: 0, metaTitle: '', metaDescription: '',
        createdAt: new Date(), updatedAt: new Date(),
      });
      catMap[cat.name] = res.insertedId;
      console.log(`  ✅ Created: ${cat.name}`);
    } else {
      catMap[cat.name] = existing._id;
      console.log(`  ♻️  Exists:  ${cat.name}`);
    }
  }

  // ── Step 2: Upload 50 Products in Batches of 5 ───────────────
  console.log('\n🚀 Products upload হচ্ছে (5টা করে batch)...\n');
  const total = PRODUCTS_DATA.length;
  let uploaded = 0;

  for (let i = 0; i < total; i += 5) {
    const batch = PRODUCTS_DATA.slice(i, i + 5);
    const batchNum = Math.floor(i / 5) + 1;
    console.log(`📦 Batch ${batchNum}/10 — ${batch.map(p => p.category).join(', ')}`);

    const docs = batch.map(p => {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now() + Math.floor(Math.random()*1000);
      const discount = p.originalPrice ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
      return {
        name: p.name,
        slug,
        sku: 'SKU-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
        description: p.description,
        tagline: 'Lower price than others but quality higher',
        priceType: 'negotiable',
        productType: 'simple',
        price: p.price,
        originalPrice: p.originalPrice || null,
        discount,
        thumbnail: p.thumbnail,
        images: [p.thumbnail],
        category: catMap[p.category],
        variants: [],
        stock: p.stock,
        status: 'active',
        visibility: 'visible',
        isDeleted: false,
        tags: p.tags || [],
        colors: [], colorHex: [], sizes: [], aiLabels: [],
        deliveryInfo: 'ঢাকার ভেতরে ১-২ দিন, ঢাকার বাইরে ৩-৫ দিনের মধ্যে ডেলিভারি দেওয়া হয়।',
        paymentInfo: 'বিকাশ, নগদ, রকেট ও ক্যাশ অন ডেলিভারি সমর্থিত।',
        termsInfo: 'পণ্য পেয়ে সমস্যা হলে ৩ দিনের মধ্যে যোগাযোগ করুন।',
        rating: parseFloat((4 + Math.random()).toFixed(1)),
        reviewCount: Math.floor(Math.random() * 500),
        totalSold: Math.floor(Math.random() * 5000),
        viewCount: Math.floor(Math.random() * 10000),
        likeCount: 0, commentCount: 0, shareCount: 0, wishlistCount: 0,
        createdAt: new Date(), updatedAt: new Date(),
      };
    });

    await db.collection('products').insertMany(docs);
    uploaded += batch.length;
    console.log(`  ✅ ${uploaded}/${total} products uploaded\n`);
    await sleep(300); // ছোট pause
  }

  // ── Step 3: Update Category productCount ─────────────────────
  console.log('🔄 Category product count update হচ্ছে...');
  for (const [name, id] of Object.entries(catMap)) {
    const count = await db.collection('products').countDocuments({ category: id });
    await db.collection('categories').updateOne({ _id: id }, { $set: { productCount: count } });
    console.log(`  📊 ${name}: ${count} products`);
  }

  console.log('\n🎉 সম্পন্ন! মোট 50টা product সফলভাবে upload হয়েছে!');
  await client.close();
}

run().catch(console.error);
