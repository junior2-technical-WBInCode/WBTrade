/**
 * Partner Guard Middleware
 * 
 * Verifies that the authenticated user has an APPROVED PartnerProfile.
 * Must be used AFTER authGuard (req.user must be set).
 * 
 * Per spec decision D4: authorization is via PartnerProfile.status,
 * NOT via the B2B_PARTNER role (which is used for wholesale).
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

/**
 * Middleware that checks if the user has an approved partner profile.
 * Sets req.partnerProfile on success.
 */
export async function partnerGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: 'Wymagane uwierzytelnienie.' });
      return;
    }

    const partnerProfile = await prisma.partnerProfile.findUnique({
      where: { userId },
    });

    if (!partnerProfile) {
      res.status(403).json({ message: 'Nie masz profilu partnerskiego.' });
      return;
    }

    if (partnerProfile.status !== 'APPROVED') {
      res.status(403).json({
        message: partnerProfile.status === 'PENDING'
          ? 'Twój profil partnerski oczekuje na zatwierdzenie.'
          : 'Twój profil partnerski nie jest aktywny.',
        status: partnerProfile.status,
      });
      return;
    }

    // Attach partner profile to request for downstream use
    (req as any).partnerProfile = partnerProfile;
    next();
  } catch (error) {
    console.error('[PartnerGuard] Error:', error);
    res.status(500).json({ message: 'Błąd weryfikacji profilu partnerskiego.' });
  }
}
