import { Unit } from './unit.model';
import { Product } from '../product/product.model';
import AppError from '../../utils/AppError';

const CI = { locale: 'en', strength: 2 } as const; // case-insensitive collation

// Seeded once, the first time the units list is opened on an empty collection.
// Deleted defaults do not come back.
export const DEFAULT_UNITS = [
    { name: 'Piece', shortName: 'PC' },
    { name: 'Set', shortName: 'SET' },
    { name: 'Pair', shortName: 'PAIR' },
    { name: 'Pack', shortName: 'PACK' },
    { name: 'Box', shortName: 'BOX' },
    { name: 'Dozen', shortName: 'DZ' },
    { name: 'Roll', shortName: 'ROLL' },
    { name: 'Kilogram', shortName: 'KG' },
    { name: 'Gram', shortName: 'G' },
    { name: 'Liter', shortName: 'L' },
    { name: 'Milliliter', shortName: 'ML' },
    { name: 'Meter', shortName: 'M' },
    { name: 'Centimeter', shortName: 'CM' },
    { name: 'Inch', shortName: 'IN' },
];

const lower = (s: unknown) => String(s ?? '').trim().toLowerCase();
const titleCase = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** The string a product stores for this unit (product.unit). */
export const unitKey = (u: { name: string }) => lower(u.name);

/** Does a product's unit string refer to this unit? (name or short name, any case) */
const matches = (u: { name: string; shortName: string }, value: string) =>
    lower(u.name) === lower(value) || lower(u.shortName) === lower(value);

const UnitService = {
    async ensureDefaults() {
        if (await Unit.estimatedDocumentCount()) return;
        // Upserts, so two first-time requests racing each other can't duplicate a default.
        await Promise.all(DEFAULT_UNITS.map((u, i) =>
            Unit.updateOne({ name: u.name }, { $setOnInsert: { ...u, isActive: true, sortOrder: i + 1 } }, { upsert: true, collation: CI })
        ));
    },

    // A unit typed on a product (or imported by CSV) that isn't in the list yet is added,
    // so the Units page always shows every unit the catalogue uses.
    async syncFromProducts() {
        const [used, units] = await Promise.all([
            Product.distinct('unit', { isDeleted: false }),
            Unit.find().select('name shortName').lean(),
        ]);
        const missing = (used as unknown[])
            .map((v) => String(v ?? '').trim())
            .filter((v) => v && !units.some((u: any) => matches(u, v)));
        const seen = new Set<string>();
        for (const v of missing) {
            if (seen.has(lower(v))) continue;
            seen.add(lower(v));
            await Unit.updateOne(
                { name: titleCase(v) },
                { $setOnInsert: { name: titleCase(v), shortName: v.toUpperCase().slice(0, 10), isActive: true } },
                { upsert: true, collation: CI },
            );
        }
    },

    async getAll(query: Record<string, unknown>) {
        await this.ensureDefaults();
        await this.syncFromProducts();

        const filter: Record<string, unknown> = {};
        if (query.scope === 'active') filter.isActive = true;

        const [units, counts] = await Promise.all([
            Unit.find(filter).sort({ sortOrder: 1, name: 1 }).lean(),
            Product.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: { $toLower: { $ifNull: ['$unit', 'piece'] } }, n: { $sum: 1 } } },
            ]),
        ]);

        return units.map((u: any) => ({
            ...u,
            key: unitKey(u),
            productCount: counts
                .filter((c: any) => matches(u, c._id))
                .reduce((n: number, c: any) => n + c.n, 0),
        }));
    },

    // A unit's name and short name must not collide with any other unit's name or short name —
    // otherwise a product's unit string could match two units.
    async assertNoClash(name: string, shortName: string, exceptId?: string) {
        const others = await Unit.find(exceptId ? { _id: { $ne: exceptId } } : {}).select('name shortName').lean();
        const clash = others.find((u: any) => matches(u, name) || matches(u, shortName));
        if (clash) {
            throw new AppError(409, `"${(clash as any).name} (${(clash as any).shortName})" already uses that name or short name`);
        }
    },

    async create(payload: { name: string; shortName: string; isActive?: boolean }) {
        const name = titleCase(payload.name);
        const shortName = payload.shortName.trim();
        await this.assertNoClash(name, shortName);
        return Unit.create({ name, shortName, isActive: payload.isActive ?? true });
    },

    async update(id: string, payload: { name?: string; shortName?: string; isActive?: boolean }) {
        const unit = await Unit.findById(id);
        if (!unit) throw new AppError(404, 'Unit not found');

        const name = payload.name !== undefined ? titleCase(payload.name) : unit.name;
        const shortName = payload.shortName !== undefined ? payload.shortName.trim() : unit.shortName;
        const renamed = lower(name) !== lower(unit.name) || lower(shortName) !== lower(unit.shortName);

        if (renamed) {
            await this.assertNoClash(name, shortName, id);
            // Products point at the unit by its name/short name — move them to the new name.
            await Product.updateMany(
                { unit: { $in: [unit.name, unit.shortName] } },
                { $set: { unit: lower(name) } },
            ).collation(CI);
        }

        unit.name = name;
        unit.shortName = shortName;
        if (payload.isActive !== undefined) unit.isActive = payload.isActive;
        await unit.save();
        return unit;
    },

    async delete(id: string) {
        const unit = await Unit.findById(id);
        if (!unit) throw new AppError(404, 'Unit not found');
        const inUse = await Product.countDocuments({ isDeleted: false, unit: { $in: [unit.name, unit.shortName] } }).collation(CI);
        if (inUse > 0) {
            throw new AppError(409, `${inUse} product${inUse === 1 ? ' uses' : 's use'} "${unit.name}" — switch them to another unit, or deactivate it instead`);
        }
        await unit.deleteOne();
    },
};

export default UnitService;
