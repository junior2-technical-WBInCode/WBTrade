'use client';

import { useState, useEffect } from 'react';
import { partnersApi } from '@/lib/api';
import { RANK_LABELS, RANK_ORDER } from '@/lib/ranks';

/**
 * WB TRADE PARTNERS — konfiguracja rang (PLAN_03/PR-8)
 *
 * Edycja: zakres prowizji zespołowej per ranga, Premia Liderów (pula + warunek WL),
 * liczba potwierdzeń do utrwalenia, progi awansów (JSON, tryb zaawansowany).
 */
export default function RankSettingsPage() {
  const [config, setConfig] = useState<any | null>(null);
  const [ranksJson, setRanksJson] = useState('');
  const [leaderBonusMaxPct, setLeaderBonusMaxPct] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await partnersApi.getRankConfig();
      if (data.success && data.config) {
        setConfig(data.config);
        setRanksJson(JSON.stringify(data.config.ranks, null, 2));
        setLeaderBonusMaxPct(data.leaderBonusMaxPctOfSale ?? 0);
      }
    } catch (err: any) {
      setError(err.message || 'Błąd wczytywania konfiguracji rang.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaveLoading(true);
    setError('');
    setSuccess('');
    try {
      let ranks = config.ranks;
      if (showAdvanced) {
        try {
          ranks = JSON.parse(ranksJson);
        } catch {
          throw new Error('Nieprawidłowy JSON w progach awansów.');
        }
      }
      const payload = { ...config, ranks };
      const data = await partnersApi.saveRankConfig(payload);
      setSuccess(data.message || 'Zapisano.');
      setLeaderBonusMaxPct(data.leaderBonusMaxPctOfSale ?? leaderBonusMaxPct);
      setConfig(data.config);
      setRanksJson(JSON.stringify(data.config.ranks, null, 2));
    } catch (err: any) {
      setError(err.message || 'Błąd zapisu konfiguracji.');
    } finally {
      setSaveLoading(false);
    }
  };

  const setLeaderBonusParam = (rank: string, field: 'basePct' | 'wlRequirement', value: number) => {
    setConfig((prev: any) => ({
      ...prev,
      leaderBonus: {
        ...prev.leaderBonus,
        byRank: {
          ...prev.leaderBonus.byRank,
          [rank]: { ...prev.leaderBonus.byRank[rank], [field]: value },
        },
      },
    }));
  };

  const setTeamLevel = (rank: string, level: number) => {
    setConfig((prev: any) => ({
      ...prev,
      teamLevelByRank: { ...prev.teamLevelByRank, [rank]: level },
    }));
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (!config) {
    return <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl">{error || 'Brak konfiguracji.'}</div>;
  }

  const leaderRanks = RANK_ORDER.filter((r) => config.leaderBonus.byRank[r]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Program Partnerski — Poziomy awansu</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Konfiguracja rang WB TRADE PARTNERS: zakres prowizji zespołowej, Premia Liderów, warunki awansów.
        </p>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm">{error}</div>}
      {success && <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm">{success}</div>}

      {/* Team commission range per rank */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-3 mb-4">Zakres prowizji zespołowej wg rangi</h3>
        <p className="text-xs text-gray-400 mb-4">
          Do którego poziomu struktury (1–4) partner z daną rangą otrzymuje prowizję zespołową.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {RANK_ORDER.map((rank) => (
            <div key={rank} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-secondary-900 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{RANK_LABELS[rank]}</span>
              <select
                value={config.teamLevelByRank[rank] ?? 1}
                onChange={(e) => setTeamLevel(rank, Number(e.target.value))}
                className="px-2 py-1 rounded text-xs bg-white dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 cursor-pointer"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>1–{n}. poziom</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Leader bonus */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-3 mb-4">Premia Liderów</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
              <tr>
                <th className="px-4 py-2">Ranga</th>
                <th className="px-4 py-2">Pula bazowa (% od obrotu)</th>
                <th className="px-4 py-2">Warunek WL (PLN/mies.)</th>
                <th className="px-4 py-2">Pełna pula (z dodatkiem)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
              {leaderRanks.map((rank) => {
                const p = config.leaderBonus.byRank[rank];
                return (
                  <tr key={rank}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{RANK_LABELS[rank]}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" step="0.05" min="0" max="5"
                        value={p.basePct}
                        onChange={(e) => setLeaderBonusParam(rank, 'basePct', Number(e.target.value))}
                        className="w-24 px-2 py-1 rounded text-xs bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" step="1000" min="0"
                        value={p.wlRequirement}
                        onChange={(e) => setLeaderBonusParam(rank, 'wlRequirement', Number(e.target.value))}
                        className="w-32 px-2 py-1 rounded text-xs bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-orange-500">
                      {(p.basePct + config.leaderBonus.wlAddonPct).toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-6 mt-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Dodatek WL (+%):</span>
            <input
              type="number" step="0.05" min="0" max="1"
              value={config.leaderBonus.wlAddonPct}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, leaderBonus: { ...prev.leaderBonus, wlAddonPct: Number(e.target.value) } }))}
              className="w-20 px-2 py-1 rounded text-xs bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Potwierdzenia do utrwalenia:</span>
            <input
              type="number" step="1" min="1" max="12"
              value={config.confirmationsToConsolidate}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, confirmationsToConsolidate: Number(e.target.value) }))}
              className="w-16 px-2 py-1 rounded text-xs bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
            />
          </label>
          <div className="text-xs text-gray-500">
            Podział puli przy kilku liderach tej samej rangi: <span className="font-mono">{config.leaderBonus.shareSplitPct?.join(' / ')}%</span>
          </div>
        </div>
        <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 rounded-lg text-xs text-orange-700 dark:text-orange-400">
          Maksymalna łączna pula Premii Liderów: <strong>{leaderBonusMaxPct.toFixed(2)}%</strong> od sprzedaży
          (plan WBTP: 5% — razem z prowizją 7% i poziomami zespołowymi pula programu = 17%).
        </div>
      </div>

      {/* Advanced: rank thresholds JSON */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 p-6">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Progi awansów (zaawansowane)</h3>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
          >
            {showAdvanced ? 'Ukryj edytor JSON' : 'Edytuj JSON'}
          </button>
        </div>
        {showAdvanced ? (
          <textarea
            value={ranksJson}
            onChange={(e) => setRanksJson(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full font-mono text-xs p-3 rounded-lg bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {RANK_ORDER.filter((r) => config.ranks[r]).map((rank) => {
              const req = config.ranks[rank];
              return (
                <div key={rank} className="bg-gray-50 dark:bg-secondary-900 rounded-lg p-4 text-xs space-y-1">
                  <div className="font-semibold text-gray-900 dark:text-white">{RANK_LABELS[rank]}</div>
                  {req.paths.map((path: any, i: number) => (
                    <div key={i} className="text-gray-500 dark:text-gray-400">
                      • {[
                        path.ownSales && `własna ≥ ${path.ownSales.toLocaleString('pl-PL')} zł`,
                        path.level1Sales && `1. poziom ≥ ${path.level1Sales.toLocaleString('pl-PL')} zł`,
                        path.level12Sales && `1.-2. poziom ≥ ${path.level12Sales.toLocaleString('pl-PL')} zł`,
                        path.structureSales && `struktura ≥ ${path.structureSales.toLocaleString('pl-PL')} zł`,
                        path.minLines && `min. ${path.minLines.count} linii WL${path.minLines.wl / 1000}k`,
                        path.minRankInLines && ('anyOf' in path.minRankInLines
                          ? path.minRankInLines.anyOf.map((r: any) => `${r.count}× ${RANK_LABELS[r.rank]}`).join(' albo ')
                          : `min. ${path.minRankInLines.count}× ${RANK_LABELS[path.minRankInLines.rank]} w osobnych liniach`),
                      ].filter(Boolean).join(' + ')}
                    </div>
                  ))}
                  <div className="text-gray-400 pt-1">Max udział jednej linii: <strong>{req.maxLineSharePct}%</strong></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveLoading}
          className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
        >
          {saveLoading ? 'Zapisywanie…' : 'Zapisz konfigurację rang'}
        </button>
      </div>
    </div>
  );
}
