import { Expense, ExpenseCategory, ExpenseCounter } from './expense.model';
import AppError from '../../utils/AppError';
import { dhakaDayStart, dhakaToday } from '../analytics/analytics.period';
import {
    round2, toDhakaDay, dayRange, voucherNo, cleanCategoryName, buildExpenseMatch,
    EXPENSE_SORTS, monthKeys, nextMonthStart, type ExpenseFilters,
} from './expense.utils';

const CI = { locale: 'en', strength: 2 } as const; // case-insensitive collation

// Seeded once, the first time the category list is opened on an empty collection
// (same rule the owner approved for Units). A marker in ExpenseCounter records that the
// seeding happened, so deleted defaults never come back, not even after every category
// is deleted, and later opens of the list never write anything.
export const DEFAULT_EXPENSE_CATEGORIES = [
    'Marketing',
    'Salary',
    'Rent',
    'Utilities',
    'Office supplies',
    'Packaging',
    'Transport',
    'Courier',
    'Food & entertainment',
    'Repairs & maintenance',
    'Bank & mobile fees',
    'Other',
];

export const EXPORT_LIMIT = 10000;

/** ExpenseCounter document that marks "default categories were seeded" (never removed). */
const CATEGORIES_SEEDED = 'categories-seeded';

type ListQuery = ExpenseFilters & { sort?: string; page?: string | number; limit?: string | number };

interface ExpenseInput {
    date?: string;
    title?: string;
    category?: string;
    paidTo?: string;
    reference?: string;
    paidBy?: string;
    amount?: number;
    note?: string;
    receiptUrl?: string;
}

/** A stored expense as the API returns it: its Dhaka `day` alongside the stored instant. */
const present = (e: any) => (e ? { ...e, day: toDhakaDay(e.date) } : e);

async function nextSeq(): Promise<number> {
    const c: any = await ExpenseCounter.findOneAndUpdate(
        { _id: 'expense' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
    ).lean();
    return c.seq;
}

/** Bring the counter up to the highest voucher in use (after a unique-index clash). */
async function resyncSeq() {
    const last: any = await Expense.findOne().sort({ seq: -1 }).select('seq').lean();
    if (last?.seq) await ExpenseCounter.updateOne({ _id: 'expense' }, { $max: { seq: last.seq } }, { upsert: true });
}

async function activeCategory(id: string) {
    const cat: any = await ExpenseCategory.findById(id).lean();
    if (!cat) throw new AppError(400, 'That category no longer exists. Pick another one.');
    if (!cat.isActive) {
        throw new AppError(400, `"${cat.name}" is switched off. Pick another category, or turn it back on under Manage categories.`);
    }
    return cat;
}

const ExpenseService = {
    /* ─── Expenses ──────────────────────────────────────────────────── */

    async list(q: ListQuery) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const match = buildExpenseMatch(q);
        const sort = EXPENSE_SORTS[q.sort || 'date_desc'] || EXPENSE_SORTS.date_desc;

        const [rows, total] = await Promise.all([
            Expense.find(match)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('category', 'name isActive')
                .populate('createdBy', 'firstName lastName')
                .lean(),
            Expense.countDocuments(match),
        ]);

        return {
            data: rows.map(present),
            meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    },

    /** Totals for the same filters: total, count, biggest category, by category, by method, last 12 months. */
    async summary(q: ExpenseFilters) {
        const match = buildExpenseMatch(q);

        // The monthly trend always covers the 12 months ending with the period's last month
        // (today when open-ended); category / method / search still apply.
        const endDay = q.to && q.to < dhakaToday() ? q.to : dhakaToday();
        const keys = monthKeys(endDay, 12);
        const trendMatch = {
            ...buildExpenseMatch(q, { withDates: false }),
            date: { $gte: dhakaDayStart(`${keys[0]}-01`), $lt: dhakaDayStart(nextMonthStart(keys[keys.length - 1])) },
        };

        const [facet, trend, categories] = await Promise.all([
            Expense.aggregate([
                { $match: match },
                {
                    $facet: {
                        totals: [{
                            $group: {
                                _id: null,
                                total: { $sum: '$amount' },
                                count: { $sum: 1 },
                                withReceipt: { $sum: { $cond: [{ $gt: ['$receiptUrl', ''] }, 1, 0] } },
                                first: { $min: '$date' },
                                last: { $max: '$date' },
                            },
                        }],
                        byCategory: [
                            { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                            { $sort: { total: -1 } },
                        ],
                        byPaidBy: [
                            { $group: { _id: '$paidBy', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                            { $sort: { total: -1 } },
                        ],
                    },
                },
            ]),
            Expense.aggregate([
                { $match: trendMatch },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: '+06:00' } },
                        total: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
            ]),
            ExpenseCategory.find().select('name isActive').lean(),
        ]);

        const f = facet[0] || {};
        const t = f.totals?.[0];
        const total = round2(t?.total || 0);
        const names = new Map<string, any>(categories.map((c: any) => [String(c._id), c]));

        const byCategory = (f.byCategory || []).map((r: any) => ({
            categoryId: r._id ? String(r._id) : null,
            name: names.get(String(r._id))?.name || 'Deleted category',
            isActive: names.get(String(r._id))?.isActive ?? false,
            total: round2(r.total),
            count: r.count,
            share: total > 0 ? round2((r.total / total) * 100) : 0,
        }));

        const byMonth = new Map<string, any>(trend.map((r: any) => [r._id, r]));

        return {
            total,
            count: t?.count || 0,
            average: t?.count ? round2(total / t.count) : 0,
            withReceipt: t?.withReceipt || 0,
            firstDay: toDhakaDay(t?.first),
            lastDay: toDhakaDay(t?.last),
            biggestCategory: byCategory[0] || null,
            byCategory,
            byPaidBy: (f.byPaidBy || []).map((r: any) => ({ paidBy: r._id, total: round2(r.total), count: r.count })),
            months: keys.map((k) => ({ month: k, total: round2(byMonth.get(k)?.total || 0), count: byMonth.get(k)?.count || 0 })),
        };
    },

    /** Every matching expense (for CSV), capped at EXPORT_LIMIT rows. */
    async export(q: ExpenseFilters & { sort?: string }) {
        const match = buildExpenseMatch(q);
        const sort = EXPENSE_SORTS[q.sort || 'date_desc'] || EXPENSE_SORTS.date_desc;
        const [rows, total] = await Promise.all([
            Expense.find(match).sort(sort).limit(EXPORT_LIMIT).populate('category', 'name').lean(),
            Expense.countDocuments(match),
        ]);
        return { rows: rows.map(present), total, truncated: total > rows.length };
    },

    async getOne(id: string) {
        const e = await Expense.findById(id)
            .populate('category', 'name isActive')
            .populate('createdBy', 'firstName lastName')
            .lean();
        if (!e) throw new AppError(404, 'Expense not found');
        return present(e);
    },

    async create(payload: ExpenseInput, userId?: string) {
        await activeCategory(payload.category as string);
        const doc = {
            date: dhakaDayStart(payload.date as string),
            title: payload.title,
            category: payload.category,
            paidTo: payload.paidTo || '',
            reference: payload.reference || '',
            paidBy: payload.paidBy || 'cash',
            amount: round2(payload.amount),
            note: payload.note || '',
            receiptUrl: payload.receiptUrl || '',
            createdBy: userId || null,
        };
        if (!(doc.amount > 0)) throw new AppError(400, 'Amount must be at least ৳0.01');

        for (let attempt = 0; ; attempt++) {
            const seq = await nextSeq();
            try {
                const created = await Expense.create({ ...doc, seq, voucherNo: voucherNo(seq) });
                return this.getOne(String(created._id));
            } catch (e: any) {
                // Only a voucher-number clash is retried (the counter fell behind).
                if (e?.code === 11000 && e?.keyPattern?.seq && attempt < 3) { await resyncSeq(); continue; }
                throw e;
            }
        }
    },

    async update(id: string, payload: ExpenseInput) {
        const e: any = await Expense.findById(id);
        if (!e) throw new AppError(404, 'Expense not found');

        if (payload.category !== undefined && String(payload.category) !== String(e.category)) {
            await activeCategory(payload.category);
            e.category = payload.category;
        }
        if (payload.date !== undefined) e.date = dhakaDayStart(payload.date);
        if (payload.amount !== undefined) {
            const amount = round2(payload.amount);
            if (!(amount > 0)) throw new AppError(400, 'Amount must be at least ৳0.01');
            e.amount = amount;
        }
        for (const k of ['title', 'paidTo', 'reference', 'paidBy', 'note', 'receiptUrl'] as const) {
            if (payload[k] !== undefined) e[k] = payload[k];
        }
        await e.save();
        return this.getOne(id);
    },

    async delete(id: string) {
        const e = await Expense.findByIdAndDelete(id).lean();
        if (!e) throw new AppError(404, 'Expense not found');
        return present(e);
    },

    /**
     * For the Accounts overview: money spent in a period.
     * `from` / `to` are inclusive Dhaka days (YYYY-MM-DD); leave both out for all time.
     */
    async totals(range: { from?: string; to?: string } = {}): Promise<{ total: number; count: number }> {
        const r = dayRange(range.from, range.to);
        const [row] = await Expense.aggregate([
            { $match: r ? { date: r } : {} },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);
        return { total: round2(row?.total || 0), count: row?.count || 0 };
    },

    /* ─── Categories ────────────────────────────────────────────────── */

    async ensureDefaultCategories() {
        // Read-only once the one-time seeding has happened (the marker is never removed).
        if (await ExpenseCounter.exists({ _id: CATEGORIES_SEEDED })) return;
        const hasCategories = (await ExpenseCategory.estimatedDocumentCount()) > 0;
        // Only the request that inserts the marker goes on, so the seeding runs once.
        let claimed = false;
        try {
            const r = await ExpenseCounter.updateOne({ _id: CATEGORIES_SEEDED }, { $setOnInsert: { seq: 1 } }, { upsert: true });
            claimed = r.upsertedCount > 0;
        } catch (e: any) {
            if (e?.code !== 11000) throw e;   // another request inserted it at the same moment
        }
        // Categories set up before the marker existed: just remember, don't add defaults.
        if (!claimed || hasCategories) return;
        // Upserts, so a default can't be duplicated.
        await Promise.all(DEFAULT_EXPENSE_CATEGORIES.map((name, i) =>
            ExpenseCategory.updateOne(
                { name },
                { $setOnInsert: { name, isActive: true, sortOrder: i + 1 } },
                { upsert: true, collation: CI },
            )
        ));
    },

    async listCategories() {
        await this.ensureDefaultCategories();
        const [cats, usage] = await Promise.all([
            ExpenseCategory.find().sort({ sortOrder: 1, name: 1 }).lean(),
            Expense.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$amount' }, last: { $max: '$date' } } },
            ]),
        ]);
        const byId = new Map<string, any>(usage.map((u: any) => [String(u._id), u]));
        return cats.map((c: any) => {
            const u = byId.get(String(c._id));
            return { ...c, expenseCount: u?.count || 0, total: round2(u?.total || 0), lastUsedDay: toDhakaDay(u?.last) };
        });
    },

    async assertCategoryNameFree(name: string, exceptId?: string) {
        const q: Record<string, unknown> = { name };
        if (exceptId) q._id = { $ne: exceptId };
        const clash: any = await ExpenseCategory.findOne(q).collation(CI).select('name').lean();
        if (clash) throw new AppError(409, `There is already a category called "${clash.name}"`);
    },

    async createCategory(payload: { name: string; isActive?: boolean; sortOrder?: number }) {
        const name = cleanCategoryName(payload.name);
        if (!name) throw new AppError(400, 'Category name is required');
        await this.assertCategoryNameFree(name);
        let sortOrder = payload.sortOrder;
        if (sortOrder === undefined) {
            const last: any = await ExpenseCategory.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
            sortOrder = Math.min(10000, (last?.sortOrder || 0) + 1);
        }
        try {
            return await ExpenseCategory.create({ name, isActive: payload.isActive ?? true, sortOrder });
        } catch (e: any) {
            if (e?.code === 11000) throw new AppError(409, `There is already a category called "${name}"`);
            throw e;
        }
    },

    async updateCategory(id: string, payload: { name?: string; isActive?: boolean; sortOrder?: number }) {
        const cat: any = await ExpenseCategory.findById(id);
        if (!cat) throw new AppError(404, 'Category not found');
        if (payload.name !== undefined) {
            const name = cleanCategoryName(payload.name);
            if (!name) throw new AppError(400, 'Category name is required');
            if (name !== cat.name) await this.assertCategoryNameFree(name, id);
            cat.name = name;
        }
        if (payload.isActive !== undefined) cat.isActive = payload.isActive;
        if (payload.sortOrder !== undefined) cat.sortOrder = payload.sortOrder;
        try {
            await cat.save();
        } catch (e: any) {
            if (e?.code === 11000) throw new AppError(409, `There is already a category called "${cat.name}"`);
            throw e;
        }
        return cat;
    },

    async deleteCategory(id: string) {
        const cat: any = await ExpenseCategory.findById(id);
        if (!cat) throw new AppError(404, 'Category not found');
        const used = await Expense.countDocuments({ category: cat._id });
        if (used > 0) {
            throw new AppError(
                409,
                `${used} expense${used === 1 ? ' is' : 's are'} filed under "${cat.name}". Move ${used === 1 ? 'it' : 'them'} to another category first, or deactivate it instead.`,
            );
        }
        await cat.deleteOne();
    },
};

export default ExpenseService;
