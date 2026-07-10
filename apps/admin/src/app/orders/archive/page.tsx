'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Archive, Search, Trash2, RotateCcw, ChevronLeft, ChevronRight,
  RefreshCw, ArrowLeft, Calendar, ShoppingCart, AlertTriangle, Clock,
} from 'lucide-react';
import Link from 'next/link';
import ConfirmModal from '@/components/ConfirmModal';

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

interface ArchivedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  deletedAt: string;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}

const statusLabels: Record<string, string> = {
  CANCELLED: 'Anulowane',
  REFUNDED: 'Zwrócone',
};

const statusColors: Record<string, string> = {
  CANCELLED: 'bg-red-500/20 text-red-400 border-red-500/30',
  REFUNDED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function OrdersArchivePage() {
  const [orders, setOrders] = useState<ArchivedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [restoreModal, setRestoreModal] = useState<{ open: boolean; orderId: string; orderNumber: string }>({ open: false, orderId: '', orderNumber: '' });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; orderId: string; orderNumber: string }>({ open: false, orderId: '', orderNumber: '' });
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
  const [cleanupModal, setCleanupModal] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ deleted: number } | null>(null);

  const loadArchive = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(`${API_URL}/orders/admin/archive?${params}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      const data = await response.json();

      setOrders(data.orders || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load archive:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm]);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const daysUntilCleanup = (deletedAt: string) => {
    const diff = 14 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const handleRestore = async (orderId: string) => {
    try {
      const token = getAuthToken();
      await fetch(`${API_URL}/orders/${orderId}/restore-from-archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      loadArchive();
    } catch (error) {
      console.error('Failed to restore order:', error);
    }
    setRestoreModal({ open: false, orderId: '', orderNumber: '' });
  };

  const handleCleanup = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/admin/archive/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ manual: true }),
      });
      const data = await response.json();
      setCleanupResult({ deleted: data.deleted || 0 });
      setSelectedIds(new Set());
      loadArchive();
    } catch (error) {
      console.error('Failed to cleanup archive:', error);
    }
    setCleanupModal(false);
  };

  const handlePermanentDelete = async (ids: string[]) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/orders/admin/archive/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json();
      setCleanupResult({ deleted: data.deleted || 0 });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      loadArchive();
    } catch (error) {
      console.error('Failed to permanently delete orders:', error);
    }
    setDeleteModal({ open: false, orderId: '', orderNumber: '' });
    setBulkDeleteModal(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/orders"
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Archive className="w-7 h-7 text-orange-400" />
              Archiwum zamówień
            </h1>
            <p className="text-gray-400">
              Usunięte zamówienia • {total} w archiwum • automatyczne czyszczenie po 14 dniach
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setBulkDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-600/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Usuń zaznaczone ({selectedIds.size})
            </button>
          )}
          <button
            onClick={loadArchive}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Odśwież
          </button>
          {total > 0 && (
            <button
              onClick={() => setCleanupModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-600/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Wyczyść archiwum
            </button>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-400">
          <p>Zamówienia w archiwum są automatycznie usuwane po <strong className="text-white">14 dniach</strong> od przeniesienia.</p>
          <p className="mt-1">Możesz przywrócić zamówienie z archiwum lub wyczyścić archiwum ręcznie.</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Szukaj po numerze zamówienia lub emailu..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-slate-800/80">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedIds.size === orders.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-4">Zamówienie</th>
                <th className="px-4 py-4">Klient</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Produkty</th>
                <th className="px-4 py-4 text-right">Kwota</th>
                <th className="px-4 py-4">Usunięto</th>
                <th className="px-4 py-4">Auto-usunięcie</th>
                <th className="px-4 py-4 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-4">
                      <div className="h-14 bg-slate-700 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400">
                    <Archive className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Archiwum jest puste</p>
                    <p className="text-sm">Usunięte zamówienia pojawią się tutaj</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const daysLeft = daysUntilCleanup(order.deletedAt);
                  return (
                    <tr key={order.id} className={`hover:bg-slate-700/30 transition-colors ${selectedIds.has(order.id) ? 'bg-orange-500/5' : ''}`}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">{order.orderNumber}</p>
                        <p className="text-xs text-gray-500">#{order.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-4">
                        {order.user ? (
                          <div>
                            <p className="text-white">{order.user.firstName} {order.user.lastName}</p>
                            <p className="text-xs text-gray-400">{order.user.email}</p>
                          </div>
                        ) : (
                          <span className="text-gray-500">Gość</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status] || ''}`}>
                          {statusLabels[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-gray-300">
                          {order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} szt.
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="text-white font-medium">{formatPrice(order.total)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(order.deletedAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className={`flex items-center gap-1.5 text-sm ${daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : 'text-gray-400'}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {daysLeft === 0 ? (
                            <span>Dziś</span>
                          ) : (
                            <span>{daysLeft} {daysLeft === 1 ? 'dzień' : 'dni'}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDeleteModal({ open: true, orderId: order.id, orderNumber: order.orderNumber })}
                            title="Usuń trwale"
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRestoreModal({ open: true, orderId: order.id, orderNumber: order.orderNumber })}
                            title="Przywróć z archiwum"
                            className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-sm">
            Wyświetlanie {((page - 1) * 20) + 1} - {Math.min(page * 20, total)} z {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-800 border border-slate-700 text-gray-300 hover:bg-slate-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Restore from archive modal */}
      <ConfirmModal
        isOpen={restoreModal.open}
        onClose={() => setRestoreModal({ open: false, orderId: '', orderNumber: '' })}
        onConfirm={() => handleRestore(restoreModal.orderId)}
        title="Przywróć z archiwum"
        message={`Zamówienie ${restoreModal.orderNumber} zostanie przywrócone z archiwum i pojawi się ponownie na liście zamówień (ze statusem anulowane/zwrócone).`}
        confirmText="Przywróć"
        cancelText="Anuluj"
        variant="success"
      />

      {/* Delete single order permanently */}
      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, orderId: '', orderNumber: '' })}
        onConfirm={() => handlePermanentDelete([deleteModal.orderId])}
        title="Trwałe usunięcie zamówienia"
        message={`Zamówienie ${deleteModal.orderNumber} zostanie trwale usunięte. Tej operacji nie można cofnąć.`}
        confirmText="Usuń trwale"
        cancelText="Anuluj"
        variant="danger"
        confirmPhrase={deleteModal.orderNumber}
        confirmPhraseLabel={`Wpisz ${deleteModal.orderNumber} aby potwierdzić:`}
      />

      {/* Bulk delete selected orders */}
      <ConfirmModal
        isOpen={bulkDeleteModal}
        onClose={() => setBulkDeleteModal(false)}
        onConfirm={() => handlePermanentDelete(Array.from(selectedIds))}
        title="Trwałe usunięcie zaznaczonych"
        message={`${selectedIds.size} zaznaczonych zamówień zostanie trwale usuniętych. Tej operacji nie można cofnąć.`}
        confirmText={`Usuń ${selectedIds.size} zamówień`}
        cancelText="Anuluj"
        variant="danger"
        confirmPhrase="USUŃ"
        confirmPhraseLabel="Wpisz USUŃ aby potwierdzić:"
      />

      {/* Cleanup archive modal */}
      <ConfirmModal
        isOpen={cleanupModal}
        onClose={() => setCleanupModal(false)}
        onConfirm={handleCleanup}
        title="Wyczyść archiwum"
        message={`Wszystkie zamówienia w archiwum (${total}) zostaną trwale usunięte. Tej operacji nie można cofnąć.`}
        confirmText="Wyczyść wszystko"
        cancelText="Anuluj"
        variant="danger"
        confirmPhrase="WYCZYŚĆ"
        confirmPhraseLabel="Wpisz WYCZYŚĆ aby potwierdzić:"
      />

      {/* Cleanup result notification */}
      {cleanupResult && (
        <div className="fixed bottom-6 right-6 bg-green-600/90 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300 z-50">
          <Trash2 className="w-5 h-5" />
          <span>Usunięto {cleanupResult.deleted} zamówień z archiwum</span>
          <button onClick={() => setCleanupResult(null)} className="ml-2 text-white/70 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}
