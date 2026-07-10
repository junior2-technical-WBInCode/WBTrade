'use client';

import { useState, useEffect, use } from 'react';
import { ArrowLeft, Printer, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// Shipping method display names
const shippingMethodNames: Record<string, string> = {
  'inpost_paczkomat': 'InPost Paczkomat',
  'inpost_paczkomaty': 'InPost Paczkomat',
  'inpost_kurier': 'Kurier InPost',
  'inpost_courier': 'Kurier InPost',
  'dpd_kurier': 'Kurier DPD',
  'dpd_courier': 'Kurier DPD',
  'dpd': 'Kurier DPD',
  'dhl_kurier': 'Kurier DHL',
  'dhl': 'Kurier DHL',
  'ups': 'Kurier UPS',
  'gls': 'Kurier GLS',
  'poczta_polska': 'Poczta Polska',
  'pocztex': 'Pocztex',
  'fedex': 'Kurier FedEx',
  'wysylka_gabaryt': 'Wysyłka gabaryt',
};

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  shippingMethod?: string;
  createdAt: string;
  user?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  shippingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  items: OrderItem[];
}

const paymentMethods: Record<string, string> = {
  CARD: 'Karta płatnicza',
  BLIK: 'BLIK',
  TRANSFER: 'Przelew bankowy',
  CASH: 'Gotówka przy odbiorze',
};

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
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

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  const formatDate = (dateStr: string) => 
    new Date(dateStr).toLocaleDateString('pl-PL', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric'
    });

  // Generate invoice number based on order
  const generateInvoiceNumber = () => {
    const date = new Date(order?.createdAt || new Date());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `FV/${year}/${month}/${order?.orderNumber?.replace('WB-', '') || '000'}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-slate-700 rounded animate-pulse"></div>
        <div className="h-[800px] bg-slate-700 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <FileText className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-xl font-bold text-white mb-2">Zamówienie nie znalezione</h2>
        <Link href="/orders" className="text-orange-400 hover:text-orange-300">
          Wróć do listy zamówień
        </Link>
      </div>
    );
  }

  const invoiceNumber = generateInvoiceNumber();
  const invoiceDate = formatDate(order.createdAt);
  const dueDate = formatDate(new Date(new Date(order.createdAt).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString());
  const billingAddress = order.billingAddress || order.shippingAddress;

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
            <h1 className="text-2xl font-bold text-white">Faktura VAT</h1>
            <p className="text-gray-400">Zamówienie {order.orderNumber}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-lg text-white hover:bg-orange-600 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Drukuj / PDF
          </button>
        </div>
      </div>

      {/* Invoice Preview */}
      <div className="flex justify-center print:block">
        <div 
          className="bg-white text-black p-8 rounded-xl shadow-2xl w-full max-w-[800px] print:max-w-none print:rounded-none print:shadow-none print:p-0"
        >
          {/* Invoice Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">FAKTURA VAT</h1>
              <p className="text-gray-500 text-lg">{invoiceNumber}</p>
            </div>
            <div className="text-right">
              <img 
                src="/images/WB-TRADE-logo.png" 
                alt="WB Trade" 
                className="h-12 ml-auto mb-1"
              />
              <p className="text-gray-600 text-sm">Sp. z o.o.</p>
            </div>
          </div>

          {/* Dates & Info */}
          <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-gray-500">Data wystawienia</p>
              <p className="font-semibold">{invoiceDate}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-gray-500">Termin płatności</p>
              <p className="font-semibold">{dueDate}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-gray-500">Metoda płatności</p>
              <p className="font-semibold">{paymentMethods[order.paymentMethod] || order.paymentMethod}</p>
            </div>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Seller */}
            <div>
              <p className="text-xs text-gray-500 font-bold mb-2 uppercase tracking-wider">Sprzedawca</p>
              <div className="border-l-4 border-orange-500 pl-4">
                <p className="font-bold text-lg">WB PARTNERS Sp. z o.o.</p>
                <p className="text-gray-600">ul. Juliusza Słowackiego 24/11</p>
                <p className="text-gray-600">35-060 Rzeszów</p>
                <p className="text-gray-600 mt-2">NIP: 5170455185</p>
                <p className="text-gray-600">REGON: 540735769</p>
                <p className="text-gray-600">KRS: 0001151642</p>
              </div>
            </div>
            
            {/* Buyer */}
            <div>
              <p className="text-xs text-gray-500 font-bold mb-2 uppercase tracking-wider">Nabywca</p>
              <div className="border-l-4 border-gray-300 pl-4">
                {order.user ? (
                  <>
                    <p className="font-bold text-lg">
                      {order.user.firstName} {order.user.lastName}
                    </p>
                    {billingAddress && (
                      <>
                        <p className="text-gray-600">{billingAddress.street}</p>
                        <p className="text-gray-600">
                          {billingAddress.postalCode} {billingAddress.city}
                        </p>
                        <p className="text-gray-600">{billingAddress.country}</p>
                      </>
                    )}
                    <p className="text-gray-600 mt-2">{order.user.email}</p>
                  </>
                ) : (
                  <p className="text-gray-500">Klient indywidualny</p>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800 text-white text-sm">
                  <th className="py-3 px-4 text-left rounded-tl">Lp.</th>
                  <th className="py-3 px-4 text-left">Nazwa produktu</th>
                  <th className="py-3 px-4 text-center">Ilość</th>
                  <th className="py-3 px-4 text-right">Cena netto</th>
                  <th className="py-3 px-4 text-center">VAT</th>
                  <th className="py-3 px-4 text-right">Wartość netto</th>
                  <th className="py-3 px-4 text-right rounded-tr">Wartość brutto</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {order.items.map((item, index) => {
                  const netPrice = item.unitPrice / 1.23;
                  const netTotal = item.total / 1.23;
                  const vatAmount = item.total - netTotal;
                  
                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-3 px-4">{index + 1}</td>
                      <td className="py-3 px-4">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-gray-500">{item.variantName} • SKU: {item.sku}</p>
                      </td>
                      <td className="py-3 px-4 text-center">{item.quantity}</td>
                      <td className="py-3 px-4 text-right">{formatPrice(netPrice)}</td>
                      <td className="py-3 px-4 text-center">23%</td>
                      <td className="py-3 px-4 text-right">{formatPrice(netTotal)}</td>
                      <td className="py-3 px-4 text-right font-medium">{formatPrice(item.total)}</td>
                    </tr>
                  );
                })}
                
                {/* Shipping row */}
                {order.shipping > 0 && (
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4">{order.items.length + 1}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium">Dostawa - {order.shippingMethod ? (shippingMethodNames[order.shippingMethod] || order.shippingMethod) : 'Standardowa'}</p>
                    </td>
                    <td className="py-3 px-4 text-center">1</td>
                    <td className="py-3 px-4 text-right">{formatPrice(order.shipping / 1.23)}</td>
                    <td className="py-3 px-4 text-center">23%</td>
                    <td className="py-3 px-4 text-right">{formatPrice(order.shipping / 1.23)}</td>
                    <td className="py-3 px-4 text-right font-medium">{formatPrice(order.shipping)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex justify-end mb-8">
            <div className="w-80">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">Wartość netto</span>
                  <span className="font-medium">{formatPrice((order.subtotal + order.shipping) / 1.23)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">VAT (23%)</span>
                  <span className="font-medium">{formatPrice(order.tax)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between py-2 border-b border-gray-200 text-green-600">
                    <span>Rabat</span>
                    <span className="font-medium">-{formatPrice(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 bg-gray-800 text-white rounded px-3 mt-2">
                  <span className="font-bold">DO ZAPŁATY</span>
                  <span className="font-bold text-lg">{formatPrice(order.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-gray-50 p-4 rounded mb-8">
            <p className="font-semibold text-gray-800 mb-2">Dane do przelewu:</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Nazwa banku</p>
                <p className="font-medium">mBank S.A.</p>
              </div>
              <div>
                <p className="text-gray-500">Numer konta</p>
                <p className="font-medium font-mono">12 1140 2004 0000 3102 1234 5678</p>
              </div>
              <div>
                <p className="text-gray-500">Tytuł przelewu</p>
                <p className="font-medium">{invoiceNumber}</p>
              </div>
              <div>
                <p className="text-gray-500">SWIFT/BIC</p>
                <p className="font-medium">BREXPLPWMBK</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-4 text-xs text-gray-500">
            <div className="flex justify-between">
              <div>
                <p>Dokument wygenerowany elektronicznie</p>
                <p>Nie wymaga podpisu</p>
              </div>
              <div className="text-right">
                <p>WBTrade Sp. z o.o.</p>
                <p>www.wbtrade.pl | kontakt@wbtrade.pl</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions - hide on print */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 print:hidden">
        <h3 className="font-semibold text-white mb-4">Opcje eksportu</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-white"
          >
            <Printer className="w-5 h-5" />
            <span>Drukuj</span>
          </button>
          <button 
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-white"
          >
            <Download className="w-5 h-5" />
            <span>Zapisz jako PDF</span>
          </button>
          <button 
            className="flex items-center justify-center gap-2 p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-white opacity-50 cursor-not-allowed"
            disabled
          >
            <FileText className="w-5 h-5" />
            <span>Wyślij emailem</span>
          </button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
        }
      `}</style>
    </div>
  );
}
