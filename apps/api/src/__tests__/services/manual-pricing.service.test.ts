jest.mock('../../db', () => ({
  prisma: {
    settings: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../services/b2b-pricing.service', () => ({
  resolveWholesalerKey: jest.fn(),
  calculateB2bPriceForProduct: jest.fn(),
}));

import { prisma } from '../../db';
import { calculateB2bPriceForProduct, resolveWholesalerKey } from '../../services/b2b-pricing.service';
import { calculateManualPricePreview, calculateManualRetailPrice, calculateRetailPrice } from '../../services/manual-pricing.service';

const resolveWholesalerKeyMock = resolveWholesalerKey as jest.Mock;
const calculateB2bPriceMock = calculateB2bPriceForProduct as jest.Mock;

describe('manual wholesale pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveWholesalerKeyMock.mockResolvedValue('dofirmy');
    (prisma.settings.findUnique as jest.Mock).mockResolvedValue({
      value: JSON.stringify([
        { priceFrom: 0, priceTo: 100, multiplier: 1.4, addToPrice: 2 },
      ]),
    });
  });

  it('calculates the retail price from wholesale rules and rounds to .99', () => {
    expect(calculateRetailPrice(30, [
      { priceFrom: 0, priceTo: 100, multiplier: 1.4, addToPrice: 2 },
    ])).toBe(44.99);
  });

  it('loads the wholesaler retail rule for a manual wholesale price', async () => {
    await expect(calculateManualRetailPrice({
      purchasePrice: 30,
      baselinkerProductId: '5904517049543',
      sku: 'DOFIRMY-5904517049543-DEFAULT',
      tags: ['DoFirmy'],
    })).resolves.toEqual({
      purchasePrice: 30,
      wholesalerKey: 'dofirmy',
      retailPrice: 44.99,
    });
    expect(prisma.settings.findUnique).toHaveBeenCalledWith({
      where: { key: 'price_rules_dofirmy' },
    });
  });

  it('previews the default and partner-specific B2B prices', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'partner-1',
        email: 'partner@example.com',
        companyName: 'Partner One',
        firstName: 'Jan',
        lastName: 'Kowalski',
        b2bPriceMultiplier: 1.15,
        b2bWholesalerRules: { dofirmy: { rules: [] } },
      },
    ]);
    calculateB2bPriceMock
      .mockResolvedValueOnce(32.99)
      .mockResolvedValueOnce(34.99);

    const preview = await calculateManualPricePreview({
      purchasePrice: 30,
      baselinkerProductId: '5904517049543',
      sku: 'DOFIRMY-5904517049543-DEFAULT',
      tags: ['DoFirmy'],
    });

    expect(preview).toEqual({
      purchasePrice: 30,
      wholesalerKey: 'dofirmy',
      retailPrice: 44.99,
      defaultB2bPrice: 32.99,
      partnerPrices: [{ partnerId: 'partner-1', label: 'Partner One', price: 34.99 }],
      partnerB2bMinPrice: 34.99,
      partnerB2bMaxPrice: 34.99,
    });
    expect(calculateB2bPriceMock).toHaveBeenNthCalledWith(
      1,
      44.99,
      '5904517049543',
      'DOFIRMY-5904517049543-DEFAULT',
      { multiplier: 1.1, wholesalerRules: {} },
      30,
      ['DoFirmy']
    );
    expect(calculateB2bPriceMock).toHaveBeenNthCalledWith(
      2,
      44.99,
      '5904517049543',
      'DOFIRMY-5904517049543-DEFAULT',
      {
        multiplier: 1.15,
        wholesalerRules: { dofirmy: { rules: [] } },
      },
      30,
      ['DoFirmy']
    );
  });
});