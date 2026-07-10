'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Percent, ArrowLeft, Play, Square, Edit2, Loader2, Package,
  Calendar, Eye, Trash2, ArrowRight, Link2, Link2Off,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Szkic', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  SCHEDULED: { label: 'Zaplanowana', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  ACTIVE: { label: 'Aktywna', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  ENDED: { label: 'Zakończona', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  CANCELLED: { label: 'Anulowana', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
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

interface PreviewItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  currentPrice: number;
  newPrice: number;
  discountPercent: number;
}

export default function SaleCampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm } = useModal();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTotal, setPreviewTotal] = useState(0);

  useEffect(() => {
    loadCampaign();
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
        setCampaign(data);
      } else {
        router.push('/sale-campaigns');
      }
    } catch (error) {
      console.error('Failed to load campaign:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview() {
    try {
      setPreviewLoading(true);
      const res = await apiCall(`/admin/sale-campaigns/${params.id}/preview`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPreview(data.items);
        setPreviewTotal(data.totalProducts);
      }
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleActivate() {
    const ok = await confirm({
      message: `Aktywować kampanię "${campaign.name}"? Ceny produktów zostaną zmienione.`,
      confirmText: 'Aktywuj kampanię',
    });
    if (!ok) return;

    try {
      setActionLoading(true);
      const res = await apiCall(`/admin/sale-campaigns/${params.id}/activate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        loadCampaign();
      } else {
        alert(data.message || 'Błąd aktywacji');
      }
    } catch (error) {
      console.error('Error activating:', error);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeactivate() {
    const ok = await confirm({
      message: `Dezaktywować kampanię "${campaign.name}"? Oryginalne ceny produktów zostaną przywrócone.`,
      confirmText: 'Dezaktywuj kampanię',
    });
    if (!ok) return;

    try {
      setActionLoading(true);
      const res = await apiCall(`/admin/sale-campaigns/${params.id}/deactivate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        loadCampaign();
      } else {
        alert(data.message || 'Błąd dezaktywacji');
      }
    } catch (error) {
      console.error('Error deactivating:', error);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      message: `Usunąć kampanię "${campaign.name}"? Tej operacji nie można cofnąć.`,
      confirmText: 'Usuń kampanię',
    });
    if (!ok) return;

    try {
      setActionLoading(true);
      const res = await apiCall(`/admin/sale-campaigns/${params.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/sale-campaigns');
      } else {
        const data = await res.json();
        alert(data.message || 'Błąd usuwania');
      }
    } catch (error) {
      console.error('Error deleting:', error);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  if (!campaign) return null;

  const statusInfo = statusLabels[campaign.status] || statusLabels.DRAFT;
  const isEditable = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/sale-campaigns" className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            {campaign.description && (
              <p className="text-sm text-gray-400 mt-0.5">{campaign.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {actionLoading ? (
            <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
          ) : (
            <>
              {isEditable && (
                <>
                  <Link
                    href={`/sale-campaigns/${campaign.id}/edit`}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edytuj
                  </Link>
                  <button
                    onClick={handleActivate}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Aktywuj
                  </button>
                </>
              )}
              {campaign.status === 'ACTIVE' && (
                <button
                  onClick={handleDeactivate}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Dezaktywuj
                </button>
              )}
              {campaign.status === 'DRAFT' && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-gray-400">Rabat</p>
              <p className="text-xl font-bold text-orange-400 mt-1">
                {formatDiscountValue(campaign.discountType, Number(campaign.discountValue))}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{discountTypeLabels[campaign.discountType]}</p>
            </div>
            <div className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-gray-400">Zakres</p>
              <p className="text-lg font-bold text-white mt-1">{scopeLabels[campaign.scope]}</p>
              {campaign.scopeValue?.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">{campaign.scopeValue.length} wybranych</p>
              )}
            </div>
            <div className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-gray-400">Produktów</p>
              <p className="text-xl font-bold text-white mt-1">{campaign._count?.products || 0}</p>
            </div>
            <div className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-gray-400">Kupony</p>
              <div className="flex items-center gap-1.5 mt-1">
                {campaign.stackableWithCoupons ? (
                  <>
                    <Link2 className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Łączy się</span>
                  </>
                ) : (
                  <>
                    <Link2Off className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-medium text-red-400">Nie łączy</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-admin-card border border-admin-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Harmonogram
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Rozpoczęcie</p>
                <p className="text-white font-medium">{formatDate(campaign.startsAt)}</p>
              </div>
              <div>
                <p className="text-gray-500">Zakończenie</p>
                <p className="text-white font-medium">{formatDate(campaign.endsAt)}</p>
              </div>
              <div>
                <p className="text-gray-500">Utworzono</p>
                <p className="text-white font-medium">{formatDate(campaign.createdAt)}</p>
              </div>
              <div>
                <p className="text-gray-500">Zaokrąglanie .99</p>
                <p className="text-white font-medium">{campaign.roundTo99 ? 'Tak' : 'Nie'}</p>
              </div>
            </div>
          </div>

          {/* Applied products (for ACTIVE campaigns) */}
          {campaign.status === 'ACTIVE' && campaign.products?.length > 0 && (
            <div className="bg-admin-card border border-admin-border rounded-lg p-5">
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" /> Przecenione produkty ({campaign._count?.products || campaign.products.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {campaign.products.map((cp: any) => (
                  <div key={cp.id} className="flex items-center justify-between bg-admin-bg rounded-lg p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {cp.product?.images?.[0]?.url && (
                        <img src={cp.product.images[0].url} alt="" className="w-10 h-10 rounded object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {cp.product?.name}
                          {cp.variant && <span className="text-gray-500 ml-1">— {cp.variant.name}</span>}
                        </p>
                        <p className="text-xs text-gray-500">{cp.variant?.sku || cp.product?.sku}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      <span className="text-gray-500 line-through">{Number(cp.originalPrice).toFixed(2)} zł</span>
                      <ArrowRight className="w-3 h-3 text-gray-600" />
                      <span className="text-orange-400 font-bold">{Number(cp.salePrice).toFixed(2)} zł</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview sidebar (for non-active campaigns) */}
        <div className="space-y-4">
          {isEditable && (
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
                  <p className="text-xs text-gray-400">
                    Dotyczy {previewTotal} produktów:
                  </p>
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
                  Kliknij &quot;Oblicz&quot; aby zobaczyć podgląd kalkulacji cen przed aktywacją.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
