import { Router } from 'express';
import { getInvoices } from '../controllers/admin-invoices.controller';
import { authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

// GET /api/admin/invoices - list invoices from Fakturownia
router.get('/', authGuard, adminOnly, getInvoices);

export default router;
