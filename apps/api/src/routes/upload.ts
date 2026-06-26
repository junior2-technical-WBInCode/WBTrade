import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authGuard } from '../middleware/auth.middleware';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

// File filter - only images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Nieprawidłowy format pliku. Dozwolone: JPEG, PNG, GIF, WebP'));
  }
};

// Multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 10 // Max 10 files at once
  }
});

// Upload single image
router.post('/image', authGuard, upload.single('image'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Brak pliku' });
    }

    const baseUrl = process.env.API_URL || `http://localhost:${process.env.APP_PORT || 5000}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Błąd podczas przesyłania pliku' });
  }
});

// Upload multiple images
router.post('/images', authGuard, upload.array('images', 10), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Brak plików' });
    }

    const baseUrl = process.env.API_URL || `http://localhost:${process.env.APP_PORT || 5000}`;
    
    const uploadedFiles = files.map(file => ({
      url: `${baseUrl}/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size
    }));

    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Błąd podczas przesyłania plików' });
  }
});

// Configure PDF upload for invoices (up to 10MB)
const invoiceUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Nieprawidłowy format pliku. Dozwolone są tylko pliki PDF.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  }
});

// Upload PDF invoice (for partners)
router.post('/invoice', authGuard, invoiceUpload.single('invoice'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Brak pliku' });
    }

    const baseUrl = process.env.API_URL || `http://localhost:${process.env.APP_PORT || 5000}`;
    const invoiceUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      url: invoiceUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Invoice upload error:', error);
    res.status(500).json({ message: 'Błąd podczas przesyłania faktury' });
  }
});

// Delete uploaded file
router.delete('/:filename', authGuard, (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    // Prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(uploadsDir, sanitizedFilename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Plik nie znaleziony' });
    }

    fs.unlinkSync(filePath);
    
    res.json({ success: true, message: 'Plik usunięty' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Błąd podczas usuwania pliku' });
  }
});

// Error handler for multer
router.use((error: Error, req: Request, res: Response, next: Function) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Plik jest za duży. Maksymalny rozmiar: 5MB' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Za dużo plików. Maksymalnie 10 plików naraz' });
    }
    return res.status(400).json({ message: error.message });
  }
  
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  
  next();
});

export default router;
