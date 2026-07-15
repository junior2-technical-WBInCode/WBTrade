'use client';

import { useState, useEffect } from 'react';
import {
  Ticket, Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight,
  Calendar, Hash, Percent, DollarSign, Truck, Copy, Check, X,
  Filter, ChevronLeft, ChevronRight, CheckSquare, Square, Archive,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  value: number;
  minimumAmount: number | null;
  maximumUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  couponSource: string;
  requiresAuth: boolean;
  singleUsePerUser: boolean;
  restrictedToEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CouponStats {
  total: number;
  active: number;
  expired: number;
  inactive: number;
  totalUsed: number;
}

interface CouponFormData {
  code: string;
  description: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  value: string;
  minimumAmount: string;
  maximumUses: string;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  couponSource: string;
  requiresAuth: boolean;
  singleUsePerUser: boolean;
}

const emptyForm: CouponFormData = {
  code: '',
  description: '',
  type: 'PERCENTAGE',
  value: '',
  minimumAmount: '',
  maximumUses: '',
  startsAt: '',
  expiresAt: '',
  isActive: true,
  couponSource: 'MANUAL',
  requiresAuth: false,
  singleUsePerUser: false,
};

const typeLabels: Record<string, { label: string; icon: any; color: string }> = {
  PERCENTAGE: { label: 'Procentowy', icon: Percent, color: 'text-blue-400 bg-blue-400/10' },
  FIXED_AMOUNT: { label: 'Kwotowy', icon: DollarSign, color: 'text-green-400 bg-green-400/10' },
  FREE_SHIPPING: { label: 'Darmowa dostawa', icon: Truck, color: 'text-purple-400 bg-purple-400/10' },
};

const sourceLabels: Record<string, string> = {
  MANUAL: 'Ręczny',
  WELCOME_DISCOUNT: 'Powitalny',
  REFERRAL: 'Polecenie',
  CAMPAIGN: 'Kampania',
  NEWSLETTER: 'Newsletter',
  DELIVERY_DELAY: 'Opóźnienie dostawy',
};

export default function CouponsPage() {
  const { confirm } = useModal();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [stats, setStats] = useState<CouponStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Selection & Bulk ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === coupons.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(coupons.map(c => c.id)));
    }
  };

  const handleBulkToggle = async (isActive: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const response = await apiCall('/admin/coupons/bulk-toggle', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds), isActive }),
      });
      if (response.ok) {
        const data = await response.json();
        showToast(data.message || `${isActive ? 'Aktywowano' : 'Dezaktywowano'} ${selectedIds.size} kuponów`);
        setSelectedIds(new Set());
        loadCoupons(); loadStats();
      } else {
        showToast('Błąd masowej operacji', 'error');
      }
    } catch { showToast('Błąd masowej operacji', 'error'); }
    finally { setBulkLoading(false); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Czy na pewno chcesz usunąć ${selectedIds.size} kuponów?`)) return;
    setBulkLoading(true);
    try {
      const response = await apiCall('/admin/coupons/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (response.ok) {
        const data = await response.json();
        showToast(data.message || `Usunięto ${selectedIds.size} kuponów`);
        setSelectedIds(new Set());
        loadCoupons(); loadStats();
      } else {
        showToast('Błąd masowego usuwania', 'error');
      }
    } catch { showToast('Błąd masowego usuwania', 'error'); }
    finally { setBulkLoading(false); }
  };

  useEffect(() => {
    loadCoupons();
    loadStats();
    setSelectedIds(new Set());
  }, [page, search, statusFilter, typeFilter]);

  async function apiCall(endpoint: string, options?: RequestInit) {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });
    return response;
  }

  async function loadCoupons() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { type: typeFilter }),
      });
      const response = await apiCall(`/admin/coupons?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCoupons(data.coupons);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Failed to load coupons:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const response = await apiCall('/admin/coupons/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  function openCreateModal() {
    setEditingCoupon(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEditModal(coupon: Coupon) {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description || '',
      type: coupon.type,
      value: coupon.value.toString(),
      minimumAmount: coupon.minimumAmount?.toString() || '',
      maximumUses: coupon.maximumUses?.toString() || '',
      startsAt: coupon.startsAt ? new Date(coupon.startsAt).toISOString().slice(0, 16) : '',
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : '',
      isActive: coupon.isActive,
      couponSource: coupon.couponSource,
      requiresAuth: coupon.requiresAuth,
      singleUsePerUser: coupon.singleUsePerUser,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.value) {
      setError('Kod kuponu i wartość są wymagane');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        code: form.code.trim(),
        description: form.description || null,
        type: form.type,
        value: form.value,
        minimumAmount: form.minimumAmount || null,
        maximumUses: form.maximumUses || null,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        isActive: form.isActive,
        couponSource: form.couponSource,
        requiresAuth: form.requiresAuth,
        singleUsePerUser: form.singleUsePerUser,
      };

      const response = editingCoupon
        ? await apiCall(`/admin/coupons/${editingCoupon.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiCall('/admin/coupons', { method: 'POST', body: JSON.stringify(payload) });

      if (response.ok) {
        setShowModal(false);
        loadCoupons();
        loadStats();
      } else {
        const data = await response.json();
        setError(data.message || 'Błąd podczas zapisywania');
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(coupon: Coupon) {
    try {
      const response = await apiCall(`/admin/coupons/${coupon.id}/toggle`, { method: 'PATCH' });
      if (response.ok) {
        loadCoupons();
        loadStats();
      }
    } catch (error) {
      console.error('Failed to toggle coupon:', error);
    }
  }

  async function handleDelete(coupon: Coupon) {
    if (!await confirm(`Czy na pewno chcesz usunąć kupon "${coupon.code}"?`)) return;
    try {
      const response = await apiCall(`/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      if (response.ok) {
        loadCoupons();
        loadStats();
      }
    } catch (error) {
      console.error('Failed to delete coupon:', error);
    }
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'WB-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setForm(prev => ({ ...prev, code }));
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const isExpired = (coupon: Coupon) =>
    coupon.expiresAt && new Date(coupon.expiresAt) < new Date();

  const isMaxedOut = (coupon: Coupon) =>
    coupon.maximumUses && coupon.usedCount >= coupon.maximumUses;

  const getCouponStatus = (coupon: Coupon) => {
    if (!coupon.isActive) return { label: 'Nieaktywny', color: 'bg-slate-500/20 text-slate-400' };
    if (isExpired(coupon)) return { label: 'Wygasły', color: 'bg-red-500/20 text-red-400' };
    if (isMaxedOut(coupon)) return { label: 'Wyczerpany', color: 'bg-yellow-500/20 text-yellow-400' };
    return { label: 'Aktywny', color: 'bg-green-500/20 text-green-400' };
  };

  const getValueDisplay = (coupon: Coupon) => {
    if (coupon.type === 'PERCENTAGE') return `${coupon.value}%`;
    if (coupon.type === 'FREE_SHIPPING') return 'Darmowa dostawa';
    return formatPrice(coupon.value);
  };

  return (
    <div className="p-6">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${
          toast.type === 'success'
            ? 'bg-green-500/20 border-green-500/30 text-green-400'
            : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70"><X className="w-3 h-3" /></button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Ticket className="w-7 h-7 text-orange-500" />
            Kupony i rabaty
          </h1>
          <p className="text-slate-400 mt-1">Zarządzaj kodami rabatowymi i promocjami</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nowy kupon
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Wszystkie', value: stats.total, color: 'text-white' },
            { label: 'Aktywne', value: stats.active, color: 'text-green-400' },
            { label: 'Wygasłe', value: stats.expired, color: 'text-red-400' },
            { label: 'Nieaktywne', value: stats.inactive, color: 'text-slate-400' },
            { label: 'Użycia łącznie', value: stats.totalUsed, color: 'text-orange-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Szukaj po kodzie lub opisie..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="">Wszystkie statusy</option>
          <option value="active">Aktywne</option>
          <option value="inactive">Nieaktywne</option>
          <option value="expired">Wygasłe</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="">Wszystkie typy</option>
          <option value="PERCENTAGE">Procentowy</option>
          <option value="FIXED_AMOUNT">Kwotowy</option>
          <option value="FREE_SHIPPING">Darmowa dostawa</option>
        </select>
      </div>

      {/* Bulk Actions Bar */}
      <div className={`overflow-hidden transition-all duration-300 mb-6 ${selectedIds.size > 0 ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-orange-300 font-medium">
              Zaznaczono: {selectedIds.size} {selectedIds.size === 1 ? 'kupon' : selectedIds.size < 5 ? 'kupony' : 'kuponów'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => handleBulkToggle(true)} disabled={bulkLoading}
              className="px-3 py-1.5 bg-green-600/50 hover:bg-green-600 text-green-300 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5">
              <ToggleRight className="w-3.5 h-3.5" /> Aktywuj
            </button>
            <button onClick={() => handleBulkToggle(false)} disabled={bulkLoading}
              className="px-3 py-1.5 bg-gray-600/50 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5">
              <ToggleLeft className="w-3.5 h-3.5" /> Dezaktywuj
            </button>
            <div className="w-px h-6 bg-slate-700 mx-1" />
            <button onClick={handleBulkDelete} disabled={bulkLoading}
              className="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 text-red-300 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Usuń zaznaczone
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-gray-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Coupons Table */}
      <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-admin-border">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white transition-colors">
                    {selectedIds.size === coupons.length && coupons.length > 0
                      ? <CheckSquare className="w-4 h-4 text-orange-400" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Kod</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Typ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Wartość</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Min. kwota</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Użycia</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Ważność</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Źródło</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                    <p>Ładowanie...</p>
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Brak kuponów</p>
                    <button onClick={openCreateModal} className="mt-2 text-orange-400 hover:text-orange-300">
                      Stwórz pierwszy kupon
                    </button>
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => {
                  const status = getCouponStatus(coupon);
                  const typeInfo = typeLabels[coupon.type];
                  const TypeIcon = typeInfo.icon;
                  return (
                    <tr key={coupon.id} className={`border-b border-admin-border hover:bg-slate-800/30 transition-colors ${selectedIds.has(coupon.id) ? 'bg-orange-500/10' : ''}`}>
                      <td className="px-4 py-3 w-10">
                        <button onClick={() => toggleSelect(coupon.id)} className="text-slate-400 hover:text-orange-400 transition-colors">
                          {selectedIds.has(coupon.id) ? <CheckSquare className="w-4 h-4 text-orange-400" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-white bg-slate-700/50 px-2 py-0.5 rounded text-sm">
                            {coupon.code}
                          </code>
                          <button
                            onClick={() => copyCode(coupon.code, coupon.id)}
                            className="text-slate-400 hover:text-white transition-colors"
                            title="Kopiuj kod"
                          >
                            {copiedId === coupon.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {coupon.description && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{coupon.description}</p>
                        )}
                        {coupon.restrictedToEmail && (
                          <p className="text-xs text-orange-400/80 mt-0.5 truncate max-w-[200px]">✉ {coupon.restrictedToEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
                          <TypeIcon className="w-3 h-3" />
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-semibold">{getValueDisplay(coupon)}</td>
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {coupon.minimumAmount ? formatPrice(Number(coupon.minimumAmount)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="text-white">{coupon.usedCount}</span>
                        <span className="text-slate-400">/{coupon.maximumUses || '∞'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {coupon.expiresAt ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {formatDate(coupon.expiresAt)}
                          </div>
                        ) : (
                          <span className="text-slate-500">Bezterminowy</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400">{sourceLabels[coupon.couponSource] || coupon.couponSource}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggle(coupon)}
                            className={`p-1.5 rounded-lg transition-colors ${coupon.isActive ? 'text-green-400 hover:bg-green-400/10' : 'text-slate-400 hover:bg-slate-700'}`}
                            title={coupon.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                          >
                            {coupon.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={() => openEditModal(coupon)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                            title="Edytuj"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(coupon)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Usuń"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
            <p className="text-sm text-slate-400">
              Pokazuję {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} z {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-admin-card border border-admin-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-admin-border">
              <h2 className="text-lg font-bold text-white">
                {editingCoupon ? 'Edytuj kupon' : 'Nowy kupon'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Kod kuponu *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="np. LATO2026"
                    className="flex-1 px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={generateCode}
                    className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors whitespace-nowrap"
                  >
                    Generuj
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Opis</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="np. Rabat letni 2026"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Typ rabatu *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="PERCENTAGE">Procentowy (%)</option>
                    <option value="FIXED_AMOUNT">Kwotowy (PLN)</option>
                    <option value="FREE_SHIPPING">Darmowa dostawa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Wartość * {form.type === 'PERCENTAGE' ? '(%)' : form.type === 'FIXED_AMOUNT' ? '(PLN)' : ''}
                  </label>
                  <input
                    type="number"
                    step={form.type === 'PERCENTAGE' ? '1' : '0.01'}
                    min="0"
                    max={form.type === 'PERCENTAGE' ? '100' : undefined}
                    value={form.value}
                    onChange={(e) => setForm(prev => ({ ...prev, value: e.target.value }))}
                    placeholder={form.type === 'PERCENTAGE' ? '10' : '50.00'}
                    disabled={form.type === 'FREE_SHIPPING'}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Min Amount + Max Uses */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Min. kwota zamówienia</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minimumAmount}
                    onChange={(e) => setForm(prev => ({ ...prev, minimumAmount: e.target.value }))}
                    placeholder="Brak limitu"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Max użyć</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maximumUses}
                    onChange={(e) => setForm(prev => ({ ...prev, maximumUses: e.target.value }))}
                    placeholder="Bez limitu"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Ważny od</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Ważny do</label>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Źródło kuponu</label>
                <select
                  value={form.couponSource}
                  onChange={(e) => setForm(prev => ({ ...prev, couponSource: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="MANUAL">Ręczny</option>
                  <option value="WELCOME_DISCOUNT">Rabat powitalny</option>
                  <option value="REFERRAL">Polecenie</option>
                  <option value="CAMPAIGN">Kampania</option>
                  <option value="NEWSLETTER">Newsletter</option>
                  <option value="DELIVERY_DELAY">Opóźnienie dostawy</option>
                </select>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-300">Aktywny</span>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.isActive ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Requires Auth toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-slate-300">Tylko dla zarejestrowanych</span>
                  <p className="text-xs text-slate-500">Kupon będzie dostępny tylko dla zalogowanych użytkowników</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, requiresAuth: !prev.requiresAuth }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.requiresAuth ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.requiresAuth ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Single Use Per User toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-slate-300">Jedno użycie na konto</span>
                  <p className="text-xs text-slate-500">Każdy użytkownik może użyć tego kuponu tylko raz</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, singleUsePerUser: !prev.singleUsePerUser }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.singleUsePerUser ? 'bg-purple-500' : 'bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.singleUsePerUser ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-admin-border">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Zapisywanie...' : editingCoupon ? 'Zaktualizuj' : 'Utwórz kupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
