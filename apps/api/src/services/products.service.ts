import { prisma } from '../db';
import { Prisma, PriceChangeSource } from '@prisma/client';
import { getProductsIndex, isMeilisearchAvailable, markMeilisearchUnavailable, markMeilisearchAvailable, meiliClient, PRODUCTS_INDEX } from '../lib/meilisearch';
import type { MultiSearchParams } from 'meilisearch';
import { MeiliProduct } from './search.service';
import { queueProductIndex, queueProductDelete } from '../lib/queue';
import { priceHistoryService } from './price-history.service';
import { wholesalerConfigService } from './wholesaler-config.service';

// Tagi dostawy - produkty MUSZĄ mieć przynajmniej jeden z tych tagów żeby być widoczne
// Produkty z TYLKO tagiem hurtowni (Ikonka, BTP, HP, Leker) nie będą wyświetlane
const DELIVERY_TAGS = [
  'Paczkomaty i Kurier',
  'paczkomaty i kurier',
  'Tylko kurier',
  'tylko kurier',
  'do 2 kg',
  'do 5 kg',
  'do 10 kg',
  'do 20 kg',
  'do 31,5 kg',
];

// Tagi "Paczkomaty i Kurier" - produkty z tymi tagami MUSZĄ mieć też tag "produkt w paczce"
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];

// Tagi "produkt w paczce" - różne rozmiary paczek
const PACKAGE_TAGS = [
  'produkt w paczce: 1',
  'produkt w paczce: 2',
  'produkt w paczce: 3',
  'produkt w paczce: 4',
  'produkt w paczce: 5',
];

// Tagi ukrywające produkty - produkty z tymi tagami NIE będą wyświetlane
const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia ', 'nie wrzucać-zabronione'];

// Domeny zdjęć które blokują hotlinking - produkty z takimi zdjęciami nie będą wyświetlane
// b2b.leker.pl usunięte - produkty Leker ponownie widoczne, tag "błąd zdjęcia" filtruje wadliwe
const BLOCKED_IMAGE_DOMAINS: string[] = [];

// Filtr SQL dla warunku "produkt w paczce" oraz ukrywania produktów z błędami
// Jeśli produkt ma "Paczkomaty i Kurier" to MUSI mieć też "produkt w paczce"
// Produkty z tagiem "błąd zdjęcia" są ukrywane
const PACKAGE_FILTER_WHERE: Prisma.ProductWhereInput = {
  AND: [
    // Nie pokazuj produktów z tagami błędów
    { NOT: { tags: { hasSome: HIDDEN_TAGS } } },
    // Nie pokazuj produktów z nieaktywnych kategorii (np. "do zrobienia")
    { OR: [{ category: { isActive: true } }, { categoryId: null }] },
    // Nie pokazuj produktów ze zdjęciami z blokowanych domen
    ...BLOCKED_IMAGE_DOMAINS.map(domain => ({
      NOT: {
        images: {
          some: {
            url: { contains: domain },
            order: 0 // tylko pierwsze zdjęcie
          }
        }
      }
    })),
    // Warunek paczkomatu
    {
      OR: [
        { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
        { tags: { hasSome: PACKAGE_TAGS } },
      ]
    }
  ]
};

// Kategorie są teraz zarządzane przez Baselinker, nie przez tagi
// Produkty muszą mieć categoryId ustawione przez synchronizację z Baselinker

interface ProductFilters {
  page?: number;
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sku?: string; // Direct SKU search
  sort?: string;
  status?: string;
  warehouse?: string; // Filtr magazynu: leker, hp, btp, dofirmy, outlet (może być wiele oddzielone przecinkiem)
  hideOldZeroStock?: boolean; // Ukryj produkty ze stanem 0 starsze niż 14 dni
  sessionSeed?: number; // Seed for consistent random sorting
  discounted?: boolean; // Filtr tylko przecenionych produktów (compareAtPrice > price)
  brand?: string; // Filtr producenta (nazwa brandu z specifications.brand)
}

interface ProductsListResult {
  products: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Safely parse JSON fields that might already be objects or strings
 */
function parseJsonField(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Transform product to ensure JSON fields are properly parsed
 */
function transformProduct(product: any): any {
  if (!product) return product;
  
  // Transform variants with stock calculated from inventory
  const transformedVariants = product.variants?.map((variant: any) => ({
    ...variant,
    attributes: parseJsonField(variant.attributes) || {},
    // Calculate stock from inventory if available
    stock: variant.inventory?.reduce((sum: number, inv: any) => sum + (inv.quantity - inv.reserved), 0) ?? 0,
  }));
  
  // Calculate total stock as sum of all variant stocks
  const totalStock = transformedVariants?.reduce((sum: number, v: any) => sum + (v.stock || 0), 0) ?? 0;

  // Resolve warehouse location from wholesaler config cache
  const warehouseLocation = resolveWarehouseLocation(product.baselinkerProductId, product.sku);
  
  return {
    ...product,
    specifications: parseJsonField(product.specifications),
    variants: transformedVariants,
    // Add total stock at product level for easy access
    stock: totalStock,
    // Ensure tags are always an array
    tags: product.tags || [],
    // Map DB field names to frontend-friendly names
    rating: product.average_rating ? Number(product.average_rating) : null,
    reviewCount: product.review_count || 0,
    // Dynamic warehouse location from DB
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

/**
 * Transform an array of products
 */
function transformProducts(products: any[]): any[] {
  return products.map(transformProduct);
}

/**
 * Sort products so that out-of-stock items appear at the end
 * Preserves original order within in-stock and out-of-stock groups
 */
function sortOutOfStockToEnd(products: any[]): any[] {
  const inStock: any[] = [];
  const outOfStock: any[] = [];
  
  for (const product of products) {
    if (product.stock > 0) {
      inStock.push(product);
    } else {
      outOfStock.push(product);
    }
  }
  
  return [...inStock, ...outOfStock];
}

/**
 * Filter out products with zero stock that haven't been updated in specified days
 * Only hides products that have 0 stock AND haven't had inventory updates recently
 */
function filterOldZeroStockProducts(products: any[], days: number = 14): any[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return products.filter(product => {
    // If product has stock > 0, always keep it
    if (product.stock > 0) return true;
    
    // Product has 0 stock - check if it was recently updated
    // Use updatedAt instead of createdAt to check for recent inventory changes
    const updatedAt = new Date(product.updatedAt);
    if (updatedAt > cutoffDate) return true;
    
    // Also check variants for recent updates (inventory syncs update variants)
    if (product.variants && product.variants.length > 0) {
      const hasRecentVariantUpdate = product.variants.some((variant: any) => {
        const variantUpdated = new Date(variant.updatedAt);
        return variantUpdated > cutoffDate;
      });
      if (hasRecentVariantUpdate) return true;
    }
    
    // Product has 0 stock and hasn't been updated in X days - hide it
    return false;
  });
}

/**
 * Filter products: if product has "Paczkomaty i Kurier" tag, it MUST also have "produkt w paczce" tag
 * Products without proper package info should not be displayed
 */
function filterProductsWithPackageInfo(products: any[]): any[] {
  const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
  const PACKAGE_LIMIT_PATTERN = /produkt\s*w\s*paczce|produkty?\s*w\s*paczce/i;

  return products.filter(product => {
    const tags = product.tags || [];

    // Check if product has paczkomat tag
    const hasPaczkomatTag = tags.some((tag: string) =>
      PACZKOMAT_TAGS.some(pt => tag.toLowerCase() === pt.toLowerCase())
    );

    // If no paczkomat tag, product is OK (might have "Tylko kurier" or weight tags)
    if (!hasPaczkomatTag) return true;

    // Product has paczkomat tag - must also have "produkt w paczce" tag
    const hasPackageLimitTag = tags.some((tag: string) =>
      PACKAGE_LIMIT_PATTERN.test(tag)
    );

    return hasPackageLimitTag;
  });
}

export class ProductsService {
  /**
   * Check if a category exists by ID
   */
  async categoryExists(categoryId: string): Promise<boolean> {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    return !!category;
  }

  /**
   * Get all descendant category IDs for a given category slug or ID (including the category itself)
   */
  private async getAllCategoryIds(categorySlugOrId: string): Promise<string[]> {
    const prefixes = ['btp-', 'hp-', 'leker-', 'ikonka-', 'dofirmy-'];

    // Find ALL matching categories at once: exact slug + supplier prefixes
    // This ensures product listing aggregates products from all supplier variants
    // matching the same base category (e.g. gadzety, btp-gadzety, hp-gadzety)
    // NOTE: Do NOT use `contains` here — it causes false matches between unrelated
    // subcategories with similar names (e.g. "akcesoria" matching "akcesoria-sportowe")
    let categories = await prisma.category.findMany({
      where: { 
        OR: [
          { slug: categorySlugOrId },
          ...prefixes.map(prefix => ({
            slug: { startsWith: `${prefix}${categorySlugOrId}` }
          })),
        ]
      },
      select: { id: true },
    });

    // If not found by slug patterns, try by ID
    if (categories.length === 0) {
      const categoryById = await prisma.category.findUnique({
        where: { id: categorySlugOrId },
        select: { id: true },
      });
      if (categoryById) {
        categories = [categoryById];
      }
    }

    if (categories.length === 0) {
      return [];
    }

    const categoryIds: string[] = categories.map(c => c.id);

    // Recursively get all descendant categories for each found category
    const getDescendants = async (parentIds: string[]): Promise<void> => {
      const children = await prisma.category.findMany({
        where: {
          parentId: { in: parentIds },
          isActive: true,
        },
        select: { id: true },
      });

      if (children.length > 0) {
        const childIds = children.map(c => c.id);
        categoryIds.push(...childIds);
        await getDescendants(childIds);
      }
    };

    await getDescendants(categoryIds);

    return [...new Set(categoryIds)];
  }

  /**
   * Get all products with filters and pagination
   */
  async getAll(filters: ProductFilters = {}): Promise<ProductsListResult> {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      sort = 'newest',
      status,
      warehouse,
      hideOldZeroStock = false,
      sessionSeed,
      discounted = false,
      brand,
    } = filters;

    // If search is provided, use Meilisearch for better results
    // But also check if the search looks like a SKU (numeric or alphanumeric code)
    if (search && search.trim()) {
      // First try to find by exact SKU match
      const skuMatch = await prisma.product.findMany({
        where: {
          sku: { contains: search.trim(), mode: 'insensitive' },
          status: 'ACTIVE',
          price: { gt: 0 },
        },
        take: 10,
        include: {
          images: { orderBy: { order: 'asc' } },
          category: true,
          variants: { include: { inventory: true } },
        },
      });
      
      if (skuMatch.length > 0) {
        // Found by SKU - return these first, then search for more
        const meilisearchResults = await this.searchWithMeilisearch(filters);
        const skuIds = skuMatch.map(p => p.id);
        let combinedProducts = [
          ...transformProducts(skuMatch),
          ...meilisearchResults.products.filter(p => !skuIds.includes(p.id)),
        ];
        
        // Filter products: "Paczkomaty i Kurier" requires "produkt w paczce" tag
        combinedProducts = filterProductsWithPackageInfo(combinedProducts);
        combinedProducts = combinedProducts.slice(0, limit);
        
        return {
          ...meilisearchResults,
          products: combinedProducts,
        };
      }
      
      return this.searchWithMeilisearch(filters);
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ProductWhereInput = {
      // Always filter out products with price <= 0
      price: { gt: 0 },
      // Produkty MUSZĄ mieć stan magazynowy > 0
      variants: {
        some: {
          inventory: {
            some: {
              quantity: { gt: 0 }
            }
          }
        }
      },
      // Produkty MUSZĄ mieć tag dostawy ORAZ kategorię z Baselinker
      AND: [
        // Tag dostawy - nie pokazuj produktów z tylko tagiem hurtowni
        { tags: { hasSome: DELIVERY_TAGS } },
        // Kategoria z Baselinker - musi być przypisana i aktywna
        { 
          category: { 
            baselinkerCategoryId: { not: null },
            isActive: true,
          } 
        },
        // Jeśli ma "Paczkomaty i Kurier", musi mieć też "produkt w paczce"
        PACKAGE_FILTER_WHERE,
      ],
    };
    
    // Only filter by status if explicitly provided
    if (status) {
      where.status = status as Prisma.EnumProductStatusFilter;
    }

    // If category is specified, get all subcategory IDs and filter by them
    if (category) {
      const categoryIds = await this.getAllCategoryIds(category);
      if (categoryIds.length > 0) {
        where.categoryId = { in: categoryIds };
      } else {
        // Category not found, return empty results
        return {
          products: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }
    }

    if (minPrice || maxPrice) {
      // Combine with existing price > 0 filter
      where.price = {
        gt: 0,
        ...(minPrice ? { gte: minPrice } : {}),
        ...(maxPrice ? { lte: maxPrice } : {}),
      };
    }

    // Filter only discounted products (compareAtPrice > price)
    if (discounted) {
      where.compareAtPrice = { not: null };
      // We'll do the compareAtPrice > price check after fetching since Prisma doesn't support column comparison natively
      // But we can at least ensure compareAtPrice exists
    }

    // Filter by warehouse (based on baselinkerProductId prefix - dynamic from DB)
    if (warehouse) {
      const warehouses = warehouse.split(',').map(w => w.trim().toLowerCase());
      const allConfig = await wholesalerConfigService.getAll();
      const warehouseConditions: Prisma.ProductWhereInput[] = [];
      
      for (const w of warehouses) {
        const config = allConfig.find(c => c.key === w);
        if (config && config.prefix) {
          warehouseConditions.push({
            baselinkerProductId: { startsWith: config.prefix }
          });
        }
      }
      
      if (warehouseConditions.length > 0) {
        where.OR = warehouseConditions;
      }
    }

    // Filter by brand (from manufacturer relation or specifications JSON field)
    if (brand) {
      const brandNames = brand.split(',').map(b => b.trim()).filter(Boolean);
      if (brandNames.length > 0) {
        if (!where.AND) where.AND = [];
        const brandConditions = brandNames.map(b => ({
          OR: [
            { manufacturer: { name: b } },
            { specifications: { path: ['brand'], equals: b } },
          ],
        }));
        // OR between brands - show products from ANY of the selected brands
        (where.AND as any[]).push(
          brandConditions.length === 1 ? brandConditions[0] : { OR: brandConditions.map(c => c.OR).flat() }
        );
      }
    }

    // Build orderBy clause
    // Always add secondary sort by id for stable pagination (prevents random order when primary values are equal)
    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
    let useRandomSort = false;
    
    switch (sort) {
      case 'price_asc':
      case 'price-asc':
        orderBy = [{ price: 'asc' }, { id: 'asc' }];
        break;
      case 'price_desc':
      case 'price-desc':
        orderBy = [{ price: 'desc' }, { id: 'asc' }];
        break;
      case 'name_asc':
        orderBy = [{ name: 'asc' }, { id: 'asc' }];
        break;
      case 'name_desc':
        orderBy = [{ name: 'desc' }, { id: 'asc' }];
        break;
      case 'random':
      case 'relevance':
        // For random/relevance sort, we'll fetch more and shuffle with session seed
        // This ensures consistent ordering within a user session but different between sessions
        useRandomSort = true;
        orderBy = { id: 'asc' }; // Temporary, will be shuffled
        break;
      case 'popularity':
        // Sort by popularity score (salesCount*3 + viewCount*0.1)
        // Add secondary sort by id for stable pagination when scores are equal
        orderBy = [{ popularityScore: 'desc' }, { id: 'asc' }];
        break;
      case 'bestsellers':
        // Sort by sales count only (number of sold units)
        orderBy = [{ salesCount: 'desc' }, { id: 'asc' }];
        break;
      case 'top-rated':
        // Sort by average rating, then by review count for tiebreaking
        orderBy = [{ average_rating: 'desc' }, { review_count: 'desc' }, { id: 'asc' }];
        break;
      case 'newest':
      default:
        orderBy = [{ createdAt: 'desc' }, { id: 'asc' }];
    }

    // Execute queries in parallel
    // For random sort or discounted filter, we need to fetch more products
    const needsPostFetch = useRandomSort || discounted;
    const fetchLimit = needsPostFetch ? 500 : limit;
    const fetchSkip = needsPostFetch ? 0 : skip;
    
    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: fetchSkip,
        take: fetchLimit,
        orderBy,
        include: {
          images: {
            orderBy: { order: 'asc' },
          },
          category: true,
          manufacturer: true,
          variants: {
            include: {
              inventory: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Transform products
    let transformedProducts = transformProducts(products);

    // Filter only discounted products (compareAtPrice > price) - post-fetch filter
    let discountedTotal = 0;
    if (discounted) {
      transformedProducts = transformedProducts.filter(
        (p: any) => p.compareAtPrice && Number(p.compareAtPrice) > Number(p.price)
      );
      discountedTotal = transformedProducts.length;
      // Apply pagination for discounted products (since we fetched all)
      const startIndex = (page - 1) * limit;
      transformedProducts = transformedProducts.slice(startIndex, startIndex + limit);
    }
    
    // Apply random shuffle if requested (seeded by session for consistency within a browsing session)
    if (useRandomSort && transformedProducts.length > 0) {
      // Use sessionSeed if provided (from frontend), otherwise fallback to daily seed
      const seed = sessionSeed || (() => {
        const today = new Date();
        return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      })();
      
      // Seeded shuffle function - produces same order for same seed
      const seededShuffle = (array: any[], seedValue: number) => {
        const shuffled = [...array];
        let currentSeed = seedValue;
        
        const random = () => {
          currentSeed = (currentSeed * 9301 + 49297) % 233280;
          return currentSeed / 233280;
        };
        
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      };
      
      transformedProducts = seededShuffle(transformedProducts, seed);
      
      // Apply pagination after shuffle
      const startIndex = (page - 1) * limit;
      transformedProducts = transformedProducts.slice(startIndex, startIndex + limit);
    }
    
    // Filter out old zero-stock products if requested
    if (hideOldZeroStock) {
      transformedProducts = filterOldZeroStockProducts(transformedProducts, 14);
    }
    
    // Filter products: "Paczkomaty i Kurier" requires "produkt w paczce" tag
    transformedProducts = filterProductsWithPackageInfo(transformedProducts);
    
    // Sort out-of-stock products to the end (preserves original order within each group)
    transformedProducts = sortOutOfStockToEnd(transformedProducts);

    // Calculate effective total
    const effectiveTotal = discounted 
      ? discountedTotal 
      : (useRandomSort ? Math.min(totalCount, fetchLimit) : totalCount);

    return {
      products: transformedProducts,
      total: effectiveTotal,
      page,
      limit,
      totalPages: Math.ceil(effectiveTotal / limit),
    };
  }

  /**
   * Search products using Meilisearch for better full-text search
   */
  private async searchWithMeilisearch(filters: ProductFilters): Promise<ProductsListResult> {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      sort = 'newest',
      status,
      hideOldZeroStock = false,
      sessionSeed,
      brand,
    } = filters;

    // Skip Meilisearch if it's known to be down
    if (!isMeilisearchAvailable()) {
      return this.searchWithPrismaFallback(filters);
    }

    try {
      const index = getProductsIndex();

      // Build filter array
      const meiliFilters: string[] = [];
      
      // Always filter out products with price <= 0
      meiliFilters.push('price > 0');
      
      // Produkty MUSZĄ mieć tag dostawy - nie pokazuj produktów z tylko tagiem hurtowni
      // Meilisearch używa składni: tags IN ["tag1", "tag2"] dla OR
      const deliveryTagsFilter = DELIVERY_TAGS.map(tag => `"${tag}"`).join(', ');
      meiliFilters.push(`tags IN [${deliveryTagsFilter}]`);
      
      // Produkty MUSZĄ mieć przypisaną kategorię z Baselinker
      // hasBaselinkerCategory jest indeksowany w Meilisearch jako filterable
      meiliFilters.push('hasBaselinkerCategory = true');
      
      // Produkty muszą być na stanie (identyczny filtr jak w search.service.ts getSuggestions)
      meiliFilters.push('inStock = true');
      
      // Only filter by status if explicitly provided
      if (status) {
        meiliFilters.push(`status = "${status}"`);
      }
      
      if (category) {
        const categoryIds = await this.getAllCategoryIds(category);
        if (categoryIds.length > 0) {
          meiliFilters.push(`categoryId IN [${categoryIds.map(id => `"${id}"`).join(', ')}]`);
        }
      }
      
      if (minPrice !== undefined) {
        meiliFilters.push(`price >= ${minPrice}`);
      }
      if (maxPrice !== undefined) {
        meiliFilters.push(`price <= ${maxPrice}`);
      }

      // Filter by brand/manufacturer
      if (brand) {
        const escapeMeili = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const brandNames = brand.split(',').map(b => b.trim()).filter(Boolean);
        if (brandNames.length === 1) {
          meiliFilters.push(`brand = "${escapeMeili(brandNames[0])}"`);
        } else if (brandNames.length > 1) {
          const brandFilter = brandNames.map(b => `brand = "${escapeMeili(b)}"`).join(' OR ');
          meiliFilters.push(`(${brandFilter})`);
        }
      }

      // Build sort
      // Always add secondary sort by id for stable pagination (prevents random order when primary values are equal)
      let meiliSort: string[] = [];
      switch (sort) {
        case 'price_asc':
        case 'price-asc':
          meiliSort = ['price:asc', 'id:asc'];
          break;
        case 'price_desc':
        case 'price-desc':
          meiliSort = ['price:desc', 'id:asc'];
          break;
        case 'name_asc':
          meiliSort = ['name:asc', 'id:asc'];
          break;
        case 'name_desc':
          meiliSort = ['name:desc', 'id:asc'];
          break;
        case 'popularity':
        case 'relevance':
          // Sort by popularityScore (salesCount*3 + viewCount*0.1)
          // Add secondary sort by id for stable pagination when scores are equal
          meiliSort = ['popularityScore:desc', 'id:asc'];
          break;
        case 'top-rated':
          meiliSort = ['average_rating:desc', 'review_count:desc', 'id:asc'];
          break;
        case 'newest':
        default:
          meiliSort = ['createdAt:desc', 'id:asc'];
      }

      const filterStr = meiliFilters.join(' AND ');
      const words = (search || '').split(/\s+/).filter(w => w.length > 0);

      let productIds: string[];
      let estimatedTotal: number;

      if (words.length >= 2) {
        // Multi-search: full phrase + each word separately (same as autocomplete)
        const queries = [
          // Full phrase first (highest priority)
          { indexUid: PRODUCTS_INDEX, q: search || '', limit: limit * 2, offset: (page - 1) * limit, filter: filterStr, sort: meiliSort, matchingStrategy: 'last' as const, attributesToRetrieve: ['id'] },
          // Then each individual word
          ...words.map(word => ({
            indexUid: PRODUCTS_INDEX, q: word, limit: Math.ceil(limit / words.length), filter: filterStr, sort: meiliSort, matchingStrategy: 'last' as const, attributesToRetrieve: ['id'],
          })),
        ];

        const multiResults = await meiliClient.multiSearch<MultiSearchParams, MeiliProduct>({ queries });
        markMeilisearchAvailable();

        // Merge hits with deduplication (full phrase hits first)
        const seen = new Set<string>();
        const mergedIds: string[] = [];
        for (const result of (multiResults as any).results) {
          for (const hit of result.hits) {
            if (!seen.has(hit.id)) {
              seen.add(hit.id);
              mergedIds.push(hit.id);
            }
          }
        }

        estimatedTotal = mergedIds.length;
        productIds = mergedIds.slice((page - 1) * limit, page * limit);
      } else {
        // Single word — standard search
        const results = await index.search<MeiliProduct>(search || '', {
          limit,
          offset: (page - 1) * limit,
          filter: filterStr,
          sort: meiliSort,
          matchingStrategy: 'last',
          showMatchesPosition: false,
          attributesToRetrieve: ['id'],
        });

        markMeilisearchAvailable();
        productIds = results.hits.map((hit: MeiliProduct) => hit.id);
        estimatedTotal = results.estimatedTotalHits ?? results.hits.length;
      }
      
      if (productIds.length === 0) {
        // Meilisearch returned 0 hits — if user was searching, try Prisma fallback
        // (Meilisearch index may be stale or missing fields like hasBaselinkerCategory/tags)
        if (search) {
          return this.searchWithPrismaFallback(filters);
        }
        return {
          products: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          // Dodatkowy filtr: produkty muszą mieć stan > 0
          variants: {
            some: {
              inventory: {
                some: {
                  quantity: { gt: 0 }
                }
              }
            }
          },
          // Produkty MUSZĄ mieć tag dostawy ORAZ kategorię z Baselinker
          AND: [
            { tags: { hasSome: DELIVERY_TAGS } },
            { 
              category: { 
                baselinkerCategoryId: { not: null } 
              } 
            },
            // Jeśli ma "Paczkomaty i Kurier", musi mieć też "produkt w paczce"
            PACKAGE_FILTER_WHERE,
          ],
        },
        include: {
          images: {
            orderBy: { order: 'asc' },
          },
          category: true,
          manufacturer: true,
          variants: {
            include: {
              inventory: true,
            },
          },
        },
      });

      // Sort products to match Meilisearch order
      const sortedProducts = productIds.map((id: string) => 
        products.find(p => p.id === id)
      ).filter(Boolean);

      // Use estimatedTotalHits from MeiliSearch but adjust for Prisma filtering
      // When searching, Prisma may filter out products that Meilisearch returned
      // so we use the actual count of products found by Prisma
      const meiliTotal = estimatedTotal;
      const prismaFoundCount = sortedProducts.length;
      // If Prisma returned fewer products than Meilisearch page, total needs adjustment
      const total = prismaFoundCount < productIds.length
        ? prismaFoundCount
        : meiliTotal;

      // Transform products
      let transformedProducts = transformProducts(sortedProducts as any[]);
      
      // Filter out old zero-stock products if requested
      if (hideOldZeroStock) {
        transformedProducts = filterOldZeroStockProducts(transformedProducts, 14);
      }
      
      // Filter products: "Paczkomaty i Kurier" requires "produkt w paczce" tag
      transformedProducts = filterProductsWithPackageInfo(transformedProducts);
      
      // Sort out-of-stock products to the end (preserves original order within each group)
      transformedProducts = sortOutOfStockToEnd(transformedProducts);

      return {
        products: transformedProducts,
        total: hideOldZeroStock ? transformedProducts.length : total,
        page,
        limit,
        totalPages: Math.ceil((hideOldZeroStock ? transformedProducts.length : total) / limit),
      };
    } catch (error) {
      console.error('Meilisearch search error, falling back to Prisma:', error);
      markMeilisearchUnavailable();
      // Fallback to Prisma search
      return this.searchWithPrismaFallback(filters);
    }
  }

  /**
   * Fallback search using Prisma when Meilisearch is unavailable
   */
  private async searchWithPrismaFallback(filters: ProductFilters): Promise<ProductsListResult> {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      sort = 'newest',
      status,
      hideOldZeroStock = false,
    } = filters;

    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      // Produkty MUSZĄ być aktywne (default) lub mieć jawnie podany status
      status: (status as Prisma.EnumProductStatusFilter) || 'ACTIVE',
      // Produkty MUSZĄ mieć cenę > 0
      price: { gt: 0 },
      // Produkty MUSZĄ mieć stan magazynowy > 0
      variants: {
        some: {
          inventory: {
            some: {
              quantity: { gt: 0 }
            }
          }
        }
      },
      // Produkty MUSZĄ mieć tag dostawy ORAZ kategorię z Baselinker
      AND: [
        { tags: { hasSome: DELIVERY_TAGS } },
        { 
          category: { 
            baselinkerCategoryId: { not: null } 
          } 
        },
        // Jeśli ma "Paczkomaty i Kurier", musi mieć też "produkt w paczce"
        PACKAGE_FILTER_WHERE,
      ],
    };

    if (category) {
      const categoryIds = await this.getAllCategoryIds(category);
      if (categoryIds.length > 0) {
        where.categoryId = { in: categoryIds };
      }
    }

    if (minPrice || maxPrice) {
      where.price = {
        gt: 0,
        ...(minPrice ? { gte: minPrice } : {}),
        ...(maxPrice ? { lte: maxPrice } : {}),
      };
    }

    if (search) {
      // Split search into words and match each one (AND logic)
      // so "butelka pusheen" matches products containing both words anywhere in name/sku
      const searchWords = search.split(/\s+/).filter(w => w.length > 0);
      where.AND = [
        ...(where.AND as Prisma.ProductWhereInput[] || []),
        ...searchWords.map(word => ({
          OR: [
            { name: { contains: word, mode: 'insensitive' as const } },
            { sku: { contains: word, mode: 'insensitive' as const } },
          ],
        })),
      ];
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
    switch (sort) {
      case 'price_asc':
        orderBy = [{ price: 'asc' }, { id: 'asc' }];
        break;
      case 'price_desc':
        orderBy = [{ price: 'desc' }, { id: 'asc' }];
        break;
      case 'name_asc':
        orderBy = [{ name: 'asc' }, { id: 'asc' }];
        break;
      case 'name_desc':
        orderBy = [{ name: 'desc' }, { id: 'asc' }];
        break;
      case 'popularity':
      case 'relevance':
        orderBy = [{ popularityScore: 'desc' }, { id: 'asc' }];
        break;
      case 'top-rated':
        orderBy = [{ average_rating: 'desc' }, { review_count: 'desc' }, { id: 'asc' }];
        break;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          images: { orderBy: { order: 'asc' } },
          category: true,
          manufacturer: true,
          variants: { include: { inventory: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Transform products
    let transformedProducts = transformProducts(products);
    
    // Filter out old zero-stock products if requested
    if (hideOldZeroStock) {
      transformedProducts = filterOldZeroStockProducts(transformedProducts, 14);
    }
    
    // Filter products: "Paczkomaty i Kurier" requires "produkt w paczce" tag
    transformedProducts = filterProductsWithPackageInfo(transformedProducts);
    
    // Sort out-of-stock products to the end (preserves original order within each group)
    transformedProducts = sortOutOfStockToEnd(transformedProducts);

    return {
      products: transformedProducts,
      total: hideOldZeroStock ? transformedProducts.length : total,
      page,
      limit,
      totalPages: Math.ceil((hideOldZeroStock ? transformedProducts.length : total) / limit),
    };
  }

  /**
   * Get a single product by ID
   */
  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
        category: true,
        manufacturer: true,
        variants: {
          include: {
            inventory: true,
          },
        },
      },
    });

    if (!product) return null;

    // Hide products with forbidden tags
    const tags = product.tags || [];
    if (HIDDEN_TAGS.some(ht => tags.some((t: string) => t.toLowerCase() === ht.toLowerCase()))) {
      return null;
    }

    // Hide products in hidden categories (e.g. "do zrobienia")
    if (product.category && ['do zrobienia'].includes(product.category.name.toLowerCase())) {
      return null;
    }

    return transformProduct(product);
  }

  /**
   * Get multiple products by IDs in a single query (batch fetch)
   */
  async getByIds(ids: string[]) {
    if (!ids || ids.length === 0) return [];
    
    // Deduplicate and limit to 100 IDs max
    const uniqueIds = [...new Set(ids)].slice(0, 100);
    
    const products = await prisma.product.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
        category: true,
        manufacturer: true,
        variants: {
          include: {
            inventory: true,
          },
        },
      },
    });
    
    return products.map(p => transformProduct(p)).filter(Boolean);
  }

  /**
   * Get a single product by slug
   */
  async getBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
        category: true,
        manufacturer: true,
        variants: {
          include: {
            inventory: true,
          },
        },
      },
    });
    
    if (!product) return null;

    // Hide products with forbidden tags
    const tags = product.tags || [];
    if (HIDDEN_TAGS.some(ht => tags.some((t: string) => t.toLowerCase() === ht.toLowerCase()))) {
      return null;
    }

    // Hide products in hidden categories (e.g. "do zrobienia")
    if (product.category && ['do zrobienia'].includes(product.category.name.toLowerCase())) {
      return null;
    }

    // Hide products with price 0 or less
    if (!product.price || Number(product.price) <= 0) {
      return null;
    }

    // Check if product should be visible
    // Products with "Paczkomaty i Kurier" tag MUST also have "produkt w paczce" tag
    const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
    const PACKAGE_LIMIT_PATTERN = /produkt\s*w\s*paczce|produkty?\s*w\s*paczce/i;

    const hasPaczkomatTag = tags.some((tag: string) =>
      PACZKOMAT_TAGS.some(pt => tag.toLowerCase() === pt.toLowerCase())
    );

    if (hasPaczkomatTag) {
      const hasPackageLimitTag = tags.some((tag: string) =>
        PACKAGE_LIMIT_PATTERN.test(tag)
      );
      if (!hasPackageLimitTag) {
        // Product has paczkomat tag but no package limit - should not be visible
        return null;
      }
    }

    return transformProduct(product);
  }

  /**
   * Create a new product
   */
  async create(data: Prisma.ProductCreateInput, initialStock?: number) {
    console.log('ProductsService.create called with:', JSON.stringify(data, null, 2));
    try {
      const product = await prisma.product.create({
        data,
        include: {
          images: true,
          category: true,
          variants: true,
        },
      });
      
      // Create inventory entries for variants with default location
      if (product.variants && product.variants.length > 0) {
        // Get default location by code MAIN
        const defaultLocation = await prisma.location.findFirst({
          where: { code: 'MAIN', isActive: true },
        });
        
        if (defaultLocation) {
          await prisma.inventory.createMany({
            data: product.variants.map(variant => ({
              variantId: variant.id,
              locationId: defaultLocation.id,
              quantity: initialStock || 0,
              reserved: 0,
              minimum: 0,
            })),
            skipDuplicates: true,
          });
        }
      }
      
      // Queue product for Meilisearch indexing
      await queueProductIndex(product.id).catch(err => 
        console.error('Failed to queue product index:', err)
      );
      
      return product;
    } catch (error: any) {
      console.error('Prisma create error:', error.message);
      console.error('Prisma error code:', error.code);
      console.error('Prisma error meta:', error.meta);
      throw error;
    }
  }

  /**
   * Update an existing product
   * Handles price changes through PriceHistoryService for Omnibus compliance
   */
  async update(
    id: string, 
    data: Prisma.ProductUpdateInput,
    options?: {
      source?: PriceChangeSource;
      changedBy?: string;
      reason?: string;
    }
  ) {
    // Check if price is being updated
    const newPrice = data.price;
    const hasNewPrice = newPrice !== undefined;
    
    // If price is changing, use PriceHistoryService for Omnibus compliance
    if (hasNewPrice && typeof newPrice === 'number') {
      // Extract price from update data - it will be handled by priceHistoryService
      const { price: _extractedPrice, ...dataWithoutPrice } = data as any;
      
      // First update other fields (without price)
      if (Object.keys(dataWithoutPrice).length > 0) {
        await prisma.product.update({
          where: { id },
          data: dataWithoutPrice,
        });
      }
      
      // Then update price with history tracking (Omnibus)
      await priceHistoryService.updateProductPrice({
        productId: id,
        newPrice,
        source: options?.source || PriceChangeSource.ADMIN,
        changedBy: options?.changedBy,
        reason: options?.reason,
      });
    } else {
      // No price change - standard update
      await prisma.product.update({
        where: { id },
        data,
      });
    }
    
    // Fetch updated product with relations
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        category: true,
        variants: {
          include: {
            inventory: true,
          },
        },
      },
    });
    
    // Queue product for Meilisearch reindexing
    if (product) {
      await queueProductIndex(product.id).catch(err => 
        console.error('Failed to queue product reindex:', err)
      );
    }
    
    return product;
  }

  /**
   * Update product price with full Omnibus compliance
   * Use this method when you need explicit control over price changes
   */
  async updatePrice(
    productId: string,
    newPrice: number,
    source: PriceChangeSource,
    changedBy?: string,
    reason?: string
  ) {
    const result = await priceHistoryService.updateProductPrice({
      productId,
      newPrice,
      source,
      changedBy,
      reason,
    });
    
    // Queue for reindexing
    await queueProductIndex(productId).catch(err => 
      console.error('Failed to queue product reindex:', err)
    );
    
    return result;
  }

  /**
   * Update variant price with full Omnibus compliance
   */
  async updateVariantPrice(
    variantId: string,
    newPrice: number,
    source: PriceChangeSource,
    changedBy?: string,
    reason?: string
  ) {
    // Get variant to find product ID for reindexing
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });
    
    const result = await priceHistoryService.updateVariantPrice({
      variantId,
      newPrice,
      source,
      changedBy,
      reason,
    });
    
    // Queue parent product for reindexing
    if (variant?.productId) {
      await queueProductIndex(variant.productId).catch(err => 
        console.error('Failed to queue product reindex:', err)
      );
    }
    
    return result;
  }

  /**
   * Update stock for multiple variants
   */
  async updateVariantsStock(variantIds: string[], quantity: number) {
    // Get default location by code MAIN
    const defaultLocation = await prisma.location.findFirst({
      where: { code: 'MAIN', isActive: true },
    });
    
    if (!defaultLocation) {
      console.error('No default location found for inventory update');
      return;
    }

    for (const variantId of variantIds) {
      await prisma.inventory.upsert({
        where: {
          variantId_locationId: {
            variantId,
            locationId: defaultLocation.id,
          },
        },
        update: {
          quantity,
        },
        create: {
          variantId,
          locationId: defaultLocation.id,
          quantity,
          reserved: 0,
          minimum: 0,
        },
      });
    }
  }

  /**
   * Soft delete a product (set status to ARCHIVED)
   */
  async delete(id: string) {
    const product = await prisma.product.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    
    // Queue product for removal from Meilisearch
    await queueProductDelete(id).catch(err => 
      console.error('Failed to queue product delete:', err)
    );
    
    return product;
  }

  /**
   * Bulk import products from CSV/XLSX
   */
  async bulkImport(products: Prisma.ProductCreateInput[]) {
    return prisma.$transaction(
      products.map((product) =>
        prisma.product.create({ data: product })
      )
    );
  }

  /**
   * Get available filters for products - faceted (counts update based on active filters)
   */
  async getFilters(params: {
    categorySlug?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    warehouse?: string;
  } = {}) {
    const { categorySlug, brand, minPrice, maxPrice, warehouse } = params;

    // Base visibility criteria (same as getAll)
    const baseWhere: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      price: { gt: 0 },
      variants: {
        some: {
          inventory: {
            some: {
              quantity: { gt: 0 }
            }
          }
        }
      },
      AND: [
        { tags: { hasSome: DELIVERY_TAGS } },
        { category: { baselinkerCategoryId: { not: null } } },
        PACKAGE_FILTER_WHERE,
      ],
    };

    // If category specified, get all subcategory IDs as well
    let categoryIds: string[] = [];
    if (categorySlug) {
      const category = await prisma.category.findUnique({
        where: { slug: categorySlug },
        include: {
          children: {
            include: {
              children: true,
            },
          },
        },
      });

      if (category) {
        categoryIds = [category.id];
        category.children.forEach((child) => {
          categoryIds.push(child.id);
          child.children.forEach((grandchild) => {
            categoryIds.push(grandchild.id);
          });
        });
        baseWhere.categoryId = { in: categoryIds };
      }
    }

    // Parse brand list
    const brandNames = brand ? brand.split(',').map(b => b.trim()).filter(Boolean) : [];

    // Build brand filter condition
    const buildBrandCondition = (brands: string[]): Prisma.ProductWhereInput | undefined => {
      if (brands.length === 0) return undefined;
      const conditions = brands.map(b => ({
        OR: [
          { manufacturer: { name: b } },
          { specifications: { path: ['brand'], equals: b } },
        ] as Prisma.ProductWhereInput[],
      }));
      return conditions.length === 1 
        ? { OR: conditions[0].OR }
        : { OR: conditions.flatMap(c => c.OR) };
    };

    // Build warehouse filter condition
    const buildWarehouseCondition = async (wh: string): Promise<Prisma.ProductWhereInput | undefined> => {
      const warehouses = wh.split(',').map(w => w.trim().toLowerCase());
      const allConfig = await wholesalerConfigService.getAll();
      const conditions: Prisma.ProductWhereInput[] = [];
      for (const w of warehouses) {
        const config = allConfig.find(c => c.key === w);
        if (config && config.prefix) {
          conditions.push({ baselinkerProductId: { startsWith: config.prefix } });
        }
      }
      return conditions.length > 0 ? { OR: conditions } : undefined;
    };

    const warehouseCondition = warehouse ? await buildWarehouseCondition(warehouse) : undefined;

    // ---- Faceted queries ----
    // Brand counts: apply all filters EXCEPT brand
    const brandWhere: Prisma.ProductWhereInput = { ...baseWhere };
    if (minPrice || maxPrice) {
      brandWhere.price = { gt: 0, ...(minPrice ? { gte: minPrice } : {}), ...(maxPrice ? { lte: maxPrice } : {}) };
    }
    if (warehouseCondition) {
      brandWhere.AND = [...(brandWhere.AND as any[] || []), warehouseCondition];
    }

    // Full filter (all filters applied) for price range, specs, warehouse counts
    const fullWhere: Prisma.ProductWhereInput = { ...baseWhere };
    if (minPrice || maxPrice) {
      fullWhere.price = { gt: 0, ...(minPrice ? { gte: minPrice } : {}), ...(maxPrice ? { lte: maxPrice } : {}) };
    }
    const brandCondition = buildBrandCondition(brandNames);
    if (brandCondition) {
      fullWhere.AND = [...(fullWhere.AND as any[] || []), brandCondition];
    }
    if (warehouseCondition) {
      fullWhere.AND = [...(fullWhere.AND as any[] || []), warehouseCondition];
    }

    // Price range: apply all filters EXCEPT price
    const priceWhere: Prisma.ProductWhereInput = { ...baseWhere };
    if (brandCondition) {
      priceWhere.AND = [...(priceWhere.AND as any[] || []), brandCondition];
    }
    if (warehouseCondition) {
      priceWhere.AND = [...(priceWhere.AND as any[] || []), warehouseCondition];
    }

    // Fetch products for brand counts (without brand filter) and for price range (without price filter) in parallel
    const [brandProducts, priceProducts, fullProducts] = await Promise.all([
      prisma.product.findMany({
        where: brandWhere,
        select: {
          id: true,
          manufacturer: { select: { name: true } },
          specifications: true,
        },
      }),
      prisma.product.findMany({
        where: priceWhere,
        select: {
          id: true,
          price: true,
        },
      }),
      prisma.product.findMany({
        where: fullWhere,
        select: {
          id: true,
          price: true,
          specifications: true,
          manufacturer: { select: { name: true } },
          category: {
            select: {
              slug: true,
              parent: {
                select: {
                  slug: true,
                  parent: {
                    select: { slug: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    // Brand counts (from brandProducts - without brand filter applied)
    const brandCounts: Record<string, number> = {};
    brandProducts.forEach((product) => {
      const specs = product.specifications as Record<string, any> | null;
      const brandName = (product as any).manufacturer?.name || (specs?.brand);
      if (brandName) {
        brandCounts[brandName] = (brandCounts[brandName] || 0) + 1;
      }
    });

    // Price range (from priceProducts - without price filter applied)
    let priceMin = Infinity;
    let priceMax = 0;
    priceProducts.forEach((product) => {
      const price = Number(product.price);
      if (price < priceMin) priceMin = price;
      if (price > priceMax) priceMax = price;
    });

    // Specifications (from fullProducts - all filters applied)
    const specificationValues: Record<string, Record<string, number>> = {};
    fullProducts.forEach((product) => {
      const specs = product.specifications as Record<string, any> | null;
      if (specs) {
        Object.entries(specs).forEach(([key, value]) => {
          if (key !== 'brand' && value !== null && value !== undefined) {
            if (!specificationValues[key]) {
              specificationValues[key] = {};
            }
            const strValue = String(value);
            specificationValues[key][strValue] = (specificationValues[key][strValue] || 0) + 1;
          }
        });
      }
    });

    // Determine which spec filters to show based on category
    const categoryPath = categorySlug ? await this.getCategoryPath(categorySlug) : [];
    const relevantSpecs = this.getRelevantSpecsForCategory(categoryPath);

    // Format brands
    const brands = Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Format specifications
    const specifications: Record<string, { value: string; count: number }[]> = {};
    relevantSpecs.forEach((specKey) => {
      if (specificationValues[specKey]) {
        specifications[specKey] = Object.entries(specificationValues[specKey])
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => {
            const numA = parseFloat(a.value);
            const numB = parseFloat(b.value);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.value.localeCompare(b.value);
          });
      }
    });

    // Count products per warehouse (with brand + price filters, but not warehouse filter)
    const warehouseCountWhere: Prisma.ProductWhereInput = { ...baseWhere };
    if (minPrice || maxPrice) {
      warehouseCountWhere.price = { gt: 0, ...(minPrice ? { gte: minPrice } : {}), ...(maxPrice ? { lte: maxPrice } : {}) };
    }
    if (brandCondition) {
      warehouseCountWhere.AND = [...(warehouseCountWhere.AND as any[] || []), brandCondition];
    }
    const warehouseCounts = await this.getWarehouseCounts(
      categoryIds.length > 0 ? categoryIds : undefined,
      warehouseCountWhere,
    );

    // Count products per main category (with all filters except category)
    const categoryCounts = await this.getCategoryCounts(fullWhere);

    return {
      priceRange: {
        min: priceMin === Infinity ? 0 : Math.floor(priceMin),
        max: priceMax === 0 ? 10000 : Math.ceil(priceMax),
      },
      brands,
      specifications,
      warehouseCounts,
      categoryCounts,
      totalProducts: fullProducts.length,
    };
  }

  /**
   * Count products per warehouse based on baselinkerProductId prefix
   * Uses same visibility criteria as main product listing
   */
  private async getWarehouseCounts(categoryIds?: string[], customWhere?: Prisma.ProductWhereInput): Promise<Record<string, number>> {
    const whereBase: Prisma.ProductWhereInput = customWhere || {
      status: 'ACTIVE',
      price: { gt: 0 },
      variants: {
        some: {
          inventory: {
            some: {
              quantity: { gt: 0 }
            }
          }
        }
      },
      AND: [
        { tags: { hasSome: DELIVERY_TAGS } },
        { category: { baselinkerCategoryId: { not: null } } },
        PACKAGE_FILTER_WHERE,
      ],
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    };

    // Dynamic: fetch active wholesalers with prefix from DB
    const allConfig = await wholesalerConfigService.getAll();
    const activeWithPrefix = allConfig.filter(w => w.prefix && w.isActive);

    const counts = await Promise.all(
      activeWithPrefix.map(wh =>
        prisma.product.count({
          where: {
            ...whereBase,
            baselinkerProductId: { startsWith: wh.prefix },
          },
        }).then(count => ({ key: wh.key, count }))
      )
    );

    const result: Record<string, number> = {};
    for (const { key, count } of counts) {
      result[key] = count;
    }
    return result;
  }

  /**
   * Count products per main category (and subcategories) with given filters applied.
   * Returns { [categorySlug]: count } for all main categories.
   */
  private async getCategoryCounts(baseFilter: Prisma.ProductWhereInput): Promise<Record<string, number>> {
    // Get main categories (those with order > 0, no parent)
    const mainCategories = await prisma.category.findMany({
      where: { parentId: null, order: { gt: 0 } },
      include: {
        children: {
          include: {
            children: true,
          },
        },
      },
    });

    // For each main category, count products matching base filter + in that category tree
    // Remove any existing categoryId filter from baseFilter
    const { categoryId: _removed, ...filterWithoutCategory } = baseFilter;

    const counts = await Promise.all(
      mainCategories.map(async (cat) => {
        const categoryIds = [cat.id];
        cat.children.forEach((child) => {
          categoryIds.push(child.id);
          child.children.forEach((grandchild) => {
            categoryIds.push(grandchild.id);
          });
        });
        const count = await prisma.product.count({
          where: {
            ...filterWithoutCategory,
            categoryId: { in: categoryIds },
          },
        });
        return { slug: cat.slug, count };
      })
    );

    const result: Record<string, number> = {};
    for (const { slug, count } of counts) {
      result[slug] = count;
    }
    return result;
  }

  private async getCategoryPath(slug: string): Promise<string[]> {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        parent: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!category) return [];

    const path = [category.slug];
    if (category.parent) {
      path.unshift(category.parent.slug);
      if (category.parent.parent) {
        path.unshift(category.parent.parent.slug);
      }
    }
    return path;
  }

  private getRelevantSpecsForCategory(categoryPath: string[]): string[] {
    // Define which specs are relevant for which categories
    const specsByCategory: Record<string, string[]> = {
      'elektronika': ['brand'],
      'laptopy': ['ram', 'processor', 'storage', 'screenSize', 'graphicsCard'],
      'smartfony': ['ram', 'storage', 'screenSize', 'batteryCapacity'],
      'telewizory': ['screenSize', 'resolution', 'panelType'],
      'sluchawki': ['type', 'connectivity', 'noiseCancellation'],
      'moda': ['size', 'material', 'color'],
      'agd': ['powerConsumption', 'energyClass', 'capacity'],
    };

    const specs = new Set<string>();
    categoryPath.forEach((slug) => {
      const categorySpecs = specsByCategory[slug];
      if (categorySpecs) {
        categorySpecs.forEach((spec) => specs.add(spec));
      }
    });

    return Array.from(specs);
  }

  /**
   * Get excluded product IDs from carousel settings
   */
  private async getExcludedProductIds(): Promise<string[]> {
    try {
      const settings = await prisma.settings.findUnique({
        where: { key: 'carousel_exclusions' },
      });
      
      if (settings?.value) {
        const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
        const exclusions = parsed as { excludedProductIds?: string[] };
        return exclusions.excludedProductIds || [];
      }
    } catch (error) {
      console.error('Error reading carousel exclusions:', error);
    }
    return [];
  }

  /**
   * Get bestsellers based on actual sales data from OrderItems
   * Returns products sorted by number of units sold
   */
  async getBestsellers(options: {
    limit?: number;
    category?: string;
    days?: number; // How many days back to look for sales
  } = {}): Promise<any[]> {
    const { limit = 20, category, days = 90 } = options;

    // Get excluded product IDs
    const excludedProductIds = await this.getExcludedProductIds();

    // Check if admin has manually selected some bestsellers (they go first)
    // Only apply manual products when NOT filtering by category (category filter = different carousel like Toys)
    let manualProducts: any[] = [];
    let manualProductIds: string[] = [];
    
    if (!category) {
      try {
        const settings = await prisma.settings.findUnique({
          where: { key: 'homepage_carousels' },
        });
        
        if (settings?.value) {
          const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
          const carousels = parsed as Record<string, { productIds?: string[]; isAutomatic?: boolean }>;
          const bestsellerIds = carousels.bestsellers?.productIds;
          if (bestsellerIds && bestsellerIds.length > 0) {
            manualProductIds = bestsellerIds;
            
            const products = await prisma.product.findMany({
              where: {
                id: { in: bestsellerIds },
                status: 'ACTIVE',
              },
              include: {
                images: { orderBy: { order: 'asc' } },
                category: true,
                variants: { include: { inventory: true } },
              },
            });
            
            // Sort to match order in productIds
            manualProducts = bestsellerIds
              .map(id => products.find(p => p.id === id))
              .filter(Boolean);
            manualProducts = transformProducts(manualProducts);
          }
        }
      } catch (error) {
        console.error('Error reading carousel settings:', error);
      }
    }

    // If we already have enough manual products, return them
    if (manualProducts.length >= limit) {
      return manualProducts.slice(0, limit);
    }

    // Get automatic bestsellers to fill remaining slots
    const remainingSlots = limit - manualProducts.length;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get order items from completed orders in the time period
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startDate },
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
          paymentStatus: 'PAID',
        },
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: { orderBy: { order: 'asc' } },
                category: true,
                variants: {
                  include: { inventory: true },
                },
              },
            },
          },
        },
      },
    });

    // Aggregate sales by product
    const productSalesMap = new Map<string, { product: any; soldCount: number }>();

    for (const item of orderItems) {
      const product = item.variant.product;
      
      // Skip if category filter doesn't match
      if (category && product.category?.slug !== category) {
        continue;
      }

      // Skip draft/archived products
      if (product.status !== 'ACTIVE') {
        continue;
      }

      const existing = productSalesMap.get(product.id);
      if (existing) {
        existing.soldCount += item.quantity;
      } else {
        productSalesMap.set(product.id, {
          product: transformProduct(product),
          soldCount: item.quantity,
        });
      }
    }

    // Sort by sold count and get automatic bestsellers (excluding manual ones and excluded ones)
    const automaticBestsellers = Array.from(productSalesMap.values())
      .filter(item => !manualProductIds.includes(item.product.id)) // Exclude already added manual products
      .filter(item => !excludedProductIds.includes(item.product.id)) // Exclude admin-excluded products
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, remainingSlots)
      .map(item => ({
        ...item.product,
        soldCount: item.soldCount,
      }));

    // Combine: manual products first, then automatic bestsellers
    // Filter out products with "Paczkomaty i Kurier" but no "produkt w paczce" tag
    return filterProductsWithPackageInfo([...manualProducts, ...automaticBestsellers]);
  }

  /**
   * Get featured products - either manually curated from Settings or fallback to newest
   */
  async getFeatured(options: {
    limit?: number;
    productIds?: string[]; // Manually selected product IDs (override)
  } = {}): Promise<any[]> {
    const { limit = 20, productIds } = options;

    // Get excluded product IDs
    const excludedProductIds = await this.getExcludedProductIds();

    // Check Settings for admin-curated products (they go first)
    let manualProducts: any[] = [];
    let manualProductIds: string[] = [];
    
    try {
      const settings = await prisma.settings.findUnique({
        where: { key: 'homepage_carousels' },
      });
      
      if (settings?.value) {
        const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
        const carousels = parsed as Record<string, { productIds?: string[]; isAutomatic?: boolean }>;
        const adminFeaturedIds = carousels.featured?.productIds;
        if (adminFeaturedIds && adminFeaturedIds.length > 0) {
          manualProductIds = adminFeaturedIds;
          
          const products = await prisma.product.findMany({
            where: {
              id: { in: adminFeaturedIds },
              status: 'ACTIVE',
            },
            include: {
              images: { orderBy: { order: 'asc' } },
              category: true,
              variants: { include: { inventory: true } },
            },
          });
          
          manualProducts = adminFeaturedIds
            .map(id => products.find(p => p.id === id))
            .filter(Boolean);
          manualProducts = transformProducts(manualProducts);
        }
      }
    } catch (error) {
      console.error('Error reading carousel settings:', error);
    }

    // Override with directly passed productIds if provided
    if (productIds && productIds.length > 0) {
      manualProductIds = productIds;
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          status: 'ACTIVE',
        },
        include: {
          images: { orderBy: { order: 'asc' } },
          category: true,
          variants: { include: { inventory: true } },
        },
      });
      manualProducts = productIds
        .map(id => products.find(p => p.id === id))
        .filter(Boolean);
      manualProducts = transformProducts(manualProducts);
    }

    // If we already have enough manual products, return them
    if (manualProducts.length >= limit) {
      return manualProducts.slice(0, limit);
    }

    // Get diverse automatic products from various categories
    // Exclude boring items like phone cases, covers, etc.
    const boringKeywords = ['etui', 'case', 'pokrowiec', 'folia', 'szkło', 'kabel', 'ładowarka', 'adapter'];
    const remainingSlots = limit - manualProducts.length;
    
    // Get products from different categories for diversity
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      select: { id: true, slug: true },
    });
    
    const productsPerCategory = Math.ceil(remainingSlots / Math.max(categories.length, 1)) + 2;
    let allCandidates: any[] = [];
    
    for (const category of categories) {
      const categoryProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 10 }, // Skip very cheap items
          categoryId: category.id,
          id: { notIn: [...manualProductIds, ...excludedProductIds] },
          // Exclude boring product names
          NOT: {
            OR: boringKeywords.map(keyword => ({
              name: { contains: keyword, mode: 'insensitive' as const },
            })),
          },
        },
        orderBy: [
          { compareAtPrice: 'desc' }, // Products with discounts first
          { createdAt: 'desc' },
        ],
        take: productsPerCategory,
        include: {
          images: { orderBy: { order: 'asc' } },
          category: true,
          variants: { include: { inventory: true } },
        },
      });
      allCandidates.push(...categoryProducts);
    }
    
    // Shuffle and pick diverse products
    const shuffled = allCandidates.sort(() => Math.random() - 0.5);

    // Ensure diversity - don't pick too many from same category
    const picked: any[] = [];
    const categoryCount: Record<string, number> = {};
    const maxPerCategory = Math.ceil(remainingSlots / 3);
    
    for (const product of shuffled) {
      if (picked.length >= remainingSlots) break;
      const catId = product.categoryId || 'none';
      if ((categoryCount[catId] || 0) < maxPerCategory) {
        picked.push(product);
        categoryCount[catId] = (categoryCount[catId] || 0) + 1;
      }
    }
    
    // If not enough, fill with remaining
    if (picked.length < remainingSlots) {
      for (const product of shuffled) {
        if (picked.length >= remainingSlots) break;
        if (!picked.some(p => p.id === product.id)) {
          picked.push(product);
        }
      }
    }

    // Combine: manual products first, then diverse automatic
    // Filter out products with "Paczkomaty i Kurier" but no "produkt w paczce" tag
    return filterProductsWithPackageInfo([...manualProducts, ...transformProducts(picked)]);
  }

  /**
   * Get toys carousel products - manual selections from admin + automatic bestsellers from toys category
   */
  async getToys(options: { limit?: number } = {}): Promise<any[]> {
    const { limit = 20 } = options;

    const excludedProductIds = await this.getExcludedProductIds();

    // Check if admin has manually selected toys products
    let manualProducts: any[] = [];
    let manualProductIds: string[] = [];

    try {
      const settings = await prisma.settings.findUnique({
        where: { key: 'homepage_carousels' },
      });

      if (settings?.value) {
        const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
        const carousels = parsed as Record<string, { productIds?: string[]; isAutomatic?: boolean }>;
        const toysIds = carousels.toys?.productIds;
        if (toysIds && toysIds.length > 0) {
          manualProductIds = [...new Set(toysIds)]; // deduplicate

          const products = await prisma.product.findMany({
            where: {
              id: { in: manualProductIds },
              status: 'ACTIVE',
            },
            include: {
              images: { orderBy: { order: 'asc' } },
              category: true,
              variants: { include: { inventory: true } },
            },
          });

          // Preserve admin-defined order
          manualProducts = manualProductIds
            .map(id => products.find(p => p.id === id))
            .filter(Boolean);
          manualProducts = transformProducts(manualProducts);
        }
      }
    } catch (error) {
      console.error('Error reading carousel settings for toys:', error);
    }

    if (manualProducts.length >= limit) {
      return manualProducts.slice(0, limit);
    }

    // Fill remaining slots with bestsellers from toys category
    const remainingSlots = limit - manualProducts.length;
    const automaticProducts = await this.getBestsellers({
      limit: remainingSlots + manualProductIds.length,
      category: 'zabawki',
    });

    const filteredAutomatic = automaticProducts
      .filter((p: any) => !manualProductIds.includes(p.id) && !excludedProductIds.includes(p.id))
      .slice(0, remainingSlots);

    return filterProductsWithPackageInfo([...manualProducts, ...filteredAutomatic]);
  }

  /**
   * Get seasonal products based on tags or settings
   */
  async getSeasonal(options: {
    limit?: number;
    season?: 'spring' | 'summer' | 'autumn' | 'winter';
  } = {}): Promise<any[]> {
    const { limit = 20 } = options;

    // Get excluded product IDs
    const excludedProductIds = await this.getExcludedProductIds();

    // Check if admin has manually selected some seasonal products (they go first)
    let manualProducts: any[] = [];
    let manualProductIds: string[] = [];
    
    try {
      const settings = await prisma.settings.findUnique({
        where: { key: 'homepage_carousels' },
      });
      
      if (settings?.value) {
        const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
        const carousels = parsed as Record<string, { productIds?: string[]; isAutomatic?: boolean }>;
        const seasonalIds = carousels.seasonal?.productIds;
        if (seasonalIds && seasonalIds.length > 0) {
          manualProductIds = seasonalIds;
          
          const products = await prisma.product.findMany({
            where: {
              id: { in: seasonalIds },
              status: 'ACTIVE',
            },
            include: {
              images: { orderBy: { order: 'asc' } },
              category: true,
              variants: { include: { inventory: true } },
            },
          });
          
          manualProducts = seasonalIds
            .map(id => products.find(p => p.id === id))
            .filter(Boolean);
          manualProducts = transformProducts(manualProducts);
        }
      }
    } catch (error) {
      console.error('Error reading carousel settings:', error);
    }

    // If we already have enough manual products, return them
    if (manualProducts.length >= limit) {
      return manualProducts.slice(0, limit);
    }

    // Get automatic seasonal products to fill remaining slots
    const remainingSlots = limit - manualProducts.length;

    // Determine current season if not provided
    const month = new Date().getMonth() + 1;
    let season = options.season;
    if (!season) {
      if (month >= 3 && month <= 5) season = 'spring';
      else if (month >= 6 && month <= 8) season = 'summer';
      else if (month >= 9 && month <= 11) season = 'autumn';
      else season = 'winter';
    }

    // Map season to Polish tags that might be in the database
    const seasonTags: Record<string, string[]> = {
      spring: ['wiosna', 'wiosenny', 'wiosenne', 'spring'],
      summer: ['lato', 'letni', 'letnie', 'summer', 'plaża', 'wakacje'],
      autumn: ['jesień', 'jesien', 'jesienny', 'jesienne', 'autumn'],
      winter: ['zima', 'zimowy', 'zimowe', 'winter', 'święta', 'boże narodzenie', 'choinka', 'śnieg'],
    };

    // Winter-specific categories for better results
    const winterCategories = ['dziecko', 'zabawki', 'elektronika', 'dom-i-ogrod'];

    const tags = seasonTags[season] || [];

    // Try to find products with seasonal tags (excluding manual and admin-excluded ones)
    let automaticProducts = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        price: { gt: 0 },
        tags: { hasSome: tags },
        id: { notIn: [...manualProductIds, ...excludedProductIds] },
      },
      orderBy: { createdAt: 'desc' },
      take: remainingSlots,
      include: {
        images: { orderBy: { order: 'asc' } },
        category: true,
        variants: {
          include: { inventory: true },
        },
      },
    });

    // If no tagged products, fallback to products from relevant categories
    if (automaticProducts.length < remainingSlots) {
      const fallbackCategories = season === 'winter' ? winterCategories : [];
      
      const additionalProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 },
          id: { notIn: [...manualProductIds, ...excludedProductIds, ...automaticProducts.map(p => p.id)] },
          ...(fallbackCategories.length > 0 && {
            category: { slug: { in: fallbackCategories } },
          }),
        },
        orderBy: [
          { compareAtPrice: 'desc' }, // Products on sale first
          { createdAt: 'desc' },
        ],
        take: remainingSlots - automaticProducts.length,
        include: {
          images: { orderBy: { order: 'asc' } },
          category: true,
          variants: {
            include: { inventory: true },
          },
        },
      });

      automaticProducts = [...automaticProducts, ...additionalProducts];
    }

    // Combine: manual products first, then automatic
    // Filter out products with "Paczkomaty i Kurier" but no "produkt w paczce" tag
    return filterProductsWithPackageInfo([...manualProducts, ...transformProducts(automaticProducts)]);
  }

  /**
   * Get new products - products added in the last 14 days
   * Supports admin-curated manual selection with automatic fallback
   */
  async getNewProducts(options: {
    limit?: number;
    days?: number; // How many days back to look (default 14)
  } = {}): Promise<any[]> {
    const { limit = 20, days = 14 } = options;

    // Get excluded product IDs
    const excludedProductIds = await this.getExcludedProductIds();

    // Check if admin has manually selected some new products (they go first)
    let manualProducts: any[] = [];
    let manualProductIds: string[] = [];
    
    try {
      const settings = await prisma.settings.findUnique({
        where: { key: 'homepage_carousels' },
      });
      
      if (settings?.value) {
        const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
        const carousels = parsed as Record<string, { productIds?: string[]; isAutomatic?: boolean }>;
        const newProductIds = carousels.newProducts?.productIds;
        if (newProductIds && newProductIds.length > 0) {
          manualProductIds = newProductIds;
          
          const products = await prisma.product.findMany({
            where: {
              id: { in: newProductIds },
              status: 'ACTIVE',
            },
            include: {
              images: { orderBy: { order: 'asc' } },
              category: true,
              variants: { include: { inventory: true } },
            },
          });
          
          // Maintain order from settings
          manualProducts = newProductIds
            .map(id => products.find(p => p.id === id))
            .filter(Boolean);
          manualProducts = transformProducts(manualProducts);
        }
      }
    } catch (error) {
      console.error('Error reading carousel settings:', error);
    }

    // If we already have enough manual products, return them
    if (manualProducts.length >= limit) {
      return manualProducts.slice(0, limit);
    }

    // Get automatic new products to fill remaining slots
    const remainingSlots = limit - manualProducts.length;

    // Calculate the date threshold (products from last X days)
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Fetch products added in the last X days (excluding manual and admin-excluded ones)
    const automaticProducts = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        price: { gt: 0 },
        createdAt: { gte: dateThreshold },
        id: { notIn: [...manualProductIds, ...excludedProductIds] },
      },
      orderBy: { createdAt: 'desc' },
      take: remainingSlots,
      include: {
        images: { orderBy: { order: 'asc' } },
        category: true,
        variants: {
          include: { inventory: true },
        },
      },
    });

    // Combine: manual products first, then automatic new products
    // Filter out products with "Paczkomaty i Kurier" but no "produkt w paczce" tag
    return filterProductsWithPackageInfo([...manualProducts, ...transformProducts(automaticProducts)]);
  }

  /**
   * Get the most wishlisted product (Product of the Day)
   * Returns the product that has been added to wishlists the most
   */
  async getMostWishlisted(): Promise<any | null> {
    // Count wishlist additions per product, get the top one
    const topWishlisted = await prisma.wishlistItem.groupBy({
      by: ['productId'],
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 1,
    });

    if (topWishlisted.length === 0) return null;

    const product = await prisma.product.findUnique({
      where: { id: topWishlisted[0].productId, status: 'ACTIVE' },
      include: {
        images: { orderBy: { order: 'asc' } },
        category: true,
        variants: {
          include: { inventory: true },
        },
      },
    });

    if (!product) return null;

    return {
      ...transformProduct(product),
      wishlistCount: topWishlisted[0]._count.productId,
    };
  }

  /**
   * Get top-rated products (highest average_rating with minimum review_count)
   */
  async getTopRated(options: {
    limit?: number;
    minReviews?: number;
  } = {}): Promise<{ products: any[] }> {
    const { limit = 20, minReviews = 1 } = options;

    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        review_count: { gte: minReviews },
        average_rating: { not: null },
        tags: { hasSome: DELIVERY_TAGS },
        ...PACKAGE_FILTER_WHERE,
      },
      include: {
        images: { orderBy: { order: 'asc' } },
        category: true,
        variants: {
          include: { inventory: true },
        },
      },
      orderBy: [
        { average_rating: 'desc' },
        { review_count: 'desc' },
      ],
      take: limit,
    });

    return {
      products: filterProductsWithPackageInfo(transformProducts(products)),
    };
  }

  /**
   * Get products from the same warehouse/wholesaler as the given product
   * Used for "Zamów w jednej przesyłce" recommendations
   */
  async getSameWarehouseProducts(productId: string, options: { limit?: number } = {}) {
    const { limit = 6 } = options;

    // First get the source product to find its warehouse and category
    const sourceProduct = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, baselinkerProductId: true, sku: true, categoryId: true },
    });

    if (!sourceProduct) {
      return { products: [], wholesaler: null };
    }

    // Extract warehouse from baselinkerProductId prefix (hp-, leker-, btp-)
    const warehouse = this.extractWarehouseFromProduct(sourceProduct);
    
    if (!warehouse) {
      return { products: [], wholesaler: null };
    }

    const isOutlet = warehouse.id === 'outlet';
    const baseWhere = {
      status: 'ACTIVE' as const,
      price: { gt: 0 },
      id: { not: productId },
      baselinkerProductId: { startsWith: warehouse.prefix },
      ...(isOutlet ? {} : { OR: DELIVERY_TAGS.map(tag => ({ tags: { has: tag } })) }),
      ...(isOutlet ? {} : { baselinkerCategoryPath: { not: null } }),
      ...(isOutlet ? {} : PACKAGE_FILTER_WHERE),
      variants: {
        some: {
          inventory: {
            some: {
              quantity: { gt: 0 },
            },
          },
        },
      },
    };

    const includeRelations = {
      images: { orderBy: { order: 'asc' } as const },
      category: true,
      variants: {
        include: { inventory: true },
      },
    };

    // Step 1: Try same warehouse + same category first (most relevant)
    let sameCategoryProducts: any[] = [];
    if (sourceProduct.categoryId) {
      const fetchLimit = limit * 4;
      sameCategoryProducts = await prisma.product.findMany({
        where: {
          ...baseWhere,
          categoryId: sourceProduct.categoryId,
        },
        orderBy: [
          { review_count: 'desc' },
          { createdAt: 'desc' },
        ],
        take: fetchLimit,
        include: includeRelations,
      });
    }

    // Step 2: If not enough from same category, fill remaining from same warehouse
    const sameCategoryIds = new Set(sameCategoryProducts.map((p: any) => p.id));
    let otherWarehouseProducts: any[] = [];
    if (sameCategoryProducts.length < limit) {
      const remaining = (limit - sameCategoryProducts.length) * 4;
      otherWarehouseProducts = await prisma.product.findMany({
        where: {
          ...baseWhere,
          ...(sourceProduct.categoryId ? { categoryId: { not: sourceProduct.categoryId } } : {}),
        },
        orderBy: [
          { review_count: 'desc' },
          { createdAt: 'desc' },
        ],
        take: remaining,
        include: includeRelations,
      });
    }

    // Shuffle helper to randomize results so they vary between views
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Combine: shuffled same-category first, then shuffled other warehouse products
    const combined = [
      ...shuffle(sameCategoryProducts),
      ...shuffle(otherWarehouseProducts),
    ];

    return {
      products: filterProductsWithPackageInfo(transformProducts(combined)).slice(0, limit),
      wholesaler: warehouse.displayName,
    };
  }

  /**
   * Extract warehouse info from product's baselinkerProductId or SKU prefix
   */
  private extractWarehouseFromProduct(product: { baselinkerProductId: string | null; sku: string | null }): { id: string; prefix: string; displayName: string } | null {
    const cached = wholesalerConfigService.getCachedConfig();
    
    const blId = product.baselinkerProductId?.toLowerCase() || '';
    const sku = product.sku?.toUpperCase() || '';

    if (cached && cached.length > 0) {
      for (const wh of cached) {
        const prefix = (wh.prefix || '').toLowerCase();
        const skuPrefix = (wh.skuPrefix || '').toUpperCase();
        if ((prefix && blId.startsWith(prefix)) || (skuPrefix && sku.startsWith(skuPrefix))) {
          return { id: wh.key, prefix: wh.prefix, displayName: wh.warehouseDisplayName || `Magazyn ${wh.location || wh.name}` };
        }
      }
    }
    return null;
  }

  /**
   * Get all brands with product counts
   */
  async getBrands(): Promise<{ name: string; slug: string; count: number }[]> {
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        price: { gt: 0 },
        variants: { some: { inventory: { some: { quantity: { gt: 0 } } } } },
        AND: [
          { tags: { hasSome: DELIVERY_TAGS } },
          { category: { baselinkerCategoryId: { not: null } } },
          PACKAGE_FILTER_WHERE,
        ],
      },
      select: { specifications: true, manufacturer: { select: { name: true, slug: true } } },
    });

    const brandCounts: Record<string, number> = {};
    const brandSlugs: Record<string, string> = {};
    products.forEach((product) => {
      // Prefer manufacturer relation, fallback to specifications.brand
      const mfr = product.manufacturer;
      const specs = product.specifications as Record<string, any> | null;
      const brandName = mfr?.name || specs?.brand;
      if (brandName) {
        brandCounts[brandName] = (brandCounts[brandName] || 0) + 1;
        if (mfr?.slug && !brandSlugs[brandName]) {
          brandSlugs[brandName] = mfr.slug;
        }
      }
    });

    return Object.entries(brandCounts)
      .map(([name, count]) => ({ name, slug: brandSlugs[name] || this.slugifyBrand(name), count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get brand info by slug
   */
  async getBrandBySlug(slug: string): Promise<{ name: string; slug: string; count: number } | null> {
    // First try to find manufacturer directly by slug in DB
    const manufacturer = await prisma.manufacturer.findUnique({
      where: { slug },
      select: { name: true, slug: true },
    });
    if (manufacturer) {
      const count = await prisma.product.count({
        where: {
          manufacturerId: { not: null },
          manufacturer: { slug },
          status: 'ACTIVE',
          price: { gt: 0 },
          variants: { some: { inventory: { some: { quantity: { gt: 0 } } } } },
          AND: [
            { tags: { hasSome: DELIVERY_TAGS } },
            { category: { baselinkerCategoryId: { not: null } } },
            PACKAGE_FILTER_WHERE,
          ],
        },
      });
      return { name: manufacturer.name, slug: manufacturer.slug, count };
    }
    // Fallback to old approach
    const brands = await this.getBrands();
    return brands.find(b => b.slug === slug) || null;
  }

  /**
   * Convert brand name to URL-safe slug
   */
  private slugifyBrand(text: string): string {
    const polishChars: Record<string, string> = {
      'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
      'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
      'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
      'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
    };
    let result = text.toString();
    for (const [polish, ascii] of Object.entries(polishChars)) {
      result = result.replace(new RegExp(polish, 'g'), ascii);
    }
    return result
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }
}

export const productsService = new ProductsService();