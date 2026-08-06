'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import ProductCard from '../../components/ProductCard';
import { Product, dashboardApi, checkoutApi, carouselsApi, DashboardStats, DashboardOrder } from '../../lib/api';
import { getStatusLabel, getStatusColor } from '../../lib/order-status';
import { useAuth } from '../../contexts/AuthContext';
import AccountSidebar, { sidebarItems, SidebarIcon } from '../../components/AccountSidebar';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Dzień dobry';
  return 'Dobry wieczór';
}

function StatIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'package':
      return (
        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case 'truck':
      return (
        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'message':
      return (
        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
}

function formatOrderDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function AccountPageContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('registered') === 'true';

  // Dashboard state
  const [stats, setStats] = useState<DashboardStats>({
    unpaidOrders: 0,
    inTransitOrders: 0,
    unreadMessages: 0,
  });
  const [recentOrders, setRecentOrders] = useState<DashboardOrder[]>([]);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch dashboard data
  useEffect(() => {
    async function fetchDashboardData() {
      if (!isAuthenticated) return;
      
      try {
        setDashboardLoading(true);
        
        // Fetch dashboard overview and bestsellers (from admin carousel) in parallel
        const [overviewRes, bestsellersRes] = await Promise.all([
          dashboardApi.getOverview(),
          carouselsApi.getProducts('bestsellery'),
        ]);

        setStats(overviewRes.stats);
        setRecentOrders(overviewRes.recentOrders);
        // Store full product data from admin-configured carousel
        setRecommendations((bestsellersRes.products || []).slice(0, 4));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setDashboardLoading(false);
      }
    }

    fetchDashboardData();
  }, [isAuthenticated]);

  // Handle payment - redirect to PayU
  const handlePayNow = async (orderId: string) => {
    try {
      setPayingOrderId(orderId);
      const response = await checkoutApi.retryPayment(orderId);
      
      if (response.success && response.paymentUrl) {
        // Redirect to PayU payment page
        window.location.href = response.paymentUrl;
      } else {
        alert('Nie udało się utworzyć sesji płatności. Spróbuj ponownie.');
        setPayingOrderId(null);
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('Nie udało się przetworzyć płatności. Spróbuj ponownie.');
      setPayingOrderId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const userData = {
    name: user?.firstName || 'Użytkownik',
    fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    avatar: `${user?.firstName?.[0] || 'U'}${user?.lastName?.[0] || ''}`,
    email: user?.email,
    emailVerified: user?.emailVerified,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
      <Header />

      <main className="container-custom py-6">
        {/* Success message for new registration */}
        {justRegistered && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-green-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div>
              <h4 className="font-medium text-green-800">Konto utworzone pomyślnie!</h4>
              <p className="text-sm text-green-700">Witamy w WB Trade, {userData.name}!</p>
            </div>
          </div>
        )}

        {/* Email verification warning */}
        {!userData.emailVerified && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h4 className="font-medium text-yellow-800">Zweryfikuj swój adres email</h4>
              <p className="text-sm text-yellow-700">
                Wysłaliśmy link weryfikacyjny na {userData.email}. Kliknij go, aby aktywować wszystkie funkcje konta.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <AccountSidebar activeId="overview" userName={userData.fullName} userEmail={userData.email} />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Mobile User Card + Full Navigation (matching native app layout) */}
            <div className="lg:hidden mb-6 space-y-3">
              {/* User Card */}
              <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-100 dark:border-secondary-700 p-4">
                <Link href="/account/profile" className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-orange-500 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm">
                    {userData.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{userData.fullName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Dane konta i ustawienia</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Dashboard Stats (if any) */}
              {(stats.unpaidOrders > 0 || stats.inTransitOrders > 0 || stats.unreadMessages > 0) && !dashboardLoading && (
                <div className="flex gap-2">
                  {stats.unpaidOrders > 0 && (
                    <Link href="/account/orders" className="flex-1 flex flex-col items-center py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      <span className="text-xl font-extrabold text-amber-700 dark:text-amber-300">{stats.unpaidOrders}</span>
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Nieopłacone</span>
                    </Link>
                  )}
                  {stats.inTransitOrders > 0 && (
                    <Link href="/account/orders" className="flex-1 flex flex-col items-center py-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                      <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                      <span className="text-xl font-extrabold text-orange-700 dark:text-orange-300">{stats.inTransitOrders}</span>
                      <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">W drodze</span>
                    </Link>
                  )}
                  {stats.unreadMessages > 0 && (
                    <Link href="/account/messages" className="flex-1 flex flex-col items-center py-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                      <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      <span className="text-xl font-extrabold text-orange-700 dark:text-orange-300">{stats.unreadMessages}</span>
                      <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">Wiadomości</span>
                    </Link>
                  )}
                </div>
              )}

              {/* Section: Zakupy */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1.5">Zakupy</h3>
                <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-100 dark:border-secondary-700 overflow-hidden">
                  {[
                    { href: '/account/orders', icon: 'shopping-bag', label: 'Moje zamówienia' },
                    { href: '/account/discounts', icon: 'tag', label: 'Moje rabaty' },
                    { href: '/wishlist', icon: 'heart', label: 'Ulubione' },
                    { href: '/account/reviews', icon: 'star', label: 'Moje opinie' },
                    { href: '/account/shopping-lists', icon: 'list', label: 'Listy zakupowe' },
                    { href: '/account/addresses', icon: 'location', label: 'Dane do zamówień' },
                    { href: '/account/messages', icon: 'mail', label: 'Wiadomości', badge: stats.unreadMessages },
                    { href: '/returns', icon: 'refresh', label: 'Reklamacje i zwroty' },
                  ].map((item, idx, arr) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors ${idx < arr.length - 1 ? 'border-b border-gray-100 dark:border-secondary-700' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                        <SidebarIcon icon={item.icon} />
                      </div>
                      <span className="flex-1 text-[15px] text-gray-800 dark:text-gray-200">{item.label}</span>
                      {item.badge && item.badge > 0 ? (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">{item.badge}</span>
                      ) : null}
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Section: Program partnerski */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1.5">Program partnerski</h3>
                <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-100 dark:border-secondary-700 overflow-hidden">
                  <Link
                    href="/account/partnership"
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <SidebarIcon icon="users" />
                    </div>
                    <span className="flex-1 text-[15px] text-gray-800 dark:text-gray-200">Program partnerski</span>
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>

              {/* Section: Ustawienia */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1.5">Ustawienia</h3>
                <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-100 dark:border-secondary-700 overflow-hidden">
                  {[
                    { href: '/account/profile', icon: 'user', label: 'Edytuj profil' },
                    { href: '/account/password', icon: 'lock', label: 'Zmień hasło' },
                    { href: '/account/settings', icon: 'settings', label: 'Ustawienia' },
                  ].map((item, idx, arr) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors ${idx < arr.length - 1 ? 'border-b border-gray-100 dark:border-secondary-700' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                        <SidebarIcon icon={item.icon} />
                      </div>
                      <span className="flex-1 text-[15px] text-gray-800 dark:text-gray-200">{item.label}</span>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Section: Pomoc */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1.5">Pomoc</h3>
                <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-100 dark:border-secondary-700 overflow-hidden">
                  {[
                    { href: '/contact', icon: 'mail', label: 'Skontaktuj się z nami' },
                    { href: '/terms', icon: 'list', label: 'Regulamin' },
                    { href: '/privacy', icon: 'lock', label: 'Polityka prywatności' },
                  ].map((item, idx, arr) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors ${idx < arr.length - 1 ? 'border-b border-gray-100 dark:border-secondary-700' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-secondary-700 flex items-center justify-center shrink-0">
                        <SidebarIcon icon={item.icon} />
                      </div>
                      <span className="flex-1 text-[15px] text-gray-800 dark:text-gray-200">{item.label}</span>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={async () => { await logout(); }}
                className="w-full py-3.5 rounded-xl border border-gray-200 dark:border-secondary-600 bg-white dark:bg-secondary-800 text-gray-500 dark:text-gray-400 text-[15px] font-semibold hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
              >
                Wyloguj się
              </button>
            </div>

            {/* Desktop dashboard content - hidden on mobile */}
            <div className="hidden lg:block">
            {/* Greeting Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {getGreeting()}, {userData.name}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Oto co się dziś dzieje na Twoim koncie.</p>
              </div>
              {/* <Link href="/account/report" className="text-orange-500 hover:text-orange-600 text-sm font-medium flex items-center gap-1"> */}
                {/* Zobacz pełny raport */}
                {/* <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> */}
                  {/* <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /> */}
                {/* </svg> */}
              {/* </Link> */}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
              <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Nieopłacone</span>
                  <StatIcon icon="package" />
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {dashboardLoading ? '...' : stats.unpaidOrders}
                </span>
              </div>
              <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">W drodze</span>
                  <StatIcon icon="truck" />
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {dashboardLoading ? '...' : stats.inTransitOrders}
                </span>
              </div>
              <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700 shadow-sm hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Nieprzeczytane</span>
                  <StatIcon icon="message" />
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {dashboardLoading ? '...' : stats.unreadMessages}
                </span>
              </div>

            </div>

            {/* Recent Orders */}
            <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm mb-8">
              <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-secondary-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ostatnie zamówienia</h2>
                <Link href="/account/orders" className="text-orange-500 hover:text-orange-600 text-sm font-medium">
                  Zobacz wszystkie
                </Link>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-secondary-700">
                {dashboardLoading ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
                    Ładowanie zamówień...
                  </div>
                ) : recentOrders.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    <p className="font-medium text-gray-600 dark:text-gray-400">Brak zamówień</p>
                    <p className="text-sm">Nie masz jeszcze żadnych zamówień</p>
                    <Link href="/products" className="inline-block mt-4 text-orange-500 hover:text-orange-600 font-medium">
                      Zacznij zakupy →
                    </Link>
                  </div>
                ) : (
                  recentOrders.map((order) => (
                    <div key={order.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      {/* Product Image */}
                      <div className="w-16 h-16 bg-gray-100 dark:bg-secondary-700 rounded-lg overflow-hidden shrink-0 relative">
                        {order.image ? (
                          <Image
                            src={order.image}
                            alt={order.name}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                          {order.name}
                          {order.itemsCount > 1 && (
                            <span className="text-gray-500 dark:text-gray-400 text-sm font-normal">
                              {' '}+{order.itemsCount - 1} więcej
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                          Zamówienie #{order.orderNumber} • Złożone {formatOrderDate(order.orderDate)}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(order.status, order.paymentStatus)}`}>
                            {getStatusLabel(order.status, order.paymentStatus)}
                          </span>
                          {order.status === 'SHIPPED' && order.trackingNumber && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Numer śledzenia: {order.trackingNumber}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price and Actions - row on mobile */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-0 mt-2 sm:mt-0">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {Number(order.total).toFixed(2).replace('.', ',')} {order.currency}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto">
                        {order.paymentStatus === 'PENDING' && (
                          <button
                            onClick={() => handlePayNow(order.id)}
                            disabled={payingOrderId === order.id}
                            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {payingOrderId === order.id ? 'Przekierowywanie...' : 'Zapłać teraz'}
                          </button>
                        )}
                        {order.status === 'SHIPPED' && (
                          <Link
                            href={`/account/orders/${order.id}`}
                            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-orange-500 text-white hover:bg-orange-600 text-center"
                          >
                            Śledź przesyłkę
                          </Link>
                        )}
                        <Link
                          href={`/account/orders/${order.id}`}
                          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border border-gray-300 dark:border-secondary-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 text-center"
                        >
                          Szczegóły
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bestsellers */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔥</span>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Bestsellery</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Najchętniej kupowane produkty</p>
                  </div>
                </div>
                <Link href="/products/bestsellers" className="text-orange-500 hover:text-orange-600 text-sm font-medium flex items-center gap-1">
                  Zobacz więcej
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {dashboardLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 p-4 animate-pulse">
                      <div className="bg-gray-200 dark:bg-secondary-700 h-40 rounded-lg mb-3"></div>
                      <div className="bg-gray-200 dark:bg-secondary-700 h-4 rounded w-3/4 mb-2"></div>
                      <div className="bg-gray-200 dark:bg-secondary-700 h-4 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : recommendations.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {recommendations.map((product) => (
                    <div key={product.id} className="relative">
                      {/* Bestseller badge */}
                      <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span>🔥</span> Bestseller
                      </div>
                      <ProductCard product={product} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-secondary-800 rounded-xl p-8 text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="font-medium text-gray-600 dark:text-gray-400">Brak rekomendacji</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Wyszukuj produkty, aby otrzymać spersonalizowane polecenia</p>
                </div>
              )}
            </div>
            </div>{/* end hidden lg:block desktop wrapper */}
          </div>
        </div>
      </main>

      {/* Separator */}
      <div className="border-t border-gray-200 dark:border-secondary-700 bg-gray-50 dark:bg-secondary-900">
        <div className="h-6 sm:h-8"></div>
      </div>
      <Footer hideTrustBadges />
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div></div>}>
      <AccountPageContent />
    </Suspense>
  );
}
