import { prisma } from '../db';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * B2B Pricing Service
 * 
 * Calculates B2B prices by reversing the store multiplier and applying the B2B multiplier.
 * Formula: b2bPrice = storePrice / STORE_BASE_MULTIPLIER * userB2bMultiplier
 * 
 * This is consistent with how the Ceneo feed calculates prices (storePrice / 1.35 * 1.1)
 */

// The average/reference store multiplier used to calculate retail prices from wholesale
// This matches the Ceneo feed calculation logic
const STORE_BASE_MULTIPLIER = 1.35;

/**
 * Round price to .99 (psychological pricing)
 */
function roundPriceTo99(price: number): number {
  if (price <= 0) return 0;
  return Math.floor(price) + 0.99;
}

/**
 * Calculate B2B price from retail store price
 * @param storePrice - Current retail price
 * @param b2bMultiplier - User's B2B multiplier (default 1.10)
 * @returns B2B price rounded to .99
 */
export function calculateB2bPrice(storePrice: number | Decimal, b2bMultiplier: number): number {
  const price = typeof storePrice === 'number' ? storePrice : Number(storePrice);
  if (price <= 0 || b2bMultiplier <= 0) return 0;

  // Reverse store multiplier, apply B2B multiplier
  const basePrice = price / STORE_BASE_MULTIPLIER;
  const b2bPrice = basePrice * b2bMultiplier;

  return roundPriceTo99(b2bPrice);
}

/**
 * Get B2B user info from database (for use in product endpoints)
 * Returns null if user is not an active B2B partner
 */
export async function getB2bUserInfo(userId: string): Promise<{ multiplier: number } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, b2bStatus: true, b2bPriceMultiplier: true },
  });

  if (!user || user.role !== 'B2B_PARTNER' || (user.b2bStatus !== 'APPROVED' && user.b2bStatus !== 'SUSPENDED')) {
    return null;
  }

  return {
    multiplier: user.b2bPriceMultiplier ? Number(user.b2bPriceMultiplier) : 1.10,
  };
}

/**
 * Transform product prices for B2B user
 * Replaces price and variant prices with B2B-calculated prices
 */
export function applyB2bPricing(product: any, b2bMultiplier: number): any {
  if (!product) return product;

  const b2bPrice = calculateB2bPrice(product.price, b2bMultiplier);

  const transformedVariants = product.variants?.map((variant: any) => ({
    ...variant,
    price: calculateB2bPrice(variant.price, b2bMultiplier),
    compareAtPrice: null,
  }));

  return {
    ...product,
    price: b2bPrice,
    compareAtPrice: null,
    variants: transformedVariants || product.variants,
  };
}
