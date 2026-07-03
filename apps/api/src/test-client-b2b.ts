import { prisma } from './db';

// Copy of client-side getWholesalerKey from ProductDetailClient.tsx
function getWholesalerKey(baselinkerProductId?: string | null, sku?: string | null, tags?: string[]): string | null {
  let key: string | null = null;
  if (baselinkerProductId) {
    const parts = baselinkerProductId.split('-');
    if (parts.length > 1) {
      key = parts[0].toLowerCase();
    }
  }
  if (!key && sku) {
    const skuLower = sku.toLowerCase();
    if (skuLower.startsWith('leker')) key = 'leker';
    else if (skuLower.startsWith('btp')) key = 'btp';
    else if (skuLower.startsWith('hp')) key = 'hp';
    else if (skuLower.startsWith('dofirmy')) key = 'dofirmy';
    else if (skuLower.startsWith('hk') || skuLower.startsWith('hurtownia-kuchenna')) key = 'hurtownia-kuchenna';
    else if (skuLower.startsWith('hs') || skuLower.startsWith('hurtownia-sportowa')) key = 'hurtownia-sportowa';
    else if (skuLower.startsWith('polzoo')) key = 'polzoo';
  }
  if (!key && tags && tags.length > 0) {
    const WHOLESALER_PATTERN = /^(hurtownia[:\-_](.+)|Ikonka|BTP|HP|Gastro|Horeca|Hurtownia\s+Przemysłowa|Leker|Forcetop|DoFirmy|PolZoo)$/i;
    for (const tag of tags) {
      const match = tag.match(WHOLESALER_PATTERN);
      if (match) {
        key = (match[2] || match[1]).toLowerCase();
        if (key === 'ikonka') key = 'ikonka';
        else if (key === 'gastronomia' || key === 'gastro') key = 'gastro';
      }
    }
  }
  
  if (key === 'hk' || key === 'hurtownia-kuchenna' || key === 'kuchenna') return 'hurtownia-kuchenna';
  if (key === 'hs' || key === 'hurtownia-sportowa' || key === 'sportowa') return 'hurtownia-sportowa';
  if (key === 'hp' || key === 'hurtownia-przemysłowa' || key === 'hurtownia przemysłowa' || key === 'przemysłowa') return 'hp';
  if (key === 'polzoo') return 'polzoo';
  if (key === 'btp' || key === 'forcetop') return 'btp';
  if (key === 'leker') return 'leker';
  if (key === 'dofirmy') return 'dofirmy';
  return key;
}

// Copy of client-side calculateClientB2bPrice - simplified (no reverse pricing)
function calculateClientB2bPrice(
  storePrice: number,
  globalMultiplier: number,
  wholesalerRules?: any,
  baselinkerProductId?: string | null,
  sku?: string | null,
  tags?: string[],
  purchasePrice?: number | null
): number {
  console.log('[DEBUG client calculation]');
  console.log('  storePrice:', storePrice);
  console.log('  globalMultiplier:', globalMultiplier);
  console.log('  purchasePrice:', purchasePrice);
  console.log('  baselinkerProductId:', baselinkerProductId);
  console.log('  sku:', sku);
  
  const purchasePriceNum = purchasePrice ? Number(purchasePrice) : 0;
  if (purchasePriceNum <= 0) {
    console.log('  No purchasePrice, returning storePrice as-is');
    return storePrice;
  }

  const whKey = getWholesalerKey(baselinkerProductId, sku, tags);
  console.log('  Resolved whKey:', whKey);
  
  if (whKey && wholesalerRules && wholesalerRules[whKey]) {
    const config = wholesalerRules[whKey];
    console.log('  Found config for whKey:', JSON.stringify(config));
    if (config && Array.isArray(config.rules) && config.rules.length > 0) {
      let b2bPrice = purchasePriceNum;
      const sortedRules = [...config.rules].sort((a, b) => a.priceFrom - b.priceFrom);
      for (const rule of sortedRules) {
        console.log(`  Checking rule: priceFrom=${rule.priceFrom}, priceTo=${rule.priceTo}, mult=${rule.multiplier}`);
        if (purchasePriceNum >= rule.priceFrom && purchasePriceNum <= rule.priceTo) {
          b2bPrice = purchasePriceNum * rule.multiplier + rule.addToPrice;
          console.log(`  Matched rule! Calculated price before round: ${b2bPrice}`);
          break;
        }
      }
      return Math.floor(b2bPrice) + 0.99;
    }
  }

  console.log('  Fallback to globalMultiplier × purchasePrice');
  const b2bPrice = purchasePriceNum * globalMultiplier;
  return Math.floor(b2bPrice) + 0.99;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'main@ez-con.pl' },
  });

  const product = await prisma.product.findFirst({
    where: { sku: '1000225' },
    include: {
      variants: true,
    }
  });

  if (!user || !product) {
    console.log('User or product not found');
    return;
  }

  const globalMultiplier = user.b2bPriceMultiplier ? Number(user.b2bPriceMultiplier) : 1.10;
  const wholesalerRules = user.b2bWholesalerRules;
  const rawEffectivePrice = Number(product.price);
  
  // Case A: selectedVariant is undefined/null
  console.log('--- Case A: selectedVariant is null (initial load) ---');
  const priceA = calculateClientB2bPrice(
    rawEffectivePrice,
    globalMultiplier,
    wholesalerRules,
    product.baselinkerProductId,
    product.sku,
    product.tags
  );
  console.log('Result price A:', priceA);

  // Case B: selectedVariant is variants[0] (after mount/hydration)
  console.log('--- Case B: selectedVariant is variants[0] ---');
  const priceB = calculateClientB2bPrice(
    rawEffectivePrice,
    globalMultiplier,
    wholesalerRules,
    product.baselinkerProductId,
    product.variants[0]?.sku || product.sku,
    product.tags
  );
  console.log('Result price B:', priceB);
}

main().catch(console.error).finally(() => prisma.$disconnect());
