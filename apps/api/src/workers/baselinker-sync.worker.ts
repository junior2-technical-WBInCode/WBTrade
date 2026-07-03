/**
 * Baselinker Sync Worker
 *
 * Handles background synchronization tasks:
 * - Order status sync from Baselinker to our shop (every 15 minutes)
 * - Stock/inventory sync from Baselinker (every 2 hours)
 * - Price sync from Baselinker API (every 2 hours at :30)
 */

import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, queueConnection, getQueue } from '../lib/queue';
import { orderStatusSyncService } from '../services/order-status-sync.service';
import { deliveryTrackingService } from '../services/delivery-tracking.service';
import { BaselinkerService } from '../services/baselinker.service';
import { feedPriceSyncService } from '../services/feed-price-sync.service';

interface OrderStatusSyncJobData {
  timestamp: number;
  hoursBack?: number;
}

interface StockSyncJobData {
  timestamp: number;
  type: 'stock' | 'price';
}

/**
 * Create Baselinker sync worker
 */
export function createBaselinkerSyncWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.BASELINKER_SYNC,
    async (job: Job) => {
      console.log(`[BaselinkerSyncWorker] Processing job ${job.name}:`, job.data);

      switch (job.name) {
        case 'sync-order-statuses':
          return await processOrderStatusSync(job);
        case 'sync-delivery-tracking':
          return await processDeliveryTracking(job);
        case 'sync-stock':
          return await processStockSync(job);
        case 'sync-price':
          return await processPriceSync(job);
        default:
          console.warn(`[BaselinkerSyncWorker] Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    },
    {
      connection: queueConnection,
      concurrency: 1, // Process one at a time
    }
  );

  worker.on('completed', (job) => {
    console.log(`[BaselinkerSyncWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[BaselinkerSyncWorker] Job ${job?.id} failed:`, err);
  });

  console.log('✅ Baselinker sync worker started');
  return worker;
}

/**
 * Process order status synchronization
 */
async function processOrderStatusSync(job: Job<OrderStatusSyncJobData>) {
  const hoursBack = job.data.hoursBack || 6;
  
  console.log(`[BaselinkerSyncWorker] Syncing order statuses (last ${hoursBack} hours)`);
  
  try {
    const result = await orderStatusSyncService.syncOrderStatuses(hoursBack);
    
    console.log(`[BaselinkerSyncWorker] Sync completed: ${result.synced} synced, ${result.skipped} skipped, ${result.errors.length} errors`);
    
    if (result.errors.length > 0) {
      console.warn('[BaselinkerSyncWorker] Errors:', result.errors.slice(0, 5));
    }
    
    return result;
  } catch (error) {
    console.error('[BaselinkerSyncWorker] Sync failed:', error);
    throw error;
  }
}

/**
 * Process delivery tracking synchronization
 * Fetches package/courier status for active orders from Baselinker
 */
async function processDeliveryTracking(job: Job) {
  console.log(`[BaselinkerSyncWorker] Syncing delivery tracking statuses`);
  
  try {
    const result = await deliveryTrackingService.syncDeliveryStatuses();
    
    console.log(`[BaselinkerSyncWorker] Delivery tracking sync completed: ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
    
    if (result.errors.length > 0) {
      console.warn('[BaselinkerSyncWorker] Delivery tracking errors:', result.errors.slice(0, 5));
    }
    
    return result;
  } catch (error) {
    console.error('[BaselinkerSyncWorker] Delivery tracking sync failed:', error);
    throw error;
  }
}

/**
 * Process stock/inventory synchronization from Baselinker
 */
async function processStockSync(job: Job<StockSyncJobData>) {
  console.log(`[BaselinkerSyncWorker] Starting stock sync from Baselinker`);
  
  try {
    const baselinkerService = new BaselinkerService();
    
    // Run stock sync directly (awaited) — ensures log is properly updated
    const result = await baselinkerService.runStockSyncDirect();
    
    console.log(`[BaselinkerSyncWorker] Stock sync finished: ${result.itemsProcessed} processed, ${result.itemsChanged} changed, syncLogId: ${result.syncLogId}`);
    
    return result;
  } catch (error) {
    console.error('[BaselinkerSyncWorker] Stock sync failed:', error);
    throw error;
  }
}

/**
 * Process price synchronization.
 *
 * IMPORTANT: Prices are NOT synced from the Baselinker API anymore (that price-group
 * data is stale/out of sync with the wholesale `purchasePrice` we get from the XML
 * feeds, and mixing the two corrupts retail prices - see incident 2026-07-02 where
 * the old Baselinker sync overwrote a correctly computed DoFirmy price with a stale
 * value, making the B2B price end up higher than the retail price for that item).
 * This job now runs the same XML-feed-based sync used by the manual CLI script,
 * covering all wholesalers (leker, btp, hp, dofirmy, polzoo, hurtownia-kuchenna,
 * hurtownia-sportowa) so `price` and `purchasePrice` always come from the same source.
 */
async function processPriceSync(job: Job) {
  console.log(`[BaselinkerSyncWorker] Starting price sync from wholesaler XML feeds`);

  try {
    const result = await feedPriceSyncService.syncAllWholesalers();

    console.log(`[BaselinkerSyncWorker] Price sync finished: ${result.itemsProcessed} processed, ${result.itemsChanged} changed`);

    return result;
  } catch (error) {
    console.error('[BaselinkerSyncWorker] Price sync failed:', error);
    throw error;
  }
}

/**
 * Schedule recurring order status sync
 * Runs every 15 minutes
 */
export async function scheduleBaselinkerSync(): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.BASELINKER_SYNC);
  
  // Remove existing repeatable jobs first
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'sync-order-statuses' || job.name === 'sync-delivery-tracking' || job.name === 'sync-stock' || job.name === 'sync-price') {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  
  // Add new repeatable job - every 15 minutes for order statuses
  await queue.add(
    'sync-order-statuses',
    { 
      timestamp: Date.now(),
      hoursBack: 6 // Check last 6 hours of orders
    },
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes
      },
      jobId: 'baselinker-order-status-sync',
    }
  );
  
  console.log('✅ Baselinker order status sync scheduled (every 15 minutes)');

  // Add delivery tracking sync job - every 15 minutes (offset by 5 min from status sync)
  await queue.add(
    'sync-delivery-tracking',
    {
      timestamp: Date.now(),
    },
    {
      repeat: {
        pattern: '5/15 * * * *', // Every 15 minutes, offset by 5 min
      },
      jobId: 'baselinker-delivery-tracking-sync',
    }
  );

  console.log('✅ Baselinker delivery tracking sync scheduled (every 15 minutes, +5 offset)');
  
  // Add stock sync job - every 2 hours
  await queue.add(
    'sync-stock',
    { 
      timestamp: Date.now(),
      type: 'stock'
    },
    {
      repeat: {
        pattern: '0 */2 * * *', // Every 2 hours at :00
      },
      jobId: 'baselinker-stock-sync',
    }
  );
  
  console.log('✅ Baselinker stock sync scheduled (every 2 hours)');

  // Add price sync job - every 2 hours at :30 (offset from stock sync).
  // Runs the XML-feed-based sync (see processPriceSync) covering all wholesalers.
  await queue.add(
    'sync-price',
    {
      timestamp: Date.now(),
      type: 'price',
    },
    {
      repeat: {
        pattern: '30 */2 * * *', // Every 2 hours at :30
      },
      jobId: 'baselinker-price-sync',
    }
  );

  console.log('✅ Price sync scheduled from wholesaler XML feeds (every 2 hours at :30)');
}

/**
 * Trigger immediate stock sync (for manual testing or immediate fix)
 */
export async function triggerImmediateStockSync(): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.BASELINKER_SYNC);
  
  const job = await queue.add(
    'sync-stock',
    { 
      timestamp: Date.now(),
      type: 'stock'
    },
    {
      jobId: `immediate-stock-sync-${Date.now()}`,
    }
  );
  
  console.log(`✅ Immediate stock sync triggered, jobId: ${job.id}`);
  return job.id || 'unknown';
}

/**
 * Trigger immediate price sync from Baselinker API (manual button in admin panel)
 */
export async function triggerImmediatePriceSync(): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.BASELINKER_SYNC);

  const job = await queue.add(
    'sync-price',
    {
      timestamp: Date.now(),
      type: 'price',
    },
    {
      jobId: `immediate-price-sync-${Date.now()}`,
    }
  );

  console.log(`✅ Immediate price sync triggered, jobId: ${job.id}`);
  return job.id || 'unknown';
}
