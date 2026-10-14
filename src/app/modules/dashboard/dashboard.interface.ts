// Shape of GET /api/dashboard/summary — the admin home page, in one call.
// Money is BDT as a plain Number (same as order.model.ts). Dates are ISO strings;
// day keys are 'YYYY-MM-DD' calendar days in Asia/Dhaka.

export interface IDashboardDay {
    date: string;       // 'YYYY-MM-DD' (Asia/Dhaka)
    revenue: number;    // sum of order.total, cancelled orders excluded
    orders: number;     // orders placed that day (all statuses)
    cancelled: number;  // of which cancelled
}

export interface IDashboardStatusCount {
    status: string;
    count: number;
}

export interface IDashboardSummary {
    generatedAt: string;
    timezone: string;
    today: string;                  // 'YYYY-MM-DD' (Asia/Dhaka)

    // ── Tiles ──
    revenueToday: number;
    deliveryToday: number;          // shippingCost of today's revenue orders
    ordersToday: number;            // all orders placed today (every status)
    pendingOrders: number;          // status 'pending', all time
    stockValue: number;             // Σ stock × costPrice — same as Inventory's "Stock value"
    stockUnits: number;
    skuCount: number;               // non-deleted products
    stockUncosted: number;          // in-stock products with no cost yet (missing from stockValue)
    customers: number;              // role 'user'
    newCustomers30d: number;

    // ── Last 30 days ──
    series: IDashboardDay[];        // oldest → today, missing days filled with 0
    seriesTotals: { revenue: number; orders: number; cancelled: number };
    previousTotals: { revenue: number; orders: number }; // the 30 days before that

    // ── Needs attention ──
    needsAttention: {
        pendingOrders: number;
        courierFlagged: number;
        courierFlaggedByStatus: IDashboardStatusCount[];
        outOfStock: number;
        lowStock: number;
        lowStockLimit: number;
        pendingReviews: number;
        pendingReturns: number;
    };
    lowestStock: { _id: string; name: string; sku: string; stock: number; unit: string }[];

    // ── Today / latest ──
    todayByStatus: IDashboardStatusCount[];
    latestOrders: {
        _id: string;
        orderId: string;
        customer: string;
        phone: string;
        status: string;
        paymentStatus: string;
        paymentMethod: string;
        total: number;
        itemCount: number;
        createdAt: string;
    }[];

    // ── Extras (last 30 days) ──
    topProducts: {
        productId: string;
        name: string;
        thumbnail: string;
        units: number;
        revenue: number;
        stock: number | null;       // null when the product no longer exists
    }[];
    salesByCategory: { categoryId: string | null; name: string; revenue: number; units: number }[];
}
