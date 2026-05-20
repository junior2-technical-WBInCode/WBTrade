import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authGuard } from '../middleware/auth.middleware';
import { prisma } from '../db';

const router = Router();

// Ensure labels directory exists
const labelsDir = path.join(__dirname, '../../uploads/labels');
if (!fs.existsSync(labelsDir)) {
  fs.mkdirSync(labelsDir, { recursive: true });
}

// Storage for label files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, labelsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Allow PDF and common image formats for shipping labels
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Dozwolone formaty: PDF, JPEG, PNG, WebP'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

/**
 * POST /api/b2b-labels/:orderId
 * Upload a shipping label for a B2B order (user must own the order)
 */
router.post('/:orderId', authGuard, upload.single('label'), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;

    if (!req.file) {
      res.status(400).json({ error: 'Nie przesłano pliku' });
      return;
    }

    // Verify order belongs to user and uses B2B shipping
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, shippingMethod: true, b2bShippingLabel: true },
    });

    if (!order) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: 'Zamówienie nie znalezione' });
      return;
    }

    if (order.shippingMethod !== 'b2b_wysylka_wlasna') {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'To zamówienie nie korzysta z wysyłki własnej B2B' });
      return;
    }

    // Remove old label file if exists
    if (order.b2bShippingLabel) {
      const oldPath = path.join(labelsDir, order.b2bShippingLabel);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Save filename to order
    await prisma.order.update({
      where: { id: orderId },
      data: { b2bShippingLabel: req.file.filename },
    });

    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
    });
  } catch (error) {
    console.error('Error uploading B2B label:', error);
    res.status(500).json({ error: 'Nie udało się przesłać etykiety' });
  }
});

/**
 * GET /api/b2b-labels/:orderId
 * Download the shipping label for a B2B order
 * Accessible by order owner OR admin
 */
router.get('/:orderId', authGuard, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin can download any label, user can only download their own
    const where = userRole === 'ADMIN'
      ? { id: orderId }
      : { id: orderId, userId };

    const order = await prisma.order.findFirst({
      where,
      select: { id: true, b2bShippingLabel: true, orderNumber: true },
    });

    if (!order || !order.b2bShippingLabel) {
      res.status(404).json({ error: 'Etykieta nie znaleziona' });
      return;
    }

    const filePath = path.join(labelsDir, order.b2bShippingLabel);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Plik etykiety nie istnieje' });
      return;
    }

    const ext = path.extname(order.b2bShippingLabel).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`;
    const downloadName = `etykieta-${order.orderNumber}${ext}`;

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${downloadName}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading B2B label:', error);
    res.status(500).json({ error: 'Nie udało się pobrać etykiety' });
  }
});

/**
 * DELETE /api/b2b-labels/:orderId
 * Remove the shipping label (user can remove their own)
 */
router.delete('/:orderId', authGuard, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, b2bShippingLabel: true },
    });

    if (!order || !order.b2bShippingLabel) {
      res.status(404).json({ error: 'Etykieta nie znaleziona' });
      return;
    }

    const filePath = path.join(labelsDir, order.b2bShippingLabel);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { b2bShippingLabel: null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting B2B label:', error);
    res.status(500).json({ error: 'Nie udało się usunąć etykiety' });
  }
});

export default router;
