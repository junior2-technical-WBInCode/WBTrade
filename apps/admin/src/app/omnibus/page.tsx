'use client';

import { useState, useEffect } from 'react';
import {
  TrendingDown, TrendingUp, Search, BarChart3, Star, Package,
  ChevronLeft, ChevronRight, Award, ShoppingCart, Eye
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

type Tab = 'omnibus' | 'top';

interface OmnibusProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  lowestPrice30d: number | null;
  isActive: boolean;
  images: { url: string }[];
  priceHistory: {
    id: string;
    oldPrice: number;
    newPrice: number;
    changedAt: string;
    source: string;
    reason: string | null;
  }[];
}

interface OmnibusStats {
  totalProducts: number;
  productsWithHistory: number;
  priceChanges30d: number;
  productsOnSale: number;
}

interface TopData {
  topSelling: {
    productId: string;
    name: string;
    price: number;
    lowestPrice30d: number | null;
    imageUrl: string | null;
    soldQuantity: number;
    totalRevenue: number;
    orderCount: number;
  }[];
  topRated: {
    id: string;
    name: string;
    price: number;
    averageRating: number;
    images: { url: string }[];
    _count: { reviews: number };
  }[];
  topSearched: {
    query: string;
    count: number;
    product: {
      id: string;
      name: string;
      price: number;
      imageUrl: string | null;
    } | null;
  }[];
}

export default function OmnibusPage() {
  const [tab, setTab] = useState<Tab>('omnibus');
  const [products, setProducts] = useState<OmnibusProduct[]>([]);
  const [stats, setStats] = useState<OmnibusStats | null>(null);
  const [topData, setTopData] = useState<TopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('30d');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (tab === 'omnibus') {
      loadOmnibus();
      loadStats();
    } else {
      loadTopProducts();
    }
  }, [tab, page, search, period]);

  async function apiCall(endpoint: string) {
    const token = getAuthToken();
    return fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  }

  async function loadOmnibus() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
      });
      const res = await apiCall(`/admin/omnibus?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await apiCall('/admin/omnibus/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTopProducts() {
    try {
      setLoading(true);
      const res = await apiCall(`/admin/omnibus/top-products?period=${period}&limit=10`);
      if (res.ok) setTopData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const formatPrice = (p: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Number(p));

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-orange-500" />
          Omnibus & Top produkty
        </h1>
        <p className="text-slate-400 mt-1">Dyrektywa Omnibus, historia cen i najlepsze produkty</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-admin-card border border-admin-border rounded-lg p-1 w-fit">
        <button
          onClick={() => { setTab('omnibus'); setPage(1); setSearch(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'omnibus' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Omnibus
        </button>
        <button
          onClick={() => { setTab('top'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'top' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4" />
          Top produkty
        </button>
      </div>

      {/* ── OMNIBUS TAB ── */}
      {tab === 'omnibus' && (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Aktywne produkty', value: stats.totalProducts, color: 'text-white' },
                { label: 'Ze zmianą ceny (30d)', value: stats.productsWithHistory, color: 'text-orange-400' },
                { label: 'Zmiany cen (30d)', value: stats.priceChanges30d, color: 'text-blue-400' },
                { label: 'W promocji', value: stats.productsOnSale, color: 'text-green-400' },
              ].map((s) => (
                <div key={s.label} className="bg-admin-card border border-admin-border rounded-lg p-4">
                  <p className="text-xs text-slate-400">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Szukaj produktu..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-slate-400 bg-admin-card border border-admin-border rounded-lg">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                <p>Ładowanie...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-admin-card border border-admin-border rounded-lg">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Brak produktów ze zmianami cen w ostatnich 30 dniach</p>
              </div>
            ) : (
              products.map((product) => {
                const currentPrice = Number(product.price);
                const lowestPrice = product.lowestPrice30d ? Number(product.lowestPrice30d) : null;
                const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
                const isOnSale = compareAt && compareAt > currentPrice;
                const omnibusOk = lowestPrice !== null && lowestPrice <= currentPrice;

                return (
                  <div
                    key={product.id}
                    className="bg-admin-card border border-admin-border rounded-lg p-4 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Image */}
                      <a
                        href={`${WEB_URL}/products/${product.slug || product.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-blue-500 transition-all"
                        title="Otwórz stronę produktu"
                      >
                        {product.images[0] ? (
                          <img src={product.images[0].url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-slate-600" />
                          </div>
                        )}
                      </a>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">{product.name}</h3>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">Aktualna cena</p>
                            <p className="font-bold text-white">{formatPrice(currentPrice)}</p>
                          </div>
                          {compareAt && (
                            <div>
                              <p className="text-xs text-slate-500">Cena regularna</p>
                              <p className="text-slate-400 line-through">{formatPrice(compareAt)}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-slate-500">Najniższa (30d)</p>
                            <p className={`font-medium ${omnibusOk ? 'text-green-400' : 'text-red-400'}`}>
                              {lowestPrice !== null ? formatPrice(lowestPrice) : '—'}
                            </p>
                          </div>
                          {isOnSale && (
                            <div>
                              <p className="text-xs text-slate-500">Rabat</p>
                              <p className="text-orange-400 font-medium">
                                -{Math.round((1 - currentPrice / compareAt) * 100)}%
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Price history timeline */}
                        {product.priceHistory.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {product.priceHistory.slice(0, 5).map((ph) => {
                              const oldP = Number(ph.oldPrice);
                              const newP = Number(ph.newPrice);
                              const isIncrease = newP > oldP;
                              return (
                                <div
                                  key={ph.id}
                                  className={`text-[10px] px-2 py-1 rounded-full border ${
                                    isIncrease
                                      ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                      : 'border-green-500/30 bg-green-500/10 text-green-400'
                                  }`}
                                >
                                  {isIncrease ? <TrendingUp className="w-2.5 h-2.5 inline mr-1" /> : <TrendingDown className="w-2.5 h-2.5 inline mr-1" />}
                                  {formatPrice(oldP)} → {formatPrice(newP)}
                                  <span className="ml-1 opacity-60">{formatDate(ph.changedAt)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Omnibus badge */}
                      <div className="flex-shrink-0">
                        {isOnSale && (
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            omnibusOk ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {omnibusOk ? '✓ Omnibus OK' : '✗ Sprawdź cenę'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-400">Strona {page} z {totalPages} ({total} produktów)</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TOP PRODUCTS TAB ── */}
      {tab === 'top' && (
        <>
          {/* Period selector */}
          <div className="flex gap-2 mb-6">
            {[
              { value: '7d', label: '7 dni' },
              { value: '30d', label: '30 dni' },
              { value: '90d', label: '90 dni' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-admin-card border border-admin-border text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
              <p>Ładowanie...</p>
            </div>
          ) : topData ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Selling */}
              <div className="bg-admin-card border border-admin-border rounded-lg">
                <div className="p-4 border-b border-admin-border">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-green-400" />
                    Najczęściej kupowane
                  </h3>
                </div>
                <div className="divide-y divide-admin-border">
                  {topData.topSelling.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400 text-center">Brak danych</p>
                  ) : (
                    topData.topSelling.map((p, i) => (
                      <div key={p.productId} className="flex items-center gap-3 p-3 hover:bg-slate-800/30">
                        <span className="text-xs font-bold text-slate-500 w-6 text-center">#{i + 1}</span>
                        <a
                          href={`${WEB_URL}/products/${p.productId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-blue-500 transition-all"
                          title="Otwórz stronę produktu"
                        >
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-4 h-4 text-slate-600" />
                            </div>
                          )}
                        </a>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            {p.soldQuantity} szt. • {formatPrice(Number(p.totalRevenue))}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top Rated */}
              <div className="bg-admin-card border border-admin-border rounded-lg">
                <div className="p-4 border-b border-admin-border">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    Najlepiej oceniane
                  </h3>
                </div>
                <div className="divide-y divide-admin-border">
                  {topData.topRated.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400 text-center">Brak danych</p>
                  ) : (
                    topData.topRated.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 hover:bg-slate-800/30">
                        <span className="text-xs font-bold text-slate-500 w-6 text-center">#{i + 1}</span>
                        <a
                          href={`${WEB_URL}/products/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-blue-500 transition-all"
                          title="Otwórz stronę produktu"
                        >
                          {p.images[0] ? (
                            <img src={p.images[0].url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-4 h-4 text-slate-600" />
                            </div>
                          )}
                        </a>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            <span className="text-yellow-400">★ {Number(p.averageRating).toFixed(1)}</span> • {p._count.reviews} recenzji
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top Searched */}
              <div className="bg-admin-card border border-admin-border rounded-lg">
                <div className="p-4 border-b border-admin-border">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-400" />
                    Najczęściej szukane
                  </h3>
                </div>
                <div className="divide-y divide-admin-border">
                  {topData.topSearched.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400 text-center">Brak danych</p>
                  ) : (
                    topData.topSearched.map((s, i) => (
                      <div key={s.query} className="flex items-center gap-3 p-3 hover:bg-slate-800/30">
                        <span className="text-xs font-bold text-slate-500 w-6 text-center">#{i + 1}</span>
                        {s.product ? (
                          <a
                            href={`${WEB_URL}/products/${s.product.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-blue-500 transition-all"
                            title="Otwórz stronę produktu"
                          >
                            {s.product.imageUrl ? (
                              <img src={s.product.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-4 h-4 text-slate-600" />
                              </div>
                            )}
                          </a>
                        ) : (
                          <div className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                            <Search className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">"{s.query}"</p>
                          {s.product && (
                            <p className="text-xs text-slate-400 truncate">→ {s.product.name}</p>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          {s.count}x
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
