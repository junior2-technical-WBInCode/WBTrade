import { prisma } from '../db';
import { getProductsIndex, PRODUCTS_INDEX, meiliClient, isMeilisearchAvailable, markMeilisearchUnavailable, markMeilisearchAvailable, initializeMeilisearch } from '../lib/meilisearch';
import type { MultiSearchParams } from 'meilisearch';

// Tagi dostawy - produkty MUSZĄ mieć przynajmniej jeden z tych tagów żeby być widoczne
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

// Tags that require "produkt w paczce" tag to be visible
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
const PACKAGE_LIMIT_PATTERN = /produkt\s*w\s*paczce|produkty?\s*w\s*paczce/i;
// Tags that hide products completely
const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia ', 'nie wrzucać-zabronione'];
// Image domains that block hotlinking - products with these images are hidden
// b2b.leker.pl usunięte - produkty Leker ponownie widoczne, tag "błąd zdjęcia" filtruje wadliwe
const BLOCKED_IMAGE_DOMAINS: string[] = [];

/**
 * Check if product should be visible based on delivery tags, error tags, and image URL
 * Products with "Paczkomaty i Kurier" must also have "produkt w paczce" tag
 * Products with "błąd zdjęcia" are always hidden
 * Products with images from blocked domains are hidden
 */
function shouldProductBeVisible(tags: string[], imageUrl?: string | null): boolean {
  // Hide products with error tags
  const hasHiddenTag = tags.some((tag: string) => 
    HIDDEN_TAGS.some(ht => tag.toLowerCase() === ht.toLowerCase())
  );
  if (hasHiddenTag) return false;
  
  // Hide products with images from blocked domains
  if (imageUrl) {
    const hasBlockedImage = BLOCKED_IMAGE_DOMAINS.some(domain => 
      imageUrl.includes(domain)
    );
    if (hasBlockedImage) return false;
  }

  // Produkty MUSZĄ mieć przynajmniej jeden tag dostawy
  const hasDeliveryTag = tags.some((tag: string) =>
    DELIVERY_TAGS.some(dt => tag.toLowerCase() === dt.toLowerCase())
  );
  if (!hasDeliveryTag) return false;
  
  const hasPaczkomatTag = tags.some((tag: string) => 
    PACZKOMAT_TAGS.some(pt => tag.toLowerCase() === pt.toLowerCase())
  );
  
  if (!hasPaczkomatTag) return true;
  
  const hasPackageLimitTag = tags.some((tag: string) => 
    PACKAGE_LIMIT_PATTERN.test(tag)
  );
  
  return hasPackageLimitTag;
}

export interface MeiliProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  categoryId: string;
  categoryName: string;
  image: string | null;
  status: string;
  createdAt: number;
  hasBaselinkerCategory: boolean; // true if category has baselinkerCategoryId
  categoryIsActive: boolean; // true if category.isActive
  tags: string[];
  popularityScore: number;
  inStock: boolean;
}

export class SearchService {
  /**
   * Build common MeiliSearch filters for product visibility
   */
  private buildBaseFilters(minPrice?: number, maxPrice?: number): string {
    const filters: string[] = ['status = "ACTIVE"', 'price > 0'];
    filters.push('inStock = true');
    const deliveryTagsFilter = DELIVERY_TAGS.map(tag => `"${tag}"`).join(', ');
    filters.push(`tags IN [${deliveryTagsFilter}]`);
    filters.push('hasBaselinkerCategory = true');
    filters.push('categoryIsActive = true');
    if (minPrice !== undefined) {
      filters.push(`price >= ${minPrice}`);
    }
    if (maxPrice !== undefined) {
      filters.push(`price <= ${maxPrice}`);
    }
    return filters.join(' AND ');
  }

  /**
   * Merge MeiliSearch hits from multiple queries with deduplication.
   * Hits from earlier queries (full phrase) get priority over later ones (per-word).
   */
  private mergeHits<T extends { id: string }>(hitArrays: T[][], limit: number): T[] {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const hits of hitArrays) {
      for (const hit of hits) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        merged.push(hit);
        if (merged.length >= limit) return merged;
      }
    }
    return merged;
  }

  /**
   * Search products using Meilisearch with Prisma fallback.
   * For multi-word queries, performs parallel searches (full phrase + individual words)
   * and merges results — "Google-like" experience.
   */
  async search(query: string, minPrice?: number, maxPrice?: number, limit = 100) {
    // Skip Meilisearch entirely if it's known to be down
    if (!isMeilisearchAvailable()) {
      return this.searchWithPrisma(query, minPrice, maxPrice, limit);
    }

    try {
      const filter = this.buildBaseFilters(minPrice, maxPrice);
      const retrieveAttrs = ['id', 'name', 'slug', 'description', 'price', 'compareAtPrice', 'categoryName', 'image'];
      const words = query.split(/\s+/).filter(w => w.length > 0);

      let allHits: MeiliProduct[];
      let processingTimeMs = 0;

      if (words.length >= 2) {
        // Multi-search: full phrase + each word separately
        const queries = [
          // Full phrase first (highest priority)
          { indexUid: PRODUCTS_INDEX, q: query, limit: limit * 2, filter, matchingStrategy: 'last' as const, attributesToRetrieve: retrieveAttrs },
          // Then each individual word
          ...words.map(word => ({
            indexUid: PRODUCTS_INDEX, q: word, limit: Math.ceil(limit / words.length), filter, matchingStrategy: 'last' as const, attributesToRetrieve: retrieveAttrs,
          })),
        ];

        const multiResults = await meiliClient.multiSearch<MultiSearchParams, MeiliProduct>({ queries });
        markMeilisearchAvailable();

        processingTimeMs = Math.max(...(multiResults as any).results.map((r: any) => r.processingTimeMs));
        const hitArrays = (multiResults as any).results.map((r: any) => r.hits) as MeiliProduct[][];
        allHits = this.mergeHits(hitArrays, limit * 2);
      } else {
        // Single word — standard search
        const index = getProductsIndex();
        const results = await index.search<MeiliProduct>(query, {
          limit: limit * 2,
          filter,
          matchingStrategy: 'last',
          attributesToRetrieve: retrieveAttrs,
        });
        markMeilisearchAvailable();
        processingTimeMs = results.processingTimeMs;
        allHits = results.hits;
      }

      // If Meilisearch returned 0 hits, the index might be empty — fall back to Prisma
      if (allHits.length === 0) {
        const prismaResults = await this.searchWithPrisma(query, minPrice, maxPrice, limit);
        if (prismaResults.products.length > 0) {
          return prismaResults;
        }
        return { products: [], total: 0, processingTimeMs };
      }

      // Get product IDs to fetch tags and category status for filtering
      const productIds = allHits.map(hit => hit.id);
      const productsWithTags = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, tags: true, category: { select: { isActive: true } } },
      });
      const tagsMap = new Map(productsWithTags.map(p => [p.id, p.tags]));
      const inactiveCategoryIds = new Set(
        productsWithTags.filter(p => p.category?.isActive === false).map(p => p.id)
      );

      // Filter products based on visibility rules (including image URL check and category status)
      const visibleHits = allHits
        .filter(hit => !inactiveCategoryIds.has(hit.id) && shouldProductBeVisible(tagsMap.get(hit.id) || [], hit.image))
        .slice(0, limit);

      return {
        products: visibleHits.map((hit) => ({
          id: hit.id,
          name: hit.name,
          slug: hit.slug,
          description: hit.description,
          price: hit.price,
          compareAtPrice: hit.compareAtPrice,
          category: { name: hit.categoryName },
          images: hit.image ? [{ url: hit.image }] : [],
        })),
        total: visibleHits.length,
        processingTimeMs,
      };
    } catch (error) {
      console.error('Meilisearch search error, falling back to Prisma:', error);
      markMeilisearchUnavailable();
      return this.searchWithPrisma(query, minPrice, maxPrice, limit);
    }
  }

  /**
   * Fallback search using Prisma (when Meilisearch is unavailable)
   */
  private async searchWithPrisma(query: string, minPrice?: number, maxPrice?: number, limit = 100) {
    try {
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        price: { gt: 0 },
        // Musi mieć tag dostawy
        tags: { hasSome: DELIVERY_TAGS },
        // Musi mieć kategorię z Baselinker i aktywną
        category: { baselinkerCategoryId: { not: null }, isActive: true },
        // Musi być na stanie (dostępne)
        variants: await this.getStockCondition(),
        // Nie pokazuj produktów z tagami błędów + warunek paczkomatu
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        AND: [
          // Split query into words and match each one (AND logic)
          // so "butelka pusheen" matches products containing both words anywhere in name/sku
          ...query.split(/\s+/).filter(w => w.length > 0).map(word => ({
            OR: [
              { name: { contains: word, mode: 'insensitive' as const } },
              { sku: { contains: word, mode: 'insensitive' as const } },
            ],
          })),
          minPrice !== undefined ? { price: { gte: minPrice } } : {},
          maxPrice !== undefined ? { price: { lte: maxPrice } } : {},
        ],
      },
      include: {
        images: { orderBy: { order: 'asc' }, take: 1 },
        category: true,
      },
      take: Math.min(limit * 2, 200), // Fetch extra to account for filtering
    });

    // Filter products based on visibility rules (including image URL check)
    const visibleProducts = products.filter(p => 
      shouldProductBeVisible(p.tags, p.images[0]?.url)
    );

    // Map to consistent response format (same shape as Meilisearch path)
    const mapped = visibleProducts.slice(0, limit).map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: (p as any).description || '',
      price: Number(p.price),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
      category: { name: p.category?.name || '' },
      images: p.images?.length ? [{ url: p.images[0].url }] : [],
    }));

    return {
      products: mapped,
      total: mapped.length,
      processingTimeMs: 0,
    };
    } catch (error) {
      console.error('Prisma search fallback error:', error);
      // Return empty results instead of throwing
      return { products: [], total: 0, processingTimeMs: 0 };
    }
  }

  /**
   * Get all descendant category IDs for a given slug (including the category itself)
   */
  private async getAllCategoryIds(categorySlug: string): Promise<string[]> {
    const category = await prisma.category.findFirst({
      where: { slug: categorySlug, isActive: true },
      select: { id: true },
    });

    if (!category) return [];

    const categoryIds: string[] = [category.id];

    const getDescendants = async (parentIds: string[]): Promise<void> => {
      const children = await prisma.category.findMany({
        where: { parentId: { in: parentIds }, isActive: true },
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
   * Get search suggestions (autocomplete) using Meilisearch.
   * For multi-word queries, uses multiSearch to find results for each word.
   */
  async suggest(query: string, categorySlug?: string) {
    // Skip Meilisearch if it's known to be down
    if (!isMeilisearchAvailable()) {
      return this.suggestWithPrisma(query, categorySlug);
    }

    try {
      const filter = this.buildBaseFilters();
      let filterStr = filter;

      // If category slug provided, resolve to all descendant categoryIds and filter
      if (categorySlug) {
        const allCategoryIds = await this.getAllCategoryIds(categorySlug);
        if (allCategoryIds.length > 0) {
          const categoryFilter = allCategoryIds.map(id => `categoryId = "${id}"`).join(' OR ');
          filterStr = `${filter} AND (${categoryFilter})`;
        }
      }

      const retrieveAttrs = ['id', 'name', 'slug', 'image', 'price', 'categoryName'];
      const words = query.split(/\s+/).filter(w => w.length > 0);

      let allHits: MeiliProduct[];
      let processingTimeMs = 0;

      if (words.length >= 2) {
        // Multi-search: full phrase + each word separately
        const queries = [
          { indexUid: PRODUCTS_INDEX, q: query, limit: 20, filter: filterStr, matchingStrategy: 'last' as const, attributesToRetrieve: retrieveAttrs },
          ...words.map(word => ({
            indexUid: PRODUCTS_INDEX, q: word, limit: 10, filter: filterStr, matchingStrategy: 'last' as const, attributesToRetrieve: retrieveAttrs,
          })),
        ];

        const multiResults = await meiliClient.multiSearch<MultiSearchParams, MeiliProduct>({ queries });
        markMeilisearchAvailable();

        processingTimeMs = Math.max(...(multiResults as any).results.map((r: any) => r.processingTimeMs));
        const hitArrays = (multiResults as any).results.map((r: any) => r.hits) as MeiliProduct[][];
        allHits = this.mergeHits(hitArrays, 20);
      } else {
        const index = getProductsIndex();
        const results = await index.search<MeiliProduct>(query, {
          limit: 20,
          filter: filterStr,
          matchingStrategy: 'last',
          attributesToRetrieve: retrieveAttrs,
        });
        markMeilisearchAvailable();
        processingTimeMs = results.processingTimeMs;
        allHits = results.hits;
      }

      // If Meilisearch returned 0 hits, the index might be empty — fall back to Prisma
      if (allHits.length === 0) {
        const prismaResults = await this.suggestWithPrisma(query, categorySlug);
        if (prismaResults.products.length > 0) {
          return prismaResults;
        }
        // Both returned nothing — genuinely no results, still return categories
        const categoryWords = query.split(/\s+/).filter(w => w.length > 0);
        const categories = await prisma.category.findMany({
          where: { isActive: true, AND: categoryWords.map(word => ({ name: { contains: word, mode: 'insensitive' } })) },
          select: { id: true, name: true, slug: true },
          take: 3,
        });
        return {
          products: [],
          categories: categories.map((c) => ({ type: 'category' as const, ...c })),
          processingTimeMs,
        };
      }

      // Get product IDs to fetch tags and category status from database
      const productIds = allHits.map(hit => hit.id);
      
      // Fetch tags and category for these products
      const productsWithTags = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, tags: true, category: { select: { isActive: true } } },
      });
      
      const tagsMap = new Map(productsWithTags.map(p => [p.id, p.tags]));
      const inactiveCategoryIds = new Set(
        productsWithTags.filter(p => p.category?.isActive === false).map(p => p.id)
      );
      
      // Filter products based on delivery tag rules, image URL, and category status
      const filteredHits = allHits.filter(hit => {
        if (inactiveCategoryIds.has(hit.id)) return false;
        const tags = tagsMap.get(hit.id) || [];
        return shouldProductBeVisible(tags, hit.image);
      }).slice(0, 8); // Limit to 8 after filtering

      // Also get category suggestions from Prisma
      const categoryWords = query.split(/\s+/).filter(w => w.length > 0);
      const categories = await prisma.category.findMany({
        where: {
          isActive: true,
          AND: categoryWords.map(word => ({ name: { contains: word, mode: 'insensitive' } })),
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        take: 3,
      });

      return {
        products: filteredHits.map((hit) => ({
          type: 'product' as const,
          id: hit.id,
          name: hit.name,
          slug: hit.slug,
          price: hit.price,
          image: hit.image,
          categoryName: hit.categoryName,
        })),
        categories: categories.map((c) => ({
          type: 'category' as const,
          ...c,
        })),
        processingTimeMs,
      };
    } catch (error) {
      console.error('Meilisearch suggest error, falling back to Prisma:', error);
      markMeilisearchUnavailable();
      return this.suggestWithPrisma(query, categorySlug);
    }
  }

  /**
   * Fallback suggestions using Prisma
   */
  private async suggestWithPrisma(query: string, categorySlug?: string) {
    try {
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        price: { gt: 0 },
        // Split query into words and match each one (AND logic)
        // so "butelka pusheen" matches products containing both words anywhere in name
        AND: query.split(/\s+/).filter(w => w.length > 0).map(word => ({
          name: { contains: word, mode: 'insensitive' as const },
        })),
        // Musi mieć tag dostawy
        tags: { hasSome: DELIVERY_TAGS },
        // Musi mieć kategorię z Baselinker i aktywną
        category: { baselinkerCategoryId: { not: null }, isActive: true },
        // Musi być na stanie (dostępne)
        variants: await this.getStockCondition(),
        // Nie pokazuj produktów z tagami błędów
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        ...(categorySlug ? { categoryId: { in: await this.getAllCategoryIds(categorySlug) } } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        tags: true,
        images: { orderBy: { order: 'asc' }, take: 1 },
        category: { select: { name: true } },
      },
      take: 20, // Fetch more to account for filtering
    });

    // Filter products based on delivery tag rules and image URL
    const filteredProducts = products.filter(p => 
      shouldProductBeVisible(p.tags, p.images[0]?.url)
    ).slice(0, 8);

    const catWords = query.split(/\s+/).filter(w => w.length > 0);
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
        AND: catWords.map(word => ({ name: { contains: word, mode: 'insensitive' } })),
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      take: 3,
    });

    return {
      products: filteredProducts.map((p) => ({
        type: 'product' as const,
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        image: p.images[0]?.url || null,
        categoryName: p.category?.name || null,
      })),
      categories: categories.map((c) => ({
        type: 'category' as const,
        ...c,
      })),
      processingTimeMs: 0,
    };
    } catch (error) {
      console.error('Prisma suggest fallback error:', error);
      return { products: [], categories: [], processingTimeMs: 0 };
    }
  }

  /**
   * Index all products to Meilisearch
   */
  async reindexAllProducts(): Promise<{ indexed: number; taskUid: number }> {
    // Re-initialize Meilisearch settings in case it was restarted
    await initializeMeilisearch();

    const BATCH_SIZE = 1000;
    const index = getProductsIndex();
    const totalProducts = await prisma.product.count({ where: { price: { gt: 0 } } });
    const totalBatches = Math.ceil(totalProducts / BATCH_SIZE);
    let indexedCount = 0;
    let lastTaskUid = 0;

    for (let batch = 0; batch < totalBatches; batch++) {
      const products = await prisma.product.findMany({
        where: { price: { gt: 0 } },
        skip: batch * BATCH_SIZE,
        take: BATCH_SIZE,
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          category: true,
          variants: { include: { inventory: true } },
        },
      });

      const documents: MeiliProduct[] = products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description || '',
        sku: product.sku,
        price: Number(product.price),
        compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
        categoryId: product.categoryId || '',
        categoryName: product.category?.name || '',
        image: product.images[0]?.url || null,
        status: product.status,
        createdAt: product.createdAt.getTime(),
        hasBaselinkerCategory: !!product.category?.baselinkerCategoryId,
        categoryIsActive: product.category?.isActive !== false,
        tags: product.tags || [],
        popularityScore: product.popularityScore || 0,
        inStock: product.variants.some(v => v.inventory.some(i => (i.quantity - i.reserved) > 0)),
      }));

      const task = await index.addDocuments(documents);
      lastTaskUid = task.taskUid;
      indexedCount += documents.length;
      console.log(`  Reindex batch ${batch + 1}/${totalBatches}: ${indexedCount}/${totalProducts} products`);
    }

    return {
      indexed: indexedCount,
      taskUid: lastTaskUid,
    };
  }

  /**
   * Index a single product (for use after product creation/update)
   */
  async indexProduct(productId: string): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: { orderBy: { order: 'asc' }, take: 1 },
        category: true,
        variants: { include: { inventory: true } },
      },
    });

    if (!product) return;

    const document: MeiliProduct = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description || '',
      sku: product.sku,
      price: Number(product.price),
      compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
      categoryId: product.categoryId || '',
      categoryName: product.category?.name || '',
      image: product.images[0]?.url || null,
      status: product.status,
      createdAt: product.createdAt.getTime(),
      hasBaselinkerCategory: !!product.category?.baselinkerCategoryId,
      categoryIsActive: product.category?.isActive !== false,
      tags: product.tags || [],
      popularityScore: product.popularityScore || 0,
      inStock: product.variants.some(v => v.inventory.some(i => (i.quantity - i.reserved) > 0)),
    };

    const index = getProductsIndex();
    await index.addDocuments([document]);
  }

  /**
   * Remove a product from Meilisearch index
   */
  async removeProductFromIndex(productId: string): Promise<void> {
    const index = getProductsIndex();
    await index.deleteDocument(productId);
  }

  /**
   * Alias for removeProductFromIndex (used by queue worker)
   */
  async deleteProduct(productId: string): Promise<void> {
    return this.removeProductFromIndex(productId);
  }

  /**
   * Alias for reindexAllProducts (used by queue worker)
   */
  async indexAllProducts(): Promise<{ indexed: number; taskUid: number }> {
    return this.reindexAllProducts();
  }

  /**
   * Get Meilisearch index stats
   */
  async getIndexStats() {
    try {
      const index = getProductsIndex();
      const stats = await index.getStats();
      const health = await meiliClient.health();
      
      return {
        healthy: health.status === 'available',
        numberOfDocuments: stats.numberOfDocuments,
        isIndexing: stats.isIndexing,
      };
    } catch (error) {
      return {
        healthy: false,
        numberOfDocuments: 0,
        isIndexing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async getPhantomVariantIds(): Promise<string[]> {
    const phantomVariants = await prisma.$queryRaw<Array<{ variant_id: string }>>`
      SELECT variant_id AS "variant_id" FROM inventory WHERE quantity > 0 AND quantity <= reserved
    `;
    return phantomVariants.map(v => v.variant_id);
  }

  private async getStockCondition(): Promise<any> {
    const phantomVariantIds = await this.getPhantomVariantIds();
    if (phantomVariantIds.length > 0) {
      return {
        some: {
          id: { notIn: phantomVariantIds },
          inventory: {
            some: {
              quantity: { gt: 0 }
            }
          }
        }
      };
    }
    return {
      some: {
        inventory: {
          some: {
            quantity: { gt: 0 }
          }
        }
      }
    };
  }
}