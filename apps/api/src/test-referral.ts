import { prisma } from './db';
import { referralService } from './services/referral.service';

async function main() {
  const refCode = '0JZB5GQO';
  const productSlug = 'uchwyt-scienny-wiszacy-do-segregacji-smieci-2-kolory-worki-120l';

  console.log('=== ZAPISYWANIE TESTOWEJ PROWIZJI DO BAZY ===');

  // 1. Sprawdzenie partnera i linku
  const link = await prisma.referralLink.findUnique({
    where: { code: refCode },
    include: {
      partner: {
        include: {
          user: { select: { email: true, lastLoginIp: true } }
        }
      }
    }
  });

  if (!link) {
    console.log(`Błąd: Kod partnerski ${refCode} nie istnieje w bazie.`);
    return;
  }

  // 2. Sprawdzenie produktu i wariantu
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    include: { variants: true }
  });

  if (!product) {
    console.log(`Błąd: Produkt z przyjaznym URL (slug): ${productSlug} nie istnieje w bazie.`);
    return;
  }

  const variant = product.variants[0];
  if (!variant) {
    console.log('Błąd: Brak wariantów produktu.');
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Utworzenie prawdziwego zamówienia testowego (nie zostanie wysłane do Baselinkera)
      const testOrder = await tx.order.create({
        data: {
          orderNumber: `TEST-REF-REAL-${Date.now()}`,
          shippingMethod: 'Courier',
          paymentMethod: 'blik',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          subtotal: product.price,
          discount: 0,
          shipping: 15.00,
          tax: 0,
          total: Number(product.price) + 15.00,
          items: {
            create: {
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku,
              quantity: 1,
              unitPrice: product.price,
              total: product.price,
            }
          }
        },
        include: {
          items: true
        }
      });

      console.log(`Utworzono zamówienie w bazie: ${testOrder.orderNumber}`);

      // 2. Wywołanie atrybucji prowizji
      console.log('Wywołanie referralService.attributeOrder...');
      // Używamy danych kupującego innych niż partner, aby uniknąć wykrycia self-referrala (antifraud)
      await referralService.attributeOrder(
        tx,
        testOrder,
        {
          lastClick: refCode,
          touched: [refCode]
        },
        {
          userId: 'cmk760k9a0002apwp8of8274d', // dummy user id
          email: 'testowy_klient@wb-trade.pl',
          nip: '1234567890',
          ip: '8.8.8.8'
        }
      );

      // 3. Odczytanie i zaktualizowanie rekordu Referral na APPROVED (zatwierdzona, gotowa do wypłaty)
      const referral = await tx.referral.findUnique({
        where: { orderId: testOrder.id }
      });

      if (!referral) {
        throw new Error('Błąd: Nie utworzono prowizji (prawdopodobnie zadziałał anty-fraud). Sprawdź logi.');
      }

      const updatedReferral = await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          paidAt: new Date(),
        },
        include: {
          items: true
        }
      });

      return { order: testOrder, referral: updatedReferral };
    });

    console.log('\n=== WYNIK OPERACJI ===');
    console.log('Prowizja została zapisana i zatwierdzona!');
    console.log({
      orderNumber: result.order.orderNumber,
      referralId: result.referral.id,
      status: result.referral.status,
      commissionAmount: result.referral.primaryCommission.toString(),
      approvedAt: result.referral.approvedAt,
    });
    console.log('\nProwizja powinna być teraz widoczna w statystykach panelu partnerskiego.');

  } catch (err: any) {
    console.error('Błąd podczas zapisywania prowizji do bazy:', err.message || err);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
