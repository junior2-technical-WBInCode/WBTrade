import { prisma } from './db';

async function main() {
  const orderNumbers = [
    'WB-MQQBLE49-FV00',
    'WB-MQOWGUX1-FV00',
    'WB-MQOWEIDW-FV00',
    'WB-MQOWCY1Y-FV00',
    'WB-MQKM21K3-FV00'
  ];

  const orders = await prisma.order.findMany({
    where: {
      orderNumber: { in: orderNumbers }
    },
    include: {
      statusHistory: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  for (const o of orders) {
    console.log(`\nOrder: ${o.orderNumber}`);
    console.log(`Status: ${o.status} | Payment: ${o.paymentStatus}`);
    console.log('History:');
    for (const h of o.statusHistory) {
      console.log(`  - [${h.createdAt.toISOString()}] Status: ${h.status} | Created By: ${h.createdBy} | Note: ${h.note}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
