'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ShippingData, PackageShippingSelection } from '../page';
import { checkoutApi } from '../../../lib/api';
import { roundMoney } from '../../../lib/currency';
import InPostGeoWidget, { InPostPoint } from '../../../components/InPostGeoWidget';

type ShippingMethodId = 'inpost_paczkomat' | 'inpost_kurier' | 'dpd_kurier' | 'wysylka_gabaryt' | 'odbior_osobisty_outlet' | 'b2b_wysylka_wlasna';

interface ShippingMethodOption {
  id: string;
  name: string;
  price: number;
  available: boolean;
  message?: string;
  estimatedDelivery: string;
  forced?: boolean;
}

interface PackageItem {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  isGabaryt: boolean;
  productImage?: string;
}

interface PackageWithOptions {
  package: {
    id: string;
    type: 'standard' | 'gabaryt';
    wholesaler: string | null;
    items: PackageItem[];
    isPaczkomatAvailable: boolean;
    isInPostOnly: boolean;
    isCourierOnly: boolean;
    warehouseValue: number;
    hasFreeShipping: boolean;
    paczkomatPackageCount?: number;
  };
  shippingMethods: ShippingMethodOption[];
  selectedMethod: string;
}

interface ShippingPerPackageProps {
  initialData: ShippingData;
  onSubmit: (data: ShippingData) => void;
  onBack: () => void;
  onPriceChange?: (totalPrice: number) => void;
  cartItems?: Array<{ variant: { id: string; price?: number }; quantity: number }>;
}

// Shipping provider icons
const ShippingIcon = ({ id }: { id: string }) => {
  switch (id) {
    case 'inpost_paczkomat':
    case 'inpost_kurier':
      return (
        <div className="flex items-center justify-center w-12 h-7 bg-[#FFCD00] rounded px-1">
          <span className="text-[#1D1D1B] text-[10px] font-bold">InPost</span>
        </div>
      );
    case 'dpd_kurier':
      return (
        <div className="flex items-center justify-center w-12 h-7 bg-[#DC0032] rounded px-1">
          <span className="text-white text-[10px] font-bold">DPD</span>
        </div>
      );
    case 'wysylka_gabaryt':
      return (
        <div className="flex items-center justify-center w-12 h-7 bg-orange-500 rounded px-1">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
      );
    case 'odbior_osobisty_outlet':
      return (
        <div className="flex items-center justify-center w-12 h-7 bg-green-600 rounded px-1">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      );
    case 'b2b_wysylka_wlasna':
      return (
        <div className="flex items-center justify-center w-12 h-7 bg-blue-600 rounded px-1">
          <span className="text-white text-[9px] font-bold">B2B</span>
        </div>
      );
    default:
      return null;
  }
};

export default function ShippingPerPackage({
  initialData,
  onSubmit,
  onBack,
  onPriceChange,
  cartItems,
}: ShippingPerPackageProps) {
  const [packagesWithOptions, setPackagesWithOptions] = useState<PackageWithOptions[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<Record<string, ShippingMethodId>>({});
  // paczkomatSelections: packageId -> array of paczkomat selections (one per paczkomatPackageCount)
  const [paczkomatSelections, setPaczkomatSelections] = useState<Record<string, Array<{ code: string; address: string }>>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Track which paczkomat slot we're selecting (packageId:index)
  const [geoWidgetSlot, setGeoWidgetSlot] = useState<{ packageId: string; index: number } | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  
  // Custom address type
  type CustomAddressType = {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    apartment: string;
    postalCode: string;
    city: string;
  };
  
  // Custom address state per package
  const [useCustomAddress, setUseCustomAddress] = useState<Record<string, boolean>>({});
  const [customAddresses, setCustomAddresses] = useState<Record<string, CustomAddressType>>({});

  // Fetch shipping options per package
  useEffect(() => {
    async function fetchShippingOptions() {
      if (!cartItems || cartItems.length === 0) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const items = cartItems.map(item => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        }));

        const cartSubtotal = cartItems.reduce((sum, item) => sum + ((item.variant?.price || 0) * item.quantity), 0);
        const response = await checkoutApi.getShippingPerPackage(items, cartSubtotal);

        setPackagesWithOptions(response.packagesWithOptions);
        setWarnings(response.warnings);

        // Initialize selected methods from response defaults or initial data
        const initialMethods: Record<string, ShippingMethodId> = {};
        const initialUseCustom: Record<string, boolean> = {};
        const initialCustomAddresses: Record<string, CustomAddressType> = {};
        
        // Try to restore previous selections if available
        if (initialData.packageShipping && initialData.packageShipping.length > 0) {
          for (const pkgShipping of initialData.packageShipping) {
            initialMethods[pkgShipping.packageId] = pkgShipping.method;
            if (pkgShipping.paczkomatCode) {
              setPaczkomatSelections(prev => ({
                ...prev,
                [pkgShipping.packageId]: [{
                  code: pkgShipping.paczkomatCode || '',
                  address: pkgShipping.paczkomatAddress || '',
                }],
              }));
            }
            // Restore custom address if present
            if (pkgShipping.useCustomAddress && pkgShipping.customAddress) {
              initialUseCustom[pkgShipping.packageId] = true;
              initialCustomAddresses[pkgShipping.packageId] = pkgShipping.customAddress;
            }
          }
        } else {
          // Use defaults from API
          for (const pkgOpt of response.packagesWithOptions) {
            initialMethods[pkgOpt.package.id] = pkgOpt.selectedMethod as ShippingMethodId;
          }
        }
        
        setSelectedMethods(initialMethods);
        setUseCustomAddress(initialUseCustom);
        setCustomAddresses(initialCustomAddresses);
        
        // Calculate initial total
        const initialTotal = calculateTotalPrice(response.packagesWithOptions, initialMethods);
        if (onPriceChange) {
          onPriceChange(initialTotal);
        }
      } catch (err) {
        console.error('Failed to fetch shipping options:', err);
        setError('Nie udało się pobrać opcji wysyłki');
      } finally {
        setIsLoading(false);
      }
    }

    fetchShippingOptions();
  }, [cartItems]);

  const calculateTotalPrice = (
    packages: PackageWithOptions[],
    methods: Record<string, ShippingMethodId>
  ): number => {
    let total = 0;
    for (const pkgOpt of packages) {
      const selectedMethodId = methods[pkgOpt.package.id];
      const method = pkgOpt.shippingMethods.find(m => m.id === selectedMethodId && m.available);
      if (method) {
        total += method.price;
      }
    }
    return roundMoney(total);
  };

  // Calculate actual number of shipments based on selected methods
  // Paczkomat: count each paczkomatPackageCount
  // Courier: always 1 per package
  const calculateShipmentCount = (): number => {
    let count = 0;
    for (const pkgOpt of packagesWithOptions) {
      const method = selectedMethods[pkgOpt.package.id];
      if (method === 'inpost_paczkomat') {
        count += pkgOpt.package.paczkomatPackageCount || 1;
      } else {
        count += 1;
      }
    }
    return count || packagesWithOptions.length;
  };

  // Split items into paczkomat packages for display
  const getItemsForPaczkomatSlot = (items: PackageItem[], slotIndex: number, totalSlots: number): PackageItem[] => {
    if (totalSlots <= 1) return items;
    // Distribute items evenly across slots
    const itemsPerSlot = Math.ceil(items.reduce((sum, i) => sum + i.quantity, 0) / totalSlots);
    let currentSlot = 0;
    let currentSlotCount = 0;
    const slotItems: PackageItem[][] = Array.from({ length: totalSlots }, () => []);
    
    for (const item of items) {
      let remainingQty = item.quantity;
      while (remainingQty > 0) {
        const spaceInSlot = itemsPerSlot - currentSlotCount;
        const qtyForSlot = Math.min(remainingQty, spaceInSlot);
        if (qtyForSlot > 0) {
          const existingItem = slotItems[currentSlot].find(i => i.productId === item.productId);
          if (existingItem) {
            existingItem.quantity += qtyForSlot;
          } else {
            slotItems[currentSlot].push({ ...item, quantity: qtyForSlot });
          }
          currentSlotCount += qtyForSlot;
          remainingQty -= qtyForSlot;
        }
        if (currentSlotCount >= itemsPerSlot && currentSlot < totalSlots - 1) {
          currentSlot++;
          currentSlotCount = 0;
        }
      }
    }
    return slotItems[slotIndex] || [];
  };

  const handleMethodChange = (packageId: string, methodId: ShippingMethodId) => {
    const newMethods = { ...selectedMethods, [packageId]: methodId };
    setSelectedMethods(newMethods);
    setError('');

    // Clear paczkomat selection if switching away from paczkomat
    if (methodId !== 'inpost_paczkomat') {
      setPaczkomatSelections(prev => {
        const { [packageId]: _, ...rest } = prev;
        return rest;
      });
    }
    
    // If switching to paczkomat, disable custom address for this package
    if (methodId === 'inpost_paczkomat') {
      setUseCustomAddress(prev => ({ ...prev, [packageId]: false }));
    }

    // Update total price
    const newTotal = calculateTotalPrice(packagesWithOptions, newMethods);
    if (onPriceChange) {
      onPriceChange(newTotal);
    }
  };
  
  const handleToggleCustomAddress = (packageId: string) => {
    setUseCustomAddress(prev => {
      const newValue = !prev[packageId];
      // Initialize empty address if enabling
      if (newValue && !customAddresses[packageId]) {
        setCustomAddresses(addresses => ({
          ...addresses,
          [packageId]: {
            firstName: '',
            lastName: '',
            phone: '',
            street: '',
            apartment: '',
            postalCode: '',
            city: '',
          },
        }));
      }
      return { ...prev, [packageId]: newValue };
    });
  };
  
  const handleCustomAddressChange = (packageId: string, field: string, value: string) => {
    setCustomAddresses(prev => ({
      ...prev,
      [packageId]: {
        ...prev[packageId],
        [field]: value,
      },
    }));
  };

  const openPaczkomatWidget = (packageId: string, slotIndex: number) => {
    setGeoWidgetSlot({ packageId, index: slotIndex });
  };

  const handlePointSelect = (point: InPostPoint) => {
    if (!geoWidgetSlot) return;
    
    const { packageId, index } = geoWidgetSlot;
    
    const address = point.address_details
      ? `${point.address_details.street} ${point.address_details.building_number}, ${point.address_details.post_code} ${point.address_details.city}`
      : `${point.address.line1}, ${point.address.line2}`;
    
    setPaczkomatSelections(prev => {
      const currentSelections = prev[packageId] || [];
      const newSelections = [...currentSelections];
      newSelections[index] = { code: point.name, address };
      return {
        ...prev,
        [packageId]: newSelections,
      };
    });
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all packages have selections
    for (const pkgOpt of packagesWithOptions) {
      const methodId = selectedMethods[pkgOpt.package.id];
      if (!methodId) {
        setError(`Wybierz metodę dostawy dla paczki: ${getPackageTitle(pkgOpt)}`);
        return;
      }

      // Check paczkomat selections if needed - validate all slots are filled
      if (methodId === 'inpost_paczkomat') {
        const paczkomatCount = pkgOpt.package.paczkomatPackageCount || 1;
        const selections = paczkomatSelections[pkgOpt.package.id] || [];
        for (let i = 0; i < paczkomatCount; i++) {
          if (!selections[i]?.code) {
            setError(`Wybierz paczkomat ${paczkomatCount > 1 ? `#${i + 1} ` : ''}dla paczki: ${getPackageTitle(pkgOpt)}`);
            return;
          }
        }
      }
      
      // Validate custom address if enabled
      if (useCustomAddress[pkgOpt.package.id] && methodId !== 'inpost_paczkomat') {
        const addr = customAddresses[pkgOpt.package.id];
        if (!addr?.firstName || !addr?.lastName || !addr?.street || !addr?.postalCode || !addr?.city || !addr?.phone) {
          setError(`Uzupełnij adres dostawy dla paczki: ${getPackageTitle(pkgOpt)}`);
          return;
        }
      }
    }

    // Build package shipping selections
    // If a package has multiple paczkomat slots, create separate entries for each
    const packageShipping: PackageShippingSelection[] = [];
    
    for (const pkgOpt of packagesWithOptions) {
      const methodId = selectedMethods[pkgOpt.package.id];
      const method = pkgOpt.shippingMethods.find(m => m.id === methodId);
      const selections = paczkomatSelections[pkgOpt.package.id] || [];
      const hasCustomAddr = useCustomAddress[pkgOpt.package.id] && methodId !== 'inpost_paczkomat';
      const paczkomatCount = pkgOpt.package.paczkomatPackageCount || 1;
      
      // If using paczkomat with multiple slots, create separate entries
      if (methodId === 'inpost_paczkomat' && paczkomatCount > 1) {
        const pricePerPackage = roundMoney((method?.price || 0) / paczkomatCount);
        
        for (let i = 0; i < paczkomatCount; i++) {
          const slotItems = getItemsForPaczkomatSlot(pkgOpt.package.items, i, paczkomatCount);
          packageShipping.push({
            packageId: `${pkgOpt.package.id}_slot${i}`,
            wholesaler: pkgOpt.package.wholesaler || undefined,
            method: methodId,
            price: pricePerPackage,
            paczkomatCode: selections[i]?.code || undefined,
            paczkomatAddress: selections[i]?.address || undefined,
            items: slotItems.map(item => ({
              productId: item.productId,
              productName: item.productName,
              variantId: item.variantId,
              quantity: item.quantity,
              image: item.productImage,
            })),
            useCustomAddress: false,
            customAddress: undefined,
          });
        }
      } else {
        // Single package entry
        packageShipping.push({
          packageId: pkgOpt.package.id,
          wholesaler: pkgOpt.package.wholesaler || undefined,
          method: methodId,
          price: method?.price || 0,
          paczkomatCode: methodId === 'inpost_paczkomat' ? selections[0]?.code : undefined,
          paczkomatAddress: methodId === 'inpost_paczkomat' ? selections[0]?.address : undefined,
          items: pkgOpt.package.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            variantId: item.variantId,
            quantity: item.quantity,
            image: item.productImage,
          })),
          useCustomAddress: hasCustomAddr,
          customAddress: hasCustomAddr ? customAddresses[pkgOpt.package.id] : undefined,
        });
      }
    }

    const totalPrice = calculateTotalPrice(packagesWithOptions, selectedMethods);

    // Determine overall method (for backward compatibility) - use most common or first
    const methodCounts: Record<string, number> = {};
    for (const selection of packageShipping) {
      methodCounts[selection.method] = (methodCounts[selection.method] || 0) + 1;
    }
    const primaryMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'inpost_kurier';

    onSubmit({
      method: primaryMethod as ShippingData['method'],
      price: totalPrice,
      packageShipping,
      // If all packages use same paczkomat method, pass the first one for backward compat
      paczkomatCode: packageShipping.find(p => p.paczkomatCode)?.paczkomatCode,
      paczkomatAddress: packageShipping.find(p => p.paczkomatAddress)?.paczkomatAddress,
    });
  };

  const getPackageTitle = (pkgOpt: PackageWithOptions): string => {
    // Get product names from items
    const productNames = pkgOpt.package.items.map(item => item.productName);
    
    if (productNames.length === 1) {
      return productNames[0];
    } else if (productNames.length <= 3) {
      return productNames.join(', ');
    } else {
      return `${productNames.slice(0, 2).join(', ')} i ${productNames.length - 2} więcej`;
    }
  };

  const getPackageDescription = (pkgOpt: PackageWithOptions): string => {
    const itemCount = pkgOpt.package.items.reduce((sum, item) => sum + item.quantity, 0);
    if (pkgOpt.package.type === 'gabaryt') {
      return 'Produkt gabarytowy - dostawa tylko kurierem';
    }
    return `${itemCount} ${itemCount === 1 ? 'produkt' : itemCount < 5 ? 'produkty' : 'produktów'}`;
  };

  // Warehouse display config
  const getWarehouseConfig = (wholesaler: string | null) => {
    const configs: Record<string, { name: string; color: string; bgColor: string }> = {
      'HP': { name: 'Magazyn Zielona Góra', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' },
      'Hurtownia Przemysłowa': { name: 'Magazyn Zielona Góra', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' },
      'Ikonka': { name: 'Magazyn Białystok', color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700' },
      'BTP': { name: 'Magazyn Chotów', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700' },
      'Leker': { name: 'Magazyn Chynów', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700' },
      'Rzeszów': { name: 'Magazyn Rzeszów', color: 'text-pink-700 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-900/30 border-pink-200 dark:border-pink-700' },
      'Outlet': { name: 'Magazyn Rzeszów', color: 'text-pink-700 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-900/30 border-pink-200 dark:border-pink-700' },
    };
    return configs[wholesaler || ''] || { name: 'Magazyn Chynów', color: 'text-gray-700 dark:text-gray-300', bgColor: 'bg-gray-50 dark:bg-secondary-700 border-gray-200 dark:border-secondary-600' };
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center">
          <svg className="animate-spin w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Ładowanie opcji dostawy...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-sm">
      {/* Header with summary */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b dark:border-secondary-700 bg-gradient-to-r from-orange-50 to-white dark:from-secondary-700 dark:to-secondary-800">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
          {calculateShipmentCount() === 1 ? 'Dostawa' : 'Wybór dostawy'}
        </h2>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {calculateShipmentCount()} {calculateShipmentCount() === 1 ? 'przesyłka' : calculateShipmentCount() < 5 ? 'przesyłki' : 'przesyłek'}
          </span>
          {packagesWithOptions.some(p => p.package.type === 'gabaryt') && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Zawiera gabaryty
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {calculateShipmentCount() === 1 
            ? 'Wybierz sposób dostawy dla Twojego zamówienia.'
            : 'Produkty zostaną wysłane z różnych magazynów. Wybierz sposób dostawy dla każdej przesyłki.'
          }
        </p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mx-3 sm:mx-6 mt-3 sm:mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2 sm:gap-3">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-xs sm:text-sm font-medium text-amber-800">Informacja o wysyłce</p>
              {warnings.map((warning, idx) => (
                <p key={idx} className="text-xs sm:text-sm text-amber-700 mt-1">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Packages with shipping options */}
        <div className="p-3 sm:p-4 lg:p-6 space-y-4">
          {packagesWithOptions.map((pkgOpt, pkgIndex) => {
            const warehouseConfig = getWarehouseConfig(pkgOpt.package.wholesaler);
            const isGabaryt = pkgOpt.package.type === 'gabaryt';
            const selectedMethod = pkgOpt.shippingMethods.find(m => m.id === selectedMethods[pkgOpt.package.id] && m.available);
            
            return (
            <div key={pkgOpt.package.id} className={`rounded-xl border-2 overflow-hidden ${warehouseConfig.bgColor}`}>
              {/* Package header with warehouse info */}
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-white dark:bg-secondary-800 shadow-sm flex items-center justify-center font-bold text-lg ${warehouseConfig.color}`}>
                    {pkgIndex + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${warehouseConfig.color}`}>{warehouseConfig.name}</span>
                      {isGabaryt && (
                        <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                          GABARYT
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {pkgOpt.package.items.reduce((sum, item) => sum + item.quantity, 0)} {pkgOpt.package.items.length === 1 ? 'produkt' : 'produktów'}
                    </span>
                  </div>
                </div>
                {selectedMethod && (
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{selectedMethod.price.toFixed(2).replace('.', ',')} zł</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{selectedMethod.name}</div>
                  </div>
                )}
              </div>
              
              {/* Products - collapsed view with max 3 visible */}
              <div className="px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {pkgOpt.package.items.slice(0, 3).map((item, itemIndex) => (
                    <div
                      key={`${item.variantId}-${itemIndex}`}
                      className="flex items-center gap-2 px-2 py-1 bg-white/80 dark:bg-secondary-800/80 rounded-lg border border-white/50 dark:border-secondary-600"
                    >
                      {item.productImage && (
                        <div className="w-8 h-8 relative flex-shrink-0">
                          <Image
                            src={item.productImage}
                            alt=""
                            fill
                            sizes="32px"
                            className="object-cover rounded"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate max-w-[120px] sm:max-w-[180px]">
                          {item.productName}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">{item.quantity} szt.</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {pkgOpt.package.items.length > 3 && (
                    <div className="flex items-center px-2 py-1 bg-gray-100 dark:bg-secondary-700 rounded-lg">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        +{pkgOpt.package.items.length - 3} więcej
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping methods */}
              <div className="bg-white dark:bg-secondary-800 px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Wybierz sposób dostawy:</p>
                
                {pkgOpt.shippingMethods.filter(method => method.available).map(method => (
                  <div key={method.id}>
                    <label
                      className={`
                        block p-2.5 sm:p-3 rounded-lg border-2 transition-all
                        ${selectedMethods[pkgOpt.package.id] === method.id
                          ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-400 shadow-sm'
                          : 'bg-white dark:bg-secondary-700 border-gray-200 dark:border-secondary-600 hover:border-orange-200 dark:hover:border-orange-500 cursor-pointer'
                        }
                      `}
                    >
                      {/* Main row: radio + name + badge + icon + price */}
                      <div className="flex items-center gap-2 sm:gap-3">
                        {/* Radio */}
                        <div
                          className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                            ${selectedMethods[pkgOpt.package.id] === method.id
                              ? 'border-orange-500 bg-orange-500'
                              : 'border-gray-300'
                            }
                          `}
                        >
                          {selectedMethods[pkgOpt.package.id] === method.id && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>

                        <input
                          type="radio"
                          name={`shipping-${pkgOpt.package.id}`}
                          value={method.id}
                          checked={selectedMethods[pkgOpt.package.id] === method.id}
                          onChange={() =>
                            handleMethodChange(pkgOpt.package.id, method.id as ShippingMethodId)
                          }
                          className="sr-only"
                        />

                        {/* Icon */}
                        <ShippingIcon id={method.id} />

                        {/* Name and delivery time */}
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-900 dark:text-white text-sm font-medium block">{method.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {method.estimatedDelivery}
                          </span>
                        </div>

                        {/* Price */}
                        <span className="text-gray-900 dark:text-white font-bold text-base whitespace-nowrap">
                          {method.price.toFixed(2).replace('.', ',')} zł
                        </span>
                      </div>
                    </label>

                    {/* Paczkomat selectors for this package - one per paczkomatPackageCount */}
                    {method.id === 'inpost_paczkomat' &&
                      selectedMethods[pkgOpt.package.id] === 'inpost_paczkomat' && (
                        <div className="mt-2 space-y-2">
                          {Array.from({ length: pkgOpt.package.paczkomatPackageCount || 1 }).map((_, slotIndex) => {
                            const selection = paczkomatSelections[pkgOpt.package.id]?.[slotIndex];
                            const paczkomatCount = pkgOpt.package.paczkomatPackageCount || 1;
                            const slotItems = getItemsForPaczkomatSlot(pkgOpt.package.items, slotIndex, paczkomatCount);
                            return (
                              <div key={slotIndex} className="p-2.5 sm:p-3 bg-[#FFF9E6] dark:bg-yellow-900/30 border border-[#FFCD00] dark:border-yellow-600 rounded-lg">
                                {paczkomatCount > 1 && (
                                  <div className="mb-2">
                                    <div className="text-xs font-medium text-[#1D1D1B] dark:text-yellow-200">
                                      Paczka {slotIndex + 1} z {paczkomatCount}
                                    </div>
                                    {/* Show which products go to this paczkomat */}
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {slotItems.map((item, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/70 dark:bg-secondary-700 rounded text-[10px] text-gray-600 dark:text-gray-300">
                                          {item.productImage && (
                                            <div className="w-4 h-4 relative flex-shrink-0">
                                              <Image src={item.productImage} alt="" fill sizes="16px" className="rounded object-cover" />
                                            </div>
                                          )}
                                          <span className="truncate max-w-[80px]">{item.productName.slice(0, 15)}...</span>
                                          {item.quantity > 1 && <span className="font-medium">×{item.quantity}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {selection?.code ? (
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#FFCD00] rounded-lg flex items-center justify-center flex-shrink-0">
                                      <svg
                                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1D1D1B]"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                        />
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                      </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900 dark:text-white text-xs sm:text-sm">
                                        {selection.code}
                                      </p>
                                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {selection.address}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => openPaczkomatWidget(pkgOpt.package.id, slotIndex)}
                                      className="text-[10px] sm:text-xs text-orange-600 hover:text-orange-700 font-medium shrink-0"
                                    >
                                      Zmień
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openPaczkomatWidget(pkgOpt.package.id, slotIndex)}
                                    className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 bg-[#FFCD00] text-[#1D1D1B] text-xs sm:text-sm font-semibold rounded-lg hover:bg-[#E6B800] transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                      />
                                    </svg>
                                    Wybierz paczkomat{paczkomatCount > 1 ? ` #${slotIndex + 1}` : ''}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                ))}
                
                {/* Custom address option - only for courier deliveries */}
                {selectedMethods[pkgOpt.package.id] && selectedMethods[pkgOpt.package.id] !== 'inpost_paczkomat' && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-secondary-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCustomAddress[pkgOpt.package.id] || false}
                        onChange={() => handleToggleCustomAddress(pkgOpt.package.id)}
                        className="w-4 h-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded dark:bg-secondary-700"
                      />
                      <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Wyślij pod inny adres</span>
                    </label>
                  
                  {/* Custom address form */}
                  {useCustomAddress[pkgOpt.package.id] && (
                    <div className="mt-2 sm:mt-3 p-3 sm:p-4 bg-gray-50 dark:bg-secondary-700 rounded-lg border border-gray-200 dark:border-secondary-600">
                      <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white mb-2 sm:mb-3">Adres dostawy dla tej przesyłki</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Imię *</label>
                          <input
                            type="text"
                            value={customAddresses[pkgOpt.package.id]?.firstName || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'firstName', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="Jan"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Nazwisko *</label>
                          <input
                            type="text"
                            value={customAddresses[pkgOpt.package.id]?.lastName || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'lastName', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="Kowalski"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Telefon *</label>
                          <input
                            type="tel"
                            value={customAddresses[pkgOpt.package.id]?.phone || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'phone', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="+48 123 456 789"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Ulica i numer *</label>
                          <input
                            type="text"
                            value={customAddresses[pkgOpt.package.id]?.street || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'street', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="ul. Przykładowa 10"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Nr mieszkania</label>
                          <input
                            type="text"
                            value={customAddresses[pkgOpt.package.id]?.apartment || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'apartment', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="5A"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Kod pocztowy *</label>
                          <input
                            type="text"
                            value={customAddresses[pkgOpt.package.id]?.postalCode || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'postalCode', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="00-001"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">Miasto *</label>
                          <input
                            type="text"
                            value={customAddresses[pkgOpt.package.id]?.city || ''}
                            onChange={(e) => handleCustomAddressChange(pkgOpt.package.id, 'city', e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-secondary-600 dark:bg-secondary-700 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="Warszawa"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Free shipping progress bar per warehouse */}
              {!pkgOpt.package.hasFreeShipping && pkgOpt.package.warehouseValue < 300 && (
                <div className="bg-orange-50 dark:bg-orange-900/30 px-4 py-3 border-t border-orange-100 dark:border-orange-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Do darmowej dostawy:</span>
                    <span className="text-sm font-semibold text-orange-600">
                      {(300 - pkgOpt.package.warehouseValue).toFixed(2).replace('.', ',')} zł
                    </span>
                  </div>
                  <div className="h-1.5 bg-orange-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-400 to-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((pkgOpt.package.warehouseValue / 300) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {pkgOpt.package.hasFreeShipping && (
                <div className="bg-green-50 dark:bg-green-900/30 px-4 py-2 border-t border-green-100 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">Darmowa dostawa!</span>
                  </div>
                </div>
              )}
              </div>
            </div>
          );
          })}
        </div>

        {/* Shipping summary */}
        <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-secondary-700 border-t dark:border-secondary-600">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Łączny koszt dostawy:</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              {calculateTotalPrice(packagesWithOptions, selectedMethods).toFixed(2).replace('.', ',')} zł
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-3 sm:mx-6 mb-3 sm:mb-4 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs sm:text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between px-3 sm:px-6 py-3 sm:py-4 border-t dark:border-secondary-600">
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

      {/* InPost GeoWidget Modal */}
      <InPostGeoWidget
        isOpen={geoWidgetSlot !== null}
        onClose={() => setGeoWidgetSlot(null)}
        onPointSelect={handlePointSelect}
      />
    </div>
  );
}
