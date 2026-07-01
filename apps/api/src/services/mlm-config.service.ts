/**
 * MLM Config Service
 *
 * Loads and caches the `affiliate_mlm_config` Settings key.
 * Pattern mirrors getSalesRepConfig (cache + fallback).
 *
 * ⚠️  LEGAL GATE: `enabled` is FALSE by default.
 *     Do NOT set enabled=true on production without a written legal opinion (UOKiK risk).
 */

import { prisma } from '../db';
import { roundMoney } from '../lib/currency';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OverrideBase =
  | 'downline_commission'  // O_d = rate_d% × O_{d-1}  (cascade, default)
  | 'seller_commission'    // O_d = rate_d% × C_S        (flat from seller)
  | 'sale_base';           // O_d = rate_d% × saleBase   (flat from gross)

export interface MlmConfig {
  enabled: boolean;
  maxDepth: number;
  overrideBase: OverrideBase;
  /** Rate per level (index 0 = level 1 = seller's parent). If levels > array length, last value is used (or 0 if array is empty). */
  overrideRatesPct: number[];
  /** If true: stop chain at first upline that is not APPROVED (no compression). Recommended conservative default. */
  stopOnInactiveUpline: boolean;
}

const DEFAULT_MLM_CONFIG: MlmConfig = {
  enabled: false,
  maxDepth: 5,
  overrideBase: 'downline_commission',
  overrideRatesPct: [10, 5, 3, 2, 1],
  stopOnInactiveUpline: true,
};

const SETTINGS_KEY = 'affiliate_mlm_config';
const CACHE_TTL_MS = 60_000; // 60 s

// ─── Cache ───────────────────────────────────────────────────────────────────

let cachedConfig: MlmConfig | null = null;
let cacheExpiresAt = 0;

function invalidateCache() {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Cascade sum for downline_commission mode, as a FRACTION of the primary commission C_S:
 *   Σ_d=1^maxDepth  Π_{i=1..d} (rate_i / 100)
 * e.g. rates [10,5] → 0.10 + 0.10*0.05 = 0.105.
 */
function cascadeSumFraction(cfg: MlmConfig): number {
  const rates = cfg.overrideRatesPct;
  let multiplier = 1;
  let total = 0;
  for (let d = 0; d < cfg.maxDepth; d++) {
    const r = (rates[d] ?? rates[rates.length - 1] ?? 0) / 100;
    multiplier *= r;
    total += multiplier;
    if (multiplier <= 0) break;
  }
  return total;
}

/** Sum of per-level rates (%), used for seller_commission / sale_base modes. */
function flatRateSum(cfg: MlmConfig): number {
  const rates = cfg.overrideRatesPct;
  let total = 0;
  for (let d = 0; d < cfg.maxDepth; d++) {
    total += rates[d] ?? rates[rates.length - 1] ?? 0;
  }
  return total;
}

/**
 * Override cost from a single sale, expressed as % OF SALE (not % of commission).
 * Requires the reference base commission rate (% of sale) because cascade/seller modes
 * derive from the seller's commission C_S = baseCommissionPct% of sale.
 *   downline_commission: baseCommissionPct × Σ(Π rate_i/100)
 *   seller_commission:   baseCommissionPct × (Σ rate_d)/100
 *   sale_base:           Σ rate_d            (already % of sale)
 */
export function computeOverridePctOfSale(cfg: MlmConfig, baseCommissionPct: number): number {
  const rates = cfg.overrideRatesPct;
  if (!rates.length || cfg.maxDepth === 0) return 0;

  if (cfg.overrideBase === 'downline_commission') {
    return roundMoney(baseCommissionPct * cascadeSumFraction(cfg));
  }
  if (cfg.overrideBase === 'seller_commission') {
    return roundMoney((baseCommissionPct * flatRateSum(cfg)) / 100);
  }
  // sale_base — rates are already % of the sale
  return roundMoney(flatRateSum(cfg));
}

/**
 * Total partner payout from a single sale as % OF SALE: base commission + all overrides.
 * This is what must fit under the company margin.
 */
export function computeTotalPayoutPctOfSale(cfg: MlmConfig, baseCommissionPct: number): number {
  return roundMoney(baseCommissionPct + computeOverridePctOfSale(cfg, baseCommissionPct));
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate MLM config.
 * @param cfg                Config to validate.
 * @param minMarginPct       Minimum required company margin % (of sale). When provided
 *                           together with baseCommissionPct, the payout-ceiling check runs.
 * @param baseCommissionPct  Reference base commission % of sale (default partner rate).
 *                           Needed to express override cost as % of sale for the ceiling.
 */
export function validateMlmConfig(
  cfg: MlmConfig,
  minMarginPct?: number,
  baseCommissionPct?: number,
): ValidationResult {
  const errors: string[] = [];

  if (cfg.maxDepth < 0 || cfg.maxDepth > 10) {
    errors.push('maxDepth musi być z zakresu 0–10.');
  }
  if (!Array.isArray(cfg.overrideRatesPct)) {
    errors.push('overrideRatesPct musi być tablicą liczb.');
  } else if (cfg.overrideRatesPct.some((r) => typeof r !== 'number' || r < 0 || r > 100)) {
    errors.push('Każda stawka w overrideRatesPct musi być liczbą z zakresu 0–100.');
  }
  if (!['downline_commission', 'seller_commission', 'sale_base'].includes(cfg.overrideBase)) {
    errors.push('overrideBase musi być jedną z: downline_commission, seller_commission, sale_base.');
  }

  if (errors.length === 0 && minMarginPct !== undefined && baseCommissionPct !== undefined) {
    // Compare TOTAL partner payout (base + overrides), expressed as % OF SALE, against margin.
    const base = baseCommissionPct;
    const overridePct = computeOverridePctOfSale(cfg, base);
    const totalPct = roundMoney(base + overridePct);
    if (totalPct > minMarginPct) {
      errors.push(
        `Łączna wypłata partnerska (${totalPct.toFixed(2)}% od sprzedaży = baza ${base}% + nadprowizje ${overridePct.toFixed(2)}%) przekracza zadeklarowaną marżę firmy (${minMarginPct}%). Zmniejsz stawki, ogranicz maxDepth lub podnieś marżę.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the current MLM config with 60-second cache.
 * Falls back to DEFAULT_MLM_CONFIG (enabled=false) on any error.
 */
export async function getMlmConfig(): Promise<MlmConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  try {
    const setting = await prisma.settings.findUnique({ where: { key: SETTINGS_KEY } });
    if (setting?.value) {
      const parsed = JSON.parse(setting.value) as Partial<MlmConfig>;
      cachedConfig = {
        ...DEFAULT_MLM_CONFIG,
        ...parsed,
        // Ensure correct types
        enabled: Boolean(parsed.enabled ?? DEFAULT_MLM_CONFIG.enabled),
        maxDepth: Number(parsed.maxDepth ?? DEFAULT_MLM_CONFIG.maxDepth),
        overrideRatesPct: Array.isArray(parsed.overrideRatesPct)
          ? parsed.overrideRatesPct.map(Number)
          : DEFAULT_MLM_CONFIG.overrideRatesPct,
        stopOnInactiveUpline: Boolean(parsed.stopOnInactiveUpline ?? DEFAULT_MLM_CONFIG.stopOnInactiveUpline),
      };
    } else {
      cachedConfig = { ...DEFAULT_MLM_CONFIG };
    }
  } catch {
    cachedConfig = { ...DEFAULT_MLM_CONFIG };
  }

  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedConfig;
}

/**
 * Save a new MLM config and invalidate the cache.
 * Does NOT validate — call validateMlmConfig first.
 */
export async function saveMlmConfig(cfg: MlmConfig): Promise<void> {
  await prisma.settings.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(cfg) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(cfg) },
  });
  invalidateCache();
}

export { DEFAULT_MLM_CONFIG };
