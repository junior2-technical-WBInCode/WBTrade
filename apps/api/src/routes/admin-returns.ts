/**
 * Admin Returns Routes
 * 
 * Dedicated API for managing returns/complaints with full status workflow:
 * NEW → RECEIVED → APPROVED → REFUND_SENT → CLOSED
 *                 → REJECTED
 */

import { Router, Request, Response } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { returnService } from '../services/return.service';
import { addMessage, markMessagesAsRead } from '../services/support.service';
import { emailService } from '../services/email.service';
import { ReturnStatus } from '@prisma/client';

const router = Router();

// All admin return routes require admin auth
router.use(authGuard, adminOnly);

// Simple HTML sanitization
function sanitize(text: string): string {
  return text.trim().replace(/<[^>]*>/g, '');
}

// ─── GET /api/admin/returns/stats ───
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await returnService.getReturnStats();
    res.json(stats);
  } catch (error: any) {
    console.error('[AdminReturns] Error fetching stats:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── GET /api/admin/returns ───
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit, status, type, search, dateFrom, dateTo } = req.query;

    const statusStr = typeof status === 'string' ? status : undefined;
    const typeStr = typeof type === 'string' ? type : undefined;
    const searchStr = typeof search === 'string' ? search : undefined;
    const dateFromStr = typeof dateFrom === 'string' ? dateFrom : undefined;
    const dateToStr = typeof dateTo === 'string' ? dateTo : undefined;

    const result = await returnService.getReturns({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: statusStr ? (statusStr.includes(',') ? undefined : (statusStr as ReturnStatus)) : undefined,
      statuses: statusStr?.includes(',') ? statusStr.split(',') as ReturnStatus[] : undefined,
      type: typeStr as 'RETURN' | 'COMPLAINT' | undefined,
      search: searchStr,
      dateFrom: dateFromStr ? new Date(dateFromStr) : undefined,
      dateTo: dateToStr ? new Date(dateToStr) : undefined,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AdminReturns] Error fetching returns:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── GET /api/admin/returns/:id ───
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const returnRequest = await returnService.getReturn(req.params.id);

    if (!returnRequest) {
      return res.status(404).json({ error: 'Zwrot nie został znaleziony' });
    }

    // Auto-mark customer messages as read
    if (returnRequest.ticketId) {
      await markMessagesAsRead(returnRequest.ticketId, 'ADMIN');
    }

    // Transform items to include image from product
    const transformed = {
      ...returnRequest,
      items: returnRequest.items.map((item: any) => ({
        ...item,
        orderItem: {
          id: item.orderItem.id,
          productName: item.orderItem.productName,
          variantName: item.orderItem.variantName,
          quantity: item.orderItem.quantity,
          unitPrice: item.orderItem.unitPrice,
          image: item.orderItem.variant?.product?.images?.[0] || null,
        },
      })),
    };

    res.json(transformed);
  } catch (error: any) {
    console.error('[AdminReturns] Error fetching return:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── PATCH /api/admin/returns/:id/status ───
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, adminNotes } = req.body;
    const adminId = (req as any).user?.userId;

    if (!status) {
      return res.status(400).json({ error: 'Status jest wymagany' });
    }

    const validStatuses: ReturnStatus[] = ['NEW', 'RECEIVED', 'APPROVED', 'REFUND_SENT', 'CLOSED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Nieprawidłowy status' });
    }

    const updated = await returnService.updateReturnStatus(
      req.params.id,
      status,
      adminId,
      adminNotes ? sanitize(adminNotes) : undefined,
    );

    res.json(updated);
  } catch (error: any) {
    console.error('[AdminReturns] Error updating status:', error);
    res.status(400).json({ error: error.message || 'Błąd aktualizacji statusu' });
  }
});

// ─── POST /api/admin/returns/:id/approve ───
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { refundAmount, adminNotes } = req.body;
    const adminId = (req as any).user?.userId;

    if (refundAmount === undefined || refundAmount === null || Number(refundAmount) < 0) {
      return res.status(400).json({ error: 'Kwota zwrotu jest wymagana i musi być >= 0' });
    }

    const updated = await returnService.approveReturn(
      req.params.id,
      Number(refundAmount),
      adminId,
      adminNotes ? sanitize(adminNotes) : undefined,
    );

    res.json(updated);
  } catch (error: any) {
    console.error('[AdminReturns] Error approving return:', error);
    res.status(400).json({ error: error.message || 'Błąd akceptacji zwrotu' });
  }
});

// ─── POST /api/admin/returns/:id/reject ───
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { rejectionReason } = req.body;
    const adminId = (req as any).user?.userId;

    if (!rejectionReason?.trim()) {
      return res.status(400).json({ error: 'Powód odrzucenia jest wymagany' });
    }

    const updated = await returnService.rejectReturn(
      req.params.id,
      sanitize(rejectionReason),
      adminId,
    );

    res.json(updated);
  } catch (error: any) {
    console.error('[AdminReturns] Error rejecting return:', error);
    res.status(400).json({ error: error.message || 'Błąd odrzucenia zwrotu' });
  }
});

// ─── POST /api/admin/returns/:id/refund-sent ───
router.post('/:id/refund-sent', async (req: Request, res: Response) => {
  try {
    const { refundDate } = req.body;
    const adminId = (req as any).user?.userId;

    const date = refundDate ? new Date(refundDate) : new Date();
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Nieprawidłowa data przelewu' });
    }

    const updated = await returnService.markRefundSent(
      req.params.id,
      date,
      adminId,
    );

    res.json(updated);
  } catch (error: any) {
    console.error('[AdminReturns] Error marking refund sent:', error);
    res.status(400).json({ error: error.message || 'Błąd oznaczania przelewu' });
  }
});

// ─── POST /api/admin/returns/:id/close ───
router.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.userId;
    const updated = await returnService.closeReturn(req.params.id, adminId);
    res.json(updated);
  } catch (error: any) {
    console.error('[AdminReturns] Error closing return:', error);
    res.status(400).json({ error: error.message || 'Błąd zamykania zwrotu' });
  }
});

// ─── POST /api/admin/returns/:id/messages ───
router.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const adminId = (req as any).user?.userId;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Treść wiadomości jest wymagana' });
    }

    // Get the return to find the ticket
    const returnRequest = await returnService.getReturn(req.params.id);
    if (!returnRequest) {
      return res.status(404).json({ error: 'Zwrot nie został znaleziony' });
    }

    const message = await addMessage({
      ticketId: returnRequest.ticketId,
      senderId: adminId,
      senderRole: 'ADMIN',
      content: sanitize(content),
    });

    // Send email notification to customer (fire-and-forget)
    const customerEmail = returnRequest.ticket?.user?.email || returnRequest.ticket?.guestEmail;
    const customerName = returnRequest.ticket?.user
      ? `${returnRequest.ticket.user.firstName} ${returnRequest.ticket.user.lastName}`
      : returnRequest.ticket?.guestName || 'Klient';

    if (customerEmail) {
      emailService.sendSupportReplyToCustomer({
        to: customerEmail,
        customerName,
        ticketNumber: returnRequest.ticket?.ticketNumber || '',
        subject: returnRequest.ticket?.subject || 'Zwrot',
        replyContent: sanitize(content),
      }).catch((err: any) => console.error('[AdminReturns] Failed to send reply email:', err.message));
    }

    res.json(message);
  } catch (error: any) {
    console.error('[AdminReturns] Error adding message:', error);
    res.status(500).json({ error: 'Błąd dodawania wiadomości' });
  }
});

export default router;
