'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { partnersApi } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return <span className="bg-yellow-100 text-yellow-800 text-xs px-2.5 py-1 rounded-full font-medium">Oczekuje</span>;
    case 'APPROVED':
      return <span className="bg-green-100 text-green-800 text-xs px-2.5 py-1 rounded-full font-medium">Zatwierdzony</span>;
    case 'REJECTED':
      return <span className="bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-full font-medium">Odrzucony</span>;
    case 'SUSPENDED':
      return <span className="bg-gray-100 text-gray-800 text-xs px-2.5 py-1 rounded-full font-medium">Zawieszony</span>;
    default:
      return status;
  }
}

export default function PartnerDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [partner, setPartner] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPartnerDetail = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await partnersApi.getDetail(id);
      setPartner(data);
    } catch (err: any) {
      setError(err.message || 'Nie udało się pobrać szczegółów partnera.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchPartnerDetail();
    }
  }, [id]);

  const handleUpdateStatus = async (newStatus: 'APPROVED' | 'REJECTED' | 'SUSPENDED') => {
    if (!confirm(`Zmienić status partnera na ${newStatus}?`)) return;
    try {
      await partnersApi.updateStatus(id, newStatus);
      fetchPartnerDetail();
    } catch (err: any) {
      alert(err.message || 'Nie udało się zaktualizować statusu.');
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !partner) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Link href="/partners" className="text-sm font-semibold text-orange-500 hover:underline">← Powrót do listy</Link>
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl">
            {error || 'Nie znaleziono partnera.'}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <Link href="/partners" className="text-xs font-semibold text-orange-500 hover:underline block mb-2">← Powrót do listy</Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Partner: {partner.user.firstName} {partner.user.lastName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Email: {partner.user.email} | Kod polecający: <span className="font-mono text-orange-500 font-bold">{partner.referralCode}</span></p>
          </div>
          <div className="flex gap-2">
            {partner.status === 'PENDING' && (
              <>
                <button
                  onClick={() => handleUpdateStatus('APPROVED')}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Zatwierdź partnera
                </button>
                <button
                  onClick={() => handleUpdateStatus('REJECTED')}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Odrzuć
                </button>
              </>
            )}
            {partner.status === 'APPROVED' && (
              <button
                onClick={() => handleUpdateStatus('SUSPENDED')}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Zawieś partnera
              </button>
            )}
            {partner.status === 'SUSPENDED' && (
              <button
                onClick={() => handleUpdateStatus('APPROVED')}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Aktywuj partnera
              </button>
            )}
          </div>
        </div>

        {/* Balance KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-5 rounded-2xl">
            <span className="text-xs uppercase font-semibold text-gray-400">Dostępny Balans</span>
            <div className="text-xl font-bold mt-1 text-gray-900 dark:text-white">{Number(partner.balance.available).toFixed(2)} PLN</div>
          </div>
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-5 rounded-2xl">
            <span className="text-xs uppercase font-semibold text-gray-400">Środki w Holdzie</span>
            <div className="text-xl font-bold mt-1 text-gray-900 dark:text-white">{Number(partner.balance.frozen).toFixed(2)} PLN</div>
          </div>
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-5 rounded-2xl">
            <span className="text-xs uppercase font-semibold text-gray-400">Zarezerwowane (wypłaty)</span>
            <div className="text-xl font-bold mt-1 text-gray-900 dark:text-white">{Number(partner.balance.reserved).toFixed(2)} PLN</div>
          </div>
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-5 rounded-2xl">
            <span className="text-xs uppercase font-semibold text-gray-400">Zarobiono łącznie</span>
            <div className="text-xl font-bold mt-1 text-gray-900 dark:text-white">{Number(partner.balance.totalEarned).toFixed(2)} PLN</div>
          </div>
        </div>

        {/* Profile and Bank details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-6 rounded-2xl space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-2">Informacje o Profilu</h3>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Status partnera:</span>
              <span className="font-semibold">{statusBadge(partner.status)}</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Prowizja bazowa:</span>
              <span className="font-semibold text-orange-500">{partner.commissionRate}%</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Prowizja MLM sub-tier:</span>
              <span className="font-semibold">{partner.subCommissionRate}%</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Data dołączenia:</span>
              <span>{formatDate(partner.createdAt)}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-6 rounded-2xl space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-2">Dane do Rozliczeń</h3>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Konto bankowe:</span>
              <span className="font-semibold text-xs break-all">{partner.bankAccountNumber || 'Brak'}</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Nazwa firmy:</span>
              <span className="font-semibold">{partner.companyName || 'Brak'}</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">NIP firmy:</span>
              <span className="font-semibold">{partner.nip || 'Brak'}</span>
            </div>
          </div>
        </div>

        {/* Attributed Orders */}
        <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-4 mb-4">Przypisane Zamówienia</h3>
          {partner.referrals.length === 0 ? (
            <p className="text-sm text-gray-400">Brak zarejestrowanych zamówień polecających.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Numer Zamówienia</th>
                    <th className="px-4 py-3 text-center">Kwota Zamówienia</th>
                    <th className="px-4 py-3 text-right">Prowizja Partnera</th>
                    <th className="px-4 py-3 text-center">Status Prowizji</th>
                    <th className="px-4 py-3 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {partner.referrals.map((ref: any) => (
                    <tr key={ref.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                      <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white">
                        <Link href={`/orders/${ref.orderId}`} className="text-orange-500 hover:underline">
                          {ref.order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-center">{Number(ref.order.total).toFixed(2)} PLN</td>
                      <td className="px-4 py-3.5 text-right font-medium text-orange-500">{Number(ref.primaryCommission).toFixed(2)} PLN</td>
                      <td className="px-4 py-3.5 text-center">{statusBadge(ref.status)}</td>
                      <td className="px-4 py-3.5 text-right text-xs">{formatDate(ref.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payout History */}
        <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-4 mb-4">Historia Wypłat</h3>
          {partner.payouts.length === 0 ? (
            <p className="text-sm text-gray-400">Brak zarejestrowanych wypłat w historii.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Typ</th>
                    <th className="px-4 py-3">Kod kuponu / Faktura PDF</th>
                    <th className="px-4 py-3 text-right">Kwota wypłaty</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {partner.payouts.map((pay: any) => (
                    <tr key={pay.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                      <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                        {pay.type === 'COUPON' ? 'Kupon' : 'Przelew bankowy'}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {pay.couponCode && (
                          <div>Kod: <span className="font-bold text-orange-500 font-mono text-sm">{pay.couponCode}</span></div>
                        )}
                        {pay.invoiceUrl && (
                          <a href={pay.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Faktura PDF</a>
                        )}
                        {pay.notes && <div className="text-gray-400 mt-1">{pay.notes}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-gray-950 dark:text-white">{Number(pay.amount).toFixed(2)} PLN</td>
                      <td className="px-4 py-3.5 text-center">{statusBadge(pay.status)}</td>
                      <td className="px-4 py-3.5 text-right text-xs">{formatDate(pay.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
