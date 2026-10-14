import { PipelineStage } from 'mongoose';
import AppError from '../../utils/AppError';
import { Order } from '../order/order.model';
import { CourierPayout } from '../courierPayout/courierPayout.model';
import { Expense } from '../expense/expense.model';
import { Purchase } from '../purchase/purchase.model';
import ExpenseService from '../expense/expense.service';
import InvestorService from '../investor/investor.service';
import PurchaseService from '../purchase/purchase.service';
import InventoryService from '../inventory/inventory.service';
import { REPORT_TZ, dhakaToday } from '../analytics/analytics.period';
import { overviewQuery } from './accounts.validation';
import { dayRange, round2 } from '../expense/expense.utils';
import {
    MonthRow, OverviewParts, OverviewRange, buildMonthly, deriveOverview, isEmptyOverview, seriesWindow,
} from './accounts.utils';

// ════════════════════════════════════════════════════════════════════════
//  ACCOUNTS OVERVIEW (admin only, read-only)
//  One screen for the money side of the business, since the beginning or for a
//  period. Every figure is read from the module that owns it:
//   • investment  capital in / taken back out            investor module
//   • sales       delivered orders at order.total        orders, dated by delivery
//                 (items − discount + delivery charge)
//   • payouts     cash Steadfast actually sent us        courierPayout, by receivedAt
//   • expenses    what was recorded                      expense module
//   • purchases   placed POs (not drafts or cancelled)   purchase module, by orderDate;
//                 cash paid to suppliers by payment date
//   • stock       today's stock × average cost           inventory.getSummary() (not per period)
//  Periods are Bangladesh calendar days (both inclusive). Nothing here writes.
// ════════════════════════════════════════════════════════════════════════

type Range = ReturnType<typeof dayRange>;

const monthOf = (field: string) => ({ $dateToString: { format: '%Y-%m', date: field, timezone: REPORT_TZ } });

/**
 * When an order was delivered: the latest "delivered" entry on its timeline, or its
 * last update for orders delivered before the timeline recorded it. Same rule as the
 * Courier payouts page.
 */
const DELIVERED_AT = {
    $ifNull: [
        {
            $max: {
                $map: {
                    input: { $filter: { input: { $ifNull: ['$timeline', []] }, as: 't', cond: { $eq: ['$$t.status', 'delivered'] } } },
                    as: 't',
                    in: '$$t.createdAt',
                },
            },
        },
        '$updatedAt',
    ],
};

const PAID_ONLINE = { $and: [{ $ne: ['$paymentMethod', 'cod'] }, { $eq: ['$paymentStatus', 'paid'] }] };

/** Delivered orders: totals for the period and per month for the chart, in one pass. */
async function salesPart(range: Range, win: { start: Date; end: Date }) {
    const pipeline: PipelineStage[] = [
        { $match: { status: 'delivered' } },
        {
            $project: {
                total: { $ifNull: ['$total', 0] },
                shippingCost: { $ifNull: ['$shippingCost', 0] },
                discount: { $ifNull: ['$discount', 0] },
                paymentMethod: 1,
                paymentStatus: 1,
                deliveredAt: DELIVERED_AT,
            },
        },
        {
            $facet: {
                totals: [
                    ...(range ? [{ $match: { deliveredAt: range } }] : []),
                    {
                        $group: {
                            _id: null,
                            orders: { $sum: 1 },
                            total: { $sum: '$total' },
                            deliveryCharges: { $sum: '$shippingCost' },
                            discount: { $sum: '$discount' },
                            paidOnline: { $sum: { $cond: [PAID_ONLINE, '$total', 0] } },
                            paidOnlineOrders: { $sum: { $cond: [PAID_ONLINE, 1, 0] } },
                            codTotal: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, '$total', 0] } },
                            codOrders: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, 1, 0] } },
                        },
                    },
                ],
                monthly: [
                    { $match: { deliveredAt: { $gte: win.start, $lt: win.end } } },
                    { $group: { _id: monthOf('$deliveredAt'), total: { $sum: '$total' }, count: { $sum: 1 } } },
                ],
            },
        },
    ];
    const [out] = await Order.aggregate(pipeline);
    const t = out?.totals?.[0];
    return {
        totals: {
            total: round2(t?.total || 0),
            orders: t?.orders || 0,
            deliveryCharges: round2(t?.deliveryCharges || 0),
            discount: round2(t?.discount || 0),
            paidOnline: round2(t?.paidOnline || 0),
            paidOnlineOrders: t?.paidOnlineOrders || 0,
            codTotal: round2(t?.codTotal || 0),
            codOrders: t?.codOrders || 0,
        },
        monthly: (out?.monthly || []) as MonthRow[],
    };
}

/** Courier payouts (money Steadfast sent us), dated by the day it arrived. */
async function payoutsPart(range: Range, win: { start: Date; end: Date }) {
    const [out] = await CourierPayout.aggregate([
        { $project: { receivedAt: 1, amount: 1, codCollected: 1, deliveryBills: 1, codFee: 1 } },
        {
            $facet: {
                totals: [
                    ...(range ? [{ $match: { receivedAt: range } }] : []),
                    {
                        $group: {
                            _id: null,
                            count: { $sum: 1 },
                            received: { $sum: { $ifNull: ['$amount', 0] } },
                            codCollected: { $sum: { $ifNull: ['$codCollected', 0] } },
                            deliveryBills: { $sum: { $ifNull: ['$deliveryBills', 0] } },
                            codFee: { $sum: { $ifNull: ['$codFee', 0] } },
                            // Recorded by hand without a breakdown: the money is real, the charges unknown.
                            withoutBreakdown: { $sum: { $cond: [{ $gt: ['$codCollected', 0] }, 0, 1] } },
                            lastReceivedAt: { $max: '$receivedAt' },
                        },
                    },
                ],
                monthly: [
                    { $match: { receivedAt: { $gte: win.start, $lt: win.end } } },
                    { $group: { _id: monthOf('$receivedAt'), total: { $sum: '$amount' }, count: { $sum: 1 } } },
                ],
            },
        },
    ] as PipelineStage[]);
    const t = out?.totals?.[0];
    return {
        totals: {
            received: round2(t?.received || 0),
            count: t?.count || 0,
            codCollected: round2(t?.codCollected || 0),
            deliveryBills: round2(t?.deliveryBills || 0),
            codFee: round2(t?.codFee || 0),
            withoutBreakdown: t?.withoutBreakdown || 0,
            lastReceivedAt: (t?.lastReceivedAt as Date | undefined) || null,
        },
        monthly: (out?.monthly || []) as MonthRow[],
    };
}

/** Expenses per month (the totals come from ExpenseService). */
const expensesMonthly = (win: { start: Date; end: Date }) =>
    Expense.aggregate([
        { $match: { date: { $gte: win.start, $lt: win.end } } },
        { $group: { _id: monthOf('$date'), total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) as Promise<MonthRow[]>;

/** Cash paid to suppliers per month, by each payment's own date (any purchase status, like paymentsMade). */
const supplierPaymentsMonthly = (win: { start: Date; end: Date }) =>
    Purchase.aggregate([
        { $match: { 'payments.0': { $exists: true } } },
        { $unwind: '$payments' },
        { $match: { 'payments.date': { $gte: win.start, $lt: win.end } } },
        { $group: { _id: monthOf('$payments.date'), total: { $sum: '$payments.amount' }, count: { $sum: 1 } } },
    ]) as Promise<MonthRow[]>;

const AccountsService = {
    async getOverview(query: Record<string, unknown> = {}) {
        // Re-checked here so the service is safe to call without the route validator.
        const parsed = overviewQuery.safeParse({ from: query.from || undefined, to: query.to || undefined });
        if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid period');
        const range: OverviewRange = { from: parsed.data.from, to: parsed.data.to };

        const today = dhakaToday();
        const win = seriesWindow(range, today);
        const dr = dayRange(range.from, range.to);

        const [investment, sales, payouts, expenses, expenseMonths, purchases, supplierPaid, supplierMonths, stock] = await Promise.all([
            InvestorService.totals(range),
            salesPart(dr, win),
            payoutsPart(dr, win),
            ExpenseService.totals(range),
            expensesMonthly(win),
            PurchaseService.totals(range),
            PurchaseService.paymentsMade(range),
            supplierPaymentsMonthly(win),
            InventoryService.getSummary(),
        ]);

        const parts: OverviewParts = {
            investment,
            sales: sales.totals,
            payouts: payouts.totals,
            expenses,
            purchases: { ...purchases, paymentsMade: supplierPaid.amount, paymentCount: supplierPaid.count },
            stock: { value: stock.value, units: stock.units, uncosted: stock.uncosted, products: stock.products },
        };

        return {
            period: { from: range.from || null, to: range.to || null, allTime: !range.from && !range.to, today, timezone: REPORT_TZ },
            ...parts,
            ...deriveOverview(parts),
            empty: isEmptyOverview(parts),
            monthly: buildMonthly(win.keys, {
                sales: sales.monthly,
                expenses: expenseMonths,
                purchasesPaid: supplierMonths,
                payouts: payouts.monthly,
            }),
            generatedAt: new Date().toISOString(),
        };
    },
};

export default AccountsService;
