import { prisma } from '../db';
import { getCachedCategoryTree, setCachedCategoryTree } from '../lib/cache';

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

// Tagi wymagające "produkt w paczce"
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];

// Tagi "produkt w paczce" - różne rozmiary paczek
const PACKAGE_TAGS = [
  'produkt w paczce: 1',
  'produkt w paczce: 2',
  'produkt w paczce: 3',
  'produkt w paczce: 4',
  'produkt w paczce: 5',
];

// Domeny zdjęć które blokują hotlinking - produkty z takimi zdjęciami nie będą wyświetlane
// b2b.leker.pl usunięte - produkty Leker ponownie widoczne, tag "błąd zdjęcia" filtruje wadliwe
const BLOCKED_IMAGE_DOMAINS: string[] = [];
// Tagi które ukrywają produkty całkowicie
const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia ', 'nie wrzucać-zabronione'];

// Kategorie ukryte na stronie (nazwa lowercase)
const HIDDEN_CATEGORY_NAMES = [
  'do zrobienia',
  'kategoria tymczasowa',
  'hurtownia sportowa',
  'import z pmsport',
  'w przygotowaniu'
];

// Bazowy filtr dla widocznych produktów - MUSI BYĆ IDENTYCZNY jak w products.service.ts
const VISIBLE_PRODUCT_WHERE = {
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
  // Produkty MUSZĄ spełniać wszystkie warunki (AND)
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
    {
      OR: [
        { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
        { tags: { hasSome: PACKAGE_TAGS } },
      ]
    },
  ],
};

export interface CategoryWithChildren {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  image: string | null;
  order: number;
  isActive: boolean;
  children?: CategoryWithChildren[];
  productCount?: number;
}

export class CategoriesService {
  /**
   * Get all category IDs matching a slug — finds ALL categories whose slug CONTAINS
   * the search term (catches supplier-specific slugs like leker-zabawki-1234, btp-gadzety etc.)
   * and then recursively includes all their DB descendants.
   * MUST use same logic as products.service.ts getAllCategoryIds.
   */
  private async getAllMatchingCategoryIds(slug: string): Promise<string[]> {
    const prefixes = ['btp-', 'hp-', 'leker-', 'ikonka-'];

    // Find ALL matching categories: exact slug + supplier prefixes
    // NOTE: Do NOT use `contains` here — it causes false matches between unrelated
    // subcategories with similar names (e.g. "akcesoria" matching "akcesoria-sportowe")
    const matchingCategories = await prisma.category.findMany({
      where: {
        isActive: true,
        OR: [
          { slug },
          ...prefixes.map(prefix => ({
            slug: { startsWith: `${prefix}${slug}` }
          })),
        ],
      },
      select: { id: true },
    });

    if (matchingCategories.length === 0) return [];

    const categoryIds = matchingCategories.map(c => c.id);

    const getDescendants = async (parentIds: string[]): Promise<void> => {
      if (parentIds.length === 0) return;
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
   * Get all category IDs that have baselinkerCategoryId (valid Baselinker categories)
   */
  private async getBaselinkerCategoryIds(): Promise<Set<string>> {
    const categories = await prisma.category.findMany({
      where: { 
        baselinkerCategoryId: { not: null },
        isActive: true,
      },
      select: { id: true },
    });
    return new Set(categories.map(c => c.id));
  }

  /**
   * Count visible products for a category (using same filters as products listing)
   * Filtr SQL już uwzględnia warunek "produkt w paczce" przez VISIBLE_PRODUCT_WHERE
   */
  private async countVisibleProducts(categoryId: string): Promise<number> {
    // First check if this category has baselinkerCategoryId
    const validCategoryIds = await this.getBaselinkerCategoryIds();
    if (!validCategoryIds.has(categoryId)) {
      return 0;
    }

    return prisma.product.count({
      where: {
        ...VISIBLE_PRODUCT_WHERE,
        categoryId,
      },
    });
  }

  /**
   * Count visible products for multiple categories at once
   * Używa groupBy zamiast findMany dla wydajności — SQL COUNT zamiast ładowania tysięcy wierszy
   * Nadal filtruje produkty z zablokowanymi domenami obrazków (Leker) osobno
   */
  private async countVisibleProductsForCategories(categoryIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    
    // Only count products in categories that have baselinkerCategoryId
    const validCategoryIds = await this.getBaselinkerCategoryIds();
    const filteredCategoryIds = categoryIds.filter(id => validCategoryIds.has(id));
    
    if (filteredCategoryIds.length === 0) {
      return counts;
    }

    // Krok 1: Szybki COUNT z groupBy — nie ładuje wierszy do pamięci
    const groupedCounts = await prisma.product.groupBy({
      by: ['categoryId'],
      where: {
        categoryId: { in: filteredCategoryIds },
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
        tags: { hasSome: DELIVERY_TAGS },
        NOT: {
          tags: { hasSome: HIDDEN_TAGS }
        },
        OR: [
          { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
          { tags: { hasSome: PACKAGE_TAGS } },
        ],
      },
      _count: { id: true },
    });

    for (const group of groupedCounts) {
      if (group.categoryId) {
        counts.set(group.categoryId, group._count.id);
      }
    }

    // Krok 2: Odejmij produkty z zablokowanymi domenami obrazków
    // Pomijamy jeśli lista domen jest pusta
    if (BLOCKED_IMAGE_DOMAINS.length > 0) {
      const blockedProducts = await prisma.product.findMany({
        where: {
          categoryId: { in: filteredCategoryIds },
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
          tags: { hasSome: DELIVERY_TAGS },
          NOT: {
            tags: { hasSome: HIDDEN_TAGS }
          },
          OR: [
            { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
            { tags: { hasSome: PACKAGE_TAGS } },
          ],
          images: {
            some: {
              OR: BLOCKED_IMAGE_DOMAINS.map(domain => ({
                url: { contains: domain }
              }))
            }
          },
        },
        select: {
          categoryId: true,
        },
      });

      for (const product of blockedProducts) {
        if (product.categoryId && counts.has(product.categoryId)) {
          counts.set(product.categoryId, counts.get(product.categoryId)! - 1);
        }
      }
    }

    return counts;
  }

  /**
   * Calculate total product count including all descendants
   */
  private calculateTotalProductCount(category: CategoryWithChildren): number {
    let total = category.productCount || 0;
    if (category.children) {
      for (const child of category.children) {
        total += this.calculateTotalProductCount(child);
      }
    }
    return total;
  }

  /**
   * Get all categories in a tree structure
   * Now returns only categories from Baselinker (with baselinkerCategoryId)
   * Structure: main categories (parentId = null) with their subcategories
   */
  async getCategoryTree(): Promise<CategoryWithChildren[]> {
    // Get main categories from Baselinker (parentId = null, has baselinkerCategoryId)
    const mainCategories = await prisma.category.findMany({
      where: { 
        isActive: true,
        parentId: null,
        baselinkerCategoryId: { not: null }, // Only Baselinker categories
        name: { notIn: HIDDEN_CATEGORY_NAMES, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      include: {
        children: {
          where: { 
            isActive: true,
            name: { notIn: HIDDEN_CATEGORY_NAMES, mode: 'insensitive' },
          },
          orderBy: { name: 'asc' },
          include: {
            children: {
              where: { 
                isActive: true,
                name: { notIn: HIDDEN_CATEGORY_NAMES, mode: 'insensitive' },
              },
              orderBy: { name: 'asc' },
              include: {
                children: {
                  where: { isActive: true, name: { notIn: HIDDEN_CATEGORY_NAMES, mode: 'insensitive' } },
                  orderBy: { name: 'asc' },
                }
              }
            }
          }
        }
      }
    });

    // Collect all category IDs to count products
    const allCategoryIds: string[] = [];
    const collectIds = (cats: any[]) => {
      for (const cat of cats) {
        allCategoryIds.push(cat.id);
        if (cat.children) collectIds(cat.children);
      }
    };
    collectIds(mainCategories);

    // Get visible product counts for all categories at once
    const productCounts = await this.countVisibleProductsForCategories(allCategoryIds);

    // Transform to CategoryWithChildren format with correct counts
    const transformCategory = (cat: any): CategoryWithChildren => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId,
      image: cat.image,
      order: cat.order,
      isActive: cat.isActive,
      productCount: productCounts.get(cat.id) || 0,
      children: cat.children ? cat.children.map(transformCategory) : []
    });

    const rootCategories = mainCategories.map(transformCategory);

    // Calculate total product counts including descendants
    const updateProductCounts = (categories: CategoryWithChildren[]) => {
      for (const cat of categories) {
        if (cat.children && cat.children.length > 0) {
          updateProductCounts(cat.children);
          // Add children's products to parent count
          cat.productCount = (cat.productCount || 0) + cat.children.reduce(
            (sum, child) => sum + (child.productCount || 0), 0
          );
        }
      }
    };
    updateProductCounts(rootCategories);

    // Deduplicate categories with the same name (e.g. from different wholesalers)
    const deduplicateCategories = (cats: CategoryWithChildren[]): CategoryWithChildren[] => {
      const byName = new Map<string, CategoryWithChildren>();
      for (const cat of cats) {
        const existing = byName.get(cat.name);
        if (!existing) {
          byName.set(cat.name, { ...cat, children: cat.children ? [...cat.children] : undefined });
        } else {
          if (existing.slug.match(/-\d+$/) && !cat.slug.match(/-\d+$/)) {
            existing.slug = cat.slug;
            existing.id = cat.id;
          }
          existing.productCount = (existing.productCount || 0) + (cat.productCount || 0);
          if (cat.children && cat.children.length > 0) {
            if (!existing.children) {
              existing.children = [...cat.children];
            } else {
              existing.children = existing.children.concat(cat.children);
            }
          }
        }
      }
      for (const cat of byName.values()) {
        if (cat.children && cat.children.length > 0) {
          cat.children = deduplicateCategories(cat.children);
        }
      }
      return Array.from(byName.values());
    };

    return deduplicateCategories(rootCategories);
  }

  /**
   * Get category by slug with children
   */
  async getCategoryBySlug(slug: string): Promise<CategoryWithChildren | null> {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { order: 'asc' },
              include: {
                children: {
                  where: { isActive: true },
                  orderBy: { order: 'asc' },
                }
              }
            }
          }
        },
        parent: true,
      }
    });

    if (!category) return null;

    // Collect all slugs from category + children + grandchildren + great-grandchildren
    const allNodes: { id: string; slug: string }[] = [{ id: category.id, slug: category.slug }];
    for (const child of category.children) {
      allNodes.push({ id: child.id, slug: child.slug });
      for (const grandchild of child.children) {
        allNodes.push({ id: grandchild.id, slug: grandchild.slug });
        for (const greatGrandchild of (grandchild as any).children || []) {
          allNodes.push({ id: greatGrandchild.id, slug: greatGrandchild.slug });
        }
      }
    }

    // Get expanded IDs for each slug (same logic as products.service.ts)
    const nodeExpanded = await Promise.all(
      allNodes.map(async node => ({
        id: node.id,
        expandedIds: await this.getAllMatchingCategoryIds(node.slug),
      }))
    );

    // Single product count query for all expanded IDs
    const allExpandedIds = new Set<string>();
    nodeExpanded.forEach(({ expandedIds }) => expandedIds.forEach(id => allExpandedIds.add(id)));
    const productCounts = await this.countVisibleProductsForCategories([...allExpandedIds]);

    // Build map: category DB-id → slug-based product count
    const nodeCountMap = new Map<string, number>();
    for (const { id, expandedIds } of nodeExpanded) {
      const count = expandedIds.reduce((sum, expandedId) => sum + (productCounts.get(expandedId) || 0), 0);
      nodeCountMap.set(id, count);
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      image: category.image,
      order: category.order,
      isActive: category.isActive,
      productCount: nodeCountMap.get(category.id) || 0,
      children: category.children.map(child => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
        parentId: child.parentId,
        image: child.image,
        order: child.order,
        isActive: child.isActive,
        productCount: nodeCountMap.get(child.id) || 0,
        children: child.children.map(grandchild => ({
          id: grandchild.id,
          name: grandchild.name,
          slug: grandchild.slug,
          parentId: grandchild.parentId,
          image: grandchild.image,
          order: grandchild.order,
          isActive: grandchild.isActive,
          productCount: nodeCountMap.get(grandchild.id) || 0,
          children: ((grandchild as any).children || []).map((greatGrandchild: any) => ({
            id: greatGrandchild.id,
            name: greatGrandchild.name,
            slug: greatGrandchild.slug,
            parentId: greatGrandchild.parentId,
            image: greatGrandchild.image,
            order: greatGrandchild.order,
            isActive: greatGrandchild.isActive,
            productCount: nodeCountMap.get(greatGrandchild.id) || 0,
          }))
        }))
      }))
    };
  }

  /**
   * Get category path (breadcrumb)
   */
  async getCategoryPath(slug: string): Promise<{ id: string; name: string; slug: string }[]> {
    const path: { id: string; name: string; slug: string }[] = [];
    
    let current = await prisma.category.findUnique({
      where: { slug },
      include: { parent: true }
    });

    while (current) {
      path.unshift({
        id: current.id,
        name: current.name,
        slug: current.slug,
      });
      
      if (current.parent) {
        current = await prisma.category.findUnique({
          where: { id: current.parentId! },
          include: { parent: true }
        });
      } else {
        current = null;
      }
    }

    return path;
  }

  /**
   * Get main (root) categories only
   * Filters by baselinkerCategoryId to return only Baselinker categories
   */
  async getMainCategories(): Promise<CategoryWithChildren[]> {
    // Sprawdź cache — kategorie rzadko się zmieniają
    const cached = await getCachedCategoryTree<CategoryWithChildren[]>();
    if (cached) {
      return cached;
    }

    const categories = await prisma.category.findMany({
      where: { 
        isActive: true,
        parentId: null,
        baselinkerCategoryId: { not: null } // Only Baselinker categories
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: { 
            isActive: true,
            baselinkerCategoryId: { not: null }
          },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
          include: {
            children: {
              where: { 
                isActive: true,
                baselinkerCategoryId: { not: null }
              },
              orderBy: [{ order: 'asc' }, { name: 'asc' }],
            }
          }
        }
      }
    });

    // Collect all category nodes (slug + id) from the tree
    const allCategoryNodes: { id: string; slug: string }[] = [];
    const collectNodes = (cats: any[]) => {
      for (const cat of cats) {
        allCategoryNodes.push({ id: cat.id, slug: cat.slug });
        if (cat.children) collectNodes(cat.children);
      }
    };
    collectNodes(categories);

    // For each slug, get ALL matching category IDs (same logic as products.service.ts)
    // This captures supplier-specific categories like leker-zabawki-1234 that aren't in the DB tree
    const slugExpandedIds = await Promise.all(
      allCategoryNodes.map(async node => ({
        id: node.id,
        expandedIds: await this.getAllMatchingCategoryIds(node.slug),
      }))
    );

    // Collect all unique IDs across all expansions for a single DB count query
    const allExpandedIds = new Set<string>();
    slugExpandedIds.forEach(({ expandedIds }) => expandedIds.forEach(id => allExpandedIds.add(id)));

    // Single product count query for all expanded IDs
    const productCounts = await this.countVisibleProductsForCategories([...allExpandedIds]);

    // Build map: category node DB-id → total product count across all its matching categories
    const nodeCountMap = new Map<string, number>();
    for (const { id, expandedIds } of slugExpandedIds) {
      const count = expandedIds.reduce((sum, expandedId) => sum + (productCounts.get(expandedId) || 0), 0);
      nodeCountMap.set(id, count);
    }

    // Transform categories using slug-based counts (no more directCount + childrenCount aggregation)
    const transformCategory = (cat: any, parentId: string | null = null): CategoryWithChildren => {
      const children = cat.children ? cat.children.map((child: any) => transformCategory(child, cat.id)) : [];
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        parentId: parentId,
        image: cat.image || null,
        order: cat.order || 0,
        isActive: cat.isActive ?? true,
        productCount: nodeCountMap.get(cat.id) || 0,
        children: children.length > 0 ? children : undefined
      };
    };

    const transformed = categories.map(cat => transformCategory(cat, null));

    // Deduplicate categories with the same name (e.g. from different wholesalers)
    // Merge product counts and children recursively
    const deduplicateCategories = (cats: CategoryWithChildren[]): CategoryWithChildren[] => {
      const byName = new Map<string, CategoryWithChildren>();
      for (const cat of cats) {
        const existing = byName.get(cat.name);
        if (!existing) {
          byName.set(cat.name, { ...cat, children: cat.children ? [...cat.children] : undefined });
        } else {
          // Prefer slug without "-1" suffix
          if (existing.slug.match(/-\d+$/) && !cat.slug.match(/-\d+$/)) {
            existing.slug = cat.slug;
            existing.id = cat.id;
          }
          // Sum product counts
          existing.productCount = (existing.productCount || 0) + (cat.productCount || 0);
          // Merge children
          if (cat.children && cat.children.length > 0) {
            if (!existing.children) {
              existing.children = [...cat.children];
            } else {
              existing.children = existing.children.concat(cat.children);
            }
          }
        }
      }
      // Recursively deduplicate children
      for (const cat of byName.values()) {
        if (cat.children && cat.children.length > 0) {
          cat.children = deduplicateCategories(cat.children);
        }
      }
      return Array.from(byName.values());
    };

    const result = deduplicateCategories(transformed);

    // Zapisz w cache na 30 minut
    await setCachedCategoryTree(result);

    return result;
  }

  /**
   * Get all categories (flat list for admin)
   */
  async getAllCategoriesFlat() {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { products: { where: { price: { gt: 0 } } }, children: true }
        }
      }
    });
  }

  /**
   * Create a new category
   */
  async createCategory(data: {
    name: string;
    slug: string;
    description?: string | null;
    image?: string | null;
    parentId?: string | null;
  }) {
    // Check if slug already exists
    const existingSlug = await prisma.category.findUnique({
      where: { slug: data.slug }
    });

    if (existingSlug) {
      throw new Error('Kategoria z tym slugiem już istnieje');
    }

    // Get the max order to add at the end
    const maxOrder = await prisma.category.aggregate({
      _max: { order: true }
    });

    return prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        image: data.image || null,
        parentId: data.parentId || null,
        order: (maxOrder._max.order || 0) + 1,
        isActive: true,
      },
      include: {
        _count: {
          select: { products: true, children: true }
        }
      }
    });
  }

  /**
   * Update an existing category
   */
  async updateCategory(id: string, data: {
    name?: string;
    slug?: string;
    description?: string | null;
    image?: string | null;
    parentId?: string | null;
  }) {
    // Check if category exists
    const existing = await prisma.category.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error('Kategoria nie została znaleziona');
    }

    // Check if new slug conflicts with another category
    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = await prisma.category.findUnique({
        where: { slug: data.slug }
      });
      if (slugConflict) {
        throw new Error('Kategoria z tym slugiem już istnieje');
      }
    }

    // Prevent setting parent to self or creating circular reference
    if (data.parentId === id) {
      throw new Error('Kategoria nie może być swoim własnym rodzicem');
    }

    return prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        image: data.image,
        parentId: data.parentId,
      },
      include: {
        _count: {
          select: { products: true, children: true }
        }
      }
    });
  }

  /**
   * Delete a category
   */
  async deleteCategory(id: string) {
    // Check if category exists
    const existing = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true, children: true }
        }
      }
    });

    if (!existing) {
      throw new Error('Kategoria nie została znaleziona');
    }

    // Set products in this category to have no category
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null }
    });

    // Move children to parent of deleted category (or make them root)
    await prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: existing.parentId }
    });

    // Delete the category
    return prisma.category.delete({
      where: { id }
    });
  }

  /**
   * Get category by ID
   */
  async getCategoryById(id: string) {
    return prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true, children: true }
        },
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });
  }
}

export const categoriesService = new CategoriesService();
