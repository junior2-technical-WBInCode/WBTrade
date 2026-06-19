/**
 * Shipping Worker
 * Handles shipping label generation, tracking updates, and delivery notifications
 */

import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, queueConnection, queueEmail, ShippingJobData } from '../lib/queue';
import { prisma } from '../db';
import { ordersService } from '../services/orders.service';

// Carrier configurations (mock)
const CARRIERS = {
  inpost: {
    name: 'InPost',
    trackingUrlTemplate: 'https://inpost.pl/sledzenie-przesylek?number={trackingNumber}',
    apiUrl: 'https://api.inpost.pl/v1',
  },
  dpd: {
    name: 'DPD',
    trackingUrlTemplate: 'https://tracktrace.dpd.com.pl/parcelDetails?p1={trackingNumber}',
    apiUrl: 'https://api.dpd.com.pl',
  },
  dhl: {
    name: 'DHL',
    trackingUrlTemplate: 'https://www.dhl.com/pl-pl/home/tracking/tracking-express.html?submit=1&tracking-id={trackingNumber}',
    apiUrl: 'https://api.dhl.com',
  },
};

type CarrierCode = keyof typeof CARRIERS;

/**
 * Generate shipping label for an order
 */
async function generateShippingLabel(
  orderId: string,
  carrier: string
): Promise<{ trackingNumber: string; labelUrl: string }> {
  console.log(`[ShippingWorker] Generating ${carrier} label for order ${orderId}`);
  
  // Get order with shipping address
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: {
        include: {
          variant: { include: { product: true } },
        },
      },
    },
  });
  
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  // TODO: In production, call actual carrier API
  // For now, generate mock tracking number
  const trackingNumber = `${carrier.toUpperCase()}${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  const labelUrl = `https://storage.wbtrade.pl/labels/${orderId}-${trackingNumber}.pdf`;
  
  // Run status progression through state machine to subtract/reserve stock
  const note = `Etykieta ${CARRIERS[carrier as CarrierCode]?.name || carrier} wygenerowana. Nr przesyłki: ${trackingNumber}`;
  await ordersService.updateStatus(orderId, 'PROCESSING', note, 'SYSTEM_SHIPPING');

  // Update order with tracking information
  await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      // shippingLabelUrl: labelUrl, // If field exists
    },
  });
  
  console.log(`[ShippingWorker] Label generated: ${trackingNumber}`);
  
  return {
    trackingNumber,
    labelUrl,
  };
}

/**
 * Track shipment status
 */
async function trackShipment(
  orderId: string,
  trackingNumber: string
): Promise<{ status: string; events: Array<{ date: Date; description: string }> }> {
  console.log(`[ShippingWorker] Tracking shipment ${trackingNumber} for order ${orderId}`);
  
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  // TODO: In production, call actual carrier API for tracking
  // Mock tracking response
  const mockStatuses = ['collected', 'in_transit', 'out_for_delivery', 'delivered'];
  const randomStatus = mockStatuses[Math.floor(Math.random() * mockStatuses.length)];
  
  const trackingEvents = [
    { date: new Date(Date.now() - 24 * 60 * 60 * 1000), description: 'Przesyłka odebrana od nadawcy' },
    { date: new Date(Date.now() - 12 * 60 * 60 * 1000), description: 'Przesyłka w sortowni' },
    { date: new Date(), description: 'Przesyłka w doręczeniu' },
  ];
  
  // If delivered, update order status and notify customer
  if (randomStatus === 'delivered') {
    await ordersService.updateStatus(orderId, 'DELIVERED', 'Przesyłka dostarczona', 'SYSTEM_SHIPPING');
    
    // Notify customer
    if (order.user) {
      await queueEmail({
        to: order.user.email,
        subject: `Przesyłka dostarczona - zamówienie #${order.orderNumber}`,
        template: 'newsletter',
        context: {
          subject: `Przesyłka dostarczona`,
          content: `
            <h1>Twoja przesyłka została dostarczona!</h1>
            <p>Zamówienie #${order.orderNumber} zostało dostarczone.</p>
            <p>Dziękujemy za zakupy w WBTrade!</p>
          `,
          textContent: `Zamówienie #${order.orderNumber} dostarczone.`,
        },
      });
    }
  }
  
  return {
    status: randomStatus,
    events: trackingEvents,
  };
}

/**
 * Send delivery notification
 */
async function notifyDelivery(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  
  if (!order || !order.user) {
    throw new Error(`Order ${orderId} or user not found`);
  }
  
  const carrierConfig = order.trackingNumber 
    ? CARRIERS[order.trackingNumber.substring(0, 5).toLowerCase() as CarrierCode]
    : null;
  
  const trackingUrl = carrierConfig && order.trackingNumber
    ? carrierConfig.trackingUrlTemplate.replace('{trackingNumber}', order.trackingNumber)
    : '';
  
  await queueEmail({
    to: order.user.email,
    subject: `Twoje zamówienie #${order.orderNumber} zostało wysłane`,
    template: 'order-shipped',
    context: {
      orderId: order.orderNumber,
      trackingNumber: order.trackingNumber,
      carrier: carrierConfig?.name || 'Kurier',
      trackingUrl,
    },
  });
  
  console.log(`[ShippingWorker] Delivery notification sent for order ${orderId}`);
}

/**
 * Create and start the shipping worker
 */
export function startShippingWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.SHIPPING,
    async (job: Job<ShippingJobData>) => {
      console.log(`[ShippingWorker] Processing job: ${job.name} (${job.id})`);
      
      const { type, orderId, carrier, trackingNumber } = job.data;
      
      switch (type) {
        case 'generate-label': {
          if (!carrier) {
            throw new Error('Carrier is required for label generation');
          }
          return await generateShippingLabel(orderId, carrier);
        }
        
        case 'track-shipment': {
          if (!trackingNumber) {
            throw new Error('Tracking number is required for tracking');
          }
          return await trackShipment(orderId, trackingNumber);
        }
        
        case 'notify-delivery': {
          await notifyDelivery(orderId);
          return { notified: true };
        }
        
        default:
          throw new Error(`Unknown shipping job type: ${type}`);
      }
    },
    {
      connection: queueConnection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[ShippingWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ShippingWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('✓ Shipping worker started');
  return worker;
}
