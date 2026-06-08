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

// Helper to parse stored labels
function parseLabels(b2bShippingLabel: string | null | undefined): string[] {
  if (!b2bShippingLabel) return [];
  if (b2bShippingLabel.startsWith('[') && b2bShippingLabel.endsWith(']')) {
    try {
      return JSON.parse(b2bShippingLabel) as string[];
    } catch {
      return [b2bShippingLabel];
    }
  }
  return [b2bShippingLabel];
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
router.post('/:orderId', authGuard, upload.array('label', 100), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Nie przesłano plików' });
      return;
    }

    // Clean up function in case of error/rejection
    const cleanUpFiles = () => {
      for (const file of files) {
        try {
          const uploadedFilePath = path.resolve(file.path);
          if (fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath);
          }
        } catch (err) {
          console.error('Error cleaning up file:', err);
        }
      }
    };

    // Validate uploaded files paths are within labels directory
    for (const file of files) {
      const uploadedFilePath = path.resolve(file.path);
      if (!uploadedFilePath.startsWith(path.resolve(labelsDir))) {
        cleanUpFiles();
        res.status(400).json({ error: 'Nieprawidłowa ścieżka pliku' });
        return;
      }
    }

    // Verify order belongs to user and uses B2B shipping
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, shippingMethod: true, b2bShippingLabel: true },
    });

    if (!order) {
      cleanUpFiles();
      res.status(404).json({ error: 'Zamówienie nie znalezione' });
      return;
    }

    if (order.shippingMethod !== 'b2b_wysylka_wlasna') {
      cleanUpFiles();
      res.status(400).json({ error: 'To zamówienie nie korzysta z wysyłki własnej B2B' });
      return;
    }

    // Append new filenames to existing ones
    const currentLabels = parseLabels(order.b2bShippingLabel);
    const newFilenames = files.map(file => file.filename);
    const updatedLabels = [...currentLabels, ...newFilenames];

    // Save filenames to order as JSON array
    await prisma.order.update({
      where: { id: orderId },
      data: { b2bShippingLabel: JSON.stringify(updatedLabels) },
    });

    res.json({
      success: true,
      filenames: newFilenames,
    });
  } catch (error) {
    console.error('Error uploading B2B labels:', error);
    res.status(500).json({ error: 'Nie udało się przesłać etykiet' });
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

    const labels = parseLabels(order.b2bShippingLabel);
    if (labels.length === 0) {
      res.status(404).json({ error: 'Brak przypisanych etykiet' });
      return;
    }

    // Get requested filename or default to first one
    const requestedFilename = req.query.filename as string;
    let filenameToServe = labels[0];

    if (requestedFilename) {
      const match = labels.find(l => l === requestedFilename || path.basename(l) === path.basename(requestedFilename));
      if (!match) {
        res.status(404).json({ error: 'Żądana etykieta nie została znaleziona w tym zamówieniu' });
        return;
      }
      filenameToServe = match;
    }

    const sanitizedLabel = path.basename(filenameToServe);
    const filePath = path.join(labelsDir, sanitizedLabel);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Plik etykiety nie istnieje' });
      return;
    }

    const ext = path.extname(sanitizedLabel).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`;
    
    // Create download name with index or filename
    const fileIndex = labels.indexOf(filenameToServe);
    const indexSuffix = fileIndex >= 0 ? `-${fileIndex + 1}` : '';
    const downloadName = `etykieta-${order.orderNumber}${indexSuffix}${ext}`;

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

    const labels = parseLabels(order.b2bShippingLabel);
    if (labels.length === 0) {
      res.status(404).json({ error: 'Etykieta nie znaleziona' });
      return;
    }

    const requestedFilename = req.query.filename as string;

    if (requestedFilename) {
      const match = labels.find(l => l === requestedFilename || path.basename(l) === path.basename(requestedFilename));
      if (!match) {
        res.status(404).json({ error: 'Żądana etykieta nie została znaleziona w tym zamówieniu' });
        return;
      }

      // Delete physical file
      const sanitizedLabel = path.basename(match);
      const filePath = path.join(labelsDir, sanitizedLabel);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Filter out deleted filename
      const remainingLabels = labels.filter(l => l !== match);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          b2bShippingLabel: remainingLabels.length > 0 ? JSON.stringify(remainingLabels) : null
        },
      });
    } else {
      // Delete all files associated
      for (const label of labels) {
        const sanitizedLabel = path.basename(label);
        const filePath = path.join(labelsDir, sanitizedLabel);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await prisma.order.update({
        where: { id: orderId },
        data: { b2bShippingLabel: null },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting B2B label:', error);
    res.status(500).json({ error: 'Nie udało się usunąć etykiety' });
  }
});

export default router;
