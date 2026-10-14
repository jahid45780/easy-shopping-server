import { Schema, model } from 'mongoose';

// A measurement unit products are sold in (Piece / PC, Kilogram / KG, …).
// Products keep the unit as a plain string (product.unit); it matches a unit by
// its name or short name, case-insensitively — see unit.service.
const unitSchema = new Schema(
    {
        name: { type: String, required: [true, 'Unit name is required'], trim: true, maxlength: 40 },
        shortName: { type: String, required: [true, 'Short name is required'], trim: true, maxlength: 10 },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 100 },
    },
    { timestamps: true }
);

unitSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Unit = model('Unit', unitSchema);
