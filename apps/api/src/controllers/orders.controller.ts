import { Request, Response } from 'express';
import { z } from 'zod';
import { OrdersService } from '../services/orders.service';
import { OrderStatus } from '@prisma/client';
import { loyaltyService } from '../services/loyalty.service';
import { deliveryTrackingService } from '../services/delivery-tracking.service';
import { emailService } from '../services/email.service';
import { prisma } from '../db';
import { baselinkerOrdersService } from '../services/baselinker-orders.service';

const ordersService = new OrdersService();

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * Helper to sanitize text
 */
const sanitizeText = (text: string): string => {
  return text.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
};

/**
 * Order item schema
 */
const orderItemSchema = z.object({
  variantId: z.string().regex(/^c[a-z0-9]{20,}$/i, 'Invalid variant ID'),
  quantity: z.number().int().positive().max(100),
  unitPrice: z.number().positive().max(9999999),
});

/**
 * Package shipping item schema for per-package delivery
 */
const packageShippingCustomAddressSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  street: z.string().min(1).max(200),
  apartment: z.string().max(50).optional(),
  postalCode: z.string().min(1).max(20),
  city: z.string().min(1).max(100),
});

const packageShippingItemSchema = z.object({
  packageId: z.string().min(1),
  method: z.string().min(1).max(50),
  price: z.number().min(0),
  paczkomatCode: z.string().max(50).optional(),
  paczkomatAddress: z.string().max(500).optional(),
  useCustomAddress: z.boolean().optional(),
  customAddress: packageShippingCustomAddressSchema.optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    productName: z.string().min(1),
    variantId: z.string().min(1),
    variantName: z.string().min(1),
    quantity: z.number().int().positive(),
    image: z.string().optional(),
  })).optional(),
});

/**
 * Create order validation schema
 * Note: userId is optional in body as we use authenticated user's ID from token
 */
const createOrderSchema = z.object({
  userId: z.string().regex(/^c[a-z0-9]{20,}$/i, 'Invalid user ID').optional(),
  shippingAddressId: z.string().regex(/^c[a-z0-9]{20,}$/i, 'Invalid shipping address ID'),
  billingAddressId: z.string().regex(/^c[a-z0-9]{20,}$/i, 'Invalid billing address ID').optional(),
  shippingMethod: z.string().min(1).max(50),
  shippingCost: z.number().min(0).max(999999),
  paymentMethod: z.string().min(1).max(50),
  paymentFee: z.number().min(0).max(999999).optional().default(0),
  subtotal: z.number().positive().max(99999999),
  total: z.number().positive().max(99999999),
  customerNotes: z.string().max(1000).optional().transform((val) => val ? sanitizeText(val) : undefined),
  pickupPointCode: z.string().max(50).optional(),
  pickupPointAddress: z.string().max(500).optional().transform((val) => val ? sanitizeText(val) : undefined),
  packageShipping: z.array(packageShippingItemSchema).optional(),
  items: z.array(orderItemSchema).min(1, 'Zam�wienie musi miec co najmniej jeden produkt'),
});

/**
 * Update order status schema
 */
const updateOrderStatusSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  note: z.string().max(500).optional().transform((val) => val ? sanitizeText(val) : undefined),
});

/**
 * Query params for orders list
 */
const ordersQuerySchema = z.object({
  page: z.string().optional().transform((val) => {
    const num = parseInt(val || '1', 10);
    return isNaN(num) || num < 1 ? 1 : Math.min(num, 1000);
  }),
  limit: z.string().optional().transform((val) => {
    const num = parseInt(val || '10', 10);
    return isNaN(num) || num < 1 ? 10 : Math.min(num, 100);
  }),
  status: z.string().optional(),
  search: z.string().optional(),
});

/**
 * Get all orders (admin)
 */
export async function getAllOrders(req: Request, res: Response): Promise<void> {
  try {
    const { 
      page = '1', 
      limit = '20', 
      status, 
      search,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const result = await ordersService.getAll({
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      status: status as OrderStatus | undefined,
      search: search as string | undefined,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
      sortBy: sortBy as 'createdAt' | 'total' | 'orderNumber',
      sortOrder: sortOrder as 'asc' | 'desc',
    });
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Error fetching orders', error });
  }
}

/**
 * Create a new order
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    // Get userId from authenticated user (set by authGuard)
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({ message: 'Wymagane uwierzytelnienie' });
      return;
    }
    
    const validation = createOrderSchema.safeParse(req.body);
    
    if (!validation.success) {
      res.status(400).json({
        message: 'Validation error',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }

    // Override userId from body with authenticated user's ID for security
    const order = await ordersService.create({
      ...validation.data,
      userId, // Use authenticated user's ID
    });
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Error creating order' });
  }
}

/**
 * Get order by ID
 * Supports both authenticated users and guest checkout (via order ID)
 */
export async function getOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Validate ID format: accept either UUID or cuid (c... string used by Prisma @default(cuid()))
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!uuidRegex.test(id) && !cuidRegex.test(id)) {
      res.status(400).json({ message: 'Invalid order ID format' });
      return;
    }
    
    const order = await ordersService.getById(id);
    
    if (!order) {
      res.status(404).json({ message: 'Zamowienie nie zostalo znalezione' });
      return;
    }

    // Ownership verification
    const userId = req.user?.userId;
    const isAdmin = req.user?.role === 'ADMIN';

    if (isAdmin) {
      // Admin can access any order
    } else if (userId) {
      // Logged-in user must own the order
      // If order has no userId (guest order), logged-in user cannot access it either
      if (!(order as any).userId || (order as any).userId !== userId) {
        res.status(403).json({ message: 'Brak dostepu do tego zamowienia' });
        return;
      }
    } else {
      // Anonymous (guest) — require matching email in query param
      const guestEmail = (req.query.email as string)?.toLowerCase().trim();
      const orderGuestEmail = (order as any).guestEmail?.toLowerCase().trim();

      if (!guestEmail || !orderGuestEmail || guestEmail !== orderGuestEmail) {
        res.status(401).json({ message: 'Wymagane logowanie lub weryfikacja emailem' });
        return;
      }
    }
    
    res.status(200).json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Error fetching order' });
  }
}

/**
 * Get user's orders
 */
export async function getUserOrders(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    
    const validation = ordersQuerySchema.safeParse(req.query);
    
    if (!validation.success) {
      res.status(400).json({
        message: 'Invalid query parameters',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, limit, status, search } = validation.data;
    
    const result = await ordersService.getUserOrders(userId, page, limit, status, search);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
}

/**
 * Update order status
 */
export async function updateOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Validate ID format: accept either UUID or cuid
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!uuidRegex.test(id) && !cuidRegex.test(id)) {
      res.status(400).json({ message: 'Invalid order ID format' });
      return;
    }
    
    const validation = updateOrderStatusSchema.safeParse(req.body);
    
    if (!validation.success) {
      res.status(400).json({
        message: 'Validation error',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }
    
    // Get current status before update (for email notification and payment status change detection)
    const currentOrder = await prisma.order.findUnique({
      where: { id },
      select: { status: true, paymentStatus: true },
    });
    const previousStatus = currentOrder?.status || 'UNKNOWN';
    const previousPaymentStatus = currentOrder?.paymentStatus || 'PENDING';

    const order = await ordersService.updateStatus(id, validation.data.status, validation.data.note);

    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }

    // If order transitioned to PAID manually, sync status to Baselinker
    if (order.paymentStatus === 'PAID' && previousPaymentStatus !== 'PAID') {
      console.log(`[OrdersController] Order ${order.orderNumber} manually marked as paid. Syncing to Baselinker.`);
      baselinkerOrdersService.markOrderAsPaid(order.id).catch((err) => {
        console.error(`[OrdersController] Error marking order ${order.orderNumber} as paid in BaseLinker:`, err);
      });
    }

    // Trigger loyalty recalculation when order becomes DELIVERED + PAID
    if (order.userId && validation.data.status === 'DELIVERED' && order.paymentStatus === 'PAID') {
      loyaltyService.recalculateUserLevel(order.userId, order.id).catch((err) => {
        console.error('[Loyalty] Error recalculating after status change:', err);
      });
    }
    // Also recalculate on REFUNDED (level may go down)
    if (order.userId && (validation.data.status === 'REFUNDED' || validation.data.status === 'CANCELLED')) {
      loyaltyService.recalculateUserLevel(order.userId, order.id).catch((err) => {
        console.error('[Loyalty] Error recalculating after refund:', err);
      });
    }

    // Send email notification to admin for meaningful status changes (skip OPEN/PENDING to avoid spam)
    const notifiableStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
    if (notifiableStatuses.includes(validation.data.status)) {
      // Get customer info (user or guest)
      let customerName = 'Gość';
      let customerEmail = order.guestEmail || '';
      if (order.userId) {
        const user = await prisma.user.findUnique({
          where: { id: order.userId },
          select: { firstName: true, lastName: true, email: true },
        });
        if (user) {
          customerName = `${user.firstName} ${user.lastName}`;
          // Prefer form-entered email (guestEmail) over account email
          customerEmail = order.guestEmail || user.email;
        }
      } else if ((order as any).guestFirstName) {
        customerName = `${(order as any).guestFirstName} ${(order as any).guestLastName || ''}`;
      }

      emailService.sendOrderStatusChangeToAdmin({
        orderNumber: order.orderNumber,
        status: validation.data.status,
        previousStatus,
        total: Number(order.total),
        customerName,
        customerEmail,
        itemCount: order.items?.length,
        paymentMethod: (order as any).paymentMethod,
        note: validation.data.note,
      }).catch((err) => console.error('[Orders] Failed to send status change email:', err.message));
    }

    res.status(200).json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Error updating order' });
  }
}

/**
 * Cancel order
 */
export async function deleteOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Validate ID format: accept either UUID or cuid
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!uuidRegex.test(id) && !cuidRegex.test(id)) {
      res.status(400).json({ message: 'Invalid order ID format' });
      return;
    }
    
    const result = await ordersService.cancel(id);
    
    if (!result) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    // Check if this is a business order pending approval
    if (result.pendingApproval) {
      res.status(200).json({ 
        message: 'Prośba o anulowanie zamówienia firmowego została przesłana do weryfikacji. Skontaktujemy się z Tobą wkrótce.',
        pendingApproval: true,
        order: result.order,
      });
      return;
    }
    
    res.status(200).json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ message: 'Error cancelling order', error });
  }
}

/**
 * Check refund eligibility for an order
 * Returns whether the order can be refunded (within 14 days)
 */
export async function checkRefundEligibility(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { email } = req.query;
    
    // SECURITY: Verify the requester owns the order
    const order = await ordersService.getById(id);
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    // If user is logged in, they must own the order
    if (userId && order.userId && order.userId !== userId) {
      res.status(403).json({ message: 'Brak dostępu do tego zamówienia' });
      return;
    }
    
    // If not logged in (guest), require matching email
    if (!userId) {
      if (!email || order.guestEmail !== email) {
        res.status(403).json({ message: 'Podaj poprawny email powiązany z zamówieniem' });
        return;
      }
    }
    
    const eligibility = await ordersService.checkRefundEligibility(id);
    
    res.status(200).json(eligibility);
  } catch (error: any) {
    console.error('Error checking refund eligibility:', error);
    res.status(500).json({ message: 'Error checking refund eligibility' });
  }
}

/**
 * Request refund by customer (with 14-day validation)
 */
export async function requestRefund(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { reason, email } = req.body;
    const userId = req.user?.userId;

    // SECURITY: Verify the requester owns the order
    const order = await ordersService.getById(id);
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    // If user is logged in, they must own the order
    if (userId && order.userId && order.userId !== userId) {
      res.status(403).json({ message: 'Brak dostępu do tego zamówienia' });
      return;
    }
    
    // If not logged in (guest), require matching email
    if (!userId) {
      if (!email || order.guestEmail !== email) {
        res.status(403).json({ message: 'Podaj poprawny email powiązany z zamówieniem' });
        return;
      }
    }

    const result = await ordersService.requestRefund(id, reason?.trim() || '');
    
    if (!result.success) {
      res.status(400).json({ message: result.error });
      return;
    }
    
    res.status(200).json({ 
      success: true,
      refundNumber: result.refundNumber,
      returnAddress: result.returnAddress,
      order: result.order,
    });
  } catch (error: any) {
    console.error('Error requesting refund:', error);
    res.status(500).json({ message: 'Error requesting refund' });
  }
}

/**
 * Refund order (admin)
 */
export async function refundOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const order = await ordersService.refund(id, reason);
    
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    res.status(200).json({ message: 'Order refunded successfully', order });
  } catch (error: any) {
    console.error('Error refunding order:', error);
    res.status(400).json({ message: error.message || 'Error refunding order' });
  }
}

/**
 * Restore cancelled/refunded order
 */
export async function restoreOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const order = await ordersService.restore(id);
    
    if (!order) {
      res.status(404).json({ message: 'Zam�wienie nie zostalo znalezione' });
      return;
    }
    
    res.status(200).json({ message: 'Order restored successfully', order });
  } catch (error: any) {
    console.error('Error restoring order:', error);
    res.status(400).json({ message: error.message || 'Error restoring order' });
  }
}

/**
 * Simulate payment for development/testing
 * Only works in development environment
 */
export async function simulatePayment(req: Request, res: Response): Promise<void> {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ message: 'Payment simulation not available in production' });
      return;
    }

    const { id } = req.params;
    
    // Validate ID format
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!cuidRegex.test(id)) {
      res.status(400).json({ message: 'Invalid order ID format' });
      return;
    }
    
    const order = await ordersService.simulatePayment(id);
    
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    res.status(200).json({ 
      message: 'Payment simulated successfully', 
      order,
      paymentStatus: 'PAID',
      orderStatus: order.status
    });
  } catch (error: any) {
    console.error('Error simulating payment:', error);
    res.status(400).json({ message: error.message || 'Error simulating payment' });
  }
}

/**
 * Get order tracking info from BaseLinker
 * @route GET /api/orders/:id/tracking
 */
export async function getOrderTracking(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Validate ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!uuidRegex.test(id) && !cuidRegex.test(id)) {
      res.status(400).json({ message: 'Invalid order ID format' });
      return;
    }
    
    const trackingInfo = await ordersService.getTrackingInfo(id);
    
    if (!trackingInfo) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    res.status(200).json(trackingInfo);
  } catch (error: any) {
    console.error('Error fetching order tracking:', error);
    res.status(500).json({ message: error.message || 'Error fetching tracking info' });
  }
}

/**
 * Update tracking number manually (admin)
 * @route PATCH /api/orders/:id/tracking
 */
export async function updateTrackingNumber(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { trackingNumber } = req.body;

    if (typeof trackingNumber !== 'string') {
      res.status(400).json({ message: 'Numer przesyłki jest wymagany' });
      return;
    }

    const trimmed = trackingNumber.trim();

    // Check order exists
    const order = await prisma.order.findUnique({ where: { id }, select: { id: true, courierCode: true } });
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }

    // Auto-generate tracking link based on courier code
    let trackingLink: string | null = null;
    if (trimmed) {
      const courier = (order.courierCode || '').toLowerCase();
      if (courier.includes('inpost') || courier.includes('paczkomat')) {
        trackingLink = `https://inpost.pl/sledzenie-przesylek?number=${trimmed}`;
      } else if (courier.includes('dpd')) {
        trackingLink = `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${trimmed}`;
      } else if (courier.includes('dhl')) {
        trackingLink = `https://www.dhl.com/pl-pl/home/tracking/tracking-parcel.html?submit=1&tracking-id=${trimmed}`;
      } else if (courier.includes('gls')) {
        trackingLink = `https://gls-group.eu/PL/pl/sledzenie-paczek?match=${trimmed}`;
      } else if (courier.includes('ups')) {
        trackingLink = `https://www.ups.com/track?tracknum=${trimmed}`;
      } else if (courier.includes('poczt')) {
        trackingLink = `https://śledzenie.poczta-polska.pl/?numer=${trimmed}`;
      }
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        trackingNumber: trimmed || null,
        ...(trackingLink && { trackingLink }),
      },
      select: {
        id: true,
        trackingNumber: true,
        trackingLink: true,
        courierCode: true,
      },
    });

    res.status(200).json({
      success: true,
      trackingNumber: updated.trackingNumber,
      trackingLink: updated.trackingLink,
    });
  } catch (error: any) {
    console.error('Error updating tracking number:', error);
    res.status(500).json({ message: 'Błąd podczas aktualizacji numeru przesyłki' });
  }
}

/**
 * Sync delivery status for a single order (admin)
 * Triggers immediate fetch from Baselinker
 * @route POST /api/orders/:id/sync-delivery
 */
export async function syncOrderDelivery(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const result = await deliveryTrackingService.syncSingleOrder(id);
    
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error, message: result.error });
      return;
    }
    
    res.status(200).json({
      success: true,
      deliveryStatus: result.deliveryStatus,
      deliveryStatusLabel: deliveryTrackingService.getStatusLabel(result.deliveryStatus || null),
      trackingNumber: result.trackingNumber,
    });
  } catch (error: any) {
    console.error('Error syncing delivery status:', error);
    res.status(500).json({ message: error.message || 'Error syncing delivery status' });
  }
}

/**
 * Request cancellation (customer action)
 * Creates a pending cancellation request for admin approval
 * @route POST /api/orders/:id/request-cancellation
 */
export async function requestCancellation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.userId;

    // Verify ownership
    const order = await ordersService.getById(id);
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }

    if (order.userId && order.userId !== userId) {
      res.status(403).json({ message: 'Brak uprawnień do tego zamówienia' });
      return;
    }

    const result = await ordersService.requestCancellation(id, reason);

    if (!result) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }

    res.status(200).json({
      message: 'Prośba o anulowanie zamówienia została przesłana do weryfikacji.',
      pendingApproval: true,
      order: result.order,
    });
  } catch (error: any) {
    console.error('Error requesting cancellation:', error);
    res.status(400).json({ message: error.message || 'Błąd podczas składania prośby o anulowanie' });
  }
}

/**
 * Get orders pending cancellation approval (admin)
 * @route GET /api/orders/pending-cancellations
 */
export async function getPendingCancellations(req: Request, res: Response): Promise<void> {
  try {
    const orders = await ordersService.getPendingCancellations();
    res.status(200).json(orders);
  } catch (error: any) {
    console.error('Error fetching pending cancellations:', error);
    res.status(500).json({ message: error.message || 'Error fetching pending cancellations' });
  }
}

/**
 * Approve cancellation of business order (admin)
 * @route POST /api/orders/:id/approve-cancellation
 */
export async function approveCancellation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const result = await ordersService.approveCancellation(id);
    
    if (!result) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    res.status(200).json({ 
      message: 'Zamówienie zostało anulowane',
      order: result.order,
    });
  } catch (error: any) {
    console.error('Error approving cancellation:', error);
    res.status(500).json({ message: error.message || 'Error approving cancellation' });
  }
}

/**
 * Reject cancellation request (admin)
 * @route POST /api/orders/:id/reject-cancellation
 */
export async function rejectCancellation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const order = await ordersService.rejectCancellation(id, reason);
    
    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }
    
    res.status(200).json({ 
      message: 'Prośba o anulowanie została odrzucona',
      order,
    });
  } catch (error: any) {
    console.error('Error rejecting cancellation:', error);
    res.status(500).json({ message: error.message || 'Error rejecting cancellation' });
  }
}

/**
 * Soft-delete an order (move to archive)
 * @route POST /api/orders/:id/soft-delete
 */
export async function softDeleteOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const order = await ordersService.softDelete(id);

    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }

    res.status(200).json({ message: 'Zamówienie przeniesione do archiwum', order });
  } catch (error: any) {
    console.error('Error soft-deleting order:', error);
    res.status(400).json({ message: error.message || 'Error deleting order' });
  }
}

/**
 * Restore an order from archive
 * @route POST /api/orders/:id/restore-from-archive
 */
export async function restoreFromArchive(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const order = await ordersService.restoreFromArchive(id);

    if (!order) {
      res.status(404).json({ message: 'Zamówienie nie zostało znalezione' });
      return;
    }

    res.status(200).json({ message: 'Zamówienie przywrócone z archiwum', order });
  } catch (error: any) {
    console.error('Error restoring from archive:', error);
    res.status(400).json({ message: error.message || 'Error restoring order' });
  }
}

/**
 * Get all archived orders
 * @route GET /api/orders/admin/archive
 */
export async function getArchivedOrders(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, search } = req.query;
    const result = await ordersService.getArchived({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      search: search as string | undefined,
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error getting archived orders:', error);
    res.status(500).json({ message: 'Error getting archived orders' });
  }
}

/**
 * Cleanup archive (permanently delete old archived orders)
 * @route POST /api/orders/admin/archive/cleanup
 */
export async function cleanupArchive(req: Request, res: Response): Promise<void> {
  try {
    const { manual } = req.body;
    const result = await ordersService.cleanupArchive(manual === true);
    res.status(200).json({
      message: `Usunięto ${result.deleted} zamówień z archiwum`,
      ...result,
    });
  } catch (error: any) {
    console.error('Error cleaning up archive:', error);
    res.status(500).json({ message: 'Error cleaning up archive' });
  }
}

/**
 * Permanently delete specific archived orders
 * @route POST /api/orders/admin/archive/delete
 */
export async function permanentDeleteOrders(req: Request, res: Response): Promise<void> {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: 'Wymagana lista ID zamówień do usunięcia' });
      return;
    }
    const result = await ordersService.permanentDeleteOrders(ids);
    res.status(200).json({
      message: `Trwale usunięto ${result.deleted} zamówień`,
      ...result,
    });
  } catch (error: any) {
    console.error('Error permanently deleting orders:', error);
    res.status(400).json({ message: error.message || 'Error deleting orders' });
  }
}

/**
 * Generate a collective invoice for multiple orders
 * @route POST /api/orders/collective-invoice
 */
export async function generateCollectiveInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Wymagane uwierzytelnienie' });
      return;
    }

    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json({ message: 'Lista identyfikatorów zamówień jest wymagana' });
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `FVZ/${year}/${month}/`;

    const result = await prisma.$transaction(async (tx) => {
      // Find orders
      const orders = await tx.order.findMany({
        where: {
          id: { in: orderIds },
          userId,
          deletedAt: null,
        },
      });

      if (orders.length !== orderIds.length) {
        throw new Error('Niektóre zamówienia nie zostały znalezione lub nie należą do Twojego konta.');
      }

      // Validate orders
      for (const order of orders) {
        if (!order.wantInvoice) {
          throw new Error(`Zamówienie ${order.orderNumber} nie ma zaznaczonej opcji faktury.`);
        }
        if (order.paymentStatus !== 'PAID') {
          throw new Error(`Zamówienie ${order.orderNumber} nie jest opłacone.`);
        }
        if (order.collectiveInvoiceNumber) {
          throw new Error(`Zamówienie ${order.orderNumber} zostało już dodane do faktury zbiorczej ${order.collectiveInvoiceNumber}.`);
        }
      }

      // Count existing collective invoice groups in this prefix to get next index
      const groups = await tx.order.groupBy({
        by: ['collectiveInvoiceNumber'],
        where: {
          collectiveInvoiceNumber: { startsWith: prefix },
        },
      });

      const nextIndex = String(groups.length + 1).padStart(4, '0');
      const collectiveInvoiceNumber = `${prefix}${nextIndex}`;
      const collectiveInvoiceDate = now;

      // Update orders
      await tx.order.updateMany({
        where: {
          id: { in: orderIds },
        },
        data: {
          collectiveInvoiceNumber,
          collectiveInvoiceDate,
        },
      });

      return { collectiveInvoiceNumber };
    });

    res.status(200).json({ success: true, collectiveInvoiceNumber: result.collectiveInvoiceNumber });
  } catch (error: any) {
    console.error('[CollectiveInvoice] Error generating:', error);
    res.status(400).json({ message: error.message || 'Błąd podczas generowania faktury zbiorczej' });
  }
}

/**
 * Get orders for a specific collective invoice
 * @route GET /api/orders/collective-invoice/:number
 */
export async function getCollectiveInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const isAdmin = req.user?.role === 'ADMIN';
    if (!userId) {
      res.status(401).json({ message: 'Wymagane uwierzytelnienie' });
      return;
    }

    const { number } = req.params;
    if (!number) {
      res.status(400).json({ message: 'Numer faktury zbiorczej jest wymagany' });
      return;
    }

    const decodedNumber = decodeURIComponent(number);

    const orders = await prisma.order.findMany({
      where: {
        collectiveInvoiceNumber: decodedNumber,
        ...(isAdmin ? {} : { userId }),
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    tags: true,
                    images: { orderBy: { order: 'asc' }, take: 1 },
                  },
                },
              },
            },
          },
        },
        shippingAddress: true,
        billingAddress: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (orders.length === 0) {
      res.status(404).json({ message: 'Nie znaleziono zamówień dla tej faktury zbiorczej.' });
      return;
    }

    res.status(200).json(orders);
  } catch (error: any) {
    console.error('[CollectiveInvoice] Error getting:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania faktury zbiorczej' });
  }
}