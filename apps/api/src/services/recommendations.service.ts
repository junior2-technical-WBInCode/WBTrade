/**
 * Recommendations Service
 * Provides personalized product recommendations based on user search history,
 * purchase history, and browsing behavior
 */

import { prisma } from '../db';

// Tags for products that can be shipped via paczkomat/courier
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
// Pattern to match "produkt w paczce X" tag
const PACKAGE_LIMIT_PATTERN = /produkt\s*w\s*paczce|produkty?\s*w\s*paczce/i;
// Tags that hide products completely
const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia ', 'nie wrzucać-zabronione'];
// Domeny zdjęć które blokują hotlinking - produkty z takimi zdjęciami nie będą wyświetlane
// b2b.leker.pl usunięte - produkty Leker ponownie widoczne, tag "błąd zdjęcia" filtruje wadliwe
const BLOCKED_IMAGE_DOMAINS: string[] = [];

/**
 * Check if product should be visible based on delivery tags, error tags, and image URL
 * Products with "Paczkomaty i Kurier" MUST also have "produkt w paczce" tag
 * Products with "błąd zdjęcia" are always hidden
 * Products with images from blocked domains are hidden
 */
function shouldProductBeVisible(tags: string[], imageUrl?: string | null): boolean {
  // Hide products with error tags
  const hasHiddenTag = tags.some(tag => 
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
  
  const hasPaczkomatTag = tags.some(tag => 
    PACZKOMAT_TAGS.some(pt => tag.toLowerCase() === pt.toLowerCase())
  );
  
  if (!hasPaczkomatTag) return true;
  
  return tags.some(tag => PACKAGE_LIMIT_PATTERN.test(tag));
}

interface RecommendedProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: { url: string; alt: string | null }[];
  category: { id: string; name: string } | null;
  score: number;
  reason: 'search' | 'category' | 'popular' | 'similar';
}

export class RecommendationsService {
  /**
   * Record a user's search query for recommendation purposes
   */
  async recordSearch(
    userId: string,
    query: string,
    categoryId?: string | null,
    resultsCount = 0
  ) {
    // Only record non-empty searches
    if (!query.trim()) return;

    await prisma.searchHistory.create({
      data: {
        userId,
        query: query.trim().toLowerCase(),
        categoryId: categoryId || undefined,
        resultsCount,
      },
    });

    // Clean up old search history (keep last 100 searches per user)
    const oldSearches = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 100,
      select: { id: true },
    });

    if (oldSearches.length > 0) {
      await prisma.searchHistory.deleteMany({
        where: {
          id: { in: oldSearches.map((s) => s.id) },
        },
      });
    }
  }

  /**
   * Get personalized recommendations for a user
   */
  async getRecommendations(userId: string, limit = 8): Promise<RecommendedProduct[]> {
    const recommendations: RecommendedProduct[] = [];
    const addedProductIds = new Set<string>();

    // 1. Get products matching recent search queries
    const recentSearches = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      distinct: ['query'],
    });

    if (recentSearches.length > 0) {
      const searchTerms = recentSearches.map((s) => s.query);
      
      // Find products matching search terms
      const searchProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 },
          NOT: { tags: { hasSome: HIDDEN_TAGS } },
          variants: {
            some: {
              inventory: {
                some: {
                  quantity: { gt: 0 }
                }
              }
            }
          },
          OR: searchTerms.flatMap((term) => [
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ]),
        },
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          category: true,
        },
        take: limit * 2, // Fetch more to account for filtering
      });

      for (const product of searchProducts) {
        // Skip products that should be hidden (Paczkomaty i Kurier without produkt w paczce, blocked images)
        if (!shouldProductBeVisible(product.tags, product.images[0]?.url)) continue;
        if (!addedProductIds.has(product.id)) {
          addedProductIds.add(product.id);
          recommendations.push({
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: Number(product.price),
            compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
            images: product.images.map((img) => ({ url: img.url, alt: img.alt })),
            category: product.category ? { id: product.category.id, name: product.category.name } : null,
            score: 100,
            reason: 'search',
          });
        }
      }
    }

    // 2. Get products from frequently searched categories
    const categorySearches = await prisma.searchHistory.groupBy({
      by: ['categoryId'],
      where: { userId, categoryId: { not: null } },
      _count: { categoryId: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: 5,
    });

    if (categorySearches.length > 0 && recommendations.length < limit) {
      const categoryIds = categorySearches
        .filter((c) => c.categoryId !== null)
        .map((c) => c.categoryId as string);

      const categoryProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 },
          categoryId: { in: categoryIds },
          id: { notIn: Array.from(addedProductIds) },
          NOT: { tags: { hasSome: HIDDEN_TAGS } },
          variants: {
            some: {
              inventory: {
                some: {
                  quantity: { gt: 0 }
                }
              }
            }
          },
        },
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          category: true,
        },
        take: limit - recommendations.length,
        orderBy: { createdAt: 'desc' },
      });

      for (const product of categoryProducts) {
        if (!addedProductIds.has(product.id)) {
          addedProductIds.add(product.id);
          recommendations.push({
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: Number(product.price),
            compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
            images: product.images.map((img) => ({ url: img.url, alt: img.alt })),
            category: product.category ? { id: product.category.id, name: product.category.name } : null,
            score: 80,
            reason: 'category',
          });
        }
      }
    }

    // 3. Get products similar to user's past orders
    const userOrders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { category: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (userOrders.length > 0 && recommendations.length < limit) {
      const orderedCategoryIds = new Set<string>();
      for (const order of userOrders) {
        for (const item of order.items) {
          if (item.variant?.product?.categoryId) {
            orderedCategoryIds.add(item.variant.product.categoryId);
          }
        }
      }

      if (orderedCategoryIds.size > 0) {
        const similarProducts = await prisma.product.findMany({
          where: {
            status: 'ACTIVE',
            price: { gt: 0 },
            categoryId: { in: Array.from(orderedCategoryIds) },
            id: { notIn: Array.from(addedProductIds) },
            NOT: { tags: { hasSome: HIDDEN_TAGS } },
            variants: {
              some: {
                inventory: {
                  some: {
                    quantity: { gt: 0 }
                  }
                }
              }
            },
          },
          include: {
            images: { orderBy: { order: 'asc' }, take: 1 },
            category: true,
          },
          take: (limit - recommendations.length) * 2, // Fetch more to account for filtering
          orderBy: { createdAt: 'desc' },
        });

        for (const product of similarProducts) {
          // Skip products that should be hidden (Paczkomaty i Kurier without produkt w paczce, blocked images)
          if (!shouldProductBeVisible(product.tags, product.images[0]?.url)) continue;
          if (!addedProductIds.has(product.id)) {
            addedProductIds.add(product.id);
            recommendations.push({
              id: product.id,
              name: product.name,
              slug: product.slug,
              price: Number(product.price),
              compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
              images: product.images.map((img) => ({ url: img.url, alt: img.alt })),
              category: product.category ? { id: product.category.id, name: product.category.name } : null,
              score: 70,
              reason: 'similar',
            });
          }
        }
      }
    }

    // 4. Fill remaining spots with popular products
    if (recommendations.length < limit) {
      const popularProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          price: { gt: 0 }, // Don't show products with price 0
          id: { notIn: Array.from(addedProductIds) },
          NOT: { tags: { hasSome: HIDDEN_TAGS } },
          variants: {
            some: {
              inventory: {
                some: {
                  quantity: { gt: 0 }
                }
              }
            }
          },
        },
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          category: true,
        },
        take: (limit - recommendations.length) * 2, // Fetch more to account for filtering
        orderBy: { createdAt: 'desc' },
      });

      for (const product of popularProducts) {
        // Skip products that should be hidden (Paczkomaty i Kurier without produkt w paczce, blocked images)
        if (!shouldProductBeVisible(product.tags, product.images[0]?.url)) continue;
        if (!addedProductIds.has(product.id)) {
          addedProductIds.add(product.id);
          recommendations.push({
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: Number(product.price),
            compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
            images: product.images.map((img) => ({ url: img.url, alt: img.alt })),
            category: product.category ? { id: product.category.id, name: product.category.name } : null,
            score: 50,
            reason: 'popular',
          });
        }
      }
    }

    // Sort by score and return
    return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get user's search history
   */
  async getSearchHistory(userId: string, limit = 10) {
    return prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Clear user's search history
   */
  async clearSearchHistory(userId: string) {
    await prisma.searchHistory.deleteMany({
      where: { userId },
    });
  }
}
