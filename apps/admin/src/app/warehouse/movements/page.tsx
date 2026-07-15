'use client';

import { useState, useEffect } from 'react';
import {
  ArrowUpDown, Search, ChevronLeft, ChevronRight, Plus,
  ArrowDown, ArrowUp, RefreshCw, Package, X, Minus, Lock, Unlock,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

const MOVEMENT_TYPES = [
  { value: 'RECEIVE', label: 'Przyjęcie', icon: ArrowDown, color: 'text-green-400', bg: 'bg-green-500/20' },
  { value: 'SHIP', label: 'Wydanie', icon: ArrowUp, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { value: 'TRANSFER', label: 'Przesunięcie', icon: RefreshCw, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { value: 'ADJUST', label: 'Korekta', icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { value: 'RESERVE', label: 'Rezerwacja', icon: Lock, color: 'text-orange-400', bg: 'bg-orange-500/20' },
  { value: 'RELEASE', label: 'Zwolnienie', icon: Unlock, color: 'text-teal-400', bg: 'bg-teal-500/20' },
];

interface Movement {
  id: string;
  variantId: string;
  type: string;
  quantity: number;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  variant: {
    sku: string | null;
    name: string;
    product: { name: string };
  };
  fromLocation: { name: string; code: string } | null;
  toLocation: { name: string; code: string } | null;
}

interface Location {
  id: string;
  name: string;
  code: string;
}

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    variantId: '', type: 'RECEIVE', quantity: 1,
    fromLocationId: '', toLocationId: '', reference: '', notes: '',
  });
  const [variantSearch, setVariantSearch] = useState('');
  const [variantResults, setVariantResults] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    loadMovements();
  }, [page, search, typeFilter]);

  async function apiCall(endpoint: string, options?: RequestInit) {
    const token = getAuthToken();
    return fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });
  }

  async function loadLocations() {
    try {
      const res = await apiCall('/admin/warehouse/locations');
      if (res.ok) setLocations(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadMovements() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        ...(search && { search }),
        ...(typeFilter && { type: typeFilter }),
      });
      const res = await apiCall(`/admin/warehouse/movements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMovements(data.movements);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function searchVariants(q: string) {
    setVariantSearch(q);
    if (q.length < 2) { setVariantResults([]); return; }
    try {
      const res = await apiCall(`/admin/warehouse/inventory?search=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setVariantResults(data.items.map((i: any) => ({
          id: i.variant.id,
          name: `${i.variant.product.name} — ${i.variant.name}`,
          sku: i.variant.sku,
        })));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function createMovement() {
    try {
      setSaving(true);
      const res = await apiCall('/admin/warehouse/movements', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowModal(false);
        setForm({ variantId: '', type: 'RECEIVE', quantity: 1, fromLocationId: '', toLocationId: '', reference: '', notes: '' });
        setSelectedVariant(null);
        setVariantSearch('');
        loadMovements();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const getMType = (t: string) => MOVEMENT_TYPES.find((m) => m.value === t) || MOVEMENT_TYPES[3];

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ArrowUpDown className="w-7 h-7 text-orange-500" />
            Ruchy magazynowe
          </h1>
          <p className="text-slate-400 mt-1">Historia przyjęć, wydań, przesunięć i korekt</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nowy ruch
        </button>
      </div>

      {/* Type filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setTypeFilter(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !typeFilter ? 'bg-orange-500 text-white' : 'bg-admin-card border border-admin-border text-slate-400 hover:text-white'
          }`}
        >
          Wszystkie
        </button>
        {MOVEMENT_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => { setTypeFilter(t.value); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              typeFilter === t.value
                ? `${t.bg} ${t.color} border border-current/20`
                : 'bg-admin-card border border-admin-border text-slate-400 hover:text-white'
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Szukaj (SKU, nazwa, referencja)..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 bg-admin-card border border-admin-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-border text-left">
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Data</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Typ</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Produkt</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Ilość</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Z → Do</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Referencja</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Notatka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                    <p>Ładowanie...</p>
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <ArrowUpDown className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Brak ruchów magazynowych</p>
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const mt = getMType(m.type);
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${mt.bg} ${mt.color}`}>
                          <mt.icon className="w-3 h-3" />
                          {mt.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-xs truncate max-w-[200px]">{m.variant.product.name}</p>
                        <p className="text-[10px] text-slate-500">{m.variant.sku || m.variant.name}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white font-medium">
                        {m.type === 'SHIP' || m.type === 'RESERVE' ? '-' : '+'}{Math.abs(m.quantity)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {m.fromLocation?.code || '—'} → {m.toLocation?.code || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{m.reference || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate">{m.notes || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-admin-border">
            <p className="text-xs text-slate-400">Strona {page} z {totalPages} ({total} ruchów)</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── New Movement Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-admin-card border border-admin-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-admin-border">
              <h2 className="text-lg font-bold text-white">Nowy ruch magazynowy</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Typ ruchu</label>
                <div className="grid grid-cols-3 gap-2">
                  {MOVEMENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setForm({ ...form, type: t.value })}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        form.type === t.value
                          ? `${t.bg} ${t.color} border-2 border-current`
                          : 'bg-slate-800 text-slate-400 border border-admin-border hover:text-white'
                      }`}
                    >
                      <t.icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Variant search */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Wariant produktu</label>
                {selectedVariant ? (
                  <div className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded-lg">
                    <div>
                      <p className="text-sm text-white">{selectedVariant.name}</p>
                      <p className="text-xs text-slate-500">{selectedVariant.sku}</p>
                    </div>
                    <button onClick={() => { setSelectedVariant(null); setForm({ ...form, variantId: '' }); setVariantSearch(''); }}
                      className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Wpisz SKU lub nazwę..."
                      value={variantSearch}
                      onChange={(e) => searchVariants(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500"
                    />
                    {variantResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-slate-800 border border-admin-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {variantResults.map((v) => (
                          <li key={v.id}>
                            <button
                              onClick={() => { setSelectedVariant(v); setForm({ ...form, variantId: v.id }); setVariantResults([]); }}
                              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700"
                            >
                              {v.name}
                              <span className="text-xs text-slate-500 ml-2">{v.sku}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Ilość</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: +e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Locations */}
              <div className="grid grid-cols-2 gap-3">
                {(form.type === 'SHIP' || form.type === 'TRANSFER' || form.type === 'RESERVE' || form.type === 'RELEASE') && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Z lokalizacji</label>
                    <select
                      value={form.fromLocationId}
                      onChange={(e) => setForm({ ...form, fromLocationId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                    >
                      <option value="">Wybierz...</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                    </select>
                  </div>
                )}
                {(form.type === 'RECEIVE' || form.type === 'TRANSFER' || form.type === 'ADJUST') && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Do lokalizacji</label>
                    <select
                      value={form.toLocationId}
                      onChange={(e) => setForm({ ...form, toLocationId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                    >
                      <option value="">Wybierz...</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Referencja (opcjonalnie)</label>
                <input
                  type="text"
                  placeholder="np. numer zamówienia, PZ/001..."
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Notatka (opcjonalnie)</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-admin-border">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Anuluj
              </button>
              <button
                onClick={createMovement}
                disabled={!form.variantId || !form.quantity || saving}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Zapisywanie...' : 'Utwórz ruch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
