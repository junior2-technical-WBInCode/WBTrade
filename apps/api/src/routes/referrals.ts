/**
 * Referral Routes
 * 
 * Handles both public endpoints (click tracking) and
 * authenticated partner endpoints (profile, links, payouts).
 */

import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { partnerGuard } from '../middleware/partner.middleware';
import { referralService } from '../services/referral.service';
import { z } from 'zod';

const router = Router();

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * POST /api/referrals/click - Register a click on a referral link
 * Body: { code: string }
 */
router.post('/click', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ message: 'Brak kodu reflink.' });
      return;
    }
    const success = await referralService.registerClick(code);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ============================================
// AUTHENTICATED ENDPOINTS (any logged-in user)
// ============================================

/**
 * POST /api/referrals/register - Register as a partner
 * Body: { bankAccountNumber?, companyName?, nip?, invitedBy? }
 */
router.post('/register', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      bankAccountNumber: z.string().optional(),
      companyName: z.string().optional(),
      nip: z.string().optional(),
      invitedBy: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const profile = await referralService.register(req.user!.userId, data);
    res.status(201).json(profile);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Nieprawidłowe dane.', errors: error.errors });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/referrals/profile - Get partner profile with balance & stats
 */
router.get('/profile', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = await referralService.getProfile(req.user!.userId);
    if (!profile) {
      res.status(404).json({ message: 'Brak profilu partnerskiego.' });
      return;
    }
    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ============================================
// PARTNER ENDPOINTS (requires APPROVED partner status)
// ============================================

/**
 * POST /api/referrals/links - Create a new referral link
 * Body: { productUrl?: string, name?: string }
 */
router.post('/links', authGuard, partnerGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { productUrl, name } = req.body;
    const partner = (req as any).partnerProfile;
    const link = await referralService.createLink(partner.id, productUrl, name);
    res.status(201).json(link);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/referrals/links - List partner's referral links with stats
 */
router.get('/links', authGuard, partnerGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const partner = (req as any).partnerProfile;
    const links = await referralService.listLinks(partner.id);
    res.json(links);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/referrals/balance - Get partner balance (ledger)
 */
router.get('/balance', authGuard, partnerGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const partner = (req as any).partnerProfile;
    const balance = await referralService.computeBalance(partner.id);
    res.json(balance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/referrals/payouts/coupon - Redeem balance as discount coupon
 * Body: { amount: number }
 */
router.post('/payouts/coupon', authGuard, partnerGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({ amount: z.number().positive() });
    const { amount } = schema.parse(req.body);
    const partner = (req as any).partnerProfile;
    const result = await referralService.redeemCoupon(partner.id, amount);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Kwota musi być dodatnia.' });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/referrals/payouts/cash - Request cash payout
 * Body: { amount: number, invoiceUrl?: string }
 */
router.post('/payouts/cash', authGuard, partnerGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      invoiceUrl: z.string().url().optional(),
    });
    const { amount, invoiceUrl } = schema.parse(req.body);
    const partner = (req as any).partnerProfile;
    const result = await referralService.requestCashPayout(partner.id, amount, invoiceUrl);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Nieprawidłowe dane.', errors: error.errors });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

export default router;
