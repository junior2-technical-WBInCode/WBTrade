/**
 * Admin Partner Routes
 * 
 * Admin endpoints for managing partner program:
 * - Partner applications (approve/reject/suspend)
 * - Payout management (complete/reject cash payouts)
 * - Statistics and partner details
 */

import { Router, Request, Response } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { referralService } from '../services/referral.service';
import { z } from 'zod';

const router = Router();

// All routes require admin auth
router.use(authGuard, adminOnly);

/** Who is performing the action, for the security audit log. */
function actorOf(req: Request) {
  return {
    userId: req.user?.userId,
    email: req.user?.email,
    userAgent: req.get('user-agent') || undefined,
  };
}

/**
 * GET /api/admin/partners - List all partners
 * Query: ?status=PENDING|APPROVED|REJECTED|SUSPENDED&page=1&limit=20
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const rank = req.query.rank as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await referralService.listPartners(status, page, limit, rank);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/admin/partners/stats/traffic - Affiliate traffic report
 * Query: ?status=PENDING|APPROVED|REJECTED|SUSPENDED
 * Declared before '/:id' so it is not swallowed by the partner detail route.
 */
router.get('/stats/traffic', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const stats = await referralService.getTrafficStats(status);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/admin/partners/structure/tree - Full hierarchy (who is attached to whom)
 * Declared before '/:id' so it is not swallowed by the partner detail route.
 */
router.get('/structure/tree', async (_req: Request, res: Response): Promise<void> => {
  try {
    const structure = await referralService.getStructure();
    res.json(structure);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/admin/partners/:id - Get partner details
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const partner = await referralService.getPartnerDetail(req.params.id);
    if (!partner) {
      res.status(404).json({ message: 'Partner nie znaleziony.' });
      return;
    }
    res.json(partner);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * PATCH /api/admin/partners/:id/status - Update partner status
 * Body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED' }
 */
router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
    });
    const { status } = schema.parse(req.body);
    const partner = await referralService.updatePartnerStatus(req.params.id, status, actorOf(req));
    res.json(partner);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Nieprawidłowy status.', errors: error.errors });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * PATCH /api/admin/partners/:id/rank - Manual rank correction (WBTP)
 * Body: { rank: PartnerRank, note?: string }
 */
router.patch('/:id/rank', async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      rank: z.enum([
        'AKTYWNY_PARTNER',
        'AMBASADOR',
        'LIDER_ZESPOLU',
        'MENEDZER',
        'DYREKTOR_REGIONALNY',
        'DYREKTOR_KRAJOWY',
        'DYREKTOR_GENERALNY',
      ]),
      note: z.string().max(500).optional(),
    });
    const { rank, note } = schema.parse(req.body);
    const partner = await referralService.updatePartnerRank(req.params.id, rank, note, actorOf(req));
    res.json(partner);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Nieprawidłowa ranga.', errors: error.errors });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * PATCH /api/admin/partners/:id/upline - Attach partner to an upline ("lider")
 * Body: { parent: string } - referral code, email or PartnerProfile id.
 * The bond is permanent: a partner who already has an upline is rejected.
 */
router.patch('/:id/upline', async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      parent: z.string().trim().min(1).max(200),
    });
    const { parent } = schema.parse(req.body);
    const partner = await referralService.updatePartnerUpline(req.params.id, parent, actorOf(req));
    res.json(partner);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Podaj kod polecający, email konta lub ID profilu lidera.', errors: error.errors });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * DELETE /api/admin/partners/:id/upline - Emergency detach from upline
 * Body: { reason: string } - mandatory, lands in the security audit log.
 */
router.delete('/:id/upline', async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      reason: z.string().trim().min(10).max(500),
    });
    const { reason } = schema.parse(req.body);
    const partner = await referralService.detachPartnerUpline(req.params.id, reason, actorOf(req));
    res.json(partner);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Podaj powód odpięcia (minimum 10 znaków).', errors: error.errors });
      return;
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/admin/partners/payouts/list - List all payout requests
 * Query: ?status=PENDING|COMPLETED|REJECTED&page=1&limit=20
 */
router.get('/payouts/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await referralService.listPayouts(status, page, limit);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * PATCH /api/admin/partners/payouts/:id/complete - Complete a cash payout
 * Body: { notes?: string }
 */
router.patch('/payouts/:id/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { notes } = req.body;
    const payout = await referralService.completePayout(req.params.id, notes);
    res.json(payout);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * PATCH /api/admin/partners/payouts/:id/reject - Reject a cash payout
 * Body: { reason?: string }
 */
router.patch('/payouts/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    const payout = await referralService.rejectPayout(req.params.id, reason);
    res.json(payout);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
