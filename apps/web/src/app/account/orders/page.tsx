'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { useAuth } from '../../../contexts/AuthContext';
import { ordersApi, checkoutApi, Order } from '../../../lib/api';
import { getStatusLabel, getStatusColor, matchesFilter, isUnpaidOrder, ORDER_FILTER_TABS } from '../../../lib/order-status';
import AccountSidebar from '../../../components/AccountSidebar';

// Order status types
type OrderStatusType = 'OPEN' | 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

// Filter tabs imported from shared utils

// Status colors and labels are imported from shared order-status utils

function getStatusIcon(status: string) {
  switch (status) {
    case 'OPEN':
    case 'PENDING':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'CONFIRMED':
    case 'PROCESSING':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case 'SHIPPED':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'DELIVERED':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'CANCELLED':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'REFUNDED':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      );
    default:
      return null;
  }
}

function formatOrderDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const MAX_VISIBLE_ITEMS = 3;

export default function OrdersPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [totalOrders, setTotalOrders] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [simulatingPayment, setSimulatingPayment] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch orders from API
  const fetchOrders = async () => {
    if (!isAuthenticated) return;
    
    try {
      setOrdersLoading(true);
      const response = await ordersApi.getAll(currentPage, 10);
      setOrders(response.orders);
      setTotalOrders(response.total);
      setTotalPages(Math.ceil(response.total / response.limit));
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [isAuthenticated, currentPage]);

  // Handle payment - redirect to PayU
  const handlePayNow = async (orderId: string) => {
    try {
      setSimulatingPayment(orderId);
      const response = await checkoutApi.retryPayment(orderId);
      
      if (response.success && response.paymentUrl) {
        // Redirect to PayU payment page
        window.location.href = response.paymentUrl;
      } else {
        alert('Nie udało się utworzyć sesji płatności. Spróbuj ponownie.');
        setSimulatingPayment(null);
      }
    } catch (error: any) {
      console.error('Error creating payment:', error);
      alert(`Nie udało się przetworzyć płatności: ${error.message || 'Spróbuj ponownie'}`);
      setSimulatingPayment(null);
    }
  };

  if (isLoading || ordersLoading) {
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
  };

  // Filter orders based on active filter and search query
  const filteredOrders = orders.filter((order) => {
    const filterMatch = matchesFilter(order, activeFilter);
    const matchesSearch = searchQuery === '' || 
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some(item => item.productName.toLowerCase().includes(searchQuery.toLowerCase()));
    return filterMatch && matchesSearch;
  });

  // Count orders by filter group (handles OPEN+PENDING as UNPAID)
  const orderCounts = {
    all: orders.length,
    UNPAID: orders.filter(o => isUnpaidOrder(o.status, o.paymentStatus)).length,
    SHIPPED: orders.filter(o => o.status === 'SHIPPED').length,
    DELIVERED: orders.filter(o => o.status === 'DELIVERED').length,
    CANCELLED: orders.filter(o => o.status === 'CANCELLED').length,
    REFUNDED: orders.filter(o => o.status === 'REFUNDED').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
      <Header />

      <main className="container-custom py-4 sm:py-6">
        {/* Breadcrumb - hidden on mobile */}
        <nav className="hidden sm:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <Link href="/" className="hover:text-orange-500">Strona główna</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link href="/account" className="hover:text-orange-500">Moje konto</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-900 dark:text-white">Moje zamówienia</span>
        </nav>

        <div className="flex flex-col lg:flex-row gap-6">
          <AccountSidebar activeId="orders" userName={userData.fullName} userEmail={user?.email} />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Mobile Back Button */}
            <div className="lg:hidden mb-4">
              <Link 
                href="/account" 
                className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-orange-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Powrót do konta
              </Link>
            </div>

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Moje zamówienia</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Przeglądaj i zarządzaj swoimi zamówieniami</p>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm mb-6">
              {/* Search Bar */}
              <div className="p-4 border-b border-gray-100 dark:border-secondary-700">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Szukaj po numerze zamówienia lub nazwie produktu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-secondary-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-2 overflow-x-auto">
                {ORDER_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      activeFilter === tab.id
                        ? 'bg-orange-500 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-secondary-700'
                    }`}
                  >
                    {tab.label}
                    {orderCounts[tab.id as keyof typeof orderCounts] > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                        activeFilter === tab.id
                          ? 'bg-white/20'
                          : 'bg-gray-200 dark:bg-secondary-700'
                      }`}>
                        {orderCounts[tab.id as keyof typeof orderCounts]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
              <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-secondary-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Brak zamówień</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  {searchQuery
                    ? 'Nie znaleziono zamówień pasujących do wyszukiwania'
                    : 'Nie masz jeszcze żadnych zamówień w tej kategorii'}
                </p>
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Zacznij zakupy
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm overflow-hidden">
                    {/* Order Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 dark:bg-secondary-900 border-b border-gray-100 dark:border-secondary-700 gap-3">
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Numer zamówienia</span>
                          <p className="font-semibold text-gray-900 dark:text-white">#{order.orderNumber}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Data zamówienia</span>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{formatOrderDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${getStatusColor(order.status, order.paymentStatus)}`}>
                          {getStatusIcon(order.status)}
                          {getStatusLabel(order.status, order.paymentStatus)}
                        </span>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="divide-y divide-gray-100 dark:divide-secondary-700">
                      {(() => {
                        const isExpanded = expandedOrders.has(order.id);
                        const visibleItems = isExpanded ? order.items : order.items.slice(0, MAX_VISIBLE_ITEMS);
                        const hiddenCount = order.items.length - MAX_VISIBLE_ITEMS;
                        
                        return (
                          <>
                            {visibleItems.map((item) => (
                              <div key={item.id} className="p-4 flex items-center gap-4">
                                <div className="w-16 h-16 bg-gray-100 dark:bg-secondary-700 rounded-lg overflow-hidden shrink-0 relative">
                                  <Image
                                    src={item.variant?.product?.images?.[0]?.url || '/placeholder.png'}
                                    alt={item.productName}
                                    fill
                                    sizes="64px"
                                    className="object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-gray-900 dark:text-white mb-1">{item.productName}</h4>
                                  {item.variantName && item.variantName !== 'Default' && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.variantName}</p>
                                  )}
                                  <p className="text-sm text-gray-500 dark:text-gray-400">Ilość: {item.quantity}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-semibold text-gray-900 dark:text-white">{Number(item.unitPrice).toFixed(2).replace('.', ',')} zł</span>
                                </div>
                              </div>
                            ))}
                            {hiddenCount > 0 && (
                              <button
                                onClick={() => {
                                  setExpandedOrders(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(order.id)) {
                                      newSet.delete(order.id);
                                    } else {
                                      newSet.add(order.id);
                                    }
                                    return newSet;
                                  });
                                }}
                                className="w-full p-3 text-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-gray-50 dark:hover:bg-secondary-700 font-medium transition-colors"
                              >
                                {isExpanded ? 'Zwiń' : `Pokaż więcej (${hiddenCount})`}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Order Footer */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 dark:bg-secondary-900 border-t border-gray-100 dark:border-secondary-700 gap-3">
                      <div>
                        {order.trackingNumber && order.status === 'SHIPPED' && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-green-600 font-medium">Numer przesyłki:</span> {order.trackingNumber}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                        <div className="text-left sm:text-right">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Suma:</span>
                          <span className="ml-2 text-lg font-bold text-gray-900 dark:text-white">{Number(order.total).toFixed(2).replace('.', ',')} zł</span>
                        </div>
                        <div className="flex gap-2">
                          {order.status === 'SHIPPED' && order.trackingNumber && (
                            <button className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
                              Śledź przesyłkę
                            </button>
                          )}
                          {order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED' && !['cod', 'b2b_transfer', 'b2b_przelew', 'bank_transfer', 'transfer'].includes(order.paymentMethod) && (
                            <button 
                              onClick={() => handlePayNow(order.id)}
                              disabled={simulatingPayment === order.id}
                              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {simulatingPayment === order.id ? 'Przekierowywanie...' : 'Zapłać teraz'}
                            </button>
                          )}
                          {order.status === 'DELIVERED' && (
                            <button className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
                              Kup ponownie
                            </button>
                          )}
                          <Link
                            href={`/account/orders/${order.id}`}
                            className="px-4 py-2 border border-gray-300 dark:border-secondary-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
                          >
                            Szczegóły
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {filteredOrders.length > 0 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Wyświetlanie {filteredOrders.length} z {totalOrders} zamówień
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 border border-gray-300 dark:border-secondary-600 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors disabled:opacity-50"
                  >
                    Poprzednia
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        currentPage === page
                          ? 'bg-orange-500 text-white'
                          : 'border border-gray-300 dark:border-secondary-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700'
                      } transition-colors`}
                    >
                      {page}
                    </button>
                  ))}
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 border border-gray-300 dark:border-secondary-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors disabled:opacity-50"
                  >
                    Następna
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer hideTrustBadges />
    </div>
  );
}
