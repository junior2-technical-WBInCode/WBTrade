jest.mock('../../db', () => ({
  prisma: {
    coupon: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../services/sale-campaign.service', () => ({
  saleCampaignService: {
    getProductsInNonStackableCampaigns: jest.fn(),
  },
}));

jest.mock('../../services/b2b-pricing.service', () => ({
  getB2bUserInfo: jest.fn(),
  calculateB2bPriceForProduct: jest.fn(),
}));

jest.mock('../../services/wholesaler-config.service', () => ({
  wholesalerConfigService: {
    getAll: jest.fn(),
  },
}));

import { getB2bUserInfo, calculateB2bPriceForProduct } from '../../services/b2b-pricing.service';
import { wholesalerConfigService } from '../../services/wholesaler-config.service';
import { CartService } from '../../services/cart.service';

const getB2bUserInfoMock = getB2bUserInfo as jest.Mock;
const calculateB2bPriceMock = calculateB2bPriceForProduct as jest.Mock;
const getWholesalersMock = wholesalerConfigService.getAll as jest.Mock;

function createCart(userId: string) {
  return {
    id: 'cart-1',
    userId,
    sessionId: null,
    couponCode: null,
    items: [
      {
        id: 'item-1',
        quantity: 1,
        variant: {
          id: 'variant-1',
          name: 'Standard',
          sku: '53545',
          price: 112.99,
          purchasePrice: 80,
          compareAtPrice: null,
          attributes: {},
          inventory: [{ quantity: 10, reserved: 0 }],
          product: {
            id: 'product-1',
            name: 'WOOPIE Mobilna Skrzynia Na Narzedzia',
            slug: 'woopie-mobilna-skrzynia-na-narzedzia',
            price: 112.99,
            purchasePrice: 80,
            baselinkerProductId: '212546537',
            tags: ['Leker'],
            images: [],
          },
        },
      },
    ],
  };
}

describe('Cart pricing by account type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getWholesalersMock.mockResolvedValue([]);
  });

  it('keeps the retail price for a regular user', async () => {
    getB2bUserInfoMock.mockResolvedValue(null);

    const cart = await (new CartService() as any).formatCart(createCart('retail-user'));

    expect(getB2bUserInfoMock).toHaveBeenCalledWith('retail-user');
    expect(calculateB2bPriceMock).not.toHaveBeenCalled();
    expect(cart.items[0].variant.price).toBe(112.99);
    expect(cart.subtotal).toBe(112.99);
    expect(cart.total).toBe(112.99);
  });

  it('uses tagged wholesaler pricing only for a B2B partner', async () => {
    const b2bInfo = {
      multiplier: 1.4,
      wholesalerRules: {
        leker: {
          rules: [{ priceFrom: 0, priceTo: 1000, multiplier: 1.1, addToPrice: 1 }],
        },
      },
    };
    getB2bUserInfoMock.mockResolvedValue(b2bInfo);
    calculateB2bPriceMock.mockResolvedValue(89.99);

    const cart = await (new CartService() as any).formatCart(createCart('b2b-user'));

    expect(calculateB2bPriceMock).toHaveBeenCalledWith(
      112.99,
      '212546537',
      '53545',
      b2bInfo,
      80,
      ['Leker']
    );
    expect(cart.items[0].variant.price).toBe(89.99);
    expect(cart.subtotal).toBe(89.99);
    expect(cart.total).toBe(89.99);
  });
});