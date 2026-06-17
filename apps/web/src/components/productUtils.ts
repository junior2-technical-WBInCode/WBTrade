import { Product } from '../lib/api';

// Placeholder SVG as data URI
export const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23f3f4f6' width='400' height='400'/%3E%3Cpath fill='%23d1d5db' d='M160 150h80v100h-80z'/%3E%3Ccircle fill='%23d1d5db' cx='180' cy='130' r='20'/%3E%3Cpath fill='%23e5e7eb' d='M120 250l60-80 40 50 40-30 60 60v50H120z'/%3E%3C/svg%3E";

// Warehouse locations mapping — loaded from API, with hardcoded fallback
let _warehouseConfig: { prefix: string; location: string; skuPrefix: string }[] | null = null;
let _configFetchedAt = 0;

const FALLBACK_WAREHOUSE_LOCATIONS: Record<string, string> = {
  'leker': 'Chynów',
  'hp': 'Zielona Góra',
  'btp': 'Chotów',
  'dofirmy': 'Koszalin',
  'outlet': 'Rzeszów',
  'hk': 'Hurtownia Kuchenna',
};

// Backward compat export for ProductCard / ProductListCard
export const WAREHOUSE_LOCATIONS = FALLBACK_WAREHOUSE_LOCATIONS;

async function loadWarehouseConfig(): Promise<{ prefix: string; location: string; skuPrefix: string }[]> {
  const now = Date.now();
  if (_warehouseConfig && now - _configFetchedAt < 5 * 60 * 1000) return _warehouseConfig;
  try {
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
    const res = await fetch(`${API_URL}/wholesalers/config`, { next: { revalidate: 300 } });
    if (res.ok) {
      const data = await res.json();
      _warehouseConfig = data
        .filter((w: any) => w.prefix && w.location)
        .map((w: any) => ({ prefix: w.prefix.toLowerCase(), location: w.location, skuPrefix: (w.skuPrefix || '').toUpperCase() }));
      _configFetchedAt = now;
      return _warehouseConfig!;
    }
  } catch {}
  return [];
}

export function getWarehouseLocation(product: Product): string | null {
  // Synchronous — uses fallback. For dynamic, use getWarehouseLocationAsync.
  const blId = (product as any).baselinkerProductId?.toLowerCase() || '';
  for (const [key, loc] of Object.entries(FALLBACK_WAREHOUSE_LOCATIONS)) {
    if (blId.startsWith(`${key}-`)) return loc;
  }

  const tags = (product as any).tags || [];
  if (tags.some((t: string) => t.toLowerCase() === 'rzeszów')) return FALLBACK_WAREHOUSE_LOCATIONS['outlet'];

  const sku = product.sku?.toUpperCase() || '';
  for (const [key, loc] of Object.entries(FALLBACK_WAREHOUSE_LOCATIONS)) {
    if (sku.startsWith(`${key.toUpperCase()}-`)) return loc;
  }

  return null;
}

export async function getWarehouseLocationAsync(product: Product): Promise<string | null> {
  const config = await loadWarehouseConfig();
  if (config.length === 0) return getWarehouseLocation(product);

  const blId = (product as any).baselinkerProductId?.toLowerCase() || '';
  for (const wh of config) {
    if (wh.prefix && blId.startsWith(wh.prefix)) return wh.location;
  }

  const sku = product.sku?.toUpperCase() || '';
  for (const wh of config) {
    if (wh.skuPrefix && sku.startsWith(wh.skuPrefix)) return wh.location;
  }

  return null;
}

export function calculateDiscountPercent(price: number | string, compareAtPrice: number | string | null | undefined): number {
  if (!compareAtPrice || Number(compareAtPrice) <= Number(price)) return 0;
  return Math.round((1 - Number(price) / Number(compareAtPrice)) * 100);
}

const polishCharsMap: Record<string, string> = {
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
  'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
  'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
  'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
};

export function getBrandSlug(brandName: string): string {
  let result = brandName;
  for (const [polish, ascii] of Object.entries(polishCharsMap)) {
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

export function getProductBrand(product: Product): string | null {
  // Prefer manufacturer relation from DB
  if ((product as any).manufacturer?.name) {
    return (product as any).manufacturer.name;
  }
  // Fallback to specifications.brand
  const specs = product.specifications as Record<string, unknown> | null | undefined;
  if (specs && typeof specs === 'object' && typeof specs.brand === 'string' && specs.brand.trim()) {
    return specs.brand.trim();
  }
  return null;
}

export function getProductBrandSlug(product: Product): string | null {
  // Prefer manufacturer slug from DB (already generated correctly)
  if ((product as any).manufacturer?.slug) {
    return (product as any).manufacturer.slug;
  }
  const brand = getProductBrand(product);
  return brand ? getBrandSlug(brand) : null;
}

export function getWholesalerKey(baselinkerProductId?: string | null, sku?: string | null, tags?: string[]): string | null {
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

interface PriceRule {
  priceFrom: number;
  priceTo: number;
  multiplier: number;
  addToPrice: number;
}

const WHOLESALER_RETAIL_RULES: Record<string, PriceRule[]> = {
  hp: [
    { priceFrom: 0, priceTo: 50, multiplier: 1.37, addToPrice: 0 },
    { priceFrom: 50, priceTo: 300, multiplier: 1.36, addToPrice: 0 },
    { priceFrom: 300, priceTo: 100100.01, multiplier: 1.35, addToPrice: 0 }
  ],
  btp: [
    { priceFrom: 0, priceTo: 100000, multiplier: 1.35, addToPrice: 0 }
  ],
  leker: [
    { priceFrom: 0, priceTo: 1000000, multiplier: 1.35, addToPrice: 0 }
  ]
};

export function reverseRetailPriceToWholesale(retailPrice: number, whKey: string | null): number {
  if (retailPrice <= 0) return 0;

  const rules = whKey ? WHOLESALER_RETAIL_RULES[whKey.toLowerCase()] : null;
  if (rules && rules.length > 0) {
    for (const rule of rules) {
      if (rule.multiplier <= 0) continue;
      
      const basePrice = (retailPrice - rule.addToPrice) / rule.multiplier;
      const tolerance = 1.0;
      if (basePrice >= (rule.priceFrom - tolerance) && basePrice <= (rule.priceTo + tolerance)) {
        return basePrice;
      }
    }
  }

  // Fallback: reverse using the standard STORE_BASE_MULTIPLIER (1.35)
  return retailPrice / 1.35;
}

export function calculateClientB2bPrice(
  storePrice: number,
  globalMultiplier: number,
  wholesalerRules?: any,
  baselinkerProductId?: string | null,
  sku?: string | null,
  tags?: string[]
): number {
  if (storePrice <= 0) return 0;
  
  const whKey = getWholesalerKey(baselinkerProductId, sku, tags);
  const rawWholesale = reverseRetailPriceToWholesale(storePrice, whKey);
  
  if (whKey && wholesalerRules && wholesalerRules[whKey]) {
    const config = wholesalerRules[whKey];
    if (config && Array.isArray(config.rules) && config.rules.length > 0) {
      const b2bDivider = parseFloat(config.divider) || 1.0;
      const b2bBasePrice = rawWholesale / b2bDivider;
      
      let b2bPrice = b2bBasePrice;
      const sortedRules = [...config.rules].sort((a, b) => a.priceFrom - b.priceFrom);
      for (const rule of sortedRules) {
        if (b2bBasePrice >= rule.priceFrom && b2bBasePrice <= rule.priceTo) {
          b2bPrice = b2bBasePrice * rule.multiplier + rule.addToPrice;
          break;
        }
      }
      return Math.floor(b2bPrice) + 0.99;
    }
  }

  const b2bPrice = rawWholesale * globalMultiplier;
  return Math.floor(b2bPrice) + 0.99;
}
