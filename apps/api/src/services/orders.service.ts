import { prisma } from '../db';
import { OrderStatus, Prisma, StockMovementType } from '@prisma/client';
import { baselinkerOrdersService } from './baselinker-orders.service';
import { popularityService } from './popularity.service';
import { roundMoney, addMoney, subtractMoney } from '../lib/currency';
import { createBaselinkerProvider } from '../providers/baselinker';
import { decryptToken } from '../lib/encryption';
import { getB2bUserInfo, calculateB2bPriceForProduct } from './b2b-pricing.service';
import { referralService } from './referral.service';
import { salesRepService } from './sales-rep.service';
import { queueEmail } from '../lib/queue';

// Courier name mapping for display
const COURIER_NAMES: Record<string, string> = {
  'inpost': 'InPost Paczkomat',
  'inpost_paczkomaty': 'InPost Paczkomat',
  'inpost_courier': 'Kurier InPost',
  'inpost_kurier': 'Kurier InPost',
  'dpd': 'Kurier DPD',
  'dpd_kurier': 'Kurier DPD',
  'dpd_courier': 'Kurier DPD',
  'dhl': 'Kurier DHL',
  'dhl_kurier': 'Kurier DHL',
  'ups': 'Kurier UPS',
  'gls': 'Kurier GLS',
  'poczta_polska': 'Poczta Polska',
  'pocztex': 'Pocztex',
  'fedex': 'Kurier FedEx',
  'geis': 'Kurier Geis',
  'raben': 'Kurier Raben',
};

interface PackageShippingItem {
  packageId: string;
  wholesaler?: string;
  method: string;
  price: number;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  useCustomAddress?: boolean;
  customAddress?: {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    apartment?: string;
    postalCode: string;
    city: string;
  };
  items?: {
    productId: string;
    productName: string;
    variantId: string;
    variantName: string;
    quantity: number;
    image?: string;
  }[];
}

interface CreateOrderData {
  userId?: string;
  shippingAddressId?: string;
  billingAddressId?: string;
  shippingMethod: string;
  paymentMethod: string;
  items: {
    variantId: string;
    quantity: number;
    unitPrice: number;
  }[];
  customerNotes?: string;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  packageShipping?: PackageShippingItem[];
  // Server-calculated shipping cost (authoritative, never from client)
  shippingCost?: number;
  // Discount/coupon fields
  couponCode?: string;
  discount?: number;
  // Google Ads click attribution (from _gcl_aw cookie; informational only, never blocks checkout)
  gclid?: string | null;
  gclidCapturedAt?: Date | null;
  // Guest checkout fields
  guestEmail?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestPhone?: string;
  // Invoice preference
  wantInvoice?: boolean;
  addToCollectiveInvoice?: boolean;
  // Business order fields (for FV00 suffix)
  billingNip?: string;
  billingCompanyName?: string;
  // Referral / affiliate fields
  referral?: {
    lastClick: string;
    touched: string[];
  };
  buyerIp?: string;
  // True when the order is created through the sales-rep (handlowiec) panel.
  // Such orders are excluded from affiliate attribution when the admin
  // protection toggle (sales_rep_config.blockAffiliation) is enabled.
  isSalesRepOrder?: boolean;
  // When true, the automatic "unpaid" Baselinker sync is skipped at creation.
  // Used when the caller intends to immediately mark the order as paid, so the
  // order is synced only once (with paid status) instead of racing two syncs.
  skipBaselinkerSync?: boolean;
}

interface GetAllOrdersParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'total' | 'orderNumber';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Generate order number
 * Regular orders: WB-TIMESTAMP-RANDOM
 * Business orders (with NIP): WB-TIMESTAMP-FV00 (FV00 indicates invoice/business order)
 */
function generateOrderNumber(isBusinessOrder: boolean = false): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  
  if (isBusinessOrder) {
    // Business order - use FV00 suffix (Faktura VAT indicator)
    return `WB-${timestamp}-FV00`;
  }
  
  // Regular order - random suffix
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `WB-${timestamp}-${random}`;
}

export class OrdersService {
  /**
   * Get all orders (admin)
   */
  async getAll(params: GetAllOrdersParams = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null, // Exclude archived/soft-deleted orders
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { guestEmail: { contains: search, mode: 'insensitive' } },
        { guestFirstName: { contains: search, mode: 'insensitive' } },
        { guestLastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [orders, total, statusCountsRaw] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          items: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          shippingAddress: true,
        },
      }),
      prisma.order.count({ where }),
      // Always get counts for ALL statuses (excluding archived) for the status cards
      prisma.order.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
    ]);

    // Convert groupBy result to a simple { STATUS: count } object
    const statusCounts: Record<string, number> = {};
    statusCountsRaw.forEach((item) => {
      statusCounts[item.status] = item._count;
    });

    return {
      orders,
      statusCounts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create a new order
   */
  async create(data: CreateOrderData) {
    // Check if this is a business order (has NIP)
    const isBusinessOrder = Boolean(data.billingNip && data.billingNip.trim().length > 0);
    const orderNumber = generateOrderNumber(isBusinessOrder);
    
    console.log(`[Orders] Creating order: isBusinessOrder=${isBusinessOrder}, NIP=${data.billingNip || 'none'}, orderNumber=${orderNumber}`);
    
    // SECURITY: Look up real prices from DB for all items to prevent price manipulation
    // Also pre-fetch product/variant names to avoid redundant lookups inside the transaction
    const b2bInfo = data.userId ? await getB2bUserInfo(data.userId) : null;
    const itemsWithRealPrices = await Promise.all(
      data.items.map(async (item) => {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: { select: { name: true, baselinkerProductId: true, purchasePrice: true, tags: true } } },
        });
        let realPrice = variant ? Number(variant.price) : item.unitPrice;
        // Apply B2B pricing for B2B partners
        if (b2bInfo && variant) {
          realPrice = await calculateB2bPriceForProduct(
            realPrice,
            variant.product.baselinkerProductId,
            variant.sku,
            b2bInfo,
            variant.purchasePrice ?? variant.product.purchasePrice,
            variant.product.tags
          );
        }
        if (variant && !b2bInfo && Math.abs(realPrice - item.unitPrice) > 0.01) {
          console.warn(`[SECURITY] Price mismatch for variant ${item.variantId}: client sent ${item.unitPrice}, DB price is ${realPrice}`);
        }
        return {
          ...item,
          unitPrice: realPrice,
          productName: variant?.product.name || 'Unknown',
          variantName: variant?.name || 'Default',
          sku: variant?.sku || '',
        };
      })
    );
    
    // Calculate totals using REAL prices from DB (not client-provided)
    // Note: Product prices are already gross (including VAT) in Poland
    const subtotal = roundMoney(itemsWithRealPrices.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    ));
    
    // Use server-calculated shipping cost (already validated in checkout controller)
    // SECURITY: Never derive shipping from packageShipping.price — those originate from client
    let shipping = 0;
    if (data.shippingCost !== undefined) {
      shipping = roundMoney(data.shippingCost);
    } else if (data.packageShipping && data.packageShipping.length > 0) {
      // Fallback for backward compatibility — should only be called with server-validated prices
      shipping = roundMoney(data.packageShipping.reduce((sum, pkg) => sum + (pkg.price || 0), 0));
    }
    
    // Get discount from data (calculated in checkout controller)
    const discount = roundMoney(data.discount || 0);
    
    // VAT is already included in product prices (Polish prices are gross)
    // We calculate VAT for display purposes only (23% is already in the price)
    const tax = 0; // VAT already included in prices
    const total = roundMoney(subtotal + shipping - discount);

    const order = await prisma.$transaction(async (tx) => {
      // NOTE: Coupon usedCount is incremented when payment is confirmed (payment.service.ts)
      // NOT here at order creation, to prevent coupon loss on unpaid/abandoned orders
      
      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: data.userId,
          shippingAddressId: data.shippingAddressId,
          billingAddressId: data.billingAddressId,
          shippingMethod: data.shippingMethod,
          paymentMethod: data.paymentMethod,
          paczkomatCode: data.paczkomatCode,
          paczkomatAddress: data.paczkomatAddress,
          packageShipping: data.packageShipping ? JSON.parse(JSON.stringify(data.packageShipping)) : Prisma.JsonNull,
          status: 'OPEN', // Order is OPEN until payment is completed
          subtotal,
          shipping,
          discount,
          couponCode: data.couponCode, // Store the coupon code used
          gclid: data.gclid || null,
          gclidCapturedAt: data.gclidCapturedAt || null,
          tax,
          total,
          customerNotes: data.customerNotes,
          wantInvoice: data.wantInvoice || false,
          addToCollectiveInvoice: data.addToCollectiveInvoice || false,
          // Business order fields (FV00 suffix)
          billingNip: data.billingNip || null,
          billingCompanyName: data.billingCompanyName || null,
          isBusinessOrder,
          // Guest checkout fields
          guestEmail: data.guestEmail,
          guestFirstName: data.guestFirstName,
          guestLastName: data.guestLastName,
          guestPhone: data.guestPhone,
          // Auto-calculate estimated delivery date based on shipping method
          estimatedDeliveryDate: this.calculateEstimatedDelivery(data.shippingMethod),
          items: {
            create: itemsWithRealPrices.map((item) => ({
              variantId: item.variantId,
              productName: item.productName,
              variantName: item.variantName,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice, // Already validated real price from DB
              total: item.unitPrice * item.quantity,
            })),
          },
          statusHistory: {
            create: {
              status: 'OPEN',
              note: 'Zamówienie utworzone - oczekuje na płatność',
            },
          },
        },
        include: {
          items: true,
          statusHistory: true,
          user: true,
        },
      });

      // Reserve inventory for each item (with stock validation)
      for (const item of data.items) {
        const inventory = await tx.inventory.findFirst({
          where: { variantId: item.variantId },
          orderBy: { quantity: 'desc' }, // Prefer location with most stock
        });

        const available = inventory
          ? inventory.quantity - inventory.reserved
          : 0;

        if (available < item.quantity) {
          // Use pre-fetched product name from itemsWithRealPrices
          const preloaded = itemsWithRealPrices.find(i => i.variantId === item.variantId);
          throw new Error(
            `Niewystarczająca ilość produktu "${preloaded?.productName || 'Unknown'}". ` +
            `Dostępne: ${Math.max(0, available)} szt., żądane: ${item.quantity} szt.`
          );
        }

        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: {
              reserved: { increment: item.quantity },
            },
          });

          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: StockMovementType.RESERVE,
              quantity: -item.quantity, // Negative for reservation
              toLocationId: inventory.locationId,
              reference: orderNumber,
              notes: `Automatyczna rezerwacja dla zamówienia ${orderNumber}`,
            },
          });
        }
      }
      
      // Attribute the order to an affiliate partner if ref links used.
      // Sales-rep (handlowiec) orders are excluded from affiliation when the admin
      // protection toggle is on — even if the buyer still carries a ref cookie, an
      // order placed through the sales-rep panel must not generate affiliate commission.
      try {
        let skipReferral = false;
        if (data.isSalesRepOrder) {
          const repCfg = await salesRepService.getSalesRepConfig();
          skipReferral = repCfg.blockAffiliation;
        }
        if (skipReferral) {
          console.log(`[OrdersService] Order ${order.orderNumber} is a sales-rep order — skipping affiliate attribution (blockAffiliation=on).`);
        } else {
          await referralService.attributeOrder(tx, order, data.referral, {
            userId: data.userId,
            email: data.guestEmail || order.user?.email || '',
            nip: data.billingNip,
            ip: data.buyerIp,
          });
        }
      } catch (err) {
        console.error(`[OrdersService] Failed to attribute order ${order.orderNumber} to referral partner:`, err);
      }

      return order;
    });

    // Sync order to Baselinker immediately with "Nieopłacone" status
    // This is done outside transaction to not block order creation, and after transaction commits to avoid race conditions.
    // Skipped when the caller will immediately mark the order as paid (single paid-sync instead).
    if (!data.skipBaselinkerSync) {
      setTimeout(() => {
        baselinkerOrdersService.syncOrderToBaselinker(order.id, { skipPaymentCheck: true })
          .then((syncResult) => {
            if (syncResult.success) {
              console.log(`[OrdersService] Order ${order.orderNumber} synced to Baselinker as unpaid (BL ID: ${syncResult.baselinkerOrderId})`);
            } else {
              console.error(`[OrdersService] Failed to sync order ${order.orderNumber} to Baselinker:`, syncResult.error);
            }
          })
          .catch((err) => {
            console.error(`[OrdersService] Baselinker sync error for order ${order.orderNumber}:`, err);
          });
      }, 100);
    }

    return order;
  }

  /**
   * Get order by ID
   */
  async getById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    tags: true,
                    images: { orderBy: { order: 'asc' }, take: 1 },
                  },
                },
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        shippingAddress: true,
        billingAddress: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId: string, page = 1, limit = 10, status?: string, search?: string) {
    const skip = (page - 1) * limit;

    // Build where clause with optional status filter
    const where: any = { userId };

    if (status) {
      // UNPAID groups OPEN + PENDING + paymentStatus PENDING (excluding CANCELLED/REFUNDED)
      if (status === 'UNPAID') {
        where.OR = [
          { status: 'OPEN' },
          { status: 'PENDING' },
          { paymentStatus: 'PENDING', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
        ];
      } else {
        where.status = status;
      }
    }

    if (search) {
      const searchWhere = {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' as const } },
          { items: { some: { productName: { contains: search, mode: 'insensitive' as const } } } },
        ],
      };
      // Merge search conditions with existing where
      if (where.OR) {
        // Already have OR from status filter, wrap in AND
        const statusCondition = { OR: where.OR };
        delete where.OR;
        where.AND = [statusCondition, searchWhere];
      } else {
        where.AND = [searchWhere];
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      tags: true,
                      images: { orderBy: { order: 'asc' }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update order status
   */
  async updateStatus(id: string, status: OrderStatus, note?: string, createdBy?: string) {
    const { order: updatedOrder, becamePaid, becameDelivered, becameShipped } = await prisma.$transaction(async (tx) => {
      // Get current order state before updating
      const currentOrder = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!currentOrder) throw new Error('Order not found');

      // When order transitions to SHIPPED — goods leave warehouse:
      // decrement quantity (stock goes down) and release reservation
      const shippingStatuses = ['SHIPPED', 'DELIVERED', 'COMPLETED'];
      const wasNotShipped = !shippingStatuses.includes(currentOrder.status);
      const isNowShipped = shippingStatuses.includes(status);

      if (wasNotShipped && isNowShipped) {
        for (const item of currentOrder.items) {
          // Find the reserve movement to identify the correct warehouse location
          const reserveMovement = await tx.stockMovement.findFirst({
            where: {
              variantId: item.variantId,
              type: StockMovementType.RESERVE,
              reference: currentOrder.orderNumber,
            },
          });

          const locationId = reserveMovement?.toLocationId;
          const inventory = await tx.inventory.findFirst({
            where: {
              variantId: item.variantId,
              ...(locationId && { locationId }),
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: { decrement: item.quantity },
                reserved: { decrement: Math.min(inventory.reserved, item.quantity) },
              },
            });

            await tx.stockMovement.create({
              data: {
                variantId: item.variantId,
                type: StockMovementType.SHIP,
                quantity: -item.quantity, // Negative for shipping
                fromLocationId: inventory.locationId,
                reference: currentOrder.orderNumber,
                notes: `Wydanie zewnętrzne - wysyłka zamówienia ${currentOrder.orderNumber}`,
              },
            });
          }
        }
      }

      // Check if order is transitioning to paid status (CONFIRMED, PROCESSING, SHIPPED, DELIVERED)
      // and paymentStatus is not already PAID, excluding offline/deferred payment methods.
      // However, if the status is explicitly set to CONFIRMED (which means "Opłacone" in the shop),
      // we ALWAYS mark it as paid, regardless of the payment method.
      const paidStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
      const offlineMethods = ['cod', 'b2b_transfer', 'b2b_przelew', 'bank_transfer', 'transfer'];
      const shouldMarkAsPaid = 
        status === 'CONFIRMED' || (
          paidStatuses.includes(status) && 
          currentOrder.paymentStatus !== 'PAID' &&
          !offlineMethods.includes(currentOrder.paymentMethod || '')
        );

      // Update order status
      const order = await tx.order.update({
        where: { id },
        data: { 
          status,
          ...(shouldMarkAsPaid ? { paymentStatus: 'PAID' } : {}),
        },
        include: { items: true },
      });

      // Add to status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status,
          note,
          createdBy,
        },
      });

      return {
        order,
        becamePaid: shouldMarkAsPaid && currentOrder.paymentStatus !== 'PAID',
        becameDelivered: status === 'DELIVERED' && currentOrder.status !== 'DELIVERED',
        becameShipped: wasNotShipped && status === 'SHIPPED',
      };
    });

    // After commit: if the order just became PAID (incl. manual/offline "Opłacone"),
    // mark partner referral AND sales-rep commission as paid → starts the 14-day hold clock.
    // Without this, transfer/COD/manually-confirmed orders never pay out commission.
    if (becamePaid) {
      referralService.markPaid(updatedOrder.id).catch((err) =>
        console.error(`[OrdersService] Error marking referral paid for order ${updatedOrder.id}:`, err));
      salesRepService.markPaid(updatedOrder.id).catch((err) =>
        console.error(`[OrdersService] Error marking sales-rep commission paid for order ${updatedOrder.id}:`, err));
    }

    // Plan WB TRADE PARTNERS: hold 14 dni liczony OD DOSTAWY — przy przejściu na DELIVERED
    // restartujemy zegar holdu prowizji (partner + handlowiec). Fallback dla zamówień bez
    // potwierdzonej dostawy: zegar od opłacenia (markPaid powyżej).
    if (becameDelivered) {
      referralService.markDelivered(updatedOrder.id).catch((err) =>
        console.error(`[OrdersService] Error restarting referral hold on delivery for order ${updatedOrder.id}:`, err));
      salesRepService.markDelivered(updatedOrder.id).catch((err) =>
        console.error(`[OrdersService] Error restarting sales-rep hold on delivery for order ${updatedOrder.id}:`, err));
    }

    // Notify the customer that their package is on the way. Single choke point:
    // covers admin, Baselinker status sync and courier tracking sync alike
    // (callers write trackingNumber/trackingLink BEFORE calling updateStatus).
    // Fire-and-forget - a mail failure must never fail the status change.
    if (becameShipped) {
      (async () => {
        const o = await prisma.order.findUnique({
          where: { id },
          select: {
            orderNumber: true,
            trackingNumber: true,
            trackingLink: true,
            courierCode: true,
            guestEmail: true,
            user: { select: { email: true } },
          },
        });
        const to = o?.guestEmail || o?.user?.email;
        if (!o || !to) return;
        const trackingUrl = o.trackingLink && o.trackingLink.startsWith('http') ? o.trackingLink : undefined;
        await queueEmail({
          to,
          subject: `Twoje zamówienie #${o.orderNumber} zostało wysłane`,
          template: 'order-shipped',
          context: {
            orderId: o.orderNumber,
            trackingNumber: o.trackingNumber || undefined,
            carrier: o.courierCode || undefined,
            trackingUrl,
          },
        });
      })().catch((err) =>
        console.error(`[OrdersService] Error sending shipped email for order ${updatedOrder.id}:`, err));
    }

    return updatedOrder;
  }

  /**
   * Cancel order and release inventory
   * For business orders (FV00), sets pendingCancellation instead of immediate cancellation
   * @param id - Order ID
   * @param forceCancel - If true, bypasses business order check (for admin use)
   */
  async cancel(id: string, forceCancel: boolean = false): Promise<{ order: any; pendingApproval: boolean } | null> {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) return null;

      // Validate order can be cancelled
      // Only allow cancellation for OPEN, PENDING, or CONFIRMED orders
      const allowedStatuses = ['OPEN', 'PENDING', 'CONFIRMED'];
      if (!allowedStatuses.includes(order.status)) {
        throw new Error(`Cannot cancel order in status: ${order.status}. Orders can only be cancelled when in OPEN, PENDING, or CONFIRMED status.`);
      }

      // Check if this is a business order (FV00)
      const isBusinessOrder = order.isBusinessOrder || order.orderNumber.includes('-FV00');
      
      // Business orders require admin approval (unless forceCancel is true from admin)
      if (isBusinessOrder && !forceCancel) {
        // Just mark as pending cancellation, don't actually cancel
        const updatedOrder = await tx.order.update({
          where: { id },
          data: {
            pendingCancellation: true,
            pendingCancellationAt: new Date(),
          },
        });

        // Add to status history
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            status: order.status, // Keep current status
            note: 'Klient zgłosił prośbę o anulowanie zamówienia firmowego - oczekuje na zatwierdzenie',
          },
        });

        return { order: updatedOrder, pendingApproval: true };
      }

      // Regular order - proceed with immediate cancellation
      // Release reserved inventory
      for (const item of order.items) {
        const reserveMovement = await tx.stockMovement.findFirst({
          where: {
            variantId: item.variantId,
            type: StockMovementType.RESERVE,
            reference: order.orderNumber,
          },
        });

        const locationId = reserveMovement?.toLocationId;
        const inventory = await tx.inventory.findFirst({
          where: {
            variantId: item.variantId,
            ...(locationId && { locationId }),
          },
        });

        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: {
              reserved: { decrement: item.quantity },
            },
          });

          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: StockMovementType.RELEASE,
              quantity: item.quantity, // Positive for release
              fromLocationId: inventory.locationId,
              reference: order.orderNumber,
              notes: `Zwolnienie rezerwacji - anulowanie zamówienia ${order.orderNumber}`,
            },
          });
        }
      }

      // Update order status and payment status
      const cancelledOrder = await tx.order.update({
        where: { id },
        data: { 
          status: 'CANCELLED',
          paymentStatus: order.paymentStatus === 'PAID' ? order.paymentStatus : 'CANCELLED',
          pendingCancellation: false, // Clear any pending flag
          pendingCancellationAt: null,
        },
      });

      // Add to status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: 'CANCELLED',
          note: forceCancel ? 'Order cancelled by admin' : 'Order cancelled by customer',
        },
      });

      return { order: cancelledOrder, pendingApproval: false };
    });

    if (!result) return null;

    // Cancel related referral
    referralService.cancelForOrder(id).catch((err) => {
      console.error(`[OrdersService] Error cancelling referral for order ${id}:`, err);
    });

    // Cancel sales rep commission
    salesRepService.cancelForOrder(id).catch((err) => {
      console.error(`[OrdersService] Error cancelling sales rep commission for order ${id}:`, err);
    });

    // Sync cancellation to Baselinker only if actually cancelled (not pending approval)
    if (!result.pendingApproval && result.order.baselinkerOrderId) {
      setTimeout(() => {
        baselinkerOrdersService.markOrderAsRefunded(result.order.id, 'Zamówienie anulowane przez klienta')
          .then((syncResult) => {
            if (syncResult.success) {
              console.log(`[OrdersService] Order ${result.order.orderNumber} cancellation synced to Baselinker`);
            } else {
              console.error(`[OrdersService] Failed to sync cancellation to Baselinker:`, syncResult.error);
            }
          })
          .catch((err) => {
            console.error(`[OrdersService] Baselinker cancellation sync error:`, err);
          });
      }, 100);
    }

    return result;
  }

  /**
   * Check if refund is allowed for an order (within 14 days)
   * Returns eligibility info with days remaining
   */
  async checkRefundEligibility(id: string): Promise<{
    eligible: boolean;
    reason?: string;
    daysRemaining?: number;
    deliveredAt?: Date;
  }> {
    // Try to find by ID first, then by orderNumber
    let order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { role: true } },
        statusHistory: {
          where: { status: 'DELIVERED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // If not found by ID, try by orderNumber
    if (!order) {
      order = await prisma.order.findUnique({
        where: { orderNumber: id },
        include: {
          user: { select: { role: true } },
          statusHistory: {
            where: { status: 'DELIVERED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    }

    if (!order) {
      return { eligible: false, reason: 'Zamówienie nie zostało znalezione' };
    }

    // Ownership is verified in the controller (authGuard / guest email check)

    const isB2B = order.user?.role === 'B2B_PARTNER';
    const allowedStatuses = isB2B ? ['DELIVERED', 'SHIPPED', 'CONFIRMED'] : ['DELIVERED', 'SHIPPED'];

    // Only DELIVERED, SHIPPED (and CONFIRMED for B2B) orders can be refunded
    if (!allowedStatuses.includes(order.status)) {
      return { eligible: false, reason: 'Zamówienie nie może zostać zwrócone w obecnym statusie' };
    }

    // Already refunded
    if (order.status === 'REFUNDED') {
      return { eligible: false, reason: 'Zamówienie zostało już zwrócone' };
    }

    // Get delivery date (from status history or fallback to updatedAt when status is DELIVERED)
    const deliveredEntry = order.statusHistory[0];
    let deliveredAt: Date;
    
    if (deliveredEntry?.createdAt) {
      // Use status history entry if available
      deliveredAt = deliveredEntry.createdAt;
    } else if (order.status === 'DELIVERED') {
      // If already delivered but no history entry, use updatedAt
      deliveredAt = order.updatedAt;
    } else {
      // For SHIPPED orders, estimate delivery as now (they can request refund after receiving)
      deliveredAt = new Date();
    }
    
    // Calculate refund period:
    // Day 0 = delivery day (doesn't count)
    // Day 1 = first day after delivery (starts at midnight)
    // Customer has 14 full days from the day after delivery
    
    // Get start of the day AFTER delivery (midnight)
    const refundPeriodStart = new Date(deliveredAt);
    refundPeriodStart.setHours(0, 0, 0, 0);
    refundPeriodStart.setDate(refundPeriodStart.getDate() + 1); // Next day at midnight
    
    // Refund deadline = 14 days after refundPeriodStart (end of day 14)
    const refundDeadline = new Date(refundPeriodStart);
    refundDeadline.setDate(refundDeadline.getDate() + 14);
    
    const now = new Date();
    
    // Calculate days remaining (from now until deadline)
    const msRemaining = refundDeadline.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      return { 
        eligible: false, 
        reason: 'Minął 14-dniowy okres na zwrot towaru',
        daysRemaining: 0,
        deliveredAt,
      };
    }

    return { 
      eligible: true, 
      daysRemaining,
      deliveredAt,
    };
  }

  /**
   * Generate unique refund number (9 digits in format XXX XXX XXX)
   */
  private generateRefundNumber(): string {
    let digits = '';
    for (let i = 0; i < 9; i++) {
      digits += Math.floor(Math.random() * 10).toString();
    }
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }

  /**
   * Request refund by customer (with 14-day validation)
   * This method is for customer-initiated refunds
   * Returns refund number and return address for the customer
   */
  async requestRefund(id: string, reason: string): Promise<{
    success: boolean;
    order?: any;
    refundNumber?: string;
    returnAddress?: {
      name: string;
      street: string;
      city: string;
      postalCode: string;
      country: string;
    };
    error?: string;
  }> {
    // Try to find order by ID or orderNumber first
    let order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      order = await prisma.order.findUnique({ where: { orderNumber: id } });
    }
    
    const orderId = order?.id || id;
    
    // Check eligibility first
    const eligibility = await this.checkRefundEligibility(orderId);
    
    if (!eligibility.eligible) {
      return { success: false, error: eligibility.reason };
    }

    // Generate refund number
    const refundNumber = this.generateRefundNumber();

    try {
      // Update order with refund info before processing
      await prisma.order.update({
        where: { id: orderId },
        data: {
          refundNumber,
          refundReason: reason || null,
          refundRequestedAt: new Date(),
        },
      });

      const refundedOrder = await this.refund(orderId, reason ? `Zwrot na żądanie klienta: ${reason}` : 'Zwrot na żądanie klienta');
      
      if (!refundedOrder) {
        return { success: false, error: 'Nie udało się przetworzyć zwrotu' };
      }

      // Update Baselinker status to "Zwroty/Anulowane" and add refund reason
      baselinkerOrdersService.markOrderAsRefunded(orderId, reason)
        .then((result) => {
          if (result.success) {
            console.log(`[Orders] Order ${id} marked as refunded in Baselinker`);
          } else {
            console.error(`[Orders] Failed to mark order as refunded in Baselinker: ${result.error}`);
          }
        })
        .catch((err) => {
          console.error(`[Orders] Baselinker refund sync error:`, err);
        });

      // Return address for customer to send the package
      const returnAddress = {
        name: 'WB Partners',
        contactPerson: 'Daniel Budyka',
        street: 'ul. Juliusza Słowackiego 24/11',
        city: 'Rzeszów',
        postalCode: '35-060',
        country: 'Polska',
        phone: '570 028 761',
        email: 'support@wb-partners.pl',
      };

      return { 
        success: true, 
        order: refundedOrder,
        refundNumber,
        returnAddress,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Process refund for an order (admin)
   */
  async refund(id: string, reason?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          items: true,
          user: { select: { role: true } },
        },
      });

      if (!order) return null;

      const isB2B = order.user?.role === 'B2B_PARTNER';
      const allowedStatuses = isB2B ? ['DELIVERED', 'SHIPPED', 'CONFIRMED'] : ['DELIVERED', 'SHIPPED'];

      // Only allow refund for delivered, shipped (and CONFIRMED for B2B) orders
      if (!allowedStatuses.includes(order.status)) {
        throw new Error('Order cannot be refunded in current status');
      }

      // Return inventory (add back to stock) and clear any remaining reservations
      for (const item of order.items) {
        // Check if order was already shipped (quantity already decremented)
        const wasShipped = ['DELIVERED', 'SHIPPED'].includes(order.status);

        const reserveMovement = await tx.stockMovement.findFirst({
          where: {
            variantId: item.variantId,
            reference: order.orderNumber,
          },
          orderBy: { createdAt: 'desc' },
        });

        const locationId = reserveMovement?.toLocationId || reserveMovement?.fromLocationId;
        const inventory = await tx.inventory.findFirst({
          where: {
            variantId: item.variantId,
            ...(locationId && { locationId }),
          },
        });

        if (inventory) {
          if (wasShipped) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: { increment: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                variantId: item.variantId,
                type: StockMovementType.RECEIVE,
                quantity: item.quantity,
                toLocationId: inventory.locationId,
                reference: order.orderNumber,
                notes: `Zwrot towaru - zwrot do zamówienia ${order.orderNumber}`,
              },
            });
          } else {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reserved: { decrement: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                variantId: item.variantId,
                type: StockMovementType.RELEASE,
                quantity: item.quantity,
                fromLocationId: inventory.locationId,
                reference: order.orderNumber,
                notes: `Zwolnienie rezerwacji - zwrot do zamówienia ${order.orderNumber}`,
              },
            });
          }
        }
      }

      // Update order status and payment status
      const refundedOrder = await tx.order.update({
        where: { id },
        data: { 
          status: 'REFUNDED',
          paymentStatus: 'REFUNDED',
        },
      });

      // Add to status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: 'REFUNDED',
          note: reason || 'Order refunded',
        },
      });

      return refundedOrder;
    });

    if (result) {
      referralService.cancelForOrder(id, reason || 'Order refunded').catch((err) => {
        console.error(`[OrdersService] Error cancelling referral for refunded order ${id}:`, err);
      });

      salesRepService.cancelForOrder(id).catch((err) => {
        console.error(`[OrdersService] Error cancelling sales rep commission for refunded order ${id}:`, err);
      });
    }

    return result;
  }

  /**
   * Restore cancelled/refunded order
   */
  async restore(id: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) return null;

      if (!['CANCELLED', 'REFUNDED'].includes(order.status)) {
        throw new Error('Order is not cancelled or refunded');
      }

      // Reserve inventory again
      for (const item of order.items) {
        const inventory = await tx.inventory.findFirst({
          where: { variantId: item.variantId },
          orderBy: { quantity: 'desc' },
        });

        if (inventory && inventory.quantity - inventory.reserved < item.quantity) {
          throw new Error(`Insufficient stock for ${item.productName}`);
        }

        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: {
              reserved: { increment: item.quantity },
            },
          });

          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: StockMovementType.RESERVE,
              quantity: -item.quantity,
              toLocationId: inventory.locationId,
              reference: order.orderNumber,
              notes: `Ponowna rezerwacja - przywrócenie zamówienia ${order.orderNumber}`,
            },
          });
        }
      }

      // Update order status back to PENDING
      const restoredOrder = await tx.order.update({
        where: { id },
        data: { status: 'PENDING' },
      });

      // Add to status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: 'PENDING',
          note: 'Order restored',
        },
      });

      return restoredOrder;
    });
  }

  /**
   * Simulate payment for development/testing
   * Changes order status from OPEN/PENDING to CONFIRMED and payment status to PAID
   */
  async simulatePayment(id: string) {
    return this.applyPaidStatus(
      id,
      '[DEV] Płatność zasymulowana - zamówienie opłacone',
      'Zamówienie nie jest otwarte - nie można symulować płatności'
    );
  }

  /**
   * Mark an order as paid manually (admin action).
   * Same effects as a real payment confirmation: sets status CONFIRMED + PAID,
   * updates Baselinker status to "Nowe zamówienia", marks commissions paid,
   * and updates popularity counters.
   */
  async markAsPaid(id: string) {
    return this.applyPaidStatus(
      id,
      'Płatność oznaczona ręcznie przez administratora',
      'Zamówienie nie jest otwarte - nie można oznaczyć jako opłacone'
    );
  }

  /**
   * Shared implementation used by simulatePayment (dev) and markAsPaid (admin).
   * Transitions an OPEN/PENDING order to CONFIRMED + PAID and runs all the
   * post-payment side effects (Baselinker status, commissions, popularity).
   */
  private async applyPaidStatus(id: string, historyNote: string, notOpenError: string) {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) return null;

      // Allow transition for both OPEN (new) and PENDING (legacy) statuses
      if (order.status !== 'OPEN' && order.status !== 'PENDING') {
        throw new Error(notOpenError);
      }

      // Update order status to CONFIRMED and payment status to PAID
      const updated = await tx.order.update({
        where: { id },
        data: { 
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
        include: {
          items: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          shippingAddress: true,
          billingAddress: true,
        },
      });

      // Add to status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: 'CONFIRMED',
          note: historyNote,
        },
      });

      console.log(`[Orders] Payment confirmed for order ${order.orderNumber}`);

      return updated;
    });

    // After successful payment, sync to Baselinker
    if (updatedOrder) {
      console.log(`[Orders] Triggering Baselinker status update for paid order ${id}`);
      
      // Mark referral as paid (beginhold)
      referralService.markPaid(id).catch((err) => {
        console.error(`[Orders] Error marking referral as paid for order ${id}:`, err);
      });
      salesRepService.markPaid(id).catch((err) => {
        console.error(`[Orders] Error marking sales-rep commission as paid for order ${id}:`, err);
      });

      // Update product sales count for popularity tracking
      for (const item of updatedOrder.items) {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: true },
        });
        if (variant?.product?.id) {
          popularityService.incrementSalesCount(variant.product.id, item.quantity)
            .catch((err) => console.error(`[Orders] Error updating sales count for product ${variant?.product?.id}:`, err));
        }
      }
      
      // Update Baselinker order status from "Nieopłacone" to "Nowe zamówienia"
      baselinkerOrdersService.markOrderAsPaid(id)
        .then((syncResult) => {
          if (syncResult.success) {
            console.log(`[Orders] Order ${id} marked as paid in Baselinker`);
          } else {
            // If order wasn't synced yet, sync it now with paid status
            console.warn(`[Orders] Could not update status, trying full sync: ${syncResult.error}`);
            return baselinkerOrdersService.syncOrderToBaselinker(id, { 
              orderStatusId: 65342, // Nowe zamówienia (paid)
              skipPaymentCheck: true 
            });
          }
        })
        .then((syncResult) => {
          if (syncResult && syncResult.success) {
            console.log(`[Orders] Order ${id} synced to Baselinker (BL ID: ${syncResult.baselinkerOrderId})`);
          }
        })
        .catch((err) => {
          console.error(`[Orders] Baselinker sync error for order ${id}:`, err);
        });
    }

    return updatedOrder;
  }

  /**
   * Get tracking info for an order from BaseLinker
   * Returns package tracking information (courier, tracking number) per shipment
   */
  async getTrackingInfo(orderId: string): Promise<{
    orderId: string;
    baselinkerOrderId?: string;
    packages: Array<{
      packageIndex: number;
      courierCode: string;
      courierName: string;
      trackingNumber: string | null;
      trackingLink?: string;
      isSent: boolean;
    }>;
  } | null> {
    // 1. Get order to find Baselinker order ID
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        baselinkerOrderId: true,
        packageShipping: true,
        status: true,
      },
    });

    if (!order) {
      return null;
    }

    // If no Baselinker order ID, return empty packages
    if (!order.baselinkerOrderId) {
      return {
        orderId: order.id,
        packages: [],
      };
    }

    // 2. Get BaseLinker config
    const config = await prisma.baselinkerConfig.findFirst({
      where: { syncEnabled: true },
    });

    if (!config) {
      console.warn('[OrdersService] No active Baselinker config found for tracking');
      return {
        orderId: order.id,
        baselinkerOrderId: order.baselinkerOrderId,
        packages: [],
      };
    }

    try {
      // 3. Create provider and fetch packages
      const apiToken = decryptToken(
        config.apiTokenEncrypted,
        config.encryptionIv,
        config.authTag
      );

      const provider = createBaselinkerProvider({
        apiToken,
        inventoryId: config.inventoryId,
      });

      const blPackages = await provider.getOrderPackages(order.baselinkerOrderId);

      // 4. Map BaseLinker packages to our format
      const packages = blPackages.map((pkg, index) => {
        const courierCode = pkg.courier_code?.toLowerCase() || '';
        const courierName = pkg.courier_other_name || 
          COURIER_NAMES[courierCode] || 
          pkg.courier_code || 
          'Nieznany przewoźnik';

        return {
          packageIndex: index + 1,
          courierCode: pkg.courier_code || '',
          courierName,
          trackingNumber: pkg.courier_package_nr || null,
          trackingLink: pkg.tracking_link || undefined,
          isSent: pkg.is_sent || !!pkg.courier_package_nr,
        };
      });

      return {
        orderId: order.id,
        baselinkerOrderId: order.baselinkerOrderId,
        packages,
      };
    } catch (error) {
      console.error('[OrdersService] Error fetching tracking info from Baselinker:', error);
      return {
        orderId: order.id,
        baselinkerOrderId: order.baselinkerOrderId,
        packages: [],
      };
    }
  }

  /**
   * Get orders pending cancellation approval (for admin panel)
   */
  /**
   * Request cancellation (customer action)
   * Always creates a pending cancellation request for admin approval.
   * Works for any order status except CANCELLED.
   */
  async requestCancellation(id: string, reason?: string): Promise<{ order: any; pendingApproval: boolean } | null> {
    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) return null;

    if (order.status === 'CANCELLED') {
      throw new Error('Zamówienie jest już anulowane.');
    }

    if (order.pendingCancellation) {
      throw new Error('Prośba o anulowanie tego zamówienia została już złożona i oczekuje na rozpatrzenie.');
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        pendingCancellation: true,
        pendingCancellationAt: new Date(),
        cancellationReason: reason || null,
      },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status: order.status,
        note: `Klient złożył prośbę o anulowanie zamówienia${reason ? `: ${reason}` : ''} - oczekuje na zatwierdzenie administratora`,
      },
    });

    return { order: updatedOrder, pendingApproval: true };
  }

  async getPendingCancellations() {
    return prisma.order.findMany({
      where: {
        pendingCancellation: true,
      },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        shippingAddress: true,
        billingAddress: true,
      },
      orderBy: {
        pendingCancellationAt: 'desc',
      },
    });
  }

  /**
   * Approve cancellation (admin action)
   * Cancels the order regardless of current status (unless already cancelled)
   */
  async approveCancellation(id: string) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) return null;

      if (order.status === 'CANCELLED') {
        throw new Error('Zamówienie jest już anulowane.');
      }

      // Release reserved inventory
      for (const item of order.items) {
        if (item.variantId) {
          const reserveMovement = await tx.stockMovement.findFirst({
            where: {
              variantId: item.variantId,
              type: StockMovementType.RESERVE,
              reference: order.orderNumber,
            },
          });

          const locationId = reserveMovement?.toLocationId;
          const inventory = await tx.inventory.findFirst({
            where: {
              variantId: item.variantId,
              ...(locationId && { locationId }),
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reserved: { decrement: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                variantId: item.variantId,
                type: StockMovementType.RELEASE,
                quantity: item.quantity,
                fromLocationId: inventory.locationId,
                reference: order.orderNumber,
                notes: `Zwolnienie rezerwacji - zatwierdzenie anulowania zamówienia ${order.orderNumber}`,
              },
            });
          }
        }
      }

      // Update order status
      const cancelledOrder = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          paymentStatus: order.paymentStatus === 'PAID' ? order.paymentStatus : 'CANCELLED',
          pendingCancellation: false,
          pendingCancellationAt: null,
        },
      });

      // Add to status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: 'CANCELLED',
          note: 'Administrator zatwierdził anulowanie zamówienia',
        },
      });

      return { order: cancelledOrder, pendingApproval: false };
    });

    if (!result) return null;

    // Cancel related referral
    referralService.cancelForOrder(id, 'Cancellation request approved by admin').catch((err) => {
      console.error(`[OrdersService] Error cancelling referral for order ${id} after approval:`, err);
    });

    // Cancel sales rep commission
    salesRepService.cancelForOrder(id).catch((err) => {
      console.error(`[OrdersService] Error cancelling sales rep commission for order ${id} after approval:`, err);
    });

    // Sync cancellation to Baselinker
    if (result.order.baselinkerOrderId) {
      setTimeout(() => {
        baselinkerOrdersService.markOrderAsRefunded(result.order.id, 'Zamówienie anulowane - zatwierdzone przez admina')
          .then((syncResult) => {
            if (syncResult.success) {
              console.log(`[OrdersService] Order ${result.order.orderNumber} cancellation synced to Baselinker`);
            } else {
              console.error(`[OrdersService] Failed to sync cancellation to Baselinker:`, syncResult.error);
            }
          })
          .catch((err) => {
            console.error(`[OrdersService] Baselinker cancellation sync error:`, err);
          });
      }, 100);
    }

    return result;
  }

  /**
   * Reject cancellation request (admin action)
   * Clears pendingCancellation flag without cancelling the order
   */
  async rejectCancellation(id: string, reason?: string) {
    const order = await prisma.order.update({
      where: { id },
      data: {
        pendingCancellation: false,
        pendingCancellationAt: null,
      },
    });

    // Add to status history
    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status: order.status,
        note: `Prośba o anulowanie zamówienia została odrzucona${reason ? `: ${reason}` : ''}`,
      },
    });

    return order;
  }

  /**
   * Soft-delete an order (move to archive)
   * Only cancelled or refunded orders can be soft-deleted
   */
  async softDelete(id: string) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return null;

    if (!['CANCELLED', 'REFUNDED'].includes(order.status)) {
      throw new Error('Tylko anulowane lub zwrócone zamówienia mogą być usunięte');
    }

    if (order.deletedAt) {
      throw new Error('Zamówienie jest już w archiwum');
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status: order.status,
        note: 'Zamówienie przeniesione do archiwum',
      },
    });

    return updated;
  }

  /**
   * Restore an order from archive (undo soft-delete)
   */
  async restoreFromArchive(id: string) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return null;

    if (!order.deletedAt) {
      throw new Error('Zamówienie nie jest w archiwum');
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { deletedAt: null },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status: order.status,
        note: 'Zamówienie przywrócone z archiwum',
      },
    });

    return updated;
  }

  /**
   * Get all archived (soft-deleted) orders
   */
  async getArchived(params: { page?: number; limit?: number; search?: string } = {}) {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: { not: null },
    };

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deletedAt: 'desc' },
        include: {
          items: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Cleanup archive: permanently delete orders soft-deleted more than 14 days ago
   * If manual=true, delete all archived orders regardless of age
   */
  async cleanupArchive(manual: boolean = false) {
    const where: Prisma.OrderWhereInput = {
      deletedAt: manual
        ? { not: null }
        : { not: null, lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    };

    // Get IDs first for cascading deletes
    const toDelete = await prisma.order.findMany({
      where,
      select: { id: true, orderNumber: true },
    });

    if (toDelete.length === 0) return { deleted: 0 };

    const ids = toDelete.map((o) => o.id);

    // Delete related records first, then orders
    await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
      await tx.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await tx.order.deleteMany({ where: { id: { in: ids } } });
    });

    return { deleted: toDelete.length, orders: toDelete.map((o) => o.orderNumber) };
  }

  /**
   * Permanently delete specific archived orders by IDs
   */
  async permanentDeleteOrders(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new Error('Nie podano zamówień do usunięcia');
    }

    // Verify all orders exist and are archived
    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, deletedAt: { not: null } },
      select: { id: true, orderNumber: true },
    });

    if (orders.length === 0) {
      throw new Error('Nie znaleziono zarchiwizowanych zamówień do usunięcia');
    }

    const foundIds = orders.map((o) => o.id);

    await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: foundIds } } });
      await tx.orderItem.deleteMany({ where: { orderId: { in: foundIds } } });
      await tx.order.deleteMany({ where: { id: { in: foundIds } } });
    });

    return { deleted: orders.length, orders: orders.map((o) => o.orderNumber) };
  }

  /**
   * Calculate estimated delivery date based on shipping method.
   * Adds business days (skips weekends) from now.
   */
  private calculateEstimatedDelivery(shippingMethod: string): Date {
    const now = new Date();
    let businessDays: number;

    const method = shippingMethod.toLowerCase();
    if (method.includes('paczkomat') || method.includes('inpost')) {
      businessDays = 3; // InPost Paczkomat: 2-3 business days
    } else if (method.includes('kurier') || method.includes('courier') || method.includes('dpd') || method.includes('dhl') || method.includes('ups')) {
      businessDays = 2; // Courier: 1-2 business days
    } else if (method.includes('poczta') || method.includes('pocztex')) {
      businessDays = 5; // Poczta Polska: 3-5 business days
    } else {
      businessDays = 3; // Default
    }

    let date = new Date(now);
    let added = 0;
    while (added < businessDays) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) { // Skip weekends
        added++;
      }
    }
    return date;
  }
}

export const ordersService = new OrdersService();