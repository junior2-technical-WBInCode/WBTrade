/**
 * Checkout Controller
 * Handles checkout process including shipping and payment
 */

import { Request, Response } from 'express';
import { prisma } from '../db';
import { shippingService } from '../services/shipping.service';
import { shippingCalculatorService } from '../services/shipping-calculator.service';
import { paymentService } from '../services/payment.service';
import { OrdersService } from '../services/orders.service';
import { CartService } from '../services/cart.service';
import { addressesService } from '../services/addresses.service';
import { emailService } from '../services/email.service';
import { ShippingProviderId } from '../types/shipping.types';
import { getB2bUserInfo } from '../services/b2b-pricing.service';
import { CreatePaymentRequest, PaymentMethodType, PaymentProviderId } from '../types/payment.types';
import { loyaltyService } from '../services/loyalty.service';

/**
 * Map frontend payment method names to API payment method types
 */
function mapPaymentMethod(frontendMethod: string): PaymentMethodType {
  const methodMapping: Record<string, PaymentMethodType> = {
    'payu': 'blik', // PayU handles all online payment methods (BLIK, cards, transfers, etc.)
    'imoje': 'blik', // imoje handles all online payment methods (BLIK, cards, transfers, etc.)
    'blik': 'blik',
    'card': 'card',
    'transfer': 'bank_transfer',
    'bank_transfer': 'bank_transfer',
    'google_pay': 'google_pay',
    'apple_pay': 'apple_pay',
    'paypo': 'paypo',
  };
  
  return methodMapping[frontendMethod] || 'blik';
}

/**
 * Determine payment provider ID from frontend payment method string
 */
function resolveProviderId(frontendMethod: string): PaymentProviderId {
  if (frontendMethod === 'imoje') return 'imoje';
  return 'payu'; // Default to PayU
}

const ordersService = new OrdersService();
const cartService = new CartService();

/**
 * Get available shipping methods with rates
 */
export async function getShippingMethods(req: Request, res: Response): Promise<void> {
  try {
    const { postalCode, city, country = 'PL' } = req.query;

    if (!postalCode) {
      res.status(400).json({ message: 'Postal code is required' });
      return;
    }

    const rates = await shippingService.getAvailableShippingMethods({
      providerId: 'inpost_paczkomat', // Will be ignored, gets from all providers
      origin: {
        postalCode: '00-001', // Warehouse postal code
        city: 'Warszawa',
        country: 'PL',
      },
      destination: {
        postalCode: postalCode as string,
        city: city as string || '',
        country: country as string,
      },
      packages: [{ weight: 1 }], // Default package
    });

    res.json({
      shippingMethods: rates.map(rate => ({
        id: rate.providerId,
        serviceType: rate.serviceType,
        name: rate.serviceName,
        price: rate.price,
        currency: rate.currency,
        estimatedDelivery: `${rate.estimatedDeliveryDays.min}-${rate.estimatedDeliveryDays.max} dni roboczych`,
        pickupPointRequired: rate.pickupPointRequired,
      })),
    });
  } catch (error) {
    console.error('Error getting shipping methods:', error);
    res.status(500).json({ message: 'Failed to get shipping methods' });
  }
}

/**
 * Calculate shipping cost for cart based on product tags
 * This takes into account:
 * - Gabaryt (oversized) products - individual shipping
 * - Different wholesalers - separate packages
 * - Paczkomat limits (X products in package tags)
 */
export async function calculateCartShipping(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const sessionId = req.headers['x-session-id'] as string | undefined;
    
    console.log('[calculateCartShipping] userId:', userId, 'sessionId:', sessionId);
    
    // Get user's cart - try multiple strategies to find cart with items
    let cart;
    
    // Strategy 1: If user is logged in, try user's cart first
    if (userId) {
      cart = await cartService.getOrCreateCart(userId, undefined);
      console.log('[calculateCartShipping] User cart items:', cart?.items?.length || 0);
    }
    
    // Strategy 2: If no items found and sessionId provided, try merge or session cart
    if ((!cart || !cart.items.length) && sessionId) {
      if (userId) {
        cart = await cartService.mergeCarts(userId, sessionId);
        console.log('[calculateCartShipping] After merge items:', cart?.items?.length || 0);
      } else {
        cart = await cartService.getOrCreateCart(undefined, sessionId);
        console.log('[calculateCartShipping] Session cart items:', cart?.items?.length || 0);
      }
    }
    
    if (!cart || !cart.items.length) {
      console.log('[calculateCartShipping] Cart is empty or not found');
      res.status(400).json({ message: 'Koszyk jest pusty' });
      return;
    }
    
    // Convert cart items to format needed by shipping calculator
    const cartItems = cart.items.map(item => ({
      variantId: item.variant.id,
      quantity: item.quantity,
    }));
    
    // Get available shipping methods with calculated prices
    const b2bInfo = req.user?.userId ? await getB2bUserInfo(req.user.userId) : null;
    const shippingMethods = await shippingCalculatorService.getAvailableShippingMethods(cartItems, {
      isB2b: !!b2bInfo,
      cartSubtotal: cart.subtotal,
    });
    
    // Get detailed calculation for additional info
    const detailedCalculation = await shippingCalculatorService.calculateShipping(cartItems);
    
    res.json({
      shippingMethods: shippingMethods.map(method => ({
        id: method.id,
        name: method.name,
        price: method.price,
        currency: 'PLN',
        available: method.available,
        message: method.message,
      })),
      calculation: {
        totalPackages: detailedCalculation.totalPackages,
        totalPaczkomatPackages: detailedCalculation.totalPaczkomatPackages,
        isPaczkomatAvailable: detailedCalculation.isPaczkomatAvailable,
        breakdown: detailedCalculation.breakdown,
        warnings: detailedCalculation.warnings,
      },
    });
  } catch (error) {
    console.error('Error calculating cart shipping:', error);
    res.status(500).json({ message: 'Failed to calculate shipping' });
  }
}

/**
 * Calculate shipping for provided items (without needing cart)
 * POST /checkout/shipping/calculate
 */
export async function calculateItemsShipping(req: Request, res: Response): Promise<void> {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'Items array is required' });
      return;
    }
    
    // Validate items format
    const cartItems = items.map((item: any) => ({
      variantId: item.variantId,
      quantity: item.quantity || 1,
    }));
    
    // Get available shipping methods with calculated prices
    const b2bInfo = req.user?.userId ? await getB2bUserInfo(req.user.userId) : null;
    const shippingMethods = await shippingCalculatorService.getAvailableShippingMethods(cartItems, {
      isB2b: !!b2bInfo,
    });
    
    // Get detailed calculation for additional info
    const detailedCalculation = await shippingCalculatorService.calculateShipping(cartItems);
    
    res.json({
      shippingMethods: shippingMethods.map(method => ({
        id: method.id,
        name: method.name,
        price: method.price,
        currency: 'PLN',
        available: method.available,
        message: method.message,
      })),
      calculation: {
        totalPackages: detailedCalculation.totalPackages,
        totalPaczkomatPackages: detailedCalculation.totalPaczkomatPackages,
        isPaczkomatAvailable: detailedCalculation.isPaczkomatAvailable,
        breakdown: detailedCalculation.breakdown,
        warnings: detailedCalculation.warnings,
      },
    });
  } catch (error) {
    console.error('Error calculating items shipping:', error);
    res.status(500).json({ message: 'Failed to calculate shipping' });
  }
}

/**
 * Get shipping options per package (for per-product shipping selection)
 * POST /checkout/shipping/per-package
 */
export async function getShippingPerPackage(req: Request, res: Response): Promise<void> {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'Items array is required' });
      return;
    }
    
    // Validate items format
    const cartItems = items.map((item: any) => ({
      variantId: item.variantId,
      quantity: item.quantity || 1,
    }));
    
    // Get shipping options per package (with B2B info if applicable)
    const b2bInfoPkg = req.user?.userId ? await getB2bUserInfo(req.user.userId) : null;
    const result = await shippingCalculatorService.getShippingOptionsPerPackage(cartItems, {
      isB2b: !!b2bInfoPkg,
      cartSubtotal: Number(req.body.cartSubtotal) || 0,
    });
    
    res.json({
      packagesWithOptions: result.packagesWithOptions.map(pkgOpt => ({
        package: {
          id: pkgOpt.package.id,
          type: pkgOpt.package.type,
          wholesaler: pkgOpt.package.wholesaler,
          items: pkgOpt.package.items,
          isPaczkomatAvailable: pkgOpt.package.isPaczkomatAvailable,
          isInPostOnly: pkgOpt.package.isInPostOnly,
          isCourierOnly: pkgOpt.package.isCourierOnly,
          warehouseValue: pkgOpt.package.warehouseValue,
          hasFreeShipping: pkgOpt.package.hasFreeShipping,
          paczkomatPackageCount: pkgOpt.package.paczkomatPackageCount,
        },
        shippingMethods: pkgOpt.shippingMethods.map(method => ({
          id: method.id,
          name: method.name,
          price: method.price,
          available: method.available,
          message: method.message,
          estimatedDelivery: method.estimatedDelivery,
        })),
        selectedMethod: pkgOpt.selectedMethod,
      })),
      totalShippingCost: result.totalShippingCost,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Error getting shipping per package:', error);
    res.status(500).json({ message: 'Failed to get shipping per package' });
  }
}

/**
 * Get pickup points (Paczkomaty) for postal code
 */
export async function getPickupPoints(req: Request, res: Response): Promise<void> {
  try {
    const { postalCode, city, provider = 'inpost_paczkomat', limit = '10' } = req.query;

    if (!postalCode) {
      res.status(400).json({ message: 'Postal code is required' });
      return;
    }

    const points = await shippingService.getPickupPoints(
      provider as ShippingProviderId,
      postalCode as string,
      city as string,
      parseInt(limit as string)
    );

    res.json({ pickupPoints: points });
  } catch (error) {
    console.error('Error getting pickup points:', error);
    res.status(500).json({ message: 'Failed to get pickup points' });
  }
}

/**
 * Get available payment methods
 */
export async function getPaymentMethods(req: Request, res: Response): Promise<void> {
  try {
    const methods = await paymentService.getAvailablePaymentMethods(req.user?.userId);

    res.json({
      paymentMethods: methods.map(method => ({
        id: method.id,
        type: method.type,
        name: method.name,
        fee: method.fee,
        feeType: method.feeType,
        description: method.description,
      })),
    });
  } catch (error) {
    console.error('Error getting payment methods:', error);
    res.status(500).json({ message: 'Failed to get payment methods' });
  }
}

/**
 * Create order and initiate payment
 * Supports both authenticated users and guest checkout
 */
export async function createCheckout(req: Request, res: Response): Promise<void> {
  try {
    console.log('🛒 createCheckout started');
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
    
    const userId = req.user?.userId;
    const sessionId = req.headers['x-session-id'] as string | undefined;
    
    console.log('👤 User ID:', userId);
    console.log('🆔 Session ID:', sessionId);
    
    // Extract guest checkout fields
    const {
      shippingAddressId,
      billingAddressId,
      shippingMethod,
      pickupPointCode,
      pickupPointAddress,
      paymentMethod,
      customerNotes,
      acceptTerms,
      packageShipping,
      // Selected cart item IDs (Empik-style partial cart checkout)
      selectedItemIds,
      // Invoice preference
      wantInvoice,
      // Guest checkout fields
      guestEmail,
      guestFirstName,
      guestLastName,
      guestPhone,
      // Guest address data (when not using saved address)
      guestAddress,
    } = req.body;

    // For guest checkout, validate required guest fields
    const isGuestCheckout = !userId;
    if (isGuestCheckout) {
      console.log('🛒 Guest checkout detected');
      if (!guestEmail || !guestFirstName || !guestLastName) {
        console.log('❌ Missing guest checkout fields');
        res.status(400).json({ 
          message: 'Email, imię i nazwisko są wymagane dla zakupów bez konta' 
        });
        return;
      }
    }

    console.log('📦 Shipping Address ID:', shippingAddressId);
    console.log('🚚 Shipping Method:', shippingMethod);
    console.log('💳 Payment Method:', paymentMethod);
    console.log('📦 Package Shipping:', packageShipping?.length ? `${packageShipping.length} packages` : 'none');

    // Validate required fields
    if (!shippingMethod || !paymentMethod || !acceptTerms) {
      console.log('❌ Missing required fields');
      res.status(400).json({ 
        message: 'Shipping method, payment method, and terms acceptance are required' 
      });
      return;
    }

    // Validate B2B-only methods
    if (shippingMethod === 'b2b_wysylka_wlasna' || paymentMethod === 'b2b_transfer') {
      if (!userId) {
        res.status(403).json({ message: 'Metody B2B dostępne tylko dla zalogowanych partnerów B2B' });
        return;
      }
      const b2bCheck = await getB2bUserInfo(userId);
      if (!b2bCheck) {
        res.status(403).json({ message: 'Metody B2B dostępne tylko dla zatwierdzonych partnerów B2B' });
        return;
      }
    }

    // Get cart - for logged in users by userId, for guests by sessionId
    let cart;
    if (userId) {
      console.log('🛒 Getting cart for user:', userId);
      cart = await cartService.getOrCreateCart(userId);
      console.log('🛒 Cart found:', cart?.id, 'Items:', cart?.items?.length);
      
      // If cart by userId is empty but we have sessionId, try to merge or get session cart
      if ((!cart || !cart.items.length) && sessionId) {
        console.log('🔄 Trying session cart merge...');
        const sessionCart = await cartService.getOrCreateCart(undefined, sessionId);
        if (sessionCart && sessionCart.items.length > 0) {
          cart = await cartService.mergeCarts(userId, sessionId);
        }
      }
    } else if (sessionId) {
      // Guest checkout - get cart by sessionId only
      console.log('🛒 Getting cart for guest session:', sessionId);
      cart = await cartService.getOrCreateCart(undefined, sessionId);
      console.log('🛒 Guest cart found:', cart?.id, 'Items:', cart?.items?.length);
    }
    
    if (!cart || !cart.items.length) {
      console.log('❌ Cart is empty');
      res.status(400).json({ message: 'Koszyk jest pusty' });
      return;
    }

    // Filter cart items if selectedItemIds is provided (Empik-style partial checkout)
    let cartItemsToCheckout = cart.items;
    if (selectedItemIds && Array.isArray(selectedItemIds) && selectedItemIds.length > 0) {
      const selectedSet = new Set(selectedItemIds);
      cartItemsToCheckout = cart.items.filter((item: any) => selectedSet.has(item.id));
      console.log(`📦 Partial checkout: ${cartItemsToCheckout.length}/${cart.items.length} items selected`);
      
      if (cartItemsToCheckout.length === 0) {
        console.log('❌ No selected items found in cart');
        res.status(400).json({ message: 'No selected items found in cart' });
        return;
      }
    }


    // Calculate totals
    interface CartItemData {
      variantId: string;
      quantity: number;
      unitPrice: number;
    }
    
    const items: CartItemData[] = cartItemsToCheckout.map((item) => ({
      variantId: item.variant.id,
      quantity: item.quantity,
      unitPrice: Number(item.variant.price),
    }));

    const subtotal = items.reduce((sum: number, item: CartItemData) => sum + item.unitPrice * item.quantity, 0);
    
    // Calculate shipping cost
    // SECURITY: Never trust client-submitted shipping prices — always recalculate server-side
    let shippingCost = 0;
    
    if (packageShipping && Array.isArray(packageShipping) && packageShipping.length > 0) {
      // Recalculate shipping prices server-side using the shipping calculator
      const cartItemsForShipping = cartItemsToCheckout.map(item => ({
        variantId: item.variant.id,
        quantity: item.quantity,
      }));
      
      const b2bInfoCheckout = userId ? await getB2bUserInfo(userId) : null;
      const serverShippingResult = await shippingCalculatorService.getShippingOptionsPerPackage(cartItemsForShipping, {
        isB2b: !!b2bInfoCheckout,
        cartSubtotal: subtotal,
      });
      const serverPackages = serverShippingResult.packagesWithOptions;
      
      // Match each client-submitted package to server-calculated packages and override prices
      for (let i = 0; i < packageShipping.length; i++) {
        const clientPkg = packageShipping[i];
        // Match by packageId or by index fallback
        const serverPkg = serverPackages.find(sp => sp.package.id === clientPkg.packageId)
                       || serverPackages[i];
        
        if (serverPkg) {
          const serverMethod = serverPkg.shippingMethods.find(
            (m: any) => m.id === clientPkg.method && m.available
          );
          
          if (serverMethod) {
            // Override client price with server-calculated price
            const clientPrice = clientPkg.price;
            clientPkg.price = serverMethod.price;
            if (clientPrice !== serverMethod.price) {
              console.warn(`⚠️ SECURITY: Shipping price mismatch for package ${clientPkg.packageId}! Client sent: ${clientPrice}, server calculated: ${serverMethod.price}`);
            }
          } else {
            // Client selected a method that's not available — reject
            console.error(`❌ Shipping method "${clientPkg.method}" is not available for package ${clientPkg.packageId}`);
            res.status(400).json({ 
              message: `Metoda dostawy "${clientPkg.method}" nie jest dostępna dla jednej z paczek` 
            });
            return;
          }
        } else {
          console.error(`❌ No matching server package for client package ${clientPkg.packageId}`);
          res.status(400).json({ message: 'Nieprawidłowa konfiguracja paczek dostawy' });
          return;
        }
      }
      
      shippingCost = packageShipping.reduce((sum: number, pkg: any) => sum + (pkg.price || 0), 0);
      console.log(`📦 Shipping cost (server-validated): ${shippingCost} (${packageShipping.length} packages)`);
      console.log(`📦 Package details:`, packageShipping.map((p: any) => ({ method: p.method, price: p.price })));
    } else {
      // Fallback: Get shipping rate using the calculator based on product tags
      // Convert cart items to format needed by shipping calculator
      const cartItemsForShipping = cartItemsToCheckout.map(item => ({
        variantId: item.variant.id,
        quantity: item.quantity,
      }));
      
      try {
        const shippingResult = await shippingCalculatorService.calculateShipping(cartItemsForShipping);
        
        // Get price for specific shipping method
        const b2bInfoForShipping = userId ? await getB2bUserInfo(userId) : null;
        const methods = await shippingCalculatorService.getAvailableShippingMethods(cartItemsForShipping, {
          isB2b: !!b2bInfoForShipping,
          cartSubtotal: subtotal,
        });
        const selectedMethod = methods.find(m => m.id === shippingMethod);
        shippingCost = selectedMethod?.price || shippingResult.shippingCost;
        
        // Log any warnings for debugging
        if (shippingResult.warnings.length > 0) {
          console.log('📦 Shipping warnings:', shippingResult.warnings);
        }
      } catch (shippingError) {
        // Fallback to old shipping calculation if new one fails
        console.error('⚠️ Error with new shipping calculator, falling back:', shippingError);
        const shippingRates = await shippingService.calculateRate(
          shippingMethod as ShippingProviderId,
          {
            providerId: shippingMethod as ShippingProviderId,
            origin: { postalCode: '00-001', city: 'Warszawa', country: 'PL' },
            destination: { postalCode: '00-001', city: '', country: 'PL' },
            packages: [{ weight: 1 }],
            pickupPointCode,
          }
        );
        shippingCost = shippingRates[0]?.price || 0;
      }
    }

    // Get payment fee
    const paymentMethods = await paymentService.getAvailablePaymentMethods(userId);
    const selectedPayment = paymentMethods.find(m => m.type === paymentMethod || m.id === paymentMethod);
    const paymentFee = selectedPayment?.fee || 0;

    // Re-validate coupon and recalculate discount based on selected items subtotal
    let couponDiscount = 0;
    if (cart.couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: cart.couponCode },
      });
      if (coupon && coupon.isActive 
          && (!coupon.expiresAt || coupon.expiresAt > new Date())
          && (!coupon.maximumUses || coupon.usedCount < coupon.maximumUses)) {
        // Validate email restriction (e.g. DELIVERY_DELAY coupons)
        if (coupon.restrictedToEmail) {
          let checkoutEmail: string | null = null;
          if (userId) {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
            checkoutEmail = user?.email || null;
          } else {
            checkoutEmail = guestEmail || null;
          }
          if (!checkoutEmail || checkoutEmail.toLowerCase() !== coupon.restrictedToEmail.toLowerCase()) {
            console.log(`[Checkout] Coupon ${cart.couponCode} restricted to ${coupon.restrictedToEmail}, but checkout email is ${checkoutEmail}. Ignoring.`);
          } else if (coupon.type === 'PERCENTAGE') {
            couponDiscount = Math.round(subtotal * Number(coupon.value) / 100 * 100) / 100;
          } else if (coupon.type === 'FIXED_AMOUNT') {
            couponDiscount = Math.min(Number(coupon.value), subtotal);
          }
        } else if (coupon.type === 'PERCENTAGE') {
          couponDiscount = Math.round(subtotal * Number(coupon.value) / 100 * 100) / 100;
        } else if (coupon.type === 'FIXED_AMOUNT') {
          couponDiscount = Math.min(Number(coupon.value), subtotal);
        }
        if (couponDiscount > 0) {
          console.log(`[Checkout] Coupon ${cart.couponCode} re-validated: ${coupon.type} ${coupon.value} -> discount ${couponDiscount} on subtotal ${subtotal}`);
        }
      } else {
        console.log(`[Checkout] Coupon ${cart.couponCode} is no longer valid, ignoring discount`);
      }
    }
    let loyaltyDiscount = 0;
    let loyaltyFreeShipping = false;

    if (userId) {
      const userLoyalty = await prisma.userLoyalty.findUnique({ where: { userId } });
      if (userLoyalty) {
        const permanentDiscountPercent = Number(userLoyalty.permanentDiscount || 0);
        if (permanentDiscountPercent > 0) {
          loyaltyDiscount = subtotal * (permanentDiscountPercent / 100);
        }
        // Check loyalty free shipping threshold
        if (userLoyalty.freeShippingThreshold === null && ['DIAMENTOWY', 'VIP'].includes(userLoyalty.level)) {
          loyaltyFreeShipping = true;
        } else if (userLoyalty.freeShippingThreshold !== null && subtotal >= Number(userLoyalty.freeShippingThreshold)) {
          loyaltyFreeShipping = true;
        }
      }
    }

    // Use the HIGHER of coupon vs loyalty discount (don't stack)
    const discount = Math.max(couponDiscount, loyaltyDiscount);
    if (loyaltyFreeShipping) {
      shippingCost = 0;
    }
    const total = subtotal + shippingCost + paymentFee - discount;

    console.log(`💰 Order total: subtotal=${subtotal} + shipping=${shippingCost} + fee=${paymentFee} - discount=${discount} (coupon=${couponDiscount}, loyalty=${loyaltyDiscount.toFixed(2)}) = ${total}`);

    // For guest checkout, create shipping address from guestAddress data
    let finalShippingAddressId = shippingAddressId;
    let finalBillingAddressId = billingAddressId;
    
    if (isGuestCheckout && guestAddress) {
      console.log('📍 Creating guest shipping address...');
      const guestShippingAddress = await addressesService.create({
        userId: undefined, // Guest address has no user
        firstName: guestAddress.firstName || guestFirstName,
        lastName: guestAddress.lastName || guestLastName,
        street: guestAddress.street,
        city: guestAddress.city,
        postalCode: guestAddress.postalCode,
        country: guestAddress.country || 'PL',
        phone: guestAddress.phone || guestPhone,
        type: 'SHIPPING',
        label: 'Guest Shipping',
      });
      finalShippingAddressId = guestShippingAddress.id;
      console.log('📍 Guest shipping address created:', guestShippingAddress.id);
      
      // Create billing address if provided and different
      if (guestAddress.differentBillingAddress && guestAddress.billingAddress) {
        const guestBillingAddress = await addressesService.create({
          userId: undefined,
          firstName: guestAddress.billingAddress.firstName || guestFirstName,
          lastName: guestAddress.billingAddress.lastName || guestLastName,
          companyName: guestAddress.billingAddress.companyName,
          nip: guestAddress.billingAddress.nip,
          street: guestAddress.billingAddress.street,
          city: guestAddress.billingAddress.city,
          postalCode: guestAddress.billingAddress.postalCode,
          country: guestAddress.billingAddress.country || 'PL',
          phone: guestAddress.billingAddress.phone || guestPhone,
          type: 'BILLING',
          label: 'Guest Billing',
        });
        finalBillingAddressId = guestBillingAddress.id;
        console.log('📍 Guest billing address created:', guestBillingAddress.id);
      }
    }
    
    // Extract billing NIP and company name for business order detection
    // This determines if order number will have FV00 suffix
    let billingNip: string | undefined;
    let billingCompanyName: string | undefined;
    
    if (isGuestCheckout && guestAddress?.billingAddress) {
      // Guest checkout with separate billing - use billing address NIP
      billingNip = guestAddress.billingAddress.nip || undefined;
      billingCompanyName = guestAddress.billingAddress.companyName || undefined;
    } else if (finalBillingAddressId && userId) {
      // Fetch NIP from existing billing address (only for logged-in users)
      const billingAddress = await addressesService.getById(finalBillingAddressId, userId);
      if (billingAddress) {
        billingNip = billingAddress.nip || undefined;
        billingCompanyName = billingAddress.companyName || undefined;
      }
    }
    
    if (billingNip) {
      console.log(`🏢 Business order detected - NIP: ${billingNip}, Company: ${billingCompanyName || 'N/A'}`);
    }

    // Enrich packageShipping with product items for order history display
    // If frontend already sent items (new flow), use them directly
    // Otherwise fallback to grouping by wholesaler (legacy flow)
    let enrichedPackageShipping = packageShipping;
    if (packageShipping && packageShipping.length > 0) {
      // Check if any package already has items from frontend
      const hasItemsFromFrontend = packageShipping.some((pkg: any) => pkg.items && pkg.items.length > 0);
      
      if (hasItemsFromFrontend) {
        // Frontend already sent items - use them directly, just ensure image URLs are present
        enrichedPackageShipping = packageShipping.map((pkg: any) => ({
          ...pkg,
          items: (pkg.items || []).map((item: any) => ({
            productId: item.productId || '',
            productName: item.productName || 'Unknown',
            variantId: item.variantId || '',
            quantity: item.quantity || 1,
            image: item.image || null,
          })),
        }));
        
        console.log('📦 Using items from frontend:', enrichedPackageShipping.map((p: any) => ({
          packageId: p.packageId,
          wholesaler: p.wholesaler,
          itemCount: p.items?.length || 0,
        })));
      } else {
        // Legacy fallback: Build a map of wholesaler -> cart items
        const itemsByWholesaler: Record<string, typeof cartItemsToCheckout> = {};
        for (const cartItem of cartItemsToCheckout) {
          const wholesaler = cartItem.variant?.product?.wholesaler || 'default';
          if (!itemsByWholesaler[wholesaler]) {
            itemsByWholesaler[wholesaler] = [];
          }
          itemsByWholesaler[wholesaler].push(cartItem);
        }

        // Match packages with items by wholesaler or packageId
        enrichedPackageShipping = packageShipping.map((pkg: any, index: number) => {
          // Try to match by wholesaler first
          let matchedItems = pkg.wholesaler ? itemsByWholesaler[pkg.wholesaler] : null;
          
          // If no match by wholesaler, try by index (fallback)
          if (!matchedItems) {
            const wholesalerKeys = Object.keys(itemsByWholesaler);
            if (index < wholesalerKeys.length) {
              matchedItems = itemsByWholesaler[wholesalerKeys[index]];
            }
          }

          const items = (matchedItems || []).map((item: any) => ({
            productId: item.variant?.product?.id || '',
            productName: item.variant?.product?.name || 'Unknown',
            variantId: item.variant?.id || '',
            variantName: item.variant?.name || 'Default',
            quantity: item.quantity,
            image: item.variant?.product?.images?.[0]?.url || null,
          }));

          return {
            ...pkg,
            items,
          };
        });

        console.log('📦 Enriched packageShipping with items (legacy):', enrichedPackageShipping.map((p: any) => ({
          packageId: p.packageId,
          wholesaler: p.wholesaler,
          itemCount: p.items?.length || 0,
        })));
      }
    }

    // Create order - include guest data if guest checkout
    const order = await ordersService.create({
      userId: userId || undefined,
      shippingAddressId: finalShippingAddressId,
      billingAddressId: finalBillingAddressId || finalShippingAddressId,
      shippingMethod,
      paymentMethod,
      items,
      customerNotes,
      paczkomatCode: pickupPointCode,
      paczkomatAddress: pickupPointAddress,
      packageShipping: enrichedPackageShipping,
      // Server-calculated shipping cost (authoritative)
      shippingCost,
      // Discount/coupon from re-validated checkout calculation
      couponCode: couponDiscount > 0 ? (cart.couponCode || undefined) : undefined,
      discount,
      // Invoice preference
      wantInvoice: wantInvoice || false,
      // Business order fields (for FV00 suffix)
      billingNip,
      billingCompanyName,
      // Guest checkout fields — always save the email entered in the form
      // Even for logged-in users, they may enter a different contact email
      guestEmail: guestEmail || undefined,
      guestFirstName: isGuestCheckout ? guestFirstName : undefined,
      guestLastName: isGuestCheckout ? guestLastName : undefined,
      guestPhone: isGuestCheckout ? guestPhone : undefined,
    });

    // Clear only ordered items from cart (if partial checkout)
    // If all items were selected, clear entire cart
    if (selectedItemIds && Array.isArray(selectedItemIds) && selectedItemIds.length > 0 && cartItemsToCheckout.length < cart.items.length) {
      // Remove only selected items - leave others in cart
      for (const item of cartItemsToCheckout) {
        await cartService.removeItem(cart.id, item.id);
      }
      console.log(`🛒 Removed ${cartItemsToCheckout.length} ordered items from cart, ${cart.items.length - cartItemsToCheckout.length} items remaining`);
    } else {
      // Clear entire cart
      await cartService.clearCart(cart.id);
    }

    // Handle payment
    if (paymentMethod === 'cod') {
      // Cash on delivery - no payment redirect needed
      await paymentService.createCODPayment(order.id, total);
      
      // Mark coupon as used for COD orders (online payments do this in payment webhook)
      if (cart.couponCode) {
        try {
          const coupon = await prisma.coupon.update({
            where: { code: cart.couponCode },
            data: { usedCount: { increment: 1 } },
          });
          console.log(`[Checkout] Coupon ${cart.couponCode} marked as used for COD order ${order.orderNumber}`);
          
          // Record coupon usage per user (for single use per user coupons)
          if (userId && coupon.singleUsePerUser) {
            await prisma.couponUsage.create({
              data: {
                couponId: coupon.id,
                userId: userId,
                orderId: order.id,
              },
            }).catch(err => {
              console.error(`[Checkout] Failed to record coupon usage:`, err);
            });
          }
        } catch (err) {
          console.error(`[Checkout] Failed to mark coupon ${cart.couponCode} as used:`, err);
        }
      }
      
      // Send order confirmation email for COD orders
      // Fetch full order data for email
      const orderForEmail = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          user: { select: { email: true, firstName: true } },
          shippingAddress: true,
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
      
      if (orderForEmail) {
        const customerEmail = orderForEmail.guestEmail || orderForEmail.user?.email;
        const customerName = orderForEmail.guestFirstName || orderForEmail.user?.firstName || 'Kliencie';
        
        if (customerEmail && orderForEmail.shippingAddress) {
          emailService.sendOrderConfirmationEmail(
            customerEmail,
            customerName,
            orderForEmail.orderNumber,
            orderForEmail.id,
            Number(orderForEmail.total),
            orderForEmail.items.map(item => ({
              name: item.productName,
              variant: item.variantName,
              quantity: item.quantity,
              price: Number(item.unitPrice),
              total: Number(item.total),
              imageUrl: item.variant?.product?.images?.[0]?.url || null,
            })),
            {
              firstName: orderForEmail.shippingAddress.firstName,
              lastName: orderForEmail.shippingAddress.lastName,
              street: orderForEmail.shippingAddress.street,
              city: orderForEmail.shippingAddress.city,
              postalCode: orderForEmail.shippingAddress.postalCode,
              phone: orderForEmail.shippingAddress.phone || undefined,
            },
            orderForEmail.shippingMethod || 'unknown',
            'cod',
            false // isPaid - COD is not paid yet
          ).then((emailResult) => {
            if (emailResult.success) {
              console.log(`[Checkout] Order confirmation email sent for COD order ${orderForEmail.orderNumber}`);
            } else {
              console.error(`[Checkout] Failed to send confirmation email: ${emailResult.error}`);
            }
          }).catch((err) => {
            console.error(`[Checkout] Error sending confirmation email:`, err);
          });
        }
      }
      
      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'created',
        paymentMethod: 'cod',
        total,
        redirectUrl: `/order/${order.id}/confirmation`,
      });
    } else if (paymentMethod === 'b2b_transfer') {
      // B2B bank transfer - validate that user is actually B2B
      if (!userId) {
        res.status(403).json({ message: 'Przelew B2B dostępny tylko dla zalogowanych użytkowników' });
        return;
      }
      const b2bCheckInfo = await getB2bUserInfo(userId);
      if (!b2bCheckInfo) {
        res.status(403).json({ message: 'Przelew B2B dostępny tylko dla zatwierdzonych partnerów B2B' });
        return;
      }

      // Mark order payment as pending bank transfer (no payment gateway)
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PENDING',
          internalNotes: 'Oczekuje na przelew bankowy B2B (termin 7 dni)',
        },
      });

      // Mark coupon as used (same as COD)
      if (cart.couponCode) {
        try {
          await prisma.coupon.update({
            where: { code: cart.couponCode },
            data: { usedCount: { increment: 1 } },
          });
          console.log(`[Checkout] Coupon ${cart.couponCode} marked as used for B2B transfer order ${order.orderNumber}`);
        } catch (err) {
          console.error(`[Checkout] Failed to mark coupon ${cart.couponCode} as used:`, err);
        }
      }

      // Send order confirmation email
      const orderForEmail = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          user: { select: { email: true, firstName: true } },
          shippingAddress: true,
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

      if (orderForEmail) {
        const customerEmail = orderForEmail.user?.email;
        const customerName = orderForEmail.user?.firstName || 'Partnerze';

        if (customerEmail && orderForEmail.shippingAddress) {
          emailService.sendOrderConfirmationEmail(
            customerEmail,
            customerName,
            orderForEmail.orderNumber,
            orderForEmail.id,
            Number(orderForEmail.total),
            orderForEmail.items.map(item => ({
              name: item.productName,
              variant: item.variantName,
              quantity: item.quantity,
              price: Number(item.unitPrice),
              total: Number(item.total),
              imageUrl: item.variant?.product?.images?.[0]?.url || null,
            })),
            {
              firstName: orderForEmail.shippingAddress.firstName,
              lastName: orderForEmail.shippingAddress.lastName,
              street: orderForEmail.shippingAddress.street,
              city: orderForEmail.shippingAddress.city,
              postalCode: orderForEmail.shippingAddress.postalCode,
              phone: orderForEmail.shippingAddress.phone || undefined,
            },
            orderForEmail.shippingMethod || 'b2b_wysylka_wlasna',
            'b2b_transfer',
            false // isPaid - B2B transfer is not paid yet
          ).catch((err) => {
            console.error(`[Checkout] Error sending B2B order confirmation email:`, err);
          });
        }
      }

      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'created',
        paymentMethod: 'b2b_transfer',
        total,
        redirectUrl: `/order/${order.id}/confirmation`,
      });
    } else {
      // Create payment session with PayU
      // Get first URL from FRONTEND_URL (may be comma-separated)
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();

      // Map frontend payment method to API payment method type
      const mappedPaymentMethod = mapPaymentMethod(paymentMethod);
      const resolvedProviderId = resolveProviderId(paymentMethod);
      console.log(`💳 Payment method mapping: ${paymentMethod} → ${mappedPaymentMethod} (provider: ${resolvedProviderId})`);
      
      // Get customer email - prefer form-entered email over account email
      const customerEmail = guestEmail || req.user?.email || '';
      
      // For logged in users, fetch firstName/lastName from database
      let customerFirstName = guestFirstName || '';
      let customerLastName = guestLastName || '';
      
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true }
        });
        if (user) {
          customerFirstName = user.firstName || '';
          customerLastName = user.lastName || '';
        }
      }
      
      // Determine webhook URL based on provider
      const webhookUrls: Record<string, string> = {
        'payu': `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/payu`,
        'imoje': `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/imoje`,
      };
      
      const paymentRequest: CreatePaymentRequest = {
        orderId: order.id,
        amount: total,
        currency: 'PLN',
        paymentMethod: mappedPaymentMethod,
        providerId: resolvedProviderId,
        customer: {
          email: customerEmail,
          firstName: customerFirstName,
          lastName: customerLastName,
        },
        description: `Zamówienie ${order.orderNumber}`,
        // Always use HTTPS URLs - payment gateways reject non-HTTP schemes
        // Mobile WebView intercepts the redirect before it completes
        returnUrl: `${frontendUrl}/order/${order.id}/confirmation`,
        cancelUrl: `${frontendUrl}/checkout?orderId=${order.id}&cancelled=true`,
        notifyUrl: webhookUrls[resolvedProviderId] || webhookUrls['payu'],
        metadata: {
          customerIp: req.ip || req.socket.remoteAddress || '127.0.0.1',
        },
      };

      console.log('Creating PayU payment request:', paymentRequest);

      const paymentSession = await paymentService.createPayment(paymentRequest);

      console.log('PayU payment session created:', paymentSession);

      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'pending_payment',
        paymentUrl: paymentSession.paymentUrl,
        sessionId: paymentSession.sessionId,
        total,
      });
    }
  } catch (error) {
    console.error('❌ Error creating checkout:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      message: errMsg || 'Failed to create order',
    });
  }
}

/**
 * Verify payment status after redirect
 */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    const result = await paymentService.verifyPayment(sessionId);

    res.json({
      status: result.status,
      orderId: result.orderId,
      transactionId: result.transactionId,
      paidAt: result.paidAt,
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Failed to verify payment' });
  }
}

/**
 * Handle payment webhook
 */
export async function paymentWebhook(req: Request, res: Response): Promise<void> {
  try {
    const providerId = req.params.provider as PaymentProviderId || 'payu';
    const signature = req.headers['x-signature'] as string || '';
    
    // Use raw body if available (for correct signature verification)
    const payload = (req as any).rawBody || JSON.stringify(req.body);

    const result = await paymentService.processWebhook(providerId, payload, signature);

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing payment webhook:', error);
    res.status(400).json({ message: 'Webhook processing failed' });
  }
}

/**
 * Handle PayU payment webhook
 * PayU sends signature in OpenPayU-Signature header
 */
export async function payuWebhook(req: Request, res: Response): Promise<void> {
  try {
    // PayU signature format: signature=<md5>;algorithm=MD5;sender=checkout
    const signature = req.headers['openpayu-signature'] as string || '';
    
    // Use raw body if available (for correct signature verification)
    // Fall back to JSON.stringify for backwards compatibility
    const payload = (req as any).rawBody || JSON.stringify(req.body);

    console.log('PayU webhook received:', {
      signature,
      hasRawBody: !!(req as any).rawBody,
      body: req.body,
    });

    const result = await paymentService.processWebhook('payu', payload, signature);

    console.log('PayU webhook processed:', result);

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing PayU webhook:', error);
    res.status(400).json({ message: 'Webhook processing failed' });
  }
}

/**
 * Handle imoje payment webhook
 * imoje sends signature in X-Imoje-Signature header
 */
export async function imojeWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-imoje-signature'] as string || '';
    
    // Use raw body if available (for correct signature verification)
    const payload = (req as any).rawBody || JSON.stringify(req.body);

    console.log('imoje webhook received:', {
      signature: signature ? signature.substring(0, 32) + '...' : 'none',
      hasRawBody: !!(req as any).rawBody,
      body: req.body,
    });

    const result = await paymentService.processWebhook('imoje', payload, signature);

    console.log('imoje webhook processed:', result);

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing imoje webhook:', error);
    res.status(400).json({ message: 'Webhook processing failed' });
  }
}

/**
 * Handle shipping webhook
 */
export async function shippingWebhook(req: Request, res: Response): Promise<void> {
  try {
    const providerId = req.params.provider as ShippingProviderId;
    const signature = req.headers['x-signature'] as string || '';
    
    // Use raw body if available (for correct signature verification)
    const payload = (req as any).rawBody || JSON.stringify(req.body);

    await shippingService.processWebhook(providerId, payload, signature);

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing shipping webhook:', error);
    res.status(400).json({ message: 'Webhook processing failed' });
  }
}

/**
 * Retry payment for an existing unpaid order
 * Creates a new PayU payment session and returns the redirect URL
 * Supports both authenticated users and guest orders
 */
export async function retryPayment(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const userId = (req as any).user?.id;
    const userEmail = (req as any).user?.email;

    console.log('🔄 Retry payment request for order:', orderId, 'userId:', userId, 'userEmail:', userEmail);

    // Get order
    const order = await ordersService.getById(orderId);
    if (!order) {
      console.log('❌ Order not found:', orderId);
      res.status(404).json({ message: 'Zam�wienie nie zostalo znalezione' });
      return;
    }

    console.log('📦 Order found:', order.orderNumber, 'userId:', order.userId, 'guestEmail:', order.guestEmail);

    // For security, verify access:
    // - If user is logged in, they should own this order OR email should match
    // - If not logged in (guest), allow access - they have the order ID from confirmation/email
    // In future, could add time-based token for extra security
    
    if (userId && order.userId && order.userId !== userId) {
      // Logged in user trying to pay for someone else's order
      console.log('❌ Access denied: userId mismatch', userId, 'vs', order.userId);
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    // Check if order is still unpaid
    if (order.paymentStatus === 'PAID') {
      res.status(400).json({ message: 'Zam�wienie zostalo juz oplacone' });
      return;
    }

    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      res.status(400).json({ message: 'Cannot pay for cancelled or refunded order' });
      return;
    }

    // Create new payment session
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();

    // Get customer email from order
    const customerEmail = order.guestEmail || userEmail || (req as any).user?.email || '';
    
    // Determine provider from order's existing payment method or request body
    const requestedProvider = req.body.paymentProvider || order.paymentMethod || 'payu';
    const resolvedProvider = resolveProviderId(requestedProvider);
    
    // Determine webhook URL based on provider
    const webhookUrls: Record<string, string> = {
      'payu': `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/payu`,
      'imoje': `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/imoje`,
    };
    
    const paymentRequest: CreatePaymentRequest = {
      orderId: order.id,
      amount: Number(order.total),
      currency: 'PLN',
      paymentMethod: 'blik', // Default to BLIK, gateway allows user to choose
      providerId: resolvedProvider,
      customer: {
        email: customerEmail,
        firstName: order.guestFirstName || '',
        lastName: order.guestLastName || '',
      },
      description: `Zamówienie ${order.orderNumber}`,
      // Always use HTTPS URLs - payment gateways reject non-HTTP schemes
      // Mobile WebView intercepts the redirect before it completes
      returnUrl: `${frontendUrl}/order/${order.id}/confirmation`,
      cancelUrl: `${frontendUrl}/order/${order.id}/payment?retry=true`,
      notifyUrl: webhookUrls[resolvedProvider] || webhookUrls['payu'],
      metadata: {
        customerIp: req.ip || req.socket.remoteAddress || '127.0.0.1',
      },
    };

    console.log('🔄 Creating retry payment for order:', order.orderNumber, 'email:', customerEmail);
    const paymentSession = await paymentService.createPayment(paymentRequest);
    console.log('✅ PayU payment session created for retry:', paymentSession.sessionId);

    res.json({
      success: true,
      paymentUrl: paymentSession.paymentUrl,
      sessionId: paymentSession.sessionId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error('❌ Error creating retry payment:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      message: errMsg || 'Failed to create payment session',
    });
  }
}

/**
 * Get tracking info for an order
 */
export async function getOrderTracking(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const userId = (req as any).user?.id;

    // Get order and verify ownership
    const order = await ordersService.getById(orderId);
    if (!order) {
      res.status(404).json({ message: 'Zam�wienie nie zostalo znalezione' });
      return;
    }

    if (order.userId !== userId) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    if (!order.trackingNumber) {
      res.status(404).json({ message: 'No tracking information available' });
      return;
    }

    // Determine provider from shipping method
    const providerId = order.shippingMethod.includes('inpost') 
      ? (order.shippingMethod as ShippingProviderId)
      : 'inpost_kurier';

    const tracking = await shippingService.getTracking(providerId, order.trackingNumber);

    res.json({
      trackingNumber: tracking.trackingNumber,
      status: tracking.status,
      estimatedDelivery: tracking.estimatedDelivery,
      events: tracking.events,
    });
  } catch (error) {
    console.error('Error getting tracking:', error);
    res.status(500).json({ message: 'Failed to get tracking info' });
  }
}
