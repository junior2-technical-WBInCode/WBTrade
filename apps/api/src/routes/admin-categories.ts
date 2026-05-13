import { Router } from 'express';
import { prisma } from '../db';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { invalidateCategoryCache } from '../lib/cache';

const router = Router();

// All routes require admin auth
router.use(authGuard, adminOnly);

/**
 * GET /api/admin/categories
 * Get ALL categories (including inactive) with hierarchy for admin panel
 * Returns flat list with parentId for client-side tree building
 */
router.get('/', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        image: true,
        order: true,
        isActive: true,
        baselinkerCategoryId: true,
        baselinkerCategoryPath: true,
        _count: {
          select: { products: true, children: true },
        },
      },
    });

    res.json({ categories });
  } catch (error) {
    console.error('[AdminCategories] Error fetching categories:', error);
    res.status(500).json({ message: 'Błąd pobierania kategorii' });
  }
});

/**
 * PATCH /api/admin/categories/:id/visibility
 * Toggle isActive for a category (and optionally all its descendants)
 */
router.patch('/:id/visibility', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, cascade } = req.body as { isActive: boolean; cascade?: boolean };

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'Pole isActive musi być wartością boolean' });
    }

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Kategoria nie została znaleziona' });
    }

    // Collect all descendant IDs if cascade is requested
    const idsToUpdate: string[] = [id];

    if (cascade) {
      const getDescendantIds = async (parentIds: string[]): Promise<void> => {
        if (parentIds.length === 0) return;
        const children = await prisma.category.findMany({
          where: { parentId: { in: parentIds } },
          select: { id: true },
        });
        if (children.length > 0) {
          const childIds = children.map((c) => c.id);
          idsToUpdate.push(...childIds);
          await getDescendantIds(childIds);
        }
      };
      await getDescendantIds([id]);
    }

    await prisma.category.updateMany({
      where: { id: { in: idsToUpdate } },
      data: { isActive },
    });

    // Invalidate category tree cache
    try {
      await invalidateCategoryCache();
    } catch {
      // cache clear failure is non-fatal
    }

    res.json({ updated: idsToUpdate.length, ids: idsToUpdate, isActive });
  } catch (error) {
    console.error('[AdminCategories] Error updating visibility:', error);
    res.status(500).json({ message: 'Błąd aktualizacji widoczności kategorii' });
  }
});

export default router;
