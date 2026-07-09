/**
 * Unit Tests for LeaderBonusService (PLAN_03 / PR-7)
 *
 * Covers: rank qualification, unbounded depth, 60/30/10 split among same-rank
 * leaders, WL addon gating by line volume, cycle safety.
 */

import { LeaderBonusService } from '../../services/leader-bonus.service';

jest.mock('../../db', () => ({ prisma: {} }));

jest.mock('../../services/partner-rank.service', () => ({
  getRankConfig: jest.fn(),
}));

import { getRankConfig } from '../../services/partner-rank.service';

const RANK_CFG = {
  leaderBonus: {
    wlAddonPct: 0.25,
    shareSplitPct: [60, 30, 10],
    byRank: {
      LIDER_ZESPOLU: { basePct: 0.25, wlRequirement: 25_000 },
      MENEDZER: { basePct: 0.5, wlRequirement: 50_000 },
      DYREKTOR_REGIONALNY: { basePct: 0.75, wlRequirement: 100_000 },
      DYREKTOR_KRAJOWY: { basePct: 1.0, wlRequirement: 250_000 },
      DYREKTOR_GENERALNY: { basePct: 1.25, wlRequirement: 500_000 },
    },
  },
};

describe('LeaderBonusService', () => {
  const service = new LeaderBonusService();

  beforeEach(() => {
    jest.clearAllMocks();
    (getRankConfig as jest.Mock).mockResolvedValue(RANK_CFG);
  });

  function buildTx(uplines: Record<string, any>, lineVolumes: Record<string, number> = {}) {
    const bonuses: any[] = [];
    const tx: any = {
      partnerProfile: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(uplines[where.id] ?? null)),
      },
      partnerLineVolume: {
        findUnique: jest.fn(({ where }: any) => {
          const key = `${where.partnerId_linePartnerId_period.partnerId}:${where.partnerId_linePartnerId_period.linePartnerId}`;
          const vol = lineVolumes[key];
          return Promise.resolve(vol !== undefined ? { volume: vol } : null);
        }),
      },
      leaderBonus: {
        create: jest.fn((args: any) => {
          bonuses.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
    };
    return { tx, bonuses };
  }

  const baseParams = {
    referralId: 'ref1',
    orderId: 'order1',
    saleBase: 10_000,
    sellerId: 'seller',
    status: 'PENDING' as any,
  };

  it('pays base pool to a single leader far up the chain (no depth limit)', async () => {
    // seller → A(AP) → B(AP) → C(AP) → D(AP) → E(LIDER_ZESPOLU)
    const { tx, bonuses } = buildTx({
      A: { id: 'A', status: 'APPROVED', rank: 'AKTYWNY_PARTNER', parentPartnerId: 'B' },
      B: { id: 'B', status: 'APPROVED', rank: 'AKTYWNY_PARTNER', parentPartnerId: 'C' },
      C: { id: 'C', status: 'APPROVED', rank: 'AKTYWNY_PARTNER', parentPartnerId: 'D' },
      D: { id: 'D', status: 'APPROVED', rank: 'AKTYWNY_PARTNER', parentPartnerId: 'E' },
      E: { id: 'E', status: 'APPROVED', rank: 'LIDER_ZESPOLU', parentPartnerId: null },
    });

    await service.attributeLeaderBonuses(tx, { ...baseParams, sellerParentId: 'A' });

    expect(bonuses).toHaveLength(1);
    // Single leader of a rank takes the FULL pool: 0.25% × 10000 = 25 PLN
    expect(bonuses[0].beneficiaryId).toBe('E');
    expect(bonuses[0].rank).toBe('LIDER_ZESPOLU');
    expect(bonuses[0].sharePct).toBe(100);
    expect(bonuses[0].amount).toBe(25);
  });

  it('splits pool 60/30/10 among three same-rank leaders in one line', async () => {
    const { tx, bonuses } = buildTx({
      L1: { id: 'L1', status: 'APPROVED', rank: 'MENEDZER', parentPartnerId: 'L2' },
      L2: { id: 'L2', status: 'APPROVED', rank: 'MENEDZER', parentPartnerId: 'L3' },
      L3: { id: 'L3', status: 'APPROVED', rank: 'MENEDZER', parentPartnerId: 'L4' },
      L4: { id: 'L4', status: 'APPROVED', rank: 'MENEDZER', parentPartnerId: null },
    });

    await service.attributeLeaderBonuses(tx, { ...baseParams, sellerParentId: 'L1' });

    // Pool 0.5% of 10000 = 50 PLN → 60/30/10 = 30 / 15 / 5; 4th leader gets 0 (no record)
    expect(bonuses).toHaveLength(3);
    expect(bonuses[0]).toMatchObject({ beneficiaryId: 'L1', sharePct: 60, amount: 30 });
    expect(bonuses[1]).toMatchObject({ beneficiaryId: 'L2', sharePct: 30, amount: 15 });
    expect(bonuses[2]).toMatchObject({ beneficiaryId: 'L3', sharePct: 10, amount: 5 });
    expect(bonuses.find((b) => b.beneficiaryId === 'L4')).toBeUndefined();
  });

  it('adds WL addon only when the line met the WL requirement in previous period', async () => {
    // Leader with WL: line through which sale flows = direct child on path = seller
    const { tx, bonuses } = buildTx(
      {
        L: { id: 'L', status: 'APPROVED', rank: 'LIDER_ZESPOLU', parentPartnerId: null },
      },
      { 'L:seller': 30_000 } // ≥ WL25 → addon unlocked
    );

    await service.attributeLeaderBonuses(tx, { ...baseParams, sellerParentId: 'L' });

    expect(bonuses).toHaveLength(1);
    // base: full pool 0.25% → 25 PLN; addon: full 0.25% → 25 PLN; total 50
    expect(bonuses[0].amount).toBe(50);
    expect(bonuses[0].wlAddonPct).toBeGreaterThan(0);
  });

  it('no WL addon when line volume below requirement', async () => {
    const { tx, bonuses } = buildTx(
      { L: { id: 'L', status: 'APPROVED', rank: 'LIDER_ZESPOLU', parentPartnerId: null } },
      { 'L:seller': 10_000 } // < WL25
    );

    await service.attributeLeaderBonuses(tx, { ...baseParams, sellerParentId: 'L' });

    expect(bonuses).toHaveLength(1);
    expect(bonuses[0].wlAddonPct).toBe(0);
    expect(bonuses[0].amount).toBe(25); // only base 0.25% (full pool) of 10000
  });

  it('skips non-APPROVED and low-rank uplines, different ranks each get own pool', async () => {
    const { tx, bonuses } = buildTx({
      A: { id: 'A', status: 'SUSPENDED', rank: 'LIDER_ZESPOLU', parentPartnerId: 'B' }, // suspended → skip
      B: { id: 'B', status: 'APPROVED', rank: 'AMBASADOR', parentPartnerId: 'C' },      // rank too low → skip
      C: { id: 'C', status: 'APPROVED', rank: 'LIDER_ZESPOLU', parentPartnerId: 'D' },
      D: { id: 'D', status: 'APPROVED', rank: 'DYREKTOR_GENERALNY', parentPartnerId: null },
    });

    await service.attributeLeaderBonuses(tx, { ...baseParams, sellerParentId: 'A' });

    expect(bonuses).toHaveLength(2);
    const c = bonuses.find((b) => b.beneficiaryId === 'C');
    const d = bonuses.find((b) => b.beneficiaryId === 'D');
    // Each rank pool independent, single leader per rank = full pool:
    // C: LZ 0.25% → 25; D: DG 1.25% → 125
    expect(c.amount).toBe(25);
    expect(d.amount).toBe(125);
  });

  it('survives a hierarchy cycle', async () => {
    const { tx, bonuses } = buildTx({
      A: { id: 'A', status: 'APPROVED', rank: 'LIDER_ZESPOLU', parentPartnerId: 'B' },
      B: { id: 'B', status: 'APPROVED', rank: 'AKTYWNY_PARTNER', parentPartnerId: 'A' }, // cycle
    });

    await service.attributeLeaderBonuses(tx, { ...baseParams, sellerParentId: 'A' });
    expect(bonuses).toHaveLength(1); // A paid once, loop stopped
  });
});
