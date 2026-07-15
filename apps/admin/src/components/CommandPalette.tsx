'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, Package, ShoppingCart, Users, Ticket, Mail,
  LayoutDashboard, Box, Hash, ArrowRight, Loader2, FileText, Settings
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface SearchResult {
  id: string;
  type: 'page' | 'product' | 'order' | 'user';
  title: string;
  subtitle: string;
  href: string;
  icon: any;
}

const pages: SearchResult[] = [
  { id: 'p-dashboard', type: 'page', title: 'Strona główna', subtitle: 'Dashboard', href: '/', icon: LayoutDashboard },
  { id: 'p-carousels', type: 'page', title: 'Karuzele produktów', subtitle: 'Strona główna', href: '/homepage/carousels', icon: LayoutDashboard },
  { id: 'p-products', type: 'page', title: 'Lista produktów', subtitle: 'Produkty', href: '/products', icon: Package },
  { id: 'p-categories', type: 'page', title: 'Kategorie', subtitle: 'Produkty', href: '/categories', icon: Package },
  { id: 'p-orders', type: 'page', title: 'Wszystkie zamówienia', subtitle: 'Zamówienia', href: '/orders', icon: ShoppingCart },
  { id: 'p-orders-open', type: 'page', title: 'Zamówienia nieopłacone', subtitle: 'Zamówienia', href: '/orders?status=OPEN', icon: ShoppingCart },
  { id: 'p-orders-confirmed', type: 'page', title: 'Zamówienia opłacone', subtitle: 'Zamówienia', href: '/orders?status=CONFIRMED', icon: ShoppingCart },
  { id: 'p-orders-processing', type: 'page', title: 'Zamówienia w realizacji', subtitle: 'Zamówienia', href: '/orders?status=PROCESSING', icon: ShoppingCart },
  { id: 'p-orders-shipped', type: 'page', title: 'Zamówienia wysłane', subtitle: 'Zamówienia', href: '/orders?status=SHIPPED', icon: ShoppingCart },
  { id: 'p-coupons', type: 'page', title: 'Kupony i rabaty', subtitle: 'Marketing', href: '/coupons', icon: Ticket },
  { id: 'p-email-templates', type: 'page', title: 'Szablony e-mail', subtitle: 'Sprzedaż', href: '/email-templates', icon: Mail },
  { id: 'p-newsletter', type: 'page', title: 'Newsletter', subtitle: 'Marketing', href: '/newsletter', icon: Mail },
  { id: 'p-users', type: 'page', title: 'Użytkownicy', subtitle: 'Użytkownicy', href: '/users', icon: Users },
  { id: 'p-baselinker', type: 'page', title: 'Baselinker', subtitle: 'Integracje', href: '/baselinker', icon: Box },
  { id: 'p-stock-sync', type: 'page', title: 'Synchronizacja stanów', subtitle: 'Integracje', href: '/stock-sync', icon: Box },
  { id: 'p-activity-log', type: 'page', title: 'Activity Log', subtitle: 'Bezpieczeństwo', href: '/activity-log', icon: ShoppingCart },
  { id: 'p-omnibus', type: 'page', title: 'Omnibus & Top produkty', subtitle: 'Analityka', href: '/omnibus', icon: Package },
  { id: 'p-warehouse', type: 'page', title: 'Stan magazynowy', subtitle: 'Magazyn', href: '/warehouse', icon: Box },
  { id: 'p-warehouse-movements', type: 'page', title: 'Ruchy magazynowe', subtitle: 'Magazyn', href: '/warehouse/movements', icon: Box },
  { id: 'p-warehouse-locations', type: 'page', title: 'Lokalizacje magazynowe', subtitle: 'Magazyn', href: '/warehouse/locations', icon: Box },
];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Listen for ⌘K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(pages.slice(0, 8));
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search logic
  useEffect(() => {
    if (!isOpen) return;

    if (!query.trim()) {
      setResults(pages.slice(0, 8));
      setSelectedIndex(0);
      return;
    }

    const q = query.toLowerCase();

    // Filter pages
    const pageResults = pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q)
    );

    // Show page results immediately
    setResults(pageResults);
    setSelectedIndex(0);

    // Debounced API search for products, orders, users
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchApi(q, pageResults), 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, isOpen]);

  async function searchApi(q: string, existingResults: SearchResult[]) {
    if (q.length < 2) return;

    try {
      setLoading(true);
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      };

      // Search products, orders, users in parallel
      const [productsRes, ordersRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/products?search=${encodeURIComponent(q)}&limit=5`, { headers }).catch(() => null),
        fetch(`${API_URL}/orders?search=${encodeURIComponent(q)}&limit=5`, { headers }).catch(() => null),
        fetch(`${API_URL}/users?search=${encodeURIComponent(q)}&limit=5`, { headers }).catch(() => null),
      ]);

      const apiResults: SearchResult[] = [];

      // Products
      if (productsRes?.ok) {
        const data = await productsRes.json();
        const products = data.products || data.data || data || [];
        (Array.isArray(products) ? products : []).slice(0, 5).forEach((p: any) => {
          apiResults.push({
            id: `product-${p.id}`,
            type: 'product',
            title: p.name || p.title || 'Produkt',
            subtitle: p.sku ? `SKU: ${p.sku}` : 'Produkt',
            href: `/products/${p.id}`,
            icon: Package,
          });
        });
      }

      // Orders
      if (ordersRes?.ok) {
        const data = await ordersRes.json();
        const orders = data.orders || data.data || data || [];
        (Array.isArray(orders) ? orders : []).slice(0, 5).forEach((o: any) => {
          apiResults.push({
            id: `order-${o.id}`,
            type: 'order',
            title: `Zamówienie #${o.orderNumber || o.id}`,
            subtitle: o.status || '',
            href: `/orders/${o.id}`,
            icon: ShoppingCart,
          });
        });
      }

      // Users
      if (usersRes?.ok) {
        const data = await usersRes.json();
        const users = data.users || data.data || data || [];
        (Array.isArray(users) ? users : []).slice(0, 5).forEach((u: any) => {
          apiResults.push({
            id: `user-${u.id}`,
            type: 'user',
            title: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
            subtitle: u.email || '',
            href: `/users`,
            icon: Users,
          });
        });
      }

      setResults([...existingResults, ...apiResults]);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(result: SearchResult) {
    setIsOpen(false);
    router.push(result.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  }

  if (!isOpen) return null;

  const grouped = {
    page: results.filter((r) => r.type === 'page'),
    product: results.filter((r) => r.type === 'product'),
    order: results.filter((r) => r.type === 'order'),
    user: results.filter((r) => r.type === 'user'),
  };

  const groupLabels: Record<string, string> = {
    page: 'Strony',
    product: 'Produkty',
    order: 'Zamówienia',
    user: 'Użytkownicy',
  };

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div
        className="w-full max-w-xl bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Szukaj stron, produktów, zamówień, użytkowników..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-400 text-sm"
          />
          {loading && <Loader2 className="w-4 h-4 text-orange-500 animate-spin flex-shrink-0" />}
          <kbd className="hidden sm:inline-flex px-2 py-0.5 text-[10px] text-slate-500 bg-slate-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nie znaleziono wyników</p>
              <p className="text-xs mt-1 text-slate-500">Spróbuj innej frazy</p>
            </div>
          ) : (
            Object.entries(grouped).map(([type, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={type}>
                  <p className="px-4 py-1.5 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                    {groupLabels[type]}
                  </p>
                  {items.map((result) => {
                    const currentIndex = flatIndex++;
                    const isSelected = currentIndex === selectedIndex;
                    const Icon = result.icon;
                    return (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-orange-500/10 text-white' : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700/50 text-slate-400'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          <p className="text-xs text-slate-500 truncate">{result.subtitle}</p>
                        </div>
                        {isSelected && <ArrowRight className="w-4 h-4 text-orange-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-700 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded">↑↓</kbd> nawiguj
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded">Enter</kbd> otwórz
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded">Esc</kbd> zamknij
          </span>
        </div>
      </div>

      {/* Backdrop click to close */}
      <div className="fixed inset-0 -z-10" onClick={() => setIsOpen(false)} />
    </div>
  );
}
