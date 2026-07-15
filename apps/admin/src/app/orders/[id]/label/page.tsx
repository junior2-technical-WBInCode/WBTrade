'use client';

import { useState, useEffect, use } from 'react';
import { ArrowLeft, Printer, Package, Truck } from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface OrderItem {
  productName: string;
  variantName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
}

interface PackageShipping {
  packageId: string;
  wholesaler?: string;
  method: string;
  price: number;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  customAddress?: {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    apartment?: string;
    postalCode: string;
    city: string;
  };
  items?: {
    productId: string;
    productName: string;
    variantId: string;
    quantity: number;
    image?: string;
  }[];
}

interface Order {
  id: string;
  orderNumber: string;
  shippingMethod: string;
  trackingNumber?: string;
  createdAt: string;
  total: number;
  status: string;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  packageShipping?: PackageShipping[];
  user?: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    companyName?: string;
    nip?: string;
  };
  guestFirstName?: string;
  guestLastName?: string;
  guestPhone?: string;
  guestEmail?: string;
  shippingAddress?: {
    firstName: string;
    lastName: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    phone?: string;
    companyName?: string;
  };
  items: OrderItem[];
  customerNotes?: string;
}

const WAREHOUSE_ADDRESSES: Record<string, { name: string; street: string; city: string; postalCode: string }> = {
  'hurtownia_przemyslowa': { name: 'Hurtownia Przemysłowa', street: 'ul. Magazynowa 12', city: 'Zielona Góra', postalCode: '65-001' },
  'hurtownia przemyslowa': { name: 'Hurtownia Przemysłowa', street: 'ul. Magazynowa 12', city: 'Zielona Góra', postalCode: '65-001' },
  'ikonka': { name: 'Ikonka', street: 'ul. Handlowa 5', city: 'Białystok', postalCode: '15-001' },
  'leker': { name: 'Leker', street: 'ul. Przemysłowa 8', city: 'Chynów', postalCode: '05-650' },
  'btp': { name: 'BTP', street: 'ul. Logistyczna 3', city: 'Chotów', postalCode: '97-200' },
  'dofirmy': { name: 'DoFirmy', street: 'ul. Portowa 15', city: 'Koszalin', postalCode: '75-001' },
  'hurtownia_kuchenna': { name: 'Hurtownia Kuchenna', street: 'ul. Gastronomiczna 7', city: 'Warszawa', postalCode: '02-001' },
  'hurtownia kuchenna': { name: 'Hurtownia Kuchenna', street: 'ul. Gastronomiczna 7', city: 'Warszawa', postalCode: '02-001' },
  'outlet': { name: 'Outlet WBTrade', street: 'ul. Handlowa 22', city: 'Rzeszów', postalCode: '35-001' },
  'default': { name: 'WBTrade', street: 'ul. Magazynowa 1', city: 'Warszawa', postalCode: '00-001' },
};

const SHIPPING_NAMES: Record<string, string> = {
  'inpost_paczkomat': 'InPost Paczkomat',
  'inpost_kurier': 'Kurier InPost',
  'dpd_kurier': 'Kurier DPD',
  'wysylka_gabaryt': 'Wysyłka gabaryt',
  'b2b_wysylka_wlasna': 'Wysyłka własna (B2B)',
  'odbior_osobisty_outlet': 'Odbiór osobisty',
};

export default function ShippingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function loadOrder() {
    try {
      setLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (!response.ok) throw new Error('Order not found');
      const data = await response.json();
      setOrder(data);
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setLoading(false);
    }
  }

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-slate-700 rounded animate-pulse"></div>
        <div className="h-[600px] bg-slate-700 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <Package className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-xl font-bold text-white mb-2">Zamówienie nie znalezione</h2>
        <Link href="/orders" className="text-orange-400 hover:text-orange-300">
          Wróć do listy zamówień
        </Link>
      </div>
    );
  }

  const labels = buildLabels(order);

  return (
    <div className="space-y-6">
      {/* Header - hide on print */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href={`/orders/${id}`}
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Etykiety do zamówienia</h1>
            <p className="text-gray-400">
              Zamówienie {order.orderNumber} • {labels.length} {labels.length === 1 ? 'etykieta' : labels.length < 5 ? 'etykiety' : 'etykiet'}
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 rounded-lg text-white font-medium hover:bg-orange-600 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Drukuj wszystkie
        </button>
      </div>

      {/* Labels */}
      <div className="space-y-8 print:space-y-0">
        {labels.map((label, index) => (
          <div key={index} className="flex justify-center print:block print:break-after-page">
            <div className="bg-white text-black p-6 rounded-xl shadow-2xl w-full max-w-[500px] print:max-w-none print:rounded-none print:shadow-none print:p-4 print:border print:border-gray-300">

              {/* Top bar */}
              <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-6 h-6" />
                  <div>
                    <p className="font-bold text-lg leading-tight">WBTrade</p>
                    <p className="text-xs text-gray-600">{label.shippingMethodName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-gray-500">#{order.orderNumber}</p>
                  <p className="text-xs">{new Date(order.createdAt).toLocaleDateString('pl-PL')}</p>
                  {labels.length > 1 && (
                    <p className="text-xs font-bold text-gray-600 mt-0.5">
                      Paczka {index + 1}/{labels.length}
                    </p>
                  )}
                </div>
              </div>

              {/* Tracking / Paczkomat */}
              {(label.trackingNumber || label.paczkomatCode) && (
                <div className="bg-gray-100 px-3 py-2 rounded mb-3 text-center">
                  {label.paczkomatCode && (
                    <>
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Paczkomat</p>
                      <p className="font-mono text-lg font-bold">{label.paczkomatCode}</p>
                      {label.paczkomatAddress && (
                        <p className="text-xs text-gray-600">{label.paczkomatAddress}</p>
                      )}
                    </>
                  )}
                  {label.trackingNumber && !label.paczkomatCode && (
                    <>
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Numer przesyłki</p>
                      <p className="font-mono text-lg font-bold tracking-wider">{label.trackingNumber}</p>
                    </>
                  )}
                </div>
              )}

              {/* Recipient */}
              <div className="border-2 border-black p-3 rounded mb-3">
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Odbiorca</p>
                {label.recipient.companyName && (
                  <p className="font-bold text-sm">{label.recipient.companyName}</p>
                )}
                <p className="font-bold text-base">{label.recipient.name}</p>
                <p className="text-sm">{label.recipient.street}</p>
                <p className="text-sm font-bold">{label.recipient.postalCode} {label.recipient.city}</p>
                {label.recipient.phone && (
                  <p className="text-xs text-gray-600 mt-1">Tel: {label.recipient.phone}</p>
                )}
              </div>

              {/* Sender */}
              <div className="border border-gray-300 p-3 rounded mb-3">
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Nadawca</p>
                <p className="font-medium text-sm">{label.sender.name}</p>
                <p className="text-xs">{label.sender.street}</p>
                <p className="text-xs">{label.sender.postalCode} {label.sender.city}</p>
              </div>

              {/* Package Contents */}
              {label.items.length > 0 && (
                <div className="border-t border-gray-200 pt-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Zawartość ({label.totalQty} szt.)</p>
                  <div className="space-y-0.5">
                    {label.items.slice(0, 6).map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="truncate max-w-[320px]">{item.name}</span>
                        <span className="font-medium ml-2 whitespace-nowrap">×{item.quantity}</span>
                      </div>
                    ))}
                    {label.items.length > 6 && (
                      <p className="text-xs text-gray-500 italic">... i {label.items.length - 6} więcej</p>
                    )}
                  </div>
                </div>
              )}

              {/* Customer notes */}
              {order.customerNotes && index === 0 && (
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Uwagi klienta</p>
                  <p className="text-xs italic">{order.customerNotes}</p>
                </div>
              )}

              {/* B2B marker */}
              {label.isB2b && (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-center">
                  <span className="text-xs font-bold text-blue-700">ZAMÓWIENIE B2B — PRZELEW</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Instructions - hide on print */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 print:hidden">
        <h3 className="font-semibold text-white mb-3">Instrukcje</h3>
        <ul className="space-y-1.5 text-gray-400 text-sm">
          <li>• Wydrukuj etykietę na papierze A6 (105×148mm) lub A5</li>
          <li>• Naklej etykietę na widocznym miejscu paczki</li>
          <li>• Dla wielu paczek — każda etykieta na osobnej paczce</li>
          <li>• Zamów odbiór kuriera lub nadaj paczkę w punkcie</li>
        </ul>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          #__next {
            visibility: visible;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          .print\\:break-after-page {
            break-after: page;
          }
          @page {
            size: A5;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
}

// ===== Build label data =====
interface LabelData {
  shippingMethodName: string;
  trackingNumber?: string;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  recipient: {
    name: string;
    companyName?: string;
    street: string;
    city: string;
    postalCode: string;
    phone?: string;
  };
  sender: { name: string; street: string; city: string; postalCode: string };
  items: { name: string; quantity: number }[];
  totalQty: number;
  isB2b: boolean;
}

function buildLabels(order: Order): LabelData[] {
  const isB2b = order.shippingMethod === 'b2b_wysylka_wlasna' ||
    order.packageShipping?.some(p => p.method === 'b2b_wysylka_wlasna') || false;

  if (order.packageShipping && order.packageShipping.length > 0) {
    return order.packageShipping.map(pkg => {
      const recipient = getRecipientForPackage(pkg, order);
      const sender = getSenderForPackage(pkg.wholesaler);
      const items = pkg.items?.map(i => ({ name: i.productName, quantity: i.quantity })) || [];
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

      return {
        shippingMethodName: SHIPPING_NAMES[pkg.method] || pkg.method,
        trackingNumber: order.trackingNumber,
        paczkomatCode: pkg.paczkomatCode,
        paczkomatAddress: pkg.paczkomatAddress,
        recipient,
        sender,
        items,
        totalQty,
        isB2b,
      };
    });
  }

  const recipientName = order.shippingAddress
    ? `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim()
    : `${order.user?.firstName || order.guestFirstName || ''} ${order.user?.lastName || order.guestLastName || ''}`.trim();

  const items = order.items.map(i => ({ name: i.productName, quantity: i.quantity }));
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

  return [{
    shippingMethodName: SHIPPING_NAMES[order.shippingMethod] || order.shippingMethod || 'Kurier',
    trackingNumber: order.trackingNumber,
    paczkomatCode: order.paczkomatCode,
    paczkomatAddress: order.paczkomatAddress,
    recipient: {
      name: recipientName || 'Odbiorca',
      companyName: order.shippingAddress?.companyName || order.user?.companyName,
      street: order.shippingAddress?.street || '',
      city: order.shippingAddress?.city || '',
      postalCode: order.shippingAddress?.postalCode || '',
      phone: order.shippingAddress?.phone || order.user?.phone || order.guestPhone,
    },
    sender: getSenderForPackage(undefined),
    items,
    totalQty,
    isB2b,
  }];
}

function getRecipientForPackage(pkg: PackageShipping, order: Order) {
  if (pkg.customAddress) {
    return {
      name: `${pkg.customAddress.firstName} ${pkg.customAddress.lastName}`.trim(),
      street: pkg.customAddress.apartment
        ? `${pkg.customAddress.street} m. ${pkg.customAddress.apartment}`
        : pkg.customAddress.street,
      city: pkg.customAddress.city,
      postalCode: pkg.customAddress.postalCode,
      phone: pkg.customAddress.phone,
    };
  }

  const addr = order.shippingAddress;
  return {
    name: addr
      ? `${addr.firstName || ''} ${addr.lastName || ''}`.trim()
      : `${order.user?.firstName || order.guestFirstName || ''} ${order.user?.lastName || order.guestLastName || ''}`.trim(),
    companyName: addr?.companyName || order.user?.companyName,
    street: addr?.street || '',
    city: addr?.city || '',
    postalCode: addr?.postalCode || '',
    phone: addr?.phone || order.user?.phone || order.guestPhone,
  };
}

function getSenderForPackage(wholesaler?: string) {
  if (wholesaler) {
    const key = wholesaler.toLowerCase().replace(/\s+/g, '_');
    if (WAREHOUSE_ADDRESSES[key]) return WAREHOUSE_ADDRESSES[key];
    // Try matching without normalization
    const found = Object.entries(WAREHOUSE_ADDRESSES).find(([k]) =>
      k.toLowerCase() === wholesaler.toLowerCase()
    );
    if (found) return found[1];
  }
  return WAREHOUSE_ADDRESSES['default'];
}
