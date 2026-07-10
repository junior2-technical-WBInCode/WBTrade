'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Download,
  Database,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ============================================
// Types
// ============================================

interface StockSyncLog {
  id: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  itemsProcessed: number;
  itemsChanged: number;
  errors: string[] | null;
  startedAt: string;
  completedAt: string | null;
}

interface StockSyncLogDetail extends StockSyncLog {
  changedSkus: { sku: string; oldQty: number; newQty: number; inventory: string }[] | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================
// API
// ============================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

async function apiRequest<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function downloadFile(url: string, token: string) {
  // Use fetch + blob so we can send auth header
  fetch(`${API_URL}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.blob())
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      // Extract filename from URL
      const date = new Date().toISOString().slice(0, 10);
      a.download = `stock-sync-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
}

// ============================================
// Status Badge
// ============================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    SUCCESS: { color: 'bg-green-500/20 text-green-400', icon: <CheckCircle2 className="w-4 h-4" />, label: 'Sukces' },
    FAILED: { color: 'bg-red-500/20 text-red-400', icon: <XCircle className="w-4 h-4" />, label: 'Błąd' },
    RUNNING: { color: 'bg-blue-500/20 text-blue-400', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'W trakcie' },
    PENDING: { color: 'bg-yellow-500/20 text-yellow-400', icon: <Clock className="w-4 h-4" />, label: 'Oczekuje' },
  };

  const { color, icon, label } = config[status] || { color: 'bg-gray-500/20 text-gray-400', icon: null, label: status };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      {icon}
      {label}
    </span>
  );
}

// ============================================
// Format Helpers
// ============================================

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(startedAt: string, completedAt: string | null) {
  if (!completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

// ============================================
// Main Component
// ============================================

export default function StockSyncPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<StockSyncLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [logDetail, setLogDetail] = useState<StockSyncLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadLogs = useCallback(
    async (page = 1) => {
      if (!token) return;
      setLoading(true);
      try {
        const data = await apiRequest<{ logs: StockSyncLog[]; pagination: Pagination }>(
          `/admin/baselinker/stock-sync-logs?page=${page}&limit=20`,
          token
        );
        setLogs(data.logs);
        setPagination(data.pagination);
      } catch (err) {
        console.error('Failed to load stock sync logs:', err);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const loadLogDetail = useCallback(
    async (logId: string) => {
      if (!token) return;
      setLoadingDetail(true);
      try {
        const data = await apiRequest<{ log: StockSyncLogDetail }>(
          `/admin/baselinker/stock-sync-logs/${logId}`,
          token
        );
        setLogDetail(data.log);
      } catch (err) {
        console.error('Failed to load log detail:', err);
      } finally {
        setLoadingDetail(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleExpand = (logId: string) => {
    if (expandedLog === logId) {
      setExpandedLog(null);
      setLogDetail(null);
    } else {
      setExpandedLog(logId);
      loadLogDetail(logId);
    }
  };

  const handleExport = (logId: string) => {
    if (!token) return;
    downloadFile(`/admin/baselinker/stock-sync-logs/${logId}/export`, token);
  };

  // Stats from latest sync
  const latestLog = logs[0];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-7 h-7 text-orange-500" />
            Synchronizacja stanów magazynowych
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Historia automatycznych synchronizacji stanów z BaseLinker (codziennie o 00:00)
          </p>
        </div>
        <button
          onClick={() => loadLogs(pagination.page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-admin-card border border-admin-border rounded-lg hover:bg-admin-hover transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Odśwież
        </button>
      </div>

      {/* Summary Cards */}
      {latestLog && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-admin-card border border-admin-border rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Ostatnia synchronizacja</p>
            <p className="text-lg font-semibold mt-1">{formatDate(latestLog.startedAt)}</p>
          </div>
          <div className="bg-admin-card border border-admin-border rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Status</p>
            <div className="mt-2">
              <StatusBadge status={latestLog.status} />
            </div>
          </div>
          <div className="bg-admin-card border border-admin-border rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Przetworzono</p>
            <p className="text-lg font-semibold mt-1">{latestLog.itemsProcessed.toLocaleString('pl-PL')}</p>
          </div>
          <div className="bg-admin-card border border-admin-border rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Zmienionych stanów</p>
            <p className="text-lg font-semibold mt-1 text-orange-400">{latestLog.itemsChanged.toLocaleString('pl-PL')}</p>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-admin-card border border-admin-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-admin-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5 text-gray-400" />
            Historia synchronizacji
          </h2>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Brak zapisów synchronizacji</p>
            <p className="text-sm mt-1">Pierwsze dane pojawią się po północy</p>
          </div>
        ) : (
          <div className="divide-y divide-admin-border">
            {logs.map((log) => (
              <div key={log.id}>
                {/* Row */}
                <div
                  className="flex items-center gap-4 px-6 py-4 hover:bg-admin-hover transition-colors cursor-pointer"
                  onClick={() => handleExpand(log.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={log.status} />
                      <span className="text-sm text-gray-300">{formatDate(log.startedAt)}</span>
                      <span className="text-xs text-gray-500">
                        ({formatDuration(log.startedAt, log.completedAt)})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <span className="text-gray-400">Przetw.: </span>
                      <span className="font-medium">{log.itemsProcessed.toLocaleString('pl-PL')}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400">Zmian: </span>
                      <span className="font-medium text-orange-400">{log.itemsChanged.toLocaleString('pl-PL')}</span>
                    </div>
                    {log.errors && (log.errors as string[]).length > 0 && (
                      <div className="text-right">
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {(log.errors as string[]).length}
                        </span>
                      </div>
                    )}
                    {log.itemsChanged > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExport(log.id);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors text-xs font-medium"
                        title="Pobierz CSV ze zmienionymi SKU"
                      >
                        <Download className="w-3.5 h-3.5" />
                        CSV
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {expandedLog === log.id && (
                  <div className="px-6 pb-4 bg-admin-bg/50">
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                      </div>
                    ) : logDetail?.changedSkus && logDetail.changedSkus.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-300">
                            Zmienione produkty ({logDetail.changedSkus.length.toLocaleString('pl-PL')})
                          </h3>
                          <button
                            onClick={() => handleExport(log.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors text-xs font-medium"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Pobierz pełną listę (CSV)
                          </button>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-admin-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-admin-card text-gray-400 text-xs uppercase tracking-wider">
                                <th className="text-left px-4 py-2.5">SKU</th>
                                <th className="text-right px-4 py-2.5">Stary stan</th>
                                <th className="text-right px-4 py-2.5">Nowy stan</th>
                                <th className="text-right px-4 py-2.5">Zmiana</th>
                                <th className="text-left px-4 py-2.5">Magazyn</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-admin-border">
                              {logDetail.changedSkus.slice(0, 50).map((item, idx) => {
                                const diff = item.newQty - item.oldQty;
                                return (
                                  <tr key={idx} className="hover:bg-admin-hover transition-colors">
                                    <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                                    <td className="px-4 py-2 text-right text-gray-400">{item.oldQty}</td>
                                    <td className="px-4 py-2 text-right font-medium">{item.newQty}</td>
                                    <td className="px-4 py-2 text-right">
                                      <span
                                        className={`inline-flex items-center gap-1 ${
                                          diff > 0 ? 'text-green-400' : 'text-red-400'
                                        }`}
                                      >
                                        {diff > 0 ? (
                                          <TrendingUp className="w-3.5 h-3.5" />
                                        ) : (
                                          <TrendingDown className="w-3.5 h-3.5" />
                                        )}
                                        {diff > 0 ? '+' : ''}{diff}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-400">{item.inventory}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {logDetail.changedSkus.length > 50 && (
                            <div className="px-4 py-3 text-center text-xs text-gray-400 bg-admin-card border-t border-admin-border">
                              Pokazano 50 z {logDetail.changedSkus.length.toLocaleString('pl-PL')} zmian.
                              Pobierz CSV aby zobaczyć wszystkie.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        {log.status === 'SUCCESS' && log.itemsChanged === 0
                          ? 'Brak zmian stanów — wszystkie produkty były aktualne'
                          : 'Brak szczegółowych danych dla tej synchronizacji'}
                      </div>
                    )}

                    {/* Errors */}
                    {logDetail?.errors && (logDetail.errors as string[]).length > 0 && (
                      <div className="mt-4">
                        <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" />
                          Błędy ({(logDetail.errors as string[]).length})
                        </h3>
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                          {(logDetail.errors as string[]).slice(0, 10).map((err, idx) => (
                            <p key={idx} className="text-xs text-red-300 font-mono">
                              {err}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-admin-border text-sm">
            <span className="text-gray-400">
              Strona {pagination.page} z {pagination.totalPages} (łącznie {pagination.total})
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => loadLogs(pagination.page - 1)}
                className="px-3 py-1.5 bg-admin-bg border border-admin-border rounded-lg hover:bg-admin-hover transition-colors disabled:opacity-40"
              >
                Poprzednia
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadLogs(pagination.page + 1)}
                className="px-3 py-1.5 bg-admin-bg border border-admin-border rounded-lg hover:bg-admin-hover transition-colors disabled:opacity-40"
              >
                Następna
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
