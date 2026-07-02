'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AccountSidebar from '../../../components/AccountSidebar';
import { useAuth } from '../../../contexts/AuthContext';
import { salesRepApi, SalesRepBalance, SalesRepCommissionItem, SalesRepCartData, SalesRepOfferTemplate, SalesRepOfferItem } from '../../../lib/api';

export default function SalesRepPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'checkout' | 'commissions' | 'offers'>('overview');

  // Stats & Balance
  const [balance, setBalance] = useState<SalesRepBalance>({
    available: 0,
    frozen: 0,
    totalEarned: 0,
    reserved: 0,
  });
  const [balanceLoading, setBalanceLoading] = useState(true);

  // Commissions History
  const [commissions, setCommissions] = useState<SalesRepCommissionItem[]>([]);
  const [commissionsCount, setCommissionsCount] = useState(0);
  const [commissionsPage, setCommissionsPage] = useState(1);
  const [commissionsLoading, setCommissionsLoading] = useState(true);

  // Merchant Cart & Offers Creator
  const [cartData, setCartData] = useState<SalesRepCartData | null>(null);
  const [repConfig, setRepConfig] = useState<{ maxDiscountPct: number; pool: number } | null>(null);
  const [modulesConfig, setModulesConfig] = useState<{ offerTemplates: boolean; offerTracking: boolean; leaderboard: boolean }>({
    offerTemplates: false,
    offerTracking: false,
    leaderboard: false,
  });
  const [cartLoading, setCartLoading] = useState(true);
  const [discountPct, setDiscountPct] = useState(0);
  // Rabat można podać jako % (suwak) albo jako kwotę PLN — system zawsze przycina
  // efektywny rabat do maksimum wynikającego z limitu % ustawionego przez admina.
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountAmountInput, setDiscountAmountInput] = useState(0);
  // Kreator oferty jest dwuetapowy: najpierw handlowiec ustala rabat (widzi swoją
  // prowizję), potem przechodzi do podsumowania oferty (bez prowizji) i danych klienta.
  const [checkoutStep, setCheckoutStep] = useState<'build' | 'review'>('build');

  // Moduł: Szablony ofert (opcjonalny — może być wyłączony przez administratora)
  const [templates, setTemplates] = useState<SalesRepOfferTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [templateActionError, setTemplateActionError] = useState('');
  const [templateActionSuccess, setTemplateActionSuccess] = useState('');
  const [templateActionLoading, setTemplateActionLoading] = useState(false);

  // Moduł: Śledzenie ofert (opcjonalny — może być wyłączony przez administratora)
  const [offers, setOffers] = useState<SalesRepOfferItem[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersPage, setOffersPage] = useState(1);
  const [offersTotalPages, setOffersTotalPages] = useState(1);
  const [remindingOfferId, setRemindingOfferId] = useState<string | null>(null);
  const [offersError, setOffersError] = useState('');

  // Moduł: Cele i ranking (opcjonalny — może być wyłączony przez administratora)
  const [goalProgress, setGoalProgress] = useState<{ goal: number; currentMonthCommission: number; progressPct: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ name: string; total: number; rank: number; isCurrentUser: boolean }>>([]);

  // Form: Payout request
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutFile, setPayoutFile] = useState<File | null>(null);
  const [payoutUploading, setPayoutUploading] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [payoutSuccess, setPayoutSuccess] = useState('');

  // Form: Client Checkout
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNip, setCustomerNip] = useState('');
  const [customerCompanyName, setCustomerCompanyName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('PL');
  const [shippingMethod, setShippingMethod] = useState('courier');
  const [paymentMethod, setPaymentMethod] = useState('payu');
  const [customerNotes, setCustomerNotes] = useState('');
  const [differentBillingAddress, setDifferentBillingAddress] = useState(false);
  const [billingStreet, setBillingStreet] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [billingCountry, setBillingCountry] = useState('PL');

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState<any | null>(null);

  // Redirect if not logged in or not a merchant
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    } else if (!isLoading && isAuthenticated && user?.role !== 'HANDLOWIEC') {
      router.push('/account');
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Load Balance and Metrics
  const fetchBalance = async () => {
    try {
      setBalanceLoading(true);
      const res = await salesRepApi.getBalance();
      if (res.success && res.balance) {
        setBalance(res.balance);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
    } finally {
      setBalanceLoading(false);
    }
  };

  // Load Commissions
  const fetchCommissions = async (page: number) => {
    try {
      setCommissionsLoading(true);
      const res = await salesRepApi.getCommissions(page, 10);
      if (res.success) {
        setCommissions(res.commissions);
        setCommissionsCount(res.total);
      }
    } catch (err) {
      console.error('Error fetching commissions:', err);
    } finally {
      setCommissionsLoading(false);
    }
  };

  // Load Cart
  const fetchCart = async () => {
    try {
      setCartLoading(true);
      const res = await salesRepApi.getCart();
      if (res.items) {
        setCartData(res);
      }
    } catch (err) {
      console.error('Error fetching cart:', err);
    } finally {
      setCartLoading(false);
    }
  };

  // Load commission config (slider max + pool) so the panel follows admin thresholds.
  const fetchConfig = async () => {
    try {
      const res = await salesRepApi.getConfig();
      if (res.success) {
        setRepConfig({ maxDiscountPct: res.maxDiscountPct, pool: res.pool });
        setModulesConfig(res.modules || { offerTemplates: false, offerTracking: false, leaderboard: false });
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  // Moduł: Szablony ofert
  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const res = await salesRepApi.getTemplates();
      if (res.success) setTemplates(res.templates);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    setTemplateActionError('');
    setTemplateActionSuccess('');
    if (!newTemplateName.trim()) {
      setTemplateActionError('Podaj nazwę szablonu.');
      return;
    }
    try {
      setTemplateActionLoading(true);
      await salesRepApi.createTemplate(newTemplateName.trim(), effectiveDiscountPct);
      setNewTemplateName('');
      setTemplateActionSuccess('Szablon oferty został zapisany.');
      fetchTemplates();
    } catch (err: any) {
      setTemplateActionError(err.message || 'Nie udało się zapisać szablonu.');
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const handleLoadTemplate = async (id: string) => {
    setTemplateActionError('');
    setTemplateActionSuccess('');
    try {
      setTemplateActionLoading(true);
      const res = await salesRepApi.loadTemplate(id);
      fetchCart();
      if (res.skipped?.length) {
        setTemplateActionError(`Pominięto ${res.skipped.length} pozycji (niedostępne): ${res.skipped.map((s) => s.name).join(', ')}`);
      } else {
        setTemplateActionSuccess(`Wczytano ${res.addedCount} pozycji szablonu do koszyka.`);
      }
    } catch (err: any) {
      setTemplateActionError(err.message || 'Nie udało się wczytać szablonu.');
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await salesRepApi.deleteTemplate(id);
      fetchTemplates();
    } catch (err: any) {
      setTemplateActionError(err.message || 'Nie udało się usunąć szablonu.');
    }
  };

  // Moduł: Śledzenie ofert
  const fetchOffers = async (page: number) => {
    try {
      setOffersLoading(true);
      setOffersError('');
      const res = await salesRepApi.getOffers(page, 10);
      if (res.success) {
        setOffers(res.orders);
        setOffersTotalPages(res.totalPages);
      }
    } catch (err: any) {
      setOffersError(err.message || 'Nie udało się pobrać listy ofert.');
    } finally {
      setOffersLoading(false);
    }
  };

  const handleRemindOffer = async (id: string) => {
    try {
      setRemindingOfferId(id);
      setOffersError('');
      await salesRepApi.remindOffer(id);
      fetchOffers(offersPage);
    } catch (err: any) {
      setOffersError(err.message || 'Nie udało się wysłać przypomnienia.');
    } finally {
      setRemindingOfferId(null);
    }
  };

  // Moduł: Cele i ranking
  const fetchGoalAndLeaderboard = async () => {
    try {
      const [goalRes, leaderboardRes] = await Promise.all([
        salesRepApi.getGoalProgress(),
        salesRepApi.getLeaderboard(),
      ]);
      if (goalRes.success) setGoalProgress({ goal: goalRes.goal, currentMonthCommission: goalRes.currentMonthCommission, progressPct: goalRes.progressPct });
      if (leaderboardRes.success) setLeaderboard(leaderboardRes.leaderboard);
    } catch (err) {
      console.error('Error fetching goal/leaderboard:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === 'HANDLOWIEC') {
      fetchBalance();
      fetchCommissions(commissionsPage);
      fetchCart();
      fetchConfig();
    }
  }, [isAuthenticated, user, commissionsPage]);

  // Load module data once flags are known / relevant tab is active
  useEffect(() => {
    if (isAuthenticated && user?.role === 'HANDLOWIEC' && modulesConfig.offerTemplates && activeTab === 'checkout') {
      fetchTemplates();
    }
  }, [isAuthenticated, user, modulesConfig.offerTemplates, activeTab]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'HANDLOWIEC' && modulesConfig.offerTracking && activeTab === 'offers') {
      fetchOffers(offersPage);
    }
  }, [isAuthenticated, user, modulesConfig.offerTracking, activeTab, offersPage]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'HANDLOWIEC' && modulesConfig.leaderboard) {
      fetchGoalAndLeaderboard();
    }
  }, [isAuthenticated, user, modulesConfig.leaderboard]);

  // Handle invoice file upload and payout request
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutError('');
    setPayoutSuccess('');

    const amountNum = parseFloat(payoutAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setPayoutError('Wpisz prawidłową kwotę wypłaty.');
      return;
    }

    if (amountNum > balance.available) {
      setPayoutError(`Wnioskowana kwota przekracza dostępne środki (${balance.available} zł).`);
      return;
    }

    if (!payoutFile) {
      setPayoutError('Musisz wgrać fakturę w formacie PDF.');
      return;
    }

    try {
      setPayoutUploading(true);

      // Get auth token for direct fetch
      const storedTokens = localStorage.getItem('auth_tokens');
      if (!storedTokens) throw new Error('Brak tokenu autoryzacji.');
      const token = JSON.parse(storedTokens).accessToken;

      // 1. Upload the invoice PDF
      const formData = new FormData();
      formData.append('invoice', payoutFile);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const uploadRes = await fetch(`${apiUrl}/upload/invoice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Błąd podczas wgrywania pliku faktury.');
      }

      const uploadData = await uploadRes.json();
      const invoiceUrl = uploadData.url;

      // 2. Submit the payout request
      await salesRepApi.requestPayout(amountNum, invoiceUrl);

      setPayoutSuccess('Wniosek o wypłatę został złożony pomyślnie i oczekuje na weryfikację.');
      setPayoutAmount('');
      setPayoutFile(null);
      
      // Refresh balance metrics
      fetchBalance();
    } catch (err: any) {
      setPayoutError(err.message || 'Wystąpił błąd podczas składania wniosku o wypłatę.');
    } finally {
      setPayoutUploading(false);
    }
  };

  // Handle order checkout
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError('');
    setCheckoutSuccess(null);

    if (!cartData || cartData.items.length === 0) {
      setCheckoutError('Koszyk jest pusty.');
      return;
    }

    try {
      setCheckoutLoading(true);

      const checkoutPayload = {
        discountPct: effectiveDiscountPct,
        customerEmail,
        customerFirstName,
        customerLastName,
        customerPhone,
        customerNip,
        customerCompanyName,
        shippingMethod,
        paymentMethod,
        customerNotes,
        street,
        city,
        postalCode,
        country,
        differentBillingAddress,
        billingStreet: differentBillingAddress ? billingStreet : undefined,
        billingCity: differentBillingAddress ? billingCity : undefined,
        billingPostalCode: differentBillingAddress ? billingPostalCode : undefined,
        billingCountry: differentBillingAddress ? billingCountry : undefined,
        packageShipping: cartData.items.map((item, idx) => ({
          packageId: `pkg-${idx}`,
          method: shippingMethod,
          price: 0, // Server overrides this
        })),
      };

      const res = await salesRepApi.checkout(checkoutPayload);

      setCheckoutSuccess(res);
      setCheckoutStep('build');
      setDiscountPct(0);
      setDiscountAmountInput(0);

      // Clear forms
      setCustomerEmail('');
      setCustomerFirstName('');
      setCustomerLastName('');
      setCustomerPhone('');
      setCustomerNip('');
      setCustomerCompanyName('');
      setStreet('');
      setCity('');
      setPostalCode('');
      setDifferentBillingAddress(false);
      setBillingStreet('');
      setBillingCity('');
      setBillingPostalCode('');

      // Refresh balance & cart
      fetchBalance();
      fetchCart();
    } catch (err: any) {
      setCheckoutError(err.message || 'Wystąpił błąd podczas tworzenia zamówienia.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  // Pre-calculate live totals na bazie efektywnego rabatu (pool + max z konfiguracji admina)
  const commissionPoolPct = repConfig?.pool ?? 18;
  const maxDiscount = repConfig?.maxDiscountPct ?? 13;

  const baseTotal = cartData?.subtotal || 0;
  // Rabat i prowizja liczone od CENY ZAKUPU (purchaseTotal) — identycznie jak backend
  // (attributeCommission: discount = purchaseTotal * d%). Wcześniej liczone od ceny
  // detalicznej, przez co panel pokazywał inną kwotę niż zamówienie/mail klienta.
  const purchaseBase = cartData?.purchaseTotal || 0;
  // Maksymalna KWOTA rabatu zawsze wynika z limitu % — niezależnie od trybu wpisywania.
  const maxDiscountAmount = (purchaseBase * maxDiscount) / 100;
  // Efektywny % rabatu używany do wszystkich wyliczeń i wysyłki do backendu — przycinany
  // do maxDiscount bez względu na to, czy handlowiec wpisał % czy kwotę PLN.
  const effectiveDiscountPct = discountMode === 'amount'
    ? (purchaseBase > 0 ? Math.min(maxDiscount, Math.max(0, (discountAmountInput / purchaseBase) * 100)) : 0)
    : Math.min(maxDiscount, discountPct);

  const repCommissionPct = Math.max(0, commissionPoolPct - effectiveDiscountPct);
  const discountVal = (purchaseBase * effectiveDiscountPct) / 100;
  const finalPrice = Math.max(0, baseTotal - discountVal);
  const repCommissionVal = (purchaseBase * repCommissionPct) / 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
      <Header />

      <main className="container-custom py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <AccountSidebar activeId="sales-rep" userName={`${user.firstName} ${user.lastName}`} userEmail={user.email} />

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Header section with page title */}
            <div className="mb-6 bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel Handlowca</h1>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">Zarządzaj swoimi ofertami handlowymi, saldem prowizji i wypłatami.</p>
                </div>
                <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/30 px-3.5 py-1.5 rounded-full text-orange-600 dark:text-orange-400 font-semibold text-sm">
                  <span>Rola: Handlowiec</span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 dark:border-secondary-700 mb-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === 'overview'
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Bilans i Payouty
              </button>
              <button
                onClick={() => setActiveTab('checkout')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === 'checkout'
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Kreator oferty ({cartData?.items?.length || 0} szt.)
              </button>
              <button
                onClick={() => setActiveTab('commissions')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === 'commissions'
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Historia prowizji
              </button>
              {modulesConfig.offerTracking && (
                <button
                  onClick={() => setActiveTab('offers')}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === 'offers'
                      ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Śledzenie ofert
                </button>
              )}
            </div>

            {/* TAB CONTENT: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Moduł: Cele i ranking (opcjonalny) */}
                {modulesConfig.leaderboard && goalProgress && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-7 bg-white dark:bg-secondary-800 rounded-2xl p-5 border border-gray-100 dark:border-secondary-700 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Cel miesięczny prowizji</h3>
                        <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                          {goalProgress.currentMonthCommission.toFixed(2)} / {goalProgress.goal.toFixed(2)} PLN
                        </span>
                      </div>
                      <div className="w-full bg-gray-150 dark:bg-secondary-900 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                          style={{ width: `${Math.max(0, Math.min(100, goalProgress.progressPct))}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">{goalProgress.progressPct.toFixed(0)}% zrealizowanego celu w tym miesiącu.</p>
                    </div>

                    <div className="lg:col-span-5 bg-white dark:bg-secondary-800 rounded-2xl p-5 border border-gray-100 dark:border-secondary-700 shadow-sm">
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Ranking handlowców (ten miesiąc)</h3>
                      {leaderboard.length === 0 ? (
                        <p className="text-xs text-gray-400">Brak prowizji w tym miesiącu.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {leaderboard.map((entry) => (
                            <div
                              key={entry.rank}
                              className={`flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg ${entry.isCurrentUser ? 'bg-orange-50 dark:bg-orange-950/20 font-semibold text-orange-700 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}
                            >
                              <span>#{entry.rank} {entry.name}{entry.isCurrentUser ? ' (Ty)' : ''}</span>
                              <span>{entry.total.toFixed(2)} PLN</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Balance Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-5 text-white shadow-sm transition-all hover:scale-[1.02]">
                    <span className="text-xs uppercase font-semibold text-white/80">Dostępne środki</span>
                    <div className="text-2xl font-bold mt-1">
                      {balanceLoading ? '...' : `${balance.available.toFixed(2)} PLN`}
                    </div>
                    <p className="text-xs text-white/70 mt-2">Gotowe do wypłaty.</p>
                  </div>
                  <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-5 shadow-sm">
                    <span className="text-xs uppercase font-semibold text-gray-400 dark:text-gray-500">Prowizje zamrożone</span>
                    <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                      {balanceLoading ? '...' : `${balance.frozen.toFixed(2)} PLN`}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Okres karencji (14 dni).</p>
                  </div>
                  <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-5 shadow-sm">
                    <span className="text-xs uppercase font-semibold text-gray-400 dark:text-gray-500">Zarezerwowane</span>
                    <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                      {balanceLoading ? '...' : `${balance.reserved.toFixed(2)} PLN`}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">W trakcie wypłacania.</p>
                  </div>
                  <div className="bg-white dark:bg-secondary-800 border border-gray-100 dark:border-secondary-700 rounded-2xl p-5 shadow-sm">
                    <span className="text-xs uppercase font-semibold text-gray-400 dark:text-gray-500">Suma zarobiona</span>
                    <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                      {balanceLoading ? '...' : `${balance.totalEarned.toFixed(2)} PLN`}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Od początku współpracy.</p>
                  </div>
                </div>

                {/* Payout Form */}
                <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Wypłata środków na konto</h2>
                  
                  {payoutError && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                      {payoutError}
                    </div>
                  )}

                  {payoutSuccess && (
                    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-600">
                      {payoutSuccess}
                    </div>
                  )}

                  <form onSubmit={handlePayoutSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                          Kwota wypłaty (PLN)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="np. 500"
                          value={payoutAmount}
                          onChange={(e) => setPayoutAmount(e.target.value)}
                          disabled={payoutUploading}
                          className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                          Wgraj fakturę prowizyjną (PDF)
                        </label>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => setPayoutFile(e.target.files?.[0] || null)}
                          disabled={payoutUploading}
                          className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-950/20 dark:file:text-orange-400"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={payoutUploading || balance.available <= 0}
                      className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-secondary-800 disabled:text-gray-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                      {payoutUploading ? 'Wysyłanie...' : 'Wyślij wniosek o wypłatę'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB CONTENT: CHECKOUT */}
            {activeTab === 'checkout' && (
              <div className="space-y-6">
                {checkoutSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-green-800 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-lg">✓</div>
                      <div>
                        <h3 className="font-bold text-lg text-green-900">Zamówienie zostało utworzone!</h3>
                        <p className="text-sm">Numer zamówienia: <strong>{checkoutSuccess.orderNumber}</strong></p>
                      </div>
                    </div>
                    <p className="text-sm">
                      Prowizja za to zamówienie wyniesie szacunkowo <strong>{checkoutSuccess.commissionPreview.toFixed(2)} PLN</strong> i zostanie zaksięgowana po opłaceniu zamówienia przez klienta.
                    </p>
                    <p className="text-sm">
                      Klient otrzymał wiadomość e-mail z instrukcjami dotyczącymi płatności ({checkoutSuccess.paymentMethod === 'payu' ? 'link do płatności online' : 'dane do przelewu tradycyjnego'}).
                    </p>
                    <button
                      onClick={() => { setCheckoutSuccess(null); setCheckoutStep('build'); }}
                      className="mt-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors"
                    >
                      Stwórz kolejne ofertowanie
                    </button>
                  </div>
                )}

                {/* Step indicator */}
                <div className="flex items-center gap-2 text-sm">
                  <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full font-semibold transition-colors ${checkoutStep === 'build' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-secondary-800 text-gray-500 dark:text-gray-400'}`}>
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">1</span>
                    Oferta i rabat
                  </div>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-secondary-700" />
                  <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full font-semibold transition-colors ${checkoutStep === 'review' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-secondary-800 text-gray-500 dark:text-gray-400'}`}>
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">2</span>
                    Dane klienta i wysyłka
                  </div>
                </div>

                {/* STEP 1: Offer creator builder (rep-only, discount + commission) */}
                {checkoutStep === 'build' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Cart review */}
                    <div className="lg:col-span-7 space-y-6">
                      {/* Cart Items List */}
                      <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Pozycje w koszyku handlowym</h2>

                        {cartLoading ? (
                          <div className="text-center py-6 text-gray-500">Ładowanie pozycji koszyka...</div>
                        ) : !cartData || cartData.items.length === 0 ? (
                          <div className="text-center py-6 text-gray-500">
                            Twój koszyk jest obecnie pusty. Dodaj najpierw produkty w sklepie do koszyka.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="divide-y divide-gray-100 dark:divide-secondary-700">
                              {cartData.items.map((item) => (
                                <div key={item.id} className="py-3 flex gap-3 items-start">
                                  {item.image && (
                                    <img src={item.image} alt={item.productName} className="w-12 h-12 rounded object-cover border border-gray-100 dark:border-secondary-700" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.productName}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Wariant: {item.variantName}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">Ilość: {item.quantity} szt.</p>
                                  </div>
                                  <div className="text-right whitespace-nowrap">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{(item.price * item.quantity).toFixed(2)} zł</p>

                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Live profit calculations */}
                            <div className="border-t border-gray-100 dark:border-secondary-700 pt-4 space-y-2 text-sm">
                              <div className="flex justify-between text-gray-500">
                                <span>Wartość bazowa:</span>
                                <span className="font-semibold">{baseTotal.toFixed(2)} PLN</span>
                              </div>
                              <div className="flex justify-between text-orange-500">
                                <span>Rabat dla klienta ({effectiveDiscountPct.toFixed(1)}%):</span>
                                <span className="font-semibold">-{discountVal.toFixed(2)} PLN</span>
                              </div>
                              <div className="flex justify-between text-gray-900 dark:text-white font-bold text-lg pt-1 border-t border-dashed border-gray-100 dark:border-secondary-700">
                                <span>Kwota do zapłaty:</span>
                                <span>{finalPrice.toFixed(2)} PLN</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Discount editor (rep-only, shows commission) */}
                    <div className="lg:col-span-5 space-y-6">
                      {/* Moduł: Szablony ofert (opcjonalny) */}
                      {modulesConfig.offerTemplates && (
                        <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm space-y-3">
                          <h3 className="font-bold text-gray-900 dark:text-white">Szablony ofert</h3>

                          {templateActionError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-600">{templateActionError}</div>
                          )}
                          {templateActionSuccess && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-green-600">{templateActionSuccess}</div>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Nazwa szablonu np. Zestaw startowy"
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value)}
                              disabled={templateActionLoading}
                              className="flex-1 rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3 py-1.5 text-xs focus:border-orange-500 focus:outline-none dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={handleSaveTemplate}
                              disabled={templateActionLoading || !cartData || cartData.items.length === 0}
                              className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
                            >
                              Zapisz koszyk
                            </button>
                          </div>

                          {templatesLoading ? (
                            <p className="text-xs text-gray-400">Ładowanie szablonów...</p>
                          ) : templates.length === 0 ? (
                            <p className="text-xs text-gray-400">Brak zapisanych szablonów.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {templates.map((tpl) => (
                                <div key={tpl.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-secondary-900/50 rounded-lg px-2.5 py-2">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{tpl.name}</p>
                                    <p className="text-gray-400">{tpl.items.length} poz. · rabat {Number(tpl.discountPct).toFixed(1)}%</p>
                                  </div>
                                  <div className="flex gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleLoadTemplate(tpl.id)}
                                      disabled={templateActionLoading}
                                      className="text-orange-600 dark:text-orange-400 font-semibold hover:underline"
                                    >
                                      Wczytaj
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTemplate(tpl.id)}
                                      disabled={templateActionLoading}
                                      className="text-red-500 hover:underline"
                                    >
                                      Usuń
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold text-gray-900 dark:text-white">Ustaw rabat dla klienta</h3>
                          <span className="bg-orange-500 text-white font-bold text-sm px-2.5 py-1 rounded-lg">{effectiveDiscountPct.toFixed(1)}%</span>
                        </div>

                        {/* Discount mode toggle: % or PLN amount */}
                        <div className="inline-flex rounded-lg border border-gray-200 dark:border-secondary-700 p-1 bg-gray-50 dark:bg-secondary-900">
                          <button
                            type="button"
                            onClick={() => setDiscountMode('percent')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${discountMode === 'percent' ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400'}`}
                          >
                            Rabat %
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountMode('amount')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${discountMode === 'amount' ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400'}`}
                          >
                            Rabat kwotowo (PLN)
                          </button>
                        </div>

                        {discountMode === 'percent' ? (
                          <input
                            type="range"
                            min="0"
                            max={maxDiscount}
                            value={discountPct}
                            onChange={(e) => setDiscountPct(parseInt(e.target.value))}
                            disabled={cartLoading || !cartData || cartData.items.length === 0}
                            className="w-full accent-orange-500 h-2 bg-gray-200 dark:bg-secondary-700 rounded-lg cursor-pointer"
                          />
                        ) : (
                          <div>
                            <input
                              type="number"
                              min="0"
                              max={maxDiscountAmount}
                              step="0.01"
                              value={discountAmountInput}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setDiscountAmountInput(Math.min(Math.max(0, v), maxDiscountAmount));
                              }}
                              disabled={cartLoading || !cartData || cartData.items.length === 0}
                              placeholder="np. 50"
                              className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                            />
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                              Maksymalny rabat kwotowy: <strong>{maxDiscountAmount.toFixed(2)} PLN</strong> (system wylicza go z limitu {maxDiscount}% ustawionego przez administratora).
                            </p>
                          </div>
                        )}

                        {/* Summary visual tags */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-xl p-3.5 text-center">
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">TWOJA PROWIZJA ({repCommissionPct.toFixed(1)}%)</p>
                            <p className="text-xl font-extrabold text-orange-600 dark:text-orange-400 mt-1">{repCommissionVal.toFixed(2)} PLN</p>
                          </div>
                          <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-xl p-3.5 text-center">
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">RABAT KLIENTA ({effectiveDiscountPct.toFixed(1)}%)</p>
                            <p className="text-xl font-extrabold text-green-600 dark:text-green-400 mt-1">{discountVal.toFixed(2)} PLN</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center">
                          * Prowizja i rabat są wyliczane wyłącznie z bazy wyłączającej produkty promocyjne i outletowe.
                        </p>

                        <button
                          type="button"
                          onClick={() => setCheckoutStep('review')}
                          disabled={cartLoading || !cartData || cartData.items.length === 0}
                          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-secondary-800 disabled:text-gray-500 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                        >
                          Dalej: dane klienta →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Offer summary (no commission — client-safe) + customer data form */}
                {checkoutStep === 'review' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Client-facing offer summary — commission NEVER shown here */}
                    <div className="lg:col-span-7 space-y-6">
                      <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Podsumowanie oferty dla klienta</h2>
                          <button
                            type="button"
                            onClick={() => setCheckoutStep('build')}
                            className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                          >
                            ← Wróć do edycji rabatu
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div className="divide-y divide-gray-100 dark:divide-secondary-700">
                            {(cartData?.items || []).map((item) => (
                              <div key={item.id} className="py-3 flex gap-3 items-start">
                                {item.image && (
                                  <img src={item.image} alt={item.productName} className="w-12 h-12 rounded object-cover border border-gray-100 dark:border-secondary-700" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.productName}</h4>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Wariant: {item.variantName}</p>
                                  <p className="text-xs text-gray-400 dark:text-gray-500">Ilość: {item.quantity} szt.</p>
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">{(item.price * item.quantity).toFixed(2)} zł</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Kwota transakcji przed i po rabacie — bez informacji o prowizji handlowca */}
                          <div className="border-t border-gray-100 dark:border-secondary-700 pt-4 space-y-2 text-sm">
                            <div className="flex justify-between text-gray-500">
                              <span>Kwota przed rabatem:</span>
                              <span className="font-semibold">{baseTotal.toFixed(2)} PLN</span>
                            </div>
                            <div className="flex justify-between text-orange-500">
                              <span>Rabat ({effectiveDiscountPct.toFixed(1)}%):</span>
                              <span className="font-semibold">-{discountVal.toFixed(2)} PLN</span>
                            </div>
                            <div className="flex justify-between text-gray-900 dark:text-white font-bold text-lg pt-1 border-t border-dashed border-gray-100 dark:border-secondary-700">
                              <span>Kwota po rabacie:</span>
                              <span>{finalPrice.toFixed(2)} PLN</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Customer details checkout form */}
                    <div className="lg:col-span-5">
                      <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Dane klienta i wysyłka</h2>

                        {checkoutError && (
                          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                            {checkoutError}
                          </div>
                        )}

                        <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">E-mail odbiorcy</label>
                          <input
                            type="email"
                            required
                            placeholder="klient@firma.pl"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Imię</label>
                            <input
                              type="text"
                              required
                              value={customerFirstName}
                              onChange={(e) => setCustomerFirstName(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nazwisko</label>
                            <input
                              type="text"
                              required
                              value={customerLastName}
                              onChange={(e) => setCustomerLastName(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Telefon</label>
                          <input
                            type="tel"
                            required
                            placeholder="+48..."
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                          />
                        </div>
                        <div className="border-t border-gray-100 dark:border-secondary-700 pt-3">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-2">Dane firmy (B2B)</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">NIP</label>
                              <input
                                type="text"
                                required
                                value={customerNip}
                                onChange={(e) => setCustomerNip(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nazwa firmy</label>
                              <input
                                type="text"
                                required
                                value={customerCompanyName}
                                onChange={(e) => setCustomerCompanyName(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="border-t border-gray-100 dark:border-secondary-700 pt-3">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-2">Adres dostawy</h4>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Ulica i numer</label>
                              <input
                                type="text"
                                required
                                value={street}
                                onChange={(e) => setStreet(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Kod pocztowy</label>
                                <input
                                  type="text"
                                  required
                                  value={postalCode}
                                  onChange={(e) => setPostalCode(e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Miasto</label>
                                <input
                                  type="text"
                                  required
                                  value={city}
                                  onChange={(e) => setCity(e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Different billing address checkbox */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id="diffBilling"
                            checked={differentBillingAddress}
                            onChange={(e) => setDifferentBillingAddress(e.target.checked)}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <label htmlFor="diffBilling" className="text-sm text-gray-600 dark:text-gray-300 font-semibold select-none">
                            Inny adres rozliczeniowy (faktury)
                          </label>
                        </div>

                        {differentBillingAddress && (
                          <div className="space-y-3 bg-gray-50 dark:bg-secondary-900 p-3 rounded-lg border border-gray-200 dark:border-secondary-700">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Ulica faktury</label>
                              <input
                                type="text"
                                required
                                value={billingStreet}
                                onChange={(e) => setBillingStreet(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-800 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Kod pocztowy</label>
                                <input
                                  type="text"
                                  required
                                  value={billingPostalCode}
                                  onChange={(e) => setBillingPostalCode(e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-800 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Miasto</label>
                                <input
                                  type="text"
                                  required
                                  value={billingCity}
                                  onChange={(e) => setBillingCity(e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-800 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="border-t border-gray-100 dark:border-secondary-700 pt-3">
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Metoda dostawy</label>
                          <select
                            value={shippingMethod}
                            onChange={(e) => setShippingMethod(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                          >
                            <option value="courier">Kurier DPD / DHL</option>
                            <option value="inpost_paczkomaty">InPost Paczkomat</option>
                            <option value="b2b_wysylka_wlasna">Wysyłka własna partnera</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Forma płatności dla klienta</label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                          >
                            <option value="payu">Płatność online (PayU)</option>
                            <option value="bank_transfer">Przelew tradycyjny (faktura proforma)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notatki / uwagi</label>
                          <textarea
                            value={customerNotes}
                            onChange={(e) => setCustomerNotes(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:text-white h-16"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={checkoutLoading || !cartData || cartData.items.length === 0}
                          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-2"
                        >
                          {checkoutLoading ? 'Przetwarzanie...' : 'Utwórz ofertę handlową'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: COMMISSIONS HISTORY */}
            {activeTab === 'commissions' && (
              <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Rejestr prowizji handlowych</h2>
                
                {commissionsLoading ? (
                  <div className="text-center py-6 text-gray-500">Pobieranie rejestru prowizji...</div>
                ) : commissions.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">Nie zarejestrowano jeszcze żadnych prowizji.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                        <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-700 dark:text-gray-300">
                          <tr>
                            <th className="px-4 py-3">Zamówienie</th>
                            <th className="px-4 py-3">Nazwa firmy</th>
                            <th className="px-4 py-3">Status zamówienia</th>
                            <th className="px-4 py-3">Baza prowizji</th>
                            <th className="px-4 py-3">Prowizja (%)</th>
                            <th className="px-4 py-3">Kwota</th>
                            <th className="px-4 py-3">Status prowizji</th>
                            <th className="px-4 py-3">Data</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-secondary-700">
                          {commissions.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-secondary-700/50">
                              <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                                #{item.order?.orderNumber || 'Brak'}
                              </td>
                              <td className="px-4 py-3">
                                {item.order?.billingCompanyName || 'Osoba prywatna'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <span className={`inline-block w-fit px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    item.order?.paymentStatus === 'PAID' ? 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400' :
                                    item.order?.paymentStatus === 'FAILED' || item.order?.paymentStatus === 'CANCELLED' ? 'bg-red-100 text-red-800 dark:bg-red-950/20 dark:text-red-400' :
                                    item.order?.paymentStatus === 'REFUNDED' || item.order?.paymentStatus === 'PARTIALLY_REFUNDED' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/20 dark:text-purple-400' :
                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400'
                                  }`}>
                                    {item.order?.paymentStatus === 'PAID' ? 'Opłacone' :
                                     item.order?.paymentStatus === 'FAILED' ? 'Płatność nieudana' :
                                     item.order?.paymentStatus === 'CANCELLED' ? 'Anulowane' :
                                     item.order?.paymentStatus === 'REFUNDED' ? 'Zwrócone' :
                                     item.order?.paymentStatus === 'PARTIALLY_REFUNDED' ? 'Częściowy zwrot' :
                                     item.order?.paymentStatus === 'AWAITING_CONFIRMATION' ? 'Oczekuje potwierdzenia' :
                                     'Nieopłacone'}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {item.order?.status === 'PENDING' ? 'Nowe' :
                                     item.order?.status === 'CONFIRMED' ? 'Potwierdzone' :
                                     item.order?.status === 'PROCESSING' ? 'W realizacji' :
                                     item.order?.status === 'SHIPPED' ? 'Wysłane' :
                                     item.order?.status === 'DELIVERED' ? 'Dostarczone' :
                                     item.order?.status === 'CANCELLED' ? 'Anulowane' :
                                     item.order?.status === 'REFUNDED' ? 'Zwrócone' :
                                     item.order?.status || ''}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {Number(item.base).toFixed(2)} PLN
                              </td>
                              <td className="px-4 py-3 text-orange-500 font-semibold">
                                {item.commissionPct}% (rabat {item.discountPct}%)
                              </td>
                              <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                                {Number(item.commissionAmount).toFixed(2)} PLN
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  item.status === 'APPROVED' ? 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400' :
                                  item.status === 'PAID' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400' :
                                  item.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400' :
                                  'bg-red-100 text-red-800 dark:bg-red-950/20 dark:text-red-400'
                                }`}>
                                  {item.status === 'APPROVED' ? 'Zatwierdzona' :
                                   item.status === 'PAID' ? 'Zamrożona' :
                                   item.status === 'PENDING' ? 'Oczekująca' : 'Anulowana'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400">
                                {new Date(item.createdAt).toLocaleDateString('pl-PL')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {commissionsCount > 10 && (
                      <div className="flex justify-between items-center pt-4">
                        <button
                          disabled={commissionsPage === 1}
                          onClick={() => setCommissionsPage(p => p - 1)}
                          className="bg-gray-100 hover:bg-gray-200 dark:bg-secondary-700 dark:hover:bg-secondary-600 px-3 py-1.5 rounded text-xs font-semibold text-gray-700 dark:text-white disabled:opacity-50"
                        >
                          Poprzednia
                        </button>
                        <span className="text-xs text-gray-500">Strona {commissionsPage} z {Math.ceil(commissionsCount / 10)}</span>
                        <button
                          disabled={commissionsPage * 10 >= commissionsCount}
                          onClick={() => setCommissionsPage(p => p + 1)}
                          className="bg-gray-100 hover:bg-gray-200 dark:bg-secondary-700 dark:hover:bg-secondary-600 px-3 py-1.5 rounded text-xs font-semibold text-gray-700 dark:text-white disabled:opacity-50"
                        >
                          Następna
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: OFFER TRACKING (moduł opcjonalny) */}
            {activeTab === 'offers' && modulesConfig.offerTracking && (
              <div className="bg-white dark:bg-secondary-800 rounded-2xl p-6 border border-gray-100 dark:border-secondary-700 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Śledzenie wysłanych ofert</h2>

                {offersError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{offersError}</div>
                )}

                {offersLoading ? (
                  <div className="text-center py-6 text-gray-500">Pobieranie listy ofert...</div>
                ) : offers.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">Nie wysłano jeszcze żadnych ofert.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                        <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-700 dark:text-gray-300">
                          <tr>
                            <th className="px-4 py-3">Zamówienie</th>
                            <th className="px-4 py-3">Klient</th>
                            <th className="px-4 py-3">Kwota</th>
                            <th className="px-4 py-3">Status płatności</th>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Przypomnienia</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-secondary-700">
                          {offers.map((offer) => {
                            const isPaid = offer.paymentStatus === 'PAID';
                            const canRemind = !isPaid && offer.paymentStatus !== 'CANCELLED' && offer.paymentStatus !== 'REFUNDED';
                            return (
                              <tr key={offer.id} className="hover:bg-gray-50 dark:hover:bg-secondary-700/50">
                                <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">#{offer.orderNumber}</td>
                                <td className="px-4 py-3">
                                  {offer.billingCompanyName || `${offer.guestFirstName || ''} ${offer.guestLastName || ''}`.trim() || 'Klient'}
                                </td>
                                <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{Number(offer.total).toFixed(2)} PLN</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    isPaid ? 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400' :
                                    offer.paymentStatus === 'FAILED' || offer.paymentStatus === 'CANCELLED' ? 'bg-red-100 text-red-800 dark:bg-red-950/20 dark:text-red-400' :
                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400'
                                  }`}>
                                    {isPaid ? 'Opłacona' : offer.paymentStatus === 'AWAITING_CONFIRMATION' ? 'Oczekuje potwierdzenia' : 'Oczekuje na płatność'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-400">{new Date(offer.createdAt).toLocaleDateString('pl-PL')}</td>
                                <td className="px-4 py-3 text-xs text-gray-400">{offer.payment_reminder_count || 0}</td>
                                <td className="px-4 py-3">
                                  {canRemind && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemindOffer(offer.id)}
                                      disabled={remindingOfferId === offer.id}
                                      className="text-orange-600 dark:text-orange-400 font-semibold text-xs hover:underline disabled:opacity-50"
                                    >
                                      {remindingOfferId === offer.id ? 'Wysyłanie...' : 'Wyślij przypomnienie'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {offersTotalPages > 1 && (
                      <div className="flex justify-between items-center pt-4">
                        <button
                          disabled={offersPage === 1}
                          onClick={() => setOffersPage((p) => p - 1)}
                          className="bg-gray-100 hover:bg-gray-200 dark:bg-secondary-700 dark:hover:bg-secondary-600 px-3 py-1.5 rounded text-xs font-semibold text-gray-700 dark:text-white disabled:opacity-50"
                        >
                          Poprzednia
                        </button>
                        <span className="text-xs text-gray-500">Strona {offersPage} z {offersTotalPages}</span>
                        <button
                          disabled={offersPage >= offersTotalPages}
                          onClick={() => setOffersPage((p) => p + 1)}
                          className="bg-gray-100 hover:bg-gray-200 dark:bg-secondary-700 dark:hover:bg-secondary-600 px-3 py-1.5 rounded text-xs font-semibold text-gray-700 dark:text-white disabled:opacity-50"
                        >
                          Następna
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
