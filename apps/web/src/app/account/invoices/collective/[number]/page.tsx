'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Header from '../../../../../components/Header';
import Footer from '../../../../../components/Footer';
import { useAuth } from '../../../../../contexts/AuthContext';
import { ordersApi, Order } from '../../../../../lib/api';

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

export default function CollectiveInvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const decodedNumber = decodeURIComponent(number);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    if (isAuthenticated && decodedNumber) {
      loadCollectiveInvoice();
    }
  }, [decodedNumber, isAuthenticated, authLoading, router]);

  async function loadCollectiveInvoice() {
    try {
      setLoading(true);
      const data = await ordersApi.getCollectiveInvoice(decodedNumber);
      setOrders(data);
    } catch (err) {
      console.error('Failed to load collective invoice:', err);
      setError('Nie udało się załadować danych faktury zbiorczej');
    } finally {
      setLoading(false);
    }
  }

  const handlePrint = () => {
    window.print();
  };

  const formatPrice = (price: number | string | null | undefined) => {
    const num = Number(price) || 0;
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(num);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  if (authLoading || loading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 dark:bg-secondary-950 pt-6 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="animate-pulse">
              <div className="h-8 w-48 bg-gray-200 dark:bg-secondary-700 rounded mb-6"></div>
              <div className="h-[600px] bg-gray-200 dark:bg-secondary-700 rounded"></div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error || orders.length === 0) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 dark:bg-secondary-950 pt-6 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-16">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{error || 'Faktura zbiorcza nie istnieje'}</h2>
            <Link href="/account/invoices" className="text-orange-500 hover:text-orange-600">
              Wróć do listy faktur
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // Generate date of issue from collective invoice date of the first order (or fallback)
  const invoiceDate = formatDate(orders[0].collectiveInvoiceDate || orders[0].createdAt);
  
  // Due date (usually standard display, e.g. paid online)
  const billingAddress = orders[0].billingAddress || orders[0].shippingAddress;

  // Gather all items from all orders and flag them with their respective order numbers
  const allInvoiceItems: Array<{
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
    orderNumber: string;
  }> = [];

  orders.forEach((order) => {
    order.items.forEach((item) => {
      allInvoiceItems.push({
        id: item.id,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        orderNumber: order.orderNumber,
      });
    });
  });

  // Group positions by product (SKU + variant) AND unit price - the same product sold
  // at a different price is treated as a separate invoice position, but the same
  // product sold at the same price across multiple orders is merged into one position.
  const invoicePositionsMap = new Map<
    string,
    {
      productName: string;
      variantName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      total: number;
      orderNumbers: string[];
    }
  >();

  allInvoiceItems.forEach((item) => {
    const key = `${item.sku}__${item.unitPrice.toFixed(2)}`;
    const existing = invoicePositionsMap.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.total += item.total;
      if (!existing.orderNumbers.includes(item.orderNumber)) {
        existing.orderNumbers.push(item.orderNumber);
      }
    } else {
      invoicePositionsMap.set(key, {
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        orderNumbers: [item.orderNumber],
      });
    }
  });

  const invoicePositions = Array.from(invoicePositionsMap.values());

  // Group "Obsługa zamówień" positions by price - orders with a different shipping
  // cost become separate invoice positions, same rule as for products.
  const shippingPositionsMap = new Map<string, { unitPrice: number; quantity: number; total: number }>();

  orders.forEach((order) => {
    const shippingPrice = Number(order.shipping);
    if (shippingPrice <= 0) return;
    const key = shippingPrice.toFixed(2);
    const existing = shippingPositionsMap.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.total += shippingPrice;
    } else {
      shippingPositionsMap.set(key, { unitPrice: shippingPrice, quantity: 1, total: shippingPrice });
    }
  });

  const shippingPositions = Array.from(shippingPositionsMap.values());

  // Calculate combined totals
  const subtotal = orders.reduce((sum, o) => sum + Number(o.subtotal), 0);
  const shipping = orders.reduce((sum, o) => sum + Number(o.shipping), 0);
  const discount = orders.reduce((sum, o) => sum + Number(o.discount), 0);
  const total = orders.reduce((sum, o) => sum + Number(o.total), 0);

  const grossTotal = subtotal + shipping;
  const netTotal = grossTotal / 1.23;
  const vatAmount = grossTotal - netTotal;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 dark:bg-secondary-950 pt-6 pb-16 print:bg-white print:pt-0 print:pb-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header - hide on print */}
          <div className="flex items-center justify-between mb-6 print:hidden">
            <div className="flex items-center gap-4">
              <Link
                href="/account/invoices"
                className="p-2 bg-white dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-lg hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Faktura Zbiorcza VAT</h1>
                <p className="text-gray-500 dark:text-gray-400">Połączono {orders.length} zamówień</p>
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-lg text-white hover:bg-orange-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Drukuj / PDF
            </button>
          </div>

          {/* Invoice Page Container */}
          <div className="bg-white text-black p-8 rounded-xl shadow-sm border border-gray-200 print:rounded-none print:shadow-none print:border-0 print:p-0">
            {/* Invoice Header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">ZBIORCZA FAKTURA VAT</h1>
                <p className="text-orange-600 font-semibold text-lg">{decodedNumber}</p>
                <div className="mt-2 text-xs text-gray-500 print:hidden">
                  <span className="font-semibold">Powiązane zamówienia:</span>{' '}
                  {orders.map((o) => o.orderNumber).join(', ')}
                </div>
              </div>
              <div className="text-right">
                <Image
                  src="/images/WB-TRADE-logo.webp"
                  alt="WB Trade"
                  width={150}
                  height={48}
                  className="h-12 w-auto ml-auto mb-1"
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
                <p className="text-gray-500">Status płatności</p>
                <p className="font-bold text-green-600">OPŁACONO</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-gray-500">Metoda płatności</p>
                <p className="font-semibold text-xs">Płatności zbiorcze (Online)</p>
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
                  {billingAddress ? (
                    <>
                      <p className="font-bold text-lg">
                        {orders[0].billingCompanyName || `${billingAddress.firstName} ${billingAddress.lastName}`}
                      </p>
                      {orders[0].billingNip && <p className="text-gray-600 font-medium">NIP: {orders[0].billingNip}</p>}
                      <p className="text-gray-600">{billingAddress.street}</p>
                      <p className="text-gray-600">
                        {billingAddress.postalCode} {billingAddress.city}
                      </p>
                      <p className="text-gray-600">{billingAddress.country}</p>
                    </>
                  ) : (
                    <p className="text-gray-400 italic">Brak danych nabywcy</p>
                  )}
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800 text-white text-sm">
                    <th className="py-3 px-4 text-left rounded-tl">Lp.</th>
                    <th className="py-3 px-4 text-left">Nazwa produktu</th>
                    <th className="py-3 px-4 text-center">Ilość</th>
                    <th className="py-3 px-4 text-center">J.m.</th>
                    <th className="py-3 px-4 text-right">Cena netto</th>
                    <th className="py-3 px-4 text-right">Wartość netto</th>
                    <th className="py-3 px-4 text-center">Stawka VAT</th>
                    <th className="py-3 px-4 text-right">Kwota VAT</th>
                    <th className="py-3 px-4 text-right rounded-tr">Wartość brutto</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {invoicePositions.map((position, index) => {
                    const netPrice = position.unitPrice / 1.23;
                    const netValue = position.total / 1.23;
                    const vatValue = position.total - netValue;

                    return (
                      <tr key={`${position.sku}-${position.unitPrice}-${index}`} className="border-b border-gray-200">
                        <td className="py-3 px-4">{index + 1}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium">{position.productName}</p>
                          <p className="text-xs text-gray-500">
                            {position.variantName} • SKU: {position.sku} • Zamówienie:{' '}
                            <span className="font-semibold text-orange-600">{position.orderNumbers.join(', ')}</span>
                          </p>
                        </td>
                        <td className="py-3 px-4 text-center">{position.quantity}</td>
                        <td className="py-3 px-4 text-center">szt.</td>
                        <td className="py-3 px-4 text-right">{formatPrice(netPrice)}</td>
                        <td className="py-3 px-4 text-right">{formatPrice(netValue)}</td>
                        <td className="py-3 px-4 text-center">23%</td>
                        <td className="py-3 px-4 text-right">{formatPrice(vatValue)}</td>
                        <td className="py-3 px-4 text-right font-medium">{formatPrice(position.total)}</td>
                      </tr>
                    );
                  })}

                  {/* Order handling positions, split by price - one row per distinct shipping cost */}
                  {shippingPositions.map((position, index) => {
                    const netPrice = position.unitPrice / 1.23;
                    const netValue = position.total / 1.23;
                    const vatValue = position.total - netValue;

                    return (
                      <tr key={`shipping-${position.unitPrice}-${index}`} className="border-b border-gray-200 bg-gray-50/50">
                        <td className="py-3 px-4">{invoicePositions.length + index + 1}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium">Obsługa zamówień</p>
                        </td>
                        <td className="py-3 px-4 text-center">{position.quantity}</td>
                        <td className="py-3 px-4 text-center">szt.</td>
                        <td className="py-3 px-4 text-right">{formatPrice(netPrice)}</td>
                        <td className="py-3 px-4 text-right">{formatPrice(netValue)}</td>
                        <td className="py-3 px-4 text-center">23%</td>
                        <td className="py-3 px-4 text-right">{formatPrice(vatValue)}</td>
                        <td className="py-3 px-4 text-right font-medium">{formatPrice(position.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="flex justify-end mb-8">
              <div className="w-80">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Wartość netto (łączna)</span>
                    <span className="font-medium">{formatPrice(netTotal)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">VAT (23%)</span>
                    <span className="font-medium">{formatPrice(vatAmount)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-200 text-green-600">
                      <span>Rabat sumaryczny</span>
                      <span className="font-medium">-{formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 bg-gray-800 text-white rounded px-3 mt-2">
                    <span className="font-bold">RAZEM (BRUTTO)</span>
                    <span className="font-bold text-lg">{formatPrice(total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Paid Stamp Info */}
            <div className="bg-green-50/50 border border-green-200 text-green-800 p-4 rounded-lg mb-8 flex items-center justify-between">
              <div>
                <p className="font-bold text-base uppercase tracking-wider mb-0.5">DOKUMENT OPŁACONY</p>
                <p className="text-xs text-green-700">Wszystkie powiązane zamówienia zostały w pełni opłacone przed wygenerowaniem faktury zbiorczej.</p>
              </div>
              <div className="text-green-600">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 pt-4 text-xs text-gray-500">
              <div className="flex justify-between">
                <div>
                  <p>Dokument zbiorczy wygenerowany elektronicznie w panelu B2B</p>
                  <p>Nie wymaga podpisu</p>
                </div>
                <div className="text-right">
                  <p>WBTrade Sp. z o.o.</p>
                  <p>www.wbtrade.pl | kontakt@wbtrade.pl</p>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions - hide on print */}
          <div className="mt-6 bg-gray-100 dark:bg-secondary-800 rounded-xl border border-gray-200 dark:border-secondary-700 p-6 print:hidden">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">💡 Jak zapisać jako PDF?</h3>
            <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li>Kliknij przycisk &quot;Drukuj / PDF&quot; powyżej</li>
              <li>W oknie drukowania wybierz &quot;Zapisz jako PDF&quot; jako drukarkę</li>
              <li><strong>Wyłącz &quot;Nagłówki i stopki&quot;</strong> w opcjach drukowania</li>
              <li>Kliknij &quot;Zapisz&quot; i wybierz lokalizację pliku</li>
            </ol>
          </div>
        </div>
      </main>
      <Footer />

      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 15mm 15mm 15mm 15mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header, footer, nav {
            display: none !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          table {
            page-break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
          }
          .bg-white {
            page-break-inside: avoid;
          }
          .w-80 {
            page-break-inside: avoid;
          }
          .bg-gray-50 {
            page-break-inside: avoid;
          }
        }
      `}} />
    </>
  );
}
