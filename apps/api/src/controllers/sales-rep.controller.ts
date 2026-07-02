import { Request, Response } from 'express';
import { prisma } from '../db';
import { salesRepService, ModuleDisabledError } from '../services/sales-rep.service';
import { OrdersService } from '../services/orders.service';
import { CartService } from '../services/cart.service';
import { addressesService } from '../services/addresses.service';
import { emailService } from '../services/email.service';
import { shippingCalculatorService } from '../services/shipping-calculator.service';
import { z } from 'zod';

const ordersService = new OrdersService();
const cartService = new CartService();

function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

/** Central error handler for module-gated endpoints: maps ModuleDisabledError to 403. */
function handleModuleError(res: Response, error: any, fallbackMessage: string): void {
  if (error instanceof ModuleDisabledError) {
    res.status(403).json({ message: error.message });
    return;
  }
  console.error('[SalesRepController] Error:', error);
  res.status(error?.status || 500).json({ message: error.message || fallbackMessage });
}


// Validation schema for checkout
const repCheckoutSchema = z.object({
  discountPct: z.number().min(0).max(100), // Real cap = cfg.maxDiscountPct, enforced in the handler + attributeCommission
  customerEmail: z.string().email('Nieprawidłowy adres e-mail klienta.'),
  customerFirstName: z.string().min(1, 'Imię klienta jest wymagane.'),
  customerLastName: z.string().min(1, 'Nazwisko klienta jest wymagane.'),
  customerPhone: z.string().min(1, 'Telefon klienta jest wymagany.'),
  customerNip: z.string().min(10, 'NIP firmy klienta musi mieć min. 10 znaków.'),
  customerCompanyName: z.string().min(1, 'Nazwa firmy klienta jest wymagana.'),
  shippingMethod: z.string(),
  paymentMethod: z.string(),
  customerNotes: z.string().optional(),
  pickupPointCode: z.string().optional(),
  pickupPointAddress: z.string().optional(),
  // Address details
  street: z.string().min(1, 'Ulica jest wymagana.'),
  city: z.string().min(1, 'Miasto jest wymagane.'),
  postalCode: z.string().min(1, 'Kod pocztowy jest wymagany.'),
  country: z.string().default('PL'),
  // Different billing address (optional B2B)
  differentBillingAddress: z.boolean().default(false),
  billingStreet: z.string().optional(),
  billingCity: z.string().optional(),
  billingPostalCode: z.string().optional(),
  billingCountry: z.string().optional(),
  packageShipping: z.any().optional(), // Server-recalculated
});

export class SalesControllerRep {
  /**
   * POST /api/sales-rep/checkout
   * Checkout endpoint for merchants
   */
  async checkout(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;

      // Validate inputs
      const validation = repCheckoutSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          message: 'Błąd walidacji danych.',
          errors: validation.error.flatten().fieldErrors 
        });
        return;
      }

      const data = validation.data;

      // Get configuration settings
      const cfg = await salesRepService.getSalesRepConfig();
      if (data.discountPct > cfg.maxDiscountPct) {
        res.status(400).json({ 
          message: `Maksymalny rabat handlowca wynosi ${cfg.maxDiscountPct}%. Przesłano: ${data.discountPct}%.` 
        });
        return;
      }

      // Fetch sales rep's cart (impersonation - merchant uses their own cart)
      const cart = await cartService.getOrCreateCart(salesRepId);
      if (!cart || !cart.items.length) {
        res.status(400).json({ message: 'Twój koszyk handlowca jest pusty.' });
        return;
      }

      // Check if any product is outlet/promo (not allowed for merchant sales rep)
      for (const item of cart.items) {
        const fullVariant = await prisma.productVariant.findUnique({
          where: { id: item.variant.id },
          include: { product: true }
        });
        if (fullVariant) {
          const isPromo = await salesRepService.isOutletOrPromoProduct({
            baselinkerProductId: fullVariant.product.baselinkerProductId,
            compareAtPrice: fullVariant.compareAtPrice ?? fullVariant.product.compareAtPrice,
            price: fullVariant.price ?? fullVariant.product.price,
          });
          if (isPromo) {
            res.status(400).json({
              message: `Produkt "${fullVariant.product.name}" jest produktem outletowym/promocyjnym i nie może być sprzedawany w ramach oferty handlowej.`
            });
            return;
          }
        }
      }

      // Calculate totals
      const items = cart.items.map((item) => ({
        variantId: item.variant.id,
        quantity: item.quantity,
        unitPrice: Number(item.variant.price),
      }));

      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      // Shipping cost calculation
      let shippingCost = 0;
      let enrichedPackageShipping: any[] = [];

      const cartItemsForShipping = cart.items.map(item => ({
        variantId: item.variant.id,
        quantity: item.quantity,
      }));
      
      const serverShippingResult = await shippingCalculatorService.getShippingOptionsPerPackage(cartItemsForShipping, {
        isB2b: true,
        cartSubtotal: subtotal,
      });
      const serverPackages = serverShippingResult.packagesWithOptions;

      // Map frontend shipping method to system method key
      let selectedSystemMethod = 'dpd_kurier';
      if (data.shippingMethod === 'inpost_paczkomaty') {
        selectedSystemMethod = 'inpost_paczkomat';
      } else if (data.shippingMethod === 'b2b_wysylka_wlasna') {
        selectedSystemMethod = 'b2b_wysylka_wlasna';
      }

      // Group cart items by wholesaler for enrichment
      const itemsByWholesaler = {};
      for (const cartItem of cart.items) {
        const wholesaler = cartItem.variant?.product?.wholesaler || 'default';
        if (!itemsByWholesaler[wholesaler]) {
          itemsByWholesaler[wholesaler] = [];
        }
        itemsByWholesaler[wholesaler].push(cartItem);
      }

      let b2bCharged = false;
      enrichedPackageShipping = serverPackages.map((serverPkg, index) => {
        const method = serverPkg.shippingMethods.find(m => m.id === selectedSystemMethod && m.available)
          || serverPkg.shippingMethods.find(m => m.available)
          || serverPkg.shippingMethods[0];

        let price = method ? method.price : 0;
        // B2B free shipping rules for self shipment
        if (method && method.id === 'b2b_wysylka_wlasna') {
          if (b2bCharged) {
            price = 0;
          } else {
            b2bCharged = true;
          }
        }

        const wholesaler = serverPkg.package.wholesaler || 'default';
        const matchedItems = itemsByWholesaler[wholesaler] || [];

        const pkgItems = matchedItems.map((item) => ({
          productId: item.variant?.product?.id || '',
          productName: item.variant?.product?.name || 'Unknown',
          variantId: item.variant?.id || '',
          variantName: item.variant?.name || 'Default',
          quantity: item.quantity,
          image: item.variant?.product?.images?.[0]?.url || null,
        }));

        shippingCost += price;

        return {
          packageId: serverPkg.package.id,
          wholesaler,
          method: method ? method.id : selectedSystemMethod,
          price,
          items: pkgItems,
        };
      });

      // Check if customer already has a user account by email
      const customerUser = await prisma.user.findUnique({
        where: { email: data.customerEmail }
      });
      const orderUserId = customerUser ? customerUser.id : undefined;

      // Create shipping and billing addresses
      const shippingAddress = await addressesService.create({
        userId: orderUserId,
        firstName: data.customerFirstName,
        lastName: data.customerLastName,
        street: data.street,
        city: data.city,
        postalCode: data.postalCode,
        country: data.country,
        phone: data.customerPhone,
        type: 'SHIPPING',
        label: 'Handlowiec - Dostawa',
      });

      let billingAddressId = shippingAddress.id;
      if (data.differentBillingAddress && data.billingStreet && data.billingCity && data.billingPostalCode) {
        const billingAddress = await addressesService.create({
          userId: orderUserId,
          firstName: data.customerFirstName,
          lastName: data.customerLastName,
          companyName: data.customerCompanyName,
          nip: data.customerNip,
          street: data.billingStreet,
          city: data.billingCity,
          postalCode: data.billingPostalCode,
          country: data.billingCountry || 'PL',
          phone: data.customerPhone,
          type: 'BILLING',
          label: 'Handlowiec - Rozliczenie',
        });
        billingAddressId = billingAddress.id;
      }

      // Create order
      const order = await ordersService.create({
        userId: orderUserId,
        shippingAddressId: shippingAddress.id,
        billingAddressId: billingAddressId,
        shippingMethod: data.shippingMethod,
        paymentMethod: data.paymentMethod,
        items,
        customerNotes: data.customerNotes,
        paczkomatCode: data.pickupPointCode,
        paczkomatAddress: data.pickupPointAddress,
        packageShipping: enrichedPackageShipping,
        shippingCost,
        discount: 0, // Will be set during attributeCommission
        wantInvoice: true, // Merchant orders always want B2B invoices
        billingNip: data.customerNip,
        billingCompanyName: data.customerCompanyName,
        guestEmail: data.customerEmail,
        guestFirstName: data.customerFirstName,
        guestLastName: data.customerLastName,
        guestPhone: data.customerPhone,
        buyerIp: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || undefined,
        isSalesRepOrder: true,
      });

      // Clear merchant's cart
      await cartService.clearCart(cart.id);

      // Attribute commission in transaction database context
      await prisma.$transaction(async (tx) => {
        await salesRepService.attributeCommission(tx, order.id, salesRepId, data.discountPct);
      });

      // Load updated order total and commission details for email
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { salesRepCommission: true }
      });

      const total = Number(updatedOrder?.total ?? subtotal + shippingCost);
      const commissionAmount = Number(updatedOrder?.salesRepCommission?.commissionAmount ?? 0);
      const discountAmount = Number(updatedOrder?.discount ?? 0);

      // Pozycje produktowe do maila ofertowego (klient widzi co zamawia)
      const emailItems = cart.items.map((item) => ({
        name: item.variant.name && item.variant.name !== item.variant.product.name
          ? `${item.variant.product.name} — ${item.variant.name}`
          : item.variant.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.variant.price),
        imageUrl: item.variant?.product?.images?.[0]?.url ?? null,
      }));

      // Podsumowanie kwoty przed/po rabacie + dostawa — ten sam widok co handlowiec
      // widzi w kroku 2 kreatora oferty (bez informacji o jego prowizji).
      const priceBreakdown = { subtotal, discountAmount, shippingCost };

      // Send payment email to customer based on payment method
      const isOnlinePayment = data.paymentMethod === 'payu' || data.paymentMethod === 'imoje' || data.paymentMethod === 'blik' || data.paymentMethod === 'card';

      if (isOnlinePayment) {
        // Send email with PayU/online payment link
        await emailService.sendPaymentLinkEmail(
          data.customerEmail,
          `${data.customerFirstName} ${data.customerLastName}`,
          order.orderNumber,
          order.id,
          total,
          emailItems,
          priceBreakdown
        ).catch(err => console.error('[SalesRepController] Error sending payment link email:', err));
      } else {
        // Send email with bank transfer details
        await emailService.sendBankTransferDetailsEmail(
          data.customerEmail,
          `${data.customerFirstName} ${data.customerLastName}`,
          order.orderNumber,
          total,
          emailItems,
          priceBreakdown
        ).catch(err => console.error('[SalesRepController] Error sending bank transfer email:', err));
      }

      // Return details to handlowiec — NO paymentUrl, NO PayU session, and NO orderId.
      // orderId is withheld so the rep cannot reconstruct /order/{id}/payment and pay the
      // client's order themselves (the payment link must reach only the client by email).
      res.json({
        success: true,
        orderNumber: order.orderNumber,
        status: 'created',
        paymentMethod: data.paymentMethod,
        total,
        commissionPreview: commissionAmount,
      });

    } catch (error: any) {
      console.error('[SalesRepController] Checkout error:', error);
      res.status(500).json({ message: error.message || 'Wystąpił błąd podczas finalizacji zamówienia handlowego.' });
    }
  }

  /**
   * GET /api/sales-rep/commissions
   * List sales rep's commissions
   */
  async getCommissions(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const commissions = await prisma.salesRepCommission.findMany({
        where: { salesRepId },
        include: {
          order: {
            select: {
              orderNumber: true,
              total: true,
              status: true,
              paymentStatus: true,
              createdAt: true,
              billingCompanyName: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      const total = await prisma.salesRepCommission.count({ where: { salesRepId } });

      res.json({
        success: true,
        commissions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: any) {
      console.error('[SalesRepController] Error fetching commissions:', error);
      res.status(500).json({ message: 'Nie udało się pobrać listy prowizji.' });
    }
  }

  /**
   * GET /api/sales-rep/balance
   * Get sales rep balance metrics
   */
  async getBalance(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const balance = await salesRepService.computeBalance(salesRepId);
      res.json({ success: true, balance });
    } catch (error: any) {
      console.error('[SalesRepController] Error fetching balance:', error);
      res.status(500).json({ message: 'Nie udało się pobrać salda konta.' });
    }
  }

  /**
   * POST /api/sales-rep/payouts
   * Create payout request (uploads invoice)
   */
  async requestPayout(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const { amount, invoiceUrl } = req.body;

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        res.status(400).json({ message: 'Kwota wypłaty musi być liczbą większą niż 0.' });
        return;
      }
      if (!invoiceUrl) {
        res.status(400).json({ message: 'Link do faktury jest wymagany.' });
        return;
      }

      const payout = await salesRepService.requestPayout(salesRepId, Number(amount), invoiceUrl);

      res.json({
        success: true,
        message: 'Wniosek o wypłatę został złożony pomyślnie.',
        payout,
      });
    } catch (error: any) {
      console.error('[SalesRepController] Error requesting payout:', error);
      res.status(500).json({ message: error.message || 'Błąd składania wniosku o wypłatę.' });
    }
  }

  /**
   * GET /api/sales-rep/cart
   * Get merchant's cart items with cost and margin breakdown
   */
  async getCart(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const cart = await cartService.getOrCreateCart(salesRepId);
      if (!cart) {
        res.json({ success: true, items: [], subtotal: 0, purchaseTotal: 0, marginTotal: 0, marginTotalPct: 0 });
        return;
      }

      // Fetch database purchase prices for each item
      const itemsWithCosts = await Promise.all(
        cart.items.map(async (item) => {
          const variant = await prisma.productVariant.findUnique({
            where: { id: item.variant.id },
            include: { product: true },
          });

          const price = Number(item.variant.price);
          const purchasePrice = Number(variant?.purchasePrice ?? variant?.product.purchasePrice ?? 0);
          
          const config = await salesRepService.getSalesRepConfig();
          const effectivePurchasePrice = purchasePrice > 0 
            ? purchasePrice 
            : price / config.markupMultiplier;

          const margin = price - effectivePurchasePrice;
          const marginPct = price > 0 ? (margin / price) * 100 : 0;

          // Outlet/promo items are rejected at checkout and excluded from the
          // commission/discount base — flag them so the preview matches the order.
          const isOutletPromo = variant
            ? await salesRepService.isOutletOrPromoProduct({
                baselinkerProductId: variant.product.baselinkerProductId,
                compareAtPrice: variant.compareAtPrice ?? variant.product.compareAtPrice,
                price: variant.price ?? variant.product.price,
              })
            : false;

          return {
            id: item.id,
            productId: item.variant.product.id,
            productName: item.variant.product.name,
            variantId: item.variant.id,
            variantName: item.variant.name,
            quantity: item.quantity,
            price,
            purchasePrice: effectivePurchasePrice,
            margin,
            marginPct,
            isOutletPromo,
            image: item.variant.product.images?.[0]?.url || null,
          };
        })
      );

      // Subtotal = all items (what the client pays). purchaseTotal (the discount/commission
      // base preview) EXCLUDES outlet/promo, matching attributeCommission on the backend.
      const subtotal = itemsWithCosts.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const purchaseTotalAll = itemsWithCosts.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0);
      const purchaseTotal = itemsWithCosts.reduce(
        (sum, item) => sum + (item.isOutletPromo ? 0 : item.purchasePrice * item.quantity),
        0
      );
      // Margin shown to the rep is the real margin across ALL items.
      const marginTotal = subtotal - purchaseTotalAll;
      const marginTotalPct = subtotal > 0 ? (marginTotal / subtotal) * 100 : 0;

      res.json({
        success: true,
        items: itemsWithCosts,
        subtotal,
        purchaseTotal,
        marginTotal,
        marginTotalPct,
      });
    } catch (error: any) {
      console.error('[SalesRepController] Error getting rep cart:', error);
      res.status(500).json({ message: 'Błąd pobierania koszyka handlowego.' });
    }
  }

  /**
   * GET /api/sales-rep/config
   * Commission thresholds for the rep panel (slider max + pool), from admin config.
   */
  async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      const cfg = await salesRepService.getSalesRepConfig();
      res.json({
        success: true,
        maxDiscountPct: cfg.maxDiscountPct,
        baseCommissionPct: cfg.baseCommissionPct,
        pool: cfg.baseCommissionPct + cfg.maxDiscountPct,
        modules: cfg.modules,
      });
    } catch (error: any) {
      console.error('[SalesRepController] Error getting rep config:', error);
      res.status(500).json({ message: 'Błąd pobierania konfiguracji.' });
    }
  }

  // ---------------------------------------------------------------------
  // Moduł: Szablony ofert
  // ---------------------------------------------------------------------

  async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const templates = await salesRepService.listOfferTemplates(salesRepId);
      res.json({ success: true, templates });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się pobrać szablonów ofert.');
    }
  }

  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const { name, discountPct } = req.body;

      if (typeof name !== 'string' || typeof discountPct !== 'number') {
        res.status(400).json({ message: 'Nazwa szablonu i rabat (%) są wymagane.' });
        return;
      }

      // Snapshot the rep's current cart into the template (not client-supplied items,
      // so the template always reflects what's actually verified/priced server-side).
      const cart = await cartService.getOrCreateCart(salesRepId);
      if (!cart.items.length) {
        res.status(400).json({ message: 'Koszyk jest pusty — dodaj produkty przed zapisaniem szablonu.' });
        return;
      }
      const items = cart.items.map((item) => ({
        variantId: item.variant.id,
        quantity: item.quantity,
        productName: item.variant.product.name,
        variantName: item.variant.name,
      }));

      const template = await salesRepService.createOfferTemplate(salesRepId, name, discountPct, items);
      res.json({ success: true, template });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się zapisać szablonu oferty.');
    }
  }

  async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const { id } = req.params;
      await salesRepService.deleteOfferTemplate(salesRepId, id);
      res.json({ success: true, message: 'Szablon został usunięty.' });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się usunąć szablonu.');
    }
  }

  async loadTemplate(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const { id } = req.params;
      const result = await salesRepService.loadOfferTemplateIntoCart(salesRepId, id);
      res.json({ success: true, ...result });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się wczytać szablonu do koszyka.');
    }
  }

  // ---------------------------------------------------------------------
  // Moduł: Śledzenie ofert
  // ---------------------------------------------------------------------

  async getOffers(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await salesRepService.listOffers(salesRepId, page, limit);
      res.json({ success: true, ...result });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się pobrać listy ofert.');
    }
  }

  async remindOffer(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const { id } = req.params;

      const order = await salesRepService.canRemindOffer(salesRepId, id);

      const total = Number(order.total);
      const isOnlinePayment = ['payu', 'imoje', 'blik', 'card'].includes(order.paymentMethod);
      const customerName = `${order.guestFirstName || ''} ${order.guestLastName || ''}`.trim() || 'Kliencie';
      const customerEmail = order.guestEmail;

      if (!customerEmail) {
        res.status(400).json({ message: 'Zamówienie nie ma przypisanego adresu e-mail klienta.' });
        return;
      }

      if (isOnlinePayment) {
        await emailService.sendPaymentLinkEmail(customerEmail, customerName, order.orderNumber, order.id, total);
      } else {
        await emailService.sendBankTransferDetailsEmail(customerEmail, customerName, order.orderNumber, total);
      }

      await salesRepService.markOfferReminded(order.id);

      res.json({ success: true, message: 'Przypomnienie zostało wysłane do klienta.' });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się wysłać przypomnienia.');
    }
  }

  // ---------------------------------------------------------------------
  // Moduł: Cele i ranking
  // ---------------------------------------------------------------------

  async getGoalProgress(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const progress = await salesRepService.getGoalProgress(salesRepId);
      res.json({ success: true, ...progress });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się pobrać postępu realizacji celu.');
    }
  }

  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const salesRepId = req.user!.userId;
      const leaderboard = await salesRepService.getLeaderboard(salesRepId);
      res.json({ success: true, leaderboard });
    } catch (error: any) {
      handleModuleError(res, error, 'Nie udało się pobrać rankingu.');
    }
  }
}

export const salesRepController = new SalesControllerRep();
