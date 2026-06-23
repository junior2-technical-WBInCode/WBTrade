import { prisma } from '../db';
import { baselinkerOrdersService } from '../services/baselinker-orders.service';

async function main() {
  const orderNumbers = ['WB-MQJ6BYCF-FV00', 'WB-MQJ69HAP-FV00', 'WB-MQJ6FFW5-FV00'];

  console.log('--- Rozpoczynam naprawę 3 zamówień ---');

  for (const num of orderNumbers) {
    const order = await prisma.order.findUnique({
      where: { orderNumber: num },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, baselinkerOrderId: true }
    });

    if (!order) {
      console.log(`Nie znaleziono zamówienia: ${num}`);
      continue;
    }

    console.log(`Znaleziono: ${order.orderNumber} | Status: ${order.status} | Status płatności: ${order.paymentStatus} | Metoda: ${order.paymentMethod}`);

    // Update both paymentStatus and status in DB
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { 
        paymentStatus: 'PAID',
        status: 'CONFIRMED'
      }
    });

    console.log(`  -> Zaktualizowano w DB: status = ${updated.status}, status płatności = ${updated.paymentStatus}`);

    // Add status history entry
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: 'CONFIRMED',
        note: 'Ręczna aktualizacja statusu na OPŁACONE + statusu płatności na PAID w ramach skryptu naprawczego'
      }
    });

    // Synchronize to BaseLinker
    if (updated.baselinkerOrderId) {
      console.log(`  -> Synchronizuję z BaseLinkerem (BL ID: ${updated.baselinkerOrderId})...`);
      const syncResult = await baselinkerOrdersService.markOrderAsPaid(updated.id);
      if (syncResult.success) {
        console.log('  -> BaseLinker zaktualizowany pomyślnie.');
      } else {
        console.log(`  -> Błąd BaseLinkera: ${syncResult.error}`);
      }
    } else {
      console.log('  -> Zamówienie nie ma powiązanego ID BaseLinkera (pomijam sync BL).');
    }
  }

  console.log('--- Koniec skryptu ---');
}

main()
  .catch((err) => {
    console.error('Błąd wykonania skryptu:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
