import { prisma } from '../db';
import { roundMoney } from '../lib/currency';
import { saleCampaignService } from './sale-campaign.service';
import { getB2bUserInfo, calculateB2bPrice } from './b2b-pricing.service';

export interface CartWithItems {
  id: string;
  userId: string | null;
  sessionId: string | null;
  couponCode: string | null;
  items: CartItemWithProduct[];
  subtotal: number;
  discount: number;
  total: number;
}

export interface CartItemWithProduct {
  id: string;
  quantity: number;
  variant: {
    id: string;
    name: string;
    sku: string;
    price: number;
    compareAtPrice: number | null;
    attributes: Record<string, string>;
    product: {
      id: string;
      name: string;
      slug: string;
      images: { url: string; alt: string | null }[];
      tags: string[];
      wholesaler: string | null;
    };
    inventory: { quantity: number; reserved: number }[];
  };
}

export class CartService {
  /**
   * Get or create cart for user or session (full version with formatted items)
   */
  async getOrCreateCart(userId?: string, sessionId?: string): Promise<CartWithItems> {
    let cart = await this.findCart(userId, sessionId);

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          userId: userId || null,
          sessionId: userId ? null : sessionId || null,
          expiresAt: userId ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days for guest
        },
        include: this.cartInclude,
      });
    }

    return await this.formatCart(cart);
  }

  /**
   * Lightweight: get or create cart, return only the ID (no heavy includes/formatting)
   */
  async getOrCreateCartId(userId?: string, sessionId?: string): Promise<string> {
    const selectId = { id: true };

    if (userId) {
      const existing = await prisma.cart.findUnique({ where: { userId }, select: selectId });
      if (existing) return existing.id;
    } else if (sessionId) {
      const existing = await prisma.cart.findUnique({ where: { sessionId }, select: selectId });
      if (existing) return existing.id;
    }

    const cart = await prisma.cart.create({
      data: {
        userId: userId || null,
        sessionId: userId ? null : sessionId || null,
        expiresAt: userId ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: selectId,
    });
    return cart.id;
  }

  /**
   * Find existing cart
   */
  private async findCart(userId?: string, sessionId?: string) {
    if (userId) {
      return prisma.cart.findUnique({
        where: { userId },
        include: this.cartInclude,
      });
    }

    if (sessionId) {
      return prisma.cart.findUnique({
        where: { sessionId },
        include: this.cartInclude,
      });
    }

    return null;
  }

  /**
   * Add item to cart (accepts userId/sessionId to parallelize cart lookup with variant check).
   * If cachedCartId is provided and valid, skips the cart ID lookup entirely.
   */
  async addItemFast(
    userId: string | undefined,
    sessionId: string | undefined,
    variantId: string,
    quantity = 1,
    cachedCartId?: string
  ): Promise<CartWithItems> {
    // Step 1: Get cart ID and variant info in parallel (saves a round-trip)
    // If we have a cached cart ID, verify it exists in parallel with variant fetch
    const [cartId, variant] = await Promise.all([
      cachedCartId
        ? prisma.cart.findUnique({ where: { id: cachedCartId }, select: { id: true } })
            .then(c => c?.id || this.getOrCreateCartId(userId, sessionId))
        : this.getOrCreateCartId(userId, sessionId),
      prisma.productVariant.findUnique({
        where: { id: variantId },
        include: {
          inventory: true,
          product: {
            select: { name: true, status: true }
          }
        }
      }),
    ]);

    if (!variant) {
      throw new Error(`Wariant o ID ${variantId} nie został znaleziony`);
    }

    if (variant.product.status !== 'ACTIVE') {
      throw new Error(`Produkt "${variant.product.name}" jest niedostępny`);
    }

    // Calculate available stock
    const availableStock = variant.inventory.reduce(
      (sum, inv) => sum + (inv.quantity - inv.reserved), 
      0
    );

    if (availableStock <= 0) {
      throw new Error(`Produkt "${variant.product.name}" jest niedostępny (brak na stanie)`);
    }

    // Step 2: Upsert cart item (single query instead of find + update/create)
    // Use a raw approach: try to find existing and handle accordingly
    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      select: { id: true, quantity: true },
    });

    const totalRequestedQuantity = (existingItem?.quantity || 0) + quantity;

    if (totalRequestedQuantity > availableStock) {
      throw new Error(
        `Niewystarczająca ilość produktu "${variant.product.name}". ` +
        `Dostępne: ${availableStock} szt., żądane: ${totalRequestedQuantity} szt.`
      );
    }

    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: totalRequestedQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId, variantId, quantity },
      });
    }

    // Step 3: Fetch full cart with items (single query + format)
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Add item to cart (legacy — used internally)
   */
  async addItem(
    cartId: string,
    variantId: string,
    quantity = 1
  ): Promise<CartWithItems> {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        inventory: true,
        product: {
          select: { name: true, status: true }
        }
      }
    });

    if (!variant) {
      throw new Error(`Wariant o ID ${variantId} nie został znaleziony`);
    }

    if (variant.product.status !== 'ACTIVE') {
      throw new Error(`Produkt "${variant.product.name}" jest niedostępny`);
    }

    const availableStock = variant.inventory.reduce(
      (sum, inv) => sum + (inv.quantity - inv.reserved), 
      0
    );

    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      select: { id: true, quantity: true },
    });

    const totalRequestedQuantity = (existingItem?.quantity || 0) + quantity;

    if (availableStock <= 0) {
      throw new Error(`Produkt "${variant.product.name}" jest niedostępny (brak na stanie)`);
    }

    if (totalRequestedQuantity > availableStock) {
      throw new Error(
        `Niewystarczająca ilość produktu "${variant.product.name}". ` +
        `Dostępne: ${availableStock} szt., żądane: ${totalRequestedQuantity} szt.`
      );
    }

    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: totalRequestedQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId, variantId, quantity },
      });
    }

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Update item quantity
   */
  async updateItemQuantity(
    cartId: string,
    itemId: string,
    quantity: number
  ): Promise<CartWithItems> {
    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      await prisma.cartItem.delete({
        where: { id: itemId },
      });
    } else {
      // Get the cart item with variant and inventory
      const cartItem = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: {
          variant: {
            include: {
              inventory: true,
              product: { select: { name: true } }
            }
          }
        }
      });

      if (!cartItem) {
        throw new Error('Produkt nie został znaleziony w koszyku');
      }

      // Calculate available stock
      const availableStock = cartItem.variant.inventory.reduce(
        (sum, inv) => sum + (inv.quantity - inv.reserved),
        0
      );

      if (quantity > availableStock) {
        throw new Error(
          `Niewystarczająca ilość produktu "${cartItem.variant.product.name}". ` +
          `Dostępne: ${availableStock} szt., żądane: ${quantity} szt.`
        );
      }

      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity },
      });
    }

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Remove item from cart
   */
  async removeItem(cartId: string, itemId: string): Promise<CartWithItems> {
    // Use deleteMany with cartId check — won't throw if item doesn't exist
    await prisma.cartItem.deleteMany({
      where: { id: itemId, cartId },
    });

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Clear all items from cart and reset coupon
   */
  async clearCart(cartId: string): Promise<CartWithItems> {
    // Delete all items from cart
    await prisma.cartItem.deleteMany({
      where: { cartId },
    });

    // Also clear the coupon - it should not persist after order/clear
    await prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: null },
    });

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Apply coupon to cart
   */
  async applyCoupon(cartId: string, couponCode: string, userId?: string): Promise<CartWithItems> {
    // Block coupons for B2B partners
    if (userId) {
      const b2bInfo = await getB2bUserInfo(userId);
      if (b2bInfo) {
        throw new Error('Kupony rabatowe nie są dostępne dla kont B2B');
      }
    }

    // Normalize coupon code - uppercase and trim whitespace
    const normalizedCode = couponCode.toUpperCase().trim();
    
    // Validate coupon
    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (!coupon) {
      console.log(`[CartService] Coupon not found: "${normalizedCode}" (original: "${couponCode}")`);
      throw new Error('Nieprawidłowy kod kuponu');
    }

    if (!coupon.isActive) {
      throw new Error('Kupon jest nieaktywny');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new Error('Kupon wygasł');
    }

    if (coupon.maximumUses && coupon.usedCount >= coupon.maximumUses) {
      throw new Error('Kupon został wykorzystany maksymalną liczbę razy');
    }

    // Check ownership for personal coupons (WELCOME_DISCOUNT, APP_DOWNLOAD, DELIVERY_DELAY)
    if ((coupon.couponSource === 'WELCOME_DISCOUNT' || coupon.couponSource === 'APP_DOWNLOAD' || coupon.couponSource === 'DELIVERY_DELAY') && coupon.userId) {
      if (coupon.userId !== userId) {
        throw new Error('Ten kod rabatowy należy do innego użytkownika');
      }
    }

    // Check email restriction (e.g. DELIVERY_DELAY coupons for guests)
    if (coupon.restrictedToEmail) {
      let userEmail: string | null = null;
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        userEmail = user?.email || null;
      }
      // For guests applying coupon before checkout, we allow it here
      // but re-validate at order creation when guest provides their email.
      // For logged-in users, validate immediately.
      if (userEmail && userEmail.toLowerCase() !== coupon.restrictedToEmail.toLowerCase()) {
        throw new Error('Ten kod rabatowy jest przypisany do innego adresu e-mail');
      }
    }

    // Check if coupon requires authentication (registered users only)
    if (coupon.requiresAuth && !userId) {
      throw new Error('Ten kod rabatowy jest dostępny tylko dla zarejestrowanych użytkowników');
    }

    // Check if user already used this coupon (single use per user)
    if (coupon.singleUsePerUser && userId) {
      const existingUsage = await prisma.couponUsage.findUnique({
        where: { couponId_userId: { couponId: coupon.id, userId } },
      });
      if (existingUsage) {
        throw new Error('Już wykorzystałeś ten kupon');
      }
    }

    // Check for NEWSLETTER coupon restrictions - cannot be combined with other discount types
    // This is informational since only one coupon can be applied at a time
    if (coupon.couponSource === 'NEWSLETTER') {
      console.log(`[CartService] Newsletter coupon ${normalizedCode} applied - note: cannot combine with registration/promo codes`);
    }

    // Check if any cart products are in a non-stackable sale campaign
    const cartWithItems = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: { select: { variant: { select: { productId: true } } } } },
    });
    if (cartWithItems?.items.length) {
      const productIds = cartWithItems.items.map(i => i.variant.productId);
      const nonStackable = await saleCampaignService.getProductsInNonStackableCampaigns(productIds);
      if (nonStackable.length > 0) {
        throw new Error('Koszyk zawiera produkty w promocji, która nie łączy się z kuponami rabatowymi');
      }
    }

    await prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: normalizedCode },
    });

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Remove coupon from cart
   */
  async removeCoupon(cartId: string): Promise<CartWithItems> {
    await prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: null },
    });

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: this.cartInclude,
    });

    return await this.formatCart(cart!);
  }

  /**
   * Merge guest cart into user cart after login
   */
  async mergeCarts(userId: string, sessionId: string): Promise<CartWithItems> {
    const [userCart, guestCart] = await Promise.all([
      prisma.cart.findUnique({
        where: { userId },
        include: this.cartInclude,
      }),
      prisma.cart.findUnique({
        where: { sessionId },
        include: this.cartInclude,
      }),
    ]);

    if (!guestCart) {
      // No guest cart to merge
      if (userCart) {
        return await this.formatCart(userCart);
      }
      return this.getOrCreateCart(userId);
    }

    if (!userCart) {
      // Convert guest cart to user cart
      const updatedCart = await prisma.cart.update({
        where: { id: guestCart.id },
        data: {
          userId,
          sessionId: null,
          expiresAt: null,
        },
        include: this.cartInclude,
      });
      return await this.formatCart(updatedCart);
    }

    // Merge items from guest cart to user cart
    for (const guestItem of guestCart.items) {
      const existingItem = userCart.items.find(
        (item) => item.variantId === guestItem.variantId
      );

      if (existingItem) {
        // Add quantities
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + guestItem.quantity },
        });
      } else {
        // Move item to user cart
        await prisma.cartItem.update({
          where: { id: guestItem.id },
          data: { cartId: userCart.id },
        });
      }
    }

    // Copy coupon from guest cart if user cart doesn't have one
    if (guestCart.couponCode && !userCart.couponCode) {
      await prisma.cart.update({
        where: { id: userCart.id },
        data: { couponCode: guestCart.couponCode },
      });
    }

    // Delete empty guest cart
    await prisma.cart.delete({
      where: { id: guestCart.id },
    });

    const mergedCart = await prisma.cart.findUnique({
      where: { id: userCart.id },
      include: this.cartInclude,
    });

    return await this.formatCart(mergedCart!);
  }

  /**
   * Include relations for cart queries
   */
  private cartInclude = {
    items: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                tags: true,
                images: {
                  orderBy: { order: 'asc' as const },
                  take: 1,
                },
              },
            },
            inventory: true,
          },
        },
      },
    },
  };

  /**
   * Get wholesaler from product tags
   * Priority: Rzeszów/Outlet > other wholesalers (for outlet products shipped from Rzeszów)
   */
  private getWholesaler(tags: string[]): string | null {
    // First check for Rzeszów/Outlet - these have priority over other wholesalers
    for (const tag of tags) {
      if (/^(Rzeszów|Outlet)$/i.test(tag)) {
        return tag;
      }
    }
    
    // Then check for other wholesaler tags
    const WHOLESALER_PATTERN = /^(hurtownia[:\-_](.+)|Ikonka|BTP|HP|Gastro|Horeca|Hurtownia\s+Przemysłowa|Leker|Forcetop|DoFirmy)$/i;
    for (const tag of tags) {
      const match = tag.match(WHOLESALER_PATTERN);
      if (match) {
        // Return the captured group if present (e.g., "HP" from "hurtownia:HP"), or the whole match
        return match[2] || match[1];
      }
    }
    return null;
  }

  /**
   * Format cart with calculated totals
   */
  private async formatCart(cart: any): Promise<CartWithItems> {
    // Check if cart belongs to a B2B user
    let b2bMultiplier: number | null = null;
    if (cart.userId) {
      const b2bInfo = await getB2bUserInfo(cart.userId);
      if (b2bInfo) b2bMultiplier = b2bInfo.multiplier;
    }

    const items: CartItemWithProduct[] = cart.items.map((item: any) => {
      // Use variant price, but fallback to product price if variant price is 0
      const variantPrice = Number(item.variant.price);
      const productPrice = Number(item.variant.product.price || 0);
      let effectivePrice = variantPrice > 0 ? variantPrice : productPrice;

      // Apply B2B pricing
      if (b2bMultiplier) {
        effectivePrice = calculateB2bPrice(effectivePrice, b2bMultiplier);
      }
      const tags = item.variant.product.tags || [];
      const wholesaler = this.getWholesaler(tags);
      
      return {
        id: item.id,
        quantity: item.quantity,
        variant: {
          id: item.variant.id,
          name: item.variant.name,
          sku: item.variant.sku,
          price: effectivePrice,
          compareAtPrice: item.variant.compareAtPrice
            ? Number(item.variant.compareAtPrice)
            : null,
          attributes: item.variant.attributes,
          product: {
            id: item.variant.product.id,
            name: item.variant.product.name,
            slug: item.variant.product.slug,
            images: item.variant.product.images,
            tags: tags,
            wholesaler: wholesaler,
          },
          inventory: item.variant.inventory.map((inv: any) => ({
            quantity: inv.quantity,
            reserved: inv.reserved,
          })),
        },
      };
    });

    const subtotal = roundMoney(items.reduce(
      (sum, item) => sum + item.variant.price * item.quantity,
      0
    ));

    // Calculate discount based on coupon
    let discount = 0;
    if (cart.couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: cart.couponCode },
      });
      
      if (coupon && coupon.isActive 
          && (!coupon.expiresAt || coupon.expiresAt > new Date())
          && (!coupon.maximumUses || coupon.usedCount < coupon.maximumUses)) {
        // Check non-stackable campaigns — skip discount if any item is in one
        const productIds = items.map(i => i.variant.product.id);
        const nonStackable = await saleCampaignService.getProductsInNonStackableCampaigns(productIds);
        const allBlocked = nonStackable.length > 0 && productIds.every(id => nonStackable.includes(id));

        if (!allBlocked) {
          if (coupon.type === 'PERCENTAGE') {
            // Percentage discount
            discount = roundMoney(subtotal * Number(coupon.value) / 100);
          } else if (coupon.type === 'FIXED_AMOUNT') {
            // Fixed amount discount
            discount = roundMoney(Math.min(Number(coupon.value), subtotal));
          }
        }
      }
    }

    const total = roundMoney(subtotal - discount);

    return {
      id: cart.id,
      userId: cart.userId,
      sessionId: cart.sessionId,
      couponCode: cart.couponCode,
      items,
      subtotal,
      discount,
      total,
    };
  }
}

export const cartService = new CartService();
