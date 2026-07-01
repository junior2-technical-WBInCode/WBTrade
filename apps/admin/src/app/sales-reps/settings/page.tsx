'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminSalesRepsApi } from '@/lib/api';

export default function SalesRepsSettingsPage() {
  const [baseCommissionPct, setBaseCommissionPct] = useState(5);
  const [maxDiscountPct, setMaxDiscountPct] = useState(13);
  const [minCompanyMarginPct, setMinCompanyMarginPct] = useState(10);
  const [markupMultiplier, setMarkupMultiplier] = useState(1.35);
  const [holdDays, setHoldDays] = useState(14);

  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminSalesRepsApi.getConfig();
      if (data.success && data.config) {
        setBaseCommissionPct(data.config.baseCommissionPct);
        setMaxDiscountPct(data.config.maxDiscountPct);
        setMinCompanyMarginPct(data.config.minCompanyMarginPct);
        setMarkupMultiplier(data.config.markupMultiplier);
        setHoldDays(data.config.holdDays);
      }
    } catch (err: any) {
      setError(err.message || 'Błąd wczytywania konfiguracji progów handlowych.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Pre-validate sum pool rule
    const poolSum = baseCommissionPct + maxDiscountPct;
    const maxPoolLimit = (markupMultiplier - 1) * 100 - minCompanyMarginPct;

    if (poolSum > maxPoolLimit) {
      setError(`Przekroczono limit bezpieczeństwa. Łączna pula prowizji i rabatów (${poolSum.toFixed(1)}%) nie może przekraczać marży narzutu pomniejszonej o zysk firmy (${maxPoolLimit.toFixed(1)}%).`);
      return;
    }

    try {
      setSaveLoading(true);
      await adminSalesRepsApi.saveConfig({
        baseCommissionPct,
        maxDiscountPct,
        minCompanyMarginPct,
        markupMultiplier,
        holdDays,
      });
      setSuccess('Konfiguracja progów handlowych została zapisana pomyślnie.');
    } catch (err: any) {
      setError(err.message || 'Błąd zapisu ustawień.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Live calculations
  const markupMarginPct = (markupMultiplier - 1) * 100;
  const currentPoolSum = baseCommissionPct + maxDiscountPct;
  const companyMarginLeft = markupMarginPct - currentPoolSum;
  const marginIsViolated = companyMarginLeft < minCompanyMarginPct;

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ustawienia Progów i Rentowności</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Konfiguruj prowizje, maksymalne rabaty i mnożniki cen zakupu z analizą marży firmy na żywo.</p>
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
          {/* Settings Input Form */}
          <div className="lg:col-span-7 bg-white dark:bg-secondary-800 rounded-xl p-6 border border-gray-100 dark:border-secondary-700/50 shadow-sm">
            {loading ? (
              <div className="py-20 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Mnożnik narzutu na cenę zakupu (markup multiplier)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.01"
                    value={markupMultiplier}
                    onChange={(e) => setMarkupMultiplier(parseFloat(e.target.value) || 1.35)}
                    className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Używany do wyliczenia szacowanej ceny zakupu, jeśli nie jest podana w bazie (np. 1.35 to 35% narzutu).</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Prowizja podstawowa (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={baseCommissionPct}
                      onChange={(e) => setBaseCommissionPct(parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Maksymalny rabat (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={maxDiscountPct}
                      onChange={(e) => setMaxDiscountPct(parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Minimalny gwarantowany zysk firmy (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={minCompanyMarginPct}
                    onChange={(e) => setMinCompanyMarginPct(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Narzędzia walidacyjne zablokują zapis, jeśli marża firmy spadnie poniżej tej wartości przy maksymalnym rabacie.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Okres karencji prowizji (dni)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={holdDays}
                    onChange={(e) => setHoldDays(parseInt(e.target.value) || 14)}
                    className="w-full rounded-lg border border-gray-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3.5 py-2 text-sm focus:border-orange-500 focus:outline-none dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Liczba dni od momentu opłacenia zamówienia, przez którą prowizja handlowca jest zamrożona (ochrona przed zwrotami).</p>
                </div>

                <button
                  type="submit"
                  disabled={saveLoading}
                  className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors cursor-pointer"
                >
                  {saveLoading ? 'Zapisywanie...' : 'Zapisz konfigurację'}
                </button>
              </form>
            )}
          </div>

          {/* Interactive Margin Preview */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-secondary-800 rounded-xl p-5 border border-gray-100 dark:border-secondary-700/50 shadow-sm space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-white">Analiza marży na żywo</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Narzut ceny zakupu:</span>
                  <span className="font-semibold">{markupMarginPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Suma prowizji i max rabatu:</span>
                  <span className="font-semibold text-orange-500">-{currentPoolSum}%</span>
                </div>
                
                <hr className="border-gray-100 dark:border-secondary-700" />
                
                <div className="flex justify-between font-bold text-base">
                  <span>Zysk firmy (max rabat):</span>
                  <span className={marginIsViolated ? 'text-red-500' : 'text-green-500'}>
                    {companyMarginLeft.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Progress bar visual indicator */}
              <div className="w-full bg-gray-150 dark:bg-secondary-900 rounded-full h-3.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    marginIsViolated ? 'bg-red-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (companyMarginLeft / Math.max(1, markupMarginPct)) * 100))}%` }}
                />
              </div>

              {/* Safety messages */}
              {marginIsViolated ? (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3 rounded-lg text-xs text-red-700 dark:text-red-400 font-medium">
                  ⚠️ <strong>Uwaga!</strong> Zysk firmy ({companyMarginLeft.toFixed(1)}%) spada poniżej zadeklarowanego gwarantowanego minimum ({minCompanyMarginPct}%). Zapisz konfiguracji zostanie zablokowany przez walidator.
                </div>
              ) : (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 p-3 rounded-lg text-xs text-green-700 dark:text-green-400 font-medium">
                  ✓ Konfiguracja rentowności jest w pełni bezpieczna. Narzut i zysk firmy są odpowiednio zabezpieczone.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
