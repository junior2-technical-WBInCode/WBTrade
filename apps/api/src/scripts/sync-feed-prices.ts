import { feedPriceSyncService, FEED_URLS } from '../services/feed-price-sync.service';
import { prisma } from '../db';

async function main() {
  console.log('==================================================');
  console.log('🤖 SYNC CEN Z FEEDÓW HURTOWNI DETALICZNYCH');
  console.log('==================================================');

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArgIdx = args.indexOf('--limit');
  const limit = limitArgIdx !== -1 ? parseInt(args[limitArgIdx + 1], 10) || 0 : 0;
  
  const wholesalerArgIdx = args.indexOf('--wholesaler');
  const targetWholesaler = wholesalerArgIdx !== -1 ? args[wholesalerArgIdx + 1] : null;

  if (dryRun) {
    console.log('👉 MODE: DRY RUN (nic nie zostanie zapisane w bazie)');
  }
  if (limit > 0) {
    console.log(`👉 LIMIT: ${limit} produktów na hurtownię`);
  }

  const wholesalersToSync = targetWholesaler 
    ? [targetWholesaler.toLowerCase()] 
    : Object.keys(FEED_URLS);

  // Validate target wholesaler keys
  for (const key of wholesalersToSync) {
    if (!FEED_URLS[key]) {
      console.error(`Błąd: Nieznana hurtownia "${key}". Dostępne: ${Object.keys(FEED_URLS).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Hurtownie do przetworzenia: ${wholesalersToSync.join(', ')}`);
  console.log('');

  const summary: Record<string, any> = {};

  for (const key of wholesalersToSync) {
    const feedUrl = FEED_URLS[key];
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing wholesaler: ${key.toUpperCase()}`);
    console.log(`--------------------------------------------------`);
    
    try {
      const result = await feedPriceSyncService.syncWholesaler({
        wholesalerKey: key,
        feedUrlOrPath: feedUrl,
        limit,
        dryRun,
      });
      
      summary[key] = result;
      console.log(`\nWynik dla ${key.toUpperCase()}:`);
      console.log(`  Sprawdzone produkty: ${result.processed}`);
      console.log(`  Dopasowane w feedzie: ${result.matched}`);
      console.log(`  Zaktualizowane ceny: ${result.updated}`);
      console.log(`  Pominięte (brak w feedzie): ${result.skipped}`);
      console.log(`  Błędy: ${result.errors.length}`);
      if (result.errors.length > 0) {
        console.log(`  Przykładowe błędy:`);
        result.errors.slice(0, 5).forEach(e => console.log(`    - ${e}`));
      }
    } catch (err: any) {
      console.error(`Błąd krytyczny podczas sync ${key}:`, err.message);
      summary[key] = { fatalError: err.message };
    }
  }

  console.log('\n==================================================');
  console.log('🏁 PODSUMOWANIE SYNCHRONIZACJI');
  console.log('==================================================');
  
  Object.entries(summary).forEach(([key, res]) => {
    if (res.fatalError) {
      console.log(`${key.toUpperCase()}: BŁĄD KRYTYCZNY - ${res.fatalError}`);
    } else {
      console.log(`${key.toUpperCase()}: sprawdzone=${res.processed}, dopasowane=${res.matched}, zaktualizowane=${res.updated}, pominięte=${res.skipped}, błędy=${res.errors.length}`);
    }
  });

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Błąd krytyczny skryptu:', err);
  await prisma.$disconnect();
  process.exit(1);
});
