'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { checkoutApi, addressesApi, ApiClientError, CartItem } from '@/lib/api';
import { roundMoney } from '@/lib/currency';
import CheckoutSteps from './components/CheckoutSteps';
import CheckoutAuthChoice from './components/CheckoutAuthChoice';
import AddressForm from './components/AddressForm';
import ShippingPerPackage from './components/ShippingPerPackage';
import PaymentMethod from './components/PaymentMethod';
import OrderSummary from './components/OrderSummary';
import CheckoutPackagesList from './components/CheckoutPackagesList';
import CouponInput from './components/CouponInput';
import { trackBeginCheckout, trackAddPaymentInfo, trackAddShippingInfo, cartItemToGA4 } from '@/lib/analytics';

export interface AddressData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  apartment: string;
  postalCode: string;
  city: string;
  differentBillingAddress: boolean;
  billingFirstName?: string;
  billingLastName?: string;
  billingCompanyName?: string;
  billingNip?: string;
  billingStreet?: string;
  billingApartment?: string;
  billingPostalCode?: string;
  billingCity?: string;
  billingPhone?: string;
}

export interface ShippingData {
  method: 'inpost_paczkomat' | 'inpost_kurier' | 'dpd_kurier' | 'wysylka_gabaryt' | 'odbior_osobisty_outlet' | 'b2b_wysylka_wlasna';
  paczkomatCode?: string;
  paczkomatAddress?: string;
  price: number;
  // Per-package shipping selections
  packageShipping?: PackageShippingSelection[];
}

export interface PackageShippingSelection {
  packageId: string;
  wholesaler?: string;
  method: 'inpost_paczkomat' | 'inpost_kurier' | 'dpd_kurier' | 'wysylka_gabaryt' | 'odbior_osobisty_outlet' | 'b2b_wysylka_wlasna';
  price: number;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  // Items in this package (for order history display)
  items?: Array<{
    productId: string;
    productName: string;
    variantId: string;
    quantity: number;
    image?: string;
  }>;
  // Custom delivery address for this package (if different from main address)
  useCustomAddress?: boolean;
  customAddress?: {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    apartment: string;
    postalCode: string;
    city: string;
  };
}

export interface PaymentData {
  method: 'payu' | 'imoje' | 'card' | 'blik' | 'transfer' | 'google_pay' | 'apple_pay' | 'paypo' | 'b2b_przelew';
  extraFee: number;
}

export interface CheckoutData {
  address: AddressData;
  shipping: ShippingData;
  payment: PaymentData;
  acceptTerms: boolean;
  acceptDataProcessing: boolean;
  acceptNewsletter: boolean;
  wantInvoice: boolean;
}

const initialAddress: AddressData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  street: '',
  apartment: '',
  postalCode: '',
  city: '',
  differentBillingAddress: false,
};

const initialShipping: ShippingData = {
  method: 'inpost_kurier',
  price: 14.99,
  packageShipping: [],
};

const initialPayment: PaymentData = {
  method: 'payu',
  extraFee: 0,
};

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cart, itemCount, loading: cartLoading, removeFromCart, updateQuantity, applyCoupon, removeCoupon } = useCart();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Filtered items based on selection from cart page (Empik-style)
  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([]);
  const beginCheckoutTracked = useRef(false);
  
  // Filter cart items based on localStorage selection
  useEffect(() => {
    if (!cart?.items) {
      setCheckoutItems([]);
      return;
    }
    
    const savedSelectedItems = localStorage.getItem('checkoutSelectedItems');
    if (savedSelectedItems) {
      try {
        const selectedIds: string[] = JSON.parse(savedSelectedItems);
        const selectedSet = new Set(selectedIds);
        const filteredItems = cart.items.filter(item => selectedSet.has(item.id));
        // If no items match (e.g., stale localStorage), use all items
        setCheckoutItems(filteredItems.length > 0 ? filteredItems : cart.items);
      } catch {
        setCheckoutItems(cart.items);
      }
    } else {
      // No selection saved - use all items
      setCheckoutItems(cart.items);
    }
  }, [cart?.items]);

  // Track begin_checkout event (only once)
  useEffect(() => {
    if (checkoutItems.length > 0 && !beginCheckoutTracked.current) {
      beginCheckoutTracked.current = true;
      
      const items = checkoutItems.map((item, index) => cartItemToGA4(item, index));

      const totalValue = checkoutItems.reduce((sum, item) => sum + ((item.variant?.price || 0) * item.quantity), 0);
      trackBeginCheckout(items, totalValue, cart?.couponCode || undefined);
    }
  }, [checkoutItems, cart?.couponCode]);
  
  // Step 0 = auth choice, Step 1-4 = checkout steps
  const [currentStep, setCurrentStep] = useState(0);
  const [isGuestCheckout, setIsGuestCheckout] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<CheckoutData>({
    address: initialAddress,
    shipping: initialShipping,
    payment: initialPayment,
    acceptTerms: false,
    acceptDataProcessing: false,
    acceptNewsletter: false,
    wantInvoice: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [paymentCancelledMessage, setPaymentCancelledMessage] = useState<string | null>(null);

  // If user is authenticated, skip to step 1
  useEffect(() => {
    if (isAuthenticated && currentStep === 0) {
      setCurrentStep(1);
    }
  }, [isAuthenticated, currentStep]);

  // Auto-enable invoice for B2B partners
  useEffect(() => {
    if (user && (user as any).b2bStatus === 'APPROVED') {
      setCheckoutData(prev => ({ ...prev, wantInvoice: true }));
    }
  }, [user]);

  // Check if payment was cancelled (redirected back from PayU)
  useEffect(() => {
    const cancelled = searchParams.get('cancelled');
    const orderId = searchParams.get('orderId');
    
    if (cancelled === 'true') {
      setPaymentCancelledMessage(
        orderId 
          ? `Płatność dla zamówienia została anulowana. Możesz spróbować ponownie lub wybrać inną metodę płatności.`
          : 'Płatność została anulowana. Możesz spróbować ponownie lub wybrać inną metodę płatności.'
      );
      // Skip to summary step if coming back from cancelled payment
      setCurrentStep(3);
      
      // Clean URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('cancelled');
      url.searchParams.delete('orderId');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [searchParams]);

  // Fetch shipping prices from API as soon as cart is loaded
  useEffect(() => {
    async function fetchShippingPrices() {
      if (cartLoading || checkoutItems.length === 0) return;
      
      try {
        const items = checkoutItems.map(item => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        }));

        const cartSubtotal = checkoutItems.reduce((sum, item) => sum + (item.variant.price * item.quantity), 0);
        
        // Use per-package shipping to get accurate initial prices
        const response = await checkoutApi.getShippingPerPackage(items, cartSubtotal);
        
        // Use the total shipping cost from API (calculated correctly based on package weights)
        const totalShipping = response.totalShippingCost || 0;
        
        setCheckoutData(prev => ({
          ...prev,
          shipping: {
            ...prev.shipping,
            price: totalShipping,
          }
        }));
      } catch {
        // Silently ignore errors - prices will be calculated on step 2
      }
    }
    
    fetchShippingPrices();
  }, [cartLoading, checkoutItems]);

  // Pre-fill address if user is logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      setCheckoutData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
        }
      }));
    }
  }, [isAuthenticated, user]);

  // Show message if cart is empty or no items selected
  const displayCart = cart;
  const isCartEmpty = !cartLoading && (itemCount === 0 || checkoutItems.length === 0);

  // Calculate checkout item count (only selected items)
  const checkoutItemCount = checkoutItems.reduce((sum, item) => sum + item.quantity, 0);

  // Guest checkout handlers
  const handleGuestCheckout = () => {
    setIsGuestCheckout(true);
    setCurrentStep(1);
    window.scrollTo(0, 0);
  };

  const handleLoginClick = () => {
    // Redirect to login page with return URL
    router.push('/login?redirect=/checkout');
  };

  const handleAddressSubmit = (address: AddressData) => {
    setCheckoutData(prev => ({ ...prev, address }));
    setCurrentStep(2);
    window.scrollTo(0, 0);
  };

  const isB2bUser = user && (user as any).b2bStatus === 'APPROVED';

  const handleShippingSubmit = (shipping: ShippingData) => {
    setCheckoutData(prev => ({ ...prev, shipping }));

    // Track add_shipping_info
    const items = checkoutItems.map((item, index) => cartItemToGA4(item, index));
    const totalValue = checkoutItems.reduce((sum, item) => sum + ((item.variant?.price || 0) * item.quantity), 0);
    trackAddShippingInfo(items, totalValue, shipping.method);

    if (isB2bUser) {
      // B2B: show payment method choice (step 3)
      setCurrentStep(3);
    } else {
      // Non-B2B: auto-set PayU and go to summary (step 3 for non-B2B = summary)
      const payment: PaymentData = { method: 'payu', extraFee: 0 };
      setCheckoutData(prev => ({ ...prev, payment }));
      trackAddPaymentInfo(items, totalValue, payment.method);
      setCurrentStep(3);
    }
    window.scrollTo(0, 0);
  };

  const handlePaymentSubmit = (payment: PaymentData) => {
    setCheckoutData(prev => ({ ...prev, payment }));

    const items = checkoutItems.map((item, index) => cartItemToGA4(item, index));
    const totalValue = checkoutItems.reduce((sum, item) => sum + ((item.variant?.price || 0) * item.quantity), 0);
    trackAddPaymentInfo(items, totalValue, payment.method);

    setCurrentStep(4);
    window.scrollTo(0, 0);
  };

  const handleShippingPriceChange = (totalPrice: number) => {
    setCheckoutData(prev => ({
      ...prev,
      shipping: {
        ...prev.shipping,
        price: totalPrice,
      }
    }));
  };



  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
    window.scrollTo(0, 0);
  };

  const handleRemoveItem = async (itemId: string) => {
    setRemovingItemId(itemId);
    try {
      await removeFromCart(itemId);
    } catch (err) {
      console.error('Failed to remove item:', err);
    } finally {
      setRemovingItemId(null);
    }
  };

  const handleEditStep = (step: number) => {
    setCurrentStep(step);
    window.scrollTo(0, 0);
  };

  const calculateTotal = () => {
    const subtotal = roundMoney(checkoutItems.reduce((sum: number, item: any) => {
      const price = item.variant?.price || 0;
      return sum + price * item.quantity;
    }, 0));
    
    const shipping = roundMoney(checkoutData.shipping.price);
    const paymentFee = roundMoney(checkoutData.payment.extraFee);
    const discount = roundMoney(cart?.discount || 0);
    
    return {
      subtotal,
      shipping,
      paymentFee,
      discount,
      total: roundMoney(subtotal + shipping + paymentFee - discount),
    };
  };

  const handlePlaceOrder = async () => {
    if (!checkoutData.acceptTerms) {
      setError('Musisz zaakceptować regulamin i politykę prywatności');
      return;
    }
    if (!checkoutData.acceptDataProcessing) {
      setError('Musisz wyrazić zgodę na przetwarzanie danych osobowych');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let shippingAddressId: string | undefined;
      let billingAddressId: string | undefined;

      // For guest checkout, we don't create address via API - we send data directly
      if (isGuestCheckout) {
        // Guest checkout - send address data directly in createCheckout
        const checkoutResponse = await checkoutApi.createCheckout({
          shippingMethod: checkoutData.shipping.method,
          pickupPointCode: checkoutData.shipping.paczkomatCode,
          pickupPointAddress: checkoutData.shipping.paczkomatAddress,
          paymentMethod: checkoutData.payment.method,
          customerNotes: '',
          acceptTerms: checkoutData.acceptTerms,
          wantInvoice: checkoutData.wantInvoice,
          // Only include selected items (Empik-style selection)
          selectedItemIds: checkoutItems.map(item => item.id),
          packageShipping: checkoutData.shipping.packageShipping?.map(pkg => ({
            packageId: pkg.packageId,
            method: pkg.method,
            price: pkg.price,
            paczkomatCode: pkg.paczkomatCode,
            paczkomatAddress: pkg.paczkomatAddress,
            useCustomAddress: pkg.useCustomAddress,
            customAddress: pkg.customAddress,
          })),
          // Guest checkout fields
          guestEmail: checkoutData.address.email,
          guestFirstName: checkoutData.address.firstName,
          guestLastName: checkoutData.address.lastName,
          guestPhone: checkoutData.address.phone,
          // Guest address data
          guestAddress: {
            firstName: checkoutData.address.firstName,
            lastName: checkoutData.address.lastName,
            street: checkoutData.address.street + (checkoutData.address.apartment ? ` ${checkoutData.address.apartment}` : ''),
            city: checkoutData.address.city,
            postalCode: checkoutData.address.postalCode,
            country: 'PL',
            phone: checkoutData.address.phone,
            differentBillingAddress: checkoutData.address.differentBillingAddress,
            billingAddress: checkoutData.address.differentBillingAddress ? {
              firstName: checkoutData.address.firstName,
              lastName: checkoutData.address.lastName,
              companyName: checkoutData.address.billingCompanyName,
              nip: checkoutData.address.billingNip,
              street: (checkoutData.address.billingStreet || '') + (checkoutData.address.billingApartment ? ` ${checkoutData.address.billingApartment}` : ''),
              city: checkoutData.address.billingCity || '',
              postalCode: checkoutData.address.billingPostalCode || '',
              country: 'PL',
              phone: checkoutData.address.phone,
            } : undefined,
          },
        });

        // Clear localStorage selected items after successful order
        localStorage.removeItem('checkoutSelectedItems');

        // Store one-time guest access token + email in sessionStorage
        // This allows viewing the confirmation page exactly once in this tab
        sessionStorage.setItem(`guestOrder_${checkoutResponse.orderId}`, 'true');
        sessionStorage.setItem(`guestOrderEmail_${checkoutResponse.orderId}`, checkoutData.address.email);

        // If payment URL is provided, redirect to payment gateway
        if (checkoutResponse.paymentUrl) {
          window.location.href = checkoutResponse.paymentUrl;
          return;
        }

        // Otherwise redirect to order confirmation
        router.push(`/order/${checkoutResponse.orderId}/confirmation`);
        return;
      }

      // Logged in user flow - create addresses via API
      const addressData = {
        firstName: checkoutData.address.firstName,
        lastName: checkoutData.address.lastName,
        street: checkoutData.address.street + (checkoutData.address.apartment ? ` ${checkoutData.address.apartment}` : ''),
        city: checkoutData.address.city,
        postalCode: checkoutData.address.postalCode,
        country: 'PL',
        phone: checkoutData.address.phone,
        isDefault: false,
        label: 'Zamówienie',
        type: 'SHIPPING' as const,
      };

      // Create shipping address
      const shippingAddress = await addressesApi.create(addressData);
      shippingAddressId = shippingAddress.id;

      // Create billing address if different from shipping
      if (checkoutData.address.differentBillingAddress) {
        const billingData = {
          firstName: checkoutData.address.billingFirstName || checkoutData.address.firstName,
          lastName: checkoutData.address.billingLastName || checkoutData.address.lastName,
          companyName: checkoutData.address.billingCompanyName || undefined,
          nip: checkoutData.address.billingNip || undefined,
          street: checkoutData.address.billingStreet + (checkoutData.address.billingApartment ? ` ${checkoutData.address.billingApartment}` : ''),
          city: checkoutData.address.billingCity || '',
          postalCode: checkoutData.address.billingPostalCode || '',
          country: 'PL',
          phone: checkoutData.address.billingPhone || checkoutData.address.phone,
          isDefault: false,
          label: 'Faktura',
          type: 'BILLING' as const,
        };
        const billingAddress = await addressesApi.create(billingData);
        billingAddressId = billingAddress.id;
      }

      // Create checkout/order
      const checkoutResponse = await checkoutApi.createCheckout({
        shippingAddressId,
        billingAddressId,
        shippingMethod: checkoutData.shipping.method,
        pickupPointCode: checkoutData.shipping.paczkomatCode,
        pickupPointAddress: checkoutData.shipping.paczkomatAddress,
        paymentMethod: checkoutData.payment.method,
        customerNotes: '',
        acceptTerms: checkoutData.acceptTerms,
        wantInvoice: checkoutData.wantInvoice,
        // Only include selected items (Empik-style selection)
        selectedItemIds: checkoutItems.map(item => item.id),
        packageShipping: checkoutData.shipping.packageShipping?.map(pkg => ({
          packageId: pkg.packageId,
          wholesaler: pkg.wholesaler,
          method: pkg.method,
          price: pkg.price,
          paczkomatCode: pkg.paczkomatCode,
          paczkomatAddress: pkg.paczkomatAddress,
          items: pkg.items,
          useCustomAddress: pkg.useCustomAddress,
          customAddress: pkg.customAddress,
        })),
      });

      // Clear localStorage selected items after successful order
      localStorage.removeItem('checkoutSelectedItems');

      // If payment URL is provided, redirect to payment gateway
      if (checkoutResponse.paymentUrl) {
        window.location.href = checkoutResponse.paymentUrl;
        return;
      }

      // Otherwise redirect to order confirmation
      router.push(`/order/${checkoutResponse.orderId}/confirmation`);
    } catch (err) {
      console.error('Checkout error:', err);
      if (err instanceof Error) {
        console.error('Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
      }
      // Better error message with validation details
      if (err instanceof ApiClientError) {
        let errorMsg = err.message || 'Błąd API: ' + err.statusCode;
        // If there are validation errors, show them
        if (err.errors) {
          const validationErrors = Object.entries(err.errors)
            .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join('; ');
          if (validationErrors) {
            errorMsg = `${errorMsg} - ${validationErrors}`;
          }
        }
        setError(errorMsg);
      } else {
        setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas składania zamówienia');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth or cart
  if (cartLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (isCartEmpty) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
        <header className="bg-white dark:bg-secondary-800 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link href="/">
              <Image 
                src="/images/WB-TRADE.svg" 
                alt="WB Trade Group" 
                width={140} 
                height={50} 
                className="h-10 w-auto object-contain"
              />
            </Link>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Twój koszyk jest pusty</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">Dodaj produkty do koszyka, aby kontynuować zamówienie.</p>
          <Link
            href="/products"
            className="inline-flex items-center px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
          >
            Przeglądaj produkty
          </Link>
        </main>
      </div>
    );
  }

  // For non-authenticated users, we show auth choice at step 0
  // This block is no longer needed - we handle it in the main render with CheckoutAuthChoice

  const totals = calculateTotal();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
      {/* Header */}
      <header className="bg-white dark:bg-secondary-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center shrink-0">
              <Image 
                src="/images/WB-TRADE-logo.webp" 
                alt="WB Trade" 
                width={280} 
                height={160} 
                className="h-14 sm:h-18 lg:h-20 w-auto object-contain dark:hidden"
                priority
              />
              <Image 
                src="/images/wb-trade-bez-tla.webp" 
                alt="WB Trade" 
                width={280} 
                height={160} 
                className="h-14 sm:h-18 lg:h-20 w-auto object-contain hidden dark:block"
                priority
              />
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
                Bezpieczne zakupy 🔒
              </span>
              <Link href="/cart" className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-orange-500">
                ← <span className="hidden sm:inline">Wróć do </span>Koszyk<span className="hidden sm:inline">a</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Steps indicator */}
        <CheckoutSteps currentStep={currentStep} />

        <div className="mt-4 sm:mt-6 lg:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Main form area */}
          <div className="lg:col-span-2">
            {/* Payment cancelled message */}
            {paymentCancelledMessage && (
              <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium">Płatność anulowana</p>
                  <p className="text-sm mt-1">{paymentCancelledMessage}</p>
                </div>
                <button 
                  onClick={() => setPaymentCancelledMessage(null)}
                  className="ml-auto text-amber-600 hover:text-amber-800"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
            
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Step 0: Auth choice for non-authenticated users */}
            {currentStep === 0 && !isAuthenticated && (
              <CheckoutAuthChoice
                onGuestCheckout={handleGuestCheckout}
                onLoginClick={handleLoginClick}
              />
            )}

            {currentStep === 1 && (
              <AddressForm
                initialData={checkoutData.address}
                onSubmit={handleAddressSubmit}
                isGuestCheckout={isGuestCheckout}
              />
            )}

            {currentStep === 2 && (
              <ShippingPerPackage
                initialData={checkoutData.shipping}
                onSubmit={handleShippingSubmit}
                onBack={handleBack}
                onPriceChange={handleShippingPriceChange}
                cartItems={checkoutItems}
              />
            )}

            {currentStep === 3 && isB2bUser && (
              <PaymentMethod
                initialData={checkoutData.payment}
                onSubmit={handlePaymentSubmit}
                onBack={handleBack}
                isB2b={true}
              />
            )}

            {((currentStep === 3 && !isB2bUser) || currentStep === 4) && (
              <OrderSummary
                checkoutData={checkoutData}
                cart={displayCart}
                totals={totals}
                onEditStep={handleEditStep}
                onTermsChange={(acceptTerms) => 
                  setCheckoutData(prev => ({ ...prev, acceptTerms }))
                }
                onDataProcessingChange={(acceptDataProcessing) =>
                  setCheckoutData(prev => ({ ...prev, acceptDataProcessing }))
                }
                onNewsletterChange={(acceptNewsletter) =>
                  setCheckoutData(prev => ({ ...prev, acceptNewsletter }))
                }
                onWantInvoiceChange={(wantInvoice) =>
                  setCheckoutData(prev => ({ ...prev, wantInvoice }))
                }
                onPlaceOrder={handlePlaceOrder}
                isSubmitting={isSubmitting}
              />
            )}
          </div>

          {/* Order summary sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-sm p-4 sm:p-6 lg:sticky lg:top-4">
              <h3 className="text-base sm:text-lg font-semibold dark:text-white mb-3 sm:mb-2">Twoje zamówienie</h3>
              
              {/* Info about multiple warehouses */}
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2 sm:p-3 mb-3 sm:mb-4">
                <div className="flex gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[11px] sm:text-xs text-blue-700 dark:text-blue-400">
                    Produkty mogą pochodzić z różnych magazynów. Zamówienie może zostać wysłane w oddzielnych przesyłkach.
                  </p>
                </div>
              </div>
              
              {/* Products grouped by warehouse */}
              <CheckoutPackagesList 
                items={checkoutItems} 
                onRemoveItem={handleRemoveItem}
                removingItemId={removingItemId}
              />

              {isCartEmpty && (
                <div className="text-center py-4">
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Twój koszyk jest pusty</p>
                  <Link href="/" className="text-orange-500 hover:text-orange-600 text-sm font-medium">
                    Kontynuuj zakupy
                  </Link>
                </div>
              )}

              <div className="border-t dark:border-secondary-700 pt-3 sm:pt-4 space-y-1.5 sm:space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Produkty</span>
                  <span className="dark:text-white">{totals.subtotal.toFixed(2).replace('.', ',')} zł</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Szacowana dostawa</span>
                  <span className="dark:text-white">{totals.shipping.toFixed(2).replace('.', ',')} zł</span>
                </div>
                {totals.paymentFee > 0 && (
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Opłata za płatność</span>
                    <span className="dark:text-white">{totals.paymentFee.toFixed(2).replace('.', ',')} zł</span>
                  </div>
                )}
                {totals.discount > 0 && (
                  <div className="flex justify-between text-xs sm:text-sm text-green-600">
                    <span>Rabat</span>
                    <span>-{totals.discount.toFixed(2).replace('.', ',')} zł</span>
                  </div>
                )}
                <div className="flex justify-between text-base sm:text-lg font-bold pt-2 border-t dark:border-secondary-700">
                  <span className="dark:text-white">Razem</span>
                  <span className="text-orange-600">{totals.total.toFixed(2).replace('.', ',')} zł</span>
                </div>
              </div>

              {/* Coupon input */}
              <CouponInput
                appliedCoupon={cart?.couponCode || null}
                discount={totals.discount}
                onApplyCoupon={applyCoupon}
                onRemoveCoupon={removeCoupon}
              />

              {/* Trust badges */}
              <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t dark:border-secondary-700">
                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Bezpieczne płatności
                </div>
                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  14 dni na zwrot
                </div>
                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Ochrona danych SSL
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <CheckoutPageContent />
    </Suspense>
  );
}
