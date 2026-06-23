'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Trash2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Bell,
  Package,
  X,
  Eye,
  Loader2,
  Check,
  Percent,
} from 'lucide-react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

interface ProductPriceMonitor {
  id: string;
  productId: string;
  alertOnIncrease: boolean;
  alertOnDecrease: boolean;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    price: number;
    lowestPrice30Days: number | null;
    images: { url: string }[];
    category?: { name: string };
  };
  alerts: ProductPriceAlert[];
}

interface ProductPriceAlert {
  id: string;
  monitorId: string;
  oldPrice: number;
  newPrice: number;
  isRead: boolean;
  createdAt: string;
  monitor?: {
    product: {
      name: string;
      sku: string;
      images: { url: string }[];
    };
  };
}

interface SearchProductResult {
  id: string;
  name: string;
  sku: string;
  price: number;
  images: { url: string }[];
}

export default function PriceMonitoringPage() {
  const { confirm, alert } = useModal();
  const [monitors, setMonitors] = useState<ProductPriceMonitor[]>([]);
  const [alerts, setAlerts] = useState<ProductPriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // B2B User state
  const [b2bUsers, setB2bUsers] = useState<Array<{ id: string; email: string; firstName: string; lastName: string; companyName: string | null }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Search Modal state
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchProductResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Fetch B2B users list
  const fetchB2bUsers = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/price-monitoring/users`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setB2bUsers(data);
      }
    } catch (err) {
      console.error('Error fetching B2B users:', err);
    }
  }, []);

  // Fetch all monitored products
  const fetchMonitors = useCallback(async () => {
    try {
      const token = getAuthToken();
      const queryParam = selectedUserId ? `?userId=${selectedUserId}` : '';
      const res = await fetch(`${API_URL}/admin/price-monitoring${queryParam}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Nie udało się pobrać monitorowanych produktów.');
      const data = await res.json();
      setMonitors(data);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Błąd pobierania danych' });
    }
  }, [selectedUserId]);

  // Fetch recent alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const token = getAuthToken();
      const queryParam = selectedUserId ? `?userId=${selectedUserId}` : '';
      const res = await fetch(`${API_URL}/admin/price-monitoring/alerts${queryParam}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Nie udało się pobrać alertów.');
      const data = await res.json();
      setAlerts(data);
    } catch (err: any) {
      console.error(err);
    }
  }, [selectedUserId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchMonitors(), fetchAlerts(), fetchB2bUsers()]);
    setLoading(false);
  }, [fetchMonitors, fetchAlerts, fetchB2bUsers]);

  useEffect(() => {
    fetchB2bUsers();
  }, [fetchB2bUsers]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMonitors(), fetchAlerts()]).finally(() => setLoading(false));
  }, [fetchMonitors, fetchAlerts]);

  // Select/Deselect all search results
  const handleSelectAllResults = () => {
    if (searchResults.length === 0) return;
    
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      const allSearchIds = searchResults.map(p => p.id);
      const areAllSelected = allSearchIds.every(id => newSet.has(id));
      
      if (areAllSelected) {
        // Deselect all from this search
        allSearchIds.forEach(id => newSet.delete(id));
      } else {
        // Select all from this search
        allSearchIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Toggle settings (alertOnIncrease / alertOnDecrease)
  const handleToggleSetting = async (productId: string, field: 'alertOnIncrease' | 'alertOnDecrease', value: boolean) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/price-monitoring/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) throw new Error('Nie udało się zapisać ustawień.');
      
      // Update state locally
      setMonitors(prev =>
        prev.map(m => (m.productId === productId ? { ...m, [field]: value } : m))
      );
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd.');
    }
  };

  // Remove product from monitoring
  const handleRemoveMonitor = async (productId: string, productName: string) => {
    if (!await confirm(`Czy na pewno chcesz usunąć produkt "${productName}" z monitorowania cen?`)) {
      return;
    }

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/price-monitoring/${productId}`, {
        method: 'DELETE',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Nie udało się usunąć produktu.');

      setMessage({ type: 'success', text: 'Produkt usunięty z monitorowania.' });
      setMonitors(prev => prev.filter(m => m.productId !== productId));
      
      // Refresh alerts log
      fetchAlerts();
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd.');
    }
  };

  // Mark all alerts as read
  const handleMarkAllAlertsRead = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/price-monitoring/alerts/read-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Błąd serwera.');

      setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
      setMessage({ type: 'success', text: 'Wszystkie alerty zostały oznaczone jako przeczytane.' });
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd.');
    }
  };

  // Search products in DB to add
  const handleSearchProducts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      const token = getAuthToken();
      
      // Use standard product list endpoint with search query
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '15',
      });
      
      const res = await fetch(`${API_URL}/products?${params}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Błąd wyszukiwania.');
      const data = await res.json();
      
      // Filter out products already monitored
      const monitoredIds = new Set(monitors.map(m => m.productId));
      const filteredResults = (data.products || []).filter((p: any) => !monitoredIds.has(p.id));
      
      setSearchResults(filteredResults);
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd podczas wyszukiwania.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Add selected products to monitoring
  const handleAddMonitors = async () => {
    if (selectedProductIds.size === 0) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/price-monitoring`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ productIds: Array.from(selectedProductIds) }),
      });

      if (!res.ok) throw new Error('Nie udało się dodać produktów.');

      setMessage({ type: 'success', text: 'Pomyślnie dodano produkty do monitorowania cen!' });
      setShowSearchModal(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedProductIds(new Set());
      
      // Reload monitors
      fetchMonitors();
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd.');
    }
  };

  // Toggle selection in search modal
  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-orange-500" />
            Monitorowanie cen
          </h1>
          <p className="text-slate-400 mt-1">
            Wybierz produkty do śledzenia cen i otrzymuj powiadomienia, gdy się zmienią.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm max-w-xs"
          >
            <option value="">Cena sugerowana (detaliczna)</option>
            {b2bUsers.map(user => (
              <option key={user.id} value={user.id}>
                {user.companyName ? `${user.companyName} (${user.firstName} ${user.lastName})` : `${user.firstName} ${user.lastName}`} - {user.email}
              </option>
            ))}
          </select>
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
            title="Odśwież dane"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSearchModal(true)}
            className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-600/10"
          >
            <Plus className="w-4 h-4" />
            Dodaj produkty
          </button>
        </div>
      </div>

      {/* Message alert */}
      {message && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm border ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid: Monitored Products Table + Alerts Side Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Monitored Products Table */}
        <div className="lg:col-span-2 bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-900/30 flex justify-between items-center">
            <h2 className="font-semibold text-white text-sm">Monitorowane produkty ({monitors.length})</h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-2" />
              <p className="text-sm">Ładowanie produktów...</p>
            </div>
          ) : monitors.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-medium">Brak monitorowanych produktów</p>
              <p className="text-xs mt-1 text-slate-500">Kliknij przycisk "Dodaj produkty", aby rozpocząć śledzenie cen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wider bg-slate-900/50 border-b border-slate-700/50">
                    <th className="px-6 py-3.5">Produkt</th>
                    <th className="px-6 py-3.5">Cena aktualna</th>
                    <th className="px-6 py-3.5">Najniższa (30 dni)</th>
                    <th className="px-6 py-3.5 text-center">Alert wzrostu</th>
                    <th className="px-6 py-3.5 text-center">Alert spadku</th>
                    <th className="px-6 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {monitors.map(monitor => {
                    const product = monitor.product;
                    return (
                      <tr key={monitor.id} className="hover:bg-slate-700/20 transition-colors">
                        {/* Product info */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-950 rounded overflow-hidden flex-shrink-0 border border-slate-700/30">
                              {product.images?.[0]?.url ? (
                                <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-5 h-5 m-2.5 text-slate-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate max-w-[200px]" title={product.name}>
                                {product.name}
                              </p>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">{product.sku}</p>
                            </div>
                          </div>
                        </td>

                        {/* Current Price */}
                        <td className="px-6 py-4">
                          <span className="text-sm font-semibold text-white">
                            {formatPrice(product.price)}
                          </span>
                        </td>

                        {/* Lowest 30 Days Price */}
                        <td className="px-6 py-4">
                          {product.lowestPrice30Days ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-slate-300">
                                {formatPrice(product.lowestPrice30Days)}
                              </span>
                              {product.price > product.lowestPrice30Days ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 flex items-center gap-0.5">
                                  <TrendingDown className="w-2.5 h-2.5" />
                                  Obniżka
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">-</span>
                          )}
                        </td>

                        {/* Alert On Increase Checkbox */}
                        <td className="px-6 py-4 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={monitor.alertOnIncrease}
                              onChange={e => handleToggleSetting(monitor.productId, 'alertOnIncrease', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600 peer-checked:after:bg-white relative"></div>
                          </label>
                        </td>

                        {/* Alert On Decrease Checkbox */}
                        <td className="px-6 py-4 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={monitor.alertOnDecrease}
                              onChange={e => handleToggleSetting(monitor.productId, 'alertOnDecrease', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600 peer-checked:after:bg-white relative"></div>
                          </label>
                        </td>

                        {/* Delete action */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/products/${product.id}`}
                              className="p-2 hover:bg-slate-700 border border-transparent hover:border-slate-600 rounded-lg text-slate-400 hover:text-white transition-all"
                              title="Pokaż produkt"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => handleRemoveMonitor(monitor.productId, product.name)}
                              className="p-2 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                              title="Usuń z monitorowania"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Price Alerts Side Log */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col h-[600px]">
          <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-900/30 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-500" />
              <h2 className="font-semibold text-white text-sm">Ostatnie alerty cenowe</h2>
            </div>
            {alerts.some(a => !a.isRead) && (
              <button
                onClick={handleMarkAllAlertsRead}
                className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
              >
                Przeczytane
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-700/40 p-1">
            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto mb-2" />
                <p className="text-xs">Wczytywanie logów...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-sm">Brak historii alertów</p>
                <p className="text-xs mt-1 text-slate-500">Wszystkie wykryte zmiany cen pojawią się w tym miejscu.</p>
              </div>
            ) : (
              alerts.map(alert => {
                const product = alert.monitor?.product;
                if (!product) return null;
                const priceDiff = Number(alert.newPrice) - Number(alert.oldPrice);
                const isPriceUp = priceDiff > 0;
                
                return (
                  <div
                    key={alert.id}
                    className={`p-4 flex items-start gap-3 hover:bg-slate-700/10 transition-colors ${
                      !alert.isRead ? 'bg-orange-500/5 border-l-2 border-orange-500' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isPriceUp ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                    }`}>
                      {isPriceUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start gap-1">
                        <p className="text-xs font-semibold text-white truncate max-w-[150px]" title={product.name}>
                          {product.name}
                        </p>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">
                          {new Date(alert.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Cena {isPriceUp ? 'wzrosła' : 'spadła'} z{' '}
                        <span className="text-slate-300 font-medium">{formatPrice(alert.oldPrice)}</span> na{' '}
                        <span className="text-white font-semibold">{formatPrice(alert.newPrice)}</span>
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-semibold ${isPriceUp ? 'text-red-400' : 'text-green-400'}`}>
                          {isPriceUp ? '+' : ''}
                          {priceDiff.toFixed(2)} zł
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">({product.sku})</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Search & Add Product Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-700 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-500" />
                Dodaj produkty do monitorowania
              </h3>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSelectedProductIds(new Set());
                }}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-4 flex flex-col flex-1 overflow-hidden space-y-4">
              {/* Search Bar */}
              <form onSubmit={handleSearchProducts} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Wpisz nazwę lub SKU (np. SKU1, SKU2...)"
                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Szukaj'}
                </button>
              </form>

              {/* Select All bar */}
              {searchResults.length > 0 && (
                <div className="flex justify-between items-center px-1 flex-shrink-0">
                  <span className="text-xs text-slate-400">Znaleziono {searchResults.length} produktów</span>
                  <button
                    type="button"
                    onClick={handleSelectAllResults}
                    className="text-xs text-orange-400 hover:text-orange-300 font-medium transition-colors"
                  >
                    {searchResults.map(p => p.id).every(id => selectedProductIds.has(id))
                      ? 'Odznacz wszystkie'
                      : 'Zaznacz wszystkie z wyników'}
                  </button>
                </div>
              )}

              {/* Search Results */}
              <div className="flex-1 overflow-y-auto border border-slate-700 bg-slate-900/30 rounded-lg divide-y divide-slate-700/50">
                {searchLoading ? (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto mb-2" />
                    <p className="text-xs">Szukanie produktów...</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    {searchQuery ? (
                      <p className="text-sm">Brak wolnych produktów spełniających kryteria</p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Wpisz słowo kluczowe powyżej i kliknij "Szukaj", aby znaleźć produkty.
                      </p>
                    )}
                  </div>
                ) : (
                  searchResults.map(product => {
                    const isSelected = selectedProductIds.has(product.id);
                    return (
                      <div
                        key={product.id}
                        onClick={() => toggleSelectProduct(product.id)}
                        className={`p-3 flex items-center justify-between hover:bg-slate-700/20 cursor-pointer transition-colors ${
                          isSelected ? 'bg-orange-500/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-slate-950 rounded overflow-hidden flex-shrink-0">
                            {product.images?.[0]?.url ? (
                              <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 m-2.5 text-slate-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate max-w-[300px]" title={product.name}>
                              {product.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{product.sku}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-xs font-bold text-white">
                            {formatPrice(product.price)}
                          </span>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-orange-600 border-orange-500 text-white'
                              : 'border-slate-600 hover:border-slate-500'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700 flex-shrink-0">
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSelectedProductIds(new Set());
                }}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleAddMonitors}
                disabled={selectedProductIds.size === 0}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                Dodaj ({selectedProductIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
