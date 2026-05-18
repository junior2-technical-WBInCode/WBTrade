import prisma from '../db';
import { ProductStatus } from '@prisma/client';
import { Response } from 'express';

// Current store multiplier (baked into product.price in DB)
const CURRENT_MULTIPLIER = 1.35;
// Desired multiplier for Ceneo feed
const CENEO_MULTIPLIER = 1.1;
// Price conversion factor: reverse current multiplier, apply Ceneo multiplier
const PRICE_FACTOR = CENEO_MULTIPLIER / CURRENT_MULTIPLIER;

const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia '];
const DELIVERY_TAGS = [
  'Paczkomaty i Kurier', 'paczkomaty i kurier',
  'Tylko kurier', 'tylko kurier',
  'do 2 kg', 'do 5 kg', 'do 10 kg', 'do 20 kg', 'do 31,5 kg',
];
const PACZKOMAT_TAGS = ['Paczkomaty i Kurier', 'paczkomaty i kurier'];
const PACKAGE_TAGS = [
  'produkt w paczce: 1', 'produkt w paczce: 2', 'produkt w paczce: 3',
  'produkt w paczce: 4', 'produkt w paczce: 5',
];

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string): string {
  let result = html;
  let previous = '';
  while (result !== previous) {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  }
  result = result.replace(/[<>]/g, '');
  return result.trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Recalculates price from store multiplier (1.35) to Ceneo multiplier (1.1)
 * Formula: basePrice = storePrice / 1.35, ceneoPrice = basePrice * 1.1
 */
function recalculatePrice(storePrice: number): number {
  const ceneoPrice = storePrice * PRICE_FACTOR;
  // Round to 2 decimal places
  return Math.round(ceneoPrice * 100) / 100;
}

function buildCeneoProductXml(product: {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  price: any;
  barcode: string | null;
  tags: string[];
  baselinkerCategoryPath: string | null;
  images: { url: string }[];
  category: { name: string } | null;
  variants: { inventory: { quantity: number; reserved: number }[] }[];
}, baseUrl: string): string {
  let totalStock = 0;
  for (const variant of product.variants) {
    for (const inv of variant.inventory) {
      totalStock += inv.quantity - inv.reserved;
    }
  }

  // Skip out of stock
  if (totalStock <= 0) return '';

  const primaryImage = product.images[0]?.url || '';
  if (!primaryImage) return '';

  const storePrice = Number(product.price);
  const ceneoPrice = recalculatePrice(storePrice);
  if (ceneoPrice <= 0) return '';

  const categoryPath = product.baselinkerCategoryPath || product.category?.name || '';

  let brand = '';
  if (product.tags && product.tags.length > 0) {
    const brandTag = product.tags.find((tag: string) => tag.toLowerCase().startsWith('brand:'));
    if (brandTag) {
      brand = brandTag.replace('brand:', '').trim();
    }
  }

  const title = truncate(product.name, 250);
  const description = truncate(stripHtml(product.description || product.name), 4000);
  const link = `${baseUrl}/products/${product.slug}`;

  const additionalImages = product.images.slice(1, 5);

  let item = `
    <o id="${escapeXml(product.sku)}" url="${escapeXml(link)}" price="${ceneoPrice.toFixed(2)}" avail="1" stock="${totalStock}">
      <cat><![CDATA[${categoryPath}]]></cat>
      <name><![CDATA[${title}]]></name>
      <desc><![CDATA[${description}]]></desc>
      <img>${escapeXml(primaryImage)}</img>`;

  for (const img of additionalImages) {
    item += `
      <img>${escapeXml(img.url)}</img>`;
  }

  if (brand) {
    item += `
      <attrs>
        <a name="Producent"><![CDATA[${brand}]]></a>
      </attrs>`;
  }

  if (product.barcode) {
    item += `
      <ean>${escapeXml(product.barcode)}</ean>`;
  }

  item += `
    </o>`;

  return item;
}

/**
 * Streams Ceneo XML feed with recalculated prices (1.1 multiplier instead of 1.35)
 */
export async function streamCeneoFeed(baseUrl: string, res: Response): Promise<void> {
  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;

  // Ceneo XML header
  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<offers xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1">`);

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
      const xml = buildCeneoProductXml(product, baseUrl);
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
</offers>`);
  res.end();
}
