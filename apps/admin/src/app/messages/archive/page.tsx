'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Archive, Search, ChevronLeft, ChevronRight, RotateCcw,
  ArrowLeft, RefreshCw, MessageSquare, Eye, CheckCircle,
  AlertCircle, X, CheckSquare, Square, Clock, Inbox,
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

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  lastMessageAt: string;
  createdAt: string;
  archivedAt?: string;
  unreadCount: number;
  lastMessage?: { content: string; senderRole: string; createdAt: string } | null;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
  guestEmail?: string | null;
  order?: { id: string; orderNumber: string } | null;
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400 border-green-500/30',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusLabels: Record<string, string> = {
  OPEN: 'Otwarte',
  IN_PROGRESS: 'W trakcie',
  CLOSED: 'Zamknięte',
};

const categoryLabels: Record<string, string> = {
  ORDER: 'Zamówienie',
  DELIVERY: 'Dostawa',
  COMPLAINT: 'Reklamacja',
  RETURN: 'Zwrot',
  PAYMENT: 'Płatność',
  ACCOUNT: 'Konto',
  GENERAL: 'Ogólne',
};

const categoryColors: Record<string, string> = {
  ORDER: 'bg-blue-500/20 text-blue-400',
  DELIVERY: 'bg-cyan-500/20 text-cyan-400',
  COMPLAINT: 'bg-red-500/20 text-red-400',
  PAYMENT: 'bg-purple-500/20 text-purple-400',
  ACCOUNT: 'bg-orange-500/20 text-orange-400',
  GENERAL: 'bg-slate-500/20 text-slate-400',
};

export default function MessagesArchivePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadArchive = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter && { status: statusFilter }),
        ...(categoryFilter && { category: categoryFilter }),
      });

      const response = await fetch(`${API_URL}/admin/support/tickets/archived?${params}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to load archive:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, statusFilter, categoryFilter]);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getCustomerName = (ticket: Ticket) => {
    if (ticket.user) return `${ticket.user.firstName} ${ticket.user.lastName}`;
    return ticket.guestEmail || 'Gość';
  };

  const getCustomerEmail = (ticket: Ticket) => {
    return ticket.user?.email || ticket.guestEmail || '';
  };

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map(t => t.id)));
    }
  };

  // Restore
  const handleRestore = async (ticketIds: string[]) => {
    setActionLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/support/tickets/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ ticketIds }),
      });
      const data = await res.json();
      showToast(data.message || `Przywrócono ${ticketIds.length} zgłoszeń`);
      setSelectedIds(new Set());
      loadArchive();
    } catch {
      showToast('Błąd przywracania', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${
          toast.type === 'success'
            ? 'bg-green-500/20 border-green-500/30 text-green-400'
            : 'bg-red-500/20 border-red-500/30 text-red-400'
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
          <Link
            href="/messages"
            className="p-2 bg-slate-800 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-2.5 bg-orange-500/10 rounded-xl">
            <Archive className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Archiwum zgłoszeń</h1>
            <p className="text-sm text-gray-400">
              {total} zarchiwizowanych zgłoszeń
            </p>
          </div>
        </div>
        <button
          onClick={() => loadArchive()}
          className="p-2.5 bg-slate-800 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-all duration-200"
          title="Odśwież"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Bulk Actions Bar */}
      <div className={`overflow-hidden transition-all duration-300 ${hasSelection ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-orange-300 font-medium">
              Zaznaczono: {selectedIds.size} {selectedIds.size === 1 ? 'zgłoszenie' : selectedIds.size < 5 ? 'zgłoszenia' : 'zgłoszeń'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestore(Array.from(selectedIds))}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-green-600/50 hover:bg-green-600 text-green-300 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Przywróć zaznaczone
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Szukaj w archiwum..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow duration-200"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow duration-200">
            <option value="">Wszystkie statusy</option>
            <option value="OPEN">Otwarte</option>
            <option value="IN_PROGRESS">W trakcie</option>
            <option value="CLOSED">Zamknięte</option>
          </select>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow duration-200">
            <option value="">Wszystkie kategorie</option>
            <option value="ORDER">Zamówienie</option>
            <option value="DELIVERY">Dostawa</option>
            <option value="COMPLAINT">Reklamacja</option>
            <option value="RETURN">Zwrot</option>
            <option value="PAYMENT">Płatność</option>
            <option value="ACCOUNT">Konto</option>
            <option value="GENERAL">Ogólne</option>
          </select>
        </div>
      </div>

      {/* Archive Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-slate-800/80">
                <th className="px-4 py-4 w-10">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-white transition-colors">
                    {selectedIds.size === tickets.length && tickets.length > 0
                      ? <CheckSquare className="w-4 h-4 text-orange-400" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-4">Numer</th>
                <th className="px-4 py-4">Klient</th>
                <th className="px-4 py-4">Temat</th>
                <th className="px-4 py-4">Kategoria</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Zarchiwizowano</th>
                <th className="px-4 py-4">Data utworzenia</th>
                <th className="px-4 py-4 w-24">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-4 py-4">
                      <div className="h-14 bg-slate-700/50 rounded-lg"></div>
                    </td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <Archive className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Archiwum jest puste</p>
                    <p className="text-sm mt-1">Zarchiwizowane zgłoszenia pojawią się tutaj</p>
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id}
                    className={`group hover:bg-slate-700/30 transition-all duration-200 ${
                      selectedIds.has(ticket.id) ? 'bg-orange-500/10' : ''
                    }`}>
                    <td className="px-4 py-4">
                      <button onClick={() => toggleSelect(ticket.id)} className="text-gray-400 hover:text-orange-400 transition-colors">
                        {selectedIds.has(ticket.id) ? <CheckSquare className="w-4 h-4 text-orange-400" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-white font-mono text-sm">{ticket.ticketNumber}</span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-white text-sm font-medium">{getCustomerName(ticket)}</p>
                      <p className="text-gray-400 text-xs">{getCustomerEmail(ticket)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-white text-sm max-w-xs truncate">{ticket.subject}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${categoryColors[ticket.category] || 'bg-slate-500/20 text-slate-400'}`}>
                        {categoryLabels[ticket.category] || ticket.category}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${statusColors[ticket.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {statusLabels[ticket.status] || ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">
                      {ticket.archivedAt ? formatDate(ticket.archivedAt) : '—'}
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(ticket.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <Link href={`/messages/${ticket.id}`}
                          className="p-2 text-gray-400 hover:text-orange-400 transition-all duration-200 hover:bg-slate-700/50 rounded-lg">
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleRestore([ticket.id])}
                          disabled={actionLoading}
                          className="p-2 text-gray-400 hover:text-green-400 transition-all duration-200 hover:bg-green-500/10 rounded-lg disabled:opacity-50"
                          title="Przywróć"
                        >
                          <RotateCcw className="w-4 h-4" />
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
