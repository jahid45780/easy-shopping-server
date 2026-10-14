/**
 * Staff order activity — who moved which order, and how often.
 *
 * Source of truth is the ActivityLog rows written by OrderService.updateOrderStatus
 * (`order_status_<status>`). Only changes made through the admin panel carry an
 * actor; customer cancellations and courier auto-sync do not, and are left out.
 *
 * Nothing before the actor was recorded can be attributed, so both the leaderboard
 * and the history start from the day that recording went live.
 */
import { PipelineStage, Types } from 'mongoose';
import { ActivityLog } from '../activityLog/activityLog.model';
import { Order } from '../order/order.model';
import { User } from '../user/user.model';
import { Period, REPORT_TZ } from './analytics.period';

const ORDER_STATUS_ACTION = /^order_status_/;

/** Counting one status per staff member is the same shape every time. */
const countWhen = (status: string) => ({
    $sum: { $cond: [{ $eq: ['$meta.to', status] }, 1, 0] },
});

export interface StaffRow {
    actor: string;
    name: string;
    email: string;
    role: string;
    confirmed: number;
    delivered: number;
    cancelled: number;
    other: number;
    total: number;
    /** Order value the staff member confirmed in this period. */
    confirmedValue: number;
}

export interface StaffTrendPoint {
    /** YYYY-MM-DD in Dhaka time */
    day: string;
    confirmed: number;
    total: number;
}

export interface StaffActivityReport {
    from: string;
    to: string;
    rows: StaffRow[];
    trend: StaffTrendPoint[];
    totals: { confirmed: number; delivered: number; cancelled: number; total: number; confirmedValue: number };
}

const matchStage = (p: Period, actor?: string): PipelineStage.Match => ({
    $match: {
        action: { $regex: ORDER_STATUS_ACTION },
        createdAt: { $gte: p.start, $lt: p.end },
        actor: { $ne: null },
        ...(actor && Types.ObjectId.isValid(actor) ? { actor: new Types.ObjectId(actor) } : {}),
    },
});

/**
 * Leaderboard for the period, most confirmations first, plus a per-day trend.
 */
const getStaffActivity = async (p: Period): Promise<StaffActivityReport> => {
    const [rows, trend] = await Promise.all([
        ActivityLog.aggregate([
            matchStage(p),
            {
                $group: {
                    _id: '$actor',
                    // The logged name is a snapshot; the live user is joined below and wins.
                    name: { $last: '$actorName' },
                    role: { $last: '$meta.role' },
                    total: { $sum: 1 },
                    confirmed: countWhen('confirmed'),
                    delivered: countWhen('delivered'),
                    cancelled: countWhen('cancelled'),
                    confirmedValue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$meta.to', 'confirmed'] },
                                { $ifNull: ['$meta.total', 0] },
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { confirmed: -1, total: -1 } },
        ]),
        ActivityLog.aggregate([
            matchStage(p),
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TZ },
                    },
                    total: { $sum: 1 },
                    confirmed: countWhen('confirmed'),
                },
            },
            { $sort: { _id: 1 } },
        ]),
    ]);

    // Join the live user so a renamed or re-roled staff member still reads correctly.
    const ids = rows.map((r: any) => r._id).filter(Boolean);
    const users = ids.length
        ? await User.find({ _id: { $in: ids } }).select('firstName lastName email role').lean()
        : [];
    const byId = new Map(users.map((u: any) => [String(u._id), u]));

    const shaped: StaffRow[] = rows.map((r: any) => {
        const u = byId.get(String(r._id));
        const live = u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() : '';
        const confirmed = r.confirmed || 0;
        const delivered = r.delivered || 0;
        const cancelled = r.cancelled || 0;
        const total = r.total || 0;
        return {
            actor: String(r._id),
            name: live || r.name || u?.email || 'Removed user',
            email: u?.email || '',
            role: u?.role || r.role || '',
            confirmed,
            delivered,
            cancelled,
            other: Math.max(0, total - confirmed - delivered - cancelled),
            total,
            confirmedValue: r.confirmedValue || 0,
        };
    });

    const totals = shaped.reduce(
        (acc, r) => ({
            confirmed: acc.confirmed + r.confirmed,
            delivered: acc.delivered + r.delivered,
            cancelled: acc.cancelled + r.cancelled,
            total: acc.total + r.total,
            confirmedValue: acc.confirmedValue + r.confirmedValue,
        }),
        { confirmed: 0, delivered: 0, cancelled: 0, total: 0, confirmedValue: 0 },
    );

    return {
        from: p.from,
        to: p.to,
        rows: shaped,
        trend: (trend as any[]).map((t) => ({
            day: t._id,
            confirmed: t.confirmed || 0,
            total: t.total || 0,
        })),
        totals,
    };
};

export interface StaffHistoryRow {
    id: string;
    at: Date;
    actor: string;
    name: string;
    role: string;
    orderId: string;
    orderNo: string;
    from: string;
    to: string;
    total: number;
}

/**
 * The raw "who changed what, when" list for the period — newest first.
 * `actor` narrows it to one staff member, `status` to one destination status.
 */
const getStaffHistory = async (
    p: Period,
    opts: { actor?: string; status?: string; page?: number; limit?: number } = {},
) => {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));

    const match = matchStage(p).$match as Record<string, unknown>;
    const filter = { ...match, ...(opts.status ? { 'meta.to': opts.status } : {}) };

    const [docs, total] = await Promise.all([
        ActivityLog.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('actor', 'firstName lastName email role')
            .lean(),
        ActivityLog.countDocuments(filter),
    ]);

    const rows: StaffHistoryRow[] = docs.map((d: any) => {
        const u = d.actor && typeof d.actor === 'object' ? d.actor : null;
        const live = u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() : '';
        return {
            id: String(d._id),
            at: d.createdAt,
            actor: u ? String(u._id) : String(d.actor || ''),
            name: live || d.actorName || u?.email || 'Removed user',
            role: u?.role || d.meta?.role || '',
            orderId: d.meta?.orderId || '',
            orderNo: d.meta?.orderNo || '',
            from: d.meta?.from || '',
            to: d.meta?.to || '',
            total: d.meta?.total || 0,
        };
    });

    return { rows, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

/** Order statuses grouped the way the order desk works through them. */
const QUEUE = {
    toConfirm: ['pending'],
    toShip: ['confirmed', 'processing'],
    onTheWay: ['shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt'],
} as const;

export interface MyActivity {
    from: string;
    to: string;
    /** This person's tally for the period — all zeros when they did nothing yet. */
    me: Omit<StaffRow, 'actor' | 'name' | 'email' | 'role'>;
    /** Place on the confirmations leaderboard, or null with no confirmations. */
    rank: number | null;
    /** How many staff moved at least one order in the period. */
    staffCount: number;
    recent: StaffHistoryRow[];
    /** Shop-wide orders waiting at each stage right now (not tied to the period). */
    queue: { toConfirm: number; toShip: number; onTheWay: number };
}

/**
 * One staff member's own view: what they did in the period, where that puts them,
 * and what is waiting on the desk. Only the caller's own rows are returned — the
 * rank is a number, never other people's names.
 */
const getMyActivity = async (p: Period, actorId: string): Promise<MyActivity> => {
    const [board, history, toConfirm, toShip, onTheWay] = await Promise.all([
        getStaffActivity(p),
        getStaffHistory(p, { actor: actorId, limit: 8 }),
        Order.countDocuments({ status: { $in: [...QUEUE.toConfirm] } }),
        Order.countDocuments({ status: { $in: [...QUEUE.toShip] } }),
        Order.countDocuments({ status: { $in: [...QUEUE.onTheWay] } }),
    ]);

    const idx = board.rows.findIndex((r) => r.actor === String(actorId));
    const mine = idx >= 0 ? board.rows[idx] : null;

    return {
        from: p.from,
        to: p.to,
        me: {
            confirmed: mine?.confirmed || 0,
            delivered: mine?.delivered || 0,
            cancelled: mine?.cancelled || 0,
            other: mine?.other || 0,
            total: mine?.total || 0,
            confirmedValue: mine?.confirmedValue || 0,
        },
        // The board is sorted by confirmations; nobody is "ranked" for zero of them.
        rank: mine && mine.confirmed > 0 ? idx + 1 : null,
        staffCount: board.rows.length,
        recent: history.rows,
        queue: { toConfirm, toShip, onTheWay },
    };
};

export const StaffAnalytics = { getStaffActivity, getStaffHistory, getMyActivity };
export default StaffAnalytics;
