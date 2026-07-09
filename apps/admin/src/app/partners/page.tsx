'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { partnersApi } from '@/lib/api';
import { RANK_LABELS } from '@/lib/ranks';

export default function PartnersListPage() {
  const [partners, setPartners] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [rankFilter, setRankFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPartners = async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const data = await partnersApi.list(statusFilter || undefined, page, 20, rankFilter || undefined);
      setPartners(data.partners);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'Błąd pobierania listy partnerów.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners(1);
  }, [statusFilter, rankFilter]);

  const handleUpdateStatus = async (id: string, newStatus: 'APPROVED' | 'REJECTED' | 'SUSPENDED') => {
    if (!confirm(`Czy na pewno chcesz zmienić status partnera na ${newStatus}?`)) return;
    try {
      await partnersApi.updateStatus(id, newStatus);
      fetchPartners(pagination.page);
    } catch (err: any) {
      alert(err.message || 'Nie udało się zaktualizować statusu.');
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs px-2.5 py-1 rounded-full font-medium">Oczekuje</span>;
      case 'APPROVED': return <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Zatwierdzony</span>;
      case 'REJECTED': return <span className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Odrzucony</span>;
      case 'SUSPENDED': return <span className="bg-gray-100 text-gray-800 dark:bg-secondary-700 dark:text-gray-400 text-xs px-2.5 py-1 rounded-full font-medium">Zawieszony</span>;
      default: return status;
    }
  };

  return (
          <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Program Partnerski — Partnerzy</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Zarządzaj profilami partnerów, weryfikuj ich zgłoszenia i prowizje.</p>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700/50 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtruj status:</span>
          <div className="flex gap-2">
            {[
              { label: 'Wszyscy', value: '' },
              { label: 'Oczekujące', value: 'PENDING' },
              { label: 'Zatwierdzone', value: 'APPROVED' },
              { label: 'Odrzucone', value: 'REJECTED' },
              { label: 'Zawieszone', value: 'SUSPENDED' },
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
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-2">Poziom:</span>
          <select
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 dark:bg-secondary-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-secondary-700 cursor-pointer"
          >
            <option value="">Wszystkie</option>
            {Object.entries(RANK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* List Table */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : partners.length === 0 ? (
            <div className="py-20 text-center text-gray-500 dark:text-gray-400">
              Brak partnerów pasujących do kryteriów.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-6 py-3">Użytkownik</th>
                    <th className="px-6 py-3">Kod partnerski</th>
                    <th className="px-6 py-3 text-center font-semibold">Prowizja %</th>
                    <th className="px-6 py-3">Poziom awansu</th>
                    <th className="px-6 py-3">Firma / NIP</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Data rejestracji</th>
                    <th className="px-6 py-3 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {partners.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {p.user.firstName} {p.user.lastName}
                        </div>
                        <div className="text-xs text-gray-400">{p.user.email}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-orange-500 text-xs font-semibold">{p.referralCode}</td>
                      <td className="px-6 py-4 text-center font-bold text-gray-800 dark:text-gray-300">{p.commissionRate}%</td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-300">
                          {RANK_LABELS[p.rank] ?? p.rank ?? '—'}
                        </div>
                        {p.rank && p.rank !== p.highestRank && (
                          <div className="text-[10px] text-yellow-600 dark:text-yellow-400">
                            niepotwierdzony ({p.rankConfirmations ?? 0}/2)
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {p.companyName ? (
                          <>
                            <div className="text-gray-800 dark:text-gray-300 font-medium">{p.companyName}</div>
                            {p.nip && <div className="text-xs text-gray-400">NIP: {p.nip}</div>}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">{statusLabel(p.status)}</td>
                      <td className="px-6 py-4 text-right text-xs">
                        {new Date(p.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Link
                          href={`/partners/${p.id}`}
                          className="text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                        >
                          Szczegóły
                        </Link>
                        {p.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(p.id, 'APPROVED')}
                              className="text-xs font-semibold text-green-600 hover:text-green-700 cursor-pointer"
                            >
                              Zatwierdź
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(p.id, 'REJECTED')}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                            >
                              Odrzuć
                            </button>
                          </>
                        )}
                        {p.status === 'APPROVED' && (
                          <button
                            onClick={() => handleUpdateStatus(p.id, 'SUSPENDED')}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-600 cursor-pointer"
                          >
                            Zawieś
                          </button>
                        )}
                        {p.status === 'SUSPENDED' && (
                          <button
                            onClick={() => handleUpdateStatus(p.id, 'APPROVED')}
                            className="text-xs font-semibold text-green-600 hover:text-green-700 cursor-pointer"
                          >
                            Aktywuj
                          </button>
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
                  onClick={() => fetchPartners(pagination.page - 1)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Poprzednia
                </button>
                <button
                  disabled={pagination.page === pagination.totalPages}
                  onClick={() => fetchPartners(pagination.page + 1)}
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
