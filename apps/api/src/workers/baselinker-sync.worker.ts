/**
 * Baselinker Sync Worker
 *
 * Handles background synchronization tasks:
 * - Order status sync from Baselinker to our shop (every 15 minutes)
 * - Stock/inventory sync from Baselinker (every 2 hours)
 * - Price sync from Baselinker API (every 2 hours at :30)
 */

import { Worker, Job } from 'bullmq';
import { fork } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { QUEUE_NAMES, queueConnection, getQueue } from '../lib/queue';
import { orderStatusSyncService } from '../services/order-status-sync.service';
import { deliveryTrackingService } from '../services/delivery-tracking.service';
import { BaselinkerService } from '../services/baselinker.service';
import { feedPriceSyncService, FEED_URLS } from '../services/feed-price-sync.service';

// The XML feed price sync downloads and fully parses several large XML files
// (30-60 MB each) plus loads tens of thousands of DB rows into memory per
// wholesaler. Doing this in-process repeatedly was causing the whole API to be
// OOM-killed by Render (2026-07 incident: crash loop every ~5-7 minutes).
// To fix this without rewriting the parsing logic, each wholesaler is now synced
// in its own short-lived child process with a capped V8 heap. If a wholesaler's
// feed is huge enough to OOM, only that disposable child process dies - the main
// API process (and Redis/BullMQ connections) stay alive. This is slower (Node +
// Prisma client boot per wholesaler) but much more resilient.
const PRICE_SYNC_CHILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'sync-feed-prices.js');
const PRICE_SYNC_CHILD_MAX_OLD_SPACE_MB = 768; // keep well under Render's instance memory limit
const PRICE_SYNC_CHILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per wholesaler

// Same isolation applied to stock sync: it also bulk-loads products/variants/orders
// and calls the Baselinker API for potentially thousands of stock entries per
// inventory, and (like price sync) can be immediately redelivered as a "stalled"
// BullMQ job the moment the worker restarts after a crash - regardless of its
// cron schedule. Running it in a capped child process prevents that redelivery
// from OOM-killing the main API process again.
const STOCK_SYNC_CHILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'sync-stock.js');
const STOCK_SYNC_CHILD_MAX_OLD_SPACE_MB = 768;
const STOCK_SYNC_CHILD_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes, stock sync covers all inventories at once

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

  const useChildProcess = fs.existsSync(STOCK_SYNC_CHILD_SCRIPT);

  if (!useChildProcess) {
    console.warn('[BaselinkerSyncWorker] Compiled sync-stock.js not found, running stock sync in-process (dev fallback)');
    try {
      const baselinkerService = new BaselinkerService();
      const result = await baselinkerService.runStockSyncDirect();
      console.log(`[BaselinkerSyncWorker] Stock sync finished: ${result.itemsProcessed} processed, ${result.itemsChanged} changed, syncLogId: ${result.syncLogId}`);
      return result;
    } catch (error) {
      console.error('[BaselinkerSyncWorker] Stock sync failed:', error);
      throw error;
    }
  }

  console.log('[BaselinkerSyncWorker] Spawning isolated process for stock sync');
  const result = await runScriptInChildProcess(STOCK_SYNC_CHILD_SCRIPT, [], STOCK_SYNC_CHILD_MAX_OLD_SPACE_MB, STOCK_SYNC_CHILD_TIMEOUT_MS);

  if (result.success) {
    console.log('[BaselinkerSyncWorker] Stock sync completed successfully');
  } else {
    console.error(`[BaselinkerSyncWorker] Stock sync failed: ${result.error}`);
    throw new Error(`Stock sync child process failed: ${result.error}`);
  }

  return result;
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

  const wholesalers = Object.keys(FEED_URLS);
  const results: Record<string, { success: boolean; error?: string }> = {};

  // Only use the isolated child-process path when the compiled script exists
  // (i.e. in production, `node dist/app.js`). In local dev (ts-node-dev running
  // src directly) dist/ may not be built yet, so fall back to the old in-process
  // behavior - dev machines aren't the ones hitting Render's memory limit.
  const useChildProcess = fs.existsSync(PRICE_SYNC_CHILD_SCRIPT);

  if (!useChildProcess) {
    console.warn('[BaselinkerSyncWorker] Compiled sync-feed-prices.js not found, running price sync in-process (dev fallback)');
    try {
      const result = await feedPriceSyncService.syncAllWholesalers();
      console.log(`[BaselinkerSyncWorker] Price sync finished: ${result.itemsProcessed} processed, ${result.itemsChanged} changed`);
      return result;
    } catch (error) {
      console.error('[BaselinkerSyncWorker] Price sync failed:', error);
      throw error;
    }
  }

  for (const key of wholesalers) {
    console.log(`[BaselinkerSyncWorker] Spawning isolated process for wholesaler: ${key}`);
    const result = await runScriptInChildProcess(PRICE_SYNC_CHILD_SCRIPT, ['--wholesaler', key], PRICE_SYNC_CHILD_MAX_OLD_SPACE_MB, PRICE_SYNC_CHILD_TIMEOUT_MS);
    results[key] = result;
    if (result.success) {
      console.log(`[BaselinkerSyncWorker] Price sync for "${key}" completed successfully`);
    } else {
      console.error(`[BaselinkerSyncWorker] Price sync for "${key}" failed: ${result.error}`);
    }
  }

  const failedWholesalers = Object.entries(results).filter(([, r]) => !r.success).map(([key]) => key);
  console.log(`[BaselinkerSyncWorker] Price sync finished: ${wholesalers.length - failedWholesalers.length}/${wholesalers.length} wholesalers synced successfully`);
  if (failedWholesalers.length > 0) {
    console.warn(`[BaselinkerSyncWorker] Failed wholesalers: ${failedWholesalers.join(', ')}`);
  }

  return { wholesalers: results };
}

/**
 * Runs a compiled script in its own child process with a capped V8 heap, so a
 * memory-heavy job (large XML feed parsing, bulk DB/API loads) can't OOM-kill
 * the main API process. Used by both price sync (per-wholesaler) and stock sync.
 */
function runScriptInChildProcess(
  scriptPath: string,
  args: string[],
  maxOldSpaceMb: number,
  timeoutMs: number
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = fork(scriptPath, args, {
      execArgv: [`--max-old-space-size=${maxOldSpaceMb}`],
      env: process.env,
      silent: false, // inherit stdout/stderr so logs still show up in Render's log stream
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`[BaselinkerSyncWorker] Child process for "${scriptPath}" timed out after ${timeoutMs / 1000}s, killing it`);
      child.kill('SIGKILL');
      resolve({ success: false, error: 'timeout' });
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `exit code ${code}${signal ? `, signal ${signal}` : ''}` });
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
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
