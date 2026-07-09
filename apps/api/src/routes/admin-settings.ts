import { Router } from 'express';
import { prisma } from '../db';
import { invalidateCategoryCache } from '../lib/cache';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { salesRepService } from '../services/sales-rep.service';
import {
  getMlmConfig,
  saveMlmConfig,
  validateMlmConfig,
  computeOverridePctOfSale,
  computeTotalPayoutPctOfSale,
  DEFAULT_MLM_CONFIG,
  type MlmConfig,
} from '../services/mlm-config.service';
import { getRankConfig, saveRankConfig } from '../services/partner-rank.service';
import { roundMoney } from '../lib/currency';

// Reference base commission rate (% of sale) for the payout-ceiling preview/validation.
const MLM_BASE_COMMISSION_PCT = parseFloat(process.env.AFFILIATE_DEFAULT_COMMISSION_RATE || '7.00');

/**
 * Max Leader Bonus pool as % of sale (WBTP plan: Σ per-rank pools = 5%).
 * Worst case: one sale flows through leaders of every rank, each pool fully
 * paid out (base + WL addon). Share splits within a rank never exceed 100%.
 */
async function computeLeaderBonusMaxPct(): Promise<number> {
  const rankCfg = await getRankConfig();
  const { byRank, wlAddonPct } = rankCfg.leaderBonus;
  let total = 0;
  for (const params of Object.values(byRank)) {
    if (params) total += params.basePct + wlAddonPct;
  }
  return roundMoney(total);
}

const router = Router();

// All admin settings routes require authentication + admin role
router.use(authGuard, adminOnly);

// Helper to safely parse JSON string
const parseJsonValue = (value: string | null | undefined): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * POST /api/admin/settings/cache/clear-categories
 * Czyści cache kategorii w Redis (liczniki ofert)
 */
router.post('/cache/clear-categories', async (req, res) => {
  try {
    await invalidateCategoryCache();
    res.json({ success: true, message: 'Cache kategorii wyczyszczony' });
  } catch (error) {
    console.error('Error clearing category cache:', error);
    res.status(500).json({ message: 'Błąd podczas czyszczenia cache' });
  }
});

/**
 * GET /api/admin/settings/carousels
 * Get carousel settings
 */
router.get('/carousels', async (req, res) => {
  try {
    const [carouselSetting, exclusionsSetting] = await Promise.all([
      prisma.settings.findUnique({ where: { key: 'homepage_carousels' } }),
      prisma.settings.findUnique({ where: { key: 'carousel_exclusions' } }),
    ]);

    const carousels = parseJsonValue(carouselSetting?.value);
    const exclusions = parseJsonValue(exclusionsSetting?.value) as { excludedProductIds?: string[] } | null;

    res.json({
      carousels: carousels || {},
      excludedProductIds: exclusions?.excludedProductIds || [],
    });
  } catch (error) {
    console.error('Error fetching carousel settings:', error);
    res.status(500).json({ message: 'Error fetching settings' });
  }
});

/**
 * POST /api/admin/settings/carousels
 * Save carousel settings
 */
router.post('/carousels', async (req, res) => {
  try {
    const { carousels, excludedProductIds } = req.body;

    // Validate: deduplicate productIds and enforce max limit per carousel
    const MAX_PRODUCTS_PER_CAROUSEL = 50;
    const sanitizedCarousels: Record<string, any> = {};
    
    if (carousels && typeof carousels === 'object') {
      for (const [key, value] of Object.entries(carousels as Record<string, any>)) {
        const ids = value?.productIds;
        if (Array.isArray(ids)) {
          // Deduplicate and limit
          const uniqueIds = [...new Set(ids as string[])].slice(0, MAX_PRODUCTS_PER_CAROUSEL);
          sanitizedCarousels[key] = {
            ...value,
            productIds: uniqueIds,
          };
        } else {
          sanitizedCarousels[key] = value;
        }
      }
    }

    // Save carousels
    await prisma.settings.upsert({
      where: { key: 'homepage_carousels' },
      update: { value: JSON.stringify(sanitizedCarousels) },
      create: { key: 'homepage_carousels', value: JSON.stringify(sanitizedCarousels) },
    });

    // Save exclusions (deduplicated)
    if (excludedProductIds !== undefined) {
      const uniqueExcluded = Array.isArray(excludedProductIds)
        ? [...new Set(excludedProductIds as string[])]
        : [];
      await prisma.settings.upsert({
        where: { key: 'carousel_exclusions' },
        update: { value: JSON.stringify({ excludedProductIds: uniqueExcluded }) },
        create: { key: 'carousel_exclusions', value: JSON.stringify({ excludedProductIds: uniqueExcluded }) },
      });
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving carousel settings:', error);
    res.status(500).json({ message: 'Error saving settings' });
  }
});

/**
 * GET /api/admin/settings/sales-rep-config
 * Get sales rep settings config
 */
router.get('/sales-rep-config', async (req, res) => {
  try {
    const config = await salesRepService.getSalesRepConfig();
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error fetching sales rep settings:', error);
    res.status(500).json({ message: 'Błąd pobierania konfiguracji handlowca' });
  }
});

/**
 * POST /api/admin/settings/sales-rep-config
 * Save sales rep settings config with safety validation
 */
router.post('/sales-rep-config', async (req, res) => {
  try {
    const { baseCommissionPct, maxDiscountPct, minCompanyMarginPct, markupMultiplier, holdDays, blockAffiliation, modules, monthlyGoalAmount } = req.body;

    const base = Number(baseCommissionPct);
    const maxDiscount = Number(maxDiscountPct);
    const minMargin = Number(minCompanyMarginPct);
    const markup = Number(markupMultiplier);
    const hold = Number(holdDays);
    const goal = Number(monthlyGoalAmount ?? 5000);

    if (isNaN(base) || isNaN(maxDiscount) || isNaN(minMargin) || isNaN(markup) || isNaN(hold) || isNaN(goal)) {
      res.status(400).json({ message: 'Wszystkie parametry konfiguracji muszą być liczbami.' });
      return;
    }

    // Per-parameter bounds (the pool check alone lets e.g. base=-5 through).
    if (base < 0 || maxDiscount < 0 || minMargin < 0 || hold < 0 || goal < 0) {
      res.status(400).json({ message: 'Parametry prowizji/rabatu/marży/karencji/celu nie mogą być ujemne.' });
      return;
    }
    if (markup <= 1) {
      res.status(400).json({ message: 'Mnożnik marży (markupMultiplier) musi być większy niż 1.' });
      return;
    }

    const pool = base + maxDiscount;
    const maxPool = (markup - 1) * 100 - minMargin;

    if (pool > maxPool) {
      res.status(400).json({ 
        message: `Suma prowizji podstawowej (${base}%) i maksymalnego rabatu (${maxDiscount}%) wynosi ${pool}%, co przekracza limit bezpieczeństwa wynikający z marży firmy (${maxPool.toFixed(2)}%). Minimalny zysk firmy (${minMargin}%) nie zostałby zachowany.` 
      });
      return;
    }

    const configValue = {
      baseCommissionPct: base,
      maxDiscountPct: maxDiscount,
      minCompanyMarginPct: minMargin,
      markupMultiplier: markup,
      holdDays: hold,
      blockAffiliation: blockAffiliation !== undefined ? Boolean(blockAffiliation) : true,
      modules: {
        offerTemplates: modules?.offerTemplates !== undefined ? Boolean(modules.offerTemplates) : true,
        offerTracking: modules?.offerTracking !== undefined ? Boolean(modules.offerTracking) : true,
        leaderboard: modules?.leaderboard !== undefined ? Boolean(modules.leaderboard) : true,
      },
      monthlyGoalAmount: goal,
    };

    await prisma.settings.upsert({
      where: { key: 'sales_rep_config' },
      update: { value: JSON.stringify(configValue) },
      create: { key: 'sales_rep_config', value: JSON.stringify(configValue) }
    });

    // Clear cache
    salesRepService.clearCache();

    res.json({ success: true, message: 'Konfiguracja handlowca została zapisana.' });
  } catch (error) {
    console.error('Error saving sales rep settings:', error);
    res.status(500).json({ message: 'Błąd zapisu konfiguracji handlowca' });
  }
});

/**
 * GET /api/admin/settings/mlm-config
 * Zwraca aktualną konfigurację MLM + podgląd wypłaty jako % OD SPRZEDAŻY (baza + nadprowizje).
 */
router.get('/mlm-config', async (req, res) => {
  try {
    const config = await getMlmConfig();
    const baseCommissionPct = MLM_BASE_COMMISSION_PCT;
    const overridePctOfSale = computeOverridePctOfSale(config, baseCommissionPct);
    const leaderBonusMaxPctOfSale = await computeLeaderBonusMaxPct();
    const totalPayoutPctOfSale = roundMoney(
      computeTotalPayoutPctOfSale(config, baseCommissionPct) + leaderBonusMaxPctOfSale
    );
    res.json({ success: true, config, baseCommissionPct, overridePctOfSale, leaderBonusMaxPctOfSale, totalPayoutPctOfSale });
  } catch (error) {
    console.error('Error fetching MLM config:', error);
    res.status(500).json({ message: 'Błąd pobierania konfiguracji MLM' });
  }
});

/**
 * POST /api/admin/settings/mlm-config
 * Zapisuje konfigurację MLM po walidacji (stawki, sufit marży).
 *
 * Body: { enabled, maxDepth, overrideBase, overrideRatesPct, stopOnInactiveUpline, minMarginPct? }
 * minMarginPct — opcjonalne, przekazane z frontu (% minimalnej marży firmy) do walidacji sufitu.
 */
router.post('/mlm-config', async (req, res) => {
  try {
    const {
      enabled,
      maxDepth,
      overrideBase,
      overrideRatesPct,
      stopOnInactiveUpline,
      minMarginPct,
    } = req.body;

    const cfg: MlmConfig = {
      enabled: Boolean(enabled ?? DEFAULT_MLM_CONFIG.enabled),
      maxDepth: Number(maxDepth ?? DEFAULT_MLM_CONFIG.maxDepth),
      overrideBase: overrideBase ?? DEFAULT_MLM_CONFIG.overrideBase,
      overrideRatesPct: Array.isArray(overrideRatesPct)
        ? overrideRatesPct.map(Number)
        : DEFAULT_MLM_CONFIG.overrideRatesPct,
      stopOnInactiveUpline: Boolean(stopOnInactiveUpline ?? DEFAULT_MLM_CONFIG.stopOnInactiveUpline),
    };

    const minMargin = minMarginPct !== undefined ? Number(minMarginPct) : undefined;
    const { valid, errors } = validateMlmConfig(cfg, minMargin, MLM_BASE_COMMISSION_PCT);

    if (!valid) {
      res.status(400).json({ message: errors.join(' '), errors });
      return;
    }

    await saveMlmConfig(cfg);

    const leaderBonusMaxPctOfSale = await computeLeaderBonusMaxPct();
    res.json({
      success: true,
      message: 'Konfiguracja MLM zapisana.',
      config: cfg,
      baseCommissionPct: MLM_BASE_COMMISSION_PCT,
      overridePctOfSale: computeOverridePctOfSale(cfg, MLM_BASE_COMMISSION_PCT),
      leaderBonusMaxPctOfSale,
      totalPayoutPctOfSale: roundMoney(
        computeTotalPayoutPctOfSale(cfg, MLM_BASE_COMMISSION_PCT) + leaderBonusMaxPctOfSale
      ),
    });
  } catch (error) {
    console.error('Error saving MLM config:', error);
    res.status(500).json({ message: 'Błąd zapisu konfiguracji MLM' });
  }
});

/**
 * GET /api/admin/settings/rank-config
 * Konfiguracja rang WBTP (progi awansów, limity linii, Premia Liderów).
 */
router.get('/rank-config', async (req, res) => {
  try {
    const config = await getRankConfig();
    const leaderBonusMaxPctOfSale = await computeLeaderBonusMaxPct();
    res.json({ success: true, config, leaderBonusMaxPctOfSale });
  } catch (error) {
    console.error('Error fetching rank config:', error);
    res.status(500).json({ message: 'Błąd pobierania konfiguracji rang' });
  }
});

/**
 * POST /api/admin/settings/rank-config
 * Zapis konfiguracji rang WBTP (pełny obiekt RankConfig).
 */
router.post('/rank-config', async (req, res) => {
  try {
    const cfg = req.body?.config;
    if (!cfg || typeof cfg !== 'object' || !cfg.ranks || !cfg.teamLevelByRank || !cfg.leaderBonus) {
      res.status(400).json({ message: 'Nieprawidłowa konfiguracja rang (wymagane: ranks, teamLevelByRank, leaderBonus).' });
      return;
    }

    // Sanity checks
    const errors: string[] = [];
    for (const [rank, level] of Object.entries(cfg.teamLevelByRank)) {
      const n = Number(level);
      if (!Number.isInteger(n) || n < 1 || n > 4) {
        errors.push(`teamLevelByRank.${rank}: poziom musi być liczbą 1-4.`);
      }
    }
    for (const [rank, params] of Object.entries(cfg.leaderBonus.byRank ?? {})) {
      const p = params as any;
      if (typeof p?.basePct !== 'number' || p.basePct < 0 || p.basePct > 5) {
        errors.push(`leaderBonus.byRank.${rank}.basePct: musi być liczbą 0-5.`);
      }
      if (typeof p?.wlRequirement !== 'number' || p.wlRequirement < 0) {
        errors.push(`leaderBonus.byRank.${rank}.wlRequirement: musi być liczbą >= 0.`);
      }
    }
    const conf = Number(cfg.confirmationsToConsolidate);
    if (!Number.isInteger(conf) || conf < 1 || conf > 12) {
      errors.push('confirmationsToConsolidate: musi być liczbą 1-12.');
    }
    if (errors.length > 0) {
      res.status(400).json({ message: errors.join(' '), errors });
      return;
    }

    await saveRankConfig(cfg);
    const leaderBonusMaxPctOfSale = await computeLeaderBonusMaxPct();
    res.json({ success: true, message: 'Konfiguracja rang zapisana.', config: cfg, leaderBonusMaxPctOfSale });
  } catch (error) {
    console.error('Error saving rank config:', error);
    res.status(500).json({ message: 'Błąd zapisu konfiguracji rang' });
  }
});

/**
 * GET /api/admin/settings/:key
 * Get a specific setting
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await prisma.settings.findUnique({
      where: { key },
    });

    if (!setting) {
      res.status(404).json({ message: 'Setting not found' });
      return;
    }

    res.json({ key: setting.key, value: parseJsonValue(setting.value) });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ message: 'Error fetching setting' });
  }
});

/**
 * POST /api/admin/settings/:key
 * Save a specific setting
 */
router.post('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    await prisma.settings.upsert({
      where: { key },
      update: { value: stringValue },
      create: { key, value: stringValue },
    });

    res.json({ success: true, message: 'Setting saved successfully' });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ message: 'Error saving setting' });
  }
});

export default router;
