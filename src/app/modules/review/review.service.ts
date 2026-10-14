import mongoose from 'mongoose';
import { Review } from './review.model';
import AppError from '../../utils/AppError';
import QueryBuilder from '../../utils/QueryBuilder';

const ReviewService = {
    async getProductReviews(productId: string, query: Record<string, unknown>) {
        const reviewQuery = new QueryBuilder(
            Review.find({ product: productId, status: 'approved' }).populate('user', 'firstName lastName avatar'),
            query
        ).sort().paginate();

        const reviews = await reviewQuery.modelQuery;
        const meta = await reviewQuery.countTotal();
        return { reviews, meta };
    },

    // Logged-in customer: their own review history (newest first)
    async getMyReviews(userId: string, query: Record<string, unknown>) {
        const reviewQuery = new QueryBuilder(
            Review.find({ user: userId }).populate('product', 'name thumbnail slug'),
            { sort: '-createdAt', ...query }
        ).sort().paginate();

        const reviews = await reviewQuery.modelQuery;
        const meta = await reviewQuery.countTotal();
        return { reviews, meta };
    },

    // Check whether a customer is eligible to review a product (must have bought & received it)
    async canReview(userId: string, productId: string) {
        const OrderModel = mongoose.model('Order');
        const purchased = await OrderModel.exists({
            user: userId,
            $or: [
                { status: { $in: ['delivered', 'completed'] }, 'items.product': productId },
                { 'packages.status': { $in: ['delivered', 'completed'] }, 'items.product': productId },
            ],
        });
        const alreadyReviewed = await Review.exists({ product: productId, user: userId });
        return {
            canReview: Boolean(purchased) && !alreadyReviewed,
            hasPurchased: Boolean(purchased),
            alreadyReviewed: Boolean(alreadyReviewed),
        };
    },

    async createReview(userId: string, payload: any) {
        // Verified-purchase only: the reviewer must have a DELIVERED order containing this
        // product. Without this a logged-in user could review (and skew averageRating on)
        // any product they never bought — inflating their own or trashing competitors'.
        const OrderModel = mongoose.model('Order');
        const purchased = await OrderModel.exists({
            user: userId,
            $or: [
                { status: { $in: ['delivered', 'completed'] }, 'items.product': payload.product },
                { 'packages.status': { $in: ['delivered', 'completed'] }, 'items.product': payload.product },
            ],
        });
        if (!purchased) {
            throw new AppError(403, 'You can only review products that have been delivered to you.');
        }

        const exists = await Review.findOne({ product: payload.product, user: userId });
        if (exists) throw new AppError(400, 'You have already reviewed this product');

        const review = await Review.create({
            ...payload,
            user: userId,
            isVerifiedPurchase: true,
            status: 'approved',
            isApproved: true,
        });


        return review;
    },

    // Public (guest) review — no login required. Post-save hook on Review model
    // keeps product.reviewCount / commentCount / rating in sync.
    async publicCreateReview(payload: any) {
        const { product, rating, comment, userName } = payload;
        return await Review.create({
            product,
            rating,
            comment,
            userName: userName?.trim() || 'Anonymous',
            user: null,
        });
    },

    async updateReview(id: string, userId: string, payload: any) {
        // Customers may only edit their OWN review's content (not moderation state).
        const { rating, comment, title, images } = payload;
        const allowed: any = {};
        if (rating !== undefined) allowed.rating = rating;
        if (comment !== undefined) allowed.comment = comment;
        if (title !== undefined) allowed.title = title;
        if (images !== undefined) allowed.images = images;
        const review = await Review.findOneAndUpdate(
            { _id: id, user: userId },
            allowed,
            { new: true }
        );
        if (!review) throw new AppError(404, 'Review not found');
        return review;
    },

    // Admin moderation — approve/reject any review + attach an official reply.
    // Not user-scoped. Keeps the legacy `isApproved` flag in sync with `status`.
    async adminUpdateReview(id: string, payload: any) {
        const update: any = {};
        if (payload.status !== undefined) {
            update.status = payload.status;
            update.isApproved = payload.status === 'approved';
        }
        if (payload.adminReply !== undefined) update.adminReply = payload.adminReply;
        const review = await Review.findByIdAndUpdate(id, update, { new: true });
        if (!review) throw new AppError(404, 'Review not found');
        return review;
    },

    async deleteReview(id: string, userId: string, isAdmin: boolean) {
        const filter = isAdmin ? { _id: id } : { _id: id, user: userId };
        const review = await Review.findOneAndDelete(filter);
        if (!review) throw new AppError(404, 'Review not found');
        return review;
    },

    async getAllReviews(query: Record<string, unknown>) {
        // Empty status = "All" → don't add a status filter.
        if (!query.status) delete query.status;
        const reviewQuery = new QueryBuilder(
            Review.find().populate('user', 'firstName lastName avatar').populate('product', 'name thumbnail slug'),
            query
        ).filter().sort().paginate();
        const reviews = await reviewQuery.modelQuery;
        const meta = await reviewQuery.countTotal();
        return { reviews, meta };
    },

    // Public: increment review like count
    async likeReview(reviewId: string) {
        const review = await Review.findByIdAndUpdate(
            reviewId,
            { $inc: { likes: 1 } },
            { new: true }
        );
        if (!review) throw new AppError(404, 'Review not found');
        return review;
    },

    // Public: add reply to a review
    async replyToReview(reviewId: string, payload: { text: string; userName?: string }) {
        const text = (payload.text || '').trim();
        if (!text) throw new AppError(400, 'Reply text is required');

        const review = await Review.findByIdAndUpdate(
            reviewId,
            {
                $push: {
                    replies: {
                        text,
                        userName: payload.userName?.trim() || 'Anonymous',
                        likes: 0,
                    },
                },
            },
            { new: true }
        );
        if (!review) throw new AppError(404, 'Review not found');
        return review;
    },

    // Public: like a specific reply inside a review
    async likeReply(reviewId: string, replyId: string) {
        const review = await Review.findOneAndUpdate(
            { _id: reviewId, 'replies._id': replyId },
            { $inc: { 'replies.$.likes': 1 } },
            { new: true }
        );
        if (!review) throw new AppError(404, 'Reply not found');
        return review;
    },

    // Admin: recompute reviewCount / commentCount / rating for every product — fixes drift from legacy data
    async resyncProductStats() {
        const { Product } = require('../product/product.model');
        const aggregated = await Review.aggregate([
            { $match: { status: 'approved' } },
            {
                $group: {
                    _id: '$product',
                    count: { $sum: 1 },
                    avgRating: { $avg: '$rating' },
                },
            },
        ]);

        const statsByProduct = new Map<string, { count: number; rating: number }>();
        for (const row of aggregated) {
            statsByProduct.set(String(row._id), {
                count: row.count,
                rating: Math.round(row.avgRating * 10) / 10,
            });
        }

        const allProducts = await Product.find({}, '_id').lean();
        let updated = 0;
        for (const p of allProducts) {
            const s = statsByProduct.get(String(p._id)) || { count: 0, rating: 0 };
            await Product.findByIdAndUpdate(p._id, {
                reviewCount: s.count,
                commentCount: s.count,
                rating: s.rating,
            });
            updated++;
        }

        return { scanned: allProducts.length, updated };
    },
};

export default ReviewService;
