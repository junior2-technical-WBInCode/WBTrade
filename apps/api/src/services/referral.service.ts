/**
 * Referral / Affiliate Service
 * 
 * Core service for the partner affiliate program.
 * Handles partner registration, link management, order attribution,
 * commission calculation, balance (ledger), and payouts.
 * 
 * Key decisions (from spec):
 * - D1: Last-click attribution, 1 order = 1 partner
 * - D2: Commission from BRUTTO (gross), after discount, without shipping
 * - D3: Balance = ledger (available = Σ APPROVED commissions − Σ PENDING/COMPLETED payouts)
 * - D4: Authorization via PartnerProfile.status=APPROVED, not B2B_PARTNER role
 */

import { prisma } from '../db';
import { Prisma, ReferralStatus, PartnerRank, PartnerStatus } from '@prisma/client';
import { roundMoney } from '../lib/currency';
import { isFraud, loadPartnerForFraudCheck } from './referral-fraud.service';
import { getMlmConfig } from './mlm-config.service';
import { getRankConfig } from './partner-rank.service';
import { leaderBonusService } from './leader-bonus.service';
import { partnerVolumeService, currentPeriod, previousPeriod } from './partner-volume.service';
import crypto from 'crypto';

// ─── Config ───
// 7% — stawka z planu "WB TRADE PARTNERS" (sprzedaż z własnego linku)
const DEFAULT_COMMISSION_RATE = parseFloat(process.env.AFFILIATE_DEFAULT_COMMISSION_RATE || '7.00');
const HOLD_DAYS = parseInt(process.env.AFFILIATE_HOLD_DAYS || '14', 10);
const MIN_CASH_PAYOUT = parseFloat(process.env.AFFILIATE_MIN_CASH_PAYOUT || '100');
const COUPON_PREFIX = process.env.AFFILIATE_COUPON_PREFIX || 'PARTNER';

// ─── Helpers ───

/** Generate a unique 8-character referral code */
function generateCode(length = 8): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length).toUpperCase();
}

/** Generate a unique coupon code for partner payouts */
function generateCouponCode(): string {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${COUPON_PREFIX}-${random}`;
}

/** Safely convert Prisma Decimal to number */
function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

/** Sales accumulator used by the admin traffic report; orderIds dedupes multi-item orders */
interface SalesAgg {
  orderIds: Set<string>;
  itemsSold: number;
  revenue: number;
  commission: number;
}

function emptySalesAgg(): SalesAgg {
  return { orderIds: new Set<string>(), itemsSold: 0, revenue: 0, commission: 0 };
}

function addSale(
  target: Map<string, SalesAgg>,
  key: string,
  referralId: string,
  quantity: number,
  revenue: number,
  commission: number
): void {
  const agg = target.get(key) ?? emptySalesAgg();
  agg.orderIds.add(referralId);
  agg.itemsSold += quantity;
  agg.revenue += revenue;
  agg.commission += commission;
  target.set(key, agg);
}

function finalizeSales(agg: SalesAgg | undefined, clicks: number) {
  const orders = agg?.orderIds.size ?? 0;
  return {
    orders,
    itemsSold: agg?.itemsSold ?? 0,
    revenue: roundMoney(agg?.revenue ?? 0),
    commission: roundMoney(agg?.commission ?? 0),
    conversionRate: clicks > 0 ? Math.round((orders / clicks) * 10000) / 100 : null,
  };
}

// ─── Types ───

interface RegisterDto {
  bankAccountNumber?: string;
  companyName?: string;
  nip?: string;
  invitedBy?: string; // MLM Phase 3
}

interface ReferralInput {
  lastClick: string;
  touched: string[];
}

interface BuyerInfo {
  userId?: string | null;
  email: string;
  nip?: string | null;
  ip?: string | null;
}

// ─── Service ───

export class ReferralService {
  // ==============================
  // REGISTRATION & PROFILE
  // ==============================

  /**
   * Register a new partner (creates PartnerProfile with PENDING status).
   * The partner must be approved by admin before they can earn commissions.
   */
  async register(userId: string, dto: RegisterDto) {
    // Check if user already has a partner profile
    const existing = await prisma.partnerProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new Error('Masz już profil partnerski.');
    }

    // Generate unique referral code
    let referralCode: string;
    let attempts = 0;
    do {
      referralCode = generateCode();
      const codeExists = await prisma.referralLink.findUnique({ where: { code: referralCode } });
      const profileExists = await prisma.partnerProfile.findUnique({ where: { referralCode } });
      if (!codeExists && !profileExists) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new Error('Nie udało się wygenerować unikalnego kodu partnerskiego.');
    }

    // Resolve parent partner for MLM. Store the relation whenever the invite code resolves
    // to an existing partner — regardless of that partner's current status. The override
    // walk-up (attributeOrder) checks `ancestor.status === 'APPROVED'` at SALE time, so a
    // not-yet-approved inviter simply earns nothing until approved. Gating the relation on
    // APPROVED here would permanently lose the upline link if the inviter is approved later.
    let parentPartnerId: string | null = null;
    if (dto.invitedBy) {
      const parentProfile = await prisma.partnerProfile.findUnique({
        where: { referralCode: dto.invitedBy },
      });
      if (parentProfile && parentProfile.userId !== userId) {
        parentPartnerId = parentProfile.id;
      }
    }

    const profile = await prisma.partnerProfile.create({
      data: {
        userId,
        referralCode,
        status: 'PENDING',
        commissionRate: DEFAULT_COMMISSION_RATE,
        bankAccountNumber: dto.bankAccountNumber || null,
        companyName: dto.companyName || null,
        nip: dto.nip || null,
        parentPartnerId,
      },
    });

    return profile;
  }

  /**
   * Get partner profile with computed balance and statistics.
   */
  async getProfile(userId: string) {
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!profile) return null;

    const balance = await this.computeBalance(profile.id);
    const stats = await this.getStats(profile.id);

    return {
      ...profile,
      balance,
      stats,
    };
  }

  // ==============================
  // LINK MANAGEMENT
  // ==============================

  /**
   * Create a new referral link.
   * If productUrl contains a product slug, we resolve it to a productId.
   */
  async createLink(partnerId: string, productUrl?: string, name?: string) {
    let productId: string | null = null;

    if (productUrl) {
      // Extract slug or id from URL (e.g. /products/lego-city-60123 or /products/clwq8uwtj00021481d6p9g1j2)
      const slugMatch = productUrl.match(/\/products?\/([^/?#]+)/i) 
                      || productUrl.match(/\/([^/?#]+)$/);
      if (slugMatch) {
        const identifier = slugMatch[1];
        // 1. Try to find by ID
        let product = await prisma.product.findUnique({
          where: { id: identifier },
          select: { id: true },
        });
        // 2. If not found by ID, try to find by slug
        if (!product) {
          product = await prisma.product.findUnique({
            where: { slug: identifier },
            select: { id: true },
          });
        }
        if (product) {
          productId = product.id;
        }
      }
    }

    // Generate unique link code
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      const exists = await prisma.referralLink.findUnique({ where: { code } });
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new Error('Nie udało się wygenerować unikalnego kodu linku.');
    }

    const link = await prisma.referralLink.create({
      data: {
        partnerId,
        code,
        productId,
        name: name || null,
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });

    return {
      ...link,
      salesCount: 0,
      totalCommission: 0,
    };
  }

  /**
   * List all links for a partner with click and commission stats.
   */
  async listLinks(partnerId: string) {
    const links = await prisma.referralLink.findMany({
      where: { partnerId },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        referralItems: {
          select: {
            primaryCommissionAmount: true,
            referral: {
              select: { status: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => {
      // Count both released (APPROVED) and held (PAID, in 14-day hold) commissions so
      // the per-link total matches the "Zarobiono łącznie" card. Only CANCELLED/PENDING
      // (unpaid) are excluded.
      const earnedItems = link.referralItems.filter(
        (ri) => ri.referral.status === 'APPROVED' || ri.referral.status === 'PAID'
      );
      const totalCommission = earnedItems.reduce(
        (sum, ri) => sum + toNum(ri.primaryCommissionAmount),
        0
      );
      const salesCount = link.referralItems.length;

      return {
        id: link.id,
        code: link.code,
        name: link.name,
        productId: link.productId,
        product: link.product,
        clicks: link.clicks,
        salesCount,
        totalCommission: roundMoney(totalCommission),
        createdAt: link.createdAt,
      };
    });
  }

  /**
   * Increment click counter for a referral link.
   */
  async registerClick(code: string): Promise<boolean> {
    try {
      await prisma.referralLink.update({
        where: { code },
        data: { clicks: { increment: 1 } },
      });
      return true;
    } catch {
      // Link not found — silently ignore (common with invalid/expired codes)
      return false;
    }
  }

  // ==============================
  // ORDER ATTRIBUTION & COMMISSION
  // ==============================

  /**
   * Attribute an order to a partner and calculate commission.
   * Called inside the order creation transaction.
   * 
   * Algorithm (from spec §2):
   * 1. Resolve globalLink from lastClick code
   * 2. Anti-fraud check
   * 3. Build product map from touched[] codes belonging to winning partner
   * 4. Calculate commission per item (proportional discount distribution)
   * 5. Create Referral + ReferralItem records
   */
  async attributeOrder(
    tx: Prisma.TransactionClient,
    order: { id: string; subtotal: Prisma.Decimal | number; discount: Prisma.Decimal | number; items: { id: string; variantId: string; unitPrice: Prisma.Decimal | number; quantity: number }[] },
    referralInput: ReferralInput | undefined | null,
    buyer: BuyerInfo
  ): Promise<void> {
    if (!referralInput?.lastClick) return;

    // Step 1: Find the global link
    const globalLink = await tx.referralLink.findUnique({
      where: { code: referralInput.lastClick },
      include: {
        partner: {
          include: {
            user: { select: { email: true, lastLoginIp: true } },
          },
        },
      },
    });

    if (!globalLink || globalLink.partner.status !== 'APPROVED') return;

    const winningPartner = globalLink.partner;

    // Step 2: Anti-fraud check
    const fraudResult = isFraud(
      {
        userId: winningPartner.userId,
        user: {
          email: winningPartner.user.email,
          lastLoginIp: winningPartner.user.lastLoginIp,
        },
        nip: winningPartner.nip,
      },
      buyer
    );

    const referralStatus: ReferralStatus = fraudResult.isFraud ? 'CANCELLED' : 'PENDING';

    // Step 3: Build product map from touched codes (only winning partner's links)
    const touchedCodes = referralInput.touched || [];
    let partnerLinks: { code: string; productId: string | null; id: string }[] = [];
    if (touchedCodes.length > 0) {
      partnerLinks = await tx.referralLink.findMany({
        where: {
          code: { in: touchedCodes },
          partnerId: winningPartner.id,
          productId: { not: null },
        },
        select: { id: true, code: true, productId: true },
      });
    }

    // Build productId → linkId map (earlier in touched[] = newer click wins)
    const productMap = new Map<string, string>();
    for (const code of touchedCodes) {
      const link = partnerLinks.find((l) => l.code === code);
      if (link && link.productId && !productMap.has(link.productId)) {
        productMap.set(link.productId, link.id);
      }
    }

    // Step 4: Resolve productId for each order item via variant → product
    const variantIds = order.items.map((item) => item.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true },
    });
    const variantProductMap = new Map(variants.map((v) => [v.id, v.productId]));

    // Calculate commission per item
    const subtotal = toNum(order.subtotal);
    const discount = toNum(order.discount);
    const commissionRate = toNum(winningPartner.commissionRate);
    const commissionBase = subtotal - discount; // Gross after discount, no shipping (D2)

    if (commissionBase <= 0) return;

    interface CommissionItem {
      orderItemId: string;
      referralLinkId: string;
      primaryCommissionAmount: number;
    }

    const commissionItems: CommissionItem[] = [];
    let totalCommission = 0;

    for (const item of order.items) {
      const productId = variantProductMap.get(item.variantId);
      const linkId = (productId && productMap.get(productId)) || globalLink.id;

      const itemGross = toNum(item.unitPrice) * item.quantity;
      const itemBase = subtotal > 0 ? itemGross * commissionBase / subtotal : 0;
      const commItem = roundMoney(itemBase * commissionRate / 100);

      commissionItems.push({
        orderItemId: item.id,
        referralLinkId: linkId,
        primaryCommissionAmount: commItem,
      });

      totalCommission += commItem;
    }

    totalCommission = roundMoney(totalCommission);

    // Rounding correction: adjust last item so sum matches total
    const rawTotal = roundMoney(commissionBase * commissionRate / 100);
    const diff = roundMoney(rawTotal - totalCommission);
    if (diff !== 0 && commissionItems.length > 0) {
      const lastItem = commissionItems[commissionItems.length - 1];
      lastItem.primaryCommissionAmount = roundMoney(lastItem.primaryCommissionAmount + diff);
      totalCommission = rawTotal;
    }

    // Step 5: Create Referral record
    // 2-tier MLM (parentCommission/parentPartnerId) is deferred — Phase 3 (UOKiK risk).
    const referral = await tx.referral.create({
      data: {
        orderId: order.id,
        partnerId: winningPartner.id,
        status: referralStatus,
        primaryCommission: totalCommission,
        parentCommission: 0,
        parentPartnerId: null,
        fraudNote: fraudResult.isFraud ? fraudResult.reason : null,
      },
    });

    // Create ReferralItem records
    for (const ci of commissionItems) {
      await tx.referralItem.create({
        data: {
          referralId: referral.id,
          orderItemId: ci.orderItemId,
          referralLinkId: ci.referralLinkId,
          primaryCommissionAmount: ci.primaryCommissionAmount,
          parentCommissionAmount: 0,
        },
      });
    }

    console.log(
      `[Referral] Order ${order.id} attributed to partner ${winningPartner.id} ` +
      `(commission: ${totalCommission} PLN, status: ${referralStatus}` +
      `${fraudResult.isFraud ? ', FRAUD: ' + fraudResult.reason : ''})`
    );

    // ── MLM walk-up (PR2) ────────────────────────────────────────────────────
    // Load config — fast path when disabled (zero DB round-trips after cache warm).
    const mlmCfg = await getMlmConfig();
    if (!mlmCfg.enabled) return;                   // LEGAL GATE: disabled by default
    if (referral.status === 'CANCELLED') return;   // fraud/anulacja źródła → brak overrides

    const saleBase = commissionBase;               // needed for sale_base override mode
    let prev = totalCommission;                    // O_0 = C_S (seller's direct commission)

    // Rank-based team commission range (PLAN_03/PR-6):
    // a beneficiary at depth d earns the override only if their rank unlocks
    // that level (AP: 1, Ambasador: 1-2, Lider: 1-3, Menedżer+: 1-4).
    const rankCfg = await getRankConfig();

    // Load seller's parent to start the chain
    let ancestorId = winningPartner.parentPartnerId;
    let level = 1;
    const visited = new Set<string>([winningPartner.id]); // cycle guard

    while (ancestorId && level <= mlmCfg.maxDepth) {
      if (visited.has(ancestorId)) {
        console.warn(`[MLM] Cycle detected in partner hierarchy at ${ancestorId}, stopping.`);
        break;
      }

      const ancestor = await tx.partnerProfile.findUnique({
        where: { id: ancestorId },
        select: { id: true, status: true, parentPartnerId: true, rank: true },
      });

      if (!ancestor) break;

      if (ancestor.status !== 'APPROVED') {
        if (mlmCfg.stopOnInactiveUpline) {
          console.log(`[MLM] Upline ${ancestor.id} is not APPROVED — stopping chain (stopOnInactiveUpline=true).`);
          break;
        } else {
          // Skip this node (compression disabled) and continue up
          visited.add(ancestorId);
          ancestorId = ancestor.parentPartnerId;
          level++;
          continue;
        }
      }

      // Rank gate (PR-6): level too deep for this beneficiary's rank →
      // skip THIS beneficiary but keep walking up (a higher upline may have
      // a higher rank that unlocks deeper levels).
      const maxLevelForRank = rankCfg.teamLevelByRank[ancestor.rank] ?? 1;
      if (level > maxLevelForRank) {
        console.log(`[MLM] L${level} locked for ${ancestor.id} (rank=${ancestor.rank}, max=${maxLevelForRank}) — skipping beneficiary.`);
        visited.add(ancestorId);
        ancestorId = ancestor.parentPartnerId;
        level++;
        continue;
      }

      // Rate for this level (0-indexed: level 1 → index 0)
      const rates = mlmCfg.overrideRatesPct;
      const rate = (rates[level - 1] ?? rates[rates.length - 1] ?? 0) / 100;

      let amount: number;
      if (mlmCfg.overrideBase === 'downline_commission') {
        amount = roundMoney(prev * rate);         // kaskada: O_d = rate_d × O_{d-1}
      } else if (mlmCfg.overrideBase === 'seller_commission') {
        amount = roundMoney(totalCommission * rate); // płaskie od C_S
      } else {
        amount = roundMoney(saleBase * rate);     // sale_base
      }

      if (amount <= 0) {
        console.log(`[MLM] Override amount reached 0 at level ${level} (${ancestor.id}), stopping.`);
        break;
      }

      await tx.referralOverride.create({
        data: {
          referralId: referral.id,
          orderId: order.id,
          beneficiaryId: ancestor.id,
          level,
          amount,
          status: referral.status, // inherit PENDING from source Referral
        },
      });

      console.log(`[MLM] Override L${level}: partner=${ancestor.id}, amount=${amount} PLN`);

      visited.add(ancestorId);
      prev = amount;
      ancestorId = ancestor.parentPartnerId;
      level++;
    }
    // ── end MLM walk-up ──────────────────────────────────────────────────────

    // ── Leader Bonus (PLAN_03/PR-7) ──────────────────────────────────────────
    // Premia Liderów: no depth limit, ranks >= LIDER_ZESPOLU, 60/30/10 split.
    try {
      await leaderBonusService.attributeLeaderBonuses(tx, {
        referralId: referral.id,
        orderId: order.id,
        saleBase,
        sellerId: winningPartner.id,
        sellerParentId: winningPartner.parentPartnerId,
        status: referral.status,
      });
    } catch (err) {
      // Leader bonus must never break order attribution
      console.error(`[LeaderBonus] Attribution failed for order ${order.id}:`, err);
    }
    // ── end Leader Bonus ─────────────────────────────────────────────────────
  }

  // ==============================
  // STATUS TRANSITIONS
  // ==============================

  /**
   * Mark referral as PAID when order payment is confirmed.
   * PENDING → PAID (sets paidAt for 14-day hold calculation)
   *
   * Note: per the WB TRADE PARTNERS plan the 14-day hold counts from DELIVERY.
   * markDelivered() restarts the clock when the order is delivered; this method
   * remains the fallback start (from payment) for orders without delivery tracking.
   */
  async markPaid(orderId: string): Promise<void> {
    try {
      const result = await prisma.referral.updateMany({
        where: {
          orderId,
          status: 'PENDING',
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      if (result.count === 0) {
        console.log(`[Referral] No pending referral found for order ${orderId}`);
      }

      // Mark MLM overrides as paid
      await prisma.referralOverride.updateMany({
        where: {
          orderId,
          status: 'PENDING',
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // Mark leader bonuses as paid
      await prisma.leaderBonus.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'PAID', paidAt: new Date() },
      });
    } catch (err) {
      console.error(`[Referral] Error marking referral as paid for order ${orderId}:`, err);
    }
  }

  /**
   * Restart the hold clock when the order is DELIVERED.
   * Plan WB TRADE PARTNERS: "14 dni od dostawy" — the payout hold counts from delivery,
   * not from payment. Promotes PENDING → PAID (e.g. COD collected on delivery) and
   * resets paidAt on already-PAID records so the cron approves 14 days after delivery.
   */
  async markDelivered(orderId: string): Promise<void> {
    const now = new Date();
    try {
      await prisma.referral.updateMany({
        where: { orderId, status: { in: ['PENDING', 'PAID'] } },
        data: { status: 'PAID', paidAt: now },
      });
      await prisma.referralOverride.updateMany({
        where: { orderId, status: { in: ['PENDING', 'PAID'] } },
        data: { status: 'PAID', paidAt: now },
      });
      await prisma.leaderBonus.updateMany({
        where: { orderId, status: { in: ['PENDING', 'PAID'] } },
        data: { status: 'PAID', paidAt: now },
      });
    } catch (err) {
      console.error(`[Referral] Error restarting hold on delivery for order ${orderId}:`, err);
    }
  }

  /**
   * Cancel referral when order is cancelled/refunded.
   * Supports claw-back of APPROVED commissions, returning partner's balance to negative if paid.
   */
  async cancelForOrder(orderId: string, reason?: string): Promise<void> {
    try {
      const result = await prisma.referral.updateMany({
        where: {
          orderId,
          status: { in: ['PENDING', 'PAID', 'APPROVED'] },
        },
        data: {
          status: 'CANCELLED',
          fraudNote: reason || 'Order cancelled/refunded',
        },
      });
      if (result.count === 0) {
        console.log(`[Referral] No active referral found for order ${orderId} to cancel`);
      }

      // Cancel MLM overrides
      await prisma.referralOverride.updateMany({
        where: {
          orderId,
          status: { in: ['PENDING', 'PAID', 'APPROVED'] },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      // Cancel leader bonuses
      await prisma.leaderBonus.updateMany({
        where: { orderId, status: { in: ['PENDING', 'PAID', 'APPROVED'] } },
        data: { status: 'CANCELLED' },
      });
    } catch (err) {
      console.error(`[Referral] Error cancelling referral for order ${orderId}:`, err);
    }
  }

  // ==============================
  // BALANCE (LEDGER) & PAYOUTS
  // ==============================

  /**
   * Compute partner balance using the ledger approach (D3).
   * available = Σ(APPROVED commissions) − Σ(PENDING/COMPLETED payouts)
   */
  async computeBalance(partnerId: string) {
    // Approved direct commissions
    const approvedResult = await prisma.referral.aggregate({
      where: { partnerId, status: 'APPROVED' },
      _sum: { primaryCommission: true },
    });
    const approvedDirect = toNum(approvedResult._sum.primaryCommission);

    // Approved override commissions
    const approvedOverrideResult = await prisma.referralOverride.aggregate({
      where: { beneficiaryId: partnerId, status: 'APPROVED' },
      _sum: { amount: true },
    });
    const approvedOverride = toNum(approvedOverrideResult._sum.amount);

    // Approved leader bonuses
    const approvedBonusResult = await prisma.leaderBonus.aggregate({
      where: { beneficiaryId: partnerId, status: 'APPROVED' },
      _sum: { amount: true },
    });
    const approvedBonus = toNum(approvedBonusResult._sum.amount);

    const approved = roundMoney(approvedDirect + approvedOverride + approvedBonus);

    // Frozen direct commissions (PAID but not yet APPROVED — in 14-day hold)
    const frozenResult = await prisma.referral.aggregate({
      where: { partnerId, status: 'PAID' },
      _sum: { primaryCommission: true },
    });
    const frozenDirect = toNum(frozenResult._sum.primaryCommission);

    // Frozen override commissions
    const frozenOverrideResult = await prisma.referralOverride.aggregate({
      where: { beneficiaryId: partnerId, status: 'PAID' },
      _sum: { amount: true },
    });
    const frozenOverride = toNum(frozenOverrideResult._sum.amount);

    // Frozen leader bonuses
    const frozenBonusResult = await prisma.leaderBonus.aggregate({
      where: { beneficiaryId: partnerId, status: 'PAID' },
      _sum: { amount: true },
    });
    const frozenBonus = toNum(frozenBonusResult._sum.amount);

    const frozen = roundMoney(frozenDirect + frozenOverride + frozenBonus);

    // Total earned direct (all non-cancelled)
    const totalResult = await prisma.referral.aggregate({
      where: { partnerId, status: { in: ['PAID', 'APPROVED'] } },
      _sum: { primaryCommission: true },
    });
    const totalEarnedDirect = toNum(totalResult._sum.primaryCommission);

    // Total earned override commissions
    const totalOverrideResult = await prisma.referralOverride.aggregate({
      where: { beneficiaryId: partnerId, status: { in: ['PAID', 'APPROVED'] } },
      _sum: { amount: true },
    });
    const totalEarnedOverride = toNum(totalOverrideResult._sum.amount);

    // Total earned leader bonuses
    const totalBonusResult = await prisma.leaderBonus.aggregate({
      where: { beneficiaryId: partnerId, status: { in: ['PAID', 'APPROVED'] } },
      _sum: { amount: true },
    });
    const totalEarnedBonus = toNum(totalBonusResult._sum.amount);

    const totalEarned = roundMoney(totalEarnedDirect + totalEarnedOverride + totalEarnedBonus);

    // Reserved by payouts (PENDING + COMPLETED)
    const reservedResult = await prisma.referralPayout.aggregate({
      where: { partnerId, status: { in: ['PENDING', 'COMPLETED'] } },
      _sum: { amount: true },
    });
    const reserved = toNum(reservedResult._sum.amount);

    const net = roundMoney(approved - reserved);

    return {
      // Withdrawable amount is clamped at 0...
      available: Math.max(0, net),
      // ...but `net` is the signed ledger: negative = partner was paid out for a
      // commission later cancelled (refund/clawback). Surfaced so the debt is visible;
      // future approved commissions net against it before becoming withdrawable again.
      net,
      owed: net < 0 ? roundMoney(-net) : 0,
      frozen,
      totalEarned,
      reserved,
    };
  }

  /**
   * Redeem commission balance as a discount coupon.
   * Creates a single-use FIXED_AMOUNT coupon restricted to partner's email.
   * Uses Serializable isolation to prevent double-spending.
   */
  async redeemCoupon(partnerId: string, amount: number) {
    if (amount <= 0) throw new Error('Kwota musi być większa niż 0.');

    return prisma.$transaction(
      async (tx) => {
        // Re-compute balance inside transaction
        const approvedResult = await tx.referral.aggregate({
          where: { partnerId, status: 'APPROVED' },
          _sum: { primaryCommission: true },
        });
        const approvedDirect = toNum(approvedResult._sum.primaryCommission);

        const approvedOverrideResult = await tx.referralOverride.aggregate({
          where: { beneficiaryId: partnerId, status: 'APPROVED' },
          _sum: { amount: true },
        });
        const approvedOverride = toNum(approvedOverrideResult._sum.amount);

        const approvedBonusResult = await tx.leaderBonus.aggregate({
          where: { beneficiaryId: partnerId, status: 'APPROVED' },
          _sum: { amount: true },
        });
        const approvedBonus = toNum(approvedBonusResult._sum.amount);

        const approved = roundMoney(approvedDirect + approvedOverride + approvedBonus);

        const reservedResult = await tx.referralPayout.aggregate({
          where: { partnerId, status: { in: ['PENDING', 'COMPLETED'] } },
          _sum: { amount: true },
        });
        const reserved = toNum(reservedResult._sum.amount);

        const available = roundMoney(approved - reserved);

        if (amount > available) {
          throw new Error(`Niewystarczające środki. Dostępne: ${available} PLN.`);
        }

        // Get partner email
        const partner = await tx.partnerProfile.findUnique({
          where: { id: partnerId },
          include: { user: { select: { email: true } } },
        });
        if (!partner) throw new Error('Partner nie znaleziony.');

        // Generate unique coupon code
        const couponCode = generateCouponCode();

        // Create coupon (reuse existing Coupon model)
        await tx.coupon.create({
          data: {
            code: couponCode,
            description: `Kupon partnerski - wypłata prowizji`,
            type: 'FIXED_AMOUNT',
            value: amount,
            maximumUses: 1,
            singleUsePerUser: true,
            userId: partner.userId,
            restrictedToEmail: partner.user.email,
            couponSource: 'REFERRAL',
            isActive: true,
          },
        });

        // Record payout
        const payout = await tx.referralPayout.create({
          data: {
            partnerId,
            amount,
            type: 'COUPON',
            status: 'COMPLETED',
            couponCode,
            processedAt: new Date(),
          },
        });

        console.log(`[Referral] Coupon payout: partner=${partnerId}, amount=${amount}, code=${couponCode}`);

        return { couponCode, amount, payout };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  /**
   * Request a cash payout (creates PENDING payout for admin review).
   * Uses Serializable isolation to prevent double-spending.
   */
  async requestCashPayout(partnerId: string, amount: number, invoiceUrl?: string) {
    if (amount < MIN_CASH_PAYOUT) {
      throw new Error(`Minimalna kwota wypłaty gotówkowej: ${MIN_CASH_PAYOUT} PLN.`);
    }
    // If an invoice URL is provided it must come from our own upload endpoint.
    if (invoiceUrl && !invoiceUrl.includes('/uploads/')) {
      throw new Error('Nieprawidłowy link do faktury — wgraj plik przez formularz.');
    }

    return prisma.$transaction(
      async (tx) => {
        // Re-compute balance inside transaction
        const approvedResult = await tx.referral.aggregate({
          where: { partnerId, status: 'APPROVED' },
          _sum: { primaryCommission: true },
        });
        const approvedDirect = toNum(approvedResult._sum.primaryCommission);

        const approvedOverrideResult = await tx.referralOverride.aggregate({
          where: { beneficiaryId: partnerId, status: 'APPROVED' },
          _sum: { amount: true },
        });
        const approvedOverride = toNum(approvedOverrideResult._sum.amount);

        const approvedBonusResult = await tx.leaderBonus.aggregate({
          where: { beneficiaryId: partnerId, status: 'APPROVED' },
          _sum: { amount: true },
        });
        const approvedBonus = toNum(approvedBonusResult._sum.amount);

        const approved = roundMoney(approvedDirect + approvedOverride + approvedBonus);

        const reservedResult = await tx.referralPayout.aggregate({
          where: { partnerId, status: { in: ['PENDING', 'COMPLETED'] } },
          _sum: { amount: true },
        });
        const reserved = toNum(reservedResult._sum.amount);

        const available = roundMoney(approved - reserved);

        if (amount > available) {
          throw new Error(`Niewystarczające środki. Dostępne: ${available} PLN.`);
        }

        const payout = await tx.referralPayout.create({
          data: {
            partnerId,
            amount,
            type: 'CASH',
            status: 'PENDING',
            invoiceUrl: invoiceUrl || null,
          },
        });

        console.log(`[Referral] Cash payout request: partner=${partnerId}, amount=${amount}`);

        return payout;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  // ==============================
  // MLM DOWNLINE & OVERRIDES (PR4)
  // ==============================

  /**
   * List all MLM overrides (commissions from downline partners) for a beneficiary.
   */
  async listOverrides(partnerId: string) {
    return prisma.referralOverride.findMany({
      where: { beneficiaryId: partnerId },
      include: {
        order: {
          select: {
            orderNumber: true,
            total: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List leader bonuses earned by a partner (WBTP — Premia Liderów).
   */
  async listLeaderBonuses(partnerId: string) {
    return prisma.leaderBonus.findMany({
      where: { beneficiaryId: partnerId },
      include: {
        order: {
          select: {
            orderNumber: true,
            total: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Get downline partners recursively up to 5 levels deep.
   */
  async getDownline(partnerId: string) {
    const maxDepth = 5;

    const buildTree = async (currentId: string, currentDepth: number): Promise<any[]> => {
      if (currentDepth > maxDepth) return [];
      const subs = await prisma.partnerProfile.findMany({
        where: { parentPartnerId: currentId },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });

      const tree: any[] = [];
      for (const sub of subs) {
        const children = await buildTree(sub.id, currentDepth + 1);
        tree.push({
          id: sub.id,
          referralCode: sub.referralCode,
          status: sub.status,
          createdAt: sub.createdAt,
          user: sub.user,
          children,
        });
      }
      return tree;
    };

    return buildTree(partnerId, 1);
  }

  /**
   * Per-product sales stats for a partner — "best sellers" through their links.
   * Aggregates ReferralItem (order-item level) by PRODUCT, so a link that pointed to
   * one product but whose order also contained other products is split correctly:
   * each product is its own row, not lumped under the link's total.
   */
  async getProductStats(partnerId: string) {
    const items = await prisma.referralItem.findMany({
      where: { referral: { partnerId, status: { not: 'CANCELLED' } } },
      select: {
        primaryCommissionAmount: true,
        orderItem: {
          select: {
            productName: true,
            quantity: true,
            unitPrice: true,
            variant: { select: { productId: true } },
          },
        },
      },
    });

    const map = new Map<string, {
      productId: string;
      productName: string;
      quantitySold: number;
      salesValue: number;
      commission: number;
      lineCount: number;
    }>();

    for (const it of items) {
      const oi = it.orderItem;
      if (!oi) continue;
      const productId = oi.variant?.productId || oi.productName; // fallback to name if variant missing
      const entry = map.get(productId) || {
        productId,
        productName: oi.productName,
        quantitySold: 0,
        salesValue: 0,
        commission: 0,
        lineCount: 0,
      };
      entry.quantitySold += oi.quantity;
      entry.salesValue += toNum(oi.unitPrice) * oi.quantity;
      entry.commission += toNum(it.primaryCommissionAmount);
      entry.lineCount += 1;
      map.set(productId, entry);
    }

    return Array.from(map.values())
      .map((e) => ({
        ...e,
        salesValue: roundMoney(e.salesValue),
        commission: roundMoney(e.commission),
      }))
      .sort((a, b) => b.quantitySold - a.quantitySold);
  }

  // ==============================
  // STATISTICS
  // ==============================

  /**
   * Get partner statistics (clicks, sales, commission history).
   */
  private async getStats(partnerId: string) {
    const [totalClicks, referrals, recentPayouts] = await Promise.all([
      // Total clicks across all links
      prisma.referralLink.aggregate({
        where: { partnerId },
        _sum: { clicks: true },
      }),

      // Referral history
      prisma.referral.findMany({
        where: { partnerId },
        select: {
          id: true,
          status: true,
          primaryCommission: true,
          createdAt: true,
          paidAt: true,
          approvedAt: true,
          order: {
            select: {
              orderNumber: true,
              total: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // Recent payouts
      prisma.referralPayout.findMany({
        where: { partnerId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      totalClicks: totalClicks._sum.clicks || 0,
      totalReferrals: referrals.length,
      referrals,
      recentPayouts,
    };
  }

  // ==============================
  // CRON: HOLD RELEASE
  // ==============================

  /**
   * Process referral holds — called by cron daily.
   * PAID referrals older than 14 days → APPROVED (if order not cancelled/refunded).
   */
  async processReferralHolds(): Promise<{ approved: number; cancelled: number }> {
    const holdDate = new Date();
    holdDate.setDate(holdDate.getDate() - HOLD_DAYS);

    // Self-heal: any PENDING referral whose order is already PAID but markPaid was missed
    // (callback race / transient error). Promote to PAID now so the hold clock starts and
    // the referral isn't stuck PENDING forever.
    const orphaned = await prisma.referral.findMany({
      where: {
        status: 'PENDING',
        order: { paymentStatus: 'PAID', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      },
      select: { id: true },
    });
    if (orphaned.length > 0) {
      await prisma.referral.updateMany({
        where: { id: { in: orphaned.map((r) => r.id) } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      console.log(`[Referral Cron] Self-healed ${orphaned.length} PENDING referral(s) for already-paid orders`);
    }

    // Self-heal overrides
    const orphanedOverrides = await prisma.referralOverride.findMany({
      where: {
        status: 'PENDING',
        order: { paymentStatus: 'PAID', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      },
      select: { id: true },
    });
    if (orphanedOverrides.length > 0) {
      await prisma.referralOverride.updateMany({
        where: { id: { in: orphanedOverrides.map((r) => r.id) } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      console.log(`[Referral Cron] Self-healed ${orphanedOverrides.length} PENDING referral override(s) for already-paid orders`);
    }

    // Self-heal leader bonuses
    const orphanedBonuses = await prisma.leaderBonus.findMany({
      where: {
        status: 'PENDING',
        order: { paymentStatus: 'PAID', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      },
      select: { id: true },
    });
    if (orphanedBonuses.length > 0) {
      await prisma.leaderBonus.updateMany({
        where: { id: { in: orphanedBonuses.map((r) => r.id) } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      console.log(`[Referral Cron] Self-healed ${orphanedBonuses.length} PENDING leader bonus(es) for already-paid orders`);
    }

    const eligible = await prisma.referral.findMany({
      where: {
        status: 'PAID',
        paidAt: { lte: holdDate },
      },
      include: {
        order: { select: { status: true } },
      },
    });

    let approved = 0;
    let cancelled = 0;

    for (const referral of eligible) {
      const cancelledStatuses = ['CANCELLED', 'REFUNDED'];

      if (cancelledStatuses.includes(referral.order.status)) {
        await prisma.referral.update({
          where: { id: referral.id },
          data: { status: 'CANCELLED' },
        });
        cancelled++;
      } else {
        await prisma.referral.update({
          where: { id: referral.id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        });
        approved++;
      }
    }

    // Process eligible overrides
    const eligibleOverrides = await prisma.referralOverride.findMany({
      where: {
        status: 'PAID',
        paidAt: { lte: holdDate },
      },
      include: {
        order: { select: { status: true } },
      },
    });

    for (const override of eligibleOverrides) {
      const cancelledStatuses = ['CANCELLED', 'REFUNDED'];

      if (cancelledStatuses.includes(override.order.status)) {
        await prisma.referralOverride.update({
          where: { id: override.id },
          data: { status: 'CANCELLED' },
        });
        cancelled++;
      } else {
        await prisma.referralOverride.update({
          where: { id: override.id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        });
        approved++;
      }
    }

    // Process eligible leader bonuses
    const eligibleBonuses = await prisma.leaderBonus.findMany({
      where: {
        status: 'PAID',
        paidAt: { lte: holdDate },
      },
      include: {
        order: { select: { status: true } },
      },
    });

    for (const bonus of eligibleBonuses) {
      const cancelledStatuses = ['CANCELLED', 'REFUNDED'];

      if (cancelledStatuses.includes(bonus.order.status)) {
        await prisma.leaderBonus.update({
          where: { id: bonus.id },
          data: { status: 'CANCELLED' },
        });
        cancelled++;
      } else {
        await prisma.leaderBonus.update({
          where: { id: bonus.id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        });
        approved++;
      }
    }

    console.log(`[Referral Cron] Processed holds: ${approved} approved, ${cancelled} cancelled`);
    return { approved, cancelled };
  }

  // ==============================
  // ADMIN
  // ==============================

  /**
   * List all partners with optional status filter.
   */
  async listPartners(status?: string, page = 1, limit = 20, rank?: string) {
    const where: Prisma.PartnerProfileWhereInput = {};
    if (status) {
      where.status = status as any;
    }
    if (rank) {
      where.rank = rank as any;
    }

    const [partners, total] = await Promise.all([
      prisma.partnerProfile.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          _count: { select: { referrals: true, referralLinks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.partnerProfile.count({ where }),
    ]);

    return {
      partners,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get detailed partner info for admin view.
   */
  async getPartnerDetail(partnerId: string) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        parentPartner: {
          select: {
            id: true,
            referralCode: true,
            status: true,
            user: { select: { email: true, firstName: true, lastName: true } },
          },
        },
        referralLinks: {
          include: { product: { select: { id: true, name: true, slug: true } } },
        },
        referrals: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            order: { select: { orderNumber: true, total: true, status: true } },
          },
        },
        payouts: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!partner) return null;

    const balance = await this.computeBalance(partnerId);

    // WB TRADE PARTNERS (PLAN_03/PR-8): rank history, current + previous WL, leader bonuses
    const period = currentPeriod();
    const prevPeriod = previousPeriod();
    const [rankEvents, lineVolumes, prevLineVolumes, leaderBonuses] = await Promise.all([
      prisma.partnerRankEvent.findMany({
        where: { partnerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      partnerVolumeService.getLineVolumes(partnerId, period),
      partnerVolumeService.getLineVolumes(partnerId, prevPeriod),
      prisma.leaderBonus.findMany({
        where: { beneficiaryId: partnerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { order: { select: { orderNumber: true, total: true } } },
      }),
    ]);
    const monthlyVolume = await partnerVolumeService.getMonthlyVolume(partnerId, period);

    return {
      ...partner,
      balance,
      rankEvents,
      lineVolumes: { period, current: lineVolumes, previousPeriod: prevPeriod, previous: prevLineVolumes },
      leaderBonuses,
      monthlyVolume,
    };
  }

  /**
   * Affiliate traffic report for admin — which partner drives how much traffic,
   * and which products their links point to.
   *
   * Clicks come from the lifetime ReferralLink.clicks counter, so this report has no
   * time dimension; sales are attributed per link via ReferralItem.referralLinkId.
   */
  async getTrafficStats(status?: string) {
    const [partners, links, items] = await Promise.all([
      prisma.partnerProfile.findMany({
        where: status ? { status: status as PartnerStatus } : {},
        select: {
          id: true,
          referralCode: true,
          status: true,
          rank: true,
          createdAt: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      prisma.referralLink.findMany({
        select: {
          id: true,
          partnerId: true,
          code: true,
          name: true,
          clicks: true,
          createdAt: true,
          productId: true,
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.referralItem.findMany({
        where: { referral: { status: { not: 'CANCELLED' } } },
        select: {
          referralLinkId: true,
          primaryCommissionAmount: true,
          referral: { select: { id: true, partnerId: true } },
          orderItem: { select: { quantity: true, unitPrice: true } },
        },
      }),
    ]);

    const byPartner = new Map<string, SalesAgg>();
    const byLink = new Map<string, SalesAgg>();

    for (const item of items) {
      const quantity = item.orderItem?.quantity ?? 0;
      const revenue = toNum(item.orderItem?.unitPrice) * quantity;
      const commission = toNum(item.primaryCommissionAmount);

      addSale(byPartner, item.referral.partnerId, item.referral.id, quantity, revenue, commission);
      if (item.referralLinkId) {
        addSale(byLink, item.referralLinkId, item.referral.id, quantity, revenue, commission);
      }
    }

    const linksByPartner = new Map<string, typeof links>();
    for (const link of links) {
      const list = linksByPartner.get(link.partnerId) ?? [];
      list.push(link);
      linksByPartner.set(link.partnerId, list);
    }

    const partnerRows = partners.map((partner) => {
      const partnerLinks = linksByPartner.get(partner.id) ?? [];
      const clicks = partnerLinks.reduce((sum, link) => sum + link.clicks, 0);
      const sales = byPartner.get(partner.id);

      return {
        id: partner.id,
        name: `${partner.user.firstName} ${partner.user.lastName}`.trim(),
        email: partner.user.email,
        referralCode: partner.referralCode,
        status: partner.status,
        rank: partner.rank,
        createdAt: partner.createdAt,
        linksCount: partnerLinks.length,
        productLinksCount: partnerLinks.filter((link) => link.productId).length,
        clicks,
        ...finalizeSales(sales, clicks),
        links: partnerLinks
          .map((link) => ({
            id: link.id,
            code: link.code,
            name: link.name,
            createdAt: link.createdAt,
            product: link.product,
            clicks: link.clicks,
            ...finalizeSales(byLink.get(link.id), link.clicks),
          }))
          .sort((a, b) => b.clicks - a.clicks),
      };
    });

    const productMap = new Map<string, {
      productId: string | null;
      productName: string;
      productSlug: string | null;
      linksCount: number;
      partnerIds: Set<string>;
      clicks: number;
      agg: SalesAgg;
    }>();

    for (const link of links) {
      const key = link.productId ?? '__general__';
      const entry = productMap.get(key) ?? {
        productId: link.productId,
        productName: link.product?.name ?? 'Linki ogólne (bez produktu)',
        productSlug: link.product?.slug ?? null,
        linksCount: 0,
        partnerIds: new Set<string>(),
        clicks: 0,
        agg: emptySalesAgg(),
      };
      entry.linksCount += 1;
      entry.partnerIds.add(link.partnerId);
      entry.clicks += link.clicks;

      const linkSales = byLink.get(link.id);
      if (linkSales) {
        linkSales.orderIds.forEach((orderId) => entry.agg.orderIds.add(orderId));
        entry.agg.itemsSold += linkSales.itemsSold;
        entry.agg.revenue += linkSales.revenue;
        entry.agg.commission += linkSales.commission;
      }
      productMap.set(key, entry);
    }

    const productRows = Array.from(productMap.values())
      .map((entry) => ({
        productId: entry.productId,
        productName: entry.productName,
        productSlug: entry.productSlug,
        linksCount: entry.linksCount,
        partnersCount: entry.partnerIds.size,
        clicks: entry.clicks,
        ...finalizeSales(entry.agg, entry.clicks),
      }))
      .sort((a, b) => b.clicks - a.clicks);

    const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0);
    const totalAgg = emptySalesAgg();
    for (const agg of byPartner.values()) {
      agg.orderIds.forEach((orderId) => totalAgg.orderIds.add(orderId));
      totalAgg.itemsSold += agg.itemsSold;
      totalAgg.revenue += agg.revenue;
      totalAgg.commission += agg.commission;
    }

    return {
      totals: {
        partners: partners.length,
        linksCount: links.length,
        clicks: totalClicks,
        ...finalizeSales(totalAgg, totalClicks),
      },
      partners: partnerRows.sort((a, b) => b.clicks - a.clicks),
      products: productRows,
    };
  }

  /**
   * Update partner status (admin action).
   */
  async updatePartnerStatus(partnerId: string, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED') {
    return prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { status },
    });
  }

  /**
   * Attach a partner to an upline (admin action), as if the upline had invited them.
   * `parent` accepts a referral code, an account email or a PartnerProfile id;
   * pass null/empty to detach the partner from their current upline.
   */
  async updatePartnerUpline(partnerId: string, parent: string | null) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      select: { id: true, parentPartnerId: true },
    });
    if (!partner) {
      throw new Error('Partner nie znaleziony.');
    }

    const identifier = parent?.trim();
    if (!identifier) {
      return prisma.partnerProfile.update({
        where: { id: partnerId },
        data: { parentPartnerId: null },
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      });
    }

    const parentProfile =
      (await prisma.partnerProfile.findUnique({ where: { referralCode: identifier.toUpperCase() } })) ??
      (await prisma.partnerProfile.findUnique({ where: { id: identifier } })) ??
      (await prisma.partnerProfile.findFirst({
        where: { user: { email: { equals: identifier, mode: 'insensitive' } } },
      }));

    if (!parentProfile) {
      throw new Error(`Nie znaleziono partnera dla "${identifier}" (kod polecający, email lub ID profilu).`);
    }
    if (parentProfile.id === partnerId) {
      throw new Error('Partner nie może być własnym liderem.');
    }

    // Walking up from the new upline must never lead back to the partner being moved.
    let ancestorId: string | null = parentProfile.parentPartnerId;
    const visited = new Set<string>([parentProfile.id]);
    while (ancestorId) {
      if (ancestorId === partnerId) {
        throw new Error('Taka zmiana utworzyłaby pętlę w strukturze (wskazany lider jest w dole struktury tego partnera).');
      }
      if (visited.has(ancestorId)) break;
      visited.add(ancestorId);
      const ancestor: { parentPartnerId: string | null } | null = await prisma.partnerProfile.findUnique({
        where: { id: ancestorId },
        select: { parentPartnerId: true },
      });
      ancestorId = ancestor?.parentPartnerId ?? null;
    }

    return prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { parentPartnerId: parentProfile.id },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        parentPartner: {
          select: {
            id: true,
            referralCode: true,
            status: true,
            user: { select: { email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  /**
   * Manual rank correction (admin action) — PLAN_03/PR-8.
   * Sets rank AND consolidates it (highestRank) — an admin override is authoritative.
   * Emits a MANUAL PartnerRankEvent for the audit trail.
   */
  async updatePartnerRank(partnerId: string, rank: PartnerRank, adminNote?: string) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      select: { rank: true },
    });
    if (!partner) throw new Error('Partner nie znaleziony.');

    const [updated] = await prisma.$transaction([
      prisma.partnerProfile.update({
        where: { id: partnerId },
        data: {
          rank,
          highestRank: rank,
          rankConfirmations: 0,
          rankAchievedAt: new Date(),
        },
      }),
      prisma.partnerRankEvent.create({
        data: {
          partnerId,
          period: currentPeriod(),
          fromRank: partner.rank,
          toRank: rank,
          type: 'MANUAL',
          details: adminNote ? { adminNote } : undefined,
        },
      }),
    ]);
    return updated;
  }

  /**
   * List payout requests (for admin review).
   */
  async listPayouts(status?: string, page = 1, limit = 20) {
    const where: Prisma.ReferralPayoutWhereInput = {};
    if (status) {
      where.status = status as any;
    }

    const [payouts, total] = await Promise.all([
      prisma.referralPayout.findMany({
        where,
        include: {
          partner: {
            include: {
              user: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.referralPayout.count({ where }),
    ]);

    return {
      payouts,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Complete a cash payout (admin marks as paid after bank transfer).
   * Guarded: only a PENDING CASH payout can be completed — prevents re-completing
   * a REJECTED payout (which would re-reserve funds) or touching COUPON payouts.
   */
  async completePayout(payoutId: string, notes?: string) {
    const result = await prisma.referralPayout.updateMany({
      where: { id: payoutId, status: 'PENDING', type: 'CASH' },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        notes: notes || null,
      },
    });
    if (result.count === 0) {
      throw new Error('Wypłatę można zatwierdzić tylko, gdy jest typu CASH i ma status PENDING.');
    }
    return prisma.referralPayout.findUnique({ where: { id: payoutId } });
  }

  /**
   * Reject a cash payout (admin rejects — frees reserved balance).
   * Guarded: only a PENDING CASH payout can be rejected. A COUPON payout is already
   * COMPLETED with a live coupon — rejecting it would free the reserve while the coupon
   * stays usable (double-spend), so it is not reject-able.
   */
  async rejectPayout(payoutId: string, reason?: string) {
    const result = await prisma.referralPayout.updateMany({
      where: { id: payoutId, status: 'PENDING', type: 'CASH' },
      data: {
        status: 'REJECTED',
        notes: reason || null,
      },
    });
    if (result.count === 0) {
      throw new Error('Odrzucić można tylko wypłatę typu CASH o statusie PENDING.');
    }
    return prisma.referralPayout.findUnique({ where: { id: payoutId } });
  }

  /**
   * Adjusts the partner's payout record if a referral coupon was only partially used.
   * Returns the unused portion of the coupon back to the partner's available balance.
   */
  async handleCouponUsage(couponCode: string, discount: number | Prisma.Decimal): Promise<void> {
    try {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode },
      });

      if (!coupon || coupon.couponSource !== 'REFERRAL') return;

      const couponValue = toNum(coupon.value);
      const discountAmount = toNum(discount);

      if (couponValue > discountAmount) {
        const remainder = roundMoney(couponValue - discountAmount);

        // Find the payout associated with this coupon code
        const payout = await prisma.referralPayout.findFirst({
          where: { couponCode, status: 'COMPLETED' },
        });

        if (payout) {
          const originalAmount = toNum(payout.amount);
          const newAmount = roundMoney(originalAmount - remainder);

          await prisma.referralPayout.update({
            where: { id: payout.id },
            data: {
              amount: newAmount,
              notes: payout.notes
                ? `${payout.notes} (Pierwotna wartość kuponu: ${couponValue} PLN, wykorzystano: ${discountAmount} PLN, zwrócono: ${remainder} PLN)`
                : `Wykorzystano: ${discountAmount} PLN z kuponu ${couponValue} PLN. Zwrócono resztę: ${remainder} PLN.`,
            },
          });

          console.log(`[Referral] Adjusted payout ${payout.id} from ${originalAmount} to ${newAmount} PLN. ${remainder} PLN returned to partner.`);
        }
      }
    } catch (err) {
      console.error(`[Referral] Error adjusting payout for coupon ${couponCode}:`, err);
    }
  }
}

export const referralService = new ReferralService();
