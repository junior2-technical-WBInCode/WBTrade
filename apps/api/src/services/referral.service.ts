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
import { Prisma, ReferralStatus } from '@prisma/client';
import { roundMoney } from '../lib/currency';
import { isFraud, loadPartnerForFraudCheck } from './referral-fraud.service';
import crypto from 'crypto';

// ─── Config ───
const DEFAULT_COMMISSION_RATE = parseFloat(process.env.AFFILIATE_DEFAULT_COMMISSION_RATE || '5.00');
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

    // Resolve parent partner for MLM (Phase 3 — just store the relation)
    let parentPartnerId: string | null = null;
    if (dto.invitedBy) {
      const parentProfile = await prisma.partnerProfile.findUnique({
        where: { referralCode: dto.invitedBy },
      });
      if (parentProfile && parentProfile.status === 'APPROVED') {
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
      // Extract slug from URL (e.g. /products/lego-city-60123 -> lego-city-60123)
      const slugMatch = productUrl.match(/\/products?\/([^/?#]+)/i) 
                      || productUrl.match(/\/([^/?#]+)$/);
      if (slugMatch) {
        const slug = slugMatch[1];
        const product = await prisma.product.findUnique({
          where: { slug },
          select: { id: true },
        });
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

    return link;
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
      const approvedItems = link.referralItems.filter(
        (ri) => ri.referral.status === 'APPROVED'
      );
      const totalCommission = approvedItems.reduce(
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
    const referral = await tx.referral.create({
      data: {
        orderId: order.id,
        partnerId: winningPartner.id,
        status: referralStatus,
        primaryCommission: totalCommission,
        parentCommission: 0,
        parentPartnerId: null, // MLM Phase 3
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
  }

  // ==============================
  // STATUS TRANSITIONS
  // ==============================

  /**
   * Mark referral as PAID when order payment is confirmed.
   * PENDING → PAID (sets paidAt for 14-day hold calculation)
   */
  async markPaid(orderId: string): Promise<void> {
    try {
      await prisma.referral.updateMany({
        where: {
          orderId,
          status: 'PENDING',
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });
    } catch (err) {
      // No referral for this order — that's normal
      console.log(`[Referral] No pending referral found for order ${orderId}`);
    }
  }

  /**
   * Cancel referral when order is cancelled/refunded.
   * Only cancels if not already APPROVED and paid out.
   */
  async cancelForOrder(orderId: string, reason?: string): Promise<void> {
    try {
      await prisma.referral.updateMany({
        where: {
          orderId,
          status: { in: ['PENDING', 'PAID'] },
        },
        data: {
          status: 'CANCELLED',
          fraudNote: reason || 'Order cancelled/refunded',
        },
      });
    } catch {
      // Ignore — no referral or already approved
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
    // Approved commissions
    const approvedResult = await prisma.referral.aggregate({
      where: { partnerId, status: 'APPROVED' },
      _sum: { primaryCommission: true },
    });
    const approved = toNum(approvedResult._sum.primaryCommission);

    // Frozen commissions (PAID but not yet APPROVED — in 14-day hold)
    const frozenResult = await prisma.referral.aggregate({
      where: { partnerId, status: 'PAID' },
      _sum: { primaryCommission: true },
    });
    const frozen = toNum(frozenResult._sum.primaryCommission);

    // Total earned (all non-cancelled)
    const totalResult = await prisma.referral.aggregate({
      where: { partnerId, status: { in: ['PAID', 'APPROVED'] } },
      _sum: { primaryCommission: true },
    });
    const totalEarned = toNum(totalResult._sum.primaryCommission);

    // Reserved by payouts (PENDING + COMPLETED)
    const reservedResult = await prisma.referralPayout.aggregate({
      where: { partnerId, status: { in: ['PENDING', 'COMPLETED'] } },
      _sum: { amount: true },
    });
    const reserved = toNum(reservedResult._sum.amount);

    const available = roundMoney(approved - reserved);

    return {
      available: Math.max(0, available),
      frozen: roundMoney(frozen),
      totalEarned: roundMoney(totalEarned),
      reserved: roundMoney(reserved),
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
        const approved = toNum(approvedResult._sum.primaryCommission);

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

    return prisma.$transaction(
      async (tx) => {
        // Re-compute balance inside transaction
        const approvedResult = await tx.referral.aggregate({
          where: { partnerId, status: 'APPROVED' },
          _sum: { primaryCommission: true },
        });
        const approved = toNum(approvedResult._sum.primaryCommission);

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

    console.log(`[Referral Cron] Processed holds: ${approved} approved, ${cancelled} cancelled`);
    return { approved, cancelled };
  }

  // ==============================
  // ADMIN
  // ==============================

  /**
   * List all partners with optional status filter.
   */
  async listPartners(status?: string, page = 1, limit = 20) {
    const where: Prisma.PartnerProfileWhereInput = {};
    if (status) {
      where.status = status as any;
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
    return { ...partner, balance };
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
   */
  async completePayout(payoutId: string, notes?: string) {
    return prisma.referralPayout.update({
      where: { id: payoutId },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        notes: notes || null,
      },
    });
  }

  /**
   * Reject a cash payout (admin rejects — frees reserved balance).
   */
  async rejectPayout(payoutId: string, reason?: string) {
    return prisma.referralPayout.update({
      where: { id: payoutId },
      data: {
        status: 'REJECTED',
        notes: reason || null,
      },
    });
  }
}

export const referralService = new ReferralService();
