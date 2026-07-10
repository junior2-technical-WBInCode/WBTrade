'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { getAuthToken } from '@/lib/api';
import { useToast } from '@/lib/toast';
import {
  Clock,
  AlertTriangle,
  Send,
  X,
  CheckCircle,
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Package,
  Mail,
  Bell,
  Eye,
  XCircle,
  CheckSquare,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface DelayAlert {
  id: string;
  status: string;
  detectedAt: string;
  notifiedAt: string | null;
  messageType: string | null;
  customMessage: string | null;
  sentBy: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    estimatedDeliveryDate: string | null;
    shippingMethod: string;
    total: number;
    createdAt: string;
    userId: string | null;
    guestEmail: string | null;
    guestFirstName: string | null;
    guestLastName: string | null;
    user: { firstName: string; lastName: string; email: string } | null;
    items: { productName: string; quantity: number }[];
  };
}

interface Preset {
  id: string;
  name: string;
  description: string;
  content: string;
  includesDiscount?: boolean;
  discountPercent?: number | null;
  discountValidDays?: number | null;
}

type FilterStatus = 'all' | 'pending' | 'notified' | 'dismissed';

export default function DeliveryDelaysPage() {
  const [alerts, setAlerts] = useState<DelayAlert[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifiedCount, setNotifiedCount] = useState(0);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [alertHours, setAlertHours] = useState(24);
  const [savingSettings, setSavingSettings] = useState(false);

  // Notify modal
  const [selectedAlert, setSelectedAlert] = useState<DelayAlert | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPreset, setBulkPreset] = useState<string>('');
  const [bulkCustomMessage, setBulkCustomMessage] = useState('');
  const [bulkSending, setBulkSending] = useState(false);

  const { success, error: toastError } = useToast();

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(
        `${API_URL}/admin/delivery-delays?status=${filterStatus}&page=${page}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts);
        setPendingCount(data.pendingCount);
        setNotifiedCount(data.notifiedCount || 0);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (e) {
      console.error('Failed to fetch alerts:', e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  const fetchSettings = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/delivery-delays/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAlertHours(data.alertHours);
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  };

  const fetchPresets = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/delivery-delays/presets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets);
        // Default to first template
        if (data.presets.length > 0) {
          setSelectedPreset((prev) => prev || data.presets[0].id);
          setBulkPreset((prev) => prev || data.presets[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch presets:', e);
    }
  };

  useEffect(() => { fetchAlerts(); setSelectedIds(new Set()); }, [fetchAlerts]);
  useEffect(() => { fetchSettings(); fetchPresets(); }, []);

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/delivery-delays/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alertHours }),
      });
      if (res.ok) {
        success('Ustawienia zapisane', `Próg alertu: ${alertHours}h`);
      } else {
        toastError('Błąd', 'Nie udało się zapisać ustawień');
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się zapisać ustawień');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleNotify = async () => {
    if (!selectedAlert) return;
    try {
      setSending(true);
      const token = getAuthToken();
      const body: any = { messageType: selectedPreset };
      if (selectedPreset === 'custom') {
        body.customMessage = customMessage;
      }
      const res = await fetch(`${API_URL}/admin/delivery-delays/${selectedAlert.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        success('Powiadomienie wysłane', `Zamówienie #${selectedAlert.order.orderNumber}`);
        setSelectedAlert(null);
        fetchAlerts();
      } else {
        toastError('Błąd', data.message || 'Nie udało się wysłać');
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się wysłać powiadomienia');
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = async (alertId: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/delivery-delays/${alertId}/dismiss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        success('Alert odrzucony');
        fetchAlerts();
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się odrzucić alertu');
    }
  };

  const handleManualDetect = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/delivery-delays/detect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        success('Wykrywanie zakończone', `Nowe alerty: ${data.detected}, pominięte: ${data.skipped}`);
        fetchAlerts();
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się uruchomić wykrywania');
    }
  };

  // Bulk actions
  const pendingAlerts = alerts.filter((a) => a.status === 'pending');
  const allPendingSelected = pendingAlerts.length > 0 && pendingAlerts.every((a) => selectedIds.has(a.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingAlerts.map((a) => a.id)));
    }
  };

  const handleBulkNotify = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBulkSending(true);
      const token = getAuthToken();
      const body: Record<string, unknown> = { alertIds: [...selectedIds], messageType: bulkPreset };
      if (bulkPreset === 'custom') body.customMessage = bulkCustomMessage;
      const res = await fetch(`${API_URL}/admin/delivery-delays/bulk-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        success('Masowe powiadomienie', `Wysłano: ${data.successCount}${data.failCount ? `, błędy: ${data.failCount}` : ''}`);
        setShowBulkModal(false);
        setSelectedIds(new Set());
        fetchAlerts();
      } else {
        toastError('Błąd', data.message || 'Nie udało się wysłać');
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się wysłać powiadomień');
    } finally {
      setBulkSending(false);
    }
  };

  const handleBulkDismiss = async () => {
    if (selectedIds.size === 0) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/delivery-delays/bulk-dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alertIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (res.ok) {
        success('Masowe odrzucenie', `Odrzucono: ${data.successCount}`);
        setSelectedIds(new Set());
        fetchAlerts();
      } else {
        toastError('Błąd', data.message || 'Nie udało się odrzucić');
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się odrzucić alertów');
    }
  };

  const getCustomerName = (order: DelayAlert['order']) => {
    if (order.user) return `${order.user.firstName} ${order.user.lastName}`;
    return `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim() || 'Gość';
  };

  const getCustomerEmail = (order: DelayAlert['order']) => {
    return order.user?.email || order.guestEmail || '—';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Oczekuje</span>;
      case 'notified': return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Powiadomiony</span>;
      case 'dismissed': return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Odrzucony</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{status}</span>;
    }
  };

  const getPresetContent = (presetId: string, orderNumber: string) => {
    if (presetId === 'custom') return customMessage;
    const preset = presets.find((p) => p.id === presetId);
    return preset?.content.replace(/\{orderNumber\}/g, orderNumber) || '';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Opóźnienia dostaw</h1>
            <p className="text-sm text-slate-400">
              {pendingCount > 0
                ? `${pendingCount} alert${pendingCount === 1 ? '' : 'ów'} oczekuje na reakcję`
                : 'Brak oczekujących alertów'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleManualDetect}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Wykryj teraz
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Ustawienia
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            Konfiguracja progu alertu
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            System wygeneruje alert na określoną liczbę godzin przed planowaną datą dostawy, jeśli paczka nie została wysłana.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={alertHours}
              onChange={(e) => setAlertHours(Number(e.target.value))}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="6">6 godzin</option>
              <option value="12">12 godzin</option>
              <option value="24">24 godziny (1 dzień)</option>
              <option value="48">48 godzin (2 dni)</option>
              <option value="72">72 godziny (3 dni)</option>
            </select>
            <span className="text-sm text-slate-400">przed planowaną datą dostawy</span>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="ml-auto px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {savingSettings ? 'Zapisuję...' : 'Zapisz'}
            </button>
          </div>
        </div>
      )}

      {/* Kafelki statusów */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {/* Oczekujące */}
        <button
          onClick={() => { setFilterStatus('pending'); setPage(1); }}
          className={`relative p-4 rounded-xl border transition-all text-left ${
            filterStatus === 'pending'
              ? 'bg-orange-500/10 border-orange-500/40 ring-1 ring-orange-500/20'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            </div>
            <span className="text-2xl font-bold text-white">{pendingCount}</span>
          </div>
          <div className="text-xs font-medium text-slate-400">Oczekujące</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Wymagają reakcji</div>
          {pendingCount > 0 && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
          )}
        </button>

        {/* Wysłane — powiadomione */}
        <button
          onClick={() => { setFilterStatus('notified'); setPage(1); }}
          className={`relative p-4 rounded-xl border transition-all text-left ${
            filterStatus === 'notified'
              ? 'bg-green-500/10 border-green-500/40 ring-1 ring-green-500/20'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Send className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-2xl font-bold text-white">{notifiedCount}</span>
          </div>
          <div className="text-xs font-medium text-slate-400">Wysłane alerty</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Klient powiadomiony</div>
        </button>

        {/* Odrzucone */}
        <button
          onClick={() => { setFilterStatus('dismissed'); setPage(1); }}
          className={`p-4 rounded-xl border transition-all text-left ${
            filterStatus === 'dismissed'
              ? 'bg-slate-500/10 border-slate-500/40 ring-1 ring-slate-500/20'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-slate-600/30 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div className="text-xs font-medium text-slate-400">Odrzucone</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Zamknięte bez powiadomienia</div>
        </button>

        {/* Wszystkie */}
        <button
          onClick={() => { setFilterStatus('all'); setPage(1); }}
          className={`p-4 rounded-xl border transition-all text-left ${
            filterStatus === 'all'
              ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <div className="text-xs font-medium text-slate-400">Wszystkie</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Pełna historia</div>
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Ładowanie...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-white font-medium">Brak alertów</p>
          <p className="text-sm text-slate-400 mt-1">Wszystkie dostawy na czas</p>
        </div>
      ) : (
        <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                {filterStatus === 'pending' && (
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={toggleSelectAll}
                      className="accent-orange-500 w-4 h-4 rounded cursor-pointer"
                      title="Zaznacz wszystkie"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Zamówienie</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Klient</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Planowana dostawa</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Status zamówienia</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Status alertu</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Wykryto</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <Fragment key={alert.id}>
                <tr className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors ${selectedIds.has(alert.id) ? 'bg-orange-500/5' : ''}`}>
                  {filterStatus === 'pending' && (
                    <td className="px-3 py-3 w-10">
                      {alert.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(alert.id)}
                          onChange={() => toggleSelect(alert.id)}
                          className="accent-orange-500 w-4 h-4 rounded cursor-pointer"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-white">#{alert.order.orderNumber}</div>
                    <div className="text-xs text-slate-400">{Number(alert.order.total).toFixed(2)} zł</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{getCustomerName(alert.order)}</div>
                    <div className="text-xs text-slate-400">{getCustomerEmail(alert.order)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{formatDate(alert.order.estimatedDeliveryDate)}</div>
                    <div className="text-xs text-slate-400">{alert.order.shippingMethod}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                      {alert.order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(alert.status)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDate(alert.detectedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {alert.status === 'pending' && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setSelectedAlert(alert); setSelectedPreset(presets[0]?.id || ''); setCustomMessage(''); }}
                          className="p-1.5 rounded-lg hover:bg-orange-500/20 text-orange-400 transition-colors"
                          title="Wyślij powiadomienie"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDismiss(alert.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 transition-colors"
                          title="Odrzuć alert"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {alert.status === 'notified' && (
                      <button
                        onClick={() => setExpandedAlertId(expandedAlertId === alert.id ? null : alert.id)}
                        className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Szczegóły
                        {expandedAlertId === alert.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </td>
                </tr>
                {/* Expanded detail row for notified alerts */}
                {alert.status === 'notified' && expandedAlertId === alert.id && (
                  <tr className="bg-green-500/5 border-b border-slate-700/50">
                    <td colSpan={filterStatus === 'pending' ? 8 : 7} className="px-4 py-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                            <Send className="w-3 h-3" /> Wysłano
                          </div>
                          <div className="text-white">
                            {alert.notifiedAt ? new Date(alert.notifiedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                            <Mail className="w-3 h-3" /> Odbiorca
                          </div>
                          <div className="text-white">{getCustomerName(alert.order)}</div>
                          <div className="text-xs text-slate-400">{getCustomerEmail(alert.order)}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Typ wiadomości</div>
                          <div className="text-white">
                            {alert.messageType === 'custom'
                              ? 'Własna wiadomość'
                              : presets.find((p) => p.id === alert.messageType)?.name || alert.messageType || '—'}
                          </div>
                        </div>
                      </div>
                      {alert.messageType === 'custom' && alert.customMessage && (
                        <div className="mt-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                          <div className="text-xs font-semibold text-slate-400 mb-1">Treść wiadomości:</div>
                          <div className="text-sm text-slate-300 whitespace-pre-wrap">{alert.customMessage}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-slate-700">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white disabled:opacity-30"
              >
                ← Poprzednia
              </button>
              <span className="text-sm text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white disabled:opacity-30"
              >
                Następna →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 text-sm text-white">
            <CheckSquare className="w-4 h-4 text-orange-400" />
            <span className="font-medium">{selectedIds.size}</span>
            <span className="text-slate-400">zaznaczonych</span>
          </div>
          <div className="w-px h-6 bg-slate-600" />
          <button
            onClick={() => { setShowBulkModal(true); setBulkPreset(presets[0]?.id || ''); setBulkCustomMessage(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            <Send className="w-4 h-4" />
            Wyślij alerty ({selectedIds.size})
          </button>
          <button
            onClick={handleBulkDismiss}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Odrzuć
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"
            title="Odznacz wszystkie"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Notify Modal */}
      {showBulkModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowBulkModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl relative flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowBulkModal(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto flex-1 min-h-0">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-500/20 rounded-lg flex items-center justify-center">
                    <Send className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Masowe powiadomienie</h2>
                    <p className="text-sm text-slate-400">{selectedIds.size} zamówień</p>
                  </div>
                </div>
              </div>

              {/* Selected orders list */}
              <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Zamówienia do powiadomienia</h3>
                <div className="flex flex-wrap gap-2">
                  {alerts.filter((a) => selectedIds.has(a.id)).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg text-xs">
                      <span className="text-white font-medium">#{a.order.orderNumber}</span>
                      <span className="text-slate-400">{getCustomerName(a.order)}</span>
                      <span className="text-slate-500">{getCustomerEmail(a.order)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preset selection */}
              <div className="px-6 py-4">
                <h3 className="text-sm font-semibold text-white mb-3">Wybierz treść wiadomości dla wszystkich</h3>
                <div className="space-y-2">
                  {presets.map((preset) => (
                    <label
                      key={preset.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        bulkPreset === preset.id
                          ? 'border-orange-500/50 bg-orange-500/5'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="bulkPreset"
                        value={preset.id}
                        checked={bulkPreset === preset.id}
                        onChange={() => setBulkPreset(preset.id)}
                        className="mt-0.5 accent-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-white">{preset.name}</div>
                          {preset.includesDiscount && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                              -{preset.discountPercent}% rabat
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{preset.description}</div>
                      </div>
                    </label>
                  ))}

                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      bulkPreset === 'custom'
                        ? 'border-orange-500/50 bg-orange-500/5'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulkPreset"
                      value="custom"
                      checked={bulkPreset === 'custom'}
                      onChange={() => setBulkPreset('custom')}
                      className="mt-0.5 accent-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">Własna wiadomość</div>
                      <div className="text-xs text-slate-400 mt-0.5">Wpisz własną treść dla wszystkich</div>
                    </div>
                  </label>

                  {bulkPreset === 'custom' && (
                    <textarea
                      value={bulkCustomMessage}
                      onChange={(e) => setBulkCustomMessage(e.target.value)}
                      placeholder="Wpisz treść wiadomości...&#10;Użyj {orderNumber} aby wstawić numer zamówienia"
                      rows={6}
                      className="w-full mt-2 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500 resize-none"
                    />
                  )}
                </div>

                <div className="flex items-start gap-2 mt-4 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-slate-300">
                    Wybrana wiadomość zostanie wysłana do <strong className="text-white">{selectedIds.size}</strong> klientów.
                    Każdy klient otrzyma email z numerem swojego zamówienia.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 shrink-0">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleBulkNotify}
                disabled={bulkSending || (bulkPreset === 'custom' && !bulkCustomMessage.trim())}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {bulkSending ? 'Wysyłam...' : `Wyślij do ${selectedIds.size} klientów`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Notify Modal — rendered via portal to bypass .page-enter transform */}
      {selectedAlert && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setSelectedAlert(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl relative flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {/* Sticky close button */}
            <button
              onClick={() => setSelectedAlert(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 min-h-0">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <Send className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Wyślij powiadomienie</h2>
                  <p className="text-sm text-slate-400">Zamówienie #{selectedAlert.order.orderNumber}</p>
                </div>
              </div>
            </div>

            {/* Order Info */}
            <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">Klient:</span>{' '}
                  <span className="text-white">{getCustomerName(selectedAlert.order)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Email:</span>{' '}
                  <span className="text-white">{getCustomerEmail(selectedAlert.order)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Planowana dostawa:</span>{' '}
                  <span className="text-white">{formatDate(selectedAlert.order.estimatedDeliveryDate)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Wysyłka:</span>{' '}
                  <span className="text-white">{selectedAlert.order.shippingMethod}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">Produkty:</span>{' '}
                  <span className="text-white">
                    {selectedAlert.order.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Preset Selection */}
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-white mb-3">Wybierz treść wiadomości</h3>
              <div className="space-y-2">
                {presets.map((preset) => (
                  <label
                    key={preset.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedPreset === preset.id
                        ? 'border-orange-500/50 bg-orange-500/5'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preset"
                      value={preset.id}
                      checked={selectedPreset === preset.id}
                      onChange={() => setSelectedPreset(preset.id)}
                      className="mt-0.5 accent-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-white">{preset.name}</div>
                        {preset.includesDiscount && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                            -{preset.discountPercent}% rabat
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{preset.description}</div>
                      {/* Preview toggle */}
                      <button
                        onClick={(e) => { e.preventDefault(); setPreviewExpanded(previewExpanded === preset.id ? null : preset.id); }}
                        className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 mt-1"
                      >
                        <Eye className="w-3 h-3" />
                        {previewExpanded === preset.id ? 'Ukryj podgląd' : 'Podgląd'}
                        {previewExpanded === preset.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {previewExpanded === preset.id && (
                        <div className="mt-2 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-300 whitespace-pre-wrap border border-slate-700">
                          {getPresetContent(preset.id, selectedAlert.order.orderNumber)}
                        </div>
                      )}
                    </div>
                  </label>
                ))}

                {/* Custom message option */}
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedPreset === 'custom'
                      ? 'border-orange-500/50 bg-orange-500/5'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    value="custom"
                    checked={selectedPreset === 'custom'}
                    onChange={() => setSelectedPreset('custom')}
                    className="mt-0.5 accent-orange-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">Własna wiadomość</div>
                    <div className="text-xs text-slate-400 mt-0.5">Wpisz własną treść powiadomienia</div>
                  </div>
                </label>

                {selectedPreset === 'custom' && (
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Wpisz treść wiadomości dla klienta..."
                    rows={6}
                    className="w-full mt-2 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500 resize-none"
                  />
                )}
              </div>

              {/* Info about notification channels */}
              <div className="flex items-start gap-2 mt-4 p-3 bg-slate-700/30 rounded-lg">
                <Bell className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div className="text-xs text-slate-400">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-3 h-3" />
                    <span>Email zostanie wysłany na adres: <strong className="text-slate-300">{getCustomerEmail(selectedAlert.order)}</strong></span>
                  </div>
                  {selectedAlert.order.userId && (
                    <div className="flex items-center gap-2">
                      <Package className="w-3 h-3" />
                      <span>Powiadomienie in-app pojawi się w panelu klienta</span>
                    </div>
                  )}
                  {!selectedAlert.order.userId && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Package className="w-3 h-3" />
                      <span>Zamówienie gościa — tylko email (brak konta)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>{/* end scrollable content */}

            {/* Footer - always visible at bottom */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 shrink-0">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
              >
                Zamknij
              </button>
              <button
                onClick={() => handleDismiss(selectedAlert.id).then(() => setSelectedAlert(null))}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
              >
                Odrzuć alert
              </button>
              <button
                onClick={handleNotify}
                disabled={sending || (selectedPreset === 'custom' && !customMessage.trim())}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Wysyłam...' : 'Wyślij powiadomienie'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
