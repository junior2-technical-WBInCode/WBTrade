/**
 * Standalone CLI entry point for Baselinker stock synchronization.
 *
 * Exists so the BullMQ worker (see workers/baselinker-sync.worker.ts) can run
 * this heavy, bulk-DB-loading operation in an isolated, memory-capped child
 * process instead of in the main API process - mirrors the same fix already
 * applied to sync-feed-prices.ts (2026-07 OOM incident).
 */
import { prisma } from '../db';
import { BaselinkerService } from '../services/baselinker.service';

async function main() {
  console.log('=== Starting isolated stock sync process ===');

  const baselinkerService = new BaselinkerService();
  const result = await baselinkerService.runStockSyncDirect();

  console.log(`Stock sync finished: ${result.itemsProcessed} processed, ${result.itemsChanged} changed, syncLogId: ${result.syncLogId}, success: ${result.success}`);

  await prisma.$disconnect();
  process.exit(result.success ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Fatal error in stock sync process:', err);
  await prisma.$disconnect();
  process.exit(1);
});
