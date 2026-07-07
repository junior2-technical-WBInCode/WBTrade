import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { OrdersService } from '../services/orders.service';
import { addressesService } from '../services/addresses.service';
import { b2bService } from '../services/b2b.service';
import { getB2bUserInfo, calculateB2bPriceForProduct } from '../services/b2b-pricing.service';

/**
 * Manual B2B Orders (admin)
 * ------------------------------------------------------------------
 * Allows an admin to create an order on behalf of a B2B partner for
 * products that are not yet publicly on sale. Such products live under
 * a configurable "working category" (kategoria robocza).
 *
 * The order is created through the normal OrdersService.create() flow so it:
 *  - gets a normal WB-... order number,
 *  - reserves stock,
 *  - uses server-side B2B pricing for the selected partner,
 *  - shows up in the partner's account,
 *  - is automatically forwarded to Baselinker (unpaid), where the partner
 *    then pays normally.
 */

const ordersService = new OrdersService();

/** Settings key that stores the id of the working category. */
const WORKING_CATEGORY_SETTING_KEY = 'manual_order_working_category_id';
/** Fallback category slug used when no working category is configured yet. */
const DEFAULT_WORKING_CATEGORY_SLUG = 'ukryte-b2b';

const cuidRegex = /^c[a-z0-9]{20,}$/i;

/**
 * Resolve the configured working category (by stored id, or by fallback slug).
 * Returns null if none can be found.
 */
async function resolveWorkingCategory() {
  const setting = await prisma.settings.findUnique({
    where: { key: WORKING_CATEGORY_SETTING_KEY },
  });

  if (setting?.value) {
    const byId = await prisma.category.findUnique({
      where: { id: setting.value },
      select: { id: true, name: true, slug: true },
    });
    if (byId) return byId;
  }

  // Fallback: try the default slug so the feature works out-of-the-box.
  return prisma.category.findUnique({
    where: { slug: DEFAULT_WORKING_CATEGORY_SLUG },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * GET /api/admin/manual-orders/config
 * Returns the current working category + list of B2B partners.
 */
export async function getManualOrderConfig(_req: Request, res: Response): Promise<void> {
  try {
    const [workingCategory, partners] = await Promise.all([
      resolveWorkingCategory(),
      b2bService.getPartners(),
    ]);

    res.json({
      workingCategory,
      partners: partners.map((p) => ({
        id: p.id,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        companyName: p.companyName,
        nip: p.nip,
        b2bStatus: p.b2bStatus,
      })),
    });
  } catch (error) {
    console.error('[ManualOrders] Error getting config:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania konfiguracji' });
  }
}

/**
 * GET /api/admin/manual-orders/categories
 * Flat list of categories for the working-category selector.
 */
export async function getManualOrderCategories(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await prisma.category.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (error) {
    console.error('[ManualOrders] Error getting categories:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania kategorii' });
  }
}

const setWorkingCategorySchema = z.object({
  categoryId: z.string().regex(cuidRegex, 'Nieprawidłowe ID kategorii'),
});

/**
 * PUT /api/admin/manual-orders/working-category
 * Persist the working category selection.
 */
export async function setWorkingCategory(req: Request, res: Response): Promise<void> {
  try {
    const validation = setWorkingCategorySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: 'Błąd walidacji',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { categoryId } = validation.data;
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, slug: true },
    });
    if (!category) {
      res.status(404).json({ message: 'Kategoria nie została znaleziona' });
      return;
    }

    await prisma.settings.upsert({
      where: { key: WORKING_CATEGORY_SETTING_KEY },
      update: { value: categoryId },
      create: { key: WORKING_CATEGORY_SETTING_KEY, value: categoryId },
    });

    res.json({ workingCategory: category });
  } catch (error) {
    console.error('[ManualOrders] Error setting working category:', error);
    res.status(500).json({ message: 'Błąd podczas zapisywania kategorii roboczej' });
  }
}

/**
 * GET /api/admin/manual-orders/partners/:userId/addresses
 * Saved addresses of a B2B partner.
 */
export async function getPartnerAddresses(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    if (!cuidRegex.test(userId)) {
      res.status(400).json({ message: 'Nieprawidłowe ID partnera' });
      return;
    }

    const addresses = await addressesService.getUserAddresses(userId);
    res.json(addresses);
  } catch (error) {
    console.error('[ManualOrders] Error getting partner addresses:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania adresów partnera' });
  }
}

/**
 * GET /api/admin/manual-orders/products?partnerId=&search=
 * Products from the working category that have stock available, with the
 * B2B price computed for the selected partner.
 */
export async function getWorkingCategoryProducts(req: Request, res: Response): Promise<void> {
  try {
    const workingCategory = await resolveWorkingCategory();
    if (!workingCategory) {
      res.status(400).json({
        message: 'Kategoria robocza nie jest skonfigurowana. Ustaw ją w panelu.',
        products: [],
      });
      return;
    }

    const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const b2bInfo = partnerId ? await getB2bUserInfo(partnerId) : null;

    const products = await prisma.product.findMany({
      where: {
        categoryId: workingCategory.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        sku: true,
        baselinkerProductId: true,
        purchasePrice: true,
        images: { select: { url: true }, orderBy: { order: 'asc' }, take: 1 },
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            purchasePrice: true,
            inventory: { select: { quantity: true, reserved: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 200,
    });

    // Build the response with only in-stock variants + B2B price per variant.
    const result: Array<{
      id: string;
      name: string;
      sku: string;
      image: string | null;
      variants: Array<{
        id: string;
        name: string;
        sku: string;
        storePrice: number;
        price: number;
        available: number;
      }>;
    }> = [];
    for (const product of products) {
      const variants: Array<{
        id: string;
        name: string;
        sku: string;
        storePrice: number;
        price: number;
        available: number;
      }> = [];
      for (const variant of product.variants) {
        const available = variant.inventory.reduce(
          (sum, inv) => sum + Math.max(0, inv.quantity - inv.reserved),
          0
        );
        if (available <= 0) continue;

        const storePrice = Number(variant.price);
        let b2bPrice = storePrice;
        if (b2bInfo) {
          b2bPrice = await calculateB2bPriceForProduct(
            storePrice,
            product.baselinkerProductId,
            variant.sku,
            b2bInfo,
            variant.purchasePrice ?? product.purchasePrice
          );
        }

        variants.push({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          storePrice,
          price: b2bPrice,
          available,
        });
      }

      if (variants.length === 0) continue;

      result.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        image: product.images[0]?.url || null,
        variants,
      });
    }

    res.json({ products: result });
  } catch (error) {
    console.error('[ManualOrders] Error getting working category products:', error);
    res.status(500).json({ message: 'Błąd podczas pobierania produktów' });
  }
}

const createManualOrderSchema = z.object({
  partnerId: z.string().regex(cuidRegex, 'Nieprawidłowe ID partnera'),
  shippingAddressId: z.string().regex(cuidRegex, 'Nieprawidłowe ID adresu dostawy'),
  billingAddressId: z.string().regex(cuidRegex, 'Nieprawidłowe ID adresu rozliczeniowego').optional(),
  shippingMethod: z.string().min(1).max(50),
  shippingCost: z.number().min(0).max(999999).default(0),
  paymentMethod: z.string().min(1).max(50),
  customerNotes: z.string().max(1000).optional(),
  markAsPaid: z.boolean().optional().default(false),
  items: z
    .array(
      z.object({
        variantId: z.string().regex(cuidRegex, 'Nieprawidłowe ID wariantu'),
        quantity: z.number().int().positive().max(100000),
      })
    )
    .min(1, 'Zamówienie musi mieć co najmniej jeden produkt'),
});

/**
 * POST /api/admin/manual-orders
 * Create a manual B2B order for working-category products.
 */
export async function createManualOrder(req: Request, res: Response): Promise<void> {
  try {
    const validation = createManualOrderSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: 'Błąd walidacji',
        errors: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const data = validation.data;

    // 1. Validate the partner is an active B2B partner.
    const partner = await prisma.user.findUnique({
      where: { id: data.partnerId },
      select: {
        id: true,
        role: true,
        b2bStatus: true,
        companyName: true,
        nip: true,
      },
    });
    if (!partner || partner.role !== 'B2B_PARTNER' || !['APPROVED', 'SUSPENDED'].includes(partner.b2bStatus)) {
      res.status(400).json({ message: 'Wybrany użytkownik nie jest aktywnym partnerem B2B' });
      return;
    }

    // 2. Validate the shipping/billing addresses belong to the partner.
    const shippingAddress = await addressesService.getById(data.shippingAddressId, partner.id);
    if (!shippingAddress) {
      res.status(400).json({ message: 'Adres dostawy nie należy do wybranego partnera' });
      return;
    }
    let billingAddressId = data.billingAddressId;
    if (billingAddressId) {
      const billingAddress = await addressesService.getById(billingAddressId, partner.id);
      if (!billingAddress) {
        res.status(400).json({ message: 'Adres rozliczeniowy nie należy do wybranego partnera' });
        return;
      }
    } else {
      billingAddressId = data.shippingAddressId;
    }

    // 3. Validate all products belong to the working category.
    const workingCategory = await resolveWorkingCategory();
    if (!workingCategory) {
      res.status(400).json({ message: 'Kategoria robocza nie jest skonfigurowana' });
      return;
    }

    const variantIds = data.items.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, product: { select: { categoryId: true, name: true } } },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));
    for (const item of data.items) {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        res.status(400).json({ message: `Wariant ${item.variantId} nie istnieje` });
        return;
      }
      if (variant.product.categoryId !== workingCategory.id) {
        res.status(400).json({
          message: `Produkt "${variant.product.name}" nie należy do kategorii roboczej`,
        });
        return;
      }
    }

    // 4. Create the order through the normal flow.
    //    - unitPrice is recalculated server-side (B2B price) inside OrdersService.create
    //    - stock is reserved/validated
    //    - order is auto-synced to Baselinker (unpaid), unless we mark it paid below
    const order = await ordersService.create({
      userId: partner.id,
      shippingAddressId: data.shippingAddressId,
      billingAddressId,
      shippingMethod: data.shippingMethod,
      paymentMethod: data.paymentMethod,
      shippingCost: data.shippingCost,
      items: data.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: 0, // ignored - recalculated from DB / B2B pricing
      })),
      customerNotes: data.customerNotes,
      wantInvoice: true,
      billingNip: partner.nip || undefined,
      billingCompanyName: partner.companyName || undefined,
      // When marking as paid immediately, skip the automatic "unpaid" sync so the
      // order is synced to Baselinker only once (with paid status).
      skipBaselinkerSync: data.markAsPaid,
    });

    // 5. Optionally mark the order as paid right away (payment handled offline).
    if (data.markAsPaid) {
      const paidOrder = await ordersService.markAsPaid(order.id);
      res.status(201).json(paidOrder ?? order);
      return;
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('[ManualOrders] Error creating manual order:', error);
    const message = error instanceof Error ? error.message : 'Błąd podczas tworzenia zamówienia';
    res.status(500).json({ message });
  }
}
