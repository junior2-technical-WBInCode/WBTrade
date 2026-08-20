import { Router, Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { prisma } from '../db';
import { optionalAuth } from '../middleware/auth.middleware';
import * as supportService from '../services/support.service';
import { returnService } from '../services/return.service';
import { logAuditEvent, AuditAction, AuditSeverity } from '../lib/audit';

const router = Router();

// ============================================
// CONTACT ROUTES
// Obsługa formularzy kontaktowych i reklamacji
// ============================================

interface ComplaintRequest {
  subject: string;
  description: string;
  email: string;
  orderNumber: string; // Required now
  images?: string[]; // Base64 encoded images
}

/**
 * Helper function to check if order is eligible for complaint
 * Order must exist and be in DELIVERED or SHIPPED status
 */
async function checkComplaintEligibility(orderNumber: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  // Sanitize input - only allow alphanumeric characters and hyphens
  const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
  let sanitizedOrderNumber = '';
  for (const char of orderNumber) {
    if (allowedChars.includes(char)) {
      sanitizedOrderNumber += char;
    }
  }
  
  if (!sanitizedOrderNumber || sanitizedOrderNumber.length < 3) {
    return { eligible: false, reason: 'Nieprawidłowy format numeru zamówienia' };
  }

  // Try to find by orderNumber first, then by ID
  let order = await prisma.order.findUnique({
    where: { orderNumber: sanitizedOrderNumber },
    select: {
      id: true,
      status: true,
      orderNumber: true,
      user: { select: { role: true } },
    },
  });

  if (!order) {
    order = await prisma.order.findUnique({
      where: { id: sanitizedOrderNumber },
      select: {
        id: true,
        status: true,
        orderNumber: true,
        user: { select: { role: true } },
      },
    });
  }

  if (!order) {
    return { eligible: false, reason: 'Zamówienie nie zostało znalezione' };
  }

  const isB2B = order.user?.role === 'B2B_PARTNER';
  const allowedStatuses = isB2B ? ['DELIVERED', 'SHIPPED', 'CONFIRMED'] : ['DELIVERED', 'SHIPPED'];

  // Only DELIVERED, SHIPPED (and CONFIRMED for B2B) orders can have complaints filed
  if (!allowedStatuses.includes(order.status)) {
    return {
      eligible: false,
      reason: isB2B
        ? 'Reklamację można zgłosić tylko dla zamówień opłaconych, dostarczonych lub w trakcie dostawy'
        : 'Reklamację można zgłosić tylko dla zamówień dostarczonych lub w trakcie dostawy',
    };
  }

  // Already refunded
  if (order.status === 'REFUNDED') {
    return { eligible: false, reason: 'Zamówienie zostało już zwrócone' };
  }

  return { eligible: true };
}

/**
 * GET /api/contact/return-eligibility/:orderNumber
 * Sprawdza czy można złożyć zwrot dla danego zamówienia (14 dni od dostawy)
 * Nie wymaga autentykacji — sam numer zamówienia jest dowodem
 */
router.get('/return-eligibility/:orderNumber', async (req: Request, res: Response) => {
  try {
    let { orderNumber } = req.params;

    if (!orderNumber?.trim()) {
      return res.status(400).json({ eligible: false, reason: 'Podaj numer zamówienia' });
    }

    orderNumber = orderNumber.trim();
    if (orderNumber.startsWith('#')) orderNumber = orderNumber.slice(1);

    // Sanitize
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
    let sanitized = '';
    for (const char of orderNumber) {
      if (allowedChars.includes(char)) sanitized += char;
    }
    if (!sanitized || sanitized.length < 3) {
      return res.json({ eligible: false, reason: 'Nieprawidłowy format numeru zamówienia' });
    }

    // Find order by orderNumber or ID
    let order = await prisma.order.findUnique({
      where: { orderNumber: sanitized },
      include: {
        user: { select: { role: true } },
        statusHistory: {
          where: { status: 'DELIVERED' },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
        },
      },
    });
    if (!order) {
      order = await prisma.order.findUnique({
        where: { id: sanitized },
        include: {
          user: { select: { role: true } },
          statusHistory: {
            where: { status: 'DELIVERED' },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
          },
        },
      });
    }

    if (!order) {
      return res.json({ eligible: false, reason: 'Zamówienie nie zostało znalezione' });
    }

    const isB2B = order.user?.role === 'B2B_PARTNER';
    const allowedStatuses = isB2B ? ['DELIVERED', 'SHIPPED', 'CONFIRMED'] : ['DELIVERED', 'SHIPPED'];

    if (!allowedStatuses.includes(order.status)) {
      return res.json({ eligible: false, reason: 'Zamówienie nie może zostać zwrócone w obecnym statusie' });
    }

    if (order.status === 'REFUNDED') {
      return res.json({ eligible: false, reason: 'Zamówienie zostało już zwrócone' });
    }

    // 14-day return window check
    const deliveredEntry = order.statusHistory[0];
    let deliveredAt: Date;
    if (deliveredEntry?.createdAt) {
      deliveredAt = deliveredEntry.createdAt;
    } else if (order.status === 'DELIVERED') {
      deliveredAt = order.updatedAt;
    } else {
      // SHIPPED — allow (they'll return after receiving)
      return res.json({ eligible: true });
    }

    const refundPeriodStart = new Date(deliveredAt);
    refundPeriodStart.setHours(0, 0, 0, 0);
    refundPeriodStart.setDate(refundPeriodStart.getDate() + 1);

    const refundDeadline = new Date(refundPeriodStart);
    refundDeadline.setDate(refundDeadline.getDate() + 14);

    const now = new Date();
    const msRemaining = refundDeadline.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      return res.json({
        eligible: false,
        reason: 'Upłynął 14-dniowy termin na zwrot towaru',
      });
    }

    return res.json({ eligible: true, daysRemaining });
  } catch (error) {
    console.error('[Contact] Return eligibility check error:', error);
    return res.status(500).json({ eligible: false, reason: 'Wystąpił błąd podczas sprawdzania zamówienia' });
  }
});

/**
 * GET /api/contact/complaint-eligibility/:orderNumber
 * Sprawdza czy można złożyć reklamację dla danego zamówienia
 */
router.get('/complaint-eligibility/:orderNumber', async (req: Request, res: Response) => {
  try {
    let { orderNumber } = req.params;

    if (!orderNumber?.trim()) {
      return res.status(400).json({
        eligible: false,
        reason: 'Podaj numer zamówienia',
      });
    }

    // Remove # prefix if present (users often copy order number with #)
    orderNumber = orderNumber.trim();
    if (orderNumber.startsWith('#')) {
      orderNumber = orderNumber.slice(1);
    }

    const eligibility = await checkComplaintEligibility(orderNumber);
    return res.json(eligibility);
  } catch (error) {
    console.error('[Contact] Complaint eligibility check error:', error);
    return res.status(500).json({
      eligible: false,
      reason: 'Wystąpił błąd podczas sprawdzania zamówienia',
    });
  }
});

/**
 * GET /api/contact/order-items/:orderNumber
 * Returns the items of an order for the return form item selection step
 */
router.get('/order-items/:orderNumber', async (req: Request, res: Response) => {
  try {
    let { orderNumber } = req.params;
    if (!orderNumber?.trim()) {
      return res.status(400).json({ success: false, message: 'Podaj numer zamówienia' });
    }
    orderNumber = orderNumber.trim();
    if (orderNumber.startsWith('#')) {
      orderNumber = orderNumber.slice(1);
    }

    let order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        items: {
          select: {
            id: true,
            productName: true,
            variantName: true,
            sku: true,
            quantity: true,
            unitPrice: true,
            total: true,
            variant: {
              select: {
                id: true,
                product: {
                  select: { id: true, name: true, images: true },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Zamówienie nie zostało znalezione' });
    }

    return res.json({
      success: true,
      orderNumber: order.orderNumber,
      items: order.items.map((item: any) => ({
        id: item.id,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        image: item.variant?.product?.images?.[0] || null,
      })),
    });
  } catch (error) {
    console.error('[Contact] Order items error:', error);
    return res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

/**
 * POST /api/contact/complaint
 * Wysyła zgłoszenie reklamacyjne na email support@wb-partners.pl
 * Wymaga numeru zamówienia i sprawdza czy zamówienie zostało dostarczone
 */
router.post('/complaint', async (req: Request, res: Response) => {
  try {
    const { subject, description, email, orderNumber: rawOrderNumber, images = [] }: ComplaintRequest = req.body;

    // Validation - all fields are now required
    if (!subject?.trim() || !description?.trim() || !email?.trim() || !rawOrderNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Wypełnij wszystkie wymagane pola (temat, opis, email, numer zamówienia)',
      });
    }

    // Remove # prefix if present (users often copy order number with #)
    let orderNumber = rawOrderNumber.trim();
    if (orderNumber.startsWith('#')) {
      orderNumber = orderNumber.slice(1);
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Podaj prawidłowy adres email',
      });
    }

    // Check if order is eligible for complaint
    const eligibility = await checkComplaintEligibility(orderNumber.trim());
    if (!eligibility.eligible) {
      return res.status(400).json({
        success: false,
        message: eligibility.reason || 'Nie można złożyć reklamacji dla tego zamówienia',
      });
    }

    // PRIMARY channel: support ticket in DB - visible in the admin panel.
    // Before this, the complaint only went out as an email and a Resend
    // failure lost it entirely.
    const order = await prisma.order.findFirst({
      where: { orderNumber: orderNumber.trim() },
      select: { id: true, userId: true },
    });
    const ticket = await supportService.createTicket({
      userId: order?.userId || undefined,
      guestEmail: email.trim(),
      orderId: order?.id,
      subject: subject.trim(),
      category: 'COMPLAINT',
      message: `Zamówienie: #${orderNumber.trim()}\n\n${description.trim()}${
        images.length > 0 ? `\n\n(${images.length} zdj. w załączniku e-maila do supportu)` : ''
      }`,
    });

    // SECONDARY channel: email with image attachments - best-effort
    const result = await emailService.sendComplaintEmail({
      customerEmail: email,
      subject: subject.trim(),
      description: description.trim(),
      orderNumber: orderNumber.trim(),
      images,
    }).catch((err) => ({ success: false, error: String(err) }));
    if (!result.success) {
      console.error(`[Contact] Complaint email failed (ticket ${ticket.ticketNumber} saved):`, (result as any).error);
    }

    console.log(`✅ [Contact] Complaint from ${email}, order: ${orderNumber} -> ticket ${ticket.ticketNumber}`);
    return res.json({
      success: true,
      message: 'Zgłoszenie zostało wysłane. Skontaktujemy się z Tobą wkrótce.',
    });
  } catch (error) {
    console.error('[Contact] Complaint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Wystąpił błąd serwera',
    });
  }
});

/**
 * POST /api/contact/general
 * Ogólny formularz kontaktowy
 */
router.post('/general', async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Wypełnij wszystkie wymagane pola',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Podaj prawidłowy adres email',
      });
    }

    // PRIMARY channel: support ticket in DB - shows up in the admin panel
    // (Wiadomości + notification bell). Before this, the form only sent an
    // email to support@ and a Resend failure silently swallowed the message.
    const ticket = await supportService.createTicket({
      guestEmail: email.trim(),
      guestName: name.trim(),
      subject: subject?.trim() || 'Wiadomość ze strony',
      category: 'GENERAL',
      message: message.trim(),
    });

    // SECONDARY channel: email to support - best-effort only
    const result = await emailService.sendContactFormEmail({
      name: name.trim(),
      email: email.trim(),
      subject: subject?.trim() || 'Wiadomość ze strony',
      message: message.trim(),
    }).catch((err) => ({ success: false as const, error: String(err) }));

    console.log(`✅ [Contact] General contact from ${email} -> ticket ${ticket.ticketNumber}`);

    // Audit log (email failure downgraded to WARNING - the ticket is already saved)
    logAuditEvent({
      action: result.success ? AuditAction.CONTACT_FORM_SENT : AuditAction.CONTACT_FORM_FAILED,
      email: email.trim(),
      severity: result.success ? AuditSeverity.INFO : AuditSeverity.WARNING,
      success: result.success,
      metadata: {
        fromEmail: email.trim(),
        toEmail: 'support@wb-partners.pl',
        fromName: name.trim(),
        subject: subject?.trim() || 'Wiadomość ze strony',
        ticketNumber: ticket.ticketNumber,
        ...(result.success ? { messageId: (result as any).messageId } : { error: (result as any).error }),
      },
    }).catch(() => {});
    if (!result.success) {
      console.error(`[Contact] Support email failed (ticket ${ticket.ticketNumber} saved):`, (result as any).error);
    }

    // Send confirmation email to customer (fire and forget)
    emailService.sendContactConfirmationEmail({
      name: name.trim(),
      email: email.trim(),
      subject: subject?.trim() || 'Wiadomość ze strony',
    }).catch((err) => console.error('[Contact] Confirmation email error:', err));

    return res.json({
      success: true,
      message: 'Wiadomość została wysłana. Dziękujemy!',
    });
  } catch (error) {
    console.error('[Contact] General contact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Wystąpił błąd serwera',
    });
  }
});

// ============================================
// RETURN / COMPLAINT REQUEST (Unified)
// POST /api/contact/return-request
// Uses optionalAuth: logged-in users get userId attached,
// guests submit with guestEmail/guestName/guestPhone
// ============================================

const RETURN_ADDRESS = {
  name: 'WB Partners',
  contactPerson: 'Daniel Budyka',
  street: 'ul. Juliusza Słowackiego 24/11',
  city: 'Rzeszów',
  postalCode: '35-060',
  country: 'Polska',
  phone: '570 028 761',
  email: 'support@wb-partners.pl',
};

interface ReturnRequestBody {
  type: 'RETURN' | 'COMPLAINT';
  orderNumber: string;
  reason: string;
  items?: {
    orderItemId: string;
    quantity: number;
    reason?: string;
  }[];
  // Guest fields (required when not logged in)
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

router.post('/return-request', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { type, orderNumber: rawOrderNumber, reason, items, firstName, lastName, email, phone }: ReturnRequestBody = req.body;
    const user = (req as any).user;
    const isLoggedIn = !!user?.userId;

    // --- Validation ---
    if (!type || !['RETURN', 'COMPLAINT'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Wybierz typ zgłoszenia (Zwrot lub Reklamacja)' });
    }

    if (!rawOrderNumber?.trim()) {
      return res.status(400).json({ success: false, message: 'Podaj numer zamówienia' });
    }

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: 'Podaj powód zgłoszenia' });
    }

    // Guest must provide contact info
    if (!isLoggedIn) {
      if (!firstName?.trim() || !lastName?.trim()) {
        return res.status(400).json({ success: false, message: 'Podaj imię i nazwisko' });
      }
      if (!email?.trim()) {
        return res.status(400).json({ success: false, message: 'Podaj adres email' });
      }
      // Atomic-safe email regex (no polynomial backtracking)
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Podaj prawidłowy adres email' });
      }
    }

    // --- Clean order number ---
    let orderNumber = rawOrderNumber.trim();
    if (orderNumber.startsWith('#')) {
      orderNumber = orderNumber.slice(1);
    }

    // --- Verify order exists & is eligible ---
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
    let sanitizedOrderNumber = '';
    for (const char of orderNumber) {
      if (allowedChars.includes(char)) {
        sanitizedOrderNumber += char;
      }
    }

    if (!sanitizedOrderNumber || sanitizedOrderNumber.length < 3) {
      return res.status(400).json({ success: false, message: 'Nieprawidłowy format numeru zamówienia' });
    }

    let order = await prisma.order.findUnique({
      where: { orderNumber: sanitizedOrderNumber },
      select: {
        id: true, status: true, orderNumber: true, userId: true, guestEmail: true,
        items: { select: { id: true, quantity: true } },
        user: { select: { role: true } },
      },
    });

    if (!order) {
      order = await prisma.order.findUnique({
        where: { id: sanitizedOrderNumber },
        select: {
          id: true, status: true, orderNumber: true, userId: true, guestEmail: true,
          items: { select: { id: true, quantity: true } },
          user: { select: { role: true } },
        },
      });
    }

    if (!order) {
      return res.status(400).json({ success: false, message: 'Zamówienie nie zostało znalezione' });
    }

    const isB2B = (order as any).user?.role === 'B2B_PARTNER';
    const allowedStatuses = isB2B ? ['DELIVERED', 'SHIPPED', 'CONFIRMED'] : ['DELIVERED', 'SHIPPED'];

    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: type === 'RETURN'
          ? (isB2B ? 'Zwrot można zgłosić dla zamówień opłaconych, dostarczonych lub w drodze' : 'Zwrot można zgłosić tylko dla zamówień dostarczonych lub w trakcie dostawy')
          : (isB2B ? 'Reklamację można zgłosić dla zamówień opłaconych, dostarczonych lub w drodze' : 'Reklamację można zgłosić tylko dla zamówień dostarczonych lub w trakcie dostawy'),
      });
    }

    if (order.status === 'REFUNDED') {
      return res.status(400).json({ success: false, message: 'Zamówienie zostało już zwrócone' });
    }

    // --- Validate return items ---
    let returnItems: { orderItemId: string; quantity: number; reason?: string }[];

    if (items && Array.isArray(items) && items.length > 0) {
      // Validate each item belongs to the order and quantity is valid
      const orderItemIds = order.items.map((i: any) => i.id);
      for (const item of items) {
        if (!orderItemIds.includes(item.orderItemId)) {
          return res.status(400).json({ success: false, message: 'Jeden z produktów nie należy do tego zamówienia' });
        }
        const orderItem = order.items.find((i: any) => i.id === item.orderItemId);
        if (!orderItem || item.quantity < 1 || item.quantity > orderItem.quantity) {
          return res.status(400).json({ success: false, message: 'Nieprawidłowa ilość produktu do zwrotu' });
        }
      }
      returnItems = items;
    } else {
      // If no items specified, return all items from the order
      returnItems = order.items.map((i: any) => ({
        orderItemId: i.id,
        quantity: i.quantity,
      }));
    }

    // --- Resolve customer identity ---
    let customerName: string;
    let customerEmail: string;
    let customerPhone: string | undefined;
    let userId: string | undefined;

    if (isLoggedIn) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });
      customerName = dbUser ? `${dbUser.firstName} ${dbUser.lastName}` : `${firstName || ''} ${lastName || ''}`.trim();
      customerEmail = dbUser?.email || email || '';
      customerPhone = phone || dbUser?.phone || undefined;
      userId = user.userId;
    } else {
      customerName = `${firstName!.trim()} ${lastName!.trim()}`;
      customerEmail = email!.trim();
      customerPhone = phone?.trim() || undefined;
    }

    // --- Create return request (with ticket + items) ---
    const returnRequest = await returnService.createReturn({
      orderId: order.id,
      type,
      reason: reason.trim(),
      items: returnItems,
      userId,
      guestEmail: isLoggedIn ? undefined : customerEmail,
      guestName: isLoggedIn ? undefined : customerName,
      guestPhone: isLoggedIn ? undefined : customerPhone,
    });

    const subjectPrefix = type === 'RETURN' ? 'Zwrot' : 'Reklamacja';

    // --- Send email to admin (fire-and-forget) ---
    emailService.sendSupportNewTicketToAdmin({
      ticketNumber: returnRequest.ticket?.ticketNumber || '',
      subject: `${subjectPrefix} - zamówienie ${order.orderNumber}`,
      category: type,
      userName: customerName,
      userEmail: customerEmail,
      message: reason.trim(),
    }).catch((err) => console.error('[Contact] Failed to send return notification to admin:', err.message));

    // --- Send confirmation email to customer (fire-and-forget) ---
    emailService.sendReturnConfirmationEmail({
      to: customerEmail,
      customerName,
      returnNumber: returnRequest.returnNumber,
      type,
      orderNumber: order.orderNumber,
      reason: reason.trim(),
      returnAddress: {
        name: RETURN_ADDRESS.name,
        street: RETURN_ADDRESS.street,
        city: RETURN_ADDRESS.city,
        postalCode: RETURN_ADDRESS.postalCode,
      },
    }).catch((err) => console.error('[Contact] Failed to send return confirmation to customer:', err.message));

    console.log(`✅ [Contact] ${subjectPrefix} request from ${customerEmail}, order: ${order.orderNumber}, number: ${returnRequest.returnNumber}`);

    return res.status(201).json({
      success: true,
      returnNumber: returnRequest.returnNumber,
      ticketNumber: returnRequest.ticket?.ticketNumber || '',
      returnAddress: RETURN_ADDRESS,
    });
  } catch (error) {
    console.error('[Contact] Return request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Wystąpił błąd serwera. Spróbuj ponownie później.',
    });
  }
});

export default router;
