'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { partnersApi } from '@/lib/api';
import { RANK_LABELS } from '@/lib/ranks';
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
  const [uplineInput, setUplineInput] = useState('');
  const [uplineSaving, setUplineSaving] = useState(false);
  const [uplineModalOpen, setUplineModalOpen] = useState(false);
  const [uplineAck, setUplineAck] = useState(false);
  const [uplineError, setUplineError] = useState('');
  const [detachModalOpen, setDetachModalOpen] = useState(false);
  const [detachReason, setDetachReason] = useState('');
  const [detachError, setDetachError] = useState('');

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

  const handleUpdateRank = async (newRank: string) => {
    if (!newRank || newRank === partner?.rank) return;
    if (!confirm(`Zmienić poziom awansu partnera na „${RANK_LABELS[newRank] ?? newRank}”? Poziom zostanie utrwalony (korekta administracyjna).`)) return;
    try {
      await partnersApi.updateRank(id, newRank, 'Korekta administracyjna');
      fetchPartnerDetail();
    } catch (err: any) {
      alert(err.message || 'Nie udało się zaktualizować poziomu.');
    }
  };

  const openUplineModal = () => {
    if (!uplineInput.trim()) return;
    setUplineAck(false);
    setUplineError('');
    setUplineModalOpen(true);
  };

  const handleSetUpline = async () => {
    const value = uplineInput.trim();
    if (!value || !uplineAck) return;
    try {
      setUplineSaving(true);
      setUplineError('');
      await partnersApi.updateUpline(id, value);
      setUplineInput('');
      setUplineModalOpen(false);
      fetchPartnerDetail();
    } catch (err: any) {
      setUplineError(err.message || 'Nie udało się podpiąć partnera pod lidera.');
    } finally {
      setUplineSaving(false);
    }
  };

  const handleDetachUpline = async () => {
    if (detachReason.trim().length < 10) return;
    try {
      setUplineSaving(true);
      setDetachError('');
      await partnersApi.detachUpline(id, detachReason.trim());
      setDetachReason('');
      setDetachModalOpen(false);
      fetchPartnerDetail();
    } catch (err: any) {
      setDetachError(err.message || 'Nie udało się odpiąć partnera od lidera.');
    } finally {
      setUplineSaving(false);
    }
  };

  if (loading) {
    return (
              <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
        </div>
    );
  }

  if (error || !partner) {
    return (
              <div className="space-y-4">
          <Link href="/partners" className="text-sm font-semibold text-orange-500 hover:underline">← Powrót do listy</Link>
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl">
            {error || 'Nie znaleziono partnera.'}
          </div>
        </div>
    );
  }

  return (
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
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-2">Poziom awansu (WBTP)</h3>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Aktualny poziom:</span>
              <span className="font-semibold text-orange-500">{RANK_LABELS[partner.rank] ?? partner.rank ?? '—'}</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Poziom utrwalony:</span>
              <span className="font-semibold">{RANK_LABELS[partner.highestRank] ?? partner.highestRank ?? '—'}</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Potwierdzenia:</span>
              <span>{partner.rankConfirmations ?? 0}/2{partner.rank !== partner.highestRank ? ' (poziom niepotwierdzony)' : ''}</span>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <span className="text-gray-400">Data awansu:</span>
              <span>{formatDate(partner.rankAchievedAt)}</span>
            </div>
            <div className="grid grid-cols-2 text-sm items-center">
              <span className="text-gray-400">Korekta poziomu:</span>
              <select
                defaultValue=""
                onChange={(e) => { handleUpdateRank(e.target.value); e.target.value = ''; }}
                className="px-2 py-1.5 rounded-lg text-xs bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700 cursor-pointer"
              >
                <option value="" disabled>Wybierz poziom…</option>
                {Object.entries(RANK_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">Struktura MLM (lider)</h3>
              <Link href="/partners/structure" className="text-xs font-semibold text-orange-500 hover:underline">
                Zobacz całą strukturę
              </Link>
            </div>

            {partner.parentPartner ? (
              <>
                <div className="grid grid-cols-2 text-sm">
                  <span className="text-gray-400">Lider:</span>
                  <Link href={`/partners/${partner.parentPartner.id}`} className="font-semibold text-orange-500 hover:underline">
                    {partner.parentPartner.user.firstName} {partner.parentPartner.user.lastName}
                  </Link>
                </div>
                <div className="grid grid-cols-2 text-sm">
                  <span className="text-gray-400">Kod / email lidera:</span>
                  <span className="text-xs break-all">
                    <span className="font-mono text-orange-500 font-bold">{partner.parentPartner.referralCode}</span>
                    <br />
                    {partner.parentPartner.user.email}
                  </span>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700">
                  <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Powiązanie jest <strong>trwałe</strong>. Rozliczone już prowizje i obroty poziomów naliczono
                    według tej struktury.
                  </p>
                </div>
                <button
                  onClick={() => { setDetachReason(''); setDetachError(''); setDetachModalOpen(true); }}
                  className="text-xs font-semibold text-gray-500 hover:text-red-600 cursor-pointer"
                >
                  Odepnij od lidera (korekta błędu)
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 text-sm">
                  <span className="text-gray-400">Lider:</span>
                  <span className="text-gray-400">Brak (partner na szczycie struktury)</span>
                </div>
                <label className="text-xs text-gray-400 block pt-2">
                  Podepnij pod lidera (kod polecający, email konta lub ID profilu)
                </label>
                <div className="flex gap-2">
                  <input
                    value={uplineInput}
                    onChange={(e) => setUplineInput(e.target.value)}
                    placeholder="np. AB12CD34 lub mail@domena.pl"
                    className="flex-1 px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
                  />
                  <button
                    onClick={openUplineModal}
                    disabled={!uplineInput.trim()}
                    className="px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Podepnij
                  </button>
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Uwaga: podpięcie jest jednorazowe i nieodwracalne.
                </p>
              </div>
            )}
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

        {/* WBTP: monthly volume + line volumes (WL) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-4 mb-4">
              Obrót kwalifikowany — {partner.lineVolumes?.period ?? 'bieżący miesiąc'}
            </h3>
            {partner.monthlyVolume ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2"><span className="text-gray-400">Sprzedaż własna:</span><span className="font-semibold">{Number(partner.monthlyVolume.ownSales).toFixed(2)} PLN</span></div>
                <div className="grid grid-cols-2"><span className="text-gray-400">1. poziom:</span><span className="font-semibold">{Number(partner.monthlyVolume.level1Sales).toFixed(2)} PLN</span></div>
                <div className="grid grid-cols-2"><span className="text-gray-400">2. poziom:</span><span className="font-semibold">{Number(partner.monthlyVolume.level2Sales).toFixed(2)} PLN</span></div>
                <div className="grid grid-cols-2"><span className="text-gray-400">Cała struktura:</span><span className="font-semibold text-orange-500">{Number(partner.monthlyVolume.structureSales).toFixed(2)} PLN</span></div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Brak danych za bieżący okres.</p>
            )}
          </div>

          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-4 mb-4">Wolumen Linii (WL)</h3>
            {!partner.lineVolumes?.current?.length ? (
              <p className="text-sm text-gray-400">Brak linii z obrotem w bieżącym okresie.</p>
            ) : (
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Linia (korzeń)</th>
                    <th className="px-3 py-2">Poziom</th>
                    <th className="px-3 py-2 text-right">WL (obrót)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {partner.lineVolumes.current.map((lv: any) => (
                    <tr key={lv.id}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {lv.linePartner?.user?.firstName} {lv.linePartner?.user?.lastName}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{lv.linePartner?.referralCode}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{RANK_LABELS[lv.linePartner?.rank] ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{Number(lv.volume).toFixed(2)} PLN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* WBTP: leader bonuses + rank events */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-4 mb-4">Premia Liderów</h3>
            {!partner.leaderBonuses?.length ? (
              <p className="text-sm text-gray-400">Brak naliczonych premii.</p>
            ) : (
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Zamówienie</th>
                    <th className="px-3 py-2">Ranga / udział</th>
                    <th className="px-3 py-2 text-right">Kwota</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {partner.leaderBonuses.map((b: any) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2.5 font-mono text-xs">{b.order?.orderNumber ?? b.orderId}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {RANK_LABELS[b.rank] ?? b.rank} · {Number(b.sharePct)}%
                        {Number(b.wlAddonPct) > 0 && <span className="text-green-600"> +WL</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">{Number(b.amount).toFixed(2)} PLN</td>
                      <td className="px-3 py-2.5 text-center">{statusBadge(b.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-4 mb-4">Historia awansów</h3>
            {!partner.rankEvents?.length ? (
              <p className="text-sm text-gray-400">Brak zdarzeń awansu.</p>
            ) : (
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Okres</th>
                    <th className="px-3 py-2">Zmiana</th>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                  {partner.rankEvents.map((ev: any) => (
                    <tr key={ev.id}>
                      <td className="px-3 py-2.5 font-mono text-xs">{ev.period}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {RANK_LABELS[ev.fromRank] ?? ev.fromRank} → <span className="font-semibold">{RANK_LABELS[ev.toRank] ?? ev.toRank}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {{ PROMOTION: 'Awans', CONFIRMATION: 'Potwierdzenie', CONSOLIDATION: 'Utrwalenie', RESET: 'Powrót', MANUAL: 'Korekta admin' }[ev.type as string] ?? ev.type}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">{formatDate(ev.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

        {uplineModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-lg bg-white dark:bg-secondary-800 rounded-2xl shadow-xl border border-gray-100 dark:border-secondary-700 overflow-hidden">
              <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-secondary-700">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Podpięcie jest trwałe</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tej operacji nie da się cofnąć ani zmienić.</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400">Partner:</span>
                    <span className="font-semibold text-gray-900 dark:text-white text-right">
                      {partner.user.firstName} {partner.user.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400">Zostanie podpięty pod:</span>
                    <span className="font-mono font-bold text-orange-500 text-right break-all">{uplineInput.trim()}</span>
                  </div>
                </div>

                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>Zadziała to tak, jakby lider zaprosił tego partnera swoim kodem przy rejestracji.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><strong>Powiązania nie można później zmienić ani usunąć</strong>, ani z panelu, ani przez partnera.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>Prowizje ze struktury naliczą się dopiero od nowych zamówień. Wcześniejsze rozliczenia nie są przeliczane wstecz.</span>
                  </li>
                </ul>

                {uplineError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-sm text-red-700 dark:text-red-400">
                    {uplineError}
                  </div>
                )}

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uplineAck}
                    onChange={(e) => setUplineAck(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-orange-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Rozumiem, że powiązanie jest trwałe i nieodwracalne.
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 p-5 pt-0">
                <button
                  onClick={() => setUplineModalOpen(false)}
                  disabled={uplineSaving}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-secondary-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSetUpline}
                  disabled={uplineSaving || !uplineAck}
                  className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  {uplineSaving ? 'Podpinam...' : 'Podepnij na stałe'}
                </button>
              </div>
            </div>
          </div>
        )}
        {detachModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-lg bg-white dark:bg-secondary-800 rounded-2xl shadow-xl border border-gray-100 dark:border-secondary-700 overflow-hidden">
              <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-secondary-700">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Odpięcie od lidera</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Operacja wyjątkowa, przeznaczona do korekty błędu.</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-4 text-sm text-red-800 dark:text-red-300">
                  Partner zostanie odłączony od <strong>{partner.parentPartner?.user.firstName} {partner.parentPartner?.user.lastName}</strong>.
                  Naliczone wcześniej prowizje i obroty poziomów zostaną, ale przestaną się zgadzać z aktualną
                  strukturą. Zdarzenie trafi do dziennika systemowego wraz z Twoim kontem i podanym powodem.
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Powód odpięcia (wymagany, min. 10 znaków)
                  </label>
                  <textarea
                    value={detachReason}
                    onChange={(e) => setDetachReason(e.target.value)}
                    rows={3}
                    placeholder="np. pomyłka przy podpinaniu, wskazano niewłaściwe konto lidera"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
                  />
                  <div className="text-[11px] text-gray-400 mt-1">{detachReason.trim().length}/10</div>
                </div>

                {detachError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-sm text-red-700 dark:text-red-400">
                    {detachError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 p-5 pt-0">
                <button
                  onClick={() => setDetachModalOpen(false)}
                  disabled={uplineSaving}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-secondary-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleDetachUpline}
                  disabled={uplineSaving || detachReason.trim().length < 10}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  {uplineSaving ? 'Odpinam...' : 'Odepnij i zapisz w dzienniku'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
