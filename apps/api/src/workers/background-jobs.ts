/**
 * Background cron jobs — extracted from app.ts (audyt V-05).
 *
 * Runs either:
 *  - in a dedicated worker process (src/worker.ts, Render Worker Service), or
 *  - in-process inside the API (legacy mode, when DISABLE_IN_PROCESS_WORKERS is not set)
 *
 * Keeping the logic in one module guarantees both modes behave identically.
 */

function logMemoryUsage(label: string) {
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1024 / 1024);
  console.log(`[MemoryDiag] ${label}: rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB heapTotal=${mb(m.heapTotal)}MB external=${mb(m.external)}MB arrayBuffers=${mb(m.arrayBuffers)}MB`);
}

export async function startBackgroundJobs(redisAvailable: boolean): Promise<void> {
  console.log('⚙️  Starting cron jobs...');
  try {
    // 1. Reservation cleanup - every 5 minutes (requires Redis/BullMQ)
    if (redisAvailable) {
      const { scheduleReservationCleanup } = await import('../lib/queue');
      await scheduleReservationCleanup();
      console.log('✅ Reservation cleanup scheduled (every 5 minutes)');
    } else {
      console.log('⚠️  Reservation cleanup skipped (Redis unavailable)');
    }

    // 2. Baselinker order status sync + delivery tracking
    //    Try BullMQ (requires Redis) → fallback to setInterval if Redis unavailable
    //    Workers only run in production (on Render) - not locally to avoid competing with prod
    const workersEnabled = process.env.NODE_ENV === 'production' || process.env.ENABLE_WORKERS === 'true';
    let bullmqSyncStarted = false;
    if (!workersEnabled) {
      console.log('ℹ️  Workers wyłączone lokalnie (NODE_ENV=development). Ustaw ENABLE_WORKERS=true aby włączyć.');
    }
    if (workersEnabled && redisAvailable) try {
      const { createBaselinkerSyncWorker, scheduleBaselinkerSync } = await import('./baselinker-sync.worker');
      createBaselinkerSyncWorker();
      await scheduleBaselinkerSync();
      bullmqSyncStarted = true;
      console.log('✅ Baselinker sync scheduled via BullMQ (orders: 15min, delivery: 15min, stock: 2h, ceny: 2h)');
    } catch (redisErr) {
      console.warn('⚠️  BullMQ/Redis unavailable — falling back to setInterval for delivery sync:', (redisErr as Error).message);
    }

    // Fallback: setInterval-based sync when Redis/BullMQ is not available
    if (!bullmqSyncStarted && workersEnabled) {
      const { orderStatusSyncService } = await import('../services/order-status-sync.service');
      const { deliveryTrackingService } = await import('../services/delivery-tracking.service');

      // Sync order statuses every 30 minutes
      setInterval(async () => {
        try {
          console.log('[Fallback] Running order status sync...');
          const result = await orderStatusSyncService.syncOrderStatuses(6);
          console.log(`[Fallback] Order status sync: ${result.synced} synced, ${result.skipped} skipped, ${result.errors.length} errors`);
        } catch (e) {
          console.error('[Fallback] Order status sync error:', e);
        }
      }, 30 * 60 * 1000); // 30 minutes

      // Sync delivery tracking every 30 minutes (offset 10 min from order status sync)
      setTimeout(() => {
        setInterval(async () => {
          try {
            console.log('[Fallback] Running delivery tracking sync...');
            const result = await deliveryTrackingService.syncDeliveryStatuses();
            console.log(`[Fallback] Delivery tracking sync: ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
          } catch (e) {
            console.error('[Fallback] Delivery tracking sync error:', e);
          }
        }, 30 * 60 * 1000); // 30 minutes
      }, 10 * 60 * 1000); // offset by 10 min

      // Run initial sync after 2 minutes (to let server fully start)
      setTimeout(async () => {
        try {
          console.log('[Fallback] Running initial order status sync...');
          const result = await orderStatusSyncService.syncOrderStatuses(24);
          console.log(`[Fallback] Initial order status sync: ${result.synced} synced, ${result.skipped} skipped`);
        } catch (e) {
          console.error('[Fallback] Initial order status sync error:', e);
        }
        try {
          console.log('[Fallback] Running initial delivery tracking sync...');
          const result = await deliveryTrackingService.syncDeliveryStatuses();
          console.log(`[Fallback] Initial delivery tracking sync: ${result.updated} updated, ${result.skipped} skipped`);
        } catch (e) {
          console.error('[Fallback] Initial delivery tracking sync error:', e);
        }
      }, 2 * 60 * 1000); // 2 min after start

      console.log('✅ Baselinker sync scheduled via setInterval fallback (every 30 min)');
    }

    // Clean up any RUNNING syncs left over from before this restart
    const { prisma: prismaClient } = await import('../db');
    const { BaselinkerSyncStatus } = await import('@prisma/client');
    const stuckOnStartup = await prismaClient.baselinkerSyncLog.updateMany({
      where: { status: BaselinkerSyncStatus.RUNNING },
      data: {
        status: BaselinkerSyncStatus.FAILED,
        errors: ['Sync przerwany — serwer zrestartował się w trakcie synchronizacji'],
        completedAt: new Date(),
      },
    });
    if (stuckOnStartup.count > 0) {
      console.log(`✅ Marked ${stuckOnStartup.count} stuck sync(s) as FAILED on startup`);
    }

    // Periodic cleanup: mark RUNNING syncs older than 30 min as FAILED (every 10 minutes)
    setInterval(async () => {
      try {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const stuck = await prismaClient.baselinkerSyncLog.updateMany({
          where: {
            status: BaselinkerSyncStatus.RUNNING,
            startedAt: { lt: thirtyMinutesAgo },
          },
          data: {
            status: BaselinkerSyncStatus.FAILED,
            errors: ['Sync przekroczył limit 30 minut — oznaczony jako błąd'],
            completedAt: new Date(),
          },
        });
        if (stuck.count > 0) {
          console.warn(`[SyncCleanup] Marked ${stuck.count} stuck sync(s) as FAILED (>30 min)`);
        }
      } catch (e) {
        console.error('[SyncCleanup] Cleanup interval error:', e);
      }
    }, 10 * 60 * 1000);

    // 3. Payment reminder - daily at 10:00 AM (requires Redis/BullMQ)
    if (redisAvailable) {
      const { createPaymentReminderWorker, schedulePaymentReminders } = await import('./payment-reminder.worker');
      createPaymentReminderWorker();
      await schedulePaymentReminders();
      console.log('✅ Payment reminder scheduled (daily at 10:00 AM)');
    } else {
      console.log('⚠️  Payment reminder skipped (Redis unavailable)');
    }

    // 4. Newsletter campaign scheduler - every minute (no Redis needed)
    const { startNewsletterScheduler } = await import('./newsletter-campaign.worker');
    startNewsletterScheduler();

    // 5. Loyalty cron worker - birthday/quarterly/monthly coupons
    const { startLoyaltyCronWorker } = await import('./loyalty-cron.worker');
    startLoyaltyCronWorker();

    // 5b. Affiliate cron worker - referral hold release
    const { startAffiliateCronWorker } = await import('./affiliate-cron.worker');
    startAffiliateCronWorker();

    // 6. Delivery delay detection - every 6 hours (08:00, 14:00, 20:00, 02:00)
    const { deliveryDelayService } = await import('../services/delivery-delay.service');
    setInterval(async () => {
      try {
        console.log('[DeliveryDelayCron] Running delay detection...');
        const result = await deliveryDelayService.detectDelays();
        console.log(`[DeliveryDelayCron] Detection complete: ${result.detected} new alerts, ${result.skipped} skipped`);
      } catch (e) {
        console.error('[DeliveryDelayCron] Error:', e);
      }
    }, 6 * 60 * 60 * 1000); // every 6 hours

    // Run initial delay detection after 3 minutes
    setTimeout(async () => {
      try {
        console.log('[DeliveryDelayCron] Running initial delay detection...');
        const result = await deliveryDelayService.detectDelays();
        console.log(`[DeliveryDelayCron] Initial detection: ${result.detected} new alerts, ${result.skipped} skipped`);
      } catch (e) {
        console.error('[DeliveryDelayCron] Initial detection error:', e);
      }
    }, 3 * 60 * 1000);
    console.log('✅ Delivery delay detection scheduled (every 6 hours)');

    console.log('✅ All cron jobs started');
    logMemoryUsage('after all cron jobs started');
  } catch (error) {
    console.error('⚠️  Failed to start cron jobs:', error);
    console.warn('⚠️  Application will continue but background sync may not run');
  }
}
