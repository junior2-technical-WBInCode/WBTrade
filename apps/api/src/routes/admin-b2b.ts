import { Router, Request, Response } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { b2bService } from '../services/b2b.service';
import { B2bStatus } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// All routes require admin auth
router.use(authGuard, adminOnly);

/**
 * GET /api/admin/b2b/applications - List B2B applications
 * Query: ?status=PENDING|APPROVED|REJECTED|REVOKED
 */
router.get('/applications', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as B2bStatus | undefined;
    const applications = await b2bService.getApplications(status);
    res.json(applications);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/admin/b2b/partners - List active B2B partners
 */
router.get('/partners', async (req: Request, res: Response): Promise<void> => {
  try {
    const partners = await b2bService.getPartners();
    res.json(partners);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/admin/b2b/applications/:userId/approve - Approve B2B application
 */
router.post('/applications/:userId/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await b2bService.approveApplication(req.params.userId, req.user!.userId);
    res.json({ message: 'Wniosek zatwierdzony', ...result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/admin/b2b/applications/:userId/reject - Reject B2B application
 */
const rejectSchema = z.object({ reason: z.string().optional() });

router.post('/applications/:userId/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = rejectSchema.parse(req.body);
    const result = await b2bService.rejectApplication(req.params.userId, req.user!.userId, reason);
    res.json({ message: 'Wniosek odrzucony', ...result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/admin/b2b/applications/:userId/revoke - Revoke B2B access
 */
router.post('/applications/:userId/revoke', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = rejectSchema.parse(req.body);
    const result = await b2bService.revokeAccess(req.params.userId, req.user!.userId, reason);
    res.json({ message: 'Współpraca B2B cofnięta', ...result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * PUT /api/admin/b2b/partners/:userId/multiplier - Update B2B price multiplier
 */
const multiplierSchema = z.object({ multiplier: z.number().min(1.0).max(5.0) });

router.put('/partners/:userId/multiplier', async (req: Request, res: Response): Promise<void> => {
  try {
    const { multiplier } = multiplierSchema.parse(req.body);
    const result = await b2bService.updateMultiplier(req.params.userId, multiplier, req.user!.userId);
    res.json({ message: 'Mnożnik zaktualizowany', ...result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/admin/b2b/partners/:userId/suspend - Suspend B2B partner
 */
router.post('/partners/:userId/suspend', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body || {};
    const result = await b2bService.suspendPartner(req.params.userId, req.user!.userId, reason);
    res.json({ message: 'Partner B2B zawieszony', ...result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/admin/b2b/partners/:userId/unsuspend - Unsuspend B2B partner
 */
router.post('/partners/:userId/unsuspend', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await b2bService.unsuspendPartner(req.params.userId, req.user!.userId);
    res.json({ message: 'Partner B2B odwieszony', ...result });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
