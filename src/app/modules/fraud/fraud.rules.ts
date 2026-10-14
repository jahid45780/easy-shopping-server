/* ─────────────────────────────────────────────────────────────────────
 * Fraud check rules: pure functions, no database, so they can be tested
 * offline and shared by the service.
 *
 * RETURNED BEFORE
 * A customer "returned an order before" when one of their OTHER orders on this
 * store (never the order being checked):
 *   1. has order status `returned` or `refunded`, or
 *   2. has a package (shipment) with status `returned` or `refunded`. A partly
 *      returned multi-shipment order keeps the status `delivered`, so the
 *      packages are checked too, or
 *   3. has a return request that was `approved` or `refunded`, or
 *   4. was REFUSED: it is `cancelled` after it had been handed to the courier
 *      (booked with Steadfast, or a shipped / in-transit status in its timeline).
 *      That is how a COD parcel the customer refused at the door comes back: the
 *      courier reports it cancelled and the admin confirms the cancellation.
 * A return request that is still `pending`, or was `rejected`, does NOT count.
 * An order cancelled before it left the shop does not count either.
 *
 * SAME CUSTOMER
 * Another order belongs to the same customer when any of these holds:
 *   - it was placed from the same user account,
 *   - it was placed from an account whose phone or email matches, or
 *   - its shipping phone or shipping email matches.
 * The identifiers come from the new order's shipping phone and email (what was
 * typed at checkout) and from its account's own phone and email.
 *   phone: digits only. A leading 88 / 0088 country code is dropped, and a bare
 *          1XXXXXXXXX gets its 0 back, so +880 1712-345678, 8801712345678
 *          and 01712345678 are all 01712345678.
 *   email: trimmed and lowercased. Empty emails and the placeholders made for
 *          guests and admin-placed orders (<phone>@guest.shohozkitchen.com) are
 *          ignored, because the phone already covers them.
 * ──────────────────────────────────────────────────────────────────── */

export const RETURNED_STATUSES = ['returned', 'refunded'];
/** Return-request statuses that count as "returned". pending / rejected never do. */
export const COUNTED_REQUEST_STATUSES = ['approved', 'refunded'];
/** Orders that can still be cancelled from Fraud check (nothing has left the shop). */
export const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'];
/** Orders still in flight: what a re-scan looks at. */
export const OPEN_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt'];
/** Statuses that mean a parcel had left the shop (for "cancelled after dispatch"). */
const DISPATCHED_STATUSES = ['shipped', 'on_the_way', 'out_for_delivery', 'delivery_attempt', 'delivered'];

export const FLAG_STATUSES = ['review', 'cleared', 'cancelled'] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];
export const MATCH_KINDS = ['phone', 'email', 'account'] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

/** A flag keeps at most this many previous returns (the count is always exact). */
export const MAX_PREVIOUS_RETURNS = 10;

const PLACEHOLDER_EMAIL_DOMAIN = '@guest.shohozkitchen.com';

export const RETURN_REASON_LABELS: Record<string, string> = {
    defective: 'Defective',
    wrong_item: 'Wrong item',
    not_as_described: 'Not as described',
    damaged: 'Damaged',
    changed_mind: 'Changed mind',
    other: 'Other',
};

/* ─── Identifiers ────────────────────────────────────────────────────── */

/** No phone number has more digits than this (E.164). */
const MAX_PHONE_DIGITS = 15;
/** No email address is longer than this (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;

/** "+880 1712-345678" / "8801712345678" / "01712345678" → "01712345678"; junk → "". */
export function normalizePhone(raw: unknown): string {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (d.startsWith('0088')) d = d.slice(2);                          // 00 international prefix
    if (d.length === 13 && d.startsWith('880')) d = d.slice(2);        // 880 1XXXXXXXXX
    else if (d.length === 12 && d.startsWith('881')) d = `0${d.slice(2)}`; // 88 1XXXXXXXXX (0 dropped)
    if (d.length === 10 && d.startsWith('1')) d = `0${d}`;             // 1XXXXXXXXX
    return d.length >= 6 && d.length <= MAX_PHONE_DIGITS ? d : '';
}

/**
 * Trimmed + lowercased; "" when it is not an email at all.
 * Plain string checks, no regex pattern: this runs on customer-typed checkout data, and a
 * backtracking pattern on a huge value would stall the whole API.
 */
export function normalizeEmail(raw: unknown): string {
    const e = String(raw ?? '').trim().toLowerCase();
    if (!e || e.length > MAX_EMAIL_LENGTH || /\s/.test(e)) return '';
    const at = e.indexOf('@');
    if (at < 1 || at !== e.lastIndexOf('@')) return '';   // exactly one "@", something before it
    // The domain needs a dot with something on both sides of it ("a@b.c").
    return e.slice(at + 2, -1).includes('.') ? e : '';
}

export const isPlaceholderEmail = (e: string) => e.endsWith(PLACEHOLDER_EMAIL_DOMAIN);

/** An email worth matching on: normalised, and not an auto-generated placeholder. */
export function matchableEmail(raw: unknown): string {
    const e = normalizeEmail(raw);
    return e && !isPlaceholderEmail(e) ? e : '';
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SEP = '[^0-9]*';

/**
 * A regex (source) that finds a normalised phone inside the free-form strings the
 * database holds ("+880 1712-345678", "01712 345678" …). It can over-match slightly,
 * so every hit is re-checked with normalizePhone.
 */
export function phonePattern(normalized: string): string {
    if (!normalized) return '';
    if (/^0\d{10}$/.test(normalized)) {
        // Bangladeshi mobile: optional (00)88 country code, optional leading 0.
        const core = normalized.slice(1).split('').join(SEP);
        return `^${SEP}(?:(?:0${SEP}0${SEP})?8${SEP}8${SEP})?(?:0${SEP})?${core}${SEP}$`;
    }
    return `^${SEP}${normalized.split('').join(SEP)}${SEP}$`;
}

/**
 * Digits to search a stored (normalised) phone with, from part of a number:
 * "+880 1712" → "01712", "01712-34" → "0171234". "" when there are fewer than 3 digits.
 */
export function phoneSearchDigits(raw: unknown): string {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (d.startsWith('0088')) d = d.slice(2);
    if (/^880?1/.test(d)) d = `0${d.replace(/^880?/, '')}`;
    return d.length >= 3 ? d : '';
}

/** Exact email, ignoring case and surrounding spaces (use with the "i" option). */
export const emailPattern = (normalized: string) => (normalized ? `^\\s*${escapeRegex(normalized)}\\s*$` : '');

export interface Identity {
    /** user account id ('' for a phone / email lookup) */
    user: string;
    phones: string[];
    emails: string[];
}

const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
const idOf = (v: any): string => (v && typeof v === 'object' && v._id ? String(v._id) : v ? String(v) : '');

/** Who placed this order: its account plus every phone / email we can match on. */
export function identityOf(order: any, account?: { phone?: string; email?: string } | null): Identity {
    const a = order?.shippingAddress || {};
    return {
        user: idOf(order?.user),
        phones: uniq([normalizePhone(a.phone), normalizePhone(account?.phone)]),
        emails: uniq([matchableEmail(a.email), matchableEmail(account?.email)]),
    };
}

/** How another user account is tied to this identity (phone and/or email). */
export function accountKinds(account: { phone?: string; email?: string }, identity: Identity): MatchKind[] {
    const kinds: MatchKind[] = [];
    const p = normalizePhone(account?.phone);
    const e = matchableEmail(account?.email);
    if (p && identity.phones.includes(p)) kinds.push('phone');
    if (e && identity.emails.includes(e)) kinds.push('email');
    return kinds;
}

/** Every way another order is tied to this identity; [] = not the same customer. */
export function matchedBy(identity: Identity, other: any, accountMatch: Map<string, MatchKind[]> = new Map()): MatchKind[] {
    const kinds = new Set<MatchKind>();
    const user = idOf(other?.user);
    if (identity.user && user === identity.user) kinds.add('account');
    const viaAccount = accountMatch.get(user) || [];
    const p = normalizePhone(other?.shippingAddress?.phone);
    const e = matchableEmail(other?.shippingAddress?.email);
    if ((p && identity.phones.includes(p)) || viaAccount.includes('phone')) kinds.add('phone');
    if ((e && identity.emails.includes(e)) || viaAccount.includes('email')) kinds.add('email');
    return MATCH_KINDS.filter((k) => kinds.has(k));
}

/* ─── "Returned before" ──────────────────────────────────────────────── */

export interface ReturnInfo {
    order: string;
    orderRef: string;
    /** refused = cancelled after it went to the courier (see refusedInfo) */
    status: 'returned' | 'refunded' | 'refused';
    date: Date | null;
    reason: string;
}

const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(v as any);
    return Number.isNaN(d.getTime()) ? null : d;
};
const latest = (ds: (Date | null)[]): Date | null =>
    ds.filter(Boolean).reduce<Date | null>((m, d) => (!m || (d as Date) > m ? (d as Date) : m), null);

/**
 * Did this order come back? Returns what we know about the return, or null.
 * `requests` may hold requests for other orders too; only this order's are used.
 */
export function returnInfo(order: any, requests: any[] = []): ReturnInfo | null {
    if (!order) return null;
    const id = idOf(order._id);
    const counted = requests.filter((r) => idOf(r?.order) === id && COUNTED_REQUEST_STATUSES.includes(r?.status));
    const orderReturned = RETURNED_STATUSES.includes(order.status);
    const pkgs = ((order.packages || []) as any[]).filter((p) => RETURNED_STATUSES.includes(p?.status));
    if (!orderReturned && !pkgs.length && !counted.length) return null;

    const statuses = [
        orderReturned ? order.status : '',
        ...pkgs.map((p) => p.status),
        ...counted.map((r) => (r.status === 'refunded' ? 'refunded' : 'returned')),
    ];
    const status = statuses.includes('refunded') ? 'refunded' : 'returned';

    // When it came back: the latest return resolution / status change we can see.
    const stamps = (tl: any[] | undefined) =>
        (tl || []).filter((t) => RETURNED_STATUSES.includes(t?.status)).map((t) => toDate(t.createdAt));
    const date = latest([
        ...counted.map((r) => toDate(r.resolvedAt) || toDate(r.updatedAt)),
        ...stamps(order.timeline),
        ...pkgs.flatMap((p) => stamps(p.timeline)),
    ]) || toDate(order.updatedAt) || toDate(order.createdAt);

    const byDate = [...counted].sort((a, b) => (toDate(b.resolvedAt || b.updatedAt)?.getTime() || 0) - (toDate(a.resolvedAt || a.updatedAt)?.getTime() || 0));
    const reasonKey = byDate[0]?.reason || '';
    return {
        order: id,
        orderRef: order.orderId || id,
        status,
        date,
        reason: reasonKey ? RETURN_REASON_LABELS[reasonKey] || reasonKey : '',
    };
}

/**
 * Did this order come back as a refused parcel? That is: it is cancelled, but only
 * after it had been handed to the courier. A cancellation before dispatch never counts.
 */
export function refusedInfo(order: any): ReturnInfo | null {
    if (!order || order.status !== 'cancelled' || !wasDispatched(order)) return null;
    const id = idOf(order._id);
    const cancelled = (tl: any[] | undefined) =>
        (tl || []).filter((t) => t?.status === 'cancelled').map((t) => toDate(t.createdAt));
    const date = latest([
        ...cancelled(order.timeline),
        ...((order.packages || []) as any[]).flatMap((p) => cancelled(p?.timeline)),
    ]) || toDate(order.updatedAt) || toDate(order.createdAt);
    return { order: id, orderRef: order.orderId || id, status: 'refused', date, reason: 'Cancelled after it went to the courier' };
}

export interface Evaluation {
    previousOrderCount: number;
    returnCount: number;
    previousReturns: ReturnInfo[];
    matchedBy: MatchKind[];
}

/**
 * Judge a new order against the customer's other orders (already fetched).
 * Orders that do not really match the identity are ignored, as is the order itself.
 */
export function evaluate(
    identity: Identity,
    others: any[],
    requests: any[] = [],
    accountMatch: Map<string, MatchKind[]> = new Map(),
    selfId?: unknown,
): Evaluation {
    const self = idOf(selfId);
    const mine = others.filter((o) => idOf(o?._id) !== self && matchedBy(identity, o, accountMatch).length > 0);
    const kinds = new Set<MatchKind>();
    const returns: ReturnInfo[] = [];
    for (const o of mine) {
        const info = returnInfo(o, requests) || refusedInfo(o);
        if (!info) continue;
        returns.push(info);
        matchedBy(identity, o, accountMatch).forEach((k) => kinds.add(k));
    }
    returns.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return {
        previousOrderCount: mine.length,
        returnCount: returns.length,
        previousReturns: returns.slice(0, MAX_PREVIOUS_RETURNS),
        matchedBy: MATCH_KINDS.filter((k) => kinds.has(k)),
    };
}

/* ─── Cancelling a flagged order ─────────────────────────────────────── */

/** Only an order that has not left the shop can be cancelled from Fraud check. */
export function cancelEligibility(order: any): { ok: boolean; reason: string } {
    if (!order) return { ok: false, reason: 'The order no longer exists' };
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
        return { ok: false, reason: `This order is already ${String(order.status || 'closed').replace(/_/g, ' ')}. Only pending, confirmed or processing orders can be cancelled here` };
    }
    if (((order.packages || []) as any[]).some((p) => p?.consignmentId)) {
        return { ok: false, reason: 'This order is already booked with Steadfast. Cancel the parcel with the courier first' };
    }
    return { ok: true, reason: '' };
}

/* ─── Customer history (lookup) ──────────────────────────────────────── */

export type Risk = 'none' | 'low' | 'medium' | 'high';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/**
 * No history → none · never returned → low · 3+ returns or ≥ 30% returned → high · else medium.
 * summarizeHistory passes refused parcels (cancelled after dispatch) in as returns too.
 */
export function riskLevel(h: { totalOrders: number; returned: number; returnRate: number | null }): Risk {
    if (!h.totalOrders) return 'none';
    if (!h.returned) return 'low';
    if (h.returned >= 3 || (h.returnRate ?? 0) >= 30) return 'high';
    return 'medium';
}

/** Was a (now cancelled) order ever handed to the courier? */
function wasDispatched(o: any): boolean {
    const hit = (tl: any[] | undefined) => (tl || []).some((t) => DISPATCHED_STATUSES.includes(t?.status));
    return ((o.packages || []) as any[]).some((p) => p?.consignmentId || p?.courierBookedAt || hit(p?.timeline)) || hit(o.timeline);
}

export type OrderOutcome = 'returned' | 'delivered' | 'cancelled' | 'open';

export function outcomeOf(o: any, requests: any[] = []): OrderOutcome {
    if (returnInfo(o, requests)) return 'returned';
    if (o?.status === 'delivered') return 'delivered';
    if (o?.status === 'cancelled') return 'cancelled';
    return 'open';
}

export interface History {
    totalOrders: number;
    delivered: number;
    returned: number;
    cancelled: number;
    cancelledAfterDispatch: number;
    inProgress: number;
    returnRequests: { total: number; pending: number; approved: number; rejected: number; refunded: number };
    /** returned ÷ (delivered + returned), % with 1 decimal; null when nothing reached the customer */
    returnRate: number | null;
    /** delivered ÷ (delivered + returned + cancelled after dispatch), %; null when nothing was dispatched */
    deliverySuccessRate: number | null;
    /** total of delivered orders that stayed delivered */
    spent: number;
    risk: Risk;
}

export function summarizeHistory(orders: any[], requests: any[] = []): History {
    const h = { delivered: 0, returned: 0, cancelled: 0, cancelledAfterDispatch: 0, inProgress: 0, spent: 0 };
    for (const o of orders) {
        const out = outcomeOf(o, requests);
        if (out === 'returned') h.returned++;
        else if (out === 'delivered') { h.delivered++; h.spent += Number(o.total) || 0; }
        else if (out === 'cancelled') { h.cancelled++; if (wasDispatched(o)) h.cancelledAfterDispatch++; }
        else h.inProgress++;
    }
    const rr = { total: requests.length, pending: 0, approved: 0, rejected: 0, refunded: 0 };
    for (const r of requests) {
        const s = r?.status;
        if (s === 'pending' || s === 'approved' || s === 'rejected' || s === 'refunded') rr[s]++;
    }

    const returnRate = pct(h.returned, h.delivered + h.returned);
    const deliverySuccessRate = pct(h.delivered, h.delivered + h.returned + h.cancelledAfterDispatch);
    const totalOrders = orders.length;
    // Risk counts refused parcels as returns, the same way a flag does (see refusedInfo).
    const cameBack = h.returned + h.cancelledAfterDispatch;
    return {
        totalOrders,
        ...h,
        spent: Math.round(h.spent * 100) / 100,
        returnRequests: rr,
        returnRate,
        deliverySuccessRate,
        risk: riskLevel({ totalOrders, returned: cameBack, returnRate: pct(cameBack, h.delivered + cameBack) }),
    };
}

/** What the lookup box was given: an email, a phone number, or nothing usable. */
export function parseLookupQuery(raw: unknown): { type: 'phone' | 'email'; value: string } | null {
    const q = String(raw ?? '').trim();
    if (!q) return null;
    if (q.includes('@')) {
        const e = normalizeEmail(q);
        if (!e) return null;
        // A guest placeholder (01712345678@guest.shohozkitchen.com) is really a phone number.
        if (isPlaceholderEmail(e)) {
            const p = normalizePhone(e.split('@')[0]);
            return p.length >= 10 ? { type: 'phone', value: p } : null;
        }
        return { type: 'email', value: e };
    }
    if (/[a-z]/i.test(q)) return null;
    const p = normalizePhone(q);
    return p.length >= 10 && p.length <= 15 ? { type: 'phone', value: p } : null;
}
