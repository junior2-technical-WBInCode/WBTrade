import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProduct, getProductBySlug } from '../../../lib/server-api';
import ProductDetailClient from './ProductDetailClient';

// ISR: revalidate product pages every 60 seconds
export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

// Helper to fetch product by ID or slug
async function fetchProduct(id: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  try {
    if (isUuid) {
      return await getProduct(id);
    } else {
      try {
        return await getProductBySlug(id);
      } catch {
        // Fallback to ID lookup
        return await getProduct(id);
      }
    }
  } catch {
    return null;
  }
}

// Strip HTML tags for meta description
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    return {
      title: 'Produkt nie znaleziony | WBTrade',
    };
  }

  const price = Number(product.price) || 0;
  const description = product.description
    ? stripHtml(product.description).slice(0, 160)
    : `${product.name} - kup w najlepszej cenie w WBTrade. Szybka wysyłka, bezpieczne płatności.`;
  const image = product.images?.[0]?.url;
  const categoryName = product.category?.name || 'Produkty';

  return {
    title: `${product.name} | WBTrade`,
    description,
    keywords: [product.name, categoryName, 'WBTrade', product.sku || ''].filter(Boolean),
    openGraph: {
      title: product.name,
      description,
      type: 'website',
      ...(image && { images: [{ url: image, alt: product.name }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      ...(image && { images: [image] }),
    },
    other: {
      'product:price:amount': price.toFixed(2),
      'product:price:currency': 'PLN',
      ...(product.compareAtPrice && { 'product:original_price:amount': Number(product.compareAtPrice).toFixed(2) }),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    notFound();
  }

  console.log('[SSR ProductPage] fetched product:', {
    id: product.id,
    sku: product.sku,
    baselinkerProductId: (product as any).baselinkerProductId,
  });

  // Map server product to client Product shape
  const clientProduct = {
    ...product,
    description: product.description || '',
    images: product.images?.map(img => ({
      ...img,
      alt: img.alt || product.name,
    })) || [],
  };

  return <ProductDetailClient product={clientProduct as any} />;
}