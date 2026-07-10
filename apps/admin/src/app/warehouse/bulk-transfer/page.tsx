'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowRightLeft, Package, Search, Check, X, AlertTriangle,
  ChevronDown, Loader2, CheckCircle2, XCircle, ArrowRight, Boxes,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface SkuPrefix {
  prefix: string;
  count: number;
}

interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
}

interface PreviewItem {
  inventoryId: string;
  variantId: string;
  sku: string;
  variantName: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  reserved: number;
  available: number;
}

interface PreviewData {
  items: PreviewItem[];
  totalItems: number;
  totalQuantity: number;
  totalAvailable: number;
}

interface TransferResult {
  variantId: string;
  sku: string;
  quantity: number;
  status: 'ok' | 'error';
  error?: string;
}

interface TransferResponse {
  reference: string;
  totalItems: number;
  success: number;
  errors: number;
  results: TransferResult[];
}

type Step = 'config' | 'preview' | 'transferring' | 'done';

export default function BulkTransferPage() {
  // Data
  const [locations, setLocations] = useState<Location[]>([]);
  const [skuPrefixes, setSkuPrefixes] = useState<SkuPrefix[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [transferResult, setTransferResult] = useState<TransferResponse | null>(null);

  // Form
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [customPrefix, setCustomPrefix] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // UI
  const [step, setStep] = useState<Step>('config');
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLocations();
    loadSkuPrefixes();
  }, []);

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
      if (res.ok) {
        const data = await res.json();
        setLocations(data.filter((l: Location) => l.isActive));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSkuPrefixes() {
    try {
      const res = await apiCall('/admin/warehouse/sku-prefixes');
      if (res.ok) setSkuPrefixes(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  const activePrefix = customPrefix || selectedPrefix;

  const loadPreview = useCallback(async () => {
    if (!activePrefix || !fromLocationId) return;
    setLoadingPreview(true);
    setError('');
    try {
      const params = new URLSearchParams({ skuPrefix: activePrefix, fromLocationId });
      const res = await apiCall(`/admin/warehouse/bulk-transfer/preview?${params}`);
      if (res.ok) {
        const data: PreviewData = await res.json();
        setPreview(data);
        // Select all by default
        setSelectedItems(new Set(data.items.map((i) => i.variantId)));
        setStep('preview');
      } else {
        const err = await res.json();
        setError(err.error || 'Błąd podglądu');
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoadingPreview(false);
    }
  }, [activePrefix, fromLocationId]);

  async function executeTransfer() {
    if (!fromLocationId || !toLocationId || selectedItems.size === 0 || !preview) return;

    setStep('transferring');
    setError('');
    try {
      const items = preview.items
        .filter((i) => selectedItems.has(i.variantId))
        .map((i) => ({ variantId: i.variantId, quantity: i.available }));

      const res = await apiCall('/admin/warehouse/bulk-transfer', {
        method: 'POST',
        body: JSON.stringify({
          fromLocationId,
          toLocationId,
          items,
          notes: `Masowy transfer SKU: ${activePrefix}`,
        }),
      });

      if (res.ok) {
        const data: TransferResponse = await res.json();
        setTransferResult(data);
        setStep('done');
      } else {
        const err = await res.json();
        setError(err.error || 'Błąd transferu');
        setStep('preview');
      }
    } catch {
      setError('Błąd połączenia z serwerem');
      setStep('preview');
    }
  }

  function resetAll() {
    setStep('config');
    setPreview(null);
    setTransferResult(null);
    setSelectedItems(new Set());
    setError('');
  }

  function toggleItem(variantId: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  function toggleAll() {
    if (!preview) return;
    if (selectedItems.size === preview.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(preview.items.map((i) => i.variantId)));
    }
  }

  const fromLocation = locations.find((l) => l.id === fromLocationId);
  const toLocation = locations.find((l) => l.id === toLocationId);

  return (
    <div className="p-3 sm:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ArrowRightLeft className="w-7 h-7 text-orange-500" />
          Masowy transfer produktów
        </h1>
        <p className="text-slate-400 mt-1">
          Przenieś wiele produktów między magazynami na podstawie prefiksu SKU
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── STEP 1: CONFIG ── */}
      {(step === 'config' || step === 'preview') && (
        <div className="space-y-4">
          {/* Locations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-admin-card border border-admin-border rounded-lg p-4">
              <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">
                Lokalizacja źródłowa (Z)
              </label>
              <select
                value={fromLocationId}
                onChange={(e) => {
                  setFromLocationId(e.target.value);
                  if (step === 'preview') { setStep('config'); setPreview(null); }
                }}
                className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="">Wybierz magazyn źródłowy...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id === toLocationId}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-admin-card border border-admin-border rounded-lg p-4">
              <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">
                Lokalizacja docelowa (DO)
              </label>
              <select
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="">Wybierz magazyn docelowy...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id === fromLocationId}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SKU Prefix selection */}
          <div className="bg-admin-card border border-admin-border rounded-lg p-4">
            <label className="block text-xs text-slate-400 mb-3 uppercase tracking-wider">
              Prefiks SKU (hurtownia)
            </label>

            {/* Quick select prefixes */}
            <div className="flex flex-wrap gap-2 mb-3">
              {skuPrefixes.map((p) => (
                <button
                  key={p.prefix}
                  onClick={() => {
                    setSelectedPrefix(selectedPrefix === p.prefix ? '' : p.prefix);
                    setCustomPrefix('');
                    if (step === 'preview') { setStep('config'); setPreview(null); }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedPrefix === p.prefix && !customPrefix
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-800 text-slate-300 border border-admin-border hover:border-orange-500/50 hover:text-white'
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5" />
                  {p.prefix}
                  <span className="text-xs opacity-60">({p.count})</span>
                </button>
              ))}
              {skuPrefixes.length === 0 && (
                <p className="text-sm text-slate-500">Ładowanie prefiksów...</p>
              )}
            </div>

            {/* Custom prefix */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">lub wpisz własny:</span>
              <input
                type="text"
                placeholder="np. HP-"
                value={customPrefix}
                onChange={(e) => {
                  setCustomPrefix(e.target.value);
                  setSelectedPrefix('');
                  if (step === 'preview') { setStep('config'); setPreview(null); }
                }}
                className="w-40 px-3 py-1.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Preview button */}
          {step === 'config' && (
            <button
              onClick={loadPreview}
              disabled={!activePrefix || !fromLocationId || loadingPreview}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loadingPreview ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Pokaż produkty do przeniesienia
            </button>
          )}
        </div>
      )}

      {/* ── STEP 2: PREVIEW ── */}
      {step === 'preview' && preview && (
        <div className="mt-6">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-400">
                Znaleziono: <span className="text-white font-bold">{preview.totalItems}</span> pozycji
              </span>
              <span className="text-slate-400">
                Ilość: <span className="text-green-400 font-bold">{preview.totalAvailable}</span> dostępnych
              </span>
              <span className="text-slate-400">
                Zaznaczono: <span className="text-orange-400 font-bold">{selectedItems.size}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setStep('config'); setPreview(null); }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-admin-border rounded-lg transition-colors"
              >
                ← Wróć
              </button>
              <button
                onClick={toggleAll}
                className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 border border-admin-border rounded-lg hover:text-white transition-colors"
              >
                {selectedItems.size === preview.items.length ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
              </button>
            </div>
          </div>

          {preview.items.length === 0 ? (
            <div className="text-center py-12 bg-admin-card border border-admin-border rounded-lg">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">Brak produktów z prefiksem <span className="font-mono text-white">{activePrefix}</span> w tej lokalizacji</p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-admin-border text-left">
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedItems.size === preview.items.length}
                            onChange={toggleAll}
                            className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-xs text-slate-400 font-medium">Produkt</th>
                        <th className="px-4 py-3 text-xs text-slate-400 font-medium">SKU</th>
                        <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Ilość</th>
                        <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Zarezerwowane</th>
                        <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Do przeniesienia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-border">
                      {preview.items.map((item) => (
                        <tr
                          key={item.variantId}
                          onClick={() => toggleItem(item.variantId)}
                          className={`cursor-pointer transition-colors ${
                            selectedItems.has(item.variantId)
                              ? 'bg-orange-500/5 hover:bg-orange-500/10'
                              : 'hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.variantId)}
                              onChange={() => toggleItem(item.variantId)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-800 rounded overflow-hidden flex-shrink-0">
                                {item.productImage ? (
                                  <img src={item.productImage} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="w-4 h-4 text-slate-600" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-white font-medium truncate max-w-[250px]">{item.productName}</p>
                                <p className="text-xs text-slate-500">{item.variantName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">{item.sku}</td>
                          <td className="px-4 py-3 text-right text-white font-medium">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-yellow-400">{item.reserved}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${item.available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {item.available}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Transfer action */}
              <div className="mt-4 bg-admin-card border border-orange-500/30 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 uppercase">Z</p>
                      <p className="text-white font-medium">{fromLocation?.name || '—'}</p>
                      <p className="text-xs text-slate-500 font-mono">{fromLocation?.code}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-orange-500" />
                    <div className="text-center">
                      <p className="text-xs text-slate-500 uppercase">Do</p>
                      <p className="text-white font-medium">{toLocation?.name || '—'}</p>
                      <p className="text-xs text-slate-500 font-mono">{toLocation?.code}</p>
                    </div>
                    <div className="ml-4 pl-4 border-l border-admin-border">
                      <p className="text-xs text-slate-500">Pozycji do przeniesienia</p>
                      <p className="text-orange-400 font-bold text-lg">{selectedItems.size}</p>
                    </div>
                  </div>

                  <button
                    onClick={executeTransfer}
                    disabled={!toLocationId || selectedItems.size === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Przenieś {selectedItems.size} pozycji
                  </button>
                </div>

                {!toLocationId && (
                  <p className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Wybierz lokalizację docelową powyżej
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 3: TRANSFERRING ── */}
      {step === 'transferring' && (
        <div className="mt-8 text-center py-16 bg-admin-card border border-admin-border rounded-lg">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-orange-500 animate-spin" />
          <p className="text-white text-lg font-medium">Przenoszenie produktów...</p>
          <p className="text-slate-400 mt-1 text-sm">
            Przetwarzanie {selectedItems.size} pozycji — nie zamykaj strony
          </p>
        </div>
      )}

      {/* ── STEP 4: DONE ── */}
      {step === 'done' && transferResult && (
        <div className="mt-6 space-y-4">
          {/* Summary */}
          <div className={`p-6 rounded-lg border ${
            transferResult.errors === 0
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-yellow-500/10 border-yellow-500/30'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              {transferResult.errors === 0 ? (
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-yellow-400" />
              )}
              <div>
                <h2 className="text-white text-lg font-bold">
                  {transferResult.errors === 0 ? 'Transfer zakończony pomyślnie!' : 'Transfer zakończony z błędami'}
                </h2>
                <p className="text-slate-400 text-sm">Referencja: <span className="font-mono text-slate-300">{transferResult.reference}</span></p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{transferResult.totalItems}</p>
                <p className="text-xs text-slate-400 mt-1">Łącznie pozycji</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{transferResult.success}</p>
                <p className="text-xs text-slate-400 mt-1">Przeniesionych</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${transferResult.errors > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                  {transferResult.errors}
                </p>
                <p className="text-xs text-slate-400 mt-1">Błędów</p>
              </div>
            </div>
          </div>

          {/* Results table */}
          <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-admin-border text-left">
                    <th className="px-4 py-3 text-xs text-slate-400 font-medium">Status</th>
                    <th className="px-4 py-3 text-xs text-slate-400 font-medium">SKU</th>
                    <th className="px-4 py-3 text-xs text-slate-400 font-medium text-right">Ilość</th>
                    <th className="px-4 py-3 text-xs text-slate-400 font-medium">Szczegóły</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border">
                  {transferResult.results.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2.5">
                        {r.status === 'ok' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Błąd
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{r.sku}</td>
                      <td className="px-4 py-2.5 text-right text-white font-medium">{r.quantity}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action */}
          <div className="flex gap-3">
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Nowy transfer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
