'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Factory, Plus, Search, Edit, Trash2, Package } from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  _count: { products: number };
}

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { confirm } = useModal();

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadManufacturers();
  }, [page, search]);

  async function loadManufacturers() {
    try {
      setLoading(true);
      const token = getAuthToken();
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);

      const res = await fetch(`${API_URL}/manufacturers?${params}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      const data = await res.json();
      setManufacturers(data.manufacturers || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error('Error loading manufacturers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/manufacturers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        setShowCreate(false);
        loadManufacturers();
      }
    } catch (err) {
      console.error('Error creating manufacturer:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({ title: `Usuń producenta "${name}"`, message: 'Czy na pewno chcesz usunąć tego producenta? Produkty zostaną odłączone.' });
    if (!ok) return;

    try {
      const token = getAuthToken();
      await fetch(`${API_URL}/manufacturers/${id}`, {
        method: 'DELETE',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      loadManufacturers();
    } catch (err) {
      console.error('Error deleting manufacturer:', err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Factory className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Producenci</h1>
            <p className="text-sm text-gray-400">Zarządzaj danymi producent&oacute;w (GPSR)</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Dodaj producenta
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Szukaj producenta..."
          className="w-full pl-10 pr-4 py-2 bg-admin-card border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Stats */}
      <div className="text-sm text-gray-400">
        Łącznie: {total} producent&oacute;w
      </div>

      {/* Table */}
      <div className="bg-admin-card rounded-xl border border-admin-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-admin-border text-left text-xs uppercase text-gray-400">
              <th className="px-4 py-3">Nazwa</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3 text-center">Produkty</th>
              <th className="px-4 py-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Ładowanie...</td></tr>
            ) : manufacturers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Brak producent&oacute;w</td></tr>
            ) : manufacturers.map((m) => (
              <tr key={m.id} className="border-b border-admin-border/50 hover:bg-admin-hover transition">
                <td className="px-4 py-3">
                  <Link href={`/manufacturers/${m.id}`} className="font-medium text-primary hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{m.email || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{m.phone || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs">
                    <Package className="w-3 h-3" />
                    {m._count.products}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/manufacturers/${m.id}`} className="p-1.5 rounded hover:bg-admin-hover text-gray-400 hover:text-primary">
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button onClick={() => handleDelete(m.id, m.name)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-sm rounded border border-admin-border disabled:opacity-50 hover:bg-admin-hover"
          >
            Poprzednia
          </button>
          <span className="text-sm text-gray-400">Strona {page} z {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm rounded border border-admin-border disabled:opacity-50 hover:bg-admin-hover"
          >
            Następna
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-admin-card rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Nowy producent</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nazwa producenta"
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-admin-border hover:bg-admin-hover">
                Anuluj
              </button>
              <button onClick={handleCreate} disabled={creating || !newName.trim()} className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50">
                {creating ? 'Tworzenie...' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
