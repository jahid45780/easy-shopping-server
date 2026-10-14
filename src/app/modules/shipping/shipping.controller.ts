import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ShippingZone, ShippingRate } from './shipping.model';
import { Order } from '../order/order.model';
import QueryBuilder from '../../utils/QueryBuilder';
import AppError from '../../utils/AppError';
import { computeShippingCost, getSettings, updateSettings, isDeliveryArea } from './shipping.service';

const ShippingController = {
    // ═══════════════════ PUBLIC QUOTE ═══════════════════
    // GET /shipping/quote?city=...&subtotal=...&zoneId=...&area=inside_dhaka|outside_dhaka  (no auth)
    getQuote: catchAsync(async (req: Request, res: Response) => {
        const city = typeof req.query.city === 'string' ? req.query.city : '';
        const subtotal = Number(req.query.subtotal) || 0;
        const zoneId = typeof req.query.zoneId === 'string' && req.query.zoneId ? req.query.zoneId : undefined;
        const area = isDeliveryArea(req.query.area) ? req.query.area : undefined;
        const quote = await computeShippingCost({ city, subtotal, zoneId, area });
        sendResponse(res, { statusCode: 200, success: true, message: 'Shipping quote', data: quote });
    }),

    // GET /shipping/delivery-zones  (public — active zones + their rate for the
    // checkout "Delivery Area" dropdown). Only zones that have an active rate are
    // returned, so every option can show a price.
    getDeliveryZones: catchAsync(async (_req: Request, res: Response) => {
        const zones = await ShippingZone.find({ isActive: true }).sort('name');
        const withRates = await Promise.all(
            zones.map(async (z) => {
                const rate = await ShippingRate.findOne({ zone: z._id, isActive: true }).sort('price');
                if (!rate || typeof rate.price !== 'number') return null;
                return {
                    _id: z._id,
                    name: z.name,
                    regions: z.regions || [],
                    price: rate.price,
                    estimatedDays: rate.estimatedDays || '',
                    freeShippingMinimum: (rate as any).freeShippingMinimum || 0,
                };
            }),
        );
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Delivery zones fetched',
            data: withRates.filter(Boolean),
        });
    }),

    // ═══════════════════ SETTINGS (singleton) ═══════════════════
    // GET /shipping/settings  (public — cart shows the live free-shipping threshold)
    getSettings: catchAsync(async (_req: Request, res: Response) => {
        const settings = await getSettings();
        sendResponse(res, { statusCode: 200, success: true, message: 'Shipping settings', data: settings });
    }),

    // PATCH /shipping/settings  (admin)
    updateSettings: catchAsync(async (req: Request, res: Response) => {
        const settings = await updateSettings(req.body);
        sendResponse(res, { statusCode: 200, success: true, message: 'Shipping settings updated', data: settings });
    }),

    // ═══════════════════ ZONES ═══════════════════
    getZones: catchAsync(async (req: Request, res: Response) => {
        const zones = await ShippingZone.find().sort('-createdAt');
        sendResponse(res, { statusCode: 200, success: true, message: 'Zones fetched', data: zones });
    }),

    createZone: catchAsync(async (req: Request, res: Response) => {
        const zone = await ShippingZone.create(req.body);
        sendResponse(res, { statusCode: 201, success: true, message: 'Zone created', data: zone });
    }),

    updateZone: catchAsync(async (req: Request, res: Response) => {
        const zone = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!zone) throw new AppError(404, 'Zone not found');
        sendResponse(res, { statusCode: 200, success: true, message: 'Zone updated', data: zone });
    }),

    deleteZone: catchAsync(async (req: Request, res: Response) => {
        const zone = await ShippingZone.findByIdAndDelete(req.params.id);
        if (!zone) throw new AppError(404, 'Zone not found');
        sendResponse(res, { statusCode: 200, success: true, message: 'Zone deleted', data: zone });
    }),

    // ═══════════════════ RATES ═══════════════════
    getRates: catchAsync(async (req: Request, res: Response) => {
        const rates = await ShippingRate.find().populate('zone', 'name').sort('-createdAt');
        sendResponse(res, { statusCode: 200, success: true, message: 'Rates fetched', data: rates });
    }),

    createRate: catchAsync(async (req: Request, res: Response) => {
        const rate = await ShippingRate.create(req.body);
        sendResponse(res, { statusCode: 201, success: true, message: 'Rate created', data: rate });
    }),

    updateRate: catchAsync(async (req: Request, res: Response) => {
        const rate = await ShippingRate.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!rate) throw new AppError(404, 'Rate not found');
        sendResponse(res, { statusCode: 200, success: true, message: 'Rate updated', data: rate });
    }),

    deleteRate: catchAsync(async (req: Request, res: Response) => {
        const rate = await ShippingRate.findByIdAndDelete(req.params.id);
        if (!rate) throw new AppError(404, 'Rate not found');
        sendResponse(res, { statusCode: 200, success: true, message: 'Rate deleted', data: rate });
    }),

    // ═══════════════════ SHIPMENTS (from Orders) ═══════════════════
    getShipments: catchAsync(async (req: Request, res: Response) => {
        const shipmentQuery = new QueryBuilder(
            Order.find({ status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] } })
                .populate('user', 'firstName lastName email phone')
                .select('orderId user shippingAddress total shippingCost status paymentStatus createdAt trackingNumber carrier'),
            req.query as Record<string, unknown>
        ).filter().sort().paginate();

        const shipments = await shipmentQuery.modelQuery;
        const meta = await shipmentQuery.countTotal();

        const shipmentRecords = shipments.map((order: any) => {
            const a = order.shippingAddress || {};
            const userName = order.user ? `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim() : '';
            return {
                _id: order._id,
                orderId: order.orderId || `ORD-${order._id.toString().slice(-8).toUpperCase()}`,
                customerName: a.fullName || userName || 'Unknown',
                destination: a.city ? [a.city, a.area].filter(Boolean).join(', ') : 'N/A',
                address: a.address || '',
                phone: a.phone || order.user?.phone || '',
                total: order.total,
                shippingCost: order.shippingCost || 0,
                status: order.status,
                trackingNumber: order.trackingNumber || '',
                carrier: order.carrier || '',
                date: order.createdAt,
            };
        });

        sendResponse(res, { statusCode: 200, success: true, message: 'Shipments fetched', data: shipmentRecords, meta });
    }),

    // GET /shipping/stats
    getStats: catchAsync(async (req: Request, res: Response) => {
        const [totalShipments, toShip, inTransit, delivered] = await Promise.all([
            Order.countDocuments({ status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] } }),
            Order.countDocuments({ status: { $in: ['confirmed', 'processing'] } }),
            Order.countDocuments({ status: 'shipped' }),
            Order.countDocuments({ status: 'delivered' }),
        ]);
        const zones = await ShippingZone.countDocuments();
        const rates = await ShippingRate.countDocuments();

        sendResponse(res, {
            statusCode: 200, success: true, message: 'Shipping stats fetched',
            data: { totalShipments, toShip, inTransit, delivered, zones, rates },
        });
    }),

    // PATCH /shipping/shipments/:id/status
    updateShipmentStatus: catchAsync(async (req: Request, res: Response) => {
        const order = await Order.findById(req.params.id);
        if (!order) throw new AppError(404, 'Order not found');

        order.status = req.body.status;
        if (req.body.trackingNumber) (order as any).trackingNumber = req.body.trackingNumber;
        if (req.body.carrier) (order as any).carrier = req.body.carrier;
        order.timeline.push({ status: req.body.status, note: req.body.note || 'Shipping status updated', createdAt: new Date() } as any);

        if (req.body.status === 'delivered' && order.paymentMethod === 'cod') {
            order.paymentStatus = 'paid';
        }

        await order.save();
        sendResponse(res, { statusCode: 200, success: true, message: 'Shipment status updated', data: order });
    }),

    // PATCH /shipping/shipments/:id/tracking
    updateTracking: catchAsync(async (req: Request, res: Response) => {
        const order = await Order.findById(req.params.id);
        if (!order) throw new AppError(404, 'Order not found');

        (order as any).trackingNumber = req.body.trackingNumber || '';
        (order as any).carrier = req.body.carrier || '';
        await order.save();

        sendResponse(res, { statusCode: 200, success: true, message: 'Tracking info updated', data: order });
    }),
};

export default ShippingController;
