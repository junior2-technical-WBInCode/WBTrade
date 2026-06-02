import { Router } from 'express';
import { createOrder, getOrder, updateOrder, deleteOrder, getAllOrders, getUserOrders, refundOrder, restoreOrder, simulatePayment, checkRefundEligibility, requestRefund, getOrderTracking, syncOrderDelivery, updateTrackingNumber, getPendingCancellations, approveCancellation, rejectCancellation, requestCancellation, softDeleteOrder, restoreFromArchive, getArchivedOrders, cleanupArchive, permanentDeleteOrders, generateCollectiveInvoice, getCollectiveInvoice } from '../controllers/orders.controller';
import { authGuard, adminOnly, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// Route to get current user's orders (must be before /:id to avoid conflicts)
router.get('/', authGuard, getUserOrders);

// Route to generate a collective invoice
router.post('/collective-invoice', authGuard, generateCollectiveInvoice);

// Route to get a collective invoice
router.get('/collective-invoice/:number', authGuard, getCollectiveInvoice);

// Route to get all orders (admin)
router.get('/admin/all', authGuard, adminOnly, getAllOrders);

// Route to get orders pending cancellation approval (admin)
router.get('/admin/pending-cancellations', authGuard, adminOnly, getPendingCancellations);

// Route to get archived (soft-deleted) orders (admin)
router.get('/admin/archive', authGuard, adminOnly, getArchivedOrders);

// Route to cleanup archived orders (admin)
router.post('/admin/archive/cleanup', authGuard, adminOnly, cleanupArchive);

// Route to permanently delete specific archived orders (admin)
router.post('/admin/archive/delete', authGuard, adminOnly, permanentDeleteOrders);

// Route to create a new order (admin only - normal orders go through /api/checkout)
router.post('/', authGuard, adminOnly, createOrder);

// Route to get order tracking info from BaseLinker
router.get('/:id/tracking', getOrderTracking);

// Route to force sync delivery status from Baselinker (admin)
router.post('/:id/sync-delivery', authGuard, adminOnly, syncOrderDelivery);

// Route to update tracking number manually (admin)
router.patch('/:id/tracking', authGuard, adminOnly, updateTrackingNumber);

// Route to get an order by ID (optionalAuth to allow guest checkout confirmation)
router.get('/:id', optionalAuth, getOrder);

// Route to update an order by ID
router.put('/:id', authGuard, adminOnly, updateOrder);

// Route to delete an order by ID
router.delete('/:id', authGuard, adminOnly, deleteOrder);

// Route to check refund eligibility (customer - requires auth or guest email verification)
router.get('/:id/refund-eligibility', optionalAuth, checkRefundEligibility);

// Route to request refund (customer - requires auth or guest email verification, validates 14-day period)
router.post('/:id/request-refund', optionalAuth, requestRefund);

// Route to request cancellation (customer - creates pending cancellation for admin approval)
router.post('/:id/request-cancellation', authGuard, requestCancellation);

// Route to refund an order (admin)
router.post('/:id/refund', authGuard, adminOnly, refundOrder);

// Route to approve cancellation of business order (admin)
router.post('/:id/approve-cancellation', authGuard, adminOnly, approveCancellation);

// Route to reject cancellation request (admin)
router.post('/:id/reject-cancellation', authGuard, adminOnly, rejectCancellation);

// Route to restore a cancelled/refunded order
router.post('/:id/restore', authGuard, adminOnly, restoreOrder);

// Route to soft-delete (archive) an order
router.post('/:id/soft-delete', authGuard, adminOnly, softDeleteOrder);

// Route to restore an order from archive
router.post('/:id/restore-from-archive', authGuard, adminOnly, restoreFromArchive);

// Route to simulate payment (development only, admin required)
router.post('/:id/simulate-payment', authGuard, adminOnly, simulatePayment);

export default router;