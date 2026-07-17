import { prisma } from '../db';
import { Decimal } from '@prisma/client/runtime/library';
import { wholesalerConfigService } from './wholesaler-config.service';

/**
 * B2B Pricing Service
 * 
 * Calculates B2B prices directly from purchasePrice (wholesale price from feed).
 * Formula: purchasePrice × B2B multiplier (per wholesaler) → roundTo99
 */

interface PriceRule {
  priceFrom: number;
  priceTo: number;
  multiplier: number;
  addToPrice: number;
}

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
  sku?: string | null,
  tags?: string[]
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

  if (tags) {
    for (const tag of tags) {
      const tagKey = tag.replace(/^hurtownia[:\-_]\s*/i, '').trim().toLowerCase();
      const match = wholesalers.find(w => {
        const identifiers = [w.key, w.name, ...(w.aliases || [])];
        return identifiers.some(identifier => identifier.toLowerCase() === tagKey);
      });
      if (match) return match.key;
    }
  }

  return null;
}

/**
 * Calculate B2B price for product directly from purchasePrice.
 * Formula: purchasePrice × B2B multiplier (per wholesaler or global) → roundTo99
 * 
 * No reverse-engineering of retail price. If purchasePrice is missing,
 * product cannot have B2B pricing (returns store price as-is).
 */
export async function calculateB2bPriceForProduct(
  storePrice: number | Decimal,
  baselinkerProductId: string | null,
  sku: string | null,
  b2bInfo: { multiplier: number; wholesalerRules: any },
  purchasePrice?: number | Decimal | null,
  tags?: string[]
): Promise<number> {
  const price = typeof storePrice === 'number' ? storePrice : Number(storePrice);
  if (price <= 0) return 0;

  const purchasePriceNum = purchasePrice ? (typeof purchasePrice === 'number' ? purchasePrice : Number(purchasePrice)) : 0;
  
  // If no purchase price, we cannot calculate B2B price — return store price
  if (purchasePriceNum <= 0) return price;

  const whKey = await resolveWholesalerKey(baselinkerProductId, sku, tags);
  
  // Try wholesaler-specific B2B rules
  if (whKey) {
    const rulesConfig = b2bInfo.wholesalerRules?.[whKey];
    if (rulesConfig && Array.isArray(rulesConfig.rules) && rulesConfig.rules.length > 0) {
      // Find matching B2B rule for this purchase price range
      let b2bPrice = purchasePriceNum;
      const sortedB2bRules = [...rulesConfig.rules].sort((a: PriceRule, b: PriceRule) => a.priceFrom - b.priceFrom);
      for (const rule of sortedB2bRules) {
        if (purchasePriceNum >= rule.priceFrom && purchasePriceNum <= rule.priceTo) {
          b2bPrice = purchasePriceNum * rule.multiplier + rule.addToPrice;
          break;
        }
      }
      return roundPriceTo99(b2bPrice);
    }
  }

  // Fallback: global B2B multiplier × purchasePrice
  const b2bPrice = purchasePriceNum * b2bInfo.multiplier;
  return roundPriceTo99(b2bPrice);
}

/**
 * Calculate B2B price using a single multiplier (without wholesaler rules)
 */
export function calculateB2bPrice(
  storePrice: number | Decimal,
  b2bMultiplier: number,
  purchasePrice?: number | Decimal | null
): number {
  const price = typeof storePrice === 'number' ? storePrice : Number(storePrice);
  if (price <= 0 || b2bMultiplier <= 0) return 0;

  const purchasePriceNum = purchasePrice ? (typeof purchasePrice === 'number' ? purchasePrice : Number(purchasePrice)) : 0;
  
  // If no purchase price, cannot calculate B2B — return store price
  if (purchasePriceNum <= 0) return price;
  
  const b2bPrice = purchasePriceNum * b2bMultiplier;
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
    product.purchasePrice,
    product.tags
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
          variant.purchasePrice || product.purchasePrice,
          product.tags
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
