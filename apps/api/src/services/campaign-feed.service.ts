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

// Campaign product IDs per sheet
export const CAMPAIGN_IDS: Record<string, string[]> = {
  caloroczna: ['1004806','1004805','1004813','1007864','202097','5216180','5226849','40024','40025','BDC005','MUGBHP74','TAZ163','A22210','A16620','BH-6410','KB-7623','KH-1615','MX-2173','40076','TAZ111','1031174','5702018035023','5702018034804','5702018067048','5702018067505','5702017416663','44237','CW40579','61442','61487','61527','61561','GUCB154GG','1034281','CRG-40MST-OPL','GUCB15QLPK','GUTB10QLPK','GUCS134GB','CRGHFMIP1663PBLK','ACS10376','BMDCSMADGPK','GUPB5FP4EMGW','GUPBM3ALGSGK','CRGCLRMIP1763PTRS','CRG-PS15W-BLK','8711252525532GREEN','1027538','1033433','1032688','CRG-GNCC35-WHI','1033843','1033842','1033848','1032955','BMCCMUSBCK','USHPV6PUNK','GUBH70E4PTMK','BMWSES20MAMK','FECHMMAK','1016721','FEPB5MNCAK','1034316','2362421','FECBMSMENK','BMBPCO15CAPNBK','BMHMS26L25HSMLKT','BMBP15COCARTCBK','HS-991405','HS-946052','HS-939463','MARE0076','1010637','1010638','1009598','1008743','1010640-1','1008736','HK-KB-7998','5903887801706','5902934831062','FGE0043','FGE0024','1005816','1017283','1024988','1024975','1005842','1017261','1026193','1024914','KH-4198'],
  gastronomia: ['1008172','1031023','1020292','1017407','1005021','1008805','1000808','1000286','1010198','1010169','1010162','1010168','1006011','1025055','1024007','1003219','1000141','1004754','1000167','1000819','1012904','1008039','1005843','1004167','1005853','1004332','1013401','1030595','1030871','1030571','1005039','1008016','1002886','1030951','1026147','1030669','1002812','1004123','1030663','1030662','1026152','1030580','1017065','1005619','1004979','1002060','1025067','1002627','1012959','1016334','1026143','1024701','1003289','1004321','1004314','1004201','1002364','1004113','1001933','1004997','KH-1668','1010329','KH-1667','KH-1672','KH-1724','KH-4075','KB-7295','1001872','1000030','1000035','1005848','1004010','1000715','1024987','KH-1325','1008730','1030886','1030937','1030936','1012831','1030934','1030885','KH-4457','KH-1044','1008376','1005910','1005735','1024939','1005738','1010197'],
  ogrod: ['EVAK01','1008858','1008860','1008862','1009059','1009061','1009129','1011303','1011795','1014066','1014067','1014077','1014493','1014824','1016432','1018825','1018826','1019711','1019713','1019714','1019831','1020904','1020908','1023328','1023402','1025666','1026482','1028033','1032516','5907544439417','SKU:0028','SKU: 0029','SKU: 0033','8711252121604','1017382','73920','1032730','6942138967999','8711252121789','871125223451'],
  sport: ['1024171','1027600','1031986','1004806','1018320','1027400','1033289','1021538','1012017','1032642','1014521','1007859','1015069','1004815-1','1016720','1016722','5901969114812','202097','202099','1031479','1027396','1027344','1028152','1027177','1027530','1031118','1018538','1029268','1016496','1024507','1031119','1028169','1016478','1029266','1024496','1028168','1024466','1028197','1028221','1024537','1024393','1016481','1028167','1028173','1024534','1027441','1024434','MS100','1029269','1027792','1028269','1028272','1028215','1028258','1028174','1024517','1024463','1024454','1028229','1024516','1024442','1026933','1024567','1033230','1033266','1033267','1033249','1033257','1033235','1024531','1027453','1028185','1024523','1024522','1024411','1024491','1027435','1024518','1027003','1024477','1024580','1027425','1000980','HS-946013','HS-893589'],
};

const CAMPAIGN_TITLES: Record<string, string> = {
  caloroczna: 'WBTrade - Kampania Całoroczna',
  gastronomia: 'WBTrade - Kampania Gastronomia',
  ogrod: 'WBTrade - Kampania Ogród i Gospodarstwo',
  sport: 'WBTrade - Kampania Sport i Turystyka',
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
}, baseUrl: string): string {
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
    const xml = buildProductXml(product, baseUrl);
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
