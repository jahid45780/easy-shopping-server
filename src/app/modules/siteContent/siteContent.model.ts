import { Schema, model } from 'mongoose';

// ── Ticker Item ──
const tickerItemSchema = new Schema({
    text: { type: String, required: true },
    emoji: { type: String, default: '' },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
}, { _id: true });

// ── Contact Info ──
const businessHourSchema = new Schema({
    day: { type: String, required: true },
    time: { type: String, required: true },
}, { _id: true });

const socialLinkSchema = new Schema({
    label: { type: String, required: true },
    url: { type: String, default: '#' },
    color: { type: String, default: '#000000' },
}, { _id: true });

// ── Main Site Content Schema ──
const siteContentSchema = new Schema({
    // Only one document — singleton
    _key: { type: String, default: 'main', unique: true },

    // ── Header Ticker ──
    ticker: [tickerItemSchema],

    // ── Contact Page ──
    contact: {
        phone: { type: String, default: '' },            // primary phone (for tel: links)
        phones: { type: [String], default: [] },         // additional phones — shown as list
        whatsapp: { type: String, default: '' },
        messenger: { type: String, default: '' },        // Facebook page username or link (for m.me)
        email: { type: String, default: '' },
        emails: { type: [String], default: [] },         // additional emails
        address: { type: String, default: '' },
        corporateOffice: { type: String, default: '' },  // corporate/head office address
        warehouse: { type: String, default: '' },        // warehouse address
        website: { type: String, default: '' },
        hours: [businessHourSchema],
        tips: [{ type: String }],
        socials: [socialLinkSchema],
        subjects: [{ type: String }],
    },

    // ── Floating Widget ──
    // An empty phone / whatsapp / messenger means "use the Contact Info value".
    floating: {
        phone: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        messenger: { type: String, default: '' },
        showPhone: { type: Boolean, default: true },
        showWhatsapp: { type: Boolean, default: true },
        showMessenger: { type: Boolean, default: true },
    },

    // ── Payment Methods (bKash / Rocket / Nagad mobile numbers + Cash on Delivery) ──
    payment: {
        bkash:  { number: { type: String, default: '' }, accountType: { type: String, default: 'Personal' }, active: { type: Boolean, default: true } },
        rocket: { number: { type: String, default: '' }, accountType: { type: String, default: 'Personal' }, active: { type: Boolean, default: true } },
        nagad:  { number: { type: String, default: '' }, accountType: { type: String, default: 'Personal' }, active: { type: Boolean, default: true } },
        // Cash on Delivery has no number/accountType — only a visibility toggle used by the checkout page.
        cod:    { active: { type: Boolean, default: true } },
        instructions: { type: String, default: 'Send Money to the number above, then submit your number, transaction ID and payment time below.' },
    },

    // ── Footer ──
    footer: {
        companyName: { type: String, default: 'Shohoz Kitchen' },
        copyright: { type: String, default: '' },
        links: [{
            label: { type: String, required: true },
            url: { type: String, required: true },
        }],
    },

    // ── Default Product Tagline ──
    defaultTagline: { type: String, default: 'Your trusted online marketplace' },

    // ── General Store Info (Settings page) ──
    general: {
        storeName: { type: String, default: 'Shohoz Kitchen' },
        tagline: { type: String, default: 'Your trusted online marketplace' },
        currency: { type: String, default: 'BDT' },
    },

    // ── SEO / Meta ──
    // Super admin only (PUT /site-content/seo). The storefront's <title>, description
    // and keywords come from here.
    seo: {
        title: { type: String, default: 'Shohoz Kitchen - Your trusted online marketplace' },
        description: { type: String, default: 'Shop the latest products with amazing deals at Shohoz Kitchen.' },
        keywords: { type: String, default: 'shohoz kitchen, shohozkitchen, ecommerce, online shopping' },
    },

    // ── Digital marketing — super admin only (PUT /site-content/marketing) ──
    // Every value here ends up inside a <script> or <meta> tag on the storefront, so it
    // is only ever an ID in a fixed shape (siteContent.validation.ts), never free text.
    marketing: {
        gtmId: { type: String, default: '' },                    // GTM-XXXXXXX
        ga4Id: { type: String, default: '' },                    // G-XXXXXXXXXX
        metaPixelId: { type: String, default: '' },              // digits
        tiktokPixelId: { type: String, default: '' },            // C1234567890ABCDEFGHI
        googleVerification: { type: String, default: '' },       // google-site-verification content
        bingVerification: { type: String, default: '' },         // msvalidate.01 content
        metaDomainVerification: { type: String, default: '' },   // facebook-domain-verification content
    },

    // ── Announcement Bar ──
    announcement: {
        message: { type: String, default: '' },
        bgColor: { type: String, default: '#E4525C' },
        textColor: { type: String, default: '#FFFFFF' },
        active: { type: Boolean, default: false },
        dismissible: { type: Boolean, default: true },
    },

    // ── Legal Pages (Terms, Privacy, Refund) ──
    legalPages: [{
        slug: { type: String, required: true, enum: ['terms', 'privacy', 'refund'] },
        title: { type: String, required: true },
        content: { type: String, default: '' },
        active: { type: Boolean, default: true },
        lastUpdated: { type: Date, default: Date.now },
    }],

    // ── Theme / Appearance ──
    theme: {
        primaryColor: { type: String, default: '#f15a24' },
        secondaryColor: { type: String, default: '#f4784b' },
        logoUrl: { type: String, default: '/logo.svg' },
        faviconUrl: { type: String, default: '' },
    },

    // ── Hero Slides ──
    heroSlides: [{
        imageUrl: { type: String, required: true },
        active: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
    }],

}, { timestamps: true });

export const SiteContent = model('SiteContent', siteContentSchema);
