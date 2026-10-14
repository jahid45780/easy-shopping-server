import { z } from 'zod';

// ── Shared product create shape (reused by single create + bulk upload) ──
// Defined as a bare object schema (no { body } wrapper) so it can be:
//   1) wrapped in { body } + .refine for the single-create request, and
//   2) nested inside the bulk-upload products[] array.
const productCreateShape = z.object({
    // Only name and price are required. Everything else can be filled in later —
    // adding a product should not mean filling a long form first.
    name:          z.string({ required_error: 'Product name is required', invalid_type_error: 'Product name is required' }).min(1, 'Product name is required').max(200),
    description:   z.string().optional(),
    tagline:       z.string().max(200).optional(),
    priceType:     z.enum(['fixed', 'negotiable']).optional(),
    productType:   z.enum(['simple', 'variable', 'multi-color']).optional(),
    slug:          z.string().optional(),

    // Pricing — discount is auto-calculated, no need to send it
    price:         z.number({ required_error: 'Price is required', invalid_type_error: 'Price must be a number' }).min(0, 'Price must be positive'),
    originalPrice: z.number().min(0).optional().nullable(),
    costPrice:     z.number().min(0).optional(),

    // Offer validity window — ISO date string or null; flows through create + update
    offerStartDate: z.string().or(z.date()).optional().nullable(),
    offerEndDate:   z.string().or(z.date()).optional().nullable(),

    // Images
    // No photo yet → the model falls back to the placeholder image.
    thumbnail: z.string().optional(),
    images:    z.array(z.string()).optional(),

    // Category — a product without one simply does not show up under any category.
    category:      z.string().optional(),
    subCategory:   z.string().optional(),
    childCategory: z.string().optional(),

    // Specifications
    brand:        z.string().optional(),
    model:        z.string().optional(),
    weight:       z.string().optional(),
    boxSize:      z.string().optional(),
    insideTheBox: z.string().optional(),

    // Attributes
    material: z.array(z.string()).optional(),
    pattern:  z.string().optional(),
    gender:   z.enum(['', 'Men', 'Women', 'Unisex', 'Kids']).optional(),

    // Spec table + highlights
    specifications: z.array(z.object({ key: z.string().optional(), value: z.string().optional() })).optional(),
    highlights:     z.array(z.string()).optional(),

    // Dimensions / warranty / shipping
    dimensions: z.object({
        length: z.coerce.number().min(0).optional(),
        width:  z.coerce.number().min(0).optional(),
        height: z.coerce.number().min(0).optional(),
    }).optional(),
    warranty: z.object({
        hasWarranty:  z.boolean().optional(),
        duration:     z.coerce.number().min(0).optional(),
        durationUnit: z.enum(['days', 'months', 'years']).optional(),
        type:         z.enum(['manufacturer', 'seller', 'none']).optional(),
    }).optional(),
    shippingConfig: z.object({
        freeShipping:  z.boolean().optional(),
        shippingCost:  z.coerce.number().min(0).optional(),
        estimatedDays: z.coerce.number().min(0).optional(),
    }).optional(),

    // Status
    status:     z.enum(['active', 'draft', 'out-of-stock']).optional(),
    visibility: z.enum(['visible', 'hidden']).optional(),
    isFeatured:   z.boolean().optional(),
    isNewProduct: z.boolean().optional(),
    isOnSale:     z.boolean().optional(),

    // Base stock (used when no variants)
    stock: z.coerce.number().min(0).optional(),
    lowStockThreshold: z.coerce.number().min(0).optional(),
    unit: z.string().optional(),

    // Shown on the product page ("N Sold", views): the admin's starting numbers.
    // Orders add to totalSold and page visits add to viewCount from there.
    totalSold: z.coerce.number().int('Sold must be a whole number').min(0, 'Sold cannot be negative').optional(),
    viewCount: z.coerce.number().int('Views must be a whole number').min(0, 'Views cannot be negative').optional(),

    // Image Search / Filter
    tags:     z.array(z.string()).optional(),
    colors:   z.array(z.string()).optional(),
    colorHex: z.array(z.string()).optional(),
    sizes:    z.array(z.string()).optional(),
    aiLabels: z.array(z.string()).optional(),

    // Variants — each color+size combo with its own price/stock/images
    variants: z.array(
        z.object({
            label:         z.string().optional(),
            color:         z.string().optional(),
            colorHex:      z.string().optional(),
            size:          z.string().optional(),
            price:         z.number().min(0, 'Variant price required'),
            originalPrice: z.number().min(0).optional().nullable(),
            stock:         z.number().min(0).optional(),
            sku:           z.string().optional(),
            images:        z.array(z.string()).optional(),
            note:          z.string().optional(),
        })
    ).optional(),

    // Content Tabs
    deliveryInfo: z.string().optional(),
    paymentInfo:  z.string().optional(),
    termsInfo:    z.string().optional(),

    // SEO
    metaTitle:       z.string().optional(),
    metaDescription: z.string().optional(),
    metaKeywords:    z.array(z.string()).optional(),
});

export const createProductValidation = z.object({
    body: productCreateShape,
});

export const updateProductValidation = z.object({
    body: productCreateShape.partial(),
});

// ── Bulk upload — array of the product create shape ─────────────────────
// Each row also enforces the min-3-images rule so invalid rows are caught.
export const bulkUploadValidation = z.object({
    body: z.object({
        products: z.array(productCreateShape).min(1, 'At least one product is required'),
    }),
});

export const bulkStatusValidation = z.object({
    body: z.object({
        ids:    z.array(z.string()).min(1),
        status: z.enum(['active', 'draft', 'out-of-stock']),
    }),
});

export const bulkDeleteValidation = z.object({
    body: z.object({
        ids: z.array(z.string()).min(1),
    }),
});
