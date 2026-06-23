const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const wholesalers = await prisma.wholesaler.findMany();
  console.log("=== Wholesalers in Database ===");
  console.log(JSON.stringify(wholesalers, null, 2));
  
  // Also count total products by wholesaler prefix (we can check startsWith on sku)
  const products = await prisma.product.groupBy({
    by: ['status'],
    _count: {
      id: true
    }
  });
  console.log("\n=== Product statuses in Database ===");
  console.log(products);

  const sampleSkus = await prisma.product.findMany({
    take: 20,
    select: {
      sku: true,
      barcode: true,
      name: true
    }
  });
  console.log("\n=== Sample SKUs, Barcodes, Names ===");
  console.log(sampleSkus);

  await prisma.$disconnect();
}

main().catch(console.error);
