'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, ArrowLeft, Check, X, RefreshCw, 
  Package, Calendar, User, Phone, Mail, Building2
} from 'lucide-react';
import Link from 'next/link';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const tokens = localStorage.getItem('admin_auth_tokens');
  if (!tokens) return null;
  try {
    return JSON.parse(tokens).accessToken;
  } catch {
    return null;
  }
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  createdAt: string;
  pendingCancellationAt: string;
  isBusinessOrder: boolean;
  billingNip?: string;
  billingCompanyName?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  guestEmail?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestPhone?: string;
  shippingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
    phone?: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    companyName?: string;
    nip?: string;
  };
  cancellationReason?: string;
  items: { 
    id: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

export default function PendingCancellationsPage() {
  const { confirm, alert } = useModal();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/admin/pending-cancellations`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      const data = await response.json();
      setOrders(data || []);
    } catch (error) {
      console.error('Failed to load pending cancellations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

  const handleApprove = async (orderId: string) => {
    if (!await confirm('Czy na pewno chcesz zatwierdzić anulowanie tego zamówienia?')) return;
    
    try {
      setProcessingId(orderId);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${orderId}/approve-cancellation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      
      if (!response.ok) {
        throw new Error('Błąd podczas zatwierdzania anulowania');
      }
      
      // Remove from list
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (error) {
      console.error('Failed to approve cancellation:', error);
      await alert('Nie udało się zatwierdzić anulowania');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (orderId: string) => {
    try {
      setProcessingId(orderId);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/${orderId}/reject-cancellation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ reason: rejectReason }),
      });
      
      if (!response.ok) {
        throw new Error('Błąd podczas odrzucania prośby');
      }
      
      // Remove from list
      setOrders(prev => prev.filter(o => o.id !== orderId));
      setShowRejectModal(null);
      setRejectReason('');
    } catch (error) {
      console.error('Failed to reject cancellation:', error);
      await alert('Nie udało się odrzucić prośby');
    } finally {
      setProcessingId(null);
    }
  };

  const getCustomerInfo = (order: Order) => {
    if (order.user) {
      return {
        name: `${order.user.firstName} ${order.user.lastName}`,
        email: order.user.email,
      };
    }
    return {
      name: `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim() || 'Gość',
      email: order.guestEmail || '-',
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/orders"
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <AlertTriangle className="w-7 h-7 text-yellow-500" />
              Prośby o anulowanie zamówień
            </h1>
            <p className="text-gray-400">
              Zamówienia oczekujące na zatwierdzenie anulowania • {orders.length} {orders.length === 1 ? 'zamówienie' : 'zamówień'}
            </p>
          </div>
        </div>
        <button
          onClick={loadOrders}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Odśwież
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Prośby o anulowanie wymagają zatwierdzenia</p>
            <p className="text-gray-400 text-sm mt-1">
              Klienci poprosili o anulowanie tych zamówień. Sprawdź powód anulowania i podejmij decyzję 
              o zatwierdzeniu lub odrzuceniu prośby.
            </p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && (
        <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Brak zamówień oczekujących na zatwierdzenie</p>
          <p className="text-gray-500 text-sm mt-1">Wszystkie prośby o anulowanie zostały rozpatrzone</p>
        </div>
      )}

      {/* Orders List */}
      {!loading && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => {
            const customer = getCustomerInfo(order);
            const isProcessing = processingId === order.id;
            
            return (
              <div 
                key={order.id}
                className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden"
              >
                {/* Order Header */}
                <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-yellow-500/20">
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link 
                          href={`/orders/${order.id}`}
                          className="text-lg font-bold text-white hover:text-orange-400 transition-colors"
                        >
                          {order.orderNumber}
                        </Link>
                        {order.isBusinessOrder && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            FV - Firma
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(order.createdAt)}
                        </span>
                        <span>•</span>
                        <span className="text-yellow-400">
                          Prośba o anulowanie: {formatDate(order.pendingCancellationAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{formatPrice(order.total)}</p>
                    <p className="text-sm text-gray-400">{order.items.length} produktów</p>
                  </div>
                </div>

                {/* Order Details */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Customer Info */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Klient</p>
                    <div className="space-y-1">
                      <p className="text-white flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        {customer.name}
                      </p>
                      <p className="text-gray-400 flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-gray-500" />
                        {customer.email}
                      </p>
                      {(order.shippingAddress?.phone || order.guestPhone) && (
                        <p className="text-gray-400 flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-gray-500" />
                          {order.shippingAddress?.phone || order.guestPhone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cancellation Reason */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Powód anulowania</p>
                    {order.cancellationReason ? (
                      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                        <p className="text-sm text-gray-300">{order.cancellationReason}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">Nie podano powodu</p>
                    )}
                    {order.isBusinessOrder && (order.billingCompanyName || order.billingAddress?.companyName) && (
                      <div className="mt-2 space-y-1">
                        <p className="text-white flex items-center gap-2 text-sm">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          {order.billingCompanyName || order.billingAddress?.companyName}
                        </p>
                        {(order.billingNip || order.billingAddress?.nip) && (
                          <p className="text-gray-400 text-sm">
                            NIP: <span className="text-white font-mono">{order.billingNip || order.billingAddress?.nip}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Products Summary */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Produkty</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {order.items.slice(0, 3).map((item) => (
                        <p key={item.id} className="text-sm text-gray-400 truncate">
                          {item.quantity}x {item.productName}
                        </p>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-sm text-gray-500">
                          +{order.items.length - 3} więcej...
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-4 bg-slate-900/50 border-t border-slate-700/50 flex items-center justify-between">
                  <Link
                    href={`/orders/${order.id}`}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Zobacz szczegóły zamówienia →
                  </Link>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowRejectModal(order.id)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Odrzuć prośbę
                    </button>
                    <button
                      onClick={() => handleApprove(order.id)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Zatwierdź anulowanie
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full border border-slate-700">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">Odrzuć prośbę o anulowanie</h2>
              <p className="text-gray-400 mb-4">
                Klient zostanie poinformowany, że jego prośba o anulowanie zamówienia została odrzucona.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Powód odrzucenia (opcjonalnie)..."
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                rows={3}
              />
            </div>
            <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={processingId === showRejectModal}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {processingId === showRejectModal ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                Odrzuć prośbę
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
