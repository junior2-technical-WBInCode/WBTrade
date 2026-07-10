'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  RotateCcw, Search, ChevronLeft, ChevronRight,
  Inbox, Clock, CheckCircle, AlertCircle, RefreshCw, Eye,
  Archive, MoreHorizontal, X, CheckSquare, Square,
  FileWarning, Package, Ban, Send, PackageCheck,
} from 'lucide-react';

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

interface ReturnRequest {
  id: string;
  returnNumber: string;
  status: string;
  type: string;
  reason: string;
  refundAmount?: number | null;
  refundDate?: string | null;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  items: {
    id: string;
    quantity: number;
    reason?: string | null;
    orderItem: {
      id: string;
      productName: string;
      variantName: string;
      quantity: number;
      unitPrice: number;
    };
  }[];
  ticket: {
    id: string;
    ticketNumber: string;
    guestEmail?: string | null;
    guestName?: string | null;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  };
  order: {
    id: string;
    orderNumber: string;
    total: number;
    createdAt: string;
  };
}

interface Stats {
  newCount: number;
  receivedCount: number;
  approvedCount: number;
  refundSentCount: number;
  closedCount: number;
  rejectedCount: number;
  totalReturns: number;
  totalComplaints: number;
  closedToday: number;
}

const returnStatusColors: Record<string, string> = {
  NEW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  RECEIVED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  APPROVED: 'bg-green-500/20 text-green-400 border-green-500/30',
  REFUND_SENT: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const returnStatusLabels: Record<string, string> = {
  NEW: 'Nowy',
  RECEIVED: 'Przyjęty',
  APPROVED: 'Zaakceptowany',
  REFUND_SENT: 'Zwrot wysłany',
  CLOSED: 'Zamknięty',
  REJECTED: 'Odrzucony',
};

const categoryLabels: Record<string, string> = {
  RETURN: 'Zwrot',
  COMPLAINT: 'Reklamacja',
};

const categoryColors: Record<string, string> = {
  RETURN: 'bg-orange-500/20 text-orange-400',
  COMPLAINT: 'bg-red-500/20 text-red-400',
};

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  const [quickActionId, setQuickActionId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const authHeaders = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/admin/returns/stats`, { headers: authHeaders() });
      if (response.ok) {
        setStats(await response.json());
      }
    } catch (error) {
      console.error('Failed to load return stats:', error);
    }
  }, []);

  const loadReturns = useCallback(async () => {
    try {
      setLoading(true);
      // When archive mode is active and no specific status filter, show CLOSED + REJECTED
      let effectiveStatusFilter = statusFilter;
      if (showArchive && !statusFilter) {
        effectiveStatusFilter = 'CLOSED,REJECTED';
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(effectiveStatusFilter && { status: effectiveStatusFilter }),
        ...(typeFilter && { type: typeFilter }),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(`${API_URL}/admin/returns?${params}`, { headers: authHeaders() });

      if (response.ok) {
        const data = await response.json();
        setReturns(data.returns);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Failed to load returns:', error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, searchTerm, showArchive]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadReturns(); }, [loadReturns]);

  useEffect(() => {
    const interval = setInterval(() => { loadStats(); loadReturns(); }, 30000);
    return () => clearInterval(interval);
  }, [loadStats, loadReturns]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getCustomerName = (r: ReturnRequest) => {
    if (r.ticket.user) return `${r.ticket.user.firstName} ${r.ticket.user.lastName}`;
    if (r.ticket.guestName) return r.ticket.guestName;
    return r.ticket.guestEmail || 'Gość';
  };

  const getCustomerEmail = (r: ReturnRequest) => r.ticket.user?.email || r.ticket.guestEmail || '';

  const getItemsValue = (r: ReturnRequest) => {
    return r.items.reduce((sum, item) => sum + Number(item.orderItem.unitPrice) * item.quantity, 0);
  };

  const openQuickMenu = (e: React.MouseEvent, id: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuW = 224; // w-56
    const top = rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    setMenuPos({ top, left });
    setQuickActionId(quickActionId === id ? null : id);
  };

  // Quick status actions
  const handleQuickAction = async (returnId: string, action: string, body?: any) => {
    setQuickActionId(null);
    try {
      const url = `${API_URL}/admin/returns/${returnId}/${action}`;
      const method = action === 'status' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body || {}),
      });
      if (res.ok) {
        showToast('Status zaktualizowany');
        loadReturns();
        loadStats();
      } else {
        const data = await res.json();
        showToast(data.error || 'Błąd', 'error');
      }
    } catch {
      showToast('Błąd połączenia', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${
          toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70"><X className="w-3 h-3" /></button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500/10 rounded-xl">
            <RotateCcw className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Zwroty i reklamacje</h1>
            <p className="text-sm text-gray-400">Zarządzanie zwrotami i reklamacjami klientów</p>
          </div>
        </div>
        <button onClick={() => { loadReturns(); loadStats(); }}
          className="p-2.5 bg-slate-800 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-all duration-200" title="Odśwież">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-blue-500/30 transition-all duration-300 group cursor-pointer"
            onClick={() => { setStatusFilter('NEW'); setTypeFilter(''); setPage(1); }}>
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-xs text-gray-400 uppercase">Nowe</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.newCount}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-yellow-500/30 transition-all duration-300 group cursor-pointer"
            onClick={() => { setStatusFilter('RECEIVED'); setTypeFilter(''); setPage(1); }}>
            <div className="flex items-center gap-2 mb-2">
              <PackageCheck className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-xs text-gray-400 uppercase">Przyjęte</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.receivedCount}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-green-500/30 transition-all duration-300 group cursor-pointer"
            onClick={() => { setStatusFilter('APPROVED'); setTypeFilter(''); setPage(1); }}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-xs text-gray-400 uppercase">Zaakceptowane</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.approvedCount}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-emerald-500/30 transition-all duration-300 group cursor-pointer"
            onClick={() => { setStatusFilter('REFUND_SENT'); setTypeFilter(''); setPage(1); }}>
            <div className="flex items-center gap-2 mb-2">
              <Send className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-xs text-gray-400 uppercase">Zwrot wysłany</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.refundSentCount}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-gray-500/30 transition-all duration-300 group cursor-pointer"
            onClick={() => { setStatusFilter('CLOSED'); setTypeFilter(''); setPage(1); }}>
            <div className="flex items-center gap-2 mb-2">
              <Archive className="w-4 h-4 text-gray-400 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-xs text-gray-400 uppercase">Zamknięte</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.closedCount}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-red-500/30 transition-all duration-300 group cursor-pointer"
            onClick={() => { setStatusFilter('REJECTED'); setTypeFilter(''); setPage(1); }}>
            <div className="flex items-center gap-2 mb-2">
              <Ban className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-xs text-gray-400 uppercase">Odrzucone</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.rejectedCount}</p>
          </div>
        </div>
      )}

      {/* Archive / Active toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowArchive(false); setStatusFilter(''); setPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            !showArchive
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-slate-800/50 text-gray-400 border border-slate-700/50 hover:text-white hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Aktywne
          </div>
        </button>
        <button
          onClick={() => { setShowArchive(true); setStatusFilter(''); setPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            showArchive
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-slate-800/50 text-gray-400 border border-slate-700/50 hover:text-white hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Archiwum
            {stats && (stats.closedCount + stats.rejectedCount) > 0 && (
              <span className="ml-1 text-xs bg-slate-700 px-1.5 py-0.5 rounded-full">{stats.closedCount + stats.rejectedCount}</span>
            )}
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Szukaj po numerze zwrotu, zamówieniu, kliencie..."
              value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow duration-200" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow duration-200">
            {showArchive ? (
              <>
                <option value="">Zamknięte i odrzucone</option>
                <option value="CLOSED">Zamknięte</option>
                <option value="REJECTED">Odrzucone</option>
              </>
            ) : (
              <>
                <option value="">Wszystkie statusy</option>
                <option value="NEW">Nowe</option>
                <option value="RECEIVED">Przyjęte</option>
                <option value="APPROVED">Zaakceptowane</option>
                <option value="REFUND_SENT">Zwrot wysłany</option>
              </>
            )}
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow duration-200">
            <option value="">Zwroty i reklamacje</option>
            <option value="RETURN">Tylko zwroty</option>
            <option value="COMPLAINT">Tylko reklamacje</option>
          </select>
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-slate-800/80">
                <th className="px-4 py-4">Nr zwrotu</th>
                <th className="px-4 py-4">Klient</th>
                <th className="px-4 py-4">Typ</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Produkty</th>
                <th className="px-4 py-4">Wartość</th>
                <th className="px-4 py-4">Zamówienie</th>
                <th className="px-4 py-4">Data</th>
                <th className="px-4 py-4 w-20">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-4 py-4"><div className="h-14 bg-slate-700/50 rounded-lg"></div></td>
                  </tr>
                ))
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <RotateCcw className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Brak zgłoszeń</p>
                    <p className="text-sm mt-1">Nie znaleziono zwrotów ani reklamacji spełniających kryteria</p>
                  </td>
                </tr>
              ) : (
                returns.map((r) => (
                  <tr key={r.id} className={`group hover:bg-slate-700/30 transition-all duration-200 ${r.unreadCount > 0 ? 'bg-orange-500/5' : ''}`}>
                    <td className="px-4 py-4">
                      <Link href={`/returns/${r.id}`} className="group/rn">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold font-mono tracking-wide ${
                          r.type === 'RETURN' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        } group-hover/rn:brightness-125 transition-all`}>
                          {r.returnNumber}
                        </span>
                        {r.unreadCount > 0 && <span className="ml-2 inline-flex w-2 h-2 bg-orange-500 rounded-full animate-pulse" />}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-white text-sm font-medium">{getCustomerName(r)}</p>
                      <p className="text-gray-400 text-xs">{getCustomerEmail(r)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${categoryColors[r.type] || 'bg-slate-500/20 text-slate-400'}`}>
                        {categoryLabels[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${returnStatusColors[r.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {returnStatusLabels[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-gray-300 text-sm">{r.items.length} {r.items.length === 1 ? 'produkt' : r.items.length < 5 ? 'produkty' : 'produktów'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-white text-sm font-medium">{getItemsValue(r).toFixed(2)} zł</span>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/orders/${r.order.id}`} className="text-orange-400 text-sm hover:text-orange-300 transition-colors">
                        {r.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 relative">
                        <Link href={`/returns/${r.id}`}
                          className="p-2 text-gray-400 hover:text-orange-400 transition-all duration-200 hover:bg-slate-700/50 rounded-lg">
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button onClick={(e) => openQuickMenu(e, r.id)}
                          className="p-2 text-gray-400 hover:text-white transition-all duration-200 hover:bg-slate-700/50 rounded-lg">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Action Menu - Portal to document.body to escape CSS transform context */}
      {quickActionId && (() => {
        const r = returns.find(ret => ret.id === quickActionId);
        if (!r) return null;
        return createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setQuickActionId(null)} />
            <div
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[9999] py-1 animate-in fade-in zoom-in-95 duration-150">
              <Link href={`/returns/${r.id}`} onClick={() => setQuickActionId(null)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-slate-700/50 hover:text-white transition-colors">
                <Eye className="w-4 h-4" /> Otwórz szczegóły
              </Link>
              <div className="border-t border-slate-700 my-1" />
              {r.status === 'NEW' && (
                <button onClick={() => handleQuickAction(r.id, 'status', { status: 'RECEIVED' })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                  <PackageCheck className="w-4 h-4" /> Oznacz jako przyjęty
                </button>
              )}
              {(r.status === 'NEW' || r.status === 'RECEIVED') && (
                <button onClick={() => handleQuickAction(r.id, 'approve')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-400 hover:bg-green-500/10 transition-colors">
                  <CheckCircle className="w-4 h-4" /> Zaakceptuj
                </button>
              )}
              {r.status === 'APPROVED' && (
                <button onClick={() => handleQuickAction(r.id, 'refund-sent')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                  <Send className="w-4 h-4" /> Oznacz zwrot wysłany
                </button>
              )}
              {r.status === 'REFUND_SENT' && (
                <button onClick={() => handleQuickAction(r.id, 'close')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-slate-700/50 transition-colors">
                  <Archive className="w-4 h-4" /> Zamknij (archiwum)
                </button>
              )}
              {(r.status === 'NEW' || r.status === 'RECEIVED') && (
                <>
                  <div className="border-t border-slate-700 my-1" />
                  <button onClick={() => handleQuickAction(r.id, 'reject', { rejectionReason: 'Odrzucono z listy zwrotów' })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                    <Ban className="w-4 h-4" /> Odrzuć
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        );
      })()}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Wyświetlanie {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} z {total} zgłoszeń
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="p-2 bg-slate-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white text-sm">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="p-2 bg-slate-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
