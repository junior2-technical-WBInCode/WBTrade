'use client';

import { useState, useEffect } from 'react';
import { Trophy, RefreshCw, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface LevelDistribution {
  level: string;
  name: string;
  count: number;
}

interface LoyaltyOverview {
  totalUsers: number;
  totalSpent: number;
  averageSpent: number;
  levelDistribution: LevelDistribution[];
}

interface LoyaltyUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  level: string;
  levelName: string;
  totalSpent: number;
  qualifyingOrderCount: number;
  lastLevelUpAt: string | null;
}

interface UsersResponse {
  users: LoyaltyUser[];
  total: number;
  page: number;
  totalPages: number;
}

const LEVEL_COLORS: Record<string, string> = {
  NOWY_KLIENT: 'bg-gray-500',
  BRAZOWY: 'bg-amber-600',
  SREBRNY: 'bg-slate-400',
  ZLOTY: 'bg-yellow-500',
  PLATYNOWY: 'bg-cyan-500',
  DIAMENTOWY: 'bg-blue-600',
  VIP: 'bg-purple-600',
};

export default function AdminLoyaltyPage() {
  const { confirm } = useModal();
  const [overview, setOverview] = useState<LoyaltyOverview | null>(null);
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');

  async function apiCall(endpoint: string, options?: RequestInit) {
    const token = getAuthToken();
    return fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });
  }

  async function loadData() {
    try {
      setLoading(true);
      const [overviewRes, usersRes] = await Promise.all([
        apiCall('/admin/loyalty/overview'),
        apiCall(`/admin/loyalty/users?page=${page}&limit=20${filterLevel ? `&level=${filterLevel}` : ''}`),
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (usersRes.ok) setUsersData(await usersRes.json());
    } catch (err) {
      console.error('Error loading loyalty data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [page, filterLevel]);

  async function handleRecalculate() {
    if (!await confirm('Czy na pewno chcesz przeliczyć poziomy wszystkich użytkowników? To może chwilę potrwać.')) return;
    setRecalculating(true);
    setMessage('');
    try {
      const res = await apiCall('/admin/loyalty/recalculate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Przeliczono ${data.processed} użytkowników, ${data.leveledUp} zmian poziomu.`);
        loadData();
      }
    } catch (err) {
      setMessage('Wystąpił błąd podczas przeliczania.');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleSetLevel(userId: string, level: string) {
    try {
      const res = await apiCall(`/admin/loyalty/users/${userId}/level`, {
        method: 'PUT',
        body: JSON.stringify({ level }),
      });
      if (res.ok) {
        setMessage('Poziom został zmieniony.');
        loadData();
      }
    } catch (err) {
      setMessage('Nie udało się zmienić poziomu.');
    }
  }

  const totalDistribution = overview?.levelDistribution.reduce((sum, l) => sum + l.count, 0) || 1;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Trophy className="w-7 h-7 text-orange-500" />
          Program Lojalnościowy
        </h1>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
          {recalculating ? 'Przeliczanie...' : 'Przelicz wszystkich'}
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <>
          {/* Stats */}
          {overview && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <p className="text-sm text-slate-400">Użytkownicy w programie</p>
                <p className="text-3xl font-bold text-white mt-1">{overview.totalUsers}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <p className="text-sm text-slate-400">Łączne wydatki (kwalifikujące)</p>
                <p className="text-3xl font-bold text-white mt-1">{overview.totalSpent.toLocaleString('pl-PL', { minimumFractionDigits: 0 })} PLN</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <p className="text-sm text-slate-400">Średnie wydatki na użytkownika</p>
                <p className="text-3xl font-bold text-white mt-1">{overview.averageSpent.toLocaleString('pl-PL', { minimumFractionDigits: 0 })} PLN</p>
              </div>
            </div>
          )}

          {/* Level Distribution */}
          {overview && overview.levelDistribution.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">Rozkład użytkowników wg poziomu</h2>
              <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                {overview.levelDistribution.map((l) => (
                  <div
                    key={l.level}
                    className={`${LEVEL_COLORS[l.level] || 'bg-gray-500'} relative group cursor-pointer`}
                    style={{ width: `${(l.count / totalDistribution) * 100}%`, minWidth: l.count > 0 ? '2px' : '0' }}
                    title={`${l.name}: ${l.count}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {overview.levelDistribution.map((l) => (
                  <button
                    key={l.level}
                    onClick={() => setFilterLevel(filterLevel === l.level ? '' : l.level)}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                      filterLevel === l.level
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${LEVEL_COLORS[l.level] || 'bg-gray-500'}`} />
                    {l.name}: {l.count}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Users Table */}
          {usersData && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-500" />
                  Użytkownicy ({usersData.total})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase">Użytkownik</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase">Poziom</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase">Wydane</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase">Zamówienia</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {usersData.users.map((u) => (
                      <tr key={u.userId} className="hover:bg-slate-700/50">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-white">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-white ${LEVEL_COLORS[u.level] || 'bg-gray-500'}`}>
                            {u.levelName}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-white">
                          {u.totalSpent.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-slate-300">{u.qualifyingOrderCount}</td>
                        <td className="px-5 py-3 text-right">
                          <select
                            value={u.level}
                            onChange={(e) => handleSetLevel(u.userId, e.target.value)}
                            className="text-xs bg-slate-700 border border-slate-600 text-white rounded px-2 py-1"
                          >
                            <option value="NOWY_KLIENT">Nowy Klient</option>
                            <option value="BRAZOWY">Brązowy</option>
                            <option value="SREBRNY">Srebrny</option>
                            <option value="ZLOTY">Złoty</option>
                            <option value="PLATYNOWY">Platynowy</option>
                            <option value="DIAMENTOWY">Diamentowy</option>
                            <option value="VIP">VIP</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {usersData.totalPages > 1 && (
                <div className="p-4 border-t border-slate-700 flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Strona {usersData.page} z {usersData.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(usersData.totalPages, p + 1))}
                      disabled={page === usersData.totalPages}
                      className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
