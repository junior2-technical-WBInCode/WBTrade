import { Router } from 'express';
import { prisma } from '../db';
import { authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

// All routes require admin auth
router.use(authGuard, adminOnly);

/**
 * POST /api/admin/sync/prices
 * Ręczne uruchomienie synchronizacji cen ze wszystkich feedów XML hurtowni
 * (leker, btp, hp, dofirmy, polzoo, hurtownia-kuchenna, hurtownia-sportowa).
 *
 * UWAGA: Ten endpoint NIE synchronizuje już cen z Baselinker API (price_groups) -
 * ten mechanizm był rozjechany z `purchasePrice` pochodzącym z feedów XML i jego
 * uruchomienie nadpisywało poprawne ceny detaliczne nieaktualnymi danymi
 * (zob. incydent z 2026-07-02 dla produktów DoFirmy).
 */
router.post('/prices', async (req, res) => {
  try {
    // Try BullMQ first (requires Redis)
    const { triggerImmediatePriceSync } = await import('../workers/baselinker-sync.worker');
    const jobId = await triggerImmediatePriceSync();
    return res.json({ success: true, jobId, status: 'queued' });
  } catch {
    // Fallback: run sync directly in-process if BullMQ / Redis unavailable
    console.warn('[AdminSync] BullMQ unavailable, running price sync directly');
    try {
      const { feedPriceSyncService } = await import('../services/feed-price-sync.service');
      const result = await feedPriceSyncService.syncAllWholesalers();
      return res.json({ success: true, status: 'completed', result });
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      console.error('[AdminSync] Direct price sync failed:', syncErr);
      return res.status(500).json({ message: 'Błąd synchronizacji cen: ' + msg });
    }
  }
});

/**
 * GET /api/admin/sync/prices/status
 * Zwraca datę ostatniej synchronizacji cen dla każdej hurtowni (feed XML).
 */
router.get('/prices/status', async (_req, res) => {
  try {
    const keys = ['leker', 'btp', 'hp', 'dofirmy', 'polzoo', 'hurtownia-kuchenna', 'hurtownia-sportowa'];
    const settings = await prisma.settings.findMany({
      where: { key: { in: keys.map((k) => `last_sync_${k}_xml`) } },
    });

    const perWholesaler: Record<string, string | null> = {};
    for (const k of keys) {
      const s = settings.find((s) => s.key === `last_sync_${k}_xml`);
      perWholesaler[k] = s?.value || null;
    }

    const timestamps = Object.values(perWholesaler).filter(Boolean) as string[];
    const oldestSync = timestamps.length > 0 ? timestamps.sort()[0] : null;

    return res.json({
      source: 'wholesaler-xml-feeds',
      perWholesaler,
      // Oldest of the per-wholesaler timestamps - useful to flag "sync is overdue"
      oldestSync,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AdminSync] Error fetching sync status:', err);
    return res.status(500).json({ message: 'Błąd pobierania statusu synchronizacji: ' + msg });
  }
});

export default router;
