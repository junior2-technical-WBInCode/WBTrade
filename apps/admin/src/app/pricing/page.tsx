'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '@/lib/api';
import { Loader2, Plus, X, Save, AlertCircle, CheckCircle, RefreshCw, Clock } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

interface PriceRule {
  id: string;
  priceFrom: number;
  priceTo: number;
  multiplier: number;
  addToPrice: number;
}

type Warehouse = string;

interface SyncStatus {
  source: string;
  perWholesaler: Record<string, string | null>;
  oldestSync: string | null;
}

interface WarehouseInfo {
  key: string;
  label: string;
  description: string;
}

const DEFAULT_RULES: PriceRule[] = [
  { id: '1', priceFrom: 0, priceTo: 35, multiplier: 1.0, addToPrice: 0 },
  { id: '2', priceFrom: 35.01, priceTo: 100, multiplier: 1.0, addToPrice: 0 },
  { id: '3', priceFrom: 100.01, priceTo: 200, multiplier: 1.0, addToPrice: 0 },
  { id: '4', priceFrom: 200.01, priceTo: 300, multiplier: 1.0, addToPrice: 0 },
  { id: '5', priceFrom: 300.01, priceTo: 400, multiplier: 1.0, addToPrice: 0 },
  { id: '6', priceFrom: 400.01, priceTo: 500, multiplier: 1.0, addToPrice: 0 },
  { id: '7', priceFrom: 500.01, priceTo: 600, multiplier: 1.0, addToPrice: 0 },
  { id: '8', priceFrom: 600.01, priceTo: 700, multiplier: 1.0, addToPrice: 0 },
  { id: '9', priceFrom: 700.01, priceTo: 800, multiplier: 1.0, addToPrice: 0 },
  { id: '10', priceFrom: 800.01, priceTo: 900, multiplier: 1.0, addToPrice: 0 },
  { id: '11', priceFrom: 900.01, priceTo: 1000, multiplier: 1.0, addToPrice: 0 },
  { id: '12', priceFrom: 1000.01, priceTo: 100000, multiplier: 1.0, addToPrice: 0 },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function PricingPage() {
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [activeWarehouse, setActiveWarehouse] = useState<Warehouse>('');
  const [rules, setRules] = useState<Record<Warehouse, PriceRule[]>>({});
  const [dividers, setDividers] = useState<Record<Warehouse, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState<Record<Warehouse, boolean>>({});
  const [editingCell, setEditingCell] = useState<{ ruleId: string; field: string; value: string } | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncingWarehouse, setSyncingWarehouse] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();

      // Fetch warehouses with price rules from API
      const whRes = await fetch(`${API_URL}/admin/wholesalers`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      let whs: WarehouseInfo[] = [];
      if (whRes.ok) {
        const data = await whRes.json();
        whs = data
          .filter((w: any) => w.isActive && w.hasPriceRules)
          .map((w: any) => ({
            key: w.key,
            label: w.name,
            description: w.warehouseDisplayName || w.location || '',
          }));
      }
      if (whs.length === 0) {
        // Fallback to hardcoded defaults
        whs = [
          { key: 'leker', label: 'Leker', description: 'Magazyn Chynów' },
          { key: 'btp', label: 'BTP', description: 'Magazyn Chotów' },
          { key: 'hp', label: 'HP', description: 'Magazyn Zielona Góra' },
          { key: 'dofirmy', label: 'DoFirmy', description: 'Magazyn Koszalin' },
        ];
      }
      setWarehouses(whs);
      setActiveWarehouse(prev => prev || whs[0]?.key || '');

      const results: Record<Warehouse, PriceRule[]> = {};
      const changes: Record<Warehouse, boolean> = {};
      const loadedDividers: Record<Warehouse, number> = {};

      for (const wh of whs) {
        try {
          const response = await fetch(`${API_URL}/admin/settings/price_rules_${wh.key}`, {
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
            },
          });

          if (response.ok) {
            const data = await response.json();
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            if (Array.isArray(parsed) && parsed.length > 0) {
              results[wh.key] = parsed.map((r: any, i: number) => ({ ...r, id: r.id || generateId() }));
            } else {
              results[wh.key] = [...DEFAULT_RULES];
            }
          } else {
            results[wh.key] = [...DEFAULT_RULES];
          }
        } catch {
          results[wh.key] = [...DEFAULT_RULES];
        }
        // Load divider
        try {
          const divRes = await fetch(`${API_URL}/admin/settings/price_divider_${wh.key}`, {
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
            },
          });
          if (divRes.ok) {
            const divData = await divRes.json();
            const val = parseFloat(divData.value);
            if (val && val > 0) loadedDividers[wh.key] = val;
            else loadedDividers[wh.key] = 1;
          } else {
            loadedDividers[wh.key] = 1;
          }
        } catch {
          loadedDividers[wh.key] = 1;
        }
        changes[wh.key] = false;
      }

      setRules(results);
      setDividers(loadedDividers);
      setHasChanges(changes);
    } catch (error) {
      console.error('Error fetching price rules:', error);
      setMessage({ type: 'error', text: 'Błąd podczas ładowania reguł cenowych' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/sync/prices/status`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
      }
    } catch {
      // ignore — sync status is optional
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  const triggerSync = async () => {
    setSyncingWarehouse('all');
    setSyncMessage(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/sync/prices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Błąd synchronizacji');
      if (data.status === 'queued') {
        setSyncMessage({ type: 'success', text: `Synchronizacja cen dodana do kolejki (job: ${data.jobId})` });
      } else {
        setSyncMessage({ type: 'success', text: `Synchronizacja cen zakończona — ${data.result?.itemsChanged || 0} zmian` });
      }
      // refresh timestamps
      await fetchSyncStatus();
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err.message || 'Błąd synchronizacji cen' });
    } finally {
      setSyncingWarehouse(null);
    }
  };

  const saveRules = async (warehouse: Warehouse) => {
    setSaving(true);
    setMessage(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/settings/price_rules_${warehouse}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ value: rules[warehouse] }),
      });

      if (!response.ok) throw new Error('Błąd zapisu');

      // Save divider
      await fetch(`${API_URL}/admin/settings/price_divider_${warehouse}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ value: String(dividers[warehouse] || 1) }),
      });

      setMessage({ type: 'success', text: `Reguły cenowe dla ${warehouses.find(w => w.key === warehouse)?.label} zapisane pomyślnie!` });
      setHasChanges(prev => ({ ...prev, [warehouse]: false }));
    } catch (error) {
      setMessage({ type: 'error', text: 'Błąd podczas zapisywania reguł cenowych' });
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (warehouse: Warehouse, ruleId: string, field: keyof PriceRule, value: string) => {
    setRules(prev => ({
      ...prev,
      [warehouse]: (prev[warehouse] || []).map(rule =>
        rule.id === ruleId
          ? { ...rule, [field]: field === 'id' ? value : parseFloat(value) || 0 }
          : rule
      ),
    }));
    setHasChanges(prev => ({ ...prev, [warehouse]: true }));
  };

  const addRule = (warehouse: Warehouse) => {
    const warehouseRules = rules[warehouse];
    const lastRule = warehouseRules[warehouseRules.length - 1];
    const newFrom = lastRule ? parseFloat((lastRule.priceTo + 0.01).toFixed(2)) : 0;

    const newRule: PriceRule = {
      id: generateId(),
      priceFrom: newFrom,
      priceTo: newFrom + 100,
      multiplier: 1.0,
      addToPrice: 0,
    };

    setRules(prev => ({
      ...prev,
      [warehouse]: [...prev[warehouse], newRule],
    }));
    setHasChanges(prev => ({ ...prev, [warehouse]: true }));
  };

  const removeRule = (warehouse: Warehouse, ruleId: string) => {
    setRules(prev => ({
      ...prev,
      [warehouse]: (prev[warehouse] || []).filter(rule => rule.id !== ruleId),
    }));
    setHasChanges(prev => ({ ...prev, [warehouse]: true }));
  };

  const copyRules = (fromWarehouse: Warehouse) => {
    const from = rules[fromWarehouse];
    const targets = warehouses.filter(w => w.key !== fromWarehouse);
    
    setRules(prev => {
      const updated = { ...prev };
      for (const target of targets) {
        updated[target.key] = from.map(rule => ({ ...rule, id: generateId() }));
      }
      return updated;
    });
    setHasChanges(prev => {
      const updated = { ...prev };
      for (const target of targets) {
        updated[target.key] = true;
      }
      return updated;
    });
    setMessage({ type: 'success', text: `Reguły skopiowane z ${warehouses.find(w => w.key === fromWarehouse)?.label} do pozostałych magazynów` });
  };

  const saveAllRules = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = getAuthToken();
      for (const wh of warehouses) {
        const response = await fetch(`${API_URL}/admin/settings/price_rules_${wh.key}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ value: rules[wh.key] }),
        });
        if (!response.ok) throw new Error(`Błąd zapisu dla ${wh.label}`);

        // Save divider
        await fetch(`${API_URL}/admin/settings/price_divider_${wh.key}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ value: String(dividers[wh.key] || 1) }),
        });
      }
      setMessage({ type: 'success', text: 'Wszystkie reguły cenowe zapisane pomyślnie!' });
      setHasChanges(Object.fromEntries(warehouses.map(w => [w.key, false])));
    } catch (error) {
      setMessage({ type: 'error', text: 'Błąd podczas zapisywania reguł cenowych' });
    } finally {
      setSaving(false);
    }
  };

  // Calculate example price
  const calculateExamplePrice = (sourcePrice: number, warehouse: Warehouse): string => {
    const warehouseRules = rules[warehouse];
    if (!warehouseRules) return '-';
    const divider = dividers[warehouse] || 1;
    const dividedPrice = sourcePrice / divider;
    for (const rule of warehouseRules) {
      if (dividedPrice >= rule.priceFrom && dividedPrice <= rule.priceTo) {
        const result = dividedPrice * rule.multiplier + rule.addToPrice;
        return result.toFixed(2);
      }
    }
    return '-';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        <span className="ml-3 text-slate-400">Ładowanie reguł cenowych...</span>
      </div>
    );
  }

  const currentRules = rules[activeWarehouse] || [];
  const anyChanges = Object.values(hasChanges).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cennik — Mnożniki cen</h1>
          <p className="text-slate-400 mt-1">
            Ustaw mnożniki cen i dodatki w zależności od zakresu ceny hurtowej dla każdego magazynu
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => copyRules(activeWarehouse)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            Kopiuj do pozostałych
          </button>
          <button
            onClick={saveAllRules}
            disabled={saving || !anyChanges}
            className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Zapisz wszystko
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Warehouse tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
        {warehouses.map(wh => (
          <button
            key={wh.key}
            onClick={() => setActiveWarehouse(wh.key)}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeWarehouse === wh.key
                ? 'bg-orange-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span>{wh.label}</span>
              {hasChanges[wh.key] && (
                <span className="w-2 h-2 bg-yellow-400 rounded-full" title="Niezapisane zmiany" />
              )}
            </div>
            <div className={`text-xs mt-0.5 ${activeWarehouse === wh.key ? 'text-orange-200' : 'text-slate-500'}`}>
              {wh.description}
            </div>
          </button>
        ))}
      </div>

      {/* Divider input */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-white whitespace-nowrap">Dzielnik BL</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={dividers[activeWarehouse] || 1}
            onChange={e => {
              const val = parseFloat(e.target.value) || 1;
              setDividers(prev => ({ ...prev, [activeWarehouse]: val }));
              setHasChanges(prev => ({ ...prev, [activeWarehouse]: true }));
            }}
            className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <span className="text-xs text-slate-400">
            Cena z Baselinkera zostanie podzielona przez tę wartość przed zastosowaniem mnożników. Domyślnie: 1 (brak dzielenia).
          </span>
        </div>
      </div>

      {/* Rules table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 px-6 py-3 bg-slate-900/50 border-b border-slate-700/50">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cena od</div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cena do</div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mnożnik ceny</div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Dodaj do ceny</div>
          <div className="w-10"></div>
        </div>

        {/* Rules rows */}
        <div className="divide-y divide-slate-700/30">
          {currentRules.map((rule, index) => (
            <div
              key={rule.id}
              className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 px-6 py-3 hover:bg-slate-700/20 transition-colors items-center"
            >
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editingCell?.ruleId === rule.id && editingCell?.field === 'priceFrom' ? editingCell.value : rule.priceFrom}
                  onFocus={() => setEditingCell({ ruleId: rule.id, field: 'priceFrom', value: String(rule.priceFrom) })}
                  onChange={e => setEditingCell({ ruleId: rule.id, field: 'priceFrom', value: e.target.value })}
                  onBlur={() => { if (editingCell) { updateRule(activeWarehouse, rule.id, 'priceFrom', editingCell.value); setEditingCell(null); } }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editingCell?.ruleId === rule.id && editingCell?.field === 'priceTo' ? editingCell.value : rule.priceTo}
                  onFocus={() => setEditingCell({ ruleId: rule.id, field: 'priceTo', value: String(rule.priceTo) })}
                  onChange={e => setEditingCell({ ruleId: rule.id, field: 'priceTo', value: e.target.value })}
                  onBlur={() => { if (editingCell) { updateRule(activeWarehouse, rule.id, 'priceTo', editingCell.value); setEditingCell(null); } }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editingCell?.ruleId === rule.id && editingCell?.field === 'multiplier' ? editingCell.value : rule.multiplier}
                  onFocus={() => setEditingCell({ ruleId: rule.id, field: 'multiplier', value: String(rule.multiplier) })}
                  onChange={e => setEditingCell({ ruleId: rule.id, field: 'multiplier', value: e.target.value })}
                  onBlur={() => { if (editingCell) { updateRule(activeWarehouse, rule.id, 'multiplier', editingCell.value); setEditingCell(null); } }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editingCell?.ruleId === rule.id && editingCell?.field === 'addToPrice' ? editingCell.value : rule.addToPrice}
                  onFocus={() => setEditingCell({ ruleId: rule.id, field: 'addToPrice', value: String(rule.addToPrice) })}
                  onChange={e => setEditingCell({ ruleId: rule.id, field: 'addToPrice', value: e.target.value })}
                  onBlur={() => { if (editingCell) { updateRule(activeWarehouse, rule.id, 'addToPrice', editingCell.value); setEditingCell(null); } }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <button
                  onClick={() => removeRule(activeWarehouse, rule.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Usuń regułę"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add button */}
        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end">
          <button
            onClick={() => addRule(activeWarehouse)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Dodaj
          </button>
        </div>
      </div>

      {/* Info and Save */}
      <div className="flex items-start justify-between">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 max-w-xl">
          <h3 className="text-sm font-medium text-white mb-2">Jak działa mnożnik ceny?</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Końcowa cena = <span className="text-orange-400 font-mono">(Cena BL ÷ Dzielnik) × Mnożnik + Dodaj do ceny</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Dzielnik kompensuje mnożnik ustawiony w Baselinkerze (np. 1.3 jeśli BL ma narzut 30%)
            <br />
            Np mnożnik &apos;1.20&apos; dla narzutu w wysokości 20%
          </p>
        </div>

        <button
          onClick={() => saveRules(activeWarehouse)}
          disabled={saving || !hasChanges[activeWarehouse]}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Zapisz {warehouses.find(w => w.key === activeWarehouse)?.label}
        </button>
      </div>

      {/* Baselinker price sync section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white">Synchronizacja cen z Baselinker</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ceny hurtowe pobierane co 2 godziny z API Baselinker. Możesz też uruchomić ręcznie.
            </p>
          </div>
          <button
            onClick={() => triggerSync()}
            disabled={syncingWarehouse !== null}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {syncingWarehouse ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Synchronizuj ceny
          </button>
        </div>

        {syncMessage && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            syncMessage.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {syncMessage.type === 'success' ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            {syncMessage.text}
          </div>
        )}

        {syncStatus?.perWholesaler && (
          <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              Ostatnia synchronizacja cen (feed XML) per hurtownia:
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {Object.entries(syncStatus.perWholesaler).map(([key, ts]) => (
                <span key={key}>
                  {key}: {ts ? `${new Date(ts).toLocaleDateString('pl-PL')} ${new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : <span className="text-red-400">nigdy</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Price simulator */}
      <PriceSimulator
        warehouse={activeWarehouse}
        calculatePrice={calculateExamplePrice}
        warehouseLabel={warehouses.find(w => w.key === activeWarehouse)?.label || ''}
      />
    </div>
  );
}

function PriceSimulator({
  warehouse,
  calculatePrice,
  warehouseLabel,
}: {
  warehouse: Warehouse;
  calculatePrice: (price: number, wh: Warehouse) => string;
  warehouseLabel: string;
}) {
  const [testPrice, setTestPrice] = useState('50');
  const examplePrices = [10, 25, 50, 75, 120, 250, 450, 750, 1500];

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
      <h3 className="text-sm font-medium text-white mb-4">Symulator ceny — {warehouseLabel}</h3>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-slate-400">Testowa cena z BL:</label>
        <input
          type="number"
          step="0.01"
          value={testPrice}
          onChange={e => setTestPrice(e.target.value)}
          className="w-40 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <span className="text-sm text-slate-400">→</span>
        <span className="text-lg font-bold text-orange-400">
          {calculatePrice(parseFloat(testPrice) || 0, warehouse)} zł
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {examplePrices.map(price => (
          <div key={price} className="bg-slate-900/50 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">BL: {price} zł</div>
            <div className="text-sm font-medium text-white">{calculatePrice(price, warehouse)} zł</div>
          </div>
        ))}
      </div>
    </div>
  );
}
