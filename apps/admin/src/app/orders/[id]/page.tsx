'use client';

import { useState, useEffect, use } from 'react';
import { 
  ArrowLeft, Package, Truck, CreditCard, MapPin, User, Calendar,
  Clock, FileText, Printer, CheckCircle, XCircle, AlertCircle,
  ChevronRight, Edit2, Save, X, RefreshCcw, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
  variant?: {
    product?: {
      id: string;
      slug: string;
      name: string;
      images?: { url: string }[];
    };
  };
}

interface StatusHistory {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface Address {
  id: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone?: string;
}

interface PackageShippingData {
  packageId: string;
  method: string;
  price: number;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  useCustomAddress?: boolean;
  customAddress?: {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    apartment?: string;
    postalCode: string;
    city: string;
  };
  items?: {
    productId: string;
    productName: string;
    variantId: string;
    variantName: string;
    quantity: number;
    image?: string;
  }[];
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  shippingMethod: string;
  paymentMethod: string;
  paymentStatus: string;
  trackingNumber?: string;
  customerNotes?: string;
  internalNotes?: string;
  trackingLink?: string;
  courierCode?: string;
  deliveryStatus?: string;
  deliveryStatusUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  paczkomatCode?: string;
  paczkomatAddress?: string;
  packageShipping?: PackageShippingData[];
  b2bShippingLabel?: string;
  refundNumber?: string;
  refundReason?: string;
  refundRequestedAt?: string;
  guestEmail?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestPhone?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  shippingAddress?: Address;
  billingAddress?: Address;
  items: OrderItem[];
  statusHistory: StatusHistory[];
  pendingCancellation?: boolean;
  pendingCancellationAt?: string;
  cancellationReason?: string;
  isBusinessOrder?: boolean;
  baselinkerOrderId?: string;
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  CONFIRMED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PROCESSING: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  SHIPPED: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  DELIVERED: 'bg-green-500/20 text-green-400 border-green-500/30',
  CANCELLED: 'bg-red-500/20 text-red-400 border-red-500/30',
  REFUNDED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusLabels: Record<string, string> = {
  OPEN: 'Nieopłacone',
  PENDING: 'Oczekujące',
  CONFIRMED: 'Opłacone',
  PROCESSING: 'W realizacji',
  SHIPPED: 'Wysłane',
  DELIVERED: 'Dostarczone',
  CANCELLED: 'Anulowane',
  REFUNDED: 'Zwrócone',
};

const statusFlow = ['OPEN', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

const paymentMethods: Record<string, string> = {
  CARD: 'Karta płatnicza',
  BLIK: 'BLIK',
  TRANSFER: 'Przelew bankowy',
  CASH: 'Gotówka przy odbiorze',
};

const shippingMethods: Record<string, string> = {
  INPOST: 'InPost Paczkomat',
  COURIER: 'Kurier DPD',
  PICKUP: 'Odbiór osobisty',
  b2b_wysylka_wlasna: 'Wysyłka własna B2B',
};

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

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { confirm, alert } = useModal();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [newTrackingNumber, setNewTrackingNumber] = useState('');
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [cancellationProcessing, setCancellationProcessing] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function loadOrder() {
    try {
      setLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (!response.ok) throw new Error('Order not found');
      const data = await response.json();
      setOrder(data);
      setNewStatus(data.status);
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  const formatDate = (dateStr: string) => 
    new Date(dateStr).toLocaleDateString('pl-PL', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const handleStatusChange = async () => {
    if (!order || newStatus === order.status) return;
    
    try {
      setSaving(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ status: newStatus, note: statusNote }),
      });
      
      if (response.ok) {
        await loadOrder();
        setShowStatusModal(false);
        setStatusNote('');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!await confirm('Czy na pewno chcesz anulować to zamówienie? Ta operacja zwolni zarezerwowany towar.')) return;
    
    try {
      const token = getAuthToken();
      await fetch(`${API_URL}/orders/${id}/approve-cancellation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      await loadOrder();
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  const handleApproveCancellation = async () => {
    if (!await confirm('Czy na pewno chcesz zatwierdzić anulowanie tego zamówienia?')) return;
    
    try {
      setCancellationProcessing(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}/approve-cancellation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (response.ok) {
        await loadOrder();
      } else {
        const data = await response.json();
        await alert(data.message || 'Błąd podczas zatwierdzania anulowania');
      }
    } catch (error) {
      console.error('Failed to approve cancellation:', error);
    } finally {
      setCancellationProcessing(false);
    }
  };

  const handleRejectCancellation = async () => {
    const reason = prompt('Podaj powód odrzucenia prośby o anulowanie (opcjonalnie):');
    if (reason === null) return;
    
    try {
      setCancellationProcessing(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}/reject-cancellation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ reason }),
      });
      if (response.ok) {
        await loadOrder();
      } else {
        const data = await response.json();
        await alert(data.message || 'Błąd podczas odrzucania prośby');
      }
    } catch (error) {
      console.error('Failed to reject cancellation:', error);
    } finally {
      setCancellationProcessing(false);
    }
  };

  const handleRefundOrder = async () => {
    const reason = prompt('Podaj powód zwrotu (opcjonalnie):');
    if (reason === null) return; // User cancelled
    
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ reason: reason || 'Zwrot na życzenie klienta' }),
      });
      
      if (response.ok) {
        await loadOrder();
      } else {
        const error = await response.json();
        await alert(error.message || 'Błąd podczas przetwarzania zwrotu');
      }
    } catch (error) {
      console.error('Failed to refund order:', error);
    }
  };

  const handleRestoreOrder = async () => {
    if (!await confirm('Czy na pewno chcesz przywrócić to zamówienie? Towar zostanie ponownie zarezerwowany.')) return;
    
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${id}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      
      if (response.ok) {
        await loadOrder();
      } else {
        const error = await response.json();
        await alert(error.message || 'Błąd podczas przywracania zamówienia');
      }
    } catch (error) {
      console.error('Failed to restore order:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'CANCELLED':
      case 'REFUNDED':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-blue-400" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-slate-700 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-slate-700 rounded-xl animate-pulse"></div>
            <div className="h-48 bg-slate-700 rounded-xl animate-pulse"></div>
          </div>
          <div className="space-y-6">
            <div className="h-48 bg-slate-700 rounded-xl animate-pulse"></div>
            <div className="h-64 bg-slate-700 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-xl font-bold text-white mb-2">Zamówienie nie znalezione</h2>
        <p className="text-gray-400 mb-4">Zamówienie o podanym ID nie istnieje</p>
        <Link href="/orders" className="text-orange-400 hover:text-orange-300">
          Wróć do listy zamówień
        </Link>
      </div>
    );
  }

  const currentStatusIndex = statusFlow.indexOf(order.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/orders" 
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{order.orderNumber}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusColors[order.status]}`}>
                {statusLabels[order.status] || order.status}
              </span>
            </div>
            <p className="text-gray-400 text-sm">
              Utworzono: {formatDate(order.createdAt)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link
            href={`/orders/${id}/label`}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 transition-colors"
          >
            <Truck className="w-4 h-4" />
            Etykieta
          </Link>
          <Link
            href={`/orders/${id}/invoice`}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Faktura
          </Link>
          <button
            onClick={() => setShowStatusModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-lg text-white hover:bg-orange-600 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Zmień status
          </button>
        </div>
      </div>

      {/* Pending Cancellation Alert */}
      {order.pendingCancellation && order.status !== 'CANCELLED' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-yellow-400 font-medium">Klient złożył prośbę o anulowanie tego zamówienia</p>
              {order.cancellationReason && (
                <p className="text-gray-400 text-sm mt-1">Powód: <span className="text-gray-300">{order.cancellationReason}</span></p>
              )}
              {order.pendingCancellationAt && (
                <p className="text-gray-500 text-xs mt-1">Złożono: {formatDate(order.pendingCancellationAt)}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleApproveCancellation}
                  disabled={cancellationProcessing}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {cancellationProcessing ? 'Przetwarzanie...' : 'Zatwierdź anulowanie'}
                </button>
                <button
                  onClick={handleRejectCancellation}
                  disabled={cancellationProcessing}
                  className="px-4 py-2 bg-slate-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
                >
                  Odrzuć prośbę
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Progress */}
      {order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <div className="flex items-center justify-between">
            {statusFlow.map((status, index) => (
              <div key={status} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    index <= currentStatusIndex 
                      ? 'bg-orange-500 border-orange-500 text-white' 
                      : 'bg-slate-700 border-slate-600 text-gray-500'
                  }`}>
                    {index < currentStatusIndex ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span className={`mt-2 text-xs font-medium ${
                    index <= currentStatusIndex ? 'text-orange-400' : 'text-gray-500'
                  }`}>
                    {statusLabels[status]}
                  </span>
                </div>
                {index < statusFlow.length - 1 && (
                  <div className={`w-20 h-1 mx-2 rounded ${
                    index < currentStatusIndex ? 'bg-orange-500' : 'bg-slate-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-400" />
                Produkty ({order.items.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-700/50">
              {order.items.map((item) => {
                const productSlug = item.variant?.product?.slug;
                const productImage = item.variant?.product?.images?.[0]?.url;
                const webUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://wb-trade.pl';
                const productLink = productSlug ? `${webUrl}/products/${productSlug}` : null;

                return (
                <div key={item.id} className="px-6 py-4 flex items-center gap-4">
                  {productLink ? (
                    <a
                      href={productLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-16 h-16 bg-slate-700 rounded-lg flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-orange-400 transition-all cursor-pointer flex-shrink-0"
                      title="Otwórz stronę produktu"
                    >
                      {productImage ? (
                        <img src={productImage} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-8 h-8 text-orange-400" />
                      )}
                    </a>
                  ) : (
                    <div className="w-16 h-16 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1">
                    {productLink ? (
                      <a href={productLink} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-orange-400 transition-colors">
                        {item.productName}
                      </a>
                    ) : (
                      <p className="font-medium text-white">{item.productName}</p>
                    )}
                    <p className="text-sm text-gray-400">{item.variantName}</p>
                    <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400">{item.quantity} × {formatPrice(item.unitPrice)}</p>
                    <p className="font-medium text-white">{formatPrice(item.total)}</p>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="px-6 py-4 bg-slate-800/50 space-y-2">
              <div className="flex justify-between text-gray-400">
                <span>Suma częściowa</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Dostawa</span>
                <span>{formatPrice(order.shipping)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>VAT (23%)</span>
                <span>{formatPrice(order.tax)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Rabat</span>
                  <span>-{formatPrice(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-white pt-2 border-t border-slate-700">
                <span>Razem</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Status History */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-400" />
                Historia statusów
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {order.statusHistory.map((history, index) => (
                  <div key={history.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      {getStatusIcon(history.status)}
                      {index < order.statusHistory.length - 1 && (
                        <div className="w-0.5 h-full bg-slate-700 my-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[history.status]}`}>
                          {statusLabels[history.status] || history.status}
                        </span>
                        <span className="text-gray-500 text-sm">{formatDate(history.createdAt)}</span>
                      </div>
                      {history.note && (
                        <p className="text-gray-400 text-sm mt-1">{history.note}</p>
                      )}
                      {history.createdBy && (
                        <p className="text-gray-500 text-xs mt-1">Przez: {history.createdBy}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          {(order.customerNotes || order.internalNotes) && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h2 className="font-semibold text-white mb-4">Uwagi</h2>
              {order.customerNotes && (
                <div className="mb-4">
                  <p className="text-sm text-gray-400 mb-1">Uwagi klienta:</p>
                  <p className="text-white bg-slate-700/50 p-3 rounded-lg">{order.customerNotes}</p>
                </div>
              )}
              {order.internalNotes && (
                <div>
                  <p className="text-sm text-gray-400 mb-1">Uwagi wewnętrzne:</p>
                  <p className="text-white bg-slate-700/50 p-3 rounded-lg">{order.internalNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-orange-400" />
              Klient
            </h2>
            {order.user ? (
              <div className="space-y-3">
                <p className="text-white font-medium">
                  {order.user.firstName} {order.user.lastName}
                </p>
                <p className="text-gray-400 text-sm">{order.user.email}</p>
                {order.user.phone && (
                  <p className="text-gray-400 text-sm">{order.user.phone}</p>
                )}
                <Link 
                  href={`/users/${order.user.id}`}
                  className="inline-flex items-center gap-1 text-orange-400 text-sm hover:text-orange-300"
                >
                  Zobacz profil <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  href={`/messages/new?orderId=${order.id}&orderNumber=${order.orderNumber}&userId=${order.user.id}`}
                  className="inline-flex items-center gap-2 mt-2 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400 text-sm hover:bg-orange-500/20 transition-colors w-full justify-center"
                >
                  <MessageSquare className="w-4 h-4" />
                  Napisz do klienta
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-400 text-sm italic">Zamówienie jako gość</p>
                {(order.guestFirstName || order.guestLastName) && (
                  <p className="text-white font-medium">
                    {order.guestFirstName} {order.guestLastName}
                  </p>
                )}
                {order.guestEmail && (
                  <p className="text-gray-400 text-sm">{order.guestEmail}</p>
                )}
                {order.guestPhone && (
                  <p className="text-gray-400 text-sm">{order.guestPhone}</p>
                )}
              </div>
            )}
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-orange-400" />
                Adres dostawy
              </h2>
              <div className="text-gray-300 space-y-1">
                <p>{order.shippingAddress.street}</p>
                <p>{order.shippingAddress.postalCode} {order.shippingAddress.city}</p>
                <p>{order.shippingAddress.country}</p>
                {order.shippingAddress.phone && (
                  <p className="text-gray-400 text-sm pt-2">Tel: {order.shippingAddress.phone}</p>
                )}
              </div>
            </div>
          )}

          {/* Shipping Method */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-400" />
              Dostawa
            </h2>
            
            {/* Per-package shipping info */}
            {order.packageShipping && order.packageShipping.length > 0 ? (
              <div className="space-y-4">
                {order.packageShipping.map((pkg, index) => (
                  <div key={pkg.packageId} className="p-3 bg-slate-700/50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-orange-400">
                        Paczka {index + 1}
                      </span>
                      <span className="text-sm text-gray-400">
                        {pkg.price.toFixed(2)} zł
                      </span>
                    </div>
                    <p className="text-white text-sm mb-1">
                      {shippingMethods[pkg.method] || pkg.method}
                    </p>
                    {pkg.paczkomatCode && (
                      <p className="text-xs text-gray-400 mb-2">
                        Paczkomat: {pkg.paczkomatCode}
                        {pkg.paczkomatAddress && ` - ${pkg.paczkomatAddress}`}
                      </p>
                    )}
                    
                    {/* Items in package */}
                    {pkg.items && pkg.items.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-600/50">
                        <p className="text-xs text-gray-500 mb-1">Produkty:</p>
                        <ul className="text-xs text-gray-400 space-y-1">
                          {pkg.items.map((item, itemIndex) => (
                            <li key={itemIndex}>
                              {item.productName} {item.variantName !== 'Default' && `(${item.variantName})`} × {item.quantity}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Custom address for package */}
                    {pkg.useCustomAddress && pkg.customAddress && (
                      <div className="mt-2 pt-2 border-t border-slate-600/50">
                        <p className="text-xs text-gray-500 mb-1">Inny adres dostawy:</p>
                        <div className="text-xs text-gray-300">
                          <p>{pkg.customAddress.firstName} {pkg.customAddress.lastName}</p>
                          <p>{pkg.customAddress.street}{pkg.customAddress.apartment && ` ${pkg.customAddress.apartment}`}</p>
                          <p>{pkg.customAddress.postalCode} {pkg.customAddress.city}</p>
                          {pkg.customAddress.phone && <p>Tel: {pkg.customAddress.phone}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="text-white">
                  {shippingMethods[order.shippingMethod] || order.shippingMethod}
                </p>
                {order.paczkomatCode && (
                  <p className="text-sm text-gray-400 mt-1">
                    Paczkomat: {order.paczkomatCode}
                    {order.paczkomatAddress && ` - ${order.paczkomatAddress}`}
                  </p>
                )}
              </>
            )}
            
            {order.trackingNumber ? (
              <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">Numer przesyłki:</p>
                  <button
                    onClick={() => { setNewTrackingNumber(order.trackingNumber || ''); setShowTrackingModal(true); }}
                    className="p-1 text-gray-500 hover:text-orange-400 transition-colors"
                    title="Edytuj numer przesyłki"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-white font-mono">{order.trackingNumber}</p>
                {order.trackingLink && (
                  <a 
                    href={order.trackingLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-orange-400 hover:text-orange-300 mt-1 inline-block"
                  >
                    Śledź przesyłkę →
                  </a>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setNewTrackingNumber(''); setShowTrackingModal(true); }}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-colors text-sm"
              >
                <Truck className="w-4 h-4" />
                Dodaj numer przesyłki
              </button>
            )}

            {order.deliveryStatus && (
              <div className="mt-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600/50">
                <p className="text-sm text-gray-400">Status dostawy:</p>
                <p className="text-white text-sm font-medium mt-1">
                  📦 {deliveryStatusLabels[order.deliveryStatus] || order.deliveryStatus}
                </p>
                {order.deliveryStatusUpdatedAt && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Aktualizacja: {new Date(order.deliveryStatusUpdatedAt).toLocaleString('pl-PL')}
                  </p>
                )}
              </div>
            )}

            {order.b2bShippingLabel && (
              <div className="mt-3 p-3 bg-slate-700/50 rounded-lg border border-orange-500/30">
                <p className="text-sm text-gray-400 mb-2">Etykieta B2B (przesłana przez klienta):</p>
                <button
                  onClick={async () => {
                    const token = getAuthToken();
                    const res = await fetch(`${API_URL}/b2b-labels/${order.id}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                      const blob = await res.blob();
                      const disposition = res.headers.get('content-disposition') || '';
                      const match = disposition.match(/filename="(.+?)"/);
                      const filename = match ? match[1] : `etykieta-${order.orderNumber}`;
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg text-sm transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Pobierz etykietę
                </button>
              </div>
            )}
          </div>

          {/* Refund Info */}
          {order.status === 'REFUNDED' && order.refundNumber && (
            <div className="bg-slate-800/50 rounded-xl border border-orange-500/30 p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-400" />
                Informacje o zwrocie
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400">Numer zwrotu</p>
                  <p className="text-xl font-bold text-orange-400 font-mono mt-1">{order.refundNumber}</p>
                </div>
                {order.refundReason && (
                  <div>
                    <p className="text-sm text-gray-400">Powód zwrotu</p>
                    <p className="text-white text-sm mt-1">{order.refundReason}</p>
                  </div>
                )}
                {order.refundRequestedAt && (
                  <div>
                    <p className="text-sm text-gray-400">Data zgłoszenia zwrotu</p>
                    <p className="text-white text-sm mt-1">{formatDate(order.refundRequestedAt)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-orange-400" />
              Płatność
            </h2>
            <p className="text-white">
              {paymentMethods[order.paymentMethod] || order.paymentMethod}
            </p>
            <div className="mt-3">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                order.paymentStatus === 'PAID' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {order.paymentStatus === 'PAID' ? 'Opłacone' : 'Oczekuje na płatność'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4">Akcje</h2>
            <div className="space-y-2">
              {/* Manual Baselinker sync */}
              {order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && (
                <button
                  onClick={async () => {
                    try {
                      setSyncing(true);
                      setSyncMessage(null);
                      const token = getAuthToken();
                      const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        ...(token && { Authorization: `Bearer ${token}` }),
                      };

                      // If order is not synced to Baselinker yet, push it first
                      if (!order.baselinkerOrderId) {
                        const pushRes = await fetch(`${API_URL}/admin/baselinker/orders/${order.id}/sync`, {
                          method: 'POST',
                          headers,
                          body: JSON.stringify({ force: true }),
                        });
                        const pushData = await pushRes.json();
                        if (!pushRes.ok || !pushData.success) {
                          setSyncMessage({ type: 'error', text: pushData.error || pushData.message || 'Błąd wysyłania zamówienia do Baselinker' });
                          return;
                        }
                        setSyncMessage({ type: 'success', text: 'Zamówienie wysłane do Baselinker' });
                        await loadOrder();
                        return;
                      }

                      // Order already in BL — sync delivery tracking
                      const res = await fetch(`${API_URL}/orders/${order.id}/sync-delivery`, {
                        method: 'POST',
                        headers,
                      });
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setSyncMessage({ type: 'success', text: `Zsynchronizowano${data.deliveryStatus ? ` — ${data.deliveryStatus}` : ''}` });
                        await loadOrder();
                      } else {
                        setSyncMessage({ type: 'error', text: data.error || data.message || 'Błąd synchronizacji' });
                      }
                    } catch {
                      setSyncMessage({ type: 'error', text: 'Błąd połączenia z API' });
                    } finally {
                      setSyncing(false);
                      setTimeout(() => setSyncMessage(null), 5000);
                    }
                  }}
                  disabled={syncing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Synchronizuję...' : order.baselinkerOrderId ? 'Synchronizuj dostawę' : 'Wyślij do Baselinker'}
                </button>
              )}
              {syncMessage && (
                <p className={`text-xs px-2 py-1.5 rounded-lg ${
                  syncMessage.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {syncMessage.text}
                </p>
              )}
              {order.status === 'CANCELLED' || order.status === 'REFUNDED' ? (
                <button 
                  onClick={handleRestoreOrder}
                  className="w-full px-4 py-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors"
                >
                  Przywróć zamówienie
                </button>
              ) : (
                <>
                  {(order.status === 'DELIVERED' || order.status === 'SHIPPED') && (
                    <button 
                      onClick={handleRefundOrder}
                      className="w-full px-4 py-2 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors"
                    >
                      Przetwórz zwrot
                    </button>
                  )}
                  <button 
                    onClick={handleCancelOrder}
                    className="w-full px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    Anuluj zamówienie
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Zmień status zamówienia</h3>
              <button 
                onClick={() => setShowStatusModal(false)}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Nowy status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Notatka (opcjonalnie)</label>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Dodaj komentarz do zmiany statusu..."
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleStatusChange}
                disabled={saving || newStatus === order.status}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-lg text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Zapisywanie...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Zapisz
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tracking Number Edit Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">
                {order.trackingNumber ? 'Zmień numer przesyłki' : 'Dodaj numer przesyłki'}
              </h3>
              <button 
                onClick={() => setShowTrackingModal(false)}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {order.trackingNumber && (
                <div>
                  <p className="text-sm text-gray-400 mb-1">Obecny numer:</p>
                  <p className="text-white font-mono bg-slate-700/50 px-3 py-2 rounded-lg">{order.trackingNumber}</p>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {order.trackingNumber ? 'Nowy numer przesyłki' : 'Numer przesyłki'}
                </label>
                <input
                  type="text"
                  value={newTrackingNumber}
                  onChange={(e) => setNewTrackingNumber(e.target.value)}
                  placeholder="np. 6280012345678901234"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Link do śledzenia zostanie wygenerowany automatycznie na podstawie kuriera.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowTrackingModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={async () => {
                  const trimmed = newTrackingNumber.trim();
                  if (order.trackingNumber && trimmed !== order.trackingNumber) {
                    const confirmed = await confirm(
                      `Czy na pewno chcesz zmienić numer przesyłki z "${order.trackingNumber}" na "${trimmed || '(pusty)'}"?`
                    );
                    if (!confirmed) return;
                  }
                  try {
                    setTrackingSaving(true);
                    const token = getAuthToken();
                    const res = await fetch(`${API_URL}/orders/${id}/tracking`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(token && { Authorization: `Bearer ${token}` }),
                      },
                      body: JSON.stringify({ trackingNumber: trimmed }),
                    });
                    if (res.ok) {
                      await loadOrder();
                      setShowTrackingModal(false);
                    } else {
                      const err = await res.json();
                      await alert(err.message || 'Błąd podczas aktualizacji');
                    }
                  } catch {
                    await alert('Błąd połączenia z API');
                  } finally {
                    setTrackingSaving(false);
                  }
                }}
                disabled={trackingSaving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-lg text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {trackingSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Zapisywanie...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Zapisz
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
