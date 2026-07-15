'use client';

import { useState, useEffect } from 'react';
import {
  MapPin, Plus, Edit2, Trash2, X, Check, Warehouse,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
  createdAt: string;
  _count: { inventory: number };
}

export default function LocationsPage() {
  const { alert } = useModal();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', isActive: true });

  useEffect(() => {
    loadLocations();
  }, [showInactive]);

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
      setLoading(true);
      const res = await apiCall(`/admin/warehouse/locations?includeInactive=${showInactive}`);
      if (res.ok) setLocations(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveLocation() {
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/admin/warehouse/locations/${editingId}` : '/admin/warehouse/locations';
      const res = await apiCall(url, { method, body: JSON.stringify(form) });
      if (res.ok) {
        closeModal();
        loadLocations();
      } else {
        const err = await res.json();
        await alert(err.error || 'Błąd');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteLocation(id: string) {
    try {
      const res = await apiCall(`/admin/warehouse/locations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        loadLocations();
      } else {
        const err = await res.json();
        await alert(err.error || 'Błąd');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function openEdit(loc: Location) {
    setEditingId(loc.id);
    setForm({ name: loc.name, code: loc.code, isActive: loc.isActive });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm({ name: '', code: '', isActive: true });
  }

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Warehouse className="w-7 h-7 text-orange-500" />
            Magazyny
          </h1>
          <p className="text-slate-400 mt-1">Zarządzaj lokalizacjami magazynowymi</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              showInactive
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-admin-card text-slate-400 border border-admin-border hover:text-white'
            }`}
          >
            {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Nieaktywne
          </button>
          <button
            onClick={() => { setEditingId(null); setForm({ name: '', code: '', isActive: true }); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nowa lokalizacja
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <p className="text-xs text-slate-400">Łącznie magazynów</p>
          <p className="text-2xl font-bold mt-1 text-blue-400">{locations.length}</p>
        </div>
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <p className="text-xs text-slate-400">Aktywne</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{locations.filter(l => l.isActive).length}</p>
        </div>
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <p className="text-xs text-slate-400">Łącznie pozycji</p>
          <p className="text-2xl font-bold mt-1 text-white">{locations.reduce((sum, l) => sum + l._count.inventory, 0)}</p>
        </div>
      </div>

      {/* Location list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 bg-admin-card border border-admin-border rounded-lg">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
          <p>Ładowanie...</p>
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-admin-card border border-admin-border rounded-lg">
          <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Brak magazynów</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className={`bg-admin-card border rounded-lg p-4 transition-colors ${
                loc.isActive ? 'border-admin-border hover:border-slate-600' : 'border-red-500/20 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-medium">{loc.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{loc.code}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  Magazyn
                </span>
              </div>

              <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                <span>{loc._count.inventory} pozycji</span>
                {!loc.isActive && <span className="text-red-400">Nieaktywny</span>}
              </div>

              <div className="flex gap-1 mt-3">
                <button
                  onClick={() => openEdit(loc)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-orange-400 bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                >
                  <Edit2 className="w-3 h-3" /> Edytuj
                </button>
                {loc._count.inventory === 0 && (
                  deleteConfirm === loc.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => deleteLocation(loc.id)}
                        className="px-2 py-1.5 text-xs text-red-400 bg-red-500/20 rounded hover:bg-red-500/30">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1.5 text-xs text-slate-400 bg-slate-800 rounded hover:bg-slate-700">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(loc.id)}
                      className="px-2 py-1.5 text-xs text-slate-400 hover:text-red-400 bg-slate-800 rounded hover:bg-slate-700 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-admin-card border border-admin-border rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-admin-border">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Edytuj magazyn' : 'Nowy magazyn'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nazwa</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="np. Magazyn główny"
                  className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Kod (unikalny)</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="np. MAG-01"
                  className="w-full px-3 py-2 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-admin-border bg-slate-800"
                />
                <label className="text-sm text-slate-300">Aktywna</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-admin-border">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Anuluj
              </button>
              <button
                onClick={saveLocation}
                disabled={!form.name || !form.code}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {editingId ? 'Zapisz' : 'Utwórz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
