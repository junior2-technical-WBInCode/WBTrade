/**
 * BullMQ Queue Configuration
 * Manages background job queues for async operations
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Queue names
export const QUEUE_NAMES = {
  SEARCH_INDEX: 'search-index',
  EMAIL: 'email',
  IMPORT: 'import',
  EXPORT: 'export',
  INVENTORY_SYNC: 'inventory-sync',
  SHIPPING: 'shipping',
  RESERVATION_CLEANUP: 'reservation-cleanup',
  BASELINKER_SYNC: 'baselinker-sync',
  PAYMENT_REMINDER: 'payment-reminder',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Redis connection for BullMQ.
//
// IMPORTANT (2026-07 OOM incident fix): previously this returned a plain options
// object, which BullMQ turns into a *brand new* ioredis connection every time it's
// handed to `new Queue()` / `new Worker()` / `new QueueEvents()`. With 9 queues and
// 7 workers (each worker also opens its own internal blocking connection), that
// added up to 25-30+ separate TCP/TLS connections to Upstash Redis. Combined with
// `enableOfflineQueue: false` (which makes blocking commands like BZPOPMIN throw
// immediately instead of waiting during a reconnect), any transient Upstash
// hiccup caused ALL workers to hit tight, back-off-free error loops simultaneously
// ("Stream isn't writeable and enableOfflineQueue options is false") - this was
// spinning the event loop and leaking memory independently of any specific sync
// job, which is why isolating price/stock sync alone didn't stop the OOM crashes.
//
// Fix: share a single ioredis connection instance across all queues/queue-events
// (BullMQ reuses an ioredis instance as-is instead of creating a new one), and
// allow offline queueing so blocking commands wait/retry gracefully instead of
// failing synchronously. Workers still open one extra internal "blocking" duplicate
// connection each (required by BullMQ for BRPOPLPUSH/BZPOPMIN) - that's unavoidable,
// but this cuts total connections roughly in half and removes the fail-fast loop.
function createSharedQueueConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL;

  const baseOptions = {
    maxRetriesPerRequest: null as null, // Required by BullMQ
    enableOfflineQueue: true, // Let commands (incl. blocking ones) wait during reconnects instead of throwing
    retryStrategy(times: number) {
      // Reconnect with capped exponential backoff instead of hammering Redis
      return Math.min(times * 200, 5000);
    },
  };

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return new IORedis({
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined, // Enable TLS for rediss://
        ...baseOptions,
      });
    } catch (error) {
      console.error('❌ Failed to parse REDIS_URL:', error);
    }
  }

  // Fallback to individual env vars or localhost
  return new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    ...baseOptions,
  });
}

export const queueConnection = createSharedQueueConnection();

queueConnection.on('error', (err) => {
  console.error('❌ BullMQ shared Redis connection error:', err.message);
});

// Queue instances
const queues: Map<string, Queue> = new Map();

// Queue events instances (for monitoring)
const queueEvents: Map<string, QueueEvents> = new Map();

/**
 * Get or create a queue instance
 */
export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, { 
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(name: string): QueueEvents {
  if (!queueEvents.has(name)) {
    const events = new QueueEvents(name, { connection: queueConnection });
    queueEvents.set(name, events);
  }
  return queueEvents.get(name)!;
}

/**
 * Search Index Queue - for Meilisearch operations (lazy)
 */
export function getSearchIndexQueue(): Queue {
  return getQueue(QUEUE_NAMES.SEARCH_INDEX);
}

/**
 * Email Queue - for sending emails (lazy)
 */
export function getEmailQueue(): Queue {
  return getQueue(QUEUE_NAMES.EMAIL);
}

/**
 * Add a job to index a single product
 */
export async function queueProductIndex(productId: string): Promise<void> {
  await getSearchIndexQueue().add('index-product', { productId }, {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
}

/**
 * Add a job to reindex all products
 */
export async function queueFullReindex(): Promise<void> {
  await getSearchIndexQueue().add('reindex-all', {}, {
    removeOnComplete: 10,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });
}

/**
 * Add a job to delete a product from index
 */
export async function queueProductDelete(productId: string): Promise<void> {
  await getSearchIndexQueue().add('delete-product', { productId }, {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
  });
}

// Flag to control whether to use queue or send emails directly
// Set to false when email worker is disabled (e.g., Redis limit exceeded)
const USE_EMAIL_QUEUE = false; // TODO: Set to true when workers are re-enabled

/**
 * Add a job to send an email
 * When USE_EMAIL_QUEUE is false, sends email directly (synchronously)
 */
export async function queueEmail(data: {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}): Promise<void> {
  if (USE_EMAIL_QUEUE) {
    // Use queue when worker is running
    await getEmailQueue().add('send-email', data, {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  } else {
    // Send email directly when worker is disabled
    // Import dynamically to avoid circular dependency
    const { sendEmailDirect } = await import('../workers/email.worker');
    await sendEmailDirect(data);
    console.log(`[Queue] Email sent directly to ${data.to} (worker disabled)`);
  }
}

// ========================================
// Import/Export Queue
// ========================================

export interface ImportJobData {
  type: 'products' | 'inventory' | 'categories';
  fileUrl: string;
  userId: string;
  options?: {
    updateExisting?: boolean;
    skipErrors?: boolean;
  };
}

export interface ExportJobData {
  type: 'products' | 'orders' | 'inventory' | 'customers';
  filters?: Record<string, unknown>;
  format: 'csv' | 'xlsx';
  userId: string;
}

/**
 * Queue a CSV/XLSX import job
 */
export async function queueImport(data: ImportJobData): Promise<string> {
  const job = await getQueue(QUEUE_NAMES.IMPORT).add('import', data, {
    attempts: 1, // Don't retry imports
    removeOnComplete: 50,
    removeOnFail: 20,
  });
  return job.id || '';
}

/**
 * Queue an export job
 */
export async function queueExport(data: ExportJobData): Promise<string> {
  const job = await getQueue(QUEUE_NAMES.EXPORT).add('export', data, {
    attempts: 2,
    removeOnComplete: 50,
    removeOnFail: 20,
  });
  return job.id || '';
}

// ========================================
// Inventory Sync Queue
// ========================================

export interface InventorySyncJobData {
  type: 'sync-all' | 'sync-location' | 'low-stock-check' | 'reservation-cleanup';
  locationId?: string;
}

/**
 * Queue inventory synchronization
 */
export async function queueInventorySync(data: InventorySyncJobData): Promise<void> {
  await getQueue(QUEUE_NAMES.INVENTORY_SYNC).add('inventory-sync', data, {
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

/**
 * Queue low stock check (runs periodically)
 */
export async function queueLowStockCheck(): Promise<void> {
  await getQueue(QUEUE_NAMES.INVENTORY_SYNC).add(
    'low-stock-check',
    { type: 'low-stock-check' },
    {
      attempts: 3,
      removeOnComplete: 100,
    }
  );
}

// ========================================
// Shipping Queue
// ========================================

export interface ShippingJobData {
  type: 'generate-label' | 'track-shipment' | 'notify-delivery';
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
}

/**
 * Queue shipping label generation
 */
export async function queueShippingLabel(orderId: string, carrier: string): Promise<void> {
  await getQueue(QUEUE_NAMES.SHIPPING).add('generate-label', {
    type: 'generate-label',
    orderId,
    carrier,
  }, {
    attempts: 3,
    removeOnComplete: 50,
  });
}

/**
 * Queue shipment tracking update
 */
export async function queueTrackShipment(orderId: string, trackingNumber: string): Promise<void> {
  await getQueue(QUEUE_NAMES.SHIPPING).add('track-shipment', {
    type: 'track-shipment',
    orderId,
    trackingNumber,
  }, {
    attempts: 5,
    removeOnComplete: 100,
  });
}

// ========================================
// Reservation Cleanup Queue
// ========================================

/**
 * Queue expired reservation cleanup
 */
export async function queueReservationCleanup(): Promise<void> {
  await getQueue(QUEUE_NAMES.RESERVATION_CLEANUP).add(
    'cleanup-expired',
    { timestamp: Date.now() },
    {
      attempts: 3,
      removeOnComplete: 50,
    }
  );
}

/**
 * Schedule recurring reservation cleanup (every 5 minutes)
 */
export async function scheduleReservationCleanup(): Promise<void> {
  await getQueue(QUEUE_NAMES.RESERVATION_CLEANUP).add(
    'cleanup-expired',
    { timestamp: Date.now() },
    {
      repeat: {
        every: 5 * 60 * 1000, // 5 minutes
      },
      removeOnComplete: 10,
    }
  );
}

/**
 * Schedule recurring order status sync from Baselinker (every 15 minutes)
 */
export async function scheduleOrderStatusSync(): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.BASELINKER_SYNC);
  await queue.add(
    'sync-order-statuses',
    { timestamp: Date.now(), hoursBack: 6 },
    {
      repeat: {
        every: 15 * 60 * 1000, // 15 minutes
      },
      removeOnComplete: 10,
    }
  );
}

// ========================================
// Queue Management
// ========================================

/**
 * Get all queues for monitoring
 */
export function getAllQueues(): Queue[] {
  return [
    getQueue(QUEUE_NAMES.SEARCH_INDEX),
    getQueue(QUEUE_NAMES.EMAIL),
    getQueue(QUEUE_NAMES.IMPORT),
    getQueue(QUEUE_NAMES.EXPORT),
    getQueue(QUEUE_NAMES.INVENTORY_SYNC),
    getQueue(QUEUE_NAMES.SHIPPING),
    getQueue(QUEUE_NAMES.RESERVATION_CLEANUP),
  ];
}

/**
 * Get queue stats for monitoring
 */
export async function getQueueStats(queueName: string): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(queueName);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    name: queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}

/**
 * Get all queue stats
 */
export async function getAllQueueStats(): Promise<Array<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}>> {
  const stats = await Promise.all(
    Object.values(QUEUE_NAMES).map((name) => getQueueStats(name))
  );
  return stats;
}

/**
 * Close all queue connections (for graceful shutdown)
 */
export async function closeQueues(): Promise<void> {
  // Close queue events first
  for (const events of queueEvents.values()) {
    await events.close();
  }
  queueEvents.clear();

  // Then close queues
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
}

