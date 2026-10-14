import { Inquiry } from './inquiry.model';
import { Product } from '../product/product.model';
import { User } from '../user/user.model';
import NotificationService from '../notification/notification.service';
import { notifyInquiryToWhatsApp } from '../../utils/whatsappNotify';

const InquiryService = {
    create: async (data: any) => {
        const inquiry = await Inquiry.create(data);

        // Send WhatsApp notification to admin (fire & forget)
        let productName = data.subject || 'General Contact Inquiry';
        if (data.product) {
            try {
                const product = await Product.findById(data.product).select('name');
                if (product?.name) productName = product.name;
            } catch {
                /* non-blocking */
            }
        }

        notifyInquiryToWhatsApp({
            customerName: data.name || '',
            customerPhone: data.phone || data.email || '',
            productName,
            message: data.message || '',
            color: data.color || '',
            size: data.size || '',
        }).catch(() => {}); // never block inquiry flow

        // In-app notification to all admins & superadmins
        User.find({ role: { $in: ['admin', 'superadmin'] } })
            .select('_id')
            .then(async (admins) => {
                for (const admin of admins) {
                    await NotificationService.notify({
                        user: admin._id,
                        type: 'inquiry',
                        title: 'New Customer Inquiry',
                        message: `${data.name} sent a message: "${data.subject || 'Contact Us'}"`,
                        link: '/dashboard/admin/inquiries',
                        meta: { inquiryId: inquiry._id.toString() },
                    });
                }
            })
            .catch(() => {});

        return inquiry;
    },

    getAll: async (query: Record<string, unknown>) => {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter: any = {};
        if (query.status) filter.status = query.status;
        if (query.product) filter.product = query.product;

        if (query.searchTerm) {
            const term = String(query.searchTerm).trim();
            filter.$or = [
                { name: { $regex: term, $options: 'i' } },
                { email: { $regex: term, $options: 'i' } },
                { phone: { $regex: term, $options: 'i' } },
                { subject: { $regex: term, $options: 'i' } },
                { message: { $regex: term, $options: 'i' } },
            ];
        }

        const [inquiries, total] = await Promise.all([
            Inquiry.find(filter)
                .populate('product', 'name slug thumbnail')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Inquiry.countDocuments(filter),
        ]);

        return {
            inquiries,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    },

    getByProduct: async (productId: string) => {
        const inquiries = await Inquiry.find({ product: productId })
            .sort({ createdAt: -1 })
            .limit(50);
        return inquiries;
    },

    updateStatus: async (id: string, data: { status: string; adminReply?: string }) => {
        const inquiry = await Inquiry.findByIdAndUpdate(id, data, { new: true });
        if (!inquiry) throw new Error('Inquiry not found');
        return inquiry;
    },

    delete: async (id: string) => {
        const inquiry = await Inquiry.findByIdAndDelete(id);
        if (!inquiry) throw new Error('Inquiry not found');
        return inquiry;
    },
};

export default InquiryService;
