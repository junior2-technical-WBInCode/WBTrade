'use client';

import { Fragment, useState, useEffect } from 'react';
import Link from 'next/link';
import { partnersApi } from '@/lib/api';
import { RANK_LABELS } from '@/lib/ranks';

type SortKey = 'clicks' | 'orders' | 'conversionRate' | 'revenue' | 'commission' | 'linksCount';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'clicks', label: 'Kliknięcia' },
  { key: 'orders', label: 'Zamówienia' },
  { key: 'conversionRate', label: 'Konwersja' },
  { key: 'revenue', label: 'Obrót' },
  { key: 'commission', label: 'Prowizja' },
  { key: 'linksCount', label: 'Liczba linków' },
];

const money = (value: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value || 0);

const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`);

export default function PartnersTrafficStatsPage() {
  const [data, setData] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const result = await partnersApi.getTrafficStats(statusFilter || undefined);
        if (!cancelled) setData(result);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Błąd pobierania statystyk partnerów.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const partners: any[] = data?.partners ?? [];
  const products: any[] = data?.products ?? [];
  const totals = data?.totals;

  const sortedPartners = [...partners].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Program Partnerski — Ruch i skuteczność</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Kto generuje najwięcej kliknięć, na jakie produkty prowadzą linki i ile z tego ruchu zamienia się w zamówienia.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Kliknięcia w linki', value: (totals?.clicks ?? 0).toLocaleString('pl-PL') },
          { label: 'Zamówienia z linków', value: (totals?.orders ?? 0).toLocaleString('pl-PL') },
          { label: 'Konwersja', value: percent(totals?.conversionRate ?? null) },
          { label: 'Obrót z linków', value: money(totals?.revenue ?? 0) },
          { label: 'Naliczone prowizje', value: money(totals?.commission ?? 0) },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700/50"
          >
            <div className="text-xs text-gray-400 uppercase tracking-wide">{card.label}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700/50 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status partnera:</span>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Wszyscy', value: '' },
            { label: 'Zatwierdzeni', value: 'APPROVED' },
            { label: 'Oczekujący', value: 'PENDING' },
            { label: 'Zawieszeni', value: 'SUSPENDED' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === f.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-secondary-900 dark:hover:bg-secondary-800 dark:text-gray-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-2">Sortuj wg:</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 dark:bg-secondary-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-secondary-700 cursor-pointer"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <>
          {/* Partner ranking */}
          <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-secondary-700/50">
              <h2 className="font-semibold text-gray-900 dark:text-white">Ranking partnerów</h2>
              <p className="text-xs text-gray-400">Kliknij wiersz, aby zobaczyć pojedyncze linki partnera.</p>
            </div>
            {sortedPartners.length === 0 ? (
              <div className="py-16 text-center text-gray-500 dark:text-gray-400">Brak danych o ruchu partnerskim.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                  <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                    <tr>
                      <th className="px-6 py-3">#</th>
                      <th className="px-6 py-3">Partner</th>
                      <th className="px-6 py-3">Kod</th>
                      <th className="px-6 py-3">Poziom</th>
                      <th className="px-6 py-3 text-right">Linki</th>
                      <th className="px-6 py-3 text-right">Kliknięcia</th>
                      <th className="px-6 py-3 text-right">Zamówienia</th>
                      <th className="px-6 py-3 text-right">Konwersja</th>
                      <th className="px-6 py-3 text-right">Obrót</th>
                      <th className="px-6 py-3 text-right">Prowizja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                    {sortedPartners.map((p, idx) => (
                      <Fragment key={p.id}>
                        <tr
                          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30 cursor-pointer"
                        >
                          <td className="px-6 py-4 text-xs font-bold text-gray-400">{idx + 1}</td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900 dark:text-white">{p.name || p.email}</div>
                            <div className="text-xs text-gray-400">{p.email}</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-orange-500 text-xs font-semibold">{p.referralCode}</td>
                          <td className="px-6 py-4 text-xs">{RANK_LABELS[p.rank] ?? p.rank ?? '—'}</td>
                          <td className="px-6 py-4 text-right">
                            {p.linksCount}
                            {p.productLinksCount > 0 && (
                              <span className="text-xs text-gray-400"> ({p.productLinksCount} do produktów)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                            {p.clicks.toLocaleString('pl-PL')}
                          </td>
                          <td className="px-6 py-4 text-right">{p.orders}</td>
                          <td className="px-6 py-4 text-right">{percent(p.conversionRate)}</td>
                          <td className="px-6 py-4 text-right">{money(p.revenue)}</td>
                          <td className="px-6 py-4 text-right">{money(p.commission)}</td>
                        </tr>
                        {expanded === p.id && (
                          <tr className="bg-gray-50/60 dark:bg-secondary-900/40">
                            <td colSpan={10} className="px-6 py-4">
                              {p.links.length === 0 ? (
                                <div className="text-xs text-gray-400">Partner nie utworzył jeszcze żadnego linku.</div>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="text-gray-400 uppercase">
                                    <tr>
                                      <th className="py-2 text-left">Link / produkt</th>
                                      <th className="py-2 text-left">Kod</th>
                                      <th className="py-2 text-right">Kliknięcia</th>
                                      <th className="py-2 text-right">Zamówienia</th>
                                      <th className="py-2 text-right">Konwersja</th>
                                      <th className="py-2 text-right">Obrót</th>
                                      <th className="py-2 text-right">Prowizja</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 dark:divide-secondary-700/50">
                                    {p.links.map((link: any) => (
                                      <tr key={link.id}>
                                        <td className="py-2">
                                          {link.product ? (
                                            <span className="text-gray-800 dark:text-gray-200">{link.product.name}</span>
                                          ) : (
                                            <span className="text-gray-400">{link.name || 'Link ogólny (bez produktu)'}</span>
                                          )}
                                        </td>
                                        <td className="py-2 font-mono text-orange-500">{link.code}</td>
                                        <td className="py-2 text-right font-semibold">{link.clicks}</td>
                                        <td className="py-2 text-right">{link.orders}</td>
                                        <td className="py-2 text-right">{percent(link.conversionRate)}</td>
                                        <td className="py-2 text-right">{money(link.revenue)}</td>
                                        <td className="py-2 text-right">{money(link.commission)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <Link
                                href={`/partners/${p.id}`}
                                className="inline-block mt-3 text-xs font-semibold text-orange-500 hover:text-orange-600"
                              >
                                Pełny profil partnera
                              </Link>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Product ranking */}
          <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-secondary-700/50">
              <h2 className="font-semibold text-gray-900 dark:text-white">Produkty, na które partnerzy generują linki</h2>
              <p className="text-xs text-gray-400">
                Ruch zliczany po linkach prowadzących do danego produktu. Sprzedaż przypisana do tych samych linków.
              </p>
            </div>
            {products.length === 0 ? (
              <div className="py-16 text-center text-gray-500 dark:text-gray-400">Nie utworzono jeszcze żadnych linków.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                  <thead className="text-xs uppercase bg-gray-50 dark:bg-secondary-900 text-gray-400">
                    <tr>
                      <th className="px-6 py-3">Produkt</th>
                      <th className="px-6 py-3 text-right">Linki</th>
                      <th className="px-6 py-3 text-right">Partnerzy</th>
                      <th className="px-6 py-3 text-right">Kliknięcia</th>
                      <th className="px-6 py-3 text-right">Zamówienia</th>
                      <th className="px-6 py-3 text-right">Konwersja</th>
                      <th className="px-6 py-3 text-right">Sztuk</th>
                      <th className="px-6 py-3 text-right">Obrót</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
                    {products.map((prod) => (
                      <tr key={prod.productId ?? 'general'} className="hover:bg-gray-50/50 dark:hover:bg-secondary-800/30">
                        <td className="px-6 py-4">
                          {prod.productId ? (
                            <Link
                              href={`/products/${prod.productId}`}
                              className="font-medium text-gray-900 dark:text-white hover:text-orange-500"
                            >
                              {prod.productName}
                            </Link>
                          ) : (
                            <span className="text-gray-400">{prod.productName}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">{prod.linksCount}</td>
                        <td className="px-6 py-4 text-right">{prod.partnersCount}</td>
                        <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                          {prod.clicks.toLocaleString('pl-PL')}
                        </td>
                        <td className="px-6 py-4 text-right">{prod.orders}</td>
                        <td className="px-6 py-4 text-right">{percent(prod.conversionRate)}</td>
                        <td className="px-6 py-4 text-right">{prod.itemsSold}</td>
                        <td className="px-6 py-4 text-right">{money(prod.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400">
            Kliknięcia to licznik narastający od utworzenia linku (bez historii dziennej), zliczany przy każdym wejściu z
            parametrem ?ref=KOD. Sprzedaż i prowizje pomijają zamówienia anulowane.
          </p>
        </>
      )}
    </div>
  );
}
