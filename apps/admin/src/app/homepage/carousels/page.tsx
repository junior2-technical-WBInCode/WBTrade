'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, X, Trash2, Eye, EyeOff,
  Star, Flame, Gift, Snowflake, Sparkles, ShoppingBag,
  TrendingUp, Clock, ChevronDown, ChevronUp, Edit2, Settings,
  ArrowUp, ArrowDown, LayoutGrid, Ban, Pin, Save,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  images?: { url: string }[];
  category?: { name: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

interface Carousel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  mode: 'MANUAL' | 'SEMI_AUTOMATIC' | 'AUTOMATIC';
  productLimit: number;
  categoryIds: string[];
  productIds: string[];
  pinnedProductIds: string[];
  autoSource: string | null;
  isVisible: boolean;
  isActive: boolean;
  sortOrder: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  star: <Star className="w-5 h-5" />,
  flame: <Flame className="w-5 h-5" />,
  gift: <Gift className="w-5 h-5" />,
  snowflake: <Snowflake className="w-5 h-5" />,
  sparkles: <Sparkles className="w-5 h-5" />,
  'shopping-bag': <ShoppingBag className="w-5 h-5" />,
  'trending-up': <TrendingUp className="w-5 h-5" />,
  clock: <Clock className="w-5 h-5" />,
  'layout-grid': <LayoutGrid className="w-5 h-5" />,
};

const ICON_OPTIONS = [
  { value: 'star', label: '⭐ Gwiazdka' },
  { value: 'flame', label: '🔥 Płomień' },
  { value: 'gift', label: '🎁 Prezent' },
  { value: 'snowflake', label: '❄️ Śnieżynka' },
  { value: 'sparkles', label: '✨ Iskierki' },
  { value: 'shopping-bag', label: '🛍️ Torba' },
  { value: 'trending-up', label: '📈 Trend' },
  { value: 'clock', label: '🕐 Zegar' },
  { value: 'layout-grid', label: '📦 Siatka' },
];

const COLOR_OPTIONS = [
  { value: 'from-violet-600 to-purple-700', label: 'Fioletowy' },
  { value: 'from-orange-500 to-red-600', label: 'Pomarańczowy' },
  { value: 'from-emerald-500 to-teal-600', label: 'Zielony' },
  { value: 'from-pink-500 to-rose-600', label: 'Różowy' },
  { value: 'from-blue-500 to-cyan-600', label: 'Niebieski' },
  { value: 'from-amber-500 to-yellow-600', label: 'Złoty' },
  { value: 'from-indigo-500 to-blue-600', label: 'Indygo' },
  { value: 'from-red-500 to-rose-700', label: 'Czerwony' },
];

const AUTO_SOURCE_OPTIONS = [
  { value: 'bestsellers', label: 'Bestsellery (najczęściej kupowane)' },
  { value: 'newest', label: 'Nowości (ostatnio dodane)' },
  { value: 'top-rated', label: 'Najlepiej oceniane' },
  { value: 'seasonal', label: 'Sezonowe (automatycznie wg pory roku)' },
  { value: 'featured', label: 'Polecane (zróżnicowane z kategorii)' },
];

const MODE_LABELS: Record<string, { label: string; desc: string }> = {
  MANUAL: { label: 'Ręczny', desc: 'Ty wybierasz produkty, kolejność i liczbę.' },
  SEMI_AUTOMATIC: { label: 'Pół-automatyczny', desc: 'Twoje produkty na początku, reszta wypełniana automatycznie.' },
  AUTOMATIC: { label: 'Automatyczny', desc: 'Wszystkie produkty dobierane automatycznie wg źródła.' },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

// ─── Component ────────────────────────────────────────────────────────────────

export default function CarouselsPage() {
  const { confirm } = useModal();
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Exclusion management
  const [showExclusions, setShowExclusions] = useState(false);
  const [excludedProducts, setExcludedProducts] = useState<Product[]>([]);
  const [exclusionSearchQuery, setExclusionSearchQuery] = useState('');
  const [exclusionSearchResults, setExclusionSearchResults] = useState<Product[]>([]);
  const [exclusionSearchLoading, setExclusionSearchLoading] = useState(false);
  const exclusionSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exclusionSearchAbortRef = useRef<AbortController | null>(null);

  // New carousel form
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState<'MANUAL' | 'SEMI_AUTOMATIC' | 'AUTOMATIC'>('MANUAL');
  const [newAutoSource, setNewAutoSource] = useState('bestsellers');
  const [newIcon, setNewIcon] = useState('star');
  const [newColor, setNewColor] = useState('from-orange-500 to-red-600');

  // Refs
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsAbortRef = useRef<AbortController | null>(null);

  const selectedCarousel = carousels.find(c => c.id === selectedId) || null;

  // Switch carousel with unsaved changes warning
  const selectCarousel = async (id: string) => {
    if (id === selectedId) return;
    if (hasUnsavedChanges && !await confirm('Masz niezapisane zmiany. Kontynuować bez zapisywania?')) return;
    setSelectedId(id);
  };

  // ── Load carousels + categories on mount ───
  useEffect(() => {
    loadCarousels();
    loadCategories();
    loadExclusions();
    return () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      if (productsAbortRef.current) productsAbortRef.current.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (exclusionSearchAbortRef.current) exclusionSearchAbortRef.current.abort();
      if (exclusionSearchDebounceRef.current) clearTimeout(exclusionSearchDebounceRef.current);
    };
  }, []);

  // ── Load products when selected carousel changes ───
  useEffect(() => {
    setHasUnsavedChanges(false);
    setSelectedProducts([]);
    setSearchQuery('');
    setSearchResults([]);

    if (selectedCarousel && selectedCarousel.productIds.length > 0) {
      loadSelectedProducts(selectedCarousel.productIds);
    }

    const timer = setTimeout(() => searchProducts(''), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── API helpers ───
  const authHeaders = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const getIcon = (iconName: string) => ICON_MAP[iconName] || <Star className="w-5 h-5" />;

  const getModeLabel = (mode: string) => {
    if (mode === 'MANUAL') return 'Ręczny';
    if (mode === 'SEMI_AUTOMATIC') return 'Pół-auto';
    return 'Auto';
  };

  // ── Data loading ───
  const loadCarousels = async () => {
    try {
      const res = await fetch(`${API_URL}/carousels/admin/all`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = data.carousels || [];
        setCarousels(list);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      }
    } catch (e) {
      console.error('Error loading carousels:', e);
    } finally {
      setPageLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : data.categories || []);
      }
    } catch (e) {
      console.error('Error loading categories:', e);
    }
  };

  const loadSelectedProducts = async (productIds: string[]) => {
    if (!productIds.length) { setSelectedProducts([]); return; }
    if (productsAbortRef.current) productsAbortRef.current.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;
    setLoadingProducts(true);

    try {
      const uniqueIds = [...new Set(productIds)];
      const res = await fetch(`${API_URL}/products/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: uniqueIds }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        const map = new Map(data.products.map((p: Product) => [p.id, p]));
        const ordered = uniqueIds.map(id => map.get(id)).filter(Boolean) as Product[];
        if (!controller.signal.aborted) setSelectedProducts(ordered);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Error loading products:', e);
    } finally {
      if (!controller.signal.aborted) setLoadingProducts(false);
    }
  };

  const searchProducts = async (query: string) => {
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);

    try {
      let url = `${API_URL}/products?limit=30`;
      if (query.length >= 2) url += `&search=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: authHeaders(), signal: controller.signal });
      if (controller.signal.aborted) return;

      if (res.ok) {
        const data = await res.json();
        let results = data.products || [];
        if (query.length >= 2) {
          const q = query.toLowerCase();
          results = results.sort((a: Product, b: Product) => {
            const ae = a.sku?.toLowerCase() === q;
            const be = b.sku?.toLowerCase() === q;
            if (ae && !be) return -1;
            if (be && !ae) return 1;
            return 0;
          });
        }
        const filtered = results.filter(
          (p: Product) => !selectedProducts.some(sp => sp.id === p.id)
        );
        setSearchResults(filtered);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  // ── Carousel CRUD ───
  const createCarousel = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/carousels/admin`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: newName.trim(),
          slug: newName.trim(),
          mode: newMode,
          autoSource: newMode !== 'MANUAL' ? newAutoSource : undefined,
          icon: newIcon,
          color: newColor,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCarousels(prev => [...prev, data.carousel]);
        setSelectedId(data.carousel.id);
        setShowNewModal(false);
        setNewName('');
        flash('success', 'Karuzela utworzona!');
      } else {
        const err = await res.json();
        flash('error', err.message || 'Błąd tworzenia karuzeli');
      }
    } catch (e) {
      flash('error', 'Błąd połączenia');
    } finally {
      setSaving(false);
    }
  };

  const updateCarousel = async (id: string, data: Partial<Carousel>) => {
    try {
      const res = await fetch(`${API_URL}/carousels/admin/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        setCarousels(prev => prev.map(c => c.id === id ? result.carousel : c));
        return true;
      }
    } catch (e) {
      console.error('Error updating carousel:', e);
    }
    return false;
  };

  const deleteCarousel = async (id: string) => {
    if (!await confirm('Czy na pewno chcesz usunąć tę karuzelę?')) return;
    try {
      const res = await fetch(`${API_URL}/carousels/admin/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setCarousels(prev => prev.filter(c => c.id !== id));
        if (selectedId === id) {
          setSelectedId(carousels.find(c => c.id !== id)?.id || null);
        }
        flash('success', 'Karuzela usunięta');
      }
    } catch (e) {
      flash('error', 'Błąd usuwania');
    }
  };

  const toggleVisibility = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/carousels/admin/${id}/visibility`, {
        method: 'PATCH',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCarousels(prev => prev.map(c => c.id === id ? data.carousel : c));
      }
    } catch (e) {
      console.error('Error toggling visibility:', e);
    }
  };

  const reorderCarousel = async (id: string, direction: 'up' | 'down') => {
    const idx = carousels.findIndex(c => c.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= carousels.length) return;

    const arr = [...carousels];
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    const items = arr.map((c, i) => ({ id: c.id, sortOrder: i }));
    setCarousels(arr.map((c, i) => ({ ...c, sortOrder: i })));

    try {
      await fetch(`${API_URL}/carousels/admin/reorder`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ items }),
      });
    } catch (e) {
      console.error('Error reordering:', e);
    }
  };

  // ── Product management (local only — saved via "Zapisz zmiany") ───
  const addProduct = (product: Product) => {
    if (!selectedCarousel) return;
    if (selectedProducts.some(p => p.id === product.id)) return;
    if (selectedProducts.length >= selectedCarousel.productLimit) {
      flash('error', `Limit produktów: ${selectedCarousel.productLimit}`);
      return;
    }
    const newProducts = [...selectedProducts, product];
    setSelectedProducts(newProducts);
    setSearchResults(prev => prev.filter(p => p.id !== product.id));
    const newIds = [...new Set([...selectedCarousel.productIds, product.id])];
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, productIds: newIds } : c));
    setHasUnsavedChanges(true);
  };

  const removeProduct = (productId: string) => {
    const removed = selectedProducts.find(p => p.id === productId);
    if (removed) setSearchResults(prev => [removed, ...prev]);
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
    if (selectedCarousel) {
      const newIds = selectedCarousel.productIds.filter(id => id !== productId);
      const newPinned = (selectedCarousel.pinnedProductIds || []).filter(id => id !== productId);
      setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, productIds: newIds, pinnedProductIds: newPinned } : c));
      setHasUnsavedChanges(true);
    }
  };

  const moveProduct = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= selectedProducts.length) return;
    const arr = [...selectedProducts];
    [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
    setSelectedProducts(arr);
    if (selectedCarousel) {
      const newIds = arr.map(p => p.id);
      setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, productIds: newIds } : c));
      setHasUnsavedChanges(true);
    }
  };

  const clearProducts = () => {
    setSelectedProducts([]);
    if (selectedCarousel) {
      setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, productIds: [], pinnedProductIds: [] } : c));
      setHasUnsavedChanges(true);
    }
  };

  const togglePin = (productId: string) => {
    if (!selectedCarousel) return;
    const currentPinned = selectedCarousel.pinnedProductIds || [];
    const isPinned = currentPinned.includes(productId);
    const newPinned = isPinned
      ? currentPinned.filter(id => id !== productId)
      : [...currentPinned, productId];
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, pinnedProductIds: newPinned } : c));
    setHasUnsavedChanges(true);
  };

  // ── Settings updates (local only — saved via "Zapisz zmiany") ───
  const updateMode = (mode: 'MANUAL' | 'SEMI_AUTOMATIC' | 'AUTOMATIC') => {
    if (!selectedCarousel) return;
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, mode } : c));
    setHasUnsavedChanges(true);
  };

  const updateLimit = (limit: number) => {
    if (!selectedCarousel) return;
    const clamped = Math.min(Math.max(limit, 1), 100);
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, productLimit: clamped } : c));
    setHasUnsavedChanges(true);
  };

  const updateAutoSource = (source: string) => {
    if (!selectedCarousel) return;
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, autoSource: source } : c));
    setHasUnsavedChanges(true);
  };

  const toggleCategory = (categoryId: string) => {
    if (!selectedCarousel) return;
    const current = selectedCarousel.categoryIds || [];
    const newIds = current.includes(categoryId)
      ? current.filter(id => id !== categoryId)
      : [...current, categoryId];
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, categoryIds: newIds } : c));
    setHasUnsavedChanges(true);
  };

  const updateName = (name: string) => {
    if (!selectedCarousel || !name.trim()) return;
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, name: name.trim() } : c));
    setEditingName(false);
    setHasUnsavedChanges(true);
  };

  const updateIcon = (icon: string) => {
    if (!selectedCarousel) return;
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, icon } : c));
    setHasUnsavedChanges(true);
  };

  const updateColor = (color: string) => {
    if (!selectedCarousel) return;
    setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, color } : c));
    setHasUnsavedChanges(true);
  };

  const saveChanges = async () => {
    if (!selectedCarousel) return;
    setSaving(true);
    try {
      const success = await updateCarousel(selectedCarousel.id, {
        name: selectedCarousel.name,
        mode: selectedCarousel.mode,
        productLimit: selectedCarousel.productLimit,
        categoryIds: selectedCarousel.categoryIds,
        productIds: selectedCarousel.productIds,
        pinnedProductIds: selectedCarousel.pinnedProductIds,
        autoSource: selectedCarousel.autoSource,
        icon: selectedCarousel.icon,
        color: selectedCarousel.color,
      });
      if (success) {
        setHasUnsavedChanges(false);
        flash('success', 'Zmiany zostały zapisane!');
      } else {
        flash('error', 'Błąd zapisywania zmian');
      }
    } catch {
      flash('error', 'Błąd połączenia');
    } finally {
      setSaving(false);
    }
  };

  // ── Exclusion management ───
  const loadExclusions = async () => {
    try {
      const res = await fetch(`${API_URL}/carousels/admin/exclusions`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setExcludedProducts(data.products || []);
      }
    } catch (e) {
      console.error('Error loading exclusions:', e);
    }
  };

  const addExclusion = async (product: Product) => {
    try {
      const res = await fetch(`${API_URL}/carousels/admin/exclusions/${product.id}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        setExcludedProducts(prev => [...prev, product]);
        setExclusionSearchResults(prev => prev.filter(p => p.id !== product.id));
        flash('success', `Wykluczono: ${product.name}`);
      }
    } catch (e) {
      flash('error', 'Błąd dodawania wykluczenia');
    }
  };

  const removeExclusion = async (productId: string) => {
    try {
      const res = await fetch(`${API_URL}/carousels/admin/exclusions/${productId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setExcludedProducts(prev => prev.filter(p => p.id !== productId));
        flash('success', 'Usunięto wykluczenie');
      }
    } catch (e) {
      flash('error', 'Błąd usuwania wykluczenia');
    }
  };

  const searchExclusionProducts = async (query: string) => {
    if (query.length < 2) { setExclusionSearchResults([]); return; }
    if (exclusionSearchAbortRef.current) exclusionSearchAbortRef.current.abort();
    const controller = new AbortController();
    exclusionSearchAbortRef.current = controller;
    setExclusionSearchLoading(true);

    try {
      const res = await fetch(`${API_URL}/products?limit=20&search=${encodeURIComponent(query)}`, {
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        const results = (data.products || []).filter(
          (p: Product) => !excludedProducts.some(ep => ep.id === p.id)
        );
        setExclusionSearchResults(results);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) setExclusionSearchLoading(false);
    }
  };

  // ── Render ───
  if (pageLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-2 border-slate-600 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400">Ładowanie karuzel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Karuzele produktów</h1>
          <p className="text-slate-400 mt-1">
            Zarządzaj karuzelami na stronie głównej — dodawaj, edytuj, usuwaj, zmieniaj kolejność
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Dodaj karuzelę
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* ─── Left: Carousel List ──────────────────────── */}
        <div className="col-span-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">Karuzele ({carousels.length})</h2>
            </div>
            <div className="p-2 space-y-1">
              {carousels.map((carousel, idx) => (
                <div
                  key={carousel.id}
                  className={`group relative rounded-lg transition-colors cursor-pointer ${
                    selectedId === carousel.id
                      ? 'bg-slate-700 border border-slate-600'
                      : 'hover:bg-slate-700/50 border border-transparent'
                  }`}
                >
                  <button
                    onClick={() => selectCarousel(carousel.id)}
                    className="w-full text-left p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${carousel.color} flex items-center justify-center text-white ${!carousel.isVisible ? 'opacity-40' : ''}`}>
                        {getIcon(carousel.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-white flex items-center gap-2 ${!carousel.isVisible ? 'opacity-40' : ''}`}>
                          <span className="truncate">{carousel.name}</span>
                          {!carousel.isVisible && <EyeOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            carousel.mode === 'MANUAL' ? 'bg-blue-500/20 text-blue-400' :
                            carousel.mode === 'SEMI_AUTOMATIC' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {getModeLabel(carousel.mode)}
                          </span>
                          <span>{carousel.productIds.length > 0 ? `${carousel.productIds.length} prod.` : 'Auto'}</span>
                          <span>• Max {carousel.productLimit}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                  {/* Actions on hover */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); reorderCarousel(carousel.id, 'up'); }} disabled={idx === 0} className="p-1 text-slate-400 hover:text-white disabled:opacity-20" title="Przesuń wyżej">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); reorderCarousel(carousel.id, 'down'); }} disabled={idx === carousels.length - 1} className="p-1 text-slate-400 hover:text-white disabled:opacity-20" title="Przesuń niżej">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleVisibility(carousel.id); }} className="p-1 text-slate-400 hover:text-white" title={carousel.isVisible ? 'Ukryj' : 'Pokaż'}>
                      {carousel.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteCarousel(carousel.id); }} className="p-1 text-red-400 hover:text-red-300" title="Usuń">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {carousels.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <p>Brak karuzel. Dodaj pierwszą karuzelę.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right: Carousel Editor ───────────────────── */}
        <div className="col-span-8">
          {!selectedCarousel ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center text-slate-500">
              <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Wybierz karuzelę z listy po lewej lub dodaj nową</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Carousel header */}
              <div className={`bg-gradient-to-r ${selectedCarousel.color} rounded-xl p-4`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white">
                    {getIcon(selectedCarousel.icon)}
                  </div>
                  <div className="flex-1">
                    {editingName ? (
                      <input
                        autoFocus
                        defaultValue={selectedCarousel.name}
                        onBlur={(e) => updateName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateName((e.target as HTMLInputElement).value);
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="bg-white/20 text-white text-xl font-bold rounded px-2 py-1 w-full outline-none focus:ring-2 focus:ring-white/50"
                      />
                    ) : (
                      <h2
                        className="text-xl font-bold text-white flex items-center gap-2 cursor-pointer"
                        onClick={() => setEditingName(true)}
                      >
                        {selectedCarousel.name}
                        <Edit2 className="w-4 h-4 opacity-50 hover:opacity-100" />
                      </h2>
                    )}
                    <p className="text-white/70 text-sm">
                      {selectedCarousel.description || `Slug: ${selectedCarousel.slug}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Save changes bar */}
              {hasUnsavedChanges && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Save className="w-4 h-4" />
                    <span className="text-sm font-medium">Masz niezapisane zmiany</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { loadCarousels(); setHasUnsavedChanges(false); }}
                      className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      Anuluj
                    </button>
                    <button
                      onClick={saveChanges}
                      disabled={saving}
                      className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Zapisuj\u0119...' : 'Zapisz zmiany'}
                    </button>
                  </div>
                </div>
              )}

              {/* Settings panel */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Ustawienia karuzeli
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Mode selector */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Tryb</label>
                    <div className="space-y-1.5">
                      {(['MANUAL', 'SEMI_AUTOMATIC', 'AUTOMATIC'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => updateMode(mode)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            selectedCarousel.mode === mode
                              ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                              : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="font-medium text-sm">{MODE_LABELS[mode].label}</div>
                          <div className="text-xs opacity-70">{MODE_LABELS[mode].desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Right column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Limit produktów</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={selectedCarousel.productLimit}
                          onChange={(e) => updateLimit(parseInt(e.target.value) || 20)}
                          className="w-24 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-center focus:outline-none focus:border-orange-500"
                        />
                        <span className="text-sm text-slate-400">produktów (1-100)</span>
                      </div>
                    </div>
                    {selectedCarousel.mode !== 'MANUAL' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Źródło automatyczne</label>
                        <select
                          value={selectedCarousel.autoSource || 'bestsellers'}
                          onChange={(e) => updateAutoSource(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                        >
                          {AUTO_SOURCE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Ikona</label>
                        <select
                          value={selectedCarousel.icon}
                          onChange={(e) => updateIcon(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                        >
                          {ICON_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Kolor</label>
                        <select
                          value={selectedCarousel.color}
                          onChange={(e) => updateColor(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                        >
                          {COLOR_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category filter */}
                {selectedCarousel.mode !== 'MANUAL' && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Filtruj po kategoriach (opcjonalnie)
                    </label>
                    <p className="text-xs text-slate-500 mb-2">
                      Zaznacz kategorie, z których mają być pobierane produkty. Puste = wszystkie.
                    </p>
                    <div className="max-h-48 overflow-y-auto bg-slate-900 rounded-lg border border-slate-600 p-2 space-y-1">
                      {categories.map(cat => (
                        <div key={cat.id}>
                          <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedCarousel.categoryIds.includes(cat.id)}
                              onChange={() => toggleCategory(cat.id)}
                              className="rounded border-slate-500 text-orange-500 focus:ring-orange-500 bg-slate-700"
                            />
                            <span className="text-sm text-white">{cat.name}</span>
                          </label>
                          {cat.children && cat.children.length > 0 && (
                            <div className="ml-6 space-y-0.5">
                              {cat.children.map(sub => (
                                <label key={sub.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-800 rounded cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedCarousel.categoryIds.includes(sub.id)}
                                    onChange={() => toggleCategory(sub.id)}
                                    className="rounded border-slate-500 text-orange-500 focus:ring-orange-500 bg-slate-700"
                                  />
                                  <span className="text-xs text-slate-300">{sub.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {selectedCarousel.categoryIds.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          Wybrano: {selectedCarousel.categoryIds.length} kategorii
                        </span>
                        <button
                          onClick={() => {
                            updateCarousel(selectedCarousel.id, { categoryIds: [] });
                            setCarousels(prev => prev.map(c => c.id === selectedId ? { ...c, categoryIds: [] } : c));
                          }}
                          className="text-xs text-orange-400 hover:text-orange-300"
                        >
                          Wyczyść
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Product search (MANUAL + SEMI_AUTOMATIC) */}
              {selectedCarousel.mode !== 'AUTOMATIC' && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="p-4 border-b border-slate-700">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Szukaj produktu po nazwie lub SKU..."
                        value={searchQuery}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSearchQuery(value);
                          if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                          searchDebounceRef.current = setTimeout(() => searchProducts(value), 300);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="mt-3">
                      <div className="text-sm text-slate-400 mb-2">
                        {loading ? 'Ładowanie...' : `Dostępne produkty (${searchResults.length})`}
                      </div>
                      <div className="max-h-60 overflow-y-auto bg-slate-900 rounded-lg border border-slate-600">
                        {searchResults.length === 0 && !loading ? (
                          <div className="p-4 text-center text-slate-400">Brak produktów do wyświetlenia</div>
                        ) : (
                          searchResults.map((product) => (
                            <div key={product.id} className="flex items-center gap-3 p-3 hover:bg-slate-800 transition-colors border-b border-slate-700 last:border-0">
                              <div className="w-12 h-12 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                                {product.images?.[0]?.url ? (
                                  <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500"><Eye className="w-5 h-5" /></div>
                                )}
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <div className="text-white text-sm font-medium truncate">{product.name}</div>
                                <div className="text-slate-400 text-xs">SKU: {product.sku} • {Number(product.price).toFixed(2)} zł</div>
                              </div>
                              <button onClick={() => addProduct(product)} className="p-2 text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded-lg transition-colors" title="Dodaj">
                                <Plus className="w-5 h-5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-white">
                        Wybrane produkty ({selectedProducts.length}/{selectedCarousel.productLimit})
                        {selectedProducts.length >= selectedCarousel.productLimit && (
                          <span className="ml-2 text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Limit</span>
                        )}
                      </h3>
                      {selectedProducts.length > 0 && (
                        <button onClick={clearProducts} className="text-sm text-slate-400 hover:text-white flex items-center gap-1">
                          <Trash2 className="w-4 h-4" /> Wyczyść
                        </button>
                      )}
                    </div>

                    {loadingProducts ? (
                      <div className="text-center py-8">
                        <div className="inline-block w-8 h-8 border-2 border-slate-600 border-t-orange-500 rounded-full animate-spin mb-3"></div>
                        <p className="text-slate-400">Ładowanie produktów...</p>
                      </div>
                    ) : selectedProducts.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        {selectedCarousel.mode === 'SEMI_AUTOMATIC'
                          ? 'Brak ręcznych produktów. Reszta wypełni się automatycznie.'
                          : 'Wyszukaj i dodaj produkty powyżej.'}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {selectedProducts.map((product, index) => (
                          <div key={`${product.id}-${index}`} className={`flex items-center gap-3 p-3 rounded-lg border ${
                            selectedCarousel?.pinnedProductIds?.includes(product.id)
                              ? 'bg-amber-500/5 border-amber-500/40'
                              : 'bg-slate-900 border-slate-700'
                          }`}>
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => moveProduct(index, 'up')} disabled={index === 0} className="p-0.5 hover:bg-slate-700 rounded disabled:opacity-20">
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              </button>
                              <button onClick={() => moveProduct(index, 'down')} disabled={index === selectedProducts.length - 1} className="p-0.5 hover:bg-slate-700 rounded disabled:opacity-20">
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              </button>
                            </div>
                            <div className="w-12 h-12 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                              {product.images?.[0]?.url ? (
                                <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500"><Eye className="w-5 h-5" /></div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-white text-sm font-medium truncate">{product.name}</div>
                              <div className="text-slate-400 text-xs">{product.category?.name} • {Number(product.price).toFixed(2)} zł</div>
                            </div>
                            <div className="text-slate-500 text-sm font-medium">#{index + 1}</div>
                            <button
                              onClick={() => togglePin(product.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                selectedCarousel?.pinnedProductIds?.includes(product.id)
                                  ? 'text-amber-400 bg-amber-400/20'
                                  : 'text-slate-500 hover:text-amber-400 hover:bg-amber-400/10'
                              }`}
                              title={selectedCarousel?.pinnedProductIds?.includes(product.id) ? 'Odepnij produkt' : 'Przypnij na pocz\u0105tek karuzeli'}
                            >
                              <Pin className="w-4 h-4" />
                            </button>
                            <button onClick={() => removeProduct(product.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AUTOMATIC mode info */}
              {selectedCarousel.mode === 'AUTOMATIC' && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Tryb automatyczny</h3>
                  <p className="text-slate-400 max-w-md mx-auto">
                    Produkty są dobierane automatycznie na podstawie źródła
                    {selectedCarousel.autoSource && (
                      <span className="text-orange-400 font-medium">
                        {' '}„{AUTO_SOURCE_OPTIONS.find(o => o.value === selectedCarousel.autoSource)?.label || selectedCarousel.autoSource}"
                      </span>
                    )}
                    {selectedCarousel.categoryIds.length > 0 && (
                      <span>, filtrowane po {selectedCarousel.categoryIds.length} kategorii</span>
                    )}.
                    Wyświetlanych będzie max <span className="text-orange-400 font-medium">{selectedCarousel.productLimit}</span> produktów.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Global Product Exclusions ───────────────── */}
      <div className="mt-6 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <button
          onClick={() => setShowExclusions(!showExclusions)}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-750 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <Ban className="w-5 h-5 text-red-400" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-white">Wykluczone produkty</h3>
              <p className="text-xs text-slate-400">
                Produkty wykluczone ze wszystkich karuzel ({excludedProducts.length})
              </p>
            </div>
          </div>
          {showExclusions
            ? <ChevronUp className="w-5 h-5 text-slate-400" />
            : <ChevronDown className="w-5 h-5 text-slate-400" />
          }
        </button>

        {showExclusions && (
          <div className="border-t border-slate-700 p-4">
            {/* Search to add exclusions */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Szukaj produktu do wykluczenia..."
                  value={exclusionSearchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setExclusionSearchQuery(value);
                    if (exclusionSearchDebounceRef.current) clearTimeout(exclusionSearchDebounceRef.current);
                    exclusionSearchDebounceRef.current = setTimeout(() => searchExclusionProducts(value), 300);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
                />
              </div>
              {(exclusionSearchResults.length > 0 || exclusionSearchLoading) && (
                <div className="mt-2 max-h-48 overflow-y-auto bg-slate-900 rounded-lg border border-slate-600">
                  {exclusionSearchLoading ? (
                    <div className="p-3 text-center text-slate-400 text-sm">Szukam...</div>
                  ) : (
                    exclusionSearchResults.map(product => (
                      <div key={product.id} className="flex items-center gap-3 p-3 hover:bg-slate-800 border-b border-slate-700 last:border-0">
                        <div className="w-10 h-10 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                          {product.images?.[0]?.url ? (
                            <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">?</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium truncate">{product.name}</div>
                          <div className="text-slate-400 text-xs">SKU: {product.sku} &bull; {Number(product.price).toFixed(2)} zł</div>
                        </div>
                        <button
                          onClick={() => addExclusion(product)}
                          className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                        >
                          Wyklucz
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Excluded products list */}
            {excludedProducts.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <Ban className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Brak wykluczonych produktów</p>
                <p className="text-xs text-slate-600 mt-1">Wyszukaj produkt powyżej, aby go wykluczyć ze wszystkich karuzel.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {excludedProducts.map(product => (
                  <div key={product.id} className="flex items-center gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-700">
                    <div className="w-10 h-10 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                      {product.images?.[0]?.url ? (
                        <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{product.name}</div>
                      <div className="text-slate-400 text-xs">{Number(product.price).toFixed(2)} zł</div>
                    </div>
                    <button
                      onClick={() => removeExclusion(product.id)}
                      className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                      title="Usuń wykluczenie"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── New Carousel Modal ─────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNewModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Nowa karuzela</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nazwa</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="np. Bestsellery, Nowości, Zabawki..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tryb</label>
                <div className="space-y-1.5">
                  {(['MANUAL', 'SEMI_AUTOMATIC', 'AUTOMATIC'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setNewMode(mode)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        newMode === mode
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                          : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="font-medium text-sm">{MODE_LABELS[mode].label}</div>
                      <div className="text-xs opacity-70">{MODE_LABELS[mode].desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {newMode !== 'MANUAL' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Źródło automatyczne</label>
                  <select
                    value={newAutoSource}
                    onChange={e => setNewAutoSource(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                  >
                    {AUTO_SOURCE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Ikona</label>
                  <select
                    value={newIcon}
                    onChange={e => setNewIcon(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                  >
                    {ICON_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Kolor</label>
                  <select
                    value={newColor}
                    onChange={e => setNewColor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                  >
                    {COLOR_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                Anuluj
              </button>
              <button onClick={createCarousel} disabled={saving || !newName.trim()} className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                {saving ? 'Tworzę...' : 'Utwórz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
