import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { roundMoney } from '../lib/currency';
import { wholesalerConfigService } from './wholesaler-config.service';
import { cartService } from './cart.service';

// Default config values
const DEFAULT_HOLD_DAYS = 14;

export interface SalesRepModulesConfig {
  // Moduł "Szablony ofert" — zapisywanie i wczytywanie gotowych zestawów produktów.
  offerTemplates: boolean;
  // Moduł "Śledzenie ofert" — lista wysłanych ofert ze statusem płatności + przypomnienia.
  offerTracking: boolean;
  // Moduł "Cele i ranking" — miesięczny cel prowizji + prosty ranking handlowców.
  leaderboard: boolean;
}

export interface SalesRepConfig {
  baseCommissionPct: number;
  maxDiscountPct: number;
  minCompanyMarginPct: number;
  markupMultiplier: number;
  holdDays: number;
  // When true, orders placed through the sales-rep panel never generate affiliate
  // commission — even if the buyer still carries a referral cookie.
  blockAffiliation: boolean;
  // Moduły dodatkowe panelu handlowca — każdy z nich może być w każdej chwili
  // wyłączony przez administratora bez wpływu na resztę panelu.
  modules: SalesRepModulesConfig;
  // Miesięczny cel prowizji (PLN) używany przez moduł "Cele i ranking".
  monthlyGoalAmount: number;
}

let configCache: { config: SalesRepConfig; expiresAt: number } | null = null;
const CACHE_TTL = 60_000; // 60s cache TTL

/**
 * Thrown when a rep tries to use a panel module the admin has disabled.
 * The controller maps this to HTTP 403 with a friendly message.
 */
export class ModuleDisabledError extends Error {
  constructor(public readonly module: keyof SalesRepModulesConfig) {
    super(`Ta funkcja panelu handlowca jest obecnie wyłączona przez administratora.`);
    this.name = 'ModuleDisabledError';
  }
}

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
      modules: {
        offerTemplates: true,
        offerTracking: true,
        leaderboard: true,
      },
      monthlyGoalAmount: 5000,
    };

    try {
      const dbSettings = await prisma.settings.findUnique({
        where: { key: 'sales_rep_config' },
      });

      if (dbSettings && dbSettings.value) {
        const val = typeof dbSettings.value === 'string'
          ? JSON.parse(dbSettings.value)
          : (dbSettings.value as any);

        const valModules = val.modules && typeof val.modules === 'object' ? val.modules : {};
        const merged: SalesRepConfig = {
          baseCommissionPct: Number(val.baseCommissionPct ?? defaultCfg.baseCommissionPct),
          maxDiscountPct: Number(val.maxDiscountPct ?? defaultCfg.maxDiscountPct),
          minCompanyMarginPct: Number(val.minCompanyMarginPct ?? defaultCfg.minCompanyMarginPct),
          markupMultiplier: Number(val.markupMultiplier ?? defaultCfg.markupMultiplier),
          holdDays: Number(val.holdDays ?? defaultCfg.holdDays),
          blockAffiliation: val.blockAffiliation !== undefined ? Boolean(val.blockAffiliation) : defaultCfg.blockAffiliation,
          modules: {
            offerTemplates: valModules.offerTemplates !== undefined ? Boolean(valModules.offerTemplates) : defaultCfg.modules.offerTemplates,
            offerTracking: valModules.offerTracking !== undefined ? Boolean(valModules.offerTracking) : defaultCfg.modules.offerTracking,
            leaderboard: valModules.leaderboard !== undefined ? Boolean(valModules.leaderboard) : defaultCfg.modules.leaderboard,
          },
          monthlyGoalAmount: Number(val.monthlyGoalAmount ?? defaultCfg.monthlyGoalAmount),
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
   * Throws if the given optional module has been disabled by the admin.
   * Every module route must call this first so it can be switched off at any time
   * without touching the rest of the panel.
   */
  assertModuleEnabled(cfg: SalesRepConfig, module: keyof SalesRepModulesConfig): void {
    if (!cfg.modules[module]) {
      throw new ModuleDisabledError(module);
    }
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

  // ---------------------------------------------------------------------
  // Moduł: Szablony ofert
  // ---------------------------------------------------------------------

  async listOfferTemplates(salesRepId: string) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'offerTemplates');

    return prisma.salesRepOfferTemplate.findMany({
      where: { salesRepId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createOfferTemplate(
    salesRepId: string,
    name: string,
    discountPct: number,
    items: Array<{ variantId: string; quantity: number; productName: string; variantName?: string | null }>
  ) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'offerTemplates');

    if (!name.trim()) throw new Error('Nazwa szablonu jest wymagana.');
    if (!items.length) throw new Error('Koszyk jest pusty — nie ma czego zapisać jako szablon.');
    if (discountPct < 0 || discountPct > cfg.maxDiscountPct) {
      throw new Error(`Rabat szablonu musi mieścić się w przedziale 0-${cfg.maxDiscountPct}%.`);
    }

    const existingCount = await prisma.salesRepOfferTemplate.count({ where: { salesRepId } });
    if (existingCount >= 30) {
      throw new Error('Osiągnięto limit 30 zapisanych szablonów. Usuń stary szablon, aby dodać nowy.');
    }

    return prisma.salesRepOfferTemplate.create({
      data: {
        salesRepId,
        name: name.trim().slice(0, 100),
        discountPct: new Prisma.Decimal(discountPct),
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async deleteOfferTemplate(salesRepId: string, templateId: string) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'offerTemplates');

    const template = await prisma.salesRepOfferTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.salesRepId !== salesRepId) {
      throw new Error('Nie znaleziono szablonu.');
    }
    await prisma.salesRepOfferTemplate.delete({ where: { id: templateId } });
  }

  /**
   * Loads a saved template's products into the rep's current cart (clears cart first).
   * Skips items that are no longer available/in stock instead of failing the whole load.
   */
  async loadOfferTemplateIntoCart(salesRepId: string, templateId: string): Promise<{ addedCount: number; skipped: Array<{ name: string; reason: string }> }> {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'offerTemplates');

    const template = await prisma.salesRepOfferTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.salesRepId !== salesRepId) {
      throw new Error('Nie znaleziono szablonu.');
    }

    const cart = await cartService.getOrCreateCart(salesRepId);
    await cartService.clearCart(cart.id);

    const items = template.items as unknown as Array<{ variantId: string; quantity: number; productName: string }>;
    const skipped: Array<{ name: string; reason: string }> = [];
    let addedCount = 0;

    for (const item of items) {
      try {
        await cartService.addItem(cart.id, item.variantId, item.quantity);
        addedCount++;
      } catch (err: any) {
        skipped.push({ name: item.productName || item.variantId, reason: err.message || 'Nieznany błąd' });
      }
    }

    return { addedCount, skipped };
  }

  // ---------------------------------------------------------------------
  // Moduł: Śledzenie ofert
  // ---------------------------------------------------------------------

  async listOffers(salesRepId: string, page: number, limit: number) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'offerTracking');

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { salesRepId },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          discount: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          createdAt: true,
          guestFirstName: true,
          guestLastName: true,
          guestEmail: true,
          billingCompanyName: true,
          payment_reminder_count: true,
          last_payment_reminder_at: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { salesRepId } }),
    ]);

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Sends a manual reminder email for an unpaid offer. Throttled to at most once every
   * 24h per order so reps can't spam clients.
   */
  async canRemindOffer(salesRepId: string, orderId: string) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'offerTracking');

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.salesRepId !== salesRepId) {
      throw new Error('Nie znaleziono oferty.');
    }
    if (order.paymentStatus === 'PAID') {
      throw new Error('Ta oferta została już opłacona — przypomnienie jest zbędne.');
    }
    if (order.last_payment_reminder_at) {
      const hoursSince = (Date.now() - order.last_payment_reminder_at.getTime()) / 3_600_000;
      if (hoursSince < 24) {
        throw new Error(`Przypomnienie zostało już wysłane niedawno. Spróbuj ponownie za ${Math.ceil(24 - hoursSince)}h.`);
      }
    }
    return order;
  }

  async markOfferReminded(orderId: string): Promise<void> {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payment_reminder_count: { increment: 1 },
        last_payment_reminder_at: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Moduł: Cele i ranking
  // ---------------------------------------------------------------------

  async getGoalProgress(salesRepId: string) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'leaderboard');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await prisma.salesRepCommission.aggregate({
      where: {
        salesRepId,
        status: { in: ['PENDING', 'PAID', 'APPROVED'] },
        createdAt: { gte: monthStart },
      },
      _sum: { commissionAmount: true },
    });

    const currentMonthCommission = roundMoney(toNum(result._sum.commissionAmount));
    const goal = cfg.monthlyGoalAmount;
    const progressPct = goal > 0 ? Math.min(100, (currentMonthCommission / goal) * 100) : 0;

    return { goal, currentMonthCommission, progressPct };
  }

  /**
   * Simple monthly leaderboard by total commission. Only names + rank + own amount are
   * exposed — no order-level detail from other reps is ever returned.
   */
  async getLeaderboard(salesRepId: string) {
    const cfg = await this.getSalesRepConfig();
    this.assertModuleEnabled(cfg, 'leaderboard');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const grouped = await prisma.salesRepCommission.groupBy({
      by: ['salesRepId'],
      where: {
        status: { in: ['PENDING', 'PAID', 'APPROVED'] },
        createdAt: { gte: monthStart },
      },
      _sum: { commissionAmount: true },
    });

    const repIds = grouped.map((g) => g.salesRepId);
    const reps = repIds.length
      ? await prisma.user.findMany({
          where: { id: { in: repIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const repById = new Map(reps.map((r) => [r.id, r]));

    const ranked = grouped
      .map((g) => ({
        salesRepId: g.salesRepId,
        name: (() => {
          const rep = repById.get(g.salesRepId);
          if (!rep) return 'Handlowiec';
          const lastInitial = rep.lastName ? `${rep.lastName.charAt(0)}.` : '';
          return `${rep.firstName} ${lastInitial}`.trim();
        })(),
        total: roundMoney(toNum(g._sum.commissionAmount)),
      }))
      .sort((a, b) => b.total - a.total)
      .map((entry, index) => ({ ...entry, rank: index + 1, isCurrentUser: entry.salesRepId === salesRepId }));

    return ranked.slice(0, 10).map(({ salesRepId: _id, ...rest }) => rest);
  }
}

export const salesRepService = new SalesRepService();
