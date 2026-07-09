/**
 * Unit Tests for ReferralService MLM walk-up rank gate (PLAN_03 / PR-6)
 *
 * Verifies that a beneficiary whose rank does not unlock a given team level
 * is SKIPPED (not paid) while the walk-up continues to higher uplines.
 */

import { ReferralService } from '../../services/referral.service';

jest.mock('../../db', () => ({ prisma: {} }));

jest.mock('../../services/mlm-config.service', () => ({
  getMlmConfig: jest.fn(),
}));

jest.mock('../../services/partner-rank.service', () => ({
  getRankConfig: jest.fn(),
}));

jest.mock('../../services/referral-fraud.service', () => ({
  isFraud: jest.fn(),
  loadPartnerForFraudCheck: jest.fn(),
}));

import { getMlmConfig } from '../../services/mlm-config.service';
import { getRankConfig } from '../../services/partner-rank.service';
import { isFraud } from '../../services/referral-fraud.service';

describe('ReferralService walk-up rank gate (PR-6)', () => {
  const service = new ReferralService();

  beforeEach(() => {
    // resetMocks wipes implementations — re-apply before each test
    (getMlmConfig as jest.Mock).mockResolvedValue({
      enabled: true,
      maxDepth: 4,
      overrideBase: 'sale_base',
      overrideRatesPct: [2, 1.5, 1, 0.5],
      stopOnInactiveUpline: true,
    });
    (getRankConfig as jest.Mock).mockResolvedValue({
      teamLevelByRank: {
        AKTYWNY_PARTNER: 1,
        AMBASADOR: 2,
        LIDER_ZESPOLU: 3,
        MENEDZER: 4,
        DYREKTOR_REGIONALNY: 4,
        DYREKTOR_KRAJOWY: 4,
        DYREKTOR_GENERALNY: 4,
      },
    });
    (isFraud as jest.Mock).mockReturnValue({ isFraud: false });
  });

  // Upline chain: seller → P1 (AP) → P2 (AP) → P3 (MENEDZER)
  const uplines: Record<string, any> = {
    P1: { id: 'P1', status: 'APPROVED', parentPartnerId: 'P2', rank: 'AKTYWNY_PARTNER' },
    P2: { id: 'P2', status: 'APPROVED', parentPartnerId: 'P3', rank: 'AKTYWNY_PARTNER' },
    P3: { id: 'P3', status: 'APPROVED', parentPartnerId: null, rank: 'MENEDZER' },
  };

  function buildTx() {
    const overrides: any[] = [];
    const tx: any = {
      referralLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'link1',
          partner: {
            id: 'seller',
            userId: 'u-seller',
            status: 'APPROVED',
            commissionRate: 7,
            nip: null,
            parentPartnerId: 'P1',
            user: { email: 'seller@x.pl', lastLoginIp: null },
          },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productVariant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'v1', productId: 'prod1' }]),
      },
      referral: {
        create: jest.fn().mockResolvedValue({ id: 'ref1', status: 'PENDING' }),
      },
      referralItem: { create: jest.fn() },
      partnerProfile: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(uplines[where.id] ?? null)),
      },
      referralOverride: {
        create: jest.fn((args: any) => {
          overrides.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
    };
    return { tx, overrides };
  }

  it('skips AP beneficiary at locked level but pays higher-rank upline deeper', async () => {
    const { tx, overrides } = buildTx();

    await service.attributeOrder(
      tx,
      {
        id: 'order1',
        subtotal: 1000,
        discount: 0,
        items: [{ id: 'oi1', variantId: 'v1', unitPrice: 1000, quantity: 1 }],
      },
      { lastClick: 'CODE1', touched: [] },
      { userId: 'buyer', email: 'buyer@x.pl' }
    );

    // P1 (AP) unlocks level 1 → 2% of 1000 = 20
    const p1 = overrides.find((o) => o.beneficiaryId === 'P1');
    expect(p1).toBeDefined();
    expect(p1.level).toBe(1);
    expect(p1.amount).toBe(20);

    // P2 (AP) at level 2 → locked (AP max level 1) → NO override
    expect(overrides.find((o) => o.beneficiaryId === 'P2')).toBeUndefined();

    // P3 (MENEDZER) at level 3 → unlocked (max 4) → 1% of 1000 = 10
    const p3 = overrides.find((o) => o.beneficiaryId === 'P3');
    expect(p3).toBeDefined();
    expect(p3.level).toBe(3);
    expect(p3.amount).toBe(10);

    expect(overrides).toHaveLength(2);
  });

  it('direct commission is 7% of the qualified base', async () => {
    const { tx } = buildTx();

    await service.attributeOrder(
      tx,
      {
        id: 'order2',
        subtotal: 1000,
        discount: 100, // base = 900
        items: [{ id: 'oi1', variantId: 'v1', unitPrice: 1000, quantity: 1 }],
      },
      { lastClick: 'CODE1', touched: [] },
      { userId: 'buyer', email: 'buyer@x.pl' }
    );

    const created = (tx.referral.create as jest.Mock).mock.calls[0][0].data;
    expect(created.primaryCommission).toBe(63); // 7% × 900
  });
});
