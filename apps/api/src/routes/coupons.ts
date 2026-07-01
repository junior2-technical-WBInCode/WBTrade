import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { authGuard } from '../middleware/auth.middleware';
import { discountService } from '../services/discount.service';
import { prisma } from '../db';

const router = Router();

// GET /api/coupons/my — get all user's coupons
router.get('/my', authGuard, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const email = (req as any).user?.email || '';
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Auto-generate welcome coupon if user doesn't have one yet (handles older accounts)
    const hasWelcome = await prisma.coupon.findFirst({
      where: { userId, couponSource: 'WELCOME_DISCOUNT' },
      select: { id: true },
    });
    if (!hasWelcome && email) {
      try {
        await discountService.generateWelcomeDiscount(userId, email);
      } catch (err: any) {
        // Ignore errors (e.g. code collision) — not critical
        console.warn('[CouponsRoute] Could not auto-generate welcome coupon:', err.message);
      }
    }

    // 1. User's personal coupons
    const personalCoupons = await prisma.coupon.findMany({
      where: {
        OR: [
          { userId },
          // Also find newsletter coupons by email (may not have userId set)
          {
            couponSource: 'NEWSLETTER',
            description: { contains: email },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        description: true,
        type: true,
        value: true,
        minimumAmount: true,
        maximumUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        couponSource: true,
        createdAt: true,
        singleUsePerUser: true,
      },
    });

    // 2. Public promotional coupons (no userId, singleUsePerUser=true, active)
    //    Exclude REFERRAL coupons — they are personal partner coupons
    const now = new Date();
    const publicCoupons = await prisma.coupon.findMany({
      where: {
        userId: null,
        singleUsePerUser: true,
        isActive: true,
        couponSource: { not: 'REFERRAL' },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
        AND: [
          {
            OR: [
              { startsAt: null },
              { startsAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        description: true,
        type: true,
        value: true,
        minimumAmount: true,
        maximumUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        couponSource: true,
        createdAt: true,
        singleUsePerUser: true,
      },
    });

    // 3. Check which public coupons user has already used
    const publicCouponIds = publicCoupons.map(c => c.id);
    const usedByUser = await prisma.couponUsage.findMany({
      where: {
        userId,
        couponId: { in: publicCouponIds },
      },
      select: { couponId: true },
    });
    const usedCouponIds = new Set(usedByUser.map(u => u.couponId));

    // 4. Filter out already-used public coupons and merge with personal
    const availablePublicCoupons = publicCoupons.filter(c => !usedCouponIds.has(c.id));
    const personalIds = new Set(personalCoupons.map(c => c.id));
    const uniquePublicCoupons = availablePublicCoupons.filter(c => !personalIds.has(c.id));
    
    const allCoupons = [...personalCoupons, ...uniquePublicCoupons];

    // Enrich with status
    const enriched = allCoupons.map((c: any) => {
      const isExpired = c.expiresAt ? c.expiresAt < new Date() : false;
      const isUsed = c.maximumUses ? c.usedCount >= c.maximumUses : false;
      let status: 'active' | 'used' | 'expired' = 'active';
      if (isUsed) status = 'used';
      else if (isExpired) status = 'expired';
      else if (!c.isActive) status = 'expired';

      return { ...c, status };
    });

    return res.json({ coupons: enriched });
  } catch (error: any) {
    console.error('[CouponsRoute] Error fetching user coupons:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać kuponów' });
  }
});

// POST /api/coupons/claim-app-download — claim app download discount (-5%)
router.post('/claim-app-download', authGuard, async (req, res) => {
  const userId = (req as any).user?.userId;
  const email = (req as any).user?.email || '';
  try {
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await discountService.generateAppDownloadDiscount(userId, email);
    return res.json({ discount: result });
  } catch (error: any) {
    if (error.message === 'APP_DOWNLOAD_EXISTS') {
      // Return existing coupon info with 409
      const existing = await prisma.coupon.findFirst({
        where: { userId, couponSource: 'APP_DOWNLOAD' },
      });
      return res.status(409).json({
        error: 'Rabat za pobranie aplikacji został już przyznany',
        discount: existing ? {
          couponCode: existing.code,
          discountPercent: Number(existing.value),
          expiresAt: existing.expiresAt,
        } : undefined,
      });
    }
    console.error('[CouponsRoute] Error claiming app download discount:', error);
    return res.status(500).json({ error: 'Nie udało się przyznać rabatu' });
  }
});

// POST /api/coupons/claim-newsletter — subscribe to newsletter and claim -10% discount
router.post('/claim-newsletter', authGuard, async (req, res) => {
  const userId = (req as any).user?.userId;
  const email = (req as any).user?.email || '';
  const normalizedEmail = email.toLowerCase().trim();
  try {
    if (!userId || !email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1. Subscribe to newsletter (auto-verify since user is authenticated)
    const existing = await prisma.newsletter_subscriptions.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existing) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.newsletter_subscriptions.create({
        data: {
          id: uuidv4(),
          email: normalizedEmail,
          token,
          is_verified: true,
          verified_at: new Date(),
        },
      });
    } else if (existing.unsubscribed_at) {
      await prisma.newsletter_subscriptions.update({
        where: { email: normalizedEmail },
        data: {
          unsubscribed_at: null,
          is_verified: true,
          verified_at: new Date(),
          subscribed_at: new Date(),
        },
      });
    }

    // 2. Generate newsletter discount
    const result = await discountService.generateNewsletterDiscount(normalizedEmail, userId);
    return res.json({ discount: result });
  } catch (error: any) {
    if (error.message?.includes('already') || error.message?.includes('EXISTS')) {
      // Return existing coupon info with 409
      const existing = await prisma.coupon.findFirst({
        where: {
          OR: [
            { description: { contains: normalizedEmail }, couponSource: 'NEWSLETTER' },
            ...(userId ? [{ userId, couponSource: 'NEWSLETTER' as const }] : []),
          ],
        },
      });
      return res.status(409).json({
        error: 'Rabat za newsletter został już odebrany',
        discount: existing ? {
          couponCode: existing.code,
          discountPercent: Number(existing.value),
          expiresAt: existing.expiresAt,
        } : undefined,
      });
    }
    console.error('[CouponsRoute] Error claiming newsletter discount:', error);
    return res.status(500).json({ error: 'Nie udało się przyznać rabatu newsletterowego' });
  }
});

// POST /api/coupons/claim-surprise — claim surprise bonus for collecting all discounts (-25%)
router.post('/claim-surprise', authGuard, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const email = (req as any).user?.email || '';
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await discountService.generateSurpriseDiscount(userId, email);
    return res.json({ discount: result });
  } catch (error: any) {
    if (error.message === 'SURPRISE_ALREADY_CLAIMED') {
      return res.status(409).json({ error: 'Kupon-niespodzianka został już odebrany' });
    }
    if (error.message === 'NOT_ALL_COLLECTED') {
      return res.status(400).json({ error: 'Musisz najpierw zebrać wszystkie dostępne rabaty' });
    }
    console.error('[CouponsRoute] Error claiming surprise discount:', error);
    return res.status(500).json({ error: 'Nie udało się przyznać kuponu-niespodzianki' });
  }
});

// GET /api/coupons/welcome — get user's welcome discount
router.get('/welcome', authGuard, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const discount = await discountService.getUserWelcomeDiscount(userId);
    return res.json({ discount });
  } catch (error: any) {
    console.error('[CouponsRoute] Error fetching welcome discount:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać rabatu powitalnego' });
  }
});

export default router;
