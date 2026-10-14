import { Investor, InvestorTransaction } from './investor.model';
import AppError from '../../utils/AppError';
import { dhakaDayStart, addDays } from '../analytics/analytics.period';
import { round2, toDhakaDay, dayRange, escapeRx } from '../expense/expense.utils';
import {
    runLedger, periodFigures, negativeBalanceMessage, normalizePhone, type LedgerTx,
} from './investor.utils';

interface InvestorInput {
    name?: string;
    phone?: string;
    email?: string;
    note?: string;
    isActive?: boolean;
    initialInvestment?: TxInput;
}

interface TxInput {
    type?: 'in' | 'out';
    amount?: number;
    date?: string;
    method?: string;
    reference?: string;
    note?: string;
}

/** Inclusive Dhaka days → [start, end) instants (either may be open). */
const instants = (from?: string, to?: string) => ({
    start: from ? dhakaDayStart(from) : undefined,
    end: to ? dhakaDayStart(addDays(to, 1)) : undefined,
});

const presentTx = (t: any) => ({ ...t, day: toDhakaDay(t.date) });

async function assertPhoneFree(phone: string, exceptId?: string) {
    if (!phone) return;
    const q: Record<string, unknown> = { phone };
    if (exceptId) q._id = { $ne: exceptId };
    const clash: any = await Investor.findOne(q).select('name').lean();
    if (clash) throw new AppError(409, `${clash.name} already uses the phone number ${phone}`);
}

const rethrowPhoneClash = (e: any, phone: string): never => {
    if (e?.code === 11000) throw new AppError(409, `Another investor already uses the phone number ${phone}`);
    throw e;
};

async function findInvestor(id: string) {
    const inv: any = await Investor.findById(id);
    if (!inv) throw new AppError(404, 'Investor not found');
    return inv;
}

/** The investor's ledger as plain objects (only what the balance maths needs, plus ids). */
const ledgerOf = (investorId: unknown) =>
    InvestorTransaction.find({ investor: investorId }).select('type amount date createdAt').lean() as Promise<(LedgerTx & { _id: unknown })[]>;

/** Refuse a change that would take the running balance below zero on any day. */
function assertNeverNegative(name: string, txs: LedgerTx[]) {
    const { firstNegative } = runLedger(txs);
    if (firstNegative) throw new AppError(400, negativeBalanceMessage(name, firstNegative));
}

const InvestorService = {
    /**
     * Every investor with their figures. With from/to, money in / out cover that period and
     * the balance is as at its last day; without, everything to date.
     */
    async list(q: { search?: string; status?: string; from?: string; to?: string }) {
        const filter: Record<string, unknown> = {};
        if (q.status === 'active') filter.isActive = true;
        else if (q.status === 'inactive') filter.isActive = false;
        const s = String(q.search ?? '').trim();
        if (s) {
            const rx = new RegExp(escapeRx(s), 'i');
            const digits = s.replace(/\D/g, '');
            filter.$or = [
                { name: rx },
                { email: rx },
                { note: rx },
                { phone: digits.length >= 3 ? new RegExp(escapeRx(digits)) : rx },
            ];
        }

        const investors: any[] = await Investor.find(filter).sort({ name: 1 }).limit(1000).lean();
        const txs: any[] = investors.length
            ? await InvestorTransaction.find({ investor: { $in: investors.map((i) => i._id) } })
                .select('investor type amount date createdAt')
                .lean()
            : [];

        const byInvestor = new Map<string, LedgerTx[]>();
        for (const t of txs) {
            const k = String(t.investor);
            if (!byInvestor.has(k)) byInvestor.set(k, []);
            byInvestor.get(k).push(t);
        }

        const range = instants(q.from, q.to);
        return investors.map((inv) => {
            const list = byInvestor.get(String(inv._id)) || [];
            const f = periodFigures(list, range);
            const last = list.reduce<Date | null>((m, t) => (!m || new Date(t.date) > m ? new Date(t.date) : m), null);
            return {
                ...inv,
                moneyIn: f.moneyIn,
                moneyOut: f.moneyOut,
                openingBalance: f.opening,
                balance: f.balance,
                transactionCount: f.count,
                totalTransactions: list.length,
                lastTransactionAt: last,
                lastTransactionDay: toDhakaDay(last),
            };
        });
    },

    /** All investors together. capital = money in − money out in the range (all time = the capital now). */
    async summary(q: { from?: string; to?: string } = {}) {
        const range = instants(q.from, q.to);
        const [investors, txs] = await Promise.all([
            Investor.find().select('isActive').lean(),
            InvestorTransaction.find(range.end ? { date: { $lt: range.end } } : {}).select('investor type amount date').lean(),
        ]);

        const all = periodFigures(txs as LedgerTx[], range);
        const balances = new Map<string, number>();
        for (const t of txs as any[]) {
            const k = String(t.investor);
            balances.set(k, round2((balances.get(k) || 0) + (t.type === 'in' ? t.amount : -t.amount)));
        }

        return {
            from: q.from || null,
            to: q.to || null,
            moneyIn: all.moneyIn,
            moneyOut: all.moneyOut,
            capital: all.net,
            openingBalance: all.opening,
            closingBalance: all.balance,
            transactions: all.count,
            investors: investors.length,
            activeInvestors: investors.filter((i: any) => i.isActive).length,
            withBalance: [...balances.values()].filter((b) => b > 0).length,
        };
    },

    /** One investor with their whole ledger (oldest first) and the running balance. */
    async getOne(id: string) {
        const inv: any = await Investor.findById(id).lean();
        if (!inv) throw new AppError(404, 'Investor not found');
        const txs: any[] = await InvestorTransaction.find({ investor: inv._id })
            .populate('createdBy', 'firstName lastName')
            .lean();
        const ledger = runLedger(txs);
        return {
            ...inv,
            moneyIn: ledger.moneyIn,
            moneyOut: ledger.moneyOut,
            balance: ledger.balance,
            transactions: ledger.rows.map(presentTx),
        };
    },

    async create(payload: InvestorInput, userId?: string) {
        const phone = normalizePhone(payload.phone);
        await assertPhoneFree(phone);

        const first = payload.initialInvestment;
        let inv: any;
        try {
            inv = await Investor.create({
                name: payload.name,
                phone,
                email: payload.email || '',
                note: payload.note || '',
                isActive: payload.isActive ?? true,
            });
        } catch (e) {
            rethrowPhoneClash(e, phone);
        }

        if (first) {
            try {
                await InvestorTransaction.create({
                    investor: inv._id,
                    type: 'in',
                    amount: round2(first.amount),
                    date: dhakaDayStart(first.date),
                    method: first.method || 'cash',
                    reference: first.reference || '',
                    note: first.note || '',
                    createdBy: userId || null,
                });
            } catch (e) {
                // Don't leave a half-made investor behind.
                await Investor.deleteOne({ _id: inv._id });
                throw e;
            }
        }
        return this.getOne(String(inv._id));
    },

    async update(id: string, payload: InvestorInput) {
        const inv = await findInvestor(id);
        if (payload.phone !== undefined) {
            const phone = normalizePhone(payload.phone);
            if (phone !== inv.phone) await assertPhoneFree(phone, id);
            inv.phone = phone;
        }
        for (const k of ['name', 'email', 'note', 'isActive'] as const) {
            if (payload[k] !== undefined) inv[k] = payload[k];
        }
        try {
            await inv.save();
        } catch (e) {
            rethrowPhoneClash(e, inv.phone);
        }
        return inv;
    },

    async delete(id: string) {
        const inv = await findInvestor(id);
        const used = await InvestorTransaction.countDocuments({ investor: inv._id });
        if (used > 0) {
            throw new AppError(
                409,
                `${inv.name} has ${used} transaction${used === 1 ? '' : 's'} on record. Deactivate them instead, or delete the transactions first.`,
            );
        }
        await inv.deleteOne();
    },

    /* ─── Transactions ──────────────────────────────────────────────── */

    async addTransaction(investorId: string, payload: TxInput, userId?: string) {
        const inv = await findInvestor(investorId);
        const tx = {
            type: payload.type,
            amount: round2(payload.amount),
            date: dhakaDayStart(payload.date),
            createdAt: new Date(),
        } as LedgerTx;
        if (!(tx.amount > 0)) throw new AppError(400, 'Amount must be at least ৳0.01');
        if (tx.type === 'out') assertNeverNegative(inv.name, [...(await ledgerOf(inv._id)), tx]);

        const created = await InvestorTransaction.create({
            investor: inv._id,
            type: tx.type,
            amount: tx.amount,
            date: tx.date,
            method: payload.method || 'cash',
            reference: payload.reference || '',
            note: payload.note || '',
            createdBy: userId || null,
        });
        return presentTx(created.toObject());
    },

    async updateTransaction(investorId: string, txId: string, payload: TxInput) {
        const inv = await findInvestor(investorId);
        const tx: any = await InvestorTransaction.findOne({ _id: txId, investor: inv._id });
        if (!tx) throw new AppError(404, 'Transaction not found');

        if (payload.type !== undefined) tx.type = payload.type;
        if (payload.date !== undefined) tx.date = dhakaDayStart(payload.date);
        if (payload.amount !== undefined) {
            const amount = round2(payload.amount);
            if (!(amount > 0)) throw new AppError(400, 'Amount must be at least ৳0.01');
            tx.amount = amount;
        }
        for (const k of ['method', 'reference', 'note'] as const) {
            if (payload[k] !== undefined) tx[k] = payload[k];
        }

        if (tx.isModified('type') || tx.isModified('amount') || tx.isModified('date')) {
            const others = (await ledgerOf(inv._id)).filter((t) => String(t._id) !== String(tx._id));
            assertNeverNegative(inv.name, [...others, { _id: tx._id, type: tx.type, amount: tx.amount, date: tx.date, createdAt: tx.createdAt }]);
        }
        await tx.save();
        return presentTx(tx.toObject());
    },

    async deleteTransaction(investorId: string, txId: string) {
        const inv = await findInvestor(investorId);
        const tx: any = await InvestorTransaction.findOne({ _id: txId, investor: inv._id }).lean();
        if (!tx) throw new AppError(404, 'Transaction not found');
        if (tx.type === 'in') {
            const others = (await ledgerOf(inv._id)).filter((t) => String(t._id) !== String(tx._id));
            const { firstNegative } = runLedger(others);
            if (firstNegative) {
                throw new AppError(
                    400,
                    `${negativeBalanceMessage(inv.name, firstNegative)} Remove or reduce the later money out first.`,
                );
            }
        }
        await InvestorTransaction.deleteOne({ _id: tx._id });
        return presentTx(tx);
    },

    /**
     * For the Accounts overview: capital movements in a period.
     * `from` / `to` are inclusive Dhaka days (YYYY-MM-DD); leave both out for all time.
     * capital = moneyIn − moneyOut in that period; investors = every investor on record.
     */
    async totals(range: { from?: string; to?: string } = {}): Promise<{ moneyIn: number; moneyOut: number; capital: number; investors: number }> {
        const r = dayRange(range.from, range.to);
        const [rows, investors] = await Promise.all([
            InvestorTransaction.aggregate([
                { $match: r ? { date: r } : {} },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ]),
            Investor.countDocuments(),
        ]);
        const moneyIn = round2(rows.find((x: any) => x._id === 'in')?.total || 0);
        const moneyOut = round2(rows.find((x: any) => x._id === 'out')?.total || 0);
        return { moneyIn, moneyOut, capital: round2(moneyIn - moneyOut), investors };
    },
};

export default InvestorService;
