'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Package, Trash2, Plus, X, Edit } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../../../../contexts/AuthContext';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface Category {
  id: string;
  name: string;
}

interface Variant {
  id?: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  attributes: Record<string, string>;
}

interface ProductImage {
  id?: string;
  url: string;
  alt: string;
  order: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice: number | null;
  categoryId: string;
  status: string;
  stock: number;
  lowStockThreshold: number;
  weight: number | null;
  specifications: Record<string, string>;
  images: ProductImage[];
  variants: Variant[];
  category?: { name: string };
}

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const { confirm, alert } = useModal();
  const productId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Form data
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [stock, setStock] = useState('0');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [weight, setWeight] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  
  // Images
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  
  // Variants
  const [variants, setVariants] = useState<Variant[]>([]);

  useEffect(() => {
    loadProduct();
    loadCategories();
  }, [productId, token]);

  async function loadProduct() {
    try {
      setLoading(true);
      // Send admin token so the API returns hidden products too (includeHidden)
      const response = await fetch(`${API_URL}/products/${productId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error('Product not found');
      
      const product: Product = await response.json();
      
      setName(product.name);
      setSlug(product.slug);
      setSku(product.sku);
      setDescription(product.description || '');
      setShortDescription(product.shortDescription || '');
      setPrice(product.price.toString());
      setCompareAtPrice(product.compareAtPrice?.toString() || '');
      setCategoryId(product.categoryId || '');
      setStatus(product.status);
      setStock(product.stock?.toString() || '0');
      setLowStockThreshold(product.lowStockThreshold?.toString() || '10');
      setWeight(product.weight?.toString() || '');
      setSpecifications(product.specifications || {});
      setImages(product.images || []);
      setVariants(product.variants || []);
    } catch (error) {
      console.error('Failed to load product:', error);
      await alert('Nie znaleziono produktu');
      router.push('/products');
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

  const addImage = () => {
    if (imageUrl) {
      setImages([...images, { url: imageUrl, alt: name, order: images.length }]);
      setImageUrl('');
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const addVariant = () => {
    setVariants([...variants, {
      name: '',
      sku: `${sku}-V${variants.length + 1}`,
      price: parseFloat(price) || 0,
      stock: 0,
      attributes: {}
    }]);
  };

  const updateVariant = (index: number, field: string, value: string | number) => {
    const updated = [...variants];
    (updated[index] as any)[field] = value;
    setVariants(updated);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const addSpecification = () => {
    setSpecifications({ ...specifications, '': '' });
  };

  const updateSpecification = (oldKey: string, newKey: string, value: string) => {
    const updated = { ...specifications };
    if (oldKey !== newKey) {
      delete updated[oldKey];
    }
    updated[newKey] = value;
    setSpecifications(updated);
  };

  const removeSpecification = (key: string) => {
    const updated = { ...specifications };
    delete updated[key];
    setSpecifications(updated);
  };

  const handleSubmit = async () => {
    if (!token) {
      await alert('Brak autoryzacji. Zaloguj się ponownie.');
      return;
    }
    
    setSaving(true);
    try {
      const productData = {
        name,
        slug,
        sku,
        description,
        shortDescription,
        price: parseFloat(price),
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
        categoryId,
        status,
        stock: parseInt(stock),
        lowStockThreshold: parseInt(lowStockThreshold),
        weight: weight ? parseFloat(weight) : null,
        specifications,
        images: images.map((img, i) => ({ ...img, order: i })),
        variants: variants.map(v => ({
          ...v,
          price: typeof v.price === 'string' ? parseFloat(v.price) : v.price,
          stock: typeof v.stock === 'string' ? parseInt(v.stock) : v.stock,
          compareAtPrice: v.compareAtPrice ? (typeof v.compareAtPrice === 'string' ? parseFloat(v.compareAtPrice) : v.compareAtPrice) : null,
        })),
      };

      console.log('Sending productData:', JSON.stringify(productData, null, 2));

      const response = await fetch(`${API_URL}/products/${productId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productData),
      });

      const responseData = await response.json();
      console.log('Response:', response.status, responseData);

      if (response.ok) {
        router.push(`/products/${productId}`);
      } else {
        const errorDetails = responseData.errors ? JSON.stringify(responseData.errors) : '';
        await alert(`Blad: ${responseData.message || 'Nie udalo sie zapisac produktu'} ${errorDetails}`);
      }
    } catch (error) {
      console.error('Failed to update product:', error);
      await alert('Wystapil blad podczas zapisywania produktu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!await confirm('Czy na pewno chcesz usunac ten produkt? Ta operacja jest nieodwracalna.')) return;
    if (!token) {
      await alert('Brak autoryzacji. Zaloguj się ponownie.');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        router.push('/products');
      } else {
        await alert('Nie udalo sie usunac produktu');
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/products" className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Edytuj produkt</h1>
            <p className="text-gray-400">{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Usun
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Zapisz zmiany
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Informacje podstawowe</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nazwa produktu</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Slug (URL)</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SKU</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Krotki opis</label>
                <textarea
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Opis</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Zdjecia</h2>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="URL zdjecia"
                className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={addImage}
                disabled={!imageUrl}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-4">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img.url} alt={img.alt} className="w-full h-24 object-cover rounded-lg bg-slate-700" />
                    {i === 0 && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded">
                        Glowne
                      </span>
                    )}
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Variants */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">Warianty</h2>
              <button
                onClick={addVariant}
                className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" />
                Dodaj wariant
              </button>
            </div>

            {variants.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Brak wariantow</p>
            ) : (
              <div className="space-y-3">
                {variants.map((variant, i) => (
                  <div key={i} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                    <div className="grid grid-cols-4 gap-3">
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => updateVariant(i, 'name', e.target.value)}
                        placeholder="Nazwa"
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="text"
                        value={variant.sku}
                        onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                        placeholder="SKU"
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) => updateVariant(i, 'price', parseFloat(e.target.value) || 0)}
                        placeholder="Cena"
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={variant.stock}
                          onChange={(e) => updateVariant(i, 'stock', parseInt(e.target.value) || 0)}
                          placeholder="Stan"
                          className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <button
                          onClick={() => removeVariant(i)}
                          className="p-1.5 hover:bg-slate-700 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Specifications */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">Specyfikacja</h2>
              <button
                onClick={addSpecification}
                className="text-sm text-orange-400 hover:text-orange-300"
              >
                + Dodaj pole
              </button>
            </div>
            
            <div className="space-y-2">
              {Object.entries(specifications).map(([key, value], i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => updateSpecification(key, e.target.value, value)}
                    placeholder="Nazwa"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateSpecification(key, key, e.target.value)}
                    placeholder="Wartosc"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => removeSpecification(key)}
                    className="p-2 hover:bg-slate-700 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Category */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Organizacja</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="DRAFT">Szkic</option>
                  <option value="ACTIVE">Aktywny</option>
                  <option value="ARCHIVED">Zarchiwizowany</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Kategoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Wybierz kategorie</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Ceny</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cena (PLN)</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cena przed promocja</label>
                <input
                  type="number"
                  step="0.01"
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Magazyn</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Stan magazynowy</label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Prog niskiego stanu</label>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Waga (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
