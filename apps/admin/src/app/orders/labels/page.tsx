'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer, Package, Truck } from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

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
  }[];
}

interface Order {
  id: string;
  orderNumber: string;
  shippingMethod: string;
  trackingNumber?: string;
  createdAt: string;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  packageShipping?: PackageShipping[];
  user?: {
    firstName: string;
    lastName: string;
    phone?: string;
    companyName?: string;
  };
  guestFirstName?: string;
  guestLastName?: string;
  guestPhone?: string;
  shippingAddress?: {
    firstName: string;
    lastName: string;
    street: string;
    city: string;
    postalCode: string;
    phone?: string;
    companyName?: string;
  };
  items: { productName: string; quantity: number }[];
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

interface LabelData {
  orderNumber: string;
  orderDate: string;
  shippingMethodName: string;
  trackingNumber?: string;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  packageIndex?: number;
  packageTotal?: number;
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
  customerNotes?: string;
}

export default function BulkLabelsPage() {
  const searchParams = useSearchParams();
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const ids = searchParams.get('ids');
    if (ids) {
      loadOrders(ids.split(','));
    } else {
      setError('Brak wybranych zamówień');
      setLoading(false);
    }
  }, [searchParams]);

  async function loadOrders(ids: string[]) {
    try {
      setLoading(true);
      const token = getAuthToken();
      const allLabels: LabelData[] = [];

      for (const id of ids) {
        const response = await fetch(`${API_URL}/orders/${id}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });
        if (!response.ok) continue;
        const order: Order = await response.json();
        allLabels.push(...buildLabelsForOrder(order));
      }

      setLabels(allLabels);
    } catch (err) {
      setError('Błąd ładowania zamówień');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Ładowanie etykiet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <Package className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-xl font-bold text-white mb-2">{error}</h2>
        <Link href="/orders" className="text-orange-400 hover:text-orange-300">
          Wróć do listy zamówień
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href="/orders"
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Drukowanie etykiet</h1>
            <p className="text-gray-400">
              {labels.length} {labels.length === 1 ? 'etykieta' : labels.length < 5 ? 'etykiety' : 'etykiet'} do wydruku
            </p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 rounded-lg text-white font-medium hover:bg-orange-600 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Drukuj wszystkie
        </button>
      </div>

      {/* Labels grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-1 print:gap-0">
        {labels.map((label, index) => (
          <div key={index} className="print:break-after-page">
            <div className="bg-white text-black p-5 rounded-xl shadow-lg print:rounded-none print:shadow-none print:p-4 print:border print:border-gray-300">
              {/* Top bar */}
              <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-2">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  <div>
                    <p className="font-bold text-base leading-tight">WBTrade</p>
                    <p className="text-[10px] text-gray-600">{label.shippingMethodName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] text-gray-500">#{label.orderNumber}</p>
                  <p className="text-[10px]">{label.orderDate}</p>
                  {label.packageTotal && label.packageTotal > 1 && (
                    <p className="text-[10px] font-bold">Paczka {label.packageIndex}/{label.packageTotal}</p>
                  )}
                </div>
              </div>

              {/* Paczkomat / Tracking */}
              {(label.trackingNumber || label.paczkomatCode) && (
                <div className="bg-gray-100 px-2 py-1.5 rounded mb-2 text-center">
                  {label.paczkomatCode ? (
                    <>
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Paczkomat</p>
                      <p className="font-mono text-sm font-bold">{label.paczkomatCode}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Nr przesyłki</p>
                      <p className="font-mono text-sm font-bold">{label.trackingNumber}</p>
                    </>
                  )}
                </div>
              )}

              {/* Recipient */}
              <div className="border-2 border-black p-2.5 rounded mb-2">
                <p className="text-[9px] text-gray-500 font-bold uppercase mb-0.5">Odbiorca</p>
                {label.recipient.companyName && (
                  <p className="font-bold text-xs">{label.recipient.companyName}</p>
                )}
                <p className="font-bold text-sm">{label.recipient.name}</p>
                <p className="text-xs">{label.recipient.street}</p>
                <p className="text-xs font-bold">{label.recipient.postalCode} {label.recipient.city}</p>
                {label.recipient.phone && (
                  <p className="text-[10px] text-gray-600">Tel: {label.recipient.phone}</p>
                )}
              </div>

              {/* Sender */}
              <div className="border border-gray-300 p-2 rounded mb-2">
                <p className="text-[9px] text-gray-500 font-bold uppercase mb-0.5">Nadawca</p>
                <p className="font-medium text-xs">{label.sender.name}</p>
                <p className="text-[10px]">{label.sender.street}, {label.sender.postalCode} {label.sender.city}</p>
              </div>

              {/* Contents */}
              {label.items.length > 0 && (
                <div className="border-t border-gray-200 pt-1.5">
                  <p className="text-[9px] text-gray-500 font-bold uppercase">Zawartość ({label.totalQty} szt.)</p>
                  {label.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="truncate max-w-[250px]">{item.name}</span>
                      <span className="font-medium">×{item.quantity}</span>
                    </div>
                  ))}
                  {label.items.length > 4 && (
                    <p className="text-[10px] text-gray-500">... +{label.items.length - 4}</p>
                  )}
                </div>
              )}

              {/* B2B badge */}
              {label.isB2b && (
                <div className="mt-1.5 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-center">
                  <span className="text-[10px] font-bold text-blue-700">B2B — PRZELEW</span>
                </div>
              )}
            </div>
          </div>
        ))}
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

function buildLabelsForOrder(order: Order): LabelData[] {
  const isB2b = order.shippingMethod === 'b2b_wysylka_wlasna' ||
    order.packageShipping?.some(p => p.method === 'b2b_wysylka_wlasna') || false;
  const orderDate = new Date(order.createdAt).toLocaleDateString('pl-PL');

  if (order.packageShipping && order.packageShipping.length > 0) {
    return order.packageShipping.map((pkg, idx) => {
      const recipient = getRecipient(pkg, order);
      const sender = getSender(pkg.wholesaler);
      const items = pkg.items?.map(i => ({ name: i.productName, quantity: i.quantity })) || [];
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

      return {
        orderNumber: order.orderNumber,
        orderDate,
        shippingMethodName: SHIPPING_NAMES[pkg.method] || pkg.method,
        trackingNumber: order.trackingNumber,
        paczkomatCode: pkg.paczkomatCode,
        paczkomatAddress: pkg.paczkomatAddress,
        packageIndex: idx + 1,
        packageTotal: order.packageShipping!.length,
        recipient,
        sender,
        items,
        totalQty,
        isB2b,
        customerNotes: order.customerNotes,
      };
    });
  }

  const recipientName = order.shippingAddress
    ? `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim()
    : `${order.user?.firstName || order.guestFirstName || ''} ${order.user?.lastName || order.guestLastName || ''}`.trim();

  const items = order.items.map(i => ({ name: i.productName, quantity: i.quantity }));
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

  return [{
    orderNumber: order.orderNumber,
    orderDate,
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
    sender: getSender(undefined),
    items,
    totalQty,
    isB2b,
    customerNotes: order.customerNotes,
  }];
}

function getRecipient(pkg: PackageShipping, order: Order) {
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

function getSender(wholesaler?: string) {
  if (wholesaler) {
    const key = wholesaler.toLowerCase().replace(/\s+/g, '_');
    if (WAREHOUSE_ADDRESSES[key]) return WAREHOUSE_ADDRESSES[key];
    const found = Object.entries(WAREHOUSE_ADDRESSES).find(([k]) =>
      k.toLowerCase() === wholesaler.toLowerCase()
    );
    if (found) return found[1];
  }
  return WAREHOUSE_ADDRESSES['default'];
}
