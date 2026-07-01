import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { roundMoney } from '../lib/currency';
import { wholesalerConfigService } from './wholesaler-config.service';

// Default config values
const DEFAULT_HOLD_DAYS = 14;

export interface SalesRepConfig {
  baseCommissionPct: number;
  maxDiscountPct: number;
  minCompanyMarginPct: number;
  markupMultiplier: number;
  holdDays: number;
  // When true, orders placed through the sales-rep panel never generate affiliate
  // commission — even if the buyer still carries a referral cookie.
  blockAffiliation: boolean;
}

let configCache: { config: SalesRepConfig; expiresAt: number } | null = null;
const CACHE_TTL = 60_000; // 60s cache TTL

function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

export class SalesRepService {
  /**
   * Get dynamic config thresholds from settings database with in-memory caching
   */
  async getSalesRepConfig(): Promise<SalesRepConfig> {
    const now = Date.now();
    if (configCache && configCache.expiresAt > now) {
      return configCache.config;
    }

    const defaultCfg: SalesRepConfig = {
      baseCommissionPct: 5,
      maxDiscountPct: 13,
      minCompanyMarginPct: 10,
      markupMultiplier: 1.35,
      holdDays: DEFAULT_HOLD_DAYS,
      blockAffiliation: true,
    };

    try {
      const dbSettings = await prisma.settings.findUnique({
        where: { key: 'sales_rep_config' },
      });

      if (dbSettings && dbSettings.value) {
        const val = typeof dbSettings.value === 'string'
          ? JSON.parse(dbSettings.value)
          : (dbSettings.value as any);

        const merged: SalesRepConfig = {
          baseCommissionPct: Number(val.baseCommissionPct ?? defaultCfg.baseCommissionPct),
          maxDiscountPct: Number(val.maxDiscountPct ?? defaultCfg.maxDiscountPct),
          minCompanyMarginPct: Number(val.minCompanyMarginPct ?? defaultCfg.minCompanyMarginPct),
          markupMultiplier: Number(val.markupMultiplier ?? defaultCfg.markupMultiplier),
          holdDays: Number(val.holdDays ?? defaultCfg.holdDays),
          blockAffiliation: val.blockAffiliation !== undefined ? Boolean(val.blockAffiliation) : defaultCfg.blockAffiliation,
        };
        configCache = { config: merged, expiresAt: now + CACHE_TTL };
        return merged;
      }
    } catch (err) {
      console.error('[SalesRepService] Error reading settings key="sales_rep_config":', err);
    }

    // Cache the fallback to avoid DB spam on failures
    configCache = { config: defaultCfg, expiresAt: now + CACHE_TTL };
    return defaultCfg;
  }

  /**
   * Clear in-memory config cache
   */
  clearCache(): void {
    configCache = null;
    console.log('[SalesRepService] Settings cache cleared.');
  }

  /**
   * Check if a product is an outlet or promotional product (excluded from sales rep)
   */
  async isOutletOrPromoProduct(product: { baselinkerProductId: string | null; compareAtPrice: Decimal | number | null; price: Decimal | number }): Promise<boolean> {
    // 1. Check compareAtPrice > price (promotional)
    const priceNum = toNum(product.price);
    const compareAtNum = toNum(product.compareAtPrice);
    if (compareAtNum > priceNum) {
      return true;
    }

    // 2. Check if it belongs to the 'outlet' warehouse based on baselinkerProductId prefix
    if (product.baselinkerProductId) {
      try {
        const allConfigs = await wholesalerConfigService.getAll();
        const outletConfig = allConfigs.find(c => c.key === 'outlet');
        if (outletConfig && outletConfig.prefix) {
          const prefixLower = outletConfig.prefix.toLowerCase();
          if (product.baselinkerProductId.toLowerCase().startsWith(prefixLower)) {
            return true;
          }
        }
      } catch (err) {
        console.error('[SalesRepService] Error reading wholesaler config for outlet check:', err);
      }
    }

    return false;
  }

  /**
   * Attribute commission to sales rep and record discount inside transaction context
   */
  async attributeCommission(
    tx: Prisma.TransactionClient,
    orderId: string,
    salesRepId: string,
    discountPct: number
  ): Promise<void> {
    const cfg = await this.getSalesRepConfig();
    const pool = cfg.baseCommissionPct + cfg.maxDiscountPct;

    if (discountPct < 0 || discountPct > cfg.maxDiscountPct) {
      throw new Error(`Rabat handlowca musi mieścić się w przedziale 0-${cfg.maxDiscountPct}%. Przekazano: ${discountPct}%`);
    }

    // Load order items
    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });

    let baseTotal = 0;
    const commissionPct = pool - discountPct;

    // Calculate base values excluding outlet/promo products
    for (const item of orderItems) {
      const variant = item.variant;
      const product = variant.product;

      // Exclude outlet/promo products from the commission and discount base
      const isPromo = await this.isOutletOrPromoProduct({
        baselinkerProductId: product.baselinkerProductId,
        compareAtPrice: variant.compareAtPrice ?? product.compareAtPrice,
        price: variant.price ?? product.price,
      });

      if (isPromo) {
        // Outlet/promo products do not contribute to base and do not get sales rep discount
        continue;
      }

      // Base price = purchasePrice (variant or product) or fallback to unitPrice/markupMultiplier
      const purchasePrice = toNum(variant.purchasePrice ?? product.purchasePrice);
      const usedFallback = !(purchasePrice > 0);
      const effectiveBasePrice = usedFallback
        ? toNum(item.unitPrice) / cfg.markupMultiplier
        : purchasePrice;

      if (usedFallback) {
        // Commission/discount base is estimated from the configured markup, not a real
        // purchase price — may over/under-pay. Flag for review.
        console.warn(`[SalesRepService] Order ${orderId}: variant ${variant.id} has no purchasePrice — using fallback base ${effectiveBasePrice.toFixed(2)} (unitPrice/${cfg.markupMultiplier}).`);
      }

      baseTotal += effectiveBasePrice * item.quantity;
    }

    // Calculations in money terms
    const discountAmount = roundMoney(baseTotal * (discountPct / 100));
    const commissionAmount = roundMoney(baseTotal * (commissionPct / 100));

    // Update order with the discount + link the sales rep (so orders.sales_rep_id is set,
    // not just the commission row — enables order→rep reporting/joins).
    await tx.order.update({
      where: { id: orderId },
      data: {
        salesRepId,
        discount: discountAmount,
        total: {
          decrement: discountAmount, // Subtract the discount from order total
        },
        repDiscountPct: new Prisma.Decimal(discountPct),
      },
    });

    // Create the commission record (PENDING by default)
    await tx.salesRepCommission.create({
      data: {
        orderId,
        salesRepId,
        status: 'PENDING',
        base: new Prisma.Decimal(baseTotal),
        discountPct: new Prisma.Decimal(discountPct),
        commissionPct: new Prisma.Decimal(commissionPct),
        commissionAmount: new Prisma.Decimal(commissionAmount),
      },
    });

    console.log(`[SalesRepService] Attributed commission for order ${orderId}: rep=${salesRepId}, discount=${discountAmount} PLN (${discountPct}%), commission=${commissionAmount} PLN (${commissionPct}%)`);
  }

  /**
   * Get sales rep balance metrics
   */
  async computeBalance(salesRepId: string) {
    // 1. Approved commissions
    const approvedResult = await prisma.salesRepCommission.aggregate({
      where: { salesRepId, status: 'APPROVED' },
      _sum: { commissionAmount: true },
    });
    const approved = toNum(approvedResult._sum.commissionAmount);

    // 2. Frozen commissions (PAID but not yet APPROVED)
    const frozenResult = await prisma.salesRepCommission.aggregate({
      where: { salesRepId, status: 'PAID' },
      _sum: { commissionAmount: true },
    });
    const frozen = toNum(frozenResult._sum.commissionAmount);

    // 3. Total earned (PAID + APPROVED)
    const totalResult = await prisma.salesRepCommission.aggregate({
      where: { salesRepId, status: { in: ['PAID', 'APPROVED'] } },
      _sum: { commissionAmount: true },
    });
    const totalEarned = toNum(totalResult._sum.commissionAmount);

    // 4. Reserved by payouts (PENDING + COMPLETED)
    const reservedResult = await prisma.salesRepPayout.aggregate({
      where: { salesRepId, status: { in: ['PENDING', 'COMPLETED'] } },
      _sum: { amount: true },
    });
    const reserved = toNum(reservedResult._sum.amount);

    const net = roundMoney(approved - reserved);

    return {
      // Withdrawable amount is clamped at 0; `net`/`owed` surface clawback debt
      // (commission paid out then cancelled via refund) instead of hiding it.
      available: Math.max(0, net),
      net,
      owed: net < 0 ? roundMoney(-net) : 0,
      frozen: roundMoney(frozen),
      totalEarned: roundMoney(totalEarned),
      reserved: roundMoney(reserved),
    };
  }

  /**
   * Mark commission as PAID when order payment succeeds
   */
  async markPaid(orderId: string): Promise<void> {
    try {
      const result = await prisma.salesRepCommission.updateMany({
        where: {
          orderId,
          status: 'PENDING',
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      if (result.count > 0) {
        console.log(`[SalesRepService] Marked commission as PAID for order ${orderId}`);
      }
    } catch (err) {
      console.error(`[SalesRepService] Error marking commission as PAID for order ${orderId}:`, err);
    }
  }

  /**
   * Cancel commission when order is cancelled/refunded
   */
  async cancelForOrder(orderId: string): Promise<void> {
    try {
      const result = await prisma.salesRepCommission.updateMany({
        where: {
          orderId,
          status: { in: ['PENDING', 'PAID', 'APPROVED'] },
        },
        data: {
          status: 'CANCELLED',
        },
      });
      if (result.count > 0) {
        console.log(`[SalesRepService] Cancelled commission for order ${orderId}`);
      }
    } catch (err) {
      console.error(`[SalesRepService] Error cancelling commission for order ${orderId}:`, err);
    }
  }

  /**
   * Process holds (PAID -> APPROVED) after clearance window (holdDays)
   */
  async processCommissionHolds(): Promise<void> {
    const cfg = await this.getSalesRepConfig();
    const holdDate = new Date();
    holdDate.setDate(holdDate.getDate() - cfg.holdDays);

    try {
      // Self-heal: PENDING commissions whose order is already PAID but markPaid was missed
      // → promote to PAID now so the hold clock starts (otherwise stuck PENDING forever).
      const orphaned = await prisma.salesRepCommission.findMany({
        where: {
          status: 'PENDING',
          order: { paymentStatus: 'PAID', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
        },
        select: { id: true },
      });
      if (orphaned.length > 0) {
        await prisma.salesRepCommission.updateMany({
          where: { id: { in: orphaned.map((c) => c.id) } },
          data: { status: 'PAID', paidAt: new Date() },
        });
        console.log(`[SalesRepService] Self-healed ${orphaned.length} PENDING commission(s) for already-paid orders.`);
      }

      const result = await prisma.salesRepCommission.updateMany({
        where: {
          status: 'PAID',
          paidAt: { lte: holdDate },
        },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
        },
      });
      if (result.count > 0) {
        console.log(`[SalesRepService] Released holds for ${result.count} commissions.`);
      }
    } catch (err) {
      console.error('[SalesRepService] Error processing commission holds:', err);
    }
  }

  /**
   * Request a payout based on invoice uploaded by merchant (PENDING by default)
   */
  async requestPayout(salesRepId: string, amount: number, invoiceUrl: string) {
    if (amount <= 0) throw new Error('Kwota wypłaty musi być większa niż 0.');
    if (!invoiceUrl) throw new Error('Wymagany jest link do faktury.');
    // Invoice must come from our own upload endpoint, not an arbitrary external URL.
    if (!invoiceUrl.includes('/uploads/')) {
      throw new Error('Nieprawidłowy link do faktury — wgraj plik przez formularz.');
    }

    return prisma.$transaction(
      async (tx) => {
        // Re-compute available balance
        const approvedResult = await tx.salesRepCommission.aggregate({
          where: { salesRepId, status: 'APPROVED' },
          _sum: { commissionAmount: true },
        });
        const approved = toNum(approvedResult._sum.commissionAmount);

        const reservedResult = await tx.salesRepPayout.aggregate({
          where: { salesRepId, status: { in: ['PENDING', 'COMPLETED'] } },
          _sum: { amount: true },
        });
        const reserved = toNum(reservedResult._sum.amount);

        const available = roundMoney(approved - reserved);

        if (amount > available) {
          throw new Error(`Niewystarczające środki do wypłaty. Dostępne: ${available} PLN, wnioskowano: ${amount} PLN.`);
        }

        const payout = await tx.salesRepPayout.create({
          data: {
            salesRepId,
            amount: new Prisma.Decimal(amount),
            status: 'PENDING',
            invoiceUrl,
          },
        });

        console.log(`[SalesRepService] Payout requested: rep=${salesRepId}, amount=${amount} PLN`);
        return payout;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  /**
   * Complete payout by admin (marks PENDING as COMPLETED)
   */
  async completePayout(payoutId: string, notes?: string) {
    const payout = await prisma.salesRepPayout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) throw new Error('Nie znaleziono zlecenia wypłaty.');
    if (payout.status !== 'PENDING') throw new Error('Zlecenie wypłaty nie jest w statusie PENDING.');

    const updated = await prisma.salesRepPayout.update({
      where: { id: payoutId },
      data: {
        status: 'COMPLETED',
        notes: notes || null,
        processedAt: new Date(),
      },
    });

    console.log(`[SalesRepService] Payout marked as COMPLETED: id=${payoutId}`);
    return updated;
  }

  /**
   * Reject payout by admin (marks PENDING as REJECTED)
   */
  async rejectPayout(payoutId: string, notes?: string) {
    const payout = await prisma.salesRepPayout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) throw new Error('Nie znaleziono zlecenia wypłaty.');
    if (payout.status !== 'PENDING') throw new Error('Zlecenie wypłaty nie jest w statusie PENDING.');

    const updated = await prisma.salesRepPayout.update({
      where: { id: payoutId },
      data: {
        status: 'REJECTED',
        notes: notes || null,
        processedAt: new Date(),
      },
    });

    console.log(`[SalesRepService] Payout marked as REJECTED: id=${payoutId}`);
    return updated;
  }
}

export const salesRepService = new SalesRepService();
