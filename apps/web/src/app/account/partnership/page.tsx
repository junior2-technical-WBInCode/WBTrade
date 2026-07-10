'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AccountSidebar from '../../../components/AccountSidebar';
import { useAuth } from '../../../contexts/AuthContext';
import { referralApi, PartnerProfileData, ReferralLinkData, ApiClientError, ReferralOverrideData, DownlinePartnerNode, ReferralProductStat, PartnerRankOverview, LeaderBonusData } from '../../../lib/api';
import PartnerTermsContent from './PartnerTermsContent';

const PARTNER_TERMS_PDF_URL = '/documents/warunki-wspolpracy-programu-partnerskiego.pdf';

const RANK_LABELS: Record<string, string> = {
  AKTYWNY_PARTNER: 'Aktywny Partner',
  AMBASADOR: 'Ambasador',
  LIDER_ZESPOLU: 'Lider Zespołu',
  MENEDZER: 'Menedżer',
  DYREKTOR_REGIONALNY: 'Dyrektor Regionalny',
  DYREKTOR_KRAJOWY: 'Dyrektor Krajowy',
  DYREKTOR_GENERALNY: 'Dyrektor Generalny',
};

const REQUIREMENT_LABELS: Record<string, string> = {
  ownSales: 'Sprzedaż własna',
  level1Sales: 'Obrót 1. poziomu',
  level12Sales: 'Obrót 1.-2. poziomu',
  structureSales: 'Obrót struktury',
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-xs px-2.5 py-1 rounded-full font-medium">Oczekujące</span>;
    case 'PAID':
      return <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs px-2.5 py-1 rounded-full font-medium">Opłacone (Hold 14d)</span>;
    case 'APPROVED':
      return <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Zatwierdzone</span>;
    case 'CANCELLED':
      return <span className="bg-red-100 dark:bg-red-950/20 text-red-800 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Anulowane</span>;
    case 'COMPLETED':
      return <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Zrealizowano</span>;
    case 'REJECTED':
      return <span className="bg-red-100 dark:bg-red-950/20 text-red-800 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Odrzucono</span>;
    default:
      return <span className="bg-gray-100 dark:bg-secondary-800 text-gray-800 dark:text-gray-400 text-xs px-2.5 py-1 rounded-full font-medium">{status}</span>;
  }
}

function DownlineTree({ nodes }: { nodes: DownlinePartnerNode[] }) {
  if (!nodes || nodes.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">Brak poleconych partnerów w strukturze.</p>;
  }

  const renderNode = (node: DownlinePartnerNode) => (
    <div key={node.id} className="pl-4 border-l-2 border-orange-200 dark:border-orange-950 mt-3 first:mt-0">
      <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
        <span className="font-medium">{node.user.firstName} {node.user.lastName}</span>
        <span className="text-xs font-mono text-orange-500">({node.referralCode})</span>
        <span className="text-xs bg-gray-100 dark:bg-secondary-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">{node.status}</span>
        <span className="text-[10px] text-gray-400">{new Date(node.createdAt).toLocaleDateString('pl-PL')}</span>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="space-y-1 mt-1">
          {node.children.map(renderNode)}
        </div>
      )}
    </div>
  );

  return <div className="space-y-2 py-2">{nodes.map(renderNode)}</div>;
}

export default function PartnershipPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PartnerProfileData | null>(null);
  const [links, setLinks] = useState<ReferralLinkData[]>([]);
  const [overrides, setOverrides] = useState<ReferralOverrideData[]>([]);
  const [downline, setDownline] = useState<DownlinePartnerNode[]>([]);
  const [productStats, setProductStats] = useState<ReferralProductStat[]>([]);
  const [rankOverview, setRankOverview] = useState<PartnerRankOverview | null>(null);
  const [leaderBonuses, setLeaderBonuses] = useState<LeaderBonusData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [regBankAccount, setRegBankAccount] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regNip, setRegNip] = useState('');
  const [regInvitedBy, setRegInvitedBy] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [hasScrolledTerms, setHasScrolledTerms] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const termsScrollRef = useRef<HTMLDivElement | null>(null);

  const handleTermsScroll = () => {
    const el = termsScrollRef.current;
    if (!el) return;
    const reachedBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (reachedBottom) setHasScrolledTerms(true);
  };

  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);

  const [payoutType, setPayoutType] = useState<'COUPON' | 'CASH'>('COUPON');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  const loadPartnerData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await referralApi.getProfile();
      setProfile(data);
      if (data.status === 'APPROVED') {
        const [linksData, overridesData, downlineData, productStatsData] = await Promise.all([
          referralApi.listLinks(),
          referralApi.listOverrides(),
          referralApi.getDownline(),
          referralApi.getProductStats(),
        ]);
        setLinks(linksData);
        setOverrides(overridesData);
        setDownline(downlineData);
        setProductStats(productStatsData);

        // WBTP: rank + leader bonuses — fail-soft (page works even if unavailable)
        try {
          const [rankData, bonusData] = await Promise.all([
            referralApi.getRankOverview(),
            referralApi.listLeaderBonuses(),
          ]);
          setRankOverview(rankData);
          setLeaderBonuses(bonusData);
        } catch {
          setRankOverview(null);
          setLeaderBonuses([]);
        }
      }
    } catch (err: any) {
      if (err instanceof ApiClientError && err.statusCode === 404) {
        setProfile(null);
      } else {
        setError(err.message || 'Błąd ładowania danych partnerskich.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push('/login?redirect=/account/partnership');
      } else {
        loadPartnerData();
      }
    }
  }, [isAuthenticated, authLoading, router, loadPartnerData]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError('Musisz potwierdzić zapoznanie się z Warunkami Współpracy programu partnerskiego.');
      return;
    }
    setSubmittingReg(true);
    setError('');
    setSuccess('');
    try {
      const newProfile = await referralApi.register({
        bankAccountNumber: regBankAccount || undefined,
        companyName: regCompanyName || undefined,
        nip: regNip || undefined,
        invitedBy: regInvitedBy || undefined,
        acceptedTerms: true,
      });
      setSuccess('Profil partnerski został zarejestrowany. Poczekaj na zatwierdzenie przez administratora.');
      setProfile(newProfile);
    } catch (err: any) {
      setError(err.message || 'Rejestracja partnerska nie powiodła się.');
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingLink(true);
    setError('');
    setSuccess('');
    try {
      const newLink = await referralApi.createLink({
        productUrl: newLinkUrl || undefined,
        name: newLinkLabel || undefined,
      });
      setSuccess('Link partnerski został utworzony!');
      setLinks((prev) => [{
        ...newLink,
        salesCount: newLink.salesCount ?? 0,
        totalCommission: newLink.totalCommission ?? 0,
      }, ...prev]);
      setNewLinkUrl('');
      setNewLinkLabel('');
    } catch (err: any) {
      setError(err.message || 'Nie udało się stworzyć linku.');
    } finally {
      setCreatingLink(false);
    }
  };

  const handlePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPayout(true);
    setError('');
    setSuccess('');
    const amountVal = parseFloat(payoutAmount);

    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Podaj prawidłową kwotę.');
      setSubmittingPayout(false);
      return;
    }

    try {
      if (payoutType === 'COUPON') {
        const result = await referralApi.redeemCoupon(amountVal);
        setSuccess(`Prowizja wypłacona! Wygenerowano kod rabatowy: ${result.couponCode}`);
        setPayoutAmount('');
      } else {
        await referralApi.requestCashPayout(amountVal, invoiceUrl || undefined);
        setSuccess('Wniosek o wypłatę gotówkową został wysłany do weryfikacji admina.');
        setPayoutAmount('');
        setInvoiceUrl('');
      }
      // Reload profile to refresh balance & recent payouts
      const updatedProfile = await referralApi.getProfile();
      setProfile(updatedProfile);
    } catch (err: any) {
      setError(err.message || 'Żądanie wypłaty nie powiodło się.');
    } finally {
      setSubmittingPayout(false);
    }
  };

  const copyToClipboard = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(identifier);
      setTimeout(() => setCopiedText(null), 2000);
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex flex-col transition-colors">
      <Header />
      <div className="flex-grow max-w-7xl w-full mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/4">
            <AccountSidebar activeId="partnership" />
          </div>

          <div className="lg:w-3/4">
            <div className="bg-white dark:bg-secondary-800 rounded-2xl shadow-sm border border-gray-100 dark:border-secondary-700/50 p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6">Program Partnerski</h1>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30 text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30 text-sm">
                  {success}
                </div>
              )}

              {/* VIEW 1: REGISTRATION */}
              {!profile && (
                <div>
                  <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl p-6 mb-8">
                    <h2 className="text-lg font-semibold text-orange-800 dark:text-orange-400 mb-2">Zarabiaj na poleceniach z WB Trade!</h2>
                    <p className="text-sm text-orange-700 dark:text-orange-300 leading-relaxed">
                      Zarejestruj się jako partner, twórz unikalne linki referencyjne dla produktów i zgarniaj prowizję od każdego zakupu zrobionego przez Twoich poleconych.
                      Bazowa prowizja wynosi <span className="font-semibold">5% brutto</span> od wartości zakupów.
                    </p>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-6 max-w-xl">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numer konta bankowego (opcjonalnie)</label>
                      <input
                        type="text"
                        value={regBankAccount}
                        onChange={(e) => setRegBankAccount(e.target.value)}
                        placeholder="PL00 0000 0000 0000 0000 0000 0000"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nazwa firmy (wymagana do rozliczeń gotówkowych)</label>
                      <input
                        type="text"
                        value={regCompanyName}
                        onChange={(e) => setRegCompanyName(e.target.value)}
                        placeholder="Firma Sp. z o.o."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIP firmy (opcjonalnie)</label>
                      <input
                        type="text"
                        value={regNip}
                        onChange={(e) => setRegNip(e.target.value)}
                        placeholder="1234567890"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kod zapraszającego (opcjonalnie)</label>
                      <input
                        type="text"
                        value={regInvitedBy}
                        onChange={(e) => setRegInvitedBy(e.target.value)}
                        placeholder="KOD-PARTNERA"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-colors animate-pulse"
                      />
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-secondary-700 p-4 bg-gray-50 dark:bg-secondary-900/40">
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        Przed dołączeniem do programu musisz zapoznać się z pełną treścią <strong>Warunków Współpracy Programu Partnerskiego</strong>.
                        Otwórz dokument i przescrolluj go do samego końca — dopiero wtedy będzie można zaznaczyć poniższe potwierdzenie.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => setShowTermsModal(true)}
                          className="px-4 py-2 rounded-lg bg-secondary-800 dark:bg-secondary-700 hover:bg-secondary-900 dark:hover:bg-secondary-600 text-white text-sm font-medium transition-colors"
                        >
                          {hasScrolledTerms ? '✓ Otwórz ponownie Warunki Współpracy' : 'Otwórz Warunki Współpracy'}
                        </button>
                        <a
                          href={PARTNER_TERMS_PDF_URL}
                          download
                          className="text-sm text-orange-600 dark:text-orange-400 hover:underline"
                        >
                          Pobierz plik PDF (opcjonalnie)
                        </a>
                      </div>
                      <label className={`flex items-start gap-3 cursor-pointer ${!hasScrolledTerms ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          disabled={!hasScrolledTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 disabled:cursor-not-allowed"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Potwierdzam, że zapoznałem się z pełną treścią Warunków Współpracy Programu Partnerskiego i akceptuję ich postanowienia.
                        </span>
                      </label>
                      {!hasScrolledTerms && (
                        <p className="text-xs text-gray-400 mt-2">Otwórz dokument i przewiń go do końca, aby odblokować potwierdzenie.</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReg || !acceptedTerms}
                      className="px-6 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-medium transition-colors shadow-sm focus:outline-none"
                    >
                      {submittingReg ? 'Rejestrowanie...' : 'Zarejestruj się jako partner'}
                    </button>
                  </form>
                </div>
              )}

              {/* MODAL: Warunki Współpracy — Program Partnerski */}
              {showTermsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                  <div className="bg-white dark:bg-secondary-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-secondary-700">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Warunki Współpracy — Program Partnerski</h3>
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
                        aria-label="Zamknij"
                      >
                        ×
                      </button>
                    </div>
                    <div
                      ref={termsScrollRef}
                      onScroll={handleTermsScroll}
                      className="overflow-y-auto px-6 py-4 flex-1"
                    >
                      <PartnerTermsContent />
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-secondary-700 flex flex-wrap items-center justify-between gap-3">
                      <a
                        href={PARTNER_TERMS_PDF_URL}
                        download
                        className="text-sm text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        Pobierz plik PDF (opcjonalnie)
                      </a>
                      <div className="flex items-center gap-3">
                        {!hasScrolledTerms && (
                          <span className="text-xs text-gray-400">Przewiń dokument do końca, aby kontynuować</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowTermsModal(false)}
                          disabled={!hasScrolledTerms}
                          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium transition-colors"
                        >
                          Zamknij
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 2: PENDING APPROVAL */}
              {profile && profile.status === 'PENDING' && (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-100 dark:border-yellow-900/30">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-950 dark:text-white mb-2">Twój profil oczekuje na weryfikację</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
                    Nasi administratorzy sprawdzają Twoje zgłoszenie. Powiadomimy Cię, gdy profil zostanie zatwierdzony. Zwykle trwa to do 24 godzin roboczych.
                  </p>
                </div>
              )}

              {/* VIEW 3: SUSPENDED / REJECTED */}
              {profile && (profile.status === 'SUSPENDED' || profile.status === 'REJECTED') && (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-900/30">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-950 dark:text-white mb-2">
                    {profile.status === 'SUSPENDED' ? 'Profil partnerski zawieszony' : 'Zgłoszenie odrzucone'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
                    {profile.status === 'SUSPENDED' 
                      ? 'Twoje konto partnerskie zostało zawieszone z powodu naruszenia regulaminu. Skontaktuj się ze wsparciem technicznym.' 
                      : 'Niestety Twoje zgłoszenie do programu partnerskiego zostało odrzucone. Skontaktuj się z nami, aby poznać szczegóły.'}
                  </p>
                </div>
              )}

              {/* VIEW 4: APPROVED PARTNER DASHBOARD */}
              {profile && profile.status === 'APPROVED' && (
                <div className="space-y-8">
                  {/* Balance info row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-5 text-white shadow-sm transition-all hover:scale-[1.02]">
                      <span className="text-xs uppercase font-semibold text-white/80">Dostępne środki</span>
                      <div className="text-2xl font-bold mt-1">{profile.balance.available.toFixed(2)} PLN</div>
                      <p className="text-xs text-white/70 mt-2">Środki wolne do wypłaty kuponem lub przelewem.</p>
                    </div>
                    <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-5 shadow-sm">
                      <span className="text-xs uppercase font-semibold text-gray-400 dark:text-gray-500">Zamrożona prowizja</span>
                      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{profile.balance.frozen.toFixed(2)} PLN</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Oczekuje na upływ 14 dni od opłacenia zamówienia.</p>
                    </div>
                    <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-5 shadow-sm">
                      <span className="text-xs uppercase font-semibold text-gray-400 dark:text-gray-500">Zarobiono łącznie</span>
                      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{profile.balance.totalEarned.toFixed(2)} PLN</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Suma wszystkich zaksięgowanych prowizji.</p>
                    </div>
                  </div>

                  {/* WBTP: Rank card + progress toward next rank */}
                  {rankOverview && (
                    <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-6 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-950 dark:text-white">Twój poziom awansu</h3>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 text-sm px-3 py-1 rounded-full font-bold">
                              {RANK_LABELS[rankOverview.rank] ?? rankOverview.rank}
                            </span>
                            {rankOverview.isConsolidated ? (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">poziom utrwalony</span>
                            ) : (
                              <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                                potwierdzenia: {rankOverview.rankConfirmations}/{rankOverview.confirmationsToConsolidate}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-xs text-gray-500 dark:text-gray-400 space-y-1">
                          <div>Prowizja zespołowa: <span className="font-semibold text-gray-900 dark:text-white">1.-{rankOverview.teamLevelRange}. poziom</span></div>
                          {rankOverview.leaderBonusParams && (
                            <div>Premia Liderów: <span className="font-semibold text-gray-900 dark:text-white">{rankOverview.leaderBonusParams.basePct}%–{(rankOverview.leaderBonusParams.basePct + rankOverview.wlAddonPct).toFixed(2)}%</span></div>
                          )}
                          <div>Okres: <span className="font-mono">{rankOverview.period}</span></div>
                        </div>
                      </div>

                      {/* Monthly volumes */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {[
                          { label: 'Sprzedaż własna', value: rankOverview.volumes.ownSales },
                          { label: '1. poziom', value: rankOverview.volumes.level1Sales },
                          { label: '2. poziom', value: rankOverview.volumes.level2Sales },
                          { label: 'Cała struktura', value: rankOverview.volumes.structureSales },
                        ].map((v) => (
                          <div key={v.label} className="bg-gray-50 dark:bg-secondary-900/50 rounded-xl p-3">
                            <div className="text-[11px] uppercase font-semibold text-gray-400">{v.label}</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{v.value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</div>
                          </div>
                        ))}
                      </div>

                      {/* Progress toward next rank */}
                      {rankOverview.nextRank && rankOverview.nextRankPaths.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                            Droga do: {RANK_LABELS[rankOverview.nextRank] ?? rankOverview.nextRank}
                            <span className="text-xs text-gray-400 font-normal ml-2">(wystarczy spełnić jedną ścieżkę)</span>
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {rankOverview.nextRankPaths.map((path, i) => (
                              <div key={i} className={`rounded-xl p-4 border ${path.met ? 'border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-900/40' : 'border-gray-100 dark:border-secondary-700 bg-gray-50 dark:bg-secondary-900/50'}`}>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                                  {['Ścieżka 1: Sprzedaż własna', 'Ścieżka 2: Model mieszany', 'Ścieżka 3: Struktura'][i] ?? `Ścieżka ${i + 1}`}
                                  {path.met && <span className="text-green-600 ml-1">✓ spełniona</span>}
                                </div>
                                <div className="space-y-2">
                                  {path.items.map((item) => {
                                    const pct = Math.min(100, item.required > 0 ? (item.current / item.required) * 100 : 100);
                                    const label = REQUIREMENT_LABELS[item.key] ?? (item.key.startsWith('minLines') ? `Linie ${item.key.split(':')[1]}` : item.key);
                                    const isLines = item.key.startsWith('minLines');
                                    return (
                                      <div key={item.key}>
                                        <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                                          <span>{label}</span>
                                          <span className={item.met ? 'text-green-600 font-semibold' : ''}>
                                            {isLines
                                              ? `${item.current}/${item.required}`
                                              : `${item.current.toLocaleString('pl-PL')} / ${item.required.toLocaleString('pl-PL')} zł`}
                                          </span>
                                        </div>
                                        <div className="h-1.5 bg-gray-200 dark:bg-secondary-700 rounded-full mt-1 overflow-hidden">
                                          <div className={`h-full rounded-full ${item.met ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {!path.lineShareOk && rankOverview.nextRankMaxLineSharePct !== null && (
                                    <div className="text-[11px] text-red-500">
                                      Największa linia stanowi {rankOverview.largestLineSharePct.toFixed(0)}% obrotu — limit {rankOverview.nextRankMaxLineSharePct}%.
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Line volumes (WL) */}
                      {rankOverview.lines.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Twoje linie (Wolumen Linii)</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                              <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                                <tr>
                                  <th className="px-3 py-2">Linia</th>
                                  <th className="px-3 py-2">Poziom partnera</th>
                                  <th className="px-3 py-2 text-right">WL w tym miesiącu</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                                {rankOverview.lines.map((line) => (
                                  <tr key={line.linePartnerId}>
                                    <td className="px-3 py-2.5">
                                      <span className="font-medium text-gray-900 dark:text-white">
                                        {line.linePartner.user.firstName} {line.linePartner.user.lastName}
                                      </span>
                                      <span className="text-xs text-gray-400 font-mono ml-2">{line.linePartner.referralCode}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs">{RANK_LABELS[line.linePartner.rank] ?? line.linePartner.rank}</td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                                      {line.volume.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ref Link Generator */}
                  <div className="bg-gray-50 dark:bg-secondary-900/50 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700/50">
                    <h3 className="font-semibold text-gray-950 dark:text-white mb-1">Generator Linków</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Wklej link do dowolnej podstrony naszego sklepu lub karty produktu, a my dodamy Twój kod polecający.</p>
                    
                    <form onSubmit={handleCreateLink} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="text"
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          placeholder="Np. https://wb-trade.pl/products/klocki-lego-123"
                          className="px-4 py-3 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                        />
                        <input
                          type="text"
                          value={newLinkLabel}
                          onChange={(e) => setNewLinkLabel(e.target.value)}
                          placeholder="Własna nazwa linku (opcjonalnie)"
                          className="px-4 py-3 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                        />
                      </div>
                      <div className="flex justify-between items-center flex-wrap gap-4">
                        <div className="text-xs font-mono text-gray-500">Twój domyślny kod partnerski: <span className="font-bold text-orange-500">{profile.referralCode}</span></div>
                        <button
                          type="submit"
                          disabled={creatingLink}
                          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                        >
                          {creatingLink ? 'Generowanie...' : 'Generuj reflink'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Generated Links list */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950 dark:text-white mb-4">Twoje Linki Polecające</h3>
                    {links.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Brak wygenerowanych dedykowanych linków. Możesz polecać sklep używając kodu: ?ref={profile.referralCode}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                            <tr>
                              <th className="px-4 py-3">Nazwa</th>
                              <th className="px-4 py-3">Kod Reflinku</th>
                              <th className="px-4 py-3 text-center">Kliknięcia</th>
                              <th className="px-4 py-3 text-center">Zamówienia</th>
                              <th className="px-4 py-3 text-right">Prowizja</th>
                              <th className="px-4 py-3">Akcje</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                            {links.map((l) => {
                              const refUrl = `${window.location.origin}${l.product ? `/products/${l.product.slug || l.product.id}` : ''}?ref=${l.code}`;
                              return (
                                <tr key={l.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                                  <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                                    {l.name || (l.product ? l.product.name : 'Strona główna')}
                                  </td>
                                  <td className="px-4 py-3.5 font-mono text-xs text-orange-500">{l.code}</td>
                                  <td className="px-4 py-3.5 text-center">{l.clicks}</td>
                                  <td className="px-4 py-3.5 text-center">{l.salesCount ?? 0}</td>
                                  <td className="px-4 py-3.5 text-right font-medium text-gray-950 dark:text-white">{(l.totalCommission ?? 0).toFixed(2)} PLN</td>
                                  <td className="px-4 py-3.5">
                                    <button
                                      onClick={() => copyToClipboard(refUrl, l.id)}
                                      className="text-xs text-orange-500 hover:text-orange-600 font-semibold cursor-pointer"
                                    >
                                      {copiedText === l.id ? 'Skopiowano!' : 'Kopiuj link'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Payout forms */}
                  <div className="bg-gray-50 dark:bg-secondary-900/50 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700/50">
                    <h3 className="font-semibold text-gray-950 dark:text-white mb-2">Zleć Wypłatę Środków</h3>
                    <div className="flex gap-4 border-b border-gray-200 dark:border-secondary-700 mb-6">
                      <button
                        onClick={() => setPayoutType('COUPON')}
                        className={`pb-2.5 text-sm font-medium transition-colors relative cursor-pointer ${
                          payoutType === 'COUPON' 
                            ? 'text-orange-500 border-b-2 border-orange-500' 
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                        }`}
                      >
                        Kupon rabatowy (od 1 PLN)
                      </button>
                      <button
                        onClick={() => setPayoutType('CASH')}
                        className={`pb-2.5 text-sm font-medium transition-colors relative cursor-pointer ${
                          payoutType === 'CASH' 
                            ? 'text-orange-500 border-b-2 border-orange-500' 
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                        }`}
                      >
                        Przelew bankowy (od 100 PLN)
                      </button>
                    </div>

                    <form onSubmit={handlePayout} className="space-y-4 max-w-md">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kwota do wypłaty (PLN)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={payoutAmount}
                          onChange={(e) => setPayoutAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                        />
                      </div>

                      {payoutType === 'CASH' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link do faktury PDF (Invoice URL)</label>
                          <input
                            type="url"
                            required
                            value={invoiceUrl}
                            onChange={(e) => setInvoiceUrl(e.target.value)}
                            placeholder="https://twoj-dysk.pl/faktura.pdf"
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">Wypłata gotówkowa wymaga przesłania faktury wystawionej na firmę.</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submittingPayout}
                        className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                      >
                        {submittingPayout ? 'Przetwarzanie...' : 'Wypłać środki'}
                      </button>
                    </form>
                  </div>

                  {/* Attributed Orders */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950 dark:text-white mb-4">Przypisane Zamówienia</h3>
                    {profile.stats.referrals.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Nie zarejestrowano jeszcze żadnych zamówień z Twoich linków polecających.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                            <tr>
                              <th className="px-4 py-3">Numer Zamówienia</th>
                              <th className="px-4 py-3 text-center">Wartość Brutto</th>
                              <th className="px-4 py-3 text-right">Prowizja</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right">Data</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                            {profile.stats.referrals.map((ref) => (
                              <tr key={ref.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                                  <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">{ref.order.orderNumber}</td>
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

                  {/* Payout requests ledger */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950 dark:text-white mb-4">Historia Wypłat</h3>
                    {profile.stats.recentPayouts.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Brak wniosków o wypłatę w historii.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                            <tr>
                              <th className="px-4 py-3">Metoda</th>
                              <th className="px-4 py-3">Szczegóły</th>
                              <th className="px-4 py-3 text-right">Kwota</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right">Data</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                            {profile.stats.recentPayouts.map((pay) => (
                              <tr key={pay.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                                  <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                                    {pay.type === 'COUPON' ? 'Kupon' : 'Przelew bankowy'}
                                  </td>
                                  <td className="px-4 py-3.5 text-xs font-mono">
                                    {pay.couponCode && (
                                      <div>Kod kuponu: <span className="font-bold text-orange-500">{pay.couponCode}</span></div>
                                    )}
                                    {pay.invoiceUrl && (
                                      <a href={pay.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Podgląd faktury</a>
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

                  {/* MLM Overrides (Nadprowizje z zespołu) */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950 dark:text-white mb-4">Nadprowizje z Zespołu (MLM)</h3>
                    {overrides.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Brak zarejestrowanych nadprowizji od partnerów z Twojej struktury.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                            <tr>
                              <th className="px-4 py-3">Zamówienie</th>
                              <th className="px-4 py-3 text-center">Poziom</th>
                              <th className="px-4 py-3 text-right">Kwota</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right">Data</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                            {overrides.map((ov) => (
                              <tr key={ov.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                                <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">{ov.order.orderNumber}</td>
                                <td className="px-4 py-3.5 text-center">Poziom {ov.level}</td>
                                <td className="px-4 py-3.5 text-right font-medium text-orange-500">{Number(ov.amount).toFixed(2)} PLN</td>
                                <td className="px-4 py-3.5 text-center">{statusBadge(ov.status)}</td>
                                <td className="px-4 py-3.5 text-right text-xs">{formatDate(ov.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* WBTP: Premia Liderów */}
                  {leaderBonuses.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-950 dark:text-white mb-4">Premia Liderów</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                            <tr>
                              <th className="px-4 py-3">Zamówienie</th>
                              <th className="px-4 py-3 text-center">Ranga / udział</th>
                              <th className="px-4 py-3 text-right">Kwota</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right">Data</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                            {leaderBonuses.map((b) => (
                              <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                                <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">{b.order?.orderNumber ?? '—'}</td>
                                <td className="px-4 py-3.5 text-center text-xs">
                                  {RANK_LABELS[b.rank] ?? b.rank} · {Number(b.sharePct)}%
                                  {Number(b.wlAddonPct) > 0 && <span className="text-green-600 font-semibold"> +WL</span>}
                                </td>
                                <td className="px-4 py-3.5 text-right font-medium text-orange-500">{Number(b.amount).toFixed(2)} PLN</td>
                                <td className="px-4 py-3.5 text-center">{statusBadge(b.status)}</td>
                                <td className="px-4 py-3.5 text-right text-xs">{formatDate(b.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* MLM Downline (Twoja struktura) */}
                  <div className="bg-gray-50 dark:bg-secondary-900/50 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700/50">
                    <h3 className="font-semibold text-gray-950 dark:text-white mb-2">Twoja Struktura Partnerska</h3>
                    <DownlineTree nodes={downline} />
                  </div>

                  {/* Najczęściej sprzedawane produkty (per-produkt) */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950 dark:text-white mb-1">Najczęściej Sprzedawane Produkty</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Rozbicie sprzedaży z Twoich linków wg produktu — każdy produkt liczony osobno, nawet jeśli klient dołożył do koszyka inne.</p>
                    {productStats.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Brak sprzedanych produktów z Twoich linków.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                            <tr>
                              <th className="px-4 py-3">Produkt</th>
                              <th className="px-4 py-3 text-center">Sprzedane szt.</th>
                              <th className="px-4 py-3 text-right">Wartość sprzedaży</th>
                              <th className="px-4 py-3 text-right">Twoja prowizja</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                            {productStats.map((p) => (
                              <tr key={p.productId} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                                <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">{p.productName}</td>
                                <td className="px-4 py-3.5 text-center font-semibold">{p.quantitySold}</td>
                                <td className="px-4 py-3.5 text-right">{p.salesValue.toFixed(2)} PLN</td>
                                <td className="px-4 py-3.5 text-right font-medium text-orange-500">{p.commission.toFixed(2)} PLN</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
