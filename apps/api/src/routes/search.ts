import { Router } from 'express';
import { searchProducts, getSuggestions, reindexProducts, getSearchStats, getPopularSearches } from '../controllers/search.controller';
import { authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

// Route for searching products
router.get('/', searchProducts);

// Route for search suggestions (autocomplete)
router.get('/suggest', getSuggestions);

// Route for popular searches (trending)
router.get('/popular', getPopularSearches);

// Route for reindexing products to Meilisearch (admin only — full reindex is expensive)
router.post('/reindex', authGuard, adminOnly, reindexProducts);

// Route for getting Meilisearch stats
router.get('/stats', getSearchStats);

export default router;