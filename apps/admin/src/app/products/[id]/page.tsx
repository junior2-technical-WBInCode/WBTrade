'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, Edit, Trash2, Package, Eye, ExternalLink,
  Tag, Box, BarChart3, Calendar, Truck
} from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface ProductImage {
  id: string;
  url: string;
  alt: string;
  order: number;
}

interface Variant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
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
  createdAt: string;
  updatedAt: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm, alert } = useModal();
  const productId = params.id as string;
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    try {
      setLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/products/${productId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (!response.ok) throw new Error('Product not found');
      const data = await response.json();
      setProduct(data);
    } catch (error) {
      console.error('Failed to load product:', error);
      await alert('Nie znaleziono produktu');
      router.push('/products');
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async () => {
    if (!await confirm('Czy na pewno chcesz usunac ten produkt?')) return;
    
    try {
      const token = getAuthToken();
      await fetch(`${API_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      router.push('/products');
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-400',
    DRAFT: 'bg-yellow-500/20 text-yellow-400',
    ARCHIVED: 'bg-gray-500/20 text-gray-400',
  };

  const statusLabels: Record<string, string> = {
    ACTIVE: 'Aktywny',
    DRAFT: 'Szkic',
    ARCHIVED: 'Zarchiwizowany',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/products" className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{product.name}</h1>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[product.status]}`}>
                {statusLabels[product.status]}
              </span>
            </div>
            <p className="text-gray-400 font-mono">{product.sku}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://wb-trade.pl'}/products/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-gray-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Zobacz w sklepie
          </a>
          <Link
            href={`/products/${product.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edytuj
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Images */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Zdjecia</h2>
            
            {product.images.length > 0 ? (
              <div className="space-y-4">
                {/* Main Image */}
                <div className="aspect-video bg-slate-700 rounded-lg overflow-hidden">
                  <img
                    src={product.images[selectedImage]?.url}
                    alt={product.images[selectedImage]?.alt}
                    className="w-full h-full object-contain"
                  />
                </div>
                {/* Thumbnails */}
                {product.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {product.images.map((img, i) => (
                      <button
                        key={img.id || i}
                        onClick={() => setSelectedImage(i)}
                        className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                          selectedImage === i ? 'border-orange-500' : 'border-transparent'
                        }`}
                      >
                        <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video bg-slate-700 rounded-lg flex items-center justify-center">
                <Package className="w-16 h-16 text-gray-500" />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Opis</h2>
            {product.shortDescription && (
              <p className="text-gray-300 mb-4">{product.shortDescription}</p>
            )}
            {product.description ? (
              <div 
                className="text-gray-300 text-sm leading-relaxed overflow-hidden
                  [&_p]:mb-3 [&_table]:w-full [&_td]:p-2 [&_td]:border [&_td]:border-slate-600
                  [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_a]:text-orange-400
                  [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            ) : (
              <p className="text-gray-500">Brak opisu</p>
            )}
          </div>

          {/* Specifications */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h2 className="text-lg font-medium text-white mb-4">Specyfikacja</h2>
              <dl className="grid grid-cols-2 gap-4">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key} className="p-3 bg-slate-900 rounded-lg">
                    <dt className="text-sm text-gray-400">{key}</dt>
                    <dd className="text-white font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Variants */}
          {product.variants.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h2 className="text-lg font-medium text-white mb-4">Warianty ({product.variants.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase">
                      <th className="pb-3">Nazwa</th>
                      <th className="pb-3">SKU</th>
                      <th className="pb-3">Cena</th>
                      <th className="pb-3">Stan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {product.variants.map((variant) => (
                      <tr key={variant.id}>
                        <td className="py-3 text-white">{variant.name}</td>
                        <td className="py-3 text-gray-400 font-mono text-sm">{variant.sku}</td>
                        <td className="py-3 text-white">{formatPrice(variant.price)}</td>
                        <td className="py-3">
                          <span className={variant.stock <= 5 ? 'text-red-400' : 'text-gray-300'}>
                            {variant.stock} szt.
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Informacje</h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Tag className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Cena</p>
                  <p className="text-xl font-bold text-white">{formatPrice(product.price)}</p>
                  {product.compareAtPrice && (
                    <p className="text-sm text-gray-400 line-through">{formatPrice(product.compareAtPrice)}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Box className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Stan magazynowy</p>
                  <p className={`text-xl font-bold ${product.stock <= product.lowStockThreshold ? 'text-red-400' : 'text-white'}`}>
                    {product.stock} szt.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Kategoria</p>
                  <p className="text-white font-medium">{product.category?.name || 'Brak'}</p>
                </div>
              </div>

              {product.weight && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Truck className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Waga</p>
                    <p className="text-white font-medium">{product.weight} kg</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-medium text-white mb-4">Metadane</h2>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-400">ID produktu</p>
                <p className="text-white font-mono text-sm">{product.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Slug (URL)</p>
                <p className="text-white font-mono text-sm">{product.slug}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Utworzono</p>
                <p className="text-white text-sm">{formatDate(product.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Ostatnia aktualizacja</p>
                <p className="text-white text-sm">{formatDate(product.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* Stock Alert */}
          {product.stock <= product.lowStockThreshold && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 font-medium">⚠️ Niski stan magazynowy</p>
              <p className="text-sm text-red-300 mt-1">
                Pozostalo tylko {product.stock} sztuk. Prog alertu: {product.lowStockThreshold}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
