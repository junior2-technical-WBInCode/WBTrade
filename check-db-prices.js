const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Kinghoff: KH-4449 (EAN: 5908287244498)
  const p1 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'HK-KH-4449' },
        { barcode: '5908287244498' }
      ]
    },
    select: { sku: true, barcode: true, price: true, name: true }
  });
  console.log('=== Kinghoff KH-4449 in DB ===', p1);

  // 2. BTP: 10097 (EAN: 6950941460774)
  const p2 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'BTP-10097' },
        { sku: 'BTP-460774' },
        { barcode: '6950941460774' }
      ]
    },
    select: { sku: true, barcode: true, price: true, name: true }
  });
  console.log('=== BTP 10097 in DB ===', p2);

  // 3. DoFirmy: Karton klapowy 200x120x80mm 320g/m2 (code: G157 or ID: 58112)
  const p3 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'DOFIRMY-58112' },
        { sku: { contains: 'G157' } },
        { name: { contains: 'Karton klapowy 200x120x80' } }
      ]
    },
    select: { sku: true, barcode: true, price: true, name: true }
  });
  console.log('=== DoFirmy G157 in DB ===', p3);

  // 4. Leker: STEP2 Stół Wodny z Wieżą Wodną (ID: 7827, EAN: 0733538897490)
  const p4 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'LEKER-7827' },
        { barcode: '0733538897490' }
      ]
    },
    select: { sku: true, barcode: true, price: true, name: true }
  });
  console.log('=== Leker 7827 in DB ===', p4);

  // 5. Polzoo: Dingo Szczypce Do Usuwanie Kleszczy 9,5cm (ID: 11, Producer code / EAN: 5904760167094)
  const p5 = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'POLZOO-11' },
        { barcode: '5904760167094' }
      ]
    },
    select: { sku: true, barcode: true, price: true, name: true }
  });
  console.log('=== Polzoo 11 in DB ===', p5);

  await prisma.$disconnect();
}

main().catch(console.error);
