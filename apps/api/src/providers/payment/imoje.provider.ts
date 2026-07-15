/**
 * imoje Payment Provider
 * Integration with imoje payment gateway (ING Bank Śląski, Poland)
 * 
 * API Documentation: https://developer.imoje.pl/
 * Sandbox Environment: https://sandbox.paywall.imoje.pl
 * Production Environment: https://paywall.imoje.pl
 * 
 * imoje supports: BLIK, card payments (Visa, Mastercard), bank transfers (pay-by-link),
 * Google Pay, Apple Pay, Twisto, PayPo, and installments.
 */

import crypto from 'crypto';
import { IPaymentProvider } from './payment-provider.interface';
import {
  PaymentProviderConfig,
  PaymentProviderId,
  AvailablePaymentMethod,
  CreatePaymentRequest,
  PaymentSession,
  PaymentResult,
  RefundRequest,
  RefundResult,
  PaymentStatus,
} from '../../types/payment.types';

interface ImojeConfig {
  merchantId: string;
  serviceId: string;
  serviceKey: string;  // Used for webhook signature verification
  apiToken: string;    // Bearer token for REST API
  sandbox: boolean;
}

export class ImojeProvider implements IPaymentProvider {
  readonly providerId: PaymentProviderId = 'imoje';
  readonly config: PaymentProviderConfig;

  private imojeConfig: ImojeConfig;
  private baseUrl: string;
  private paywallUrl: string;

  constructor(_config: Partial<PaymentProviderConfig>) {
    this.imojeConfig = {
      merchantId: process.env.IMOJE_MERCHANT_ID || '',
      serviceId: process.env.IMOJE_SERVICE_ID || '',
      serviceKey: process.env.IMOJE_SERVICE_KEY || '',
      apiToken: process.env.IMOJE_API_TOKEN || '',
      sandbox: process.env.IMOJE_SANDBOX === 'true' || process.env.NODE_ENV !== 'production',
    };

    this.baseUrl = this.imojeConfig.sandbox
      ? 'https://sandbox.api.imoje.pl'
      : 'https://api.imoje.pl';

    this.paywallUrl = this.imojeConfig.sandbox
      ? 'https://sandbox.paywall.imoje.pl'
      : 'https://paywall.imoje.pl';

    this.config = {
      id: 'imoje',
      name: 'imoje',
      enabled: true,
      apiUrl: this.baseUrl,
      merchantId: this.imojeConfig.merchantId,
      apiKey: this.imojeConfig.apiToken,
      sandbox: this.imojeConfig.sandbox,
      webhookSecret: this.imojeConfig.serviceKey,
      supportedMethods: ['blik', 'card', 'bank_transfer', 'google_pay', 'apple_pay'],
    };
  }

  /**
   * Make authenticated API request to imoje
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.imojeConfig.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[imoje] API error:', response.status, JSON.stringify(data));
      throw new Error(`imoje API error: ${response.status} - ${JSON.stringify(data)}`);
    }

    return data;
  }

  /**
   * Get available payment methods
   */
  async getAvailableMethods(): Promise<AvailablePaymentMethod[]> {
    return [
      {
        id: 'imoje_blik',
        type: 'blik',
        name: 'BLIK',
        providerId: 'imoje',
        fee: 0,
        feeType: 'fixed',
        description: 'Szybka płatność kodem BLIK',
      },
      {
        id: 'imoje_card',
        type: 'card',
        name: 'Karta płatnicza',
        providerId: 'imoje',
        fee: 0,
        feeType: 'fixed',
        description: 'Visa, Mastercard',
      },
      {
        id: 'imoje_google_pay',
        type: 'google_pay',
        name: 'Google Pay',
        providerId: 'imoje',
        fee: 0,
        feeType: 'fixed',
      },
      {
        id: 'imoje_apple_pay',
        type: 'apple_pay',
        name: 'Apple Pay',
        providerId: 'imoje',
        fee: 0,
        feeType: 'fixed',
      },
      {
        id: 'imoje_transfer',
        type: 'bank_transfer',
        name: 'Przelew online',
        providerId: 'imoje',
        fee: 0,
        feeType: 'fixed',
        description: 'mBank, PKO BP, Santander, ING i inne',
      },
    ];
  }

  /**
   * Create payment transaction via imoje REST API
   * 
   * imoje uses amounts in smallest currency unit (grosze for PLN).
   * The response includes a payment URL to redirect the customer.
   */
  async createPayment(request: CreatePaymentRequest): Promise<PaymentSession> {
    // imoje uses amounts in grosze (1/100 PLN)
    const amountInGrosze = Math.round(request.amount * 100);

    const transactionPayload: Record<string, unknown> = {
      type: 'sale',
      serviceId: this.imojeConfig.serviceId,
      amount: amountInGrosze,
      currency: (request.currency || 'PLN').toUpperCase(),
      orderId: request.orderId,
      title: request.description || `Zamówienie ${request.orderId}`,
      returnUrl: request.returnUrl,
      failureReturnUrl: request.cancelUrl,
      customer: {
        firstName: request.customer.firstName || '',
        lastName: request.customer.lastName || '',
        email: request.customer.email,
        phone: request.customer.phone || '',
      },
    };

    // If billing address provided, add it
    if (request.billingAddress) {
      transactionPayload.billingAddress = {
        firstName: request.customer.firstName || '',
        lastName: request.customer.lastName || '',
        street: request.billingAddress.street,
        city: request.billingAddress.city,
        postalCode: request.billingAddress.postalCode,
        countryCodeAlpha2: request.billingAddress.country || 'PL',
      };
    }

    // SECURITY: do not log the full payload — it contains buyer PII (email, name, billing address)
    console.log('[imoje] Creating transaction:', {
      orderId: transactionPayload.orderId,
      amount: transactionPayload.amount,
      currency: transactionPayload.currency,
    });

    const response = await this.request<{
      transaction: {
        id: string;
        orderId: string;
        status: string;
        created: number;
      };
      action: {
        type: string;
        url: string;
        method: string;
        contentType: string;
      };
    }>('POST', '/v1/merchant/payments', transactionPayload);

    console.log('[imoje] Transaction created:', {
      transactionId: response.transaction?.id,
      status: response.transaction?.status,
      hasActionUrl: !!response.action?.url,
    });

    // imoje returns an action URL where user should be redirected
    const paymentUrl = response.action?.url || `${this.paywallUrl}/payment/${response.transaction.id}`;

    return {
      id: response.transaction.id,
      orderId: request.orderId,
      providerId: 'imoje',
      sessionId: response.transaction.id,
      paymentUrl,
      amount: request.amount,
      currency: request.currency || 'PLN',
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      createdAt: new Date(),
    };
  }

  /**
   * Verify payment status by querying imoje API
   */
  async verifyPayment(transactionId: string): Promise<PaymentResult> {
    const response = await this.request<{
      transaction: {
        id: string;
        orderId: string;
        status: string;
        amount: number;
        currency: string;
        paymentMethod: string;
        paymentMethodCode: string;
        created: number;
        modified: number;
      };
    }>('GET', `/v1/merchant/payments/${transactionId}`);

    const tx = response.transaction;
    const status = this.mapImojeStatus(tx.status);

    return {
      sessionId: tx.id,
      orderId: tx.orderId,
      status,
      transactionId: tx.id,
      amount: tx.amount / 100, // Convert from grosze
      currency: tx.currency,
      paidAt: status === 'succeeded' ? new Date(tx.modified * 1000) : undefined,
      paymentMethodUsed: this.mapImojePaymentMethod(tx.paymentMethod, tx.paymentMethodCode),
    };
  }

  /**
   * Process refund via imoje API
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    const amountInGrosze = request.amount ? Math.round(request.amount * 100) : undefined;

    const refundPayload: Record<string, unknown> = {
      type: 'refund',
      serviceId: this.imojeConfig.serviceId,
      amount: amountInGrosze, // If undefined, imoje does full refund
    };

    const response = await this.request<{
      transaction: {
        id: string;
        status: string;
        amount: number;
        currency: string;
        created: number;
      };
    }>('POST', `/v1/merchant/payments/${request.paymentId}/refunds`, refundPayload);

    return {
      id: response.transaction.id,
      paymentId: request.paymentId,
      amount: response.transaction.amount / 100,
      currency: response.transaction.currency,
      status: response.transaction.status === 'settled' ? 'succeeded' : 'pending',
      createdAt: new Date(response.transaction.created * 1000),
    };
  }

  /**
   * Cancel a pending payment
   */
  async cancelPayment(transactionId: string): Promise<boolean> {
    try {
      await this.request('POST', `/v1/merchant/payments/${transactionId}/cancel`, {});
      return true;
    } catch (error) {
      console.error('[imoje] Cancel error:', error);
      return false;
    }
  }

  /**
   * Validate webhook signature from imoje
   * 
   * imoje signs webhooks using HMAC-SHA256 with the service key.
   * The signature is sent in the X-Imoje-Signature header.
   * Format: signature=<hex>;algorithm=sha256;merchantId=<id>
   */
  validateWebhook(payload: string, signatureHeader: string): boolean {
    if (!signatureHeader) {
      console.error('[imoje] No signature header provided');
      return false;
    }

    // Parse the signature header
    // Format: signature=<hex>;algorithm=sha256;merchantId=<id>  
    // or just the raw HMAC value depending on imoje version
    let receivedSignature = '';

    if (signatureHeader.includes('signature=')) {
      // Structured format
      const parts = signatureHeader.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith('signature=')) {
          receivedSignature = trimmed.replace('signature=', '');
          break;
        }
      }
    } else {
      // Raw signature value
      receivedSignature = signatureHeader.trim();
    }

    if (!receivedSignature) {
      console.error('[imoje] Could not extract signature from header:', signatureHeader);
      return false;
    }

    // Calculate expected HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', this.imojeConfig.serviceKey)
      .update(payload)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );

    console.log('[imoje] Signature validation:', {
      received: receivedSignature.substring(0, 16) + '...',
      expected: expectedSignature.substring(0, 16) + '...',
      match: isValid,
    });

    return isValid;
  }

  /**
   * Process incoming webhook notification from imoje
   * 
   * imoje sends notifications for transaction status changes:
   * - new → pending → settled (success)
   * - new → pending → rejected (failure)
   * - settled → returned (refund)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async processWebhook(payload: any): Promise<PaymentResult> {
    const tx = payload.transaction || payload;

    const status = this.mapImojeStatus(tx.status);

    let paymentMethodUsed: string | undefined;
    if (tx.paymentMethod || tx.paymentMethodCode) {
      paymentMethodUsed = this.mapImojePaymentMethod(tx.paymentMethod, tx.paymentMethodCode);
      console.log(`[imoje] Payment method used: ${tx.paymentMethod}/${tx.paymentMethodCode} -> ${paymentMethodUsed}`);
    }

    return {
      orderId: tx.orderId,
      sessionId: tx.id,
      status,
      transactionId: tx.id,
      amount: (tx.amount || 0) / 100, // Convert from grosze
      currency: tx.currency || 'PLN',
      paidAt: status === 'succeeded' ? new Date() : undefined,
      paymentMethodUsed,
    };
  }

  /**
   * Map imoje transaction status to internal PaymentStatus
   * 
   * imoje statuses: new, pending, authorized, settled, rejected, cancelled, returned, error
   */
  private mapImojeStatus(imojeStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'new': 'pending',
      'pending': 'processing',
      'authorized': 'requires_action',
      'settled': 'succeeded',
      'rejected': 'failed',
      'cancelled': 'cancelled',
      'returned': 'refunded',
      'error': 'failed',
    };

    return statusMap[imojeStatus] || 'pending';
  }

  /**
   * Map imoje payment method to human-readable name
   */
  private mapImojePaymentMethod(paymentMethod?: string, paymentMethodCode?: string): string {
    const methodNames: Record<string, string> = {
      'blik': 'BLIK',
      'card': 'Karta płatnicza',
      'pbl': 'Przelew bankowy',
      'ing': 'ING Bank Śląski',
      'pay_by_link': 'Przelew bankowy',
      'google_pay': 'Google Pay',
      'apple_pay': 'Apple Pay',
      'twisto': 'Twisto',
      'paypo': 'PayPo',
      'installments': 'Raty',
    };

    // Try paymentMethodCode first (more specific), then paymentMethod
    if (paymentMethodCode && methodNames[paymentMethodCode]) {
      return methodNames[paymentMethodCode];
    }
    if (paymentMethod && methodNames[paymentMethod]) {
      return methodNames[paymentMethod];
    }

    return paymentMethod || paymentMethodCode || 'imoje';
  }
}
