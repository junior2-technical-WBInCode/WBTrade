/**
 * Unit Tests for PartnerRankService (PLAN_03 / PR-5)
 *
 * Covers: promotion paths, single-line share limit, minRankInLines,
 * confirmation/consolidation flow, no-drop below consolidated rank,
 * one-level-at-a-time promotion.
 */

import { PartnerRankService, RANK_ORDER, nextRank, rankAtLeast, DEFAULT_RANK_CONFIG } from '../../services/partner-rank.service';
import { prisma } from '../../db';

jest.mock('../../db', () => ({
  prisma: {
    settings: { findUnique: jest.fn(), upsert: jest.fn() },
    partnerProfile: { findMany: jest.fn(), update: jest.fn() },
    partnerMonthlyVolume: { findMany: jest.fn() },
    partnerLineVolume: { findMany: jest.fn() },
    partnerRankEvent: { create: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}));

const PERIOD = '2026-06';

/** Convenience: run engine with given DB fixtures */
async function runEngine(fixtures: {
  partners: any[];
  allNodes?: any[];
  volumes?: any[];
  lines?: any[];
}) {
  (prisma.settings.findUnique as jest.Mock).mockResolvedValue(null); // defaults
  (prisma.partnerProfile.findMany as jest.Mock)
    .mockResolvedValueOnce(fixtures.partners) // APPROVED eval list
    .mockResolvedValueOnce(fixtures.allNodes ?? fixtures.partners.map((p) => ({
      id: p.id, parentPartnerId: p.parentPartnerId, highestRank: p.highestRank,
    })));
  (prisma.partnerMonthlyVolume.findMany as jest.Mock).mockResolvedValue(fixtures.volumes ?? []);
  (prisma.partnerLineVolume.findMany as jest.Mock).mockResolvedValue(fixtures.lines ?? []);

  const service = new PartnerRankService();
  return service.evaluatePeriod(PERIOD);
}

function updateCalls() {
  return (prisma.partnerProfile.update as jest.Mock).mock.calls.map((c) => c[0]);
}
function eventCalls() {
  return (prisma.partnerRankEvent.create as jest.Mock).mock.calls.map((c) => c[0].data);
}

const partner = (id: string, rank: string, highestRank = rank, confirmations = 0, parent: string | null = null) => ({
  id, rank, highestRank, rankConfirmations: confirmations, parentPartnerId: parent,
});
const volume = (partnerId: string, own = 0, l1 = 0, l2 = 0, structure = 0) => ({
  partnerId, ownSales: own, level1Sales: l1, level2Sales: l2, structureSales: structure,
});
const line = (partnerId: string, linePartnerId: string, vol: number) => ({ partnerId, linePartnerId, volume: vol });

describe('PartnerRankService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('rank helpers', () => {
    it('orders 7 ranks and steps one level', () => {
      expect(RANK_ORDER).toHaveLength(7);
      expect(nextRank('AKTYWNY_PARTNER' as any)).toBe('AMBASADOR');
      expect(nextRank('DYREKTOR_GENERALNY' as any)).toBeNull();
      expect(rankAtLeast('MENEDZER' as any, 'AMBASADOR' as any)).toBe(true);
      expect(rankAtLeast('AMBASADOR' as any, 'MENEDZER' as any)).toBe(false);
    });
    it('default config matches the plan', () => {
      expect(DEFAULT_RANK_CONFIG.ranks.AMBASADOR!.paths[0].ownSales).toBe(20000);
      expect(DEFAULT_RANK_CONFIG.ranks.DYREKTOR_GENERALNY!.maxLineSharePct).toBe(25);
      expect(DEFAULT_RANK_CONFIG.teamLevelByRank.AKTYWNY_PARTNER).toBe(1);
      expect(DEFAULT_RANK_CONFIG.teamLevelByRank.MENEDZER).toBe(4);
      expect(DEFAULT_RANK_CONFIG.leaderBonus.byRank.DYREKTOR_GENERALNY!.basePct).toBe(1.25);
    });
  });

  describe('promotions', () => {
    it('promotes AP → Ambasador on own sales path (20k)', async () => {
      const stats = await runEngine({
        partners: [partner('A', 'AKTYWNY_PARTNER')],
        volumes: [volume('A', 20_000)],
      });
      expect(stats.promotions).toBe(1);
      expect(updateCalls()[0].data.rank).toBe('AMBASADOR');
      expect(eventCalls()[0].type).toBe('PROMOTION');
    });

    it('does NOT promote when own sales below threshold', async () => {
      const stats = await runEngine({
        partners: [partner('A', 'AKTYWNY_PARTNER')],
        volumes: [volume('A', 19_999)],
      });
      expect(stats.promotions).toBe(0);
      expect(prisma.partnerProfile.update).not.toHaveBeenCalled();
    });

    it('promotes only ONE level even if higher-rank conditions are met', async () => {
      // 50k own sales meets LIDER_ZESPOLU, but AP can only go to AMBASADOR
      const stats = await runEngine({
        partners: [partner('A', 'AKTYWNY_PARTNER')],
        volumes: [volume('A', 50_000)],
      });
      expect(stats.promotions).toBe(1);
      expect(updateCalls()[0].data.rank).toBe('AMBASADOR');
    });

    it('mixed path AP → Ambasador (8k own + 30k L1) respects line share limit 60%', async () => {
      // structure 30k, largest line 20k → 66% > 60% → blocked
      const blocked = await runEngine({
        partners: [partner('A', 'AKTYWNY_PARTNER')],
        volumes: [volume('A', 8_000, 30_000, 0, 30_000)],
        lines: [line('A', 'B', 20_000), line('A', 'C', 10_000)],
      });
      expect(blocked.promotions).toBe(0);

      jest.clearAllMocks();
      // largest line 15k / 30k = 50% ≤ 60% → promoted
      const ok = await runEngine({
        partners: [partner('A', 'AKTYWNY_PARTNER')],
        volumes: [volume('A', 8_000, 30_000, 0, 30_000)],
        lines: [line('A', 'B', 15_000), line('A', 'C', 15_000)],
      });
      expect(ok.promotions).toBe(1);
    });

    it('own-sales-only path is EXEMPT from line share limit', async () => {
      // 20k own, one dominating line 100% — still promoted via own-sales path
      const stats = await runEngine({
        partners: [partner('A', 'AKTYWNY_PARTNER')],
        volumes: [volume('A', 20_000, 5_000, 0, 5_000)],
        lines: [line('A', 'B', 5_000)],
      });
      expect(stats.promotions).toBe(1);
    });

    it('structure path Ambasador → Lider wymaga rangi w osobnej linii (minRankInLines)', async () => {
      const base = {
        partners: [partner('A', 'AMBASADOR')],
        volumes: [volume('A', 0, 100_000, 50_000, 150_000)],
        lines: [line('A', 'B', 40_000), line('A', 'C', 40_000), line('A', 'D', 40_000), line('A', 'E', 30_000)],
      };
      // No Ambasador anywhere in lines → blocked
      const blocked = await runEngine({
        ...base,
        allNodes: [
          { id: 'A', parentPartnerId: null, highestRank: 'AMBASADOR' },
          { id: 'B', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
          { id: 'C', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
          { id: 'D', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
          { id: 'E', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
        ],
      });
      expect(blocked.promotions).toBe(0);

      jest.clearAllMocks();
      // Ambasador deep inside line B (grandchild) → allowed
      const ok = await runEngine({
        ...base,
        allNodes: [
          { id: 'A', parentPartnerId: null, highestRank: 'AMBASADOR' },
          { id: 'B', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
          { id: 'B2', parentPartnerId: 'B', highestRank: 'AMBASADOR' },
          { id: 'C', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
          { id: 'D', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
          { id: 'E', parentPartnerId: 'A', highestRank: 'AKTYWNY_PARTNER' },
        ],
      });
      expect(ok.promotions).toBe(1);
      expect(updateCalls()[0].data.rank).toBe('LIDER_ZESPOLU');
    });
  });

  describe('confirmation & consolidation', () => {
    it('confirms unconsolidated rank when conditions still met (1st confirmation)', async () => {
      const stats = await runEngine({
        partners: [partner('A', 'AMBASADOR', 'AKTYWNY_PARTNER', 0)],
        volumes: [volume('A', 20_000)],
      });
      expect(stats.confirmations).toBe(1);
      expect(updateCalls()[0].data.rankConfirmations).toBe(1);
      expect(eventCalls()[0].type).toBe('CONFIRMATION');
    });

    it('consolidates after 2nd confirmation (highestRank updated)', async () => {
      const stats = await runEngine({
        partners: [partner('A', 'AMBASADOR', 'AKTYWNY_PARTNER', 1)],
        volumes: [volume('A', 20_000)],
      });
      expect(stats.consolidations).toBe(1);
      expect(updateCalls()[0].data.highestRank).toBe('AMBASADOR');
      expect(eventCalls()[0].type).toBe('CONSOLIDATION');
    });

    it('resets unconsolidated rank to highestRank when conditions lost', async () => {
      const stats = await runEngine({
        partners: [partner('A', 'AMBASADOR', 'AKTYWNY_PARTNER', 1)],
        volumes: [volume('A', 1_000)],
      });
      expect(stats.resets).toBe(1);
      expect(updateCalls()[0].data.rank).toBe('AKTYWNY_PARTNER');
    });

    it('NEVER drops a consolidated rank even with zero volume', async () => {
      const stats = await runEngine({
        partners: [partner('A', 'MENEDZER', 'MENEDZER', 2)],
        volumes: [],
      });
      expect(stats.resets).toBe(0);
      expect(prisma.partnerProfile.update).not.toHaveBeenCalled();
    });
  });
});
