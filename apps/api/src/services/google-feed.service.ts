import prisma from '../db';
import { ProductStatus } from '@prisma/client';
import { Response } from 'express';

// Tags that hide products from the storefront (must match products.service.ts)
const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia '];

// Delivery tags — products MUST have at least one to be visible
const DELIVERY_TAGS = [
  'Paczkomaty i Kurier', 'paczkomaty i kurier',
  'Tylko kurier', 'tylko kurier',
  'do 2 kg', 'do 5 kg', 'do 10 kg', 'do 20 kg', 'do 31,5 kg',
];

// Paczkomat tags — products with these MUST also have a "produkt w paczce" tag
// Otherwise the product page returns 404 (must match products.service.ts)
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
const PACKAGE_TAGS = [
  'produkt w paczce: 1', 'produkt w paczce: 2', 'produkt w paczce: 3',
  'produkt w paczce: 4', 'produkt w paczce: 5',
];

// Google Merchant only accepts JPEG, PNG, GIF — not WebP
const GOOGLE_ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

/**
 * Returns true if the URL points to a Google-accepted image format
 */
function isGoogleAcceptedImage(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0]; // strip query params
  return GOOGLE_ALLOWED_IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Try to convert a .webp URL to .jpg equivalent (common CDN pattern)
 * Returns original URL if not webp
 */
function convertImageUrl(url: string): string {
  if (!url) return url;
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.webp')) {
    // Replace .webp with .jpg — many CDNs serve the correct format
    return url.replace(/\.webp(\?.*)?$/i, '.jpg$1');
  }
  return url;
}

/**
 * Escapes special XML characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strips HTML tags from description
 * Uses iterative approach and removes stray angle brackets
 */
function stripHtml(html: string): string {
  let result = html;
  let previous = '';
  // Iterate until no more tags are found
  while (result !== previous) {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  }
  // Remove any remaining stray angle brackets
  result = result.replace(/[<>]/g, '');
  return result.trim();
}

/**
 * Truncates text to specified length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Builds XML for a single product item
 */
function buildProductXml(product: {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  price: any;
  compareAtPrice: any;
  barcode: string | null;
  tags: string[];
  baselinkerCategoryPath: string | null;
  images: { url: string }[];
  category: { name: string } | null;
  variants: { inventory: { quantity: number; reserved: number }[] }[];
}, baseUrl: string): string {
  // Calculate total stock
  let totalStock = 0;
  for (const variant of product.variants) {
    for (const inv of variant.inventory) {
      totalStock += inv.quantity - inv.reserved;
    }
  }

  const primaryImageRaw = product.images[0]?.url || '';
  const primaryImage = convertImageUrl(primaryImageRaw);
  
  // Skip product if primary image is missing or still not in accepted format after conversion
  if (!primaryImage || !isGoogleAcceptedImage(primaryImage)) {
    return ''; // Will be filtered out
  }
  
  const additionalImages = product.images.slice(1, 5)
    .map((img: { url: string }) => convertImageUrl(img.url))
    .filter(url => isGoogleAcceptedImage(url));
  const availability = totalStock > 0 ? 'in_stock' : 'out_of_stock';

  const price = `${Number(product.price).toFixed(2)} PLN`;
  const salePrice = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price)
    ? `${Number(product.price).toFixed(2)} PLN`
    : undefined;
  const regularPrice = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price)
    ? `${Number(product.compareAtPrice).toFixed(2)} PLN`
    : price;

  const productType = product.category?.name || '';

  let brand = 'WBTrade';
  if (product.tags && product.tags.length > 0) {
    const brandTag = product.tags.find((tag: string) => tag.toLowerCase().startsWith('brand:'));
    if (brandTag) {
      brand = brandTag.replace('brand:', '').trim();
    }
  }

  const title = truncate(product.name, 150);
  const description = truncate(stripHtml(product.description || product.name), 5000);
  const link = `${baseUrl}/products/${product.slug}`;
  const finalPrice = salePrice ? regularPrice : price;

  let item = `
    <item>
      <g:id>${escapeXml(product.sku)}</g:id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(primaryImage)}</g:image_link>`;

  for (const imgUrl of additionalImages) {
    item += `
      <g:additional_image_link>${escapeXml(imgUrl)}</g:additional_image_link>`;
  }

  item += `
      <g:price>${escapeXml(finalPrice)}</g:price>`;

  if (salePrice) {
    item += `
      <g:sale_price>${escapeXml(salePrice)}</g:sale_price>`;
  }

  item += `
      <g:availability>${availability}</g:availability>
      <g:condition>new</g:condition>`;

  if (brand) {
    item += `
      <g:brand>${escapeXml(brand)}</g:brand>`;
  }

  if (product.barcode) {
    item += `
      <g:gtin>${escapeXml(product.barcode)}</g:gtin>`;
  }

  item += `
      <g:mpn>${escapeXml(product.sku)}</g:mpn>`;

  if (productType) {
    item += `
      <g:product_type>${escapeXml(productType)}</g:product_type>`;
  }

  item += `
    </item>`;

  return item;
}

/**
 * Streams Google Merchant Center XML feed directly to response
 * Memory-efficient: processes products in small batches and writes immediately
 * Does NOT accumulate all products in memory
 */
export async function streamGoogleMerchantFeed(baseUrl: string, res: Response): Promise<void> {
  const BATCH_SIZE = 200; // Smaller batches for lower memory footprint
  let skip = 0;
  let hasMore = true;

  // Write XML header
  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>WBTrade - Sklep internetowy</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Produkty ze sklepu WBTrade</description>`);

  // Stream products in batches
  while (hasMore) {
    const products = await prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        price: { gt: 0 },
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        tags: { hasSome: DELIVERY_TAGS },
        images: { some: {} },
        // Paczkomat filter: if product has paczkomat tag, it MUST also have package tag
        // Without this, product page returns 404 → Google flags "page unavailable"
        OR: [
          { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
          { tags: { hasSome: PACKAGE_TAGS } },
        ],
      },
      select: {
        sku: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        compareAtPrice: true,
        barcode: true,
        tags: true,
        baselinkerCategoryPath: true,
        images: {
          select: { url: true },
          orderBy: { order: 'asc' },
          take: 5,
        },
        category: {
          select: { name: true },
        },
        variants: {
          select: {
            inventory: {
              select: { quantity: true, reserved: true },
            },
          },
          take: 1,
        },
      },
      skip,
      take: BATCH_SIZE,
    });

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    // Write each product's XML immediately, don't accumulate
    for (const product of products) {
      const xml = buildProductXml(product, baseUrl);
      if (xml) { // Skip products with invalid images
        res.write(xml);
      }
    }

    skip += BATCH_SIZE;

    // Safety limit - max 150000 products (Google Merchant limit per feed file)
    if (skip >= 150000) {
      hasMore = false;
    }

    // Allow event loop to breathe between batches
    await new Promise(resolve => setImmediate(resolve));
  }

  // Write XML footer and end response
  res.write(`
  </channel>
</rss>`);
  res.end();
}

/**
 * Legacy non-streaming version (kept for backward compatibility if needed)
 * WARNING: May cause OOM on large catalogs with limited memory
 */
export async function generateGoogleMerchantFeed(baseUrl: string): Promise<string> {
  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;
  const chunks: string[] = [];

  chunks.push(`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>WBTrade - Sklep internetowy</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Produkty ze sklepu WBTrade</description>`);

  while (hasMore) {
    const products = await prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        price: { gt: 0 },
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        tags: { hasSome: DELIVERY_TAGS },
        images: { some: {} },
        OR: [
          { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
          { tags: { hasSome: PACKAGE_TAGS } },
        ],
      },
      select: {
        sku: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        compareAtPrice: true,
        barcode: true,
        tags: true,
        baselinkerCategoryPath: true,
        images: {
          select: { url: true },
          orderBy: { order: 'asc' },
          take: 5,
        },
        category: {
          select: { name: true },
        },
        variants: {
          select: {
            inventory: {
              select: { quantity: true, reserved: true },
            },
          },
          take: 1,
        },
      },
      skip,
      take: BATCH_SIZE,
    });

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    for (const product of products) {
      const xml = buildProductXml(product, baseUrl);
      if (xml) {
        chunks.push(xml);
      }
    }

    skip += BATCH_SIZE;
    if (skip >= 150000) {
      hasMore = false;
    }
  }

  chunks.push(`
  </channel>
</rss>`);

  return chunks.join('');
}

/**
 * Streams filtered Google Merchant Center XML feed — only products from specified categories
 * Accepts category slugs and includes all their subcategories recursively
 */
export async function streamFilteredGoogleMerchantFeed(
  baseUrl: string,
  res: Response,
  categorySlugs: string[]
): Promise<void> {
  // Resolve category IDs from slugs, including all subcategories
  const categoryIds = await resolveCategoryIds(categorySlugs);

  if (categoryIds.length === 0) {
    res.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>WBTrade - Sklep internetowy (filtrowany)</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Produkty ze sklepu WBTrade - wybrany asortyment</description>
  </channel>
</rss>`);
    res.end();
    return;
  }

  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;

  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>WBTrade - Sklep internetowy (filtrowany)</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Produkty ze sklepu WBTrade - wybrany asortyment</description>`);

  while (hasMore) {
    const products = await prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        price: { gt: 0 },
        NOT: { tags: { hasSome: HIDDEN_TAGS } },
        tags: { hasSome: DELIVERY_TAGS },
        images: { some: {} },
        categoryId: { in: categoryIds },
        OR: [
          { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
          { tags: { hasSome: PACKAGE_TAGS } },
        ],
      },
      select: {
        sku: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        compareAtPrice: true,
        barcode: true,
        tags: true,
        baselinkerCategoryPath: true,
        images: {
          select: { url: true },
          orderBy: { order: 'asc' },
          take: 5,
        },
        category: {
          select: { name: true },
        },
        variants: {
          select: {
            inventory: {
              select: { quantity: true, reserved: true },
            },
          },
          take: 1,
        },
      },
      skip,
      take: BATCH_SIZE,
    });

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    for (const product of products) {
      const xml = buildProductXml(product, baseUrl);
      if (xml) {
        res.write(xml);
      }
    }

    skip += BATCH_SIZE;
    if (skip >= 150000) {
      hasMore = false;
    }

    await new Promise(resolve => setImmediate(resolve));
  }

  res.write(`
  </channel>
</rss>`);
  res.end();
}

/**
 * Resolves category slugs to a flat list of category IDs including all subcategories
 */
async function resolveCategoryIds(slugs: string[]): Promise<string[]> {
  // Find root categories by slug
  const rootCategories = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });

  if (rootCategories.length === 0) return [];

  const allIds = new Set<string>(rootCategories.map(c => c.id));

  // BFS to collect all descendant category IDs
  let currentParentIds = [...allIds];
  while (currentParentIds.length > 0) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: currentParentIds } },
      select: { id: true },
    });
    currentParentIds = [];
    for (const child of children) {
      if (!allIds.has(child.id)) {
        allIds.add(child.id);
        currentParentIds.push(child.id);
      }
    }
  }

  return [...allIds];
}

/**
 * Get feed statistics - optimized query
 */
export async function getFeedStats(): Promise<{
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  lastUpdated: Date;
}> {
  // Use count instead of fetching all products
  const totalProducts = await prisma.product.count({
    where: {
      status: ProductStatus.ACTIVE,
    },
  });

  // Count products with stock > 0 using raw aggregation
  const productsWithStock = await prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
    },
    select: {
      id: true,
      variants: {
        select: {
          inventory: {
            select: { quantity: true, reserved: true },
          },
        },
        take: 1,
      },
    },
  });

  let inStock = 0;
  let outOfStock = 0;

  for (const product of productsWithStock) {
    let totalStock = 0;
    for (const variant of product.variants) {
      for (const inv of variant.inventory) {
        totalStock += inv.quantity - inv.reserved;
      }
    }
    if (totalStock > 0) {
      inStock++;
    } else {
      outOfStock++;
    }
  }

  return {
    totalProducts,
    inStock,
    outOfStock,
    lastUpdated: new Date(),
  };
}
