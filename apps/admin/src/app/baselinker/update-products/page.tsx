'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw,
  Package,
  Play,
  Square,
  CheckCircle2,
  Loader2,
  XCircle,
  Shield,
  ArrowLeft,
  Terminal,
  Info,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

// ============================================
// Types
// ============================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface ProgressEvent {
  syncLogId: string;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'progress' | 'phase' | 'complete' | 'aborted';
  message: string;
  phase?: string;
  current?: number;
  total?: number;
  percent?: number;
  mode?: string;
}

interface SyncStats {
  processed: number;
  total: number;
  warnings: number;
  errors: number;
  percent: number;
  phase: string;
  startedAt: Date | null;
}

interface InventoryItem {
  inventory_id: number;
  name: string;
  description?: string;
}

type SyncState = 'idle' | 'running' | 'completed' | 'error' | 'aborted';

// ============================================
// Helpers
// ============================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(start: Date): string {
  const diff = Math.floor((Date.now() - start.getTime()) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    init: 'Inicjalizacja',
    categories: 'Kategorie',
    products: 'Produkty',
    stock: 'Stany magazynowe',
    images: 'Obrazy',
    reindex: 'Wyszukiwarka',
  };
  return labels[phase] || phase;
}

// ============================================
// Terminal Line
// ============================================

function TerminalLine({ event }: { event: ProgressEvent }) {
  const colors: Record<string, string> = {
    info: 'text-gray-300',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-green-400',
    progress: 'text-blue-400',
    phase: 'text-cyan-400 font-semibold',
    complete: 'text-green-400 font-bold',
    aborted: 'text-orange-400 font-bold',
  };

  const icons: Record<string, string> = {
    info: '›',
    warning: '⚠',
    error: '✗',
    success: '✓',
    progress: '⟳',
    phase: '▸',
    complete: '★',
    aborted: '■',
  };

  const time = new Date(event.timestamp).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className={`flex gap-2 text-xs font-mono leading-relaxed ${colors[event.type] || 'text-gray-400'}`}>
      <span className="text-gray-600 select-none shrink-0">{time}</span>
      <span className="select-none shrink-0">{icons[event.type] || '·'}</span>
      <span className="break-all">{event.message}</span>
    </div>
  );
}

// ============================================
// Progress Bar
// ============================================

function ProgressBar({ percent, phase }: { percent: number; phase: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{phaseLabel(phase)}</span>
        <span className="text-white font-medium">{Math.min(percent, 100)}%</span>
      </div>
      <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function UpdateProductsPage() {
  const { token } = useAuth();

  // Inventory state
  const [inventories, setInventories] = useState<InventoryItem[]>([]);

  // Sync state
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [selectedInventoryName, setSelectedInventoryName] = useState<string>('');
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [stats, setStats] = useState<SyncStats>({
    processed: 0, total: 0, warnings: 0, errors: 0, percent: 0, phase: '', startedAt: null,
  });
  const [elapsedTime, setElapsedTime] = useState('');

  // UI
  const [autoScroll, setAutoScroll] = useState(true);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);

  // Refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const syncStateRef = useRef<SyncState>('idle');

  useEffect(() => { syncStateRef.current = syncState; }, [syncState]);

  // ============================================
  // Our warehouses (only ones that exist in DB)
  // ============================================
  const OUR_WAREHOUSES: InventoryItem[] = [
    { inventory_id: 22952, name: 'Leker' },
    { inventory_id: 22953, name: 'Forcetop' },
    { inventory_id: 22954, name: 'Hurtownia Przemysłowa' },
  ];

  useEffect(() => {
    setInventories(OUR_WAREHOUSES);
  }, []);

  // ============================================
  // Timer
  // ============================================
  useEffect(() => {
    if (syncState !== 'running' || !stats.startedAt) return;
    const interval = setInterval(() => {
      setElapsedTime(formatDuration(stats.startedAt!));
    }, 1000);
    return () => clearInterval(interval);
  }, [syncState, stats.startedAt]);

  // ============================================
  // Auto-scroll
  // ============================================
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // ============================================
  // SSE
  // ============================================
  const connectSSE = useCallback(
    (logId: string) => {
      const stored = localStorage.getItem('admin_auth_tokens');
      const currentToken = stored ? JSON.parse(stored).accessToken : token;
      if (!currentToken) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `${API_URL}/admin/baselinker/sync/progress/${logId}?token=${currentToken}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (msg) => {
        try {
          const event: ProgressEvent = JSON.parse(msg.data);

          setEvents((prev) => {
            const next = [...prev, event];
            return next.length > 2000 ? next.slice(-2000) : next;
          });

          setStats((prev) => {
            const next = { ...prev };
            if (event.type === 'warning') next.warnings++;
            if (event.type === 'error') next.errors++;
            if (event.current !== undefined) next.processed = event.current;
            if (event.total !== undefined) next.total = event.total;
            if (event.percent !== undefined) next.percent = event.percent;
            if (event.phase) next.phase = event.phase;
            return next;
          });

          if (event.type === 'complete') {
            setSyncState('completed');
          } else if (event.type === 'aborted' && !event.message.includes('żądane')) {
            setSyncState('aborted');
          } else if (event.type === 'error' && event.message.startsWith('Błąd synchronizacji:')) {
            setSyncState('error');
          }
        } catch {
          // heartbeat
        }
      };

      es.onerror = () => {
        if (syncStateRef.current === 'running') {
          setTimeout(() => {
            if (eventSourceRef.current === es) connectSSE(logId);
          }, 3000);
        }
      };
    },
    [token]
  );

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  // ============================================
  // Check for running sync on page load
  // ============================================
  useEffect(() => {
    if (!token) return;
    const checkRunningSync = async () => {
      try {
        const res = await fetch(`${API_URL}/admin/baselinker/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.currentSync && data.currentSync.status === 'RUNNING' && data.currentSync.type === 'PRODUCTS') {
          setSyncLogId(data.currentSync.id);
          setSyncState('running');
          setStats((prev) => ({ ...prev, startedAt: new Date(data.currentSync.startedAt), phase: 'init' }));
          connectSSE(data.currentSync.id);
        }
      } catch (err) {
        console.error('Failed to check running sync:', err);
      }
    };
    checkRunningSync();
  }, [token, connectSSE]);

  // ============================================
  // Start sync
  // ============================================
  const startSync = async (inventoryId: string, inventoryName: string) => {
    if (!token) return;

    setSelectedInventoryId(inventoryId);
    setSelectedInventoryName(inventoryName);
    setSyncState('running');
    setEvents([]);
    setStats({ processed: 0, total: 0, warnings: 0, errors: 0, percent: 0, phase: 'init', startedAt: new Date() });
    setElapsedTime('0s');

    try {
      const res = await fetch(`${API_URL}/admin/direct-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inventoryId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Nie udało się uruchomić synchronizacji');
      }

      setSyncLogId(data.syncLogId);
      connectSSE(data.syncLogId);
    } catch (err) {
      setSyncState('error');
      setEvents((prev) => [
        ...prev,
        {
          syncLogId: '',
          timestamp: new Date().toISOString(),
          type: 'error',
          message: `Nie udało się uruchomić: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ]);
    }
  };

  // ============================================
  // Abort
  // ============================================
  const handleAbort = async () => {
    if (!token || !syncLogId) return;
    try {
      await fetch(`${API_URL}/admin/baselinker/sync/${syncLogId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch {
      // UI will show aborting state regardless
    }
  };

  // ============================================
  // Reset
  // ============================================
  const resetSync = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setSyncState('idle');
    setSyncLogId(null);
    setSelectedInventoryId(null);
    setSelectedInventoryName('');
    setEvents([]);
    setStats({ processed: 0, total: 0, warnings: 0, errors: 0, percent: 0, phase: '', startedAt: null });
    setElapsedTime('');
  };

  // ============================================
  // Display
  // ============================================
  const displayEvents = showOnlyIssues
    ? events.filter((e) => e.type === 'warning' || e.type === 'error')
    : events;

  const statusConfig: Record<SyncState, { label: string; color: string; icon: React.ReactNode }> = {
    idle: { label: 'Gotowy', color: 'text-gray-400', icon: null },
    running: { label: 'W trakcie...', color: 'text-blue-400', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    completed: { label: 'Zakończony', color: 'text-green-400', icon: <CheckCircle2 className="w-4 h-4" /> },
    error: { label: 'Błąd', color: 'text-red-400', icon: <XCircle className="w-4 h-4" /> },
    aborted: { label: 'Przerwany', color: 'text-orange-400', icon: <Square className="w-4 h-4" /> },
  };

  const currentStatus = statusConfig[syncState];

  // Warehouse color/icon mapping
  const warehouseColors: Record<string, { bg: string; border: string; text: string; hover: string }> = {
    'Leker': { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', hover: 'hover:border-blue-400 hover:bg-blue-500/30' },
    'Forcetop': { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', hover: 'hover:border-orange-400 hover:bg-orange-500/30' },
    'Hurtownia Przemysłowa': { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', hover: 'hover:border-green-400 hover:bg-green-500/30' },
  };

  const defaultColor = { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', hover: 'hover:border-purple-400 hover:bg-purple-500/30' };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/baselinker"
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Aktualizacja produktów</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Zaktualizuj istniejące produkty z wybranego magazynu
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 ${currentStatus.color}`}>
          {currentStatus.icon}
          <span className="text-sm font-medium">{currentStatus.label}</span>
          {syncState === 'running' && elapsedTime && (
            <span className="text-xs text-gray-500 ml-1">({elapsedTime})</span>
          )}
        </div>
      </div>

      {/* Warehouse Buttons — shown only when idle */}
      {syncState === 'idle' && (
        <div className="space-y-4">
          {inventories.length === 0 ? (
            <div className="bg-gray-800 border border-red-500/30 rounded-xl p-6 text-center">
              <p className="text-red-400">Nie znaleziono magazynów. Sprawdź konfigurację Baselinker.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {inventories.map((inv) => {
                  const colors = warehouseColors[inv.name] || defaultColor;
                  return (
                    <button
                      key={inv.inventory_id}
                      onClick={() => startSync(inv.inventory_id.toString(), inv.name)}
                      className={`group bg-gray-800 border ${colors.border} ${colors.hover} rounded-xl p-6 text-left transition-all duration-200`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${colors.bg} transition-colors`}>
                          <Package className={`w-7 h-7 ${colors.text}`} />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">
                            {inv.name}
                          </h3>
                          <p className="text-sm text-gray-400">
                            ID: {inv.inventory_id}
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                            <Play className="w-3.5 h-3.5" />
                            <span>Kliknij, aby zaktualizować produkty</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 text-xs text-blue-400/90 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Tryb aktualizacji:</span>{' '}
                  Aktualizowane są tylko produkty już istniejące w bazie. Nazwy, opisy, SKU, EAN i stany magazynowe zostaną zaktualizowane. Istniejące tagi, kategorie i ceny promocyjne pozostaną bez zmian.
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Produkty przetwarzane w partiach po 10. Możesz przerwać operację w dowolnym momencie — dotychczasowe zmiany zostaną zachowane.</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Active sync */}
      {syncState !== 'idle' && (
        <div className="space-y-4">
          {/* Sync info bar */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <RefreshCw className={`w-5 h-5 text-blue-400 ${syncState === 'running' ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h3 className="text-white font-medium">
                    Aktualizacja: {selectedInventoryName}
                  </h3>
                  {stats.startedAt && (
                    <p className="text-xs text-gray-500">
                      Start: {formatTime(stats.startedAt)}
                      {elapsedTime && ` · Czas: ${elapsedTime}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {syncState === 'running' && (
                  <button
                    onClick={handleAbort}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    Przerwij
                  </button>
                )}
                {syncState !== 'running' && (
                  <button
                    onClick={resetSync}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Nowa operacja
                  </button>
                )}
              </div>
            </div>

            {/* Progress */}
            {syncState === 'running' && stats.phase && (
              <ProgressBar percent={stats.percent} phase={stats.phase} />
            )}

            {/* Stats */}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.processed}</p>
                <p className="text-xs text-gray-400">Przetworzonych</p>
              </div>
              <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-gray-400">Do przetworzenia</p>
              </div>
              <div className="bg-gray-900/50 border border-yellow-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{stats.warnings}</p>
                <p className="text-xs text-gray-400">Ostrzeżenia</p>
              </div>
              <div className="bg-gray-900/50 border border-red-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{stats.errors}</p>
                <p className="text-xs text-gray-400">Błędy</p>
              </div>
            </div>
          </div>

          {/* Terminal console */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            {/* Terminal header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Terminal className="w-4 h-4" />
                <span>Konsola synchronizacji</span>
                <span className="text-gray-600 text-xs">{displayEvents.length} wpisów</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyIssues}
                    onChange={(e) => setShowOnlyIssues(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500/30 w-3.5 h-3.5"
                  />
                  Tylko problemy
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500/30 w-3.5 h-3.5"
                  />
                  Auto-scroll
                </label>
              </div>
            </div>

            {/* Terminal body */}
            <div
              ref={terminalRef}
              className="h-[400px] overflow-y-auto p-3 space-y-0.5 sidebar-scroll"
            >
              {displayEvents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                  {syncState === 'running' ? 'Oczekiwanie na dane...' : 'Brak logów'}
                </div>
              ) : (
                displayEvents.map((event, i) => <TerminalLine key={i} event={event} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
