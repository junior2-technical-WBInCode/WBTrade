'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Percent, ArrowLeft, Save, Eye, Loader2, Search,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PreviewItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  currentPrice: number;
  newPrice: number;
  discountPercent: number;
}

interface FormData {
  name: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'MULTIPLIER';
  discountValue: string;
  roundTo99: boolean;
  startsAt: string;
  endsAt: string;
  scope: 'ALL' | 'CATEGORY' | 'WAREHOUSE' | 'SELECTED' | 'TAG';
  scopeValue: string[];
  stackableWithCoupons: boolean;
}

const discountTypeOptions = [
  { value: 'PERCENTAGE', label: 'Procentowy (%)', placeholder: 'np. 20 = -20%' },
  { value: 'FIXED_AMOUNT', label: 'Kwota stała (zł)', placeholder: 'np. 50 = -50 zł' },
  { value: 'MULTIPLIER', label: 'Mnożnik (×)', placeholder: 'np. 0.8 = 80% ceny' },
];

const warehouseOptions = [
  { value: 'leker', label: 'Chynów (Leker)' },
  { value: 'hp', label: 'Zielona Góra (HP)' },
  { value: 'btp', label: 'Chotów (BTP)' },
  { value: 'outlet', label: 'Rzeszów (Outlet)' },
];

function toLocalDatetime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().slice(0, 16);
}

export default function EditSaleCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    loadCampaign();
    loadCategories();
  }, [params.id]);

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

  async function loadCampaign() {
    try {
      setLoading(true);
      const res = await apiCall(`/admin/sale-campaigns/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status !== 'DRAFT' && data.status !== 'SCHEDULED') {
          router.push(`/sale-campaigns/${params.id}`);
          return;
        }
        setForm({
          name: data.name,
          description: data.description || '',
          discountType: data.discountType,
          discountValue: String(data.discountValue),
          roundTo99: data.roundTo99,
          startsAt: toLocalDatetime(data.startsAt),
          endsAt: toLocalDatetime(data.endsAt),
          scope: data.scope,
          scopeValue: data.scopeValue || [],
          stackableWithCoupons: data.stackableWithCoupons,
        });
      } else {
        router.push('/sale-campaigns');
      }
    } catch (error) {
      console.error('Failed to load campaign:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const res = await apiCall('/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || data || []);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }

  async function loadPreview() {
    if (!form?.discountValue) return;
    try {
      setPreviewLoading(true);
      const res = await apiCall(`/admin/sale-campaigns/${params.id}/preview`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPreview(data.items);
        setPreviewTotal(data.totalProducts);
      }
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function searchProducts(query: string) {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    try {
      const res = await apiCall(`/products?search=${encodeURIComponent(query)}&limit=10&status=ACTIVE`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.products || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  }

  async function handleSave() {
    if (!form) return;
    if (!form.name.trim()) { setError('Nazwa kampanii jest wymagana'); return; }
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) { setError('Wartość rabatu jest wymagana'); return; }

    try {
      setSaving(true);
      setError('');
      const res = await apiCall(`/admin/sale-campaigns/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          discountType: form.discountType,
          discountValue: parseFloat(form.discountValue),
          roundTo99: form.roundTo99,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
          scope: form.scope,
          scopeValue: form.scopeValue,
          stackableWithCoupons: form.stackableWithCoupons,
        }),
      });

      if (res.ok) {
        router.push(`/sale-campaigns/${params.id}`);
      } else {
        const data = await res.json();
        setError(data.message || 'Błąd aktualizacji kampanii');
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/sale-campaigns/${params.id}`} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Edytuj kampanię</h1>
          <p className="text-sm text-gray-400 mt-0.5">{form.name}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info */}
          <div className="bg-admin-card border border-admin-border rounded-lg p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Informacje podstawowe</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Nazwa kampanii *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => f ? { ...f, name: e.target.value } : f)}
                className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Opis</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => f ? { ...f, description: e.target.value } : f)}
                rows={2}
                className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>
          </div>

          {/* Discount */}
          <div className="bg-admin-card border border-admin-border rounded-lg p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Konfiguracja rabatu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Typ rabatu</label>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm(f => f ? { ...f, discountType: e.target.value as any } : f)}
                  className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  {discountTypeOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Wartość rabatu *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.discountValue}
                  onChange={(e) => setForm(f => f ? { ...f, discountValue: e.target.value } : f)}
                  placeholder={discountTypeOptions.find(o => o.value === form.discountType)?.placeholder}
                  className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.roundTo99}
                onChange={(e) => setForm(f => f ? { ...f, roundTo99: e.target.checked } : f)}
                className="rounded border-admin-border bg-admin-bg text-orange-500 focus:ring-orange-500"
              />
              Zaokrąglaj ceny do ,99
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.stackableWithCoupons}
                onChange={(e) => setForm(f => f ? { ...f, stackableWithCoupons: e.target.checked } : f)}
                className="rounded border-admin-border bg-admin-bg text-orange-500 focus:ring-orange-500"
              />
              Cena promocyjna łączy się z kuponami rabatowymi
            </label>
          </div>

          {/* Scope */}
          <div className="bg-admin-card border border-admin-border rounded-lg p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Zakres produktów</h2>
            <select
              value={form.scope}
              onChange={(e) => setForm(f => f ? { ...f, scope: e.target.value as any, scopeValue: [] } : f)}
              className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">Wszystkie aktywne produkty</option>
              <option value="CATEGORY">Według kategorii</option>
              <option value="WAREHOUSE">Według magazynu</option>
              <option value="SELECTED">Wybrane produkty</option>
              <option value="TAG">Według tagu</option>
            </select>

            {form.scope === 'CATEGORY' && (
              <div className="space-y-1 max-h-48 overflow-y-auto bg-admin-bg border border-admin-border rounded-lg p-2">
                {categories.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer p-1 rounded hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={form.scopeValue.includes(cat.id)}
                      onChange={(e) => {
                        setForm(f => f ? {
                          ...f,
                          scopeValue: e.target.checked
                            ? [...f.scopeValue, cat.id]
                            : f.scopeValue.filter(id => id !== cat.id),
                        } : f);
                      }}
                      className="rounded border-admin-border bg-admin-bg text-orange-500"
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            )}

            {form.scope === 'WAREHOUSE' && (
              <div className="space-y-1">
                {warehouseOptions.map(wh => (
                  <label key={wh.value} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer p-1">
                    <input
                      type="checkbox"
                      checked={form.scopeValue.includes(wh.value)}
                      onChange={(e) => {
                        setForm(f => f ? {
                          ...f,
                          scopeValue: e.target.checked
                            ? [...f.scopeValue, wh.value]
                            : f.scopeValue.filter(v => v !== wh.value),
                        } : f);
                      }}
                      className="rounded border-admin-border bg-admin-bg text-orange-500"
                    />
                    {wh.label}
                  </label>
                ))}
              </div>
            )}

            {form.scope === 'SELECTED' && (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); searchProducts(e.target.value); }}
                    placeholder="Szukaj po nazwie lub SKU..."
                    className="w-full bg-admin-bg border border-admin-border rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-1 bg-admin-bg border border-admin-border rounded-lg max-h-40 overflow-y-auto">
                    {searchResults.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (!form.scopeValue.includes(p.id)) {
                            setForm(f => f ? { ...f, scopeValue: [...f.scopeValue, p.id] } : f);
                          }
                          setProductSearch('');
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 border-b border-admin-border/30 last:border-0"
                      >
                        <span className="text-white">{p.name}</span>
                        <span className="text-gray-500 ml-2 text-xs">{p.sku}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.scopeValue.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-400">Wybrane ({form.scopeValue.length}):</p>
                    {form.scopeValue.map(id => (
                      <div key={id} className="flex items-center justify-between bg-admin-bg border border-admin-border/50 rounded px-2 py-1 text-xs">
                        <span className="text-gray-300 truncate">{id}</span>
                        <button
                          onClick={() => setForm(f => f ? { ...f, scopeValue: f.scopeValue.filter(v => v !== id) } : f)}
                          className="text-red-400 hover:text-red-300 ml-2"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {form.scope === 'TAG' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Tagi (po przecinku)</label>
                <input
                  type="text"
                  value={form.scopeValue.join(', ')}
                  onChange={(e) => setForm(f => f ? { ...f, scopeValue: e.target.value.split(',').map(t => t.trim()).filter(Boolean) } : f)}
                  placeholder="np. outlet, promocja"
                  className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="bg-admin-card border border-admin-border rounded-lg p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Harmonogram</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Data rozpoczęcia</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm(f => f ? { ...f, startsAt: e.target.value } : f)}
                  className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Data zakończenia</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm(f => f ? { ...f, endsAt: e.target.value } : f)}
                  className="w-full bg-admin-bg border border-admin-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-admin-card border border-admin-border rounded-lg p-5 space-y-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </button>
          </div>

          <div className="bg-admin-card border border-admin-border rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-400" />
                Podgląd cen
              </h3>
              <button
                onClick={loadPreview}
                disabled={previewLoading}
                className="text-xs text-orange-400 hover:text-orange-300 disabled:text-gray-500"
              >
                {previewLoading ? 'Ładowanie...' : 'Oblicz'}
              </button>
            </div>

            {preview.length > 0 ? (
              <>
                <p className="text-xs text-gray-400">Dotyczy {previewTotal} produktów:</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {preview.map((item, i) => (
                    <div key={i} className="bg-admin-bg rounded-lg p-2 text-xs">
                      <p className="text-gray-300 truncate font-medium">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-500 line-through">{item.currentPrice.toFixed(2)} zł</span>
                        <span className="text-orange-400 font-bold">{item.newPrice.toFixed(2)} zł</span>
                        <span className="text-green-400 text-[10px]">-{item.discountPercent}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Kliknij &quot;Oblicz&quot; aby zobaczyć podgląd.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
