import { prisma } from '../db';
import { wholesalerConfigService } from './wholesaler-config.service';

// CarouselMode type + values (matching Prisma enum)
type CarouselModeType = 'MANUAL' | 'SEMI_AUTOMATIC' | 'AUTOMATIC';
const CarouselMode = {
  MANUAL: 'MANUAL' as CarouselModeType,
  SEMI_AUTOMATIC: 'SEMI_AUTOMATIC' as CarouselModeType,
  AUTOMATIC: 'AUTOMATIC' as CarouselModeType,
};

// Type-safe prisma accessor for the Carousel model
// (Prisma client has correct types at runtime; VS Code TS server may lag after schema changes)
const carouselDb = () => (prisma as any).carousel;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CarouselWithProducts {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  mode: CarouselModeType;
  productLimit: number;
  categoryIds: string[];
  productIds: string[];
  pinnedProductIds: string[];
  autoSource: string | null;
  isVisible: boolean;
  isActive: boolean;
  sortOrder: number;
  products: any[];
}

export interface CreateCarouselInput {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  mode: CarouselModeType;
  productLimit?: number;
  categoryIds?: string[];
  productIds?: string[];
  pinnedProductIds?: string[];
  autoSource?: string;
  isVisible?: boolean;
  sortOrder?: number;
}

export interface UpdateCarouselInput {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  mode?: CarouselModeType;
  productLimit?: number;
  categoryIds?: string[];
  productIds?: string[];
  pinnedProductIds?: string[];
  autoSource?: string;
  isVisible?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

// Standard product include used in all queries
const PRODUCT_INCLUDE = {
  images: { orderBy: { order: 'asc' as const } },
  category: true,
  variants: { include: { inventory: true } },
};

// ─── Helpers (imported from products.service logic) ──────────────────────────

/**
 * Safely parse JSON fields that might already be objects or strings
 */
function parseJsonField(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function transformProduct(product: any): any {
  if (!product) return null;
  const specifications = parseJsonField(product.specifications);
  const attributes = parseJsonField(product.attributes);

  // Transform variants with stock calculated from inventory (matching products.service.ts)
  const transformedVariants = product.variants?.map((variant: any) => ({
    ...variant,
    attributes: parseJsonField(variant.attributes) || {},
    stock: variant.inventory?.reduce((sum: number, inv: any) => sum + Math.max(0, (inv.quantity || 0) - (inv.reserved || 0)), 0) ?? 0,
  }));

  // Calculate total stock as sum of all variant stocks
  const stock = transformedVariants?.reduce((sum: number, v: any) => sum + (v.stock || 0), 0) ?? 0;

  let tags: string[] = [];
  if (Array.isArray(product.tags)) {
    tags = product.tags;
  } else if (typeof product.tags === 'string') {
    try { tags = JSON.parse(product.tags); } catch { tags = []; }
  }

  // Resolve warehouse location from wholesaler config cache
  const warehouseLocation = resolveWarehouseLocation(product.baselinkerProductId, product.sku);

  return {
    ...product,
    specifications,
    attributes,
    variants: transformedVariants,
    stock,
    tags,
    rating: product.average_rating ?? null,
    reviewCount: product.review_count || 0,
    warehouseLocation,
  };
}

// Synchronous warehouse location resolution using cached config
function resolveWarehouseLocation(baselinkerProductId: string | null, sku: string | null): string | null {
  const cached = wholesalerConfigService.getCachedConfig();
  if (!cached || cached.length === 0) return null;

  const blId = (baselinkerProductId || '').toLowerCase();
  const skuUp = (sku || '').toUpperCase();

  for (const w of cached) {
    if (w.prefix && blId.startsWith(w.prefix.toLowerCase())) return w.location;
    if (w.skuPrefix && skuUp.startsWith(w.skuPrefix.toUpperCase())) return w.location;
  }
  return null;
}

function transformProducts(products: any[]): any[] {
  return products.map(transformProduct).filter(Boolean);
}

// Tags filtering constants (mirrors products.service.ts)
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
const PACKAGE_TAGS = [
  'produkt w paczce: 1', 'produkt w paczce: 2', 'produkt w paczce: 3',
  'produkt w paczce: 4', 'produkt w paczce: 5',
];
const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia ', 'nie wrzucać-zabronione'];
const DELIVERY_TAGS = [
  'Paczkomaty i Kurier', 'paczkomaty i kurier',
  'Tylko kurier', 'tylko kurier',
  'do 2 kg', 'do 5 kg', 'do 10 kg', 'do 20 kg', 'do 31,5 kg',
];

function filterProductsWithPackageInfo(products: any[]): any[] {
  return products.filter(product => {
    if (!product) return false;

    // Filter out products with zero or negative price
    if (!product.price || product.price <= 0) return false;

    // Filter out products with zero stock (calculated by transformProduct)
    if (typeof product.stock === 'number' && product.stock <= 0) return false;

    const tags = Array.isArray(product.tags) ? product.tags : [];
    // If product has hidden tags, remove it
    if (tags.some((t: string) => HIDDEN_TAGS.includes(t))) return false;
    // If product has Paczkomat tags, it must also have package tags
    const hasPaczkomat = tags.some((t: string) => PACZKOMAT_TAGS.includes(t));
    if (hasPaczkomat) {
      return tags.some((t: string) => PACKAGE_TAGS.includes(t));
    }
    return true;
  });
}

// ─── Service ─────────────────────────────────────────────────────────────────

class CarouselService {

  // ── Public API (for web frontend) ──────────────────────────────────────────

  /**
   * Get all active + visible carousels (without products), sorted by sortOrder.
   * Used by the web frontend to know which carousels to render.
   */
  async getAll() {
    return carouselDb().findMany({
      where: { isActive: true, isVisible: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Get products for a specific carousel by slug.
   * This is the unified method that replaces all individual carousel methods.
   */
  async getProducts(slug: string): Promise<any[]> {
    const carousel = await carouselDb().findUnique({ where: { slug } });
    if (!carousel || !carousel.isActive) return [];

    const limit = carousel.productLimit || 20;
    const excludedIds = await this.getExcludedProductIds();
    const pinnedIds: string[] = (carousel.pinnedProductIds || []).filter(
      (id: string) => !excludedIds.includes(id)
    );

    let products: any[];
    switch (carousel.mode) {
      case CarouselMode.MANUAL:
        products = await this.getManualProducts(carousel.productIds, excludedIds, limit);
        break;

      case CarouselMode.SEMI_AUTOMATIC:
        products = await this.getSemiAutoProducts(carousel, excludedIds, limit);
        break;

      case CarouselMode.AUTOMATIC:
        products = await this.getAutoProducts(carousel, excludedIds, limit);
        break;

      default:
        products = [];
    }

    // For AUTOMATIC mode, ensure pinned products are included even if not in auto-fetch
    if (carousel.mode === CarouselMode.AUTOMATIC && pinnedIds.length > 0) {
      const existingIds = new Set(products.map((p: any) => p.id));
      const missingPinnedIds = pinnedIds.filter(id => !existingIds.has(id));
      if (missingPinnedIds.length > 0) {
        const raw = await prisma.product.findMany({
          where: { 
            id: { in: missingPinnedIds }, 
            status: 'ACTIVE', 
            price: { gt: 0 },
            tags: { hasSome: DELIVERY_TAGS },
            category: { baselinkerCategoryId: { not: null } },
            NOT: { tags: { hasSome: HIDDEN_TAGS } },
          },
          include: PRODUCT_INCLUDE,
        });
        const additional = filterProductsWithPackageInfo(transformProducts(raw));
        products = [...additional, ...products];
      }
    }

    // Apply pin ordering — pinned products always appear first, preserving their pin order
    if (pinnedIds.length > 0 && products.length > 0) {
      const pinned: any[] = [];
      const rest: any[] = [];
      for (const p of products) {
        if (pinnedIds.includes(p.id)) pinned.push(p);
        else rest.push(p);
      }
      pinned.sort((a: any, b: any) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
      products = [...pinned, ...rest];
    }

    return products.slice(0, limit);
  }

  // ── Admin API ──────────────────────────────────────────────────────────────

  /**
   * Get all carousels for admin (including hidden/inactive), with product counts.
   */
  async getAllAdmin() {
    return carouselDb().findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Get a single carousel by ID (admin).
   */
  async getById(id: string) {
    return carouselDb().findUnique({ where: { id } });
  }

  /**
   * Create a new carousel.
   */
  async create(data: CreateCarouselInput) {
    // Sanitize
    const productIds = data.productIds
      ? [...new Set(data.productIds)].slice(0, data.productLimit || 100)
      : [];

    // Get next sortOrder
    const lastCarousel = await carouselDb().findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSort = (lastCarousel?.sortOrder ?? -1) + 1;

    return carouselDb().create({
      data: {
        name: data.name,
        slug: this.slugify(data.slug || data.name),
        description: data.description || null,
        icon: data.icon || 'star',
        color: data.color || 'from-orange-500 to-red-600',
        mode: data.mode,
        productLimit: Math.min(Math.max(data.productLimit || 20, 1), 100),
        categoryIds: data.categoryIds || [],
        productIds,
        pinnedProductIds: data.pinnedProductIds || [],
        autoSource: data.autoSource || null,
        isVisible: data.isVisible ?? true,
        isActive: true,
        sortOrder: data.sortOrder ?? nextSort,
        createdAt: new Date(),
      },
    });
  }

  /**
   * Update a carousel.
   */
  async update(id: string, data: UpdateCarouselInput) {
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = this.slugify(data.slug);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.mode !== undefined) updateData.mode = data.mode;
    if (data.productLimit !== undefined) {
      updateData.productLimit = Math.min(Math.max(data.productLimit, 1), 100);
    }
    if (data.categoryIds !== undefined) updateData.categoryIds = data.categoryIds;
    if (data.productIds !== undefined) {
      const limit = data.productLimit || (await carouselDb().findUnique({ where: { id }, select: { productLimit: true } }))?.productLimit || 100;
      updateData.productIds = [...new Set(data.productIds)].slice(0, limit);
    }
    if (data.pinnedProductIds !== undefined) {
      updateData.pinnedProductIds = [...new Set(data.pinnedProductIds)];
    }
    if (data.autoSource !== undefined) updateData.autoSource = data.autoSource;
    if (data.isVisible !== undefined) updateData.isVisible = data.isVisible;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    return carouselDb().update({ where: { id }, data: updateData });
  }

  /**
   * Delete a carousel.
   */
  async delete(id: string) {
    return carouselDb().delete({ where: { id } });
  }

  /**
   * Reorder carousels — receives array of { id, sortOrder }.
   */
  async reorder(items: { id: string; sortOrder: number }[]) {
    const updates = items.map(item =>
      carouselDb().update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      })
    );
    await prisma.$transaction(updates);
    return { success: true };
  }

  /**
   * Toggle visibility.
   */
  async toggleVisibility(id: string) {
    const carousel = await carouselDb().findUnique({ where: { id } });
    if (!carousel) throw new Error('Carousel not found');
    return carouselDb().update({
      where: { id },
      data: { isVisible: !carousel.isVisible },
    });
  }

  // ── Product fetching logic (private) ───────────────────────────────────────

  /**
   * MANUAL mode: return only manually selected products in admin-defined order.
   */
  private async getManualProducts(
    productIds: string[],
    excludedIds: string[],
    limit: number,
  ): Promise<any[]> {
    if (!productIds.length) return [];

    const filtered = productIds.filter(id => !excludedIds.includes(id));
    const ids = filtered.slice(0, limit);
    if (!ids.length) return [];

    const products = await prisma.product.findMany({
      where: { 
        id: { in: ids }, 
        status: 'ACTIVE', 
        price: { gt: 0 },
        tags: { hasSome: DELIVERY_TAGS },
        category: { baselinkerCategoryId: { not: null } },
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
      },
      include: PRODUCT_INCLUDE,
    });

    // Preserve admin-defined order
    const ordered = ids
      .map(id => products.find(p => p.id === id))
      .filter(Boolean);

    return filterProductsWithPackageInfo(transformProducts(ordered));
  }

  /**
   * SEMI_AUTOMATIC mode: manual products first, then auto-fill remaining slots.
   */
  private async getSemiAutoProducts(
    carousel: any,
    excludedIds: string[],
    limit: number,
  ): Promise<any[]> {
    const manualProducts = await this.getManualProducts(
      carousel.productIds,
      excludedIds,
      limit,
    );

    if (manualProducts.length >= limit) {
      return manualProducts.slice(0, limit);
    }

    const remaining = limit - manualProducts.length;
    const usedIds = [
      ...carousel.productIds,
      ...excludedIds,
      ...manualProducts.map((p: any) => p.id),
    ];

    const autoProducts = await this.fetchAutoProducts(
      carousel.autoSource,
      carousel.categoryIds,
      usedIds,
      remaining,
    );

    return filterProductsWithPackageInfo([...manualProducts, ...autoProducts]);
  }

  /**
   * AUTOMATIC mode: all products from auto-source, optionally filtered by categories.
   */
  private async getAutoProducts(
    carousel: any,
    excludedIds: string[],
    limit: number,
  ): Promise<any[]> {
    const products = await this.fetchAutoProducts(
      carousel.autoSource,
      carousel.categoryIds,
      excludedIds,
      limit,
    );

    return filterProductsWithPackageInfo(products);
  }

  /**
   * Core auto-fill logic — delegates to the appropriate strategy.
   */
  private async fetchAutoProducts(
    autoSource: string | null,
    categoryIds: string[],
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    switch (autoSource) {
      case 'bestsellers':
        return this.autoFetchBestsellers(categoryIds, excludeIds, limit);
      case 'newest':
        return this.autoFetchNewest(categoryIds, excludeIds, limit);
      case 'top-rated':
        return this.autoFetchTopRated(categoryIds, excludeIds, limit);
      case 'seasonal':
        return this.autoFetchSeasonal(categoryIds, excludeIds, limit);
      case 'featured':
        return this.autoFetchFeatured(categoryIds, excludeIds, limit);
      default:
        // If no autoSource but has categories, fetch newest from those categories
        if (categoryIds.length > 0) {
          return this.autoFetchNewest(categoryIds, excludeIds, limit);
        }
        return [];
    }
  }

  // ── Auto-source strategies ─────────────────────────────────────────────────

  /**
   * Bestsellers — aggregate sales from recent orders via variant→product join.
   */
  private async autoFetchBestsellers(
    categoryIds: string[],
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const daysBack = 90;
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);

    // Get all descendant category IDs (including subcategories)
    const allCategoryIds = categoryIds.length > 0
      ? await this.expandCategoryIds(categoryIds)
      : [];

    // Fetch order items with variant→product join (same pattern as products.service.ts)
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: dateThreshold },
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
          paymentStatus: 'PAID',
        },
      },
      include: {
        variant: {
          include: {
            product: {
              include: PRODUCT_INCLUDE,
            },
          },
        },
      },
    });

    // Aggregate sales by product
    const salesMap = new Map<string, { product: any; soldCount: number }>();

    for (const item of orderItems) {
      const product = item.variant?.product;
      if (!product || product.status !== 'ACTIVE') continue;
      if (excludeIds.includes(product.id)) continue;
      if (allCategoryIds.length > 0 && !allCategoryIds.includes(product.categoryId || '')) continue;
      // Skip products without delivery tags or baselinker category
      const tags = Array.isArray(product.tags) ? product.tags : [];
      if (!tags.some((t: string) => DELIVERY_TAGS.some(dt => t.toLowerCase() === dt.toLowerCase()))) continue;
      if (!product.category?.baselinkerCategoryId) continue;

      const existing = salesMap.get(product.id);
      if (existing) {
        existing.soldCount += item.quantity;
      } else {
        salesMap.set(product.id, { product, soldCount: item.quantity });
      }
    }

    // Sort by sales count descending
    const sorted = Array.from(salesMap.values())
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, limit)
      .map(item => item.product);

    let results = transformProducts(sorted);

    // Fallback: if not enough bestsellers, fill with newest products from same categories
    if (results.length < limit && (allCategoryIds.length > 0 || categoryIds.length > 0)) {
      const usedIds = [...excludeIds, ...results.map((p: any) => p.id)];
      const fillCategoryIds = allCategoryIds.length > 0 ? allCategoryIds : categoryIds;
      const fillProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 },
          id: { notIn: usedIds },
          categoryId: { in: fillCategoryIds },
          tags: { hasSome: DELIVERY_TAGS },
          category: { baselinkerCategoryId: { not: null } },
          NOT: { tags: { hasSome: HIDDEN_TAGS } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit - results.length,
        include: PRODUCT_INCLUDE,
      });
      results = [...results, ...transformProducts(fillProducts)];
    }

    return results;
  }

  /**
   * Newest — products sorted by createdAt DESC.
   * Tries last 14 days first; if not enough, falls back to newest products overall.
   */
  private async autoFetchNewest(
    categoryIds: string[],
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const allCategoryIds = categoryIds.length > 0
      ? await this.expandCategoryIds(categoryIds)
      : [];

    const baseWhere: any = {
      status: 'ACTIVE',
      price: { gt: 0 },
      id: { notIn: excludeIds },
      tags: { hasSome: DELIVERY_TAGS },
      category: { baselinkerCategoryId: { not: null } },
      NOT: { tags: { hasSome: HIDDEN_TAGS } },
      ...(allCategoryIds.length > 0 && {
        categoryId: { in: allCategoryIds },
      }),
    };

    // First try: products from last 14 days
    const daysBack = 14;
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);

    let products = await prisma.product.findMany({
      where: { ...baseWhere, createdAt: { gte: dateThreshold } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: PRODUCT_INCLUDE,
    });

    // Fallback: if not enough recent products, fetch newest overall (no date filter)
    if (products.length < limit) {
      const existingIds = products.map(p => p.id);
      const fallback = await prisma.product.findMany({
        where: {
          ...baseWhere,
          id: { notIn: [...excludeIds, ...existingIds] },
        },
        orderBy: { createdAt: 'desc' },
        take: limit - products.length,
        include: PRODUCT_INCLUDE,
      });
      products = [...products, ...fallback];
    }

    return transformProducts(products);
  }

  /**
   * Top rated — products with high average rating and minimum reviews.
   */
  private async autoFetchTopRated(
    categoryIds: string[],
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const allCategoryIds = categoryIds.length > 0
      ? await this.expandCategoryIds(categoryIds)
      : [];

    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        review_count: { gte: 1 },
        average_rating: { not: null },
        tags: { hasSome: DELIVERY_TAGS },
        category: { baselinkerCategoryId: { not: null } },
        id: { notIn: excludeIds },
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        ...(allCategoryIds.length > 0 && {
          categoryId: { in: allCategoryIds },
        }),
      },
      orderBy: [
        { average_rating: 'desc' },
        { review_count: 'desc' },
      ],
      take: limit,
      include: PRODUCT_INCLUDE,
    });

    let results = transformProducts(products);

    // Fallback: if not enough top-rated, fill with newest (from same categories or all)
    if (results.length < limit) {
      const usedIds = [...excludeIds, ...results.map((p: any) => p.id)];
      const fillProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 },
          id: { notIn: usedIds },
          tags: { hasSome: DELIVERY_TAGS },
          category: { baselinkerCategoryId: { not: null } },
          NOT: { tags: { hasSome: HIDDEN_TAGS } },
          ...(allCategoryIds.length > 0 && {
            categoryId: { in: allCategoryIds },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit - results.length,
        include: PRODUCT_INCLUDE,
      });
      results = [...results, ...transformProducts(fillProducts)];
    }

    return results;
  }

  /**
   * Seasonal — tag-based + category fallback.
   */
  private async autoFetchSeasonal(
    categoryIds: string[],
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const month = new Date().getMonth() + 1;
    let season: string;
    if (month >= 3 && month <= 5) season = 'spring';
    else if (month >= 6 && month <= 8) season = 'summer';
    else if (month >= 9 && month <= 11) season = 'autumn';
    else season = 'winter';

    const seasonTags: Record<string, string[]> = {
      spring: ['wiosna', 'wiosenny', 'wiosenne', 'spring'],
      summer: ['lato', 'letni', 'letnie', 'summer', 'plaża', 'wakacje'],
      autumn: ['jesień', 'jesien', 'jesienny', 'jesienne', 'autumn'],
      winter: ['zima', 'zimowy', 'zimowe', 'winter', 'święta', 'boże narodzenie', 'choinka', 'śnieg'],
    };

    const tags = seasonTags[season] || [];

    const allCategoryIds = categoryIds.length > 0
      ? await this.expandCategoryIds(categoryIds)
      : [];

    // First try: tagged products
    let products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        price: { gt: 0 },
        tags: { hasSome: tags },
        category: { baselinkerCategoryId: { not: null } },
        id: { notIn: excludeIds },
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        AND: [{ tags: { hasSome: DELIVERY_TAGS } }],
        ...(allCategoryIds.length > 0 && {
          categoryId: { in: allCategoryIds },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: PRODUCT_INCLUDE,
    });

    // Fallback: if not enough, get from winter-relevant categories or all
    if (products.length < limit) {
      const winterCategories = ['dziecko', 'zabawki', 'elektronika', 'dom-i-ogrod'];
      const fallbackCatIds = season === 'winter' && allCategoryIds.length === 0
        ? await this.getCategoryIdsBySlugs(winterCategories)
        : allCategoryIds;

      const fallbackProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 },
          id: { notIn: [...excludeIds, ...products.map(p => p.id)] },
          tags: { hasSome: DELIVERY_TAGS },
          category: { baselinkerCategoryId: { not: null } },
          NOT: { tags: { hasSome: HIDDEN_TAGS } },
          ...(fallbackCatIds.length > 0 && {
            categoryId: { in: fallbackCatIds },
          }),
        },
        orderBy: [
          { compareAtPrice: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit - products.length,
        include: PRODUCT_INCLUDE,
      });

      products = [...products, ...fallbackProducts];
    }

    return transformProducts(products);
  }

  /**
   * Featured — diverse products from various categories, excluding boring items.
   */
  private async autoFetchFeatured(
    categoryIds: string[],
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const boringKeywords = ['etui', 'case', 'pokrowiec', 'folia', 'szkło', 'kabel', 'ładowarka', 'adapter'];

    const allCategoryIds = categoryIds.length > 0
      ? await this.expandCategoryIds(categoryIds)
      : [];

    // If specific categories selected, fetch from those
    let targetCategoryIds: string[];
    if (allCategoryIds.length > 0) {
      targetCategoryIds = allCategoryIds;
    } else {
      // Use root categories for diversity
      const rootCategories = await prisma.category.findMany({
        where: { parentId: null },
        select: { id: true },
      });
      targetCategoryIds = rootCategories.map(c => c.id);
    }

    const productsPerCategory = Math.ceil(limit / Math.max(targetCategoryIds.length, 1)) + 2;
    let allCandidates: any[] = [];

    for (const catId of targetCategoryIds) {
      const catProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 10 },
          categoryId: catId,
          id: { notIn: excludeIds },
          tags: { hasSome: DELIVERY_TAGS },
          category: { baselinkerCategoryId: { not: null } },
          NOT: {
            OR: [
              ...boringKeywords.map(kw => ({
                name: { contains: kw, mode: 'insensitive' as const },
              })),
              ...HIDDEN_TAGS.map(ht => ({ tags: { has: ht } })),
            ],
          },
        },
        orderBy: [
          { compareAtPrice: 'desc' },
          { createdAt: 'desc' },
        ],
        take: productsPerCategory,
        include: PRODUCT_INCLUDE,
      });
      allCandidates.push(...catProducts);
    }

    // Shuffle + ensure diversity
    const shuffled = allCandidates.sort(() => Math.random() - 0.5);
    const picked: any[] = [];
    const categoryCount: Record<string, number> = {};
    const maxPerCat = Math.ceil(limit / 3);

    for (const product of shuffled) {
      if (picked.length >= limit) break;
      const catId = product.categoryId || 'none';
      if ((categoryCount[catId] || 0) < maxPerCat) {
        picked.push(product);
        categoryCount[catId] = (categoryCount[catId] || 0) + 1;
      }
    }

    // Fill if not enough
    if (picked.length < limit) {
      for (const product of shuffled) {
        if (picked.length >= limit) break;
        if (!picked.some(p => p.id === product.id)) {
          picked.push(product);
        }
      }
    }

    return transformProducts(picked);
  }

  // ── Utility methods ────────────────────────────────────────────────────────

  /**
   * Get excluded product IDs from admin settings.
   */
  private async getExcludedProductIds(): Promise<string[]> {
    try {
      const settings = await prisma.settings.findUnique({
        where: { key: 'carousel_exclusions' },
      });
      if (settings?.value) {
        const parsed = typeof settings.value === 'string'
          ? JSON.parse(settings.value as string)
          : settings.value;
        return (parsed as any).excludedProductIds || [];
      }
    } catch { /* ignore */ }
    return [];
  }

  // ── Exclusion management (public for admin API) ────────────────────────────

  /**
   * Get all excluded product IDs with product details.
   */
  async getExclusions(): Promise<{ excludedProductIds: string[]; products: any[] }> {
    const excludedIds = await this.getExcludedProductIds();
    if (!excludedIds.length) return { excludedProductIds: [], products: [] };

    const products = await prisma.product.findMany({
      where: { id: { in: excludedIds } },
      select: {
        id: true,
        name: true,
        price: true,
        status: true,
        images: { orderBy: { order: 'asc' }, take: 1 },
      },
    });

    return { excludedProductIds: excludedIds, products };
  }

  /**
   * Set the full list of excluded product IDs.
   */
  async setExclusions(productIds: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(productIds)];
    await prisma.settings.upsert({
      where: { key: 'carousel_exclusions' },
      update: { value: JSON.stringify({ excludedProductIds: uniqueIds }) },
      create: { key: 'carousel_exclusions', value: JSON.stringify({ excludedProductIds: uniqueIds }) },
    });
    return uniqueIds;
  }

  /**
   * Add a product to the exclusion list.
   */
  async addExclusion(productId: string): Promise<string[]> {
    const current = await this.getExcludedProductIds();
    if (current.includes(productId)) return current;
    const updated = [...current, productId];
    return this.setExclusions(updated);
  }

  /**
   * Remove a product from the exclusion list.
   */
  async removeExclusion(productId: string): Promise<string[]> {
    const current = await this.getExcludedProductIds();
    const updated = current.filter(id => id !== productId);
    return this.setExclusions(updated);
  }

  /**
   * Expand category IDs to include all subcategory IDs (recursive).
   */
  private async expandCategoryIds(categoryIds: string[]): Promise<string[]> {
    if (!categoryIds.length) return [];

    const allIds = new Set<string>(categoryIds);
    const queue = [...categoryIds];

    while (queue.length > 0) {
      const parentIds = queue.splice(0, 50); // batch
      const children = await prisma.category.findMany({
        where: { parentId: { in: parentIds } },
        select: { id: true },
      });
      for (const child of children) {
        if (!allIds.has(child.id)) {
          allIds.add(child.id);
          queue.push(child.id);
        }
      }
    }

    return [...allIds];
  }

  /**
   * Get category IDs by slug names.
   */
  private async getCategoryIdsBySlugs(slugs: string[]): Promise<string[]> {
    const categories = await prisma.category.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    return categories.map(c => c.id);
  }

  /**
   * Slugify a string.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export const carouselService = new CarouselService();
