import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

// All routes here require authentication and administrator privileges
router.use(authGuard, adminOnly);

/**
 * GET /api/admin/price-monitoring
 * Pobiera listę wszystkich monitorowanych produktów wraz z ich danymi i ostatnim alertem.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    const monitors = await prisma.productPriceMonitor.findMany({
      include: {
        product: {
          include: {
            images: {
              select: { url: true },
              orderBy: { order: 'asc' },
              take: 1,
            },
            category: {
              select: { name: true },
            },
          },
        },
        alerts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply B2B pricing if userId is provided
    if (userId && typeof userId === 'string') {
      const { getB2bUserInfo, applyB2bPricing } = require('../services/b2b-pricing.service');
      const b2bInfo = await getB2bUserInfo(userId);
      if (b2bInfo) {
        for (const monitor of monitors) {
          if (monitor.product) {
            monitor.product = await applyB2bPricing(monitor.product, b2bInfo);
          }
        }
      }
    }

    res.json(monitors);
  } catch (error) {
    console.error('Error fetching monitored products:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania monitorowanych produktów' });
  }
});

/**
 * GET /api/admin/price-monitoring/users
 * Pobiera listę użytkowników B2B dla panelu monitorowania cen.
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'B2B_PARTNER',
        b2bStatus: 'APPROVED',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
      },
      orderBy: { email: 'asc' },
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching B2B users:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania użytkowników B2B' });
  }
});

/**
 * POST /api/admin/price-monitoring
 * Dodaje produkty do monitorowania.
 * Body: { productIds: string[] }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json({ message: 'Parametr productIds musi być niepustą tablicą.' });
      return;
    }

    const data = productIds.map((productId: string) => ({
      productId,
      alertOnIncrease: true,
      alertOnDecrease: true,
    }));

    const result = await prisma.productPriceMonitor.createMany({
      data,
      skipDuplicates: true,
    });

    res.json({
      success: true,
      message: `Pomyślnie dodano produkty do monitorowania.`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error adding products to monitor:', error);
    res.status(500).json({ message: 'Błąd podczas dodawania produktów do monitorowania' });
  }
});

/**
 * PATCH /api/admin/price-monitoring/:productId
 * Aktualizuje ustawienia alertów dla danego produktu.
 * Body: { alertOnIncrease?: boolean, alertOnDecrease?: boolean }
 */
router.patch('/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { alertOnIncrease, alertOnDecrease } = req.body;

    const monitor = await prisma.productPriceMonitor.findUnique({
      where: { productId },
    });

    if (!monitor) {
      res.status(404).json({ message: 'Ten produkt nie jest monitorowany.' });
      return;
    }

    const updated = await prisma.productPriceMonitor.update({
      where: { productId },
      data: {
        ...(alertOnIncrease !== undefined && { alertOnIncrease }),
        ...(alertOnDecrease !== undefined && { alertOnDecrease }),
      },
    });

    res.json({
      success: true,
      message: 'Ustawienia monitorowania zostały zaktualizowane.',
      monitor: updated,
    });
  } catch (error) {
    console.error('Error updating monitor settings:', error);
    res.status(500).json({ message: 'Błąd podczas aktualizowania ustawień monitorowania' });
  }
});

/**
 * DELETE /api/admin/price-monitoring/:productId
 * Usuwa produkt z monitorowania.
 */
router.delete('/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    const monitor = await prisma.productPriceMonitor.findUnique({
      where: { productId },
    });

    if (!monitor) {
      res.status(404).json({ message: 'Ten produkt nie jest monitorowany.' });
      return;
    }

    await prisma.productPriceMonitor.delete({
      where: { productId },
    });

    res.json({
      success: true,
      message: 'Produkt został usunięty z monitorowania.',
    });
  } catch (error) {
    console.error('Error deleting monitored product:', error);
    res.status(500).json({ message: 'Błąd podczas usuwania produktu z monitorowania' });
  }
});

/**
 * GET /api/admin/price-monitoring/alerts
 * Pobiera log ostatnich alertów cenowych.
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    const alerts = await prisma.productPriceAlert.findMany({
      include: {
        monitor: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                baselinkerProductId: true,
                purchasePrice: true,
                images: {
                  select: { url: true },
                  orderBy: { order: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Apply B2B pricing to alert prices if userId is provided
    if (userId && typeof userId === 'string') {
      const { getB2bUserInfo, calculateB2bPriceForProduct } = require('../services/b2b-pricing.service');
      const b2bInfo = await getB2bUserInfo(userId);
      if (b2bInfo) {
        for (const alert of alerts) {
          const product = alert.monitor?.product;
          if (product) {
            alert.oldPrice = await calculateB2bPriceForProduct(
              Number(alert.oldPrice),
              product.baselinkerProductId,
              product.sku,
              b2bInfo,
              product.purchasePrice
            ) as any;
            alert.newPrice = await calculateB2bPriceForProduct(
              Number(alert.newPrice),
              product.baselinkerProductId,
              product.sku,
              b2bInfo,
              product.purchasePrice
            ) as any;
          }
        }
      }
    }

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching price alerts:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania alertów cenowych' });
  }
});

/**
 * POST /api/admin/price-monitoring/alerts/read-all
 * Oznacza wszystkie nieprzeczytane alerty jako przeczytane.
 */
router.post('/alerts/read-all', async (req: Request, res: Response) => {
  try {
    await prisma.productPriceAlert.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true, message: 'Wszystkie alerty zostały oznaczone jako przeczytane.' });
  } catch (error) {
    console.error('Error marking alerts as read:', error);
    res.status(500).json({ message: 'Błąd podczas oznaczania alertów jako przeczytane' });
  }
});

export default router;
