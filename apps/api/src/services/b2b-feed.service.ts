import prisma from '../db';
import { ProductStatus } from '@prisma/client';
import { Response } from 'express';
import { calculateB2bPrice } from './b2b-pricing.service';

const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia '];
const DELIVERY_TAGS = [
  'Paczkomaty i Kurier', 'paczkomaty i kurier',
  'Tylko kurier', 'tylko kurier',
  'do 2 kg', 'do 5 kg', 'do 10 kg', 'do 20 kg', 'do 31,5 kg',
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

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface FeedProduct {
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
}

function getStock(product: FeedProduct): number {
  let total = 0;
  for (const variant of product.variants) {
    for (const inv of variant.inventory) {
      total += inv.quantity - inv.reserved;
    }
  }
  return total;
}

function getBrand(product: FeedProduct): string {
  const brandTag = product.tags?.find((t: string) => t.toLowerCase().startsWith('brand:'));
  return brandTag ? brandTag.replace('brand:', '').trim() : '';
}

async function fetchProducts(skip: number, batchSize: number) {
  return prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      price: { gt: 0 },
      NOT: { tags: { hasSome: HIDDEN_TAGS } },
      tags: { hasSome: DELIVERY_TAGS },
      images: { some: {} },
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
        orderBy: { order: 'asc' as const },
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
    take: batchSize,
  });
}

/**
 * Stream B2B XML feed with user-specific pricing
 */
export async function streamB2bXmlFeed(baseUrl: string, multiplier: number, res: Response): Promise<void> {
  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;

  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<offers xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1">`);

  while (hasMore) {
    const products = await fetchProducts(skip, BATCH_SIZE);

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    for (const product of products) {
      const stock = getStock(product);
      if (stock <= 0) continue;

      const primaryImage = product.images[0]?.url;
      if (!primaryImage) continue;

      const storePrice = Number(product.price);
      const b2bPrice = calculateB2bPrice(storePrice, multiplier);
      if (b2bPrice <= 0) continue;

      const category = product.baselinkerCategoryPath || product.category?.name || '';
      const brand = getBrand(product);
      const link = `${baseUrl}/products/${product.slug}`;
      const description = stripHtml(product.description || product.name).substring(0, 4000);

      let item = `
    <o id="${escapeXml(product.sku)}" url="${escapeXml(link)}" price="${b2bPrice.toFixed(2)}" avail="1" stock="${stock}">
      <cat><![CDATA[${category}]]></cat>
      <name><![CDATA[${product.name}]]></name>
      <desc><![CDATA[${description}]]></desc>
      <img>${escapeXml(primaryImage)}</img>`;

      for (const img of product.images.slice(1, 5)) {
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

      res.write(item);
    }

    skip += BATCH_SIZE;
    if (skip >= 150000) hasMore = false;
    await new Promise(resolve => setImmediate(resolve));
  }

  res.write(`
</offers>`);
  res.end();
}

/**
 * Stream B2B CSV feed with user-specific pricing
 */
export async function streamB2bCsvFeed(baseUrl: string, multiplier: number, res: Response): Promise<void> {
  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;

  // CSV header
  res.write('sku;nazwa;cena_b2b;cena_sklepowa;ean;kategoria;producent;stan;link;zdjecie\n');

  while (hasMore) {
    const products = await fetchProducts(skip, BATCH_SIZE);

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    for (const product of products) {
      const stock = getStock(product);
      if (stock <= 0) continue;

      const primaryImage = product.images[0]?.url || '';
      if (!primaryImage) continue;

      const storePrice = Number(product.price);
      const b2bPrice = calculateB2bPrice(storePrice, multiplier);
      if (b2bPrice <= 0) continue;

      const category = product.baselinkerCategoryPath || product.category?.name || '';
      const brand = getBrand(product);
      const link = `${baseUrl}/products/${product.slug}`;

      const row = [
        escapeCsv(product.sku),
        escapeCsv(product.name),
        b2bPrice.toFixed(2),
        storePrice.toFixed(2),
        escapeCsv(product.barcode || ''),
        escapeCsv(category),
        escapeCsv(brand),
        String(stock),
        escapeCsv(link),
        escapeCsv(primaryImage),
      ].join(';');

      res.write(row + '\n');
    }

    skip += BATCH_SIZE;
    if (skip >= 150000) hasMore = false;
    await new Promise(resolve => setImmediate(resolve));
  }

  res.end();
}
