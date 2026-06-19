/**
 * Inventory Sync Worker
 * Handles inventory synchronization, low stock alerts, and reservation cleanup
 */

import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, queueConnection, queueEmail } from '../lib/queue';
import { prisma } from '../db';
import { invalidateInventoryCache } from '../lib/cache';
import { PaymentStatus, StockMovementType } from '@prisma/client';

interface InventorySyncJobData {
  type: 'sync-all' | 'sync-location' | 'low-stock-check' | 'reservation-cleanup';
  locationId?: string;
  timestamp?: number;
}

// Reservation timeout in minutes
const RESERVATION_TIMEOUT_MINUTES = 15;

// Payment timeout - longer than reservation (user may need time to complete payment)
const PAYMENT_TIMEOUT_MINUTES = 60; // 1 hour for pending payments
const FAILED_PAYMENT_CLEANUP_MINUTES = 30; // 30 minutes for failed payments

/**
 * Check for low stock items and send alerts
 */
async function checkLowStock(): Promise<{ alertsSent: number; itemsFound: number }> {
  // Find items below minimum threshold
  const lowStockItems = await prisma.inventory.findMany({
    where: {
      quantity: {
        lte: prisma.inventory.fields.minimum,
      },
    },
    include: {
      variant: {
        include: {
          product: true,
        },
      },
      location: true,
    },
  });

  let alertsSent = 0;

  // Group by product for consolidated alerts
  const productAlerts: Map<string, typeof lowStockItems> = new Map();
  
  for (const item of lowStockItems) {
    const productId = item.variant.productId;
    if (!productAlerts.has(productId)) {
      productAlerts.set(productId, []);
    }
    productAlerts.get(productId)!.push(item);
  }

  // Send alerts (in production, would send to admin emails)
  for (const [productId, items] of productAlerts) {
    const firstItem = items[0];
    const product = firstItem.variant.product;
    
    console.log(`[InventoryWorker] Low stock alert: ${product.name}`);
    console.log(`  SKU: ${firstItem.variant.sku}`);
    console.log(`  Stock: ${firstItem.quantity}, Minimum: ${firstItem.minimum}`);
    
    // Queue email notification (to admin)
    try {
      await queueEmail({
        to: process.env.ADMIN_EMAIL || 'admin@wbtrade.pl',
        subject: `Niski stan magazynowy - ${product.name}`,
        template: 'low-stock-alert',
        context: {
          productName: product.name,
          sku: firstItem.variant.sku,
          currentStock: firstItem.quantity,
          minimumStock: firstItem.minimum,
          locations: items.map(i => ({
            name: i.location.name,
            quantity: i.quantity,
          })),
        },
      });
      alertsSent++;
    } catch (error) {
      console.error('[InventoryWorker] Failed to queue low stock email:', error);
    }
  }

  return {
    alertsSent,
    itemsFound: lowStockItems.length,
  };
}

/**
 * Cleanup expired reservations
 * Reservations older than RESERVATION_TIMEOUT_MINUTES are released
 */
async function cleanupExpiredReservations(): Promise<{ released: number; failedPaymentsCleaned: number }> {
  const reservationTimeoutDate = new Date();
  reservationTimeoutDate.setMinutes(reservationTimeoutDate.getMinutes() - RESERVATION_TIMEOUT_MINUTES);

  const paymentTimeoutDate = new Date();
  paymentTimeoutDate.setMinutes(paymentTimeoutDate.getMinutes() - PAYMENT_TIMEOUT_MINUTES);

  const failedPaymentTimeoutDate = new Date();
  failedPaymentTimeoutDate.setMinutes(failedPaymentTimeoutDate.getMinutes() - FAILED_PAYMENT_CLEANUP_MINUTES);

  // Find orders that need cleanup:
  // 1. PENDING/OPEN orders older than payment timeout
  // 2. Orders with FAILED payment status older than failed payment timeout
  const expiredOrders = await prisma.order.findMany({
    where: {
      OR: [
        // Old PENDING orders without payment
        {
          status: 'PENDING',
          createdAt: { lt: reservationTimeoutDate },
        },
        // Old OPEN orders (new payment flow) without payment
        {
          status: 'OPEN',
          paymentStatus: 'PENDING',
          createdAt: { lt: paymentTimeoutDate },
        },
        // Orders with failed payment - cleanup after shorter period
        {
          paymentStatus: 'FAILED',
          createdAt: { lt: failedPaymentTimeoutDate },
          status: { in: ['OPEN', 'PENDING'] },
        },
        // Orders with awaiting confirmation that timed out
        {
          paymentStatus: PaymentStatus.AWAITING_CONFIRMATION,
          createdAt: { lt: paymentTimeoutDate },
          status: { in: ['OPEN', 'PENDING'] },
        },
      ],
    },
    include: {
      items: {
        include: {
          variant: true,
        },
      },
    },
  });

  let released = 0;
  let failedPaymentsCleaned = 0;

  for (const order of expiredOrders) {
    try {
      const isFailedPayment = order.paymentStatus === PaymentStatus.FAILED;
      const reasonNote = isFailedPayment
        ? 'Zamówienie anulowane - płatność nieudana'
        : order.paymentStatus === PaymentStatus.AWAITING_CONFIRMATION
        ? 'Zamówienie anulowane - płatność nie została potwierdzona w wymaganym czasie'
        : 'Zamówienie anulowane - przekroczono czas na płatność';

      await prisma.$transaction(async (tx) => {
        // Release reservations for each item
        for (const item of order.items) {
          // Find the reserve movement to identify the correct warehouse location
          const reserveMovement = await tx.stockMovement.findFirst({
            where: {
              variantId: item.variantId,
              type: StockMovementType.RESERVE,
              reference: order.orderNumber,
            },
          });

          const locationId = reserveMovement?.toLocationId;
          const inventory = await tx.inventory.findFirst({
            where: {
              variantId: item.variantId,
              ...(locationId && { locationId }),
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reserved: { decrement: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                variantId: item.variantId,
                type: StockMovementType.RELEASE,
                quantity: item.quantity, // Positive for release
                fromLocationId: inventory.locationId,
                reference: order.orderNumber,
                notes: `Automatyczne zwolnienie rezerwacji - przekroczony czas na płatność dla zamówienia ${order.orderNumber}`,
              },
            });

            // Invalidate cache
            await invalidateInventoryCache(item.variantId);
            released++;
          }
        }

        // Update order status to CANCELLED
        await tx.order.update({
          where: { id: order.id },
          data: { 
            status: 'CANCELLED',
            paymentStatus: PaymentStatus.CANCELLED,
          },
        });

        // Add status history
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'CANCELLED',
            note: reasonNote,
          },
        });
      });

      if (isFailedPayment) {
        failedPaymentsCleaned++;
      }

      console.log(`[InventoryWorker] Released reservation for order ${order.id} (reason: ${reasonNote})`);
    } catch (error) {
      console.error(`[InventoryWorker] Failed to release reservation for order ${order.id}:`, error);
    }
  }

  return { released, failedPaymentsCleaned };
}

/**
 * Sync all inventory (recalculate totals from stock movements)
 */
async function syncAllInventory(): Promise<{ synced: number }> {
  // Get all inventory records
  const inventoryRecords = await prisma.inventory.findMany({
    include: {
      variant: true,
      location: true,
    },
  });

  let synced = 0;

  for (const record of inventoryRecords) {
    // Find all movements for this variant and location
    const movements = await prisma.stockMovement.findMany({
      where: {
        variantId: record.variantId,
        OR: [
          { fromLocationId: record.locationId },
          { toLocationId: record.locationId },
        ],
      },
    });

    let computedQuantity = 0;
    let computedReserved = 0;

    for (const m of movements) {
      const absQty = Math.abs(m.quantity);

      // Physical stock quantity calculation
      if (m.type === 'RECEIVE') {
        if (m.toLocationId === record.locationId) {
          computedQuantity += absQty;
        }
      } else if (m.type === 'SHIP') {
        if (m.fromLocationId === record.locationId) {
          computedQuantity -= absQty;
        }
      } else if (m.type === 'TRANSFER') {
        if (m.toLocationId === record.locationId) {
          computedQuantity += absQty;
        }
        if (m.fromLocationId === record.locationId) {
          computedQuantity -= absQty;
        }
      } else if (m.type === 'ADJUST') {
        if (m.toLocationId === record.locationId) {
          // ADJUST contains the difference (can be positive or negative)
          computedQuantity += m.quantity;
        }
      }

      // Reservation quantity calculation
      if (m.type === 'RESERVE') {
        if (m.toLocationId === record.locationId || m.fromLocationId === record.locationId) {
          computedReserved += absQty;
        }
      } else if (m.type === 'RELEASE') {
        if (m.fromLocationId === record.locationId) {
          computedReserved -= absQty;
        }
      } else if (m.type === 'SHIP') {
        // If SHIP has order reference, it releases reservation
        if (m.fromLocationId === record.locationId && m.reference?.startsWith('WB-')) {
          computedReserved -= absQty;
        }
      }
    }

    // Ensure values are not negative
    computedQuantity = Math.max(0, computedQuantity);
    computedReserved = Math.max(0, computedReserved);

    // Update database
    await prisma.inventory.update({
      where: { id: record.id },
      data: {
        quantity: computedQuantity,
        reserved: computedReserved,
      },
    });

    // Invalidate cache
    await invalidateInventoryCache(record.variantId);
    synced++;
  }

  console.log(`[InventoryWorker] Synced ${synced} inventory records`);
  return { synced };
}

/**
 * Create and start the inventory sync worker
 */
export function startInventorySyncWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.INVENTORY_SYNC,
    async (job: Job<InventorySyncJobData>) => {
      console.log(`[InventoryWorker] Processing job: ${job.name} (${job.id})`);

      const { type, locationId } = job.data;

      switch (type) {
        case 'low-stock-check': {
          const result = await checkLowStock();
          console.log(`[InventoryWorker] Low stock check complete: ${result.itemsFound} items found, ${result.alertsSent} alerts sent`);
          return result;
        }

        case 'reservation-cleanup': {
          const result = await cleanupExpiredReservations();
          console.log(`[InventoryWorker] Reservation cleanup complete: ${result.released} released, ${result.failedPaymentsCleaned} failed payments cleaned`);
          return result;
        }

        case 'sync-all': {
          const result = await syncAllInventory();
          return result;
        }

        case 'sync-location': {
          if (!locationId) {
            throw new Error('locationId required for sync-location');
          }
          // Sync specific location
          const items = await prisma.inventory.findMany({
            where: { locationId },
          });
          for (const item of items) {
            await invalidateInventoryCache(item.variantId);
          }
          console.log(`[InventoryWorker] Synced location ${locationId}: ${items.length} items`);
          return { synced: items.length };
        }

        default:
          console.warn(`[InventoryWorker] Unknown job type: ${type}`);
          return { error: 'Unknown job type' };
      }
    },
    {
      connection: queueConnection,
      concurrency: 2, // Don't overload with inventory operations
    }
  );

  worker.on('completed', (job) => {
    console.log(`[InventoryWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[InventoryWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[InventoryWorker] Worker error:', err);
  });

  console.log('✓ Inventory sync worker started');
  return worker;
}
