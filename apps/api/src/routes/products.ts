import { Router } from 'express';
import {
  getProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  previewManualPrices,
  deleteProduct,
  getFilters,
  getBestsellers,
  getFeatured,
  getSeasonal,
  getNewProducts,
  getMostWishlisted,
  getTopRated,
  getSameWarehouseProducts,
  getProductsByIds,
  getToys,
  getBrands,
  getBrandBySlug
} from '../controllers/products.controller';
import { reviewsController } from '../controllers/reviews.controller';
import { optionalAuth, authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

// ========================================
// PUBLIC ROUTES - No authentication required
// ========================================

// Route to get all products (with filters & pagination)
router.get('/', optionalAuth, getProducts);

// Route to get available filters for products
router.get('/filters', getFilters);

// Route to get bestsellers (based on actual sales data)
router.get('/bestsellers', optionalAuth, getBestsellers);

// Route to get featured products (admin-curated or fallback)
router.get('/featured', optionalAuth, getFeatured);

// Route to get seasonal products
router.get('/seasonal', optionalAuth, getSeasonal);

// Route to get new products (added in last 14 days)
router.get('/new-arrivals', optionalAuth, getNewProducts);

// Route to get toys carousel products (manual + automatic from toys category)
router.get('/toys', optionalAuth, getToys);

// Route to get the most wishlisted product (Product of the Day)
router.get('/most-wishlisted', optionalAuth, getMostWishlisted);

// Route to get top-rated products
router.get('/top-rated', optionalAuth, getTopRated);

// Route to get multiple products by IDs (batch - avoids N+1 requests)
router.post('/batch', optionalAuth, getProductsByIds);

// Route to get products from the same warehouse (for "Zamów w jednej przesyłce")
router.get('/same-warehouse/:productId', optionalAuth, getSameWarehouseProducts);

// Route to get all brands
router.get('/brands', getBrands);

// Route to get brand by slug
router.get('/brands/:slug', getBrandBySlug);

// Route to get a specific product by slug (SEO-friendly)
router.get('/slug/:slug', optionalAuth, getProductBySlug);

// Route to get a specific product by ID
router.get('/:id', optionalAuth, getProductById);

// Product reviews routes (public read, optional auth for can-review check)
router.get('/:productId/reviews', reviewsController.getProductReviews);
router.get('/:productId/reviews/stats', reviewsController.getProductReviewStats);
router.get('/:productId/reviews/can-review', optionalAuth, reviewsController.canUserReview);

// ========================================
// ADMIN ROUTES - Require admin authentication
// ========================================

// Route to create a new product (admin only)
router.post('/', authGuard, adminOnly, createProduct);

// Preview prices calculated from a manually entered wholesale price
router.post('/pricing-preview', authGuard, adminOnly, previewManualPrices);

// Route to update an existing product (admin only)
router.put('/:id', authGuard, adminOnly, updateProduct);

// Route to delete a product (admin only)
router.delete('/:id', authGuard, adminOnly, deleteProduct);

export default router;