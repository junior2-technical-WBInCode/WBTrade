import { Request, Response } from 'express';
import { z } from 'zod';
import { cartService } from '../services/cart.service';

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * CUID validation helper (Prisma uses CUID by default)
 */
const isValidCUID = (id: string): boolean => {
  const cuidRegex = /^c[a-z0-9]{20,}$/i;
  return cuidRegex.test(id);
};

/**
 * Add item to cart schema
 */
const addItemSchema = z.object({
  variantId: z.string().regex(/^c[a-z0-9]{20,}$/i, 'Invalid variant ID'),
  quantity: z.number().int().positive().max(10000).optional().default(1),
});

/**
 * Update item quantity schema
 */
const updateItemSchema = z.object({
  quantity: z.number().int().min(0, 'Quantity cannot be negative').max(10000, 'Maximum quantity is 10000'),
});

/**
 * Apply coupon schema
 */
const applyCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Coupon code is required')
    .max(50, 'Coupon code is too long')
    .transform((val) => val.toUpperCase().trim()),
});

/**
 * Merge carts schema
 */
const mergeCartsSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required').max(100),
});

export class CartController {
  /**
   * Extract userId from JWT (req.user) only — never trust client headers
   */
  private getUserId(req: Request): string | undefined {
    return req.user?.userId;
  }

  /**
   * Get current cart
   * GET /api/cart
   */
  async getCart(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;

      if (!userId && !sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Wymagany userId lub sessionId',
        });
      }

      // Validate user ID if provided
      if (userId && !isValidCUID(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Nieprawidlowy format ID uzytkownika',
        });
      }

      const cart = await cartService.getOrCreateCart(userId, sessionId);

      res.json({
        success: true,
        data: cart,
      });
    } catch (error) {
      console.error('Get cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Błąd podczas pobierania koszyka',
      });
    }
  }

  /**
   * Extract cached cart ID from header (validated as CUID)
   */
  private getCachedCartId(req: Request): string | undefined {
    const cartId = req.headers['x-cart-id'] as string | undefined;
    if (cartId && isValidCUID(cartId)) return cartId;
    return undefined;
  }

  /**
   * Add item to cart
   * POST /api/cart/items
   */
  async addItem(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;
      const cachedCartId = this.getCachedCartId(req);

      if (userId && !isValidCUID(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Nieprawidlowy format ID uzytkownika',
        });
      }

      const validation = addItemSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
      }

      const { variantId, quantity } = validation.data;

      // Fast path: parallelize cart lookup + variant check
      const updatedCart = await cartService.addItemFast(userId, sessionId, variantId, quantity, cachedCartId);

      res.json({
        success: true,
        data: updatedCart,
        message: 'Produkt dodany do koszyka',
      });
    } catch (error: any) {
      console.error('Add to cart error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Błąd podczas dodawania do koszyka',
      });
    }
  }

  /**
   * Update item quantity
   * PATCH /api/cart/items/:itemId
   */
  async updateItem(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;
      const { itemId } = req.params;

      if (!isValidCUID(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Nieprawidlowy format ID elementu',
        });
      }

      const validation = updateItemSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
      }

      const cartId = this.getCachedCartId(req) || await cartService.getOrCreateCartId(userId, sessionId);
      const updatedCart = await cartService.updateItemQuantity(cartId, itemId, validation.data.quantity);

      res.json({
        success: true,
        data: updatedCart,
      });
    } catch (error) {
      console.error('Update cart item error:', error);
      res.status(500).json({
        success: false,
        message: 'Błąd podczas aktualizacji koszyka',
      });
    }
  }

  /**
   * Remove item from cart
   * DELETE /api/cart/items/:itemId
   */
  async removeItem(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;
      const { itemId } = req.params;

      if (!isValidCUID(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Nieprawidlowy format ID elementu',
        });
      }

      const cartId = this.getCachedCartId(req) || await cartService.getOrCreateCartId(userId, sessionId);
      const updatedCart = await cartService.removeItem(cartId, itemId);

      res.json({
        success: true,
        data: updatedCart,
        message: 'Produkt usunięty z koszyka',
      });
    } catch (error) {
      console.error('Remove cart item error:', error);
      res.status(500).json({
        success: false,
        message: 'Błąd podczas usuwania z koszyka',
      });
    }
  }

  /**
   * Clear cart
   * DELETE /api/cart
   */
  async clearCart(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;

      const cartId = this.getCachedCartId(req) || await cartService.getOrCreateCartId(userId, sessionId);
      const updatedCart = await cartService.clearCart(cartId);

      res.json({
        success: true,
        data: updatedCart,
        message: 'Koszyk wyczyszczony',
      });
    } catch (error) {
      console.error('Clear cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Błąd podczas czyszczenia koszyka',
      });
    }
  }

  /**
   * Apply coupon
   * POST /api/cart/coupon
   */
  async applyCoupon(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;

      const validation = applyCouponSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
      }

      const cartId = this.getCachedCartId(req) || await cartService.getOrCreateCartId(userId, sessionId);
      const updatedCart = await cartService.applyCoupon(cartId, validation.data.code, userId);

      res.json({
        success: true,
        data: updatedCart,
        message: 'Kupon zastosowany',
      });
    } catch (error: any) {
      console.error('Apply coupon error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Błąd podczas stosowania kuponu',
      });
    }
  }

  /**
   * Remove coupon
   * DELETE /api/cart/coupon
   */
  async removeCoupon(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      const sessionId = req.headers['x-session-id'] as string | undefined;

      const cartId = this.getCachedCartId(req) || await cartService.getOrCreateCartId(userId, sessionId);
      const updatedCart = await cartService.removeCoupon(cartId);

      res.json({
        success: true,
        data: updatedCart,
        message: 'Kupon usunięty',
      });
    } catch (error) {
      console.error('Remove coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Błąd podczas usuwania kuponu',
      });
    }
  }

  /**
   * Merge guest cart after login
   * POST /api/cart/merge
   */
  async mergeCarts(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req) as string;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Wymagane zalogowanie',
        });
      }

      if (!isValidCUID(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Nieprawidlowy format ID uzytkownika',
        });
      }

      const validation = mergeCartsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
      }

      const cart = await cartService.mergeCarts(userId, validation.data.sessionId);

      res.json({
        success: true,
        data: cart,
        message: 'Koszyki połączone',
      });
    } catch (error) {
      console.error('Merge carts error:', error);
      res.status(500).json({
        success: false,
        message: 'Błąd podczas łączenia koszyków',
      });
    }
  }
}

export const cartController = new CartController();
