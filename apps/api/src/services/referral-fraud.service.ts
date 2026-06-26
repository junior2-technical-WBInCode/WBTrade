/**
 * Referral Anti-Fraud Service
 * 
 * Detects potential fraud in referral attributions by checking
 * if the buyer is the same person as the partner.
 * 
 * Phase 1: email, userId, NIP checks
 * Phase 2: IP comparison (requires User.lastLoginIp)
 */

import { prisma } from '../db';

interface BuyerInfo {
  userId?: string | null;
  email: string;
  nip?: string | null;
  ip?: string | null;
}

interface PartnerInfo {
  userId: string;
  user: {
    email: string;
    lastLoginIp?: string | null;
  };
  nip?: string | null;
}

interface FraudCheckResult {
  isFraud: boolean;
  reason?: string;
}

/**
 * Check if a referral order is potentially fraudulent.
 * Returns { isFraud: true, reason } if self-referral detected.
 */
export function isFraud(partner: PartnerInfo, buyer: BuyerInfo): FraudCheckResult {
  // Phase 1: Same user account
  if (buyer.userId && buyer.userId === partner.userId) {
    return { isFraud: true, reason: 'Self-referral: same user account' };
  }

  // Phase 1: Same email
  if (buyer.email && partner.user.email) {
    if (buyer.email.toLowerCase() === partner.user.email.toLowerCase()) {
      return { isFraud: true, reason: 'Self-referral: same email address' };
    }
  }

  // Phase 1: Same NIP (tax ID)
  if (buyer.nip && partner.nip && buyer.nip === partner.nip) {
    return { isFraud: true, reason: 'Self-referral: same NIP (tax ID)' };
  }

  // Phase 2: Same IP address (only if lastLoginIp is available)
  if (buyer.ip && partner.user.lastLoginIp && buyer.ip === partner.user.lastLoginIp) {
    return { isFraud: true, reason: 'Self-referral: same IP address' };
  }

  return { isFraud: false };
}

/**
 * Load partner data needed for fraud checks.
 * Returns null if partner not found.
 */
export async function loadPartnerForFraudCheck(partnerId: string): Promise<PartnerInfo | null> {
  const partner = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    include: {
      user: {
        select: {
          email: true,
          lastLoginIp: true,
        },
      },
    },
  });

  if (!partner) return null;

  return {
    userId: partner.userId,
    user: {
      email: partner.user.email,
      lastLoginIp: partner.user.lastLoginIp,
    },
    nip: partner.nip,
  };
}
