/**
 * Shohoz Kitchen — small demo seed: 5 categories + 5 products with real photos.
 *
 * Images are hosted on images.unsplash.com, which is already whitelisted in the
 * client's next.config.ts remotePatterns.
 *
 * Idempotent: re-running updates the same docs by slug instead of duplicating.
 *
 * Run:  npm run seed:demo
 */
import mongoose from 'mongoose';
import dns from 'dns';
import config from './app/config';
import { Category } from './app/modules/category/category.model';
import { Product } from './app/modules/product/product.model';

// This machine's default resolver refuses queries; Atlas needs working DNS.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const img = (id: string, w = 800) =>
    `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`;

const catImg = (slug: string) => `/categories/${slug}.png`;

const CATEGORIES = [
    { name: 'Cookware', icon: '🍳', image: catImg('cookware') },
    { name: 'Dinnerware', icon: '🍽️', image: catImg('dinnerware') },
    { name: 'Kitchen Tools', icon: '🔪', image: catImg('kitchen-tools') },
    { name: 'Food Storage', icon: '🫙', image: catImg('food-storage') },
    { name: 'Appliances', icon: '⚡', image: catImg('appliances') },
    { name: 'Bakeware', icon: '🧁', image: catImg('bakeware') },
    { name: 'Drinkware', icon: '🥤', image: catImg('drinkware') },
    { name: 'Cutlery', icon: '🍴', image: catImg('cutlery') },
];

const PRODUCTS = [
    {
        cat: 'Cookware',
        name: 'Non-stick Fry Pan 26cm',
        brand: 'KitchenKing',
        price: 1190,
        originalPrice: 1690,
        stock: 45,
        totalSold: 38,
        rating: 4.6,
        image: 'photo-1518291344630-4857135fb581',
        description:
            'A 26cm non-stick fry pan with a forged aluminium body and a heat-resistant bakelite handle. ' +
            'The three-layer coating releases food cleanly, so an omelette or a fillet of fish lifts out in one piece ' +
            'and you cook with far less oil. Even heat spread across the base means no hot spot in the middle. ' +
            'Works on gas and induction; wipe clean with a soft sponge.',
        insideTheBox: '1x Fry Pan 26cm, Recipe card, Warranty card',
        weight: '820 g',
        boxSize: '30 x 28 x 6 cm',
    },
    {
        cat: 'Cookware',
        name: 'Stainless Steel Pot Set (3 pieces)',
        brand: 'SteelCore',
        price: 3450,
        originalPrice: 4800,
        stock: 22,
        totalSold: 17,
        rating: 4.7,
        image: 'photo-1584990347193-6bebebfeaeee',
        description:
            'Three stainless steel pots (1.5L, 2.5L and 4L) with tempered glass lids and riveted side handles. ' +
            'The encapsulated base holds heat steadily, so rice, dal and curry simmer without scorching at the bottom. ' +
            'Rust-free 18/10 steel, dishwasher safe, and every size stacks inside the largest one for storage.',
        insideTheBox: '3x Pots (1.5L / 2.5L / 4L), 3x Glass lids, User manual',
        weight: '3.4 kg',
        boxSize: '36 x 34 x 24 cm',
    },
    {
        cat: 'Dinnerware',
        name: 'Ceramic Dinner Set (16 pieces)',
        brand: 'Tableware',
        price: 2790,
        originalPrice: 3900,
        stock: 18,
        totalSold: 12,
        rating: 4.5,
        image: 'photo-1556910585-09baa3a3998e',
        description:
            'A 16-piece glazed ceramic dinner set that serves four: dinner plates, side plates, bowls and mugs. ' +
            'The glaze is chip-resistant and does not stain from turmeric or tomato, so the plates look new after months of use. ' +
            'Microwave and dishwasher safe. The shape stacks flat, which matters in a small kitchen cabinet.',
        insideTheBox: '4x Dinner plates, 4x Side plates, 4x Bowls, 4x Mugs',
        weight: '5.2 kg',
        boxSize: '32 x 32 x 30 cm',
    },
    {
        cat: 'Kitchen Tools',
        name: 'Kitchen Utensil Set (6 pieces)',
        brand: 'ChefLine',
        price: 890,
        originalPrice: 1250,
        stock: 60,
        totalSold: 41,
        rating: 4.4,
        image: 'photo-1678108040468-0cc9addd984d',
        description:
            'Six everyday utensils — slotted turner, solid spoon, slotted spoon, ladle, pasta server and masher — ' +
            'in silicone with stainless steel cores. The silicone heads are soft enough to use on a non-stick pan ' +
            'without scratching the coating, and they hold their shape up to 230°C. Hanging loops on every handle.',
        insideTheBox: '6x Utensils, Hanging rail, Warranty card',
        weight: '1.1 kg',
        boxSize: '35 x 12 x 8 cm',
    },
    {
        cat: 'Food Storage',
        name: 'Airtight Storage Canister 1.5L',
        brand: 'FreshKeep',
        price: 640,
        originalPrice: 950,
        stock: 75,
        totalSold: 53,
        rating: 4.3,
        image: 'photo-1556910633-5099dc3971e8',
        description:
            'A 1.5 litre canister with a silicone-gasket clamp lid that seals properly against humidity — ' +
            'the real problem for flour, sugar and biscuits in this climate. Contents stay dry and crisp for weeks. ' +
            'The body is BPA-free and clear enough to see what is left without opening it. Stackable, fridge safe.',
        insideTheBox: '1x Canister 1.5L, Spare gasket, Label sticker',
        weight: '460 g',
        boxSize: '16 x 16 x 20 cm',
    },
];

async function run() {
    await mongoose.connect(config.database_url);
    console.log('🔌 Connected to', mongoose.connection.name, '\n');

    // ── Categories ────────────────────────────────────────────────
    const cats: Record<string, any> = {};
    for (const [i, c] of CATEGORIES.entries()) {
        const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        let cat = await Category.findOne({ slug });
        if (cat) {
            cat.set({ icon: c.icon, image: c.image, isActive: true, showInHome: true, isFeatured: true, order: i });
            await cat.save();
        } else {
            cat = await Category.create({
                name: c.name, slug, icon: c.icon, image: c.image,
                level: 0, order: i, isActive: true, showInMenu: true, showInHome: true, isFeatured: true,
            });
        }
        cats[c.name] = cat;
        console.log(`📂 ${c.name}  (/${slug})`);
    }

    // ── Products ──────────────────────────────────────────────────
    console.log('');
    for (const p of PRODUCTS) {
        const images = [img(p.image, 1200), img(p.image, 800), img(p.image, 600)];
        const fields = {
            name: p.name,
            description: p.description,
            price: p.price,
            originalPrice: p.originalPrice,
            thumbnail: img(p.image, 800),
            images,
            category: cats[p.cat]._id,
            brand: p.brand,
            model: p.name,
            weight: p.weight,
            boxSize: p.boxSize,
            insideTheBox: p.insideTheBox,
            stock: p.stock,
            totalSold: p.totalSold,
            rating: p.rating,
            reviewCount: Math.max(1, Math.round(p.totalSold / 4)),
            status: 'active' as const,
            visibility: 'visible' as const,
            approvalStatus: 'approved' as const,
            approvedAt: new Date(),
            isDeleted: false,
        };

        const existing = await Product.findOne({ name: p.name });
        if (existing) {
            existing.set(fields);
            await existing.save();
            console.log(`📦 updated  ${p.name}  —  ৳${p.price}  (${p.cat})`);
        } else {
            await Product.create(fields);
            await Category.findByIdAndUpdate(cats[p.cat]._id, { $inc: { productCount: 1 } });
            console.log(`📦 created  ${p.name}  —  ৳${p.price}  (${p.cat})`);
        }
    }

    const [catCount, prodCount] = await Promise.all([
        Category.countDocuments({ isDeleted: { $ne: true } }),
        Product.countDocuments({ isDeleted: false }),
    ]);
    console.log(`\n✅ Done — ${catCount} categories, ${prodCount} products live.`);
    await mongoose.disconnect();
}

run().catch((e) => {
    console.error('❌ Seed failed:', e.message);
    process.exit(1);
});
