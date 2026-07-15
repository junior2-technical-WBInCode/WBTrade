/**
 * Wholesaler Configuration Service
 * 
 * Central service for wholesaler configuration, replacing all hardcoded
 * warehouse/prefix/inventory maps across the codebase.
 * 
 * Uses in-memory cache with 60s TTL (same pattern as price-rules.js).
 * Cache is invalidated on CRUD operations via invalidateCache().
 */

import { prisma } from '../db';

interface WholesalerConfig {
  id: string;
  key: string;
  name: string;
  baselinkerInventoryId: string | null;
  prefix: string;
  skuPrefix: string | null;
  location: string | null;
  hideLocation: boolean;
  warehouseDisplayName: string | null;
  aliases: string[];
  color: string;
  isActive: boolean;
  skipInSync: boolean;
  hasPriceRules: boolean;
  sortOrder: number;
}

class WholesalerConfigService {
  private cache: WholesalerConfig[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 60_000; // 60 seconds

  /**
   * Get all active wholesalers (cached)
   */
  async getAll(): Promise<WholesalerConfig[]> {
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }

    const wholesalers = await prisma.wholesaler.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    this.cache = wholesalers;
    this.cacheTime = Date.now();
    return wholesalers;
  }

  /**
   * Get cached config synchronously (returns null if not yet loaded).
   * Call getAll() first to ensure cache is populated.
   */
  getCachedConfig(): WholesalerConfig[] | null {
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }
    // Trigger async load for next call
    this.getAll().catch(() => {});
    return this.cache; // Return stale cache or null
  }

  /**
   * Get all wholesalers including inactive (no cache, for admin)
   */
  async getAllIncludingInactive(): Promise<WholesalerConfig[]> {
    return prisma.wholesaler.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Get wholesaler by key (e.g., "leker", "btp")
   */
  async getByKey(key: string): Promise<WholesalerConfig | undefined> {
    const all = await this.getAll();
    return all.find(w => w.key === key.toLowerCase());
  }

  /**
   * Find wholesaler by Baselinker inventory name.
   * Searches by key, name, and aliases (case-insensitive, trimmed).
   */
  async getByBaselinkerName(inventoryName: string): Promise<WholesalerConfig | undefined> {
    const lower = (inventoryName || '').trim().toLowerCase();
    if (!lower) return undefined;

    const all = await this.getAll();
    return all.find(w =>
      w.key === lower ||
      w.name.toLowerCase() === lower ||
      w.aliases.some(a => a.toLowerCase() === lower)
    );
  }

  /**
   * Get inventory prefix for a Baselinker inventory name.
   * Replaces hardcoded getInventoryPrefix() in baselinker.service.ts and app.ts.
   */
  async getInventoryPrefix(inventoryName: string): Promise<string> {
    const wholesaler = await this.getByBaselinkerName(inventoryName);
    return wholesaler?.prefix ?? '';
  }

  /**
   * Get warehouse key for a Baselinker inventory name.
   * Returns null if no matching wholesaler found (or if it has no price rules).
   * Replaces hardcoded getWarehouseKey() in baselinker.service.ts and price-rules.js.
   */
  async getWarehouseKey(inventoryName: string): Promise<string | null> {
    const wholesaler = await this.getByBaselinkerName(inventoryName);
    return wholesaler?.key ?? null;
  }

  /**
   * Get SKU prefix for a Baselinker inventory name.
   * Replaces hardcoded getSkuPrefix() in baselinker.service.ts.
   */
  async getSkuPrefix(inventoryName: string): Promise<string> {
    const wholesaler = await this.getByBaselinkerName(inventoryName);
    return wholesaler?.skuPrefix ?? '';
  }

  /**
   * Get warehouse mapping: key → baselinkerInventoryId
   * Replaces WAREHOUSE_MAPPING in baselinker-orders.service.ts.
   */
  async getWarehouseMapping(): Promise<Record<string, string>> {
    const all = await this.getAll();
    const mapping: Record<string, string> = {};
    for (const w of all) {
      if (w.baselinkerInventoryId) {
        mapping[w.key] = w.baselinkerInventoryId;
      }
    }
    return mapping;
  }

  /**
   * Detect warehouse inventory ID from product data (prefix or tags).
   * Replaces detectWarehouseId() in baselinker-orders.service.ts.
   */
  async detectWarehouseId(baselinkerProductId: string | null, tags: string[] = []): Promise<string> {
    const all = await this.getAll();
    const mapping = await this.getWarehouseMapping();

    // 1. Check prefix in baselinkerProductId (e.g., "btp-212551167")
    if (baselinkerProductId) {
      const prefixPart = baselinkerProductId.split('-')[0]?.toLowerCase();
      if (prefixPart && mapping[prefixPart]) {
        return mapping[prefixPart];
      }
    }

    // 2. Check tags for warehouse indicators
    const lowerTags = tags.map(t => t.toLowerCase());
    for (const w of all) {
      if (!w.baselinkerInventoryId) continue;
      const matchNames = [w.key, w.name.toLowerCase(), ...w.aliases.map(a => a.toLowerCase())];
      if (lowerTags.some(t => matchNames.includes(t))) {
        return w.baselinkerInventoryId;
      }
    }

    // 3. Fallback to 'default' wholesaler
    return mapping['default'] || '';
  }

  /**
   * Check if an inventory should be skipped during sync.
   * Replaces hardcoded empik/ikonka/Główny skip logic.
   */
  async shouldSkipInventory(inventoryName: string): Promise<boolean> {
    const wholesaler = await this.getByBaselinkerName(inventoryName);
    if (wholesaler) {
      return wholesaler.skipInSync || !wholesaler.isActive;
    }
    // Unknown inventories are skipped by default for safety
    return true;
  }

  /**
   * Get wholesaler-to-warehouse display name mapping.
   * Replaces WHOLESALER_TO_WAREHOUSE in shipping-calculator.service.ts.
   */
  async getWholesalerToWarehouseMap(): Promise<Record<string, string>> {
    const all = await this.getAll();
    const map: Record<string, string> = {};
    for (const w of all) {
      const displayName = w.warehouseDisplayName || (w.location ? `Magazyn ${w.location}` : `Magazyn ${w.name}`);
      // Map by name and all aliases
      map[w.name] = displayName;
      for (const alias of w.aliases) {
        map[alias] = displayName;
      }
    }
    return map;
  }

  /**
   * Build WHOLESALER regex pattern for shipping calculator.
   * Replaces hardcoded TAG_PATTERNS.WHOLESALER regex.
   */
  async buildWholesalerRegex(): Promise<RegExp> {
    const all = await this.getAll();
    const names: string[] = [];
    for (const w of all) {
      names.push(w.name);
      names.push(...w.aliases);
    }
    // Escape special regex chars in names
    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = `^(hurtownia[:\\-_](.+)|${escaped.join('|')})$`;
    return new RegExp(pattern, 'i');
  }

  /**
   * Get all warehouse keys that have price rules.
   * Replaces hardcoded warehouses array in price-rules.js.
   */
  async getWarehouseKeysWithPriceRules(): Promise<string[]> {
    const all = await this.getAll();
    return all.filter(w => w.hasPriceRules).map(w => w.key);
  }

  /**
   * Get public config for frontends (safe fields only).
   * Wholesalers with hideLocation=true expose location=null so the storefront
   * never renders their warehouse location (filter list, product cards).
   */
  async getPublicConfig(): Promise<Array<{
    key: string;
    name: string;
    prefix: string;
    skuPrefix: string | null;
    location: string | null;
    warehouseDisplayName: string | null;
    color: string;
    aliases: string[];
  }>> {
    const all = await this.getAll();
    return all.map(w => ({
      key: w.key,
      name: w.name,
      prefix: w.prefix,
      skuPrefix: w.skuPrefix,
      location: w.hideLocation ? null : w.location,
      warehouseDisplayName: w.hideLocation ? null : w.warehouseDisplayName,
      color: w.color,
      aliases: w.aliases,
    }));
  }

  /**
   * Invalidate cache (call after CRUD operations)
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }
}

export const wholesalerConfigService = new WholesalerConfigService();
