const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p1 = await prisma.product.findFirst({
    where: { sku: 'DOFIRMY-G157-100' },
    select: {
      id: true,
      sku: true,
      barcode: true,
      baselinkerProductId: true,
      name: true,
      price: true
    }
  });
  console.log('DOFIRMY-G157-100 detail:', p1);

  const p2 = await prisma.product.findFirst({
    where: { sku: 'DOFIRMY-5702016914177' },
    select: {
      id: true,
      sku: true,
      barcode: true,
      baselinkerProductId: true,
      name: true,
      price: true
    }
  });
  console.log('DOFIRMY-5702016914177 detail:', p2);

  await prisma.$disconnect();
}

main().catch(console.error);
