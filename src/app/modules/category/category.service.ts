import { Category } from './category.model';
import { Product } from '../product/product.model';
import AppError from '../../utils/AppError';

// Attach real-time recursive product counts (active, not deleted, approved, visible for public) to each category
const attachProductCounts = async (categories: any[], isAdmin: boolean = false) => {
    // 1. Fetch all active products matching visibility scope
    const filter: any = {
        isDeleted: false,
        status: 'active',
    };
    if (!isAdmin) {
        filter.approvalStatus = { $nin: ['pending', 'rejected'] };
        filter.visibility = { $ne: 'hidden' };
    }

    const activeProducts = await Product.find(
        filter,
        { _id: 1, category: 1, subCategory: 1, childCategory: 1 }
    ).lean();

    // 2. Build map of category ID -> Set of Product IDs directly assigned
    const directProductMap: Record<string, Set<string>> = {};
    for (const p of activeProducts) {
        const prodId = String(p._id);
        if (p.category) {
            const cid = String(p.category);
            (directProductMap[cid] ||= new Set()).add(prodId);
        }
        if (p.subCategory) {
            const scid = String(p.subCategory);
            (directProductMap[scid] ||= new Set()).add(prodId);
        }
        if (p.childCategory) {
            const ccid = String(p.childCategory);
            (directProductMap[ccid] ||= new Set()).add(prodId);
        }
    }

    // 3. Build parent -> children map using all DB categories to cover complete hierarchy
    const allDbCats = await Category.find({ isDeleted: false, ...(isAdmin ? {} : { isActive: true }) })
        .select('_id parent')
        .lean();
    const childrenMap: Record<string, string[]> = {};
    for (const cat of allDbCats) {
        const pId = cat.parent && typeof cat.parent === 'object' ? String(cat.parent._id) : (cat.parent ? String(cat.parent) : null);
        if (pId) {
            (childrenMap[pId] ||= []).push(String(cat._id));
        }
    }

    // 4. Helper to collect all descendant category IDs (including self)
    const getSubtreeCategoryIds = (catId: string): string[] => {
        const result = [catId];
        const queue = [catId];
        while (queue.length > 0) {
            const current = queue.shift()!;
            const children = childrenMap[current] || [];
            for (const child of children) {
                result.push(child);
                queue.push(child);
            }
        }
        return result;
    };

    // 5. Calculate distinct product count for each category's entire subtree
    return categories.map((cat: any) => {
        const catId = String(cat._id);
        const subtreeIds = getSubtreeCategoryIds(catId);
        const totalProductIds = new Set<string>();
        for (const id of subtreeIds) {
            const set = directProductMap[id];
            if (set) {
                set.forEach((pid) => totalProductIds.add(pid));
            }
        }

        return {
            ...cat,
            id: catId,
            productCount: totalProductIds.size,
        };
    });
};

const CategoryService = {
    async getAllCategories(parent?: string) {
        const filter: any = { isDeleted: false, isActive: true };
        // Optional ?parent=<id> filter → return only that parent's sub-categories
        if (parent !== undefined) filter.parent = parent === 'null' ? null : parent;
        const categories = await Category.find(filter)
            .populate('parent', 'name slug')
            .sort({ level: 1, order: 1, name: 1 })
            .lean();
        return attachProductCounts(categories, false);
    },

    async getSubCategories(parentId: string) {
        const parent = await Category.findById(parentId);
        if (!parent || parent.isDeleted) throw new AppError(404, 'Parent category not found');
        const categories = await Category.find({ parent: parentId, isDeleted: false, isActive: true })
            .populate('parent', 'name slug')
            .sort({ order: 1, name: 1 })
            .lean();
        return attachProductCounts(categories, false);
    },

    async getAllCategoriesAdmin() {
        const categories = await Category.find({ isDeleted: false })
            .populate('parent', 'name slug')
            .sort({ level: 1, order: 1 })
            .lean();
        return attachProductCounts(categories, true);
    },

    async getCategoryById(id: string) {
        const category = await Category.findById(id).populate('parent', 'name slug');
        if (!category || category.isDeleted) throw new AppError(404, 'Category not found');
        return category;
    },

    async createCategory(payload: any) {
        // Set level based on parent
        if (payload.parent) {
            const parent = await Category.findById(payload.parent);
            if (!parent) throw new AppError(404, 'Parent category not found');
            payload.level = (parent.level || 0) + 1;
        } else {
            payload.parent = null;
            payload.level = 0;
        }

        // Auto-generate slug from name
        payload.slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const existing = await Category.findOne({ slug: payload.slug });
        if (existing) payload.slug = `${payload.slug}-${Date.now()}`;

        return await Category.create(payload);
    },

    async updateCategory(id: string, payload: any) {
        const currentCategory = await Category.findById(id);
        if (!currentCategory || currentCategory.isDeleted) throw new AppError(404, 'Category not found');

        if (payload.parent !== undefined) {
            if (payload.parent) {
                const targetParentId = String(payload.parent);
                if (targetParentId === id) {
                    throw new AppError(400, 'A category cannot be its own parent');
                }

                // Prevent cycle: target parent cannot be a descendant of this category
                let curr: any = await Category.findById(targetParentId);
                if (!curr) throw new AppError(404, 'Parent category not found');
                payload.level = (curr.level || 0) + 1;

                while (curr && curr.parent) {
                    if (String(curr.parent) === id) {
                        throw new AppError(400, 'Cannot set a descendant category as parent (cycle detected)');
                    }
                    curr = await Category.findById(curr.parent);
                }
            } else {
                payload.parent = null;
                payload.level = 0;
            }
        }

        if (payload.name) {
            payload.slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
        const category = await Category.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        if (!category) throw new AppError(404, 'Category not found');
        return category;
    },

    async deleteCategory(id: string) {
        const category = await Category.findById(id);
        if (!category || category.isDeleted) throw new AppError(404, 'Category not found');

        // Guard 1: don't orphan sub-categories.
        const subCount = await Category.countDocuments({ parent: id, isDeleted: false });
        if (subCount > 0) {
            throw new AppError(
                400,
                `Cannot delete "${category.name}": it has ${subCount} sub-categor${subCount === 1 ? 'y' : 'ies'}. Delete or move them to another parent first.`,
            );
        }

        // Guard 2: don't orphan products (used as primary, sub, or child category).
        const productCount = await Product.countDocuments({
            isDeleted: false,
            $or: [{ category: id }, { subCategory: id }, { childCategory: id }],
        });
        if (productCount > 0) {
            throw new AppError(
                400,
                `Cannot delete "${category.name}": ${productCount} product${productCount === 1 ? ' is' : 's are'} still in this category. Reassign or remove them first.`,
            );
        }

        await Category.findByIdAndUpdate(id, { isDeleted: true });
        return category;
    },
};

export default CategoryService;
