'use client';

import { useState, useEffect } from 'react';
import { partnersApi } from '@/lib/api';
import Link from 'next/link';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs px-2.5 py-1 rounded-full font-medium">Oczekuje</span>;
    case 'COMPLETED':
      return <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Zrealizowana</span>;
    case 'REJECTED':
      return <span className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Odrzucona</span>;
    default:
      return status;
  }
}

export default function PayoutsListPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPayouts = async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const data = await partnersApi.listPayouts(statusFilter || undefined, page);
      setPayouts(data.payouts);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'Błąd pobierania wniosków o wypłatę.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts(1);
  }, [statusFilter]);

  const handleCompletePayout = async (id: string) => {
    const notes = prompt('Wpisz uwagi do realizacji wypłaty (np. numer przelewu):');
    if (notes === null) return; // cancelled
    try {
      await partnersApi.completePayout(id, notes);
      fetchPayouts(pagination.page);
    } catch (err: any) {
      alert(err.message || 'Nie udało się zrealizować wypłaty.');
    }
  };

  const handleRejectPayout = async (id: string) => {
    const reason = prompt('Podaj powód odrzucenia wypłaty (odbiorca zobaczy tę wiadomość):');
    if (!reason) return; // cancelled or empty
    try {
      await partnersApi.rejectPayout(id, reason);
      fetchPayouts(pagination.page);
    } catch (err: any) {
      alert(err.message || 'Nie udało się odrzucić wypłaty.');
    }
  };

  return (
          <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Program Partnerski — Wypłaty</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Przeglądaj wnioski o wypłatę prowizji partnerskich i akceptuj przelewy gotówkowe.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700/50 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status wypłaty:</span>
          <div className="flex gap-2">
            {[
              { label: 'Wszystkie', value: '' },
              { label: 'Oczekujące (PENDING)', value: 'PENDING' },
              { label: 'Zrealizowane (COMPLETED)', value: 'COMPLETED' },
              { label: 'Odrzucone (REJECTED)', value: 'REJECTED' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === f.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-secondary-900 dark:hover:bg-secondary-800 dark:text-gray-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="py-20 text-center text-gray-500 dark:text-gray-400">
              Brak wniosków o wypłatę o tym statusie.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-6 py-3">Partner / Użytkownik</th>
                    <th className="px-6 py-3">Dane firmy</th>
                    <th className="px-6 py-3 text-right">Kwota</th>
                    <th className="px-6 py-3">Metoda</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    <th className="px-6 py-3">Faktura PDF / Kupon</th>
                    <th className="px-6 py-3 text-right">Data</th>
                    <th className="px-6 py-3 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {payouts.map((pay) => (
                    <tr key={pay.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                      <td className="px-6 py-4">
                        <Link href={`/partners/${pay.partnerId}`} className="font-semibold text-gray-900 dark:text-white hover:text-orange-500 hover:underline">
                          {pay.partner.user.firstName} {pay.partner.user.lastName}
                        </Link>
                        <div className="text-xs text-gray-400">{pay.partner.user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {pay.partner.companyName ? (
                          <>
                            <div className="text-gray-800 dark:text-gray-300 font-medium text-xs">{pay.partner.companyName}</div>
                            {pay.partner.nip && <div className="text-[10px] text-gray-400">NIP: {pay.partner.nip}</div>}
                          </>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">{Number(pay.amount).toFixed(2)} PLN</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold">
                          {pay.type === 'COUPON' ? 'Kupon rabatowy' : 'Przelew bankowy'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">{statusBadge(pay.status)}</td>
                      <td className="px-6 py-4 text-xs font-mono">
                        {pay.couponCode && (
                          <div className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-bold text-center border border-dashed border-orange-200">{pay.couponCode}</div>
                        )}
                        {pay.invoiceUrl && (
                          <a
                            href={pay.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-semibold text-center border border-blue-100 hover:bg-blue-100 block"
                          >
                            Pobierz PDF ↗
                          </a>
                        )}
                        {pay.notes && <div className="text-gray-400 text-[10px] mt-1 max-w-[150px] truncate" title={pay.notes}>Uwagi: {pay.notes}</div>}
                      </td>
                      <td className="px-6 py-4 text-right text-xs">
                        {formatDate(pay.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {pay.status === 'PENDING' && pay.type === 'CASH' && (
                          <>
                            <button
                              onClick={() => handleCompletePayout(pay.id)}
                              className="text-xs font-semibold text-green-600 hover:text-green-700 cursor-pointer"
                            >
                              Oznacz jako opłacone
                            </button>
                            <button
                              onClick={() => handleRejectPayout(pay.id)}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                            >
                              Odrzuć wniosek
                            </button>
                          </>
                        )}
                        {pay.status === 'PENDING' && pay.type === 'COUPON' && (
                          <span className="text-xs text-gray-400">Autogenerowane</span>
                        )}
                        {pay.status !== 'PENDING' && (
                          <span className="text-xs text-gray-300">Brak akcji</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t border-gray-100 dark:border-secondary-700/50">
              <span className="text-xs text-gray-500">Strona {pagination.page} z {pagination.totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page === 1}
                  onClick={() => fetchPayouts(pagination.page - 1)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Poprzednia
                </button>
                <button
                  disabled={pagination.page === pagination.totalPages}
                  onClick={() => fetchPayouts(pagination.page + 1)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Następna
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
