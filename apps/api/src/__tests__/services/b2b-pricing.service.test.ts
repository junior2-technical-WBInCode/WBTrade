jest.mock('../../db', () => ({ prisma: {} }));

jest.mock('../../services/wholesaler-config.service', () => ({
  wholesalerConfigService: {
    getAll: jest.fn(),
  },
}));

import { wholesalerConfigService } from '../../services/wholesaler-config.service';
import { calculateB2bPriceForProduct, resolveWholesalerKey } from '../../services/b2b-pricing.service';

const getWholesalersMock = wholesalerConfigService.getAll as jest.Mock;

describe('B2B pricing wholesaler resolution', () => {
  beforeEach(() => {
    getWholesalersMock.mockResolvedValue([
      {
        key: 'leker',
        name: 'Leker',
        prefix: 'leker',
        skuPrefix: 'LEKER-',
        aliases: [],
      },
    ]);
  });

  it('resolves a wholesaler from a product tag when IDs have no prefix', async () => {
    await expect(resolveWholesalerKey('212546537', '53545', ['Leker'])).resolves.toBe('leker');
  });

  it('uses wholesaler rules resolved from product tags', async () => {
    const price = await calculateB2bPriceForProduct(
      129.99,
      '212546537',
      '53545',
      {
        multiplier: 1.4,
        wholesalerRules: {
          leker: {
            rules: [{ priceFrom: 0, priceTo: 1000, multiplier: 1.1, addToPrice: 1 }],
          },
        },
      },
      80,
      ['Leker']
    );

    expect(price).toBe(89.99);
  });
});