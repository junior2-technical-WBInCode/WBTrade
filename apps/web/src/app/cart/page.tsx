'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import CartPackageView from '../../components/CartPackageView';
import { useCart } from '../../contexts/CartContext';
import { productsApi, checkoutApi, carouselsApi, Product } from '../../lib/api';
import CartCouponSection from './components/CartCouponSection';
import { roundMoney } from '../../lib/currency';
import { trackViewCart, cartItemToGA4 } from '../../lib/analytics';
import ProductCard from '../../components/ProductCard';

export default function CartPage() {
  const { cart, loading, error, updateQuantity, removeFromCart, clearCart, addToCart, applyCoupon, removeCoupon } = useCart();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [shippingPrices, setShippingPrices] = useState<Record<string, number>>({});
  const [totalShippingCost, setTotalShippingCost] = useState<number>(0);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [bestsellers, setBestsellers] = useState<Product[]>([]);
  const viewCartTracked = useRef(false);

  // Initialize all items as selected
  useEffect(() => {
    if (cart?.items) {
      setSelectedItems(new Set(cart.items.map(item => item.id)));
    }
  }, [cart?.items]);

  // Fetch bestsellers from admin-configured carousel
  useEffect(() => {
    async function fetchBestsellers() {
      try {
        const response = await carouselsApi.getProducts('bestsellery');
        setBestsellers((response.products || []).slice(0, 15));
      } catch (err) {
        console.error('Failed to fetch bestsellers:', err);
      }
    }
    fetchBestsellers();
  }, []);

  // Track view_cart event (only once)
  useEffect(() => {
    if (!cart?.items || cart.items.length === 0 || loading || viewCartTracked.current) return;
    viewCartTracked.current = true;

    const items = cart.items.map((item, index) => cartItemToGA4(item, index));
    const totalValue = cart.items.reduce((sum, item) => sum + ((item.variant?.price || 0) * item.quantity), 0);
    trackViewCart(items, totalValue);
  }, [cart?.items, loading]);

  // Fetch shipping prices for each package
  useEffect(() => {
    async function fetchShippingPrices() {
      if (!cart?.items || cart.items.length === 0) return;
      
      setLoadingShipping(true);
      try {
        const items = cart.items.map(item => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        }));

        const cartSubtotal = cart.items.reduce((sum, item) => sum + (item.variant.price * item.quantity), 0);
        const response = await checkoutApi.getShippingPerPackage(items, cartSubtotal);
        
        // Build shipping prices per wholesaler - use LOWEST available price
        const prices: Record<string, number> = {};
        let lowestTotal = 0;
        for (const pkg of response.packagesWithOptions) {
          const wholesaler = pkg.package.wholesaler || 'default';
          // Get the lowest available shipping price for this package
          const availableMethods = pkg.shippingMethods.filter((m: any) => m.available);
          if (availableMethods.length > 0) {
            const lowestPrice = Math.min(...availableMethods.map((m: any) => m.price));
            prices[wholesaler] = lowestPrice;
            lowestTotal += lowestPrice;
          }
        }
        setShippingPrices(prices);
        // Use the lowest possible total
        setTotalShippingCost(lowestTotal);
      } catch (err) {
        console.error('Failed to fetch shipping prices:', err);
      } finally {
        setLoadingShipping(false);
      }
    }
    
    fetchShippingPrices();
  }, [cart?.items]);

  const handleSelectionChange = (itemId: string, selected: boolean) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected && cart?.items) {
      setSelectedItems(new Set(cart.items.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    try {
      await updateQuantity(itemId, newQuantity);
    } catch (err) {
      console.error('Failed to update quantity:', err);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeFromCart(itemId);
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  };

  const handleRemoveSelected = async () => {
    const itemsToRemove = Array.from(selectedItems);
    for (const itemId of itemsToRemove) {
      await removeFromCart(itemId);
    }
    setSelectedItems(new Set());
  };

  // Calculate totals for selected items
  const totals = useMemo(() => {
    if (!cart?.items) return { subtotal: 0, shipping: 0, discount: 0, total: 0, selectedCount: 0 };
    
    const selectedCartItems = cart.items.filter(item => selectedItems.has(item.id));
    const subtotal = roundMoney(selectedCartItems.reduce((sum, item) => sum + (item.variant.price * item.quantity), 0));
    const discount = roundMoney(cart.discount || 0);
    
    // Use total shipping cost from API (calculated properly for all packages)
    // Only show shipping when all items are selected, otherwise recalculate would be needed
    const allSelected = selectedItems.size === cart.items.length;
    const shipping = roundMoney(allSelected ? totalShippingCost : 
      Array.from(new Set(selectedCartItems.map(item => item.variant.product?.wholesaler || 'default')))
        .reduce((sum, ws) => sum + (shippingPrices[ws] || 0), 0));
    
    return {
      subtotal,
      shipping,
      discount,
      total: roundMoney(subtotal + shipping - discount),
      selectedCount: selectedCartItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [cart?.items, cart?.discount, selectedItems, shippingPrices, totalShippingCost]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
        <Header />
        <main className="container-custom py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-secondary-700 rounded w-48 mb-8"></div>
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white dark:bg-secondary-800 rounded-xl p-6">
                    <div className="h-6 bg-gray-200 dark:bg-secondary-700 rounded w-1/3 mb-4"></div>
                    <div className="flex gap-4">
                      <div className="w-28 h-28 bg-gray-200 dark:bg-secondary-700 rounded-xl"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-5 bg-gray-200 dark:bg-secondary-700 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-200 dark:bg-secondary-700 rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white dark:bg-secondary-800 rounded-xl p-6 h-80"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-secondary-900 flex flex-col overflow-x-hidden">
      <Header />

      <main className="container-custom py-4 sm:py-6 lg:py-8 flex-1">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Koszyk</h1>
          {!isEmpty && selectedItems.size > 0 && (
            <button
              onClick={handleRemoveSelected}
              className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">Usuń zaznaczone</span>
              <span className="sm:hidden">Usuń</span>
            </button>
          )}
        </div>

        {isEmpty ? (
          /* Empty Cart */
          <div className="bg-white dark:bg-secondary-800 rounded-xl p-12 text-center shadow-sm">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 dark:bg-secondary-700 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Twój koszyk jest pusty</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Dodaj produkty do koszyka, aby kontynuować zakupy</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Przejdź do sklepu
            </Link>
          </div>
        ) : (
          /* Cart with items */
          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {/* Cart Items - grouped by packages */}
            <div className="lg:col-span-2 order-1 lg:order-1">
              <CartPackageView
                items={cart.items}
                onUpdateQuantity={handleQuantityChange}
                onRemoveItem={handleRemoveItem}
                selectedItems={selectedItems}
                onSelectionChange={handleSelectionChange}
                onSelectAll={handleSelectAll}
                shippingPrices={shippingPrices}
              />
            </div>

            {/* Order Summary Sidebar - sticky on mobile at bottom, sidebar on desktop */}
            <div className="lg:col-span-1 order-2 lg:order-2">
              <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 sm:p-6 lg:sticky lg:top-24 shadow-sm">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">Podsumowanie</h2>

                {/* Order Details */}
                <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                  <div className="flex justify-between items-center gap-2 text-sm sm:text-base">
                    <span className="text-gray-600 dark:text-gray-400 shrink-0">Wartość produktów</span>
                    <span className="font-medium dark:text-white whitespace-nowrap">{totals.subtotal.toFixed(2).replace('.', ',')} zł</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-sm sm:text-base">
                    <span className="text-gray-600 dark:text-gray-400 shrink-0">Szacowana dostawa</span>
                    {loadingShipping ? (
                      <span className="text-gray-400 whitespace-nowrap">Obliczanie...</span>
                    ) : totals.shipping > 0 ? (
                      <span className="font-medium dark:text-white whitespace-nowrap">{totals.shipping.toFixed(2).replace('.', ',')} zł</span>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm text-right">przy zamówieniu</span>
                    )}
                  </div>
                  {Object.keys(shippingPrices).length > 1 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Otrzymasz {Object.keys(shippingPrices).length} przesyłki
                    </p>
                  )}

                  {/* Discount line */}
                  {totals.discount > 0 && (
                    <div className="flex justify-between items-center gap-2 text-sm sm:text-base">
                      <span className="text-green-600 dark:text-green-400 shrink-0">Rabat</span>
                      <span className="font-medium text-green-600 dark:text-green-400 whitespace-nowrap">-{totals.discount.toFixed(2).replace('.', ',')} zł</span>
                    </div>
                  )}
                </div>

                {/* Coupon section */}
                <CartCouponSection
                  appliedCoupon={cart?.couponCode || null}
                  discount={totals.discount}
                  onApplyCoupon={applyCoupon}
                  onRemoveCoupon={removeCoupon}
                />

                {/* Total */}
                <div className="border-t dark:border-secondary-700 pt-3 sm:pt-4 mb-4 sm:mb-6">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white shrink-0">Razem</span>
                    <span className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white whitespace-nowrap">{totals.total.toFixed(2).replace('.', ',')} zł</span>
                  </div>
                </div>

                {/* Checkout Button */}
                <Link
                  href="/checkout"
                  className={`w-full font-bold py-3 sm:py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base sm:text-lg ${
                    selectedItems.size > 0
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                  onClick={(e) => {
                    if (selectedItems.size === 0) {
                      e.preventDefault();
                    } else {
                      // Save selected items to localStorage for checkout
                      localStorage.setItem('checkoutSelectedItems', JSON.stringify(Array.from(selectedItems)));
                    }
                  }}
                >
                  Dostawa i płatność
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>

                {/* Continue Shopping */}
                <Link
                  href="/products"
                  className="w-full border border-gray-300 dark:border-secondary-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 font-medium py-2.5 sm:py-3 rounded-xl mt-2 sm:mt-3 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  Kontynuuj zakupy
                </Link>

                {/* Trust Badges - hidden on mobile */}
                <div className="hidden sm:block mt-6 pt-6 border-t dark:border-secondary-700 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Bezpieczne płatności
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    14 dni na zwrot
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Bestsellers Section */}
      {bestsellers.length > 0 && (
        <section className="py-6 sm:py-8">
          <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center text-base sm:text-xl">
                  🔥
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white">Bestsellery</h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">Najchętniej kupowane produkty</p>
                </div>
              </div>
              <Link href="/products/bestsellers" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">
                <span className="hidden sm:inline">Zobacz wszystkie</span>
                <span className="sm:hidden">Więcej</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>
          </div>
          <div 
            className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {bestsellers.map((product) => (
              <div key={product.id} className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[200px] lg:w-[220px]">
                <ProductCard product={product} showWishlist={true} showAddToCart={true} />
              </div>
            ))}
          </div>
        </section>
      )}

      <Footer hideTrustBadges />
    </div>
  );
}
