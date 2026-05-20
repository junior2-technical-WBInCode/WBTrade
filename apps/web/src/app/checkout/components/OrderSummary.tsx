'use client';

import React from 'react';
import Image from 'next/image';
import { CheckoutData, AddressData, ShippingData, PaymentData } from '../page';

interface OrderSummaryProps {
  checkoutData: CheckoutData;
  cart: any;
  totals: {
    subtotal: number;
    shipping: number;
    paymentFee: number;
    total: number;
  };
  onEditStep: (step: number) => void;
  onTermsChange: (accepted: boolean) => void;
  onDataProcessingChange: (accepted: boolean) => void;
  onNewsletterChange: (accepted: boolean) => void;
  onWantInvoiceChange: (wantInvoice: boolean) => void;
  onPlaceOrder: () => void;
  isSubmitting: boolean;
}

const shippingMethodNames: Record<ShippingData['method'], string> = {
  inpost_paczkomat: 'InPost Paczkomat',
  inpost_kurier: 'Kurier InPost',
  dpd_kurier: 'Kurier DPD',
  wysylka_gabaryt: 'Wysyłka gabaryt',
  odbior_osobisty_outlet: 'Odbiór osobisty (Outlet)',
  b2b_wysylka_wlasna: 'Wysyłka własna B2B',
};

const paymentMethodNames: Record<PaymentData['method'], string> = {
  payu: 'Płatność online (PayU)',
  imoje: 'Płatność online (imoje)',
  blik: 'BLIK',
  card: 'Karta płatnicza',
  transfer: 'Przelew online',
  google_pay: 'Google Pay',
  apple_pay: 'Apple Pay',
  paypo: 'PayPo',
  b2b_przelew: 'Przelew bankowy (B2B)',
};

export default function OrderSummary({
  checkoutData,
  cart,
  totals,
  onEditStep,
  onTermsChange,
  onDataProcessingChange,
  onNewsletterChange,
  onWantInvoiceChange,
  onPlaceOrder,
  isSubmitting,
}: OrderSummaryProps) {
  const { address, shipping, payment } = checkoutData;

  const formatAddress = (addr: AddressData, isBilling = false) => {
    if (isBilling && addr.differentBillingAddress) {
      return (
        <>
          {addr.billingStreet} {addr.billingApartment && `m. ${addr.billingApartment}`}
          <br />
          {addr.billingPostalCode} {addr.billingCity}
        </>
      );
    }
    return (
      <>
        {addr.firstName} {addr.lastName}
        <br />
        {addr.street} {addr.apartment && `m. ${addr.apartment}`}
        <br />
        {addr.postalCode} {addr.city}
        <br />
        Tel: {addr.phone}
      </>
    );
  };

  return (
    <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-sm p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold dark:text-white mb-4 sm:mb-6">Podsumowanie zamówienia</h2>

      {/* Order items */}
      <div className="mb-4 sm:mb-6">
        <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-2 sm:mb-3">Produkty ({cart?.items?.length || 0})</h3>
        <div className="space-y-2 sm:space-y-3">
          {cart?.items?.map((item: any) => (
            <div key={item.id} className="flex gap-2 sm:gap-4 p-2 sm:p-3 bg-gray-50 dark:bg-secondary-700 rounded-lg">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white dark:bg-secondary-600 rounded-lg flex-shrink-0 border dark:border-secondary-500 relative overflow-hidden">
                {item.variant?.product?.images?.[0] && (
                  <Image
                    src={item.variant.product.images[0].url}
                    alt={item.variant.product.name}
                    fill
                    sizes="64px"
                    className="object-cover rounded-lg"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{item.variant?.product?.name}</p>
                {item.variant?.name && (
                  <p className="text-[11px] sm:text-sm text-gray-500 dark:text-gray-400">{item.variant.name}</p>
                )}
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[11px] sm:text-sm text-gray-500 dark:text-gray-400">Ilość: {item.quantity}</span>
                  <span className="text-sm sm:text-base font-semibold text-orange-600">
                    {(item.variant?.price * item.quantity).toFixed(2).replace('.', ',')} zł
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary sections */}
      <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
        {/* Delivery address */}
        <div className="flex justify-between items-start p-3 sm:p-4 border dark:border-secondary-600 rounded-lg">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-1">📍 Adres dostawy</h4>
            {shipping.method === 'inpost_paczkomat' && shipping.paczkomatCode ? (
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Paczkomat InPost</p>
                <p className="text-orange-600 font-semibold text-xs sm:text-sm">{shipping.paczkomatCode}</p>
                {shipping.paczkomatAddress && (
                  <p className="mt-1 text-xs sm:text-sm">{shipping.paczkomatAddress}</p>
                )}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {formatAddress(address)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onEditStep(shipping.method === 'inpost_paczkomat' ? 2 : 1)}
            className="text-xs sm:text-sm text-orange-500 hover:text-orange-600 font-medium shrink-0 ml-2"
          >
            Zmień
          </button>
        </div>

        {/* Billing address (if different) */}
        {address.differentBillingAddress && (
          <div className="flex justify-between items-start p-3 sm:p-4 border dark:border-secondary-600 rounded-lg">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-1">🧾 Adres do faktury</h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {formatAddress(address, true)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEditStep(1)}
              className="text-xs sm:text-sm text-orange-500 hover:text-orange-600 font-medium shrink-0 ml-2"
            >
              Zmień
            </button>
          </div>
        )}

        {/* Shipping method */}
        <div className="flex justify-between items-start p-3 sm:p-4 border dark:border-secondary-600 rounded-lg">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-1">🚚 Dostawa</h4>
            {shipping.packageShipping && shipping.packageShipping.length > 1 ? (
              // Multiple packages - show each one
              <div className="space-y-2 sm:space-y-3">
                {shipping.packageShipping.map((pkg, index) => (
                  <div key={pkg.packageId} className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    <div>
                      <span className="font-medium">Przesyłka {index + 1}:</span>{' '}
                      {shippingMethodNames[pkg.method]}
                      {pkg.paczkomatCode && (
                        <span className="text-orange-600 ml-1">({pkg.paczkomatCode})</span>
                      )}
                      <span className="text-gray-500 ml-1">– {pkg.price.toFixed(2).replace('.', ',')} zł</span>
                    </div>
                    {pkg.useCustomAddress && pkg.customAddress && (
                      <div className="mt-1 ml-2 sm:ml-4 text-[10px] sm:text-xs text-gray-500 border-l-2 border-orange-200 pl-2">
                        <span className="text-orange-600">📍 Inny adres:</span>{' '}
                        {pkg.customAddress.firstName} {pkg.customAddress.lastName},{' '}
                        {pkg.customAddress.street}{pkg.customAddress.apartment ? ` m. ${pkg.customAddress.apartment}` : ''},{' '}
                        {pkg.customAddress.postalCode} {pkg.customAddress.city}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : shipping.packageShipping && shipping.packageShipping.length === 1 ? (
              // Single package with possible custom address
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                <p>
                  {shippingMethodNames[shipping.method]}
                  {shipping.paczkomatCode && (
                    <span className="text-orange-600 ml-1">({shipping.paczkomatCode})</span>
                  )}
                </p>
                {shipping.packageShipping[0].useCustomAddress && shipping.packageShipping[0].customAddress && (
                  <div className="mt-1 text-[10px] sm:text-xs text-gray-500 border-l-2 border-orange-200 pl-2">
                    <span className="text-orange-600">📍 Inny adres:</span>{' '}
                    {shipping.packageShipping[0].customAddress.firstName} {shipping.packageShipping[0].customAddress.lastName},{' '}
                    {shipping.packageShipping[0].customAddress.street},{' '}
                    {shipping.packageShipping[0].customAddress.postalCode} {shipping.packageShipping[0].customAddress.city}
                  </div>
                )}
              </div>
            ) : (
              // No package shipping (backward compat)
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {shippingMethodNames[shipping.method]}
                {shipping.paczkomatCode && (
                  <span className="text-orange-600 ml-1">({shipping.paczkomatCode})</span>
                )}
              </p>
            )}
            <p className="text-xs sm:text-sm font-medium mt-1">
              {shipping.price === 0 ? (
                <span className="text-green-600">GRATIS</span>
              ) : (
                <span>Razem: {shipping.price.toFixed(2).replace('.', ',')} zł</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onEditStep(2)}
            className="text-xs sm:text-sm text-orange-500 hover:text-orange-600 font-medium shrink-0 ml-2"
          >
            Zmień
          </button>
        </div>

        {/* Payment method */}
        <div className="flex justify-between items-start p-3 sm:p-4 border dark:border-secondary-600 rounded-lg">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-1">💳 Płatność</h4>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{paymentMethodNames[payment.method] || 'Płatność online'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">BLIK, karta płatnicza, szybki przelew, Google Pay, Apple Pay</p>
          </div>
          <button
            type="button"
            onClick={() => onEditStep(3)}
            className="text-xs sm:text-sm text-orange-500 hover:text-orange-600 font-medium shrink-0 ml-2"
          >
            Zmień
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="border-t dark:border-secondary-600 pt-3 sm:pt-4 mb-4 sm:mb-6">
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-600 dark:text-gray-400">Produkty</span>
            <span className="dark:text-white">{totals.subtotal.toFixed(2).replace('.', ',')} zł</span>
          </div>
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-600 dark:text-gray-400">Dostawa</span>
            <span className="dark:text-white">{totals.shipping === 0 ? 'GRATIS' : `${totals.shipping.toFixed(2).replace('.', ',')} zł`}</span>
          </div>
          {totals.paymentFee > 0 && (
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-600 dark:text-gray-400">Opłata za płatność</span>
              <span className="dark:text-white">{totals.paymentFee.toFixed(2).replace('.', ',')} zł</span>
            </div>
          )}
          <div className="flex justify-between text-base sm:text-xl font-bold pt-2 sm:pt-3 border-t dark:border-secondary-600">
            <span className="dark:text-white">Do zapłaty</span>
            <span className="text-orange-600">{totals.total.toFixed(2).replace('.', ',')} zł</span>
          </div>
        </div>
      </div>

      {/* Terms and conditions */}
      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
        <label className="flex items-start gap-2 sm:gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checkoutData.acceptTerms}
            onChange={(e) => onTermsChange(e.target.checked)}
            className="mt-0.5 sm:mt-1 h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded shrink-0 dark:bg-secondary-700"
          />
          <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            Akceptuję{' '}
            <a href="/terms" className="text-orange-500 hover:underline" target="_blank">
              regulamin sklepu
            </a>{' '}
            oraz{' '}
            <a href="/privacy" className="text-orange-500 hover:underline" target="_blank">
              politykę prywatności
            </a>
            . *
          </span>
        </label>

        <label className="flex items-start gap-2 sm:gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checkoutData.acceptDataProcessing}
            onChange={(e) => onDataProcessingChange(e.target.checked)}
            className="mt-0.5 sm:mt-1 h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded shrink-0 dark:bg-secondary-700"
          />
          <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji zamówienia, w&nbsp;tym przekazanie danych operatorowi płatności ({payment.method === 'imoje' ? 'imoje' : 'PayU'}) w&nbsp;zakresie niezbędnym do obsługi płatności. Podanie danych jest dobrowolne, lecz niezbędne do realizacji zamówienia. *
          </span>
        </label>

        <div className="flex items-start justify-between gap-2">
          <label className="flex items-start gap-2 sm:gap-3 cursor-pointer flex-1">
            <input
              type="checkbox"
              checked={checkoutData.wantInvoice}
              onChange={(e) => onWantInvoiceChange(e.target.checked)}
              className="mt-0.5 sm:mt-1 h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded shrink-0 dark:bg-secondary-700"
            />
            <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              🧾 Chcę otrzymać fakturę VAT {checkoutData.address.differentBillingAddress && checkoutData.address.billingNip ? '' : '(podaj dane firmy w adresie)'}
            </span>
          </label>
          <button
            type="button"
            onClick={() => onEditStep(1)}
            className="text-xs sm:text-sm text-orange-500 hover:text-orange-600 font-medium shrink-0"
          >
            {checkoutData.address.differentBillingAddress && checkoutData.address.billingNip ? 'Zmień' : 'Dodaj'}
          </button>
        </div>
      </div>

      {/* Place order button */}
      <button
        type="button"
        onClick={onPlaceOrder}
        disabled={isSubmitting || !checkoutData.acceptTerms || !checkoutData.acceptDataProcessing}
        className={`
          w-full py-3 sm:py-4 text-white font-bold text-base sm:text-lg rounded-lg transition-all
          flex items-center justify-center gap-2
          ${checkoutData.acceptTerms && checkoutData.acceptDataProcessing && !isSubmitting
            ? 'bg-orange-500 hover:bg-orange-600 focus:ring-4 focus:ring-orange-200'
            : 'bg-gray-300 dark:bg-secondary-600 cursor-not-allowed'
          }
        `}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Przetwarzanie...
          </>
        ) : (
          <>
            🛒 Zamawiam i płacę – {totals.total.toFixed(2).replace('.', ',')} zł
          </>
        )}
      </button>

      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 text-center mt-2 sm:mt-3">
        Klikając przycisk powyżej, potwierdzasz zamówienie z obowiązkiem zapłaty.
      </p>
    </div>
  );
}
