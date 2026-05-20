'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Product } from '../lib/api';
import { useWishlist } from '../contexts/WishlistContext';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { PLACEHOLDER_IMAGE, WAREHOUSE_LOCATIONS, getWarehouseLocation, calculateDiscountPercent, getProductBrand, getProductBrandSlug } from './productUtils';
import { getProxiedImageUrl } from '../lib/image-proxy';

// B2B price calculation (mirrors backend b2b-pricing.service.ts)
function calculateB2bPrice(storePrice: number, multiplier: number): number {
  if (storePrice <= 0 || multiplier <= 0) return 0;
  const basePrice = storePrice / 1.35;
  const b2bPrice = basePrice * multiplier;
  return Math.floor(b2bPrice) + 0.99;
}

// Cart icon
const CartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </svg>
);

// Location icon
const LocationIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export interface ProductCardProps {
  product: Product;
  showDelivery?: boolean;
  showWishlist?: boolean;
  showAddToCart?: boolean;
}

export default memo(function ProductCard({ product, showDelivery = false, showWishlist = true, showAddToCart = true }: ProductCardProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const { user } = useAuth();
  const firstImage = product.images?.[0];
  const productImage = firstImage?.id ? getProxiedImageUrl(firstImage.id) : firstImage?.url;
  const showPlaceholder = imgError || !productImage;
  const mainImage = showPlaceholder ? PLACEHOLDER_IMAGE : productImage;

  // B2B price transformation (show B2B prices for APPROVED and SUSPENDED partners)
  const isB2b = user && ((user as any).b2bStatus === 'APPROVED' || (user as any).b2bStatus === 'SUSPENDED');
  const b2bMultiplier = isB2b ? ((user as any).b2bPriceMultiplier || 1.10) : null;
  const displayPrice = isB2b && b2bMultiplier ? calculateB2bPrice(Number(product.price), b2bMultiplier) : Number(product.price);

  const hasDiscount = !isB2b && product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price);
  const discountPercent = !isB2b ? calculateDiscountPercent(product.price, product.compareAtPrice) : 0;

  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();
  const inWishlist = isInWishlist(product.id);
  const warehouseLocation = (product as any).warehouseLocation || getWarehouseLocation(product);
  const isOutOfStock = (product as any).stock <= 0 && (!product.variants?.[0] || product.variants[0].stock <= 0);
  const isOutletProduct = warehouseLocation === WAREHOUSE_LOCATIONS['outlet'] || warehouseLocation === 'Rzeszów';
  const brand = getProductBrand(product);

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const firstVariant = product.variants?.[0];
    toggleWishlist({
      id: product.id,
      variantId: firstVariant?.id,
      name: product.name,
      price: String(product.price),
      compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : undefined,
      image: mainImage,
    });
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const firstVariant = product.variants?.[0];
    if (firstVariant) {
      addToCart(
        firstVariant.id,
        1,
        {
          productId: product.id,
          name: product.name,
          price: String(product.price),
          image: mainImage,
          quantity: 1,
          sku: product.sku,
        }
      );
    }
  };

  return (
    <div className="group bg-white dark:bg-secondary-800 rounded-xl sm:rounded-2xl overflow-hidden relative h-full flex flex-col shadow-sm hover:shadow-lg dark:shadow-secondary-950/50 transition-all duration-200">
      {/* Wishlist button */}
      {showWishlist && (
        <button
          onClick={handleWishlistClick}
          className={`absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200
            ${inWishlist 
              ? 'bg-red-500 text-white' 
              : 'bg-white dark:bg-secondary-700 text-gray-400 dark:text-secondary-300 opacity-0 group-hover:opacity-100 hover:text-red-500 shadow-md'
            }`}
          title={inWishlist ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        >
          <svg 
            className="w-3.5 h-3.5 sm:w-4 sm:h-4" 
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

      <Link href={`/products/${product.id}`} className="flex flex-col flex-grow">
        {/* Image */}
        <div className="relative aspect-square m-2 sm:m-3 rounded-xl sm:rounded-2xl overflow-hidden bg-white">
          {/* Use next/image to proxy external images through the Next.js server,  */}
          {/* avoiding supplier CDN rate-limiting and aggressive no-cache headers. */}
          {showPlaceholder ? (
            <img
              src={PLACEHOLDER_IMAGE}
              alt={product.name}
              className="absolute inset-0 w-full h-full rounded-lg object-contain"
            />
          ) : (
            <Image
              src={productImage}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 145px, (max-width: 768px) 180px, 220px"
              className="rounded-lg object-contain group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          )}
          {/* Discount Badge */}
          {hasDiscount && (
            <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5">
              <span className="bg-green-500 text-white text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">
                -{discountPercent}%
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 sm:p-3 flex flex-col flex-grow border-t border-gray-100 dark:border-secondary-700">
          {/* Product Name */}
          <h3 className="text-xs sm:text-sm leading-snug font-medium text-gray-800 dark:text-secondary-100 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {product.name}
          </h3>

          {/* Brand / Manufacturer */}
          {brand && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/producent/${getProductBrandSlug(product) || ''}`); }}
              className="text-[10px] sm:text-xs text-primary-600 dark:text-primary-400 hover:underline mt-0.5 block truncate cursor-pointer"
            >
              {brand}
            </span>
          )}

          {/* Rating - hidden when 0 reviews */}
          {(product.reviewCount || 0) > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
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

          {/* Price Section */}
          <div className="mt-1.5 sm:mt-2">
            <div className="flex items-baseline gap-0.5 sm:gap-1">
              <span className="text-sm sm:text-lg font-bold text-gray-900 dark:text-secondary-100">
                {displayPrice.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-secondary-100">zł</span>
            </div>
            {hasDiscount && (
              <span className="text-[10px] sm:text-xs text-gray-400 dark:text-secondary-500 line-through">
                {Number(product.compareAtPrice).toFixed(2).replace('.', ',')} zł
              </span>
            )}
            {isB2b && (
              <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-medium">
                cena B2B
              </span>
            )}
          </div>

          {/* Outlet notice */}
          {isOutletProduct && (
            <p className="text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-bold">
              OUTLET
            </p>
          )}

          {/* Delivery info */}
          <div className="flex flex-col gap-0.5 mt-1 sm:mt-1.5">
            {isOutOfStock ? (
              <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 font-medium">
                Produkt chwilowo niedostępny
              </p>
            ) : (
              <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400">
                Wysyłka w ciągu 24 - 72h
              </p>
            )}
            {warehouseLocation && (
              <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-secondary-400 flex items-center gap-0.5">
                <LocationIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                Magazyn {warehouseLocation}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Add to cart button */}
      {showAddToCart && (
        <div className="px-2 pb-2 sm:px-3 sm:pb-3">
          {isOutOfStock ? (
            <button
              disabled
              className="w-full flex items-center justify-center gap-1.5 sm:gap-2 bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 font-medium py-2 sm:py-2.5 rounded-lg sm:rounded-xl cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span className="text-xs sm:text-sm">Brak w magazynie</span>
            </button>
          ) : (
            <button
              onClick={handleAddToCart}
              className="w-full flex items-center justify-center gap-1.5 sm:gap-2 bg-primary-500 hover:bg-primary-600 text-white font-medium py-2 sm:py-2.5 rounded-lg sm:rounded-xl transition-colors"
            >
              <CartIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Do koszyka</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});