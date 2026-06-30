/**
 * PayU Payment Provider
 * Integration with PayU payment gateway (Poland)
 * 
 * API Documentation: https://developers.payu.com/europe/docs/online-payments/overview
 * Sandbox Environment: https://secure.snd.payu.com
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
  PaymentWebhookPayload,
} from '../../types/payment.types';

interface PayUConfig {
  posId: string;
  clientId: string;
  clientSecret: string;
  secondKey: string; // MD5 key for signature verification
  sandbox: boolean;
}

interface PayUToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  grantType: string;
  expiresAt: number;
}

export class PayUProvider implements IPaymentProvider {
  readonly providerId: PaymentProviderId = 'payu';
  readonly config: PaymentProviderConfig;

  private payuConfig: PayUConfig;
  private baseUrl: string;
  private token: PayUToken | null = null;

  constructor(config: Partial<PaymentProviderConfig>) {
    this.payuConfig = {
      posId: process.env.PAYU_POS_ID || '',
      clientId: process.env.PAYU_CLIENT_ID || '',
      clientSecret: process.env.PAYU_CLIENT_SECRET || '',
      secondKey: process.env.PAYU_SECOND_KEY || '',
      // Jawnie ustawiony PAYU_SANDBOX jest nadrzędny (false => produkcja, nawet w dev).
      // Brak zmiennej => domyślnie sandbox poza produkcją.
      sandbox: process.env.PAYU_SANDBOX !== undefined
        ? process.env.PAYU_SANDBOX === 'true'
        : process.env.NODE_ENV !== 'production',
    };

    this.baseUrl = this.payuConfig.sandbox
      ? 'https://secure.snd.payu.com'
      : 'https://secure.payu.com';

    this.config = {
      id: 'payu',
      name: 'PayU',
      enabled: true,
      apiUrl: this.baseUrl,
      merchantId: this.payuConfig.posId,
      apiKey: this.payuConfig.secondKey,
      sandbox: this.payuConfig.sandbox,
      webhookSecret: this.payuConfig.secondKey,
      supportedMethods: ['blik', 'card', 'bank_transfer', 'google_pay', 'apple_pay'],
    };
  }

  /**
   * Get OAuth2 access token from PayU
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/pl/standard/user/oauth/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.payuConfig.clientId,
        client_secret: this.payuConfig.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PayU OAuth error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    this.token = {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      grantType: data.grant_type,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60000, // 1 minute buffer
    };

    return this.token.accessToken;
  }

  /**
   * Make authenticated API request to PayU
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    followRedirect = false
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: followRedirect ? 'follow' : 'manual',
    });

    // PayU returns 302 redirect for successful order creation
    if (response.status === 302) {
      const location = response.headers.get('location');
      // Extract orderId from URL like: ?orderId=ABC123&token=...
      const urlParams = new URLSearchParams(location?.split('?')[1] || '');
      const orderId = urlParams.get('orderId') || '';
      return {
        redirectUri: location,
        orderId,
        status: { statusCode: 'SUCCESS' },
      } as unknown as T;
    }

    const data = await response.json();

    if (!response.ok && data.status?.statusCode !== 'SUCCESS') {
      throw new Error(`PayU API error: ${JSON.stringify(data)}`);
    }

    return data;
  }

  /**
   * Generate MD5 signature for notification verification
   */
  private generateSignature(body: string): string {
    return crypto
      .createHash('md5')
      .update(body + this.payuConfig.secondKey)
      .digest('hex');
  }

  /**
   * Get available payment methods
   */
  async getAvailableMethods(): Promise<AvailablePaymentMethod[]> {
    try {
      const token = await this.getAccessToken();
      
      // Get payment methods from PayU
      const response = await fetch(
        `${this.baseUrl}/api/v2_1/paymethods?posId=${this.payuConfig.posId}&lang=pl`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('PayU payment methods:', data);
      }
    } catch (error) {
      console.log('Could not fetch PayU methods, using defaults:', error);
    }

    // Return default available methods
    return [
      {
        id: 'payu_blik',
        type: 'blik',
        name: 'BLIK',
        providerId: 'payu',
        fee: 0,
        feeType: 'fixed',
        description: 'Szybka płatność kodem BLIK',
      },
      {
        id: 'payu_card',
        type: 'card',
        name: 'Karta płatnicza',
        providerId: 'payu',
        fee: 0,
        feeType: 'fixed',
        description: 'Visa, Mastercard',
      },
      {
        id: 'payu_google_pay',
        type: 'google_pay',
        name: 'Google Pay',
        providerId: 'payu',
        fee: 0,
        feeType: 'fixed',
      },
      {
        id: 'payu_apple_pay',
        type: 'apple_pay',
        name: 'Apple Pay',
        providerId: 'payu',
        fee: 0,
        feeType: 'fixed',
      },
      {
        id: 'payu_transfer',
        type: 'bank_transfer',
        name: 'Przelew online',
        providerId: 'payu',
        fee: 0,
        feeType: 'fixed',
        description: 'mBank, PKO BP, Santander, ING i inne',
      },
    ];
  }

  /**
   * Create payment session (order)
   */
  async createPayment(request: CreatePaymentRequest): Promise<PaymentSession> {
    // Convert amount to grosze (PayU uses smallest currency unit)
    const amountInGrosze = Math.round(request.amount * 100);
    
    const extOrderId = `${request.orderId}_${Date.now()}`;
    
    // Get first URL from FRONTEND_URL (may be comma-separated)
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
    
    const orderRequest = {
      notifyUrl: request.notifyUrl || `${process.env.APP_URL}/api/webhooks/payu`,
      continueUrl: request.returnUrl || `${frontendUrl}/order/${request.orderId}/confirmation`,
      customerIp: request.metadata?.customerIp || '127.0.0.1',
      merchantPosId: this.payuConfig.posId,
      description: request.description || `Zamówienie ${request.orderId}`,
      currencyCode: request.currency?.toUpperCase() || 'PLN',
      totalAmount: amountInGrosze.toString(),
      extOrderId,
      buyer: request.customer ? {
        email: request.customer.email,
        phone: request.customer.phone,
        firstName: request.customer.firstName,
        lastName: request.customer.lastName,
        language: 'pl',
      } : undefined,
      products: [
        {
          name: request.description || `Zamówienie #${request.orderId}`,
          unitPrice: amountInGrosze.toString(),
          quantity: '1',
        },
      ],
    };

    console.log('Creating PayU order:', orderRequest);

    const response = await this.request<{
      redirectUri: string;
      orderId: string;
      status: { statusCode: string };
    }>('POST', '/api/v2_1/orders', orderRequest);

    console.log('PayU order response:', response);

    return {
      id: response.orderId,
      orderId: request.orderId,
      providerId: 'payu',
      sessionId: response.orderId,
      paymentUrl: response.redirectUri,
      amount: request.amount,
      currency: request.currency || 'PLN',
      status: 'pending',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      createdAt: new Date(),
    };
  }

  /**
   * Verify payment status
   */
  async verifyPayment(orderId: string): Promise<PaymentResult> {
    const response = await this.request<{
      orders: Array<{
        orderId: string;
        extOrderId: string;
        status: string;
        totalAmount: string;
        currencyCode: string;
      }>;
    }>('GET', `/api/v2_1/orders/${orderId}`);

    const order = response.orders[0];
    const internalOrderId = order.extOrderId?.split('_')[0] || '';
    
    let status: PaymentStatus = 'pending';
    switch (order.status) {
      case 'COMPLETED':
        status = 'succeeded';
        break;
      case 'CANCELED':
        status = 'cancelled';
        break;
      case 'PENDING':
        status = 'pending';
        break;
      case 'WAITING_FOR_CONFIRMATION':
        status = 'requires_action';
        break;
      case 'REJECTED':
        status = 'failed';
        break;
    }

    return {
      sessionId: order.orderId,
      orderId: internalOrderId,
      status,
      transactionId: order.orderId,
      amount: parseInt(order.totalAmount) / 100,
      currency: order.currencyCode,
      paidAt: status === 'succeeded' ? new Date() : undefined,
    };
  }

  /**
   * Process refund
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    const amountInGrosze = request.amount ? Math.round(request.amount * 100) : undefined;

    const refundRequest = {
      refund: {
        description: request.reason || 'Zwrot środków',
        amount: amountInGrosze?.toString(),
      },
    };

    const response = await this.request<{
      orderId: string;
      refund: {
        refundId: string;
        status: string;
        amount: string;
        currencyCode: string;
      };
    }>('POST', `/api/v2_1/orders/${request.paymentId}/refunds`, refundRequest);

    return {
      id: response.refund.refundId,
      paymentId: response.orderId,
      amount: parseInt(response.refund.amount) / 100,
      currency: response.refund.currencyCode,
      status: response.refund.status === 'FINALIZED' ? 'succeeded' : 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Cancel a pending payment
   */
  async cancelPayment(orderId: string): Promise<boolean> {
    try {
      await this.request('DELETE', `/api/v2_1/orders/${orderId}`);
      return true;
    } catch (error) {
      console.error('PayU cancel error:', error);
      return false;
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhook(payload: string, signature: string): boolean {
    // PayU sends signature in OpenPayU-Signature header
    // Format can be: sender=checkout;signature=<md5>;algorithm=MD5;content=DOCUMENT
    // or: signature=<md5>;algorithm=MD5;sender=checkout
    // We need to find the signature= part regardless of position
    
    const signatureParts = signature.split(';');
    let receivedSignature = '';
    
    for (const part of signatureParts) {
      if (part.startsWith('signature=')) {
        receivedSignature = part.replace('signature=', '');
        break;
      }
    }
    
    if (!receivedSignature) {
      console.error('[PayU] No signature found in header:', signature);
      return false;
    }
    
    const expectedSignature = this.generateSignature(payload);
    
    console.log('[PayU] Signature validation:', {
      received: receivedSignature,
      expected: expectedSignature,
      match: receivedSignature === expectedSignature,
    });
    
    return receivedSignature === expectedSignature;
  }

  /**
   * Process webhook notification
   */
  async processWebhook(payload: any): Promise<PaymentResult> {
    const order = payload.order;
    const internalOrderId = order.extOrderId?.split('_')[0] || '';

    let status: PaymentStatus = 'pending';
    switch (order.status) {
      case 'COMPLETED':
        status = 'succeeded';
        break;
      case 'CANCELED':
        status = 'cancelled';
        break;
      case 'PENDING':
        status = 'pending';
        break;
      case 'WAITING_FOR_CONFIRMATION':
        status = 'requires_action';
        break;
      case 'REJECTED':
        status = 'failed';
        break;
    }

    // Extract actual payment method used from PayU payMethod
    let paymentMethodUsed: string | undefined;
    if (order.payMethod?.type) {
      paymentMethodUsed = this.mapPayUMethodToReadable(order.payMethod.type, order.payMethod.value);
      console.log(`[PayU] Payment method used: ${order.payMethod.type} -> ${paymentMethodUsed}`);
    }

    return {
      orderId: internalOrderId,
      sessionId: order.orderId,
      status,
      transactionId: order.orderId,
      amount: parseInt(order.totalAmount) / 100,
      currency: order.currencyCode,
      paidAt: status === 'succeeded' ? new Date() : undefined,
      paymentMethodUsed,
    };
  }

  /**
   * Map PayU payment method type to readable name
   */
  private mapPayUMethodToReadable(type: string, value?: string): string {
    const methodNames: Record<string, string> = {
      'BLIK': 'BLIK',
      'CARD_TOKEN': 'Karta płatnicza',
      'PBL': 'Przelew bankowy',
      'GPAY': 'Google Pay',
      'APAY': 'Apple Pay',
      'KLARNA_PAY_LATER': 'Klarna',
      'KLARNA_PAY_NOW': 'Klarna',
      'PAYPO': 'PayPo',
      'TWISTO': 'Twisto',
    };

    // For bank transfers, include bank name if available
    if (type === 'PBL' && value) {
      const bankNames: Record<string, string> = {
        'm': 'mBank',
        'o': 'Pekao',
        'i': 'ING',
        'p': 'PKO BP',
        'n': 'BNP Paribas',
        's': 'Santander',
        'a': 'Alior',
        'g': 'Getin',
        'w': 'VeloBank',
      };
      return bankNames[value] || 'Przelew bankowy';
    }

    return methodNames[type] || type;
  }
}
