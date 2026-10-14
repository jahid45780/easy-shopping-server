import { Schema, model } from 'mongoose';

// ── Supplier = a company we buy stock from ─────────────────────────────
// Admin-only bookkeeping: suppliers never log in and have no dashboard. Purchases
// (modules/purchase) point at a supplier; the list and detail pages read their
// totals and the products taken from those purchases.
const supplierSchema = new Schema(
    {
        name: { type: String, required: [true, 'Supplier name is required'], trim: true, maxlength: 120 },
        contactPerson: { type: String, trim: true, default: '', maxlength: 80 },
        phone: { type: String, trim: true, default: '', maxlength: 40 },
        email: { type: String, trim: true, lowercase: true, default: '', maxlength: 120 },
        country: { type: String, trim: true, default: '', maxlength: 60 },
        address: { type: String, trim: true, default: '', maxlength: 300 },
        note: { type: String, trim: true, default: '', maxlength: 1000 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// One supplier per name, whatever the letter case.
supplierSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Supplier = model('Supplier', supplierSchema);
