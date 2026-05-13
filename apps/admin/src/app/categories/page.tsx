'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  ChevronRight,
  Package,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Search,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  image: string | null;
  order: number;
  isActive: boolean;
  baselinkerCategoryId: string | null;
  baselinkerCategoryPath: string | null;
  _count: {
    products: number;
    children: number;
  };
  children?: AdminCategory[];
}

type FilterMode = 'all' | 'active' | 'inactive';

export default function CategoriesPage() {
  const { alert, confirm } = useModal();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/categories`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (!response.ok) throw new Error('Failed to load categories');
      const data = await response.json();
      const flat: AdminCategory[] = Array.isArray(data) ? data : (data.categories || []);
      setCategories(buildTree(flat));
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function buildTree(flat: AdminCategory[]): AdminCategory[] {
    const map = new Map<string, AdminCategory>();
    const roots: AdminCategory[] = [];
    flat.forEach(cat => map.set(cat.id, { ...cat, children: [] }));
    flat.forEach(cat => {
      const item = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children!.push(item);
      } else {
        roots.push(item);
      }
    });
    return roots;
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = (cats: AdminCategory[]) => {
    const ids = new Set<string>();
    const collect = (items: AdminCategory[]) => {
      items.forEach(c => {
        if (c.children && c.children.length > 0) {
          ids.add(c.id);
          collect(c.children);
        }
      });
    };
    collect(cats);
    setExpandedIds(ids);
  };

  const toggleVisibility = async (category: AdminCategory, cascade: boolean) => {
    const newValue = !category.isActive;

    if (cascade && category.children && category.children.length > 0) {
      const verb = newValue ? 'pokazać' : 'ukryć';
      const ok = await confirm(
        `Czy chcesz ${verb} kategorię "${category.name}" wraz ze wszystkimi podkategoriami?`
      );
      if (!ok) return;
    }

    setTogglingIds(prev => new Set(prev).add(category.id));
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/categories/${category.id}/visibility`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ isActive: newValue, cascade }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Błąd aktualizacji');
      }
      await loadCategories();
    } catch (error: any) {
      await alert(error.message || 'Błąd podczas zmiany widoczności kategorii');
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(category.id);
        return next;
      });
    }
  };

  function flattenTree(cats: AdminCategory[]): AdminCategory[] {
    const result: AdminCategory[] = [];
    const walk = (items: AdminCategory[]) => {
      items.forEach(c => {
        result.push(c);
        if (c.children) walk(c.children);
      });
    };
    walk(cats);
    return result;
  }

  const flatAll = flattenTree(categories);
  const totalCount = flatAll.length;
  const activeCount = flatAll.filter(c => c.isActive).length;
  const inactiveCount = flatAll.filter(c => !c.isActive).length;
  const baselinkerCount = flatAll.filter(c => c.baselinkerCategoryId !== null).length;

  const getFilteredTree = (): AdminCategory[] => {
    if (filter === 'all' && !search.trim()) return categories;
    const searchLower = search.toLowerCase().trim();

    const matchesSearch = (cat: AdminCategory): boolean => {
      if (!searchLower) return true;
      return (
        cat.name.toLowerCase().includes(searchLower) ||
        cat.slug.toLowerCase().includes(searchLower) ||
        (cat.baselinkerCategoryId?.toLowerCase().includes(searchLower) ?? false)
      );
    };

    const matchesFilter = (cat: AdminCategory): boolean => {
      if (filter === 'active') return cat.isActive;
      if (filter === 'inactive') return !cat.isActive;
      return true;
    };

    const filterTree = (cats: AdminCategory[]): AdminCategory[] => {
      return cats.reduce<AdminCategory[]>((acc, cat) => {
        const filteredChildren = filterTree(cat.children || []);
        const selfMatch = matchesSearch(cat) && matchesFilter(cat);
        if (selfMatch || filteredChildren.length > 0) {
          acc.push({ ...cat, children: filteredChildren });
        }
        return acc;
      }, []);
    };

    return filterTree(categories);
  };

  const filteredTree = getFilteredTree();

  const renderCategory = (category: AdminCategory, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const isToggling = togglingIds.has(category.id);

    return (
      <div key={category.id}>
        <div
          className={`flex items-center gap-3 py-3 px-4 hover:bg-slate-700/20 transition-colors ${
            !category.isActive ? 'opacity-60' : ''
          }`}
          style={{ paddingLeft: `${1 + level * 1.5}rem` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(category.id)}
              className="p-1 hover:bg-slate-600 rounded transition-colors flex-shrink-0"
            >
              <ChevronRight
                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <div className="w-6 flex-shrink-0" />
          )}

          <div className={`p-1.5 rounded-lg flex-shrink-0 ${category.isActive ? 'bg-orange-500/20' : 'bg-slate-700/50'}`}>
            <FolderTree className={`w-4 h-4 ${category.isActive ? 'text-orange-400' : 'text-gray-500'}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-white truncate">{category.name}</p>
              {category.baselinkerCategoryId && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex-shrink-0">
                  BL #{category.baselinkerCategoryId}
                </span>
              )}
              {!category.isActive && (
                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded flex-shrink-0">
                  ukryta
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">/{category.slug}</p>
          </div>

          <div className="flex items-center gap-1 text-sm text-gray-400 flex-shrink-0">
            <Package className="w-3.5 h-3.5" />
            <span>{category._count.products}</span>
          </div>

          <button
            onClick={() => toggleVisibility(category, hasChildren ? true : false)}
            disabled={isToggling}
            title={category.isActive ? 'Ukryj na stronie' : 'Pokaż na stronie'}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
              isToggling
                ? 'opacity-50 cursor-not-allowed bg-slate-600'
                : category.isActive
                ? 'bg-orange-500 hover:bg-orange-600'
                : 'bg-slate-600 hover:bg-slate-500'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                category.isActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-slate-700/50 ml-7">
            {category.children!.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Kategorie</h1>
          <p className="text-gray-400 text-sm">Zarządzaj widocznością kategorii synchronizowanych z Baselinker</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/baselinker"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Synchronizacja Baselinker
          </Link>
          <button
            onClick={loadCategories}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Odśwież
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <p className="text-gray-400 text-sm">Wszystkie</p>
          <p className="text-2xl font-bold text-white mt-1">{totalCount}</p>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-xl border border-green-500/20">
          <p className="text-gray-400 text-sm">Widoczne</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{activeCount}</p>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-xl border border-red-500/20">
          <p className="text-gray-400 text-sm">Ukryte</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{inactiveCount}</p>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-xl border border-blue-500/20">
          <p className="text-gray-400 text-sm">Z Baselinker</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{baselinkerCount}</p>
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-300">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Przełącznik widoczności kontroluje pole <code className="bg-blue-500/20 px-1 rounded">isActive</code> w bazie.
          Ukryte kategorie nie pojawiają się na stronie sklepu ani w filtrach produktów.
          Kliknięcie na kategorię z podkategoriami spyta o kaskadową zmianę całej gałęzi.
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj kategorii..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['all', 'active', 'inactive'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-2 text-sm transition-colors ${
                filter === mode
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {mode === 'all' ? 'Wszystkie' : mode === 'active' ? (
                <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />Widoczne</span>
              ) : (
                <span className="flex items-center gap-1"><EyeOff className="w-3.5 h-3.5" />Ukryte</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => expandAll(filteredTree)}
          className="text-sm text-gray-400 hover:text-white transition-colors whitespace-nowrap flex items-center gap-1"
        >
          <ChevronDown className="w-4 h-4" />
          Rozwiń wszystkie
        </button>

        <button
          onClick={() => setExpandedIds(new Set())}
          className="text-sm text-gray-400 hover:text-white transition-colors whitespace-nowrap"
        >
          Zwiń wszystkie
        </button>
      </div>

      {/* Category tree */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="font-medium text-white flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-orange-400" />
            Struktura kategorii
          </h2>
          <span className="text-sm text-gray-400">
            {filteredTree.length} kategorii głównych
          </span>
        </div>

        <div className="divide-y divide-slate-700/30">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4">
                <div className="h-10 bg-slate-700 rounded animate-pulse" />
              </div>
            ))
          ) : filteredTree.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <FolderTree className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Brak kategorii</p>
              <p className="text-sm mt-2">
                {search || filter !== 'all'
                  ? 'Brak wyników dla wybranych filtrów'
                  : 'Kategorie są synchronizowane z Baselinker'}
              </p>
            </div>
          ) : (
            filteredTree.map(cat => renderCategory(cat))
          )}
        </div>
      </div>
    </div>
  );
}
