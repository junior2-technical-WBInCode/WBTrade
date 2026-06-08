'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import {
  Building2,
  Check,
  X,
  Users,
  Clock,
  Edit3,
  Ban,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Info,
} from 'lucide-react';

interface B2bApplication {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  companyName: string | null;
  nip: string | null;
  companyStreet: string | null;
  companyCity: string | null;
  companyPostalCode: string | null;
  b2bStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'SUSPENDED';
  b2bPriceMultiplier: number | null;
  b2bWholesalerRules: any;
  b2bApprovedAt: string | null;
  b2bApprovedBy: string | null;
  b2bNotes: string | null;
  role: string;
  createdAt: string;
}

interface Wholesaler {
  id: string;
  key: string;
  name: string;
  hasPriceRules: boolean;
  color: string;
}

type TabType = 'pending' | 'partners' | 'all';

export default function AdminB2bPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabType>('pending');
  const [applications, setApplications] = useState<B2bApplication[]>([]);
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [editingPartner, setEditingPartner] = useState<B2bApplication | null>(null);
  const [modalMultiplier, setModalMultiplier] = useState<number>(1.10);
  const [modalRules, setModalRules] = useState<Record<string, { divider: number; rules: any[] }>>({});
  const [activeModalTab, setActiveModalTab] = useState<string>('general');

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (tab === 'partners') {
        const data = await apiJson.get<B2bApplication[]>('/admin/b2b/partners', token);
        setApplications(data);
      } else {
        const status = tab === 'pending' ? '?status=PENDING' : '';
        const data = await apiJson.get<B2bApplication[]>(`/admin/b2b/applications${status}`, token);
        setApplications(data);
      }
    } catch (err) {
      console.error('Failed to fetch B2B data:', err);
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  const fetchWholesalers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiJson.get<Wholesaler[]>('/admin/wholesalers', token);
      // Filter only active wholesalers that support price rules
      setWholesalers(data.filter(w => w.hasPriceRules));
    } catch (err) {
      console.error('Failed to fetch wholesalers:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchWholesalers();
  }, [fetchWholesalers]);

  const handleApprove = async (userId: string) => {
    if (!token) return;
    setActionLoading(userId);
    try {
      await apiJson.post(`/admin/b2b/applications/${userId}/approve`, {}, token);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!token) return;
    const reason = prompt('Powód odrzucenia (opcjonalnie):');
    setActionLoading(userId);
    try {
      await apiJson.post(`/admin/b2b/applications/${userId}/reject`, { reason: reason || undefined }, token);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!token) return;
    if (!confirm('Czy na pewno chcesz cofnąć współpracę B2B dla tego użytkownika?')) return;
    const reason = prompt('Powód cofnięcia (opcjonalnie):');
    setActionLoading(userId);
    try {
      await apiJson.post(`/admin/b2b/applications/${userId}/revoke`, { reason: reason || undefined }, token);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (userId: string) => {
    if (!token) return;
    if (!confirm('Czy na pewno chcesz zawiesić konto tego partnera? Nie będzie mógł składać zamówień.')) return;
    const reason = prompt('Powód zawieszenia (opcjonalnie):');
    setActionLoading(userId);
    try {
      await apiJson.post(`/admin/b2b/partners/${userId}/suspend`, { reason: reason || undefined }, token);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsuspend = async (userId: string) => {
    if (!token) return;
    if (!confirm('Czy na pewno chcesz odwiesić konto tego partnera?')) return;
    setActionLoading(userId);
    try {
      await apiJson.post(`/admin/b2b/partners/${userId}/unsuspend`, {}, token);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (app: B2bApplication) => {
    setEditingPartner(app);
    setModalMultiplier(app.b2bPriceMultiplier ? Number(app.b2bPriceMultiplier) : 1.10);
    setModalRules(app.b2bWholesalerRules ? JSON.parse(JSON.stringify(app.b2bWholesalerRules)) : {});
    setActiveModalTab('general');
  };

  const handleSaveRules = async () => {
    if (!token || !editingPartner) return;
    setActionLoading(editingPartner.id);
    try {
      // Validate rules before saving to prevent bad payload
      const cleanedRules: Record<string, { divider: number; rules: any[] }> = {};
      for (const key of Object.keys(modalRules)) {
        const entry = modalRules[key];
        if (entry && Array.isArray(entry.rules) && entry.rules.length > 0) {
          cleanedRules[key] = {
            divider: Number(entry.divider) || 1.0,
            rules: entry.rules.map(r => ({
              priceFrom: Number(r.priceFrom) || 0,
              priceTo: Number(r.priceTo) || 999999,
              multiplier: Number(r.multiplier) || 1.0,
              addToPrice: Number(r.addToPrice) || 0,
            })),
          };
        }
      }

      await apiJson.put(`/admin/b2b/partners/${editingPartner.id}/multiplier`, {
        multiplier: modalMultiplier,
        wholesalerRules: cleanedRules,
      }, token);
      setEditingPartner(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getWholesalerRulesCount = (app: B2bApplication) => {
    if (!app.b2bWholesalerRules) return 0;
    const keys = Object.keys(app.b2bWholesalerRules);
    return keys.filter(k => {
      const config = app.b2bWholesalerRules[k];
      return config && Array.isArray(config.rules) && config.rules.length > 0;
    }).length;
  };

  const filtered = applications.filter(a => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.companyName?.toLowerCase().includes(q) ||
      a.nip?.includes(q) ||
      a.email.toLowerCase().includes(q) ||
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(q)
    );
  });

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-yellow-105 bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      REVOKED: 'bg-gray-100 text-gray-800',
      SUSPENDED: 'bg-orange-100 text-orange-800',
    };
    const labels: Record<string, string> = {
      PENDING: 'Oczekuje',
      APPROVED: 'Zatwierdzony',
      REJECTED: 'Odrzucony',
      REVOKED: 'Cofnięty',
      SUSPENDED: 'Zawieszony',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Współpraca B2B</h1>
            <p className="text-sm text-gray-400">Zarządzanie partnerami firmowymi</p>
          </div>
        </div>
        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-white transition-colors">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit">
        {([
          { id: 'pending', label: 'Wnioski', icon: Clock, count: applications.length },
          { id: 'partners', label: 'Partnerzy', icon: Users },
          { id: 'all', label: 'Wszystkie', icon: Building2 },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Szukaj po firmie, NIP, email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Ładowanie...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {tab === 'pending' ? 'Brak oczekujących wniosków' : 'Brak wyników'}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Firma</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">NIP</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Kontakt</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  {tab === 'partners' && (
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Mnożnik</th>
                  )}
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filtered.map((app) => {
                  const rulesCount = getWholesalerRulesCount(app);
                  return (
                    <tr key={app.id} className="hover:bg-slate-750">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{app.companyName || '—'}</div>
                        <div className="text-xs text-gray-400">
                          {app.companyStreet}, {app.companyPostalCode} {app.companyCity}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{app.nip || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-white">{app.firstName} {app.lastName}</div>
                        <div className="text-xs text-gray-400">{app.email}</div>
                        {app.phone && <div className="text-xs text-gray-500">{app.phone}</div>}
                      </td>
                      <td className="px-4 py-3">{statusBadge(app.b2bStatus)}</td>
                      {tab === 'partners' && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openEditModal(app)}
                            className="flex flex-col items-start text-orange-400 hover:text-orange-300 transition-colors"
                          >
                            <span className="flex items-center gap-1 font-mono text-xs font-semibold">
                              ×{Number(app.b2bPriceMultiplier || 1.10).toFixed(2)}
                              <Edit3 className="w-3 h-3 text-orange-400/80" />
                            </span>
                            {rulesCount > 0 && (
                              <span className="text-[10px] text-gray-400 bg-slate-700/60 px-1 rounded mt-0.5 font-medium">
                                + {rulesCount} {rulesCount === 1 ? 'hurtownia' : (rulesCount < 5 ? 'hurtownie' : 'hurtowni')}
                              </span>
                            )}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(app.b2bApprovedAt || app.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {app.b2bStatus === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApprove(app.id)}
                                disabled={actionLoading === app.id}
                                className="p-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-md transition-colors"
                                title="Zatwierdź"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReject(app.id)}
                                disabled={actionLoading === app.id}
                                className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
                                title="Odrzuć"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {app.b2bStatus === 'APPROVED' && (
                            <>
                              <button
                                onClick={() => handleSuspend(app.id)}
                                disabled={actionLoading === app.id}
                                className="p-1.5 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-md transition-colors"
                                title="Zawieś konto"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRevoke(app.id)}
                                disabled={actionLoading === app.id}
                                className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
                                title="Cofnij współpracę"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {app.b2bStatus === 'SUSPENDED' && (
                            <>
                              <button
                                onClick={() => handleUnsuspend(app.id)}
                                disabled={actionLoading === app.id}
                                className="p-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-md transition-colors"
                                title="Odwieś konto"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRevoke(app.id)}
                                disabled={actionLoading === app.id}
                                className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
                                title="Cofnij współpracę"
                              >
                                <X className="w-4 h-4" />
                              </button>
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
        </div>
      )}

      {/* Rules Configuration Modal */}
      {editingPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-white shadow-2xl animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-850 bg-slate-950/40">
              <div>
                <h3 className="text-lg font-bold text-white">Konfiguracja reguł cenowych partnera B2B</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingPartner.companyName || `${editingPartner.firstName} ${editingPartner.lastName}`} • {editingPartner.email}
                </p>
              </div>
              <button onClick={() => setEditingPartner(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Sidebar Tabs */}
              <div className="w-56 bg-slate-950 border-r border-slate-850 overflow-y-auto py-2">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('general')}
                  className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                    activeModalTab === 'general'
                      ? 'bg-orange-500/10 text-orange-400 border-r-2 border-orange-500'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Mnożnik główny
                </button>
                <div className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-2">
                  Reguły hurtowni
                </div>
                {wholesalers.map((wh) => {
                  const hasCustom = modalRules[wh.key] && modalRules[wh.key].rules?.length > 0;
                  return (
                    <button
                      key={wh.id}
                      type="button"
                      onClick={() => setActiveModalTab(wh.key)}
                      className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between transition-colors ${
                        activeModalTab === wh.key
                          ? 'bg-orange-500/10 text-orange-400 border-r-2 border-orange-500'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span className="truncate">{wh.name}</span>
                      {hasCustom && (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 ml-2" title="Reguły indywidualne aktywne" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-900/10">
                {activeModalTab === 'general' ? (
                  <div className="space-y-5">
                    <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex gap-3 text-sm text-gray-300">
                      <Info className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                      <p>
                        Główny mnożnik jest stosowany domyślnie dla wszystkich produktów. Jeśli skonfigurujesz indywidualne reguły dla danej hurtowni w zakładkach obok, ten mnożnik nie będzie dla niej stosowany.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <label className="text-sm font-medium text-gray-300">Wartość głównego mnożnika</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          max="5"
                          value={modalMultiplier}
                          onChange={(e) => setModalMultiplier(parseFloat(e.target.value) || 1.10)}
                          className="w-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-orange-500"
                        />
                        <span className="text-xs text-gray-400">Domyślnie: 1.10 (narzut 10% od ceny bazowej)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Wholesaler rules tab content
                  (() => {
                    const whKey = activeModalTab;
                    const wh = wholesalers.find(w => w.key === whKey);
                    if (!wh) return null;

                    const config = modalRules[whKey];
                    if (!config) {
                      return (
                        <div className="text-center py-16 space-y-4">
                          <p className="text-sm text-gray-400">
                            Brak indywidualnych reguł dla hurtowni <strong className="text-gray-200">{wh.name}</strong>.
                            Używany jest mnożnik główny (×{Number(modalMultiplier).toFixed(2)}).
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setModalRules({
                                ...modalRules,
                                [whKey]: {
                                  divider: 1.0,
                                  rules: [
                                    { priceFrom: 0, priceTo: 999999, multiplier: 1.10, addToPrice: 0 }
                                  ]
                                }
                              });
                            }}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-sm font-medium transition-colors"
                          >
                            Włącz reguły indywidualne
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-6">
                        {/* Divider */}
                        <div className="bg-slate-850 p-4 border border-slate-800/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-gray-200">Dzielnik BaseLinker (BL)</label>
                            <span className="text-xs text-gray-400 font-mono">akt: {config.divider}</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0.1"
                            value={config.divider}
                            onChange={(e) => {
                              const updated = { ...config, divider: parseFloat(e.target.value) || 1.0 };
                              setModalRules({ ...modalRules, [whKey]: updated });
                            }}
                            className="w-32 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-orange-500"
                          />
                          <p className="text-xs text-gray-400">
                            Cena pobrana z Baselinker jest dzielona przez ten dzielnik, aby uzyskać czystą cenę hurtową przed nałożeniem mnożników marży B2B.
                          </p>
                        </div>

                        {/* Rules Table */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-200">Przedziały cenowe i mnożniki</h4>
                            <button
                              type="button"
                              onClick={() => {
                                const newRules = [...config.rules, { priceFrom: 0, priceTo: 999999, multiplier: 1.10, addToPrice: 0 }];
                                setModalRules({ ...modalRules, [whKey]: { ...config, rules: newRules } });
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-orange-400 flex items-center gap-1 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Dodaj przedział
                            </button>
                          </div>

                          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-850 text-gray-400 font-medium">
                                  <th className="px-3 py-2.5">Cena od (PLN)</th>
                                  <th className="px-3 py-2.5">Cena do (PLN)</th>
                                  <th className="px-3 py-2.5">Mnożnik</th>
                                  <th className="px-3 py-2.5">Dodaj (PLN)</th>
                                  <th className="px-3 py-2.5 text-right">Akcja</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-850">
                                {config.rules.map((rule, idx) => (
                                  <tr key={idx} className="hover:bg-slate-800/30">
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={rule.priceFrom}
                                        onChange={(e) => {
                                          const rules = [...config.rules];
                                          rules[idx] = { ...rule, priceFrom: parseFloat(e.target.value) || 0 };
                                          setModalRules({ ...modalRules, [whKey]: { ...config, rules } });
                                        }}
                                        className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={rule.priceTo}
                                        onChange={(e) => {
                                          const rules = [...config.rules];
                                          rules[idx] = { ...rule, priceTo: parseFloat(e.target.value) || 999999 };
                                          setModalRules({ ...modalRules, [whKey]: { ...config, rules } });
                                        }}
                                        className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={rule.multiplier}
                                        onChange={(e) => {
                                          const rules = [...config.rules];
                                          rules[idx] = { ...rule, multiplier: parseFloat(e.target.value) || 1.0 };
                                          setModalRules({ ...modalRules, [whKey]: { ...config, rules } });
                                        }}
                                        className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={rule.addToPrice}
                                        onChange={(e) => {
                                          const rules = [...config.rules];
                                          rules[idx] = { ...rule, addToPrice: parseFloat(e.target.value) || 0 };
                                          setModalRules({ ...modalRules, [whKey]: { ...config, rules } });
                                        }}
                                        className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const rules = config.rules.filter((_, i) => i !== idx);
                                          setModalRules({ ...modalRules, [whKey]: { ...config, rules } });
                                        }}
                                        className="p-1.5 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Disable custom rules */}
                        <div className="pt-4 border-t border-slate-850">
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Czy na pewno chcesz usunąć reguły indywidualne dla hurtowni ${wh.name}?`)) {
                                const copy = { ...modalRules };
                                delete copy[whKey];
                                setModalRules(copy);
                              }
                            }}
                            className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-xs font-medium transition-colors"
                          >
                            Wyłącz indywidualne reguły hurtowni
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-850 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingPartner(null)}
                className="px-4 py-2 border border-slate-700 text-gray-300 hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleSaveRules}
                disabled={actionLoading === editingPartner.id}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {actionLoading === editingPartner.id ? 'Zapisywanie...' : 'Zapisz reguły'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
