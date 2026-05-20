/**
 * Checkout Routes
 * API endpoints for checkout, shipping, and payment operations
 */

import { Router } from 'express';
import {
  getShippingMethods,
  getPickupPoints,
  getPaymentMethods,
  createCheckout,
  verifyPayment,
  paymentWebhook,
  payuWebhook,
  imojeWebhook,
  shippingWebhook,
  getOrderTracking,
  calculateCartShipping,
  calculateItemsShipping,
  getShippingPerPackage,
  retryPayment,
} from '../controllers/checkout.controller';
import { authGuard, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// ============================================
// SHIPPING ENDPOINTS
// ============================================

/**
 * GET /api/checkout/shipping/methods
 * Get available shipping methods with rates
 * Query params: postalCode (required), city (optional), country (optional)
 */
router.get('/shipping/methods', optionalAuth, getShippingMethods);

/**
 * GET /api/checkout/shipping/pickup-points
 * Get pickup points (Paczkomaty) near a location
 * Query params: postalCode (required), city (optional), provider (optional), limit (optional)
 */
router.get('/shipping/pickup-points', optionalAuth, getPickupPoints);

/**
 * GET /api/checkout/shipping/calculate
 * Calculate shipping cost for cart based on product tags
 * Takes into account: gabaryt (oversized), wholesalers, paczkomat limits
 */
router.get('/shipping/calculate', optionalAuth, calculateCartShipping);

/**
 * POST /api/checkout/shipping/calculate
 * Calculate shipping cost for provided items (alternative to cart-based calculation)
 * Body: { items: [{ variantId: string, quantity: number }] }
 */
router.post('/shipping/calculate', optionalAuth, calculateItemsShipping);

/**
 * POST /api/checkout/shipping/per-package
 * Get shipping options per package for per-product shipping selection
 * Body: { items: [{ variantId: string, quantity: number }] }
 */
router.post('/shipping/per-package', optionalAuth, getShippingPerPackage);

// ============================================
// PAYMENT ENDPOINTS
// ============================================

/**
 * GET /api/checkout/payment/methods
 * Get available payment methods
 */
router.get('/payment/methods', optionalAuth, getPaymentMethods);

/**
 * GET /api/checkout/payment/verify/:sessionId
 * Verify payment status after redirect from payment gateway
 */
router.get('/payment/verify/:sessionId', optionalAuth, verifyPayment);

/**
 * POST /api/checkout/payment/retry/:orderId
 * Retry payment for an unpaid order - creates new PayU session
 * Supports both authenticated users and guest checkout (via email verification)
 */
router.post('/payment/retry/:orderId', optionalAuth, retryPayment);

// ============================================
// CHECKOUT ENDPOINTS
// ============================================

/**
 * POST /api/checkout
 * Create order and initiate payment
 * Supports both authenticated users and guest checkout
 * Body: {
 *   shippingAddressId: string,
 *   billingAddressId?: string,
 *   shippingMethod: string,
 *   pickupPointCode?: string,
 *   paymentMethod: string,
 *   customerNotes?: string,
 *   acceptTerms: boolean,
 *   // Guest checkout fields (required if not authenticated):
 *   guestEmail?: string,
 *   guestFirstName?: string,
 *   guestLastName?: string,
 *   guestPhone?: string
 * }
 */
router.post('/', optionalAuth, createCheckout);

/**
 * GET /api/checkout/tracking/:orderId
 * Get shipment tracking info for an order
 */
router.get('/tracking/:orderId', authGuard, getOrderTracking);

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

/**
 * POST /api/webhooks/payu
 * Handle PayU payment webhooks
 * PayU sends signature in OpenPayU-Signature header
 */
router.post('/webhooks/payu', payuWebhook);

/**
 * POST /api/webhooks/imoje
 * Handle imoje payment webhooks
 * imoje sends signature in X-Imoje-Signature header
 */
router.post('/webhooks/imoje', imojeWebhook);

/**
 * POST /api/webhooks/payment/:provider
 * Handle payment provider webhooks (with provider specified)
 */
router.post('/webhooks/payment/:provider', paymentWebhook);

/**
 * POST /api/webhooks/payment
 * Handle payment provider webhooks (without provider - for backwards compatibility)
 */
router.post('/webhooks/payment', paymentWebhook);

/**
 * POST /api/webhooks/shipping/:provider
 * Handle shipping provider webhooks
 */
router.post('/webhooks/shipping/:provider', shippingWebhook);

export default router;
