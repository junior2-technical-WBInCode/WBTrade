'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Star, Search, Filter, Trash2, MessageSquare, Check, X,
  ChevronLeft, ChevronRight, Eye, EyeOff, Send, RotateCcw,
  TrendingUp, Clock, ThumbsUp
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface ReviewUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface ReviewProduct {
  id: string;
  name: string;
  slug: string;
  images?: { url: string; alt?: string }[];
}

interface Review {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  title: string | null;
  content: string;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  adminReply: string | null;
  adminReplyAt: string | null;
  adminReplyBy: string | null;
  createdAt: string;
  updatedAt: string;
  user: ReviewUser;
  product: ReviewProduct;
  images: { id: string; url: string; alt?: string }[];
}

interface ReviewStats {
  total: number;
  approved: number;
  rejected: number;
  withReply: number;
  withoutReply: number;
  averageRating: number;
  distribution: Record<number, number>;
  recentCount: number;
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}
        />
      ))}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-admin-card border border-admin-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function ReviewsPage() {
  const { confirm } = useModal();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [replyFilter, setReplyFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Reply modal state
  const [replyModal, setReplyModal] = useState<{ review: Review; mode: 'reply' | 'edit' } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySaving, setReplySaving] = useState(false);

  // Expanded review detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sort: sortBy,
      });
      if (search) params.set('search', search);
      if (ratingFilter) params.set('rating', ratingFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (replyFilter) params.set('hasReply', replyFilter);

      const res = await fetch(`${API_URL}/admin/reviews?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      setReviews(data.reviews);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error('Error loading reviews:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, ratingFilter, statusFilter, replyFilter, sortBy]);

  const fetchStats = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/reviews/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Fetch failed');
      setStats(await res.json());
    } catch (err) {
      console.error('Error loading review stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Actions ──

  const toggleApproval = async (reviewId: string, approve: boolean) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/reviews/${reviewId}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isApproved: approve }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchReviews();
      fetchStats();
    } catch (err) {
      console.error('Error toggling approval:', err);
    }
  };

  const deleteReview = async (reviewId: string) => {
    const ok = await confirm({
      message: 'Czy na pewno chcesz usunąć tę opinię? Ta operacja jest nieodwracalna.',
      title: 'Usuń opinię',
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      fetchReviews();
      fetchStats();
    } catch (err) {
      console.error('Error deleting review:', err);
    }
  };

  const submitReply = async () => {
    if (!replyModal || !replyText.trim()) return;
    setReplySaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/reviews/${replyModal.review.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed');
      }
      setReplyModal(null);
      setReplyText('');
      fetchReviews();
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'Nie udało się zapisać odpowiedzi');
    } finally {
      setReplySaving(false);
    }
  };

  const removeReply = async (reviewId: string) => {
    const ok = await confirm({
      message: 'Czy na pewno chcesz usunąć odpowiedź administratora?',
      title: 'Usuń odpowiedź',
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/reviews/${reviewId}/reply`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      fetchReviews();
      fetchStats();
    } catch (err) {
      console.error('Error removing reply:', err);
    }
  };

  const openReplyModal = (review: Review) => {
    setReplyModal({ review, mode: review.adminReply ? 'edit' : 'reply' });
    setReplyText(review.adminReply || '');
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUserName = (user: ReviewUser) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    return user.email;
  };

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, ratingFilter, statusFilter, replyFilter, sortBy]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Star className="text-yellow-400" size={28} />
          Zarządzanie opiniami
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Przeglądaj, moderuj i odpowiadaj na opinie klientów
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Wszystkie opinie"
            value={stats.total}
            icon={Star}
            color="bg-blue-500/10 text-blue-400"
          />
          <StatCard
            label="Średnia ocena"
            value={stats.averageRating > 0 ? `${stats.averageRating} / 5` : '—'}
            icon={TrendingUp}
            color="bg-yellow-500/10 text-yellow-400"
          />
          <StatCard
            label="Bez odpowiedzi"
            value={stats.withoutReply}
            icon={MessageSquare}
            color="bg-orange-500/10 text-orange-400"
          />
          <StatCard
            label="Nowe (7 dni)"
            value={stats.recentCount}
            icon={Clock}
            color="bg-green-500/10 text-green-400"
          />
        </div>
      )}

      {/* Rating distribution bar */}
      {stats && stats.total > 0 && (
        <div className="bg-admin-card border border-admin-border rounded-xl p-4 mb-6">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Rozkład ocen</h3>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((r) => {
              const count = stats.distribution[r] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={r} className="flex items-center gap-3">
                  <button
                    onClick={() => setRatingFilter(ratingFilter === String(r) ? '' : String(r))}
                    className={`flex items-center gap-1 min-w-[60px] text-sm transition-colors ${
                      ratingFilter === String(r) ? 'text-yellow-400 font-semibold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r} <Star size={12} className="fill-yellow-400 text-yellow-400" />
                  </button>
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 min-w-[50px] text-right">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-admin-card border border-admin-border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po treści, produkcie, użytkowniku..."
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
          >
            <option value="">Wszystkie statusy</option>
            <option value="approved">Zatwierdzone</option>
            <option value="rejected">Odrzucone</option>
          </select>

          {/* Reply filter */}
          <select
            value={replyFilter}
            onChange={(e) => setReplyFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
          >
            <option value="">Odpowiedzi: wszystkie</option>
            <option value="yes">Z odpowiedzią</option>
            <option value="no">Bez odpowiedzi</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
          >
            <option value="newest">Najnowsze</option>
            <option value="oldest">Najstarsze</option>
            <option value="highest">Najwyższe oceny</option>
            <option value="lowest">Najniższe oceny</option>
            <option value="helpful">Najbardziej pomocne</option>
          </select>

          {/* Clear filters */}
          {(search || ratingFilter || statusFilter || replyFilter || sortBy !== 'newest') && (
            <button
              onClick={() => {
                setSearch('');
                setRatingFilter('');
                setStatusFilter('');
                setReplyFilter('');
                setSortBy('newest');
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw size={14} />
              Resetuj
            </button>
          )}
        </div>
      </div>

      {/* Reviews list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Star size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Brak opinii</p>
          <p className="text-sm mt-1">Nie znaleziono opinii pasujących do wybranych filtrów</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const isExpanded = expandedId === review.id;
            return (
              <div
                key={review.id}
                className="bg-admin-card border border-admin-border rounded-xl overflow-hidden"
              >
                {/* Main row */}
                <div className="p-4 flex items-start gap-4">
                  {/* Product image */}
                  <div className="w-12 h-12 rounded-lg bg-slate-800 flex-shrink-0 overflow-hidden">
                    {review.product.images?.[0] ? (
                      <img
                        src={review.product.images[0].url}
                        alt={review.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Star size={20} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StarRating rating={review.rating} size={14} />
                          {review.title && (
                            <span className="text-sm font-semibold text-white">{review.title}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-400">
                            {getUserName(review.user)}
                          </span>
                          <span className="text-xs text-slate-600">•</span>
                          <span className="text-xs text-slate-500">
                            {formatDate(review.createdAt)}
                          </span>
                          {review.isVerifiedPurchase && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">
                              Zweryfikowany zakup
                            </span>
                          )}
                          {!review.isApproved && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">
                              Odrzucona
                            </span>
                          )}
                          {review.adminReply && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                              Odpowiedziano
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openReplyModal(review)}
                          className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-blue-400 transition-colors"
                          title={review.adminReply ? 'Edytuj odpowiedź' : 'Odpowiedz'}
                        >
                          <MessageSquare size={16} />
                        </button>
                        {review.isApproved ? (
                          <button
                            onClick={() => toggleApproval(review.id, false)}
                            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-red-400 transition-colors"
                            title="Odrzuć opinię"
                          >
                            <EyeOff size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleApproval(review.id, true)}
                            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-green-400 transition-colors"
                            title="Zatwierdź opinię"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteReview(review.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-red-400 transition-colors"
                          title="Usuń opinię"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Review text */}
                    <p className={`text-sm text-slate-300 mt-1 ${!isExpanded && 'line-clamp-2'}`}>
                      {review.content}
                    </p>

                    {/* Product link */}
                    <p className="text-xs text-slate-500 mt-1.5">
                      Produkt: <span className="text-slate-400">{review.product.name}</span>
                    </p>

                    {/* Helpful counts */}
                    {(review.helpfulCount > 0 || review.notHelpfulCount > 0) && (
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <ThumbsUp size={11} /> {review.helpfulCount} pomocne
                        </span>
                      </div>
                    )}

                    {/* Expand/collapse button */}
                    {review.content.length > 150 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : review.id)}
                        className="text-xs text-orange-400 hover:text-orange-300 mt-1"
                      >
                        {isExpanded ? 'Zwiń' : 'Rozwiń pełną treść'}
                      </button>
                    )}

                    {/* Admin reply preview */}
                    {review.adminReply && (
                      <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-blue-400">
                            Odpowiedź {review.adminReplyBy || 'Admin'}
                          </span>
                          <div className="flex items-center gap-1">
                            {review.adminReplyAt && (
                              <span className="text-[10px] text-slate-500">
                                {formatDate(review.adminReplyAt)}
                              </span>
                            )}
                            <button
                              onClick={() => removeReply(review.id)}
                              className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-red-400 transition-colors"
                              title="Usuń odpowiedź"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-slate-300">{review.adminReply}</p>
                      </div>
                    )}

                    {/* Review images */}
                    {review.images && review.images.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {review.images.map((img) => (
                          <img
                            key={img.id}
                            src={img.url}
                            alt={img.alt || ''}
                            className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 px-2">
          <span className="text-sm text-slate-400">
            Wyświetlono {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} z {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-white min-w-[80px] text-center">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {replyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setReplyModal(null)} />
          <div className="relative bg-admin-card border border-admin-border rounded-2xl w-full max-w-xl shadow-2xl">
            <div className="p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-400" />
                {replyModal.mode === 'edit' ? 'Edytuj odpowiedź' : 'Odpowiedz na opinię'}
              </h2>

              {/* Original review */}
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <StarRating rating={replyModal.review.rating} size={12} />
                  <span className="text-xs text-slate-400">
                    {getUserName(replyModal.review.user)}
                  </span>
                </div>
                {replyModal.review.title && (
                  <p className="text-sm font-medium text-white mb-0.5">{replyModal.review.title}</p>
                )}
                <p className="text-sm text-slate-300 line-clamp-4">{replyModal.review.content}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Produkt: {replyModal.review.product.name}
                </p>
              </div>

              {/* Reply textarea */}
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                Twoja odpowiedź
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Napisz odpowiedź na opinię klienta..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 resize-none"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-500">
                  {replyText.length} / 2000 znaków
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setReplyModal(null);
                    setReplyText('');
                  }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={submitReply}
                  disabled={replySaving || replyText.trim().length < 2}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={14} />
                  {replySaving ? 'Zapisywanie...' : replyModal.mode === 'edit' ? 'Zaktualizuj' : 'Wyślij odpowiedź'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
