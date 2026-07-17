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

jest.mock('../../services/manual-pricing.service', () => ({
  calculateManualRetailPrice: jest.fn(),
  calculateManualPricePreview: jest.fn(),
}));

import { Request, Response } from 'express';
import { PriceChangeSource } from '@prisma/client';
import { ProductsService } from '../../services/products.service';
import { calculateManualPricePreview, calculateManualRetailPrice } from '../../services/manual-pricing.service';
import { previewManualPrices, updateProduct } from '../../controllers/products.controller';

const productsServiceMock = (ProductsService as jest.Mock).mock.results[0].value;
const calculateManualRetailPriceMock = calculateManualRetailPrice as jest.Mock;
const calculateManualPricePreviewMock = calculateManualPricePreview as jest.Mock;

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
      'admin-1',
      'API product variant update'
    );
    expect(productsServiceMock.updateVariantsStock).toHaveBeenCalledWith(['variant-1'], 10024);
    expect(productsServiceMock.getById).toHaveBeenCalledWith(previousProduct.id, { includeHidden: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(refreshedProduct);
  });

  it('derives retail prices and persists purchase prices from wholesale input', async () => {
    const currentProduct = {
      id: 'c12345678901234567890',
      sku: 'DOFIRMY-5904517049543',
      baselinkerProductId: '5904517049543',
      tags: ['DoFirmy'],
      variants: [{ id: 'variant-1', sku: 'DOFIRMY-5904517049543-DEFAULT', price: 49.99 }],
    };
    const refreshedProduct = {
      ...currentProduct,
      price: 44.99,
      purchasePrice: 30,
      variants: [{
        id: 'variant-1',
        sku: 'DOFIRMY-5904517049543-DEFAULT',
        price: 44.99,
        purchasePrice: 30,
      }],
    };
    productsServiceMock.getById
      .mockResolvedValueOnce(currentProduct)
      .mockResolvedValueOnce(refreshedProduct);
    productsServiceMock.update.mockResolvedValue(currentProduct);
    productsServiceMock.updateVariantPrice.mockResolvedValue({ success: true });
    productsServiceMock.updateVariantsStock.mockResolvedValue(undefined);
    calculateManualRetailPriceMock.mockResolvedValue({
      purchasePrice: 30,
      wholesalerKey: 'dofirmy',
      retailPrice: 44.99,
    });

    const req = {
      params: { id: currentProduct.id },
      body: {
        price: 49.99,
        variants: [
          {
            id: 'variant-1',
            name: 'Domyslny',
            sku: 'DOFIRMY-5904517049543-DEFAULT',
            price: 49.99,
            purchasePrice: 30,
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

    expect(calculateManualRetailPriceMock).toHaveBeenCalledWith({
      purchasePrice: 30,
      baselinkerProductId: '5904517049543',
      sku: 'DOFIRMY-5904517049543-DEFAULT',
      tags: ['DoFirmy'],
    });
    expect(productsServiceMock.update).toHaveBeenCalledWith(
      currentProduct.id,
      expect.objectContaining({
        price: 44.99,
        purchasePrice: 30,
        variants: expect.objectContaining({
          update: [expect.objectContaining({
            where: { id: 'variant-1' },
            data: expect.objectContaining({ purchasePrice: 30 }),
          })],
        }),
      }),
      expect.objectContaining({ source: PriceChangeSource.API, changedBy: 'admin-1' })
    );
    expect(productsServiceMock.updateVariantPrice).toHaveBeenCalledWith(
      'variant-1',
      44.99,
      PriceChangeSource.API,
      'admin-1',
      'API product variant update'
    );
    expect(res.json).toHaveBeenCalledWith(refreshedProduct);
  });

  it('returns live retail and B2B previews for wholesale inputs', async () => {
    productsServiceMock.getById.mockResolvedValue({
      id: 'c12345678901234567890',
      sku: 'DOFIRMY-5904517049543',
      baselinkerProductId: '5904517049543',
      tags: ['DoFirmy'],
    });
    calculateManualPricePreviewMock.mockResolvedValue({
      purchasePrice: 30,
      wholesalerKey: 'dofirmy',
      retailPrice: 44.99,
      defaultB2bPrice: 32.99,
      partnerPrices: [{ partnerId: 'partner-1', label: 'Partner One', price: 34.99 }],
      partnerB2bMinPrice: 34.99,
      partnerB2bMaxPrice: 34.99,
    });
    const req = {
      body: {
        productId: 'c12345678901234567890',
        items: [{
          key: 'variant-1',
          sku: 'DOFIRMY-5904517049543-DEFAULT',
          purchasePrice: 30,
        }],
      },
    } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    await previewManualPrices(req, res);

    expect(calculateManualPricePreviewMock).toHaveBeenCalledWith({
      purchasePrice: 30,
      baselinkerProductId: '5904517049543',
      sku: 'DOFIRMY-5904517049543-DEFAULT',
      tags: ['DoFirmy'],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      items: [{
        key: 'variant-1',
        purchasePrice: 30,
        wholesalerKey: 'dofirmy',
        retailPrice: 44.99,
        defaultB2bPrice: 32.99,
        partnerPrices: [{ partnerId: 'partner-1', label: 'Partner One', price: 34.99 }],
        partnerB2bMinPrice: 34.99,
        partnerB2bMaxPrice: 34.99,
      }],
    });
  });
});