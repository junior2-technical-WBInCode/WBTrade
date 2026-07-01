'use client';

import { useState, useEffect } from 'react';
import { partnersApi } from '@/lib/api';

export default function MlmSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [maxDepth, setMaxDepth] = useState(5);
  const [overrideBase, setOverrideBase] = useState('downline_commission');
  const [overrideRatesPctStr, setOverrideRatesPctStr] = useState('10, 5, 3, 2, 1');
  const [stopOnInactiveUpline, setStopOnInactiveUpline] = useState(true);
  const [minMarginPct, setMinMarginPct] = useState(10); // used for the safety check

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

  // Live calculations (corresponds to computeMaxOverridePct in backend)
  const computeMaxPayout = (): number => {
    const rates = getRatesArray();
    if (rates.length === 0 || maxDepth === 0) return 0;

    if (overrideBase === 'downline_commission') {
      let multiplier = 1;
      let total = 0;
      for (let d = 0; d < maxDepth; d++) {
        const r = (rates[d] ?? rates[rates.length - 1] ?? 0) / 100;
        multiplier *= r;
        total += multiplier;
        if (multiplier <= 0) break;
      }
      return total * 100; // as % of primary commission C_S
    }

    let total = 0;
    for (let d = 0; d < maxDepth; d++) {
      total += rates[d] ?? rates[rates.length - 1] ?? 0;
    }
    return total;
  };

  const maxOverridePct = computeMaxPayout();
  const marginIsViolated = minMarginPct !== undefined && maxOverridePct > minMarginPct;

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
      setError(`Przekroczono limit bezpieczeństwa. Maksymalna suma nadprowizji (${maxOverridePct.toFixed(2)}%) nie może przekraczać zysku firmy/marży (${minMarginPct}%).`);
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
                <span>Maks. % nadprowizji:</span>
                <span className="font-semibold text-orange-500">
                  {maxOverridePct.toFixed(2)}% {overrideBase === 'downline_commission' ? 'prowizji C_S' : 'bazy'}
                </span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Dopuszczalna marża weryfikacji:</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{minMarginPct}%</span>
              </div>

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
                style={{ width: `${Math.max(0, Math.min(100, (maxOverridePct / Math.max(1, minMarginPct)) * 100))}%` }}
              />
            </div>

            {marginIsViolated ? (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3 rounded-lg text-xs text-red-700 dark:text-red-400 font-medium">
                ⚠️ <strong>Uwaga!</strong> Suma nadprowizji MLM ({maxOverridePct.toFixed(2)}%) przekracza zadeklarowany limit bezpieczeństwa ({minMarginPct}%). Zapisz konfiguracji zostanie zablokowany.
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 p-3 rounded-lg text-xs text-green-700 dark:text-green-400 font-medium">
                ✓ Stawki MLM mieszczą się w wyznaczonym limicie bezpieczeństwa marży.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
