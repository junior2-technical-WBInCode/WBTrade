'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { partnersApi } from '@/lib/api';
import { RANK_LABELS } from '@/lib/ranks';

interface StructureNode {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  status: string;
  rank: string;
  createdAt: string;
  ordersCount: number;
  linksCount: number;
  level: number;
  teamSize: number;
  children: StructureNode[];
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    SUSPENDED: 'bg-gray-100 text-gray-800 dark:bg-secondary-700 dark:text-gray-400',
  };
  const label: Record<string, string> = {
    PENDING: 'Oczekuje', APPROVED: 'Aktywny', REJECTED: 'Odrzucony', SUSPENDED: 'Zawieszony',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.SUSPENDED}`}>
      {label[status] ?? status}
    </span>
  );
};

/** Keeps a node when it matches, or when any descendant matches. */
function filterTree(nodes: StructureNode[], q: string): StructureNode[] {
  if (!q) return nodes;
  const needle = q.toLowerCase();
  const walk = (node: StructureNode): StructureNode | null => {
    const children = node.children.map(walk).filter((n): n is StructureNode => n !== null);
    const hit =
      node.name.toLowerCase().includes(needle) ||
      node.email.toLowerCase().includes(needle) ||
      node.referralCode.toLowerCase().includes(needle);
    if (!hit && children.length === 0) return null;
    return { ...node, children };
  };
  return nodes.map(walk).filter((n): n is StructureNode => n !== null);
}

function countNodes(nodes: StructureNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

function NodeRow({ node }: { node: StructureNode }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className="relative">
      <div
        className="flex items-center gap-3 py-2.5 pr-3 hover:bg-gray-50/70 dark:hover:bg-secondary-800/40 rounded-lg transition-colors"
        style={{ paddingLeft: `${(node.level - 1) * 26 + 4}px` }}
      >
        <button
          onClick={() => hasChildren && setOpen((v) => !v)}
          className={`w-5 h-5 shrink-0 flex items-center justify-center rounded ${
            hasChildren
              ? 'text-gray-500 hover:bg-gray-200 dark:hover:bg-secondary-700 cursor-pointer'
              : 'text-transparent'
          }`}
          aria-label={hasChildren ? 'Zwiń lub rozwiń gałąź' : undefined}
        >
          {hasChildren ? (
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-secondary-600" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/partners/${node.id}`} className="font-semibold text-sm text-gray-900 dark:text-white hover:text-orange-500">
              {node.name || node.email}
            </Link>
            <span className="font-mono text-[11px] font-bold text-orange-500">{node.referralCode}</span>
            {statusBadge(node.status)}
          </div>
          <div className="text-[11px] text-gray-400 truncate">{node.email}</div>
        </div>

        <div className="hidden md:block text-[11px] text-gray-500 dark:text-gray-400 w-32 shrink-0">
          {RANK_LABELS[node.rank] ?? node.rank}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 w-20 shrink-0 text-right">
          {node.teamSize > 0 ? <>zespół <b className="text-gray-800 dark:text-gray-200">{node.teamSize}</b></> : <span className="text-gray-300 dark:text-secondary-600">brak</span>}
        </div>
        <div className="hidden sm:block text-[11px] text-gray-500 dark:text-gray-400 w-24 shrink-0 text-right">
          {node.ordersCount} zam. / {node.linksCount} link.
        </div>
      </div>

      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <NodeRow key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PartnersStructurePage() {
  const [data, setData] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const result = await partnersApi.getStructure();
        if (!cancelled) setData(result);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Błąd pobierania struktury partnerów.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tree: StructureNode[] = useMemo(() => filterTree(data?.tree ?? [], query.trim()), [data, query]);
  const detached: StructureNode[] = data?.detached ?? [];
  const totals = data?.totals;
  const visible = countNodes(tree);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Program Partnerski — Struktura</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Kto jest podpięty pod kogo. Powiązania są trwałe, więc drzewo odzwierciedla stan rozliczeń.
          </p>
        </div>
        <Link href="/partners" className="text-sm font-semibold text-orange-500 hover:underline">
          Lista partnerów
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Partnerzy', value: totals?.partners ?? 0 },
          { label: 'Mają lidera', value: totals?.withUpline ?? 0 },
          { label: 'Bez lidera', value: totals?.withoutUpline ?? 0 },
          { label: 'Są liderami', value: totals?.leaders ?? 0 },
          { label: 'Głębokość struktury', value: totals?.maxDepth ?? 0 },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-secondary-800 rounded-xl p-4 border border-gray-100 dark:border-secondary-700/50">
            <div className="text-xs text-gray-400 uppercase tracking-wide">{card.label}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-secondary-800 rounded-xl border border-gray-100 dark:border-secondary-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-secondary-700/50 flex items-center gap-3 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj po nazwisku, emailu lub kodzie polecającym"
            className="flex-1 min-w-[240px] px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700"
          />
          {query && (
            <span className="text-xs text-gray-400">
              Pasujących gałęzi: <b className="text-gray-700 dark:text-gray-300">{visible}</b>
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : tree.length === 0 ? (
          <div className="py-16 text-center text-gray-500 dark:text-gray-400">
            {query ? 'Brak partnerów pasujących do wyszukiwania.' : 'Brak partnerów w strukturze.'}
          </div>
        ) : (
          <div className="p-2">
            {tree.map((node) => (
              <NodeRow key={node.id} node={node} />
            ))}
          </div>
        )}
      </div>

      {detached.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-5">
          <h2 className="font-semibold text-red-800 dark:text-red-400">Partnerzy poza drzewem</h2>
          <p className="text-sm text-red-700 dark:text-red-400/80 mb-3">
            Te profile mają lidera, ale nie da się do nich dojść od żadnego korzenia. Oznacza to pętlę w danych
            i wymaga ręcznej korekty w bazie.
          </p>
          <ul className="space-y-1">
            {detached.map((node) => (
              <li key={node.id} className="text-sm">
                <Link href={`/partners/${node.id}`} className="font-semibold text-red-800 dark:text-red-300 hover:underline">
                  {node.name || node.email}
                </Link>
                <span className="font-mono text-xs text-red-600 dark:text-red-400 ml-2">{node.referralCode}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Podpięcie partnera pod lidera jest jednorazowe i nieodwracalne. Zmiana lub usunięcie powiązania rozjechałoby
        rozliczone już prowizje i obroty poziomów, które naliczono według tej struktury.
      </p>
    </div>
  );
}
