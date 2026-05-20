/**
 * Shipping Calculator Service
 * 
 * Calculates shipping costs based on product tags.
 * 
 * Rules:
 * 1. GABARYT (oversized) - Each oversized product requires individual shipping, costs are summed
 * 2. WYSYLKA_GABARYT - Forced shipping method for oversized products
 * 3. HURTOWNIA (wholesaler) - Products from different wholesalers are shipped separately
 * 4. Non-oversized from same wholesaler - Packed together as one shipment
 * 5. Paczkomat limits - Tags like "X produktów w paczce" define package limits
 * 6. Gabaryt + non-gabaryt - Two separate shipments (costs sum up)
 */

import { prisma } from '../db';
import { wholesalerConfigService } from './wholesaler-config.service';

// Tag patterns for matching (WHOLESALER pattern is built dynamically)
let _wholesalerRegex: RegExp | null = null;
let _wholesalerRegexTime = 0;
const REGEX_CACHE_TTL = 60_000;

async function getWholesalerRegex(): Promise<RegExp> {
  if (_wholesalerRegex && Date.now() - _wholesalerRegexTime < REGEX_CACHE_TTL) {
    return _wholesalerRegex;
  }
  _wholesalerRegex = await wholesalerConfigService.buildWholesalerRegex();
  _wholesalerRegexTime = Date.now();
  return _wholesalerRegex;
}

const TAG_PATTERNS = {
  // Matches "gabaryt" or price-prefixed tags like "149.00 Gabaryt" or "249 gabaryt"
  GABARYT: /^((\d+(?:\.\d{2})?)\s*)?gabaryt$/i,
  // Matches "tylko kurier" tags
  TYLKO_KURIER: /^tylko\s*kurier$/i,
  // WHOLESALER pattern is now dynamic — use getWholesalerRegex()
  // Matches paczkomat limit tags like "produkt w paczce: 3" or "3 produkty w paczce"
  PACZKOMAT_LIMIT: /^(?:produkt\s*w\s*paczce[:\s]*(\d+)|(\d+)\s*produkt(?:y|ów)?\s*w\s*paczce)$/i,
  // Matches tags that indicate courier-only delivery
  COURIER_ONLY: /^(tylko\s*kurier)$/i,
  // Matches tags that indicate paczkomat is available
  PACZKOMAT_AVAILABLE: /^(paczkomaty?\s*(i\s*kurier)?|paczkomat)$/i,
  // Matches tags that restrict shipping to InPost only (Paczkomat + Kurier InPost)
  INPOST_ONLY: /^paczkomaty?\s*i\s*kurier$/i,
  // Matches weight tags like "do 10 kg" or "do 31,5 kg"
  WEIGHT_KG: /^do\s*(\d+(?:[,\.]\d+)?)\s*kg$/i,
} as const;

// Shipping method prices (in PLN)
export const SHIPPING_PRICES = {
  inpost_paczkomat: 15.99,
  inpost_kurier: 19.99,
  dpd_kurier: 19.99, // DPD Kurier price
  gabaryt_base: 49.99,
  wysylka_gabaryt: 79.99,
} as const;

// Weight-based shipping prices for "Tylko kurier" products (brutto)
// Wszystkie wagi do 20 kg włącznie = 25.99 zł
// Waga do 31.5 kg = 28.99 zł
export const WEIGHT_SHIPPING_PRICES = {
  2: 25.99,    // do 2 kg
  5: 25.99,    // do 5 kg
  10: 25.99,   // do 10 kg
  20: 25.99,   // do 20 kg
  31.5: 28.99, // do 31,5 kg
} as const;

// Free shipping threshold per warehouse (in PLN)
export const FREE_SHIPPING_THRESHOLD = 300;

// Wholesaler to warehouse display name mapping (loaded dynamically)
let _wholesalerToWarehouse: Record<string, string> | null = null;
let _wholesalerMapTime = 0;

async function getWholesalerToWarehouse(): Promise<Record<string, string>> {
  if (_wholesalerToWarehouse && Date.now() - _wholesalerMapTime < REGEX_CACHE_TTL) {
    return _wholesalerToWarehouse;
  }
  _wholesalerToWarehouse = await wholesalerConfigService.getWholesalerToWarehouseMap();
  _wholesalerMapTime = Date.now();
  return _wholesalerToWarehouse;
}

async function getWarehouseName(wholesaler: string | null | undefined): Promise<string> {
  if (!wholesaler) return 'Magazyn Chynów';
  const map = await getWholesalerToWarehouse();
  return map[wholesaler] || 'Magazyn Chynów';
}

export interface CartItemForShipping {
  variantId: string;
  quantity: number;
}

export interface ProductWithTags {
  id: string;
  name: string;
  tags: string[];
  image?: string;
}

export interface ShippingPackageItem {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  isGabaryt: boolean;
  gabarytPrice?: number;
  weightShippingPrice?: number; // Price based on weight tag (e.g., "do 10 kg")
  productImage?: string;
}

export interface ShippingPackage {
  id: string;
  type: 'standard' | 'gabaryt';
  wholesaler: string | null;
  items: ShippingPackageItem[];
  paczkomatPackageCount: number;
  gabarytPrice?: number;
  weightShippingPrice?: number; // Highest weight-based price in this package
  isPaczkomatAvailable: boolean;
  isInPostOnly: boolean; // When true, only InPost (Paczkomat + Kurier InPost) - no DPD
  isCourierOnly: boolean; // When true, only DPD Kurier - no InPost (tag "Tylko kurier")
  isOutlet: boolean; // When true, personal pickup (Outlet) option is available - for Rzeszów/Outlet warehouse
  warehouseValue: number; // Total value of products from this warehouse
  hasFreeShipping: boolean; // True if warehouse value >= FREE_SHIPPING_THRESHOLD
}

export interface ShippingMethodForPackage {
  id: string;
  name: string;
  price: number;
  available: boolean;
  message?: string;
  estimatedDelivery: string;
}

export interface PackageWithShippingOptions {
  package: ShippingPackage;
  shippingMethods: ShippingMethodForPackage[];
  selectedMethod?: string;
}

export interface ShippingCalculationResult {
  packages: ShippingPackage[];
  totalPackages: number;
  totalPaczkomatPackages: number;
  shippingCost: number;
  paczkomatCost: number;
  breakdown: Array<{
    description: string;
    cost: number;
    packageCount: number;
  }>;
  warnings: string[];
  isPaczkomatAvailable: boolean;
}

/**
 * Check if product has gabaryt tag (oversized)
 * Tag format: "gabaryt" or "149.99 Gabaryt" (with price)
 * Gabaryt = only "Wysyłka gabaryt" option available
 */
function isGabaryt(tags: string[]): boolean {
  return tags.some(tag => TAG_PATTERNS.GABARYT.test(tag));
}

/**
 * Check if product has "Tylko kurier" tag
 * When true, only DPD Kurier is available (no InPost paczkomat, no InPost kurier)
 */
function isCourierOnly(tags: string[]): boolean {
  return tags.some(tag => TAG_PATTERNS.TYLKO_KURIER.test(tag));
}

/**
 * Get gabaryt shipping price from tag (e.g., "149.00 Gabaryt" returns 149)
 */
function getGabarytPrice(tags: string[]): number | null {
  for (const tag of tags) {
    const match = tag.match(TAG_PATTERNS.GABARYT);
    if (match && match[2]) {
      const price = parseFloat(match[2]);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }
  return null;
}

/**
 * Get wholesaler from product tags
 * Priority: Rzeszów/Outlet > other wholesalers (for outlet products shipped from Rzeszów)
 */
async function getWholesaler(tags: string[]): Promise<string | null> {
  // First check for Rzeszów/Outlet - these have priority over other wholesalers
  for (const tag of tags) {
    if (/^(Rzeszów|Outlet)$/i.test(tag)) {
      return tag;
    }
  }
  
  // Then check for other wholesaler tags using dynamic regex
  const wholesalerRegex = await getWholesalerRegex();
  for (const tag of tags) {
    const match = tag.match(wholesalerRegex);
    if (match) {
      return match[2] || match[1] || tag;
    }
  }
  return null;
}

/**
 * Get paczkomat limit from product tags
 * Supports formats: "produkt w paczce: 3" or "3 produkty w paczce"
 */
function getPaczkomatLimit(tags: string[]): number {
  for (const tag of tags) {
    const match = tag.match(TAG_PATTERNS.PACZKOMAT_LIMIT);
    if (match) {
      // match[1] is from "produkt w paczce: X" format
      // match[2] is from "X produkty w paczce" format
      const limit = parseInt(match[1] || match[2], 10);
      if (!isNaN(limit) && limit > 0) {
        return limit;
      }
    }
  }
  return 1; // Default: each product = 1 package (safest assumption)
}

/**
 * Check if product has "Paczkomaty i Kurier" tag (InPost only)
 * When true, only InPost Paczkomat and Kurier InPost shipping methods are available
 */
function isInPostOnly(tags: string[]): boolean {
  return tags.some(tag => TAG_PATTERNS.INPOST_ONLY.test(tag));
}

/**
 * Check if product is from Outlet/Rzeszów warehouse
 * Products from this warehouse have personal pickup option available
 */
function isOutletProduct(wholesaler: string | null): boolean {
  if (!wholesaler) return false;
  const lowerWholesaler = wholesaler.toLowerCase();
  return lowerWholesaler === 'rzeszów' || lowerWholesaler === 'outlet';
}

/**
 * Calculate number of packages needed using First-Fit Decreasing (FFD) bin-packing algorithm.
 * 
 * Each product with "produkt w paczce: N" tag takes 1/N of package capacity.
 * Package capacity is 1.0. Items are indivisible.
 * 
 * This only applies to products with "Paczkomaty i Kurier" tag.
 * Products with different limits can be combined in the same package.
 * 
 * Examples:
 * - 1×(paczka:3) + 2×(paczka:4) = 0.333 + 0.5 = 0.833 → 1 package
 * - 2×(paczka:3) + 2×(paczka:4) = 0.667 + 0.5 = 1.167 → 2 packages
 * - 3×(paczka:1) → 3 packages (each takes full capacity)
 */
function calculatePackageCount(items: Array<{ tags: string[]; quantity: number }>): number {
  // Expand items to individual units with their fractional sizes
  const units: number[] = [];
  
  for (const item of items) {
    // Only count items with "Paczkomaty i Kurier" tag
    if (!isInPostOnly(item.tags)) {
      continue;
    }
    
    const limit = getPaczkomatLimit(item.tags);
    const fractionPerUnit = 1 / limit;
    
    // Add each unit as a separate entry
    for (let i = 0; i < item.quantity; i++) {
      units.push(fractionPerUnit);
    }
  }
  
  if (units.length === 0) {
    return 0;
  }
  
  // Sort units in descending order (First-Fit Decreasing)
  units.sort((a, b) => b - a);
  
  // Pack units into packages (each package has capacity 1.0)
  const packages: number[] = [];
  
  for (const unitSize of units) {
    let fitted = false;
    
    // Try to fit in existing package
    for (let i = 0; i < packages.length; i++) {
      // Use small epsilon for floating point comparison
      if (packages[i] + unitSize <= 1.0 + 0.0001) {
        packages[i] += unitSize;
        fitted = true;
        break;
      }
    }
    
    // If doesn't fit anywhere, create new package
    if (!fitted) {
      packages.push(unitSize);
    }
  }
  
  return packages.length;
}

/**
 * Pack items into bins using FFD algorithm and return item assignments.
 * Returns array of bins, each bin contains array of items with their quantities.
 * 
 * This is used to split products into separate paczkomat packages for display.
 */
interface PackedItem {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  productImage?: string;
}

interface PackedBin {
  items: PackedItem[];
  totalFraction: number;
}

function packItemsIntoBins(
  items: Array<{
    product: { id: string; name: string; tags: string[]; image?: string };
    variantId: string;
    quantity: number;
  }>
): PackedBin[] {
  // Create units with product info
  interface UnitInfo {
    productId: string;
    productName: string;
    variantId: string;
    productImage?: string;
    fraction: number;
  }
  
  const units: UnitInfo[] = [];
  
  for (const item of items) {
    // Only pack items with "Paczkomaty i Kurier" tag
    if (!isInPostOnly(item.product.tags)) {
      continue;
    }
    
    const limit = getPaczkomatLimit(item.product.tags);
    const fraction = 1 / limit;
    
    // Add each unit separately
    for (let i = 0; i < item.quantity; i++) {
      units.push({
        productId: item.product.id,
        productName: item.product.name,
        variantId: item.variantId,
        productImage: item.product.image,
        fraction,
      });
    }
  }
  
  if (units.length === 0) {
    return [];
  }
  
  // Sort by fraction descending (FFD)
  units.sort((a, b) => b.fraction - a.fraction);
  
  // Pack into bins
  const bins: { units: UnitInfo[]; totalFraction: number }[] = [];
  
  for (const unit of units) {
    let fitted = false;
    
    for (const bin of bins) {
      if (bin.totalFraction + unit.fraction <= 1.0 + 0.0001) {
        bin.units.push(unit);
        bin.totalFraction += unit.fraction;
        fitted = true;
        break;
      }
    }
    
    if (!fitted) {
      bins.push({ units: [unit], totalFraction: unit.fraction });
    }
  }
  
  // Convert to PackedBin format - aggregate units by product
  return bins.map(bin => {
    const itemMap = new Map<string, PackedItem>();
    
    for (const unit of bin.units) {
      const key = unit.variantId;
      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity++;
      } else {
        itemMap.set(key, {
          productId: unit.productId,
          productName: unit.productName,
          variantId: unit.variantId,
          quantity: 1,
          productImage: unit.productImage,
        });
      }
    }
    
    return {
      items: Array.from(itemMap.values()),
      totalFraction: bin.totalFraction,
    };
  });
}

/**
 * Get weight from product tags (e.g., "do 10 kg" returns 10)
 */
function getWeightKg(tags: string[]): number | null {
  for (const tag of tags) {
    const match = tag.match(TAG_PATTERNS.WEIGHT_KG);
    if (match && match[1]) {
      // Replace comma with dot for parsing (e.g., "31,5" -> "31.5")
      const weight = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(weight) && weight > 0) {
        return weight;
      }
    }
  }
  return null;
}

/**
 * Get shipping price based on product weight
 * Returns the appropriate price tier based on weight tag
 */
function getWeightShippingPrice(tags: string[]): number | null {
  const weight = getWeightKg(tags);
  if (weight === null) return null;
  
  // Find the appropriate price tier
  const tiers = [2, 5, 10, 20, 31.5];
  for (const tier of tiers) {
    if (weight <= tier) {
      return WEIGHT_SHIPPING_PRICES[tier as keyof typeof WEIGHT_SHIPPING_PRICES];
    }
  }
  // If weight exceeds all tiers, return the highest tier price
  return WEIGHT_SHIPPING_PRICES[31.5];
}

/**
 * Check if product has weight tag (should use weight-based shipping)
 */
function hasWeightTag(tags: string[]): boolean {
  return tags.some(tag => TAG_PATTERNS.WEIGHT_KG.test(tag));
}

export class ShippingCalculatorService {
  /**
   * Calculate shipping for cart items
   */
  async calculateShipping(items: CartItemForShipping[]): Promise<ShippingCalculationResult> {
    const warnings: string[] = [];
    const packages: ShippingPackage[] = [];
    
    // Fetch products with tags, images, and prices
    const variantIds = items.map(item => item.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            tags: true,
            price: true,
            images: {
              take: 1,
              orderBy: { order: 'asc' },
              select: { url: true },
            },
          },
        },
      },
    });
    
    const variantToProduct = new Map<string, ProductWithTags & { image?: string; price: number }>();
    for (const variant of variants) {
      variantToProduct.set(variant.id, {
        id: variant.product.id,
        name: variant.product.name,
        tags: variant.product.tags,
        image: variant.product.images[0]?.url,
        price: Number(variant.product.price) || 0,
      });
    }
    
    // Categorize items
    const gabarytItems: Array<{ product: ProductWithTags & { price: number }; variantId: string; quantity: number }> = [];
    // Group by wholesaler only - shipping restrictions will be determined per package
    const standardItemsByWholesaler = new Map<string, Array<{ product: ProductWithTags & { price: number }; variantId: string; quantity: number }>>();
    
    for (const item of items) {
      const product = variantToProduct.get(item.variantId);
      if (!product) {
        warnings.push(`Nie znaleziono produktu dla wariantu ${item.variantId}`);
        continue;
      }
      
      const tags = product.tags || [];
      const productIsGabaryt = isGabaryt(tags);
      const wholesaler = await getWholesaler(tags) || 'default';
      
      if (productIsGabaryt) {
        gabarytItems.push({ product, variantId: item.variantId, quantity: item.quantity });
      } else {
        if (!standardItemsByWholesaler.has(wholesaler)) {
          standardItemsByWholesaler.set(wholesaler, []);
        }
        standardItemsByWholesaler.get(wholesaler)!.push({
          product,
          variantId: item.variantId,
          quantity: item.quantity,
        });
      }
    }
    
    // Calculate total value per warehouse (for free shipping calculation)
    // Includes both gabaryt and standard items
    // First aggregate by wholesaler tag, then combine by physical warehouse
    const valueByWholesaler = new Map<string, number>();
    
    for (const item of gabarytItems) {
      const wholesaler = await getWholesaler(item.product.tags) || 'default';
      const itemValue = item.product.price * item.quantity;
      const currentValue = valueByWholesaler.get(wholesaler) || 0;
      valueByWholesaler.set(wholesaler, currentValue + itemValue);
    }
    
    for (const [wholesaler, groupItems] of standardItemsByWholesaler) {
      let totalValue = 0;
      for (const item of groupItems) {
        totalValue += item.product.price * item.quantity;
      }
      const currentValue = valueByWholesaler.get(wholesaler) || 0;
      valueByWholesaler.set(wholesaler, currentValue + totalValue);
    }
    
    // Aggregate by physical warehouse (multiple wholesaler tags can map to same warehouse)
    // e.g., "Leker" + "Forcetop" → both "Magazyn Chynów" → combined for free shipping
    const valueByWarehouse = new Map<string, number>();
    for (const [wholesaler, value] of valueByWholesaler) {
      const warehouseName = await getWarehouseName(wholesaler);
      const currentValue = valueByWarehouse.get(warehouseName) || 0;
      valueByWarehouse.set(warehouseName, currentValue + value);
    }
    
    // Create packages for gabaryt items (each one is a separate shipment)
    // GABARYTY NIE MAJĄ DARMOWEJ DOSTAWY - niezależnie od wartości zamówienia
    let packageId = 1;
    for (const gabarytItem of gabarytItems) {
      const gabarytPrice = getGabarytPrice(gabarytItem.product.tags);
      const productIsInPostOnly = isInPostOnly(gabarytItem.product.tags);
      const wholesaler = await getWholesaler(gabarytItem.product.tags) || 'default';
      const warehouseName = await getWarehouseName(wholesaler);
      const warehouseValue = valueByWarehouse.get(warehouseName) || 0;
      // Gabaryty NIGDY nie mają darmowej dostawy - płatna wysyłka zawsze
      const hasFreeShipping = false;
      
      for (let i = 0; i < gabarytItem.quantity; i++) {
        packages.push({
          id: `gabaryt-${packageId++}`,
          type: 'gabaryt',
          wholesaler: wholesaler === 'default' ? null : wholesaler,
          items: [{
            productId: gabarytItem.product.id,
            productName: gabarytItem.product.name,
            variantId: gabarytItem.variantId,
            quantity: 1,
            isGabaryt: true,
            gabarytPrice: gabarytPrice || undefined,
            productImage: gabarytItem.product.image,
          }],
          paczkomatPackageCount: 0,
          gabarytPrice: gabarytPrice || SHIPPING_PRICES.gabaryt_base,
          isPaczkomatAvailable: false, // Gabaryt cannot use paczkomat
          isInPostOnly: productIsInPostOnly,
          isCourierOnly: false, // Gabaryt has its own shipping method
          isOutlet: isOutletProduct(wholesaler), // Personal pickup available for Outlet warehouse
          warehouseValue,
          hasFreeShipping,
        });
      }
    }
    
    // Create packages for standard items by wholesaler
    // Shipping restrictions are determined by the most restrictive product in the package
    for (const [wholesaler, groupItems] of standardItemsByWholesaler) {
      // Determine shipping restrictions for the whole package
      // Priority: dpd_only > inpost_only > all
      // If ANY product requires "tylko kurier", the whole package is dpd_only
      // If ANY product is "inpost_only" (and no dpd_only), the whole package is inpost_only
      let packageIsCourierOnly = false;
      let packageIsInPostOnly = false;
      
      for (const item of groupItems) {
        const tags = item.product.tags || [];
        if (isCourierOnly(tags)) {
          packageIsCourierOnly = true;
          break; // Most restrictive, no need to check further
        }
        if (isInPostOnly(tags)) {
          packageIsInPostOnly = true;
        }
      }
      
      // If courier only, disable InPost-only flag
      if (packageIsCourierOnly) {
        packageIsInPostOnly = false;
      }
      
      const packageItems = groupItems.map(item => {
        const weightPrice = getWeightShippingPrice(item.product.tags);
        return {
          productId: item.product.id,
          productName: item.product.name,
          variantId: item.variantId,
          quantity: item.quantity,
          isGabaryt: false,
          weightShippingPrice: weightPrice || undefined,
          productImage: item.product.image,
        };
      });
      
      // Calculate how many paczkomat packages are needed for this shipment
      // Uses FFD bin-packing algorithm for products with "Paczkomaty i Kurier" tag
      const itemsForPacking = groupItems.map(item => ({
        tags: item.product.tags,
        quantity: item.quantity,
      }));
      
      // Calculate packages using FFD bin-packing
      const paczkomatPackageCount = calculatePackageCount(itemsForPacking);
      
      // Track highest weight-based shipping price in this package
      let maxWeightShippingPrice: number | null = null;
      
      for (const item of groupItems) {
        const weightPrice = getWeightShippingPrice(item.product.tags);
        if (weightPrice !== null) {
          if (maxWeightShippingPrice === null || weightPrice > maxWeightShippingPrice) {
            maxWeightShippingPrice = weightPrice;
          }
        }
      }
      
      // Paczkomat available only if NOT courier-only (DPD only)
      const isPaczkomatAvailableForPackage = !packageIsCourierOnly;
      
      // Calculate warehouse value and check for free shipping (aggregated by physical warehouse)
      const warehouseName = await getWarehouseName(wholesaler);
      const warehouseValue = valueByWarehouse.get(warehouseName) || 0;
      const hasFreeShipping = warehouseValue >= FREE_SHIPPING_THRESHOLD;
      
      packages.push({
        id: `standard-${packageId++}`,
        type: 'standard',
        wholesaler: wholesaler === 'default' ? null : wholesaler,
        items: packageItems,
        paczkomatPackageCount,
        weightShippingPrice: maxWeightShippingPrice || undefined,
        isPaczkomatAvailable: isPaczkomatAvailableForPackage,
        isInPostOnly: packageIsInPostOnly,
        isCourierOnly: packageIsCourierOnly,
        isOutlet: isOutletProduct(wholesaler), // Personal pickup available for Outlet warehouse
        warehouseValue,
        hasFreeShipping,
      });
    }
    
    // Calculate costs (considering free shipping)
    const gabarytPackages = packages.filter(p => p.type === 'gabaryt');
    const standardPackages = packages.filter(p => p.type === 'standard');
    const gabarytPackageCount = gabarytPackages.length;
    const standardPackageCount = standardPackages.length;
    const totalPackages = gabarytPackageCount + standardPackageCount;
    const totalPaczkomatPackages = packages.reduce((sum, p) => sum + p.paczkomatPackageCount, 0);
    const isPaczkomatAvailable = gabarytPackageCount === 0;
    
    const breakdown: Array<{ description: string; cost: number; packageCount: number }> = [];
    
    // Sum gabaryt costs from individual prices
    // Gabaryty NIGDY nie mają darmowej dostawy - zawsze płatna wysyłka
    const totalGabarytCost = gabarytPackages.reduce((sum, pkg) => {
      return sum + (pkg.gabarytPrice || SHIPPING_PRICES.gabaryt_base);
    }, 0);
    
    if (gabarytPackageCount > 0) {
      breakdown.push({
        description: `Produkty gabarytowe (${gabarytPackageCount} szt.)`,
        cost: totalGabarytCost,
        packageCount: gabarytPackageCount,
      });
    }
    
    // Calculate standard packages cost - use weight-based price if available (considering free shipping)
    if (standardPackageCount > 0) {
      let standardCost = 0;
      let weightBasedCount = 0;
      let regularCount = 0;
      let freeCount = 0;
      
      for (const pkg of standardPackages) {
        if (pkg.hasFreeShipping) {
          freeCount++;
          continue; // Skip cost for free shipping packages
        }
        if (pkg.weightShippingPrice) {
          standardCost += pkg.weightShippingPrice;
          weightBasedCount++;
        } else {
          standardCost += SHIPPING_PRICES.inpost_kurier;
          regularCount++;
        }
      }
      
      let description = '';
      if (freeCount > 0) {
        if (freeCount === standardPackageCount) {
          description = `Standardowe paczki (${standardPackageCount}) - DARMOWA DOSTAWA`;
        } else {
          const paidCount = standardPackageCount - freeCount;
          description = `Standardowe paczki (${paidCount} płatne, ${freeCount} darmowe)`;
        }
      } else if (weightBasedCount > 0 && regularCount > 0) {
        description = `Standardowe paczki (${weightBasedCount} wg wagi, ${regularCount} standard)`;
      } else if (weightBasedCount > 0) {
        description = `Paczki wg wagi (${weightBasedCount} hurtowni)`;
      } else {
        description = `Standardowe paczki (${standardPackageCount} hurtowni)`;
      }
      
      breakdown.push({
        description,
        cost: standardCost,
        packageCount: standardPackageCount,
      });
    }
    
    const shippingCost = breakdown.reduce((sum, item) => sum + item.cost, 0);
    
    // Calculate paczkomat cost (considering free shipping)
    let paczkomatCost = 0;
    if (isPaczkomatAvailable) {
      for (const pkg of standardPackages) {
        if (!pkg.hasFreeShipping) {
          // Minimum 1 package per warehouse for paczkomat pricing
          const effectiveCount = Math.max(pkg.paczkomatPackageCount, 1);
          paczkomatCost += effectiveCount * SHIPPING_PRICES.inpost_paczkomat;
        }
      }
    }
    
    if (!isPaczkomatAvailable) {
      warnings.push('Produkty gabarytowe nie mogą być wysłane do paczkomatu. Dostępna tylko dostawa kurierem.');
    }
    
    // Add info about free shipping - use warehouse display names instead of wholesaler names
    const freeShippingWholesalers = [...new Set(packages.filter(p => p.hasFreeShipping).map(p => p.wholesaler).filter(Boolean))];
    const freeShippingWarehouseNames = [...new Set(await Promise.all(freeShippingWholesalers.map(w => getWarehouseName(w))))];
    if (freeShippingWarehouseNames.length > 0) {
      warnings.push(`Darmowa dostawa dla zamówień powyżej ${FREE_SHIPPING_THRESHOLD} zł z: ${freeShippingWarehouseNames.join(', ')}`);
    }
    
    return {
      packages,
      totalPackages,
      totalPaczkomatPackages,
      shippingCost,
      paczkomatCost,
      breakdown,
      warnings,
      isPaczkomatAvailable,
    };
  }
  
  /**
   * Get base shipping price for method
   */
  private getBaseShippingPrice(method: string): number {
    switch (method) {
      case 'inpost_paczkomat': return SHIPPING_PRICES.inpost_paczkomat;
      case 'inpost_kurier': return SHIPPING_PRICES.inpost_kurier;
      case 'wysylka_gabaryt': return SHIPPING_PRICES.wysylka_gabaryt;
      default: return SHIPPING_PRICES.inpost_kurier;
    }
  }
  
  /**
   * Get available shipping methods for cart items
   */
  async getAvailableShippingMethods(items: CartItemForShipping[], options?: { isB2b?: boolean; cartSubtotal?: number }): Promise<Array<{
    id: string;
    name: string;
    price: number;
    available: boolean;
    message?: string;
  }>> {
    const calculation = await this.calculateShipping(items);
    
    // Get total gabaryt cost from individual package prices (considering free shipping)
    const totalGabarytCost = calculation.packages
      .filter(p => p.type === 'gabaryt')
      .reduce((sum, pkg) => {
        if (pkg.hasFreeShipping) return sum;
        return sum + (pkg.gabarytPrice || SHIPPING_PRICES.gabaryt_base);
      }, 0);
    
    // Calculate standard packages cost with weight-based pricing (considering free shipping)
    const standardPackages = calculation.packages.filter(p => p.type === 'standard');
    const totalStandardCost = standardPackages.reduce((sum, pkg) => {
      if (pkg.hasFreeShipping) return sum;
      return sum + (pkg.weightShippingPrice || SHIPPING_PRICES.inpost_kurier);
    }, 0);
    
    // Calculate InPost kurier cost (considering free shipping)
    // Kurier InPost = stała cena za przesyłkę z magazynu (nie mnożymy przez liczbę paczek paczkomatowych)
    let inpostKurierCost = totalGabarytCost;
    for (const pkg of standardPackages) {
      if (!pkg.hasFreeShipping) {
        inpostKurierCost += SHIPPING_PRICES.inpost_kurier; // Jedna przesyłka za magazyn
      }
    }
    
    // Check if any package has InPost only restriction (paczkomat i kurier tag)
    // isInPostOnly = true means ONLY InPost methods are available (paczkomat + kurier), NOT that paczkomat is disabled
    const hasInPostOnlyPackages = calculation.packages.some(p => p.isInPostOnly);
    
    // Paczkomat is not available only if there are gabaryt packages
    // "Paczkomaty i Kurier" tag means paczkomat IS available (just no other carriers)
    // "Tylko kurier" tag means paczkomat is NOT available
    const hasCourierOnlyPackages = calculation.packages.some(p => p.isCourierOnly);
    const isPaczkomatAvailable = calculation.isPaczkomatAvailable && !hasCourierOnlyPackages;
    
    let paczkomatMessage: string | undefined;
    if (!isPaczkomatAvailable) {
      if (hasCourierOnlyPackages) {
        paczkomatMessage = 'Produkt dostępny tylko z dostawą kurierem';
      } else {
        paczkomatMessage = 'Produkty gabarytowe wykluczają dostawę do paczkomatu';
      }
    } else if (calculation.totalPaczkomatPackages > 1) {
      paczkomatMessage = `${calculation.totalPaczkomatPackages} paczki`;
    }
    
    const methods = [
      {
        id: 'inpost_paczkomat',
        name: 'InPost Paczkomat',
        price: calculation.paczkomatCost,
        available: isPaczkomatAvailable,
        message: calculation.paczkomatCost === 0 && isPaczkomatAvailable ? 'Darmowa dostawa!' : paczkomatMessage,
      },
      {
        id: 'inpost_kurier',
        name: 'Kurier InPost',
        price: inpostKurierCost,
        available: true,
        message: inpostKurierCost === 0 
          ? 'Darmowa dostawa!' 
          : (calculation.totalPaczkomatPackages > 1 ? `${calculation.totalPaczkomatPackages} paczki` : undefined),
      },
    ];
    
    // Jeśli są produkty gabarytowe, dodaj wymuszoną opcję "Wysyłka gabaryt"
    const hasGabarytPackages = calculation.packages.some(p => p.type === 'gabaryt');
    if (hasGabarytPackages) {
      methods.unshift({
        id: 'wysylka_gabaryt',
        name: 'Wysyłka gabaryt',
        price: totalGabarytCost || SHIPPING_PRICES.wysylka_gabaryt,
        available: true,
        message: 'Wymagana dla produktów gabarytowych',
        forced: true, // Ta opcja jest wymuszona i nie może być zmieniona
      } as any);
    }

    // B2B shipping method (only for approved B2B partners)
    if (options?.isB2b) {
      const subtotal = options.cartSubtotal || 0;
      const b2bShippingPrice = subtotal >= 50 ? 1.99 : 4.99;
      methods.push({
        id: 'b2b_wysylka_wlasna',
        name: 'Wysyłka własna (B2B)',
        price: b2bShippingPrice,
        available: true,
        message: subtotal >= 50 ? 'Dostawa B2B od 50 zł' : 'Dostawa B2B poniżej 50 zł',
      });
    }
    
    return methods;
  }
  
  /**
   * Get shipping options per package (for per-product shipping selection)
   * Each package gets its own list of available shipping methods
   */
  async getShippingOptionsPerPackage(items: CartItemForShipping[], options?: { isB2b?: boolean; cartSubtotal?: number }): Promise<{
    packagesWithOptions: PackageWithShippingOptions[];
    totalShippingCost: number;
    warnings: string[];
  }> {
    const calculation = await this.calculateShipping(items);
    const packagesWithOptions: PackageWithShippingOptions[] = [];
    
    for (const pkg of calculation.packages) {
      const methods: ShippingMethodForPackage[] = [];
      const isFree = pkg.hasFreeShipping;
      
      if (pkg.type === 'gabaryt') {
        // Gabaryt packages - wymuszona opcja "Wysyłka gabaryt" + inne kurierskie
        const gabarytPrice = isFree ? 0 : (pkg.gabarytPrice || SHIPPING_PRICES.gabaryt_base);
        
        // Dodaj wymuszoną opcję "Wysyłka gabaryt" na początek
        methods.push({
          id: 'wysylka_gabaryt',
          name: 'Wysyłka gabaryt',
          price: gabarytPrice,
          available: true,
          message: isFree 
            ? `Darmowa dostawa! (zamówienie powyżej ${FREE_SHIPPING_THRESHOLD} zł)` 
            : 'Wymagana dla produktów gabarytowych',
          estimatedDelivery: '2-5 dni roboczych',
        });
        
        methods.push({
          id: 'inpost_paczkomat',
          name: 'InPost Paczkomat',
          price: 0,
          available: false,
          message: 'Produkt gabarytowy - tylko kurier',
          estimatedDelivery: 'Wysyłka w ciągu 24 - 72h',
        });
        methods.push({
          id: 'inpost_kurier',
          name: 'Kurier InPost',
          price: gabarytPrice,
          available: false,
          message: 'Wymagana wysyłka gabaryt',
          estimatedDelivery: 'Wysyłka w ciągu 24 - 72h',
        });
      } else {
        // Standard packages
        const paczkomatPackages = pkg.paczkomatPackageCount;
        
        // Use weight-based price if available, otherwise standard price
        const dpdPrice = isFree ? 0 : (pkg.weightShippingPrice || SHIPPING_PRICES.dpd_kurier);
        
        // Shipping availability based on tags:
        // - isInPostOnly (tag "Paczkomaty i Kurier") = only InPost (paczkomat + kurier), NO DPD
        // - isCourierOnly (tag "Tylko kurier") = only DPD, NO InPost
        // - No tags = all options available
        
        const isInPostAvailable = !pkg.isCourierOnly; // InPost available unless "Tylko kurier"
        const isDpdAvailable = !pkg.isInPostOnly;     // DPD available unless "Paczkomaty i Kurier"
        
        // InPost Paczkomat - price based on how many paczkomat packages are needed
        // If items don't fit in 1 paczkomat package, multiple packages = higher price
        // Minimum 1 package if paczkomat is available (products without explicit tag still need at least 1 package)
        const effectivePaczkomatPackages = isInPostAvailable ? Math.max(paczkomatPackages, 1) : 0;
        const paczkomatPrice = isFree ? 0 : effectivePaczkomatPackages * SHIPPING_PRICES.inpost_paczkomat;
        const freeMessage = isFree ? `Darmowa dostawa! (zamówienie powyżej ${FREE_SHIPPING_THRESHOLD} zł)` : undefined;
        
        methods.push({
          id: 'inpost_paczkomat',
          name: 'InPost Paczkomat',
          price: paczkomatPrice,
          available: isInPostAvailable,
          message: !isInPostAvailable 
            ? 'Produkt dostępny tylko z DPD'
            : (freeMessage || (paczkomatPackages > 1 ? `${paczkomatPackages} paczki` : undefined)),
          estimatedDelivery: 'Wysyłka w ciągu 24 - 72h',
        });
        
        // InPost Kurier - stała cena za przesyłkę (nie zależy od liczby paczek paczkomatowych)
        // Kurier zawsze wysyła wszystko w jednej przesyłce
        const kurierPrice = isFree ? 0 : SHIPPING_PRICES.inpost_kurier;
        
        methods.push({
          id: 'inpost_kurier',
          name: 'Kurier InPost',
          price: kurierPrice,
          available: isInPostAvailable,
          message: !isInPostAvailable 
            ? 'Produkt dostępny tylko z DPD' 
            : freeMessage,
          estimatedDelivery: 'Wysyłka w ciągu 24 - 72h',
        });
        
        // DPD Kurier - available only if DPD is available
        methods.push({
          id: 'dpd_kurier',
          name: 'Kurier DPD',
          price: dpdPrice,
          available: isDpdAvailable,
          message: !isDpdAvailable 
            ? 'Produkt dostępny tylko z InPost' 
            : (freeMessage || (pkg.weightShippingPrice && !isFree ? `Cena wg wagi: ${dpdPrice.toFixed(2)} zł` : undefined)),
          estimatedDelivery: 'Wysyłka w ciągu 24 - 72h',
        });
        
        // Personal pickup (Outlet) - available only for Outlet/Rzeszów warehouse
        if (pkg.isOutlet) {
          methods.push({
            id: 'odbior_osobisty_outlet',
            name: 'Odbiór osobisty (Outlet)',
            price: 0,
            available: true,
            message: 'Odbiór w magazynie Outlet - Rzeszów',
            estimatedDelivery: 'Do uzgodnienia',
          });
        }
      }
      
      // Set default selected method
      // Dla paczek gabarytowych - wymuszona wysyłka gabaryt
      // Dla standardowych z "Tylko kurier" - DPD
      // Dla standardowych z "Paczkomaty i Kurier" lub bez tagów - paczkomat jeśli dostępny
      const defaultMethod = pkg.type === 'gabaryt' 
        ? 'wysylka_gabaryt' 
        : pkg.isCourierOnly 
          ? 'dpd_kurier'
          : (pkg.isPaczkomatAvailable ? 'inpost_paczkomat' : 'inpost_kurier');
      
      // B2B shipping option
      if (options?.isB2b) {
        const subtotal = options.cartSubtotal || 0;
        const b2bPrice = subtotal >= 50 ? 1.99 : 4.99;
        methods.push({
          id: 'b2b_wysylka_wlasna',
          name: 'Wysyłka własna (B2B)',
          price: b2bPrice,
          available: true,
          message: subtotal >= 50 ? 'Dostawa B2B od 50 zł' : 'Dostawa B2B poniżej 50 zł',
          estimatedDelivery: '2-5 dni roboczych',
        });
      }

      packagesWithOptions.push({
        package: pkg,
        shippingMethods: methods,
        selectedMethod: defaultMethod,
      });
    }
    
    // Calculate initial total with default methods
    let totalShippingCost = 0;
    for (const pkgOpt of packagesWithOptions) {
      const selectedMethod = pkgOpt.shippingMethods.find(m => m.id === pkgOpt.selectedMethod && m.available);
      if (selectedMethod) {
        totalShippingCost += selectedMethod.price;
      }
    }
    
    return {
      packagesWithOptions,
      totalShippingCost,
      warnings: calculation.warnings,
    };
  }
}

export const shippingCalculatorService = new ShippingCalculatorService();
