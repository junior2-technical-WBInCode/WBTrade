'use client';

import { useState, useEffect } from 'react';
import { partnersApi } from '@/lib/api';

// Metadata for the three override calculation bases — used by the visualization card.
const OVERRIDE_BASES = [
  {
    id: 'downline_commission',
    label: 'Kaskada',
    sub: 'od prowizji poziomu pod',
    formula: 'baza × (stawka₁ × … × stawkaₙ)',
    desc: 'Każdy kolejny poziom liczony jest od prowizji poziomu niżej — stawki mnożą się kaskadowo, więc udział szybko maleje w głąb.',
  },
  {
    id: 'seller_commission',
    label: 'Płaska od prowizji',
    sub: 'od prowizji sprzedawcy',
    formula: 'baza × stawkaₙ',
    desc: 'Każdy poziom dostaje procent od prowizji bezpośredniego sprzedawcy (bazy), niezależnie od pozostałych poziomów.',
  },
  {
    id: 'sale_base',
    label: 'Płaska od sprzedaży',
    sub: 'od wartości sprzedaży',
    formula: 'stawkaₙ (wprost od sprzedaży)',
    desc: 'Każdy poziom dostaje procent wprost od wartości sprzedaży — najhojniejszy i najdroższy wariant.',
  },
] as const;

export default function MlmSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [maxDepth, setMaxDepth] = useState(5);
  const [overrideBase, setOverrideBase] = useState('downline_commission');
  const [overrideRatesPctStr, setOverrideRatesPctStr] = useState('10, 5, 3, 2, 1');
  const [stopOnInactiveUpline, setStopOnInactiveUpline] = useState(true);
  const [minMarginPct, setMinMarginPct] = useState(10); // used for the safety check
  const [baseCommissionPct, setBaseCommissionPct] = useState(5); // reference base rate (% of sale) from backend
  const [exampleSale, setExampleSale] = useState(1000); // sample sale value for the visualization card

  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await partnersApi.getMlmConfig();
      if (data.success && data.config) {
        setEnabled(data.config.enabled);
        setMaxDepth(data.config.maxDepth);
        setOverrideBase(data.config.overrideBase);
        if (Array.isArray(data.config.overrideRatesPct)) {
          setOverrideRatesPctStr(data.config.overrideRatesPct.join(', '));
        }
        setStopOnInactiveUpline(data.config.stopOnInactiveUpline);
        if (typeof data.baseCommissionPct === 'number') setBaseCommissionPct(data.baseCommissionPct);
      }
    } catch (err: any) {
      setError(err.message || 'Błąd wczytywania konfiguracji MLM.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const getRatesArray = (): number[] => {
    return overrideRatesPctStr
      .split(',')
      .map((r) => parseFloat(r.trim()))
      .filter((r) => !isNaN(r));
  };

  // Live calc — override cost as % OF SALE (matches backend computeOverridePctOfSale).
  const computeOverridePctOfSale = (): number => {
    const rates = getRatesArray();
    if (rates.length === 0 || maxDepth === 0) return 0;

    if (overrideBase === 'downline_commission') {
      // cascade: baseCommissionPct × Σ(Π rate_i/100)
      let multiplier = 1;
      let cascadeSum = 0;
      for (let d = 0; d < maxDepth; d++) {
        const r = (rates[d] ?? rates[rates.length - 1] ?? 0) / 100;
        multiplier *= r;
        cascadeSum += multiplier;
        if (multiplier <= 0) break;
      }
      return baseCommissionPct * cascadeSum;
    }

    let rateSum = 0;
    for (let d = 0; d < maxDepth; d++) {
      rateSum += rates[d] ?? rates[rates.length - 1] ?? 0;
    }
    // seller_commission: base × Σrate/100 ; sale_base: Σrate (already % of sale)
    return overrideBase === 'seller_commission' ? (baseCommissionPct * rateSum) / 100 : rateSum;
  };

  const overridePctOfSale = computeOverridePctOfSale();
  const totalPayoutPctOfSale = baseCommissionPct + overridePctOfSale;
  const marginIsViolated = minMarginPct !== undefined && totalPayoutPctOfSale > minMarginPct;

  // Per-level breakdown (% of sale for each upline level) for a given base — powers the visualization.
  const computeLevelBreakdown = (base: string) => {
    const rates = getRatesArray();
    const rows: { level: number; rate: number; pctOfSale: number }[] = [];
    let cascade = 1;
    for (let d = 0; d < maxDepth; d++) {
      const rate = rates[d] ?? rates[rates.length - 1] ?? 0;
      let pct = 0;
      if (base === 'downline_commission') {
        cascade *= rate / 100;
        pct = baseCommissionPct * cascade;
      } else if (base === 'seller_commission') {
        pct = (baseCommissionPct * rate) / 100;
      } else {
        pct = rate;
      }
      rows.push({ level: d + 1, rate, pctOfSale: pct });
    }
    return rows;
  };

  const fmtPct = (v: number) => `${v.toFixed(v > 0 && v < 1 ? 3 : 2)}%`;
  const selectedBreakdown = computeLevelBreakdown(overrideBase);
  const maxLevelPct = Math.max(...selectedBreakdown.map((r) => r.pctOfSale), 0.0001);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const rates = getRatesArray();
    if (rates.some((r) => r < 0 || r > 100)) {
      setError('Każda stawka prowizji musi być z przedziału od 0 do 100.');
      return;
    }

    if (marginIsViolated) {
      setError(`Przekroczono limit bezpieczeństwa. Łączna wypłata partnerska (${totalPayoutPctOfSale.toFixed(2)}% od sprzedaży = baza ${baseCommissionPct}% + nadprowizje ${overridePctOfSale.toFixed(2)}%) nie może przekraczać marży firmy (${minMarginPct}%).`);
      return;
    }

    try {
      setSaveLoading(true);
      await partnersApi.saveMlmConfig({
        enabled,
        maxDepth,
        overrideBase,
        overrideRatesPct: rates,
        stopOnInactiveUpline,
        minMarginPct,
      });
      setSuccess('Konfiguracja MLM została zapisana pomyślnie.');
    } catch (err: any) {
      setError(err.message || 'Błąd zapisu ustawień.');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ustawienia Programu MLM (Wielopoziomowego)</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Konfiguruj parametry kaskadowe nadprowizji od prowizji dla partnerów upline z analizą marży na żywo.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 rounded-xl text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30 rounded-xl text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-secondary-800 rounded-xl p-6 border border-gray-100 dark:border-secondary-700/50 shadow-sm">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-secondary-700">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <label htmlFor="enabled" className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                  Włącz program wielopoziomowy (MLM)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Maks. głębokość naliczania
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Baza naliczania nadprowizji
                  </label>
                  <select
                    value={overrideBase}
                    onChange={(e) => setOverrideBase(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                  >
                    <option value="downline_commission">Kaskada (od prowizji poziomu pod)</option>
                    <option value="seller_commission">Płaska (od prowizji sprzedawcy)</option>
                    <option value="sale_base">Płaska (od wartości sprzedaży)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Stawki nadprowizji na poziom (%)
                </label>
                <input
                  type="text"
                  value={overrideRatesPctStr}
                  onChange={(e) => setOverrideRatesPctStr(e.target.value)}
                  placeholder="10, 5, 3, 2, 1"
                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                />
                <p className="text-xs text-gray-400 mt-1">Oddzielone przecinkami wartości dla kolejnych poziomów (np. 10 dla pierwszego poziomu upline, 5 dla drugiego itd.). Brakujące poziomy użyją ostatniej stawki.</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="stopOnInactiveUpline"
                  checked={stopOnInactiveUpline}
                  onChange={(e) => setStopOnInactiveUpline(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <label htmlFor="stopOnInactiveUpline" className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                  Zatrzymaj łańcuch przy nieaktywnym upline (bez kompresji)
                </label>
              </div>

              <div className="border-t border-gray-100 dark:border-secondary-700 pt-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Minimalna marża firmy do weryfikacji (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={minMarginPct}
                  onChange={(e) => setMinMarginPct(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                />
                <p className="text-xs text-gray-400 mt-1">Górny limit sumy wypłat z MLM, aby nie przekroczyć narzutu firmy.</p>
              </div>

              <button
                type="submit"
                disabled={saveLoading}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors cursor-pointer"
              >
                {saveLoading ? 'Zapisywanie...' : 'Zapisz konfigurację MLM'}
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-secondary-800 rounded-xl p-5 border border-gray-100 dark:border-secondary-700/50 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white">Analiza obciążenia prowizją</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Prowizja bazowa:</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{baseCommissionPct.toFixed(2)}% od sprzedaży</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Nadprowizje (suma):</span>
                <span className="font-semibold text-orange-500">{overridePctOfSale.toFixed(2)}% od sprzedaży</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Łączna wypłata partnerska:</span>
                <span className="font-bold text-orange-600">{totalPayoutPctOfSale.toFixed(2)}% od sprzedaży</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Dopuszczalna marża weryfikacji:</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{minMarginPct}%</span>
              </div>
              <p className="text-[11px] text-gray-400 italic">Sufit liczony przy domyślnej stawce bazowej ({baseCommissionPct}%); realne stawki są per-partner.</p>

              <hr className="border-gray-100 dark:border-secondary-700" />

              <div className="flex justify-between font-bold text-base">
                <span>Status limitu:</span>
                <span className={marginIsViolated ? 'text-red-500' : 'text-green-500'}>
                  {marginIsViolated ? 'Przekroczony' : 'Zabezpieczony'}
                </span>
              </div>
            </div>

            <div className="w-full bg-gray-150 dark:bg-secondary-900 rounded-full h-3.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  marginIsViolated ? 'bg-red-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, (totalPayoutPctOfSale / Math.max(1, minMarginPct)) * 100))}%` }}
              />
            </div>

            {marginIsViolated ? (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3 rounded-lg text-xs text-red-700 dark:text-red-400 font-medium">
                ⚠️ <strong>Uwaga!</strong> Łączna wypłata partnerska ({totalPayoutPctOfSale.toFixed(2)}% od sprzedaży) przekracza zadeklarowaną marżę ({minMarginPct}%). Zapis konfiguracji zostanie zablokowany.
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 p-3 rounded-lg text-xs text-green-700 dark:text-green-400 font-medium">
                ✓ Stawki MLM mieszczą się w wyznaczonym limicie bezpieczeństwa marży.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visualization — how each override base works, per upline level */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl p-6 border border-gray-100 dark:border-secondary-700/50 shadow-sm space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Jak działają bazy naliczania nadprowizji?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Porównanie trzech baz i rozkład wypłaty na każdy poziom upline dla aktualnych stawek. Kliknij bazę, aby ją wybrać.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            Przykładowa sprzedaż:
            <input
              type="number"
              min="0"
              value={exampleSale}
              onChange={(e) => setExampleSale(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-28 rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-2.5 py-1.5 text-sm text-right focus:border-orange-500 focus:outline-none dark:text-white"
            />
            <span>zł</span>
          </label>
        </div>

        {/* Three bases comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {OVERRIDE_BASES.map((b) => {
            const total = computeLevelBreakdown(b.id).reduce((s, r) => s + r.pctOfSale, 0);
            const selected = overrideBase === b.id;
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => setOverrideBase(b.id)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  selected
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-500'
                    : 'border-gray-200 dark:border-secondary-700 hover:border-orange-300 dark:hover:border-orange-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{b.label}</span>
                  {selected && <span className="text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400">Wybrana</span>}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{b.sub}</p>
                <code className="block text-[11px] text-orange-600 dark:text-orange-400 mt-2 font-mono">{b.formula}</code>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">{b.desc}</p>
                <div className="mt-3 pt-2 border-t border-gray-100 dark:border-secondary-700 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">Suma nadprowizji</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{fmtPct(total)} <span className="text-[11px] font-normal text-gray-400">od sprzedaży</span></span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Per-level breakdown for the selected base */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rozkład na poziomy upline — baza: <span className="text-orange-600 dark:text-orange-400">{OVERRIDE_BASES.find((b) => b.id === overrideBase)?.label}</span></h4>
            <span className="text-xs text-gray-400">głębokość: {maxDepth} {maxDepth === 1 ? 'poziom' : maxDepth < 5 ? 'poziomy' : 'poziomów'}</span>
          </div>
          <div className="space-y-2">
            {selectedBreakdown.map((r) => (
              <div key={r.level} className="flex items-center gap-3">
                <div className="w-32 shrink-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Poziom {r.level}</span>
                  <span className="block text-[11px] text-gray-400">{r.level === 1 ? 'bezpośredni upline' : `${r.level}. w górę`} · stawka {r.rate}%</span>
                </div>
                <div className="flex-1 bg-gray-100 dark:bg-secondary-900 rounded-full h-6 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(2, (r.pctOfSale / maxLevelPct) * 100)}%` }}
                  />
                  <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                    {fmtPct(r.pctOfSale)} · {(exampleSale * r.pctOfSale / 100).toFixed(2)} zł
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-sm border-t border-gray-100 dark:border-secondary-700 pt-3">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Łącznie nadprowizje (wszystkie poziomy)</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">
              {fmtPct(overridePctOfSale)} · {(exampleSale * overridePctOfSale / 100).toFixed(2)} zł
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 italic">Wartości liczone przy stawce bazowej {baseCommissionPct}% od sprzedaży. „Brakujące" poziomy (gdy głębokość &gt; liczba stawek) używają ostatniej podanej stawki.</p>
        </div>
      </div>
    </div>
  );
}
