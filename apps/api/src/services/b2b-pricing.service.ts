import { prisma } from '../db';
import { Decimal } from '@prisma/client/runtime/library';
import { wholesalerConfigService } from './wholesaler-config.service';

/**
 * B2B Pricing Service
 * 
 * Calculates B2B prices by reversing the retail store price rules and applying the B2B wholesaler-specific rules.
 */

const STORE_BASE_MULTIPLIER = 1.35;

interface PriceRule {
  priceFrom: number;
  priceTo: number;
  multiplier: number;
  addToPrice: number;
}

interface RetailConfig {
  divider: number;
  rules: PriceRule[];
}

// In-memory cache for retail configs to avoid hitting DB constantly
const retailConfigCache: Record<string, { data: RetailConfig; timestamp: number }> = {};
const RETAIL_CACHE_TTL = 60_000; // 60 seconds

/**
 * Round price to .99 (psychological pricing)
 */
function roundPriceTo99(price: number): number {
  if (price <= 0) return 0;
  return Math.floor(price) + 0.99;
}

/**
 * Resolve wholesaler key from baselinkerProductId or SKU.
 */
export async function resolveWholesalerKey(
  baselinkerProductId?: string | null,
  sku?: string | null
): Promise<string | null> {
  const wholesalers = await wholesalerConfigService.getAll();
  
  if (baselinkerProductId) {
    const parts = baselinkerProductId.split('-');
    if (parts.length > 1) {
      const prefix = parts[0].toLowerCase();
      const match = wholesalers.find(w => w.key === prefix || w.prefix.toLowerCase() === prefix);
      if (match) return match.key;
    }
  }

  if (sku) {
    const skuLower = sku.toLowerCase();
    // Try to match skuPrefix
    for (const w of wholesalers) {
      if (w.skuPrefix && skuLower.startsWith(w.skuPrefix.toLowerCase())) {
        return w.key;
      }
    }
    // Try to match prefix
    for (const w of wholesalers) {
      if (w.prefix && skuLower.startsWith(w.prefix.toLowerCase())) {
        return w.key;
      }
    }
  }

  return null;
}

/**
 * Get retail pricing configuration (rules and divider) for a wholesaler.
 */
export async function getRetailConfig(whKey: string): Promise<RetailConfig> {
  const cacheKey = whKey.toLowerCase();
  const now = Date.now();
  if (retailConfigCache[cacheKey] && now - retailConfigCache[cacheKey].timestamp < RETAIL_CACHE_TTL) {
    return retailConfigCache[cacheKey].data;
  }

  // Load rules
  let rules: PriceRule[] = [];
  try {
    const settingRules = await prisma.settings.findUnique({
      where: { key: `price_rules_${cacheKey}` },
    });
    if (settingRules && settingRules.value) {
      const parsed = typeof settingRules.value === 'string' ? JSON.parse(settingRules.value) : settingRules.value;
      if (Array.isArray(parsed)) {
        rules = parsed.map(r => ({
          priceFrom: parseFloat(r.priceFrom) || 0,
          priceTo: parseFloat(r.priceTo) || 999999,
          multiplier: parseFloat(r.multiplier) || 1,
          addToPrice: parseFloat(r.addToPrice) || 0,
        })).sort((a, b) => a.priceFrom - b.priceFrom);
      }
    }
  } catch (err) {
    console.error(`[B2bPricingService] Error loading retail rules for ${whKey}:`, err);
  }

  // Load divider
  let divider = 1;
  try {
    const settingDivider = await prisma.settings.findUnique({
      where: { key: `price_divider_${cacheKey}` },
    });
    if (settingDivider && settingDivider.value) {
      const val = parseFloat(settingDivider.value);
      if (val && val > 0) {
        divider = val;
      }
    }
  } catch (err) {
    console.error(`[B2bPricingService] Error loading retail divider for ${whKey}:`, err);
  }

  const data = { rules, divider };
  retailConfigCache[cacheKey] = { data, timestamp: now };
  return data;
}

/**
 * Reconstruct raw wholesale price from retail price using active rules.
 */
export function reverseRetailPriceToWholesale(
  retailPrice: number,
  retailRules: PriceRule[],
  retailDivider: number
): number {
  if (retailPrice <= 0) return 0;

  if (retailRules && retailRules.length > 0) {
    for (const rule of retailRules) {
      if (rule.multiplier <= 0) continue;
      
      const basePrice = (retailPrice - rule.addToPrice) / rule.multiplier;
      // Use 1.0 tolerance for boundary rounding errors
      const tolerance = 1.0;
      if (basePrice >= (rule.priceFrom - tolerance) && basePrice <= (rule.priceTo + tolerance)) {
        return basePrice;
      }
    }
  }

  // Fallback: reverse using the standard STORE_BASE_MULTIPLIER (1.35)
  return (retailPrice / STORE_BASE_MULTIPLIER);
}

/**
 * Calculate B2B price for product based on rules and global fallbacks
 */
export async function calculateB2bPriceForProduct(
  storePrice: number | Decimal,
  baselinkerProductId: string | null,
  sku: string | null,
  b2bInfo: { multiplier: number; wholesalerRules: any },
  purchasePrice?: number | Decimal | null
): Promise<number> {
  const price = typeof storePrice === 'number' ? storePrice : Number(storePrice);
  if (price <= 0) return 0;

  const purchasePriceNum = purchasePrice ? (typeof purchasePrice === 'number' ? purchasePrice : Number(purchasePrice)) : 0;
  const whKey = await resolveWholesalerKey(baselinkerProductId, sku);
  
  if (whKey) {
    const rulesConfig = b2bInfo.wholesalerRules?.[whKey];
    if (rulesConfig && Array.isArray(rulesConfig.rules) && rulesConfig.rules.length > 0) {
      // 1. Get or reverse wholesalePrice
      let wholesalePrice = 0;
      if (purchasePriceNum > 0) {
        wholesalePrice = purchasePriceNum;
      } else {
        const retailConfig = await getRetailConfig(whKey);
        wholesalePrice = reverseRetailPriceToWholesale(price, retailConfig.rules, retailConfig.divider);
      }
      
      // 2. Apply customer's B2B divider
      const b2bDivider = parseFloat(rulesConfig.divider) || 1;
      const b2bBasePrice = wholesalePrice / b2bDivider;
      
      // 3. Find matching B2B rule
      let b2bPrice = b2bBasePrice;
      const sortedB2bRules = [...rulesConfig.rules].sort((a, b) => a.priceFrom - b.priceFrom);
      for (const rule of sortedB2bRules) {
        if (b2bBasePrice >= rule.priceFrom && b2bBasePrice <= rule.priceTo) {
          b2bPrice = b2bBasePrice * rule.multiplier + rule.addToPrice;
          break;
        }
      }
      
      return roundPriceTo99(b2bPrice);
    }
  }

  // Fallback: standard global B2B multiplier calculation
  const fallbackWholesale = purchasePriceNum > 0 ? purchasePriceNum : (price / STORE_BASE_MULTIPLIER);
  const b2bPrice = fallbackWholesale * b2bInfo.multiplier;
  return roundPriceTo99(b2bPrice);
}

/**
 * Legacy support for direct calculation using a single multiplier (without wholesaler rules)
 */
export function calculateB2bPrice(
  storePrice: number | Decimal,
  b2bMultiplier: number,
  purchasePrice?: number | Decimal | null
): number {
  const price = typeof storePrice === 'number' ? storePrice : Number(storePrice);
  if (price <= 0 || b2bMultiplier <= 0) return 0;

  const purchasePriceNum = purchasePrice ? (typeof purchasePrice === 'number' ? purchasePrice : Number(purchasePrice)) : 0;
  const basePrice = purchasePriceNum > 0 ? purchasePriceNum : (price / STORE_BASE_MULTIPLIER);
  const b2bPrice = basePrice * b2bMultiplier;

  return roundPriceTo99(b2bPrice);
}

/**
 * Get B2B user info from database.
 * Returns null if user is not an active B2B partner.
 */
export async function getB2bUserInfo(
  userId: string
): Promise<{ multiplier: number; wholesalerRules: any } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, b2bStatus: true, b2bPriceMultiplier: true, b2bWholesalerRules: true },
  });

  if (!user || user.role !== 'B2B_PARTNER' || (user.b2bStatus !== 'APPROVED' && user.b2bStatus !== 'SUSPENDED')) {
    return null;
  }

  return {
    multiplier: user.b2bPriceMultiplier ? Number(user.b2bPriceMultiplier) : 1.10,
    wholesalerRules: user.b2bWholesalerRules || {},
  };
}

/**
 * Transform product prices for B2B user (async)
 * Replaces price and variant prices with B2B-calculated prices
 */
export async function applyB2bPricing(
  product: any,
  b2bInfo: { multiplier: number; wholesalerRules: any }
): Promise<any> {
  if (!product) return product;

  const b2bPrice = await calculateB2bPriceForProduct(
    product.price,
    product.baselinkerProductId,
    product.sku,
    b2bInfo,
    product.purchasePrice
  );

  let transformedVariants: any[] | null = null;
  if (product.variants && product.variants.length > 0) {
    transformedVariants = await Promise.all(
      product.variants.map(async (variant: any) => {
        const vB2bPrice = await calculateB2bPriceForProduct(
          variant.price,
          product.baselinkerProductId || variant.baselinkerProductId,
          variant.sku || product.sku,
          b2bInfo,
          variant.purchasePrice || product.purchasePrice
        );
        return {
          ...variant,
          price: vB2bPrice,
          compareAtPrice: null,
          isB2bPrice: true,
        };
      })
    );
  }

  return {
    ...product,
    price: b2bPrice,
    compareAtPrice: null,
    isB2bPrice: true,
    variants: transformedVariants || product.variants,
  };
}
