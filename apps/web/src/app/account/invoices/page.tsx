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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    async function fetchOrders() {
      try {
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

    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

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
                      const invoiceNr = (o.invoiceNumber || '').replace(/;/g, ',');
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

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-secondary-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-secondary-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-2">Brak faktur</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Faktury pojawią się tutaj po złożeniu zamówienia z opcją faktury VAT.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-secondary-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">Nr faktury</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Zamówienie</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Firma / NIP</th>
                      <th className="px-4 py-3 font-medium text-right">Kwota</th>
                      <th className="px-4 py-3 font-medium text-right">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-secondary-700/50">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-secondary-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {order.invoiceNumber || '—'}
                          </span>
                          <span className="block text-xs text-gray-400 dark:text-gray-500 sm:hidden">
                            {order.orderNumber} · {new Date(order.createdAt).toLocaleDateString('pl-PL')}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Link href={`/account/orders/${order.id}`} className="text-gray-600 dark:text-gray-400 hover:text-primary-600 transition-colors">
                            {order.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-gray-600 dark:text-gray-400">
                          {new Date(order.createdAt).toLocaleDateString('pl-PL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {order.billingCompanyName && (
                            <span className="text-gray-700 dark:text-gray-300 text-xs">
                              {order.billingCompanyName}
                              {order.billingNip && (
                                <span className="block text-gray-400 dark:text-gray-500">NIP: {order.billingNip}</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {Number(order.total).toFixed(2).replace('.', ',')} zł
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/account/orders/${order.id}/invoice`}
                            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                          >
                            Zobacz
                          </Link>
                        </td>
                      </tr>
                    ))}
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
