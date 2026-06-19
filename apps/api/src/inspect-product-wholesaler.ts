import { prisma } from './db';

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'Remiza', mode: 'insensitive' } },
        { sku: { contains: '52012', mode: 'insensitive' } } // in case it is somehow related
      ]
    },
    include: {
      variants: true,
      category: true
    }
  });

  console.log(`Found ${products.length} products:`);
  products.forEach(p => {
    console.log('--- PRODUCT ---');
    console.log('ID:', p.id);
    console.log('SKU:', p.sku);
    console.log('Slug:', p.slug);
    console.log('Name:', p.name);
    console.log('Status:', p.status);
    console.log('Price:', p.price);
    console.log('BaselinkerProductId:', p.baselinkerProductId);
    console.log('Variants:');
    p.variants.forEach(v => {
      console.log(`  * Variant: ID=${v.id}, SKU=${v.sku}, Price=${v.price}, baselinkerVariantId=${v.baselinkerVariantId}`);
    });
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
