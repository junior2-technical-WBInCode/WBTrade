/**
 * Leader Bonus Service — WB TRADE PARTNERS (PLAN_03 / PR-7)
 *
 * "Premia Liderów" — an extra pool paid to uplines with rank >= LIDER_ZESPOLU,
 * calculated from the qualified order turnover (saleBase), on top of team
 * commission overrides. Unlike overrides, it has NO depth limit ("dalsza linia"
 * also earns it).
 *
 * Rules (PDF pages 6, 18):
 * - Pool per rank: LZ 0.25% / MEN 0.50% / DR 0.75% / DK 1.00% / DG 1.25%.
 * - WL addon +0.25%: unlocked when the line the sale flows through met the
 *   rank's WL requirement (LZ→WL25 … DG→WL500) in the previous CLOSED period.
 * - Multiple leaders of the SAME rank in one line share the rank's pool:
 *   closest 60%, second 30%, third 10%, further 0%.
 *   The WL addon is split the same way among those who meet the WL condition.
 * - Lifecycle identical to Referral: PENDING → PAID → APPROVED (14-day hold
 *   from delivery), CANCELLED on refund.
 *
 * Runs inside the same transaction as attributeOrder, behind the MLM legal gate.
 */

import { Prisma, PartnerRank, ReferralStatus } from '@prisma/client';
import { roundMoney } from '../lib/currency';
import { getRankConfig } from './partner-rank.service';
import { previousPeriod } from './partner-volume.service';

const MAX_CHAIN = 100; // safety cap for the unbounded walk-up

interface AttributeLeaderBonusParams {
  referralId: string;
  orderId: string;
  /** Qualified order turnover: subtotal − discount (no shipping) */
  saleBase: number;
  /** Selling partner (their uplines earn the bonus) */
  sellerId: string;
  sellerParentId: string | null;
  /** Status inherited from the source Referral (PENDING normally) */
  status: ReferralStatus;
}

export class LeaderBonusService {
  /**
   * Create LeaderBonus records for all qualifying uplines of a sale.
   * Must be called inside the attribution transaction.
   */
  async attributeLeaderBonuses(tx: Prisma.TransactionClient, params: AttributeLeaderBonusParams): Promise<void> {
    const cfg = await getRankConfig();
    const { byRank, wlAddonPct, shareSplitPct } = cfg.leaderBonus;
    const period = previousPeriod(new Date()); // deterministic: last CLOSED period

    // Walk the full chain up, remembering the child on the path (= the line
    // through which this sale flows for each beneficiary).
    interface Candidate {
      partnerId: string;
      rank: PartnerRank;
      /** Direct child of the beneficiary on the path to the seller (their line root) */
      lineRootId: string;
    }
    const candidates: Candidate[] = [];

    let childOnPath = params.sellerId;
    let ancestorId = params.sellerParentId;
    const visited = new Set<string>([params.sellerId]);
    let hops = 0;

    while (ancestorId && hops < MAX_CHAIN) {
      if (visited.has(ancestorId)) {
        console.warn(`[LeaderBonus] Cycle detected at ${ancestorId}, stopping.`);
        break;
      }
      visited.add(ancestorId);

      const ancestor = await tx.partnerProfile.findUnique({
        where: { id: ancestorId },
        select: { id: true, status: true, rank: true, parentPartnerId: true },
      });
      if (!ancestor) break;

      if (ancestor.status === 'APPROVED' && byRank[ancestor.rank]) {
        candidates.push({ partnerId: ancestor.id, rank: ancestor.rank, lineRootId: childOnPath });
      }

      childOnPath = ancestor.id;
      ancestorId = ancestor.parentPartnerId;
      hops++;
    }

    if (candidates.length === 0) return;

    // Group by rank (order of proximity preserved) and apply 60/30/10 split.
    const byRankGroups = new Map<PartnerRank, Candidate[]>();
    for (const c of candidates) {
      const arr = byRankGroups.get(c.rank) ?? [];
      arr.push(c);
      byRankGroups.set(c.rank, arr);
    }

    for (const [rank, group] of byRankGroups) {
      const rankParams = byRank[rank]!;

      // WL check per group member (their line = child on path, previous closed period)
      const wlQualified: boolean[] = [];
      for (const member of group) {
        const lineVol = await tx.partnerLineVolume.findUnique({
          where: {
            partnerId_linePartnerId_period: {
              partnerId: member.partnerId,
              linePartnerId: member.lineRootId,
              period,
            },
          },
          select: { volume: true },
        });
        wlQualified.push(Number(lineVol?.volume ?? 0) >= rankParams.wlRequirement);
      }

      // A single leader of a rank takes the FULL pool (PDF p.6);
      // the 60/30/10 split applies only when several same-rank leaders
      // sit in the same line (PDF p.18). Same rule for the WL addon.
      const wlCount = wlQualified.filter(Boolean).length;
      const baseShareAt = (pos: number) => (group.length === 1 ? 100 : shareSplitPct[pos] ?? 0);
      const addonShareAt = (pos: number) => (wlCount === 1 ? 100 : shareSplitPct[pos] ?? 0);

      let wlPos = 0; // position among WL-qualified members (for addon split)
      for (let i = 0; i < group.length; i++) {
        const baseShare = baseShareAt(i);
        let addonShare = 0;
        if (wlQualified[i]) {
          addonShare = addonShareAt(wlPos);
          wlPos++;
        }
        if (baseShare <= 0 && addonShare <= 0) continue;

        const effectiveBasePct = (rankParams.basePct * baseShare) / 100;
        const effectiveAddonPct = (wlAddonPct * addonShare) / 100;
        const amount = roundMoney((params.saleBase * (effectiveBasePct + effectiveAddonPct)) / 100);
        if (amount <= 0) continue;

        await tx.leaderBonus.create({
          data: {
            orderId: params.orderId,
            referralId: params.referralId,
            beneficiaryId: group[i].partnerId,
            rank,
            basePct: rankParams.basePct,
            wlAddonPct: effectiveAddonPct,
            sharePct: baseShare,
            amount,
            status: params.status,
          },
        });

        console.log(
          `[LeaderBonus] ${rank} ${group[i].partnerId}: base ${rankParams.basePct}%×${baseShare}%` +
          `${addonShare > 0 ? ` + WL addon ×${addonShare}%` : ''} = ${amount} PLN`
        );
      }
    }
  }
}

export const leaderBonusService = new LeaderBonusService();
