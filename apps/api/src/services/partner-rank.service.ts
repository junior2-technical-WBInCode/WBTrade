/**
 * Partner Rank Service — WB TRADE PARTNERS (PLAN_03 / PR-5)
 *
 * Rank ("poziom awansu") configuration + monthly promotion engine.
 *
 * Rules (per the WB TRADE PARTNERS plan):
 * - 7 ranks: AKTYWNY_PARTNER → ... → DYREKTOR_GENERALNY, promotion 1 level at a time.
 * - Each rank has up to 3 qualification paths (own sales / mixed / structure).
 * - Structure-based paths are subject to a max single-line share of the
 *   qualification turnover (60% → 25%).
 * - Confirmation flow: promotion → confirmed in following periods; after
 *   2 confirmations the rank is consolidated (highestRank) and never drops.
 * - Everything runs behind the MLM legal gate (affiliate_mlm_config.enabled).
 *
 * Config stored in Settings key `affiliate_rank_config` (JSON, admin-editable),
 * fallback defaults below. Also carries the team-commission level range per rank
 * (used by the walk-up, PR-6) and Leader Bonus parameters (PR-7).
 */

import { PartnerRank, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { partnerVolumeService, WL_THRESHOLDS } from './partner-volume.service';

// ─── Rank ordering ────────────────────────────────────────────────────────────

export const RANK_ORDER: PartnerRank[] = [
  'AKTYWNY_PARTNER',
  'AMBASADOR',
  'LIDER_ZESPOLU',
  'MENEDZER',
  'DYREKTOR_REGIONALNY',
  'DYREKTOR_KRAJOWY',
  'DYREKTOR_GENERALNY',
];

export function rankIndex(rank: PartnerRank): number {
  return RANK_ORDER.indexOf(rank);
}

export function nextRank(rank: PartnerRank): PartnerRank | null {
  const idx = rankIndex(rank);
  return idx >= 0 && idx < RANK_ORDER.length - 1 ? RANK_ORDER[idx + 1] : null;
}

/** Is rank a >= rank b in the hierarchy? */
export function rankAtLeast(a: PartnerRank, b: PartnerRank): boolean {
  return rankIndex(a) >= rankIndex(b);
}

// ─── Config types ─────────────────────────────────────────────────────────────

export interface RankPath {
  /** Monthly own qualified sales (PLN) */
  ownSales?: number;
  /** Monthly level-1 qualified sales (PLN) */
  level1Sales?: number;
  /** Monthly level-1+2 qualified sales (PLN) */
  level12Sales?: number;
  /** Monthly whole-structure qualified sales (PLN) */
  structureSales?: number;
  /** Min. N lines each with WL >= amount */
  minLines?: { count: number; wl: number };
  /** Min. N separate lines each containing a partner of at least given rank */
  minRankInLines?: { rank: PartnerRank; count: number } | { anyOf: Array<{ rank: PartnerRank; count: number }> };
}

export interface RankRequirements {
  paths: RankPath[];
  /** Max share (%) of the largest line in the qualification structure turnover */
  maxLineSharePct: number;
}

export interface LeaderBonusRankParams {
  /** Base leader bonus pool, % of qualified order turnover (e.g. 0.25) */
  basePct: number;
  /** WL threshold (PLN) unlocking the +addon */
  wlRequirement: number;
}

export interface RankConfig {
  ranks: Partial<Record<PartnerRank, RankRequirements>>;
  confirmationsToConsolidate: number;
  /** Team commission depth available per rank (PR-6): rank → max level (1-4) */
  teamLevelByRank: Record<PartnerRank, number>;
  /** Leader Bonus (PR-7): per-rank pool + WL addon */
  leaderBonus: {
    /** WL addon size in % of turnover (PDF: +0.25) */
    wlAddonPct: number;
    /** Share split when multiple same-rank leaders sit in one line (PDF: 60/30/10) */
    shareSplitPct: number[];
    byRank: Partial<Record<PartnerRank, LeaderBonusRankParams>>;
  };
}

// Defaults = the WB TRADE PARTNERS plan (PDF pages 9-15, 6, 18)
export const DEFAULT_RANK_CONFIG: RankConfig = {
  confirmationsToConsolidate: 2,
  ranks: {
    AMBASADOR: {
      paths: [
        { ownSales: 20_000 },
        { ownSales: 8_000, level1Sales: 30_000 },
        { level1Sales: 60_000, minLines: { count: 3, wl: WL_THRESHOLDS.WL10 } },
      ],
      maxLineSharePct: 60,
    },
    LIDER_ZESPOLU: {
      paths: [
        { ownSales: 50_000 },
        { ownSales: 20_000, level12Sales: 80_000 },
        { level12Sales: 150_000, minLines: { count: 4, wl: WL_THRESHOLDS.WL25 }, minRankInLines: { rank: 'AMBASADOR', count: 1 } },
      ],
      maxLineSharePct: 50,
    },
    MENEDZER: {
      paths: [
        { ownSales: 120_000 },
        { ownSales: 40_000, structureSales: 250_000 },
        { structureSales: 600_000, minLines: { count: 5, wl: WL_THRESHOLDS.WL50 }, minRankInLines: { rank: 'LIDER_ZESPOLU', count: 2 } },
      ],
      maxLineSharePct: 45,
    },
    DYREKTOR_REGIONALNY: {
      paths: [
        { ownSales: 250_000 },
        { ownSales: 75_000, structureSales: 750_000 },
        { structureSales: 1_500_000, minLines: { count: 6, wl: WL_THRESHOLDS.WL100 }, minRankInLines: { rank: 'MENEDZER', count: 2 } },
      ],
      maxLineSharePct: 35,
    },
    DYREKTOR_KRAJOWY: {
      paths: [
        { ownSales: 500_000 },
        { ownSales: 150_000, structureSales: 1_500_000 },
        { structureSales: 2_750_000, minLines: { count: 7, wl: WL_THRESHOLDS.WL250 }, minRankInLines: { rank: 'DYREKTOR_REGIONALNY', count: 2 } },
      ],
      maxLineSharePct: 30,
    },
    DYREKTOR_GENERALNY: {
      paths: [
        { ownSales: 1_000_000 },
        { ownSales: 250_000, structureSales: 2_500_000 },
        {
          structureSales: 4_000_000,
          minLines: { count: 8, wl: WL_THRESHOLDS.WL250 },
          minRankInLines: { anyOf: [{ rank: 'DYREKTOR_KRAJOWY', count: 2 }, { rank: 'DYREKTOR_REGIONALNY', count: 4 }] },
        },
      ],
      maxLineSharePct: 25,
    },
  },
  teamLevelByRank: {
    AKTYWNY_PARTNER: 1,
    AMBASADOR: 2,
    LIDER_ZESPOLU: 3,
    MENEDZER: 4,
    DYREKTOR_REGIONALNY: 4,
    DYREKTOR_KRAJOWY: 4,
    DYREKTOR_GENERALNY: 4,
  },
  leaderBonus: {
    wlAddonPct: 0.25,
    shareSplitPct: [60, 30, 10],
    byRank: {
      LIDER_ZESPOLU: { basePct: 0.25, wlRequirement: WL_THRESHOLDS.WL25 },
      MENEDZER: { basePct: 0.5, wlRequirement: WL_THRESHOLDS.WL50 },
      DYREKTOR_REGIONALNY: { basePct: 0.75, wlRequirement: WL_THRESHOLDS.WL100 },
      DYREKTOR_KRAJOWY: { basePct: 1.0, wlRequirement: WL_THRESHOLDS.WL250 },
      DYREKTOR_GENERALNY: { basePct: 1.25, wlRequirement: WL_THRESHOLDS.WL500 },
    },
  },
};

const SETTINGS_KEY = 'affiliate_rank_config';
const CACHE_TTL_MS = 60_000;

let cachedConfig: RankConfig | null = null;
let cacheExpiresAt = 0;

export function invalidateRankConfigCache() {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

export async function getRankConfig(): Promise<RankConfig> {
  if (cachedConfig && Date.now() < cacheExpiresAt) return cachedConfig;
  try {
    const row = await prisma.settings.findUnique({ where: { key: SETTINGS_KEY } });
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      cachedConfig = {
        ...DEFAULT_RANK_CONFIG,
        ...parsed,
        ranks: { ...DEFAULT_RANK_CONFIG.ranks, ...(parsed.ranks ?? {}) },
        teamLevelByRank: { ...DEFAULT_RANK_CONFIG.teamLevelByRank, ...(parsed.teamLevelByRank ?? {}) },
        leaderBonus: {
          ...DEFAULT_RANK_CONFIG.leaderBonus,
          ...(parsed.leaderBonus ?? {}),
          byRank: { ...DEFAULT_RANK_CONFIG.leaderBonus.byRank, ...(parsed.leaderBonus?.byRank ?? {}) },
        },
      };
    } else {
      cachedConfig = DEFAULT_RANK_CONFIG;
    }
  } catch (err) {
    console.error('[RankConfig] Failed to load, using defaults:', err);
    cachedConfig = DEFAULT_RANK_CONFIG;
  }
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedConfig!;
}

export async function saveRankConfig(cfg: RankConfig): Promise<void> {
  await prisma.settings.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(cfg) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(cfg) },
  });
  invalidateRankConfigCache();
}

// ─── Promotion engine ─────────────────────────────────────────────────────────

interface PartnerEvalRow {
  id: string;
  rank: PartnerRank;
  highestRank: PartnerRank;
  rankConfirmations: number;
  parentPartnerId: string | null;
}

interface EvalContext {
  period: string;
  cfg: RankConfig;
  volumes: Map<string, { ownSales: number; level1Sales: number; level2Sales: number; structureSales: number }>;
  /** partnerId → line volumes [{ linePartnerId, volume }] desc */
  lines: Map<string, Array<{ linePartnerId: string; volume: number }>>;
  /** nodeId → highest consolidated rank found in subtree (incl. self) */
  maxRankInSubtree: Map<string, PartnerRank>;
}

export class PartnerRankService {
  /**
   * Evaluate ranks for all APPROVED partners for a (closed) period.
   * Returns counts of events emitted. Idempotency: safe to re-run — events are
   * appended, but rank state transitions are deterministic, so a re-run on the
   * same closed period is a no-op for already-promoted/confirmed partners
   * (they simply re-confirm; consolidation is capped).
   */
  async evaluatePeriod(period: string): Promise<{ promotions: number; confirmations: number; consolidations: number; resets: number }> {
    const cfg = await getRankConfig();

    const partners: PartnerEvalRow[] = await prisma.partnerProfile.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, rank: true, highestRank: true, rankConfirmations: true, parentPartnerId: true },
    });

    // All partners (any status) for subtree rank scan — a suspended member still
    // holds their consolidated rank inside a line.
    const allNodes = await prisma.partnerProfile.findMany({
      select: { id: true, parentPartnerId: true, highestRank: true },
    });

    const volumeRows = await prisma.partnerMonthlyVolume.findMany({ where: { period } });
    const lineRows = await prisma.partnerLineVolume.findMany({ where: { period } });

    const ctx: EvalContext = {
      period,
      cfg,
      volumes: new Map(
        volumeRows.map((v) => [
          v.partnerId,
          {
            ownSales: Number(v.ownSales),
            level1Sales: Number(v.level1Sales),
            level2Sales: Number(v.level2Sales),
            structureSales: Number(v.structureSales),
          },
        ])
      ),
      lines: new Map(),
      maxRankInSubtree: this.computeMaxRankInSubtrees(allNodes),
    };
    for (const r of lineRows) {
      const arr = ctx.lines.get(r.partnerId) ?? [];
      arr.push({ linePartnerId: r.linePartnerId, volume: Number(r.volume) });
      ctx.lines.set(r.partnerId, arr);
    }

    const stats = { promotions: 0, confirmations: 0, consolidations: 0, resets: 0 };

    for (const p of partners) {
      const target = nextRank(p.rank);

      // 1) Try promotion (one level up only)
      if (target && this.meetsRank(p, target, ctx)) {
        await prisma.$transaction([
          prisma.partnerProfile.update({
            where: { id: p.id },
            data: { rank: target, rankConfirmations: 0, rankAchievedAt: new Date() },
          }),
          prisma.partnerRankEvent.create({
            data: { partnerId: p.id, period, fromRank: p.rank, toRank: target, type: 'PROMOTION', details: this.pathDetails(p, target, ctx) as Prisma.InputJsonValue },
          }),
        ]);
        stats.promotions++;
        continue;
      }

      // 2) Unconsolidated rank → confirm or reset
      const isUnconsolidated = rankIndex(p.rank) > rankIndex(p.highestRank);
      if (isUnconsolidated) {
        if (this.meetsRank(p, p.rank, ctx)) {
          const confirmations = p.rankConfirmations + 1;
          const consolidate = confirmations >= cfg.confirmationsToConsolidate;
          await prisma.$transaction([
            prisma.partnerProfile.update({
              where: { id: p.id },
              data: consolidate
                ? { rankConfirmations: confirmations, highestRank: p.rank }
                : { rankConfirmations: confirmations },
            }),
            prisma.partnerRankEvent.create({
              data: {
                partnerId: p.id,
                period,
                fromRank: p.rank,
                toRank: p.rank,
                type: consolidate ? 'CONSOLIDATION' : 'CONFIRMATION',
                details: { confirmations } as Prisma.InputJsonValue,
              },
            }),
          ]);
          consolidate ? stats.consolidations++ : stats.confirmations++;
        } else {
          // Falls back to the consolidated level (never below highestRank)
          await prisma.$transaction([
            prisma.partnerProfile.update({
              where: { id: p.id },
              data: { rank: p.highestRank, rankConfirmations: 0 },
            }),
            prisma.partnerRankEvent.create({
              data: { partnerId: p.id, period, fromRank: p.rank, toRank: p.highestRank, type: 'RESET' },
            }),
          ]);
          stats.resets++;
        }
      }
      // 3) Consolidated and no promotion → no change
    }

    console.log(
      `[RankEngine] Period ${period}: ${stats.promotions} promotions, ${stats.confirmations} confirmations, ` +
      `${stats.consolidations} consolidations, ${stats.resets} resets`
    );
    return stats;
  }

  // ─── Requirement checks ─────────────────────────────────────────────────────

  /** Does partner meet ANY qualification path of the given rank? */
  meetsRank(p: PartnerEvalRow, rank: PartnerRank, ctx: EvalContext): boolean {
    const req = ctx.cfg.ranks[rank];
    if (!req) return rank === 'AKTYWNY_PARTNER'; // base rank has no requirements
    return req.paths.some((path) => this.meetsPath(p, path, req.maxLineSharePct, ctx));
  }

  private meetsPath(p: PartnerEvalRow, path: RankPath, maxLineSharePct: number, ctx: EvalContext): boolean {
    const vol = ctx.volumes.get(p.id) ?? { ownSales: 0, level1Sales: 0, level2Sales: 0, structureSales: 0 };

    if (path.ownSales !== undefined && vol.ownSales < path.ownSales) return false;
    if (path.level1Sales !== undefined && vol.level1Sales < path.level1Sales) return false;
    if (path.level12Sales !== undefined && vol.level1Sales + vol.level2Sales < path.level12Sales) return false;
    if (path.structureSales !== undefined && vol.structureSales < path.structureSales) return false;

    const lines = ctx.lines.get(p.id) ?? [];

    if (path.minLines) {
      const meeting = lines.filter((l) => l.volume >= path.minLines!.wl).length;
      if (meeting < path.minLines.count) return false;
    }

    if (path.minRankInLines) {
      const countLinesWithRank = (rank: PartnerRank) =>
        lines.filter((l) => {
          const maxRank = ctx.maxRankInSubtree.get(l.linePartnerId);
          return maxRank !== undefined && rankAtLeast(maxRank, rank);
        }).length;

      if ('anyOf' in path.minRankInLines) {
        const ok = path.minRankInLines.anyOf.some((r) => countLinesWithRank(r.rank) >= r.count);
        if (!ok) return false;
      } else {
        if (countLinesWithRank(path.minRankInLines.rank) < path.minRankInLines.count) return false;
      }
    }

    // Diversification: max share of the largest line in the structure turnover.
    // Applies only to paths that rely on team/structure turnover (own-sales-only paths are exempt).
    const usesStructure =
      path.level1Sales !== undefined || path.level12Sales !== undefined || path.structureSales !== undefined;
    if (usesStructure && vol.structureSales > 0 && lines.length > 0) {
      const largest = Math.max(...lines.map((l) => l.volume));
      const sharePct = (largest / vol.structureSales) * 100;
      if (sharePct > maxLineSharePct) return false;
    }

    return true;
  }

  /** Details of the first satisfied path (for the audit event). */
  private pathDetails(p: PartnerEvalRow, rank: PartnerRank, ctx: EvalContext): Record<string, unknown> {
    const req = ctx.cfg.ranks[rank];
    const vol = ctx.volumes.get(p.id);
    const pathIdx = req ? req.paths.findIndex((path) => this.meetsPath(p, path, req.maxLineSharePct, ctx)) : -1;
    return { satisfiedPathIndex: pathIdx, volumes: vol ?? null };
  }

  /**
   * For each node: highest consolidated rank (highestRank) found in its subtree,
   * including the node itself. Iterative bottom-up with cycle guard.
   */
  private computeMaxRankInSubtrees(
    nodes: Array<{ id: string; parentPartnerId: string | null; highestRank: PartnerRank }>
  ): Map<string, PartnerRank> {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const children = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.parentPartnerId && byId.has(n.parentPartnerId)) {
        const arr = children.get(n.parentPartnerId) ?? [];
        arr.push(n.id);
        children.set(n.parentPartnerId, arr);
      }
    }

    const result = new Map<string, PartnerRank>();
    for (const n of nodes) {
      if (result.has(n.id)) continue;
      const stack: Array<{ id: string; childIdx: number }> = [{ id: n.id, childIdx: 0 }];
      const inStack = new Set<string>([n.id]);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const kids = children.get(frame.id) ?? [];
        if (frame.childIdx < kids.length) {
          const childId = kids[frame.childIdx++];
          if (inStack.has(childId) || result.has(childId)) continue;
          stack.push({ id: childId, childIdx: 0 });
          inStack.add(childId);
        } else {
          let best = byId.get(frame.id)!.highestRank;
          for (const childId of kids) {
            const childBest = result.get(childId);
            if (childBest && rankIndex(childBest) > rankIndex(best)) best = childBest;
          }
          result.set(frame.id, best);
          inStack.delete(frame.id);
          stack.pop();
        }
      }
    }
    return result;
  }
}

export const partnerRankService = new PartnerRankService();
