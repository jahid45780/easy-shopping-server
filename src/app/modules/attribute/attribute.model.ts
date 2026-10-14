import { Schema, model } from 'mongoose';

/**
 * Global variant attributes (Color, Size, …) — the predefined values the product
 * form offers in its dropdowns.
 *
 * Two attributes are "linked" to product fields (see attribute.service.ts):
 *   linkedTo 'color' ↔ product.colors[] + product.variants[].color
 *   linkedTo 'size'  ↔ product.sizes[]  + product.variants[].size
 * Their values are kept in sync with what products actually use.
 */
export const LINKED_KEYS = ['color', 'size'] as const;
export type LinkedKey = (typeof LINKED_KEYS)[number];

/** Trim + lower-case: how names and values are compared (case-insensitive). */
export const keyOf = (s: string) => String(s ?? '').trim().toLowerCase();

/** Trim, drop empties and case-insensitive duplicates — first spelling and order win. */
export const cleanValues = (list: unknown[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
        if (typeof raw !== 'string') continue;
        const v = raw.trim();
        const k = v.toLowerCase();
        if (!v || seen.has(k)) continue;
        seen.add(k);
        out.push(v);
    }
    return out;
};

const attributeSchema = new Schema(
    {
        name: { type: String, required: [true, 'Attribute name is required'], trim: true, maxlength: 60 },
        // Lower-cased name; the unique index makes names unique case-insensitively.
        nameKey: { type: String, required: true, unique: true },
        // Ordered, unique case-insensitively (normalised in pre-validate).
        values: { type: [String], default: [] },
        // Values the admin removed while products still used them. The product → attribute
        // merge skips these so a removal sticks; adding the value again clears it.
        hiddenValues: { type: [String], default: [] },
        // Set only on the built-in Color / Size attributes.
        linkedTo: { type: String, enum: LINKED_KEYS as unknown as string[] },
        // Off = not offered in the product form's dropdown.
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true, optimisticConcurrency: true }
);

// At most one attribute per linked product field.
attributeSchema.index({ linkedTo: 1 }, { unique: true, partialFilterExpression: { linkedTo: { $type: 'string' } } });

attributeSchema.pre('validate', function (next) {
    this.name = String(this.name ?? '').trim();
    this.nameKey = keyOf(this.name);
    this.values = cleanValues(this.values || []) as any;
    const kept = new Set(this.values.map(keyOf));
    this.hiddenValues = cleanValues(this.hiddenValues || []).filter((v) => !kept.has(keyOf(v))) as any;
    next();
});

export const Attribute = model('Attribute', attributeSchema);
