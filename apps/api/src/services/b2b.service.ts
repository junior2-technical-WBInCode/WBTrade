import { prisma } from '../db';
import { B2bStatus, UserRole } from '@prisma/client';
import { emailService } from './email.service';

const DEFAULT_B2B_MULTIPLIER = 1.10;

export class B2bService {
  /**
   * Get B2B application status for a user
   */
  async getApplicationStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        b2bStatus: true,
        companyName: true,
        nip: true,
        b2bApprovedAt: true,
        b2bPriceMultiplier: true,
        role: true,
      },
    });

    if (!user) throw new Error('Użytkownik nie znaleziony');

    return {
      status: user.b2bStatus,
      companyName: user.companyName,
      nip: user.nip,
      approvedAt: user.b2bApprovedAt,
      priceMultiplier: user.b2bPriceMultiplier ? Number(user.b2bPriceMultiplier) : null,
      isB2b: user.role === 'B2B_PARTNER',
    };
  }

  /**
   * Submit B2B application (for users who registered as personal and want to upgrade)
   */
  async submitApplication(userId: string, data: {
    companyName: string;
    nip: string;
    companyStreet: string;
    companyCity: string;
    companyPostalCode: string;
    phone: string;
  }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');

    if (user.b2bStatus === 'PENDING') {
      throw new Error('Wniosek jest już w trakcie weryfikacji');
    }
    if (user.b2bStatus === 'APPROVED' || user.role === 'B2B_PARTNER') {
      throw new Error('Konto firmowe jest już aktywne');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        companyName: data.companyName,
        nip: data.nip,
        companyStreet: data.companyStreet,
        companyCity: data.companyCity,
        companyPostalCode: data.companyPostalCode,
        phone: data.phone,
        b2bStatus: 'PENDING',
      },
    });

    return { status: updated.b2bStatus };
  }

  /**
   * Approve a B2B application (admin action)
   */
  async approveApplication(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');
    if (user.b2bStatus !== 'PENDING') {
      throw new Error('Wniosek nie ma statusu oczekującego');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'B2B_PARTNER',
        b2bStatus: 'APPROVED',
        b2bPriceMultiplier: DEFAULT_B2B_MULTIPLIER,
        b2bApprovedAt: new Date(),
        b2bApprovedBy: adminId,
      },
    });

    // Send approval email
    try {
      await emailService.sendB2bApprovalEmail(updated.email, updated.firstName, updated.companyName || '');
    } catch (err: any) {
      console.error(`[B2bService] Failed to send approval email to ${updated.email}:`, err.message);
    }

    return { status: updated.b2bStatus, role: updated.role };
  }

  /**
   * Reject a B2B application (admin action)
   */
  async rejectApplication(userId: string, adminId: string, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');
    if (user.b2bStatus !== 'PENDING') {
      throw new Error('Wniosek nie ma statusu oczekującego');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        b2bStatus: 'REJECTED',
        b2bNotes: reason || null,
      },
    });

    // Send rejection email
    try {
      await emailService.sendB2bRejectionEmail(updated.email, updated.firstName, reason);
    } catch (err: any) {
      console.error(`[B2bService] Failed to send rejection email to ${updated.email}:`, err.message);
    }

    return { status: updated.b2bStatus };
  }

  /**
   * Revoke B2B access (admin action)
   */
  async revokeAccess(userId: string, adminId: string, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');
    if (user.role !== 'B2B_PARTNER') {
      throw new Error('Użytkownik nie jest partnerem B2B');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'CUSTOMER',
        b2bStatus: 'REVOKED',
        b2bPriceMultiplier: null,
        b2bNotes: reason || null,
      },
    });

    return { status: 'REVOKED' as B2bStatus };
  }

  /**
   * Suspend B2B partner (temporary block — can't place orders but keeps account access)
   */
  async suspendPartner(userId: string, adminId: string, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');
    if (user.role !== 'B2B_PARTNER' || user.b2bStatus !== 'APPROVED') {
      throw new Error('Użytkownik nie jest aktywnym partnerem B2B');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        b2bStatus: 'SUSPENDED',
        b2bNotes: reason ? `Zawieszony: ${reason}` : 'Konto zawieszone przez administratora',
      },
    });

    return { status: 'SUSPENDED' as B2bStatus };
  }

  /**
   * Unsuspend B2B partner (restore access)
   */
  async unsuspendPartner(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');
    if (user.role !== 'B2B_PARTNER' || user.b2bStatus !== 'SUSPENDED') {
      throw new Error('Użytkownik nie jest zawieszonym partnerem B2B');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        b2bStatus: 'APPROVED',
        b2bNotes: null,
      },
    });

    return { status: 'APPROVED' as B2bStatus };
  }

  /**
   * Update B2B price multiplier for a user (admin action)
   */
  async updateMultiplier(userId: string, multiplier: number, adminId: string) {
    if (multiplier < 1.0 || multiplier > 5.0) {
      throw new Error('Mnożnik musi być pomiędzy 1.00 a 5.00');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Użytkownik nie znaleziony');
    if (user.role !== 'B2B_PARTNER') {
      throw new Error('Użytkownik nie jest partnerem B2B');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { b2bPriceMultiplier: multiplier },
    });

    return { multiplier };
  }

  /**
   * Get all B2B applications (admin)
   */
  async getApplications(status?: B2bStatus) {
    const where: any = {};
    if (status) {
      where.b2bStatus = status;
    } else {
      where.b2bStatus = { not: 'NONE' };
    }

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        companyName: true,
        nip: true,
        companyStreet: true,
        companyCity: true,
        companyPostalCode: true,
        b2bStatus: true,
        b2bPriceMultiplier: true,
        b2bApprovedAt: true,
        b2bApprovedBy: true,
        b2bNotes: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all active B2B partners (admin)
   */
  async getPartners() {
    return prisma.user.findMany({
      where: { role: 'B2B_PARTNER', b2bStatus: { in: ['APPROVED', 'SUSPENDED'] } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        companyName: true,
        nip: true,
        b2bStatus: true,
        b2bPriceMultiplier: true,
        b2bApprovedAt: true,
        b2bNotes: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { b2bApprovedAt: 'desc' },
    });
  }
}

export const b2bService = new B2bService();
