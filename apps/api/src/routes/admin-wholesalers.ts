import { Router, Request, Response } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { prisma } from '../db';
import { wholesalerConfigService } from '../services/wholesaler-config.service';

const router = Router();

// All admin routes require auth + admin role
router.use(authGuard, adminOnly);

// GET /api/admin/wholesalers - List all wholesalers
router.get('/', async (_req: Request, res: Response) => {
  try {
    const wholesalers = await wholesalerConfigService.getAllIncludingInactive();
    res.json(wholesalers);
  } catch (err) {
    console.error('[Wholesalers] List error:', err);
    res.status(500).json({ message: 'Błąd pobierania hurtowni' });
  }
});

// GET /api/admin/wholesalers/:id - Get single wholesaler
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: req.params.id },
    });
    if (!wholesaler) {
      return res.status(404).json({ message: 'Hurtownia nie znaleziona' });
    }
    res.json(wholesaler);
  } catch (err) {
    console.error('[Wholesalers] Get error:', err);
    res.status(500).json({ message: 'Błąd pobierania hurtowni' });
  }
});

// POST /api/admin/wholesalers - Create new wholesaler
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      key, name, baselinkerInventoryId, prefix, skuPrefix,
      location, hideLocation, warehouseDisplayName, aliases, color,
      isActive, skipInSync, hasPriceRules, sortOrder,
    } = req.body;

    if (!key || !name) {
      return res.status(400).json({ message: 'Klucz (key) i nazwa (name) są wymagane' });
    }

    // Validate key format (lowercase, alphanumeric, hyphens)
    if (!/^[a-z0-9-]+$/.test(key)) {
      return res.status(400).json({ message: 'Klucz może zawierać tylko małe litery, cyfry i myślniki' });
    }

    // Check uniqueness
    const existing = await prisma.wholesaler.findFirst({
      where: {
        OR: [
          { key },
          ...(prefix ? [{ prefix }] : []),
          ...(baselinkerInventoryId ? [{ baselinkerInventoryId }] : []),
        ],
      },
    });

    if (existing) {
      if (existing.key === key) {
        return res.status(409).json({ message: `Hurtownia z kluczem "${key}" już istnieje` });
      }
      if (prefix && existing.prefix === prefix) {
        return res.status(409).json({ message: `Hurtownia z prefiksem "${prefix}" już istnieje` });
      }
      if (baselinkerInventoryId && existing.baselinkerInventoryId === baselinkerInventoryId) {
        return res.status(409).json({ message: `Hurtownia z Baselinker ID "${baselinkerInventoryId}" już istnieje` });
      }
    }

    const wholesaler = await prisma.wholesaler.create({
      data: {
        key: key.toLowerCase(),
        name,
        baselinkerInventoryId: baselinkerInventoryId || null,
        prefix: prefix || '',
        skuPrefix: skuPrefix || null,
        location: location || null,
        hideLocation: hideLocation === true,
        warehouseDisplayName: warehouseDisplayName || null,
        aliases: aliases || [],
        color: color || '#6b7280',
        isActive: isActive !== false,
        skipInSync: skipInSync === true,
        hasPriceRules: hasPriceRules === true,
        sortOrder: sortOrder || 0,
      },
    });

    // Auto-create price rules entry if hasPriceRules is true
    if (hasPriceRules) {
      const settingsKey = `price_rules_${key.toLowerCase()}`;
      const existingSetting = await prisma.settings.findUnique({
        where: { key: settingsKey },
      });
      if (!existingSetting) {
        const defaultRules = [
          { priceFrom: 0, priceTo: 35, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 35.01, priceTo: 100, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 100.01, priceTo: 200, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 200.01, priceTo: 500, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 500.01, priceTo: 1000, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 1000.01, priceTo: 100000, multiplier: 1.0, addToPrice: 0 },
        ];
        await prisma.settings.create({
          data: { key: settingsKey, value: JSON.stringify(defaultRules) },
        });
      }
    }

    wholesalerConfigService.invalidateCache();
    res.status(201).json(wholesaler);
  } catch (err) {
    console.error('[Wholesalers] Create error:', err);
    res.status(500).json({ message: 'Błąd tworzenia hurtowni' });
  }
});

// PUT /api/admin/wholesalers/:id - Update wholesaler
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      key, name, baselinkerInventoryId, prefix, skuPrefix,
      location, hideLocation, warehouseDisplayName, aliases, color,
      isActive, skipInSync, hasPriceRules, sortOrder,
    } = req.body;

    const existing = await prisma.wholesaler.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Hurtownia nie znaleziona' });
    }

    // Check uniqueness for changed fields
    if (key && key !== existing.key) {
      const conflict = await prisma.wholesaler.findUnique({ where: { key } });
      if (conflict) {
        return res.status(409).json({ message: `Hurtownia z kluczem "${key}" już istnieje` });
      }
    }
    if (baselinkerInventoryId && baselinkerInventoryId !== existing.baselinkerInventoryId) {
      const conflict = await prisma.wholesaler.findUnique({ where: { baselinkerInventoryId } });
      if (conflict) {
        return res.status(409).json({ message: `Hurtownia z Baselinker ID "${baselinkerInventoryId}" już istnieje` });
      }
    }
    if (prefix && prefix !== existing.prefix) {
      const conflict = await prisma.wholesaler.findFirst({ where: { prefix, id: { not: id } } });
      if (conflict) {
        return res.status(409).json({ message: `Hurtownia z prefiksem "${prefix}" już istnieje` });
      }
    }

    const wholesaler = await prisma.wholesaler.update({
      where: { id },
      data: {
        ...(key !== undefined && { key: key.toLowerCase() }),
        ...(name !== undefined && { name }),
        ...(baselinkerInventoryId !== undefined && { baselinkerInventoryId: baselinkerInventoryId || null }),
        ...(prefix !== undefined && { prefix }),
        ...(skuPrefix !== undefined && { skuPrefix: skuPrefix || null }),
        ...(location !== undefined && { location: location || null }),
        ...(hideLocation !== undefined && { hideLocation: hideLocation === true }),
        ...(warehouseDisplayName !== undefined && { warehouseDisplayName: warehouseDisplayName || null }),
        ...(aliases !== undefined && { aliases }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive }),
        ...(skipInSync !== undefined && { skipInSync }),
        ...(hasPriceRules !== undefined && { hasPriceRules }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    // Auto-create price rules if hasPriceRules was just enabled
    if (hasPriceRules && !existing.hasPriceRules) {
      const settingsKey = `price_rules_${(key || existing.key).toLowerCase()}`;
      const existingSetting = await prisma.settings.findUnique({ where: { key: settingsKey } });
      if (!existingSetting) {
        const defaultRules = [
          { priceFrom: 0, priceTo: 35, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 35.01, priceTo: 100, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 100.01, priceTo: 200, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 200.01, priceTo: 500, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 500.01, priceTo: 1000, multiplier: 1.0, addToPrice: 0 },
          { priceFrom: 1000.01, priceTo: 100000, multiplier: 1.0, addToPrice: 0 },
        ];
        await prisma.settings.create({
          data: { key: settingsKey, value: JSON.stringify(defaultRules) },
        });
      }
    }

    wholesalerConfigService.invalidateCache();
    res.json(wholesaler);
  } catch (err) {
    console.error('[Wholesalers] Update error:', err);
    res.status(500).json({ message: 'Błąd aktualizacji hurtowni' });
  }
});

// DELETE /api/admin/wholesalers/:id - Soft delete (set isActive=false)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.wholesaler.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: 'Hurtownia nie znaleziona' });
    }

    await prisma.wholesaler.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    wholesalerConfigService.invalidateCache();
    res.json({ message: 'Hurtownia dezaktywowana' });
  } catch (err) {
    console.error('[Wholesalers] Delete error:', err);
    res.status(500).json({ message: 'Błąd usuwania hurtowni' });
  }
});

export default router;
