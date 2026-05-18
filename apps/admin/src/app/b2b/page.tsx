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
  b2bStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  b2bPriceMultiplier: number | null;
  b2bApprovedAt: string | null;
  b2bApprovedBy: string | null;
  b2bNotes: string | null;
  role: string;
  createdAt: string;
}

type TabType = 'pending' | 'partners' | 'all';

export default function AdminB2bPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabType>('pending');
  const [applications, setApplications] = useState<B2bApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMultiplier, setEditMultiplier] = useState<{ userId: string; value: string } | null>(null);

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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const handleUpdateMultiplier = async (userId: string) => {
    if (!token || !editMultiplier) return;
    const multiplier = parseFloat(editMultiplier.value);
    if (isNaN(multiplier) || multiplier < 1 || multiplier > 5) {
      alert('Mnożnik musi być pomiędzy 1.00 a 5.00');
      return;
    }
    setActionLoading(userId);
    try {
      await apiJson.put(`/admin/b2b/partners/${userId}/multiplier`, { multiplier }, token);
      setEditMultiplier(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
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
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      REVOKED: 'bg-gray-100 text-gray-800',
    };
    const labels: Record<string, string> = {
      PENDING: 'Oczekuje',
      APPROVED: 'Zatwierdzony',
      REJECTED: 'Odrzucony',
      REVOKED: 'Cofnięty',
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
                {filtered.map((app) => (
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
                        {editMultiplier?.userId === app.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              max="5"
                              value={editMultiplier.value}
                              onChange={(e) => setEditMultiplier({ ...editMultiplier, value: e.target.value })}
                              className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs"
                            />
                            <button
                              onClick={() => handleUpdateMultiplier(app.id)}
                              disabled={actionLoading === app.id}
                              className="p-1 text-green-400 hover:text-green-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditMultiplier(null)}
                              className="p-1 text-gray-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditMultiplier({ userId: app.id, value: String(app.b2bPriceMultiplier || 1.10) })}
                            className="flex items-center gap-1 text-orange-400 hover:text-orange-300 font-mono text-xs"
                          >
                            ×{Number(app.b2bPriceMultiplier || 1.10).toFixed(2)}
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
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
                          <button
                            onClick={() => handleRevoke(app.id)}
                            disabled={actionLoading === app.id}
                            className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
                            title="Cofnij współpracę"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
