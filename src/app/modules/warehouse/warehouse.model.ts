import { Schema, model } from 'mongoose';

// A stock location (office, godown…). Purchases are received into one and Transfers
// move goods between two. Admin-only bookkeeping: product.stock stays one total.
const warehouseSchema = new Schema(
    {
        name: { type: String, required: [true, 'Warehouse name is required'], trim: true, maxlength: 80 },
        location: { type: String, trim: true, default: '', maxlength: 200 },
        isActive: { type: Boolean, default: true },
        // Optional contact details, for the admin's own reference.
        contactPerson: { type: String, trim: true, default: '', maxlength: 80 },
        phone: { type: String, trim: true, default: '', maxlength: 30 },
        note: { type: String, trim: true, default: '', maxlength: 500 },
    },
    { timestamps: true }
);

warehouseSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Warehouse = model('Warehouse', warehouseSchema);
