'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CartItem, checkoutApi } from '../lib/api';
import { roundMoney } from '../lib/currency';
import { useAuth } from '../contexts/AuthContext';

// Placeholder SVG for failed images
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23f3f4f6' width='400' height='400'/%3E%3Cpath fill='%23d1d5db' d='M160 150h80v100h-80z'/%3E%3Ccircle fill='%23d1d5db' cx='180' cy='130' r='20'/%3E%3Cpath fill='%23e5e7eb' d='M120 250l60-80 40 50 40-30 60 60v50H120z'/%3E%3C/svg%3E";

interface PackageItem extends CartItem {
  selected: boolean;
}

interface Package {
  id: string;
  wholesaler: string;
  wholesalerDisplay: string;
  items: PackageItem[];
  subtotal: number;
  shippingPrice: number;
  shippingMethod: string;
}

interface CartPackageViewProps {
  items: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  selectedItems: Set<string>;
  onSelectionChange: (itemId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  shippingPrices?: Record<string, any>;
  isCompact?: boolean;
}

// Warehouse display names (by city) and colors - don't expose wholesaler names
const WHOLESALER_CONFIG: Record<string, { name: string; color: string; icon: string }> = {
  'HP': { name: 'Magazyn Zielona Góra', color: 'bg-blue-500', icon: '📍' },
  'Hurtownia Przemysłowa': { name: 'Magazyn Zielona Góra', color: 'bg-blue-500', icon: '📍' },
  'Ikonka': { name: 'Magazyn Białystok', color: 'bg-purple-500', icon: '📍' },
  'BTP': { name: 'Magazyn Chotów', color: 'bg-green-500', icon: '📍' },
  'Leker': { name: 'Magazyn Chynów', color: 'bg-red-500', icon: '📍' },
  'Gastro': { name: 'Magazyn Centralny', color: 'bg-yellow-500', icon: '📍' },
  'Horeca': { name: 'Magazyn Centralny', color: 'bg-orange-500', icon: '📍' },
  'Forcetop': { name: 'Magazyn Chynów', color: 'bg-teal-500', icon: '📍' },
  'Rzeszów': { name: 'Magazyn Rzeszów', color: 'bg-pink-500', icon: '📍' },
  'Outlet': { name: 'Magazyn Rzeszów', color: 'bg-pink-500', icon: '📍' },
  'Hurtownia Kuchenna': { name: 'Hurtownia Kuchenna', color: 'bg-slate-500', icon: '📍' },
  'default': { name: 'Magazyn Chynów', color: 'bg-gray-500', icon: '📍' },
};

function getWholesalerConfig(wholesaler: string | null | undefined) {
  if (!wholesaler) return WHOLESALER_CONFIG['default'];
  return WHOLESALER_CONFIG[wholesaler] || { name: wholesaler, color: 'bg-gray-500', icon: '📦' };
}

export default function CartPackageView({
  items,
  onUpdateQuantity,
  onRemoveItem,
  selectedItems,
  onSelectionChange,
  onSelectAll,
  shippingPrices = {},
  isCompact = false,
}: CartPackageViewProps) {
  const { user } = useAuth();
  const isB2bUser = user && (user as any).b2bStatus === 'APPROVED';
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Handle image load error
  const handleImageError = (itemId: string) => {
    setFailedImages(prev => new Set(prev).add(itemId));
  };

  // Group items by wholesaler
  const packages = useMemo(() => {
    const grouped: Record<string, CartItem[]> = {};
    
    for (const item of items) {
      const wholesaler = item.variant?.product?.wholesaler || 'default';
      if (!grouped[wholesaler]) {
        grouped[wholesaler] = [];
      }
      grouped[wholesaler].push(item);
    }

    // Calculate subtotal per wholesaler
    const subtotalByWholesaler: Record<string, number> = {};
    for (const [wholesaler, packageItems] of Object.entries(grouped)) {
      subtotalByWholesaler[wholesaler] = roundMoney(
        packageItems.reduce((sum, item) => sum + (item.variant.price * item.quantity), 0)
      );
    }

    // Aggregate subtotals by physical warehouse (multiple wholesalers can map to same warehouse)
    const warehouseSubtotals: Record<string, number> = {};
    for (const [wholesaler, subtotal] of Object.entries(subtotalByWholesaler)) {
      const warehouseName = getWholesalerConfig(wholesaler).name;
      warehouseSubtotals[warehouseName] = (warehouseSubtotals[warehouseName] || 0) + subtotal;
    }

    let b2bChargedInPackages = false;

    return Object.entries(grouped).map(([wholesaler, packageItems], index) => {
      const config = getWholesalerConfig(wholesaler);
      const subtotal = subtotalByWholesaler[wholesaler];
      const warehouseSubtotal = warehouseSubtotals[config.name] || subtotal;
      
      const shippingInfo = shippingPrices[wholesaler];
      let shippingPrice = 0;
      let shippingMethodId = '';
      let displayB2bIncluded = false;

      if (shippingInfo) {
        if (typeof shippingInfo === 'object') {
          shippingPrice = shippingInfo.price;
          shippingMethodId = shippingInfo.methodId;
        } else {
          shippingPrice = shippingInfo;
        }
      }

      if (isB2bUser && shippingMethodId === 'b2b_wysylka_wlasna') {
        if (b2bChargedInPackages) {
          shippingPrice = 0;
          displayB2bIncluded = true;
        } else {
          b2bChargedInPackages = true;
        }
      }
      
      return {
        id: `pkg-${index}`,
        wholesaler,
        wholesalerDisplay: config.name,
        icon: config.icon,
        color: config.color,
        items: packageItems.map(item => ({
          ...item,
          selected: selectedItems.has(item.id),
        })),
        subtotal,
        warehouseSubtotal,
        shippingPrice,
        shippingMethod: 'Kurier',
        displayB2bIncluded,
      };
    });
  }, [items, selectedItems, shippingPrices, isB2bUser]);

  const allSelected = items.length > 0 && items.every(item => selectedItems.has(item.id));
  const someSelected = items.some(item => selectedItems.has(item.id));

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    setUpdatingId(itemId);
    try {
      if (newQuantity === 0) {
        // Remove item when quantity reaches 0
        await onRemoveItem(itemId);
      } else {
        await onUpdateQuantity(itemId, newQuantity);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      await onRemoveItem(itemId);
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPackages = packages.length;

  return (
    <div className="space-y-3 sm:space-y-4 overflow-hidden">
      {/* Select All Header */}
      <div className="flex items-center justify-between bg-white dark:bg-secondary-800 rounded-xl p-3 sm:p-4 shadow-sm">
        <label className="flex items-center gap-2 sm:gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            ref={input => {
              if (input) input.indeterminate = someSelected && !allSelected;
            }}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-300 dark:border-secondary-600 text-orange-500 focus:ring-orange-500"
          />
          <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Cały koszyk</span>
        </label>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{items.length} {items.length === 1 ? 'produkt' : 'produktów'}</span>
      </div>

      {/* Packages */}
      {packages.map((pkg, pkgIndex) => (
        <div key={pkg.id} className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm overflow-hidden">
          {/* Package Header */}
          <div className="bg-gray-50 dark:bg-secondary-700 px-3 sm:px-4 py-2.5 sm:py-3 border-b dark:border-secondary-600">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={pkg.items.every(item => item.selected)}
                  onChange={(e) => {
                    pkg.items.forEach(item => onSelectionChange(item.id, e.target.checked));
                  }}
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-300 dark:border-secondary-600 text-orange-500 focus:ring-orange-500 shrink-0"
                />
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg ${pkg.color} flex items-center justify-center text-white text-xs sm:text-sm shrink-0`}>
                    {pkg.icon}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm block truncate">{pkg.wholesalerDisplay}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">
                      Paczka {pkgIndex + 1}/{totalPackages}
                    </span>
                  </div>
                </div>
              </label>
              <div className="text-right shrink-0">
                <p className="font-bold text-sm sm:text-lg text-gray-900 dark:text-white whitespace-nowrap">{pkg.subtotal.toFixed(2).replace('.', ',')}<span className="text-xs sm:text-base ml-0.5">zł</span></p>
              </div>
            </div>
          </div>

          {/* Package Items */}
          <div className="divide-y divide-gray-100 dark:divide-secondary-700">
            {pkg.items.map((item) => {
              const availableStock = item.variant.inventory.reduce(
                (sum, inv) => sum + (inv.quantity - inv.reserved),
                0
              );
              const isUpdating = updatingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-3 sm:p-4 transition-all ${isUpdating ? 'opacity-50' : ''} ${!item.selected ? 'bg-gray-50/50 dark:bg-secondary-900/30' : ''}`}
                >
                  {/* Mobile: Stack layout, Desktop: Row layout */}
                  <div className="flex gap-2 sm:gap-4">
                    {/* Checkbox */}
                    <div className="flex items-start pt-1 shrink-0">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => onSelectionChange(item.id, e.target.checked)}
                        className="w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-300 dark:border-secondary-600 text-orange-500 focus:ring-orange-500"
                      />
                    </div>

                    {/* Product Image */}
                    <Link href={`/products/${item.variant.product.slug || item.variant.product.id}`} className="shrink-0">
                      <div className={`${isCompact ? 'w-14 h-14 sm:w-20 sm:h-20' : 'w-16 h-16 sm:w-24 sm:h-24 lg:w-28 lg:h-28'} rounded-lg sm:rounded-xl overflow-hidden bg-gray-100 dark:bg-secondary-700 border dark:border-secondary-600 relative`}>
                        {item.variant.product.images[0] && !failedImages.has(item.id) ? (
                          <Image
                            src={item.variant.product.images[0].url}
                            alt={item.variant.product.images[0].alt || item.variant.product.name}
                            fill
                            sizes="(max-width: 640px) 64px, 112px"
                            className="object-cover"
                            onError={() => handleImageError(item.id)}
                          />
                        ) : (
                          <img
                            src={PLACEHOLDER_IMAGE}
                            alt={item.variant.product.name}
                            className="w-full h-full object-contain p-2"
                          />
                        )}
                      </div>
                    </Link>

                    {/* Product Info & Controls - stacked on mobile */}
                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                      {/* Name & Price Row */}
                      <div className="flex justify-between items-start gap-2">
                        <Link href={`/products/${item.variant.product.slug || item.variant.product.id}`} className="flex-1 min-w-0 overflow-hidden">
                          <h3 className={`font-medium text-gray-900 dark:text-white hover:text-orange-500 transition-colors line-clamp-2 break-words ${isCompact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'}`}>
                            {item.variant.product.name}
                          </h3>
                        </Link>
                        {/* Price - visible on mobile */}
                        <div className="text-right shrink-0 sm:hidden">
                          <p className="font-bold text-gray-900 dark:text-white text-sm whitespace-nowrap">
                            {(item.variant.price * item.quantity).toFixed(2).replace('.', ',')} zł
                          </p>
                        </div>
                      </div>

                      {item.variant.name && item.variant.name !== 'Domyślny' && (
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{item.variant.name}</p>
                      )}

                      {/* Stock info & unit price */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 sm:mt-2">
                        <p className={`text-xs ${availableStock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {availableStock > 0 ? `Dostępne: ${availableStock}` : 'Brak'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.quantity} × {item.variant.price.toFixed(2).replace('.', ',')} zł
                        </p>
                      </div>

                      {/* Mobile: Controls row at bottom */}
                      <div className="flex items-center justify-between mt-2 sm:mt-3 gap-2">
                        {/* Quantity Controls - smaller on mobile */}
                        <div className="flex items-center border dark:border-secondary-600 rounded-lg overflow-hidden">
                          <button
                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                            disabled={isUpdating}
                            className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              item.quantity === 1 
                                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600' 
                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-secondary-700'
                            }`}
                            title={item.quantity === 1 ? 'Usuń z koszyka' : 'Zmniejsz ilość'}
                          >
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={availableStock}
                            value={quantityInputs[item.id] ?? item.quantity}
                            onChange={(e) => {
                              setQuantityInputs(prev => ({ ...prev, [item.id]: e.target.value }));
                            }}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value, 10);
                              if (isNaN(value) || value < 1) {
                                setQuantityInputs(prev => ({ ...prev, [item.id]: '1' }));
                                if (item.quantity !== 1) handleQuantityChange(item.id, 1);
                              } else {
                                const clampedValue = Math.min(value, availableStock);
                                setQuantityInputs(prev => ({ ...prev, [item.id]: String(clampedValue) }));
                                if (clampedValue !== item.quantity) handleQuantityChange(item.id, clampedValue);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            disabled={isUpdating}
                            className="w-10 sm:w-14 text-center text-sm sm:text-base font-medium border-x dark:border-secondary-600 dark:bg-secondary-800 dark:text-white py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            disabled={item.quantity >= availableStock || isUpdating}
                            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                        
                        {/* Mobile: Remove button */}
                        <button
                          onClick={() => handleRemove(item.id)}
                          disabled={isUpdating}
                          className="sm:hidden flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors px-2 py-1.5 rounded-lg border border-red-200 dark:border-red-800"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Usuń
                        </button>
                      </div>
                    </div>

                    {/* Desktop only: Price column with remove button */}
                    <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <p className={`font-bold text-gray-900 dark:text-white ${isCompact ? 'text-lg' : 'text-xl'}`}>
                          {(item.variant.price * item.quantity).toFixed(2).replace('.', ',')} zł
                        </p>
                        {item.variant.compareAtPrice && item.variant.compareAtPrice > item.variant.price && (
                          <p className="text-sm text-gray-400 line-through">
                            {(item.variant.compareAtPrice * item.quantity).toFixed(2).replace('.', ',')} zł
                          </p>
                        )}
                      </div>
                      {/* Remove Button - below price */}
                      <button
                        onClick={() => handleRemove(item.id)}
                        disabled={isUpdating}
                        className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Usuń
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

            {/* Shipping Info with Free Shipping Progress */}
            <div className="bg-orange-50 dark:bg-orange-900/30 px-3 sm:px-4 py-2.5 sm:py-3 border-t border-orange-100 dark:border-orange-800">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Szacowana dostawa</span>
                <div className="relative group">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center cursor-help hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                    <span className="text-[10px] sm:text-xs font-semibold text-gray-600 dark:text-gray-300">i</span>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-56 sm:w-64 z-50 pointer-events-none">
                    <div className="text-center leading-relaxed">
                      Koszt dostawy zależy od wybranej metody dostawy w następnym kroku. Podana wartość to najtańsza możliwa opcja.
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                {pkg.warehouseSubtotal >= 300 && !isB2bUser ? (
                  <span className="font-semibold text-green-600 dark:text-green-400 text-sm sm:text-base">GRATIS!</span>
                ) : pkg.displayB2bIncluded ? (
                  <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium">w cenie 1. paczki</span>
                ) : pkg.shippingPrice > 0 ? (
                  <span className="font-semibold text-orange-600 dark:text-orange-400 text-sm sm:text-base">{pkg.shippingPrice.toFixed(2).replace('.', ',')} zł</span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">obliczana przy zamówieniu</span>
                )}
              </div>
            </div>
            
            {/* Free shipping progress bar per warehouse */}
            {pkg.warehouseSubtotal < 300 && !isB2bUser && (
              <div className="space-y-1">
                <div className="h-1.5 bg-orange-200 dark:bg-orange-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-400 to-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min((pkg.warehouseSubtotal / 300) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                  <span className="font-medium text-orange-600 dark:text-orange-400">{(300 - pkg.warehouseSubtotal).toFixed(2).replace('.', ',')} zł</span> do darmowej dostawy
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
