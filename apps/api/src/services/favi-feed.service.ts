import prisma from '../db';
import { ProductStatus } from '@prisma/client';
import { Response } from 'express';

const HIDDEN_TAGS = ['błąd zdjęcia', 'błąd zdjęcia ', 'nie wrzucać-zabronione'];

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

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

function isAcceptedImage(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0];
  return ALLOWED_IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function convertImageUrl(url: string): string {
  if (!url) return url;
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.webp')) {
    return url.replace(/\.webp(\?.*)?$/i, '.jpg$1');
  }
  return url;
}

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

interface FaviProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | string;
  compareAtPrice: number | string | null;
  barcode: string | null;
  tags: string[];
  specifications: Record<string, unknown> | null;
  baselinkerCategoryPath: string | null;
  images: { url: string }[];
  category: { name: string; slug: string } | null;
  variants: {
    id: string;
    attributes: Record<string, unknown> | null;
    inventory: { quantity: number; reserved: number }[];
  }[];
}

function buildFaviProductXml(product: FaviProduct, baseUrl: string): string {
  let totalStock = 0;
  for (const variant of product.variants) {
    for (const inv of variant.inventory) {
      totalStock += inv.quantity - inv.reserved;
    }
  }

  const primaryImageRaw = product.images[0]?.url || '';
  const primaryImage = convertImageUrl(primaryImageRaw);

  if (!primaryImage || !isAcceptedImage(primaryImage)) {
    return '';
  }

  const additionalImages = product.images.slice(1, 10)
    .map(img => convertImageUrl(img.url))
    .filter(url => isAcceptedImage(url));

  const availability = totalStock > 0 ? 'in stock' : 'out of stock';
  const price = Number(product.price).toFixed(2);

  const specs = (product.specifications && typeof product.specifications === 'object')
    ? product.specifications as Record<string, unknown>
    : {};

  // Extract brand
  let brand = '';
  const brandTag = product.tags?.find(tag => tag.toLowerCase().startsWith('brand:'));
  if (brandTag) {
    brand = brandTag.replace('brand:', '').trim();
  } else if (specs.brand) {
    brand = String(specs.brand);
  }

  // Category path
  let productType = '';
  if (product.baselinkerCategoryPath) {
    productType = product.baselinkerCategoryPath.replace(/\//g, '>');
  } else if (product.category?.name) {
    productType = product.category.name;
  }

  const title = truncate(product.name, 150);
  const description = stripHtml(product.description || product.name);
  const link = `${baseUrl}/products/${product.slug}`;

  // Build item XML
  let item = `
    <item>
      <g:id>${escapeXml(product.sku)}</g:id>
      <title><![CDATA[${title}]]></title>
      <description><![CDATA[${truncate(description, 5000)}]]></description>`;

  if (productType) {
    item += `
      <g:product_type>${escapeXml(productType)}</g:product_type>`;
  }

  item += `
      <link>${escapeXml(link)}</link>
      <g:image_link>${escapeXml(primaryImage)}</g:image_link>`;

  for (const imgUrl of additionalImages) {
    item += `
      <g:additional_image_link>${escapeXml(imgUrl)}</g:additional_image_link>`;
  }

  item += `
      <g:availability>${availability}</g:availability>
      <g:price>${price}</g:price>`;

  if (product.barcode) {
    item += `
      <g:gtin>${escapeXml(product.barcode)}</g:gtin>`;
  }

  if (brand) {
    item += `
      <g:brand>${escapeXml(brand)}</g:brand>`;
  }

  // Color from specifications
  const color = specs.color || specs.kolor || specs.Kolor;
  if (color) {
    item += `
      <g:color>${escapeXml(String(color))}</g:color>`;
  }

  // Material from specifications
  const material = specs.material || specs.materiał || specs.Materiał || specs.Material;
  if (material) {
    item += `
      <g:material>${escapeXml(String(material))}</g:material>`;
  }

  // Pattern from specifications
  const pattern = specs.pattern || specs.wzór || specs.Wzór;
  if (pattern) {
    item += `
      <g:pattern>${escapeXml(String(pattern))}</g:pattern>`;
  }

  // Product details from specifications (dimensions, weight, etc.)
  const detailFields: Record<string, string> = {
    'Wysokość': 'Height',
    'wysokość': 'Height',
    'height': 'Height',
    'Szerokość': 'Width',
    'szerokość': 'Width',
    'width': 'Width',
    'Długość': 'Length',
    'długość': 'Length',
    'length': 'Length',
    'Głębokość': 'Depth',
    'głębokość': 'Depth',
    'depth': 'Depth',
    'Waga': 'Weight',
    'waga': 'Weight',
    'weight': 'Weight',
    'Pojemność': 'Capacity',
    'pojemność': 'Capacity',
    'capacity': 'Capacity',
  };

  for (const [specKey, detailName] of Object.entries(detailFields)) {
    if (specs[specKey]) {
      item += `
      <g:product_detail>
        <g:section_name>Size</g:section_name>
        <g:attribute_name>${escapeXml(detailName)}</g:attribute_name>
        <g:attribute_value>${escapeXml(String(specs[specKey]))}</g:attribute_value>
      </g:product_detail>`;
    }
  }

  // Shipping - Poland
  item += `
      <g:shipping>
        <g:country>PL</g:country>
        <g:price>0 PLN</g:price>
      </g:shipping>`;

  // Item group ID (for variants - use product ID)
  if (product.variants.length > 1) {
    item += `
      <g:item_group_id>${escapeXml(product.id)}</g:item_group_id>`;
  }

  item += `
    </item>`;

  return item;
}

/**
 * Streams FAVI-compatible Google-format XML feed directly to response
 */
export async function streamFaviFeed(baseUrl: string, res: Response): Promise<void> {
  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;

  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>WBTrade</title>
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
        category: { isActive: true },
        OR: [
          { NOT: { tags: { hasSome: PACZKOMAT_TAGS } } },
          { tags: { hasSome: PACKAGE_TAGS } },
        ],
      },
      select: {
        id: true,
        sku: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        compareAtPrice: true,
        barcode: true,
        tags: true,
        specifications: true,
        baselinkerCategoryPath: true,
        images: {
          select: { url: true },
          orderBy: { order: 'asc' },
          take: 10,
        },
        category: {
          select: { name: true, slug: true },
        },
        variants: {
          select: {
            id: true,
            attributes: true,
            inventory: {
              select: { quantity: true, reserved: true },
            },
          },
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
      const xml = buildFaviProductXml(product as unknown as FaviProduct, baseUrl);
      if (xml) {
        res.write(xml);
      }
    }

    skip += BATCH_SIZE;

    if (skip >= 50000) {
      hasMore = false;
    }

    await new Promise(resolve => setImmediate(resolve));
  }

  res.write(`
  </channel>
</rss>`);
  res.end();
}
