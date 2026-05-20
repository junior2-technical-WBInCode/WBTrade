/**
 * Payment Service
 * Manages payment provider integrations and payment operations
 */

import {
  PaymentProviderId,
  PaymentMethodType,
  AvailablePaymentMethod,
  CreatePaymentRequest,
  PaymentSession,
  PaymentResult,
  RefundRequest,
  RefundResult,
  PaymentProviderConfig,
} from '../types/payment.types';
import { IPaymentProvider } from '../providers/payment/payment-provider.interface';
import { Przelewy24Provider } from '../providers/payment/przelewy24.provider';
import { PayUProvider } from '../providers/payment/payu.provider';
import { ImojeProvider } from '../providers/payment/imoje.provider';
import { prisma } from '../db';
import { baselinkerOrdersService } from './baselinker-orders.service';
import { popularityService } from './popularity.service';
import { emailService } from './email.service';

// Provider configurations from environment
const providerConfigs: Record<PaymentProviderId, Partial<PaymentProviderConfig>> = {
  przelewy24: {
    merchantId: process.env.P24_MERCHANT_ID,
    apiKey: process.env.P24_API_KEY,
    crcKey: process.env.P24_CRC_KEY,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  stripe: {
    apiKey: process.env.STRIPE_SECRET_KEY,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  payu: {
    merchantId: process.env.PAYU_POS_ID,
    apiKey: process.env.PAYU_MD5_KEY,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  tpay: {
    merchantId: process.env.TPAY_MERCHANT_ID,
    apiKey: process.env.TPAY_API_KEY,
    apiSecret: process.env.TPAY_API_SECRET,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  blik_direct: {
    // BLIK direct integration (requires bank agreement)
    sandbox: process.env.NODE_ENV !== 'production',
  },
  paypo: {
    merchantId: process.env.PAYPO_MERCHANT_ID,
    apiKey: process.env.PAYPO_API_KEY,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  imoje: {
    merchantId: process.env.IMOJE_MERCHANT_ID,
    apiKey: process.env.IMOJE_API_TOKEN,
    apiSecret: process.env.IMOJE_SERVICE_KEY,
    sandbox: process.env.IMOJE_SANDBOX === 'true' || process.env.NODE_ENV !== 'production',
  },
};

// Default provider to use
const DEFAULT_PROVIDER: PaymentProviderId = 'payu';

export class PaymentService {
  private providers: Map<PaymentProviderId, IPaymentProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize available payment providers
   */
  private initializeProviders() {
    // Initialize Przelewy24 provider - DISABLED FOR TESTING
    // const p24Config = providerConfigs.przelewy24;
    // if (p24Config.merchantId || process.env.NODE_ENV !== 'production') {
    //   this.providers.set('przelewy24', new Przelewy24Provider(p24Config));
    // }

    // Initialize PayU provider (PRIMARY for testing)
    const payuConfig = providerConfigs.payu;
    if (payuConfig.merchantId || process.env.PAYU_POS_ID) {
      this.providers.set('payu', new PayUProvider(payuConfig));
      console.log('PayU provider initialized (sandbox:', payuConfig.sandbox, ')');
    }

    // Initialize imoje provider
    const imojeConfig = providerConfigs.imoje;
    if (process.env.IMOJE_MERCHANT_ID && process.env.IMOJE_API_TOKEN) {
      this.providers.set('imoje', new ImojeProvider(imojeConfig));
      console.log('imoje provider initialized (sandbox:', imojeConfig.sandbox, ')');
    }

    // TODO: Initialize other providers (Stripe, TPay)
  }

  /**
   * Get provider instance
   */
  private getProvider(providerId: PaymentProviderId): IPaymentProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Payment provider ${providerId} is not available`);
    }
    return provider;
  }

  /**
   * Get best provider for payment method
   */
  private getProviderForMethod(method: PaymentMethodType): IPaymentProvider {
    // Find provider that supports this method
    for (const provider of this.providers.values()) {
      if (provider.config.supportedMethods.includes(method)) {
        return provider;
      }
    }

    // Fallback to default provider
    return this.getProvider(DEFAULT_PROVIDER);
  }

  /**
   * Get all available payment methods
   */
  async getAvailablePaymentMethods(userId?: string): Promise<AvailablePaymentMethod[]> {
    const methods: AvailablePaymentMethod[] = [];

    for (const provider of this.providers.values()) {
      try {
        const providerMethods = await provider.getAvailableMethods();
        methods.push(...providerMethods);
      } catch (error) {
        console.error(`Error getting methods from ${provider.providerId}:`, error);
      }
    }

    // Add Cash on Delivery (handled internally, no provider)
    methods.push({
      id: 'cod',
      type: 'cod',
      name: 'Płatność przy odbiorze',
      providerId: 'payu', // Not actually used
      fee: 5.00,
      feeType: 'fixed',
      description: 'Zapłać kurierowi przy odbiorze',
    });

    // Add B2B bank transfer (only for approved B2B partners)
    if (userId) {
      const { getB2bUserInfo } = require('./b2b-pricing.service');
      const b2bInfo = await getB2bUserInfo(userId);
      if (b2bInfo) {
        methods.push({
          id: 'b2b_transfer',
          type: 'bank_transfer' as PaymentMethodType,
          name: 'Przelew na konto (B2B)',
          providerId: 'payu',
          fee: 0,
          feeType: 'fixed',
          description: 'Przelew bankowy z odroczonym terminem płatności (7 dni)',
        });
      }
    }

    return methods;
  }

  /**
   * Create payment session
   */
  async createPayment(request: CreatePaymentRequest): Promise<PaymentSession> {
    // Determine which provider to use
    const provider = request.providerId 
      ? this.getProvider(request.providerId)
      : this.getProviderForMethod(request.paymentMethod);

    const session = await provider.createPayment(request);

    // Store payment session in database
    await this.storePaymentSession(session);

    return session;
  }

  /**
   * Verify payment status
   */
  async verifyPayment(sessionId: string): Promise<PaymentResult> {
    // Try to determine provider from stored session, or try each active provider
    const storedSession = await this.getStoredSession(sessionId);
    const providerId = (storedSession?.providerId as PaymentProviderId) || DEFAULT_PROVIDER;
    
    const provider = this.getProvider(providerId);
    const result = await provider.verifyPayment(sessionId);

    console.log('Payment verification result:', result);

    // Update order payment status
    await this.updateOrderPaymentStatus(result);

    return result;
  }

  /**
   * Process refund
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    // Get payment info to determine provider
    const payment = await prisma.order.findFirst({
      where: { 
        OR: [
          { id: request.paymentId },
          { orderNumber: request.paymentId },
        ]
      },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // For now, use default provider
    const provider = this.getProvider(DEFAULT_PROVIDER);
    const result = await provider.refund(request);

    // Update order status
    if (result.status === 'succeeded') {
      await prisma.order.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: payment.id,
          status: 'REFUNDED',
          note: `Refund processed: ${result.amount} ${result.currency}`,
        },
      });
    }

    return result;
  }

  /**
   * Cancel pending payment
   */
  async cancelPayment(sessionId: string): Promise<boolean> {
    const storedSession = await this.getStoredSession(sessionId);
    if (!storedSession) {
      return false;
    }

    const provider = this.getProvider(storedSession.providerId as PaymentProviderId);
    return provider.cancelPayment(sessionId);
  }

  /**
   * Process webhook from payment provider
   */
  async processWebhook(
    providerId: PaymentProviderId,
    payload: string,
    signature: string
  ): Promise<PaymentResult> {
    const provider = this.getProvider(providerId);

    // Validate webhook signature
    if (!provider.validateWebhook(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const data = JSON.parse(payload);
    const result = await provider.processWebhook(data);

    // Update order payment status
    await this.updateOrderPaymentStatus(result);

    return result;
  }

  /**
   * Store payment session in database
   */
  private async storePaymentSession(session: PaymentSession): Promise<void> {
    // You would typically store this in a PaymentSession table
    // For now, we'll update the order with payment info
    await prisma.order.update({
      where: { id: session.orderId },
      data: {
        paymentMethod: session.providerId,
        // Store session ID in notes or dedicated field
      },
    });
  }

  /**
   * Get stored payment session
   */
  private async getStoredSession(sessionId: string): Promise<{ orderId: string; providerId: string } | null> {
    // Extract order ID from session ID (format: orderId_timestamp)
    const [orderId] = sessionId.split('_');
    
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      select: { id: true, paymentMethod: true },
    });

    if (!order) {
      return null;
    }

    return {
      orderId: order.id,
      providerId: order.paymentMethod || DEFAULT_PROVIDER,
    };
  }

  /**
   * Update order payment status based on payment result
   */
  private async updateOrderPaymentStatus(result: PaymentResult): Promise<void> {
    // Map payment result status to order status
    // OPEN -> CONFIRMED (when payment succeeds)
    const orderStatusMap: Record<string, string> = {
      'succeeded': 'CONFIRMED', // Payment successful - order confirmed
      'failed': 'OPEN', // Payment failed - order still open
      'cancelled': 'CANCELLED',
      'refunded': 'REFUNDED',
    };

    // Map payment result status to payment status
    const paymentStatusMap: Record<string, string> = {
      'succeeded': 'PAID',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED',
      'refunded': 'REFUNDED',
      'pending': 'PENDING',
      'requires_action': 'AWAITING_CONFIRMATION', // User needs to confirm in banking app
    };

    const newOrderStatus = orderStatusMap[result.status];
    const newPaymentStatus = paymentStatusMap[result.status] || 'PENDING';

    console.log(`Updating order ${result.orderId} - orderStatus: ${newOrderStatus}, paymentStatus: ${newPaymentStatus}${result.paymentMethodUsed ? `, paymentMethod: ${result.paymentMethodUsed}` : ''}`);

    const order = await prisma.order.findFirst({
      where: { id: result.orderId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        shippingAddress: true,
        billingAddress: true,
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    images: { take: 1, select: { url: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (order) {
      // SECURITY: Verify that the paid amount matches the order total
      // This prevents accepting payments for manipulated amounts
      if (result.status === 'succeeded' && result.amount) {
        const expectedAmount = Number(order.total);
        const paidAmount = result.amount;
        const tolerance = 0.01; // 1 grosz tolerance for rounding
        
        if (Math.abs(paidAmount - expectedAmount) > tolerance) {
          console.error(`[SECURITY] Payment amount mismatch for order ${order.id}! Paid: ${paidAmount} PLN, Expected: ${expectedAmount} PLN. Marking as FAILED.`);
          
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'FAILED' as any,
            },
          });
          
          await prisma.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: order.status as any,
              note: `[SECURITY] Payment amount mismatch: paid ${paidAmount} PLN, expected ${expectedAmount} PLN. Transaction: ${result.transactionId || 'unknown'}`,
            },
          });
          
          return; // Do NOT mark as PAID
        }
      }

      const updateData: any = {
        paymentStatus: newPaymentStatus as any,
      };
      
      // Only update order status if payment succeeded or failed
      if (newOrderStatus) {
        updateData.status = newOrderStatus as any;
      }

      // Update payment method if we got the actual method used from provider
      if (result.paymentMethodUsed) {
        updateData.paymentMethod = result.paymentMethodUsed;
      }

      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: (newOrderStatus || order.status) as any,
          note: `Payment ${result.status}${result.transactionId ? ` (Transaction: ${result.transactionId})` : ''}`,
        },
      });

      console.log(`Order ${order.id} updated successfully`);

      // If payment succeeded, sync order to Baselinker and send confirmation email
      // This is the critical point - stock will be decreased in Baselinker
      // only AFTER payment is confirmed
      if (result.status === 'succeeded') {
        console.log(`[PaymentService] Payment succeeded, triggering Baselinker status update for order ${order.id}`);
        
        // Mark coupon as used NOW (only after payment is confirmed)
        if (order.couponCode) {
          try {
            const coupon = await prisma.coupon.update({
              where: { code: order.couponCode },
              data: { usedCount: { increment: 1 } },
            });
            console.log(`[PaymentService] Coupon ${order.couponCode} marked as used for order ${order.orderNumber}`);
            
            // Record coupon usage per user (for single use per user coupons)
            if (order.userId && coupon.singleUsePerUser) {
              await prisma.couponUsage.create({
                data: {
                  couponId: coupon.id,
                  userId: order.userId,
                  orderId: order.id,
                },
              }).catch(err => {
                // Ignore duplicate entry errors (user might have somehow used it twice)
                console.error(`[PaymentService] Failed to record coupon usage:`, err);
              });
            }
          } catch (err) {
            console.error(`[PaymentService] Failed to mark coupon ${order.couponCode} as used:`, err);
          }
        }
        
        // Update product sales count for popularity tracking
        const orderItems = await prisma.orderItem.findMany({
          where: { orderId: order.id },
          include: { variant: { include: { product: true } } },
        });
        
        for (const item of orderItems) {
          if (item.variant?.product?.id) {
            popularityService.incrementSalesCount(item.variant.product.id, item.quantity)
              .catch((err) => console.error(`[PaymentService] Error updating sales count for product ${item.variant?.product?.id}:`, err));
          }
        }
        
        // Send order confirmation email
        const customerEmail = order.user?.email || order.guestEmail;
        const customerName = order.user?.firstName || order.guestFirstName || 'Kliencie';
        
        if (customerEmail && order.shippingAddress) {
          emailService.sendOrderConfirmationEmail(
            customerEmail,
            customerName,
            order.orderNumber,
            order.id,
            Number(order.total),
            order.items.map(item => ({
              name: item.productName,
              variant: item.variantName,
              quantity: item.quantity,
              price: Number(item.unitPrice),
              total: Number(item.total),
              imageUrl: item.variant?.product?.images?.[0]?.url || null,
            })),
            {
              firstName: order.shippingAddress.firstName,
              lastName: order.shippingAddress.lastName,
              street: order.shippingAddress.street,
              city: order.shippingAddress.city,
              postalCode: order.shippingAddress.postalCode,
              phone: order.shippingAddress.phone || undefined,
            },
            order.shippingMethod || 'unknown',
            order.paymentMethod || 'online',
            true // isPaid - payment succeeded
          ).then((emailResult) => {
            if (emailResult.success) {
              console.log(`[PaymentService] Order confirmation email sent for order ${order.orderNumber}`);
            } else {
              console.error(`[PaymentService] Failed to send confirmation email: ${emailResult.error}`);
            }
          }).catch((err) => {
            console.error(`[PaymentService] Error sending confirmation email:`, err);
          });
        } else {
          console.warn(`[PaymentService] Cannot send confirmation email - no email or shipping address for order ${order.id}`);
        }
        
        // Update Baselinker order status from "Nieopłacone" to "Nowe zamówienia"
        // Order was already synced when created, now we just update the status
        baselinkerOrdersService.markOrderAsPaid(order.id)
          .then((syncResult) => {
            if (syncResult.success) {
              console.log(`[PaymentService] Order ${order.id} marked as paid in Baselinker`);
            } else {
              // If order wasn't synced yet (edge case), sync it now
              console.warn(`[PaymentService] Could not update status, trying full sync: ${syncResult.error}`);
              return baselinkerOrdersService.syncOrderToBaselinker(order.id, { 
                orderStatusId: 65342, // Nowe zamówienia (paid)
                skipPaymentCheck: true 
              });
            }
          })
          .then((syncResult) => {
            if (syncResult && syncResult.success) {
              console.log(`[PaymentService] Order ${order.id} synced to Baselinker (BL ID: ${syncResult.baselinkerOrderId})`);
            }
          })
          .catch((err) => {
            console.error(`[PaymentService] Baselinker sync error for order ${order.id}:`, err);
          });
        // NOTE: Fakturownia receipts are created automatically by Baselinker's
        // built-in Fakturownia integration (confirmed: oid=BL order ID, from_api=true).
        // Do NOT call createFakturowniaReceipt here — it would create duplicates.
        // Invoices (faktury) are NOT auto-created — want_invoice is always false in Baselinker.
        // Instead, send a notification to admin so they can create the invoice manually.
        if (order.wantInvoice) {
          const invoiceCustomerName = order.billingAddress
            ? `${order.billingAddress.firstName} ${order.billingAddress.lastName}`
            : customerName;
          emailService.sendInvoiceRequestNotification({
            orderNumber: order.orderNumber,
            customerName: invoiceCustomerName,
            customerEmail: customerEmail || order.guestEmail || '',
            billingNip: order.billingNip,
            billingCompanyName: order.billingCompanyName,
            total: Number(order.total),
          }).catch((err) => {
            console.error(`[PaymentService] Error sending invoice request notification for order ${order.orderNumber}:`, err);
          });
        }
      }
    } else {
      console.error(`Order ${result.orderId} not found for payment update`);
    }
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): PaymentProviderId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Handle Cash on Delivery orders
   */
  async createCODPayment(orderId: string, amount: number): Promise<PaymentSession> {
    // COD is handled differently - no external payment session
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentMethod: 'cod',
        status: 'PROCESSING', // Move to processing without payment
      },
    });

    return {
      id: `cod_${orderId}`,
      orderId,
      providerId: 'przelewy24', // Placeholder
      sessionId: `cod_${orderId}`,
      paymentUrl: '', // No redirect needed
      amount,
      currency: 'PLN',
      status: 'pending',
      createdAt: new Date(),
    };
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
