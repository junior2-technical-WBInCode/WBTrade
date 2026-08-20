jest.mock('../../db', () => ({
  prisma: {
    settings: { findUnique: jest.fn(), upsert: jest.fn() },
    product: { findMany: jest.fn(), update: jest.fn() },
    productVariant: { findMany: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../services/wholesaler-config.service', () => ({
  wholesalerConfigService: { getByKey: jest.fn() },
}));

jest.mock('../../services/price-history.service', () => ({
  priceHistoryService: {
    updateProductPrice: jest.fn(),
    updateVariantPrice: jest.fn(),
  },
}));

jest.mock('../../lib/queue', () => ({
  queueProductIndex: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { prisma } from '../../db';
import { queueProductIndex } from '../../lib/queue';
import { priceHistoryService } from '../../services/price-history.service';
import { wholesalerConfigService } from '../../services/wholesaler-config.service';
import { feedPriceSyncService } from '../../services/feed-price-sync.service';

// DoFirmy exports every pack size as a separate offer with a unique Kod_produktu
// but the SAME EAN. Regression test for the 2026-08 incidents where EAN-keyed
// matching gave single units the price of the last multipack offer in the feed.
const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<offers version="1">
  <o id="1" price="2.89" avail="1"><name><![CDATA[Rekawice 1 para]]></name>
    <attrs>
      <a name="Kod_produktu"><![CDATA[5907522992156]]></a>
      <a name="EAN"><![CDATA[5907522992156]]></a>
    </attrs>
  </o>
  <o id="2" price="219.00" avail="1"><name><![CDATA[Rekawice 100 par]]></name>
    <attrs>
      <a name="Kod_produktu"><![CDATA[5907522992156-100]]></a>
      <a name="EAN"><![CDATA[5907522992156]]></a>
    </attrs>
  </o>
</offers>`;

const dbProduct = (id: string, sku: string, price: number) => ({
  id,
  sku,
  barcode: '5907522992156',
  price,
  compareAtPrice: null,
  purchasePrice: null,
  name: sku,
});

describe('feed-price-sync dofirmy EAN collision', () => {
  let feedPath: string;

  beforeAll(() => {
    feedPath = path.join(os.tmpdir(), 'dofirmy-test-feed.xml');
    fs.writeFileSync(feedPath, FEED_XML, 'utf-8');
  });

  afterAll(() => {
    fs.unlinkSync(feedPath);
  });

  beforeEach(() => {
    // jest.config.js has resetMocks: true, so implementations must be set here
    (queueProductIndex as jest.Mock).mockResolvedValue(undefined);
    (wholesalerConfigService.getByKey as jest.Mock).mockResolvedValue({
      key: 'dofirmy',
      prefix: 'dofirmy-',
      skuPrefix: 'DOFIRMY-',
    });
    (prisma.settings.findUnique as jest.Mock).mockResolvedValue({
      value: JSON.stringify([
        { priceFrom: 0, priceTo: 4, multiplier: 1.35, addToPrice: 4 },
        { priceFrom: 4.01, priceTo: 100000, multiplier: 1.35, addToPrice: 0 },
      ]),
    });
    (prisma.productVariant.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('prices each pack size from its own Kod_produktu offer, not the shared EAN', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([
      dbProduct('p1', 'DOFIRMY-5907522992156', 644.99), // single unit, currently wrong
      dbProduct('p2', 'DOFIRMY-5907522992156-100', 644.99), // 100-pack, currently wrong
    ]);

    const result = await feedPriceSyncService.syncWholesaler({
      wholesalerKey: 'dofirmy',
      feedUrlOrPath: feedPath,
    });

    expect(result.errors).toEqual([]);
    expect(result.matched).toBe(2);

    const calls = (priceHistoryService.updateProductPrice as jest.Mock).mock.calls;
    const priceById = Object.fromEntries(calls.map((c: any[]) => [c[0].productId, c[0].newPrice]));
    // single unit: 2.89 * 1.35 + 4 = 7.90 -> 7.99 (NOT the 100-pack's 219-based price)
    expect(priceById['p1']).toBe(7.99);
    // 100-pack: 219.00 * 1.35 = 295.65 -> 295.99
    expect(priceById['p2']).toBe(295.99);
  });
});
