/**
 * Fakturownia integration for collective (zbiorcze) VAT invoices.
 *
 * This service creates a REAL VAT invoice via the Fakturownia API for a batch of
 * paid orders belonging to the same customer, and lets the customer download the
 * resulting PDF afterwards. Fakturownia handles legal numbering and KSeF submission
 * on its own - we never generate a homemade invoice document ourselves.
 *
 * IMPORTANT: Every call to `createCollectiveInvoice` creates a real, numbered VAT
 * invoice on the connected Fakturownia account (and, depending on account settings,
 * may be forwarded to KSeF). Only call this from an explicit, user-initiated action.
 */

import { prisma } from '../db';

interface FakturowniaPosition {
  name: string;
  quantity: number;
  quantity_unit: string;
  price_gross: number;
  total_price_gross: number;
  tax: string;
  product_id: null;
}

interface CreateCollectiveInvoiceResult {
  success: boolean;
  fakturowniaId?: number;
  invoiceNumber?: string;
  error?: string;
}

interface FetchInvoicePdfResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

function getFakturowniaConfig(): { apiToken: string; domain: string } | null {
  const apiToken = process.env.FAKTUROWNIA_API_TOKEN;
  const domain = process.env.FAKTUROWNIA_DOMAIN || 'wb-partners';
  if (!apiToken) {
    console.warn('[Fakturownia] FAKTUROWNIA_API_TOKEN not set, skipping');
    return null;
  }
  return { apiToken, domain };
}

function mapPaymentMethodFakturownia(method: string): string {
  const map: Record<string, string> = {
    payu: 'Płatność z góry',
    przelewy24: 'Płatność z góry',
    blik: 'BLIK',
    card: 'Karta płatnicza',
    transfer: 'Przelew bankowy',
    cod: 'Płatność przy odbiorze',
  };
  return map[method?.toLowerCase()] || 'Płatność z góry';
}

/**
 * Build invoice line items from a batch of orders, applying the same grouping
 * rules used in the collective invoice preview page:
 *  - the same product (by SKU) sold at the same price across multiple orders is
 *    merged into a single position (quantities summed)
 *  - the same product sold at a different price becomes a separate position
 *  - the per-order "order handling" fee (shipping cost) is grouped the same way
 *    and shown as "Obsługa zamówień", without referencing order numbers
 */
function buildPositions(
  orders: Array<{
    shipping: unknown;
    items: Array<{ productName: string; sku: string; quantity: number; unitPrice: unknown }>;
  }>
): FakturowniaPosition[] {
  const productGroups = new Map<string, { name: string; quantity: number; price: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const price = Number(item.unitPrice);
      const key = `${item.sku}__${price.toFixed(2)}`;
      const existing = productGroups.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        productGroups.set(key, { name: item.productName, quantity: item.quantity, price });
      }
    }
  }

  const positions: FakturowniaPosition[] = Array.from(productGroups.values()).map((group) => ({
    name: group.name,
    quantity: group.quantity,
    quantity_unit: 'szt',
    price_gross: group.price,
    total_price_gross: Number((group.price * group.quantity).toFixed(2)),
    tax: '23',
    product_id: null,
  }));

  const shippingGroups = new Map<string, number>();
  for (const order of orders) {
    const shippingPrice = Number(order.shipping);
    if (shippingPrice <= 0) continue;
    const key = shippingPrice.toFixed(2);
    shippingGroups.set(key, (shippingGroups.get(key) || 0) + 1);
  }

  for (const [priceKey, quantity] of shippingGroups) {
    positions.push({
      name: 'Obsługa zamówień',
      quantity,
      quantity_unit: 'szt',
      price_gross: Number(priceKey),
      total_price_gross: Number((Number(priceKey) * quantity).toFixed(2)),
      tax: '23',
      product_id: null,
    });
  }

  return positions;
}

/**
 * Create a real VAT invoice (kind: 'vat') in Fakturownia covering all given orders,
 * which must all belong to the same customer. Fakturownia assigns the official
 * invoice number automatically.
 *
 * Does NOT modify any Order rows - the caller is responsible for persisting
 * `fakturowniaId` / `invoiceNumber` onto the relevant orders after success.
 */
export async function createCollectiveInvoice(orderIds: string[]): Promise<CreateCollectiveInvoiceResult> {
  const config = getFakturowniaConfig();
  if (!config) {
    return { success: false, error: 'FAKTUROWNIA_API_TOKEN not configured' };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: {
      items: true,
      shippingAddress: true,
      billingAddress: true,
      user: { select: { email: true, firstName: true, lastName: true, phone: true } },
    },
  });

  if (orders.length === 0) {
    return { success: false, error: 'No orders found' };
  }

  const first = orders[0];
  const isBusiness = first.isBusinessOrder || !!first.billingNip;
  const buyerName = isBusiness && first.billingCompanyName
    ? first.billingCompanyName
    : first.billingAddress
    ? `${first.billingAddress.firstName} ${first.billingAddress.lastName}`
    : first.user
    ? `${first.user.firstName} ${first.user.lastName}`
    : `${first.guestFirstName || ''} ${first.guestLastName || ''}`.trim();

  const buyerEmail = first.user?.email || first.guestEmail || '';
  const buyerPhone = first.shippingAddress?.phone || first.user?.phone || first.guestPhone || '';
  const addr = first.billingAddress || first.shippingAddress;

  const positions = buildPositions(orders);
  const totalGross = Number(
    positions.reduce((sum, position) => sum + position.total_price_gross, 0).toFixed(2)
  );
  const latestOrderDate = orders.reduce(
    (latest, order) => (order.createdAt > latest ? order.createdAt : latest),
    orders[0].createdAt
  );

  const invoicePayload = {
    api_token: config.apiToken,
    invoice: {
      kind: 'vat',
      number: null, // auto-number, assigned by Fakturownia
      sell_date: new Date(latestOrderDate).toISOString().slice(0, 10),
      issue_date: new Date().toISOString().slice(0, 10),
      payment_type: mapPaymentMethodFakturownia(first.paymentMethod),
      payment_to_kind: 'off',
      currency: 'PLN',
      lang: 'pl',
      buyer_name: buyerName || 'Klient',
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone,
      buyer_first_name: addr?.firstName || first.guestFirstName || '',
      buyer_last_name: addr?.lastName || first.guestLastName || '',
      buyer_street: addr?.street || '',
      buyer_post_code: addr?.postalCode || '',
      buyer_city: addr?.city || '',
      buyer_country: addr?.country || 'PL',
      buyer_tax_no: isBusiness ? first.billingNip || '' : '',
      paid: totalGross,
      paid_date: new Date().toISOString().slice(0, 10),
      status: 'paid',
      from_api: true,
      internal_note: buyerEmail,
      positions,
    },
  };

  try {
    const response = await fetch(`https://${config.domain}.fakturownia.pl/invoices.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(invoicePayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Fakturownia] Collective invoice creation failed: ${response.status} ${errText}`);
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }

    const invoice = await response.json();
    console.log(`[Fakturownia] Collective invoice created: ID ${invoice.id}, number ${invoice.number}`);

    return { success: true, fakturowniaId: invoice.id, invoiceNumber: invoice.number };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Fakturownia] Error creating collective invoice:', error);
    return { success: false, error: msg };
  }
}

/**
 * Download the PDF of an already-created Fakturownia invoice. The API token
 * never leaves the backend - callers should stream this buffer to the client.
 */
export async function fetchInvoicePdf(fakturowniaId: number): Promise<FetchInvoicePdfResult> {
  const config = getFakturowniaConfig();
  if (!config) {
    return { success: false, error: 'FAKTUROWNIA_API_TOKEN not configured' };
  }

  try {
    const url = `https://${config.domain}.fakturownia.pl/invoices/${fakturowniaId}.pdf?api_token=${config.apiToken}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Fakturownia] PDF download failed for invoice ${fakturowniaId}: ${response.status} ${errText}`);
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { success: true, buffer: Buffer.from(arrayBuffer) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Fakturownia] Error downloading invoice PDF:', error);
    return { success: false, error: msg };
  }
}
