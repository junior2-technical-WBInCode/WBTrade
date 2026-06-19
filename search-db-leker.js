const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p1 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'LEKER-14519' },
        { sku: 'LEKER-50538N' }, // Kod_producenta for 14519
        { barcode: '6934510505387' }, // EAN for 14519
        { sku: '14519' }
      ]
    },
    select: { sku: true, barcode: true, name: true, baselinkerProductId: true }
  });
  console.log('Result for 14519:', p1);

  const p2 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'LEKER-7827' },
        { sku: 'LEKER-897400' }, // Kod_producenta for 7827
        { barcode: '0733538897490' }, // EAN for 7827
        { sku: '7827' },
        { sku: '897400' }
      ]
    },
    select: { sku: true, barcode: true, name: true, baselinkerProductId: true }
  });
  console.log('Result for 7827:', p2);

  await prisma.$disconnect();
}

main().catch(console.error);
