import { prisma } from '../db';

async function main() {
  const orderNumbers = ['WB-MQKM21K3-FV00', 'WB-MQKLWNAO-FV00'];

  console.log('=== Badanie zamówień ===');

  for (const num of orderNumbers) {
    const order = await prisma.order.findUnique({
      where: { orderNumber: num },
      include: {
        items: true,
        statusHistory: true,
      }
    });

    if (!order) {
      console.log(`Nie znaleziono zamówienia: ${num}`);
      continue;
    }

    console.log(`\nZamówienie: ${order.orderNumber}`);
    console.log(`ID: ${order.id}`);
    console.log(`Status: ${order.status}`);
    console.log(`Payment Status: ${order.paymentStatus}`);
    console.log(`Payment Method: ${order.paymentMethod}`);
    console.log(`BaseLinker ID: ${order.baselinkerOrderId}`);
    console.log(`Total: ${order.total}`);
    console.log(`User ID: ${order.userId}`);
    console.log(`History count: ${order.statusHistory.length}`);
    for (const h of order.statusHistory) {
      console.log(`  - [${h.createdAt.toISOString()}] Status: ${h.status}, Note: ${h.note}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Błąd:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
