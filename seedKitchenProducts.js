require('dotenv').config();
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shohozkitchen';

const productSchema = new mongoose.Schema({
    name: String, slug: String, sku: String, description: String, tagline: String,
    priceType: String, productType: String, price: Number, originalPrice: Number, discount: Number,
    thumbnail: String, images: [String], category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    variants: [], stock: Number, status: String, visibility: String, isDeleted: Boolean,
    isFeatured: Boolean, isNewProduct: Boolean, isOnSale: Boolean,
    tags: [String], colors: [String], colorHex: [String], sizes: [String], aiLabels: [String],
    brand: String, material: [String], weight: String,
    rating: Number, reviewCount: Number, totalSold: Number, viewCount: Number,
    likeCount: Number, commentCount: Number, shareCount: Number,
    warranty: { type: mongoose.Schema.Types.Mixed },
    shippingConfig: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', new mongoose.Schema({ name: String }));

async function seed() {
    try {
        await mongoose.connect(DATABASE_URL);
        console.log('Connected to MongoDB');

        const cats = await Category.find({});
        const catMap = {};
        cats.forEach(c => { catMap[c.name] = c._id; });
        console.log('Found categories:', Object.keys(catMap).join(', '));

        const c = {
            cookware:    catMap['Cookware'],
            appliances:  catMap['Appliances'],
            tools:       catMap['Kitchen Tools'],
            storage:     catMap['Food Storage'],
            drinkware:   catMap['Drinkware'],
            cutlery:     catMap['Cutlery'],
            dinnerware:  catMap['Dinnerware'],
            bakeware:    catMap['Bakeware'],
        };
        const fallback = Object.values(catMap)[0];
        console.log('Category mapping ready');

        const products = [
            {
                name: 'Nonstick Frying Pan 26cm',
                description: 'প্রিমিয়াম কোয়ালিটি নন-স্টিক ফ্রাইং প্যান। মার্বেল কোটিং, হিট-রেজিস্ট্যান্ট হ্যান্ডেল এবং ইভেন হিট ডিস্ট্রিবিউশন। ভাজা-পোড়া থেকে শুরু করে ডিমের অমলেট — সব কিছুর জন্য পারফেক্ট। কম তেলে স্বাস্থ্যকর রান্না করুন।',
                tagline: 'কম তেলে স্বাস্থ্যকর রান্না',
                price: 850,
                originalPrice: 1200,
                thumbnail: 'https://images.unsplash.com/photo-1592154395688-eb3e21fdddf0?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1592154395688-eb3e21fdddf0?w=800&q=80',
                    'https://images.unsplash.com/photo-1574181613601-005a24609c0b?w=800&q=80',
                    'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80'
                ],
                category: c.cookware || fallback,
                tags: ['frying pan', 'nonstick', 'cookware', 'kitchen'],
                brand: 'Kitchen Master',
                material: ['Aluminium', 'Marble Coating'],
                weight: '750 g',
                stock: 50,
                rating: 4.5, reviewCount: 128, totalSold: 340, viewCount: 4200,
                isFeatured: true,
                warranty: { hasWarranty: true, duration: 6, durationUnit: 'months', type: 'manufacturer' },
                shippingConfig: { freeShipping: false, shippingCost: 60, estimatedDays: 3 },
            },
            {
                name: 'Stainless Steel Pressure Cooker 5L',
                description: 'হাই-গ্রেড স্টেইনলেস স্টিল প্রেশার কুকার। ৫ লিটার ক্যাপাসিটি, সেফটি লক সিস্টেম এবং ডিউয়াল প্রেশার সেটিংস। মাংস, ডাল, বিরিয়ানি — সব দ্রুত আর পারফেক্ট রান্না হবে। গ্যাস ও ইন্ডাকশন দুটোতেই চলে।',
                tagline: 'দ্রুত ও নিরাপদ রান্না',
                price: 2200,
                originalPrice: 2800,
                thumbnail: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80',
                    'https://images.unsplash.com/photo-1584990347449-a8ee2f3a2a88?w=800&q=80',
                    'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80'
                ],
                category: c.cookware || fallback,
                tags: ['pressure cooker', 'stainless steel', 'cookware', 'kitchen'],
                brand: 'HomePro',
                material: ['Stainless Steel'],
                weight: '2.5 kg',
                stock: 35,
                rating: 4.7, reviewCount: 215, totalSold: 560, viewCount: 6800,
                isFeatured: true,
                warranty: { hasWarranty: true, duration: 1, durationUnit: 'years', type: 'manufacturer' },
                shippingConfig: { freeShipping: true, shippingCost: 0, estimatedDays: 3 },
            },
            {
                name: 'Electric Kettle 1.8L Auto Shut-off',
                description: 'দ্রুত ফুটানোর জন্য ১৫০০ ওয়াট পাওয়ারফুল ইলেকট্রিক কেটলি। ১.৮ লিটার ক্যাপাসিটি, অটো শাট-অফ, বয়েল-ড্রাই প্রোটেকশন এবং ৩৬০° ঘোরানো বেস। চা, কফি, নুডলস বা গরম পানি — মিনিটেই রেডি।',
                tagline: 'মিনিটেই গরম পানি',
                price: 950,
                originalPrice: 1400,
                thumbnail: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=800&q=80',
                    'https://images.unsplash.com/photo-1571942676516-bcab84649e44?w=800&q=80',
                    'https://images.unsplash.com/photo-1517256064527-9d84d193f3f9?w=800&q=80'
                ],
                category: c.appliances || fallback,
                tags: ['electric kettle', 'kettle', 'appliance', 'kitchen'],
                brand: 'QuickBoil',
                material: ['Stainless Steel', 'BPA-free Plastic'],
                weight: '900 g',
                stock: 70,
                rating: 4.4, reviewCount: 98, totalSold: 780, viewCount: 5100,
                isOnSale: true,
                warranty: { hasWarranty: true, duration: 1, durationUnit: 'years', type: 'manufacturer' },
                shippingConfig: { freeShipping: false, shippingCost: 50, estimatedDays: 2 },
            },
            {
                name: 'Cooking Pot Set 3 Pieces Stainless Steel',
                description: 'তিনটি ভিন্ন সাইজের স্টেইনলেস স্টিল পাতিল সেট (১.৫, ৩ ও ৫ লিটার)। ঢাকনাসহ, ইনডাকশন কম্প্যাটিবল। ভাত, তরকারি, ঝোল — যে কোনো রান্নায় পারফেক্ট। টেকসই ও সহজে পরিষ্কারযোগ্য।',
                tagline: 'তিন সাইজে সব রান্না',
                price: 1800,
                originalPrice: 2500,
                thumbnail: 'https://images.unsplash.com/photo-1584990347449-a8ee2f3a2a88?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1584990347449-a8ee2f3a2a88?w=800&q=80',
                    'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80',
                    'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80'
                ],
                category: c.cookware || fallback,
                tags: ['pot', 'cooking pot', 'stainless steel', 'cookware set', 'kitchen'],
                brand: 'Kitchen Master',
                material: ['Stainless Steel'],
                weight: '3.2 kg',
                stock: 40,
                rating: 4.6, reviewCount: 87, totalSold: 290, viewCount: 3800,
                warranty: { hasWarranty: true, duration: 1, durationUnit: 'years', type: 'manufacturer' },
                shippingConfig: { freeShipping: true, shippingCost: 0, estimatedDays: 3 },
            },
            {
                name: 'Multipurpose Blender 800W with Grinder',
                description: '৮০০ ওয়াট মাল্টিপারপাস ব্লেন্ডার। জুস, স্মুদি, চাটনি, মসলা গুঁড়ো — সব কিছু এক মেশিনে। ১.৫ লিটার জার, গ্রাইন্ডার অ্যাটাচমেন্ট, ২ স্পিড + পালস সেটিং। স্টেইনলেস স্টিল ব্লেড।',
                tagline: 'সব কিছু এক মেশিনে',
                price: 2500,
                originalPrice: 3200,
                thumbnail: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&q=80',
                    'https://images.unsplash.com/photo-1585237672814-8922f7c4cfbb?w=800&q=80',
                    'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=800&q=80'
                ],
                category: c.appliances || fallback,
                tags: ['blender', 'grinder', 'juicer', 'appliance', 'kitchen'],
                brand: 'MixMaster',
                material: ['ABS Plastic', 'Stainless Steel Blade'],
                weight: '2.8 kg',
                stock: 30,
                rating: 4.3, reviewCount: 156, totalSold: 420, viewCount: 5500,
                isFeatured: true,
                warranty: { hasWarranty: true, duration: 1, durationUnit: 'years', type: 'manufacturer' },
                shippingConfig: { freeShipping: true, shippingCost: 0, estimatedDays: 3 },
            },
            {
                name: 'Wooden Cutting Board Large Bamboo',
                description: 'প্রিমিয়াম ব্যাম্বু কাটিং বোর্ড, বড় সাইজ (৪০x৩০ সেমি)। জুস গ্রুভ, নন-স্লিপ প্যাড এবং সহজ ধরার হ্যান্ডেল। মাছ, মাংস, সবজি কাটার জন্য আদর্শ। ন্যাচারাল অ্যান্টি-ব্যাকটেরিয়াল বৈশিষ্ট্য।',
                tagline: 'প্রাকৃতিক ও টেকসই',
                price: 650,
                originalPrice: 900,
                thumbnail: 'https://images.unsplash.com/photo-1605523419242-0d09f3a2aaee?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1605523419242-0d09f3a2aaee?w=800&q=80',
                    'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&q=80',
                    'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=800&q=80'
                ],
                category: c.tools || fallback,
                tags: ['cutting board', 'bamboo', 'wooden', 'chopping board', 'kitchen'],
                brand: 'NaturCraft',
                material: ['Bamboo Wood'],
                weight: '1.2 kg',
                stock: 60,
                rating: 4.5, reviewCount: 72, totalSold: 510, viewCount: 3200,
                shippingConfig: { freeShipping: false, shippingCost: 40, estimatedDays: 2 },
            },
            {
                name: 'Glass Spice Jar Set 12 Pieces with Rack',
                description: '১২ পিস গ্লাস মসলার জার সেট, স্টেইনলেস স্টিল র‍্যাকসহ। এয়ারটাইট ঢাকনা, লেবেল স্টিকার ইনক্লুডেড। হলুদ, মরিচ, জিরা, ধনিয়া — সব মসলা গুছিয়ে রাখুন। কিচেন ডেকোরেও দারুণ লাগে।',
                tagline: 'মসলা গুছিয়ে রাখুন',
                price: 1200,
                originalPrice: 1600,
                thumbnail: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&q=80',
                    'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&q=80',
                    'https://images.unsplash.com/photo-1506368249639-73a05d6f6488?w=800&q=80'
                ],
                category: c.storage || fallback,
                tags: ['spice jar', 'glass jar', 'spice rack', 'storage', 'kitchen'],
                brand: 'HomeOrg',
                material: ['Borosilicate Glass', 'Stainless Steel'],
                weight: '1.8 kg',
                stock: 45,
                rating: 4.6, reviewCount: 94, totalSold: 380, viewCount: 4600,
                isNewProduct: true,
                shippingConfig: { freeShipping: false, shippingCost: 70, estimatedDays: 3 },
            },
            {
                name: 'Silicone Kitchen Utensil Set 10 Pieces',
                description: '১০ পিস সিলিকন হাতা-খুন্তি সেট। হিট-রেজিস্ট্যান্ট (২৩০°C পর্যন্ত), নন-স্ক্র্যাচ, ফুড-গ্রেড সিলিকন। কাঠের হ্যান্ডেল, হোল্ডারসহ। নন-স্টিক পাত্রের জন্য সেফ। স্প্যাটুলা, চামচ, টং — সব আছে।',
                tagline: 'নন-স্টিক পাত্রের বেস্ট ফ্রেন্ড',
                price: 980,
                originalPrice: 1350,
                thumbnail: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=800&q=80',
                    'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80',
                    'https://images.unsplash.com/photo-1574181613601-005a24609c0b?w=800&q=80'
                ],
                category: c.tools || fallback,
                tags: ['utensil set', 'silicone', 'spatula', 'cooking tools', 'kitchen'],
                brand: 'SiliFlex',
                material: ['Food-grade Silicone', 'Beech Wood'],
                weight: '1.1 kg',
                stock: 55,
                rating: 4.4, reviewCount: 110, totalSold: 620, viewCount: 4900,
                isNewProduct: true,
                shippingConfig: { freeShipping: false, shippingCost: 50, estimatedDays: 2 },
            },
            {
                name: 'Insulated Stainless Steel Water Bottle 750ml',
                description: 'ডাবল-ওয়াল ভ্যাকুয়াম ইনসুলেটেড ওয়াটার বোতল। গরম পানি ১২ ঘণ্টা ও ঠান্ডা পানি ২৪ ঘণ্টা পর্যন্ত থাকে। লিক-প্রুফ ক্যাপ, BPA-ফ্রি। অফিস, জিম বা ট্র্যাভেলে সঙ্গী।',
                tagline: 'সারাদিন গরম বা ঠান্ডা',
                price: 750,
                originalPrice: 1100,
                thumbnail: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80',
                    'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=800&q=80',
                    'https://images.unsplash.com/photo-1570831739435-6601aa3fa4fb?w=800&q=80'
                ],
                category: c.drinkware || fallback,
                tags: ['water bottle', 'insulated', 'stainless steel', 'thermos', 'kitchen'],
                brand: 'AquaTherm',
                material: ['304 Stainless Steel'],
                weight: '380 g',
                colors: ['Silver', 'Black', 'Blue', 'Red'],
                stock: 80,
                rating: 4.7, reviewCount: 203, totalSold: 920, viewCount: 7200,
                isOnSale: true,
                shippingConfig: { freeShipping: false, shippingCost: 40, estimatedDays: 2 },
            },
            {
                name: 'Glass Food Storage Container Set 5 Pieces',
                description: '৫ পিস বোরোসিলিকেট গ্লাস ফুড স্টোরেজ কন্টেইনার সেট। এয়ারটাইট স্ন্যাপ-লক ঢাকনা, মাইক্রোওয়েভ ও ফ্রিজার সেফ, ওভেনেও ব্যবহার করা যায়। বিভিন্ন সাইজ (৩০০ml থেকে ১L)। স্ট্যাকেবল ডিজাইন — জায়গা কম লাগে।',
                tagline: 'খাবার তাজা রাখুন',
                price: 1500,
                originalPrice: 2000,
                thumbnail: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=500&q=80',
                images: [
                    'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&q=80',
                    'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?w=800&q=80',
                    'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80'
                ],
                category: c.storage || fallback,
                tags: ['food container', 'glass container', 'storage', 'meal prep', 'kitchen'],
                brand: 'FreshKeep',
                material: ['Borosilicate Glass', 'BPA-free PP Lid'],
                weight: '2.1 kg',
                stock: 40,
                rating: 4.5, reviewCount: 86, totalSold: 350, viewCount: 4100,
                isNewProduct: true,
                warranty: { hasWarranty: true, duration: 6, durationUnit: 'months', type: 'manufacturer' },
                shippingConfig: { freeShipping: true, shippingCost: 0, estimatedDays: 3 },
            },
        ];

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
        console.log(`\nInserted ${result.length} kitchen products:`);
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
