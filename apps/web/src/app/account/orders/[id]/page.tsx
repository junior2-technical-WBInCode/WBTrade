'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import { useAuth } from '../../../../contexts/AuthContext';
import { ordersApi, Order, OrderTrackingPackage } from '../../../../lib/api';
import { getStatusLabel, getStatusColor } from '../../../../lib/order-status';
import AccountSidebar from '../../../../components/AccountSidebar';

// Order status types
type OrderStatusType = 'OPEN' | 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
type PaymentStatusType = 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

// Status colors and labels imported from shared order-status utils

function getPaymentStatusBadge(status?: PaymentStatusType) {
  switch (status) {
    case 'PAID':
      return <span className="inline-flex items-center gap-1 text-green-600 text-sm"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> Opłacono</span>;
    case 'PENDING':
      return <span className="inline-flex items-center gap-1 text-yellow-600 text-sm"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg> Oczekuje</span>;
    case 'AWAITING_CONFIRMATION':
      return <span className="inline-flex items-center gap-1 text-blue-600 text-sm"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg> Potwierdź w aplikacji</span>;
    case 'FAILED':
      return <span className="inline-flex items-center gap-1 text-red-600 text-sm"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg> Niepowodzenie</span>;
    case 'CANCELLED':
      return <span className="inline-flex items-center gap-1 text-gray-600 text-sm"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg> Anulowano</span>;
    case 'REFUNDED':
      return <span className="inline-flex items-center gap-1 text-gray-600 text-sm"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg> Zwrócono</span>;
    default:
      return <span className="inline-flex items-center gap-1 text-gray-600 text-sm">Nieznany</span>;
  }
}

function formatOrderDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Shipping method name formatter
const shippingMethodNames: Record<string, string> = {
  inpost_paczkomat: 'InPost Paczkomat',
  inpost_kurier: 'Kurier InPost',
  inpost_courier: 'Kurier InPost',
  dpd_kurier: 'Kurier DPD',
  dpd_courier: 'Kurier DPD',
  dpd: 'Kurier DPD',
  wysylka_gabaryt: 'Wysyłka gabaryt',
  gabaryt: 'Wysyłka gabaryt',
  b2b_wysylka_wlasna: 'Wysyłka własna B2B',
  odbior_osobisty_outlet: 'Odbiór osobisty (Outlet)',
};

function getShippingMethodName(method: string): string {
  return shippingMethodNames[method] || method;
}

// Payment method name formatter
const paymentMethodNames: Record<string, string> = {
  payu: 'Płatność online (PayU)',
  blik: 'BLIK',
  card: 'Karta płatnicza',
  transfer: 'Przelew online',
  google_pay: 'Google Pay',
  apple_pay: 'Apple Pay',
  paypo: 'PayPo',
};

function getPaymentMethodName(method: string): string {
  return paymentMethodNames[method] || method;
}

// Warehouse display names - hide real wholesaler names
const WAREHOUSE_NAMES: Record<string, string> = {
  'HP': 'Magazyn Zielona Góra',
  'Hurtownia Przemysłowa': 'Magazyn Zielona Góra',
  'Ikonka': 'Magazyn Białystok',
  'BTP': 'Magazyn Chotów',
  'Leker': 'Magazyn Chynów',
  'Gastro': 'Magazyn Chotów',
  'Horeca': 'Magazyn Chotów',
  'Forcetop': 'Magazyn Chotów',
  'DoFirmy': 'Magazyn Koszalin',
  'Rzeszów': 'Magazyn Rzeszów',
  'Outlet': 'Magazyn Rzeszów',
  'Hurtownia Kuchenna': 'Hurtownia Kuchenna',
};

// Pattern to extract wholesaler from product tags
const WHOLESALER_PATTERN = /^(hurtownia[:\-_](.+)|Ikonka|BTP|HP|Gastro|Horeca|Hurtownia\s+Przemysłowa|Hurtownia\s+Kuchenna|Leker|Forcetop|DoFirmy|Rzeszów|Outlet)$/i;

// Extract wholesaler from product tags (same logic as cart.service.ts)
function getWholesalerFromTags(tags?: string[]): string | null {
  if (!tags || tags.length === 0) return null;
  
  for (const tag of tags) {
    const match = tag.match(WHOLESALER_PATTERN);
    if (match) {
      // Return the captured group if present (e.g., "HP" from "hurtownia:HP"), or the whole match
      return match[2] || match[1];
    }
  }
  return null;
}

function getWarehouseName(wholesaler: string | null | undefined): string {
  if (!wholesaler) return 'Magazyn główny';
  return WAREHOUSE_NAMES[wholesaler] || 'Magazyn główny';
}

// Delivery status labels (from Baselinker tracking)
const deliveryStatusLabels: Record<string, string> = {
  'created': 'Przesyłka utworzona',
  'confirmed': 'Potwierdzona',
  'dispatched_by_sender': 'Nadana przez nadawcę',
  'collected_from_sender': 'Odebrana od nadawcy',
  'taken_by_courier': 'Pobrana przez kuriera',
  'adopted_at_source_branch': 'W oddziale nadawczym',
  'sent_from_source_branch': 'Wysłana z oddziału',
  'in_transit': 'W transporcie',
  'out_for_delivery': 'Wydana do doręczenia',
  'ready_to_pickup': 'Oczekuje w punkcie odbioru',
  'ready_to_pickup_from_pok': 'Gotowa do odbioru w punkcie',
  'delivered': 'Dostarczona / Odebrana',
  'avizo': 'Awizowana',
  'returned_to_sender': 'Zwrócona do nadawcy',
  'canceled': 'Anulowana',
  'shipped': 'Wysłana',
  'unknown': 'Status nieznany',
  'other': 'W trakcie realizacji',
};

function getStatusTimelineSteps(status: OrderStatusType, paymentStatus?: PaymentStatusType): { label: string; isCompleted: boolean; isCurrent: boolean }[] {
  const allSteps = [
    { key: 'PENDING', label: 'Zamówienie złożone' },
    { key: 'CONFIRMED', label: 'Płatność potwierdzona' },
    { key: 'PROCESSING', label: 'W realizacji' },
    { key: 'SHIPPED', label: 'Wysłano' },
    { key: 'DELIVERED', label: 'Dostarczono' },
  ];

  // Handle cancelled/refunded separately
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    return allSteps.map((step) => ({
      label: step.label,
      isCompleted: false,
      isCurrent: false,
    })).concat([{
      label: status === 'CANCELLED' ? 'Anulowano' : 'Zwrócono',
      isCompleted: true,
      isCurrent: true,
    }]);
  }

  // If order status is OPEN or PENDING with payment not PAID, first step is completed (order placed), second is current (awaiting payment)
  if ((status === 'OPEN' || status === 'PENDING') && paymentStatus !== 'PAID') {
    return allSteps.map((step, index) => ({
      label: step.label,
      isCompleted: index === 0, // Order was placed
      isCurrent: index === 1, // Waiting for payment confirmation
    }));
  }

  const statusOrder = ['OPEN', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
  const currentIndex = statusOrder.indexOf(status);

  return allSteps.map((step, index) => ({
    label: step.label,
    isCompleted: index <= currentIndex,
    isCurrent: index === currentIndex,
  }));
}

export default function OrderDetailsPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  
  // Cancel modal states
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [showCancelResultModal, setShowCancelResultModal] = useState(false);
  const [cancelResultMessage, setCancelResultMessage] = useState('');
  const [cancelResultType, setCancelResultType] = useState<'success' | 'pending' | 'error'>('success');
  const [cancelReason, setCancelReason] = useState('');
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());
  const [expandedProductLists, setExpandedProductLists] = useState<Set<number>>(new Set());
  
  const MAX_VISIBLE_ITEMS = 3;
  
  // Refund states
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundEligibility, setRefundEligibility] = useState<{
    eligible: boolean;
    reason?: string;
    daysRemaining?: number;
    deliveredAt?: string;
  } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);
  const [refundResult, setRefundResult] = useState<{
    refundNumber: string;
    returnAddress: {
      name: string;
      contactPerson: string;
      street: string;
      city: string;
      postalCode: string;
      phone: string;
      email: string;
    };
  } | null>(null);
  
  // Tracking states
  const [trackingPackages, setTrackingPackages] = useState<OrderTrackingPackage[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch order from API
  useEffect(() => {
    async function fetchOrder() {
      if (!isAuthenticated || !orderId) return;
      
      try {
        setOrderLoading(true);
        setError(null);
        const response = await ordersApi.getById(orderId);
        setOrder(response);
      } catch (err: unknown) {
        console.error('Error fetching order:', err);
        const errorMessage = err instanceof Error ? err.message : 'Nie udało się pobrać szczegółów zamówienia';
        setError(errorMessage);
      } finally {
        setOrderLoading(false);
      }
    }
    
    fetchOrder();
  }, [isAuthenticated, orderId]);

  // Check refund eligibility when order is loaded
  useEffect(() => {
    async function checkEligibility() {
      if (!order || !['DELIVERED', 'SHIPPED'].includes(order.status)) return;
      
      try {
        const eligibility = await ordersApi.checkRefundEligibility(order.id);
        setRefundEligibility(eligibility);
      } catch (err) {
        console.error('Error checking refund eligibility:', err);
      }
    }
    
    checkEligibility();
  }, [order]);

  // Fetch tracking info from BaseLinker when order is loaded
  useEffect(() => {
    async function fetchTracking() {
      if (!order || !['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) return;
      
      try {
        setTrackingLoading(true);
        const tracking = await ordersApi.getTracking(order.id);
        setTrackingPackages(tracking.packages);
      } catch (err) {
        console.error('Error fetching tracking info:', err);
        // Silent fail - tracking info is optional
      } finally {
        setTrackingLoading(false);
      }
    }
    
    fetchTracking();
  }, [order]);

  const handleCancelOrderClick = () => {
    setShowCancelConfirmModal(true);
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    
    setShowCancelConfirmModal(false);

    try {
      setCancelling(true);
      const response = await ordersApi.cancel(order.id, cancelReason || undefined);
      
      setCancelResultType('pending');
      setCancelResultMessage('Próśba o anulowanie zamówienia została przesłana. Administrator rozpatrzy Twoją prośbę i poinformujemy Cię o decyzji.');
      setShowCancelResultModal(true);
      setOrder({ ...order, pendingCancellation: true });
      setCancelReason('');
    } catch (err: unknown) {
      console.error('Error requesting cancellation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Nie udało się złożyć prośby o anulowanie zamówienia';
      setCancelResultType('error');
      setCancelResultMessage(errorMessage);
      setShowCancelResultModal(true);
    } finally {
      setCancelling(false);
    }
  };

  const handleRefundRequest = async () => {
    if (!order) return;
    
    try {
      setRefundSubmitting(true);
      setRefundError(null);
      
      const response = await ordersApi.requestRefund(order.id, refundReason);
      
      setRefundSuccess(true);
      setRefundResult({
        refundNumber: response.refundNumber,
        returnAddress: response.returnAddress,
      });
      setOrder({ ...order, status: 'REFUNDED', paymentStatus: 'REFUNDED' });
      
    } catch (err: unknown) {
      console.error('Error requesting refund:', err);
      const errorMessage = err instanceof Error ? err.message : 'Nie udało się złożyć wniosku o zwrot';
      setRefundError(errorMessage);
    } finally {
      setRefundSubmitting(false);
    }
  };

  if (isLoading || orderLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-secondary-900">
        <Header />
        <main className="container-custom py-12">
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-100 dark:bg-secondary-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Zamówienie nie znalezione</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{error || 'Nie mogliśmy znaleźć zamówienia o podanym numerze.'}</p>
            <Link href="/account/orders" className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors">
              Wróć do zamówień
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const userData = {
    name: user?.firstName || 'Użytkownik',
    fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    avatar: `${user?.firstName?.[0] || 'U'}${user?.lastName?.[0] || ''}`,
  };

  const statusSteps = getStatusTimelineSteps(order.status as OrderStatusType, order.paymentStatus as PaymentStatusType);

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
          <Link href="/account/orders" className="hover:text-orange-500">Moje zamówienia</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-900 dark:text-white">#{order.orderNumber}</span>
        </nav>

        <div className="flex flex-col lg:flex-row gap-6">
          <AccountSidebar activeId="orders" userName={userData.fullName} userEmail={user?.email} />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Page Header */}
            <div className="flex flex-col gap-3 mb-6">
              <div>
                <div className="flex items-start gap-3 mb-2">
                  <Link href="/account/orders" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Link>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-all sm:break-normal">
                      Zamówienie #{order.orderNumber}
                    </h1>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium w-fit ${getStatusColor(order.status, order.paymentStatus)}`}>
                      {getStatusLabel(order.status, order.paymentStatus)}
                    </span>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm ml-8">Złożone {formatOrderDate(order.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-3 ml-8 sm:ml-0">
                {order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED' && (
                  <Link 
                    href={`/order/${order.id}/payment`}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                  >
                    Zapłać teraz
                  </Link>
                )}
                {order.status === 'SHIPPED' && order.trackingNumber && (
                  <a
                    href={order.trackingLink || `https://inpost.pl/sledzenie-przesylek?number=${order.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Śledź przesyłkę
                  </a>
                )}
                {order.wantInvoice && order.paymentStatus === 'PAID' && (
                  <Link
                    href={`/account/orders/${order.id}/invoice`}
                    className="px-4 py-2 border border-gray-300 dark:border-secondary-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Pobierz fakturę
                  </Link>
                )}
              </div>
            </div>

            {/* Order Notes/Alerts */}
            {order.notes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-yellow-800">{order.notes}</p>
              </div>
            )}

            {/* Status Timeline */}
            <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Status zamówienia</h2>
              
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-secondary-700"></div>
                
                {/* Timeline items */}
                <div className="space-y-6">
                  {statusSteps.map((item, index) => (
                    <div key={index} className="relative flex items-start gap-4 pl-10">
                      {/* Timeline dot */}
                      <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        item.isCompleted 
                          ? item.isCurrent 
                            ? 'bg-orange-500 text-white' 
                            : 'bg-green-500 text-white'
                          : item.isCurrent
                            ? 'bg-yellow-500 text-white'
                            : 'bg-gray-200 dark:bg-secondary-600 text-gray-400'
                      }`}>
                        {item.isCompleted ? (
                          item.isCurrent ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )
                        ) : item.isCurrent ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full"></span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-2">
                        <h4 className={`font-medium ${item.isCompleted || item.isCurrent ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                          {item.label}
                          {item.isCurrent && !item.isCompleted && index === 0 && (
                            <span className="ml-2 text-xs font-normal text-yellow-600 dark:text-yellow-400">(oczekuje na płatność)</span>
                          )}
                        </h4>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tracking Info */}
              {order.trackingNumber && order.status === 'SHIPPED' && (
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-secondary-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Numer przesyłki:</span>
                      <p className="font-mono font-medium text-gray-900 dark:text-white">{order.trackingNumber}</p>
                    </div>
                    {order.trackingLink && (
                      <a
                        href={order.trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                      >
                        Śledź przesyłkę →
                      </a>
                    )}
                  </div>
                  {order.deliveryStatus && (
                    <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-500/10 rounded-lg border border-orange-100 dark:border-orange-500/20">
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                        📦 {deliveryStatusLabels[order.deliveryStatus] || order.deliveryStatus}
                      </p>
                      {order.deliveryStatusUpdatedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Aktualizacja: {formatOrderDate(order.deliveryStatusUpdatedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Status without tracking number (e.g., during PROCESSING) */}
              {order.deliveryStatus && !order.trackingNumber && (
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-secondary-700">
                  <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      📦 {deliveryStatusLabels[order.deliveryStatus] || order.deliveryStatus}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm mb-6">
              <div className="p-5 border-b border-gray-100 dark:border-secondary-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Produkty ({order.items.length})</h2>
              </div>
              
              <div className="divide-y divide-gray-100 dark:divide-secondary-700">
                {order.items.map((item) => (
                  <div key={item.id} className="p-4 sm:p-5">
                    <div className="flex gap-3 sm:gap-4">
                      {/* Image */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 dark:bg-secondary-700 rounded-lg overflow-hidden shrink-0 relative">
                        <Image
                          src={item.variant?.product?.images?.[0]?.url || '/placeholder.png'}
                          alt={item.productName}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base line-clamp-2 mb-1">{item.productName}</h4>
                        {item.variantName && item.variantName !== 'Default' && (
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">{item.variantName}</p>
                        )}
                        <p className="text-xs text-gray-400">SKU: {item.sku}</p>
                        
                        {/* Mobile: price and quantity inline */}
                        <div className="flex items-center justify-between mt-2 sm:hidden">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Ilość: <span className="font-medium text-gray-900 dark:text-white">{item.quantity}</span></span>
                          <span className="font-semibold text-gray-900 dark:text-white">{Number(item.unitPrice).toFixed(2).replace('.', ',')} zł</span>
                        </div>
                      </div>
                      
                      {/* Desktop: quantity and price */}
                      <div className="hidden sm:flex items-center gap-4">
                        <div className="text-center shrink-0 px-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Ilość</span>
                          <p className="font-medium text-gray-900 dark:text-white">{item.quantity}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-gray-900 dark:text-white">{Number(item.unitPrice).toFixed(2).replace('.', ',')} zł</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Summary */}
              <div className="p-5 bg-gray-50 dark:bg-secondary-900 border-t border-gray-100 dark:border-secondary-700">
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Całkowity koszt produktów</span>
                    <span className="text-gray-900 dark:text-white">{Number(order.subtotal).toFixed(2).replace('.', ',')} zł</span>
                  </div>
                  
                  {/* Per-package shipping breakdown */}
                  {order.packageShipping && order.packageShipping.length > 0 ? (
                    <>
                      {order.packageShipping.map((pkg, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">
                            Paczka {index + 1}
                            <span className="text-xs ml-1">• {getShippingMethodName(pkg.method)}</span>
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {pkg.price === 0 ? 'Bezpłatna' : `${Number(pkg.price).toFixed(2).replace('.', ',')} zł`}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Dostawa ({getShippingMethodName(order.shippingMethod)})</span>
                      <span className="text-gray-900 dark:text-white">{Number(order.shipping) === 0 ? 'Bezpłatna' : `${Number(order.shipping).toFixed(2).replace('.', ',')} zł`}</span>
                    </div>
                  )}
                  {Number(order.discount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Rabat</span>
                      <span className="text-green-600">-{Number(order.discount).toFixed(2).replace('.', ',')} zł</span>
                    </div>
                  )}
                  {Number(order.tax) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">VAT</span>
                      <span className="text-gray-900 dark:text-white">{Number(order.tax).toFixed(2).replace('.', ',')} zł</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-secondary-700">
                    <span className="text-gray-900 dark:text-white">Razem</span>
                    <span className="text-gray-900 dark:text-white">{Number(order.total).toFixed(2).replace('.', ',')} zł</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Shipping & Payment Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Shipping Info */}
              <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Dostawa</h3>
                </div>
                
                {/* Per-package shipping info */}
                {order.packageShipping && order.packageShipping.length > 0 ? (
                  <div className="space-y-4">
                    {order.packageShipping.map((pkg, index) => {
                      const isExpanded = expandedPackages.has(index);
                      
                      // Use items from packageShipping if available, otherwise try to match by wholesaler
                      const packageItems = pkg.items || [];
                      const packageWholesaler = pkg.wholesaler || 'default';
                      
                      // Find tracking info for this package (match by index)
                      const trackingInfo = trackingPackages.find(t => t.packageIndex === index + 1);
                      
                      return (
                        <div key={index} className="bg-gray-50 dark:bg-secondary-900 rounded-lg overflow-hidden">
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                Paczka {index + 1}
                              </span>
                              {packageItems.length > 0 && (
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedPackages);
                                    if (isExpanded) {
                                      newExpanded.delete(index);
                                    } else {
                                      newExpanded.add(index);
                                    }
                                    setExpandedPackages(newExpanded);
                                  }}
                                  className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
                                >
                                  Szczegóły
                                  <svg 
                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              {/* Show courier name from tracking if available, otherwise default from order */}
                              {trackingInfo?.courierName || getShippingMethodName(pkg.method)}
                            </p>
                            {pkg.method === 'inpost_paczkomat' && pkg.paczkomatCode && (
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <p className="font-medium">{pkg.paczkomatCode}</p>
                                {pkg.paczkomatAddress && <p className="text-xs">{pkg.paczkomatAddress}</p>}
                              </div>
                            )}
                            {pkg.useCustomAddress && pkg.customAddress && (
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <p>{pkg.customAddress.firstName} {pkg.customAddress.lastName}</p>
                                <p>{pkg.customAddress.street}</p>
                                <p>{pkg.customAddress.postalCode} {pkg.customAddress.city}</p>
                              </div>
                            )}
                            
                            {/* Tracking info section */}
                            {['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status) && (
                              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-secondary-700">
                                {trackingLoading ? (
                                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Ładowanie informacji o przesyłce...</span>
                                  </div>
                                ) : trackingInfo?.trackingNumber ? (
                                  <div className="space-y-1">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Numer przesyłki:</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                                        {trackingInfo.trackingNumber}
                                      </p>
                                      {trackingInfo.trackingLink && (
                                        <a
                                          href={trackingInfo.trackingLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-orange-500 hover:text-orange-600 font-medium shrink-0"
                                        >
                                          Śledź →
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                    Informacje o śledzeniu przesyłki pojawią się po nadaniu.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Expanded product list */}
                          {isExpanded && packageItems.length > 0 && (
                            <div className="border-t border-gray-200 dark:border-secondary-700 p-3 space-y-3">
                              {(() => {
                                const isProductListExpanded = expandedProductLists.has(index);
                                const visibleItems = isProductListExpanded ? packageItems : packageItems.slice(0, MAX_VISIBLE_ITEMS);
                                const hiddenCount = packageItems.length - MAX_VISIBLE_ITEMS;
                                
                                return (
                                  <>
                                    {visibleItems.map((item, itemIndex) => (
                                      <div key={item.variantId || itemIndex} className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 dark:bg-secondary-700 rounded overflow-hidden shrink-0 relative">
                                          <Image
                                            src={item.image || '/placeholder.png'}
                                            alt={item.productName}
                                            fill
                                            sizes="40px"
                                            className="object-cover"
                                          />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-gray-900 dark:text-white line-clamp-1">{item.productName}</p>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">Ilość: {item.quantity}</p>
                                        </div>
                                      </div>
                                    ))}
                                    {hiddenCount > 0 && (
                                      <button
                                        onClick={() => {
                                          setExpandedProductLists(prev => {
                                            const newSet = new Set(prev);
                                            if (newSet.has(index)) {
                                              newSet.delete(index);
                                            } else {
                                              newSet.add(index);
                                            }
                                            return newSet;
                                          });
                                        }}
                                        className="w-full text-center py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
                                      >
                                        {isProductListExpanded ? 'Zwiń' : `Pokaż więcej (${hiddenCount})`}
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {/* Show courier name from tracking if available */}
                      {trackingPackages[0]?.courierName || getShippingMethodName(order.shippingMethod)}
                    </p>
                    {order.paczkomatCode && (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{order.paczkomatCode}</p>
                        {order.paczkomatAddress && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{order.paczkomatAddress}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Tracking info for single package orders */}
                    {['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status) && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-secondary-700">
                        {trackingLoading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Ładowanie informacji o przesyłce...</span>
                          </div>
                        ) : trackingPackages[0]?.trackingNumber ? (
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Numer przesyłki:</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                                {trackingPackages[0].trackingNumber}
                              </p>
                              {trackingPackages[0].trackingLink && (
                                <a
                                  href={trackingPackages[0].trackingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-orange-500 hover:text-orange-600 font-medium shrink-0"
                                >
                                  Śledź →
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                            Informacje o śledzeniu przesyłki pojawią się po nadaniu.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Shipping Address - show if no paczkomat or if custom address used */}
                {order.shippingAddress && !order.paczkomatCode && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-secondary-700">
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Adres dostawy</h4>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p className="font-medium text-gray-900 dark:text-white">{order.shippingAddress.firstName} {order.shippingAddress.lastName}</p>
                      <p>{order.shippingAddress.street}</p>
                      <p>{order.shippingAddress.postalCode} {order.shippingAddress.city}</p>
                      {order.shippingAddress.phone && <p className="pt-1">{order.shippingAddress.phone}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* B2B Shipping Label Upload */}
              {order.shippingMethod === 'b2b_wysylka_wlasna' && (
                <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm p-5 md:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Etykieta wysyłkowa (własna)</h3>
                  </div>
                  
                  {(order as any).b2bShippingLabel ? (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium text-green-800 dark:text-green-300">Etykieta przesłana</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/b2b-labels/${order.id}`}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                          onClick={async (e) => {
                            e.preventDefault();
                            const stored = localStorage.getItem('auth_tokens');
                            if (!stored) return;
                            const token = JSON.parse(stored).accessToken;
                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/b2b-labels/${order.id}`, {
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) {
                              const blob = await res.blob();
                              const disposition = res.headers.get('content-disposition') || '';
                              const match = disposition.match(/filename="(.+?)"/);
                              const filename = match ? match[1] : `etykieta-${order.orderNumber}`;
                              const a = document.createElement('a');
                              a.href = URL.createObjectURL(blob);
                              a.download = filename;
                              a.click();
                              URL.revokeObjectURL(a.href);
                            }
                          }}
                        >
                          Pobierz
                        </a>
                        <button
                          onClick={async () => {
                            if (!confirm('Czy na pewno chcesz usunąć etykietę?')) return;
                            const stored = localStorage.getItem('auth_tokens');
                            if (!stored) return;
                            const token = JSON.parse(stored).accessToken;
                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/b2b-labels/${order.id}`, {
                              method: 'DELETE',
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) {
                              window.location.reload();
                            }
                          }}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          Usuń
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        Wgraj etykietę wysyłkową swojego kuriera (PDF, JPEG lub PNG, max 10 MB).
                      </p>
                      <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 dark:border-secondary-600 rounded-lg cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 transition-colors">
                        <div className="flex flex-col items-center">
                          <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Kliknij lub przeciągnij plik</span>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const maxSize = 10 * 1024 * 1024; // 10 MB
                            if (file.size > maxSize) {
                              alert('Plik jest za duży. Maksymalny rozmiar to 10 MB.');
                              e.target.value = '';
                              return;
                            }
                            const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
                            if (!allowedTypes.includes(file.type)) {
                              alert('Niedozwolony format pliku. Dozwolone: PDF, JPEG, PNG, WebP.');
                              e.target.value = '';
                              return;
                            }
                            const stored = localStorage.getItem('auth_tokens');
                            if (!stored) return;
                            const token = JSON.parse(stored).accessToken;
                            const formData = new FormData();
                            formData.append('label', file);
                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/b2b-labels/${order.id}`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${token}` },
                              body: formData,
                            });
                            if (res.ok) {
                              window.location.reload();
                            } else {
                              const data = await res.json();
                              alert(data.error || 'Nie udało się przesłać etykiety');
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Info */}
              <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Płatność</h3>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Metoda płatności</span>
                    <span className="font-medium text-gray-900 dark:text-white">{getPaymentMethodName(order.paymentMethod)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Status</span>
                    {getPaymentStatusBadge(order.paymentStatus)}
                  </div>
                </div>

                {/* Billing Address */}
                {order.billingAddress && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-secondary-700">
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Dane do faktury</h4>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <p className="font-medium text-gray-900 dark:text-white">{order.billingAddress.firstName} {order.billingAddress.lastName}</p>
                      <p>{order.billingAddress.street}</p>
                      <p>{order.billingAddress.postalCode} {order.billingAddress.city}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Refund Eligibility Info */}
            {refundEligibility && ['DELIVERED', 'SHIPPED'].includes(order.status) && (
              <div className={`mt-6 p-4 rounded-lg border ${
                refundEligibility.eligible 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex items-center gap-3">
                  {refundEligibility.eligible ? (
                    <>
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-400">
                          Możesz zwrócić to zamówienie
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-500">
                          Pozostało {refundEligibility.daysRemaining} dni na złożenie wniosku o zwrot (14 dni od dostawy)
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Zwrot nie jest już możliwy
                        </p>
                        <p className="text-xs text-gray-500">
                          {refundEligibility.reason}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Refund Info - when order is refunded */}
            {order.status === 'REFUNDED' && order.refundNumber && (
              <div className="mt-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <h3 className="font-semibold text-orange-800 dark:text-orange-400">Informacje o zwrocie</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-1">Numer zwrotu:</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400 font-mono">{order.refundNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-1">Data zgłoszenia:</p>
                    <p className="font-medium text-orange-800 dark:text-orange-400">
                      {order.refundRequestedAt ? new Date(order.refundRequestedAt).toLocaleDateString('pl-PL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '-'}
                    </p>
                  </div>
                </div>

                {order.refundReason && (
                  <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-700">
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-1">Podany powód:</p>
                    <p className="text-orange-800 dark:text-orange-400">{order.refundReason}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-700">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-400 mb-2">Adres do wysyłki zwrotu:</p>
                  <div className="text-orange-700 dark:text-orange-300 text-sm">
                    <p className="font-semibold">WB Partners</p>
                    <p>Daniel Budyka</p>
                    <p>ul. Juliusza Słowackiego 24/11</p>
                    <p>35-060 Rzeszów</p>
                    <p className="mt-2">Tel: 570 034 367</p>
                    <p>support@wb-partners.pl</p>
                  </div>
                  <p className="mt-3 text-sm text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 p-2 rounded">
                    ⚠️ Pamiętaj o umieszczeniu numeru zwrotu <strong>{order.refundNumber}</strong> w paczce lub na paczce!
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
              <Link
                href="/account/orders"
                className="text-orange-500 hover:text-orange-600 font-medium text-sm inline-flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Wróć do zamówień
              </Link>
              
              <div className="flex gap-3">
                {['DELIVERED', 'SHIPPED'].includes(order.status) && refundEligibility?.eligible && (
                  <button 
                    onClick={() => setShowRefundModal(true)}
                    className="px-4 py-2 border border-orange-300 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Złóż wniosek o zwrot
                  </button>
                )}
                {order.status === 'DELIVERED' && (
                  <>
                    <button className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
                      Kup ponownie
                    </button>
                  </>
                )}
                {!['CANCELLED', 'REFUNDED'].includes(order.status) && !order.pendingCancellation && (
                  <button 
                    onClick={handleCancelOrderClick}
                    disabled={cancelling}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelling ? 'Wysyłanie...' : 'Anuluj zamówienie'}
                  </button>
                )}
                {order.pendingCancellation && (
                  <span className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm font-medium inline-flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Oczekuje na zatwierdzenie anulowania
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Wniosek o zwrot</h2>
                <button 
                  onClick={() => {
                    setShowRefundModal(false);
                    setRefundError(null);
                    setRefundReason('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {refundSuccess && refundResult ? (
                <div className="py-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">Wniosek o zwrot przyjęty!</h3>
                  
                  {/* Refund Number */}
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-1">Twój numer zwrotu:</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 font-mono">{refundResult.refundNumber}</p>
                  </div>

                  {/* Return Address */}
                  <div className="bg-gray-50 dark:bg-secondary-700 border border-gray-200 dark:border-secondary-600 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Adres do wysyłki zwrotu:</p>
                    <div className="text-gray-900 dark:text-white">
                      <p className="font-semibold">{refundResult.returnAddress.name}</p>
                      <p>{refundResult.returnAddress.contactPerson}</p>
                      <p>{refundResult.returnAddress.street}</p>
                      <p>{refundResult.returnAddress.postalCode} {refundResult.returnAddress.city}</p>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Tel: {refundResult.returnAddress.phone}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{refundResult.returnAddress.email}</p>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400 mb-2">⚠️ Ważne!</p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Umieść numer zwrotu <strong>{refundResult.refundNumber}</strong> NA PACZCE (na zewnątrz), abyśmy mogli zidentyfikować Twój zwrot.
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      Numer <strong>nie może</strong> być umieszczony wewnątrz paczki — musi być widoczny na opakowaniu.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowRefundModal(false);
                      setRefundSuccess(false);
                      setRefundResult(null);
                      setRefundReason('');
                    }}
                    className="w-full px-4 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                  >
                    Zamknij
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-blue-800 dark:text-blue-400 mb-2">Informacje o zwrocie</h4>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• Zwrot możliwy do 14 dni od daty dostawy</li>
                        <li>• Produkt musi być w oryginalnym opakowaniu</li>
                        <li>• Produkt nie może nosić śladów użytkowania</li>
                        <li>• Zwrot kosztów nastąpi w ciągu 14 dni od otrzymania towaru</li>
                      </ul>
                      <Link 
                        href="/returns" 
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
                      >
                        Przeczytaj pełną politykę zwrotów →
                      </Link>
                    </div>

                    <div className="bg-gray-50 dark:bg-secondary-700 rounded-lg p-4 mb-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Zamówienie:</span> #{order.orderNumber}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Kwota do zwrotu:</span> {Number(order.total).toFixed(2).replace('.', ',')} zł
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Pozostało dni:</span> {refundEligibility?.daysRemaining} z 14
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Powód zwrotu <span className="text-gray-400 font-normal">(opcjonalnie)</span>
                    </label>
                    <textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Opisz powód zwrotu (opcjonalnie)..."
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  {refundError && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{refundError}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowRefundModal(false);
                        setRefundError(null);
                        setRefundReason('');
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 dark:border-secondary-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
                    >
                      Anuluj
                    </button>
                    <button
                      onClick={handleRefundRequest}
                      disabled={refundSubmitting}
                      className="flex-1 px-4 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {refundSubmitting ? 'Wysyłanie...' : 'Złóż wniosek o zwrot'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
                Prośba o anulowanie zamówienia
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                Złożysz prośbę o anulowanie zamówienia #{order?.orderNumber}. Administrator rozpatrzy Twoją prośbę.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Powód anulowania (opcjonalnie)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white bg-white dark:bg-secondary-700 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Np. zmiana decyzji, pomyłka w zamówieniu..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCancelConfirmModal(false); setCancelReason(''); }}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-secondary-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
                >
                  Nie, zostaw
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {cancelling ? 'Wysyłanie...' : 'Złóż prośbę'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Result Modal */}
      {showCancelResultModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className={`flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full ${
                cancelResultType === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                cancelResultType === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                'bg-red-100 dark:bg-red-900/30'
              }`}>
                {cancelResultType === 'success' ? (
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : cancelResultType === 'pending' ? (
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <h3 className={`text-lg font-bold text-center mb-2 ${
                cancelResultType === 'success' ? 'text-green-700 dark:text-green-400' :
                cancelResultType === 'pending' ? 'text-yellow-700 dark:text-yellow-400' :
                'text-red-700 dark:text-red-400'
              }`}>
                {cancelResultType === 'success' ? 'Zamówienie anulowane' :
                 cancelResultType === 'pending' ? 'Prośba wysłana' :
                 'Wystąpił błąd'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
                {cancelResultMessage}
              </p>
              <button
                onClick={() => setShowCancelResultModal(false)}
                className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                  cancelResultType === 'success' ? 'bg-green-500 hover:bg-green-600 text-white' :
                  cancelResultType === 'pending' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' :
                  'bg-gray-200 dark:bg-secondary-700 hover:bg-gray-300 dark:hover:bg-secondary-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer hideTrustBadges />
    </div>
  );
}
