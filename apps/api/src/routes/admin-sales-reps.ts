import { Router } from 'express';
import { prisma } from '../db';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { salesRepService } from '../services/sales-rep.service';

const router = Router();

router.use(authGuard, adminOnly);

/**
 * GET /api/admin/sales-reps
 * List all users with HANDLOWIEC role and their metrics
 */
router.get('/', async (req, res) => {
  try {
    const reps = await prisma.user.findMany({
      where: { role: 'HANDLOWIEC' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        nip: true,
        createdAt: true,
      },
    });

    const repsWithBalances = await Promise.all(
      reps.map(async (rep) => {
        const balance = await salesRepService.computeBalance(rep.id);
        return {
          ...rep,
          balance,
        };
      })
    );

    res.json({ success: true, salesReps: repsWithBalances });
  } catch (error: any) {
    console.error('[AdminSalesReps] Error listing sales reps:', error);
    res.status(500).json({ message: 'Błąd pobierania listy handlowców.' });
  }
});

/**
 * POST /api/admin/sales-reps/promote
 * Grant the HANDLOWIEC role to a user by email (admin-only).
 * Body: { email: string }
 */
router.post('/promote', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) {
      res.status(400).json({ message: 'Podaj adres e-mail konta.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ message: `Nie znaleziono konta o adresie ${email}.` });
      return;
    }
    if (user.role === 'HANDLOWIEC') {
      res.json({ success: true, alreadyRep: true, message: 'To konto już jest handlowcem.' });
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: 'HANDLOWIEC' } });
    // Role lives in the JWT (~8h) — the user must re-login to gain panel access.
    res.json({ success: true, message: `Nadano rolę HANDLOWIEC dla ${email}. Konto musi się przelogować.` });
  } catch (error: any) {
    console.error('[AdminSalesReps] Error promoting user:', error);
    res.status(500).json({ message: 'Błąd nadawania roli handlowca.' });
  }
});

/**
 * GET /api/admin/sales-reps/payouts
 * List all payout requests (optional filter by status)
 */
router.get('/payouts', async (req, res) => {
  try {
    const { status } = req.query;
    const whereClause: any = {};
    if (status) {
      whereClause.status = status as any;
    }

    const payouts = await prisma.salesRepPayout.findMany({
      where: whereClause,
      include: {
        salesRep: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, payouts });
  } catch (error: any) {
    console.error('[AdminSalesReps] Error listing payouts:', error);
    res.status(500).json({ message: 'Błąd pobierania wniosków o wypłaty.' });
  }
});

/**
 * PATCH /api/admin/sales-reps/payouts/:id/complete
 * Complete payout request
 */
router.patch('/payouts/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const payout = await salesRepService.completePayout(id, notes);
    res.json({ success: true, message: 'Wypłata została zatwierdzona.', payout });
  } catch (error: any) {
    console.error('[AdminSalesReps] Error completing payout:', error);
    res.status(500).json({ message: error.message || 'Błąd zatwierdzania wypłaty.' });
  }
});

/**
 * PATCH /api/admin/sales-reps/payouts/:id/reject
 * Reject payout request
 */
router.patch('/payouts/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const payout = await salesRepService.rejectPayout(id, notes);
    res.json({ success: true, message: 'Wypłata została odrzucona.', payout });
  } catch (error: any) {
    console.error('[AdminSalesReps] Error rejecting payout:', error);
    res.status(500).json({ message: error.message || 'Błąd odrzucania wypłaty.' });
  }
});

export default router;
