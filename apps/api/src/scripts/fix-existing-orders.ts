import { prisma } from '../db';
import { baselinkerOrdersService } from '../services/baselinker-orders.service';

async function main() {
  const orderNumbers = ['WB-MPXRYD32-FV00', 'WB-MPXRXGE4-FV00', 'WB-MPWNPAX8-FV00'];

  console.log('--- Rozpoczynam naprawę 3 zamówień ---');

  for (const num of orderNumbers) {
    const order = await prisma.order.findUnique({
      where: { orderNumber: num },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true }
    });

    if (!order) {
      console.log(`Nie znaleziono zamówienia: ${num}`);
      continue;
    }

    console.log(`Znaleziono: ${order.orderNumber} | Status: ${order.status} | Status płatności: ${order.paymentStatus} | Metoda: ${order.paymentMethod}`);

    if (order.paymentStatus !== 'PAID') {
      // 1. Aktualizacja w bazie danych
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID' }
      });

      console.log(`  -> Zaktualizowano w DB: status płatności = ${updated.paymentStatus}`);

      // 2. Dodanie do historii statusów
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          note: 'Ręczna aktualizacja statusu płatności na OPŁACONE w ramach skryptu naprawczego'
        }
      });

      // 3. Synchronizacja do BaseLinkera
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
    } else {
      console.log('  -> Zamówienie jest już oznaczone jako PAID w DB.');
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
