'use client';

import { useState, useEffect } from 'react';
import {
  HelpCircle,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  MessageCircleQuestion,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface UnmatchedQuestion {
  id: string;
  question: string;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export default function ChatbotUnmatchedPage() {
  const [questions, setQuestions] = useState<UnmatchedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<'count' | 'date'>('count');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    loadQuestions();
  }, [page, search, sortBy, sortDir]);

  async function apiCall(endpoint: string, options?: RequestInit) {
    const token = getAuthToken();
    return fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...options,
    });
  }

  async function loadQuestions() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        sortBy,
        sortDir,
        ...(search && { search }),
      });
      const res = await apiCall(`/chatbot/admin/unmatched?${params}`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Czy na pewno chcesz usunąć to pytanie?')) return;
    try {
      const res = await apiCall(`/chatbot/admin/unmatched/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => q.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteAll() {
    if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE pytania? Tej operacji nie można cofnąć.')) return;
    try {
      const res = await apiCall('/chatbot/admin/unmatched', { method: 'DELETE' });
      if (res.ok) {
        setQuestions([]);
        setTotal(0);
        setTotalPages(1);
        setPage(1);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function toggleSort(field: 'count' | 'date') {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <MessageCircleQuestion className="w-7 h-7 text-orange-500" />
          WuBuś — Nierozpoznane pytania
        </h1>
        <p className="text-slate-400 mt-1">
          Pytania użytkowników, na które chatbot nie znalazł odpowiedzi. Użyj ich, aby
          rozszerzyć bazę FAQ.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <p className="text-xs text-slate-400">Łącznie pytań</p>
          <p className="text-2xl font-bold mt-1 text-white">{total}</p>
        </div>
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <p className="text-xs text-slate-400">Najczęściej zadawane</p>
          <p className="text-2xl font-bold mt-1 text-orange-400">
            {questions.length > 0 ? questions[0]?.count : 0}×
          </p>
        </div>
        <div className="bg-admin-card border border-admin-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Akcje</p>
            <p className="text-sm text-slate-300 mt-1">Wyczyść wszystkie</p>
          </div>
          <button
            onClick={handleDeleteAll}
            disabled={total === 0}
            className="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 disabled:opacity-30 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Szukaj pytań..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-admin-card border border-admin-border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-admin-border text-left">
              <th className="px-4 py-3 text-xs text-slate-400 font-medium">Pytanie</th>
              <th
                className="px-4 py-3 text-xs text-slate-400 font-medium cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('count')}
              >
                <span className="flex items-center gap-1">
                  Ile razy
                  <ArrowUpDown className="w-3 h-3" />
                  {sortBy === 'count' && (
                    <span className="text-orange-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
                  )}
                </span>
              </th>
              <th
                className="px-4 py-3 text-xs text-slate-400 font-medium cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('date')}
              >
                <span className="flex items-center gap-1">
                  Pierwsze pytanie
                  <ArrowUpDown className="w-3 h-3" />
                  {sortBy === 'date' && (
                    <span className="text-orange-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
                  )}
                </span>
              </th>
              <th className="px-4 py-3 text-xs text-slate-400 font-medium whitespace-nowrap">
                Ostatnio
              </th>
              <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-500">
                  Ładowanie...
                </td>
              </tr>
            ) : questions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-500">
                  <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Brak nierozpoznanych pytań 🎉
                </td>
              </tr>
            ) : (
              questions.map((q) => (
                <tr
                  key={q.id}
                  className="border-b border-admin-border/50 hover:bg-white/5 transition"
                >
                  <td className="px-4 py-3 text-sm text-white max-w-[400px] truncate">
                    {q.question}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`font-bold ${
                        q.count >= 10
                          ? 'text-red-400'
                          : q.count >= 5
                          ? 'text-orange-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {q.count}×
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDate(q.createdAt)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDate(q.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Usuń"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
          <span>
            Strona {page} z {totalPages} ({total} pytań)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-admin-card border border-admin-border hover:bg-white/5 disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg bg-admin-card border border-admin-border hover:bg-white/5 disabled:opacity-30 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
