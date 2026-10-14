/**
 * Shohoz Kitchen — demo business data, so the client can open every admin page and
 * see it working: customers, ~45 orders over the last 75 days (revenue, statuses,
 * returns), courier payouts, a fraud-check flag, suppliers, purchases, warehouses,
 * transfers, expenses and investors. Products that have no cost price get one
 * (about 62% of the selling price), so stock value and profit are not ৳0.
 *
 * Uses the products already in the shop. Nothing leaves the database: no SMS,
 * WhatsApp, email, courier booking or notification is sent, and product stock is
 * not changed.
 *
 * Everything it creates is listed in the `demo_manifest` collection, so
 *     npm run demo:clean
 * removes exactly that (and puts the cost prices back). Real data is never touched.
 *
 *     npm run demo:seed     add the demo data (refuses to run twice)
 *     npm run demo:clean    remove it again
 */
import mongoose, { Types } from 'mongoose';
import dns from 'dns';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from './app/config';
import { addDays, dhakaDayStart, dhakaToday } from './app/modules/analytics/analytics.period';
import { User } from './app/modules/user/user.model';
import { Product } from './app/modules/product/product.model';
import { Order } from './app/modules/order/order.model';
import { FraudFlag } from './app/modules/fraud/fraud.model';
import { CourierPayout } from './app/modules/courierPayout/courierPayout.model';
import { Supplier } from './app/modules/supplier/supplier.model';
import { Purchase, PurchaseCounter } from './app/modules/purchase/purchase.model';
import { computeTotals, formatReference as poReference, referenceKey } from './app/modules/purchase/purchase.utils';
import { Warehouse } from './app/modules/warehouse/warehouse.model';
import { Transfer } from './app/modules/transfer/transfer.model';
import { formatReference as trReference } from './app/modules/transfer/transfer.rules';
import { Expense, ExpenseCategory, ExpenseCounter } from './app/modules/expense/expense.model';
import ExpenseService, { DEFAULT_EXPENSE_CATEGORIES } from './app/modules/expense/expense.service';
import { voucherNo } from './app/modules/expense/expense.utils';
import { Investor, InvestorTransaction } from './app/modules/investor/investor.model';
import { StockMovement } from './app/modules/inventory/stockMovement.model';
import { ActivityLog } from './app/modules/activityLog/activityLog.model';

// This machine's default resolver refuses queries; Atlas needs working DNS.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MANIFEST_ID = 'demo';
/** "dry": read products, build and validate every demo document, write nothing. */
const DRY = process.argv[2] === 'dry';
const noop = async () => null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const manifest = (): any => (DRY
    ? { findOne: noop, insertOne: noop, updateOne: noop, deleteOne: noop }
    : mongoose.connection.collection('demo_manifest'));

/* ─── Small helpers ─────────────────────────────────────────────────── */

// Deterministic "random" numbers, so every run produces the same demo shop.
let seed = 20260919;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const round2 = (n: number) => Math.round(n * 100) / 100;

const TODAY = dhakaToday();
const day = (offset: number) => addDays(TODAY, offset);
/** A Dhaka day plus a time of day, as a Date. */
const at = (dayStr: string, hour: number, minute = 0) => new Date(dhakaDayStart(dayStr).getTime() + (hour * 60 + minute) * 60_000);

/** Validate through the Mongoose model (casting + defaults), then return a plain doc with our own dates. */
async function prepare(Model: mongoose.Model<any>, data: Record<string, any>, createdAt: Date, updatedAt = createdAt) {
    const doc = new Model(data);
    await doc.validate();
    const obj = doc.toObject({ depopulate: true, virtuals: false });
    obj.createdAt = createdAt;
    obj.updatedAt = updatedAt;
    return obj;
}

/**
 * Note the ids in the manifest FIRST, then insert without Mongoose hooks (so no
 * notifications, no stock or rating side effects). If a run stops half-way,
 * "npm run demo:clean" can still remove whatever did get in.
 */
async function insert(key: string, Model: mongoose.Model<any>, docs: Record<string, any>[]) {
    const ids = docs.map((d) => d._id as Types.ObjectId);
    await manifest().updateOne({ _id: MANIFEST_ID }, { $push: { [`ids.${key}`]: { $each: ids } } });
    if (docs.length && !DRY) await Model.collection.insertMany(docs);
    return ids;
}

/* ─── Demo content ──────────────────────────────────────────────────── */

const CUSTOMERS = [
    ['Rakib', 'Hasan'], ['Nusrat', 'Jahan'], ['Tanvir', 'Ahmed'], ['Farhana', 'Akter'], ['Sabbir', 'Rahman'],
    ['Mitu', 'Begum'], ['Arif', 'Hossain'], ['Sumaiya', 'Islam'], ['Imran', 'Kabir'], ['Jannatul', 'Ferdous'],
    ['Shakil', 'Mahmud'], ['Tahmina', 'Sultana'], ['Nayeem', 'Chowdhury'], ['Rumana', 'Parvin'],
];
/**
 * Staff logins the owner asked for. These are real accounts, not demo rows: they
 * stay behind after `npm run demo:clean` so the shop keeps its staff, and a re-run
 * updates them in place instead of failing on the duplicate email.
 *
 * The password is the email address, as specified. Fine while nobody but the owner
 * has the addresses; change them before the shop takes real orders.
 */
const STAFF: { email: string; firstName: string; lastName: string; role: 'superadmin' | 'admin' | 'editor' }[] = [
    { email: 'superadmin@gmail.com', firstName: 'Super', lastName: 'Admin', role: 'superadmin' },
    { email: process.env.ADMIN_EMAIL || '', firstName: 'Shop', lastName: 'Admin', role: 'admin' },
    { email: 'editorone@gmail.com', firstName: 'Editor', lastName: 'One', role: 'editor' },
    { email: 'editortwo@gmail.com', firstName: 'Editor', lastName: 'Two', role: 'editor' },
    { email: 'editorthree@gmail.com', firstName: 'Editor', lastName: 'Three', role: 'editor' },
];

const AREAS: { city: string; areas: string[]; dhaka: boolean }[] = [
    { city: 'Dhaka', areas: ['Mirpur 10', 'Dhanmondi 27', 'Uttara Sector 7', 'Mohammadpur', 'Badda', 'Bashundhara R/A', 'Banani', 'Jatrabari'], dhaka: true },
    { city: 'Chattogram', areas: ['Agrabad', 'Nasirabad', 'Halishahar'], dhaka: false },
    { city: 'Sylhet', areas: ['Zindabazar', 'Ambarkhana'], dhaka: false },
    { city: 'Rajshahi', areas: ['Shaheb Bazar'], dhaka: false },
    { city: 'Gazipur', areas: ['Tongi', 'Board Bazar'], dhaka: false },
    { city: 'Narayanganj', areas: ['Chashara'], dhaka: false },
    { city: 'Khulna', areas: ['Sonadanga'], dhaka: false },
];
const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'on_the_way', 'out_for_delivery', 'delivered'];

/* ─── Seed ──────────────────────────────────────────────────────────── */

async function seedDemo() {
    if (await manifest().findOne({ _id: MANIFEST_ID })) {
        throw new Error('Demo data is already in the database. Run "npm run demo:clean" first if you want to seed it again.');
    }

    const products: any[] = await Product.find({ isDeleted: false, status: 'active' })
        .select('name price thumbnail sku unit costPrice stock')
        .lean();
    if (products.length === 0) throw new Error('No active products found — add products first (npm run seed:demo adds 5).');

    /* ── 0. Staff logins (kept after demo:clean — see STAFF) ── */
    const staff: { _id: Types.ObjectId; name: string; role: string; email: string }[] = [];
    for (const s of STAFF) {
        const name = `${s.firstName} ${s.lastName}`;
        if (DRY) { staff.push({ _id: new Types.ObjectId(), name, role: s.role, email: s.email }); continue; }
        const hash = await bcrypt.hash(s.email, config.bcrypt_salt_rounds);
        // Upsert: an account the owner already made keeps its id, and gets the
        // role and password stated above so every login in the list works.
        const res = await User.collection.findOneAndUpdate(
            { email: s.email },
            {
                $set: { password: hash, firstName: s.firstName, lastName: s.lastName, role: s.role, status: 'active', isEmailVerified: true, isDeleted: false, updatedAt: new Date() },
                $setOnInsert: { email: s.email, phone: '', permissions: [], shippingAddresses: [], createdAt: new Date() },
            },
            { upsert: true, returnDocument: 'after' },
        );
        const doc: any = (res as any)?.value ?? res;
        staff.push({ _id: doc._id, name, role: s.role, email: s.email });
    }
    /** Editors run the order desk; admins pitch in. Weighted so editors do most of it. */
    const DESK = [...staff.filter((s) => s.role === 'editor'), ...staff.filter((s) => s.role === 'editor'), ...staff.filter((s) => s.role !== 'editor')];

    const adminId = staff.find((s) => s.role === 'admin')?._id || staff[0]?._id || null;
    const ids: Record<string, Types.ObjectId[]> = {};
    const activity: Record<string, any>[] = [];

    // The manifest goes in before any data, so a run that stops half-way can still be cleaned.
    await manifest().insertOne({ _id: MANIFEST_ID, createdAt: new Date(), status: 'seeding', ids: {}, productCosts: [], purchaseRefs: [] });

    /* ── 1. Cost prices (so stock value and profit show) ── */
    const productCosts: { _id: Types.ObjectId; before: number; demo: number }[] = [];
    for (const p of products) {
        if (Number(p.costPrice) > 0 || !(Number(p.price) > 0)) continue;
        const entry = { _id: p._id, before: Number(p.costPrice) || 0, demo: Math.round(Number(p.price) * 0.62) };
        await manifest().updateOne({ _id: MANIFEST_ID }, { $push: { productCosts: entry } });
        if (!DRY) await Product.collection.updateOne({ _id: p._id, costPrice: { $in: [0, null] } }, { $set: { costPrice: entry.demo } });
        productCosts.push(entry);
        p.costPrice = entry.demo;
    }

    /* ── 2. Customers ── */
    const passwordHash = await bcrypt.hash(crypto.randomBytes(18).toString('base64url'), config.bcrypt_salt_rounds);
    const customers: any[] = [];
    for (const [i, [firstName, lastName]] of CUSTOMERS.entries()) {
        const place = i % 3 === 0 ? AREAS[1 + (i % (AREAS.length - 1))] : AREAS[0];
        const phone = `0199900${String(1001 + i).slice(-4)}`;
        const joined = at(day(-between(20, 90)), between(9, 21), between(0, 59));
        customers.push(await prepare(User, {
            email: `demo.customer${i + 1}@example.com`,
            password: passwordHash,
            firstName, lastName, phone,
            role: 'user', status: 'active', isEmailVerified: true,
            shippingAddresses: [{ label: 'Home', fullName: `${firstName} ${lastName}`, phone, address: `House ${between(3, 88)}, Road ${between(1, 20)}`, area: pick(place.areas), city: place.city, isDefault: true }],
            loyaltyPoints: between(0, 12) * 10,
        }, joined));
    }
    // A few customers joined recently (for "new customers in the last 30 days").
    for (const c of customers.slice(-4)) c.createdAt = c.updatedAt = at(day(-between(2, 25)), between(10, 20));
    ids.users = await insert('users', User, customers);

    /* ── 3. Orders ── */
    const orders: any[] = [];
    let orderNo = (await Order.countDocuments()) + 1;
    const makeOrder = async (opts: { customer: any; dayOffset: number; status: string; items?: { product: any; qty: number }[]; returnReason?: string }) => {
        const { customer, dayOffset, status } = opts;
        const addr = customer.shippingAddresses[0];
        const insideDhaka = addr.city === 'Dhaka';
        const lines = opts.items || Array.from({ length: pick([1, 1, 1, 2, 2, 3]) }, () => ({ product: pick(products), qty: pick([1, 1, 1, 2, 3]) }));
        const items = lines.map(({ product, qty }) => ({
            _id: new Types.ObjectId(), product: product._id, name: product.name, thumbnail: product.thumbnail || '/images/placeholder-product.svg',
            price: Number(product.price), quantity: qty, total: Number(product.price) * qty,
        }));
        const subtotal = items.reduce((s, i) => s + i.total, 0);
        const shippingCost = insideDhaka ? 60 : 120;
        const paymentMethod = rand() < 0.72 ? 'cod' : 'bkash';
        const placedDay = day(dayOffset);
        // Never in the future (today's orders are placed "earlier today").
        const placed = new Date(Math.min(at(placedDay, between(9, 22), between(0, 59)).getTime(), Date.now() - between(20, 240) * 60_000));

        // Walk the status flow, a few hours / a day apart.
        // Every step after "placed" is somebody at the order desk, so the Staff
        // activity report has the same shape it gets from real confirmations.
        // One person follows an order through, the way it works in practice.
        const owner = pick(DESK);
        const timeline: { status: string; note: string; actor: Types.ObjectId | null; actorName: string; createdAt: Date }[] = [];
        let t = placed.getTime();
        const step = (s: string, note: string, hours: number) => {
            t += hours * 3_600_000;
            timeline.push({ status: s, note, actor: owner._id, actorName: owner.name, createdAt: new Date(Math.min(t, Date.now() - 60_000)) });
        };
        // The customer places the order; nobody on staff is behind this one.
        timeline.push({ status: 'pending', note: 'Order placed', actor: null, actorName: '', createdAt: placed });
        const stopAt = ['cancelled', 'returned', 'refunded'].includes(status) ? (status === 'cancelled' ? 'confirmed' : 'delivered') : status;
        for (const s of FLOW.slice(1, FLOW.indexOf(stopAt) + 1)) step(s, s === 'confirmed' ? 'Confirmed by phone' : '', s === 'delivered' ? between(20, 50) : between(2, 14));
        if (status === 'cancelled') step('cancelled', pick(['Customer cancelled on the phone', 'Could not reach the customer', 'Customer ordered twice']), between(1, 6));
        if (status === 'returned' || status === 'refunded') step('returned', opts.returnReason || 'Customer returned the product', between(24, 72));
        if (status === 'refunded') step('refunded', 'Refund sent', between(12, 30));

        const paid = paymentMethod === 'bkash'
            ? (status === 'refunded' ? 'refunded' : status === 'cancelled' ? 'refunded' : 'paid')
            : (status === 'delivered' ? 'paid' : 'pending');
        const last = timeline[timeline.length - 1].createdAt;
        const order = await prepare(Order, {
            orderId: `KM-${String(orderNo++).padStart(4, '0')}`,
            user: customer._id,
            items,
            packages: [{ itemIds: items.map((i) => i._id), status, subtotal, timeline }],
            shippingAddress: { fullName: addr.fullName, phone: addr.phone, email: customer.email, address: addr.address, area: addr.area, city: addr.city },
            subtotal, shippingCost, discount: 0, total: subtotal + shippingCost,
            status, paymentMethod, paymentStatus: paid,
            transactionId: paymentMethod === 'bkash' ? `DEMO${crypto.randomBytes(4).toString('hex').toUpperCase()}` : '',
            cancelReason: status === 'cancelled' ? timeline[timeline.length - 1].note : '',
            timeline,
        }, placed, last);

        // One ActivityLog row per staff-made change — that is what the Staff
        // activity report reads, exactly as OrderService.updateOrderStatus writes it.
        for (let i = 1; i < timeline.length; i++) {
            const e = timeline[i];
            if (!e.actor) continue;
            activity.push(await prepare(ActivityLog, {
                actor: e.actor,
                actorName: e.actorName,
                action: `order_status_${e.status}`,
                target: `Order:${order.orderId}`,
                meta: {
                    orderId: String(order._id), orderNo: order.orderId,
                    from: timeline[i - 1].status, to: e.status,
                    role: owner.role, total: order.total,
                },
            }, e.createdAt));
        }

        orders.push(order);
        return order;
    };

    // The repeat returner, for Fraud check: a delivered order, a returned one, then a new one.
    const returner = customers[0];
    await makeOrder({ customer: returner, dayOffset: -58, status: 'delivered' });
    const returnedOrder = await makeOrder({ customer: returner, dayOffset: -34, status: 'returned', returnReason: 'Customer refused the parcel at the door — changed mind' });
    const flaggedOrder = await makeOrder({ customer: returner, dayOffset: 0, status: 'pending' });

    for (let n = 0; n < 42; n++) {
        const offset = -Math.floor(Math.pow(rand(), 1.4) * 75);   // more orders in recent days
        const age = -offset;
        const status = age <= 1 ? pick(['pending', 'pending', 'confirmed'])
            : age <= 3 ? pick(['confirmed', 'processing', 'shipped'])
                : age <= 6 ? pick(['shipped', 'on_the_way', 'out_for_delivery', 'delivered'])
                    : pick(['delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'cancelled', 'returned']);
        await makeOrder({ customer: customers[1 + (n % (customers.length - 1))], dayOffset: offset, status });
    }
    ids.orders = await insert('orders', Order, orders);
    ids.activityLogs = await insert('activityLogs', ActivityLog, activity);

    /* ── 4. Fraud check flag for the repeat returner's new order ── */
    ids.fraudFlags = await insert('fraudFlags', FraudFlag, [await prepare(FraudFlag, {
        order: flaggedOrder._id, orderRef: flaggedOrder.orderId,
        customer: { name: flaggedOrder.shippingAddress.fullName, phone: flaggedOrder.shippingAddress.phone, email: flaggedOrder.shippingAddress.email, user: returner._id },
        matchedBy: ['account', 'phone', 'email'],
        previousReturns: [{ order: returnedOrder._id, orderRef: returnedOrder.orderId, status: 'returned', date: returnedOrder.updatedAt, reason: 'Customer refused the parcel at the door — changed mind' }],
        returnCount: 1, previousOrderCount: 2, status: 'review',
    }, flaggedOrder.createdAt)]);

    /* ── 5. Courier payouts: delivered COD orders, paid out weekly ── */
    const deliveredCod = orders.filter((o) => o.status === 'delivered' && o.paymentMethod === 'cod' && o.updatedAt.getTime() < Date.now() - 4 * 86_400_000)
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
    const weeks = new Map<number, any[]>();
    for (const o of deliveredCod) {
        const week = Math.floor((Date.now() - o.updatedAt.getTime()) / (7 * 86_400_000));
        weeks.set(week, [...(weeks.get(week) || []), o]);
    }
    const payouts: any[] = [];
    let payoutNo = 1;
    for (const [week, list] of [...weeks.entries()].sort((a, b) => b[0] - a[0])) {
        if (week < 1) continue;   // the latest week is not paid out yet
        const codCollected = list.reduce((s, o) => s + o.total, 0);
        const deliveryBills = list.reduce((s, o) => s + (o.shippingCost === 60 ? 60 : 110), 0);
        const codFee = round2(codCollected * 0.01);
        const receivedAt = at(addDays(TODAY, -(week * 7) + 2), 15);
        payouts.push(await prepare(CourierPayout, {
            receivedAt, source: 'manual', reference: `DEMO-PAYOUT-${payoutNo++}`,
            codCollected, deliveryBills, codFee, amount: round2(codCollected - deliveryBills - codFee), parcelCount: list.length,
            note: 'Demo data — weekly Steadfast payment', createdBy: adminId,
        }, receivedAt));
    }
    ids.courierPayouts = await insert('courierPayouts', CourierPayout, payouts);

    /* ── 6. Warehouses and suppliers (an existing one with the same name is reused, not touched) ── */
    const warehouseDefs = [
        { name: 'Main Godown — Mirpur', location: 'Mirpur 12, Dhaka', contactPerson: 'Jalal Uddin', phone: '01999001201' },
        { name: 'Dhanmondi Store', location: 'Road 27, Dhanmondi, Dhaka', contactPerson: 'Rasel Mia', phone: '01999001202' },
    ];
    const warehouses: any[] = [];
    const newWarehouses: any[] = [];
    for (const w of warehouseDefs) {
        const existing: any = await Warehouse.findOne({ name: w.name }).collation({ locale: 'en', strength: 2 }).lean();
        if (existing) { warehouses.push(existing); continue; }
        const doc = await prepare(Warehouse, { ...w, isActive: true, note: 'Demo warehouse' }, at(day(-80), 11));
        warehouses.push(doc); newWarehouses.push(doc);
    }
    ids.warehouses = await insert('warehouses', Warehouse, newWarehouses);

    const supplierDefs = [
        { name: 'Guangzhou Kitchenware Co., Ltd.', contactPerson: 'Mr. Li Wei', phone: '+86 20 0000 0001', email: 'sales@example.com', country: 'China', address: 'Baiyun District, Guangzhou' },
        { name: 'Yiwu Home Goods Trading', contactPerson: 'Ms. Chen', phone: '+86 579 0000 0002', email: 'export@example.com', country: 'China', address: 'Yiwu, Zhejiang' },
        { name: 'Dhaka Steel Utensils', contactPerson: 'Kamal Hossain', phone: '01999001301', email: 'dhakasteel@example.com', country: 'Bangladesh', address: 'Nawabpur Road, Dhaka' },
    ];
    const suppliers: any[] = [];
    const newSuppliers: any[] = [];
    for (const s of supplierDefs) {
        const existing: any = await Supplier.findOne({ name: s.name }).collation({ locale: 'en', strength: 2 }).lean();
        if (existing) { suppliers.push(existing); continue; }
        const doc = await prepare(Supplier, { ...s, isActive: true, note: 'Demo supplier' }, at(day(-85), 12));
        suppliers.push(doc); newSuppliers.push(doc);
    }
    ids.suppliers = await insert('suppliers', Supplier, newSuppliers);

    /* ── 7. Purchases ── */
    const lineFor = (p: any, qty: number, unitCost: number, receivedQty = 0) => ({
        _id: new Types.ObjectId(), product: p._id, name: p.name, sku: p.sku || '', unit: p.unit || 'piece', qty, unitCost, receivedQty,
    });
    const stockNote = 'Demo data — product stock was not changed';
    const purchaseDefs: { dayOffset: number; supplier: number; status: string; currency: 'BDT' | 'RMB'; rate: number; mode: string; lines: [number, number][]; extras: [number, number]; paidShare: number; receivedShare: number; invoice: string; eta?: number }[] = [
        { dayOffset: -52, supplier: 0, status: 'received', currency: 'RMB', rate: 17.2, mode: 'sea', lines: [[0, 120], [1, 80], [2, 60]], extras: [18000, 26000], paidShare: 1, receivedShare: 1, invoice: 'GZ-24081' },
        { dayOffset: -21, supplier: 1, status: 'partially_received', currency: 'RMB', rate: 17.1, mode: 'air', lines: [[3, 40], [4, 60]], extras: [9500, 7000], paidShare: 0.5, receivedShare: 0.5, invoice: 'YW-5520', eta: -3 },
        { dayOffset: -6, supplier: 2, status: 'confirmed', currency: 'BDT', rate: 1, mode: 'local', lines: [[1, 30], [5, 25]], extras: [1500, 0], paidShare: 0, receivedShare: 0, invoice: 'DS-118', eta: 4 },
        { dayOffset: -1, supplier: 0, status: 'draft', currency: 'RMB', rate: 17.2, mode: 'sea', lines: [[2, 100], [6, 50]], extras: [0, 0], paidShare: 0, receivedShare: 0, invoice: '' },
    ];
    const purchases: any[] = [];
    for (const def of purchaseDefs) {
        const orderDay = day(def.dayOffset);
        const items = def.lines.map(([k, qty]) => {
            const p = products[k % products.length];
            const bdtCost = Number(p.costPrice || p.price * 0.62) * 0.85;   // before shipping and duty
            const unitCost = def.currency === 'BDT' ? Math.round(bdtCost) : round2(bdtCost / def.rate);
            return lineFor(p, qty, unitCost, Math.floor(qty * def.receivedShare));
        });
        const base = { status: def.status, currency: def.currency, exchangeRate: def.rate, items, shippingCost: def.extras[0], customsDuty: def.extras[1], otherCost: 0, discount: 0 };
        const gross = computeTotals({ ...base, payments: [] }).grandTotal;
        const payments = def.paidShare >= 1
            ? [{ amount: round2(gross * 0.4), date: dhakaDayStart(orderDay), method: 'bank', reference: 'TT advance' }, { amount: round2(gross - round2(gross * 0.4)), date: dhakaDayStart(day(def.dayOffset + 18)), method: 'bank', reference: 'TT balance' }]
            : def.paidShare > 0 ? [{ amount: round2(gross * def.paidShare), date: dhakaDayStart(day(def.dayOffset + 1)), method: 'bank', reference: 'Advance' }] : [];
        const receipts = def.receivedShare > 0 ? [{
            date: dhakaDayStart(day(def.dayOffset + (def.status === 'received' ? 24 : 13))), warehouse: warehouses[0]._id, addedToStock: false, note: stockNote, createdBy: adminId,
            lines: items.filter((i) => i.receivedQty > 0).map((i) => ({ itemId: i._id, qty: i.receivedQty, unitCost: 0, stocked: false, stockNote })),
        }] : [];
        const totals = computeTotals({ ...base, payments });
        purchases.push(await prepare(Purchase, {
            reference: poReference(orderDay, 1), supplier: suppliers[def.supplier]._id, supplierInvoice: def.invoice,
            shippingMode: def.mode, orderDate: dhakaDayStart(orderDay), eta: def.eta !== undefined ? dhakaDayStart(day(def.eta)) : null,
            ...base, ...totals, payments, receipts, note: 'Demo purchase', createdBy: adminId,
        }, at(orderDay, 12)));
        if (!DRY) await PurchaseCounter.updateOne({ _id: referenceKey(orderDay) }, { $max: { seq: 1 } }, { upsert: true });
    }
    await manifest().updateOne({ _id: MANIFEST_ID }, { $set: { purchaseRefs: purchases.map((p) => p.reference) } });
    ids.purchases = await insert('purchases', Purchase, purchases);

    /* ── 8. Transfers between the two warehouses ── */
    const [wMain, wStore] = warehouses;
    const transferDefs = [
        { dayOffset: -27, from: wMain, to: wStore, status: 'received', lines: [[0, 15], [1, 10]] },
        { dayOffset: -12, from: wMain, to: wStore, status: 'received', lines: [[2, 12], [3, 8], [4, 20]] },
        { dayOffset: -2, from: wStore, to: wMain, status: 'in_transit', lines: [[5, 4]] },
    ];
    const transfers: any[] = [];
    for (const t of transferDefs) {
        const items = t.lines.map(([k, qty]) => { const p = products[k % products.length]; return { product: p._id, name: p.name, sku: p.sku || '', unit: p.unit || 'piece', qty }; });
        const sent = at(day(t.dayOffset), 10);
        transfers.push(await prepare(Transfer, {
            reference: trReference(day(t.dayOffset), 1), from: t.from._id, to: t.to._id, items,
            totalQty: items.reduce((s, i) => s + i.qty, 0), status: t.status,
            transferredAt: dhakaDayStart(day(t.dayOffset)), receivedAt: t.status === 'received' ? at(day(t.dayOffset + 1), 16) : null,
            note: 'Demo transfer', createdBy: adminId,
        }, sent));
    }
    ids.transfers = await insert('transfers', Transfer, transfers);

    /* ── 9. Expenses ── */
    // The same default categories the Expenses page creates the first time it opens.
    if (!DRY) await ExpenseService.ensureDefaultCategories();
    let cats: any[] = await ExpenseCategory.find().lean();
    if (DRY && cats.length === 0) cats = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ _id: new Types.ObjectId(), name }));
    const cat = (name: string) => cats.find((c) => c.name.toLowerCase() === name.toLowerCase()) || cats[0];
    let drySeq = 0;
    const expenseDefs: [number, string, string, string, string, number][] = [
        [-72, 'Office rent — July', 'Rent', 'Landlord (Mirpur)', 'bank', 25000],
        [-66, 'Staff salary — July', 'Salary', 'Staff', 'bank', 42000],
        [-60, 'Facebook ads — launch campaign', 'Marketing', 'Meta Ads', 'card', 15000],
        [-55, 'Packaging boxes and bubble wrap', 'Packaging', 'Nawabpur Packaging', 'cash', 6800],
        [-48, 'Electricity bill', 'Utilities', 'DESCO', 'bkash', 3900],
        [-45, 'Internet — 2 months', 'Utilities', 'Link3', 'bkash', 3000],
        [-42, 'Office rent — August', 'Rent', 'Landlord (Mirpur)', 'bank', 25000],
        [-38, 'Staff salary — August', 'Salary', 'Staff', 'bank', 42000],
        [-35, 'Product photo shoot', 'Marketing', 'Studio 71', 'cash', 8000],
        [-31, 'Tea and snacks for the team', 'Food & entertainment', 'Local shop', 'cash', 1450],
        [-28, 'Van hire to the godown', 'Transport', 'Pickup van', 'cash', 2200],
        [-24, 'Facebook ads — Eid offer', 'Marketing', 'Meta Ads', 'card', 12000],
        [-20, 'Printer ink and paper', 'Office supplies', 'Stationery shop', 'cash', 1850],
        [-17, 'Shelf repair in the godown', 'Repairs & maintenance', 'Carpenter', 'cash', 3500],
        [-14, 'bKash cash-out charges', 'Bank & mobile fees', 'bKash', 'bkash', 740],
        [-12, 'Office rent — September', 'Rent', 'Landlord (Mirpur)', 'bank', 25000],
        [-10, 'Packaging tape and labels', 'Packaging', 'Nawabpur Packaging', 'cash', 2400],
        [-8, 'Staff salary — September (advance)', 'Salary', 'Staff', 'bkash', 15000],
        [-6, 'Google ads test', 'Marketing', 'Google Ads', 'card', 5000],
        [-4, 'Electricity bill', 'Utilities', 'DESCO', 'bkash', 4100],
        [-2, 'Rickshaw and CNG fares', 'Transport', 'Local', 'cash', 650],
        [-1, 'Lunch for the packing team', 'Food & entertainment', 'Local restaurant', 'cash', 1200],
    ];
    const expenses: any[] = [];
    for (const [offset, title, catName, paidTo, paidBy, amount] of expenseDefs) {
        const counter: any = DRY
            ? { seq: ++drySeq }
            : await ExpenseCounter.findOneAndUpdate({ _id: 'expense' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
        expenses.push(await prepare(Expense, {
            seq: counter.seq, voucherNo: voucherNo(counter.seq), date: dhakaDayStart(day(offset)), title, category: cat(catName)._id,
            paidTo, paidBy, amount, note: 'Demo expense', createdBy: adminId,
        }, at(day(offset), 18)));
    }
    ids.expenses = await insert('expenses', Expense, expenses);

    /* ── 10. Investors ── */
    const investorDefs: [string, string, [number, 'in' | 'out', number, string][]][] = [
        ['Md. Kamrul Hasan', '01999001401', [[-88, 'in', 500000, 'bank'], [-40, 'in', 200000, 'bank']]],
        ['Shirin Akter', '01999001402', [[-86, 'in', 300000, 'bkash'], [-9, 'out', 20000, 'bkash']]],
        ['Tanvir Chowdhury', '01999001403', [[-80, 'in', 250000, 'bank']]],
        ['Fahim Rahman', '01999001404', [[-30, 'in', 150000, 'cash']]],
    ];
    const investors: any[] = [];
    const investorTx: any[] = [];
    for (const [name, phone, txs] of investorDefs) {
        const inv = await prepare(Investor, { name, phone, note: 'Demo investor', isActive: true }, at(day(txs[0][0]), 11));
        investors.push(inv);
        for (const [offset, type, amount, method] of txs) {
            investorTx.push(await prepare(InvestorTransaction, {
                investor: inv._id, type, amount, date: dhakaDayStart(day(offset)), method,
                note: type === 'in' ? 'Capital invested' : 'Capital taken back', createdBy: adminId,
            }, at(day(offset), 12)));
        }
    }
    ids.investors = await insert('investors', Investor, investors);
    ids.investorTransactions = await insert('investorTransactions', InvestorTransaction, investorTx);

    await manifest().updateOne({ _id: MANIFEST_ID }, { $set: { status: 'done', finishedAt: new Date() } });

    const revenue = orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
    console.log(DRY ? '🧪 Dry run — every document built and validated, NOTHING written:' : '✅ Demo data added:');
    console.log(`   ${ids.users.length} customers, ${ids.orders.length} orders (৳${revenue.toLocaleString('en-IN')} delivered), ${ids.courierPayouts.length} courier payouts, 1 fraud-check flag`);
    console.log(`   ${staff.length} staff logins (${staff.filter((s) => s.role === 'editor').length} editors), ${ids.activityLogs.length} order-desk actions for the Staff activity report`);
    console.log(`   ${ids.suppliers.length} suppliers, ${ids.purchases.length} purchases, ${ids.warehouses.length} warehouses, ${ids.transfers.length} transfers`);
    console.log(`   ${ids.expenses.length} expenses, ${ids.investors.length} investors, cost price set on ${productCosts.length} products`);
    console.log('   Remove it all again with:  npm run demo:clean');
}

/* ─── Clean ─────────────────────────────────────────────────────────── */

async function cleanDemo() {
    const m: any = await manifest().findOne({ _id: MANIFEST_ID });
    if (!m) { console.log('No demo data found — nothing to remove.'); return; }
    const ids: Record<string, Types.ObjectId[]> = m.ids || {};
    const orderIds = ids.orders || [];

    // Stock that admins put back by cancelling/returning a demo order, or added by
    // receiving a demo purchase into stock, is taken out again (demo orders never took any).
    const purchaseNotes = (m.purchaseRefs || []).map((r: string) => `Purchase ${r}`);
    const moves: any[] = await StockMovement.find({
        $or: [{ order: { $in: orderIds } }, { note: { $in: purchaseNotes } }],
    }).lean();
    for (const mv of moves) {
        if (['cancel', 'return', 'stock_in'].includes(mv.type) && mv.quantity > 0) {
            await Product.collection.updateOne({ _id: mv.product }, { $inc: { stock: -mv.quantity } });
        }
    }
    await StockMovement.deleteMany({ _id: { $in: moves.map((x) => x._id) } });

    const del = async (Model: mongoose.Model<any>, list?: Types.ObjectId[]) => (list?.length ? (await Model.collection.deleteMany({ _id: { $in: list } })).deletedCount : 0);
    const counts = {
        orders: await del(Order, orderIds),
        fraudFlags: (await FraudFlag.collection.deleteMany({ order: { $in: orderIds } })).deletedCount,
        users: await del(User, ids.users),
        activityLogs: await del(ActivityLog, ids.activityLogs),
        courierPayouts: await del(CourierPayout, ids.courierPayouts),
        purchases: await del(Purchase, ids.purchases),
        transfers: await del(Transfer, ids.transfers),
        suppliers: await del(Supplier, ids.suppliers),
        warehouses: await del(Warehouse, ids.warehouses),
        expenses: await del(Expense, ids.expenses),
        investorTransactions: await del(InvestorTransaction, ids.investorTransactions),
        investors: await del(Investor, ids.investors),
    };
    // Rows that hang off demo records go too: a transaction an admin added to a demo
    // investor, or order-status notifications sent to a demo customer.
    await InvestorTransaction.collection.deleteMany({ investor: { $in: ids.investors || [] } });
    await mongoose.connection.collection('notifications').deleteMany({ user: { $in: ids.users || [] } });

    // Cost prices go back only where nobody changed them since.
    let restored = 0;
    for (const pc of m.productCosts || []) {
        const r = await Product.collection.updateOne({ _id: pc._id, costPrice: pc.demo }, { $set: { costPrice: pc.before } });
        restored += r.modifiedCount;
    }

    // Voucher numbers continue from the highest real expense.
    const lastExpense: any = await Expense.findOne().sort({ seq: -1 }).select('seq').lean();
    await ExpenseCounter.updateOne({ _id: 'expense' }, { $set: { seq: lastExpense?.seq || 0 } });

    await manifest().deleteOne({ _id: MANIFEST_ID });
    console.log('✅ Demo data removed:', JSON.stringify(counts));
    console.log(`   cost price restored on ${restored} products; ${moves.length} demo stock movements reversed`);
}

/* ─── Entry ─────────────────────────────────────────────────────────── */

const mode = process.argv[2];
(async () => {
    if (!['seed', 'clean', 'dry'].includes(mode)) throw new Error('Usage: ts-node src/demo-data.ts seed|clean|dry');
    await mongoose.connect(config.database_url, DRY ? { autoIndex: false, autoCreate: false } : {});
    console.log('🔌 Connected to', mongoose.connection.name);
    if (mode === 'clean') await cleanDemo(); else await seedDemo();
    await mongoose.disconnect();
})().catch(async (e) => {
    console.error('❌', e?.message || e);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
