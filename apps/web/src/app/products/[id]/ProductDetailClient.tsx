'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import Breadcrumb from '../../../components/Breadcrumb';
import { productsApi, reviewsApi, Product, Review, ReviewStats, CanReviewResult } from '../../../lib/api';
import ProductCard from '../../../components/ProductCard';
import ProductCarousel from '../../../components/ProductCarousel';
import { useCart } from '../../../contexts/CartContext';
import { useWishlist } from '../../../contexts/WishlistContext';
import { useAuth } from '../../../contexts/AuthContext';
import { cleanCategoryName } from '../../../lib/categories';
import { trackViewItem, toGA4Item } from '../../../lib/analytics';
import AddToListModal from '../../../components/AddToListModal';
import { PLACEHOLDER_IMAGE, getProductBrand, getProductBrandSlug } from '../../../components/productUtils';
import { getProxiedImageUrl } from '../../../lib/image-proxy';

interface ProductDetailClientProps {
  product: Product;
}

export default function ProductDetailClient({ product }: ProductDetailClientProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState('description');
  const [addingToCart, setAddingToCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  // Analytics dedup ref
  const viewItemTracked = useRef(false);

  // Cart error state for displaying error messages
  const [cartError, setCartError] = useState<string | null>(null);

  // Add to shopping list modal
  const [showAddToListModal, setShowAddToListModal] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [canReviewInfo, setCanReviewInfo] = useState<CanReviewResult | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
  const [reviewsSortBy, setReviewsSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful'>('newest');
  
  // Review form state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewFormData, setReviewFormData] = useState({ rating: 5, title: '', content: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Track which reviews the user has already voted on (localStorage)
  const [votedReviews, setVotedReviews] = useState<Record<string, 'helpful' | 'not_helpful'>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem('review_votes');
      if (stored) setVotedReviews(JSON.parse(stored));
    } catch {}
  }, []);

  const variantAttributes = useMemo(() => {
    const variants = product?.variants || [];
    const keys = new Set<string>();
    for (const variant of variants) {
      Object.keys(variant.attributes || {}).forEach((key) => keys.add(key));
    }
    return Array.from(keys);
  }, [product?.variants]);

  const attributeOptions = useMemo(() => {
    const variants = product?.variants || [];
    const options: Record<string, string[]> = {};
    for (const key of variantAttributes) {
      const values = new Set<string>();
      for (const variant of variants) {
        const value = variant.attributes?.[key];
        if (value) values.add(value);
      }
      options[key] = Array.from(values);
    }
    return options;
  }, [product?.variants, variantAttributes]);

  const selectedVariant = useMemo(() => {
    const variants = product?.variants || [];
    if (!variants.length) return null;

    // If we don't have all keys selected yet, treat as not selected.
    if (variantAttributes.some((key) => !selectedAttributes[key])) return null;

    return (
      variants.find((variant) =>
        variantAttributes.every((key) => variant.attributes?.[key] === selectedAttributes[key])
      ) || null
    );
  }, [product?.variants, selectedAttributes, variantAttributes]);

  useEffect(() => {
    if (!product?.variants?.length) return;

    // Initialize selection to first in-stock variant, falling back to first variant
    const initial = product.variants.find((v) => v.stock > 0) || product.variants[0];
    const nextAttrs: Record<string, string> = {};
    for (const key of Object.keys(initial.attributes || {})) {
      nextAttrs[key] = initial.attributes[key];
    }
    setSelectedAttributes(nextAttrs);
    setQuantity(1);
  }, [product?.variants]);

  const handleAttributeChange = (key: string, value: string) => {
    const variants = product?.variants || [];
    const next = { ...selectedAttributes, [key]: value };

    // Try to keep other selections if possible; if not, fall back to any variant with this value.
    const exact = variants.find((v) => variantAttributes.every((k) => next[k] && v.attributes?.[k] === next[k]));
    if (exact) {
      setSelectedAttributes(next);
      return;
    }

    const fallback = variants.find((v) => v.attributes?.[key] === value);
    if (fallback) {
      const filled: Record<string, string> = { ...next };
      for (const k of Object.keys(fallback.attributes || {})) {
        filled[k] = fallback.attributes[k];
      }
      setSelectedAttributes(filled);
      return;
    }

    setSelectedAttributes(next);
  };

  const clampQuantity = useCallback(
    (next: number) => {
      const max = selectedVariant?.stock ?? 999;
      return Math.max(1, Math.min(max, next));
    },
    [selectedVariant?.stock]
  );

  // Check if product/variant is out of stock
  const isOutOfStock = useMemo(() => {
    if (!selectedVariant) {
      // If no variant selected, check if ALL variants are out of stock
      const variants = product?.variants || [];
      if (variants.length === 0) return true;
      return variants.every(v => (v.stock ?? 0) <= 0);
    }
    return (selectedVariant.stock ?? 0) <= 0;
  }, [selectedVariant, product?.variants]);

  // Clear cart error after 5 seconds
  useEffect(() => {
    if (cartError) {
      const timer = setTimeout(() => setCartError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [cartError]);

  const handleAddToCart = async () => {
    if (!selectedVariant || !product) return;
    if (isOutOfStock) {
      setCartError('Produkt jest niedostępny (brak na stanie)');
      return;
    }
    
    setAddingToCart(true);
    setCartError(null);
    try {
      const productImage = product.images?.[0]?.url || '';
      await addToCart(selectedVariant.id, quantity, {
        name: product.name,
        image: productImage,
        price: String(selectedVariant.price || product.price),
        quantity: quantity,
        productId: product.id,
        sku: product.sku,
      });
    } catch (err: any) {
      console.error('Failed to add to cart:', err);
      setCartError(err?.message || 'Nie udało się dodać produktu do koszyka');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!selectedVariant || !product) return;
    if (isOutOfStock) {
      setCartError('Produkt jest niedostępny (brak na stanie)');
      return;
    }
    
    setBuyingNow(true);
    setCartError(null);
    try {
      // Add to cart and redirect to cart page
      await addToCart(selectedVariant.id, quantity, {
        name: product.name,
        image: product.images?.[0]?.url || '',
        price: String(selectedVariant.price || product.price),
        quantity: quantity,
        productId: product.id,
        sku: product.sku,
      }, true);
      router.push('/cart');
    } catch (err: any) {
      console.error('Failed to buy now:', err);
      setCartError(err?.message || 'Nie udało się dodać produktu do koszyka');
      setBuyingNow(false);
    }
  };

  // Track view_item event (only once per product)
  useEffect(() => {
    if (!product || viewItemTracked.current) return;
    viewItemTracked.current = true;

    const price = Number(product.price) || 0;
    const item = toGA4Item({
      productSku: product.sku || product.id,
      productName: product.name,
      category: product.category?.name,
      price,
      quantity: 1,
    });
    trackViewItem(item, price);
  }, [product]);

  // Fetch same-warehouse products for recommendations
  useEffect(() => {
    if (!product?.id) return;
    async function fetchSameWarehouse() {
      try {
        const response = await productsApi.getSameWarehouseProducts(product.id, { limit: 20 });
        const filtered = (response.products || [])
          .filter((p) => p.id !== product.id)
          .slice(0, 20);
        setRelatedProducts(filtered);
      } catch {
        // Fallback to category products
        try {
          const categorySlug = product?.category?.slug;
          const fallbackResponse = await productsApi.getAll({
            category: categorySlug,
            limit: 12,
          });
          const filtered = fallbackResponse.products
            .filter((p) => p.id !== product.id)
            .slice(0, 10);
          setRelatedProducts(filtered);
        } catch {
          // silently fail
        }
      }
    }
    fetchSameWarehouse();
  }, [product]);

  // Fetch reviews, stats, and can-review status
  useEffect(() => {
    async function fetchReviews() {
      if (!product?.id) return;
      setReviewsLoading(true);
      try {
        const [reviewsResponse, statsResponse, canReviewResponse] = await Promise.all([
          reviewsApi.getProductReviews(product.id, { page: reviewsPage, limit: 5, sort: reviewsSortBy }),
          reviewsApi.getProductStats(product.id),
          reviewsApi.canReview(product.id),
        ]);
        setReviews(reviewsResponse?.reviews || []);
        setReviewsTotalPages(reviewsResponse?.pagination?.totalPages || 1);
        setReviewStats(statsResponse || null);
        setCanReviewInfo(canReviewResponse || null);
      } catch (error) {
        console.error('Failed to fetch reviews:', error);
      } finally {
        setReviewsLoading(false);
      }
    }
    fetchReviews();
  }, [product?.id, reviewsPage, reviewsSortBy]);

  // Reset to page 1 when sort changes
  useEffect(() => {
    setReviewsPage(1);
  }, [reviewsSortBy]);

  // Handle review submission
  const handleSubmitReview = async () => {
    if (!product?.id) return;
    if (reviewFormData.content.trim().length < 10) {
      setReviewError('Opinia musi zawierać co najmniej 10 znaków');
      return;
    }
    
    setSubmittingReview(true);
    setReviewError('');
    try {
      await reviewsApi.create({
        productId: product.id,
        rating: reviewFormData.rating,
        title: reviewFormData.title || undefined,
        content: reviewFormData.content.trim(),
      });
      // Reset form and refresh reviews
      setReviewFormData({ rating: 5, title: '', content: '' });
      setShowReviewForm(false);
      // Refetch reviews
      const [reviewsResponse, statsResponse, canReviewResponse] = await Promise.all([
        reviewsApi.getProductReviews(product.id, { page: 1, limit: 5, sort: reviewsSortBy }),
        reviewsApi.getProductStats(product.id),
        reviewsApi.canReview(product.id),
      ]);
      setReviews(reviewsResponse?.reviews || []);
      setReviewsTotalPages(reviewsResponse?.pagination?.totalPages || 1);
      setReviewsPage(1);
      setReviewStats(statsResponse || null);
      setCanReviewInfo(canReviewResponse || null);
    } catch (error) {
      console.error('Failed to submit review:', error);
      setReviewError(error instanceof Error ? error.message : 'Nie udało się dodać opinii');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Mark review as helpful
  const handleMarkHelpful = async (reviewId: string, helpful: boolean) => {
    // Prevent duplicate votes
    if (votedReviews[reviewId]) return;

    try {
      await reviewsApi.markHelpful(reviewId, helpful);
      // Update the review in local state
      setReviews(prev => prev.map(r => 
        r.id === reviewId 
          ? { ...r, helpfulCount: helpful ? r.helpfulCount + 1 : r.helpfulCount, notHelpfulCount: !helpful ? r.notHelpfulCount + 1 : r.notHelpfulCount }
          : r
      ));
      // Track vote in localStorage
      const newVotes = { ...votedReviews, [reviewId]: helpful ? 'helpful' as const : 'not_helpful' as const };
      setVotedReviews(newVotes);
      try { localStorage.setItem('review_votes', JSON.stringify(newVotes)); } catch {}
    } catch (error) {
      console.error('Failed to mark review:', error);
    }
  };

  // Parse specifications from product data
  const specifications = useMemo(() => {
    if (product?.specifications && typeof product.specifications === 'object') {
      return Object.entries(product.specifications as Record<string, string>).map(([label, value]) => ({
        label,
        value: String(value),
      }));
    }
    return [];
  }, [product?.specifications]);

  // Parse features from description (bullet points starting with •)
  const { mainDescription, features } = useMemo(() => {
    const description = product?.description || '';
    
    // Check if description contains HTML tags
    const containsHtml = /<[a-z][\s\S]*>/i.test(description);
    
    if (containsHtml) {
      // If it's HTML content (from BaseLinker), return as-is
      return {
        mainDescription: description,
        features: [],
      };
    }
    
    // Otherwise parse as plain text with bullet points
    const lines = description.split('\n').filter(line => line.trim());
    
    const featureLines: string[] = [];
    const descLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Check for bullet points (• or **text:**)
      if (trimmed.startsWith('•') || trimmed.startsWith('- ')) {
        // Clean up markdown formatting
        let feature = trimmed.replace(/^[•\-]\s*/, '').trim();
        // Remove ** markdown for bold
        feature = feature.replace(/\*\*([^*]+)\*\*/g, '$1');
        featureLines.push(feature);
      } else {
        descLines.push(trimmed);
      }
    }
    
    return {
      mainDescription: descLines.join(' '),
      features: featureLines,
    };
  }, [product?.description]);

  // Use product images or fallback - route through proxy cache by image ID
  const images = product.images?.length ? product.images : [];
  const proxiedImages = useMemo(() => images.map(img => ({
    ...img,
    url: img.id ? getProxiedImageUrl(img.id) : img.url,
  })), [images]);
  const mainImage = failedImages.has(selectedImage)
    ? PLACEHOLDER_IMAGE
    : (proxiedImages?.[selectedImage]?.url || PLACEHOLDER_IMAGE);
  
  // Use variant price if available and > 0, otherwise fall back to product price
  const variantPrice = selectedVariant?.price ? Number(selectedVariant.price) : 0;
  const productPrice = Number(product.price) || 0;
  const rawEffectivePrice = variantPrice > 0 ? variantPrice : productPrice;

  // B2B price transformation (show B2B prices for APPROVED and SUSPENDED partners)
  const isB2b = user && ((user as any).b2bStatus === 'APPROVED' || (user as any).b2bStatus === 'SUSPENDED');
  const b2bMultiplier = isB2b ? ((user as any).b2bPriceMultiplier || 1.10) : null;
  const effectivePrice = isB2b && b2bMultiplier
    ? Math.floor((rawEffectivePrice / 1.35) * b2bMultiplier) + 0.99
    : rawEffectivePrice;
  
  const hasDiscount = !isB2b && product.compareAtPrice && Number(product.compareAtPrice) > Number(effectivePrice);
  const discountPercent = hasDiscount 
    ? Math.round((1 - Number(effectivePrice) / Number(product.compareAtPrice)) * 100)
    : 0;

  // Check if product is from outlet warehouse
  const isOutletProduct = (() => {
    const sku = product.sku?.toUpperCase() || '';
    const blId = (product as any).baselinkerProductId?.toLowerCase() || '';
    const tags = (product as any).tags || [];
    return sku.startsWith('OUTLET-') || blId.startsWith('outlet-') || tags.some((t: string) => t.toLowerCase() === 'rzeszów');
  })();

  // Use real category if available
  const categoryName = product.category?.name ? cleanCategoryName(product.category.name) : 'Produkty';
  const categorySlug = product.category?.slug || '';
  const breadcrumbItems = [
    { label: 'Strona główna', href: '/' },
    { label: categoryName, href: categorySlug ? `/products?category=${categorySlug}` : '/products' },
    { label: product.name },
  ];

  const manufacturer = product.manufacturer;

  const tabs = [
    { id: 'description', label: 'Opis produktu' },
    ...(specifications.length > 0 ? [{ id: 'parameters', label: 'Parametry' }] : []),
    ...(manufacturer ? [{ id: 'gpsr', label: 'Producent / GPSR' }] : []),
    { id: 'reviews', label: `Opinie (${reviewStats?.totalReviews || 0})` },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-secondary-900 overflow-x-hidden">
      <Header />
      
      <main className="container-custom py-3 sm:py-6 px-3 sm:px-4 overflow-hidden">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} />

        {/* Main Product Section */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-6 sm:mb-8">
          {/* Left: Image Gallery */}
          <div className="md:col-span-1 lg:col-span-2 min-w-0">
            <div className="bg-white dark:bg-secondary-800 rounded-xl sm:rounded-2xl p-2 sm:p-4 relative overflow-hidden">
              {/* Badge */}
              {product.badge && (
                <span className="absolute top-3 left-3 sm:top-6 sm:left-6 bg-orange-500 text-white text-[10px] sm:text-xs font-bold px-2 py-1 sm:px-3 sm:py-1.5 rounded z-10 uppercase">
                  {product.badge}
                </span>
              )}
              
              {/* Main Image */}
              <div className="aspect-square overflow-hidden rounded-xl sm:rounded-2xl mb-3 sm:mb-4 max-w-full relative bg-white">
                {mainImage === PLACEHOLDER_IMAGE ? (
                  <img
                    src={PLACEHOLDER_IMAGE}
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Image
                    src={mainImage}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 66vw"
                    className="object-contain max-w-full"
                    priority
                    onError={() => setFailedImages(prev => new Set(prev).add(selectedImage))}
                  />
                )}
              </div>

              {/* Thumbnail Gallery */}
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0">
                {proxiedImages?.map((image, index) => (
                  <button
                    key={image.id}
                    onClick={() => setSelectedImage(index)}
                    className={`shrink-0 w-14 h-14 sm:w-20 sm:h-20 rounded-md sm:rounded-lg overflow-hidden border-2 transition-colors relative bg-white ${
                      selectedImage === index ? 'border-orange-500' : 'border-gray-200 dark:border-secondary-700 hover:border-gray-300 dark:hover:border-secondary-600'
                    }`}
                  >
                    {failedImages.has(index) ? (
                      <img
                        src={PLACEHOLDER_IMAGE}
                        alt={image.alt || `Product image ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image
                        src={image.url}
                        alt={image.alt || `Product image ${index + 1}`}
                        fill
                        sizes="80px"
                        className="object-cover"
                        onError={() => setFailedImages(prev => new Set(prev).add(index))}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Product Info Panel */}
          <div className="md:col-span-1 lg:col-span-1 min-w-0">
            <div className="bg-white dark:bg-secondary-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:sticky md:top-24 overflow-hidden">
              {/* Title */}
              <h1 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white mb-1 leading-snug break-words">
                {product.name}
              </h1>

              {/* Brand / Manufacturer */}
              {getProductBrand(product) && (
                <Link
                  href={`/producent/${getProductBrandSlug(product) || ''}`}
                  className="text-xs sm:text-sm text-primary-600 dark:text-primary-400 hover:underline mb-1 inline-block"
                >
                  {getProductBrand(product)}
                </Link>
              )}

              {/* SKU */}
              {product?.sku && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
                  SKU: <span className="font-mono">{product.sku.replace(/^(hp-|leker-|btp-|dofirmy-|outlet-|ikonka-)/i, '')}</span>
                </p>
              )}

              {/* Rating - hidden when 0 reviews */}
              {(product.reviewCount || 0) > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${
                          star <= Math.floor(Number(product.rating || 0))
                            ? 'text-orange-400'
                            : 'text-gray-300'
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm text-orange-500 font-medium">
                    {product.rating}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    ({product.reviewCount} ocen)
                  </span>
                </div>
              )}

              {/* Price */}
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 mb-1">
                <span className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {Number(effectivePrice).toFixed(2).replace('.', ',')} zł
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-sm sm:text-lg text-gray-400 line-through">
                      {Number(product.compareAtPrice).toFixed(2).replace('.', ',')} zł
                    </span>
                    <span className="bg-green-500 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 sm:px-2 rounded">
                      -{discountPercent}%
                    </span>
                  </>
                )}
              </div>

              {/* Lowest Price Info - Omnibus Directive */}
              {hasDiscount && (
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
                  Najniższa cena w ostatnich 30 dniach: {Math.min(Number(product.lowestPrice30Days || product.compareAtPrice || effectivePrice), effectivePrice).toFixed(2).replace('.', ',')} zł
                </p>
              )}

              {/* Outlet Product Notice */}
              {isOutletProduct && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-3 sm:mb-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Produkt outletowy</p>
                      <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                        Produkt może posiadać uszkodzone opakowanie. Objęty pełną gwarancją, identyczną jak przy zakupie nowego produktu.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Variants */}
              {product.variants?.length ? (
                <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-3">
                  {variantAttributes.map((key) => (
                    <div key={key}>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:text-white mb-1">
                        {key}
                      </label>
                      <select
                        value={selectedAttributes[key] || ''}
                        onChange={(e) => handleAttributeChange(key, e.target.value)}
                        className="w-full border border-gray-200 dark:border-secondary-700 dark:bg-secondary-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
                      >
                        <option value="" disabled>
                          Wybierz
                        </option>
                        {(attributeOptions[key] || []).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  {/* Quantity */}
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:text-white mb-1">Ilość</label>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => clampQuantity(q - 1))}
                        disabled={quantity <= 1}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-gray-200 dark:border-secondary-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                        aria-label="Zmniejsz ilość"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={selectedVariant?.stock ?? undefined}
                        value={quantity}
                        onChange={(e) => setQuantity(clampQuantity(Number(e.target.value || 1)))}
                        className="w-16 sm:w-20 h-9 sm:h-10 text-center rounded-lg border border-gray-200 dark:border-secondary-700 dark:bg-secondary-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => clampQuantity(q + 1))}
                        disabled={!!selectedVariant && quantity >= selectedVariant.stock}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-gray-200 dark:border-secondary-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                        aria-label="Zwiększ ilość"
                      >
                        +
                      </button>
                      {selectedVariant && (selectedVariant.stock ?? 0) > 0 && (
                        <span className="text-[10px] sm:text-xs ml-1 text-gray-500 dark:text-gray-400">
                          Dostępne: {selectedVariant.stock}
                        </span>
                      )}
                    </div>
                    {variantAttributes.length > 0 && !selectedVariant && (
                      <p className="text-xs text-red-600 mt-1">Wybierz wariant produktu</p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Error Message */}
              {cartError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded-lg mb-3 sm:mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs sm:text-sm">{cartError}</span>
                </div>
              )}

              {/* Out of Stock Banner */}
              {isOutOfStock && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-2 sm:px-4 sm:py-3 rounded-lg mb-3 sm:mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">Produkt chwilowo niedostępny</span>
                </div>
              )}

              {/* Buy Now Button */}
              {!isOutOfStock ? (
                <button 
                  onClick={handleBuyNow}
                  disabled={buyingNow || !selectedVariant}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 sm:py-3 rounded-lg mb-2 sm:mb-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  {buyingNow ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Przekierowuję...
                    </>
                  ) : (
                    'Kup teraz'
                  )}
                </button>
              ) : (
                <button 
                  disabled
                  className="w-full bg-gray-400 text-white font-semibold py-3 rounded-lg mb-3 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Brak w magazynie
                </button>
              )}

              {/* Add to Cart Button */}
              {!isOutOfStock ? (
                <button 
                  onClick={handleAddToCart}
                  disabled={addingToCart || !selectedVariant}
                  className="w-full border-2 border-orange-500 text-orange-500 hover:bg-orange-50 font-semibold py-2.5 sm:py-3 rounded-lg mb-3 sm:mb-4 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {addingToCart ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Dodawanie...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Dodaj do koszyka
                    </>
                  )}
                </button>
              ) : (
                <button 
                  disabled
                  className="w-full border-2 border-gray-300 text-gray-400 font-semibold py-3 rounded-lg mb-4 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Powiadom o dostępności
                </button>
              )}

              {/* Add to Wishlist Button */}
              <button 
                onClick={() => {
                  if (!product) return;
                  const mainImage = product?.images?.[0]?.url || '';
                  toggleWishlist({
                    id: product.id,
                    variantId: selectedVariant?.id,
                    name: product.name,
                    price: String(product.price),
                    compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : undefined,
                    image: mainImage,
                  });
                }}
                className={`w-full border-2 font-semibold py-2.5 sm:py-3 rounded-lg mb-3 sm:mb-4 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base ${
                  isInWishlist(product.id)
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30' 
                    : 'border-gray-300 dark:border-secondary-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-secondary-500 hover:bg-gray-50 dark:hover:bg-secondary-700'
                }`}
              >
                <svg className="w-5 h-5" fill={isInWishlist(product.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {isInWishlist(product.id) ? 'W ulubionych' : 'Dodaj do ulubionych'}
              </button>

              {/* Add to Shopping List Button */}
              {isAuthenticated && (
                <button
                  onClick={() => setShowAddToListModal(true)}
                  className="w-full border-2 border-gray-300 dark:border-secondary-600 text-gray-600 dark:text-gray-300 hover:border-orange-400 dark:hover:border-orange-500/50 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 font-semibold py-2.5 sm:py-3 rounded-lg mb-3 sm:mb-4 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Dodaj do listy zakupowej
                </button>
              )}

              {/* Stock Status */}
              {!isOutOfStock && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-green-600 mb-2 sm:mb-3">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">W magazynie - wysyłka w ciągu 24 - 72h</span>
                </div>
              )}

              {/* Warehouse Location based on tags */}
              {(() => {
                const tags = product?.tags || [];
                const blId = ((product as any).baselinkerProductId || '').toLowerCase();
                let warehouseCity = '';
                
                // Outlet products always show Rzeszów (check first - overrides wholesaler tag)
                if (blId.startsWith('outlet-') || tags.some(t => t.toLowerCase() === 'rzeszów' || t.toLowerCase() === 'outlet')) {
                  warehouseCity = 'Rzeszowie';
                } else if (tags.some(t => t.toLowerCase().includes('hurtownia przemysłowa')) || blId.startsWith('hp-')) {
                  warehouseCity = 'Zielonej Górze';
                } else if (tags.some(t => t.toLowerCase() === 'ikonka')) {
                  warehouseCity = 'Białymstoku';
                } else if (tags.some(t => t.toLowerCase() === 'leker') || blId.startsWith('leker-')) {
                  warehouseCity = 'Chynowie';
                } else if (tags.some(t => t.toLowerCase() === 'btp') || blId.startsWith('btp-')) {
                  warehouseCity = 'Chotowie';
                } else if (tags.some(t => t.toLowerCase() === 'dofirmy') || blId.startsWith('dofirmy-')) {
                  warehouseCity = 'Koszalinie';
                } else if (tags.some(t => t.toLowerCase().includes('hurtownia kuchenna')) || blId.startsWith('hk-')) {
                  warehouseCity = 'Hurtowni Kuchennej';
                }
                
                if (!warehouseCity) return null;
                
                return (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
                    <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    <span>Produkt znajduje się w magazynie w {warehouseCity}</span>
                  </div>
                );
              })()}

              {/* Delivery Info */}
              {(() => {
                const tags = product?.tags || [];
                const price = Number(product.price);

                // Check if gabaryt
                const gabarytTag = tags.find(t => /^((\d+(?:\.\d{2})?)\s*)?gabaryt$/i.test(t));
                const isGabaryt = !!gabarytTag;
                const gabarytMatch = gabarytTag?.match(/^(\d+(?:\.\d{2})?)\s*gabaryt$/i);
                const gabarytPrice = gabarytMatch ? parseFloat(gabarytMatch[1]) : 49.99;

                // Check if courier only ("Tylko kurier")
                const isCourierOnly = tags.some(t => /^tylko\s*kurier$/i.test(t));
                
                // Check weight tag for courier-only items
                let weightPrice: number | null = null;
                if (isCourierOnly) {
                  for (const tag of tags) {
                    const wMatch = tag.match(/^do\s*(\d+(?:[,\.]\d+)?)\s*kg$/i);
                    if (wMatch) {
                      const kg = parseFloat(wMatch[1].replace(',', '.'));
                      if (kg <= 20) weightPrice = 25.99;
                      else weightPrice = 28.99;
                      break;
                    }
                  }
                  if (weightPrice === null) weightPrice = 28.99;
                }

                // Free shipping threshold
                const freeShippingThreshold = 300;
                const qualifiesForFreeShipping = price >= freeShippingThreshold;

                // Determine available methods
                type ShippingOption = { name: string; icon: React.ReactNode; price: number; freeEligible: boolean };
                const methods: ShippingOption[] = [];

                if (isGabaryt) {
                  methods.push({
                    name: 'Wysyłka gabaryt (kurier)',
                    icon: (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    ),
                    price: gabarytPrice,
                    freeEligible: false,
                  });
                } else if (isCourierOnly) {
                  methods.push({
                    name: 'Kurier DPD',
                    icon: (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    ),
                    price: weightPrice!,
                    freeEligible: true,
                  });
                } else {
                  // Standard: both Paczkomat and Kurier available
                  methods.push({
                    name: 'InPost Paczkomat',
                    icon: (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    ),
                    price: 15.99,
                    freeEligible: true,
                  });
                  methods.push({
                    name: 'Kurier InPost',
                    icon: (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    ),
                    price: 19.99,
                    freeEligible: true,
                  });
                }

                return (
                  <div className="border-t dark:border-secondary-700 pt-3 sm:pt-4 space-y-2 sm:space-y-3">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                      Opcje dostawy
                    </h4>
                    <div className="space-y-1.5 sm:space-y-2">
                      {methods.map((method, idx) => {
                        const isFree = method.freeEligible && qualifiesForFreeShipping;
                        return (
                          <div key={idx} className="flex items-center justify-between py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg bg-gray-50 dark:bg-secondary-700/50">
                            <div className="flex items-center gap-2">
                              {method.icon}
                              <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{method.name}</span>
                            </div>
                            {isFree ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] sm:text-xs text-gray-400 line-through">{method.price.toFixed(2).replace('.', ',')} zł</span>
                                <span className="text-xs sm:text-sm font-bold text-green-600 dark:text-green-400">GRATIS</span>
                              </div>
                            ) : (
                              <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{method.price.toFixed(2).replace('.', ',')} zł</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!qualifiesForFreeShipping && !isGabaryt && (
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Darmowa wysyłka od {freeShippingThreshold} zł (brakuje {(freeShippingThreshold - price).toFixed(2).replace('.', ',')} zł)
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Seller Info */}
              <div className="border-t dark:border-secondary-700 mt-4 pt-4 hidden">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-semibold text-sm">OW</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {product.storeName || 'WBTrade'}
                      </span>
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-xs text-orange-500">99.8% pozytywnych opinii</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>18k sprzedanych</span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    Szybka odpowiedź
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Section */}
        <div className="bg-white dark:bg-secondary-800 rounded-xl sm:rounded-2xl mb-8">
          {/* Tab Headers */}
          <div className="border-b dark:border-secondary-700">
            <div className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-orange-500'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'description' && (
              <div className="max-w-3xl">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {product.name}
                </h2>
                {/* Render HTML description from BaseLinker */}
                <div 
                  className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed prose prose-sm dark:prose-invert max-w-none
                    [&_p]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:text-gray-900 dark:[&_h3]:text-white
                    [&_img]:rounded-lg [&_img]:my-4 [&_img]:max-w-full [&_img]:h-auto
                    [&_.section]:mb-4 [&_.text-item]:mb-2"
                  dangerouslySetInnerHTML={{ __html: mainDescription || '' }}
                />

                {features.length > 0 && (
                  <ul className="space-y-3 mb-8">
                    {features.map((feature, index) => {
                      const parts = feature.split(':');
                      const hasColon = parts.length > 1;
                      return (
                        <li key={index} className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                          <span className="text-orange-500 mt-1">•</span>
                          {hasColon ? (
                            <span><strong>{parts[0]}:</strong>{parts.slice(1).join(':')}</span>
                          ) : (
                            <span>{feature}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Key Specifications */}
                {specifications.length > 0 && (
                  <div className="bg-gray-50 dark:bg-secondary-700 rounded-lg p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Kluczowe specyfikacje</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {specifications.slice(0, 6).map((spec, index) => (
                        <div key={index}>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{spec.label}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{spec.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'parameters' && (
              <div className="max-w-3xl">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Parametry techniczne</h2>
                {specifications.length > 0 ? (
                  <div className="divide-y dark:divide-secondary-700">
                    {specifications.map((spec, index) => (
                      <div key={index} className="py-3 flex">
                        <span className="w-1/3 text-gray-500 dark:text-gray-400">{spec.label}</span>
                        <span className="w-2/3 text-gray-900 dark:text-white font-medium">{spec.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">Brak dostępnych specyfikacji</p>
                )}
              </div>
            )}

            {activeTab === 'gpsr' && manufacturer && (
              <div className="max-w-3xl">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Informacje o producencie (GPSR)</h2>
                <div className="bg-gray-50 dark:bg-secondary-700/50 rounded-xl p-5 sm:p-6 border border-gray-100 dark:border-secondary-600">
                  <div className="space-y-4">
                    {/* Manufacturer name */}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Producent</p>
                      <Link
                        href={`/producent/${manufacturer.slug}`}
                        className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {manufacturer.name}
                      </Link>
                    </div>

                    {/* Address */}
                    {manufacturer.address && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Adres</p>
                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{manufacturer.address}</p>
                      </div>
                    )}

                    {/* Email */}
                    {manufacturer.email && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">E-mail</p>
                        <a href={`mailto:${manufacturer.email}`} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                          {manufacturer.email}
                        </a>
                      </div>
                    )}

                    {/* Phone */}
                    {manufacturer.phone && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Telefon</p>
                        <a href={`tel:${manufacturer.phone}`} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                          {manufacturer.phone}
                        </a>
                      </div>
                    )}

                    {/* Website */}
                    {manufacturer.website && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Strona internetowa</p>
                        <a href={manufacturer.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                          {manufacturer.website}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* EU Representative */}
                  {(manufacturer.euRepName || manufacturer.euRepAddress || manufacturer.euRepEmail) && (
                    <div className="mt-6 pt-5 border-t border-gray-200 dark:border-secondary-600">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Upoważniony przedstawiciel w UE</h3>
                      <div className="space-y-3">
                        {manufacturer.euRepName && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Nazwa</p>
                            <p className="text-sm text-gray-900 dark:text-white">{manufacturer.euRepName}</p>
                          </div>
                        )}
                        {manufacturer.euRepAddress && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Adres</p>
                            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{manufacturer.euRepAddress}</p>
                          </div>
                        )}
                        {manufacturer.euRepEmail && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">E-mail</p>
                            <a href={`mailto:${manufacturer.euRepEmail}`} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                              {manufacturer.euRepEmail}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Safety Info */}
                  {manufacturer.safetyInfo && (
                    <div className="mt-6 pt-5 border-t border-gray-200 dark:border-secondary-600">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Informacje o bezpieczeństwie</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{manufacturer.safetyInfo}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="max-w-4xl">
                {reviewsLoading ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-gray-500 dark:text-gray-400 mt-4">Ładowanie opinii...</p>
                  </div>
                ) : (
                  <>
                    {/* Reviews Header with Stats */}
                    <div className="flex flex-col md:flex-row gap-8 mb-8">
                      {/* Stats Summary */}
                      <div className="flex-shrink-0">
                        <div className="text-center md:text-left">
                          <div className="text-5xl font-bold text-gray-900 dark:text-white mb-1">
                            {reviewStats?.averageRating?.toFixed(1) || '0.0'}
                          </div>
                          <div className="flex items-center justify-center md:justify-start gap-1 mb-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <svg
                                key={star}
                                className={`w-5 h-5 ${star <= Math.round(reviewStats?.averageRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            ))}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {reviewStats?.totalReviews || 0} {(() => {
                              const count = reviewStats?.totalReviews || 0;
                              if (count === 1) return 'opinia';
                              if (count >= 2 && count <= 4) return 'opinie';
                              if (count >= 12 && count <= 14) return 'opinii';
                              const lastDigit = count % 10;
                              if (lastDigit >= 2 && lastDigit <= 4) return 'opinie';
                              return 'opinii';
                            })()}
                          </p>
                        </div>
                      </div>

                      {/* Rating Distribution */}
                      {reviewStats && reviewStats.distribution && reviewStats.distribution.length > 0 && (
                        <div className="flex-grow">
                          {[5, 4, 3, 2, 1].map((rating) => {
                            const dist = reviewStats.distribution.find(d => d.rating === rating);
                            const count = dist?.count || 0;
                            const percentage = reviewStats.totalReviews > 0 ? (count / reviewStats.totalReviews) * 100 : 0;
                            return (
                              <div key={rating} className="flex items-center gap-2 mb-1">
                                <span className="text-sm text-gray-600 dark:text-gray-400 w-12">{rating} gw.</span>
                                <div className="flex-grow bg-gray-200 dark:bg-secondary-700 rounded-full h-2">
                                  <div
                                    className="bg-yellow-400 h-2 rounded-full transition-all"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm text-gray-500 dark:text-gray-400 w-8">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Add Review Button / Form */}
                    {canReviewInfo?.canReview && isAuthenticated && !showReviewForm && (
                      <div className="mb-6">
                        <button
                          onClick={() => setShowReviewForm(true)}
                          className="bg-orange-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                        >
                          Napisz opinię
                        </button>
                        {canReviewInfo && !canReviewInfo.hasPurchased && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Twoja opinia będzie oznaczona jako niezweryfikowana. Opinie zweryfikowane mogą dodawać tylko klienci, którzy zakupili ten produkt.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Login prompt for unauthenticated users */}
                    {!isAuthenticated && (
                      <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center gap-3">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            Aby dodać opinię, musisz być zalogowany.
                          </p>
                          <a href="/login" className="text-sm font-medium text-orange-500 hover:text-orange-600 underline">
                            Zaloguj się
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Already reviewed message */}
                    {isAuthenticated && canReviewInfo?.hasReviewed && (
                      <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Dodałeś już opinię o tym produkcie.
                        </p>
                      </div>
                    )}

                    {/* "Masz ten produkt?" CTA - x-kom style */}
                    {!showReviewForm && (
                      <div className="bg-gray-50 dark:bg-secondary-700/50 rounded-xl p-5 sm:p-6 mb-6 border border-gray-100 dark:border-secondary-600">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-1">
                          Masz ten produkt?
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          Oceń go i pomóż innym w wyborze
                        </p>
                        {canReviewInfo?.canReview ? (
                          <button
                            onClick={() => setShowReviewForm(true)}
                            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                          >
                            Dodaj opinię
                          </button>
                        ) : canReviewInfo?.hasReviewed ? (
                          <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                            Już oceniłeś ten produkt
                          </p>
                        ) : (
                          <a
                            href="/login"
                            className="inline-block bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                          >
                            Zaloguj się, aby ocenić
                          </a>
                        )}
                      </div>
                    )}

                    {showReviewForm && (
                      <div className="bg-gray-50 dark:bg-secondary-700 rounded-lg p-6 mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Twoja opinia</h3>
                        
                        {/* Rating Selection */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ocena</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewFormData(prev => ({ ...prev, rating: star }))}
                                className="focus:outline-none"
                              >
                                <svg
                                  className={`w-8 h-8 ${star <= reviewFormData.rating ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Title (optional) */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tytuł (opcjonalnie)</label>
                          <input
                            type="text"
                            value={reviewFormData.title}
                            onChange={(e) => setReviewFormData(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full border border-gray-300 dark:border-secondary-600 dark:bg-secondary-800 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            placeholder="Krótkie podsumowanie opinii"
                          />
                        </div>

                        {/* Content */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Treść opinii</label>
                          <textarea
                            value={reviewFormData.content}
                            onChange={(e) => setReviewFormData(prev => ({ ...prev, content: e.target.value }))}
                            rows={4}
                            className="w-full border border-gray-300 dark:border-secondary-600 dark:bg-secondary-800 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                            placeholder="Podziel się swoją opinią o produkcie (min. 10 znaków)"
                          />
                        </div>

                        {reviewError && (
                          <p className="text-red-500 text-sm mb-4">{reviewError}</p>
                        )}

                        <div className="flex gap-3">
                          <button
                            onClick={handleSubmitReview}
                            disabled={submittingReview}
                            className="bg-orange-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                          >
                            {submittingReview ? 'Wysyłanie...' : 'Dodaj opinię'}
                          </button>
                          <button
                            onClick={() => {
                              setShowReviewForm(false);
                              setReviewError('');
                            }}
                            className="text-gray-600 dark:text-gray-300 px-6 py-2 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-secondary-600 transition-colors"
                          >
                            Anuluj
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Sort and Filters */}
                    {reviews.length > 0 && (
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex gap-2">
                          <select
                            value={reviewsSortBy}
                            onChange={(e) => setReviewsSortBy(e.target.value as typeof reviewsSortBy)}
                            className="border border-gray-300 dark:border-secondary-600 dark:bg-secondary-800 dark:text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          >
                            <option value="newest">Najnowsze</option>
                            <option value="oldest">Najstarsze</option>
                            <option value="highest">Najwyższa ocena</option>
                            <option value="lowest">Najniższa ocena</option>
                            <option value="helpful">Najbardziej pomocne</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Reviews List */}
                    {reviews.length > 0 ? (
                      <div className="space-y-6">
                        {reviews.map((review) => (
                          <div key={review.id} className="border-b border-gray-200 dark:border-secondary-700 pb-6 last:border-0">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="flex">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <svg
                                        key={star}
                                        className={`w-4 h-4 ${star <= review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    ))}
                                  </div>
                                  {review.isVerifiedPurchase && (
                                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                      Zweryfikowany zakup
                                    </span>
                                  )}
                                  {!review.isVerifiedPurchase && (
                                    <span className="text-xs bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                                      Niezweryfikowana
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {review.user.firstName} {review.user.lastName.charAt(0)}.
                                  <span className="text-gray-400 mx-2">•</span>
                                  {new Date(review.createdAt).toLocaleDateString('pl-PL')}
                                </p>
                              </div>
                            </div>

                            {review.title && (
                              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">{review.title}</h4>
                            )}
                            <p className="text-gray-700 dark:text-gray-300 mb-4">{review.content}</p>

                            {/* Admin Reply */}
                            {review.adminReply && (
                              <div className="mt-3 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Odpowiedź sklepu</span>
                                  {review.adminReplyAt && (
                                    <span className="text-xs text-gray-400">
                                      {new Date(review.adminReplyAt).toLocaleDateString('pl-PL')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{review.adminReply}</p>
                              </div>
                            )}

                            {/* Review Images */}
                            {review.images && review.images.length > 0 && (
                              <div className="flex gap-2 mb-4">
                                {review.images.map((img) => (
                                  <div key={img.id} className="relative w-20 h-20">
                                    <Image
                                      src={img.imageUrl}
                                      alt={img.altText || 'Review image'}
                                      fill
                                      sizes="80px"
                                      className="object-cover rounded-lg"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Helpful Buttons */}
                            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                              <span>Czy ta opinia była pomocna?</span>
                              <button
                                onClick={() => handleMarkHelpful(review.id, true)}
                                disabled={!!votedReviews[review.id]}
                                className={`flex items-center gap-1 transition-colors ${
                                  votedReviews[review.id] === 'helpful'
                                    ? 'text-green-600 dark:text-green-400 font-medium'
                                    : votedReviews[review.id]
                                      ? 'opacity-50 cursor-not-allowed'
                                      : 'hover:text-green-600'
                                }`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                </svg>
                                Tak ({review.helpfulCount})
                              </button>
                              <button
                                onClick={() => handleMarkHelpful(review.id, false)}
                                disabled={!!votedReviews[review.id]}
                                className={`flex items-center gap-1 transition-colors ${
                                  votedReviews[review.id] === 'not_helpful'
                                    ? 'text-red-600 dark:text-red-400 font-medium'
                                    : votedReviews[review.id]
                                      ? 'opacity-50 cursor-not-allowed'
                                      : 'hover:text-red-600'
                                }`}
                              >
                                <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                </svg>
                                Nie ({review.notHelpfulCount})
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Pagination */}
                        {reviewsTotalPages > 1 && (
                          <div className="flex justify-center gap-2 pt-6">
                            <button
                              onClick={() => setReviewsPage(p => Math.max(1, p - 1))}
                              disabled={reviewsPage === 1}
                              className="px-4 py-2 border border-gray-300 dark:border-secondary-600 dark:text-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
                            >
                              Poprzednia
                            </button>
                            <span className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              Strona {reviewsPage} z {reviewsTotalPages}
                            </span>
                            <button
                              onClick={() => setReviewsPage(p => Math.min(reviewsTotalPages, p + 1))}
                              disabled={reviewsPage === reviewsTotalPages}
                              className="px-4 py-2 border border-gray-300 dark:border-secondary-600 dark:text-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-colors"
                            >
                              Następna
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Empty State */
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-secondary-700 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Brak opinii</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                          Ten produkt nie ma jeszcze żadnych opinii. Bądź pierwszą osobą, która podzieli się swoją opinią!
                        </p>
                        {!isAuthenticated && (
                          <a href="/login" className="inline-block text-sm font-medium text-orange-500 hover:text-orange-600 underline">
                            Zaloguj się, aby dodać opinię
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Polecane z tego magazynu */}
        {relatedProducts.length > 0 && (
          <ProductCarousel
            title="Proponowane z tego magazynu"
            subtitle="Produkty z tej samej hurtowni — dostawa w jednej przesyłce"
            products={relatedProducts}
            icon={<span>🏪</span>}
          />
        )}
      </main>

      <Footer />

      {/* Add to Shopping List Modal */}
      <AddToListModal
        isOpen={showAddToListModal}
        onClose={() => setShowAddToListModal(false)}
        productId={product.id}
        productName={product.name}
        variantId={selectedVariant?.id}
      />
    </div>
  );
}
