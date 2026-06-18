import { Router, Request, Response } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { TicketCategory, TicketStatus } from '@prisma/client';
import { prisma } from '../db';

const router = Router();

router.use(authGuard, adminOnly);

// ────────────────────────────────────────────────────────
// GET /api/admin/notifications
// Agreguje powiadomienia z istniejących danych:
// - Nowe zamówienia (ostatnie 24h)
// - Prośby o anulowanie (CANCELLATION_REQUESTED)
// - Niski stan magazynowy (< 5 szt)
// - Nowi użytkownicy (ostatnie 24h)
// - Zamówienia z problemami (np. zwroty, refundy)
// ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Równoległe zapytania
    const [
      newOrders,
      pendingCancellations,
      newUsers,
      refundedOrders,
      recentReviews,
      returnComplaintTickets,
      customerMessages,
      pendingDelayAlerts,
      priceAlerts,
    ] = await Promise.all([
      // Nowe zamówienia w ciągu ostatnich 24h
      prisma.order.findMany({
        where: { createdAt: { gte: last24h } },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          status: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          guestFirstName: true,
          guestLastName: true,
          guestEmail: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Zamówienia oczekujące na anulowanie (pendingCancellation flag)
      prisma.order.findMany({
        where: { pendingCancellation: true },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { firstName: true, lastName: true } },
          guestFirstName: true,
          guestLastName: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),

      // Nowi użytkownicy w ciągu ostatnich 24h
      prisma.user.findMany({
        where: { createdAt: { gte: last24h } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Zamówienia ze zwrotami/refundami (ostatnie 7 dni)
      prisma.order.findMany({
        where: {
          status: 'REFUNDED',
          updatedAt: { gte: last7d },
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          status: true,
          updatedAt: true,
          user: { select: { firstName: true, lastName: true } },
          guestFirstName: true,
          guestLastName: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),

      // Nowe recenzje (ostatnie 7 dni)
      prisma.review.findMany({
        where: { createdAt: { gte: last7d } },
        select: {
          id: true,
          rating: true,
          content: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          product: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Otwarte zwroty i reklamacje (ostatnie 7 dni)
      prisma.supportTicket.findMany({
        where: {
          category: { in: [TicketCategory.RETURN, TicketCategory.COMPLAINT] },
          status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          isArchived: false,
          createdAt: { gte: last7d },
        },
        select: {
          id: true,
          ticketNumber: true,
          returnNumber: true,
          category: true,
          subject: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          guestEmail: true,
          guestName: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Nowe wiadomości od klientów (nieprzeczytane, ostatnie 24h)
      prisma.supportMessage.findMany({
        where: {
          senderRole: 'CUSTOMER',
          isRead: false,
          createdAt: { gte: last24h },
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              subject: true,
              user: { select: { firstName: true, lastName: true } },
              guestName: true,
              guestEmail: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),

      // Pending delivery delay alerts
      prisma.deliveryDelayAlert.findMany({
        where: { status: 'pending' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              estimatedDeliveryDate: true,
              total: true,
              user: { select: { firstName: true, lastName: true } },
              guestFirstName: true,
              guestLastName: true,
            },
          },
        },
        orderBy: { detectedAt: 'desc' },
        take: 10,
      }),

      // Otwarte alerty cenowe (ostatnie 7 dni)
      prisma.productPriceAlert.findMany({
        where: {
          isRead: false,
          createdAt: { gte: last7d },
        },
        include: {
          monitor: {
            include: {
              product: {
                select: { name: true, sku: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    // Helper: get customer name (supports guest orders)
    function getCustomerName(order: { user?: { firstName: string; lastName: string } | null; guestFirstName?: string | null; guestLastName?: string | null }): string {
      if (order.user) return `${order.user.firstName} ${order.user.lastName}`;
      if (order.guestFirstName || order.guestLastName) return `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim();
      return 'Gość';
    }

    // Formatowanie powiadomień
    type Notification = {
      id: string;
      type: string;
      title: string;
      message: string;
      link: string;
      priority: 'high' | 'medium' | 'low';
      createdAt: Date;
    };

    const notifications: Notification[] = [];

    // Opóźnienia dostaw — wysoki priorytet
    pendingDelayAlerts.forEach((alert) => {
      const order = alert.order;
      const customerName = getCustomerName(order);
      const estDate = order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate).toLocaleDateString('pl-PL')
        : 'brak daty';
      notifications.push({
        id: `delay-${alert.id}`,
        type: 'delivery_delay',
        title: 'Opóźnienie dostawy',
        message: `Zamówienie #${order.orderNumber} — ${customerName} (planowana dostawa: ${estDate})`,
        link: `/delivery-delays`,
        priority: 'high',
        createdAt: alert.detectedAt,
      });
    });

    // Prośby o anulowanie — wysoki priorytet
    pendingCancellations.forEach((order) => {
      notifications.push({
        id: `cancel-${order.id}`,
        type: 'cancellation',
        title: 'Prośba o anulowanie',
        message: `Zamówienie #${order.orderNumber} — ${getCustomerName(order)} (${Number(order.total).toFixed(2)} zł)`,
        link: `/orders/${order.id}`,
        priority: 'high',
        createdAt: order.updatedAt,
      });
    });

    // Zwroty i reklamacje — wysoki priorytet
    returnComplaintTickets.forEach((ticket) => {
      const customerName = ticket.user
        ? `${ticket.user.firstName} ${ticket.user.lastName}`
        : ticket.guestName || ticket.guestEmail || 'Gość';
      const isReturn = ticket.category === 'RETURN';
      notifications.push({
        id: `return-${ticket.id}`,
        type: 'return_request',
        title: isReturn ? 'Nowy zwrot' : 'Nowa reklamacja',
        message: `${ticket.returnNumber || ticket.ticketNumber} — ${customerName}: ${ticket.subject}`,
        link: `/messages/${ticket.id}`,
        priority: 'high',
        createdAt: ticket.createdAt,
      });
    });

    // Zamówienia zwrócone/refundowane
    refundedOrders.forEach((order) => {
      notifications.push({
        id: `refund-${order.id}`,
        type: 'refund',
        title: 'Zwrot środków',
        message: `Zamówienie #${order.orderNumber} — ${Number(order.total).toFixed(2)} zł`,
        link: `/orders/${order.id}`,
        priority: 'medium',
        createdAt: order.updatedAt,
      });
    });

    // Nowe zamówienia
    newOrders.forEach((order) => {
      notifications.push({
        id: `order-${order.id}`,
        type: 'new_order',
        title: 'Nowe zamówienie',
        message: `#${order.orderNumber} — ${getCustomerName(order)} (${Number(order.total).toFixed(2)} zł)`,
        link: `/orders/${order.id}`,
        priority: 'low',
        createdAt: order.createdAt,
      });
    });

    // Nowi użytkownicy
    newUsers.forEach((u) => {
      notifications.push({
        id: `user-${u.id}`,
        type: 'new_user',
        title: 'Nowy użytkownik',
        message: `${u.firstName} ${u.lastName} (${u.email})`,
        link: `/users`,
        priority: 'low',
        createdAt: u.createdAt,
      });
    });

    // Wiadomości od klientów — średni priorytet
    customerMessages.forEach((msg) => {
      const customerName = msg.ticket.user
        ? `${msg.ticket.user.firstName} ${msg.ticket.user.lastName}`
        : msg.ticket.guestName || msg.ticket.guestEmail || 'Klient';
      const preview = msg.content.length > 60 ? msg.content.slice(0, 60) + '...' : msg.content;
      notifications.push({
        id: `msg-${msg.id}`,
        type: 'new_message',
        title: 'Nowa wiadomość',
        message: `${customerName}: ${preview}`,
        link: `/messages/${msg.ticket.id}`,
        priority: 'medium',
        createdAt: msg.createdAt,
      });
    });

    // Recenzje — informacyjne
    recentReviews.forEach((r) => {
      notifications.push({
        id: `review-${r.id}`,
        type: 'review',
        title: `Nowa recenzja (${r.rating}⭐)`,
        message: `${r.user.firstName} ${r.user.lastName} — ${r.product.name}`,
        link: `/products`,
        priority: r.rating <= 2 ? 'medium' : 'low',
        createdAt: r.createdAt,
      });
    });

    // Alerty cenowe — średni priorytet
    priceAlerts.forEach((alert) => {
      const product = alert.monitor.product;
      const oldPrice = Number(alert.oldPrice).toFixed(2);
      const newPrice = Number(alert.newPrice).toFixed(2);
      const diff = (Number(alert.newPrice) - Number(alert.oldPrice));
      const direction = diff > 0 ? 'wzrosła' : 'spadła';
      const diffFormatted = Math.abs(diff).toFixed(2);

      notifications.push({
        id: `price-alert-${alert.id}`,
        type: 'price_alert',
        title: 'Zmiana ceny produktu',
        message: `${product.name} (SKU: ${product.sku}) — cena ${direction} z ${oldPrice} zł do ${newPrice} zł (Różnica: ${diff > 0 ? '+' : '-'}${diffFormatted} zł)`,
        link: `/products/monitoring`,
        priority: 'medium',
        createdAt: alert.createdAt,
      });
    });

    // Sortuj wg priorytetu i daty
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    notifications.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Statystyki
    const summary = {
      total: notifications.length,
      high: notifications.filter((n) => n.priority === 'high').length,
      medium: notifications.filter((n) => n.priority === 'medium').length,
      low: notifications.filter((n) => n.priority === 'low').length,
      byType: {
        cancellations: pendingCancellations.length,
        deliveryDelays: pendingDelayAlerts.length,
        lowStock: 0,
        newOrders: newOrders.length,
        refunds: refundedOrders.length,
        newUsers: newUsers.length,
        reviews: recentReviews.length,
        returnRequests: returnComplaintTickets.length,
        customerMessages: customerMessages.length,
      },
    };

    res.json({ notifications: notifications.slice(0, 30), summary });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania powiadomień' });
  }
});

export default router;
