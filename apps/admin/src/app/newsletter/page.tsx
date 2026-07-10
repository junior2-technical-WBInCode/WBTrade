'use client';

import { useState, useEffect } from 'react';
import {
  Mail, Users, Send, FileText, Plus, Search, Trash2, Download,
  Eye, Edit2, Calendar, Clock, BarChart3, CheckCircle, XCircle,
  AlertTriangle, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Subscriber {
  id: string;
  email: string;
  is_verified: boolean;
  subscribed_at: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
}

interface Campaign {
  id: string;
  title: string;
  subject: string;
  content: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
  scheduled_for: string | null;
  sent_at: string | null;
  recipient_count: number;
  opened_count: number;
  clicked_count: number;
  created_at: string;
  updated_at: string;
}

interface SubscriberStats {
  total: number;
  verified: number;
  unverified: number;
  unsubscribed: number;
}

interface CampaignStats {
  total: number;
  drafts: number;
  scheduled: number;
  sent: number;
  failed: number;
  totals: { recipients: number; opened: number; clicked: number };
}

type Tab = 'subscribers' | 'campaigns';

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT: { label: 'Szkic', color: 'bg-slate-500/20 text-slate-400', icon: FileText },
  SCHEDULED: { label: 'Zaplanowana', color: 'bg-blue-500/20 text-blue-400', icon: Clock },
  SENDING: { label: 'Wysyłanie', color: 'bg-yellow-500/20 text-yellow-400', icon: Send },
  SENT: { label: 'Wysłana', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
  FAILED: { label: 'Błąd', color: 'bg-red-500/20 text-red-400', icon: XCircle },
};

export default function NewsletterPage() {
  const { confirm, alert } = useModal();
  const [tab, setTab] = useState<Tab>('subscribers');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [subStats, setSubStats] = useState<SubscriberStats | null>(null);
  const [campStats, setCampStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Campaign modal
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    subject: '',
    content: '',
    scheduled_for: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Preview modal
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    if (tab === 'subscribers') {
      loadSubscribers();
      loadSubscriberStats();
    } else {
      loadCampaigns();
      loadCampaignStats();
    }
  }, [tab, page, search, statusFilter]);

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

  async function loadSubscribers() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await apiCall(`/admin/newsletter/subscribers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSubscribers(data.subscribers);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error('Failed to load subscribers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSubscriberStats() {
    try {
      const res = await apiCall('/admin/newsletter/subscribers/stats');
      if (res.ok) setSubStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCampaigns() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await apiCall(`/admin/newsletter/campaigns?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaignStats() {
    try {
      const res = await apiCall('/admin/newsletter/campaigns/stats');
      if (res.ok) setCampStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteSubscriber(id: string) {
    if (!await confirm('Czy na pewno chcesz usunąć tego subskrybenta?')) return;
    try {
      const res = await apiCall(`/admin/newsletter/subscribers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadSubscribers();
        loadSubscriberStats();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function openCampaignModal(campaign?: Campaign) {
    if (campaign) {
      setEditingCampaign(campaign);
      setCampaignForm({
        title: campaign.title,
        subject: campaign.subject,
        content: campaign.content,
        scheduled_for: campaign.scheduled_for
          ? new Date(campaign.scheduled_for).toISOString().slice(0, 16)
          : '',
      });
    } else {
      setEditingCampaign(null);
      setCampaignForm({ title: '', subject: '', content: '', scheduled_for: '' });
    }
    setError('');
    setShowCampaignModal(true);
  }

  async function saveCampaign() {
    if (!campaignForm.title || !campaignForm.subject || !campaignForm.content) {
      setError('Tytuł, temat i treść są wymagane');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        ...campaignForm,
        scheduled_for: campaignForm.scheduled_for || null,
      };
      const res = editingCampaign
        ? await apiCall(`/admin/newsletter/campaigns/${editingCampaign.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiCall('/admin/newsletter/campaigns', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        setShowCampaignModal(false);
        loadCampaigns();
        loadCampaignStats();
      } else {
        const data = await res.json();
        setError(data.message || 'Błąd zapisywania');
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCampaign(id: string) {
    if (!await confirm('Czy na pewno chcesz usunąć tę kampanię?')) return;
    try {
      const res = await apiCall(`/admin/newsletter/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadCampaigns();
        loadCampaignStats();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function sendCampaignNow(id: string) {
    if (!await confirm('Czy na pewno chcesz wysłać tę kampanię teraz do wszystkich subskrybentów?')) return;
    try {
      const res = await apiCall(`/admin/newsletter/campaigns/${id}/send`, { method: 'POST' });
      if (res.ok) {
        loadCampaigns();
        loadCampaignStats();
      } else {
        const data = await res.json();
        await alert(data.message || 'Błąd wysyłania kampanii');
      }
    } catch (err) {
      console.error(err);
      await alert('Błąd połączenia z serwerem');
    }
  }

  async function exportSubscribers() {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/newsletter/subscribers/export`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'newsletter-subscribers.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Mail className="w-7 h-7 text-orange-500" />
            Newsletter
          </h1>
          <p className="text-slate-400 mt-1">Zarządzaj subskrybentami i kampaniami</p>
        </div>
        <div className="flex gap-2">
          {tab === 'subscribers' && (
            <button
              onClick={exportSubscribers}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Eksport CSV
            </button>
          )}
          {tab === 'campaigns' && (
            <button
              onClick={() => openCampaignModal()}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nowa kampania
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-admin-card border border-admin-border rounded-lg p-1 w-fit">
        <button
          onClick={() => { setTab('subscribers'); setPage(1); setStatusFilter(''); setSearch(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'subscribers' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Subskrybenci
        </button>
        <button
          onClick={() => { setTab('campaigns'); setPage(1); setStatusFilter(''); setSearch(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'campaigns' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Send className="w-4 h-4" />
          Kampanie
        </button>
      </div>

      {/* ── SUBSCRIBERS TAB ── */}
      {tab === 'subscribers' && (
        <>
          {/* Stats */}
          {subStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Łącznie', value: subStats.total, color: 'text-white' },
                { label: 'Zweryfikowani', value: subStats.verified, color: 'text-green-400' },
                { label: 'Oczekujący', value: subStats.unverified, color: 'text-yellow-400' },
                { label: 'Wypisani', value: subStats.unsubscribed, color: 'text-red-400' },
              ].map((s) => (
                <div key={s.label} className="bg-admin-card border border-admin-border rounded-lg p-4">
                  <p className="text-xs text-slate-400">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
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
                placeholder="Szukaj po emailu..."
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
              <option value="">Wszystkie</option>
              <option value="verified">Zweryfikowani</option>
              <option value="unverified">Oczekujący</option>
              <option value="unsubscribed">Wypisani</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-admin-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Data</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-slate-400">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                        <p>Ładowanie...</p>
                      </td>
                    </tr>
                  ) : subscribers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-slate-400">
                        <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Brak subskrybentów</p>
                      </td>
                    </tr>
                  ) : (
                    subscribers.map((sub) => (
                      <tr key={sub.id} className="border-b border-admin-border hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{sub.email}</td>
                        <td className="px-4 py-3">
                          {sub.unsubscribed_at ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                              <XCircle className="w-3 h-3" /> Wypisany
                            </span>
                          ) : sub.is_verified ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                              <CheckCircle className="w-3 h-3" /> Zweryfikowany
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                              <Clock className="w-3 h-3" /> Oczekuje
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {formatDate(sub.subscribed_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => deleteSubscriber(sub.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Usuń"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
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
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-slate-300">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── CAMPAIGNS TAB ── */}
      {tab === 'campaigns' && (
        <>
          {/* Stats */}
          {campStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Wszystkie', value: campStats.total, color: 'text-white' },
                { label: 'Szkice', value: campStats.drafts, color: 'text-slate-400' },
                { label: 'Zaplanowane', value: campStats.scheduled, color: 'text-blue-400' },
                { label: 'Wysłane', value: campStats.sent, color: 'text-green-400' },
                { label: 'Łącznie odbiorców', value: campStats.totals.recipients, color: 'text-orange-400' },
              ].map((s) => (
                <div key={s.label} className="bg-admin-card border border-admin-border rounded-lg p-4">
                  <p className="text-xs text-slate-400">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Campaign filter */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="">Wszystkie statusy</option>
              <option value="DRAFT">Szkice</option>
              <option value="SCHEDULED">Zaplanowane</option>
              <option value="SENT">Wysłane</option>
              <option value="FAILED">Błędy</option>
            </select>
          </div>

          {/* Campaign list */}
          <div className="grid gap-4">
            {loading ? (
              <div className="text-center py-12 text-slate-400 bg-admin-card border border-admin-border rounded-lg">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                <p>Ładowanie...</p>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-admin-card border border-admin-border rounded-lg">
                <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Brak kampanii</p>
                <button onClick={() => openCampaignModal()} className="mt-2 text-orange-400 hover:text-orange-300">
                  Stwórz pierwszą kampanię
                </button>
              </div>
            ) : (
              campaigns.map((campaign) => {
                const st = statusConfig[campaign.status];
                const StatusIcon = st.icon;
                const openRate = campaign.recipient_count > 0
                  ? ((campaign.opened_count / campaign.recipient_count) * 100).toFixed(1)
                  : '0';
                const clickRate = campaign.recipient_count > 0
                  ? ((campaign.clicked_count / campaign.recipient_count) * 100).toFixed(1)
                  : '0';

                return (
                  <div
                    key={campaign.id}
                    className="bg-admin-card border border-admin-border rounded-lg p-5 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-white font-semibold truncate">{campaign.title}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {st.label}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 truncate">Temat: {campaign.subject}</p>
                        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Utworzono: {formatDate(campaign.created_at)}
                          </span>
                          {campaign.scheduled_for && (
                            <span className="flex items-center gap-1 text-blue-400">
                              <Clock className="w-3.5 h-3.5" />
                              Zaplanowana: {formatDate(campaign.scheduled_for)}
                            </span>
                          )}
                          {campaign.sent_at && (
                            <span className="flex items-center gap-1 text-green-400">
                              <Send className="w-3.5 h-3.5" />
                              Wysłana: {formatDate(campaign.sent_at)}
                            </span>
                          )}
                        </div>
                        {campaign.status === 'SENT' && (
                          <div className="flex gap-6 mt-3">
                            <div>
                              <p className="text-xs text-slate-500">Odbiorcy</p>
                              <p className="text-sm font-medium text-white">{campaign.recipient_count}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Otwarcia</p>
                              <p className="text-sm font-medium text-green-400">{campaign.opened_count} ({openRate}%)</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Kliknięcia</p>
                              <p className="text-sm font-medium text-blue-400">{campaign.clicked_count} ({clickRate}%)</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <button
                          onClick={() => setPreviewCampaign(campaign)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Podgląd"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                          <button
                            onClick={() => openCampaignModal(campaign)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                            title="Edytuj"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                          <button
                            onClick={() => sendCampaignNow(campaign.id)}
                            className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                            title="Wyślij teraz"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status !== 'SENDING' && (
                          <button
                            onClick={() => deleteCampaign(campaign.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Usuń"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-400">
                Strona {page} z {totalPages} ({total} kampanii)
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CAMPAIGN CREATE/EDIT MODAL ── */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-admin-card border border-admin-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-admin-border">
              <h2 className="text-lg font-bold text-white">
                {editingCampaign ? 'Edytuj kampanię' : 'Nowa kampania'}
              </h2>
              <button onClick={() => setShowCampaignModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nazwa kampanii *</label>
                <input
                  type="text"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="np. Newsletter Lipiec 2025"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Temat e-maila *</label>
                <input
                  type="text"
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="np. Letnie wyprzedaże w WBTrade!"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Treść (HTML) *</label>
                <textarea
                  value={campaignForm.content}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="<h1>Witaj!</h1><p>Zapraszamy na zakupy...</p>"
                  rows={10}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Zaplanuj wysyłkę</label>
                <input
                  type="datetime-local"
                  value={campaignForm.scheduled_for}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, scheduled_for: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
                <p className="text-xs text-slate-500 mt-1">Pozostaw puste aby kampania została zapisana jako szkic</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-admin-border">
              <button
                onClick={() => setShowCampaignModal(false)}
                className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={saveCampaign}
                disabled={saving}
                className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Zapisywanie...' : editingCampaign ? 'Zaktualizuj' : 'Utwórz kampanię'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW MODAL ── */}
      {previewCampaign && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-admin-card border border-admin-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-admin-border">
              <div>
                <h2 className="text-lg font-bold text-white">{previewCampaign.title}</h2>
                <p className="text-sm text-slate-400 mt-0.5">Temat: {previewCampaign.subject}</p>
              </div>
              <button onClick={() => setPreviewCampaign(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div
                className="bg-white rounded-lg p-6 text-black prose max-w-none"
                dangerouslySetInnerHTML={{ __html: previewCampaign.content }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
