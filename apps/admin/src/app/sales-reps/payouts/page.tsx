'use client';

import { useState, useEffect } from 'react';
import { adminSalesRepsApi } from '@/lib/api';

export default function SalesRepsPayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Payout actions modal state
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'COMPLETE' | 'REJECT'>('COMPLETE');
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminSalesRepsApi.listPayouts(statusFilter || undefined);
      if (data.success) {
        setPayouts(data.payouts);
      }
    } catch (err: any) {
      setError(err.message || 'Błąd pobierania wniosków o wypłaty.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, [statusFilter]);

  const openActionModal = (payout: any, type: 'COMPLETE' | 'REJECT') => {
    setSelectedPayout(payout);
    setActionType(type);
    setActionNotes('');
    setNotesModalOpen(true);
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayout) return;

    try {
      setActionLoading(true);
      if (actionType === 'COMPLETE') {
        await adminSalesRepsApi.completePayout(selectedPayout.id, actionNotes);
      } else {
        await adminSalesRepsApi.rejectPayout(selectedPayout.id, actionNotes);
      }
      
      setNotesModalOpen(false);
      setSelectedPayout(null);
      fetchPayouts();
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd podczas procesowania wypłaty.');
    } finally {
      setActionLoading(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs px-2.5 py-1 rounded-full font-medium">Oczekuje</span>;
      case 'COMPLETED':
        return <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Zatwierdzona</span>;
      case 'REJECTED':
        return <span className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Odrzucona</span>;
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wypłaty Prowizji Handlowych</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Przeglądaj, weryfikuj faktury i zatwierdzaj wypłaty prowizji dla handlowców.</p>
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
              { label: 'Wszystkie', value: '' },
              { label: 'Oczekujące', value: 'PENDING' },
              { label: 'Zatwierdzone', value: 'COMPLETED' },
              { label: 'Odrzucone', value: 'REJECTED' },
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

        {/* List Table */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="py-20 text-center text-gray-500 dark:text-gray-400">
              Brak wniosków o wypłaty dla wybranego statusu.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-secondary-900 text-gray-700 dark:text-gray-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4">Handlowiec</th>
                    <th className="px-6 py-4">Faktura (PDF)</th>
                    <th className="px-6 py-4 text-right">Kwota wypłaty</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Złożono</th>
                    <th className="px-6 py-4">Uwagi</th>
                    <th className="px-6 py-4 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700">
                  {payouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-secondary-700/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {payout.salesRep?.firstName} {payout.salesRep?.lastName}
                        </div>
                        <div className="text-xs text-gray-400">{payout.salesRep?.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {payout.invoiceUrl ? (
                          <a
                            href={payout.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-500 hover:text-orange-600 font-semibold text-xs flex items-center gap-1"
                          >
                            📄 Zobacz fakturę
                          </a>
                        ) : (
                          <span className="text-xs text-red-500 font-medium">Brak faktury</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                        {Number(payout.amount).toFixed(2)} PLN
                      </td>
                      <td className="px-6 py-4">
                        {statusLabel(payout.status)}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400">
                        {new Date(payout.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 max-w-[200px] truncate">
                        {payout.notes || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {payout.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openActionModal(payout, 'COMPLETE')}
                              className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer"
                            >
                              Zatwierdź
                            </button>
                            <button
                              onClick={() => openActionModal(payout, 'REJECT')}
                              className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer"
                            >
                              Odrzuć
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Zakończono</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Notes Modal */}
      {notesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-secondary-800 rounded-xl max-w-md w-full p-6 border border-gray-100 dark:border-secondary-700 shadow-xl space-y-4">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
              {actionType === 'COMPLETE' ? 'Zatwierdzenie wypłaty' : 'Odrzucenie wniosku o wypłatę'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Wpisz opcjonalne uwagi lub powód decyzji, który zostanie zapisany w systemie.
            </p>
            <form onSubmit={handleActionSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Uwagi / Notatki
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={actionType === 'COMPLETE' ? 'np. Wypłacono przelewem' : 'np. Błędne dane na fakturze'}
                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white h-20"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNotesModalOpen(false)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-secondary-700 dark:hover:bg-secondary-650 text-gray-700 dark:text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                    actionType === 'COMPLETE' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {actionLoading ? 'Przetwarzanie...' : actionType === 'COMPLETE' ? 'Zatwierdź' : 'Odrzuć'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
