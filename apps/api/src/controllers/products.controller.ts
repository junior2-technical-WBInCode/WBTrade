import { Request, Response } from 'express';
import { z } from 'zod';
import { ProductsService } from '../services/products.service';
import { PriceChangeSource } from '@prisma/client';
import { popularityService } from '../services/popularity.service';
import { getB2bUserInfo, applyB2bPricing } from '../services/b2b-pricing.service';

const productsService = new ProductsService();

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * Helper to sanitize text - removes potential XSS and trims
 */
const sanitizeText = (text: string): string => {
  let sanitized = text;
  // Iteratively strip HTML tags until none remain (prevents multi-character bypass like <scr<script>ipt>)
  let previous = '';
  while (previous !== sanitized) {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }
  return sanitized
    .replace(/[<>"'&]/g, '') // Remove remaining dangerous characters
    .trim();
};

/**
 * Query params validation for product listing
 */
const productQuerySchema = z.object({
  page: z.string().optional().transform((val) => {
    const num = parseInt(val || '1', 10);
    return isNaN(num) || num < 1 ? 1 : Math.min(num, 1000);
  }),
  limit: z.string().optional().transform((val) => {
    const num = parseInt(val || '48', 10);
    return isNaN(num) || num < 1 ? 48 : Math.min(num, 500);
  }),
  category: z.string().max(100).optional(),
  minPrice: z.string().optional().transform((val) => {
    if (!val) return undefined;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? undefined : num;
  }),
  maxPrice: z.string().optional().transform((val) => {
    if (!val) return undefined;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? undefined : num;
  }),
  search: z.string().max(200).optional().transform((val) => val ? sanitizeText(val) : undefined),
  sort: z.enum(['price_asc', 'price_desc', 'price-asc', 'price-desc', 'name_asc', 'name_desc', 'newest', 'oldest', 'popular', 'random', 'popularity', 'relevance', 'bestsellers', 'top-rated']).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  // Filtr magazynu: leker, hp, btp (może być wiele oddzielone przecinkiem)
  warehouse: z.string().max(50).optional(),
  // Ukryj produkty ze stanem 0 starsze niż 14 dni (domyślnie false - trzeba jawnie włączyć)
  hideOldZeroStock: z.string().optional().transform((val) => val === 'true'),
  // Filtr tylko przecenionych produktów (compareAtPrice > price)
  discounted: z.string().optional().transform((val) => val === 'true'),
  // Filtr producenta (brand name from specifications)
  brand: z.string().max(200).optional().transform((val) => val ? sanitizeText(val) : undefined),
  // Session seed for consistent random sorting
  sessionSeed: z.string().optional().transform((val) => {
    if (!val) return undefined;
    const num = parseInt(val, 10);
    return isNaN(num) ? undefined : num;
  }),
});

/**
 * Product variant schema
 */
const productVariantSchema = z.object({
  id: z.string().optional(), // Existing variant ID
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200).transform(sanitizeText),
  price: z.number().positive().max(9999999),
  compareAtPrice: z.number().positive().max(9999999).optional().nullable(),
  stock: z.number().int().min(0).optional(),
  attributes: z.record(z.string().max(200)).optional(),
});

/**
 * Product image schema
 */
const productImageSchema = z.object({
  id: z.string().optional(), // Existing image ID
  url: z.string().url().max(2000),
  alt: z.string().max(200).optional().nullable().transform((val) => val ? sanitizeText(val) : undefined),
  order: z.number().int().min(0).max(100).optional(),
});

/**
 * Create product validation schema
 */
const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200).transform(sanitizeText),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format').optional(),
  description: z.string().max(10000).optional().transform((val) => val ? sanitizeText(val) : undefined),
  shortDescription: z.string().max(500).optional().transform((val) => val ? sanitizeText(val) : undefined),
  price: z.number().positive('Price must be positive').max(9999999),
  compareAtPrice: z.number().positive().max(9999999).nullable().optional(),
  sku: z.string().min(1).max(100).optional(),
  barcode: z.string().max(50).optional(),
  categoryId: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional().default('DRAFT'),
  specifications: z.record(z.string().max(500)).optional(),
  metaTitle: z.string().max(100).optional().transform((val) => val ? sanitizeText(val) : undefined),
  metaDescription: z.string().max(300).optional().transform((val) => val ? sanitizeText(val) : undefined),
  variants: z.array(productVariantSchema).optional(),
  images: z.array(productImageSchema).optional(),
  stock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  weight: z.number().min(0).nullable().optional(),
});

/**
 * Update product validation schema (all fields optional)
 */
const updateProductSchema = createProductSchema.partial();

/**
 * Get all products with optional filters and pagination
 */
export async function getProducts(req: Request, res: Response): Promise<void> {
  try {
    const validation = productQuerySchema.safeParse(req.query);
    
    if (!validation.success) {
      res.status(400).json({
        message: 'Invalid query parameters',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const filters = validation.data;

    // Track search query for analytics (works for all users, not just authenticated)
    if (filters.search && filters.search.trim().length >= 2) {
      const { trackSearch } = require('../services/search-analytics.service');
      trackSearch(filters.search);
    }

    const result = await productsService.getAll(filters);

    // Apply B2B pricing if authenticated user is a B2B partner
    if (req.user?.userId) {
      const b2bInfo = await getB2bUserInfo(req.user.userId);
      if (b2bInfo) {
        result.products = result.products.map((p: any) => applyB2bPricing(p, b2bInfo.multiplier));
      }
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error retrieving products' });
  }
}

/**
 * Get a single product by ID
 */
export async function getProductById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    let product = await productsService.getById(id);

    if (!product) {
      res.status(404).json({ message: 'Produkt nie zostal znaleziony' });
      return;
    }

    // Apply B2B pricing if authenticated user is a B2B partner
    console.log(`[B2B DEBUG] getProductById: userId=${req.user?.userId}, hasAuth=${!!req.headers.authorization}`);
    if (req.user?.userId) {
      const b2bInfo = await getB2bUserInfo(req.user.userId);
      console.log(`[B2B DEBUG] b2bInfo:`, b2bInfo);
      if (b2bInfo) {
        product = applyB2bPricing(product, b2bInfo.multiplier);
      }
    }

    // Increment view count asynchronously (don't wait)
    popularityService.incrementViewCount(id).catch(err => 
      console.error('Error incrementing view count:', err)
    );

    res.status(200).json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Error retrieving product' });
  }
}

/**
 * Get a single product by slug (for SEO-friendly URLs)
 */
export async function getProductBySlug(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;
    let product = await productsService.getBySlug(slug);

    if (!product) {
      res.status(404).json({ message: 'Produkt nie zostal znaleziony' });
      return;
    }

    // Apply B2B pricing if authenticated user is a B2B partner
    if (req.user?.userId) {
      const b2bInfo = await getB2bUserInfo(req.user.userId);
      if (b2bInfo) {
        product = applyB2bPricing(product, b2bInfo.multiplier);
      }
    }

    // Increment view count asynchronously (don't wait)
    popularityService.incrementViewCount(product.id).catch(err => 
      console.error('Error incrementing view count:', err)
    );

    res.status(200).json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Error retrieving product' });
  }
}

/**
 * Create a new product
 */
export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    // Log only field names, not full body contents
    console.log('Creating product, fields:', Object.keys(req.body).join(', '));
    
    const validation = createProductSchema.safeParse(req.body);
    
    if (!validation.success) {
      console.log('Validation failed:', validation.error.flatten());
      res.status(400).json({
        message: 'Validation error',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }

    console.log('Validation passed for product creation');

    const { images, variants, categoryId, stock, lowStockThreshold, weight, shortDescription, ...productData } = validation.data;
    
    // Build Prisma-compatible data structure
    const prismaData: any = {
      ...productData,
      // Connect category if provided
      ...(categoryId && {
        category: { connect: { id: categoryId } }
      }),
      // Create images if provided
      ...(images && images.length > 0 && {
        images: {
          create: images.map((img, index) => ({
            url: img.url,
            alt: img.alt || productData.name,
            order: img.order ?? index,
          }))
        }
      }),
      // Create variants if provided
      ...(variants && variants.length > 0 && {
        variants: {
          create: variants.map((variant) => ({
            name: variant.name,
            sku: variant.sku,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            attributes: variant.attributes || {},
          }))
        }
      }),
    };

    console.log('Prisma data prepared for product creation');

    // If categoryId is provided, verify it exists first
    if (categoryId) {
      const categoryExists = await productsService.categoryExists(categoryId);
      if (!categoryExists) {
        res.status(400).json({ message: 'Kategoria nie istnieje', details: `Category ID: ${categoryId}` });
        return;
      }
    }

    const product = await productsService.create(prismaData, stock);
    res.status(201).json(product);
  } catch (error: any) {
    console.error('Error creating product:', error);
    console.error('Error details:', error?.message, error?.code, error?.meta);
    res.status(500).json({ message: 'Error creating product' });
  }
}

/**
 * Update an existing product
 */
export async function updateProduct(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Validate CUID format (Prisma uses CUID by default)
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!cuidRegex.test(id)) {
      res.status(400).json({ message: 'Invalid product ID format' });
      return;
    }
    
    // Log only field names, not full body contents
    console.log('Update product, fields:', Object.keys(req.body).join(', '));
    const validation = updateProductSchema.safeParse(req.body);
    
    if (!validation.success) {
      console.log('Update validation failed:', validation.error.flatten());
      res.status(400).json({
        message: 'Validation error',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }
    
    // Extract fields that need special handling
    const { images, variants, categoryId, stock, lowStockThreshold, weight, shortDescription, ...productData } = validation.data;
    
    // Build Prisma-compatible data structure for update
    const prismaData: any = {
      ...productData,
      // Connect/disconnect category
      ...(categoryId !== undefined && {
        category: categoryId ? { connect: { id: categoryId } } : { disconnect: true }
      }),
    };
    
    // Get user info from request (if auth middleware adds it)
    const userId = (req as any).user?.id;
    
    // Update with Omnibus-compliant price tracking (source: API)
    const product = await productsService.update(id, prismaData, {
      source: PriceChangeSource.API,
      changedBy: userId,
      reason: 'API product update',
    });

    if (!product) {
      res.status(404).json({ message: 'Produkt nie zostal znaleziony' });
      return;
    }

    // Update inventory for variants if stock value is provided
    if (stock !== undefined && product.variants && product.variants.length > 0) {
      await productsService.updateVariantsStock(product.variants.map((v: any) => v.id), stock);
    }

    res.status(200).json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Error updating product' });
  }
}

/**
 * Delete a product (soft delete)
 */
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await productsService.delete(id);

    if (!result) {
      res.status(404).json({ message: 'Produkt nie zostal znaleziony' });
      return;
    }

    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Error deleting product' });
  }
}

/**
 * Get available filters for products
 */
export async function getFilters(req: Request, res: Response): Promise<void> {
  try {
    const { category, brand, minPrice, maxPrice, warehouse } = req.query;
    const filters = await productsService.getFilters({
      categorySlug: category as string | undefined,
      brand: brand as string | undefined,
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      warehouse: warehouse as string | undefined,
    });
    res.status(200).json(filters);
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ message: 'Error retrieving filters' });
  }
}

/**
 * Get bestseller products based on actual sales data
 */
export async function getBestsellers(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string | undefined;
    const days = parseInt(req.query.days as string) || 90;

    const products = await productsService.getBestsellers({ limit, category, days });
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching bestsellers:', error);
    res.status(500).json({ message: 'Error retrieving bestsellers' });
  }
}

/**
 * Get featured products (admin-curated or fallback)
 */
export async function getFeatured(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const productIds = req.query.productIds 
      ? (req.query.productIds as string).split(',')
      : undefined;

    const products = await productsService.getFeatured({ limit, productIds });
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({ message: 'Error retrieving featured products' });
  }
}

/**
 * Get seasonal products based on current season or specified season
 */
export async function getSeasonal(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const season = req.query.season as 'spring' | 'summer' | 'autumn' | 'winter' | undefined;

    const products = await productsService.getSeasonal({ limit, season });
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching seasonal products:', error);
    res.status(500).json({ message: 'Error retrieving seasonal products' });
  }
}

/**
 * Get the most wishlisted product (Product of the Day)
 */
export async function getMostWishlisted(req: Request, res: Response): Promise<void> {
  try {
    const product = await productsService.getMostWishlisted();
    res.status(200).json({ product });
  } catch (error) {
    console.error('Error fetching most wishlisted product:', error);
    res.status(500).json({ message: 'Error retrieving most wishlisted product' });
  }
}

/**
 * Get new products (added in the last 14 days, admin-curated or automatic)
 */
export async function getNewProducts(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const days = parseInt(req.query.days as string) || 14;

    const products = await productsService.getNewProducts({ limit, days });
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching new products:', error);
    res.status(500).json({ message: 'Error retrieving new products' });
  }
}

/**
 * Get toys carousel products (manual admin selections + automatic bestsellers from toys category)
 */
export async function getToys(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const products = await productsService.getToys({ limit });
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching toys products:', error);
    res.status(500).json({ message: 'Error retrieving toys products' });
  }
}

/**
 * Get top-rated products
 */
export async function getTopRated(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const minReviews = parseInt(req.query.minReviews as string) || 1;

    const result = await productsService.getTopRated({ limit, minReviews });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching top-rated products:', error);
    res.status(500).json({ message: 'Error retrieving top-rated products' });
  }
}

/**
 * Get products from the same warehouse as the given product
 * Used for "Zamów w jednej przesyłce" recommendations in add-to-cart modal
 */
export async function getSameWarehouseProducts(req: Request, res: Response): Promise<void> {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit as string) || 6;

    if (!productId) {
      res.status(400).json({ message: 'Product ID is required' });
      return;
    }

    const result = await productsService.getSameWarehouseProducts(productId, { limit });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching same warehouse products:', error);
    res.status(500).json({ message: 'Error retrieving same warehouse products' });
  }
}

/**
 * Get multiple products by IDs (batch endpoint to avoid N+1 requests)
 */
export async function getProductsByIds(req: Request, res: Response): Promise<void> {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: 'ids array is required' });
      return;
    }

    if (ids.length > 100) {
      res.status(400).json({ message: 'Maximum 100 product IDs allowed' });
      return;
    }

    const products = await productsService.getByIds(ids);
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching products by IDs:', error);
    res.status(500).json({ message: 'Error retrieving products' });
  }
}

/**
 * Get all brands list
 */
export async function getBrands(req: Request, res: Response): Promise<void> {
  try {
    const brands = await productsService.getBrands();
    res.status(200).json({ brands });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ message: 'Error retrieving brands' });
  }
}

/**
 * Get brand by slug
 */
export async function getBrandBySlug(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string' || slug.length > 200) {
      res.status(400).json({ message: 'Invalid brand slug' });
      return;
    }

    const brand = await productsService.getBrandBySlug(slug);
    if (!brand) {
      res.status(404).json({ message: 'Brand not found' });
      return;
    }

    res.status(200).json(brand);
  } catch (error) {
    console.error('Error fetching brand:', error);
    res.status(500).json({ message: 'Error retrieving brand' });
  }
}
