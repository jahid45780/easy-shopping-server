import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_URL = process.env.DATABASE_URL!;

// Import actual models to avoid TS conflicts
import { Category } from '../app/modules/category/category.model';
import { Product } from '../app/modules/product/product.model';

async function seed() {
    try {
        await mongoose.connect(DB_URL);
        console.log('✅ MongoDB Connected');

        // Categories
        const categories = [
            { name: 'Fashion & Apparel', slug: 'fashion-apparel', icon: '👔' },
            { name: 'Electronics', slug: 'electronics', icon: '💻' },
            { name: 'Home & Living', slug: 'home-living', icon: '🏠' }
        ];

        const catIds: Record<string, any> = {};

        for (const cat of categories) {
            let existingCat = await Category.findOne({ slug: cat.slug });
            if (!existingCat) {
                existingCat = await Category.create(cat);
                console.log(`✅ Category Created: ${cat.name}`);
            }
            catIds[cat.slug] = existingCat._id;
        }

        // 10 Professional Products
        const productsData = [
            {
                name: 'Apple MacBook Pro M3 Max 16-inch',
                slug: 'apple-macbook-pro-m3-max-16-inch',
                sku: 'TECH-MBP-16-M3',
                description: 'The most advanced Mac ever built. Powered by the M3 Max chip with 16-core CPU and 40-core GPU. Experience unprecedented performance and up to 22 hours of battery life. The Liquid Retina XDR display is the best ever in a laptop.',
                tagline: 'Mind-blowing. Head-turning.',
                priceType: 'fixed',
                productType: 'simple',
                price: 3499,
                originalPrice: 3599,
                thumbnail: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=800',
                    'https://images.unsplash.com/photo-1537498425277-c283d32ef9db?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['electronics'],
                stock: 15,
                tags: ['laptop', 'macbook', 'apple', 'm3 max', 'tech'],
                status: 'active'
            },
            {
                name: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
                slug: 'sony-wh-1000xm5-wireless-noise-canceling-headphones',
                sku: 'TECH-SONY-XM5',
                description: 'Industry-leading noise cancellation optimized to you. The WH-1000XM5 headphones rewrite the rules for distraction-free listening and flawless call clarity. Two processors control 8 microphones for unprecedented noise cancellation and exceptional call quality.',
                tagline: 'Your world. Nothing else.',
                priceType: 'fixed',
                productType: 'simple',
                price: 398,
                originalPrice: 420,
                thumbnail: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['electronics'],
                stock: 45,
                tags: ['headphones', 'sony', 'wireless', 'noise canceling', 'audio'],
                status: 'active'
            },
            {
                name: 'Samsung 49" Odyssey G9 Gaming Monitor',
                slug: 'samsung-49-odyssey-g9-gaming-monitor',
                sku: 'TECH-SAM-G9',
                description: 'The 49-inch DQHD gaming monitor with 1000R curvature and 240Hz refresh rate. Get fully immersed in your games with the groundbreaking 1000R curved screen. QLED technology provides pixel-perfect picture quality with every frame.',
                tagline: 'Immersive gaming redefined.',
                priceType: 'fixed',
                productType: 'simple',
                price: 1399,
                originalPrice: 1499,
                thumbnail: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['electronics'],
                stock: 8,
                tags: ['monitor', 'gaming', 'samsung', 'odyssey', '49 inch', 'ultrawide'],
                status: 'active'
            },
            {
                name: 'Premium Men\'s Tailored Wool Suit',
                slug: 'premium-mens-tailored-wool-suit',
                sku: 'FASH-SUIT-01',
                description: 'Crafted from 100% fine Italian wool, this tailored suit offers a modern slim fit that flatters every silhouette. The jacket features a classic two-button closure, notch lapels, and double vents for comfort. Perfect for business meetings, weddings, and formal occasions.',
                tagline: 'Elegance in every thread.',
                priceType: 'fixed',
                productType: 'simple',
                price: 450,
                originalPrice: 600,
                thumbnail: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['fashion-apparel'],
                stock: 20,
                tags: ['suit', 'menswear', 'tailored', 'wool', 'formal'],
                status: 'active'
            },
            {
                name: 'Women\'s Leather Tote Bag',
                slug: 'womens-leather-tote-bag',
                sku: 'FASH-BAG-01',
                description: 'A luxurious, full-grain leather tote designed for the modern woman. Featuring a spacious interior that easily fits a 15-inch laptop, interior zippered pockets, and reinforced handles for everyday durability. This timeless piece combines functionality with minimalist elegance.',
                tagline: 'Your perfect everyday companion.',
                priceType: 'fixed',
                productType: 'simple',
                price: 185,
                originalPrice: 220,
                thumbnail: 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&q=80&w=800',
                    'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['fashion-apparel'],
                stock: 35,
                tags: ['bag', 'tote', 'leather', 'womens', 'accessories'],
                status: 'active'
            },
            {
                name: 'Classic Men\'s Chronograph Watch',
                slug: 'classic-mens-chronograph-watch',
                sku: 'FASH-WATCH-01',
                description: 'Precision engineering meets timeless design. This chronograph watch features a stainless steel case, genuine leather strap, scratch-resistant sapphire crystal, and water resistance up to 50 meters. Complete with stopwatch functionality and date display.',
                tagline: 'Timeless precision.',
                priceType: 'fixed',
                productType: 'simple',
                price: 245,
                originalPrice: 310,
                thumbnail: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['fashion-apparel'],
                stock: 12,
                tags: ['watch', 'chronograph', 'mens', 'leather', 'accessories'],
                status: 'active'
            },
            {
                name: 'Modern Ergonomic Office Chair',
                slug: 'modern-ergonomic-office-chair',
                sku: 'HOME-CHAIR-01',
                description: 'Designed for ultimate comfort during long work hours. Features a breathable mesh back, adjustable lumbar support, 3D armrests, and a dynamic tilt mechanism. Promotes healthy posture and reduces back strain.',
                tagline: 'Work comfortably, all day.',
                priceType: 'fixed',
                productType: 'simple',
                price: 299,
                originalPrice: 350,
                thumbnail: 'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['home-living'],
                stock: 25,
                tags: ['chair', 'office', 'ergonomic', 'furniture'],
                status: 'active'
            },
            {
                name: 'Ceramic Table Lamp with Linen Shade',
                slug: 'ceramic-table-lamp-with-linen-shade',
                sku: 'HOME-LAMP-01',
                description: 'Add a touch of contemporary elegance to your living room or bedroom. The lamp features a handcrafted ceramic base with a textured matte finish and a natural linen drum shade that diffuses light perfectly for a warm, inviting glow.',
                tagline: 'Illuminate with style.',
                priceType: 'fixed',
                productType: 'simple',
                price: 85,
                originalPrice: 110,
                thumbnail: 'https://images.unsplash.com/photo-1507473885765-e6ed057f7821?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1507473885765-e6ed057f7821?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['home-living'],
                stock: 40,
                tags: ['lamp', 'ceramic', 'lighting', 'decor', 'home'],
                status: 'active'
            },
            {
                name: 'Smart Home Security Camera System',
                slug: 'smart-home-security-camera-system',
                sku: 'TECH-CAM-01',
                description: 'Keep your home safe with 4K HDR video, color night vision, and two-way audio. The wireless system includes 3 cameras and a smart hub. Features AI-powered motion detection that distinguishes between people, animals, and vehicles.',
                tagline: 'Peace of mind, 24/7.',
                priceType: 'fixed',
                productType: 'simple',
                price: 499,
                originalPrice: 599,
                thumbnail: 'https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['electronics'],
                stock: 18,
                tags: ['camera', 'security', 'smart home', 'wireless', 'tech'],
                status: 'active'
            },
            {
                name: 'Minimalist Wooden Coffee Table',
                slug: 'minimalist-wooden-coffee-table',
                sku: 'HOME-TABLE-01',
                description: 'Crafted from solid oak wood, this minimalist coffee table features clean lines and a smooth, durable finish. Its spacious surface and slatted lower shelf provide ample room for books, decor, and your morning coffee.',
                tagline: 'Simplicity meets durability.',
                priceType: 'fixed',
                productType: 'simple',
                price: 215,
                originalPrice: 280,
                thumbnail: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&q=80&w=800',
                images: [
                    'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&q=80&w=800'
                ],
                category: catIds['home-living'],
                stock: 22,
                tags: ['table', 'coffee table', 'wooden', 'furniture', 'minimalist'],
                status: 'active'
            }
        ];

        // Ensure unique slugs
        for (const pd of productsData) {
            const exists = await Product.findOne({ slug: pd.slug });
            if (!exists) {
                await Product.create(pd);
                console.log(`✅ Product Created: ${pd.name}`);
            } else {
                console.log(`ℹ️ Product already exists: ${pd.name}`);
            }
        }

        console.log('🎉 Seeding Complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seed Failed:', error);
        process.exit(1);
    }
}

seed();
