/**
 * Shohoz Kitchen demo seed — creates realistic data to see the platform "in action".
 *
 *   Admin (1) · Products (live + pending moderation)
 *   Customers (10: 6 have ordered) · Orders across the full 11-state lifecycle + 3 payment methods.
 *
 * Idempotent: re-running first wipes any previous seed (anything on the @shohozkitchen.com domain)
 * so it never piles up duplicates. Real (non-seed) accounts are never touched.
 *
 * Run:  npx ts-node --transpile-only src/seed.ts
 */
import mongoose from 'mongoose';
import config from './app/config';
import { User } from './app/modules/user/user.model';
import { Category } from './app/modules/category/category.model';
import { Product } from './app/modules/product/product.model';
import { Order } from './app/modules/order/order.model';
import OrderService from './app/modules/order/order.service';

// Demo accounts share one password, taken from .env — never from source, which is public.
const PASSWORD = process.env.SEED_PASSWORD || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (PASSWORD.length < 10) {
    console.error('Set SEED_PASSWORD in .env (at least 10 characters) before seeding.');
    process.exit(1);
}
if (!ADMIN_EMAIL || ADMIN_PASSWORD.length < 10) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) in .env before seeding.');
    process.exit(1);
}
const DOMAIN = '@shohozkitchen.com';
const img = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function run() {
    await mongoose.connect(config.database_url);
    console.log('🔌 Connected to MongoDB\n');

    // ── 1. WIPE PREVIOUS SEED (scoped to @shohozkitchen.com only) ──────────────
    const prior = await User.find({ email: new RegExp(`${DOMAIN}$`, 'i') }).select('_id');
    const priorIds = prior.map((u) => u._id);
    if (priorIds.length) {
        await Order.deleteMany({ user: { $in: priorIds } });
        // Seed products are identified by their picsum placeholder thumbnails.
        await Product.deleteMany({ thumbnail: /picsum\.photos\/seed\// });
        await User.deleteMany({ _id: { $in: priorIds } });
        console.log(`🧹 Cleaned previous seed (${priorIds.length} users + their products/orders)\n`);
    }

    // ── 2. CATEGORIES (reuse by name if present, else create) ──────────────
    const catDefs = [
        { name: 'Electronics' },
        { name: 'Fashion' },
        { name: 'Home & Kitchen' },
        { name: 'Mobile & Accessories' },
    ];
    const cats: Record<string, any> = {};
    for (const c of catDefs) {
        let cat = await Category.findOne({ name: c.name });
        if (!cat) cat = await Category.create({ ...c, isActive: true, showInHome: true, isFeatured: true });
        cats[c.name] = cat;
    }
    console.log(`📂 Categories ready: ${Object.keys(cats).join(', ')}\n`);

    // ── 3. ADMIN ───────────────────────────────────────────────────────────
    const admin = await User.create({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD, firstName: 'Shohoz Kitchen', lastName: 'Admin',
        phone: '01700000000', role: 'admin', status: 'active', isEmailVerified: true,
    });
    console.log('👑 Admin created');

    // ── 4. PRODUCTS ────────────────────────────────────────────────────────
    // approval: 'approved' = live on storefront; 'pending' = waiting in admin moderation queue.
    const productDefs = [        { key: 'earbuds', cat: 'Electronics', name: 'Wireless Earbuds Pro', description: "This is a wireless earbud. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1290, original: 1990, brand: 'SoundMax', stock: 60, sold: 42, rating: 4.6, approval: 'approved' },
        { key: 'powerbank', cat: 'Electronics', name: '20000mAh Fast Power Bank', description: "This is a 20000mAh fast power bank. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1550, original: 2200, brand: 'PowerUp', stock: 40, sold: 31, rating: 4.4, approval: 'approved' },
        { key: 'speaker', cat: 'Electronics', name: 'Portable Bluetooth Speaker', description: "This is a portable Bluetooth speaker. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1850, original: 2500, brand: 'BoomBox', stock: 25, sold: 18, rating: 4.5, approval: 'approved' },
        { key: 'smartwatch', cat: 'Mobile & Accessories', name: 'Smart Watch X1', description: "This is a smartwatch. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 2390, original: 3500, brand: 'FitPro', stock: 30, sold: 12, rating: 4.2, approval: 'approved' },
        { key: 'charger', cat: 'Mobile & Accessories', name: 'USB-C 65W Fast Charger', description: "This is a USB-C 65W fast charger. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 890, original: 1200, brand: 'PowerUp', stock: 50, sold: 5, rating: 4.0, approval: 'pending' }, // moderation queue        { key: 'polo', cat: 'Fashion', name: "Men's Cotton Polo Shirt", description: "This is a men's cotton polo shirt. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 690, original: 990, brand: 'UrbanWear', stock: 80, sold: 55, rating: 4.3, approval: 'approved' },
        { key: 'dress', cat: 'Fashion', name: "Women's Summer Dress", description: "This is a women's summer dress. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1190, original: 1690, brand: 'Bloom', stock: 45, sold: 27, rating: 4.7, approval: 'approved' },
        { key: 'sneakers', cat: 'Fashion', name: 'Casual Sneakers', description: "This is a casual sneakers. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1490, original: 2100, brand: 'StepUp', stock: 35, sold: 20, rating: 4.4, approval: 'approved' },
        { key: 'wallet', cat: 'Fashion', name: 'Genuine Leather Wallet', description: "This is a genuine leather wallet. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 590, original: 850, brand: 'Hide&Co', stock: 70, sold: 33, rating: 4.5, approval: 'approved' },
        { key: 'jacket', cat: 'Fashion', name: 'Denim Jacket', description: "This is a denim jacket. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1790, original: 2500, brand: 'UrbanWear', stock: 20, sold: 3, rating: 4.1, approval: 'pending' }, // moderation queue        { key: 'frypan', cat: 'Home & Kitchen', name: 'Non-stick Fry Pan 26cm', description: "This is a non-stick fry pan 26cm. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 990, original: 1400, brand: 'KitchenKing', stock: 55, sold: 38, rating: 4.5, approval: 'approved' },
        { key: 'bottle', cat: 'Home & Kitchen', name: 'Stainless Steel Water Bottle 1L', description: "This is a stainless steel water bottle 1L. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 490, original: 750, brand: 'HydroFit', stock: 90, sold: 64, rating: 4.6, approval: 'approved' },
        { key: 'lamp', cat: 'Home & Kitchen', name: 'LED Desk Lamp (Dimmable)', description: "This is a LED desk lamp (Dimmable). It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 850, original: 1200, brand: 'BrightLite', stock: 40, sold: 22, rating: 4.3, approval: 'approved' },
        { key: 'dinnerset', cat: 'Home & Kitchen', name: 'Ceramic Dinner Set (16pc)', description: "This is a ceramic dinner set (16pc). It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 2490, original: 3500, brand: 'Tableware', stock: 18, sold: 9, rating: 4.4, approval: 'approved' },
        { key: 'bedsheet', cat: 'Home & Kitchen', name: 'Cotton King Bed Sheet', description: "This is a cotton king bed sheet. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1290, original: 1800, brand: 'CozyHome', stock: 30, sold: 1, rating: 4.0, approval: 'pending' }, // moderation queue        { key: 'coolfan', cat: 'Mobile & Accessories', name: 'Phone Cooling Fan', description: "This is a phone cooling fan. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 750, original: 1100, brand: 'CoolTech', stock: 25, sold: 0, rating: 0, approval: 'pending' },
        { key: 'ringlight', cat: 'Mobile & Accessories', name: 'Selfie Ring Light', description: "This is a selfie ring light. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 990, original: 1500, brand: 'GlowPro', stock: 20, sold: 0, rating: 0, approval: 'pending' },        { key: 'tshirt', cat: 'Fashion', name: 'Graphic Print T-Shirt', description: "This is a graphic print t-shirt. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 450, original: 700, brand: 'InkWear', stock: 60, sold: 0, rating: 0, approval: 'pending' },
        { key: 'backpack', cat: 'Fashion', name: 'Canvas Backpack', description: "This is a canvas backpack. It is very comfortable to wear and has a very good sound quality. It is also very easy to use. You can connect it to your phone using Bluetooth and listen to your favorite songs. It is also waterproof, so you can use it in the rain.", price: 1350, original: 1900, brand: 'Trekker', stock: 15, sold: 0, rating: 0, approval: 'pending' },
    ];
    const products: Record<string, any> = {};
    for (const p of productDefs) {
        const created = await Product.create({
            name: p.name,
            description: `${p.name} by ${p.brand}. Genuine product with warranty. Lower price than others but quality higher.`,
            price: p.price, originalPrice: p.original,
            thumbnail: img(p.key), images: [img(p.key), img(`${p.key}-2`), img(`${p.key}-3`)],
            category: cats[p.cat]._id,
            brand: p.brand, model: p.name, weight: '500 g', boxSize: '20x15x8 cm',
            insideTheBox: `1x ${p.name}, User Manual, Warranty Card`,
            stock: p.stock, status: 'active', visibility: 'visible',
            approvalStatus: p.approval, approvedAt: p.approval === 'approved' ? daysAgo(20) : undefined,
            totalSold: p.sold, rating: p.rating, reviewCount: Math.round(p.sold / 3),
        });
        products[p.key] = created;
    }
    const approvedCount = productDefs.filter((p) => p.approval === 'approved').length;
    console.log(`\n📦 Products: ${productDefs.length} total (${approvedCount} live, ${productDefs.length - approvedCount} pending moderation)\n`);

    // ── 5. CUSTOMERS (10) ──────────────────────────────────────────────────
    const custNames = [
        ['Tanvir', 'Ahmed'], ['Mitu', 'Rahman'], ['Sabbir', 'Khan'], ['Lamia', 'Chowdhury'], ['Rifat', 'Hasan'],
        ['Nusrat', 'Jahan'], ['Imran', 'Kabir'], ['Sadia', 'Noor'], ['Hasib', 'Alam'], ['Priya', 'Das'],
    ];
    const customers: any[] = [];
    for (let i = 0; i < custNames.length; i++) {
        const [first, last] = custNames[i];
        const u = await User.create({
            email: `customer${i + 1}${DOMAIN}`, password: PASSWORD, firstName: first, lastName: last,
            phone: `0172000000${i}`, role: 'user', status: 'active', isEmailVerified: true,
            shippingAddresses: [{ label: 'Home', fullName: `${first} ${last}`, phone: `0172000000${i}`, address: `House ${i + 1}, Road ${i + 2}`, area: 'Banani', city: i % 2 === 0 ? 'Dhaka' : 'Chittagong', postalCode: '1213', isDefault: true }],
        });
        customers.push(u);
    }
    console.log(`👥 Customers: ${customers.length} (6 will place orders)\n`);

    // ── 5. ORDERS (via OrderService → correct packages + totals) ──
    const addrFor = (c: any) => ({
        fullName: `${c.firstName} ${c.lastName}`, phone: c.phone, email: c.email,
        address: c.shippingAddresses?.[0]?.address || 'House 1, Road 2', area: 'Banani',
        city: c.shippingAddresses?.[0]?.city || 'Dhaka', postalCode: '1213',
    });
    const orderPlans = [
        { c: 0, items: [['earbuds', 1]], pay: 'cod', paid: false, final: 'delivered', ageDays: 9 },
        { c: 0, items: [['frypan', 1], ['bottle', 2]], pay: 'bkash', paid: true, final: 'out_for_delivery', ageDays: 2 },
        { c: 1, items: [['polo', 2]], pay: 'sslcommerz', paid: true, final: 'delivered', ageDays: 7 },
        { c: 1, items: [['powerbank', 1], ['dress', 1]], pay: 'bkash', paid: true, final: 'delivered', ageDays: 6 },
        { c: 2, items: [['sneakers', 1]], pay: 'cod', paid: false, final: 'on_the_way', ageDays: 3 },
        { c: 2, items: [['dinnerset', 1]], pay: 'sslcommerz', paid: true, final: 'confirmed', ageDays: 1 },
        { c: 3, items: [['lamp', 1]], pay: 'cod', paid: false, final: 'processing', ageDays: 2 },
        { c: 4, items: [['speaker', 1]], pay: 'bkash', paid: false, final: 'pending', ageDays: 0 },
        { c: 5, items: [['wallet', 1]], pay: 'cod', paid: false, final: 'cancelled', ageDays: 4 },
    ];

    let made = 0;
    for (const plan of orderPlans) {
        const cust = customers[plan.c];
        const payload = {
            items: plan.items.map(([key, qty]) => ({ product: products[key as string]._id.toString(), quantity: qty as number })),
            shippingAddress: addrFor(cust),
            paymentMethod: plan.pay,
            note: 'Please deliver between 10am–6pm.',
        };
        const order = await OrderService.createOrder(cust._id.toString(), payload);
        const oid = order._id.toString();

        if (plan.paid) await OrderService.updatePaymentStatus(oid, 'paid');
        if (plan.final !== 'pending') await OrderService.updateOrderStatus(oid, plan.final, 'Seeded demo order');

        // Spread order dates for a realistic timeline.
        await Order.updateOne({ _id: order._id }, { $set: { createdAt: daysAgo(plan.ageDays) } });
        made++;
        console.log(`🧾 Order ${made}: ${cust.firstName} → ${plan.items.map((i) => i[0]).join(', ')} [${plan.pay}] → ${plan.final}`);
    }

    // Let fire-and-forget side effects (invoice email log, etc.) settle.
    await new Promise((r) => setTimeout(r, 1500));

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ SEED COMPLETE');
    console.log('   ──────────────────────────────────────────────────────────');
    console.log(`   Admin:     ${ADMIN_EMAIL}`);
    console.log(`   Customers: customer1..customer10${DOMAIN}   (1-6 have orders)`);
    console.log('   ──────────────────────────────────────────────────────────');
    console.log(`   ${made} orders across: delivered, out_for_delivery, on_the_way, processing, confirmed, pending, cancelled`);
    console.log(`   Payments: COD · bKash · SSLCommerz`);
    console.log('════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (err) => {
    console.error('❌ Seed failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});
