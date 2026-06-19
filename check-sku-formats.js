const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFormat(prefix, name) {
  console.log(`\n=== Sample ${name} (prefix: ${prefix}) ===`);
  const products = await prisma.product.findMany({
    where: {
      sku: { startsWith: prefix }
    },
    take: 5,
    select: {
      sku: true,
      barcode: true,
      name: true,
      price: true
    }
  });
  console.log(products);
}

async function main() {
  await checkFormat('LEKER-', 'Leker');
  await checkFormat('BTP-', 'BTP');
  await checkFormat('HP-', 'HP');
  await checkFormat('DOFIRMY-', 'DoFirmy');
  await checkFormat('HK-', 'Hurtownia Kuchenna');
  await checkFormat('POLZOO-', 'PolZoo');
  
  // Let's also check if there's any product with SKU starting with just letters or other formats
  const others = await prisma.product.findMany({
    where: {
      NOT: [
        { sku: { startsWith: 'LEKER-' } },
        { sku: { startsWith: 'BTP-' } },
        { sku: { startsWith: 'HP-' } },
        { sku: { startsWith: 'DOFIRMY-' } },
        { sku: { startsWith: 'HK-' } },
        { sku: { startsWith: 'POLZOO-' } },
        { sku: { startsWith: 'KX' } } // KX is typically main/ikonka
      ]
    },
    take: 10,
    select: {
      sku: true,
      barcode: true,
      name: true
    }
  });
  console.log('\n=== Other SKUs (not matching standard prefixes) ===');
  console.log(others);

  await prisma.$disconnect();
}

main().catch(console.error);
