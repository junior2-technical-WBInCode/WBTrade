'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Product } from '../lib/api';
import { useWishlist } from '../contexts/WishlistContext';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { PLACEHOLDER_IMAGE, WAREHOUSE_LOCATIONS, getWarehouseLocation, calculateDiscountPercent, getProductBrand, getProductBrandSlug, calculateClientB2bPrice } from './productUtils';

export interface ProductListCardProps {
  product: Product;
  showWishlist?: boolean;
  viewMode?: 'grid' | 'list';
}

// Badge types
type BadgeType = 'super-price' | 'outlet' | 'bestseller' | 'new';

const badgeStyles: Record<BadgeType, string> = {
  'super-price': 'bg-primary-500 text-white',
  'outlet': 'bg-gray-500 text-white',
  'bestseller': 'bg-green-500 text-white',
  'new': 'bg-blue-500 text-white',
};

export default memo(function ProductListCard({ product, showWishlist = true, viewMode = 'grid' }: ProductListCardProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const { user } = useAuth();
  
  const mainImage = imgError || !product.images?.[0]?.url ? PLACEHOLDER_IMAGE : product.images[0].url;
  
  // B2B price transformation (show B2B prices for APPROVED and SUSPENDED partners)
  const isB2b = user && ((user as any).b2bStatus === 'APPROVED' || (user as any).b2bStatus === 'SUSPENDED');
  
  const firstVariant = product.variants?.[0];
  const variantPrice = firstVariant?.price ? Number(firstVariant.price) : 0;
  const productPrice = Number(product.price) || 0;
  const rawEffectivePrice = variantPrice > 0 ? variantPrice : productPrice;

  let displayPrice = rawEffectivePrice;
  if (isB2b) {
    if ((product as any).isB2bPrice) {
      displayPrice = rawEffectivePrice;
    } else {
      const globalMultiplier = (user as any).b2bPriceMultiplier || 1.10;
      const wholesalerRules = (user as any).b2bWholesalerRules;
      displayPrice = calculateClientB2bPrice(
        rawEffectivePrice,
        globalMultiplier,
        wholesalerRules,
        (product as any).baselinkerProductId,
        firstVariant?.sku || product.sku,
        product.tags,
        (firstVariant as any)?.purchasePrice || (product as any).purchasePrice
      );
    }
  }

  const variantCompareAtPrice = firstVariant?.compareAtPrice ? Number(firstVariant.compareAtPrice) : 0;
  const productCompareAtPrice = product.compareAtPrice ? Number(product.compareAtPrice) : 0;
  const rawCompareAtPrice = variantCompareAtPrice > 0 ? variantCompareAtPrice : productCompareAtPrice;

  const hasDiscount = !isB2b && rawCompareAtPrice > 0 && rawCompareAtPrice > rawEffectivePrice;
  const discountPercent = !isB2b ? calculateDiscountPercent(rawEffectivePrice, rawCompareAtPrice) : 0;
  
  // Demo data for display
  const storeName = product.storeName || 'TopStore';
  const badge = product.badge as BadgeType | undefined;
  const deliveryInfo = product.deliveryInfo || 'Wysyłka w ciągu 24 - 72h';
  const warehouseLocation = (product as any).warehouseLocation || getWarehouseLocation(product);
  const isOutOfStock = (product as any).stock <= 0 && (!product.variants?.[0] || product.variants[0].stock <= 0);
  const isOutletProduct = warehouseLocation === WAREHOUSE_LOCATIONS['outlet'] || warehouseLocation === 'Rzeszów';

  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();
  const inWishlist = isInWishlist(product.id);

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const firstVariant = product.variants?.[0];
    toggleWishlist({
      id: product.id,
      variantId: firstVariant?.id,
      name: product.name,
      price: String(rawEffectivePrice),
      compareAtPrice: rawCompareAtPrice > 0 ? String(rawCompareAtPrice) : undefined,
      image: mainImage,
    });
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const firstVariant = product.variants?.[0];
    if (!firstVariant) return;
    
    setIsAdding(true);
    try {
      await addToCart(firstVariant.id, 1, {
        name: product.name,
        image: mainImage,
        price: String(displayPrice),
        quantity: 1,
        productId: product.id,
        sku: product.sku,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (error) {
      console.error('Failed to add to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const canAddToCart = product.variants && product.variants.length > 0 && ((product as any).stock > 0 || product.variants[0].stock > 0);

  // List view - Allegro style
  if (viewMode === 'list') {
    return (
      <div className="group bg-white dark:bg-secondary-800 rounded-2xl shadow-sm hover:shadow-lg dark:shadow-secondary-950/20 dark:hover:shadow-secondary-950/50 transition-shadow duration-200 relative overflow-hidden">
        <Link href={`/products/${product.id}`} className="flex flex-row">
          {/* Image container */}
          <div className="relative w-[120px] h-[140px] sm:w-[140px] sm:h-[160px] flex-shrink-0 p-2">
            {/* Wishlist button - inside image area */}
            {showWishlist && (
              <button
                onClick={handleWishlistClick}
                className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-md
                  ${inWishlist 
                    ? 'bg-white text-red-500' 
                    : 'bg-white text-gray-400 hover:text-red-500'
                  }`}
                title={inWishlist ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
              >
                <svg 
                  className="w-5 h-5" 
                  fill={inWishlist ? 'currentColor' : 'none'} 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                  />
                </svg>
              </button>
            )}
            <div className="w-full h-full rounded-xl overflow-hidden bg-white relative">
              <img
                src={mainImage}
                alt={product.name}
                loading="lazy"
                className={`absolute inset-0 w-full h-full ${
                  mainImage === PLACEHOLDER_IMAGE
                    ? 'object-contain'
                    : 'object-contain group-hover:scale-105 transition-transform duration-300'
                }`}
                onError={() => setImgError(true)}
              />
            </div>
            {badge && (
              <span className={`absolute bottom-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded-lg ${badgeStyles[badge]}`}>
                {badge === 'super-price' ? 'Super Cena' : 
                 badge === 'outlet' ? 'Outlet' : 
                 badge === 'bestseller' ? 'Bestseller' : 'Nowość'}
              </span>
            )}
            {hasDiscount && discountPercent > 0 && (
              <span className="absolute top-3 left-3 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg">
                -{discountPercent}%
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 py-3 pr-3 flex flex-col min-w-0">
            {/* Product Name */}
            <h3 className="text-sm font-medium text-secondary-800 dark:text-secondary-100 line-clamp-2 mb-1 pr-2">
              {product.name}
            </h3>

            {/* Brand / Manufacturer */}
            {getProductBrand(product) && (
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/producent/${getProductBrandSlug(product) || ''}`); }}
                className="text-[10px] sm:text-xs text-primary-600 dark:text-primary-400 hover:underline mb-1 block truncate cursor-pointer"
              >
                {getProductBrand(product)}
              </span>
            )}

            {/* Rating - hidden when 0 reviews */}
            {(product.reviewCount || 0) > 0 && (
              <div className="flex items-center gap-1 mb-1">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= Math.round(Number(product.rating || 0))
                          ? 'text-orange-400'
                          : 'text-gray-300 dark:text-secondary-600'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-xs text-gray-500 dark:text-secondary-400">
                  ({product.reviewCount} {product.reviewCount === 1 ? 'opinia' : 'opinii'})
                </span>
              </div>
            )}

            {/* Price */}
            <div className="flex flex-wrap items-baseline gap-2 mb-2">
              <span className="text-lg font-bold text-secondary-900 dark:text-white">
                {displayPrice.toFixed(2).replace('.', ',')} zł
              </span>
              {hasDiscount && (
                <span className="text-sm text-gray-400 dark:text-secondary-500 line-through">
                  {rawCompareAtPrice.toFixed(2).replace('.', ',')} zł
                </span>
              )}
              {isB2b && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                  cena B2B
                </span>
              )}
            </div>

            {/* Delivery Info */}
            <div className="flex flex-col gap-0.5 mt-auto">
              {isOutletProduct && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-snug mb-0.5">OUTLET</span>
              )}
              {isOutOfStock ? (
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">Produkt chwilowo niedostępny</span>
              ) : (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">{deliveryInfo}</span>
              )}
              {warehouseLocation && (
                <span className="text-[10px] text-gray-500 dark:text-secondary-400 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Magazyn {warehouseLocation}
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* Add to Cart Button - full width at bottom like Allegro */}
        <div className="px-2 pb-2">
          {isOutOfStock ? (
            <button
              disabled
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Brak w magazynie
            </button>
          ) : (
            <button
              onClick={handleAddToCart}
              disabled={isAdding || added}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2
                ${added 
                  ? 'bg-green-500 text-white' 
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
                }
                ${isAdding ? 'opacity-70 cursor-wait' : ''}
              `}
            >
              {isAdding ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Dodawanie...
                </>
              ) : added ? (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Dodano!
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Dodaj do koszyka
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid view (default)

  return (
    <div className="group bg-white dark:bg-secondary-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-secondary-700 hover:shadow-lg dark:hover:shadow-secondary-950/50 transition-shadow duration-200 flex flex-col h-full relative overflow-hidden min-w-0">
      {/* Wishlist button */}
      {showWishlist && (
        <button
          onClick={handleWishlistClick}
          className={`absolute top-1 right-1 sm:top-2 sm:right-2 z-10 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200
            ${inWishlist 
              ? 'bg-red-50 dark:bg-red-900/30 text-red-500' 
              : 'bg-white/80 dark:bg-secondary-700/80 text-gray-400 dark:text-secondary-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
            }`}
          title={inWishlist ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        >
          <svg 
            className="w-4 h-4 sm:w-5 sm:h-5" 
            fill={inWishlist ? 'currentColor' : 'none'} 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
            />
          </svg>
        </button>
      )}

      <Link href={`/products/${product.id}`} className="flex flex-col h-full">
        {/* Image */}
        <div className="relative aspect-square m-2 sm:m-3 overflow-hidden rounded-xl sm:rounded-2xl bg-white">
          <img
            src={mainImage}
            alt={product.name}
            loading="lazy"
            className={`absolute inset-0 w-full h-full rounded-lg ${
              mainImage === PLACEHOLDER_IMAGE
                ? 'object-contain'
                : 'object-contain group-hover:scale-105 transition-transform duration-300'
            }`}
            onError={() => setImgError(true)}
          />
          {badge && (
            <span className={`absolute top-1 left-1 sm:top-2 sm:left-2 text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${badgeStyles[badge]}`}>
              {badge === 'super-price' ? 'Super Cena' : 
               badge === 'outlet' ? 'Outlet' : 
               badge === 'bestseller' ? 'Bestseller' : 'Nowość'}
            </span>
          )}
          {hasDiscount && discountPercent > 0 && !badge && (
            <div className="absolute top-1 left-1 sm:top-2 sm:left-2">
              <span className="bg-green-500 text-white text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">
                -{discountPercent}%
              </span>
            </div>
          )}
          {hasDiscount && discountPercent > 0 && badge && (
            <div className="absolute top-8 left-1 sm:top-10 sm:left-2">
              <span className="bg-green-500 text-white text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">
                -{discountPercent}%
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 sm:p-3 flex flex-col flex-grow">
          {/* Product Name */}
          <h3 className="text-xs sm:text-sm text-secondary-800 dark:text-secondary-100 line-clamp-2 mb-1 min-h-[2rem] sm:min-h-[2.5rem]">
            {product.name}
          </h3>

          {/* Brand / Manufacturer */}
          {getProductBrand(product) && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/producent/${getProductBrandSlug(product) || ''}`); }}
              className="text-[10px] sm:text-xs text-primary-600 dark:text-primary-400 hover:underline mb-0.5 block truncate cursor-pointer"
            >
              {getProductBrand(product)}
            </span>
          )}

          {/* Rating - hidden when 0 reviews */}
          {(product.reviewCount || 0) > 0 && (
            <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className={`w-3 h-3 ${
                      star <= Math.round(Number(product.rating || 0))
                        ? 'text-orange-400'
                        : 'text-gray-300 dark:text-secondary-600'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-secondary-400">
                ({product.reviewCount} {product.reviewCount === 1 ? 'opinia' : 'opinii'})
              </span>
            </div>
          )}

          {/* Price */}
          <div className="flex flex-wrap items-baseline gap-1 sm:gap-2 mb-1 sm:mb-2">
            <span className="text-sm sm:text-lg font-bold text-secondary-900 dark:text-white">
              {displayPrice.toFixed(2).replace('.', ',')} zł
            </span>
            {hasDiscount && (
              <span className="text-xs sm:text-sm text-gray-400 dark:text-secondary-500 line-through">
                {rawCompareAtPrice.toFixed(2).replace('.', ',')} zł
              </span>
            )}
            {isB2b && (
              <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-medium">
                cena B2B
              </span>
            )}
          </div>

          {/* Delivery Info */}
          <div className="flex flex-col gap-0.5 mb-1 sm:mb-2 mt-auto">
            {isOutletProduct && (
              <span className="text-[9px] sm:text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-snug mb-0.5">OUTLET</span>
            )}
            {isOutOfStock ? (
              <span className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 font-medium">Produkt chwilowo niedostępny</span>
            ) : (
              <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400">{deliveryInfo}</span>
            )}
            {warehouseLocation && (
              <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-secondary-400 flex items-center gap-0.5">
                <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Magazyn {warehouseLocation}
              </span>
            )}
          </div>

          {/* Add to Cart Button */}
          {isOutOfStock ? (
            <button
              disabled
              className="w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed flex items-center justify-center gap-1 sm:gap-2"
            >
              <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Brak w magazynie
            </button>
          ) : (
            <button
              onClick={handleAddToCart}
              disabled={isAdding || added}
              className={`w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2
                ${added 
                  ? 'bg-green-500 text-white' 
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
                }
                ${isAdding ? 'opacity-70 cursor-wait' : ''}
              `}
            >
              {isAdding ? (
                <>
                  <svg className="animate-spin h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="hidden sm:inline">Dodawanie...</span>
                </>
              ) : added ? (
                <>
                  <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="hidden sm:inline">Dodano!</span>
                </>
              ) : (
                <>
                  <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Do koszyka
                </>
              )}
            </button>
          )}
        </div>
      </Link>
    </div>
  );
});
