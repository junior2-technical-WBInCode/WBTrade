const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    take: 100,
    where: {
      status: 'ACTIVE'
    },
    select: {
      sku: true,
      barcode: true,
      baselinkerProductId: true,
      name: true
    }
  });
  
  // Find products that might be HP
  const hpProducts = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { startsWith: 'hp-' } },
        { sku: { startsWith: 'HP-' } },
        { baselinkerProductId: { startsWith: 'hp-' } },
        { baselinkerProductId: { startsWith: 'hp_' } }
      ]
    },
    take: 10,
    select: {
      sku: true,
      barcode: true,
      baselinkerProductId: true,
      name: true
    }
  });
  console.log('=== HP prefix search ===', hpProducts);

  // Let's count products by baselinkerProductId prefixes
  const allProducts = await prisma.product.findMany({
    select: {
      baselinkerProductId: true
    }
  });

  const prefixes = {};
  for (const p of allProducts) {
    if (p.baselinkerProductId) {
      const parts = p.baselinkerProductId.split('-');
      const pref = parts[0] ? parts[0] + '-' : 'none';
      prefixes[pref] = (prefixes[pref] || 0) + 1;
    } else {
      prefixes['null'] = (prefixes['null'] || 0) + 1;
    }
  }
  console.log('\n=== baselinkerProductId Prefixes count ===');
  console.log(prefixes);

  await prisma.$disconnect();
}

main().catch(console.error);
