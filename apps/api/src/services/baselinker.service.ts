/**
 * Baselinker Service
 * 
 * Handles all Baselinker integration logic:
 * - Configuration management with encryption
 * - Product, category, stock synchronization
 * - Image sync
 * - Meilisearch reindexing after sync
 */

import { prisma } from '../db';
import { encryptToken, decryptToken, maskToken } from '../lib/encryption';
import { createBaselinkerProvider, BaselinkerProvider, BaselinkerInventory } from '../providers/baselinker';
import { isMeilisearchAvailable, markMeilisearchUnavailable } from '../lib/meilisearch';
import { BaselinkerSyncType, BaselinkerSyncStatus, Prisma, PriceChangeSource } from '@prisma/client';
import { wholesalerConfigService } from './wholesaler-config.service';
import { priceHistoryService } from './price-history.service';
import { syncProgress } from './sync-progress';
import { SearchService } from './search.service';

/**
 * Deduplicate image URLs — removes exact URL duplicates, keeps unique images.
 */
function deduplicateImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }

  return unique;
}

// ============================================
// Types
// ============================================

export interface SaveConfigInput {
  apiToken?: string;  // Optional for updates (keep existing token)
  inventoryId: string;
  syncEnabled?: boolean;
  syncIntervalMinutes?: number;
}

export interface ConfigOutput {
  inventoryId: string;
  tokenMasked: string;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestConnectionResult {
  success: boolean;
  inventories?: BaselinkerInventory[];
  error?: string;
}

export interface SyncTriggerResult {
  syncLogId: string;
}

export interface SyncStatus {
  configured: boolean;
  lastSyncAt: Date | null;
  currentSync: {
    id: string;
    type: BaselinkerSyncType;
    status: BaselinkerSyncStatus;
    startedAt: Date;
  } | null;
  recentLogs: Array<{
    id: string;
    type: BaselinkerSyncType;
    status: BaselinkerSyncStatus;
    itemsProcessed: number;
    errors: Prisma.JsonValue;
    startedAt: Date;
    completedAt: Date | null;
  }>;
}

// ============================================
// Helper Functions
// ============================================

// Polish character transliteration map
const polishCharsMap: Record<string, string> = {
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
  'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
  'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
  'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
};

function slugify(text: string): string {
  // First transliterate Polish characters
  let result = text.toString();
  for (const [polish, ascii] of Object.entries(polishCharsMap)) {
    result = result.replace(new RegExp(polish, 'g'), ascii);
  }
  
  return result
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function generateSku(productId: number, existingSku?: string, skuPrefix?: string): string {
  let baseSku: string;
  if (existingSku && existingSku.trim()) {
    baseSku = existingSku.trim();
  } else {
    baseSku = `BL-${productId}`;
  }
  // Add warehouse prefix if not already present
  if (skuPrefix && !baseSku.toUpperCase().startsWith(skuPrefix.toUpperCase())) {
    return `${skuPrefix}${baseSku}`;
  }
  return baseSku;
}

// No CDN conversion — save original image URLs from Baselinker API directly.
// The image-proxy endpoint (/api/img/:id) handles fetching & caching them.

// ============================================
// Service Class
// ============================================

export class BaselinkerService {
  /**
   * Save or update Baselinker configuration
   */
  async saveConfig(input: SaveConfigInput): Promise<ConfigOutput> {
    const { apiToken, inventoryId, syncEnabled = true, syncIntervalMinutes = 60 } = input;

    // Check if config already exists
    const existingConfig = await prisma.baselinkerConfig.findFirst({
      where: { inventoryId },
    });

    let config;

    if (apiToken) {
      // New token provided - encrypt and save
      const encrypted = encryptToken(apiToken);

      config = await prisma.baselinkerConfig.upsert({
        where: { inventoryId },
        update: {
          apiTokenEncrypted: encrypted.ciphertext,
          encryptionIv: encrypted.iv,
          authTag: encrypted.authTag,
          syncEnabled,
          syncIntervalMinutes,
        },
        create: {
          inventoryId,
          apiTokenEncrypted: encrypted.ciphertext,
          encryptionIv: encrypted.iv,
          authTag: encrypted.authTag,
          syncEnabled,
          syncIntervalMinutes,
        },
      });

      return {
        inventoryId: config.inventoryId,
        tokenMasked: maskToken(apiToken),
        syncEnabled: config.syncEnabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        lastSyncAt: config.lastSyncAt,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    } else if (existingConfig) {
      // Update only sync settings
      config = await prisma.baselinkerConfig.update({
        where: { id: existingConfig.id },
        data: {
          syncEnabled,
          syncIntervalMinutes,
        },
      });
      
      let decryptedToken: string;
      try {
        decryptedToken = decryptToken(
          config.apiTokenEncrypted,
          config.encryptionIv,
          config.authTag
        );
      } catch {
        decryptedToken = process.env.BASELINKER_API_TOKEN || '';
        console.warn('decryptToken failed in saveConfig (update), using BASELINKER_API_TOKEN env var fallback');
      }

      return {
        inventoryId: config.inventoryId,
        tokenMasked: maskToken(decryptedToken),
        syncEnabled: config.syncEnabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        lastSyncAt: config.lastSyncAt,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    } else {
      throw new Error('API token is required for initial configuration');
    }
  }

  /**
   * Get current configuration (with masked token)
   */
  async getConfig(): Promise<ConfigOutput | null> {
    const config = await prisma.baselinkerConfig.findFirst();

    if (!config) {
      return null;
    }

    let decryptedToken: string;
    try {
      decryptedToken = decryptToken(
        config.apiTokenEncrypted,
        config.encryptionIv,
        config.authTag
      );
    } catch {
      const envToken = process.env.BASELINKER_API_TOKEN;
      if (envToken) {
        console.warn('decryptToken failed in getConfig, using BASELINKER_API_TOKEN env var fallback');
        decryptedToken = envToken;
      } else {
        console.error('Failed to decrypt Baselinker config and no BASELINKER_API_TOKEN env var available.');
        return null;
      }
    }

    return {
      inventoryId: config.inventoryId,
      tokenMasked: maskToken(decryptedToken),
      syncEnabled: config.syncEnabled,
      syncIntervalMinutes: config.syncIntervalMinutes,
      lastSyncAt: config.lastSyncAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Delete Baselinker configuration
   */
  async deleteConfig(): Promise<void> {
    await prisma.baselinkerConfig.deleteMany();
    await prisma.baselinkerSyncLog.deleteMany();
  }

  /**
   * Get decrypted API token from stored config
   */
  async getDecryptedToken(): Promise<{ token: string; inventoryId: string } | null> {
    const config = await prisma.baselinkerConfig.findFirst();

    if (!config) {
      return null;
    }

    try {
      const token = decryptToken(
        config.apiTokenEncrypted,
        config.encryptionIv,
        config.authTag
      );

      return { token, inventoryId: config.inventoryId };
    } catch (error) {
      const envToken = process.env.BASELINKER_API_TOKEN;
      if (envToken) {
        console.warn('decryptToken failed in getDecryptedToken, using BASELINKER_API_TOKEN env var fallback');
        return { token: envToken, inventoryId: config.inventoryId };
      }
      console.error('Failed to decrypt Baselinker token and no BASELINKER_API_TOKEN env var available.');
      return null;
    }
  }

  /**
   * Create Baselinker provider instance
   */
  private async createProvider(apiToken?: string): Promise<BaselinkerProvider> {
    if (apiToken) {
      return createBaselinkerProvider({
        apiToken,
        inventoryId: process.env.BASELINKER_DEFAULT_INVENTORY_ID || '',
      });
    }

    const stored = await this.getDecryptedToken();
    if (!stored) {
      throw new Error('No Baselinker configuration found');
    }

    return createBaselinkerProvider({
      apiToken: stored.token,
      inventoryId: stored.inventoryId,
    });
  }

  /**
   * Test connection to Baselinker API
   */
  async testConnection(apiToken?: string): Promise<TestConnectionResult> {
    try {
      const provider = await this.createProvider(apiToken);
      const inventories = await provider.getInventories();

      return {
        success: true,
        inventories,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get inventories from Baselinker
   */
  async getInventories(): Promise<BaselinkerInventory[]> {
    const provider = await this.createProvider();
    return provider.getInventories();
  }

  /**
   * Trigger sync (creates sync log and starts sync)
   * @param type - 'full', 'products', 'categories', 'stock', 'images'
   * @param mode - 'new-only' (tylko nowe produkty, bez stanów 0), 'update-only' (tylko aktualizacja istniejących), 'full-resync' (pełna resynchronizacja)
   * @param inventoryId - optional inventory ID override (sync specific warehouse)
   */
  async triggerSync(type: string, mode?: string, inventoryId?: string, filterTag?: string): Promise<SyncTriggerResult> {
    // Map string type to enum
    const typeMap: Record<string, BaselinkerSyncType> = {
      full: BaselinkerSyncType.PRODUCTS,
      products: BaselinkerSyncType.PRODUCTS,
      categories: BaselinkerSyncType.CATEGORIES,
      stock: BaselinkerSyncType.STOCK,
      images: BaselinkerSyncType.IMAGES,
      price: BaselinkerSyncType.PRICE,
    };

    const syncType = typeMap[type] || BaselinkerSyncType.PRODUCTS;

    // Abort ALL currently running syncs (prevents old processes from hogging the API)
    const runningSyncs = await prisma.baselinkerSyncLog.findMany({
      where: { status: BaselinkerSyncStatus.RUNNING },
      select: { id: true, startedAt: true },
    });
    for (const rs of runningSyncs) {
      console.log(`[BaselinkerSync] Aborting previous running sync ${rs.id} (started ${rs.startedAt})`);
      syncProgress.requestAbort(rs.id);
    }
    if (runningSyncs.length > 0) {
      await prisma.baselinkerSyncLog.updateMany({
        where: {
          status: BaselinkerSyncStatus.RUNNING,
          id: { in: runningSyncs.map(s => s.id) },
        },
        data: {
          status: BaselinkerSyncStatus.FAILED,
          errors: ['Cancelled — new sync started'],
          completedAt: new Date(),
        },
      });
      // Wait briefly for old processes to notice the abort
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Create sync log
    const syncLog = await prisma.baselinkerSyncLog.create({
      data: {
        type: syncType,
        status: BaselinkerSyncStatus.RUNNING,
      },
    });

    console.log(`[BaselinkerSync] Starting ${type} sync (logId: ${syncLog.id})${mode ? ` with mode: ${mode}` : ''}${inventoryId ? ` inventoryId: ${inventoryId}` : ''}${filterTag ? ` filterTag: ${filterTag}` : ''}`);
    
    syncProgress.sendProgress(syncLog.id, {
      type: 'phase',
      message: `Rozpoczynanie synchronizacji ${type}${mode ? ` (${mode})` : ''}${filterTag ? ` [tag: ${filterTag}]` : ''}... [BUILD:v8 inv=${inventoryId || 'default'}]`,
      phase: 'init',
      mode: mode || 'fetch-all',
    });

    // Run sync in background (don't await)
    this.runSync(syncLog.id, type, mode, inventoryId, filterTag).catch((error) => {
      console.error('Sync failed:', error);
    });

    return { syncLogId: syncLog.id };
  }

  /**
   * Run the actual sync process
   * @param mode - 'new-only' (tylko nowe produkty, bez stanów 0), 'update-only' (tylko aktualizacja istniejących), 'full-resync' (pełna resynchronizacja)
   * @param overrideInventoryId - optional inventory ID override (sync specific warehouse)
   */
  private async runSync(syncLogId: string, type: string, mode?: string, overrideInventoryId?: string, filterTag?: string): Promise<void> {
    let itemsProcessed = 0;
    let itemsChanged = 0;
    let allChangedSkus: { sku: string; oldQty: number; newQty: number; inventory: string }[] = [];
    let allChangedProducts: { sku: string; name: string; changes: string[] }[] = [];
    const errors: string[] = [];

    // Global sync timeout: 6 hours max (safety net for truly stuck syncs)
    const SYNC_TIMEOUT_MS = 6 * 60 * 60 * 1000;
    const syncStartTime = Date.now();
    let syncTimedOut = false;
    const syncTimeoutTimer = setTimeout(() => {
      syncTimedOut = true;
      console.error(`[BaselinkerSync] Global timeout reached (${SYNC_TIMEOUT_MS / 60000} min) for sync ${syncLogId}`);
      syncProgress.requestAbort(syncLogId);
    }, SYNC_TIMEOUT_MS);

    // DB keepalive: ping every 60s to prevent Neon idle connection drops
    const dbKeepalive = setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (e) {
        console.warn('[BaselinkerSync] DB keepalive ping failed:', e);
      }
    }, 60000);

    try {
      const stored = await this.getDecryptedToken();
      if (!stored) {
        throw new Error('No Baselinker configuration found');
      }

      const provider = await this.createProvider();
      const activeInventoryId = overrideInventoryId || stored.inventoryId;

      // EMERGENCY DEBUG
      syncProgress.sendProgress(syncLogId, {
        type: 'info',
        message: `[v7-DEBUG] runSync: type="${type}", activeInventoryId=${activeInventoryId}, override=${overrideInventoryId || 'none'}`,
      });

      if (type === 'full') {
        // Full sync: categories → products → images → stock
        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Synchronizacja kategorii...', phase: 'categories' });
        const catResult = await this.syncCategories(provider, activeInventoryId);
        itemsProcessed += catResult.processed;
        errors.push(...catResult.errors);
        
        if (syncProgress.isAborted(syncLogId)) throw new Error('ABORTED');

        syncProgress.sendProgress(syncLogId, { type: 'phase', message: `Synchronizacja produktów... [invId: ${activeInventoryId}]`, phase: 'products' });
        const prodResult = await this.syncProducts(provider, activeInventoryId, mode, syncLogId, filterTag);
        itemsProcessed += prodResult.processed;
        allChangedProducts.push(...prodResult.changedProducts);
        errors.push(...prodResult.errors);

        if (syncProgress.isAborted(syncLogId)) throw new Error('ABORTED');

        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Synchronizacja stanów magazynowych...', phase: 'stock' });
        const stockResult = await this.syncStock(provider, activeInventoryId, syncLogId);
        itemsProcessed += stockResult.processed;
        itemsChanged += stockResult.changed;
        allChangedSkus.push(...stockResult.changedSkus);
        errors.push(...stockResult.errors);

        // Reindex Meilisearch
        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Reindeksacja wyszukiwarki...', phase: 'reindex' });
        await this.reindexMeilisearch();
      } else if (type === 'categories') {
        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Synchronizacja kategorii...', phase: 'categories' });
        const result = await this.syncCategories(provider, activeInventoryId);
        itemsProcessed = result.processed;
        errors.push(...result.errors);
      } else if (type === 'products') {
        // Always sync categories first to ensure product category assignment works
        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Synchronizacja kategorii...', phase: 'categories' });
        const catResult = await this.syncCategories(provider, activeInventoryId);
        errors.push(...catResult.errors);

        if (syncProgress.isAborted(syncLogId)) throw new Error('ABORTED');

        syncProgress.sendProgress(syncLogId, { type: 'phase', message: `Synchronizacja produktów... [invId: ${activeInventoryId}]`, phase: 'products' });
        const result = await this.syncProducts(provider, activeInventoryId, mode, syncLogId, filterTag);
        itemsProcessed = result.processed;
        allChangedProducts = result.changedProducts;
        errors.push(...result.errors);
        
        // Po synchronizacji produktów, synchronizuj też stany magazynowe
        console.log('[BaselinkerSync] Syncing stock after products sync...');
        if (!syncProgress.isAborted(syncLogId)) {
          syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Synchronizacja stanów magazynowych...', phase: 'stock' });
          const stockResult = await this.syncStock(provider, activeInventoryId, syncLogId);
          // Don't add stockResult.processed to itemsProcessed to avoid confusing totals
          // (products: 105 + stock: 105 = 210 looks wrong when there are only 105 products)
          itemsChanged += stockResult.changed;
          allChangedSkus.push(...stockResult.changedSkus);
          errors.push(...stockResult.errors);
        }
        
        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Reindeksacja wyszukiwarki...', phase: 'reindex' });
        await this.reindexMeilisearch();
      } else if (type === 'stock') {
        syncProgress.sendProgress(syncLogId, { type: 'phase', message: 'Synchronizacja stanów magazynowych...', phase: 'stock' });
        const result = await this.syncStock(provider, activeInventoryId, syncLogId);
        itemsProcessed = result.processed;
        itemsChanged = result.changed;
        allChangedSkus = result.changedSkus;
        errors.push(...result.errors);
      } else if (type === 'images') {
        const result = await this.syncImages(provider, activeInventoryId);
        itemsProcessed = result.processed;
        errors.push(...result.errors);
      } else if (type === 'price') {
        const result = await this.syncPrices(provider, activeInventoryId, syncLogId);
        itemsProcessed = result.processed;
        itemsChanged = result.changed;
        allChangedSkus = result.changedPrices as any;
        errors.push(...result.errors);
      }

      // Update sync log as success
      const changedData = allChangedSkus.length > 0 ? allChangedSkus : (allChangedProducts.length > 0 ? allChangedProducts : undefined);
      await prisma.baselinkerSyncLog.update({
        where: { id: syncLogId },
        data: {
          status: errors.length > 0 ? BaselinkerSyncStatus.FAILED : BaselinkerSyncStatus.SUCCESS,
          itemsProcessed,
          itemsChanged: itemsChanged || allChangedProducts.length,
          changedSkus: changedData,
          errors: errors.length > 0 ? errors : undefined,
          completedAt: new Date(),
        },
      });

      // Update last sync time in config
      await prisma.baselinkerConfig.updateMany({
        data: { lastSyncAt: new Date() },
      });
      
      // Send completion event
      syncProgress.sendProgress(syncLogId, {
        type: errors.length > 0 ? 'error' : 'complete',
        message: errors.length > 0 
          ? `Synchronizacja zakończona z ${errors.length} błędami. Przetworzono: ${itemsProcessed}`
          : `Synchronizacja zakończona pomyślnie! Przetworzono: ${itemsProcessed}, Zmienionych: ${itemsChanged || allChangedProducts.length}`,
        current: itemsProcessed,
        total: itemsProcessed,
        percent: 100,
      });
      syncProgress.cleanup(syncLogId);
    } catch (error) {
      const isAborted = error instanceof Error && error.message === 'ABORTED';
      const isTimeout = syncTimedOut;
      console.error('Sync error:', isAborted ? (isTimeout ? 'Global timeout' : 'Aborted by user') : error);

      const errorMessage = isTimeout
        ? `Synchronizacja przekroczyła limit czasu (${SYNC_TIMEOUT_MS / 60000} min)`
        : isAborted
          ? 'Przerwane przez administratora'
          : (error instanceof Error ? error.message : 'Unknown error');

      // Update sync log as failed — with retry in case DB connection dropped
      for (let retryDb = 0; retryDb < 3; retryDb++) {
        try {
          await prisma.baselinkerSyncLog.update({
            where: { id: syncLogId },
            data: {
              status: BaselinkerSyncStatus.FAILED,
              itemsProcessed,
              itemsChanged,
              changedSkus: allChangedSkus.length > 0 ? allChangedSkus : undefined,
              errors: [errorMessage, ...errors].slice(0, 50),
              completedAt: new Date(),
            },
          });
          break; // success
        } catch (dbErr) {
          console.error(`[BaselinkerSync] Failed to update sync log (attempt ${retryDb + 1}/3):`, dbErr);
          if (retryDb < 2) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
      
      syncProgress.sendProgress(syncLogId, {
        type: isAborted ? 'aborted' : 'error',
        message: isAborted 
          ? `Synchronizacja przerwana. Przetworzono: ${itemsProcessed} produktów przed przerwaniem.${isTimeout ? ' (timeout)' : ''}`
          : `Błąd synchronizacji: ${errorMessage}`,
        current: itemsProcessed,
      });
      syncProgress.cleanup(syncLogId);
    } finally {
      // Always clean up timers
      clearTimeout(syncTimeoutTimer);
      clearInterval(dbKeepalive);
      console.log(`[BaselinkerSync] Sync ${syncLogId} finished in ${Math.round((Date.now() - syncStartTime) / 1000)}s`);
    }
  }

  /**
   * Run stock sync directly (awaited) — for use by BullMQ worker
   * Creates sync log, runs sync, updates log with results
   */
  async runStockSyncDirect(): Promise<{ syncLogId: string; success: boolean; itemsProcessed: number; itemsChanged: number }> {
    // Clean up stuck syncs
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.baselinkerSyncLog.updateMany({
      where: {
        status: BaselinkerSyncStatus.RUNNING,
        startedAt: { lt: fifteenMinutesAgo },
      },
      data: {
        status: BaselinkerSyncStatus.FAILED,
        errors: ['Sync timed out - marked as failed'],
        completedAt: new Date(),
      },
    });

    const syncLog = await prisma.baselinkerSyncLog.create({
      data: {
        type: BaselinkerSyncType.STOCK,
        status: BaselinkerSyncStatus.RUNNING,
      },
    });

    console.log(`[BaselinkerSync] Starting direct stock sync (logId: ${syncLog.id})`);

    try {
      const stored = await this.getDecryptedToken();
      if (!stored) throw new Error('No Baselinker configuration found');

      const provider = await this.createProvider();
      // Worker syncs ALL warehouses (cron every 2h)
      const result = await this.syncStock(provider, 'all');

      const status = result.errors.length > 0 ? BaselinkerSyncStatus.FAILED : BaselinkerSyncStatus.SUCCESS;

      await prisma.baselinkerSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status,
          itemsProcessed: result.processed,
          itemsChanged: result.changed,
          changedSkus: result.changedSkus.length > 0 ? result.changedSkus : undefined,
          errors: result.errors.length > 0 ? result.errors : undefined,
          completedAt: new Date(),
        },
      });

      await prisma.baselinkerConfig.updateMany({
        data: { lastSyncAt: new Date() },
      });

      console.log(`[BaselinkerSync] Direct stock sync complete: ${result.processed} processed, ${result.changed} changed`);

      return {
        syncLogId: syncLog.id,
        success: result.errors.length === 0,
        itemsProcessed: result.processed,
        itemsChanged: result.changed,
      };
    } catch (error) {
      console.error('[BaselinkerSync] Direct stock sync error:', error);

      await prisma.baselinkerSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: BaselinkerSyncStatus.FAILED,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          completedAt: new Date(),
        },
      });

      return { syncLogId: syncLog.id, success: false, itemsProcessed: 0, itemsChanged: 0 };
    }
  }

  /**
   * Sync categories from Baselinker (incremental - only changes)
   * Handles flat Baselinker categories with path-like names (e.g., "Odzież/Sport/Bluzy")
   * by extracting the last segment for display name and creating proper slugs
   */
  async syncCategories(
    provider: BaselinkerProvider,
    inventoryId: string
  ): Promise<{ processed: number; errors: string[]; skipped: number }> {
    const errors: string[] = [];
    let processed = 0;
    let skipped = 0;

    try {
      const allCategories = await provider.getInventoryCategories(inventoryId);
      console.log(`[BaselinkerSync] Fetched ${allCategories.length} categories from Baselinker`);

      // Filter out warehouse-specific categories (e.g. Hurtownia Sportowa uses "/" separator)
      // Only keep shared categories (with "|" separator or plain top-level names without "/")
      // Also skip warehouse-specific plain categories that are not shared across all inventories
      const BLOCKED_CATEGORY_NAMES = new Set([
        '', ' ',
        'akcesoria', 'odzież', 'obuwie', 'buty', 'moda', 'sport', 'dziecko',
        'import z verto', 'import z inmotion', 'do skategoryzowania',
        '(gry i zabawki) pluszaki',
        'kategoria tymczasowa', 'hurtownia sportowa', 'import z pmsport', 'w przygotowaniu',
      ]);
      const categories = allCategories.filter(c => {
        if (c.name.includes('/')) return false;
        if (BLOCKED_CATEGORY_NAMES.has(c.name.trim().toLowerCase())) return false;
        return true;
      });
      const skippedCount = allCategories.length - categories.length;
      if (skippedCount > 0) {
        console.log(`[BaselinkerSync] Skipped ${skippedCount} warehouse-specific categories`);
      }

      // Pre-fetch all existing categories for comparison
      const existingCategories = await prisma.category.findMany({
        where: { baselinkerCategoryId: { not: null } },
        select: {
          id: true,
          baselinkerCategoryId: true,
          baselinkerCategoryPath: true,
          name: true,
          slug: true,
          parentId: true,
        },
      });
      
      const existingMap = new Map(
        existingCategories.map(c => [c.baselinkerCategoryId as string, c])
      );

      // Map to store main category name -> category id (for parent lookup)
      const mainCategoryMap = new Map<string, string>();
      
      // First, find or create all main categories (those without | in name OR parent_id = 0)
      const mainCategories = categories.filter(c => 
        !c.name.includes('|') || c.parent_id === 0
      );
      
      console.log(`[BaselinkerSync] Found ${mainCategories.length} main categories (without | separator)`);

      // Process main categories first
      for (const blCategory of mainCategories) {
        const categoryId = blCategory.category_id.toString();
        const categoryName = blCategory.name.trim();
        const existing = existingMap.get(categoryId);
        
        // Check if unchanged
        if (existing && existing.name === categoryName && existing.parentId === null) {
          mainCategoryMap.set(categoryName, existing.id);
          skipped++;
          continue;
        }
        
        try {
          // If no exact match, check for legacy prefixed versions (hp-, btp-, leker-, outlet-)
          // and migrate them to use the plain ID
          if (!existing) {
            for (const prefix of ['hp-', 'btp-', 'leker-', 'outlet-']) {
              const prefixed = await prisma.category.findUnique({
                where: { baselinkerCategoryId: `${prefix}${categoryId}` }
              });
              if (prefixed) {
                console.log(`[BaselinkerSync] Migrating category "${categoryName}" from ${prefix}${categoryId} to ${categoryId}`);
                await prisma.category.update({
                  where: { id: prefixed.id },
                  data: { baselinkerCategoryId: categoryId }
                });
                mainCategoryMap.set(categoryName, prefixed.id);
                processed++;
                break;
              }
            }
            // If we found and migrated a prefixed version, skip the upsert
            if (mainCategoryMap.has(categoryName)) continue;
          }

          const slug = slugify(categoryName) || `category-${categoryId}`;
          
          const result = await prisma.category.upsert({
            where: { baselinkerCategoryId: categoryId },
            update: {
              name: categoryName,
              slug: await this.ensureUniqueSlug(slug, categoryId),
              parentId: null, // Main categories have no parent
              baselinkerCategoryPath: categoryName, // Path is just the name for main categories
            },
            create: {
              baselinkerCategoryId: categoryId,
              name: categoryName,
              slug: await this.ensureUniqueSlug(slug, categoryId),
              parentId: null,
              baselinkerCategoryPath: categoryName,
              isActive: true,
            },
          });
          
          mainCategoryMap.set(categoryName, result.id);
          processed++;
        } catch (error) {
          errors.push(`Main category ${categoryId} (${categoryName}): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Now process subcategories (those with | separator)
      // Sort by depth (number of | separators) so shallower categories are processed first
      const subCategories = categories
        .filter(c => c.name.includes('|'))
        .sort((a, b) => {
          const depthA = a.name.split('|').length;
          const depthB = b.name.split('|').length;
          return depthA - depthB;
        });
      console.log(`[BaselinkerSync] Found ${subCategories.length} subcategories (with | separator)`);

      // Map to store full path -> category id for multi-level lookups
      // e.g. "Sprzęt gastronomiczny|Naczynia i przybory kuchenne" -> "abc-123"
      const pathToCategoryId = new Map<string, string>();
      
      // Seed with main categories
      for (const [name, id] of mainCategoryMap.entries()) {
        pathToCategoryId.set(name.toLowerCase(), id);
      }

      for (const blCategory of subCategories) {
        const categoryId = blCategory.category_id.toString();
        const fullPath = blCategory.name.trim(); // e.g. "A|B|C"
        
        // Parse the category path
        const parts = fullPath.split('|').map(p => p.trim());
        const leafName = parts[parts.length - 1]; // Last part is the actual category name
        
        const existing = existingMap.get(categoryId);
        
        // Walk through parts to find/create the correct parent at each level
        let parentId: string | null = null;
        
        for (let i = 0; i < parts.length - 1; i++) {
          const partName = parts[i];
          const partPath = parts.slice(0, i + 1).join('|').toLowerCase();
          
          // Check path cache first
          let foundId: string | undefined = pathToCategoryId.get(partPath);
          
          if (!foundId) {
            // Try case-insensitive lookup in path cache
            for (const [cachedPath, cachedId] of pathToCategoryId.entries()) {
              if (cachedPath === partPath) {
                foundId = cachedId;
                break;
              }
            }
          }
          
          if (!foundId) {
            // Try to find in DB by name + parentId
            const dbCategory = await prisma.category.findFirst({
              where: { 
                name: { equals: partName, mode: 'insensitive' },
                parentId: parentId,
              },
              select: { id: true },
            });
            
            if (dbCategory) {
              foundId = dbCategory.id;
            } else {
              // Create intermediate category (no baselinkerCategoryId since it's synthetic)
              // Include parent context in slug to avoid collisions
              const parentPart = i > 0 ? parts[i - 1] : '';
              const intermediateSlug = (parentPart ? slugify(`${parentPart}-${partName}`) : slugify(partName)) || `category-${Date.now()}`;
              const intermediateFullPath = parts.slice(0, i + 1).join('|');
              console.log(`[BaselinkerSync] Creating intermediate category: "${intermediateFullPath}"`);
              
              const created = await prisma.category.create({
                data: {
                  name: partName,
                  slug: await this.ensureUniqueSlug(intermediateSlug, `intermediate-${intermediateFullPath}`),
                  parentId: parentId,
                  baselinkerCategoryPath: intermediateFullPath,
                  isActive: true,
                },
              });
              foundId = created.id;
            }
            
            if (foundId) {
              pathToCategoryId.set(partPath, foundId);
            }
          }
          
          parentId = foundId ?? null;
        }
        
        // Check if unchanged
        if (existing && 
            existing.name === leafName && 
            existing.parentId === parentId &&
            existing.baselinkerCategoryPath === fullPath) {
          // Still register in path cache
          pathToCategoryId.set(fullPath.toLowerCase(), existing.id);
          skipped++;
          continue;
        }
        
        try {
          // If no exact match, check for legacy prefixed versions
          if (!existing) {
            for (const prefix of ['hp-', 'btp-', 'leker-', 'outlet-']) {
              const prefixed = await prisma.category.findUnique({
                where: { baselinkerCategoryId: `${prefix}${categoryId}` }
              });
              if (prefixed) {
                console.log(`[BaselinkerSync] Migrating subcategory "${leafName}" from ${prefix}${categoryId} to ${categoryId}`);
                await prisma.category.update({
                  where: { id: prefixed.id },
                  data: { baselinkerCategoryId: categoryId, parentId: parentId }
                });
                pathToCategoryId.set(fullPath.toLowerCase(), prefixed.id);
                processed++;
                break;
              }
            }
            if (pathToCategoryId.has(fullPath.toLowerCase())) continue;
          }

          // Create slug from parent + leaf name to avoid collisions
          // e.g. "Elektronika|Akcesoria" → "elektronika-akcesoria" instead of just "akcesoria"
          const parentName = parts.length >= 2 ? parts[parts.length - 2] : '';
          const slug = (parentName ? slugify(`${parentName}-${leafName}`) : slugify(leafName)) || `subcategory-${categoryId}`;
          
          const result = await prisma.category.upsert({
            where: { baselinkerCategoryId: categoryId },
            update: {
              name: leafName, // Only the leaf part, e.g. "Garnki" not "Naczynia|Garnki"
              slug: await this.ensureUniqueSlug(slug, categoryId),
              parentId: parentId,
              baselinkerCategoryPath: fullPath, // Full path for reference
            },
            create: {
              baselinkerCategoryId: categoryId,
              name: leafName,
              slug: await this.ensureUniqueSlug(slug, categoryId),
              parentId: parentId,
              baselinkerCategoryPath: fullPath,
              isActive: true,
            },
          });
          
          // Cache the full path for deeper levels to find
          pathToCategoryId.set(fullPath.toLowerCase(), result.id);
          processed++;
          
          // Log if parent not found
          if (!parentId) {
            console.warn(`[BaselinkerSync] Warning: No parent found for category "${fullPath}" (ID: ${categoryId})`);
          }
        } catch (error) {
          errors.push(`Subcategory ${categoryId} (${fullPath}): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      console.log(`[BaselinkerSync] Categories sync complete. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`);
    } catch (error) {
      errors.push(`Failed to fetch categories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { processed, errors, skipped };
  }

  /**
   * Find category by Baselinker ID
   * Searches for exact match first, then tries with common prefixes (btp-, hp-, leker-, outlet-)
   */
  private async findCategoryByBaselinkerIdcatId(baselinkerCategoryId: string) {
    // Try exact match first
    let category = await prisma.category.findUnique({
      where: { baselinkerCategoryId },
    });
    
    if (category) return category;
    
    // Try with warehouse prefixes
    for (const prefix of ['btp-', 'hp-', 'leker-', 'outlet-']) {
      category = await prisma.category.findUnique({
        where: { baselinkerCategoryId: `${prefix}${baselinkerCategoryId}` },
      });
      if (category) return category;
    }
    
    return null;
  }
  
  /**
   * Find category by Baselinker category path (e.g. "Gastronomia|Naczynia i przybory kuchenne")
   */
  async findCategoryByPath(categoryPath: string): Promise<{ id: string } | null> {
    // First try to find by exact path
    let category = await prisma.category.findFirst({
      where: { baselinkerCategoryPath: categoryPath },
      select: { id: true },
    });
    
    if (category) return category;
    
    // If not found and path contains |, try to find the subcategory by name
    if (categoryPath.includes('|')) {
      const parts = categoryPath.split('|').map(p => p.trim());
      const subCategoryName = parts.slice(1).join('|');
      const mainCategoryName = parts[0];
      
      // Find parent first
      const parent = await prisma.category.findFirst({
        where: { 
          name: mainCategoryName,
          parentId: null,
        },
        select: { id: true },
      });
      
      if (parent) {
        category = await prisma.category.findFirst({
          where: { 
            name: subCategoryName,
            parentId: parent.id,
          },
          select: { id: true },
        });
      }
    }
    
    return category;
  }

  /**
   * Ensure slug is unique
   */
  private async ensureUniqueSlug(baseSlug: string, baselinkerCategoryId: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (counter < 10000) {
      const existing = await prisma.category.findUnique({
        where: { slug },
      });

      if (!existing || existing.baselinkerCategoryId === baselinkerCategoryId) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    // Fallback if we somehow hit the limit
    return `${baseSlug}-${Date.now()}`;
  }

  /**
   * Get product name from Baselinker product data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getProductName(blProduct: any): string {
    if (blProduct.text_fields) {
      // Direct name field (most common)
      if (blProduct.text_fields.name) {
        return blProduct.text_fields.name;
      }
      // Try Polish
      if (blProduct.text_fields['pl']?.name) {
        return blProduct.text_fields['pl'].name;
      }
      // Try any language
      for (const langCode of Object.keys(blProduct.text_fields)) {
        const textField = blProduct.text_fields[langCode];
        if (typeof textField === 'object' && textField?.name) {
          return textField.name;
        }
      }
    }
    if (blProduct.name) {
      return blProduct.name;
    }
    return '';
  }

  /**
   * Get product description from Baselinker product data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getProductDescription(blProduct: any): string {
    if (blProduct.text_fields) {
      // Direct description field
      if (blProduct.text_fields.description) {
        return blProduct.text_fields.description;
      }
      // Try Polish
      if (blProduct.text_fields['pl']?.description) {
        return blProduct.text_fields['pl'].description;
      }
      // Try any language
      for (const langCode of Object.keys(blProduct.text_fields)) {
        const textField = blProduct.text_fields[langCode];
        if (typeof textField === 'object' && textField?.description) {
          return textField.description;
        }
      }
    }
    return '';
  }

  /**
   * Default PLN price group ID - fetched from BaseLinker config
   * Common IDs: 10034 for PLN, but this should match your inventory settings
   */
  private defaultPriceGroupId = '10034'; // PLN price group

  /**
   * Price rules cache - loaded from Settings table
   */
  private priceRulesCache: Record<string, Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }>> | null = null;
  private priceRulesCacheTime = 0;
  private static PRICE_RULES_CACHE_TTL = 60_000; // 1 minute

  /**
   * Load price multiplier rules from the Settings table.
   * Cached for 1 minute to avoid hitting DB on every product.
   */
  private async loadPriceRules(): Promise<Record<string, Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }>>> {
    if (this.priceRulesCache && Date.now() - this.priceRulesCacheTime < BaselinkerService.PRICE_RULES_CACHE_TTL) {
      return this.priceRulesCache;
    }

    const rules: Record<string, Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }>> = {};
    const warehouseKeys = await wholesalerConfigService.getWarehouseKeysWithPriceRules();
    for (const wh of warehouseKeys) {
      try {
        const setting = await prisma.settings.findUnique({ where: { key: `price_rules_${wh}` } });
        if (setting?.value) {
          const parsed = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
          if (Array.isArray(parsed) && parsed.length > 0) {
            rules[wh] = parsed
              .map((r: any) => ({
                priceFrom: parseFloat(r.priceFrom) || 0,
                priceTo: parseFloat(r.priceTo) || 999999,
                multiplier: parseFloat(r.multiplier) || 1,
                addToPrice: parseFloat(r.addToPrice) || 0,
              }))
              .sort((a: any, b: any) => a.priceFrom - b.priceFrom);
          }
        }
      } catch (err) {
        console.warn(`[BaselinkerSync] Could not load price rules for ${wh}:`, err);
      }
    }

    this.priceRulesCache = rules;
    this.priceRulesCacheTime = Date.now();
    return rules;
  }

  /**
   * Apply price multiplier rules to a raw wholesale price.
   * @param rawPrice - wholesale price from Baselinker
   * @param warehouse - warehouse key: 'leker', 'btp', or 'hp'
   * @param priceRules - loaded price rules
   * @returns price after applying multiplier and addition
   */
  private applyPriceMultiplier(
    rawPrice: number,
    warehouse: string,
    priceRules: Record<string, Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }>>
  ): number {
    if (!rawPrice || rawPrice <= 0 || !priceRules[warehouse]) return rawPrice;
    for (const rule of priceRules[warehouse]) {
      if (rawPrice >= rule.priceFrom && rawPrice <= rule.priceTo) {
        return rawPrice * rule.multiplier + rule.addToPrice;
      }
    }
    return rawPrice;
  }

  /**
   * Get warehouse key from inventory name (delegates to WholesalerConfigService)
   */
  private async getWarehouseKey(inventoryName: string): Promise<string | null> {
    return wholesalerConfigService.getWarehouseKey(inventoryName);
  }

  /**
   * Get baselinkerProductId prefix for a given inventory name (delegates to WholesalerConfigService)
   */
  private async getInventoryPrefix(inventoryName: string): Promise<string> {
    return wholesalerConfigService.getInventoryPrefix(inventoryName);
  }

  /**
   * Get SKU prefix for a given inventory name (delegates to WholesalerConfigService)
   */
  private async getSkuPrefix(inventoryName: string): Promise<string> {
    return wholesalerConfigService.getSkuPrefix(inventoryName);
  }

  /**
   * Round price to .99 ending (e.g., 12.34 → 12.99, 50.00 → 50.99)
   * This makes prices more attractive psychologically
   */
  private roundPriceTo99(price: number): number {
    if (price <= 0) return 0;
    const rounded = Math.floor(price) + 0.99;
    // Clamp to max Decimal(10,2) to prevent numeric field overflow in PostgreSQL
    return Math.min(rounded, 99999999.99);
  }

  /** Clamp any price to fit Decimal(10,2) — max 99999999.99 */
  private clampPrice(price: number): number {
    if (!Number.isFinite(price) || price < 0) return 0;
    return Math.min(price, 99999999.99);
  }

  /**
   * Get product price from Baselinker product data
   * BaseLinker can return prices in different fields:
   * - price_brutto: direct price (simple products)
   * - prices: object with price groups { group_id: price } (inventory products)
   * 
   * Priority:
   * 1. price_brutto (if exists)
   * 2. Default PLN price group (ID 10034)
   * 3. First non-zero price from any group
   * 4. price_netto + tax
   * 
   * All prices are passed through price multiplier rules (if available) and rounded to .99 ending
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getProductPrice(blProduct: any, warehouseKey?: string | null, priceRules?: Record<string, Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }>>): number {
    let rawPrice = 0;

    // First try direct price_brutto
    if (blProduct.price_brutto && parseFloat(blProduct.price_brutto) > 0) {
      rawPrice = parseFloat(blProduct.price_brutto);
    }
    // Try prices object (inventory price groups)
    else if (blProduct.prices && typeof blProduct.prices === 'object') {
      // Priority 1: Default PLN price group
      const plnPrice = blProduct.prices[this.defaultPriceGroupId];
      if (plnPrice && parseFloat(plnPrice) > 0) {
        rawPrice = parseFloat(plnPrice);
      } else {
        // Priority 2: First non-zero price (fallback)
        for (const [groupId, price] of Object.entries(blProduct.prices)) {
          const numPrice = parseFloat(String(price));
          if (numPrice > 0) {
            console.log(`[BaselinkerSync] Using price from group ${groupId} (not default PLN): ${numPrice}`);
            rawPrice = numPrice;
            break;
          }
        }
      }
    }
    // Try price_netto + tax
    else if (blProduct.price_netto && parseFloat(blProduct.price_netto) > 0) {
      const taxRate = blProduct.tax_rate || 23; // Default VAT 23%
      rawPrice = parseFloat(blProduct.price_netto) * (1 + taxRate / 100);
    }
    
    // Apply price multiplier rules if available
    if (warehouseKey && priceRules) {
      rawPrice = this.applyPriceMultiplier(rawPrice, warehouseKey, priceRules);
    }

    // Round to .99 ending
    return this.roundPriceTo99(rawPrice);
  }

  /**
   * Get product EAN/barcode from Baselinker product data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getProductEan(blProduct: any): string | null {
    // Direct ean field
    if (blProduct.ean && String(blProduct.ean).trim()) {
      return String(blProduct.ean).trim();
    }
    
    // Sometimes EAN is in text_fields or other places
    if (blProduct.text_fields?.ean) {
      return String(blProduct.text_fields.ean).trim();
    }
    
    return null;
  }

  /**
   * Generate a simple hash for product comparison
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateProductHash(blProduct: any): string {
    const data = {
      name: this.getProductName(blProduct),
      sku: blProduct.sku || '',
      ean: this.getProductEan(blProduct) || '',
      price: this.getProductPrice(blProduct),
      category_id: blProduct.category_id || 0,
      imageCount: blProduct.images ? Object.keys(blProduct.images).length : 0,
      variantCount: blProduct.variants?.length || 0,
    };
    return JSON.stringify(data);
  }

  /**
   * Dry run: Fetch products from a specific Baselinker inventory without saving to DB.
   * Returns preview data for admin panel.
   * @param inventoryId - Baselinker inventory ID to fetch from
   * @param limit - Maximum number of products to fetch (default 100)
   */
  async dryRunFetchProducts(inventoryId: string, limit: number = 100): Promise<{
    inventoryName: string;
    inventoryId: string;
    warehouseKey: string | null;
    prefix: string;
    skuPrefix: string;
    totalInBaselinker: number;
    fetchedCount: number;
    alreadyInDb: number;
    products: Array<{
      baselinkerProductId: string;
      name: string;
      sku: string;
      ean: string | null;
      rawPrice: number;
      finalPrice: number;
      quantity: number;
      categoryId: number | null;
      categoryName: string | null;
      tags: string[];
      imageCount: number;
      variantCount: number;
      existsInDb: boolean;
    }>;
  }> {
    const provider = await this.createProvider();
    const priceRules = await this.loadPriceRules();

    // Get inventory info
    const allInventories = await provider.getInventories();
    const currentInventory = allInventories.find(inv => inv.inventory_id.toString() === inventoryId);
    if (!currentInventory) {
      throw new Error(`Nie znaleziono magazynu o ID: ${inventoryId}. Dostępne: ${allInventories.map(i => `${i.name} (${i.inventory_id})`).join(', ')}`);
    }

    const warehouseKey = await this.getWarehouseKey(currentInventory.name);
    const inventoryPrefix = await this.getInventoryPrefix(currentInventory.name);
    const skuPrefix = await this.getSkuPrefix(currentInventory.name);

    // Fetch category names for display
    const blCategories = await provider.getInventoryCategories(inventoryId);
    const categoryMap = new Map<number, string>();
    for (const cat of blCategories) {
      categoryMap.set(cat.category_id, cat.name);
    }

    console.log(`[DryRun] Fetching products from "${currentInventory.name}" (ID: ${inventoryId}), limit: ${limit}`);

    // Fetch product list (lightweight - just IDs and basic info)
    const productList = await provider.getAllInventoryProducts(inventoryId);
    const totalInBaselinker = productList.length;

    // Take only the first `limit` products for detailed fetch
    const productIdsToFetch = productList.slice(0, limit).map(p => p.id);

    // Fetch detailed data
    const detailedProducts = await provider.getInventoryProductsData(inventoryId, productIdsToFetch);

    // Check which products already exist in DB
    const blIds = detailedProducts.map(p => `${inventoryPrefix}${p.id}`);
    const existingProducts = await prisma.product.findMany({
      where: { baselinkerProductId: { in: blIds } },
      select: { baselinkerProductId: true },
    });
    const existingSet = new Set(existingProducts.map(p => p.baselinkerProductId));

    // Build preview data
    const products = detailedProducts.map(blProduct => {
      const baselinkerProductId = `${inventoryPrefix}${blProduct.id}`;
      const name = this.getProductName(blProduct);
      const rawPrice = blProduct.price_brutto ? parseFloat(String(blProduct.price_brutto)) : 0;
      const finalPrice = this.getProductPrice(blProduct, warehouseKey, priceRules);
      const ean = this.getProductEan(blProduct);
      const sku = blProduct.sku ? `${skuPrefix}${blProduct.sku}` : `${skuPrefix}BL-${blProduct.id}`;
      const tags = (blProduct.tags || []).map((t: string) => t.trim()).filter(Boolean);

      return {
        baselinkerProductId,
        name: name || `Product ${blProduct.id}`,
        sku,
        ean,
        rawPrice,
        finalPrice,
        quantity: blProduct.quantity || 0,
        categoryId: blProduct.category_id || null,
        categoryName: blProduct.category_id ? (categoryMap.get(blProduct.category_id) || null) : null,
        tags,
        imageCount: blProduct.images ? Object.keys(blProduct.images).length : 0,
        variantCount: blProduct.variants?.length || 0,
        existsInDb: existingSet.has(baselinkerProductId),
      };
    });

    const alreadyInDb = products.filter(p => p.existsInDb).length;

    console.log(`[DryRun] Fetched ${products.length}/${totalInBaselinker} products from "${currentInventory.name}". Already in DB: ${alreadyInDb}`);

    return {
      inventoryName: currentInventory.name,
      inventoryId,
      warehouseKey,
      prefix: inventoryPrefix,
      skuPrefix,
      totalInBaselinker,
      fetchedCount: products.length,
      alreadyInDb,
      products,
    };
  }

  /**
   * Sync products from Baselinker (incremental - only changes)
   * @param mode - 'new-only' (tylko nowe produkty, bez stanów 0), 'update-only' (tylko aktualizacja istniejących), undefined (wszystko)
   * @param syncLogId - optional sync log ID for progress tracking
   */
  async syncProducts(
    provider: BaselinkerProvider,
    inventoryId: string,
    mode?: string,
    syncLogId?: string,
    filterTag?: string
  ): Promise<{ processed: number; errors: string[]; skipped: number; changedProducts: { sku: string; name: string; changes: string[] }[] }> {
    const errors: string[] = [];
    let processed = 0;
    let skipped = 0;
    const changedProducts: { sku: string; name: string; changes: string[] }[] = [];

    // EMERGENCY DEBUG - this MUST appear in console if this code runs
    if (syncLogId) {
      syncProgress.sendProgress(syncLogId, {
        type: 'info',
        message: `[v7-DEBUG] syncProducts called: inventoryId=${inventoryId}, mode=${mode || 'all'}`,
      });
    }

    try {
      console.log(`[BaselinkerSync] Starting products sync with mode: ${mode || 'all'}...`);
      
      // Load price multiplier rules and determine warehouse from inventory
      const priceRules = await this.loadPriceRules();
      const allInventories = await provider.getInventories();
      const currentInventory = allInventories.find(inv => inv.inventory_id.toString() === inventoryId);
      const warehouseKey = currentInventory ? await this.getWarehouseKey(currentInventory.name) : null;
      // Get inventory prefix for baselinkerProductId (e.g., "leker-", "btp-", "hp-")
      const inventoryPrefix = currentInventory ? await this.getInventoryPrefix(currentInventory.name) : '';
      const skuPrefix = currentInventory ? await this.getSkuPrefix(currentInventory.name) : '';
      console.log(`[BaselinkerSync] Inventory: ${currentInventory?.name || inventoryId}, warehouse: ${warehouseKey || 'unknown'}, prefix: "${inventoryPrefix}", skuPrefix: "${skuPrefix}", price rules: ${warehouseKey && priceRules[warehouseKey] ? priceRules[warehouseKey].length + ' rules' : 'none'}`);

      if (syncLogId) {
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Pobieranie listy produktów z Baselinker (tryb: ${mode || 'all'})... [inv: ${currentInventory?.name || inventoryId}, prefix: "${inventoryPrefix}"]`,
        });
      }
      
      // Get all product IDs from Baselinker (lightweight call)
      console.log('[BaselinkerSync] Fetching product list...');
      const productList = await provider.getAllInventoryProducts(inventoryId, (page, totalSoFar) => {
        if (syncLogId) {
          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `Pobrano stronę ${page} z Baselinker (${totalSoFar} produktów)...`,
          });
        }
      }, () => syncLogId ? syncProgress.isAborted(syncLogId) : false);
      console.log(`[BaselinkerSync] Found ${productList.length} products in Baselinker`);
      if (syncLogId) {
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Pobrano listę ${productList.length} produktów z Baselinker. Porównywanie z bazą...`,
        });
      }

      // Pre-fetch existing products with essential data for comparison
      const existingProducts = await prisma.product.findMany({
        where: { baselinkerProductId: { not: null } },
        select: {
          id: true,
          baselinkerProductId: true,
          name: true,
          sku: true,
          barcode: true,
          price: true,
          categoryId: true,
          images: { select: { id: true } },
          variants: { select: { id: true, baselinkerVariantId: true } },
        },
      });

      const existingMap = new Map(
        existingProducts.map(p => [p.baselinkerProductId as string, p])
      );

      console.log(`[BaselinkerSync] Found ${existingProducts.length} existing products in database`);

      // Debug: count how many DB products match the current prefix
      const prefixMatchCount = existingProducts.filter(p => p.baselinkerProductId?.startsWith(inventoryPrefix)).length;
      console.log(`[BaselinkerSync] DB products matching prefix "${inventoryPrefix}": ${prefixMatchCount}`);
      if (syncLogId) {
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Baza: ${existingProducts.length} produktów, ${prefixMatchCount} z prefixem "${inventoryPrefix}"`,
        });
      }

      // First pass: identify which products need updating based on mode
      const productsToFetch: number[] = [];
      
      // Skip reason tracking for better diagnostics
      let skippedExisting = 0;
      let skippedUnchanged = 0;
      
      // Debug first 3 products
      const debugSamples: string[] = [];
      
      for (const blProduct of productList) {
        const blIdRaw = blProduct.id.toString();
        const blId = `${inventoryPrefix}${blIdRaw}`;
        const existing = existingMap.get(blId);
        
        if (debugSamples.length < 3) {
          debugSamples.push(`BL:${blIdRaw} → "${blId}" → ${existing ? 'FOUND' : 'NOT FOUND'}`);
        }
        
        // MODE: fetch-all - pobierz wszystkie produkty (inicjalizacja)
        if (mode === 'fetch-all') {
          // Skip only if product already exists
          if (existing) {
            skipped++;
            skippedExisting++;
            continue;
          }
          // Pobierz wszystkie nowe produkty, nawet ze stanem 0
          productsToFetch.push(blProduct.id);
          continue;
        }
        
        // MODE: full-resync - pobierz WSZYSTKIE produkty (nowe i istniejące)
        if (mode === 'full-resync') {
          productsToFetch.push(blProduct.id);
          continue;
        }
        
        // MODE: new-only - tylko nowe produkty (importuj wszystkie, nawet ze stanem 0)
        if (mode === 'new-only') {
          // Skip if product already exists
          if (existing) {
            skipped++;
            skippedExisting++;
            continue;
          }
          
          productsToFetch.push(blProduct.id);
          continue;
        }
        
        // MODE: update-only - tylko aktualizacja istniejących
        if (mode === 'update-only') {
          // Skip if product does not exist
          if (!existing) {
            skipped++;
            skippedExisting++;
            continue;
          }
          
          productsToFetch.push(blProduct.id);
          continue;
        }
        
        // MODE: all (default) - standardowa logika inkrementalna
        if (!existing) {
          // New product - needs full fetch
          productsToFetch.push(blProduct.id);
          continue;
        }
        
        // Quick comparison - if basic fields differ, fetch full data
        const listPrice = this.getProductPrice(blProduct, warehouseKey, priceRules);
        const priceChanged = existing.price && Math.abs(parseFloat(existing.price.toString()) - listPrice) > 0.01;
        const skuChanged = existing.sku !== (blProduct.sku || `BL-${blProduct.id}`);
        const nameChanged = existing.name !== blProduct.name;
        
        if (priceChanged || skuChanged || nameChanged) {
          productsToFetch.push(blProduct.id);
        } else {
          skipped++;
          skippedUnchanged++;
        }
      }

      console.log(`[BaselinkerSync] ${productsToFetch.length} products to process, ${skipped} skipped (mode: ${mode || 'all'})`);
      console.log(`[BaselinkerSync] Debug samples:`, debugSamples);
      if (mode === 'new-only') {
        console.log(`[BaselinkerSync] Skip reasons: existing=${skippedExisting}`);
      }

      if (syncLogId) {
        // Show debug info in admin console
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Debug: ${debugSamples.join(' | ')}`,
        });
        
        let skipDetails = '';
        if (mode === 'new-only') {
          skipDetails = skippedExisting > 0 ? ` (${skippedExisting} już istnieje)` : '';
        } else if (mode === 'update-only') {
          skipDetails = skippedExisting > 0 ? ` (${skippedExisting} nie istnieje w bazie)` : '';
        } else if (mode === 'fetch-all') {
          skipDetails = skippedExisting > 0 ? ` (${skippedExisting} już istnieje)` : '';
        } else {
          skipDetails = skippedUnchanged > 0 ? ` (${skippedUnchanged} bez zmian)` : '';
        }
        
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Znaleziono ${productsToFetch.length} produktów do przetworzenia, ${skipped} pominiętych${skipDetails} [pfx="${inventoryPrefix}", inv=${currentInventory?.name || '?'}, dbMatch=${prefixMatchCount}]`,
          current: 0,
          total: productsToFetch.length,
          percent: 0,
        });
      }

      if (productsToFetch.length === 0) {
        console.log('[BaselinkerSync] No products to process, skipping fetch');
        return { processed: 0, errors, skipped, changedProducts };
      }

      // Fetch detailed data only for changed products
      console.log('[BaselinkerSync] Fetching detailed data for products...');
      if (syncLogId) {
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Pobieranie szczegółów ${productsToFetch.length} produktów z Baselinker...`,
        });
      }
      const products = await provider.getInventoryProductsData(inventoryId, productsToFetch, (chunk, totalChunks, productsSoFar) => {
        if (syncLogId) {
          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `Pobieranie szczegółów: paczka ${chunk}/${totalChunks} (${productsSoFar} produktów)...`,
          });
        }
      });
      console.log(`[BaselinkerSync] Got ${products.length} product details`);
      
      // Filter by tag if specified
      let filteredProducts = products;
      if (filterTag) {
        filteredProducts = products.filter(p => p.tags?.some(t => t.toLowerCase() === filterTag.toLowerCase()));
        const tagFiltered = products.length - filteredProducts.length;
        console.log(`[BaselinkerSync] Tag filter "${filterTag}": ${filteredProducts.length} match, ${tagFiltered} skipped`);
        if (syncLogId) {
          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `Filtr tagu "${filterTag}": ${filteredProducts.length} produktów pasuje, ${tagFiltered} pominiętych`,
          });
        }
      }

      if (syncLogId) {
        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Pobrano ${filteredProducts.length} produktów. Rozpoczynanie przetwarzania...`,
          total: filteredProducts.length,
        });
      }

      // Process in batches of 50 for faster throughput
      const batchSize = 50;
      // Cache category lookups to avoid repeated DB queries
      const categoryCache = new Map<string, Awaited<ReturnType<typeof this.findCategoryByBaselinkerIdcatId>>>();
      
      for (let i = 0; i < filteredProducts.length; i += batchSize) {
        // Check for abort before each batch
        if (syncLogId && syncProgress.isAborted(syncLogId)) {
          throw new Error('ABORTED');
        }
        
        const batch = filteredProducts.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(filteredProducts.length / batchSize);
        const batchStart = Date.now();
        console.log(`[BaselinkerSync] Processing products batch ${batchNum}/${totalBatches}`);
        
        if (syncLogId) {
          syncProgress.sendProgress(syncLogId, {
            type: 'progress',
            message: `Przetwarzanie partii ${batchNum}/${totalBatches}...`,
            phase: 'products',
            current: Math.min(i + batchSize, filteredProducts.length),
            total: filteredProducts.length,
            percent: Math.round(((i + batchSize) / filteredProducts.length) * 100),
          });
        }

        // Pre-fetch categories for this batch BEFORE opening transaction
        for (const blProduct of batch) {
          if (blProduct.category_id) {
            const catKey = blProduct.category_id.toString();
            if (!categoryCache.has(catKey)) {
              categoryCache.set(catKey, await this.findCategoryByBaselinkerIdcatId(catKey));
            }
          }
        }

        // Collect price updates to execute AFTER transaction (avoids nested tx deadlock)
        const pendingPriceUpdates: Array<{ type: 'product' | 'variant'; id: string; newPrice: number }> = [];

        try {
        await prisma.$transaction(
          async (tx) => {
            for (const blProduct of batch) {
              try {
                const baselinkerProductId = `${inventoryPrefix}${blProduct.id.toString()}`;
              const sku = generateSku(blProduct.id, blProduct.sku, skuPrefix);
              console.log(`[BaselinkerSync] Processing product ${baselinkerProductId} (${sku})`);
              
              // Get name and description using helper methods
              let name = this.getProductName(blProduct);
              if (!name) {
                name = `Product ${blProduct.id}`;
                console.log(`[BaselinkerSync] Warning: No name found for product ${blProduct.id}, using fallback`);
              }
              const description = this.getProductDescription(blProduct);
              const productPrice = this.getProductPrice(blProduct, warehouseKey, priceRules);
              const productEan = this.getProductEan(blProduct);
              
              // Debug log for price issues
              if (productPrice === 0) {
                console.log(`[BaselinkerSync] Warning: Product ${blProduct.id} has price 0. Raw data:`, {
                  price_brutto: blProduct.price_brutto,
                  price_wholesale_netto: blProduct.price_wholesale_netto,
                });
                if (syncLogId) {
                  syncProgress.sendProgress(syncLogId, {
                    type: 'warning',
                    message: `Produkt "${name}" (ID: ${blProduct.id}) ma cenę 0 zł!`,
                    productName: name,
                    sku,
                  });
                }
              }
              
              // Warn about missing tags
              const productTagsRaw = (blProduct.tags || []).map((tag: string) => tag.trim()).filter(Boolean);
              if (productTagsRaw.length === 0 && syncLogId) {
                syncProgress.sendProgress(syncLogId, {
                  type: 'warning',
                  message: `Produkt "${name}" (ID: ${blProduct.id}) nie ma tagów`,
                  productName: name,
                  sku,
                });
              }
              
              const slug = await this.ensureUniqueProductSlug(slugify(name) || `product-${baselinkerProductId}`, baselinkerProductId, tx);

              // Find category by Baselinker category_id (from pre-fetched cache)
              const category = blProduct.category_id
                ? categoryCache.get(blProduct.category_id.toString()) ?? null
                : null;
              
              // Get baselinker category path for product record (from the category if found)
              let baselinkerCategoryPath: string | null = null;
              if (category) {
                const catWithPath = await tx.category.findUnique({
                  where: { id: category.id },
                  select: { baselinkerCategoryPath: true },
                });
                baselinkerCategoryPath = catWithPath?.baselinkerCategoryPath || null;
              }

              // Get tags (trim whitespace from each tag)
              const productTags = (blProduct.tags || []).map((tag: string) => tag.trim()).filter(Boolean);

              // Check if product exists
              const existingProduct = await tx.product.findUnique({
                where: { baselinkerProductId },
                select: { id: true, price: true, name: true, sku: true, barcode: true, description: true, categoryId: true, tags: true, compareAtPrice: true },
              });

              // Detect outlet products - preserve their category, tags, and sale pricing
              const isOutletProduct = baselinkerProductId.startsWith('outlet-');

              let product;
              
              if (existingProduct) {
                // Track what changed
                const productChanges: string[] = [];
                if (existingProduct.name !== name) productChanges.push(`Nazwa: "${existingProduct.name}" → "${name}"`);
                const existingSku = existingProduct.sku;
                const newSku = await this.ensureUniqueSku(sku, baselinkerProductId, tx);
                if (existingSku !== newSku) productChanges.push(`SKU: ${existingSku} → ${newSku}`);
                if (existingProduct.barcode !== productEan) productChanges.push(`EAN: ${existingProduct.barcode || 'brak'} → ${productEan || 'brak'}`);
                const currentPrice = Number(existingProduct.price);
                if (Math.abs(currentPrice - productPrice) > 0.01) productChanges.push(`Cena: ${currentPrice.toFixed(2)} → ${productPrice.toFixed(2)} zł`);
                if (existingProduct.categoryId !== (category?.id || null)) productChanges.push('Kategoria zmieniona');
                
                // Product exists - update without price first
                // For outlet products, preserve category, tags, and compareAtPrice
                const updateData: any = {
                    name,
                    slug,
                    description,
                    sku: newSku,
                    barcode: productEan,
                    baselinkerCategoryPath: baselinkerCategoryPath,
                    status: 'ACTIVE',
                    specifications: blProduct.features || {},
                };

                // Replace tags from Baselinker (full update)
                // For outlet products, always include 'outlet' and 'zwrot' tags
                const requiredTags = isOutletProduct ? ['outlet', 'zwrot'] : [];
                updateData.tags = [...new Set([...productTags, ...requiredTags])];
                // Update category from Baselinker, keep existing only if BL has no category
                updateData.categoryId = category?.id || existingProduct.categoryId || null;

                product = await tx.product.update({
                  where: { baselinkerProductId },
                  data: updateData,
                });
                
                if (productChanges.length > 0) {
                  changedProducts.push({ sku: newSku, name, changes: productChanges });
                }
                
                // Handle price change with Omnibus compliance
                // Skip for products with active promotions (compareAtPrice) to preserve sale pricing
                if (Math.abs(currentPrice - productPrice) > 0.01) {
                  if (existingProduct.compareAtPrice) {
                    // Product has active promotion — don't overwrite price
                    if (syncLogId) {
                      syncProgress.sendProgress(syncLogId, {
                        type: 'info',
                        message: `🛡️ "${name}" — pominięto zmianę ceny (aktywna promocja)`,
                        productName: name,
                        sku,
                      });
                    }
                  } else {
                    // Schedule price update AFTER transaction to avoid nested tx deadlock
                    pendingPriceUpdates.push({ type: 'product', id: existingProduct.id, newPrice: productPrice });
                  }
                }
              } else {
                // New product - create with initial price (no history needed)
                // For outlet products, ensure 'outlet' and 'zwrot' tags are always included
                const newProductTags = isOutletProduct
                  ? [...new Set([...productTags, 'outlet', 'zwrot'])]
                  : productTags;
                
                product = await tx.product.create({
                  data: {
                    baselinkerProductId,
                    name,
                    slug,
                    description,
                    sku: await this.ensureUniqueSku(sku, baselinkerProductId, tx),
                    barcode: productEan,
                    price: productPrice,
                    lowestPrice30Days: productPrice, // Initial lowest = current price
                    lowestPrice30DaysAt: new Date(),
                    categoryId: category?.id || null,
                    baselinkerCategoryPath: baselinkerCategoryPath,
                    status: 'ACTIVE',
                    specifications: blProduct.features || {},
                    tags: newProductTags,
                  },
                });
              }

              // Sync images
              if (blProduct.images && Object.keys(blProduct.images).length > 0) {
                // Delete existing images
                await tx.productImage.deleteMany({
                  where: { productId: product.id },
                });

                // Save original image URLs (image-proxy caches them on first access)
                // Deduplicate: same URL + Baselinker CDN thumbs (all return same image)
                const imageEntries = Object.entries(blProduct.images).sort(([a], [b]) => parseInt(a) - parseInt(b));
                const rawUrls = imageEntries.map(([, u]) => (u as string).trim()).filter(Boolean);
                const uniqueUrls = deduplicateImageUrls(rawUrls);

                let imgOrder = 0;
                for (const url of uniqueUrls) {
                  await tx.productImage.create({
                    data: {
                      productId: product.id,
                      url,
                      order: imgOrder++,
                    },
                  });
                }
              }

              // Sync variants if they exist
              if (blProduct.variants && blProduct.variants.length > 0) {
                for (const blVariant of blProduct.variants) {
                  const variantId = blVariant.variant_id.toString();
                  const variantSku = generateSku(blVariant.variant_id, blVariant.sku, skuPrefix);
                  // Apply price multiplier rules + round to .99 ending (use product price if variant has no price)
                  let rawVariantPrice = blVariant.price_brutto ? Number(blVariant.price_brutto) : 0;
                  if (rawVariantPrice > 0 && warehouseKey && priceRules) {
                    rawVariantPrice = this.applyPriceMultiplier(rawVariantPrice, warehouseKey, priceRules);
                  }
                  const variantPrice = rawVariantPrice > 0 ? this.roundPriceTo99(rawVariantPrice) : productPrice;
                  const variantEan = blVariant.ean ? String(blVariant.ean).trim() : null;

                  // Build variant attributes from name (for variant selection on frontend)
                  const variantAttributes = blVariant.name ? { "Wariant": blVariant.name } : {};

                  // Check if variant exists
                  const existingVariant = await tx.productVariant.findUnique({
                    where: { baselinkerVariantId: variantId },
                    select: { id: true, price: true },
                  });

                  if (existingVariant) {
                    // Variant exists - update without price
                    await tx.productVariant.update({
                      where: { baselinkerVariantId: variantId },
                      data: {
                        name: blVariant.name,
                        sku: await this.ensureUniqueVariantSku(variantSku, variantId, tx),
                        barcode: variantEan,
                        attributes: variantAttributes,
                      },
                    });
                    
                    // Handle price change with Omnibus compliance
                    const currentVariantPrice = Number(existingVariant.price);
                    if (currentVariantPrice !== variantPrice) {
                      pendingPriceUpdates.push({ type: 'variant', id: existingVariant.id, newPrice: variantPrice });
                    }
                  } else {
                    // New variant - create with initial price
                    await tx.productVariant.create({
                      data: {
                        baselinkerVariantId: variantId,
                        productId: product.id,
                        name: blVariant.name,
                        sku: await this.ensureUniqueVariantSku(variantSku, variantId, tx),
                        barcode: variantEan,
                        price: variantPrice,
                        lowestPrice30Days: variantPrice,
                        lowestPrice30DaysAt: new Date(),
                        attributes: variantAttributes,
                      },
                    });
                  }
                }
              } else {
                // Create default variant for product without variants
                const defaultVariantId = `default-${baselinkerProductId}`;
                
                // Check if default variant exists by baselinkerVariantId
                const existingDefaultVariant = await tx.productVariant.findUnique({
                  where: { baselinkerVariantId: defaultVariantId },
                  select: { id: true, price: true },
                });

                if (existingDefaultVariant) {
                  // Update default variant without price
                  await tx.productVariant.update({
                    where: { baselinkerVariantId: defaultVariantId },
                    data: {
                      name: 'Domyślny',
                      sku: await this.ensureUniqueVariantSku(`${sku}-DEFAULT`, defaultVariantId, tx),
                      barcode: productEan,
                    },
                  });
                  
                  // Handle price change with Omnibus compliance
                  const currentDefaultPrice = Number(existingDefaultVariant.price);
                  if (currentDefaultPrice !== productPrice) {
                    pendingPriceUpdates.push({ type: 'variant', id: existingDefaultVariant.id, newPrice: productPrice });
                  }
                } else {
                  // Before creating a default variant, check if the product already has
                  // any variant (e.g., created by sync-outlet.js or price sync).
                  // This prevents creating duplicate variants for outlet products.
                  const existingProductVariants = await tx.productVariant.findMany({
                    where: { productId: product.id },
                    select: { id: true, baselinkerVariantId: true, price: true },
                    take: 1,
                  });

                  if (existingProductVariants.length > 0) {
                    // Product already has a variant — adopt it by setting baselinkerVariantId
                    const existingVar = existingProductVariants[0];
                    if (!existingVar.baselinkerVariantId) {
                      await tx.productVariant.update({
                        where: { id: existingVar.id },
                        data: { baselinkerVariantId: defaultVariantId },
                      });
                    }
                    // Handle price change if needed
                    const currentVarPrice = Number(existingVar.price);
                    if (Math.abs(currentVarPrice - productPrice) > 0.01) {
                      pendingPriceUpdates.push({ type: 'variant', id: existingVar.id, newPrice: productPrice });
                    }
                  } else {
                    // Create new default variant
                    await tx.productVariant.create({
                      data: {
                        baselinkerVariantId: defaultVariantId,
                        productId: product.id,
                        name: 'Domyślny',
                        sku: await this.ensureUniqueVariantSku(`${sku}-DEFAULT`, defaultVariantId, tx),
                        barcode: productEan,
                        price: productPrice,
                        lowestPrice30Days: productPrice,
                        lowestPrice30DaysAt: new Date(),
                      },
                    });
                  }
                }
              }

              processed++;
              
              if (syncLogId) {
                syncProgress.sendProgress(syncLogId, {
                  type: 'info',
                  message: `✓ ${name} (${sku})`,
                  productName: name,
                  sku,
                  current: processed,
                  total: filteredProducts.length,
                });
              }
            } catch (error) {
              const errMsg = `Product ${blProduct.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
              errors.push(errMsg);
              if (syncLogId) {
                syncProgress.sendProgress(syncLogId, {
                  type: 'error',
                  message: `✗ Błąd produktu ${blProduct.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                });
              }
            }
          }
        },
        {
          maxWait: 60000, // 60 seconds max wait to acquire connection
          timeout: 120000, // 2 minutes timeout for the transaction
        });

        // Execute pending price updates AFTER transaction commit (avoids nested tx deadlock)
        // Process sequentially to avoid Prisma P2034 deadlocks
        for (const pu of pendingPriceUpdates) {
          const MAX_RETRIES = 3;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              if (pu.type === 'product') {
                await priceHistoryService.updateProductPrice({
                  productId: pu.id,
                  newPrice: pu.newPrice,
                  source: PriceChangeSource.BASELINKER,
                  reason: 'Baselinker sync',
                });
              } else {
                await priceHistoryService.updateVariantPrice({
                  variantId: pu.id,
                  newPrice: pu.newPrice,
                  source: PriceChangeSource.BASELINKER,
                  reason: 'Baselinker sync',
                });
              }
              break; // success
            } catch (priceErr: any) {
              if (priceErr?.code === 'P2034' && attempt < MAX_RETRIES) {
                console.warn(`[BaselinkerSync] Price update retry ${attempt}/${MAX_RETRIES} for ${pu.type} ${pu.id}`);
                continue;
              }
              console.error(`[BaselinkerSync] Price update error for ${pu.type} ${pu.id}:`, priceErr);
            }
          }
        }
        } catch (batchErr) {
          // Batch transaction failed — log error and continue with next batch
          const batchErrMsg = batchErr instanceof Error ? batchErr.message : 'Unknown error';
          console.error(`[BaselinkerSync] Batch ${batchNum}/${totalBatches} failed after ${Math.round((Date.now() - batchStart) / 1000)}s: ${batchErrMsg}`);
          errors.push(`Batch ${batchNum} failed: ${batchErrMsg}`);
          if (syncLogId) {
            syncProgress.sendProgress(syncLogId, {
              type: 'error',
              message: `✗ Partia ${batchNum}/${totalBatches} nie powiodła się: ${batchErrMsg}. Kontynuowanie...`,
            });
          }
        }

        console.log(`[BaselinkerSync] Batch ${batchNum}/${totalBatches} completed in ${Math.round((Date.now() - batchStart) / 1000)}s`);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'ABORTED') throw error;
      errors.push(`Failed to fetch products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { processed, errors, skipped, changedProducts };
  }

  /**
   * Ensure unique product slug
   */
  private async ensureUniqueProductSlug(baseSlug: string, baselinkerProductId: string, client: any = prisma): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (counter < 10000) {
      const existing = await client.product.findUnique({
        where: { slug },
      });

      if (!existing || existing.baselinkerProductId === baselinkerProductId) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    // Fallback if we hit the limit
    return `${baseSlug}-${Date.now()}`;
  }

  /**
   * Ensure unique SKU
   */
  private async ensureUniqueSku(baseSku: string, baselinkerProductId: string, client: any = prisma): Promise<string> {
    let sku = baseSku;
    let counter = 1;

    while (counter < 10000) {
      const existing = await client.product.findUnique({
        where: { sku },
      });

      if (!existing || existing.baselinkerProductId === baselinkerProductId) {
        return sku;
      }

      sku = `${baseSku}-${counter}`;
      counter++;
    }
    
    // Fallback if we hit the limit
    return `${baseSku}-${Date.now()}`;
  }

  /**
   * Ensure unique variant SKU
   */
  private async ensureUniqueVariantSku(baseSku: string, baselinkerVariantId: string, client: any = prisma): Promise<string> {
    let sku = baseSku;
    let counter = 1;

    while (counter < 10000) {
      const existing = await client.productVariant.findUnique({
        where: { sku },
      });

      if (!existing || existing.baselinkerVariantId === baselinkerVariantId) {
        return sku;
      }

      sku = `${baseSku}-${counter}`;
      counter++;
    }
    
    // Fallback if we hit the limit
    return `${baseSku}-${Date.now()}`;
  }

  /**
   * Sync stock levels from Baselinker
   * Iterates over ALL inventories to match products with prefixed baselinkerProductId
   */
  async syncStock(
    provider: BaselinkerProvider,
    inventoryId: string,
    syncLogId?: string
  ): Promise<{ processed: number; errors: string[]; changed: number; changedSkus: { sku: string; oldQty: number; newQty: number; inventory: string }[] }> {
    const errors: string[] = [];
    let processed = 0;
    let changed = 0;
    const changedSkus: { sku: string; oldQty: number; newQty: number; inventory: string }[] = [];

    try {
      // Get default location by code MAIN
      let defaultLocation = await prisma.location.findFirst({
        where: { code: 'MAIN', type: 'WAREHOUSE', isActive: true },
      });

      if (!defaultLocation) {
        defaultLocation = await prisma.location.create({
          data: {
            name: 'Magazyn główny',
            code: 'MAIN',
            type: 'WAREHOUSE',
            isActive: true,
          },
        });
      }

      // Fetch inventories — if specific inventoryId provided, only sync that one
      const allInventories = await provider.getInventories();
      const inventories = inventoryId && inventoryId !== 'all'
        ? allInventories.filter(inv => inv.inventory_id.toString() === inventoryId)
        : allInventories;

      if (inventories.length === 0 && inventoryId !== 'all') {
        errors.push(`Inventory ${inventoryId} not found in Baselinker`);
      }

      for (const inv of inventories) {
        // Skip inventories marked as skipInSync in wholesaler config
        if (await wholesalerConfigService.shouldSkipInventory(inv.name)) {
          console.log(`[BaselinkerSync] Skipping inventory: ${inv.name}`);
          continue;
        }

        const prefix = await this.getInventoryPrefix(inv.name);
        console.log(`[BaselinkerSync] Syncing stock from inventory: ${inv.name} (${inv.inventory_id}), prefix: "${prefix}"`);

        if (syncLogId) {
          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `📦 Pobieranie stanów z magazynu: ${inv.name}...`,
            phase: 'stock',
          });
        }

        try {
          const stockEntries = await provider.getInventoryProductsStock(inv.inventory_id.toString());
          console.log(`[BaselinkerSync] Fetched ${stockEntries.length} stock entries from ${inv.name}`);

          if (syncLogId) {
            syncProgress.sendProgress(syncLogId, {
              type: 'info',
              message: `📦 ${inv.name}: pobrano ${stockEntries.length} pozycji, dopasowywanie...`,
              phase: 'stock',
            });
          }

          // === OPTIMIZATION: Batch processing instead of individual queries ===
          
          // 1. Collect all IDs we need to look up
          const prefixedIds = stockEntries.map(entry => {
            const numericId = entry.product_id.toString();
            return prefix ? `${prefix}${numericId}` : numericId;
          });
          const numericIds = stockEntries.map(entry => entry.product_id.toString());

          // 2. Batch fetch all variants — chunked to stay under PostgreSQL 32767 bind variable limit
          const CHUNK_SIZE = 10000;
          const allVariants: { id: string; sku: string | null; baselinkerVariantId: string | null; product: { baselinkerProductId: string | null } | null }[] = [];

          const idsToQuery = prefix ? prefixedIds : numericIds;
          for (let ci = 0; ci < idsToQuery.length; ci += CHUNK_SIZE) {
            const chunk = idsToQuery.slice(ci, ci + CHUNK_SIZE);
            const searchConditions = prefix
              ? [
                  { baselinkerVariantId: { in: chunk } },
                  { product: { baselinkerProductId: { in: chunk } } },
                ]
              : [
                  { baselinkerVariantId: { in: chunk.map(id => `default-${id}`) } },
                  { baselinkerVariantId: { in: chunk } },
                  { product: { baselinkerProductId: { in: chunk } } },
                ];

            const chunkVariants = await prisma.productVariant.findMany({
              where: { OR: searchConditions },
              select: { id: true, sku: true, baselinkerVariantId: true, product: { select: { baselinkerProductId: true } } },
            });
            allVariants.push(...chunkVariants);
          }

          // 3. Build lookup maps for O(1) access
          const variantByBlId = new Map<string, { id: string; sku: string | null }>();
          for (const v of allVariants) {
            if (v.baselinkerVariantId) {
              variantByBlId.set(v.baselinkerVariantId, { id: v.id, sku: v.sku });
            }
            if (v.product?.baselinkerProductId) {
              // Also map by product's baselinkerProductId for products without explicit variant ID
              if (!variantByBlId.has(v.product.baselinkerProductId)) {
                variantByBlId.set(v.product.baselinkerProductId, { id: v.id, sku: v.sku });
              }
            }
          }

          // 4. Batch fetch existing inventory records (chunked for large datasets)
          const variantIds = allVariants.map(v => v.id);
          const existingInventories: { variantId: string; quantity: number }[] = [];
          for (let ci = 0; ci < variantIds.length; ci += CHUNK_SIZE) {
            const chunk = variantIds.slice(ci, ci + CHUNK_SIZE);
            const chunkInv = await prisma.inventory.findMany({
              where: {
                variantId: { in: chunk },
                locationId: defaultLocation.id,
              },
              select: { variantId: true, quantity: true },
            });
            existingInventories.push(...chunkInv);
          }

          const inventoryByVariantId = new Map<string, number>();
          for (const inv of existingInventories) {
            inventoryByVariantId.set(inv.variantId, inv.quantity);
          }

          // 5. Process entries and collect upsert operations
          const upsertOps: { variantId: string; quantity: number; reserved: number; sku: string; oldQty: number }[] = [];

          for (const entry of stockEntries) {
            const numericId = entry.product_id.toString();
            const prefixedId = prefix ? `${prefix}${numericId}` : numericId;

            // Try to find variant using our maps
            let variant = variantByBlId.get(prefixedId);
            if (!variant && !prefix) {
              variant = variantByBlId.get(`default-${numericId}`) || variantByBlId.get(numericId);
            }

            if (!variant) continue;

            const totalStock = Object.values((entry.stock || {}) as Record<string, number>).reduce((sum: number, qty: number) => sum + qty, 0);
            const totalReserved = Object.values((entry.reservations || {}) as Record<string, number>).reduce((sum: number, qty: number) => sum + qty, 0);
            const oldQty = inventoryByVariantId.get(variant.id) ?? 0;

            upsertOps.push({
              variantId: variant.id,
              quantity: totalStock,
              reserved: totalReserved,
              sku: variant.sku || prefixedId,
              oldQty,
            });
          }

          // 6. Execute upserts in batches using transaction
          // Batch size reduced from 500 to 300 to minimize inventory lock duration
          // and prevent checkout transaction timeouts (P2028)
          const BATCH_SIZE = 300;
          for (let i = 0; i < upsertOps.length; i += BATCH_SIZE) {
            const batch = upsertOps.slice(i, i + BATCH_SIZE);
            
            await prisma.$transaction(
              batch.map(op => 
                prisma.inventory.upsert({
                  where: {
                    variantId_locationId: {
                      variantId: op.variantId,
                      locationId: defaultLocation.id,
                    },
                  },
                  update: {
                    quantity: op.quantity,
                    reserved: op.reserved,
                  },
                  create: {
                    variantId: op.variantId,
                    locationId: defaultLocation.id,
                    quantity: op.quantity,
                    reserved: op.reserved,
                  },
                })
              )
            );

            // Brief pause between batches to allow checkout transactions to acquire locks
            if (i + BATCH_SIZE < upsertOps.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Track changes
            for (const op of batch) {
              if (op.oldQty !== op.quantity) {
                changed++;
                changedSkus.push({
                  sku: op.sku,
                  oldQty: op.oldQty,
                  newQty: op.quantity,
                  inventory: inv.name,
                });
              }
              processed++;
            }

            if (i + BATCH_SIZE < upsertOps.length) {
              console.log(`[BaselinkerSync] Processed ${i + BATCH_SIZE}/${upsertOps.length} from ${inv.name}`);
              if (syncLogId) {
                syncProgress.sendProgress(syncLogId, {
                  type: 'progress',
                  message: `📦 ${inv.name}: ${Math.min(i + BATCH_SIZE, upsertOps.length)}/${upsertOps.length}`,
                  phase: 'stock',
                  current: Math.min(i + BATCH_SIZE, upsertOps.length),
                  total: upsertOps.length,
                  percent: Math.round(((i + BATCH_SIZE) / upsertOps.length) * 100),
                });
              }
            }
          }

          const changedInInv = changedSkus.filter(s => s.inventory === inv.name).length;
          console.log(`[BaselinkerSync] Completed ${inv.name}: ${upsertOps.length} variants processed`);
          if (syncLogId) {
            syncProgress.sendProgress(syncLogId, {
              type: 'success',
              message: `✅ ${inv.name}: ${upsertOps.length} wariantów, ${changedInInv} zmian`,
              phase: 'stock',
            });
          }
        } catch (error) {
          const errMsg = `Failed to fetch stock from ${inv.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errMsg);
          if (syncLogId) {
            syncProgress.sendProgress(syncLogId, {
              type: 'error',
              message: `❌ ${inv.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              phase: 'stock',
            });
          }
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch inventories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`[BaselinkerSync] Stock sync complete: ${processed} processed, ${changed} changed, ${errors.length} errors`);
    return { processed, errors, changed, changedSkus };
  }

  /**
   * Sync product prices from Baselinker (standalone, without full product sync)
   * Fetches prices from all inventories and updates product/variant prices with Omnibus compliance
   */
  async syncPrices(
    provider: BaselinkerProvider,
    inventoryId: string,
    syncLogId?: string
  ): Promise<{ processed: number; errors: string[]; changed: number; changedPrices: { sku: string; oldPrice: number; newPrice: number; inventory: string }[] }> {
    const errors: string[] = [];
    let processed = 0;
    let changed = 0;
    const changedPrices: { sku: string; oldPrice: number; newPrice: number; inventory: string }[] = [];

    try {
      const allInventories = await provider.getInventories();
      const inventories = inventoryId && inventoryId !== 'all'
        ? allInventories.filter(inv => inv.inventory_id.toString() === inventoryId)
        : allInventories;

      for (const inv of inventories) {
        if (await wholesalerConfigService.shouldSkipInventory(inv.name)) {
          console.log(`[BaselinkerSync] Skipping price inventory: ${inv.name}`);
          continue;
        }

        const prefix = await this.getInventoryPrefix(inv.name);
        console.log(`[BaselinkerSync] Syncing prices from inventory: ${inv.name} (${inv.inventory_id}), prefix: "${prefix}"`);

        if (syncLogId) {
          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `Synchronizacja cen z magazynu: ${inv.name}...`,
          });
        }

        try {
          // 1. Fetch all BL prices for this inventory (paginated internally by provider)
          const pricesMap = await provider.getInventoryProductsPrices(inv.inventory_id.toString());
          console.log(`[BaselinkerSync] Fetched prices for ${Object.keys(pricesMap).length} products from ${inv.name}`);

          // 2. Build a map: prefixedId -> newPrice (after price multiplier + roundPriceTo99)
          const priceRules = await this.loadPriceRules();
          const whKey = await this.getWarehouseKey(inv.name);
          console.log(`[BaselinkerSync] Price rules for ${inv.name} (${whKey}): ${whKey && priceRules[whKey] ? priceRules[whKey].length + ' rules' : 'none'}`);

          const blPrices = new Map<string, number>();
          for (const [productIdStr, priceGroups] of Object.entries(pricesMap)) {
            const prefixedId = prefix ? `${prefix}${productIdStr}` : productIdStr;

            let rawPrice = 0;
            const priceData = (priceGroups as any).prices || priceGroups;
            const plnPrice = priceData[this.defaultPriceGroupId];
            if (plnPrice && typeof plnPrice === 'number' && plnPrice > 0) {
              rawPrice = plnPrice;
            } else {
              for (const [, price] of Object.entries(priceData)) {
                if (typeof price === 'number' && price > 0) {
                  rawPrice = price;
                  break;
                }
              }
            }

            // Apply price multiplier rules, then round to .99
            const withMarkup = whKey ? this.applyPriceMultiplier(rawPrice, whKey, priceRules) : rawPrice;
            const newPrice = this.roundPriceTo99(withMarkup);
            if (newPrice > 0) blPrices.set(prefixedId, newPrice);
          }

          if (blPrices.size === 0) continue;
          const allBlIds = [...blPrices.keys()];

          // 3. Batch fetch ALL matching products in ONE query
          const allProducts = await prisma.product.findMany({
            where: { baselinkerProductId: { in: allBlIds } },
            select: { id: true, baselinkerProductId: true, price: true, sku: true, lowestPrice30Days: true, compareAtPrice: true },
          });
          console.log(`[BaselinkerSync] DB products matched: ${allProducts.length}`);

          // 4. Batch fetch ALL matching variants — chunked to stay under PostgreSQL 32767 bind variable limit
          const VARIANT_CHUNK_SIZE = 10000;
          const allVariants: { id: string; baselinkerVariantId: string | null; productId: string; price: any; sku: string | null; lowestPrice30Days: any; compareAtPrice: any }[] = [];

          for (let ci = 0; ci < allBlIds.length; ci += VARIANT_CHUNK_SIZE) {
            const chunk = allBlIds.slice(ci, ci + VARIANT_CHUNK_SIZE);
            const searchConditions = prefix
              ? [{ baselinkerVariantId: { in: chunk } }]
              : [
                  { baselinkerVariantId: { in: chunk.map(id => `default-${id}`) } },
                  { baselinkerVariantId: { in: chunk } },
                ];

            const chunkVariants = await prisma.productVariant.findMany({
              where: { OR: searchConditions },
              select: { id: true, baselinkerVariantId: true, productId: true, price: true, sku: true, lowestPrice30Days: true, compareAtPrice: true },
            });
            allVariants.push(...chunkVariants);
          }
          console.log(`[BaselinkerSync] DB variants matched: ${allVariants.length}`);

          // Build variant lookup: blId -> variant
          const variantByBlId = new Map<string, typeof allVariants[0]>();
          for (const v of allVariants) {
            if (v.baselinkerVariantId) {
              variantByBlId.set(v.baselinkerVariantId, v);
            }
          }

          // 5. Compare in memory — collect changes
          const prodChanges: { id: string; oldPrice: number; newPrice: number; sku: string }[] = [];
          const varChanges: { id: string; productId: string; oldPrice: number; newPrice: number; sku: string }[] = [];
          const productIdsWithChanges = new Set<string>();
          let promoSkipped = 0;

          for (const product of allProducts) {
            if (!product.baselinkerProductId) continue;
            const np = blPrices.get(product.baselinkerProductId);
            if (!np) continue;
            processed++;

            // Skip price update for products with active promotions (compareAtPrice set)
            if (product.compareAtPrice) {
              promoSkipped++;
              continue;
            }

            const currentPrice = Number(product.price);
            if (Math.abs(currentPrice - np) > 0.01) {
              prodChanges.push({ id: product.id, oldPrice: currentPrice, newPrice: np, sku: product.sku || product.baselinkerProductId });
              productIdsWithChanges.add(product.id);
              changed++;
              changedPrices.push({ sku: product.sku || product.baselinkerProductId, oldPrice: currentPrice, newPrice: np, inventory: inv.name });
            }
          }
          
          if (promoSkipped > 0) {
            console.log(`[BaselinkerSync] Skipped ${promoSkipped} products with active promotions in ${inv.name}`);
            if (syncLogId) {
              syncProgress.sendProgress(syncLogId, {
                type: 'info',
                message: `🛡️ Pominięto ${promoSkipped} produktów z aktywnymi promocjami`,
              });
            }
          }

          // Build set of product IDs with active promotions (to protect their variants too)
          const promoProductIds = new Set(
            allProducts
              .filter(p => p.compareAtPrice)
              .map(p => p.id)
          );

          for (const variant of allVariants) {
            if (!variant.baselinkerVariantId) continue;
            
            // Skip variant price update if its product has active promotion
            if (promoProductIds.has(variant.productId) || variant.compareAtPrice) {
              continue;
            }
            
            // Map variant BL id to the blPrices key
            let blId = variant.baselinkerVariantId;
            if (!prefix && blId.startsWith('default-')) {
              blId = blId.replace('default-', '');
            }
            const np = blPrices.get(blId) || blPrices.get(variant.baselinkerVariantId);
            if (!np) continue;

            const currentPrice = Number(variant.price);
            if (Math.abs(currentPrice - np) > 0.01) {
              varChanges.push({ id: variant.id, productId: variant.productId, oldPrice: currentPrice, newPrice: np, sku: variant.sku || blId });
              // Count as changed only if product wasn't already counted
              if (!productIdsWithChanges.has(variant.productId)) {
                changed++;
                changedPrices.push({ sku: variant.sku || blId, oldPrice: currentPrice, newPrice: np, inventory: inv.name });
              }
            }
          }

          console.log(`[BaselinkerSync] ${inv.name}: ${prodChanges.length} product price changes, ${varChanges.length} variant price changes`);

          // 6. Batch write — process in chunks of 300 (reduced from 500 to minimize lock contention)
          const BATCH_SIZE = 300;

          // 6a. Batch INSERT price_history + UPDATE products
          for (let i = 0; i < prodChanges.length; i += BATCH_SIZE) {
            const batch = prodChanges.slice(i, i + BATCH_SIZE);

            // Insert price history records (clamp prices to Decimal(10,2) max)
            await prisma.priceHistory.createMany({
              data: batch.map(c => ({
                productId: c.id,
                variantId: null,
                oldPrice: this.clampPrice(c.oldPrice),
                newPrice: this.clampPrice(c.newPrice),
                source: PriceChangeSource.BASELINKER,
                reason: 'Baselinker price sync',
              })),
            });

            // Batch UPDATE product prices + lowestPrice30Days using raw SQL with unnest
            const ids = batch.map(c => c.id);
            const prices = batch.map(c => c.newPrice);
            await prisma.$executeRawUnsafe(`
              UPDATE products SET 
                price = u.new_price,
                lowest_price_30_days = LEAST(COALESCE(lowest_price_30_days, u.new_price), u.new_price),
                lowest_price_30_days_at = COALESCE(lowest_price_30_days_at, NOW()),
                updated_at = NOW()
              FROM (SELECT unnest($1::text[]) as id, unnest($2::numeric[]) as new_price) u
              WHERE products.id = u.id
            `, ids, prices);

            if (i + BATCH_SIZE < prodChanges.length) {
              console.log(`[BaselinkerSync] Products: ${i + BATCH_SIZE}/${prodChanges.length} from ${inv.name}`);
            }
          }

          // 6b. Batch INSERT price_history + UPDATE variants
          for (let i = 0; i < varChanges.length; i += BATCH_SIZE) {
            const batch = varChanges.slice(i, i + BATCH_SIZE);

            // Insert price history records for variants (clamp prices to Decimal(10,2) max)
            await prisma.priceHistory.createMany({
              data: batch.map(c => ({
                productId: c.productId,
                variantId: c.id,
                oldPrice: this.clampPrice(c.oldPrice),
                newPrice: this.clampPrice(c.newPrice),
                source: PriceChangeSource.BASELINKER,
                reason: 'Baselinker price sync',
              })),
            });

            // Batch UPDATE variant prices + lowestPrice30Days
            const ids = batch.map(c => c.id);
            const prices = batch.map(c => c.newPrice);
            await prisma.$executeRawUnsafe(`
              UPDATE product_variants SET 
                price = u.new_price,
                lowest_price_30_days = LEAST(COALESCE(lowest_price_30_days, u.new_price), u.new_price),
                lowest_price_30_days_at = COALESCE(lowest_price_30_days_at, NOW()),
                updated_at = NOW()
              FROM (SELECT unnest($1::text[]) as id, unnest($2::numeric[]) as new_price) u
              WHERE product_variants.id = u.id
            `, ids, prices);

            if (i + BATCH_SIZE < varChanges.length) {
              console.log(`[BaselinkerSync] Variants: ${i + BATCH_SIZE}/${varChanges.length} from ${inv.name}`);
            }
          }

          console.log(`[BaselinkerSync] Completed ${inv.name}: ${prodChanges.length + varChanges.length} price changes applied`);

          // 6c. For single-variant products where product price changed but variant wasn't separately updated,
          // sync variant price to match product price (variant inherits product price)
          const variantUpdatedProductIds = new Set(varChanges.map(c => c.productId));
          const singleVariantProdChanges = prodChanges.filter(c => !variantUpdatedProductIds.has(c.id));
          if (singleVariantProdChanges.length > 0) {
            const productIds = singleVariantProdChanges.map(c => c.id);
            const prices = singleVariantProdChanges.map(c => c.newPrice);
            await prisma.$executeRawUnsafe(`
              UPDATE product_variants SET 
                price = u.new_price,
                lowest_price_30_days = LEAST(COALESCE(lowest_price_30_days, u.new_price), u.new_price),
                lowest_price_30_days_at = COALESCE(lowest_price_30_days_at, NOW()),
                updated_at = NOW()
              FROM (SELECT unnest($1::text[]) as product_id, unnest($2::numeric[]) as new_price) u
              WHERE product_variants.product_id = u.product_id
                AND NOT EXISTS (
                  SELECT 1 FROM product_variants pv2 
                  WHERE pv2.product_id = product_variants.product_id 
                  AND pv2.id != product_variants.id
                )
            `, productIds, prices);
            console.log(`[BaselinkerSync] Synced ${singleVariantProdChanges.length} single-variant product prices to their variants`);
          }

          if (syncLogId) {
            syncProgress.sendProgress(syncLogId, {
              type: 'success',
              message: `${inv.name}: ${prodChanges.length + varChanges.length} zmian cen zastosowanych`,
            });
          }
        } catch (error) {
          errors.push(`Failed to sync prices from ${inv.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error(`[BaselinkerSync] Error syncing prices from ${inv.name}:`, error);
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch inventories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Final step: fix any single-variant products where variant.price != product.price
    // This catches cases where product.price was updated in a prior sync but variant wasn't
    try {
      const fixResult = await prisma.$executeRawUnsafe(`
        UPDATE product_variants pv SET
          price = p.price,
          lowest_price_30_days = LEAST(COALESCE(pv.lowest_price_30_days, p.price), p.price),
          lowest_price_30_days_at = COALESCE(pv.lowest_price_30_days_at, NOW()),
          updated_at = NOW()
        FROM products p
        WHERE pv.product_id = p.id
          AND pv.price != p.price
          AND NOT EXISTS (
            SELECT 1 FROM product_variants pv2
            WHERE pv2.product_id = p.id AND pv2.id != pv.id
          )
      `);
      if (fixResult > 0) {
        console.log(`[BaselinkerSync] Fixed ${fixResult} single-variant products with mismatched variant prices`);
      }
    } catch (err) {
      console.error(`[BaselinkerSync] Error fixing single-variant prices:`, err);
    }

    console.log(`[BaselinkerSync] Price sync complete: ${processed} processed, ${changed} changed, ${errors.length} errors`);
    return { processed, errors, changed, changedPrices };
  }

  /**
   * Run price sync directly (awaited) — for use by BullMQ worker
   */
  async runPriceSyncDirect(): Promise<{ syncLogId: string; success: boolean; itemsProcessed: number; itemsChanged: number }> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.baselinkerSyncLog.updateMany({
      where: {
        status: BaselinkerSyncStatus.RUNNING,
        startedAt: { lt: fifteenMinutesAgo },
      },
      data: {
        status: BaselinkerSyncStatus.FAILED,
        errors: ['Sync przekroczył limit 15 minut — oznaczony jako błąd'],
        completedAt: new Date(),
      },
    });

    const syncLog = await prisma.baselinkerSyncLog.create({
      data: {
        type: BaselinkerSyncType.PRICE,
        status: BaselinkerSyncStatus.RUNNING,
      },
    });

    console.log(`[BaselinkerSync] Starting direct price sync (logId: ${syncLog.id})`);

    try {
      const stored = await this.getDecryptedToken();
      if (!stored) throw new Error('No Baselinker configuration found');

      const provider = await this.createProvider();
      // Worker syncs ALL warehouses (cron)
      const result = await this.syncPrices(provider, 'all', syncLog.id);

      const status = result.errors.length > 0 ? BaselinkerSyncStatus.FAILED : BaselinkerSyncStatus.SUCCESS;

      await prisma.baselinkerSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status,
          itemsProcessed: result.processed,
          itemsChanged: result.changed,
          changedSkus: result.changedPrices.length > 0 ? result.changedPrices : undefined,
          errors: result.errors.length > 0 ? result.errors : undefined,
          completedAt: new Date(),
        },
      });

      await prisma.baselinkerConfig.updateMany({
        data: { lastSyncAt: new Date() },
      });

      console.log(`[BaselinkerSync] Direct price sync complete: ${result.processed} processed, ${result.changed} changed`);

      return {
        syncLogId: syncLog.id,
        success: result.errors.length === 0,
        itemsProcessed: result.processed,
        itemsChanged: result.changed,
      };
    } catch (error) {
      console.error('[BaselinkerSync] Direct price sync failed:', error);
      await prisma.baselinkerSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: BaselinkerSyncStatus.FAILED,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          completedAt: new Date(),
        },
      });
      return { syncLogId: syncLog.id, success: false, itemsProcessed: 0, itemsChanged: 0 };
    }
  }

  /**
   * Sync images (standalone, without full product sync)
   */
  async syncImages(
    provider: BaselinkerProvider,
    inventoryId: string
  ): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    try {
      // Get all inventories to iterate through
      const allInventories = await provider.getInventories();
      const inventoriesFiltered: typeof allInventories = [];
      for (const inv of allInventories) {
        if (!(await wholesalerConfigService.shouldSkipInventory(inv.name))) {
          inventoriesFiltered.push(inv);
        }
      }
      const inventories = inventoriesFiltered;

      // Get products with their Baselinker IDs
      const products = await prisma.product.findMany({
        where: { baselinkerProductId: { not: null } },
        select: { id: true, baselinkerProductId: true },
      });

      for (const inv of inventories) {
        const prefix = await this.getInventoryPrefix(inv.name);
        console.log(`[BaselinkerSync] Syncing images from inventory: ${inv.name} (${inv.inventory_id}), prefix: "${prefix}"`);

        // Filter products belonging to this inventory
        const invProducts = products.filter((p) => {
          const blId = p.baselinkerProductId as string;
          if (prefix) return blId.startsWith(prefix);
          return !blId.includes('-');
        });

        if (invProducts.length === 0) {
          console.log(`[BaselinkerSync] No products for inventory ${inv.name}, skipping`);
          continue;
        }

        const productIds = invProducts
          .map((p) => {
            const id = (p.baselinkerProductId as string).replace(/^[a-z]+-/i, '');
            return parseInt(id, 10);
          })
          .filter((id) => !isNaN(id));

        console.log(`[BaselinkerSync] Fetching image data for ${productIds.length} products from ${inv.name}`);

        // Fetch product data with images
        const blProducts = await provider.getInventoryProductsData(inv.inventory_id.toString(), productIds);

        let invProcessed = 0;
        // Process in batches of 100 products using transactions for speed
        const BATCH_SIZE = 100;
        for (let i = 0; i < blProducts.length; i += BATCH_SIZE) {
          const batch = blProducts.slice(i, i + BATCH_SIZE);
          const operations: any[] = [];

          for (const blProduct of batch) {
            const blIdStr = blProduct.id.toString();
            const product = invProducts.find((p) => {
              const stored = p.baselinkerProductId as string;
              return stored === blIdStr || stored.endsWith('-' + blIdStr);
            });
            if (!product) continue;

            if (blProduct.images && Object.keys(blProduct.images).length > 0) {
              const imageEntries = Object.entries(blProduct.images).sort(([a], [b]) => parseInt(a) - parseInt(b));
              const rawUrls = imageEntries.map(([, u]) => (u as string).trim()).filter(Boolean);
              const uniqueUrls = deduplicateImageUrls(rawUrls);

              operations.push({
                productId: product.id,
                blProductId: blProduct.id,
                images: uniqueUrls.map((url, idx) => ({ productId: product.id, url, order: idx })),
              });
            }
          }

          if (operations.length > 0) {
            try {
              await prisma.$transaction(async (tx) => {
                // Delete all old images for this batch
                await tx.productImage.deleteMany({
                  where: { productId: { in: operations.map(op => op.productId) } },
                });
                // Create all new images in one call
                const allImages = operations.flatMap(op => op.images);
                await tx.productImage.createMany({ data: allImages });
              });
              invProcessed += operations.length;
              processed += operations.length;
            } catch (error) {
              errors.push(`Batch ${i}-${i + BATCH_SIZE}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= blProducts.length) {
            console.log(`[BaselinkerSync] ${inv.name}: processed ${Math.min(i + BATCH_SIZE, blProducts.length)}/${blProducts.length} products`);
          }
        }
        console.log(`[BaselinkerSync] Updated images for ${invProcessed} products from ${inv.name}`);
      }
    } catch (error) {
      errors.push(`Failed to sync images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { processed, errors };
  }

  /**
   * Reindex Meilisearch after sync — delegates to SearchService for complete indexing
   */
  async reindexMeilisearch(): Promise<void> {
    if (!isMeilisearchAvailable()) {
      console.log('[BaselinkerSync] Meilisearch niedostępny, pomijam reindeksację');
      return;
    }

    try {
      console.log('[BaselinkerSync] Rozpoczynam reindeksację Meilisearch (via SearchService)...');
      const searchService = new SearchService();
      const result = await searchService.reindexAllProducts();
      console.log(`[BaselinkerSync] ✓ Reindeksacja zakończona: ${result.indexed} produktów (taskUid: ${result.taskUid})`);
    } catch (error) {
      markMeilisearchUnavailable();
      console.error('[BaselinkerSync] ⚠️ Nie udało się zindeksować (Meilisearch offline?):', error);
    }
  }

  /**
   * Get sync status and recent logs
   */
  async getStatus(limit = 10): Promise<SyncStatus> {
    const config = await prisma.baselinkerConfig.findFirst();

    const currentSync = await prisma.baselinkerSyncLog.findFirst({
      where: { status: BaselinkerSyncStatus.RUNNING },
      orderBy: { startedAt: 'desc' },
    });

    const recentLogs = await prisma.baselinkerSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return {
      configured: !!config,
      lastSyncAt: config?.lastSyncAt ?? null,
      currentSync: currentSync
        ? {
            id: currentSync.id,
            type: currentSync.type,
            status: currentSync.status,
            startedAt: currentSync.startedAt,
          }
        : null,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        type: log.type,
        status: log.status,
        itemsProcessed: log.itemsProcessed,
        errors: log.errors,
        startedAt: log.startedAt,
        completedAt: log.completedAt,
      })),
    };
  }

  /**
   * Cancel a running sync or delete a sync log
   */
  async cancelSync(syncId: string): Promise<{ cancelled: boolean; deleted: boolean }> {
    const syncLog = await prisma.baselinkerSyncLog.findUnique({
      where: { id: syncId },
    });

    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    // If sync is running, mark it as failed
    if (syncLog.status === BaselinkerSyncStatus.RUNNING) {
      await prisma.baselinkerSyncLog.update({
        where: { id: syncId },
        data: {
          status: BaselinkerSyncStatus.FAILED,
          errors: ['Cancelled by user'],
          completedAt: new Date(),
        },
      });
      console.log(`[BaselinkerSync] Sync ${syncId} cancelled by user`);
      return { cancelled: true, deleted: false };
    }

    // If sync is already completed/failed, delete the log
    await prisma.baselinkerSyncLog.delete({
      where: { id: syncId },
    });
    console.log(`[BaselinkerSync] Sync log ${syncId} deleted by user`);
    return { cancelled: false, deleted: true };
  }

  /**
   * Send order to Baselinker
   * @param orderId - Order ID from our database
   */
  async sendOrderToBaselinker(orderId: string): Promise<{ success: boolean; baselinkerOrderId?: string; error?: string }> {
    try {
      // TODO: Implement order sending to Baselinker
      // This would require adding order-related methods to the Baselinker provider
      console.log(`[BaselinkerService] Sending order ${orderId} to Baselinker - not yet implemented`);
      return {
        success: false,
        error: 'Order sending to Baselinker is not yet implemented',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Sync stock for a specific variant to Baselinker
   * @param variantId - Product variant ID
   */
  async syncStockToBaselinker(variantId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // TODO: Implement stock update to Baselinker
      // This would require adding stock update methods to the Baselinker provider
      console.log(`[BaselinkerService] Syncing stock for variant ${variantId} to Baselinker - not yet implemented`);
      return {
        success: false,
        error: 'Stock sync to Baselinker is not yet implemented',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const baselinkerService = new BaselinkerService();
