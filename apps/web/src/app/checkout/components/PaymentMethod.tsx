'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { PaymentData } from '../page';
import { getLogoUrl, PAYMENT_LOGOS } from '@/lib/logo-dev';

interface PaymentMethodProps {
  initialData: PaymentData;
  onSubmit: (data: PaymentData) => void;
  onBack: () => void;
  isB2b?: boolean;
}

type PaymentId = 'payu' | 'imoje' | 'b2b_przelew';

interface PaymentOption {
  id: PaymentId;
  name: string;
  extraFee: number;
  badge?: string;
  description?: string;
}

const paymentOptions: PaymentOption[] = [
  { 
    id: 'payu', 
    name: 'Płatność online (PayU)', 
    extraFee: 0,
    description: 'BLIK, karta płatnicza, szybki przelew, Google Pay, Apple Pay'
  },
  { 
    id: 'imoje', 
    name: 'Płatność online (imoje)', 
    extraFee: 0,
    description: 'BLIK, karta płatnicza, szybki przelew, Google Pay, Apple Pay'
  },
];

const b2bPaymentOption: PaymentOption = {
  id: 'b2b_przelew',
  name: 'Przelew bankowy (B2B)',
  extraFee: 0,
  description: 'Termin płatności 7 dni od daty zamówienia'
};

// Ikony dla metod płatności
const PaymentIcon = ({ id }: { id: PaymentId }) => {
  switch (id) {
    case 'payu': {
      const logoUrl = getLogoUrl(PAYMENT_LOGOS.payu, { size: 64, format: 'png' });
      return logoUrl ? (
        <Image 
          src={logoUrl} 
          alt="PayU"
          width={64}
          height={28}
          className="h-6 sm:h-7 w-auto object-contain rounded"
        />
      ) : (
        <span className="px-2 py-1 bg-[#A6C307] text-white text-xs font-bold rounded">PayU</span>
      );
    }
    case 'imoje': {
      const imojeLogoUrl = getLogoUrl(PAYMENT_LOGOS.imoje, { size: 64, format: 'png' });
      return imojeLogoUrl ? (
        <Image 
          src={imojeLogoUrl} 
          alt="imoje"
          width={64}
          height={28}
          className="h-6 sm:h-7 w-auto object-contain rounded"
        />
      ) : (
        <span className="px-2 py-1 bg-[#00A651] text-white text-xs font-bold rounded">imoje</span>
      );
    }
    case 'b2b_przelew':
      return (
        <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">B2B</span>
      );
    default:
      return null;
  }
};

export default function PaymentMethod({ initialData, onSubmit, onBack, isB2b }: PaymentMethodProps) {
  const availableOptions = isB2b ? [...paymentOptions, b2bPaymentOption] : paymentOptions;
  const [selectedMethod, setSelectedMethod] = useState<PaymentId>(
    (initialData.method as PaymentId) || 'payu'
  );

  const selectedOption = availableOptions.find(opt => opt.id === selectedMethod);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      method: selectedMethod as PaymentData['method'],
      extraFee: selectedOption?.extraFee || 0,
    });
  };

  return (
    <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-sm">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b dark:border-secondary-700">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Płatność</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="divide-y divide-gray-100 dark:divide-secondary-700">
          {availableOptions.map((option) => (
            <label
              key={option.id}
              className={`
                block px-4 sm:px-6 py-3 sm:py-4 cursor-pointer transition-colors
                ${selectedMethod === option.id ? 'bg-gray-50 dark:bg-secondary-700' : 'hover:bg-gray-50 dark:hover:bg-secondary-700'}
              `}
            >
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Radio button */}
                <div
                  className={`
                    w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    ${selectedMethod === option.id
                      ? 'border-orange-500'
                      : 'border-gray-300'
                    }
                  `}
                >
                  {selectedMethod === option.id && (
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500" />
                  )}
                </div>

                <input
                  type="radio"
                  name="payment"
                  value={option.id}
                  checked={selectedMethod === option.id}
                  onChange={() => setSelectedMethod(option.id)}
                  className="sr-only"
                />

                {/* Name and badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm sm:text-base text-gray-900 dark:text-white font-medium">{option.name}</span>
                    {option.badge && (
                      <span className="px-1.5 sm:px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] sm:text-xs font-medium rounded">
                        {option.badge}
                      </span>
                    )}
                  </div>
                  {option.description && (
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block mt-0.5">{option.description}</span>
                  )}
                </div>

                {/* Right side: icon and price */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <PaymentIcon id={option.id} />
                  <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm whitespace-nowrap">
                    {option.extraFee === 0 ? '0 zł' : `${option.extraFee} zł`}
                  </span>
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* B2B bank transfer info */}
        {selectedMethod === 'b2b_przelew' && (
          <div className="mx-4 sm:mx-6 my-3 sm:my-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <div className="flex gap-2">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Zamówienie zostanie przekazane do realizacji po zaksięgowaniu płatności na rachunku Sprzedawcy. Termin płatności: 7 dni od daty złożenia zamówienia.
              </p>
            </div>
          </div>
        )}

        {/* Security note */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t dark:border-secondary-600 bg-gray-50 dark:bg-secondary-700">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Bezpieczne płatności szyfrowane SSL</span>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between px-4 sm:px-6 py-3 sm:py-4 border-t dark:border-secondary-600">
          <button
            type="button"
            onClick={onBack}
            className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Wstecz
          </button>
          <button
            type="submit"
            className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
          >
            Dalej →
          </button>
        </div>
      </form>
    </div>
  );
}
