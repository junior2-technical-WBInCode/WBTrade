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

/**
 * GET /api/sales-rep/config
 * Public-to-rep commission config (pool + max discount) so the panel slider/preview
 * follow the admin-configured thresholds instead of hardcoded literals.
 */
router.get('/config', (req, res, next) => {
  salesRepController.getConfig(req, res).catch(next);
});

/**
 * Moduł: Szablony ofert (może zostać wyłączony przez admina — sales_rep_config.modules.offerTemplates)
 */
router.get('/templates', (req, res, next) => {
  salesRepController.getTemplates(req, res).catch(next);
});
router.post('/templates', (req, res, next) => {
  salesRepController.createTemplate(req, res).catch(next);
});
router.delete('/templates/:id', (req, res, next) => {
  salesRepController.deleteTemplate(req, res).catch(next);
});
router.post('/templates/:id/load', (req, res, next) => {
  salesRepController.loadTemplate(req, res).catch(next);
});

/**
 * Moduł: Śledzenie ofert (może zostać wyłączony przez admina — sales_rep_config.modules.offerTracking)
 */
router.get('/offers', (req, res, next) => {
  salesRepController.getOffers(req, res).catch(next);
});
router.post('/offers/:id/remind', (req, res, next) => {
  salesRepController.remindOffer(req, res).catch(next);
});

/**
 * Moduł: Cele i ranking (może zostać wyłączony przez admina — sales_rep_config.modules.leaderboard)
 */
router.get('/goal-progress', (req, res, next) => {
  salesRepController.getGoalProgress(req, res).catch(next);
});
router.get('/leaderboard', (req, res, next) => {
  salesRepController.getLeaderboard(req, res).catch(next);
});

export default router;
