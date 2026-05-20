import { Request, Response } from 'express';
import { baselinkerService } from '../services/baselinker.service';

/**
 * GET /api/admin/invoices
 * Fetches list of invoices from Baselinker (works with any connected invoicing system:
 * Fakturownia, inFakt, wFirma, etc.)
 * Query params: date_from (ISO date), series_id (optional)
 */
export async function getInvoices(req: Request, res: Response) {
  try {
    const dateFrom = req.query.date_from
      ? Math.floor(new Date(req.query.date_from as string).getTime() / 1000)
      : undefined;
    const seriesId = req.query.series_id ? parseInt(req.query.series_id as string) : undefined;

    const invoices = await baselinkerService.getInvoices({
      ...(dateFrom && { date_from: dateFrom }),
      ...(seriesId && { series_id: seriesId }),
    });

    // Map to a simpler format for the frontend
    const mapped = invoices.map((inv: any) => ({
      id: inv.invoice_id,
      number: inv.number || `${inv.year}/${inv.month}/${inv.day}/${inv.invoice_id}`,
      kind: inv.type || 'vat', // vat, proforma, receipt
      issueDate: inv.year && inv.month && inv.day
        ? `${inv.year}-${String(inv.month).padStart(2, '0')}-${String(inv.day).padStart(2, '0')}`
        : null,
      totalGross: inv.total_price_brutto ? parseFloat(inv.total_price_brutto) : null,
      currency: inv.currency || 'PLN',
      buyerName: inv.invoice_fullname || '',
      buyerNip: inv.invoice_nip || null,
      orderId: inv.order_id || null,
      externalInvoiceNumber: inv.external_invoice_number || null,
    }));

    return res.json({
      invoices: mapped,
      total: mapped.length,
    });
  } catch (error: any) {
    console.error('[Invoices] Error fetching invoices from Baselinker:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
}
