import { Router, Request, Response } from 'express';
import { authGuard, adminOnly } from '../middleware/auth.middleware';
import { prisma } from '../db';

const router = Router();

router.use(authGuard, adminOnly);

// ──────────────── STATS / DASHBOARD ────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [totalLocations, activeLocations, totalInventoryRows, lowStockCount, movements7d] =
      await Promise.all([
        prisma.location.count(),
        prisma.location.count({ where: { isActive: true } }),
        prisma.inventory.count(),
        prisma.inventory.count({ where: { quantity: { lte: prisma.inventory.fields?.minimum as any } } })
          .catch(() =>
            // fallback: raw query for quantity <= minimum
            prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM inventory WHERE quantity <= minimum`.then(
              (r) => Number(r[0].count)
            )
          ),
        prisma.stockMovement.count({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        }),
      ]);

    const stockAgg = await prisma.inventory.aggregate({
      _sum: { quantity: true, reserved: true },
    });

    res.json({
      totalLocations,
      activeLocations,
      totalInventoryRows,
      lowStockCount,
      movements7d,
      totalQuantity: stockAgg._sum.quantity || 0,
      totalReserved: stockAgg._sum.reserved || 0,
    });
  } catch (error) {
    console.error('Warehouse stats error:', error);
    res.status(500).json({ error: 'Błąd pobierania statystyk magazynu' });
  }
});

// ──────────────── INVENTORY (stan magazynowy) ────────────────

router.get('/inventory', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const search = (req.query.search as string) || '';
    const locationId = req.query.locationId as string;
    const lowStock = req.query.lowStock === 'true';

    const where: any = {};

    if (locationId) where.locationId = locationId;
    if (lowStock) {
      // quantity <= minimum — use raw fallback if Prisma can't do column compare
    }

    if (search) {
      where.variant = {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { product: { name: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          variant: {
            include: {
              product: { select: { id: true, name: true, slug: true, images: { take: 1, select: { url: true } } } },
            },
          },
          location: { select: { id: true, name: true, code: true, type: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventory.count({ where }),
    ]);

    // If lowStock requested, filter in JS (Prisma can't compare two columns)
    let filtered = items;
    if (lowStock) {
      filtered = items.filter((i) => i.quantity <= i.minimum);
    }

    res.json({
      items: lowStock ? filtered : items,
      pagination: {
        page,
        limit,
        total: lowStock ? filtered.length : total,
        totalPages: Math.ceil((lowStock ? filtered.length : total) / limit),
      },
    });
  } catch (error) {
    console.error('Inventory list error:', error);
    res.status(500).json({ error: 'Błąd pobierania stanów magazynowych' });
  }
});

// PUT /inventory/:id — aktualizuj ilości
router.put('/inventory/:id', async (req: Request, res: Response) => {
  try {
    const { quantity, reserved, minimum } = req.body;
    const updated = await prisma.inventory.update({
      where: { id: req.params.id },
      data: {
        ...(quantity !== undefined && { quantity: parseInt(quantity) }),
        ...(reserved !== undefined && { reserved: parseInt(reserved) }),
        ...(minimum !== undefined && { minimum: parseInt(minimum) }),
      },
      include: {
        variant: { include: { product: { select: { name: true } } } },
        location: { select: { name: true, code: true } },
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Inventory update error:', error);
    res.status(500).json({ error: 'Błąd aktualizacji stanu' });
  }
});

// ──────────────── STOCK MOVEMENTS (ruchy magazynowe) ────────────────

router.get('/movements', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const type = req.query.type as string;
    const search = (req.query.search as string) || '';
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;

    const where: any = {};
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { variant: { sku: { contains: search, mode: 'insensitive' } } },
        { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          variant: {
            include: {
              product: { select: { name: true } },
            },
          },
          fromLocation: { select: { name: true, code: true } },
          toLocation: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    res.json({
      movements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Stock movements error:', error);
    res.status(500).json({ error: 'Błąd pobierania ruchów magazynowych' });
  }
});

// POST /movements — nowy ruch magazynowy
router.post('/movements', async (req: Request, res: Response) => {
  try {
    const { variantId, type, quantity, fromLocationId, toLocationId, reference, notes } = req.body;

    if (!variantId || !type || !quantity) {
      return res.status(400).json({ error: 'variantId, type i quantity są wymagane' });
    }

    const movement = await prisma.$transaction(async (tx) => {
      const qty = parseInt(quantity);
      let movementQty = qty;
      let adjustmentNotes = notes || null;

      if (type === 'ADJUST' && toLocationId) {
        const current = await tx.inventory.findUnique({
          where: { variantId_locationId: { variantId, locationId: toLocationId } }
        });
        const oldQty = current?.quantity || 0;
        movementQty = qty - oldQty;
        if (!adjustmentNotes) {
          adjustmentNotes = `Korekta stanu z ${oldQty} do ${qty}`;
        }
      }

      // Create the movement record
      const mov = await tx.stockMovement.create({
        data: {
          variantId,
          type,
          quantity: movementQty,
          fromLocationId: fromLocationId || null,
          toLocationId: toLocationId || null,
          reference: reference || null,
          notes: adjustmentNotes,
          createdBy: (req as any).user?.id || null,
        },
      });

      // Update inventory based on movement type
      if (type === 'RECEIVE' && toLocationId) {
        await tx.inventory.upsert({
          where: { variantId_locationId: { variantId, locationId: toLocationId } },
          update: { quantity: { increment: qty } },
          create: { variantId, locationId: toLocationId, quantity: qty },
        });
      } else if (type === 'SHIP' && fromLocationId) {
        await tx.inventory.update({
          where: { variantId_locationId: { variantId, locationId: fromLocationId } },
          data: { quantity: { decrement: qty } },
        });
      } else if (type === 'TRANSFER' && fromLocationId && toLocationId) {
        await tx.inventory.update({
          where: { variantId_locationId: { variantId, locationId: fromLocationId } },
          data: { quantity: { decrement: qty } },
        });
        await tx.inventory.upsert({
          where: { variantId_locationId: { variantId, locationId: toLocationId } },
          update: { quantity: { increment: qty } },
          create: { variantId, locationId: toLocationId, quantity: qty },
        });
      } else if (type === 'ADJUST' && toLocationId) {
        await tx.inventory.upsert({
          where: { variantId_locationId: { variantId, locationId: toLocationId } },
          update: { quantity: qty },
          create: { variantId, locationId: toLocationId, quantity: qty },
        });
      } else if (type === 'RESERVE' && fromLocationId) {
        await tx.inventory.update({
          where: { variantId_locationId: { variantId, locationId: fromLocationId } },
          data: { reserved: { increment: qty } },
        });
      } else if (type === 'RELEASE' && fromLocationId) {
        await tx.inventory.update({
          where: { variantId_locationId: { variantId, locationId: fromLocationId } },
          data: { reserved: { decrement: qty } },
        });
      }

      return mov;
    });

    res.status(201).json(movement);
  } catch (error) {
    console.error('Create movement error:', error);
    res.status(500).json({ error: 'Błąd tworzenia ruchu magazynowego' });
  }
});

// ──────────────── LOCATIONS (lokalizacje) ────────────────

router.get('/locations', async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const where: any = {};
    if (!includeInactive) where.isActive = true;

    const locations = await prisma.location.findMany({
      where,
      include: {
        _count: { select: { inventory: true, children: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(locations);
  } catch (error) {
    console.error('Locations error:', error);
    res.status(500).json({ error: 'Błąd pobierania lokalizacji' });
  }
});

router.post('/locations', async (req: Request, res: Response) => {
  try {
    const { name, code, isActive } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'name i code są wymagane' });
    }

    const existing = await prisma.location.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: 'Magazyn o tym kodzie już istnieje' });
    }

    const location = await prisma.location.create({
      data: {
        name,
        code,
        type: 'WAREHOUSE',
        parentId: null,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(location);
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Błąd tworzenia magazynu' });
  }
});

router.put('/locations/:id', async (req: Request, res: Response) => {
  try {
    const { name, code, isActive } = req.body;
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(code && { code }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(location);
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Błąd aktualizacji magazynu' });
  }
});

router.delete('/locations/:id', async (req: Request, res: Response) => {
  try {
    // Check for inventory
    const invCount = await prisma.inventory.count({ where: { locationId: req.params.id } });
    if (invCount > 0) {
      return res.status(400).json({ error: 'Nie można usunąć magazynu z przypisanym stanem magazynowym' });
    }
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Błąd usuwania lokalizacji' });
  }
});

// ──────────────── SKU PREFIXES (prefiksy SKU) ────────────────

router.get('/sku-prefixes', async (_req: Request, res: Response) => {
  try {
    // Get all unique SKU prefixes (part before the first "-")
    const variants = await prisma.productVariant.findMany({
      select: { sku: true },
      where: { sku: { not: '' } },
    });

    const prefixMap: Record<string, number> = {};
    for (const v of variants) {
      if (!v.sku) continue;
      const dashIdx = v.sku.indexOf('-');
      if (dashIdx > 0) {
        const prefix = v.sku.substring(0, dashIdx + 1); // e.g. "HP-", "leker-"
        prefixMap[prefix] = (prefixMap[prefix] || 0) + 1;
      }
    }

    const prefixes = Object.entries(prefixMap)
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count);

    res.json(prefixes);
  } catch (error) {
    console.error('SKU prefixes error:', error);
    res.status(500).json({ error: 'Błąd pobierania prefiksów SKU' });
  }
});

// ──────────────── BULK TRANSFER PREVIEW ────────────────

router.get('/bulk-transfer/preview', async (req: Request, res: Response) => {
  try {
    const skuPrefix = req.query.skuPrefix as string;
    const fromLocationId = req.query.fromLocationId as string;

    if (!skuPrefix || !fromLocationId) {
      return res.status(400).json({ error: 'skuPrefix i fromLocationId są wymagane' });
    }

    // Find all inventory items at the source location whose SKU starts with the given prefix
    const items = await prisma.inventory.findMany({
      where: {
        locationId: fromLocationId,
        quantity: { gt: 0 },
        variant: {
          sku: { startsWith: skuPrefix, mode: 'insensitive' },
        },
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, images: { take: 1, select: { url: true } } },
            },
          },
        },
        location: { select: { id: true, name: true, code: true } },
      },
      orderBy: { variant: { sku: 'asc' } },
    });

    res.json({
      items: items.map((inv) => ({
        inventoryId: inv.id,
        variantId: inv.variantId,
        sku: inv.variant.sku,
        variantName: inv.variant.name,
        productName: inv.variant.product.name,
        productImage: inv.variant.product.images?.[0]?.url || null,
        quantity: inv.quantity,
        reserved: inv.reserved,
        available: inv.quantity - inv.reserved,
      })),
      totalItems: items.length,
      totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
      totalAvailable: items.reduce((sum, i) => sum + (i.quantity - i.reserved), 0),
    });
  } catch (error) {
    console.error('Bulk transfer preview error:', error);
    res.status(500).json({ error: 'Błąd podglądu transferu' });
  }
});

// ──────────────── BULK TRANSFER EXECUTE ────────────────

router.post('/bulk-transfer', async (req: Request, res: Response) => {
  try {
    const { fromLocationId, toLocationId, items, notes } = req.body as {
      fromLocationId: string;
      toLocationId: string;
      items: { variantId: string; quantity: number }[];
      notes?: string;
    };

    if (!fromLocationId || !toLocationId || !items?.length) {
      return res.status(400).json({ error: 'fromLocationId, toLocationId i items są wymagane' });
    }

    if (fromLocationId === toLocationId) {
      return res.status(400).json({ error: 'Lokalizacja źródłowa i docelowa muszą być różne' });
    }

    // Validate both locations exist
    const [fromLoc, toLoc] = await Promise.all([
      prisma.location.findUnique({ where: { id: fromLocationId } }),
      prisma.location.findUnique({ where: { id: toLocationId } }),
    ]);

    if (!fromLoc) return res.status(400).json({ error: 'Lokalizacja źródłowa nie istnieje' });
    if (!toLoc) return res.status(400).json({ error: 'Lokalizacja docelowa nie istnieje' });

    const userId = (req as any).user?.id || null;
    const reference = `BULK-${Date.now()}`;

    const results: { variantId: string; sku: string; quantity: number; status: 'ok' | 'error'; error?: string }[] = [];

    // Process each transfer in one big transaction
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        try {
          const sourceInv = await tx.inventory.findUnique({
            where: { variantId_locationId: { variantId: item.variantId, locationId: fromLocationId } },
            include: { variant: { select: { sku: true } } },
          });

          if (!sourceInv) {
            results.push({ variantId: item.variantId, sku: '?', quantity: item.quantity, status: 'error', error: 'Brak stanu w lokalizacji źródłowej' });
            continue;
          }

          const available = sourceInv.quantity - sourceInv.reserved;
          if (available < item.quantity) {
            results.push({ variantId: item.variantId, sku: sourceInv.variant.sku, quantity: item.quantity, status: 'error', error: `Dostępne: ${available}, żądane: ${item.quantity}` });
            continue;
          }

          // Decrease source
          await tx.inventory.update({
            where: { id: sourceInv.id },
            data: { quantity: { decrement: item.quantity } },
          });

          // Increase destination (upsert)
          await tx.inventory.upsert({
            where: { variantId_locationId: { variantId: item.variantId, locationId: toLocationId } },
            update: { quantity: { increment: item.quantity } },
            create: { variantId: item.variantId, locationId: toLocationId, quantity: item.quantity, reserved: 0, minimum: 0 },
          });

          // Create movement record
          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: 'TRANSFER',
              quantity: item.quantity,
              fromLocationId,
              toLocationId,
              reference,
              notes: notes || `Bulk transfer (${items.length} pozycji)`,
              createdBy: userId,
            },
          });

          results.push({ variantId: item.variantId, sku: sourceInv.variant.sku, quantity: item.quantity, status: 'ok' });
        } catch (err) {
          results.push({ variantId: item.variantId, sku: '?', quantity: item.quantity, status: 'error', error: (err as Error).message });
        }
      }
    });

    const successCount = results.filter((r) => r.status === 'ok').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    res.json({
      reference,
      totalItems: items.length,
      success: successCount,
      errors: errorCount,
      results,
    });
  } catch (error) {
    console.error('Bulk transfer error:', error);
    res.status(500).json({ error: 'Błąd masowego transferu' });
  }
});

export default router;
