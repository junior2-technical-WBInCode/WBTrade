import { Router } from 'express';
import { categoriesController } from '../controllers/categories.controller';
import { authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

// GET /api/categories - Get all categories in tree structure
router.get('/', categoriesController.getAll);

// GET /api/categories/main - Get main (root) categories only
router.get('/main', categoriesController.getMain);

// POST /api/categories - Create a new category (admin only)
router.post('/', authGuard, adminOnly, categoriesController.create);

// GET /api/categories/id/:id - Get category by ID
router.get('/id/:id', categoriesController.getById);

// PUT /api/categories/:id - Update a category (admin only)
router.put('/:id', authGuard, adminOnly, categoriesController.update);

// DELETE /api/categories/:id - Delete a category (admin only)
router.delete('/:id', authGuard, adminOnly, categoriesController.delete);

// GET /api/categories/:slug - Get category by slug
router.get('/:slug', categoriesController.getBySlug);

// GET /api/categories/:slug/path - Get category breadcrumb path
router.get('/:slug/path', categoriesController.getPath);

export default router;
