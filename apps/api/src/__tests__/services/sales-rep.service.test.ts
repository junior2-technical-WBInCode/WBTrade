/**
 * Unit Tests for SalesRepService
 */

import { SalesRepService } from '../../services/sales-rep.service';
import { prisma } from '../../db';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { wholesalerConfigService } from '../../services/wholesaler-config.service';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    settings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    salesRepCommission: {
      aggregate: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    salesRepPayout: {
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    order: {
      update: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(prisma)),
  },
}));

// Mock wholesalerConfigService
jest.mock('../../services/wholesaler-config.service', () => ({
  wholesalerConfigService: {
    getAll: jest.fn().mockResolvedValue([
      { key: 'outlet', prefix: 'OUTLET-' },
      { key: 'leker', prefix: 'LEKER-' }
    ]),
  },
}));

describe('SalesRepService', () => {
  let service: SalesRepService;

  beforeEach(() => {
    service = new SalesRepService();
    service.clearCache();
    jest.clearAllMocks();

    // Re-apply mocked value because resetMocks wipes mock implementations
    (wholesalerConfigService.getAll as jest.Mock).mockResolvedValue([
      { key: 'outlet', prefix: 'OUTLET-' },
      { key: 'leker', prefix: 'LEKER-' }
    ]);
  });

  describe('getSalesRepConfig', () => {
    it('should return default config if settings not found in DB', async () => {
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue(null);

      const config = await service.getSalesRepConfig();

      expect(config).toEqual({
        baseCommissionPct: 5,
        maxDiscountPct: 13,
        minCompanyMarginPct: 10,
        markupMultiplier: 1.35,
        holdDays: 14,
      });
    });

    it('should return parsed config from settings database', async () => {
      const dbConfig = {
        key: 'sales_rep_config',
        value: JSON.stringify({
          baseCommissionPct: 6,
          maxDiscountPct: 10,
          minCompanyMarginPct: 12,
          markupMultiplier: 1.4,
          holdDays: 7,
        }),
      };
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue(dbConfig);

      const config = await service.getSalesRepConfig();

      expect(config).toEqual({
        baseCommissionPct: 6,
        maxDiscountPct: 10,
        minCompanyMarginPct: 12,
        markupMultiplier: 1.4,
        holdDays: 7,
      });
    });
  });

  describe('isOutletOrPromoProduct', () => {
    it('should identify product as promotional if compareAtPrice > price', async () => {
      const product = {
        baselinkerProductId: 'LEKER-123',
        price: new Decimal(100),
        compareAtPrice: new Decimal(120),
      };

      const result = await service.isOutletOrPromoProduct(product);
      expect(result).toBe(true);
    });

    it('should identify product as outlet if baselinkerProductId starts with outlet prefix', async () => {
      const product = {
        baselinkerProductId: 'OUTLET-555',
        price: new Decimal(100),
        compareAtPrice: null,
      };

      const result = await service.isOutletOrPromoProduct(product);
      expect(result).toBe(true);
    });

    it('should identify product as regular if neither promo nor outlet', async () => {
      const product = {
        baselinkerProductId: 'LEKER-999',
        price: new Decimal(100),
        compareAtPrice: null,
      };

      const result = await service.isOutletOrPromoProduct(product);
      expect(result).toBe(false);
    });
  });

  describe('attributeCommission math logic', () => {
    const mockOrderItems = [
      {
        id: 'item-1',
        unitPrice: new Decimal(135),
        quantity: 2,
        variant: {
          id: 'v-1',
          purchasePrice: new Decimal(100),
          compareAtPrice: null,
          product: {
            baselinkerProductId: 'LEKER-1',
            purchasePrice: null,
            compareAtPrice: null,
            price: new Decimal(135),
          },
        },
      },
    ];

    beforeEach(() => {
      // Mock default settings (pool = 5 + 13 = 18)
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'sales_rep_config',
        value: JSON.stringify({
          baseCommissionPct: 5,
          maxDiscountPct: 13,
          minCompanyMarginPct: 10,
          markupMultiplier: 1.35,
          holdDays: 14,
        }),
      });
      (prisma.orderItem.findMany as jest.Mock).mockResolvedValue(mockOrderItems);
    });

    it('should attribute 18% commission and 0% discount when discountPct is 0', async () => {
      const tx = prisma; // Using mocked prisma directly as transaction client
      
      await service.attributeCommission(tx as any, 'order-1', 'rep-1', 0);

      // Base is 100 * 2 = 200
      // Discount = 0% of 200 = 0
      // Commission = 18% of 200 = 36
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          salesRepId: 'rep-1',
          discount: 0,
          total: { decrement: 0 },
          repDiscountPct: new Prisma.Decimal(0),
        },
      });

      expect(prisma.salesRepCommission.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          salesRepId: 'rep-1',
          status: 'PENDING',
          base: new Prisma.Decimal(200),
          discountPct: new Prisma.Decimal(0),
          commissionPct: new Prisma.Decimal(18),
          commissionAmount: new Prisma.Decimal(36),
        },
      });
    });

    it('should attribute 8% commission and 10% discount when discountPct is 10', async () => {
      const tx = prisma;
      
      await service.attributeCommission(tx as any, 'order-1', 'rep-1', 10);

      // Base is 100 * 2 = 200
      // Discount = 10% of 200 = 20
      // Commission = (18 - 10)% of 200 = 8% of 200 = 16
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          salesRepId: 'rep-1',
          discount: 20,
          total: { decrement: 20 },
          repDiscountPct: new Prisma.Decimal(10),
        },
      });

      expect(prisma.salesRepCommission.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          salesRepId: 'rep-1',
          status: 'PENDING',
          base: new Prisma.Decimal(200),
          discountPct: new Prisma.Decimal(10),
          commissionPct: new Prisma.Decimal(8),
          commissionAmount: new Prisma.Decimal(16),
        },
      });
    });

    it('should attribute 5% commission and 13% discount when discountPct is 13', async () => {
      const tx = prisma;
      
      await service.attributeCommission(tx as any, 'order-1', 'rep-1', 13);

      // Base is 100 * 2 = 200
      // Discount = 13% of 200 = 26
      // Commission = (18 - 13)% of 200 = 5% of 200 = 10
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          salesRepId: 'rep-1',
          discount: 26,
          total: { decrement: 26 },
          repDiscountPct: new Prisma.Decimal(13),
        },
      });

      expect(prisma.salesRepCommission.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          salesRepId: 'rep-1',
          status: 'PENDING',
          base: new Prisma.Decimal(200),
          discountPct: new Prisma.Decimal(13),
          commissionPct: new Prisma.Decimal(5),
          commissionAmount: new Prisma.Decimal(10),
        },
      });
    });

    it('should throw an error and reject discountPct above maxDiscountPct (14%)', async () => {
      const tx = prisma;
      
      await expect(
        service.attributeCommission(tx as any, 'order-1', 'rep-1', 14)
      ).rejects.toThrow('Rabat handlowca musi mieścić się w przedziale 0-13%');
    });

    it('should exclude outlet/promo products from the base calculations', async () => {
      const tx = prisma;
      
      // Mock order items containing one regular and one promo product
      const mixedOrderItems = [
        {
          id: 'item-1',
          unitPrice: new Decimal(135),
          quantity: 2,
          variant: {
            id: 'v-1',
            purchasePrice: new Decimal(100),
            compareAtPrice: null,
            product: {
              baselinkerProductId: 'LEKER-1',
              purchasePrice: null,
              compareAtPrice: null,
              price: new Decimal(135),
            },
          },
        },
        {
          id: 'item-2',
          unitPrice: new Decimal(50),
          quantity: 1,
          variant: {
            id: 'v-2',
            purchasePrice: new Decimal(40),
            compareAtPrice: new Decimal(70), // Promo product because compareAtPrice > price
            product: {
              baselinkerProductId: 'LEKER-2',
              purchasePrice: null,
              compareAtPrice: null,
              price: new Decimal(50),
            },
          },
        },
      ];
      (prisma.orderItem.findMany as jest.Mock).mockResolvedValue(mixedOrderItems);

      await service.attributeCommission(tx as any, 'order-1', 'rep-1', 10);

      // Base should exclude mixedOrderItems[1] because it is a promo product
      // Base = 100 * 2 = 200 (excludes the 40 * 1 from promo)
      // Discount = 10% of 200 = 20
      // Commission = 8% of 200 = 16
      expect(prisma.salesRepCommission.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          salesRepId: 'rep-1',
          status: 'PENDING',
          base: new Prisma.Decimal(200),
          discountPct: new Prisma.Decimal(10),
          commissionPct: new Prisma.Decimal(8),
          commissionAmount: new Prisma.Decimal(16),
        },
      });
    });
  });
});
