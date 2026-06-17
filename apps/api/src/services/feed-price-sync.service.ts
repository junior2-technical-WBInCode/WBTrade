import { prisma } from '../db';
import { priceHistoryService } from './price-history.service';
import { wholesalerConfigService } from './wholesaler-config.service';
import { PriceChangeSource } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { queueProductIndex } from '../lib/queue';

// Interface for matched item to update
interface PriceUpdateItem {
  id: string; // product/variant ID
  isVariant: boolean;
  sku: string;
  name: string;
  currentPrice: number;
  newPrice: number;
  purchasePrice: number;
  compareAtPrice: number | null;
  hasPriceChanged: boolean;
  hasCompareAtChanged: boolean;
  hasPurchasePriceChanged: boolean;
}

export class FeedPriceSyncService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      parseTagValue: false,
      trimValues: true,
    });
  }

  /**
   * Helper to recursively find all nodes with a given name in a parsed XML object
   */
  private findNodes(obj: any, tagName: string): any[] {
    let results: any[] = [];
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        results = results.concat(this.findNodes(item, tagName));
      }
      return results;
    }
    for (const key in obj) {
      if (key === tagName) {
        if (Array.isArray(obj[key])) {
          results = results.concat(obj[key]);
        } else {
          results.push(obj[key]);
        }
      } else {
        results = results.concat(this.findNodes(obj[key], tagName));
      }
    }
    return results;
  }

  /**
   * Helper to get attribute safely (supporting namespaced attributes like iaiext:...)
   */
  private getAttr(node: any, attrName: string): string | null {
    if (!node) return null;
    if (node[attrName] !== undefined) return String(node[attrName]).trim();
    for (const key of Object.keys(node)) {
      if (key.endsWith(':' + attrName)) {
        return String(node[key]).trim();
      }
    }
    return null;
  }

  /**
   * Helper to get a value from a sub-tag <a name="XYZ">value</a> inside <attrs>
   */
  private getAttrValueFromAttrs(node: any, name: string): string | null {
    const attrsNode = node.attrs;
    if (!attrsNode) return null;
    const aNodes = Array.isArray(attrsNode.a) ? attrsNode.a : (attrsNode.a ? [attrsNode.a] : []);
    const matchingNode = aNodes.find((a: any) => this.getAttr(a, 'name') === name);
    if (!matchingNode) return null;
    return matchingNode['#text'] || matchingNode['text'] || (typeof matchingNode === 'string' ? matchingNode : null);
  }

  /**
   * Fetches the XML feed content from URL or local file (for testing)
   */
  private async getFeedContent(urlOrPath: string): Promise<string> {
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      console.log(`Downloading feed from: ${urlOrPath}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min timeout
      try {
        const response = await fetch(urlOrPath, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to download feed. Status: ${response.status} ${response.statusText}`);
        }
        return await response.text();
      } finally {
        clearTimeout(timeout);
      }
    } else {
      console.log(`Reading feed from local file: ${urlOrPath}`);
      const fs = require('fs');
      return fs.readFileSync(urlOrPath, 'utf-8');
    }
  }

  /**
   * Rounds a price to .99 ending
   */
  private roundPriceTo99(price: number): number {
    if (price <= 0) return 0;
    const rounded = Math.floor(price) + 0.99;
    return Math.min(rounded, 99999999.99); // fit Decimal(10,2)
  }

  /**
   * Applies the markup rules from Settings to a wholesale price
   */
  private applyMarkup(price: number, rules: Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }>): number {
    if (!price || price <= 0) return 0;
    if (!rules || rules.length === 0) return price;

    for (const rule of rules) {
      if (price >= rule.priceFrom && price <= rule.priceTo) {
        return price * rule.multiplier + rule.addToPrice;
      }
    }
    return price;
  }

  /**
   * Main entry point to sync a wholesaler feed
   */
  async syncWholesaler(options: {
    wholesalerKey: string;
    feedUrlOrPath: string;
    limit?: number;
    dryRun?: boolean;
  }): Promise<{
    processed: number;
    matched: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    const { wholesalerKey, feedUrlOrPath, limit = 0, dryRun = false } = options;
    const errors: string[] = [];
    let processed = 0;
    let matched = 0;
    let updated = 0;
    let skipped = 0;

    console.log(`=== Starting sync for: ${wholesalerKey.toUpperCase()} (Dry Run: ${dryRun}) ===`);

    try {
      // 1. Load Wholesaler config from DB
      const config = await wholesalerConfigService.getByKey(wholesalerKey);
      if (!config) {
        throw new Error(`Wholesaler not found in config/database: ${wholesalerKey}`);
      }

      // 2. Fetch and parse XML
      const xmlContent = await this.getFeedContent(feedUrlOrPath);
      console.log(`Parsing XML (${(xmlContent.length / 1024 / 1024).toFixed(2)} MB)...`);
      const parsedObj = this.parser.parse(xmlContent);

      // 3. Load active price rules from Settings table
      const rulesSetting = await prisma.settings.findUnique({
        where: { key: `price_rules_${wholesalerKey.toLowerCase()}` },
      });
      let priceRules: Array<{ priceFrom: number; priceTo: number; multiplier: number; addToPrice: number }> = [];
      if (rulesSetting?.value) {
        const parsed = typeof rulesSetting.value === 'string' ? JSON.parse(rulesSetting.value) : rulesSetting.value;
        if (Array.isArray(parsed)) {
          priceRules = parsed.map((r: any) => ({
            priceFrom: parseFloat(r.priceFrom) || 0,
            priceTo: parseFloat(r.priceTo) || 999999,
            multiplier: parseFloat(r.multiplier) || 1,
            addToPrice: parseFloat(r.addToPrice) || 0,
          })).sort((a, b) => a.priceFrom - b.priceFrom);
        }
      }
      console.log(`Loaded ${priceRules.length} price rules for ${wholesalerKey}`);

      // 4. Fetch all active products and variants for this wholesaler from DB
      // We will perform mapping in-memory to be fast
      console.log('Loading active products and variants from database...');
      
      const prefixFilter = config.skuPrefix || config.prefix;

      const dbProducts = await prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          ...(prefixFilter ? { sku: { startsWith: prefixFilter, mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          sku: true,
          barcode: true,
          price: true,
          compareAtPrice: true,
          purchasePrice: true,
          name: true,
        },
      });

      const dbVariants = await prisma.productVariant.findMany({
        where: {
          product: { status: 'ACTIVE' },
          ...(prefixFilter ? { sku: { startsWith: prefixFilter, mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          productId: true,
          sku: true,
          barcode: true,
          price: true,
          compareAtPrice: true,
          purchasePrice: true,
          name: true,
        },
      });

      console.log(`Loaded ${dbProducts.length} products and ${dbVariants.length} variants from DB.`);

      // 5. Parse the items based on wholesaler type
      const feedItemsMap = new Map<string, { wholesalePrice: number; srp?: number }>();
      const feedItemsBySkuMap = new Map<string, { wholesalePrice: number; srp?: number }>();

      if (wholesalerKey === 'leker') {
        const pNodes = this.findNodes(parsedObj, 'p');
        console.log(`Found ${pNodes.length} elements in Leker feed.`);
        for (const node of pNodes) {
          const priceNode = node.price;
          const bruttoPrice = priceNode ? parseFloat(priceNode.brutto || '0') : 0;
          const ean = node.ean13 ? String(node.ean13).trim() : null;
          const id = node.id ? String(node.id).trim() : null;
          const reference = node.reference ? String(node.reference).trim() : null;

          if (bruttoPrice > 0) {
            const data = { wholesalePrice: bruttoPrice };
            if (ean) feedItemsMap.set(ean, data);
            if (id) {
              feedItemsBySkuMap.set('LEKER-' + id, data);
              feedItemsBySkuMap.set('leker-' + id, data);
              feedItemsBySkuMap.set(id, data);
            }
            if (reference) {
              feedItemsBySkuMap.set('LEKER-' + reference, data);
              feedItemsBySkuMap.set('leker-' + reference, data);
              feedItemsBySkuMap.set(reference, data);
            }
          }
        }
      } 
      else if (wholesalerKey === 'btp') {
        const lineNodes = this.findNodes(parsedObj, 'Line-Item');
        console.log(`Found ${lineNodes.length} elements in BTP feed.`);
        for (const node of lineNodes) {
          const netPrice = parseFloat(node.UnitNetPrice || '0');
          const taxRate = parseFloat(node.TaxRate || '23');
          const grossPrice = netPrice * (1 + taxRate / 100);
          const ean = node.EAN ? String(node.EAN).trim() : null;
          const manufacturerCode = node.ManufacturerItemCode ? String(node.ManufacturerItemCode).trim() : null;
          const supplierCode = node.SupplierItemCode ? String(node.SupplierItemCode).trim() : null;
          const retailPrice = parseFloat(node.UnitRetailPrice || '0'); // Suggested Retail Price (SRP)

          if (grossPrice > 0) {
            const data = { wholesalePrice: grossPrice, srp: retailPrice > 0 ? retailPrice : undefined };
            if (ean) feedItemsMap.set(ean, data);
            if (manufacturerCode) {
              feedItemsBySkuMap.set('BTP-' + manufacturerCode, data);
              feedItemsBySkuMap.set('btp-' + manufacturerCode, data);
              feedItemsBySkuMap.set(manufacturerCode, data);
            }
            if (supplierCode) {
              feedItemsBySkuMap.set('BTP-' + supplierCode, data);
              feedItemsBySkuMap.set('btp-' + supplierCode, data);
              feedItemsBySkuMap.set(supplierCode, data);
            }
          }
        }
      } 
      else if (wholesalerKey === 'hp') {
        const oNodes = this.findNodes(parsedObj, 'o');
        console.log(`Found ${oNodes.length} elements in HP feed.`);
        for (const node of oNodes) {
          const price = parseFloat(this.getAttr(node, 'price') || '0');
          const id = this.getAttr(node, 'id');
          if (id && price > 0) {
            const data = { wholesalePrice: price };
            feedItemsBySkuMap.set(id, data);
            feedItemsBySkuMap.set('hp-' + id, data);
            feedItemsBySkuMap.set('HP-' + id, data);
          }
        }
      } 
      else if (wholesalerKey === 'dofirmy') {
        const oNodes = this.findNodes(parsedObj, 'o');
        console.log(`Found ${oNodes.length} elements in DoFirmy feed.`);
        for (const node of oNodes) {
          const price = parseFloat(this.getAttr(node, 'price') || '0');
          const code = this.getAttrValueFromAttrs(node, 'Kod_produktu');
          const ean = this.getAttrValueFromAttrs(node, 'EAN');
          if (code && price > 0) {
            const data = { wholesalePrice: price };
            feedItemsBySkuMap.set('DOFIRMY-' + code, data);
            feedItemsBySkuMap.set('dofirmy-' + code, data);
            feedItemsBySkuMap.set(code, data);
            if (ean) {
              feedItemsMap.set(ean, data);
              feedItemsBySkuMap.set('DOFIRMY-' + ean, data);
              feedItemsBySkuMap.set('dofirmy-' + ean, data);
              feedItemsBySkuMap.set(ean, data);
            }
          }
        }
      } 
      else if (wholesalerKey === 'polzoo') {
        const sizeNodes = this.findNodes(parsedObj, 'size');
        console.log(`Found ${sizeNodes.length} size elements in PolZoo feed.`);
        for (const node of sizeNodes) {
          // PolZoo has <price gross="21.99" net="17.88"/> inside size
          const priceGross = parseFloat(node.price?.gross || this.getAttr(node.price, 'gross') || '0');
          const codeProducer = this.getAttr(node, 'code_producer');
          const codeExternal = this.getAttr(node, 'code_external');
          const srpGross = parseFloat(node.srp?.gross || this.getAttr(node.srp, 'gross') || '0');

          if (priceGross > 0) {
            const data = { wholesalePrice: priceGross, srp: srpGross > 0 ? srpGross : undefined };
            if (codeProducer) {
              feedItemsMap.set(codeProducer, data);
              feedItemsBySkuMap.set(codeProducer, data);
              feedItemsBySkuMap.set('POLZOO-' + codeProducer, data);
              feedItemsBySkuMap.set('polzoo-' + codeProducer, data);
            }
            if (codeExternal) {
              feedItemsBySkuMap.set('POLZOO-' + codeExternal, data);
              feedItemsBySkuMap.set('polzoo-' + codeExternal, data);
              feedItemsBySkuMap.set(codeExternal, data);
            }
          }
        }
      } 
      else if (wholesalerKey === 'hurtownia-kuchenna') {
        const itemNodes = this.findNodes(parsedObj, 'item');
        console.log(`Found ${itemNodes.length} elements in Hurtownia Kuchenna feed.`);
        for (const node of itemNodes) {
          const price = parseFloat(node.prod_price || '0');
          const ean = node.prod_ean ? String(node.prod_ean).trim() : null;
          const symbol = node.prod_symbol ? String(node.prod_symbol).trim() : null;

          if (price > 0) {
            const data = { wholesalePrice: price };
            if (ean) feedItemsMap.set(ean, data);
            if (symbol) {
              feedItemsBySkuMap.set('HK-' + symbol, data);
              feedItemsBySkuMap.set('hk-' + symbol, data);
              feedItemsBySkuMap.set(symbol, data);
            }
          }
        }
      }
      else if (wholesalerKey === 'hurtownia-sportowa') {
        const productNodes = this.findNodes(parsedObj, 'product');
        console.log(`Found ${productNodes.length} product elements in Hurtownia Sportowa feed.`);
        for (const prodNode of productNodes) {
          const pricesNode = prodNode.prices;
          if (!pricesNode) continue;
          const wholesaleNetto = parseFloat(pricesNode.wholesale_netto || '0');
          const taxRate = parseFloat(pricesNode.tax_rate || '23');
          const grossPrice = wholesaleNetto * (1 + taxRate / 100);
          
          const retailNetto = parseFloat(pricesNode.retail_netto || '0');
          const srpGross = retailNetto * (1 + taxRate / 100);
          
          const stockNode = prodNode.stock;
          if (!stockNode) continue;
          const itemNodes = Array.isArray(stockNode.item) ? stockNode.item : (stockNode.item ? [stockNode.item] : []);
          
          if (grossPrice > 0) {
            const data = { wholesalePrice: grossPrice, srp: srpGross > 0 ? srpGross : undefined };
            const prodId = prodNode.id ? String(prodNode.id).trim() : null;
            if (prodId) {
              feedItemsBySkuMap.set('HS-' + prodId, data);
              feedItemsBySkuMap.set('hs-' + prodId, data);
              feedItemsBySkuMap.set(prodId, data);
            }

            for (const item of itemNodes) {
              const ean = this.getAttr(item, 'ean');
              const uid = this.getAttr(item, 'uid');
              if (ean) feedItemsMap.set(ean, data);
              if (uid) {
                feedItemsBySkuMap.set('HS-' + uid, data);
                feedItemsBySkuMap.set('hs-' + uid, data);
                feedItemsBySkuMap.set(uid, data);
              }
            }
          }
        }
      }

      // 6. Match DB items and calculate new prices
      const updatesList: PriceUpdateItem[] = [];

      // Match Products
      for (const product of dbProducts) {
        processed++;
        let match: { wholesalePrice: number; srp?: number } | undefined = undefined;

        // Try barcode/EAN match
        if (product.barcode && feedItemsMap.has(product.barcode)) {
          match = feedItemsMap.get(product.barcode);
        }
        // Try SKU match
        if (!match && feedItemsBySkuMap.has(product.sku)) {
          match = feedItemsBySkuMap.get(product.sku);
        }

        if (match) {
          matched++;
          const markedUp = this.applyMarkup(match.wholesalePrice, priceRules);
          const finalPrice = this.roundPriceTo99(markedUp);
          const currentPriceNum = Number(product.price);

          // Handle SRP compareAtPrice suggestion:
          // If SRP > finalPrice, we set compareAtPrice = SRP. Otherwise, we set it to null.
          let targetCompareAtPrice: number | null = null;
          if (match.srp && match.srp > finalPrice) {
            targetCompareAtPrice = this.roundPriceTo99(match.srp);
          }

          const currentPurchasePrice = product.purchasePrice ? Number(product.purchasePrice) : null;
          const newPurchasePrice = match.wholesalePrice;

          const hasPriceChanged = Math.abs(currentPriceNum - finalPrice) > 0.005;
          const hasCompareAtChanged = Math.abs(Number(product.compareAtPrice || 0) - (targetCompareAtPrice || 0)) > 0.005;
          const hasPurchasePriceChanged = currentPurchasePrice === null || Math.abs(currentPurchasePrice - newPurchasePrice) > 0.005;

          if (hasPriceChanged || hasCompareAtChanged || hasPurchasePriceChanged) {
            updatesList.push({
              id: product.id,
              isVariant: false,
              sku: product.sku,
              name: product.name,
              currentPrice: currentPriceNum,
              newPrice: finalPrice,
              purchasePrice: newPurchasePrice,
              compareAtPrice: targetCompareAtPrice,
              hasPriceChanged,
              hasCompareAtChanged,
              hasPurchasePriceChanged,
            });
          }
        } else {
          skipped++;
        }

        if (limit > 0 && processed >= limit) break;
      }

      // Match Variants (if limit is not reached or not active)
      if (limit === 0 || processed < limit) {
        for (const variant of dbVariants) {
          processed++;
          let match: { wholesalePrice: number; srp?: number } | undefined = undefined;

          // Try barcode/EAN match
          if (variant.barcode && feedItemsMap.has(variant.barcode)) {
            match = feedItemsMap.get(variant.barcode);
          }
          // Try SKU match
          if (!match && feedItemsBySkuMap.has(variant.sku)) {
            match = feedItemsBySkuMap.get(variant.sku);
          }

          if (match) {
            matched++;
            const markedUp = this.applyMarkup(match.wholesalePrice, priceRules);
            const finalPrice = this.roundPriceTo99(markedUp);
            const currentPriceNum = Number(variant.price);

            let targetCompareAtPrice: number | null = null;
            if (match.srp && match.srp > finalPrice) {
              targetCompareAtPrice = this.roundPriceTo99(match.srp);
            }

            const currentPurchasePrice = variant.purchasePrice ? Number(variant.purchasePrice) : null;
            const newPurchasePrice = match.wholesalePrice;

            const hasPriceChanged = Math.abs(currentPriceNum - finalPrice) > 0.005;
            const hasCompareAtChanged = Math.abs(Number(variant.compareAtPrice || 0) - (targetCompareAtPrice || 0)) > 0.005;
            const hasPurchasePriceChanged = currentPurchasePrice === null || Math.abs(currentPurchasePrice - newPurchasePrice) > 0.005;

            if (hasPriceChanged || hasCompareAtChanged || hasPurchasePriceChanged) {
              updatesList.push({
                id: variant.id,
                isVariant: true,
                sku: variant.sku,
                name: variant.name,
                currentPrice: currentPriceNum,
                newPrice: finalPrice,
                purchasePrice: newPurchasePrice,
                compareAtPrice: targetCompareAtPrice,
                hasPriceChanged,
                hasCompareAtChanged,
                hasPurchasePriceChanged,
              });
            }
          } else {
            skipped++;
          }

          if (limit > 0 && processed >= limit) break;
        }
      }

      console.log(`Matching complete. Checked: ${processed}, Matched in XML: ${matched}, Changes Detected: ${updatesList.length}`);

      // 7. Perform DB updates (only if not dry run)
      if (dryRun) {
        console.log('--- DRY RUN: Printing first 10 changes ---');
        updatesList.slice(0, 10).forEach(u => {
          console.log(`[DRY] ${u.isVariant ? 'Variant' : 'Product'} ${u.sku} "${u.name}":
  Price: ${u.currentPrice} PLN -> ${u.newPrice} PLN (changed: ${u.hasPriceChanged})
  PurchasePrice: ${u.purchasePrice} PLN (changed: ${u.hasPurchasePriceChanged})
  CompareAtPrice: ${u.compareAtPrice ?? 'null'} PLN (changed: ${u.hasCompareAtChanged})`);
        });
        updated = updatesList.length;
      } else {
        const changedProductIds = new Set<string>();
        let count = 0;

        // Process in batches of 30 to be very fast but avoid Neon connection pool exhaust
        const BATCH_SIZE = 30;
        for (let i = 0; i < updatesList.length; i += BATCH_SIZE) {
          const batch = updatesList.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (item) => {
              try {
                const updateData: any = {};
                if (item.hasCompareAtChanged) {
                  updateData.compareAtPrice = item.compareAtPrice;
                }
                if (item.hasPurchasePriceChanged) {
                  updateData.purchasePrice = item.purchasePrice;
                }

                if (item.isVariant) {
                  const dbVariant = dbVariants.find(v => v.id === item.id);
                  if (dbVariant?.productId) {
                    changedProductIds.add(dbVariant.productId);
                  }

                  if (Object.keys(updateData).length > 0) {
                    await prisma.productVariant.update({
                      where: { id: item.id },
                      data: updateData,
                    });
                  }

                  if (item.hasPriceChanged) {
                    await priceHistoryService.updateVariantPrice({
                      variantId: item.id,
                      newPrice: item.newPrice,
                      source: PriceChangeSource.IMPORT,
                      reason: `Auto sync z feedu XML (${wholesalerKey})`,
                    });
                  }
                } else {
                  changedProductIds.add(item.id);

                  if (Object.keys(updateData).length > 0) {
                    await prisma.product.update({
                      where: { id: item.id },
                      data: updateData,
                    });
                  }

                  if (item.hasPriceChanged) {
                    await priceHistoryService.updateProductPrice({
                      productId: item.id,
                      newPrice: item.newPrice,
                      source: PriceChangeSource.IMPORT,
                      reason: `Auto sync z feedu XML (${wholesalerKey})`,
                    });
                  }
                }

                updated++;
                const currentCount = ++count;
                if (currentCount % 100 === 0 || currentCount <= 5) {
                  console.log(`[${currentCount}/${updatesList.length}] Updated ${item.sku} (price: ${item.newPrice}, purchase: ${item.purchasePrice})`);
                }
              } catch (err: any) {
                console.error(`Error updating price/purchasePrice for ${item.sku}:`, err.message);
                errors.push(`Update error ${item.sku}: ${err.message}`);
              }
            })
          );
        }

        // 8. Update parent product prices to be the minimum of their active variants' prices
        let parentProductPriceUpdatesCount = 0;
        for (const productId of changedProductIds) {
          const variants = await prisma.productVariant.findMany({
            where: { productId },
            select: { price: true }
          });
          if (variants.length > 0) {
            const minPrice = Math.min(...variants.map(v => Number(v.price)));
            if (minPrice > 0) {
              const parentProduct = await prisma.product.findUnique({
                where: { id: productId },
                select: { price: true }
              });
              if (parentProduct) {
                const currentParentPrice = Number(parentProduct.price);
                if (Math.abs(currentParentPrice - minPrice) > 0.005) {
                  try {
                    await priceHistoryService.updateProductPrice({
                      productId,
                      newPrice: minPrice,
                      source: PriceChangeSource.IMPORT,
                      reason: `Auto-aktualizacja ceny bazowej na podstawie najtańszego wariantu (${wholesalerKey})`,
                    });
                    parentProductPriceUpdatesCount++;
                  } catch (err: any) {
                    errors.push(`Parent product price update error ${productId}: ${err.message}`);
                  }
                }
              }
            }
          }
        }
        if (parentProductPriceUpdatesCount > 0) {
          console.log(`Auto-updated base prices for ${parentProductPriceUpdatesCount} parent products.`);
        }

        // 9. Reindex changed products in Meilisearch
        if (changedProductIds.size > 0) {
          console.log(`Queuing ${changedProductIds.size} products for Meilisearch reindexing...`);
          const productIdsArr = Array.from(changedProductIds);
          // Index in chunks of 200
          for (let i = 0; i < productIdsArr.length; i += 200) {
            const chunk = productIdsArr.slice(i, i + 200);
            await Promise.all(chunk.map(id => queueProductIndex(id).catch(err => {
              console.error(`Failed to queue Meilisearch index for product ${id}:`, err.message);
            })));
          }
          console.log('Meilisearch indexing jobs queued.');
        }

        // Write last sync timestamp to Settings table
        await prisma.settings.upsert({
          where: { key: `last_sync_${wholesalerKey.toLowerCase()}_xml` },
          update: { value: new Date().toISOString() },
          create: {
            key: `last_sync_${wholesalerKey.toLowerCase()}_xml`,
            value: new Date().toISOString(),
          },
        });
      }
    } catch (error: any) {
      console.error(`Fatal error syncing ${wholesalerKey}:`, error.message);
      errors.push(`Fatal sync error: ${error.message}`);
    }

    return {
      processed,
      matched,
      updated,
      skipped,
      errors,
    };
  }
}

export const feedPriceSyncService = new FeedPriceSyncService();
