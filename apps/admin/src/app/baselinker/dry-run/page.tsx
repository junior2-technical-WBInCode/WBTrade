'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Package,
  Loader2,
  ArrowLeft,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Database,
  Tag,
  Image as ImageIcon,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface BaselinkerInventory {
  inventory_id: number;
  name: string;
  description: string;
}

interface DryRunProduct {
  baselinkerProductId: string;
  name: string;
  sku: string;
  ean: string | null;
  rawPrice: number;
  finalPrice: number;
  quantity: number;
  categoryId: number | null;
  categoryName: string | null;
  tags: string[];
  imageCount: number;
  variantCount: number;
  existsInDb: boolean;
}

interface DryRunResult {
  success: boolean;
  inventoryName: string;
  inventoryId: string;
  warehouseKey: string | null;
  prefix: string;
  skuPrefix: string;
  totalInBaselinker: number;
  fetchedCount: number;
  alreadyInDb: number;
  products: DryRunProduct[];
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export default function DryRunPage() {
  const { token } = useAuth();

  const [inventories, setInventories] = useState<BaselinkerInventory[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [loadingInventories, setLoadingInventories] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [filterText, setFilterText] = useState('');
  const [showOnlyNew, setShowOnlyNew] = useState(false);

  const loadInventories = useCallback(async () => {
    if (!token) return;
    setLoadingInventories(true);
    try {
      const response = await apiRequest<{ inventories: BaselinkerInventory[] }>(
        '/admin/baselinker/inventories',
        { method: 'GET' },
        token
      );
      setInventories(response.inventories);
    } catch (err) {
      console.error('Failed to load inventories:', err);
      setError('Nie udało się pobrać listy magazynów. Sprawdź konfigurację Baselinker.');
    } finally {
      setLoadingInventories(false);
    }
  }, [token]);

  useEffect(() => {
    loadInventories();
  }, [loadInventories]);

  const handleDryRun = async () => {
    if (!token || !selectedInventoryId) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiRequest<DryRunResult>(
        '/admin/baselinker/dry-run',
        {
          method: 'POST',
          body: JSON.stringify({
            inventoryId: selectedInventoryId,
            limit,
          }),
        },
        token
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = result?.products.filter(p => {
    const matchesText = !filterText ||
      p.name.toLowerCase().includes(filterText.toLowerCase()) ||
      p.sku.toLowerCase().includes(filterText.toLowerCase()) ||
      p.baselinkerProductId.toLowerCase().includes(filterText.toLowerCase());
    const matchesNew = !showOnlyNew || !p.existsInDb;
    return matchesText && matchesNew;
  }) || [];

  const selectedInventory = inventories.find(
    inv => inv.inventory_id.toString() === selectedInventoryId
  );

  const exportToCsv = () => {
    if (!filteredProducts.length) return;
    const headers = ['ID Baselinker', 'Nazwa', 'SKU', 'EAN', 'Cena hurtowa', 'Cena końcowa', 'Stan', 'Kategoria', 'Tagi', 'Zdjęcia', 'Warianty', 'W bazie'];
    const rows = filteredProducts.map(p => [
      p.baselinkerProductId,
      `"${p.name.replace(/"/g, '""')}"`,
      p.sku,
      p.ean || '',
      p.rawPrice.toFixed(2),
      p.finalPrice.toFixed(2),
      p.quantity,
      `"${p.tags.join(', ')}"`,
      p.imageCount,
      p.variantCount,
      p.existsInDb ? 'TAK' : 'NIE',
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dry-run-${selectedInventory?.name || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/baselinker"
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Podgląd hurtowni (Dry Run)</h1>
            <p className="text-gray-400 mt-1">
              Pobierz produkty z dowolnego magazynu Baselinker bez zapisu do bazy danych
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Błąd</p>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Eye className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">Parametry podglądu</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Inventory selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Magazyn / Hurtownia
            </label>
            {loadingInventories ? (
              <div className="flex items-center gap-2 text-gray-400 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                Ładowanie magazynów...
              </div>
            ) : (
              <select
                value={selectedInventoryId}
                onChange={(e) => setSelectedInventoryId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
              >
                <option value="">Wybierz magazyn...</option>
                {inventories.map((inv) => (
                  <option key={inv.inventory_id} value={inv.inventory_id.toString()}>
                    {inv.name} (ID: {inv.inventory_id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Liczba produktów (max 1000)
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 1000))}
              min={1}
              max={1000}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
            />
          </div>

          {/* Action button */}
          <div className="flex items-end">
            <button
              onClick={handleDryRun}
              disabled={loading || !selectedInventoryId}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Pobieranie...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Pobierz podgląd
                </>
              )}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              <div>
                <p className="text-purple-300 font-medium">Trwa pobieranie produktów z Baselinker...</p>
                <p className="text-purple-400/70 text-sm mt-1">
                  To może zająć chwilę w zależności od ilości produktów w magazynie.
                  Dane NIE zostaną zapisane do bazy.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Wyniki: {result.inventoryName}
              </h2>
              <button
                onClick={exportToCsv}
                disabled={filteredProducts.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Eksportuj CSV
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-xs mb-1">W Baselinker (ogółem)</p>
                <p className="text-white text-xl font-bold">{result.totalInBaselinker.toLocaleString('pl-PL')}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-xs mb-1">Pobrano (podgląd)</p>
                <p className="text-white text-xl font-bold">{result.fetchedCount}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-xs mb-1">Już w bazie</p>
                <p className="text-yellow-400 text-xl font-bold">{result.alreadyInDb}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-xs mb-1">Nowych</p>
                <p className="text-green-400 text-xl font-bold">{result.fetchedCount - result.alreadyInDb}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-xs mb-1">Prefiks / Magazyn</p>
                <p className="text-white text-sm font-mono">{result.prefix || '(brak)'} / {result.warehouseKey || 'główny'}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Szukaj po nazwie, SKU lub ID..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none text-sm"
                />
              </div>
              <button
                onClick={() => setShowOnlyNew(!showOnlyNew)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  showOnlyNew
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Tylko nowe ({result.fetchedCount - result.alreadyInDb})
              </button>
            </div>
          </div>

          {/* Product table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">#</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">ID BL</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Nazwa</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">SKU</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">EAN</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Cena hurtowa</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Cena końcowa</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Stan</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Kategoria</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                      <ImageIcon className="w-4 h-4 inline" />
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                      <Layers className="w-4 h-4 inline" />
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Tagi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                        {filterText || showOnlyNew
                          ? 'Brak produktów pasujących do filtrów'
                          : 'Brak danych'}
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product, index) => (
                      <tr
                        key={product.baselinkerProductId}
                        className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-gray-500 text-sm">{index + 1}</td>
                        <td className="px-4 py-2.5">
                          {product.existsInDb ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                              <Database className="w-3 h-3" />
                              W bazie
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Nowy
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 text-sm font-mono">
                          {product.baselinkerProductId}
                        </td>
                        <td className="px-4 py-2.5 text-white text-sm max-w-xs truncate" title={product.name}>
                          {product.name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 text-sm font-mono">
                          {product.sku}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-sm font-mono">
                          {product.ean || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-sm">
                          {product.rawPrice > 0 ? `${product.rawPrice.toFixed(2)} zł` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-white text-sm font-medium">
                          {product.finalPrice > 0 ? (
                            <span className={product.rawPrice !== product.finalPrice ? 'text-purple-400' : ''}>
                              {product.finalPrice.toFixed(2)} zł
                            </span>
                          ) : (
                            <span className="text-red-400">0.00 zł</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <span className={product.quantity > 0 ? 'text-green-400' : 'text-red-400'}>
                            {product.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-sm max-w-[200px] truncate" title={product.categoryName || ''}>
                          {product.categoryName || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-sm text-center">
                          {product.imageCount}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-sm text-center">
                          {product.variantCount}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {product.tags.slice(0, 3).map((tag, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-700 text-gray-300"
                              >
                                <Tag className="w-3 h-3" />
                                {tag}
                              </span>
                            ))}
                            {product.tags.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{product.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredProducts.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
                Wyświetlono {filteredProducts.length} z {result.fetchedCount} produktów
                {(filterText || showOnlyNew) && ' (filtrowane)'}
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-1">To jest tylko podgląd (dry run)</p>
              <p>
                Żadne dane nie zostały zapisane do bazy. Aby zaimportować produkty z tego magazynu,
                użyj strony{' '}
                <Link href="/baselinker/import" className="underline hover:text-blue-200">
                  Import produktów
                </Link>{' '}
                lub przycisków synchronizacji na stronie{' '}
                <Link href="/baselinker" className="underline hover:text-blue-200">
                  Baselinker
                </Link>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
