'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

import { adminSalesRepsApi } from '@/lib/api';

export default function SalesRepsListPage() {
  const [reps, setReps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteMsg, setPromoteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [promoting, setPromoting] = useState(false);

  const fetchReps = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminSalesRepsApi.list();
      if (data.success) {
        setReps(data.salesReps);
      }
    } catch (err: any) {
      setError(err.message || 'Błąd pobierania listy handlowców.');
    } finally {
      setLoading(false);
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteEmail.trim()) return;
    setPromoting(true);
    setPromoteMsg(null);
    try {
      const data = await adminSalesRepsApi.promote(promoteEmail.trim());
      setPromoteMsg({ type: 'success', text: data.message || 'Nadano rolę handlowca.' });
      setPromoteEmail('');
      fetchReps();
    } catch (err: any) {
      setPromoteMsg({ type: 'error', text: err.message || 'Błąd nadawania roli.' });
    } finally {
      setPromoting(false);
    }
  };

  useEffect(() => {
    fetchReps();
  }, []);

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Handlowcy</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Zarządzaj kontami handlowców, kontroluj ich obroty i salda prowizyjne.</p>
          </div>
          <Link
            href="/sales-reps/settings"
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Ustawienia progów
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Promote a user to HANDLOWIEC */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Nadaj rolę handlowca</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Wpisz e-mail istniejącego konta. Po nadaniu roli użytkownik musi się przelogować.</p>
          <form onSubmit={handlePromote} className="flex flex-wrap gap-2 items-center">
            <input
              type="email"
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              placeholder="email@klienta.pl"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 text-sm text-gray-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={promoting}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {promoting ? 'Nadaję...' : 'Nadaj rolę HANDLOWIEC'}
            </button>
          </form>
          {promoteMsg && (
            <p className={`mt-2 text-xs ${promoteMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {promoteMsg.text}
            </p>
          )}
        </div>

        {/* List Table */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : reps.length === 0 ? (
            <div className="py-20 text-center text-gray-500 dark:text-gray-400">
              Brak zarejestrowanych handlowców w systemie.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-secondary-900 text-gray-700 dark:text-gray-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4">Handlowiec</th>
                    <th className="px-6 py-4">Dane firmy</th>
                    <th className="px-6 py-4 text-right">Dostępne środki</th>
                    <th className="px-6 py-4 text-right">Środki zamrożone</th>
                    <th className="px-6 py-4 text-right">Zarezerwowane</th>
                    <th className="px-6 py-4 text-right">Suma zarobiona</th>
                    <th className="px-6 py-4">Dołączył(a)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700">
                  {reps.map((rep) => (
                    <tr key={rep.id} className="hover:bg-gray-50 dark:hover:bg-secondary-700/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {rep.firstName} {rep.lastName}
                        </div>
                        <div className="text-xs text-gray-400">{rep.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {rep.companyName ? (
                          <>
                            <div className="font-medium text-gray-800 dark:text-gray-200">{rep.companyName}</div>
                            <div className="text-xs text-gray-400">NIP: {rep.nip}</div>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">Brak danych firmy</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600 dark:text-green-400">
                        {rep.balance.available.toFixed(2)} PLN
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-600 dark:text-gray-300">
                        {rep.balance.frozen.toFixed(2)} PLN
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-orange-500">
                        {rep.balance.reserved.toFixed(2)} PLN
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                        {rep.balance.totalEarned.toFixed(2)} PLN
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400">
                        {new Date(rep.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}
