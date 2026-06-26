'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AccountSidebar from '../../../components/AccountSidebar';
import { useAuth } from '../../../contexts/AuthContext';
import { referralApi, PartnerProfileData, ReferralLinkData, ApiClientError } from '../../../lib/api';

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
      return <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Anulowane</span>;
    case 'COMPLETED':
      return <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Zrealizowano</span>;
    case 'REJECTED':
      return <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">Odrzucono</span>;
    default:
      return <span className="bg-gray-100 dark:bg-secondary-800 text-gray-800 dark:text-gray-400 text-xs px-2.5 py-1 rounded-full font-medium">{status}</span>;
  }
}

export default function PartnershipPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PartnerProfileData | null>(null);
  const [links, setLinks] = useState<ReferralLinkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [regBankAccount, setRegBankAccount] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regNip, setRegNip] = useState('');
  const [regInvitedBy, setRegInvitedBy] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);

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
        const linksData = await referralApi.listLinks();
        setLinks(linksData);
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
    setSubmittingReg(true);
    setError('');
    setSuccess('');
    try {
      const newProfile = await referralApi.register({
        bankAccountNumber: regBankAccount || undefined,
        companyName: regCompanyName || undefined,
        nip: regNip || undefined,
        invitedBy: regInvitedBy || undefined,
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

                    <button
                      type="submit"
                      disabled={submittingReg}
                      className="px-6 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-medium transition-colors shadow-sm focus:outline-none"
                    >
                      {submittingReg ? 'Rejestrowanie...' : 'Zarejestruj się jako partner'}
                    </button>
                  </form>
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
                                  <td className="px-4 py-3.5 text-center">{ref.order.total.toFixed(2)} PLN</td>
                                  <td className="px-4 py-3.5 text-right font-medium text-orange-500">{ref.primaryCommission.toFixed(2)} PLN</td>
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
                                <td className="px-4 py-3.5 text-right font-medium text-gray-950 dark:text-white">{pay.amount.toFixed(2)} PLN</td>
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
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
