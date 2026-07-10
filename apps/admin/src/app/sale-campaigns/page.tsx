'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Percent, Plus, Search, Trash2, Play, Square, Eye, Edit2,
  Calendar, Filter, ChevronLeft, ChevronRight, Package, Loader2,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface SaleCampaign {
  id: string;
  name: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'MULTIPLIER';
  discountValue: number;
  roundTo99: boolean;
  startsAt: string | null;
  endsAt: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  scope: 'ALL' | 'CATEGORY' | 'WAREHOUSE' | 'SELECTED' | 'TAG';
  scopeValue: string[];
  stackableWithCoupons: boolean;
  createdAt: string;
  _count: { products: number };
}

interface Stats {
  total: number;
  active: number;
  draft: number;
  scheduled: number;
  ended: number;
  discountedProducts: number;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Szkic', color: 'bg-gray-500/20 text-gray-400' },
  SCHEDULED: { label: 'Zaplanowana', color: 'bg-blue-500/20 text-blue-400' },
  ACTIVE: { label: 'Aktywna', color: 'bg-green-500/20 text-green-400' },
  ENDED: { label: 'Zakończona', color: 'bg-yellow-500/20 text-yellow-400' },
  CANCELLED: { label: 'Anulowana', color: 'bg-red-500/20 text-red-400' },
};

const discountTypeLabels: Record<string, string> = {
  PERCENTAGE: 'Procentowy',
  FIXED_AMOUNT: 'Kwotowy',
  MULTIPLIER: 'Mnożnik',
};

const scopeLabels: Record<string, string> = {
  ALL: 'Wszystkie produkty',
  CATEGORY: 'Kategoria',
  WAREHOUSE: 'Magazyn',
  SELECTED: 'Wybrane produkty',
  TAG: 'Tag',
};

function formatDiscountValue(type: string, value: number): string {
  switch (type) {
    case 'PERCENTAGE': return `-${value}%`;
    case 'FIXED_AMOUNT': return `-${value.toFixed(2)} zł`;
    case 'MULTIPLIER': return `×${value}`;
    default: return String(value);
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SaleCampaignsPage() {
  const { confirm } = useModal();
  const [campaigns, setCampaigns] = useState<SaleCampaign[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadCampaigns();
    loadStats();
  }, [page, search, statusFilter]);

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

  async function loadCampaigns() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await apiCall(`/admin/sale-campaigns?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await apiCall('/admin/sale-campaigns/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function handleActivate(campaign: SaleCampaign) {
    const ok = await confirm({
      message: `Aktywować kampanię "${campaign.name}"? Ceny produktów zostaną zmienione.`,
      confirmText: 'Aktywuj kampanię',
    });
    if (!ok) return;

    try {
      setActionLoading(campaign.id);
      const res = await apiCall(`/admin/sale-campaigns/${campaign.id}/activate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        loadCampaigns();
        loadStats();
      } else {
        alert(data.message || 'Błąd aktywacji');
      }
    } catch (error) {
      console.error('Error activating:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeactivate(campaign: SaleCampaign) {
    const ok = await confirm({
      message: `Dezaktywować kampanię "${campaign.name}"? Oryginalne ceny produktów zostaną przywrócone.`,
      confirmText: 'Dezaktywuj kampanię',
    });
    if (!ok) return;

    try {
      setActionLoading(campaign.id);
      const res = await apiCall(`/admin/sale-campaigns/${campaign.id}/deactivate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        loadCampaigns();
        loadStats();
      } else {
        alert(data.message || 'Błąd dezaktywacji');
      }
    } catch (error) {
      console.error('Error deactivating:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(campaign: SaleCampaign) {
    const ok = await confirm({
      message: `Usunąć kampanię "${campaign.name}"? Tej operacji nie można cofnąć.`,
      confirmText: 'Usuń kampanię',
      variant: 'danger' as any,
    });
    if (!ok) return;

    try {
      setActionLoading(campaign.id);
      const res = await apiCall(`/admin/sale-campaigns/${campaign.id}`, { method: 'DELETE' });
      if (res.ok) {
        loadCampaigns();
        loadStats();
      } else {
        const data = await res.json();
        alert(data.message || 'Błąd usuwania');
      }
    } catch (error) {
      console.error('Error deleting:', error);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Percent className="w-7 h-7 text-orange-400" />
            Przeceny
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Zarządzaj kampaniami przecenowymi — masowe ustawianie cen promocyjnych
          </p>
        </div>
        <Link
          href="/sale-campaigns/new"
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nowa kampania
        </Link>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: 'Wszystkie', value: stats.total, color: 'text-white' },
            { label: 'Aktywne', value: stats.active, color: 'text-green-400' },
            { label: 'Szkice', value: stats.draft, color: 'text-gray-400' },
            { label: 'Zaplanowane', value: stats.scheduled, color: 'text-blue-400' },
            { label: 'Zakończone', value: stats.ended, color: 'text-yellow-400' },
            { label: 'Przecenionych prod.', value: stats.discountedProducts, color: 'text-orange-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-gray-400">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Szukaj kampanii..."
            className="w-full bg-admin-card border border-admin-border rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-admin-card border border-admin-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
        >
          <option value="">Wszystkie statusy</option>
          <option value="DRAFT">Szkic</option>
          <option value="SCHEDULED">Zaplanowana</option>
          <option value="ACTIVE">Aktywna</option>
          <option value="ENDED">Zakończona</option>
          <option value="CANCELLED">Anulowana</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Percent className="w-12 h-12 mb-3" />
            <p>Brak kampanii przecenowych</p>
            <Link href="/sale-campaigns/new" className="text-orange-400 hover:text-orange-300 mt-2 text-sm">
              Utwórz pierwszą kampanię →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-border text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">Nazwa</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Rabat</th>
                  <th className="px-4 py-3 font-medium">Zakres</th>
                  <th className="px-4 py-3 font-medium">Produkty</th>
                  <th className="px-4 py-3 font-medium">Kupony</th>
                  <th className="px-4 py-3 font-medium">Daty</th>
                  <th className="px-4 py-3 font-medium text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const statusInfo = statusLabels[campaign.status] || statusLabels.DRAFT;
                  const isLoading = actionLoading === campaign.id;
                  return (
                    <tr key={campaign.id} className="border-b border-admin-border/50 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/sale-campaigns/${campaign.id}`} className="font-medium text-white hover:text-orange-400 transition-colors">
                          {campaign.name}
                        </Link>
                        {campaign.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{campaign.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-orange-400 font-medium">
                          {formatDiscountValue(campaign.discountType, campaign.discountValue)}
                        </span>
                        <span className="text-gray-500 text-xs ml-1">
                          ({discountTypeLabels[campaign.discountType]})
                        </span>
                        {campaign.roundTo99 && (
                          <span className="text-gray-500 text-xs block">.99</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">
                        {scopeLabels[campaign.scope]}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-gray-300">
                          <Package className="w-3.5 h-3.5" />
                          {campaign._count.products}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${campaign.stackableWithCoupons ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {campaign.stackableWithCoupons ? 'Łączy się' : 'Nie łączy'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        <div>{formatDate(campaign.startsAt)}</div>
                        <div>{formatDate(campaign.endsAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          ) : (
                            <>
                              <Link
                                href={`/sale-campaigns/${campaign.id}`}
                                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="Podgląd"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                              {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                                <>
                                  <Link
                                    href={`/sale-campaigns/${campaign.id}/edit`}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Edytuj"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Link>
                                  <button
                                    onClick={() => handleActivate(campaign)}
                                    className="p-1.5 rounded hover:bg-green-500/20 text-gray-400 hover:text-green-400 transition-colors"
                                    title="Aktywuj"
                                  >
                                    <Play className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {campaign.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleDeactivate(campaign)}
                                  className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                                  title="Dezaktywuj"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              )}
                              {campaign.status === 'DRAFT' && (
                                <button
                                  onClick={() => handleDelete(campaign)}
                                  className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                                  title="Usuń"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-admin-border">
            <span className="text-sm text-gray-400">
              {total} kampanii ({totalPages} stron)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-white/10 text-gray-400 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-white">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-white/10 text-gray-400 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
