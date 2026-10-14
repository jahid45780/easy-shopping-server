import mongoose, { Schema, model } from 'mongoose';

const replySchema = new Schema(
    {
        text: { type: String, required: true, maxlength: 500 },
        userName: { type: String, maxlength: 50, default: 'Anonymous' },
        likes: { type: Number, default: 0 },
    },
    { timestamps: true }
);

const reviewSchema = new Schema(
    {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        userName: { type: String, maxlength: 50, default: 'Anonymous' },
        rating: { type: Number, required: true, min: 1, max: 5 },
        title: { type: String, maxlength: 100, default: '' },
        comment: { type: String, required: true, maxlength: 1000 },
        images: [{ type: String }],
        isVerifiedPurchase: { type: Boolean, default: false },
        // Legacy visibility flag — kept in sync with `status` (approved ⇒ true).
        isApproved: { type: Boolean, default: false },
        // Moderation state. New reviews start 'pending' and only show once approved.
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        // Official store response shown under the review.
        adminReply: { type: String, maxlength: 1000, default: '' },
        helpfulVotes: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
        replies: { type: [replySchema], default: [] },
    },
    { timestamps: true, toJSON: { virtuals: true } }
);

// Only enforce one-review-per-user for logged-in users (user != null)
reviewSchema.index(
    { product: 1, user: 1 },
    { unique: true, partialFilterExpression: { user: { $ne: null } } }
);
reviewSchema.index({ product: 1, status: 1 });

// Keep the product's rating + review/comment counts in sync with the set of
// APPROVED reviews. Runs after every create/update/delete so the storefront and
// admin moderation always agree.
async function recalcProductRating(productId: any) {
    if (!productId) return;
    // Use the already-registered model (not a dynamic `.js` import) so this resolves
    // identically under ts-node (dev) and compiled JS (production).
    const Product = mongoose.model('Product');
    const stats = await mongoose.model('Review').aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
        { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const count = stats.length > 0 ? stats[0].count : 0;
    const rating = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
    await Product.findByIdAndUpdate(productId, { rating, reviewCount: count, commentCount: count });
}

reviewSchema.post('save', async function () {
    await recalcProductRating(this.product);
});
// findOneAndUpdate / findOneAndDelete do NOT fire 'save' — hook them explicitly so
// admin approve/reject/delete also refresh the product's rating.
reviewSchema.post('findOneAndUpdate', async function (doc: any) {
    if (doc) await recalcProductRating(doc.product);
});
reviewSchema.post('findOneAndDelete', async function (doc: any) {
    if (doc) await recalcProductRating(doc.product);
});

export const Review = model('Review', reviewSchema);
