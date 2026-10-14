import { Attribute, LinkedKey, keyOf, cleanValues } from './attribute.model';
import { Product } from '../product/product.model';
import AppError from '../../utils/AppError';

/**
 * Two-way link between global attributes and products.
 *
 *   Product → Attribute: every list fetch merges each distinct colour / size found on
 *   non-deleted products into the linked Color / Size attribute (creating it if missing),
 *   so nothing typed on a product is ever missing from the Attributes page.
 *
 *   Attribute → Product: the product form reads this list for its dropdowns, and adds a
 *   brand-new value it is given straight to the attribute (PATCH addValues).
 *
 * Products are never modified here. Removing a value that products still use hides it
 * (hiddenValues) so the merge doesn't bring it straight back; it stays hidden only while
 * some product still carries it, and adding it again un-hides it.
 */

const LINKS: Record<LinkedKey, { name: string; aliases: string[]; fields: string[]; noun: string }> = {
    color: { name: 'Color', aliases: ['color', 'colour', 'colors', 'colours'], fields: ['colors', 'variants.color'], noun: 'colours' },
    size: { name: 'Size', aliases: ['size', 'sizes'], fields: ['sizes', 'variants.size'], noun: 'sizes' },
};
const LINKED: LinkedKey[] = ['color', 'size'];

const NOT_DELETED = { isDeleted: { $ne: true } };

const isDuplicate = (e: any) => e?.code === 11000;
const isVersionError = (e: any) => e?.name === 'VersionError';

type Usage = {
    /** lower-cased value → number of products using it */
    color: Map<string, number>;
    size: Map<string, number>;
    /** lower-cased colour name → its most common hex on products */
    swatch: Map<string, string>;
    /** products using at least one colour / size */
    products: { color: number; size: number };
};

type UpdatePayload = {
    name?: string;
    values?: string[];
    addValue?: string;
    addValues?: string[];
    removeValue?: string;
    isActive?: boolean;
};

/* ─── Product usage (one aggregate over non-deleted products) ─── */

// Array of trimmed, lower-cased strings (non-strings dropped), for per-product de-duplication.
const lowerStrings = (expr: string) => ({
    $map: {
        input: {
            $filter: { input: { $ifNull: [expr, []] }, as: 'x', cond: { $eq: [{ $type: '$$x' }, 'string'] } },
        },
        as: 'x',
        in: { $toLower: { $trim: { input: '$$x' } } },
    },
});

const countBy = (field: string) => [
    { $unwind: `$${field}` },
    { $match: { [field]: { $ne: '' } } },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
];

async function productUsage(): Promise<Usage> {
    const [res] = await Product.aggregate([
        { $match: NOT_DELETED },
        {
            $project: {
                // $setUnion de-duplicates within a product, so counts are "number of products".
                c: { $setUnion: [lowerStrings('$colors'), lowerStrings('$variants.color')] },
                s: { $setUnion: [lowerStrings('$sizes'), lowerStrings('$variants.size')] },
                pairs: {
                    $concatArrays: [
                        { $zip: { inputs: [{ $ifNull: ['$colors', []] }, { $ifNull: ['$colorHex', []] }] } },
                        { $map: { input: { $ifNull: ['$variants', []] }, as: 'v', in: ['$$v.color', '$$v.colorHex'] } },
                    ],
                },
            },
        },
        {
            $facet: {
                color: countBy('c'),
                size: countBy('s'),
                colorProducts: [{ $match: { 'c.0': { $exists: true } } }, { $count: 'n' }],
                sizeProducts: [{ $match: { 's.0': { $exists: true } } }, { $count: 'n' }],
                swatch: [
                    { $unwind: '$pairs' },
                    { $project: { name: { $arrayElemAt: ['$pairs', 0] }, hex: { $arrayElemAt: ['$pairs', 1] } } },
                    { $match: { name: { $type: 'string', $ne: '' }, hex: { $type: 'string', $regex: '^#[0-9a-fA-F]{6}$' } } },
                    { $group: { _id: { name: { $toLower: { $trim: { input: '$name' } } }, hex: { $toLower: '$hex' } }, n: { $sum: 1 } } },
                    { $sort: { n: -1 } },
                    { $group: { _id: '$_id.name', hex: { $first: '$_id.hex' } } },
                ],
            },
        },
    ]);
    const toMap = (rows: { _id: string; n: number }[] = []) => new Map(rows.map((r) => [r._id, r.n]));
    return {
        color: toMap(res?.color),
        size: toMap(res?.size),
        swatch: new Map((res?.swatch || []).map((r: { _id: string; hex: string }) => [r._id, r.hex])),
        products: { color: res?.colorProducts?.[0]?.n || 0, size: res?.sizeProducts?.[0]?.n || 0 },
    };
}

/* ─── Linked Color / Size attributes ─── */

async function ensureLinked(key: LinkedKey) {
    const existing = await Attribute.findOne({ linkedTo: key });
    if (existing) return existing;
    try {
        // Adopt an attribute the admin already made under that name ("Color", "Colour"…).
        const byName = await Attribute.findOne({ nameKey: { $in: LINKS[key].aliases }, linkedTo: { $exists: false } }).sort({ createdAt: 1 });
        if (byName) {
            byName.linkedTo = key;
            return await byName.save();
        }
        return await Attribute.create({ name: LINKS[key].name, linkedTo: key });
    } catch (e) {
        if (!isDuplicate(e) && !isVersionError(e)) throw e;
        // A concurrent request linked / created it first.
        const again = await Attribute.findOne({ linkedTo: key });
        if (!again) throw e;
        return again;
    }
}

/** Merge product values into a linked attribute (distinct() per product field). */
async function syncLinked(doc: any, key: LinkedKey, used: Map<string, number>) {
    const lists = await Promise.all(LINKS[key].fields.map((f) => Product.distinct(f, NOT_DELETED)));
    const fromProducts = cleanValues(lists.flat());

    const have = new Set<string>((doc.values || []).map(keyOf));
    // A removed value stays hidden only while some product still carries it.
    const hidden = (doc.hiddenValues || []).filter((v: string) => (used.get(keyOf(v)) || 0) > 0);
    const hiddenKeys = new Set<string>(hidden.map(keyOf));
    const missing = fromProducts.filter((v) => !have.has(keyOf(v)) && !hiddenKeys.has(keyOf(v)));

    if (!missing.length && hidden.length === (doc.hiddenValues || []).length) return;
    doc.values = [...doc.values, ...missing];
    doc.hiddenValues = hidden;
    try {
        await doc.save();
    } catch (e) {
        // Someone saved it meanwhile — the next fetch merges again.
        if (!isVersionError(e)) throw e;
    }
}

/* ─── Output shape ─── */

function present(d: any, usage: Usage) {
    const key: LinkedKey | undefined = d.linkedTo || undefined;
    const used = key ? usage[key] : null;
    const info = (v: string) => ({
        value: v,
        // null = not tracked (only Color / Size are linked to products)
        products: used ? used.get(keyOf(v)) || 0 : null,
        hex: key === 'color' ? usage.swatch.get(keyOf(v)) || null : null,
    });
    return {
        _id: d._id,
        name: d.name,
        values: d.values || [],
        valueInfo: (d.values || []).map(info),
        hiddenValues: key ? (d.hiddenValues || []).map(info).filter((h: { products: number | null }) => (h.products || 0) > 0) : [],
        linkedTo: key || null,
        productCount: key ? usage.products[key] : null,
        isActive: d.isActive !== false,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
    };
}

/* ─── Service ─── */

const AttributeService = {
    async getAll() {
        const [color, size] = await Promise.all(LINKED.map(ensureLinked));
        const usage = await productUsage();
        await Promise.all([syncLinked(color, 'color', usage.color), syncLinked(size, 'size', usage.size)]);

        const docs = await Attribute.find().sort({ createdAt: 1 }).lean();
        const rank = (d: any) => (d.linkedTo === 'color' ? 0 : d.linkedTo === 'size' ? 1 : 2);
        docs.sort((a, b) => rank(a) - rank(b)); // stable: Color, Size, then oldest first
        return docs.map((d) => present(d, usage));
    },

    async create(payload: { name: string; values?: string[]; isActive?: boolean }) {
        const name = payload.name.trim();
        const nameKey = keyOf(name);
        if (await Attribute.exists({ nameKey })) throw new AppError(409, `An attribute named "${name}" already exists`);
        for (const k of LINKED) {
            if (LINKS[k].aliases.includes(nameKey) && (await Attribute.exists({ linkedTo: k }))) {
                throw new AppError(409, `"${LINKS[k].name}" already holds product ${LINKS[k].noun} — add values to it instead`);
            }
        }
        try {
            return await Attribute.create({ name, values: cleanValues(payload.values || []), isActive: payload.isActive ?? true });
        } catch (e) {
            if (isDuplicate(e)) throw new AppError(409, `An attribute named "${name}" already exists`);
            throw e;
        }
    },

    /**
     * Rename, replace values, add or remove a value, turn on/off.
     * Returns the saved attribute plus the values this request removed, each with the
     * number of products that still use it (those products are left untouched).
     */
    async update(id: string, payload: UpdatePayload) {
        for (let attempt = 0; ; attempt++) {
            const doc: any = await Attribute.findById(id);
            if (!doc) throw new AppError(404, 'Attribute not found');
            const key: LinkedKey | undefined = doc.linkedTo || undefined;

            if (payload.name !== undefined) {
                const name = payload.name.trim();
                if (await Attribute.exists({ nameKey: keyOf(name), _id: { $ne: doc._id } })) {
                    throw new AppError(409, `An attribute named "${name}" already exists`);
                }
                doc.name = name;
            }
            if (payload.isActive !== undefined) doc.isActive = payload.isActive;

            let next: string[] = payload.values ? cleanValues(payload.values) : cleanValues(doc.values || []);
            const adds = cleanValues([...(payload.addValue ? [payload.addValue] : []), ...(payload.addValues || [])]);
            if (adds.length) next = cleanValues([...next, ...adds]);
            if (payload.removeValue !== undefined) {
                const k = keyOf(payload.removeValue);
                if (!next.some((v) => keyOf(v) === k)) throw new AppError(404, `"${payload.removeValue.trim()}" is not in ${doc.name}`);
                next = next.filter((v) => keyOf(v) !== k);
            }

            const nextKeys = new Set(next.map(keyOf));
            const dropped: string[] = (doc.values || []).filter((v: string) => !nextKeys.has(keyOf(v)));
            // Re-added values are no longer hidden.
            const hidden: string[] = (doc.hiddenValues || []).filter((v: string) => !nextKeys.has(keyOf(v)));
            const removed: { value: string; products: number }[] = [];
            if (dropped.length) {
                const used = key ? (await productUsage())[key] : null;
                for (const v of dropped) {
                    const n = used ? used.get(keyOf(v)) || 0 : 0;
                    // Still on products → keep it out of the product merge.
                    if (key && n > 0) hidden.push(v);
                    removed.push({ value: v, products: n });
                }
            }
            doc.values = next;
            doc.hiddenValues = hidden;

            try {
                const saved = await doc.save();
                return { attribute: saved, removed };
            } catch (e) {
                if (isDuplicate(e)) throw new AppError(409, `An attribute named "${doc.name}" already exists`);
                // Changed by a concurrent request (e.g. the product merge) — re-read and retry once.
                if (isVersionError(e) && attempt === 0) continue;
                if (isVersionError(e)) throw new AppError(409, 'This attribute was changed at the same time. Please try again.');
                throw e;
            }
        }
    },

    async delete(id: string) {
        const doc = await Attribute.findById(id);
        if (!doc) throw new AppError(404, 'Attribute not found');
        const key = doc.linkedTo as LinkedKey | undefined;
        if (key) {
            throw new AppError(400, `${doc.name} is linked to product ${LINKS[key].noun}, so it can't be deleted. Turn it off or remove individual values instead.`);
        }
        await doc.deleteOne();
        return doc;
    },
};

export default AttributeService;
