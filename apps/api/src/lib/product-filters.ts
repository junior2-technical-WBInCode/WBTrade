/**
 * Centralized product visibility filters
 * Used across all services to ensure consistent product filtering
 */

import { Prisma } from '@prisma/client';

// Tagi dostawy - produkty MUSZĄ mieć przynajmniej jeden z tych tagów żeby być widoczne
export const DELIVERY_TAGS = [
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
export const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
export const TYLKO_KURIER_TAGS = ['Tylko kurier', 'tylko kurier'];
export const PACKAGE_LIMIT_PATTERN = /produkt\s*w\s*paczce/i;
export const WEIGHT_TAGS = ['do 2 kg', 'do 5 kg', 'do 10 kg', 'do 20 kg', 'do 31,5 kg'];

/**
 * Check if a single product should be visible based on delivery tags
 * Rules:
 * 1. Product MUST have either "Paczkomaty i Kurier" OR "Tylko kurier" tag
 * 2. Products with "Paczkomaty i Kurier" MUST also have "produkt w paczce" tag
 * 3. Products with "Tylko kurier" MUST also have a weight tag (do X kg)
 */
export function shouldProductBeVisible(tags: string[]): boolean {
  // Check if product has paczkomat tag
  const hasPaczkomatTag = tags.some((tag: string) => 
    PACZKOMAT_TAGS.some(pt => tag.toLowerCase() === pt.toLowerCase())
  );
  
  // Check if product has "Tylko kurier" tag
  const hasTylkoKurierTag = tags.some((tag: string) => 
    TYLKO_KURIER_TAGS.some(tk => tag.toLowerCase() === tk.toLowerCase())
  );
  
  // Product MUST have either "Paczkomaty i Kurier" OR "Tylko kurier"
  if (!hasPaczkomatTag && !hasTylkoKurierTag) return false;
  
  // If has "Paczkomaty i Kurier" - must have "produkt w paczce" tag
  if (hasPaczkomatTag) {
    const hasPackageLimitTag = tags.some((tag: string) => 
      PACKAGE_LIMIT_PATTERN.test(tag)
    );
    if (!hasPackageLimitTag) return false;
  }
  
  // If has "Tylko kurier" - must have weight tag
  if (hasTylkoKurierTag) {
    const hasWeightTag = tags.some((tag: string) => 
      WEIGHT_TAGS.some(wt => tag.toLowerCase() === wt.toLowerCase())
    );
    if (!hasWeightTag) return false;
  }
  
  return true;
}

/**
 * Check if product has delivery tags (not just warehouse tags)
 */
export function hasDeliveryTags(tags: string[]): boolean {
  return tags.some(tag => 
    DELIVERY_TAGS.some(dt => tag.toLowerCase() === dt.toLowerCase())
  );
}

/**
 * Check if product has available stock > 0 (quantity minus reserved)
 */
export function hasStock(product: { variants?: Array<{ inventory?: Array<{ quantity: number; reserved?: number }> }> }): boolean {
  if (!product.variants) return false;
  return product.variants.some(v => 
    v.inventory?.some(inv => (inv.quantity - (inv.reserved || 0)) > 0)
  );
}

/**
 * Full visibility check for a product
 * Combines all visibility rules:
 * 1. Must have price > 0
 * 2. Must have stock > 0
 * 3. Must have delivery tags
 * 4. If has "Paczkomaty i Kurier", must also have "produkt w paczce"
 * 5. Must be in category with baselinkerCategoryId
 */
export function isProductFullyVisible(product: {
  price: number;
  tags: string[];
  variants?: Array<{ inventory?: Array<{ quantity: number; reserved?: number }> }>;
  category?: { baselinkerCategoryId?: string | null } | null;
}): boolean {
  // Must have price > 0
  if (!product.price || product.price <= 0) return false;
  
  // Must have stock > 0
  if (!hasStock(product)) return false;
  
  // Must have delivery tags
  if (!hasDeliveryTags(product.tags || [])) return false;
  
  // Must pass package visibility check
  if (!shouldProductBeVisible(product.tags || [])) return false;
  
  // Must be in category with baselinkerCategoryId
  if (!product.category?.baselinkerCategoryId) return false;
  
  return true;
}

/**
 * Filter array of products using full visibility rules
 */
export function filterVisibleProducts<T extends {
  price: number;
  tags: string[];
  variants?: Array<{ inventory?: Array<{ quantity: number; reserved?: number }> }>;
  category?: { baselinkerCategoryId?: string | null } | null;
}>(products: T[]): T[] {
  return products.filter(isProductFullyVisible);
}

/**
 * Filter transformed products (after transformProducts function)
 * These have different structure - totalStock instead of variants
 */
export function filterTransformedProducts<T extends {
  price: number;
  tags?: string[];
  totalStock?: number;
  category?: { baselinkerCategoryId?: string | null } | null;
}>(products: T[]): T[] {
  return products.filter(product => {
    // Must have price > 0
    if (!product.price || product.price <= 0) return false;
    
    // Must have stock > 0
    if (product.totalStock === undefined || product.totalStock <= 0) return false;
    
    // Must have delivery tags
    if (!hasDeliveryTags(product.tags || [])) return false;
    
    // Must pass package visibility check
    if (!shouldProductBeVisible(product.tags || [])) return false;
    
    // Must be in category with baselinkerCategoryId (if category info available)
    // Note: some transformed products might not have full category info
    if (product.category && !product.category.baselinkerCategoryId) return false;
    
    return true;
  });
}

// Tagi "produkt w paczce" - różne rozmiary paczek
export const PACKAGE_TAGS = [
  'produkt w paczce: 1',
  'produkt w paczce: 2',
  'produkt w paczce: 3',
  'produkt w paczce: 4',
  'produkt w paczce: 5',
];

/**
 * Base Prisma where clause for visible products
 * Use this in all product queries
 */
export const VISIBLE_PRODUCT_WHERE: Prisma.ProductWhereInput = {
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
    // Filtr "produkt w paczce": jeśli ma "Paczkomaty i Kurier" to MUSI mieć też "produkt w paczce"
    {
      OR: [
        { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
        { tags: { hasSome: PACKAGE_TAGS } },
      ]
    },
    // Filtr wagi: jeśli ma "Tylko kurier" to MUSI mieć też tag wagi (do X kg)
    {
      OR: [
        { NOT: { tags: { hasSome: TYLKO_KURIER_TAGS } } },
        { tags: { hasSome: WEIGHT_TAGS } },
      ]
    },
  ],
};

/**
 * Get visible product where clause with optional additional filters
 */
export function getVisibleProductWhere(additionalWhere?: Prisma.ProductWhereInput): Prisma.ProductWhereInput {
  if (!additionalWhere) return VISIBLE_PRODUCT_WHERE;
  
  return {
    AND: [
      VISIBLE_PRODUCT_WHERE,
      additionalWhere,
    ],
  };
}
