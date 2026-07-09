/**
 * Unit Tests for PartnerVolumeService (PLAN_03 / PR-4)
 *
 * Verifies qualified-turnover aggregation, structure sums (bottom-up),
 * line volumes (WL) and cycle safety.
 */

import { PartnerVolumeService, currentPeriod, previousPeriod, WL_THRESHOLDS } from '../../services/partner-volume.service';
import { prisma } from '../../db';

jest.mock('../../db', () => ({
  prisma: {
    partnerProfile: {
      findMany: jest.fn(),
    },
    referral: {
      findMany: jest.fn(),
    },
    partnerMonthlyVolume: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
    },
    partnerLineVolume: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}));

describe('PartnerVolumeService', () => {
  let service: PartnerVolumeService;

  beforeEach(() => {
    service = new PartnerVolumeService();
    jest.clearAllMocks();
  });

  describe('period helpers', () => {
    it('currentPeriod formats YYYY-MM', () => {
      expect(currentPeriod(new Date('2026-07-09T10:00:00Z'))).toBe('2026-07');
    });
    it('previousPeriod returns prior month (incl. year wrap)', () => {
      expect(previousPeriod(new Date('2026-07-09T10:00:00Z'))).toBe('2026-06');
      expect(previousPeriod(new Date('2026-01-15T10:00:00Z'))).toBe('2025-12');
    });
    it('WL thresholds match the plan', () => {
      expect(WL_THRESHOLDS.WL25).toBe(25000);
      expect(WL_THRESHOLDS.WL1000).toBe(1000000);
    });
  });

  describe('recomputeMonthlyVolumes', () => {
    // Structure: A → B → C, A → D (B,D lines of A; C in B's line)
    const partners = [
      { id: 'A', parentPartnerId: null },
      { id: 'B', parentPartnerId: 'A' },
      { id: 'C', parentPartnerId: 'B' },
      { id: 'D', parentPartnerId: 'A' },
    ];

    const referralRow = (partnerId: string, subtotal: number, discount = 0) => ({
      partnerId,
      order: { subtotal, discount },
    });

    it('computes own/L1/L2/structure and line volumes on 3-level structure', async () => {
      (prisma.partnerProfile.findMany as jest.Mock).mockResolvedValue(partners);
      (prisma.referral.findMany as jest.Mock).mockResolvedValue([
        referralRow('A', 1000),
        referralRow('B', 500),
        referralRow('C', 200),
        referralRow('D', 300, 50), // qualified = 250
      ]);

      const result = await service.recomputeMonthlyVolumes('2026-07');
      expect(result.partners).toBe(4);

      const monthlyData = (prisma.partnerMonthlyVolume.createMany as jest.Mock).mock.calls[0][0].data;
      const byPartner = Object.fromEntries(monthlyData.map((r: any) => [r.partnerId, r]));

      // A: own 1000; L1 = B(500)+D(250) = 750; L2 = C(200); structure = 950
      expect(byPartner['A'].ownSales).toBe(1000);
      expect(byPartner['A'].level1Sales).toBe(750);
      expect(byPartner['A'].level2Sales).toBe(200);
      expect(byPartner['A'].structureSales).toBe(950);
      // B: own 500; L1 = 200; structure = 200
      expect(byPartner['B'].structureSales).toBe(200);

      const lineData = (prisma.partnerLineVolume.createMany as jest.Mock).mock.calls[0][0].data;
      const lineOf = (owner: string, root: string) =>
        lineData.find((r: any) => r.partnerId === owner && r.linePartnerId === root);

      // Line B under A: own(B) + structure(B) = 500 + 200 = 700
      expect(lineOf('A', 'B').volume).toBe(700);
      // Line D under A: 250
      expect(lineOf('A', 'D').volume).toBe(250);
      // Line C under B: 200
      expect(lineOf('B', 'C').volume).toBe(200);
    });

    it('survives a cycle in hierarchy data without hanging', async () => {
      (prisma.partnerProfile.findMany as jest.Mock).mockResolvedValue([
        { id: 'X', parentPartnerId: 'Y' },
        { id: 'Y', parentPartnerId: 'X' }, // cycle X↔Y
        { id: 'Z', parentPartnerId: null },
      ]);
      (prisma.referral.findMany as jest.Mock).mockResolvedValue([
        referralRow('X', 100),
        referralRow('Z', 50),
      ]);

      const result = await service.recomputeMonthlyVolumes('2026-07');
      expect(result.partners).toBeGreaterThanOrEqual(1);
      expect(prisma.partnerMonthlyVolume.createMany).toHaveBeenCalled();
    });

    it('skips zero-volume partners and lines', async () => {
      (prisma.partnerProfile.findMany as jest.Mock).mockResolvedValue(partners);
      (prisma.referral.findMany as jest.Mock).mockResolvedValue([referralRow('C', 200)]);

      await service.recomputeMonthlyVolumes('2026-07');

      const monthlyData = (prisma.partnerMonthlyVolume.createMany as jest.Mock).mock.calls[0][0].data;
      const ids = monthlyData.map((r: any) => r.partnerId).sort();
      // D has no volume anywhere → excluded; A and B have structure volume; C own
      expect(ids).toEqual(['A', 'B', 'C']);

      const lineData = (prisma.partnerLineVolume.createMany as jest.Mock).mock.calls[0][0].data;
      expect(lineData.find((r: any) => r.linePartnerId === 'D')).toBeUndefined();
    });

    it('rejects invalid period', async () => {
      await expect(service.recomputeMonthlyVolumes('bad')).rejects.toThrow('Invalid period');
    });
  });

  describe('countLinesMeetingWl', () => {
    it('delegates to prisma count with gte filter', async () => {
      (prisma.partnerLineVolume.count as jest.Mock).mockResolvedValue(3);
      const n = await service.countLinesMeetingWl('A', '2026-07', WL_THRESHOLDS.WL25);
      expect(n).toBe(3);
      expect(prisma.partnerLineVolume.count).toHaveBeenCalledWith({
        where: { partnerId: 'A', period: '2026-07', volume: { gte: 25000 } },
      });
    });
  });
});
