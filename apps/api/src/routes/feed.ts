import { Router, Request, Response } from 'express';
import { streamGoogleMerchantFeed, streamFilteredGoogleMerchantFeed, generateGoogleMerchantFeed, getFeedStats } from '../services/google-feed.service';
import { streamFaviFeed } from '../services/favi-feed.service';
import { streamCampaignFeed, getCampaignKeys } from '../services/campaign-feed.service';
import { streamCeneoFeed } from '../services/ceneo-feed.service';
import { streamB2bXmlFeed, streamB2bCsvFeed } from '../services/b2b-feed.service';
import { getB2bUserInfo } from '../services/b2b-pricing.service';
import { authGuard, adminOnly } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/feed/google
 * Returns Google Merchant Center XML feed (streaming)
 * Public endpoint - accessible by Google bots
 */
router.get('/google', async (req: Request, res: Response) => {
  try {
    // Determine base URL from request or environment
    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() 
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'X-Robots-Tag': 'noindex', // Don't index the feed itself
      'Transfer-Encoding': 'chunked',
    });

    await streamGoogleMerchantFeed(baseUrl, res);
  } catch (error) {
    console.error('Error generating Google feed:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/google/stats
 * Returns feed statistics (admin only)
 */
router.get('/google/stats', authGuard, adminOnly, async (req: Request, res: Response) => {
  try {
    const stats = await getFeedStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting feed stats:', error);
    res.status(500).json({ 
      error: 'Failed to get feed stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/feed/google.xml
 * Alternative URL with .xml extension (streaming)
 */
router.get('/google.xml', async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() 
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamGoogleMerchantFeed(baseUrl, res);
  } catch (error) {
    console.error('Error generating Google feed:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/filtered.xml?categories=slug1,slug2
 * Filtered Google feed — only products from specified categories (and their subcategories)
 * Example: /api/feed/filtered.xml?categories=chemia,agd
 */
router.get('/filtered.xml', async (req: Request, res: Response) => {
  try {
    const categoriesParam = req.query.categories;
    if (!categoriesParam || typeof categoriesParam !== 'string') {
      res.status(400).json({ error: 'Missing required query parameter: categories (comma-separated slugs)' });
      return;
    }

    const categorySlugs = categoriesParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 50); // limit to 50 categories for safety

    if (categorySlugs.length === 0) {
      res.status(400).json({ error: 'No valid category slugs provided' });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamFilteredGoogleMerchantFeed(baseUrl, res, categorySlugs);
  } catch (error) {
    console.error('Error generating filtered feed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate filtered feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/favi
 * Returns FAVI-compatible Google-format XML feed (streaming)
 * Public endpoint
 */
router.get('/favi', async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamFaviFeed(baseUrl, res);
  } catch (error) {
    console.error('Error generating FAVI feed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate FAVI feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/favi.xml
 * Alternative URL with .xml extension
 */
router.get('/favi.xml', async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamFaviFeed(baseUrl, res);
  } catch (error) {
    console.error('Error generating FAVI feed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate FAVI feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/campaign/:key
 * Campaign-specific feed by key (caloroczna, gastronomia, ogrod, sport)
 * Public endpoint - accessible by Google bots
 */
router.get('/campaign/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const validKeys = getCampaignKeys();
    if (!validKeys.includes(key)) {
      res.status(404).json({ error: `Unknown campaign. Valid keys: ${validKeys.join(', ')}` });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamCampaignFeed(key, baseUrl, res);
  } catch (error) {
    console.error('Error generating campaign feed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate campaign feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/ceneo
 * Ceneo XML feed with recalculated prices (multiplier 1.1 instead of 1.35)
 * Public endpoint
 */
router.get('/ceneo', async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamCeneoFeed(baseUrl, res);
  } catch (error) {
    console.error('Error generating Ceneo feed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate Ceneo feed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/feed/b2b/xml
 * B2B XML feed with user-specific pricing
 * Requires authentication + approved B2B status
 */
router.get('/b2b/xml', authGuard, async (req: Request, res: Response) => {
  try {
    const b2bInfo = await getB2bUserInfo(req.user!.userId);
    if (!b2bInfo) {
      res.status(403).json({ error: 'Dostęp tylko dla zatwierdzonych partnerów B2B' });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamB2bXmlFeed(baseUrl, b2bInfo.multiplier, res);
  } catch (error) {
    console.error('Error generating B2B XML feed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Nie udało się wygenerować feedu B2B' });
    }
  }
});

/**
 * GET /api/feed/b2b/csv
 * B2B CSV feed with user-specific pricing
 * Requires authentication + approved B2B status
 */
router.get('/b2b/csv', authGuard, async (req: Request, res: Response) => {
  try {
    const b2bInfo = await getB2bUserInfo(req.user!.userId);
    if (!b2bInfo) {
      res.status(403).json({ error: 'Dostęp tylko dla zatwierdzonych partnerów B2B' });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim()
      || `${req.protocol}://${req.get('host')}`;

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="b2b-products.csv"',
      'Cache-Control': 'private, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Transfer-Encoding': 'chunked',
    });

    await streamB2bCsvFeed(baseUrl, b2bInfo.multiplier, res);
  } catch (error) {
    console.error('Error generating B2B CSV feed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Nie udało się wygenerować feedu B2B' });
    }
  }
});

export default router;
