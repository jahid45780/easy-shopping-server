/**
 * Tools the ShohozBot assistant can call to read REAL Shohoz Kitchen data (products,
 * categories, order tracking, store/contact/policy info). The model decides when
 * to call these; results are fed back so answers are grounded in live data.
 * Everything here is read-only and only returns non-sensitive, public info.
 */
import { Product } from '../product/product.model';
import { Category } from '../category/category.model';
import { SiteContent } from '../siteContent/siteContent.model';
import OrderService from '../order/order.service';

const escapeRx = (s: string) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── OpenAI-style tool definitions sent to xAI Grok ──────────────────
export const TOOL_DEFS = [
    {
        type: 'function',
        function: {
            name: 'search_products',
            description:
                'Search Shohoz Kitchen products by keyword (name, brand, tag, or description). Use this whenever the user asks what products exist, prices, availability/stock, recommendations, or links to buy. Returns real, in-catalog products only.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search keywords, e.g. "wireless earbuds", "cotton saree", "power bank".' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_categories',
            description: 'List Shohoz Kitchen product categories (with links). Use when the user asks what kinds of products or categories are available.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'track_order',
            description: 'Look up the live status and timeline of an order by its order number (e.g. "KM-0033"). Returns only non-sensitive tracking info.',
            parameters: {
                type: 'object',
                properties: { orderId: { type: 'string', description: 'The order number, e.g. KM-0033.' } },
                required: ['orderId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_store_info',
            description: 'Get Shohoz Kitchen contact details, accepted payment methods, delivery info, and policy pages (terms / privacy / refund). Use for how-to-pay, contact, delivery, and returns/refund policy questions.',
            parameters: { type: 'object', properties: {} },
        },
    },
];

// ── Tool implementations ────────────────────────────────────────────
export const AssistantTools: Record<string, (args: any) => Promise<any>> = {
    async search_products({ query, limit }: { query?: string; limit?: number }) {
        const lim = Math.min(8, Math.max(1, Number(limit) || 5));
        const rx = new RegExp(escapeRx(query || ''), 'i');
        const products = await Product.find({
            isDeleted: { $ne: true },
            status: 'active',
            visibility: 'visible',
            approvalStatus: 'approved',
            $or: [{ name: rx }, { tags: rx }, { brand: rx }, { description: rx }],
        })
            .select('name slug price originalPrice discount stock brand rating totalSold')
            .sort({ totalSold: -1, rating: -1 })
            .limit(lim)
            .lean();

        return {
            count: products.length,
            currency: 'BDT',
            products: products.map((p: any) => ({
                name: p.name,
                price: p.price,
                originalPrice: p.originalPrice && p.originalPrice > p.price ? p.originalPrice : undefined,
                discountPercent: p.discount || 0,
                inStock: (p.stock || 0) > 0,
                stock: p.stock || 0,
                brand: p.brand || undefined,
                rating: p.rating || 0,
                link: `/product/${p.slug}`,
            })),
            hint: products.length === 0 ? 'No matching products found — suggest the user browse /products or rephrase.' : undefined,
        };
    },

    async list_categories() {
        const cats = await Category.find({ isDeleted: { $ne: true }, isActive: { $ne: false } })
            .select('name slug')
            .limit(60)
            .lean();
        return { categories: cats.map((c: any) => ({ name: c.name, link: `/products?category=${c.slug}` })) };
    },

    async track_order({ orderId }: { orderId?: string }) {
        const id = String(orderId || '').trim();
        if (!id) return { error: 'Please provide an order number like KM-0033.' };
        try {
            return await OrderService.trackOrder(id);
        } catch {
            return { error: `No order found for "${id}". Ask the user to double-check the order number (format: KM-XXXX).` };
        }
    },

    async get_store_info() {
        const sc: any = (await SiteContent.findOne({ _key: 'main' }).lean()) || (await SiteContent.findOne().lean()) || {};
        const pay = sc.payment || {};
        const contact = sc.contact || {};
        const methods = ['bkash', 'nagad', 'rocket']
            .filter((k) => pay[k]?.active !== false && pay[k]?.number)
            .map((k) => ({ method: k, number: pay[k].number, accountType: pay[k].accountType || 'Personal' }));

        return {
            contact: {
                phone: contact.phone || '',
                whatsapp: contact.whatsapp || '',
                email: contact.email || '',
                address: contact.address || '',
            },
            paymentMethods: methods,
            cashOnDelivery: true,
            paymentInstructions: pay.instructions || '',
            delivery: 'Shohoz Kitchen delivers across Bangladesh. Inside Dhaka usually 1-3 days, outside Dhaka 3-5 days. Cash on Delivery is available.',
            policies: (sc.legalPages || [])
                .filter((p: any) => p.active)
                .map((p: any) => ({ slug: p.slug, title: p.title, summary: String(p.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200), link: `/${p.slug}` })),
        };
    },
};
