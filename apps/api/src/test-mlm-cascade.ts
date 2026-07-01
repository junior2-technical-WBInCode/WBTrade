import { prisma } from './db';
import { referralService } from './services/referral.service';
import { saveMlmConfig, DEFAULT_MLM_CONFIG } from './services/mlm-config.service';

async function main() {
  console.log('=== URUCHAMIANIE TESTU SCENARIUSZA MLM KASKADA ===');

  // 1. Sprawdzenie czy istnieje produkt do testów
  const product = await prisma.product.findFirst({
    include: { variants: true },
  });
  if (!product || !product.variants[0]) {
    console.error('Błąd: Brak produktów lub wariantów w bazie do przeprowadzenia testu.');
    return;
  }
  const variant = product.variants[0];

  // 2. Utworzenie testowych użytkowników i partnerów (Michał, Dawid, Janek)
  console.log('Tworzenie testowej struktury Michał -> Dawid -> Janek...');
  
  // Michał (Dziadek)
  const userMichal = await prisma.user.upsert({
    where: { email: 'michal_mlm_test@wb-trade.pl' },
    update: {},
    create: {
      email: 'michal_mlm_test@wb-trade.pl',
      firstName: 'Michał',
      lastName: 'MLM',
    },
  });

  const partnerMichal = await prisma.partnerProfile.upsert({
    where: { userId: userMichal.id },
    update: { status: 'APPROVED', commissionRate: 5.00 },
    create: {
      userId: userMichal.id,
      referralCode: 'MICHAL-MLM',
      status: 'APPROVED',
      commissionRate: 5.00,
    },
  });

  // Dawid (Rodzic)
  const userDawid = await prisma.user.upsert({
    where: { email: 'dawid_mlm_test@wb-trade.pl' },
    update: {},
    create: {
      email: 'dawid_mlm_test@wb-trade.pl',
      firstName: 'Dawid',
      lastName: 'MLM',
    },
  });

  const partnerDawid = await prisma.partnerProfile.upsert({
    where: { userId: userDawid.id },
    update: { status: 'APPROVED', parentPartnerId: partnerMichal.id, commissionRate: 5.00 },
    create: {
      userId: userDawid.id,
      referralCode: 'DAWID-MLM',
      status: 'APPROVED',
      parentPartnerId: partnerMichal.id,
      commissionRate: 5.00,
    },
  });

  // Janek (Sprzedawca)
  const userJanek = await prisma.user.upsert({
    where: { email: 'janek_mlm_test@wb-trade.pl' },
    update: {},
    create: {
      email: 'janek_mlm_test@wb-trade.pl',
      firstName: 'Janek',
      lastName: 'MLM',
    },
  });

  const partnerJanek = await prisma.partnerProfile.upsert({
    where: { userId: userJanek.id },
    update: { status: 'APPROVED', parentPartnerId: partnerDawid.id, commissionRate: 5.00 },
    create: {
      userId: userJanek.id,
      referralCode: 'JANEK-MLM',
      status: 'APPROVED',
      parentPartnerId: partnerDawid.id,
      commissionRate: 5.00,
    },
  });

  // 3. Konfiguracja MLM: włączony, maxDepth=2, kaskada, stawki [10, 5]
  console.log('Konfigurowanie ustawień MLM w bazie...');
  await saveMlmConfig({
    enabled: true,
    maxDepth: 2,
    overrideBase: 'downline_commission',
    overrideRatesPct: [10, 5],
    stopOnInactiveUpline: true,
  });

  // 4. Utworzenie reflinku dla Janka
  const linkJanek = await prisma.referralLink.upsert({
    where: { code: 'JANEK-REFLINK' },
    update: { partnerId: partnerJanek.id },
    create: {
      partnerId: partnerJanek.id,
      code: 'JANEK-REFLINK',
    },
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 5. Utworzenie zamówienia o wartości subtotal = 100.00 PLN
      const testOrder = await tx.order.create({
        data: {
          orderNumber: `TEST-MLM-REAL-${Date.now()}`,
          shippingMethod: 'Paczkomat',
          paymentMethod: 'blik',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          subtotal: 100.00,
          discount: 0,
          shipping: 0,
          tax: 0,
          total: 100.00,
          items: {
            create: {
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name || '',
              sku: variant.sku,
              quantity: 1,
              unitPrice: 100.00,
              total: 100.00,
            },
          },
        },
        include: { items: true },
      });

      console.log(`Utworzono zamówienie w transakcji: ${testOrder.orderNumber}`);

      // 6. Atrybucja zamówienia przez link partnerski Janka
      console.log('Uruchamianie atrybucji prowizji...');
      await referralService.attributeOrder(
        tx,
        testOrder,
        {
          lastClick: 'JANEK-REFLINK',
          touched: ['JANEK-REFLINK'],
        },
        {
          email: 'kupujacy_mlm@wb-trade.pl',
          ip: '9.9.9.9',
        }
      );

      // 7. Pobranie prowizji bezpośredniej Janka
      const referral = await tx.referral.findUnique({
        where: { orderId: testOrder.id },
      });
      if (!referral) {
        throw new Error('Błąd: Nie utworzono prowizji bezpośredniej Referral.');
      }

      // 8. Pobranie nadprowizji MLM (ReferralOverride)
      const overrides = await tx.referralOverride.findMany({
        where: { referralId: referral.id },
        orderBy: { level: 'asc' },
      });

      return { order: testOrder, referral, overrides };
    });

    console.log('\n=== WYNIK TESTU SCENARIUSZA MLM KASKADA ===');
    console.log(`Zamówienie: ${result.order.orderNumber} (wartość: ${result.order.subtotal} PLN)`);
    console.log(`Prowizja Janka (Poziom 0): ${result.referral.primaryCommission} PLN (status: ${result.referral.status})`);
    
    result.overrides.forEach((ov) => {
      let partnerName = 'Nieznany';
      if (ov.beneficiaryId === partnerDawid.id) partnerName = 'Dawid (L1 - Rodzic)';
      if (ov.beneficiaryId === partnerMichal.id) partnerName = 'Michał (L2 - Dziadek)';
      console.log(`Nadprowizja MLM dla ${partnerName}: ${ov.amount} PLN (status: ${ov.status})`);
    });

    // Weryfikacja wartości matematycznych
    // Prowizja Janka = 5.00 PLN (5% z 100.00 PLN)
    // Dawid = 10% z 5.00 PLN = 0.50 PLN
    // Michał = 5% z 0.50 PLN = 0.025 PLN (zaokrąglone do 0.03 PLN)
    console.log('\nOczekiwane wartości w kaskadzie:');
    console.log('  - Janek: 5.00 PLN');
    console.log('  - Dawid: 0.50 PLN');
    console.log('  - Michał: 0.03 PLN');

    const janekOk = Number(result.referral.primaryCommission) === 5.00;
    const dawidOk = Number(result.overrides.find(o => o.beneficiaryId === partnerDawid.id)?.amount) === 0.50;
    const michalOk = Number(result.overrides.find(o => o.beneficiaryId === partnerMichal.id)?.amount) === 0.03;

    if (janekOk && dawidOk && michalOk) {
      console.log('\n✅ TEST ZALICZONY SUKCESEM! Kaskada MLM działa perfekcyjnie i zaokrągla poprawnie.');
    } else {
      console.error('\n❌ BŁĄD TESTU: Otrzymane kwoty nie zgadzają się z oczekiwanymi.');
    }

  } catch (err: any) {
    console.error('Błąd podczas testu MLM:', err.message || err);
  } finally {
    // 9. Przywrócenie konfiguracji MLM do domyślnej (wyłączonej) i posprzątanie testowych danych reflinku
    console.log('\nCzyszczenie środowiska testowego...');
    await saveMlmConfig(DEFAULT_MLM_CONFIG);
    await prisma.referralLink.delete({ where: { code: 'JANEK-REFLINK' } }).catch(() => {});
    console.log('Środowisko przywrócone do stanu początkowego (MLM wyłączony).');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
