'use client';

import { useState, useEffect } from 'react';
import {
  Activity, Search, Shield, AlertTriangle, CheckCircle, XCircle,
  Clock, User, ChevronLeft, ChevronRight, Filter, Eye
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface AuditLog {
  id: string;
  action: string;
  userId: string | null;
  email: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
  severity: string;
  success: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface Stats {
  total: number;
  last24h: number;
  last7d: number;
  failedLast7d: number;
  criticalLast7d: number;
  topActions: { action: string; count: number }[];
}

const severityConfig: Record<string, { label: string; color: string; icon: any }> = {
  INFO: { label: 'Info', color: 'bg-blue-500/20 text-blue-400', icon: Shield },
  WARNING: { label: 'Ostrzeżenie', color: 'bg-yellow-500/20 text-yellow-400', icon: AlertTriangle },
  ERROR: { label: 'Błąd', color: 'bg-red-500/20 text-red-400', icon: XCircle },
  CRITICAL: { label: 'Krytyczny', color: 'bg-red-600/30 text-red-300', icon: AlertTriangle },
};

const actionLabels: Record<string, string> = {
  LOGIN_SUCCESS: 'Logowanie udane',
  LOGIN_FAILED: 'Logowanie nieudane',
  LOGIN_BLOCKED: 'Logowanie zablokowane',
  LOGOUT: 'Wylogowanie',
  REGISTER_SUCCESS: 'Rejestracja',
  REGISTER_FAILED: 'Rejestracja nieudana',
  EMAIL_VERIFIED: 'Weryfikacja email',
  PASSWORD_CHANGED: 'Zmiana hasła',
  PASSWORD_RESET_REQUESTED: 'Reset hasła — żądanie',
  PASSWORD_RESET_SUCCESS: 'Reset hasła — sukces',
  PASSWORD_RESET_FAILED: 'Reset hasła — błąd',
  ACCOUNT_LOCKED: 'Konto zablokowane',
  ACCOUNT_UNLOCKED: 'Konto odblokowane',
  ACCOUNT_DEACTIVATED: 'Konto dezaktywowane',
  PROFILE_UPDATED: 'Profil zaktualizowany',
  TOKEN_REFRESHED: 'Token odświeżony',
  TOKEN_REVOKED: 'Token unieważniony',
  SUSPICIOUS_ACTIVITY: 'Podejrzana aktywność',
  RATE_LIMIT_EXCEEDED: 'Limit zapytań',
  INVALID_TOKEN: 'Nieprawidłowy token',
  CONTACT_FORM_SENT: 'Formularz kontaktowy — wysłano',
  CONTACT_FORM_FAILED: 'Formularz kontaktowy — błąd',
  PARTNER_UPLINE_ATTACHED: 'Partner podpięty pod lidera',
  PARTNER_UPLINE_DETACHED: 'Partner odpięty od lidera',
  PARTNER_STATUS_CHANGED: 'Zmiana statusu partnera',
  PARTNER_RANK_CHANGED: 'Zmiana poziomu partnera',
};

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [action, setAction] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, [page, search, severity, action, success]);

  useEffect(() => {
    loadStats();
    loadActions();
  }, []);

  async function apiCall(endpoint: string) {
    const token = getAuthToken();
    return fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  }

  async function loadLogs() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        ...(search && { search }),
        ...(severity && { severity }),
        ...(action && { action }),
        ...(success && { success }),
      });
      const res = await apiCall(`/admin/activity-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await apiCall('/admin/activity-log/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadActions() {
    try {
      const res = await apiCall('/admin/activity-log/actions');
      if (res.ok) setActions(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Teraz';
    if (mins < 60) return `${mins}m temu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h temu`;
    return `${Math.floor(hrs / 24)}d temu`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Activity className="w-7 h-7 text-orange-500" />
          Activity Log
        </h1>
        <p className="text-slate-400 mt-1">Historia aktywności i zdarzeń bezpieczeństwa</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Łącznie', value: stats.total, color: 'text-white' },
            { label: 'Ostatnie 24h', value: stats.last24h, color: 'text-blue-400' },
            { label: 'Ostatnie 7 dni', value: stats.last7d, color: 'text-green-400' },
            { label: 'Błędy (7d)', value: stats.failedLast7d, color: 'text-yellow-400' },
            { label: 'Krytyczne (7d)', value: stats.criticalLast7d, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-admin-card border border-admin-border rounded-lg p-4">
              <p className="text-xs text-slate-400">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top actions bar */}
      {stats && stats.topActions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {stats.topActions.slice(0, 6).map((a) => (
            <button
              key={a.action}
              onClick={() => { setAction(a.action); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                action === a.action
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                  : 'bg-admin-card border-admin-border text-slate-400 hover:text-white'
              }`}
            >
              {actionLabels[a.action] || a.action} ({a.count})
            </button>
          ))}
          {action && (
            <button
              onClick={() => { setAction(''); setPage(1); }}
              className="text-xs px-3 py-1.5 text-red-400 hover:text-red-300"
            >
              Wyczyść filtr
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Szukaj po emailu, IP, akcji..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
          />
        </div>
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="">Ważność</option>
          <option value="INFO">Info</option>
          <option value="WARNING">Ostrzeżenie</option>
          <option value="ERROR">Błąd</option>
          <option value="CRITICAL">Krytyczny</option>
        </select>
        <select
          value={success}
          onChange={(e) => { setSuccess(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-admin-card border border-admin-border rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="">Status</option>
          <option value="true">Sukces</option>
          <option value="false">Błąd</option>
        </select>
      </div>

      {/* Log entries */}
      <div className="bg-admin-card border border-admin-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-admin-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Czas</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Akcja</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Użytkownik</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Ważność</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
                    <p>Ładowanie...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Brak logów</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const sev = severityConfig[log.severity] || severityConfig.INFO;
                  const SevIcon = sev.icon;
                  return (
                    <tr key={log.id} className="border-b border-admin-border hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-300 whitespace-nowrap">{timeAgo(log.createdAt)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">{formatDate(log.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white">
                          {actionLabels[log.action] || log.action}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {log.user ? (
                          <div>
                            <p className="text-sm text-white">{log.user.firstName} {log.user.lastName}</p>
                            <p className="text-[10px] text-slate-500">{log.user.email}</p>
                          </div>
                        ) : log.email ? (
                          <p className="text-sm text-slate-300">{log.email}</p>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sev.color}`}>
                          <SevIcon className="w-3 h-3" />
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.success ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDetailLog(log)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Szczegóły"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
              Pokazuję {(page - 1) * 30 + 1}-{Math.min(page * 30, total)} z {total}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-300">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailLog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-admin-card border border-admin-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-admin-border">
              <h2 className="text-lg font-bold text-white">
                Szczegóły zdarzenia
              </h2>
              <button onClick={() => setDetailLog(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Akcja</p>
                  <p className="text-sm text-white font-medium">{actionLabels[detailLog.action] || detailLog.action}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Czas</p>
                  <p className="text-sm text-white">{formatDate(detailLog.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Użytkownik</p>
                  <p className="text-sm text-white">
                    {detailLog.user
                      ? `${detailLog.user.firstName} ${detailLog.user.lastName}`
                      : detailLog.email || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-sm text-white">{detailLog.email || detailLog.user?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className={`text-sm font-medium ${detailLog.success ? 'text-green-400' : 'text-red-400'}`}>
                    {detailLog.success ? 'Sukces' : 'Błąd'}
                  </p>
                </div>
              </div>
              {detailLog.userAgent && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">User Agent</p>
                  <p className="text-xs text-slate-300 bg-slate-800 rounded-lg p-3 break-all">{detailLog.userAgent}</p>
                </div>
              )}
              {detailLog.metadata && Object.keys(detailLog.metadata).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Metadata</p>
                  <pre className="text-xs text-slate-300 bg-slate-800 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(detailLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
