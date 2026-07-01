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
 * Compute the maximum total payout percentage from a single sale, given current config.
 * For cascade (downline_commission): geometric series
 *   Σ_d=1^maxDepth  product_{i=1}^{d} (rate_i / 100)
 * expressed as % of primary commission C_S.
 * For seller_commission / sale_base: Σ rate_d (flat sum).
 *
 * Returns a percentage number, e.g. 15.5 means 15.5% additional payout per sale.
 */
export function computeMaxOverridePct(cfg: MlmConfig): number {
  const rates = cfg.overrideRatesPct;
  if (rates.length === 0 || cfg.maxDepth === 0) return 0;

  if (cfg.overrideBase === 'downline_commission') {
    // Cascade: level 1 = rates[0]/100 of C_S, level 2 = rates[1]/100 of level 1, …
    // All expressed as % of C_S for ceiling comparison.
    let multiplier = 1;
    let total = 0;
    for (let d = 0; d < cfg.maxDepth; d++) {
      const r = (rates[d] ?? rates[rates.length - 1] ?? 0) / 100;
      multiplier *= r;
      total += multiplier;
      if (multiplier <= 0) break;
    }
    return roundMoney(total * 100); // as % of C_S
  }

  // seller_commission or sale_base — flat sum of rates per level
  let total = 0;
  for (let d = 0; d < cfg.maxDepth; d++) {
    total += rates[d] ?? rates[rates.length - 1] ?? 0;
  }
  return roundMoney(total);
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate MLM config.
 * @param cfg           Config to validate.
 * @param minMarginPct  Minimum required company margin % (e.g. 10 for 10%).
 *                      When provided, the ceiling check is applied.
 */
export function validateMlmConfig(cfg: MlmConfig, minMarginPct?: number): ValidationResult {
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

  if (errors.length === 0 && minMarginPct !== undefined) {
    const maxOverridePct = computeMaxOverridePct(cfg);
    // Primary commission is part of the margin — we only check that overrides don't dwarf it.
    // The safety guard: total override payout (as % of C_S) should not exceed the margin ceiling.
    // Rough guard: override % of sale_base should be <= margin. Use as informational, not hard block.
    if (maxOverridePct > minMarginPct) {
      errors.push(
        `Łączny maks. % nadprowizji (${maxOverridePct.toFixed(2)}%) przekracza minimalną marżę firmy (${minMarginPct}%). Zmniejsz stawki lub ogranicz maxDepth.`
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
