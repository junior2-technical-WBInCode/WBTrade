import prisma from '../db';
import { ProductStatus } from '@prisma/client';
import { Response } from 'express';

// Reuse helpers from google-feed.service
// Tags that hide products from the storefront
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
const GOOGLE_ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

function isGoogleAcceptedImage(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0];
  return GOOGLE_ALLOWED_IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
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

// Campaign product IDs per sheet (verified SKUs with correct prefixes)
export const CAMPAIGN_IDS: Record<string, string[]> = {
  caloroczna: ["BTP-BMHMS26L25HSMLKT","1010640-1","1010637","BTP-FECHMMAK","BTP-BMWSES20MAMK","BTP-40025","BTP-15293","HK-KB-7998","BTP-40076","BTP-61487","DOFIRMY-5702018067505","BTP-61527","BTP-MARE0076","1004805","1008743","1033848","HK-KH-4198","BTP-BMBP15COCARTCBK","1024961","DOFIRMY-5902934831062","DOFIRMY-5903887801706","1010638","1033433","1004813","BTP-GUCB154GG","1027538","DOFIRMY-202097","BTP-FGE0043","1024988","1024914","1005816","BTP-5226849","BTP-GUCB15NTMLLP","BTP-FGE0024","BTP-CRG-40MST-OPL","BTP-CRG-GNCC35-WHI","BTP-GUPB5FP4EMGW","BTP-GUBH70E4PTMK","HK-MX-2173","HS-991405","BTP-61561","1033842","BTP-BDC005","1031174","BTP-CRGHFMIP1663PBLK","1032688","1017283","BTP-FEPB5MNCAK","BTP-CRGCLRMIP1763PTRS","BTP-8711252525532GREEN","BTP-ACS10376","BTP-5216180","BTP-CRG-PS15W-BLK","BTP-BMCCMUSBCK","1032955","BTP-FECBMSMENK","LEKER-44237","HK-A22210","HK-A16620","1008736","LEKER-CW40579","1016721","HK-BH-6410","HK-KH-1615","HK-KB-7623","1033843","BTP-GUPBM3ALGSGK","1005842","BTP-MUGBHP74","BTP-BMBPCO15CAPNBK","BTP-TAZ111","1007864","BTP-GUTB10QLPK","1026193","BTP-GUCS134GB","DOFIRMY-5702018035023","DOFIRMY-5702018034804","BTP-40024","DOFIRMY-5702017416663","DOFIRMY-5702018067048","BTP-BMDCSMADGPK","HS-939463","HS-946052","HS-2362421","1009598","BTP-TAZ163","1024975","BTP-USHPV6PUNK","1034316","1034281"],
  gastronomia: ["1010198","HK-KH-1667","1000030","1030934","1000819","1002627","1008730","1005039","1024701","HK-KH-4457","1019136","1030662","HK-KH-4075","1004113","1012959","1017407","1030669","1015822","1004010","1005853","1030951","1010168","1002812","1002631","1030886","1001872","1001933","1002886","1004314","1016334","1030580","1006011","1004979","1026143","1005738","1012904","1030885","1026147","1024007","1010197","1025067","1025781","1000141","1003335","1002060","1000715","HK-KH-1672","1008523","HK-KH-1044","1005910","HK-KB-7295","1008016","1005619","1002364","1030936","1005843","HK-KH-1724","1008039","1004167","1000808","1020292","1004321","1000167","HK-KH-1325","1008172","1003289","1030595","1000286","1024939","1004754","1004201","1012831","1010162","1004332","1000035","1002840","1030571","1004123","1003219","1025869","1004997","1005848","1005021","1008805","1026152","1024987","1005735","1010169","1010329","1030663","1007315","1030871","1030937","HK-KH-1668","1013401","1031023","1017065","1008376","1025055"],
  ogrod: ["1028029","HS-2535915","HS-1843121","HS-1843117","HS-1843113","HS-1843107","DOFIRMY-5907544422303","1004869","1016432","BTP-8711252121604","1018825","1025666","1017382","1032730","1014077","DOFIRMY-0033","1018826","1009065","1009061","1032516","1023402","BTP-871125223451","BTP-6942138967999","HK-73920","1019831","1020904","1009129","1008862","1011303","1014067","1014824","1020908","BTP-8711252121789","1011795","1008858","1026482","1008860","1014066","DOFIRMY-0028","1014493","DOFIRMY-5907544439417","1019711","1019713","1023328","1019714","DOFIRMY-0029"],
  sport: ["1033266","1033230","1024517","1024496","1032642","1027530","1028197","1024393","1027177","1027425","1026933","1004805","1018320","DOFIRMY-5901969114812","DOFIRMY-202099","1033257","1027344","1027396","1028269","DOFIRMY-202097","1031119","1033235","1024466","1024531","1031479","1028168","1028169","1028152","1033267","1024522","1024454","1029269","1028173","1024537","1024523","1033249","1016496","1027441","1024477","1016481","1016720","1016478","1024518","HS-893589","1031118","1007859","1028185","1033289","1024411","1028229","1029268","1024534","1031986","1021538","1028272","1015069","1012017","1027792","1024442","BTP-MS100","1000980","1028215","1024507","1028221","1028167","1024516","1018538","1027600","1014521","1027435","1024463","1024434","1027003","1004815-1","1027453","1027400","1016722","1029266","1028258","HS-946013","1024171","1024580","1028174","1024491","1024567"],
};

const CAMPAIGN_TITLES: Record<string, string> = {
  caloroczna: 'WBTrade - Kampania Całoroczna',
  gastronomia: 'WBTrade - Kampania Gastronomia',
  ogrod: 'WBTrade - Kampania Ogród i Gospodarstwo',
  sport: 'WBTrade - Kampania Sport i Turystyka',
};

const CAMPAIGN_LABELS: Record<string, string> = {
  caloroczna: 'shopping_caloroczna',
  gastronomia: 'shopping_gastronomia',
  ogrod: 'shopping_ogrod_gospodarstwo',
  sport: 'shopping_sport_turystyka',
};

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
}, baseUrl: string, campaignKey: string): string {
  let totalStock = 0;
  for (const variant of product.variants) {
    for (const inv of variant.inventory) {
      totalStock += inv.quantity - inv.reserved;
    }
  }

  const primaryImageRaw = product.images[0]?.url || '';
  const primaryImage = convertImageUrl(primaryImageRaw);
  if (!primaryImage || !isGoogleAcceptedImage(primaryImage)) {
    return '';
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

  const customLabel = CAMPAIGN_LABELS[campaignKey] || '';
  if (customLabel) {
    item += `
      <g:custom_label_0>${escapeXml(customLabel)}</g:custom_label_0>`;
  }

  item += `
    </item>`;

  return item;
}

/**
 * Streams a campaign feed for a specific campaign by SKU list
 */
export async function streamCampaignFeed(
  campaignKey: string,
  baseUrl: string,
  res: Response
): Promise<void> {
  const skus = CAMPAIGN_IDS[campaignKey];
  if (!skus || skus.length === 0) {
    throw new Error(`Unknown campaign: ${campaignKey}`);
  }

  const title = CAMPAIGN_TITLES[campaignKey] || 'WBTrade - Kampania';

  // Write XML header
  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Feed kampanijny - ${escapeXml(title)}</description>`);

  // Fetch products by SKU — campaign feeds are small so single query is fine
  const products = await prisma.product.findMany({
    where: {
      sku: { in: skus },
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
  });

  for (const product of products) {
    const xml = buildProductXml(product, baseUrl, campaignKey);
    if (xml) {
      res.write(xml);
    }
  }

  res.write(`
  </channel>
</rss>`);
  res.end();
}

export function getCampaignKeys(): string[] {
  return Object.keys(CAMPAIGN_IDS);
}
