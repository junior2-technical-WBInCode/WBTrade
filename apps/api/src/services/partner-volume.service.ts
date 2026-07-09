/**
 * Partner Volume Service — WB TRADE PARTNERS (PLAN_03 / PR-4)
 *
 * Computes monthly qualified turnover ("obrót kwalifikowany") and
 * Line Volumes (Wolumen Linii, WL) for the partner structure.
 *
 * Definitions (per the WB TRADE PARTNERS plan):
 * - Qualified turnover = paid, non-returned order turnover attributed via
 *   referral links: order.subtotal − order.discount (gross, no shipping).
 *   Source: Referral records with status PAID or APPROVED (PENDING = unpaid,
 *   CANCELLED = returned/cancelled — both excluded).
 * - Line ("linia partnerska") = a directly invited partner (line root) plus
 *   their entire downline structure.
 * - WL (line volume) = monthly qualified turnover of one line
 *   (root's own sales + root's whole structure sales).
 *
 * Strategy: full recompute of a period (idempotent), invoked by the daily
 * affiliate cron. Corrections (returns/cancellations) are picked up naturally
 * because CANCELLED referrals simply drop out of the recompute.
 */

import { prisma } from '../db';
import { roundMoney } from '../lib/currency';

// WL thresholds (PDF: WL10…WL1000) — monthly turnover in PLN
export const WL_THRESHOLDS = {
  WL10: 10_000,
  WL25: 25_000,
  WL50: 50_000,
  WL100: 100_000,
  WL250: 250_000,
  WL500: 500_000,
  WL1000: 1_000_000,
} as const;

export type WlThresholdKey = keyof typeof WL_THRESHOLDS;

/** Current period key, e.g. "2026-07" */
export function currentPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** Previous (closed) period key relative to a date */
export function previousPeriod(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

interface PartnerNode {
  id: string;
  parentPartnerId: string | null;
}

interface VolumeAggregates {
  ownSales: number;
  level1Sales: number;
  level2Sales: number;
  structureSales: number;
}

export class PartnerVolumeService {
  /**
   * Recompute monthly volumes (own/L1/L2/structure) and line volumes (WL)
   * for ALL partners for the given period. Idempotent full recompute.
   */
  async recomputeMonthlyVolumes(period: string): Promise<{ partners: number; lines: number }> {
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month || month < 1 || month > 12) {
      throw new Error(`[PartnerVolume] Invalid period: ${period} (expected YYYY-MM)`);
    }
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    // 1. Load full partner graph (id + parent) — statuses don't matter for volume,
    //    turnover of suspended partners still counts toward upline structure totals.
    const partners: PartnerNode[] = await prisma.partnerProfile.findMany({
      select: { id: true, parentPartnerId: true },
    });
    const byId = new Map(partners.map((p) => [p.id, p]));

    // 2. Own qualified sales per partner: PAID/APPROVED referrals in period.
    const referrals = await prisma.referral.findMany({
      where: {
        status: { in: ['PAID', 'APPROVED'] },
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      select: {
        partnerId: true,
        order: { select: { subtotal: true, discount: true } },
      },
    });

    const ownSales = new Map<string, number>();
    for (const r of referrals) {
      const base = Number(r.order.subtotal) - Number(r.order.discount);
      if (base <= 0) continue;
      ownSales.set(r.partnerId, roundMoney((ownSales.get(r.partnerId) ?? 0) + base));
    }

    // 3. Build children map (skip nodes whose parent doesn't exist).
    const children = new Map<string, string[]>();
    for (const p of partners) {
      if (p.parentPartnerId && byId.has(p.parentPartnerId)) {
        const arr = children.get(p.parentPartnerId) ?? [];
        arr.push(p.id);
        children.set(p.parentPartnerId, arr);
      }
    }

    // 4. Structure sales bottom-up (iterative DFS with cycle guard):
    //    structure(p) = Σ_child (own(child) + structure(child))
    const structureSales = new Map<string, number>();
    const computeStructure = (rootId: string): number => {
      const memo = structureSales.get(rootId);
      if (memo !== undefined) return memo;

      // Iterative post-order to avoid stack overflow on deep structures
      const stack: Array<{ id: string; childIdx: number }> = [{ id: rootId, childIdx: 0 }];
      const inStack = new Set<string>([rootId]);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const kids = children.get(frame.id) ?? [];
        if (frame.childIdx < kids.length) {
          const childId = kids[frame.childIdx++];
          if (inStack.has(childId) || structureSales.has(childId)) continue; // cycle guard / memo
          stack.push({ id: childId, childIdx: 0 });
          inStack.add(childId);
        } else {
          let sum = 0;
          for (const childId of kids) {
            if (inStack.has(childId) && childId !== frame.id && stack.some((f) => f.id === childId)) continue; // cycle
            sum += (ownSales.get(childId) ?? 0) + (structureSales.get(childId) ?? 0);
          }
          structureSales.set(frame.id, roundMoney(sum));
          inStack.delete(frame.id);
          stack.pop();
        }
      }
      return structureSales.get(rootId) ?? 0;
    };

    // 5. Aggregates per partner.
    const aggregates = new Map<string, VolumeAggregates>();
    for (const p of partners) {
      const kids = children.get(p.id) ?? [];
      let level1 = 0;
      let level2 = 0;
      for (const c of kids) {
        level1 += ownSales.get(c) ?? 0;
        for (const gc of children.get(c) ?? []) {
          level2 += ownSales.get(gc) ?? 0;
        }
      }
      const agg: VolumeAggregates = {
        ownSales: ownSales.get(p.id) ?? 0,
        level1Sales: roundMoney(level1),
        level2Sales: roundMoney(level2),
        structureSales: computeStructure(p.id),
      };
      if (agg.ownSales > 0 || agg.structureSales > 0) {
        aggregates.set(p.id, agg);
      }
    }

    // 6. Line volumes: for each partner, per direct child line.
    const lineRows: Array<{ partnerId: string; linePartnerId: string; volume: number }> = [];
    for (const p of partners) {
      for (const c of children.get(p.id) ?? []) {
        const vol = roundMoney((ownSales.get(c) ?? 0) + (structureSales.get(c) ?? 0));
        if (vol > 0) {
          lineRows.push({ partnerId: p.id, linePartnerId: c, volume: vol });
        }
      }
    }

    // 7. Persist: replace period snapshot atomically.
    await prisma.$transaction([
      prisma.partnerMonthlyVolume.deleteMany({ where: { period } }),
      prisma.partnerMonthlyVolume.createMany({
        data: Array.from(aggregates.entries()).map(([partnerId, a]) => ({
          partnerId,
          period,
          ownSales: a.ownSales,
          level1Sales: a.level1Sales,
          level2Sales: a.level2Sales,
          structureSales: a.structureSales,
        })),
      }),
      prisma.partnerLineVolume.deleteMany({ where: { period } }),
      prisma.partnerLineVolume.createMany({
        data: lineRows.map((r) => ({ ...r, period })),
      }),
    ]);

    console.log(
      `[PartnerVolume] Recomputed period ${period}: ${aggregates.size} partners with volume, ${lineRows.length} lines`
    );
    return { partners: aggregates.size, lines: lineRows.length };
  }

  /** Volumes of a partner for a period (or zeros). */
  async getMonthlyVolume(partnerId: string, period: string): Promise<VolumeAggregates> {
    const row = await prisma.partnerMonthlyVolume.findUnique({
      where: { partnerId_period: { partnerId, period } },
    });
    return {
      ownSales: Number(row?.ownSales ?? 0),
      level1Sales: Number(row?.level1Sales ?? 0),
      level2Sales: Number(row?.level2Sales ?? 0),
      structureSales: Number(row?.structureSales ?? 0),
    };
  }

  /** Line volumes (WL) of a partner for a period, descending. */
  async getLineVolumes(partnerId: string, period: string) {
    return prisma.partnerLineVolume.findMany({
      where: { partnerId, period },
      orderBy: { volume: 'desc' },
      include: {
        linePartner: {
          select: { id: true, referralCode: true, rank: true, user: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });
  }

  /** Count lines of a partner meeting a WL threshold in a period. */
  async countLinesMeetingWl(partnerId: string, period: string, wlAmount: number): Promise<number> {
    return prisma.partnerLineVolume.count({
      where: { partnerId, period, volume: { gte: wlAmount } },
    });
  }
}

export const partnerVolumeService = new PartnerVolumeService();
