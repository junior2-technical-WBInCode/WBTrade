'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { useAuth } from '../../../contexts/AuthContext';
import { ordersApi, Order } from '../../../lib/api';
import AccountSidebar from '../../../components/AccountSidebar';

export default function InvoicesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  async function fetchOrders() {
    try {
      setLoading(true);
      const response = await ordersApi.getAll(1, 100);
      // Filter to orders with invoice requested or business orders
      const invoiceOrders = response.orders.filter(
        (o) => o.wantInvoice || o.isBusinessOrder || o.billingNip
      );
      setOrders(invoiceOrders);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  // Filter orders eligible for collective invoicing (want collective, paid, no invoice number set yet)
  const pendingCollective = orders.filter(
    (o) => o.addToCollectiveInvoice && o.paymentStatus === 'PAID' && !o.collectiveInvoiceNumber
  );

  // Filter orders that have standard invoices or completed collective invoices
  const completedInvoices = orders.filter(
    (o) => !o.addToCollectiveInvoice || !!o.collectiveInvoiceNumber || o.paymentStatus !== 'PAID'
  );

  // Group completed collective invoices by collectiveInvoiceNumber
  const collectiveGroups: Record<string, {
    collectiveInvoiceNumber: string;
    issueDate: string;
    companyName: string;
    nip: string;
    total: number;
    orders: Order[];
  }> = {};

  const displayedInvoiceItems: any[] = [];

  completedInvoices.forEach((o) => {
    if (o.collectiveInvoiceNumber) {
      const num = o.collectiveInvoiceNumber;
      if (!collectiveGroups[num]) {
        collectiveGroups[num] = {
          collectiveInvoiceNumber: num,
          issueDate: o.collectiveInvoiceDate || o.createdAt,
          companyName: o.billingCompanyName || '',
          nip: o.billingNip || '',
          total: 0,
          orders: [],
        };
        displayedInvoiceItems.push(collectiveGroups[num]);
      }
      collectiveGroups[num].total += Number(o.total);
      collectiveGroups[num].orders.push(o);
    } else {
      displayedInvoiceItems.push(o); // regular order / standard invoice
    }
  });

  const handleCheckboxToggle = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSelectAllPending = () => {
    if (selectedOrderIds.length === pendingCollective.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(pendingCollective.map((o) => o.id));
    }
  };

  const handleGenerateCollectiveInvoice = async () => {
    if (selectedOrderIds.length === 0) return;
    
    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      const res = await ordersApi.generateCollectiveInvoice(selectedOrderIds);
      setSuccess(`Pomyślnie wygenerowano fakturę zbiorczą: ${res.collectiveInvoiceNumber}`);
      setSelectedOrderIds([]);
      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Wystąpił błąd podczas generowania faktury zbiorczej.');
    } finally {
      setGenerating(false);
    }
  };

  const formatPrice = (price: number) => {
    return Number(price).toFixed(2).replace('.', ',') + ' zł';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
      <Header />
      <div className="container-custom py-6 lg:py-10">
        <div className="flex gap-8">
          <AccountSidebar
            activeId="invoices"
            userName={user?.firstName ? `${user.firstName} ${user.lastName || ''}` : undefined}
            userEmail={user?.email}
          />

          <main className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Faktury</h1>
              {orders.length > 0 && (
                <button
                  onClick={() => {
                    const header = 'Nr faktury;Zamówienie;Data;Firma;NIP;Kwota brutto\n';
                    const rows = orders.map((o) => {
                      const invoiceNr = (o.collectiveInvoiceNumber || o.invoiceNumber || '').replace(/;/g, ',');
                      const date = new Date(o.createdAt).toLocaleDateString('pl-PL');
                      const company = (o.billingCompanyName || '').replace(/;/g, ',');
                      const nip = o.billingNip || '';
                      const total = Number(o.total).toFixed(2);
                      return `${invoiceNr};${o.orderNumber};${date};${company};${nip};${total}`;
                    }).join('\n');
                    const csv = header + rows;
                    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'faktury.csv';
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Pobierz CSV
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {success}
              </div>
            )}

            {/* B2B Pending Collective Invoices Section */}
            {pendingCollective.length > 0 && (
              <div className="mb-8 bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/30 rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                      Zamówienia oczekujące na fakturę zbiorczą
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Wybierz opłacone zamówienia, aby połączyć je w jedną fakturę zbiorczą.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSelectAllPending}
                      className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {selectedOrderIds.length === pendingCollective.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                    </button>
                    <button
                      onClick={handleGenerateCollectiveInvoice}
                      disabled={selectedOrderIds.length === 0 || generating}
                      className={`px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all flex items-center gap-1.5 ${
                        selectedOrderIds.length > 0 && !generating
                          ? 'bg-orange-500 hover:bg-orange-600 shadow-sm shadow-orange-500/20'
                          : 'bg-gray-300 dark:bg-secondary-700 cursor-not-allowed text-gray-500'
                      }`}
                    >
                      {generating ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Generowanie...
                        </>
                      ) : (
                        <>
                          🧾 Generuj zbiorczą ({selectedOrderIds.length})
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden border border-orange-100 dark:border-orange-900/20 rounded-lg bg-white dark:bg-secondary-800">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="bg-orange-50/20 dark:bg-secondary-750/30 border-b border-orange-50 dark:border-orange-900/10 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3 w-10 text-center">Wybór</th>
                        <th className="px-4 py-3 font-medium">Zamówienie</th>
                        <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Firma / NIP</th>
                        <th className="px-4 py-3 font-medium text-right">Kwota</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-secondary-700/50">
                      {pendingCollective.map((order) => {
                        const isSelected = selectedOrderIds.includes(order.id);
                        return (
                          <tr
                            key={order.id}
                            onClick={() => handleCheckboxToggle(order.id)}
                            className={`cursor-pointer hover:bg-gray-55 dark:hover:bg-secondary-700/20 transition-colors ${
                              isSelected ? 'bg-orange-500/5 dark:bg-orange-500/5' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleCheckboxToggle(order.id)}
                                className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded dark:bg-secondary-750"
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                              {order.orderNumber}
                              <span className="block sm:hidden text-xs text-gray-400 mt-0.5">
                                {new Date(order.createdAt).toLocaleDateString('pl-PL')}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell text-gray-600 dark:text-gray-400">
                              {new Date(order.createdAt).toLocaleDateString('pl-PL')}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-400">
                              {order.billingCompanyName && (
                                <span className="text-xs">
                                  {order.billingCompanyName}
                                  {order.billingNip && (
                                    <span className="block text-gray-400 dark:text-gray-500">NIP: {order.billingNip}</span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                              {formatPrice(order.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* List of generated Invoices */}
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Wygenerowane faktury i rachunki
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-secondary-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : displayedInvoiceItems.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-secondary-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-2">Brak wygenerowanych faktur</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
                  Faktury pojawią się tutaj po opłaceniu zamówień z opcją faktury VAT.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-secondary-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50/50 dark:bg-secondary-750/10">
                      <th className="px-4 py-3 font-medium">Nr faktury</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Powiązane zamówienia</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Firma / NIP</th>
                      <th className="px-4 py-3 font-medium text-right">Kwota</th>
                      <th className="px-4 py-3 font-medium text-right">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-secondary-700/50">
                    {displayedInvoiceItems.map((item) => {
                      const isCollective = !!item.collectiveInvoiceNumber;

                      if (isCollective) {
                        return (
                          <tr key={item.collectiveInvoiceNumber} className="hover:bg-gray-50 dark:hover:bg-secondary-700/30 transition-colors bg-orange-50/5 dark:bg-orange-950/5">
                            <td className="px-4 py-3">
                              <span className="font-semibold text-orange-600 dark:text-orange-500 flex items-center gap-1">
                                🧾 {item.collectiveInvoiceNumber}
                                <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                                  Zbiorcza
                                </span>
                              </span>
                              <span className="block text-xs text-gray-400 dark:text-gray-500 sm:hidden mt-0.5">
                                {item.orders.map((o: any) => o.orderNumber).join(', ')} · {new Date(item.issueDate).toLocaleDateString('pl-PL')}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {item.orders.map((o: any) => (
                                  <Link
                                    key={o.id}
                                    href={`/account/orders/${o.id}`}
                                    className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-secondary-700 rounded text-gray-600 dark:text-gray-300 hover:text-orange-500 transition-colors"
                                  >
                                    {o.orderNumber}
                                  </Link>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell text-gray-600 dark:text-gray-400">
                              {new Date(item.issueDate).toLocaleDateString('pl-PL')}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-400">
                              <span className="text-xs">
                                {item.companyName}
                                {item.nip && (
                                  <span className="block text-gray-400 dark:text-gray-500">NIP: {item.nip}</span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                              {formatPrice(item.total)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/account/invoices/collective/${encodeURIComponent(item.collectiveInvoiceNumber)}`}
                                className="text-xs font-semibold text-orange-600 dark:text-orange-500 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
                              >
                                Zobacz
                              </Link>
                            </td>
                          </tr>
                        );
                      }

                      // Standard single invoice / order
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-secondary-700/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {item.invoiceNumber || `FV/${new Date(item.createdAt).getFullYear()}/${String(new Date(item.createdAt).getMonth() + 1).padStart(2, '0')}/${item.orderNumber.replace('WB-', '')}`}
                            </span>
                            <span className="block text-xs text-gray-400 dark:text-gray-500 sm:hidden mt-0.5">
                              {item.orderNumber} · {new Date(item.createdAt).toLocaleDateString('pl-PL')}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <Link href={`/account/orders/${item.id}`} className="text-gray-600 dark:text-gray-400 hover:text-orange-500 transition-colors">
                              {item.orderNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-gray-600 dark:text-gray-400">
                            {new Date(item.createdAt).toLocaleDateString('pl-PL')}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-400">
                            {item.billingCompanyName && (
                              <span className="text-xs">
                                {item.billingCompanyName}
                                {item.billingNip && (
                                  <span className="block text-gray-400 dark:text-gray-500">NIP: {item.billingNip}</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                            {formatPrice(item.total)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.paymentStatus === 'PAID' ? (
                              <Link
                                href={`/account/orders/${item.id}/invoice`}
                                className="text-xs font-medium text-orange-600 dark:text-orange-500 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
                              >
                                Zobacz
                              </Link>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                                Oczekuje na płatność
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
