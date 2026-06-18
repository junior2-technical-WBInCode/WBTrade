/**
 * ============================================
 * OMNIBUS: PriceHistoryService
 * ============================================
 * 
 * Centralny serwis do zarządzania zmianami cen zgodnie z Dyrektywą Omnibus (2019/2161).
 * 
 * DEFINICJA OKNA 30 DNI:
 * - Rolling window: ostatnie 30*24h (720 godzin) od momentu zapytania
 * - Strefa czasowa: UTC (wszystkie daty w bazie są w UTC)
 * - Dla Polski (CET/CEST) różnica +1/+2h, ale używamy UTC dla konsekwencji
 * 
 * ZASADY:
 * 1. Każda zmiana ceny MUSI przechodzić przez ten serwis
 * 2. Historia jest zapisywana ATOMOWO razem ze zmianą ceny
 * 3. lowestPrice30Days jest przeliczane przy każdej zmianie
 * 4. Dla wariantów: lowestPrice30Days jest per-wariant
 * 5. Dla produktów bez wariantów: lowestPrice30Days na produkcie
 * 
 * @author WBTrade Team
 * @version 1.0.0
 * @date 2026-01-27
 */

import { Prisma, PriceChangeSource } from '@prisma/client';
import { prisma } from '../db';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// TYPY
// ============================================

export interface UpdateProductPriceParams {
  productId: string;
  newPrice: number | Decimal;
  source: PriceChangeSource;
  changedBy?: string | null;  // userId lub null dla SYSTEM
  reason?: string;
}

export interface UpdateVariantPriceParams {
  variantId: string;
  newPrice: number | Decimal;
  source: PriceChangeSource;
  changedBy?: string | null;
  reason?: string;
}

export interface PriceUpdateResult {
  success: boolean;
  oldPrice: Decimal;
  newPrice: Decimal;
  priceChanged: boolean;
  lowestPrice30Days: Decimal;
  historyRecordId?: string;
}

export interface LowestPriceResult {
  lowestPrice: Decimal;
  lowestPriceAt: Date;
  recordCount: number;
}

// ============================================
// STAŁE
// ============================================

/** Okno czasowe Omnibus w dniach */
const OMNIBUS_WINDOW_DAYS = 30;

/** Okno czasowe w milisekundach */
const OMNIBUS_WINDOW_MS = OMNIBUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// ============================================
// KLASA SERWISU
// ============================================

export class PriceHistoryService {
  
  /**
   * Aktualizuje cenę produktu (dla produktów bez wariantów lub jako cena bazowa).
   * 
   * Operacja atomowa:
   * 1. Pobiera aktualną cenę
   * 2. Jeśli się zmieniła -> zapisuje historię
   * 3. Aktualizuje cenę produktu
   * 4. Przelicza lowestPrice30Days
   * 
   * @param params - Parametry aktualizacji
   * @returns Wynik operacji
   */
  async updateProductPrice(params: UpdateProductPriceParams): Promise<PriceUpdateResult> {
    const { productId, newPrice, source, changedBy, reason } = params;
    const newPriceDecimal = new Decimal(newPrice.toString());
    
    return await prisma.$transaction(async (tx) => {
      // 1. Pobierz aktualny produkt
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, price: true }
      });
      
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }
      
      const oldPrice = product.price;
      const priceChanged = !oldPrice.equals(newPriceDecimal);
      
      let historyRecordId: string | undefined;
      
      // 2. Jeśli cena się zmieniła -> zapisz historię
      if (priceChanged) {
        const historyRecord = await tx.priceHistory.create({
          data: {
            productId,
            variantId: null,
            oldPrice,
            newPrice: newPriceDecimal,
            source,
            changedBy: changedBy || null,
            reason: reason || null,
          }
        });
        historyRecordId = historyRecord.id;
        
        // 3. Zaktualizuj cenę produktu
        await tx.product.update({
          where: { id: productId },
          data: { price: newPriceDecimal }
        });

        // 3a. Sprawdź alerty monitorowania cen
        const monitor = await tx.productPriceMonitor.findUnique({
          where: { productId }
        });
        if (monitor) {
          const isIncrease = newPriceDecimal.greaterThan(oldPrice);
          const isDecrease = newPriceDecimal.lessThan(oldPrice);
          if ((isIncrease && monitor.alertOnIncrease) || (isDecrease && monitor.alertOnDecrease)) {
            await tx.productPriceAlert.create({
              data: {
                monitorId: monitor.id,
                oldPrice,
                newPrice: newPriceDecimal
              }
            });
          }
        }
      }
      
      // 4. Przelicz lowestPrice30Days (nawet jeśli cena się nie zmieniła - dla spójności)
      const lowestResult = await this.calculateLowest30DaysForProduct(tx, productId, newPriceDecimal);
      
      // 5. Zapisz lowestPrice30Days na produkcie
      await tx.product.update({
        where: { id: productId },
        data: {
          lowestPrice30Days: lowestResult.lowestPrice,
          lowestPrice30DaysAt: lowestResult.lowestPriceAt
        }
      });
      
      return {
        success: true,
        oldPrice,
        newPrice: newPriceDecimal,
        priceChanged,
        lowestPrice30Days: lowestResult.lowestPrice,
        historyRecordId
      };
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
    });
  }
  
  /**
   * Aktualizuje cenę wariantu produktu.
   * 
   * Operacja atomowa analogiczna do updateProductPrice.
   * Dodatkowo może aktualizować cenę produktu nadrzędnego.
   * 
   * @param params - Parametry aktualizacji
   * @returns Wynik operacji
   */
  async updateVariantPrice(params: UpdateVariantPriceParams): Promise<PriceUpdateResult> {
    const { variantId, newPrice, source, changedBy, reason } = params;
    const newPriceDecimal = new Decimal(newPrice.toString());
    
    return await prisma.$transaction(async (tx) => {
      // 1. Pobierz aktualny wariant
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true, productId: true, price: true }
      });
      
      if (!variant) {
        throw new Error(`Variant not found: ${variantId}`);
      }
      
      const oldPrice = variant.price;
      const priceChanged = !oldPrice.equals(newPriceDecimal);
      
      let historyRecordId: string | undefined;
      
      // 2. Jeśli cena się zmieniła -> zapisz historię
      if (priceChanged) {
        const historyRecord = await tx.priceHistory.create({
          data: {
            productId: variant.productId,
            variantId,
            oldPrice,
            newPrice: newPriceDecimal,
            source,
            changedBy: changedBy || null,
            reason: reason || null,
          }
        });
        historyRecordId = historyRecord.id;
        
        // 3. Zaktualizuj cenę wariantu
        await tx.productVariant.update({
          where: { id: variantId },
          data: { price: newPriceDecimal }
        });

        // 3a. Sprawdź alerty monitorowania cen dla produktu nadrzędnego
        const monitor = await tx.productPriceMonitor.findUnique({
          where: { productId: variant.productId }
        });
        if (monitor) {
          const isIncrease = newPriceDecimal.greaterThan(oldPrice);
          const isDecrease = newPriceDecimal.lessThan(oldPrice);
          if ((isIncrease && monitor.alertOnIncrease) || (isDecrease && monitor.alertOnDecrease)) {
            await tx.productPriceAlert.create({
              data: {
                monitorId: monitor.id,
                oldPrice,
                newPrice: newPriceDecimal
              }
            });
          }
        }
      }
      
      // 4. Przelicz lowestPrice30Days dla wariantu
      const lowestResult = await this.calculateLowest30DaysForVariant(tx, variantId, newPriceDecimal);
      
      // 5. Zapisz lowestPrice30Days na wariancie
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          lowestPrice30Days: lowestResult.lowestPrice,
          lowestPrice30DaysAt: lowestResult.lowestPriceAt
        }
      });
      
      return {
        success: true,
        oldPrice,
        newPrice: newPriceDecimal,
        priceChanged,
        lowestPrice30Days: lowestResult.lowestPrice,
        historyRecordId
      };
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
    });
  }
  
  /**
   * Wylicza najniższą cenę z ostatnich 30 dni dla produktu.
   * 
   * Algorytm:
   * 1. Pobierz MIN(newPrice) z price_history gdzie changedAt >= (now - 30 dni)
   * 2. Jeśli brak historii -> użyj aktualnej ceny
   * 3. Porównaj z aktualną ceną i weź mniejszą
   * 
   * @param tx - Transakcja Prisma
   * @param productId - ID produktu
   * @param currentPrice - Aktualna cena (do porównania)
   * @returns Najniższa cena i data
   */
  private async calculateLowest30DaysForProduct(
    tx: Prisma.TransactionClient,
    productId: string,
    currentPrice: Decimal
  ): Promise<LowestPriceResult> {
    const windowStart = new Date(Date.now() - OMNIBUS_WINDOW_MS);
    
    // Pobierz MIN z oldPrice i newPrice - obie ceny obowiązywały w oknie 30 dni
    const result = await tx.priceHistory.aggregate({
      where: {
        productId,
        variantId: null, // Tylko historia produktu, nie wariantów
        changedAt: { gte: windowStart }
      },
      _min: { newPrice: true, oldPrice: true },
      _count: true
    });
    
    const lowestNewPrice = result._min.newPrice;
    const lowestOldPrice = result._min.oldPrice;
    const recordCount = result._count;
    
    // Jeśli brak historii w oknie -> najniższa = aktualna cena
    if (!lowestNewPrice && !lowestOldPrice) {
      return {
        lowestPrice: currentPrice,
        lowestPriceAt: new Date(),
        recordCount: 0
      };
    }
    
    // Weź minimum z oldPrice, newPrice i aktualnej ceny
    let historyLowest = lowestNewPrice || lowestOldPrice;
    if (lowestOldPrice && historyLowest && lowestOldPrice.lessThan(historyLowest)) {
      historyLowest = lowestOldPrice;
    }
    
    // Porównaj z aktualną ceną i weź mniejszą
    const lowestPrice = (historyLowest && historyLowest.lessThan(currentPrice)) ? historyLowest : currentPrice;
    
    // Znajdź datę najniższej ceny
    let lowestPriceAt = new Date();
    if (historyLowest && historyLowest.lessThanOrEqualTo(currentPrice)) {
      // Szukaj w oldPrice lub newPrice - sprawdź oba
      const lowestRecord = await tx.priceHistory.findFirst({
        where: {
          productId,
          variantId: null,
          changedAt: { gte: windowStart },
          OR: [
            { oldPrice: historyLowest },
            { newPrice: historyLowest }
          ]
        },
        orderBy: { changedAt: 'asc' },
        select: { changedAt: true }
      });
      if (lowestRecord) {
        lowestPriceAt = lowestRecord.changedAt;
      }
    }
    
    return {
      lowestPrice,
      lowestPriceAt,
      recordCount
    };
  }
  
  /**
   * Wylicza najniższą cenę z ostatnich 30 dni dla wariantu.
   * Analogicznie do calculateLowest30DaysForProduct.
   */
  private async calculateLowest30DaysForVariant(
    tx: Prisma.TransactionClient,
    variantId: string,
    currentPrice: Decimal
  ): Promise<LowestPriceResult> {
    const windowStart = new Date(Date.now() - OMNIBUS_WINDOW_MS);
    
    const result = await tx.priceHistory.aggregate({
      where: {
        variantId,
        changedAt: { gte: windowStart }
      },
      _min: { newPrice: true, oldPrice: true },
      _count: true
    });
    
    const lowestNewPrice = result._min.newPrice;
    const lowestOldPrice = result._min.oldPrice;
    const recordCount = result._count;
    
    if (!lowestNewPrice && !lowestOldPrice) {
      return {
        lowestPrice: currentPrice,
        lowestPriceAt: new Date(),
        recordCount: 0
      };
    }
    
    // Weź minimum z oldPrice, newPrice i aktualnej ceny
    let historyLowest = lowestNewPrice || lowestOldPrice;
    if (lowestOldPrice && historyLowest && lowestOldPrice.lessThan(historyLowest)) {
      historyLowest = lowestOldPrice;
    }
    
    const lowestPrice = (historyLowest && historyLowest.lessThan(currentPrice)) ? historyLowest : currentPrice;
    
    let lowestPriceAt = new Date();
    if (historyLowest && historyLowest.lessThanOrEqualTo(currentPrice)) {
      const lowestRecord = await tx.priceHistory.findFirst({
        where: {
          variantId,
          changedAt: { gte: windowStart },
          OR: [
            { oldPrice: historyLowest },
            { newPrice: historyLowest }
          ]
        },
        orderBy: { changedAt: 'asc' },
        select: { changedAt: true }
      });
      if (lowestRecord) {
        lowestPriceAt = lowestRecord.changedAt;
      }
    }
    
    return {
      lowestPrice,
      lowestPriceAt,
      recordCount
    };
  }
  
  /**
   * Przelicza lowestPrice30Days dla wszystkich produktów.
   * Używane w scheduled job lub backfill.
   * 
   * @param batchSize - Rozmiar batcha
   * @returns Liczba przetworzonych produktów
   */
  async recalculateAllProducts(batchSize = 100): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;
    let cursor: string | undefined;
    
    while (true) {
      const products = await prisma.product.findMany({
        take: batchSize,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        select: { id: true, price: true },
        orderBy: { id: 'asc' }
      });
      
      if (products.length === 0) break;
      
      for (const product of products) {
        try {
          const lowestResult = await prisma.$transaction(async (tx) => {
            return this.calculateLowest30DaysForProduct(tx, product.id, product.price);
          });
          
          await prisma.product.update({
            where: { id: product.id },
            data: {
              lowestPrice30Days: lowestResult.lowestPrice,
              lowestPrice30DaysAt: lowestResult.lowestPriceAt
            }
          });
          
          processed++;
        } catch (error) {
          errors.push(`Product ${product.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      cursor = products[products.length - 1].id;
    }
    
    return { processed, errors };
  }
  
  /**
   * Przelicza lowestPrice30Days dla wszystkich wariantów.
   */
  async recalculateAllVariants(batchSize = 100): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;
    let cursor: string | undefined;
    
    while (true) {
      const variants = await prisma.productVariant.findMany({
        take: batchSize,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        select: { id: true, price: true },
        orderBy: { id: 'asc' }
      });
      
      if (variants.length === 0) break;
      
      for (const variant of variants) {
        try {
          const lowestResult = await prisma.$transaction(async (tx) => {
            return this.calculateLowest30DaysForVariant(tx, variant.id, variant.price);
          });
          
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: {
              lowestPrice30Days: lowestResult.lowestPrice,
              lowestPrice30DaysAt: lowestResult.lowestPriceAt
            }
          });
          
          processed++;
        } catch (error) {
          errors.push(`Variant ${variant.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      cursor = variants[variants.length - 1].id;
    }
    
    return { processed, errors };
  }
  
  /**
   * Pobiera historię cen produktu.
   * 
   * @param productId - ID produktu
   * @param limit - Maksymalna liczba rekordów
   * @returns Lista zmian cen
   */
  async getProductPriceHistory(productId: string, limit = 100, offset = 0) {
    return prisma.priceHistory.findMany({
      where: { productId },
      orderBy: { changedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        variant: { select: { id: true, name: true, sku: true } }
      }
    });
  }
  
  /**
   * Pobiera historię cen wariantu.
   */
  async getVariantPriceHistory(variantId: string, limit = 100, offset = 0) {
    return prisma.priceHistory.findMany({
      where: { variantId },
      orderBy: { changedAt: 'desc' },
      take: limit,
      skip: offset
    });
  }
  
  /**
   * Sanity check: porównuje stored lowestPrice30Days z calculated.
   * Używane do weryfikacji poprawności danych.
   * 
   * @returns Lista produktów z rozjazdem
   */
  async findProductsWithMismatch(limit = 100): Promise<Array<{
    productId: string;
    productName: string;
    storedLowest: Decimal | null;
    calculatedLowest: Decimal;
    difference: Decimal;
  }>> {
    const windowStart = new Date(Date.now() - OMNIBUS_WINDOW_MS);
    const mismatches: Array<{
      productId: string;
      productName: string;
      storedLowest: Decimal | null;
      calculatedLowest: Decimal;
      difference: Decimal;
    }> = [];
    
    const products = await prisma.product.findMany({
      take: limit,
      select: { id: true, name: true, price: true, lowestPrice30Days: true }
    });
    
    for (const product of products) {
      const result = await prisma.priceHistory.aggregate({
        where: {
          productId: product.id,
          variantId: null,
          changedAt: { gte: windowStart }
        },
        _min: { newPrice: true }
      });
      
      const historyLowest = result._min.newPrice;
      const calculatedLowest = historyLowest && historyLowest.lessThan(product.price) 
        ? historyLowest 
        : product.price;
      
      const storedLowest = product.lowestPrice30Days;
      
      if (!storedLowest || !calculatedLowest.equals(storedLowest)) {
        mismatches.push({
          productId: product.id,
          productName: product.name,
          storedLowest,
          calculatedLowest,
          difference: storedLowest 
            ? calculatedLowest.minus(storedLowest).abs() 
            : calculatedLowest
        });
      }
    }
    
    return mismatches;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const priceHistoryService = new PriceHistoryService();
