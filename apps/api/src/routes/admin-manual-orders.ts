import { Router } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import {
  getManualOrderConfig,
  getManualOrderCategories,
  setWorkingCategory,
  getPartnerAddresses,
  getWorkingCategoryProducts,
  createManualOrder,
} from '../controllers/manual-orders.controller';

const router = Router();

// All manual-order routes require admin auth.
router.use(authGuard, adminOnly);

// Config: working category + B2B partners list
router.get('/config', getManualOrderConfig);

// Category selector + persisting the working category
router.get('/categories', getManualOrderCategories);
router.put('/working-category', setWorkingCategory);

// Partner addresses
router.get('/partners/:userId/addresses', getPartnerAddresses);

// Working-category products (with B2B price for the selected partner)
router.get('/products', getWorkingCategoryProducts);

// Create the manual B2B order
router.post('/', createManualOrder);

export default router;
