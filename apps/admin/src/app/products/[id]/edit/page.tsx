'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Package, Trash2, Plus, X, Edit } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../../../../contexts/AuthContext';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Category {
  id: string;
  name: string;
}

interface Variant {
  id?: string;
  name: string;
  sku: string;
  price: number | string;
  purchasePrice?: number | string | null;
  compareAtPrice?: number | null;
  stock: number | string;
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
  purchasePrice: number | null;
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

interface PartnerPricePreview {
  partnerId: string;
  label: string;
  price: number;
}

interface PricePreview {
  key: string;
  purchasePrice: number;
  wholesalerKey: string | null;
  retailPrice: number;
  defaultB2bPrice: number;
  partnerPrices: PartnerPricePreview[];
  partnerB2bMinPrice: number | null;
  partnerB2bMaxPrice: number | null;
}

function formatPrice(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2).replace('.', ',')} zł` : '-';
}

function PriceCalculationPreview({ preview, loading }: { preview?: PricePreview; loading: boolean }) {
  if (!preview) {
    return loading ? <p className="text-xs text-slate-400">Przeliczanie cen...</p> : null;
  }

  const partnerRange = preview.partnerB2bMinPrice !== null && preview.partnerB2bMaxPrice !== null
    ? preview.partnerB2bMinPrice === preview.partnerB2bMaxPrice
      ? formatPrice(preview.partnerB2bMinPrice)
      : `${formatPrice(preview.partnerB2bMinPrice)} - ${formatPrice(preview.partnerB2bMaxPrice)}`
    : null;

  return (
    <div className="mt-3 border-t border-slate-700 pt-3 text-xs">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <span className="text-slate-400">
          Detal: <strong className="text-white">{formatPrice(preview.retailPrice)}</strong>
        </span>
        <span className="text-slate-400">
          B2B domyślna: <strong className="text-emerald-400">{formatPrice(preview.defaultB2bPrice)}</strong>
        </span>
        {partnerRange && (
          <span className="text-slate-400">
            B2B partnerzy: <strong className="text-sky-400">{partnerRange}</strong>
          </span>
        )}
        {preview.wholesalerKey && (
          <span className="text-slate-500">Hurtownia: {preview.wholesalerKey.toUpperCase()}</span>
        )}
      </div>
      {preview.partnerPrices.length > 0 && (
        <details className="mt-2 text-slate-400">
          <summary className="cursor-pointer select-none hover:text-slate-300">
            Ceny partnerów B2B ({preview.partnerPrices.length})
          </summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {preview.partnerPrices.map((partner) => (
              <div key={partner.partnerId} className="flex justify-between gap-3 pr-4">
                <span className="truncate" title={partner.label}>{partner.label}</span>
                <span className="shrink-0 font-medium text-sky-400">{formatPrice(partner.price)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
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
  const [purchasePrice, setPurchasePrice] = useState('');
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
  const [pricePreviews, setPricePreviews] = useState<Record<string, PricePreview>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const pricePreviewRequest = JSON.stringify(
    variants.length > 0
      ? variants.flatMap((variant, index) => {
          const value = Number(variant.purchasePrice);
          return value > 0
            ? [{ key: variant.id || `new-${index}`, sku: variant.sku, purchasePrice: value }]
            : [];
        })
      : Number(purchasePrice) > 0
        ? [{ key: 'product', sku, purchasePrice: Number(purchasePrice) }]
        : []
  );

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
      setPurchasePrice(product.purchasePrice?.toString() || '');
      setCompareAtPrice(product.compareAtPrice?.toString() || '');
      setCategoryId(product.categoryId || '');
      setStatus(product.status);
      setStock(product.stock?.toString() || '0');
      setLowStockThreshold(product.lowStockThreshold?.toString() || '10');
      setWeight(product.weight?.toString() || '');
      setSpecifications(product.specifications || {});
      setImages(product.images || []);
      setVariants((product.variants || []).map(variant => ({
        ...variant,
        purchasePrice: variant.purchasePrice ?? product.purchasePrice ?? '',
      })));
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

  useEffect(() => {
    if (!token || loading) return;

    const items = JSON.parse(pricePreviewRequest) as Array<{
      key: string;
      sku: string;
      purchasePrice: number;
    }>;
    if (items.length === 0) {
      setPricePreviews({});
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const response = await fetch(`${API_URL}/products/pricing-preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ productId, items }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Nie udało się przeliczyć cen');

        const data = await response.json() as { items: PricePreview[] };
        const nextPreviews = Object.fromEntries(data.items.map(item => [item.key, item]));
        setPricePreviews(nextPreviews);

        if (variants.length > 0) {
          setVariants(current => current.map((variant, index) => {
            const preview = nextPreviews[variant.id || `new-${index}`];
            return preview ? { ...variant, price: preview.retailPrice } : variant;
          }));
          const retailPrices = data.items.map(item => item.retailPrice);
          if (retailPrices.length > 0) setPrice(Math.min(...retailPrices).toString());
        } else if (nextPreviews.product) {
          setPrice(nextPreviews.product.retailPrice.toString());
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreviewError(error instanceof Error ? error.message : 'Nie udało się przeliczyć cen');
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loading, pricePreviewRequest, productId, token, variants.length]);

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
      purchasePrice: '',
      stock: 0,
      attributes: {}
    }]);
  };

  const updateVariant = <Key extends keyof Variant>(index: number, field: Key, value: Variant[Key]) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
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

    const missingWholesalePrice = variants.length > 0
      ? variants.some(variant => Number(variant.purchasePrice) <= 0)
      : Number(purchasePrice) <= 0;
    if (missingWholesalePrice) {
      await alert(
        variants.length > 0
          ? 'Wpisz dodatnią cenę hurtową dla każdego wariantu.'
          : 'Wpisz dodatnią cenę hurtową produktu.'
      );
      return;
    }
    
    setSaving(true);
    try {
      const parsedPurchasePrice = Number(purchasePrice);
      const productData = {
        name,
        slug,
        sku,
        description,
        shortDescription,
        price: pricePreviews.product?.retailPrice ?? parseFloat(price),
        purchasePrice: variants.length === 0 && parsedPurchasePrice > 0 ? parsedPurchasePrice : undefined,
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
        categoryId,
        status,
        stock: parseInt(stock),
        lowStockThreshold: parseInt(lowStockThreshold),
        weight: weight ? parseFloat(weight) : null,
        specifications,
        images: images.map((img, i) => ({ ...img, order: i })),
        variants: variants.map((v, index) => ({
          ...v,
          price: pricePreviews[v.id || `new-${index}`]?.retailPrice ?? Number(v.price),
          purchasePrice: Number(v.purchasePrice) > 0 ? Number(v.purchasePrice) : undefined,
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
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.3fr_0.8fr_0.8fr_0.8fr_auto]">
                      <label>
                        <span className="mb-1 block text-xs text-slate-500">Nazwa</span>
                        <input
                          type="text"
                          value={variant.name}
                          onChange={(e) => updateVariant(i, 'name', e.target.value)}
                          placeholder="Nazwa"
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs text-slate-500">SKU</span>
                        <input
                          type="text"
                          value={variant.sku}
                          onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                          placeholder="SKU"
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs text-slate-500">Cena hurtowa</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={variant.purchasePrice ?? ''}
                          onChange={(e) => updateVariant(i, 'purchasePrice', e.target.value)}
                          placeholder="0,00"
                          className="w-full px-3 py-1.5 bg-slate-800 border border-orange-500/60 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs text-slate-500">Cena detaliczna</span>
                        <input
                          type="text"
                          value={formatPrice(Number(variant.price))}
                          readOnly
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 text-sm"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs text-slate-500">Stan</span>
                        <input
                          type="number"
                          value={variant.stock}
                          onChange={(e) => updateVariant(i, 'stock', e.target.value)}
                          placeholder="Stan"
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          onClick={() => removeVariant(i)}
                          className="p-2 hover:bg-slate-700 rounded"
                          title="Usuń wariant"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                    <PriceCalculationPreview
                      preview={pricePreviews[variant.id || `new-${i}`]}
                      loading={previewLoading}
                    />
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
              {variants.length === 0 && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cena hurtowa (PLN)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-orange-500/60 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {variants.length > 0 ? 'Cena detaliczna (najtańszy wariant)' : 'Cena detaliczna (PLN)'}
                </label>
                <input
                  type="text"
                  value={formatPrice(Number(price))}
                  readOnly
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-300"
                />
              </div>
              {variants.length === 0 && (
                <PriceCalculationPreview preview={pricePreviews.product} loading={previewLoading} />
              )}
              {previewError && <p className="text-xs text-red-400">{previewError}</p>}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cena przed promocją (detal)</label>
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
