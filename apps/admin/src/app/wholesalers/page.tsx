'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, X, Check, Package, ExternalLink,
  ToggleLeft, ToggleRight, Upload, DollarSign, RefreshCw, ChevronDown,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

interface BaselinkerInventory {
  inventory_id: number;
  name: string;
  is_default?: boolean;
}

interface Wholesaler {
  id: string;
  key: string;
  name: string;
  baselinkerInventoryId: string | null;
  prefix: string;
  skuPrefix: string | null;
  location: string | null;
  hideLocation: boolean;
  warehouseDisplayName: string | null;
  aliases: string[];
  color: string;
  isActive: boolean;
  skipInSync: boolean;
  hasPriceRules: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface WholesalerForm {
  key: string;
  name: string;
  baselinkerInventoryId: string;
  prefix: string;
  skuPrefix: string;
  location: string;
  hideLocation: boolean;
  warehouseDisplayName: string;
  aliases: string;
  color: string;
  isActive: boolean;
  skipInSync: boolean;
  hasPriceRules: boolean;
  sortOrder: number;
}

const EMPTY_FORM: WholesalerForm = {
  key: '',
  name: '',
  baselinkerInventoryId: '',
  prefix: '',
  skuPrefix: '',
  location: '',
  hideLocation: false,
  warehouseDisplayName: '',
  aliases: '',
  color: '#6b7280',
  isActive: true,
  skipInSync: false,
  hasPriceRules: false,
  sortOrder: 0,
};

export default function WholesalersPage() {
  const { alert } = useModal();
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WholesalerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inventories, setInventories] = useState<BaselinkerInventory[]>([]);
  const [loadingInventories, setLoadingInventories] = useState(false);

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

  const loadWholesalers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall('/admin/wholesalers');
      if (res.ok) {
        const data = await res.json();
        setWholesalers(data);
      }
    } catch (err) {
      console.error('Failed to load wholesalers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWholesalers();
  }, [loadWholesalers]);

  async function loadInventories() {
    setLoadingInventories(true);
    try {
      const res = await apiCall('/admin/baselinker/inventories');
      if (res.ok) {
        const data = await res.json();
        setInventories(data.inventories || []);
      }
    } catch (err) {
      console.error('Failed to load inventories:', err);
    } finally {
      setLoadingInventories(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
    loadInventories();
  }

  function openEdit(w: Wholesaler) {
    setEditingId(w.id);
    setForm({
      key: w.key,
      name: w.name,
      baselinkerInventoryId: w.baselinkerInventoryId || '',
      prefix: w.prefix,
      skuPrefix: w.skuPrefix || '',
      location: w.location || '',
      hideLocation: w.hideLocation === true,
      warehouseDisplayName: w.warehouseDisplayName || '',
      aliases: w.aliases.join(', '),
      color: w.color,
      isActive: w.isActive,
      skipInSync: w.skipInSync,
      hasPriceRules: w.hasPriceRules,
      sortOrder: w.sortOrder,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.key || !form.name) {
      setError('Klucz i nazwa są wymagane');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(form.key)) {
      setError('Klucz może zawierać tylko małe litery, cyfry i myślniki');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const body = {
        key: form.key.toLowerCase(),
        name: form.name,
        baselinkerInventoryId: form.baselinkerInventoryId || null,
        prefix: form.prefix,
        skuPrefix: form.skuPrefix || null,
        location: form.location || null,
        hideLocation: form.hideLocation,
        warehouseDisplayName: form.warehouseDisplayName || null,
        aliases: form.aliases ? form.aliases.split(',').map(a => a.trim()).filter(Boolean) : [],
        color: form.color,
        isActive: form.isActive,
        skipInSync: form.skipInSync,
        hasPriceRules: form.hasPriceRules,
        sortOrder: form.sortOrder,
      };

      const url = editingId ? `/admin/wholesalers/${editingId}` : '/admin/wholesalers';
      const method = editingId ? 'PUT' : 'POST';

      const res = await apiCall(url, {
        method,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowModal(false);
        loadWholesalers();
      } else {
        const data = await res.json();
        setError(data.message || 'Błąd zapisu');
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Czy na pewno chcesz dezaktywować tę hurtownię?');
    if (!confirmed) return;

    try {
      const res = await apiCall(`/admin/wholesalers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadWholesalers();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  async function handleToggleActive(w: Wholesaler) {
    try {
      const res = await apiCall(`/admin/wholesalers/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      if (res.ok) {
        loadWholesalers();
      }
    } catch (err) {
      console.error('Failed to toggle:', err);
    }
  }

  // Auto-generate key from name
  function handleNameChange(name: string) {
    setForm(prev => ({
      ...prev,
      name,
      ...(editingId ? {} : {
        key: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        prefix: name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' : '',
        skuPrefix: name ? name.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '') + '-' : '',
      }),
    }));
  }

  // Handle inventory selection from dropdown
  function handleInventorySelect(inventoryIdStr: string) {
    if (!inventoryIdStr) {
      setForm(prev => ({ ...prev, baselinkerInventoryId: '' }));
      return;
    }
    const inv = inventories.find(i => String(i.inventory_id) === inventoryIdStr);
    if (!inv) return;

    const invName = inv.name.trim();
    const key = invName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    setForm(prev => ({
      ...prev,
      baselinkerInventoryId: String(inv.inventory_id),
      ...(editingId ? {} : {
        name: invName,
        key,
        prefix: key + '-',
        skuPrefix: key.toUpperCase() + '-',
      }),
    }));
  }

  // Auto-generate warehouse display name from location
  function handleLocationChange(location: string) {
    setForm(prev => ({
      ...prev,
      location,
      warehouseDisplayName: location ? `Magazyn ${location}` : '',
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hurtownie</h1>
          <p className="text-sm text-gray-500 mt-1">
            Zarządzaj hurtowniami z Baselinkera — prefixy, ID, cennik, lokalizacje
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Dodaj hurtownię
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{wholesalers.length}</div>
          <div className="text-sm text-gray-500">Wszystkie</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{wholesalers.filter(w => w.isActive).length}</div>
          <div className="text-sm text-gray-500">Aktywne</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{wholesalers.filter(w => w.hasPriceRules).length}</div>
          <div className="text-sm text-gray-500">Z regułami cenowymi</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-orange-600">{wholesalers.filter(w => w.skipInSync).length}</div>
          <div className="text-sm text-gray-500">Pomijane w sync</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hurtownia</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Key</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Prefix</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">SKU Prefix</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Baselinker ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Lokalizacja</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {wholesalers.map(w => (
                <tr key={w.id} className={`hover:bg-gray-50 ${!w.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: w.color }}
                      />
                      <span className="font-medium text-gray-900">{w.name}</span>
                      {w.aliases.length > 0 && (
                        <span className="text-xs text-gray-400">
                          ({w.aliases.join(', ')})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded">{w.key}</code>
                  </td>
                  <td className="px-4 py-3">
                    {w.prefix ? (
                      <code className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{w.prefix}</code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {w.skuPrefix ? (
                      <code className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{w.skuPrefix}</code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {w.baselinkerInventoryId ? (
                      <code className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded">{w.baselinkerInventoryId}</code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex items-center gap-1.5">
                      {w.location || <span className="text-gray-400">—</span>}
                      {w.hideLocation && w.location && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800" title="Lokalizacja ukryta na stronie sklepu">
                          ukryta
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {w.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Aktywna
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Nieaktywna
                        </span>
                      )}
                      {w.hasPriceRules && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          <DollarSign className="w-3 h-3 mr-0.5" />
                          Cennik
                        </span>
                      )}
                      {w.skipInSync && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                          Skip sync
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(w)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edytuj"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(w)}
                        className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
                        title={w.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                      >
                        {w.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      {w.hasPriceRules && (
                        <a
                          href="/pricing"
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Reguły cenowe"
                        >
                          <DollarSign className="w-4 h-4" />
                        </a>
                      )}
                      {w.baselinkerInventoryId && (
                        <a
                          href={`/baselinker/import?inventoryId=${w.baselinkerInventoryId}`}
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                          title="Importuj produkty"
                        >
                          <Upload className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(w.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Dezaktywuj"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {wholesalers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    Brak hurtowni. Kliknij &quot;Dodaj hurtownię&quot; aby rozpocząć.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edytuj hurtownię' : 'Nowa hurtownia'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Step 1: Select Baselinker inventory */}
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Katalog Baselinker <span className="text-red-500">*</span>
                  </label>
                  {loadingInventories ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-500">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Ładowanie katalogów z Baselinkera...
                    </div>
                  ) : (
                    <select
                      value={form.baselinkerInventoryId}
                      onChange={e => handleInventorySelect(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                    >
                      <option value="">— Wybierz katalog —</option>
                      {inventories
                        .filter(inv => !wholesalers.some(w => w.baselinkerInventoryId === String(inv.inventory_id)))
                        .map(inv => (
                          <option key={inv.inventory_id} value={String(inv.inventory_id)} className="text-gray-900">
                            {inv.name.trim()} (ID: {inv.inventory_id})
                          </option>
                        ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Wybierz katalog — nazwa, key i prefix uzupełnią się automatycznie.
                    {inventories.length > 0 && ` Dostępnych: ${inventories.filter(inv => !wholesalers.some(w => w.baselinkerInventoryId === String(inv.inventory_id))).length} z ${inventories.length}`}
                  </p>
                </div>
              )}

              {/* Row 1: Name + Key */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nazwa <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="np. Leker"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Klucz (key) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.key}
                    onChange={e => setForm(p => ({ ...p, key: e.target.value.toLowerCase() }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="np. leker"
                  />
                </div>
              </div>

              {/* Row 2: Prefix + SKU Prefix */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prefix
                  </label>
                  <input
                    type="text"
                    value={form.prefix}
                    onChange={e => setForm(p => ({ ...p, prefix: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="np. leker-"
                  />
                  <p className="text-xs text-gray-400 mt-1">Dodawany do baselinkerProductId</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU Prefix
                  </label>
                  <input
                    type="text"
                    value={form.skuPrefix}
                    onChange={e => setForm(p => ({ ...p, skuPrefix: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="np. LEKER-"
                  />
                </div>
              </div>

              {/* Row 3: Location + Display name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lokalizacja (miasto)
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={e => handleLocationChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="np. Chynów"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nazwa wyświetlana
                  </label>
                  <input
                    type="text"
                    value={form.warehouseDisplayName}
                    onChange={e => setForm(p => ({ ...p, warehouseDisplayName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="np. Magazyn Chynów"
                  />
                </div>
              </div>

              {/* Row 4: Color + Aliases */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kolor
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.color}
                      onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                      placeholder="#6b7280"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Aliasy
                  </label>
                  <input
                    type="text"
                    value={form.aliases}
                    onChange={e => setForm(p => ({ ...p, aliases: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="np. forcetop, hurtownia przemysłowa"
                  />
                  <p className="text-xs text-gray-400 mt-1">Alternatywne nazwy, oddzielone przecinkami</p>
                </div>
              </div>

              {/* Baselinker ID (read-only in create, editable in edit) */}
              {editingId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Baselinker Inventory ID
                    </label>
                    <input
                      type="text"
                      value={form.baselinkerInventoryId}
                      onChange={e => setForm(p => ({ ...p, baselinkerInventoryId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kolejność (sort order)
                    </label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min={0}
                    />
                  </div>
                </div>
              )}

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Aktywna</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasPriceRules}
                    onChange={e => setForm(p => ({ ...p, hasPriceRules: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Reguły cenowe</span>
                  <span className="text-xs text-gray-400">(pojawi się w cenniku)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.skipInSync}
                    onChange={e => setForm(p => ({ ...p, skipInSync: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Pomijaj w sync</span>
                  <span className="text-xs text-gray-400">(stock/price sync)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hideLocation}
                    onChange={e => setForm(p => ({ ...p, hideLocation: e.target.checked }))}
                    className="w-4 h-4 text-amber-600 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Ukryj lokalizację na stronie</span>
                  <span className="text-xs text-gray-400">(filtr magazynów i karty produktów)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingId ? 'Zapisz zmiany' : 'Dodaj hurtownię'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
