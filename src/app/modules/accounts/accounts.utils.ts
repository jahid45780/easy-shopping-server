import { monthKeys, nextMonthStart, round2 } from '../expense/expense.utils';
import { dhakaDayStart, dhakaToday } from '../analytics/analytics.period';

/*
 * Pure helpers for the Accounts overview. No database access here, so they can be
 * tested offline. Money is BDT, a plain Number rounded to 2 decimals.
 */

export interface OverviewRange {
    /** inclusive Dhaka days, YYYY-MM-DD; leave both out for all time */
    from?: string;
    to?: string;
}

/** Number of months the trend chart shows. */
export const SERIES_MONTHS = 12;

/**
 * The months the chart covers: the 12 months ending with the period's last month,
 * never later than the current month (a period that ends in the future stops today).
 * `start`/`end` are the UTC instants of 00:00 Dhaka on the first month's 1st and on
 * the 1st of the month after the last one (exclusive).
 */
export function seriesWindow(range: OverviewRange, today: string = dhakaToday()) {
    const endDay = range.to && range.to < today ? range.to : today;
    const keys = monthKeys(endDay, SERIES_MONTHS);
    return {
        keys,
        start: dhakaDayStart(`${keys[0]}-01`),
        end: dhakaDayStart(nextMonthStart(keys[keys.length - 1])),
    };
}

export interface MonthRow {
    /** YYYY-MM (Dhaka) */
    _id: string;
    total?: number;
    count?: number;
}

/** Month rows from an aggregate → one value per key, 0 where the month had nothing. */
export function fillSeries(keys: string[], rows: MonthRow[] | undefined) {
    const byKey = new Map<string, MonthRow>();
    for (const r of rows || []) if (r && typeof r._id === 'string') byKey.set(r._id, r);
    return keys.map((k) => ({ total: round2(byKey.get(k)?.total || 0), count: byKey.get(k)?.count || 0 }));
}

export interface MonthPoint {
    month: string;
    sales: number;
    orders: number;
    expenses: number;
    purchasesPaid: number;
    payouts: number;
}

export function buildMonthly(
    keys: string[],
    series: { sales?: MonthRow[]; expenses?: MonthRow[]; purchasesPaid?: MonthRow[]; payouts?: MonthRow[] },
): MonthPoint[] {
    const sales = fillSeries(keys, series.sales);
    const expenses = fillSeries(keys, series.expenses);
    const purchasesPaid = fillSeries(keys, series.purchasesPaid);
    const payouts = fillSeries(keys, series.payouts);
    return keys.map((month, i) => ({
        month,
        sales: sales[i].total,
        orders: sales[i].count,
        expenses: expenses[i].total,
        purchasesPaid: purchasesPaid[i].total,
        payouts: payouts[i].total,
    }));
}

/* ─── The overview's derived figures ─────────────────────────────────── */

export interface OverviewParts {
    investment: { moneyIn: number; moneyOut: number; capital: number; investors: number };
    sales: {
        total: number; orders: number; deliveryCharges: number; discount: number;
        paidOnline: number; paidOnlineOrders: number; codTotal: number; codOrders: number;
    };
    payouts: {
        received: number; count: number; codCollected: number; deliveryBills: number; codFee: number;
        withoutBreakdown: number; lastReceivedAt: Date | string | null;
    };
    expenses: { total: number; count: number };
    purchases: { total: number; paid: number; due: number; count: number; paymentsMade: number; paymentCount: number };
    stock: { value: number; units: number; uncosted: number; products: number };
}

/**
 * Everything the page shows that is worked out from the parts:
 *
 *  salesNotPaidOut = sales − payouts received (an estimate: what the courier has not
 *  sent yet, plus money that never goes through it). `gap` splits it into
 *    paidOnline      delivered orders paid online (bKash, card …), never collected by the courier
 *    courierCharges  delivery bills + COD fees the courier kept from the payouts
 *    rest            the remainder: COD the courier still holds or has not settled, and
 *                    timing (a payout in the period for a delivery before it). Can be < 0.
 *
 *  cash (an estimate from what is recorded here):
 *    in  = capital in + courier payouts received + online payments on delivered orders
 *    out = expenses + payments to suppliers + capital taken back out
 */
export function deriveOverview(p: OverviewParts) {
    const salesNotPaidOut = round2(p.sales.total - p.payouts.received);
    const courierCharges = round2(p.payouts.deliveryBills + p.payouts.codFee);
    const gap = {
        total: salesNotPaidOut,
        paidOnline: p.sales.paidOnline,
        courierCharges,
        rest: round2(salesNotPaidOut - p.sales.paidOnline - courierCharges),
    };

    const cashIn = { capital: p.investment.moneyIn, payouts: p.payouts.received, online: p.sales.paidOnline };
    const cashOut = { expenses: p.expenses.total, suppliers: p.purchases.paymentsMade, capitalOut: p.investment.moneyOut };
    const moneyIn = round2(cashIn.capital + cashIn.payouts + cashIn.online);
    const moneyOut = round2(cashOut.expenses + cashOut.suppliers + cashOut.capitalOut);

    return {
        salesNotPaidOut,
        gap,
        cash: { moneyIn, moneyOut, position: round2(moneyIn - moneyOut), estimate: true as const, in: cashIn, out: cashOut },
    };
}

/**
 * true when no money moved in the period: no capital, delivered order, payout, expense,
 * purchase or supplier payment (the page shows its empty state). Stock is a snapshot of
 * today, not of the period, so it does not count.
 */
export function isEmptyOverview(p: OverviewParts): boolean {
    return (
        p.investment.moneyIn === 0 && p.investment.moneyOut === 0 &&
        p.sales.orders === 0 &&
        p.payouts.count === 0 &&
        p.expenses.count === 0 &&
        p.purchases.count === 0 && p.purchases.paymentCount === 0
    );
}
