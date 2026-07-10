'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Package, Plus, Search, Filter, Edit, Trash2, Eye, 
  ChevronLeft, ChevronRight, ArrowUpDown, Download, Upload,
  CheckSquare, Square, Archive, Check, X, DollarSign, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  stock: number;
  compareAtPrice: number | null;
  status: string;
  categoryId: string;
  category?: { name: string };
  images: { url: string }[];
  variants: { id: string; sku: string; price: number }[];
  tags: string[];
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
}

export default function ProductsPage() {
  const { token } = useAuth();
  const { confirm, alert } = useModal();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Sorting
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  
  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Inline price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [editingComparePrice, setEditingComparePrice] = useState('');
  const priceInputRef = useRef<HTMLInputElement>(null);
  
  // Bulk price modal
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkComparePrice, setBulkComparePrice] = useState('');

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [page, search, statusFilter, categoryFilter, sortBy, sortDir]);

  async function loadProducts() {
    try {
      setLoading(true);
      
      // Map sortBy/sortDir to API format
      let sort = 'newest';
      if (sortBy === 'price') {
        sort = sortDir === 'asc' ? 'price_asc' : 'price_desc';
      } else if (sortBy === 'name') {
        sort = sortDir === 'asc' ? 'name_asc' : 'name_desc';
      } else if (sortBy === 'createdAt') {
        sort = sortDir === 'asc' ? 'oldest' : 'newest';
      }
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(categoryFilter && { category: categoryFilter }),
        sort,
      });
      
      const response = await fetch(`${API_URL}/products?${params}`);
      const data = await response.json();
      
      setProducts(data.products || []);
      // API returns total/totalPages directly, not in pagination object
      setTotalPages(data.totalPages || data.pagination?.totalPages || 1);
      setTotalProducts(data.total || data.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const response = await fetch(`${API_URL}/categories`);
      const data = await response.json();
      const cats = Array.isArray(data) ? data : (data.categories || []);
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-400',
    DRAFT: 'bg-red-500/20 text-red-400',
    ARCHIVED: 'bg-gray-500/20 text-gray-400',
  };

  const statusLabels: Record<string, string> = {
    ACTIVE: 'Aktywny',
    DRAFT: 'Nieaktywny',
    ARCHIVED: 'Ukryty',
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  // Bulk actions
  const bulkUpdateStatus = async (status: string) => {
    if (selectedIds.size === 0 || !token) return;
    
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`${API_URL}/products/${id}`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
          })
        )
      );
      setSelectedIds(new Set());
      loadProducts();
    } catch (error) {
      console.error('Bulk update failed:', error);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0 || !token) return;
    if (!await confirm(`Czy na pewno chcesz usunac ${selectedIds.size} produktow?`)) return;
    
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`${API_URL}/products/${id}`, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          })
        )
      );
      setSelectedIds(new Set());
      loadProducts();
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  };

  // Inline price update
  const startEditingPrice = (product: Product) => {
    setEditingPriceId(product.id);
    setEditingPrice(product.price.toString());
    setEditingComparePrice(product.compareAtPrice?.toString() || '');
    setTimeout(() => priceInputRef.current?.focus(), 0);
  };

  const saveInlinePrice = async (productId: string) => {
    if (!token) return;
    
    try {
      const priceValue = parseFloat(editingPrice);
      const comparePriceValue = editingComparePrice ? parseFloat(editingComparePrice) : null;
      
      if (isNaN(priceValue) || priceValue < 0) {
        alert('Podaj poprawną cenę');
        return;
      }

      await fetch(`${API_URL}/products/${productId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          price: priceValue,
          compareAtPrice: comparePriceValue 
        })
      });
      
      setEditingPriceId(null);
      loadProducts();
    } catch (error) {
      console.error('Failed to update price:', error);
      alert('Nie udało się zaktualizować ceny');
    }
  };

  const cancelEditingPrice = () => {
    setEditingPriceId(null);
    setEditingPrice('');
    setEditingComparePrice('');
  };

  // Bulk price update
  const bulkUpdatePrice = async () => {
    if (selectedIds.size === 0 || !token) return;
    
    const priceValue = bulkPrice ? parseFloat(bulkPrice) : undefined;
    const comparePriceValue = bulkComparePrice ? parseFloat(bulkComparePrice) : undefined;
    
    if (priceValue !== undefined && (isNaN(priceValue) || priceValue < 0)) {
      alert('Podaj poprawną cenę');
      return;
    }

    try {
      const updateData: any = {};
      if (priceValue !== undefined) updateData.price = priceValue;
      if (comparePriceValue !== undefined) updateData.compareAtPrice = comparePriceValue;
      
      if (Object.keys(updateData).length === 0) {
        alert('Podaj przynajmniej jedną cenę do aktualizacji');
        return;
      }

      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`${API_URL}/products/${id}`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updateData)
          })
        )
      );
      
      setShowBulkPriceModal(false);
      setBulkPrice('');
      setBulkComparePrice('');
      setSelectedIds(new Set());
      loadProducts();
    } catch (error) {
      console.error('Bulk price update failed:', error);
      alert('Nie udało się zaktualizować cen');
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['ID', 'Nazwa', 'SKU', 'EAN', 'Cena', 'Stan', 'Status', 'Tagi', 'Kategoria'];
    const rows = products.map(p => [
      p.id,
      p.name,
      p.sku,
      p.barcode || '',
      p.price,
      p.stock || 0,
      p.status,
      (p.tags || []).join(', '),
      p.category?.name || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produkty_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Sorting
  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Produkty</h1>
          <p className="text-gray-400">{totalProducts} produktow w bazie</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Szukaj po nazwie, SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Wszystkie statusy</option>
          <option value="ACTIVE">Aktywne</option>
          <option value="DRAFT">Nieaktywne</option>
          <option value="ARCHIVED">Ukryte</option>
        </select>
        
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Wszystkie kategorie</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <span className="text-orange-400 font-medium">
            Zaznaczono {selectedIds.size} produktow
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => bulkUpdateStatus('ACTIVE')}
              className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors"
            >
              <Check className="w-4 h-4 inline mr-1" />
              Aktywuj
            </button>
            <button
              onClick={() => bulkUpdateStatus('ARCHIVED')}
              className="px-3 py-1.5 bg-gray-500/20 text-gray-400 rounded-lg text-sm hover:bg-gray-500/30 transition-colors"
            >
              <Archive className="w-4 h-4 inline mr-1" />
              Archiwizuj
            </button>
            <button
              onClick={() => setShowBulkPriceModal(true)}
              className="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-sm hover:bg-orange-500/30 transition-colors"
            >
              <DollarSign className="w-4 h-4 inline mr-1" />
              Zmień ceny
            </button>
            <button
              onClick={bulkDelete}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              Usun
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-slate-700 text-gray-300 rounded-lg text-sm hover:bg-slate-600 transition-colors"
            >
              <X className="w-4 h-4 inline mr-1" />
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-slate-800/80">
              <th className="px-4 py-4">
                <button onClick={selectAll} className="hover:text-white">
                  {selectedIds.size === products.length && products.length > 0 ? (
                    <CheckSquare className="w-5 h-5 text-orange-400" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
              <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => toggleSort('name')}>
                <div className="flex items-center gap-1">
                  Produkt <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => toggleSort('sku')}>
                <div className="flex items-center gap-1">
                  SKU <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-4">
                <div className="flex items-center gap-1">
                  EAN
                </div>
              </th>
              <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => toggleSort('price')}>
                <div className="flex items-center gap-1">
                  Cena <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => toggleSort('stock')}>
                <div className="flex items-center gap-1">
                  Stan <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Tagi</th>
              <th className="px-4 py-4">Kategoria</th>
              <th className="px-4 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={10} className="px-4 py-4">
                    <div className="h-12 bg-slate-700 rounded animate-pulse"></div>
                  </td>
                </tr>
              ))
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Brak produktów spełniających kryteria</p>
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-4">
                    <button onClick={() => toggleSelect(product.id)}>
                      {selectedIds.has(product.id) ? (
                        <CheckSquare className="w-5 h-5 text-orange-400" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4 max-w-md">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                        {product.images?.[0] ? (
                          <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-6 h-6 m-3 text-gray-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate max-w-xs" title={product.name}>{product.name}</p>
                        <p className="text-sm text-gray-400">{product.variants?.length || 0} wariantow</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-300 font-mono text-sm">{product.sku}</td>
                  <td className="px-4 py-4 text-gray-400 font-mono text-xs">{product.barcode || '-'}</td>
                  <td className="px-4 py-4">
                    {editingPriceId === product.id ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            ref={priceInputRef}
                            type="number"
                            step="0.01"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlinePrice(product.id);
                              if (e.key === 'Escape') cancelEditingPrice();
                            }}
                            className="w-24 px-2 py-1 bg-slate-900 border border-orange-500 rounded text-white text-sm focus:outline-none"
                            placeholder="Cena"
                          />
                          <button onClick={() => saveInlinePrice(product.id)} className="p-1 text-green-400 hover:bg-green-500/20 rounded">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEditingPrice} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={editingComparePrice}
                          onChange={(e) => setEditingComparePrice(e.target.value)}
                          className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-gray-400 text-xs focus:outline-none focus:border-orange-500"
                          placeholder="Stara cena"
                        />
                      </div>
                    ) : (
                      <div 
                        className={`cursor-pointer group/price ${product.price === 0 ? 'text-red-400' : ''}`}
                        onClick={() => startEditingPrice(product)}
                        title="Kliknij aby edytować cenę"
                      >
                        <div className="flex items-center gap-1">
                          {product.price === 0 && <AlertTriangle className="w-4 h-4 text-red-400" />}
                          <p className={`font-medium ${product.price === 0 ? 'text-red-400' : 'text-white'} group-hover/price:text-orange-400`}>
                            {formatPrice(product.price)}
                          </p>
                          <Edit className="w-3 h-3 text-gray-500 opacity-0 group-hover/price:opacity-100 transition-opacity" />
                        </div>
                        {product.compareAtPrice && (
                          <p className="text-sm text-gray-400 line-through">{formatPrice(product.compareAtPrice)}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`font-medium ${(product.stock || 0) <= 5 ? 'text-red-400' : 'text-gray-300'}`}>
                      {product.stock || 0} szt.
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[product.status] || 'bg-gray-500/20 text-gray-400'}`}>
                      {statusLabels[product.status] || product.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {product.tags && product.tags.length > 0 ? (
                        product.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-400 text-sm">
                    {product.category?.name || '-'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1">
                      <Link href={`/products/${product.id}`} className="p-2 hover:bg-slate-600 rounded-lg transition-colors" title="Podglad">
                        <Eye className="w-4 h-4 text-gray-400" />
                      </Link>
                      <Link href={`/products/${product.id}/edit`} className="p-2 hover:bg-slate-600 rounded-lg transition-colors" title="Edytuj">
                        <Edit className="w-4 h-4 text-gray-400" />
                      </Link>
                      <button 
                        onClick={async () => {
                          if (await confirm('Czy na pewno chcesz usunac ten produkt?') && token) {
                            fetch(`${API_URL}/products/${product.id}`, { 
                              method: 'DELETE',
                              headers: { 'Authorization': `Bearer ${token}` }
                            })
                              .then(() => loadProducts());
                          }
                        }}
                        className="p-2 hover:bg-slate-600 rounded-lg transition-colors" 
                        title="Usun"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">
          Strona {page} z {totalPages} ({totalProducts} produktow)
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
            if (pageNum > totalPages) return null;
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  page === pageNum
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bulk Price Update Modal */}
      {showBulkPriceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">
              Zmień ceny ({selectedIds.size} produktów)
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Nowa cena (PLN)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  placeholder="Zostaw puste aby nie zmieniać"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Cena przed promocją (PLN)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={bulkComparePrice}
                  onChange={(e) => setBulkComparePrice(e.target.value)}
                  placeholder="Zostaw puste aby nie zmieniać"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowBulkPriceModal(false);
                  setBulkPrice('');
                  setBulkComparePrice('');
                }}
                className="px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600"
              >
                Anuluj
              </button>
              <button
                onClick={bulkUpdatePrice}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
              >
                Zapisz zmiany
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
