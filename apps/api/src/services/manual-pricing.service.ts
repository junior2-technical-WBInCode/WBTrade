import { prisma } from '../db';
import { calculateB2bPriceForProduct, resolveWholesalerKey } from './b2b-pricing.service';

interface PriceRule {
  priceFrom: number;
  priceTo: number;
  multiplier: number;
  addToPrice: number;
}

interface ManualPriceInput {
  purchasePrice: number;
  baselinkerProductId?: string | null;
  sku?: string | null;
  tags?: string[];
}

interface PartnerPrice {
  partnerId: string;
  label: string;
  price: number;
}

export interface ManualPricePreview {
  purchasePrice: number;
  wholesalerKey: string | null;
  retailPrice: number;
  defaultB2bPrice: number;
  partnerPrices: PartnerPrice[];
  partnerB2bMinPrice: number | null;
  partnerB2bMaxPrice: number | null;
}

export interface ManualRetailPrice {
  purchasePrice: number;
  wholesalerKey: string | null;
  retailPrice: number;
}

function roundPriceTo99(price: number): number {
  if (price <= 0) return 0;
  return Math.floor(price) + 0.99;
}

function parseRules(value: string | null | undefined): PriceRule[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((rule) => ({
        priceFrom: Number(rule.priceFrom) || 0,
        priceTo: Number(rule.priceTo) || 999999,
        multiplier: Number(rule.multiplier) || 1,
        addToPrice: Number(rule.addToPrice) || 0,
      }))
      .sort((first, second) => first.priceFrom - second.priceFrom);
  } catch {
    return [];
  }
}

export function calculateRetailPrice(purchasePrice: number, rules: PriceRule[]): number {
  let markedUpPrice = purchasePrice;
  const matchingRule = rules.find(
    (rule) => purchasePrice >= rule.priceFrom && purchasePrice <= rule.priceTo
  );

  if (matchingRule) {
    markedUpPrice = purchasePrice * matchingRule.multiplier + matchingRule.addToPrice;
  }

  return roundPriceTo99(markedUpPrice);
}

export async function calculateManualRetailPrice(input: ManualPriceInput): Promise<ManualRetailPrice> {
  const wholesalerKey = await resolveWholesalerKey(
    input.baselinkerProductId,
    input.sku,
    input.tags
  );
  const rulesSetting = wholesalerKey
    ? await prisma.settings.findUnique({ where: { key: `price_rules_${wholesalerKey}` } })
    : null;

  return {
    purchasePrice: input.purchasePrice,
    wholesalerKey,
    retailPrice: calculateRetailPrice(input.purchasePrice, parseRules(rulesSetting?.value)),
  };
}

export async function calculateManualPricePreview(input: ManualPriceInput): Promise<ManualPricePreview> {
  const retail = await calculateManualRetailPrice(input);
  const partners = await prisma.user.findMany({
    where: { role: 'B2B_PARTNER', b2bStatus: { in: ['APPROVED', 'SUSPENDED'] } },
    select: {
      id: true,
      email: true,
      companyName: true,
      firstName: true,
      lastName: true,
      b2bPriceMultiplier: true,
      b2bWholesalerRules: true,
    },
  });

  const defaultB2bPrice = await calculateB2bPriceForProduct(
    retail.retailPrice,
    input.baselinkerProductId || null,
    input.sku || null,
    { multiplier: 1.1, wholesalerRules: {} },
    input.purchasePrice,
    input.tags
  );
  const partnerPrices = await Promise.all(
    partners.map(async (partner): Promise<PartnerPrice> => ({
      partnerId: partner.id,
      label: partner.companyName || `${partner.firstName} ${partner.lastName}`.trim() || partner.email,
      price: await calculateB2bPriceForProduct(
        retail.retailPrice,
        input.baselinkerProductId || null,
        input.sku || null,
        {
          multiplier: partner.b2bPriceMultiplier ? Number(partner.b2bPriceMultiplier) : 1.1,
          wholesalerRules: partner.b2bWholesalerRules || {},
        },
        input.purchasePrice,
        input.tags
      ),
    }))
  );
  const partnerPriceValues = partnerPrices.map((partner) => partner.price);

  return {
    purchasePrice: input.purchasePrice,
    wholesalerKey: retail.wholesalerKey,
    retailPrice: retail.retailPrice,
    defaultB2bPrice,
    partnerPrices,
    partnerB2bMinPrice: partnerPriceValues.length > 0 ? Math.min(...partnerPriceValues) : null,
    partnerB2bMaxPrice: partnerPriceValues.length > 0 ? Math.max(...partnerPriceValues) : null,
  };
}