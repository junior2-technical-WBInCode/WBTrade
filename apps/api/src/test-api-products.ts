import { prisma } from './db';
import { carouselService } from './services/carousel.service';
import { productsService } from './services/products.service';

async function main() {
  console.log('--- Checking carousels in DB ---');
  const carousels = await prisma.settings.findUnique({
    where: { key: 'homepage_carousels' },
  });
  console.log('Homepage carousels config:', JSON.stringify(carousels, null, 2));

  // Let's get products for 'bestsellers' or 'featured' carousel
  const carouselDbList = await (prisma as any).carousel.findMany();
  console.log('Carousels in Carousel table:', carouselDbList.map((c: any) => ({ id: c.id, slug: c.slug, mode: c.mode })));

  for (const c of carouselDbList) {
    console.log(`\nProducts for carousel: ${c.slug}`);
    const products = await carouselService.getProducts(c.slug);
    console.log(`Count: ${products.length}`);
    if (products.length > 0) {
      const p = products[0];
      console.log('First product sample keys:', Object.keys(p));
      console.log('First product details:', {
        id: p.id,
        name: p.name,
        sku: p.sku,
        baselinkerProductId: p.baselinkerProductId,
        tags: p.tags,
        price: p.price,
        isB2bPrice: p.isB2bPrice,
        variantsCount: p.variants?.length,
        firstVariantSku: p.variants?.[0]?.sku,
      });
    }
  }

  console.log('\n--- Checking products from getAll ---');
  const listResult = await productsService.getAll({ limit: 1 });
  if (listResult.products.length > 0) {
    const p = listResult.products[0];
    console.log('getAll product details:', {
      id: p.id,
      name: p.name,
      sku: p.sku,
      baselinkerProductId: p.baselinkerProductId,
      tags: p.tags,
      price: p.price,
      isB2bPrice: p.isB2bPrice,
      variantsCount: p.variants?.length,
      firstVariantSku: p.variants?.[0]?.sku,
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
