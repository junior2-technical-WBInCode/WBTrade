'use client';

import { useState, useEffect } from 'react';
import {
  Warehouse, Package, AlertTriangle, ArrowUpDown, Search,
  ChevronLeft, ChevronRight, Edit2, Check, X, MapPin, TrendingDown,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface InventoryItem {
  id: string;
  variantId: string;
  locationId: string;
  quantity: number;
  reserved: number;
  minimum: number;
  updatedAt: string;
  variant: {
    id: string;
    sku: string | null;
    name: string;
    product: { id: string; name: string; slug: string; images: { url: string }[] };
  };
  location: { id: string; name: string; code: string; type: string };
}

interface Stats {
  totalLocations: number;
  activeLocations: number;
  totalInventoryRows: number;
  lowStockCount: number;
  movements7d: number;
  totalQuantity: number;
  totalReserved: number;
}

interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
}

export default function WarehousePage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ quantity: 0, reserved: 0, minimum: 0 });

  useEffect(() => {
    loadStats();
    loadLocations();
  }, []);

  useEffect(() => {
    loadInventory();
  }, [page, search, locationFilter, lowStockOnly]);

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

  async function loadStats() {
    try {
      const res = await apiCall('/admin/warehouse/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadLocations() {
    try {
      const res = await apiCall('/admin/warehouse/locations?includeInactive=true');
      if (res.ok) setLocations(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadInventory() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        ...(search && { search }),
        ...(locationFilter && { locationId: locationFilter }),
        ...(lowStockOnly && { lowStock: 'true' }),
      });
      const res = await apiCall(`/admin/warehouse/inventory?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(id: string) {
    try {
      const res = await apiCall(`/admin/warehouse/inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        setEditingId(null);
        loadInventory();
        loadStats();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setEditValues({ quantity: item.quantity, reserved: item.reserved, minimum: item.minimum });
  }

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Warehouse className="w-7 h-7 text-orange-500" />
          Magazyn (WMS)
        </h1>
        <p className="text-slate-400 mt-1">Stan magazynowy, ruchy i lokalizacje</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: 'Lokalizacje', value: stats.activeLocations, color: 'text-blue-400' },
            { label: 'Pozycje', value: stats.totalInventoryRows, color: 'text-white' },
            { label: 'Łączna ilość', value: stats.totalQuantity, color: 'text-green-400' },
            { label: 'Zarezerwowane', value: stats.totalReserved, color: 'text-yellow-400' },
            { label: 'Dostępne', value: stats.totalQuantity - stats.totalReserved, color: 'text-emerald-400' },
            { label: 'Niski stan', value: stats.lowStockCount, color: stats.lowStockCount > 0 ? 'text-red-400' : 'text-green-400' },
            { label: 'Ruchy (7d)', value: stats.movements7d, color: 'text-purple-400' },
          ].map((s) => (
            <div key={s.label} className="bg-admin-card border border-admin-border rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value.toLocaleString('pl-PL')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Szukaj (SKU, nazwa)..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-admin-card border border-admin-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 text-sm"
          />
        </div>
        <select
          value={locationFilter}
          onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
          className="bg-admin-card border border-admin-border rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
        >
          <option value="">Wszystkie lokalizacje</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
          ))}
        </select>
        <button
          onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            lowStockOnly
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-admin-card text-slate-400 border border-admin-border hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Niski stan
        </button>
      </div>

      {/* Inventory table */}
      <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-border text-left">
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Produkt / Wariant</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">SKU</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Lokalizacja</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Ilość</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Zarezerwowane</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Dostępne</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Minimum</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-center">Status</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                    <p>Ładowanie...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Brak pozycji magazynowych</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const available = item.quantity - item.reserved;
                  const isLow = item.quantity <= item.minimum;
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-800 rounded overflow-hidden flex-shrink-0">
                            {item.variant.product.images[0] ? (
                              <img src={item.variant.product.images[0].url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-4 h-4 text-slate-600" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate max-w-[200px]">{item.variant.product.name}</p>
                            <p className="text-xs text-slate-500">{item.variant.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{item.variant.sku || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                          <MapPin className="w-3 h-3" />
                          {item.location.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input type="number" value={editValues.quantity} onChange={(e) => setEditValues({ ...editValues, quantity: +e.target.value })}
                            className="w-16 bg-slate-800 border border-orange-500 rounded px-2 py-1 text-white text-right text-xs" />
                        ) : (
                          <span className="text-white font-medium">{item.quantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input type="number" value={editValues.reserved} onChange={(e) => setEditValues({ ...editValues, reserved: +e.target.value })}
                            className="w-16 bg-slate-800 border border-orange-500 rounded px-2 py-1 text-white text-right text-xs" />
                        ) : (
                          <span className="text-yellow-400">{item.reserved}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={available <= 0 ? 'text-red-400 font-bold' : 'text-green-400'}>{available}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input type="number" value={editValues.minimum} onChange={(e) => setEditValues({ ...editValues, minimum: +e.target.value })}
                            className="w-16 bg-slate-800 border border-orange-500 rounded px-2 py-1 text-white text-right text-xs" />
                        ) : (
                          <span className="text-slate-400">{item.minimum}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                            <TrendingDown className="w-3 h-3" /> Niski
                          </span>
                        ) : (
                          <span className="inline-flex text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => saveEdit(item.id)} className="p-1 text-green-400 hover:bg-green-500/20 rounded">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(item)} className="p-1 text-slate-400 hover:text-orange-400 rounded hover:bg-slate-700">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-admin-border">
            <p className="text-xs text-slate-400">Strona {page} z {totalPages} ({total} pozycji)</p>
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
    </div>
  );
}
