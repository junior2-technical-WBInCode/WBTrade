jest.mock('../../services/products.service', () => ({
  ProductsService: jest.fn().mockImplementation(() => ({
    update: jest.fn(),
    updateVariantPrice: jest.fn(),
    updateVariantsStock: jest.fn(),
    getById: jest.fn(),
  })),
}));

jest.mock('../../services/popularity.service', () => ({
  popularityService: {
    incrementViewCount: jest.fn(),
  },
}));

jest.mock('../../services/b2b-pricing.service', () => ({
  getB2bUserInfo: jest.fn(),
  applyB2bPricing: jest.fn(),
}));

import { Request, Response } from 'express';
import { PriceChangeSource } from '@prisma/client';
import { ProductsService } from '../../services/products.service';
import { updateProduct } from '../../controllers/products.controller';

const productsServiceMock = (ProductsService as jest.Mock).mock.results[0].value;

describe('updateProduct variant persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists an existing variant price and returns refreshed product data', async () => {
    const previousProduct = {
      id: 'c12345678901234567890',
      variants: [{ id: 'variant-1', sku: 'DOFIRMY-5904517049543-DEFAULT', price: 49.99 }],
    };
    const refreshedProduct = {
      ...previousProduct,
      price: 34.99,
      variants: [{ id: 'variant-1', sku: 'DOFIRMY-5904517049543-DEFAULT', price: 34.99 }],
    };
    productsServiceMock.update.mockResolvedValue(previousProduct);
    productsServiceMock.updateVariantPrice.mockResolvedValue({ success: true });
    productsServiceMock.updateVariantsStock.mockResolvedValue(undefined);
    productsServiceMock.getById.mockResolvedValue(refreshedProduct);

    const req = {
      params: { id: previousProduct.id },
      body: {
        price: 34.99,
        variants: [
          {
            id: 'variant-1',
            name: 'Domyslny',
            sku: 'DOFIRMY-5904517049543-DEFAULT',
            price: 34.99,
            stock: 10024,
            attributes: {},
          },
        ],
      },
      user: { userId: 'admin-1', role: 'ADMIN' },
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    await updateProduct(req, res);

    expect(productsServiceMock.update).toHaveBeenCalledWith(
      previousProduct.id,
      expect.objectContaining({
        variants: {
          update: [
            {
              where: { id: 'variant-1' },
              data: {
                name: 'Domyslny',
                sku: 'DOFIRMY-5904517049543-DEFAULT',
                compareAtPrice: undefined,
                attributes: {},
              },
            },
          ],
          create: [],
        },
      }),
      expect.objectContaining({ source: PriceChangeSource.API })
    );
    expect(productsServiceMock.updateVariantPrice).toHaveBeenCalledWith(
      'variant-1',
      34.99,
      PriceChangeSource.API,
      undefined,
      'API product variant update'
    );
    expect(productsServiceMock.updateVariantsStock).toHaveBeenCalledWith(['variant-1'], 10024);
    expect(productsServiceMock.getById).toHaveBeenCalledWith(previousProduct.id, { includeHidden: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(refreshedProduct);
  });
});