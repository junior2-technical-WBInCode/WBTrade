import { Router } from 'express';
import { authGuard, roleGuard } from '../middleware/auth.middleware';
import { salesRepController } from '../controllers/sales-rep.controller';

const router = Router();

// Secure all sales rep routes to requires login + HANDLOWIEC role
router.use(authGuard, roleGuard('HANDLOWIEC'));

/**
 * POST /api/sales-rep/checkout
 * Checkout order for client from sales rep panel
 */
router.post('/checkout', (req, res, next) => {
  salesRepController.checkout(req, res).catch(next);
});

/**
 * GET /api/sales-rep/commissions
 * Get sales rep's commission logs
 */
router.get('/commissions', (req, res, next) => {
  salesRepController.getCommissions(req, res).catch(next);
});

/**
 * GET /api/sales-rep/balance
 * Get sales rep's available and frozen balance
 */
router.get('/balance', (req, res, next) => {
  salesRepController.getBalance(req, res).catch(next);
});

/**
 * POST /api/sales-rep/payouts
 * Request a payout based on invoice upload
 */
router.post('/payouts', (req, res, next) => {
  salesRepController.requestPayout(req, res).catch(next);
});

/**
 * GET /api/sales-rep/cart
 * Get merchant's cart items with pricing, margin and cost breakdown
 */
router.get('/cart', (req, res, next) => {
  salesRepController.getCart(req, res).catch(next);
});

export default router;
