/**
 * Baselinker Orders Synchronization Service
 * 
 * Handles syncing orders FROM local shop TO Baselinker.
 * This is the "feedback loop" - when a customer pays for an order,
 * we send it to Baselinker which automatically decreases stock.
 * 
 * IMPORTANT: Orders are synced ONLY after payment is confirmed (paymentStatus = PAID)
 * This ensures stock is not decreased for unpaid/cancelled orders.
 * 
 * MULTI-WAREHOUSE: Each product is automatically assigned to the correct
 * Baselinker inventory based on its baselinkerProductId prefix or tags.
 */

import { prisma } from '../db';
import { decryptToken } from '../lib/encryption';
import { createBaselinkerProvider } from '../providers/baselinker';
import { wholesalerConfigService } from './wholesaler-config.service';
import type { BaselinkerAddOrderRequest, BaselinkerOrderProduct } from '../providers/baselinker/baselinker-provider.interface';

// ============================================
// Warehouse Mapping Configuration
// ============================================

/**
 * Detect warehouse inventory ID from product data.
 * Delegates to WholesalerConfigService for dynamic lookup.
 */
async function detectWarehouseId(baselinkerProductId: string | null, tags: string[] = []): Promise<string> {
  return wholesalerConfigService.detectWarehouseId(baselinkerProductId, tags);
}

/**
 * Baselinker order status IDs
 */
const BL_STATUS = {
  UNPAID: 65823,         // "Nieopłacone" - czerwony
  NEW_ORDER: 65342,      // "Nowe zamówienia" - niebieski (po opłaceniu)
  CANCELLED: 65816,      // "Zwroty/Anulowa" - czerwony
};

/**
 * Default order status ID for new (unpaid) orders in Baselinker
 */
const DEFAULT_ORDER_STATUS_ID = BL_STATUS.UNPAID;

// ============================================
// Types
// ============================================

export interface OrderSyncResult {
  success: boolean;
  orderId: string;
  baselinkerOrderId?: string;
  error?: string;
}

export interface SyncOrderToBaselinkerOptions {
  /** Baselinker order status ID (default: Nieopłacone) */
  orderStatusId?: number;
  /** Force sync even if already synced */
  force?: boolean;
  /** Skip payment check - for initial order creation */
  skipPaymentCheck?: boolean;
}

// ============================================
// Service Class
// ============================================

export class BaselinkerOrdersService {
  /**
   * Sync a single order to Baselinker
   * Orders are synced immediately after creation with status "Nieopłacone"
   * After payment, the status is updated to "Nowe zamówienia"
   * 
   * @param orderId - Local order ID
   * @param options - Sync options
   */
  async syncOrderToBaselinker(
    orderId: string,
    options: SyncOrderToBaselinkerOptions = {}
  ): Promise<OrderSyncResult> {
    const { orderStatusId = DEFAULT_ORDER_STATUS_ID, force = false, skipPaymentCheck = false } = options;

    try {
      // 1. Get order with all related data
      const order = await prisma.order.findUnique({
        where: { id: orderId },
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
          shippingAddress: true,
          billingAddress: true,
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, phone: true },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          orderId,
          error: 'Order not found',
        };
      }

      // 2. Check if already synced (unless force)
      if (order.baselinkerOrderId && !force) {
        console.log(`[BaselinkerOrders] Order ${orderId} already synced as BL order ${order.baselinkerOrderId}`);
        return {
          success: true,
          orderId,
          baselinkerOrderId: order.baselinkerOrderId,
        };
      }

      // 3. Skip payment check for new orders - they go to Baselinker as "Nieopłacone"
      // Payment check is only enforced when we need to update status to "paid"
      if (!skipPaymentCheck && order.paymentStatus !== 'PAID' && !force) {
        // If order is not paid and we're not skipping check, just sync with unpaid status
        console.log(`[BaselinkerOrders] Order ${orderId} is unpaid, syncing with Nieopłacone status`);
      }

      // 4. Get Baselinker configuration
      const config = await prisma.baselinkerConfig.findFirst({
        where: { syncEnabled: true },
      });

      if (!config) {
        console.warn('[BaselinkerOrders] No Baselinker config found or sync disabled');
        return {
          success: false,
          orderId,
          error: 'Baselinker integration not configured or disabled',
        };
      }

      // 5. Decrypt API token and create provider
      const apiToken = decryptToken(
        config.apiTokenEncrypted,
        config.encryptionIv,
        config.authTag
      );

      const provider = createBaselinkerProvider({
        apiToken,
        inventoryId: config.inventoryId,
      });

      // 6. Map order to Baselinker format
      const blOrderData = await this.mapOrderToBaselinker(order, config.inventoryId, orderStatusId);

      // 7. Send to Baselinker
      console.log(`[BaselinkerOrders] Sending order ${order.orderNumber} to Baselinker...`);
      const result = await provider.addOrder(blOrderData);

      // 8. Update local order with Baselinker order ID
      await prisma.order.update({
        where: { id: orderId },
        data: {
          baselinkerOrderId: result.order_id.toString(),
          baselinkerSyncedAt: new Date(),
        },
      });

      // 9. Add to order history
      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          status: order.status,
          note: `Zamówienie zsynchronizowane do Baselinkera (ID: ${result.order_id})`,
        },
      });

      console.log(`[BaselinkerOrders] Order ${order.orderNumber} synced successfully, BL order ID: ${result.order_id}`);

      return {
        success: true,
        orderId,
        baselinkerOrderId: result.order_id.toString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BaselinkerOrders] Failed to sync order %s:', orderId, error);

      return {
        success: false,
        orderId,
        error: errorMessage,
      };
    }
  }

  /**
   * Sync multiple pending orders to Baselinker
   * Only syncs orders that are PAID but not yet synced
   */
  async syncPendingOrders(): Promise<OrderSyncResult[]> {
    // Find all paid orders without baselinkerOrderId
    const pendingOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        baselinkerOrderId: null,
        status: {
          in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'],
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 50, // Limit batch size
    });

    console.log(`[BaselinkerOrders] Found ${pendingOrders.length} pending orders to sync`);

    const results: OrderSyncResult[] = [];

    for (const order of pendingOrders) {
      const result = await this.syncOrderToBaselinker(order.id);
      results.push(result);

      // Add delay between orders to avoid rate limiting
      if (pendingOrders.indexOf(order) < pendingOrders.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`[BaselinkerOrders] Sync completed: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Map local order to Baselinker addOrder format
   * Each product is automatically assigned to the correct warehouse based on its prefix/tags
   */
  private async mapOrderToBaselinker(
    order: any,
    _inventoryId: string, // Not used anymore - each product has its own warehouse
    orderStatusId: number
  ): Promise<BaselinkerAddOrderRequest> {
    // Map shipping method to Baselinker format
    const deliveryMethod = this.mapShippingMethod(order.shippingMethod);

    // Map payment method
    const paymentMethod = this.mapPaymentMethod(order.paymentMethod);

    // Build products array - each product gets its own warehouse automatically
    const products: BaselinkerOrderProduct[] = [];
    for (const item of order.items) {
      const product = item.variant?.product;
      const variant = item.variant;

      // Automatically detect the correct warehouse for this product
      const warehouseId = await detectWarehouseId(
        product?.baselinkerProductId || null,
        product?.tags || []
      );

      // Extract raw product ID (without prefix) for Baselinker
      let rawProductId = product?.baselinkerProductId || undefined;
      if (rawProductId && rawProductId.includes('-')) {
        // Remove prefix (e.g., "btp-212551167" -> "212551167")
        rawProductId = rawProductId.split('-').slice(1).join('-');
      }

      console.log(`[BaselinkerOrders] Product "${item.productName}" -> Warehouse ${warehouseId}, BL ID: ${rawProductId}`);

      products.push({
        // Use 'bl' storage to link to Baselinker inventory and auto-decrease stock
        storage: 'bl' as const,
        storage_id: warehouseId, // Each product uses its detected warehouse
        product_id: rawProductId,
        variant_id: variant?.baselinkerVariantId ? parseInt(variant.baselinkerVariantId) : 0,
        name: item.productName,
        sku: item.sku || '',
        ean: variant?.barcode || product?.barcode || '',
        price_brutto: Number(item.unitPrice),
        tax_rate: 23, // Polish VAT rate
        quantity: item.quantity,
        weight: variant?.weight || product?.weight || 0,
      });
    }

    // Add shipping cost as an explicit product line named "Dostawa" (not "Transport").
    // Baselinker's own Fakturownia integration auto-adds a line item using its default
    // translation ("Transport") whenever `delivery_price` is set without an explicit
    // product for it — sending it explicitly here and zeroing delivery_price prevents that.
    const shippingCost = Number(order.shipping || 0);
    if (shippingCost > 0) {
      products.push({
        storage: 'db' as const,
        storage_id: '0',
        name: 'Paczka',
        sku: 'SHIPPING',
        price_brutto: shippingCost,
        tax_rate: 23,
        quantity: 1,
        weight: 0,
      });
      console.log(`[BaselinkerOrders] Added shipping as "Dostawa" line: ${shippingCost} PLN`);
    }

    // Add discount as a product with negative price (standard Baselinker approach)
    const orderDiscount = Number(order.discount || 0);
    if (orderDiscount > 0) {
      const discountName = order.couponCode 
        ? `Rabat (kupon: ${order.couponCode})` 
        : 'Rabat (kupon)';
      products.push({
        storage: 'db' as const,
        storage_id: '0',
        name: discountName,
        sku: order.couponCode || 'DISCOUNT',
        price_brutto: -orderDiscount, // Negative price for discount
        tax_rate: 23,
        quantity: 1,
        weight: 0,
      });
      console.log(`[BaselinkerOrders] Added discount: -${orderDiscount} PLN (code: ${order.couponCode || 'N/A'})`);
    }

    // Build the order request
    const blOrder: BaselinkerAddOrderRequest = {
      order_status_id: orderStatusId,
      date_add: Math.floor(order.createdAt.getTime() / 1000),
      currency: 'PLN',
      payment_method: paymentMethod,
      payment_method_cod: order.paymentMethod === 'cod',
      paid: order.paymentStatus === 'PAID',
      user_comments: order.customerNotes || '',
      admin_comments: `WBTrade Order: ${order.orderNumber}`,
      email: order.guestEmail || order.user?.email || '',
      phone: order.shippingAddress?.phone || order.user?.phone || order.guestPhone || '',
      delivery_method: deliveryMethod,
      delivery_price: 0, // Shipping is sent as an explicit "Dostawa" product line above instead
      products,
    };

    // Add shipping address
    if (order.shippingAddress) {
      blOrder.delivery_fullname = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
      blOrder.delivery_address = order.shippingAddress.street;
      blOrder.delivery_city = order.shippingAddress.city;
      blOrder.delivery_postcode = order.shippingAddress.postalCode;
      blOrder.delivery_country_code = order.shippingAddress.country || 'PL';
    } else if (order.guestFirstName || order.guestLastName) {
      // Guest order without saved shipping address - use guest name
      blOrder.delivery_fullname = `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim();
    }

    // Add paczkomat data if applicable
    if (order.paczkomatCode) {
      blOrder.delivery_point_id = order.paczkomatCode;
      blOrder.delivery_point_name = order.paczkomatCode;
      blOrder.delivery_point_address = order.paczkomatAddress || '';
    }

    // Add billing/invoice data
    const isBusiness = order.isBusinessOrder || !!order.billingNip;
    const invoiceAddress = order.billingAddress || order.shippingAddress;

    if (invoiceAddress || isBusiness) {
      const invoiceFullName = invoiceAddress 
        ? `${invoiceAddress.firstName} ${invoiceAddress.lastName}`.trim() 
        : `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim();

      blOrder.invoice_fullname = invoiceFullName;
      blOrder.invoice_company = isBusiness 
        ? (order.billingCompanyName || invoiceAddress?.companyName || '') 
        : (invoiceAddress?.companyName || '');
      blOrder.invoice_nip = isBusiness 
        ? (order.billingNip || invoiceAddress?.nip || '') 
        : (invoiceAddress?.nip || '');
      blOrder.invoice_address = invoiceAddress?.street || '';
      blOrder.invoice_city = invoiceAddress?.city || '';
      blOrder.invoice_postcode = invoiceAddress?.postalCode || '';
      blOrder.invoice_country_code = invoiceAddress?.country || 'PL';
      // IMPORTANT: Always send want_invoice=false to Baselinker so Fakturownia
      // does NOT auto-create invoices. Invoices are created manually.
      // The wantInvoice flag is still saved in our DB for reference.
      blOrder.want_invoice = false;
    }

    return blOrder;
  }

  /**
   * Map local shipping method to Baselinker delivery method name
   */
  private mapShippingMethod(method: string): string {
    const mappings: Record<string, string> = {
      'inpost_paczkomat': 'InPost Paczkomaty',
      'inpost_kurier': 'InPost Kurier',
      'dpd': 'DPD Kurier',
      'dhl': 'DHL Kurier',
      'pocztex': 'Pocztex',
      'orlen_paczka': 'Orlen Paczka',
      'pickup': 'Odbiór osobisty',
    };

    return mappings[method] || method;
  }

  /**
   * Map local payment method to Baselinker format
   */
  private mapPaymentMethod(method: string): string {
    const mappings: Record<string, string> = {
      // From checkout
      'payu': 'PayU',
      'przelewy24': 'Przelewy24',
      'blik': 'BLIK',
      'card': 'Karta płatnicza',
      'transfer': 'Przelew bankowy',
      'cod': 'Płatność przy odbiorze',
      // From PayU webhook (actual method used)
      'BLIK': 'BLIK',
      'Karta płatnicza': 'Karta płatnicza',
      'Przelew bankowy': 'Przelew bankowy',
      'Google Pay': 'Google Pay',
      'Apple Pay': 'Apple Pay',
      'Klarna': 'Klarna',
      'PayPo': 'PayPo',
      'Twisto': 'Twisto',
      // Bank names
      'mBank': 'Przelew mBank',
      'Pekao': 'Przelew Pekao',
      'ING': 'Przelew ING',
      'PKO BP': 'Przelew PKO BP',
      'BNP Paribas': 'Przelew BNP Paribas',
      'Santander': 'Przelew Santander',
      'Alior': 'Przelew Alior',
    };

    return mappings[method] || method;
  }

  /**
   * Update order status in Baselinker after payment
   * Changes status from "Nieopłacone" to "Nowe zamówienia"
   */
  async markOrderAsPaid(orderId: string): Promise<OrderSyncResult> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { 
          id: true, 
          orderNumber: true,
          baselinkerOrderId: true, 
          paymentStatus: true,
          total: true,
          paymentMethod: true,
        },
      });

      if (!order) {
        return { success: false, orderId, error: 'Order not found' };
      }

      if (!order.baselinkerOrderId) {
        console.warn(`[BaselinkerOrders] Order ${orderId} has no Baselinker ID, cannot update status`);
        return { success: false, orderId, error: 'Order not synced to Baselinker yet' };
      }

      // Get Baselinker configuration
      const config = await prisma.baselinkerConfig.findFirst({
        where: { syncEnabled: true },
      });

      if (!config) {
        return { success: false, orderId, error: 'Baselinker not configured' };
      }

      const apiToken = decryptToken(
        config.apiTokenEncrypted,
        config.encryptionIv,
        config.authTag
      );

      const provider = createBaselinkerProvider({
        apiToken,
        inventoryId: config.inventoryId,
      });

      // 1. Update payment amount
      const paymentComment = `Płatność ${order.paymentMethod || 'online'}`;
      await provider.setOrderPayment(
        order.baselinkerOrderId, 
        Number(order.total),
        Math.floor(Date.now() / 1000),
        paymentComment
      );

      // 2. Update status to "Nowe zamówienia" (paid)
      await provider.setOrderStatus(order.baselinkerOrderId, BL_STATUS.NEW_ORDER);

      console.log(`[BaselinkerOrders] Order ${order.orderNumber} marked as paid in Baselinker (${order.total} PLN, status: ${BL_STATUS.NEW_ORDER})`);

      return {
        success: true,
        orderId,
        baselinkerOrderId: order.baselinkerOrderId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BaselinkerOrders] Failed to mark order as paid:', orderId, error);
      return { success: false, orderId, error: errorMessage };
    }
  }

  /**
   * Update order status in Baselinker to "Zwroty/Anulowane" (refunded/cancelled)
   * and add refund reason to order notes
   */
  async markOrderAsRefunded(orderId: string, refundReason?: string): Promise<OrderSyncResult> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { 
          id: true, 
          orderNumber: true,
          baselinkerOrderId: true,
        },
      });

      if (!order) {
        return { success: false, orderId, error: 'Order not found' };
      }

      if (!order.baselinkerOrderId) {
        console.warn(`[BaselinkerOrders] Order ${orderId} has no Baselinker ID, cannot update status to refunded`);
        return { success: false, orderId, error: 'Order not synced to Baselinker yet' };
      }

      // Get Baselinker configuration
      const config = await prisma.baselinkerConfig.findFirst({
        where: { syncEnabled: true },
      });

      if (!config) {
        return { success: false, orderId, error: 'Baselinker not configured' };
      }

      const apiToken = decryptToken(
        config.apiTokenEncrypted,
        config.encryptionIv,
        config.authTag
      );

      const provider = createBaselinkerProvider({
        apiToken,
        inventoryId: config.inventoryId,
      });

      // Update status to "Zwroty/Anulowane" (status ID 65816)
      await provider.setOrderStatus(order.baselinkerOrderId, BL_STATUS.CANCELLED);

      // Add refund reason to order notes if provided
      if (refundReason) {
        const refundNote = `[ZWROT ${new Date().toLocaleDateString('pl-PL')}] Powód: ${refundReason}`;
        await provider.setOrderField(order.baselinkerOrderId, 'admin_comments', refundNote);
        console.log(`[BaselinkerOrders] Added refund reason to order ${order.orderNumber}`);
      }

      console.log(`[BaselinkerOrders] Order ${order.orderNumber} marked as refunded in Baselinker (status: ${BL_STATUS.CANCELLED} - Zwroty/Anulowane)`);

      return {
        success: true,
        orderId,
        baselinkerOrderId: order.baselinkerOrderId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BaselinkerOrders] Failed to mark order as refunded:', orderId, error);
      return { success: false, orderId, error: errorMessage };
    }
  }

  /**
   * Create a receipt/invoice in Fakturownia after payment is confirmed.
   *
   * Logic:
   *  - Products are sent at their actual sale price (promotion already baked in)
   *  - Coupon discount is passed as a proper `discount` + `show_discount` field
   *    (NOT as a negative product — legally correct "RABAT" on the receipt)
   */
  async createFakturowniaReceipt(orderId: string): Promise<{ success: boolean; receiptId?: number; receiptUrl?: string; error?: string }> {
    const apiToken = process.env.FAKTUROWNIA_API_TOKEN;
    const domain = process.env.FAKTUROWNIA_DOMAIN || 'wb-partners';
    if (!apiToken) {
      console.warn('[Fakturownia] FAKTUROWNIA_API_TOKEN not set, skipping receipt creation');
      return { success: false, error: 'FAKTUROWNIA_API_TOKEN not configured' };
    }

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          shippingAddress: true,
          billingAddress: true,
          user: { select: { email: true, firstName: true, lastName: true, phone: true } },
        },
      });

      if (!order) return { success: false, error: 'Order not found' };

      const isBusiness = order.isBusinessOrder || !!order.billingNip;
      const buyerName = isBusiness && order.billingCompanyName
        ? order.billingCompanyName
        : order.billingAddress
        ? `${order.billingAddress.firstName} ${order.billingAddress.lastName}`
        : order.user
        ? `${order.user.firstName} ${order.user.lastName}`
        : `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim();

      const buyerEmail = order.user?.email || order.guestEmail || '';
      const buyerPhone = order.shippingAddress?.phone || order.user?.phone || order.guestPhone || '';

      const addr = order.billingAddress || order.shippingAddress;

      // Build positions — each product at its actual (potentially sale) price
      const positions = order.items.map((item) => ({
        name: item.variantName && item.variantName !== 'Default'
          ? `${item.productName} (${item.variantName})`
          : item.productName,
        quantity: item.quantity,
        quantity_unit: 'szt',
        price_gross: Number(item.unitPrice),
        tax: '23',
        product_id: null, // No Fakturownia product catalog link needed
      }));

      // Add shipping as a separate position if > 0
      const shippingCost = Number(order.shipping || 0);
      if (shippingCost > 0) {
        positions.push({
          name: `Dostawa: ${this.mapShippingMethod(order.shippingMethod)}`,
          quantity: 1,
          quantity_unit: 'szt',
          price_gross: shippingCost,
          tax: '23',
          product_id: null,
        });
      }

      // Coupon discount: use Fakturownia's `discount` field (percent_total kind)
      // Calculate what percentage of (subtotal + shipping) the coupon covers
      const orderDiscount = Number(order.discount || 0);
      let discountPercent = '0';
      const base = Number(order.subtotal) + shippingCost;
      if (orderDiscount > 0 && base > 0) {
        discountPercent = ((orderDiscount / base) * 100).toFixed(4);
      }

      const showDiscount = orderDiscount > 0;

      const receiptPayload = {
        api_token: apiToken,
        invoice: {
          kind: 'receipt', // paragon
          number: null, // auto-number
          sell_date: new Date(order.createdAt).toISOString().slice(0, 10),
          issue_date: new Date(order.createdAt).toISOString().slice(0, 10),
          payment_type: this.mapPaymentMethodFakturownia(order.paymentMethod),
          payment_to_kind: 'off', // no payment deadline shown on receipt
          currency: 'PLN',
          lang: 'pl',
          oid: order.orderNumber, // links to Baselinker order
          buyer_name: buyerName || 'Klient',
          buyer_email: buyerEmail,
          buyer_phone: buyerPhone,
          buyer_first_name: (addr?.firstName || order.guestFirstName || ''),
          buyer_last_name: (addr?.lastName || order.guestLastName || ''),
          buyer_street: addr?.street || '',
          buyer_post_code: addr?.postalCode || '',
          buyer_city: addr?.city || '',
          buyer_country: addr?.country || 'PL',
          buyer_tax_no: order.isBusinessOrder ? (order.billingNip || '') : '',
          // Coupon = proper legal RABAT field, NOT a negative product
          discount: showDiscount ? discountPercent : '0',
          discount_kind: 'percent_total',
          show_discount: showDiscount,
          paid: true,
          paid_date: new Date(order.createdAt).toISOString().slice(0, 10),
          status: 'paid',
          description: order.couponCode ? `Kupon rabatowy: ${order.couponCode}` : '',
          from_api: true,
          internal_note: buyerEmail,
          positions,
        },
      };

      const response = await fetch(`https://${domain}.fakturownia.pl/invoices.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(receiptPayload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Fakturownia] Receipt creation failed for order ${order.orderNumber}: ${response.status} ${errText}`);
        return { success: false, error: `HTTP ${response.status}: ${errText}` };
      }

      const receipt = await response.json();
      console.log(`[Fakturownia] Receipt created for order ${order.orderNumber}: ID ${receipt.id}, URL ${receipt.view_url}`);

      return { success: true, receiptId: receipt.id, receiptUrl: receipt.view_url };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Fakturownia] Error creating receipt:', error);
      return { success: false, error: msg };
    }
  }

  private mapPaymentMethodFakturownia(method: string): string {
    const map: Record<string, string> = {
      'payu': 'Płatność z góry',
      'przelewy24': 'Płatność z góry',
      'blik': 'BLIK',
      'card': 'Karta płatnicza',
      'transfer': 'Przelew bankowy',
      'cod': 'Płatność przy odbiorze',
    };
    return map[method?.toLowerCase()] || 'Płatność z góry';
  }
}

// Export singleton instance
export const baselinkerOrdersService = new BaselinkerOrdersService();

// Export status constants for use in other services
export { BL_STATUS };
