import { PrismaClient } from '@prisma/client';
import { MeiliSearch } from 'meilisearch';

const prisma = new PrismaClient();

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || 'wbtrade_meili_key_change_in_production';
const PRODUCTS_INDEX = 'products';
const BATCH_SIZE = 1000;

const meiliClient = new MeiliSearch({
  host: MEILISEARCH_HOST,
  apiKey: MEILISEARCH_API_KEY,
});

interface MeiliProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  categoryId: string;
  categoryName: string;
  image: string | null;
  status: string;
  createdAt: number;
  tags: string[];
  popularityScore: number;
  inStock: boolean;
  hasBaselinkerCategory: boolean;
  categoryIsActive: boolean;
}

async function syncProductsToMeilisearch() {
  console.log('🔍 Starting Meilisearch sync...\n');

  try {
    // Check Meilisearch health
    const health = await meiliClient.health();
    console.log(`✓ Meilisearch is ${health.status}\n`);

    // Create or get index
    try {
      await meiliClient.getIndex(PRODUCTS_INDEX);
      console.log(`✓ Index "${PRODUCTS_INDEX}" exists`);
    } catch {
      console.log(`📁 Creating index "${PRODUCTS_INDEX}"...`);
      await meiliClient.createIndex(PRODUCTS_INDEX, { primaryKey: 'id' });
      console.log(`✓ Index created`);
    }

    // Configure index settings
    console.log('\n⚙️  Configuring index settings...');
    
    await meiliClient.index(PRODUCTS_INDEX).updateSearchableAttributes([
      'name',
      'sku',
      'categoryName',
      'brand',
      'tags',
    ]);

    await meiliClient.index(PRODUCTS_INDEX).updateFilterableAttributes([
      'categoryId',
      'categoryName',
      'price',
      'status',
      'brand',
      'color',
      'size',
      'material',
      'inStock',
      'hasDiscount',
      'tags',
      'hasBaselinkerCategory',
      'categoryIsActive',
    ]);

    await meiliClient.index(PRODUCTS_INDEX).updateSortableAttributes([
      'price',
      'name',
      'createdAt',
      'popularity',
      'popularityScore',
      'rating',
      'id',
    ]);

    await meiliClient.index(PRODUCTS_INDEX).updateTypoTolerance({
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 7,
        twoTypos: 9,
      },
    });

    console.log('✓ Index settings configured\n');

    // Get total product count
    const totalProducts = await prisma.product.count();
    console.log(`📦 Found ${totalProducts} products to sync\n`);

    const totalBatches = Math.ceil(totalProducts / BATCH_SIZE);
    let indexedCount = 0;

    // Process in batches
    for (let batch = 0; batch < totalBatches; batch++) {
      const products = await prisma.product.findMany({
        skip: batch * BATCH_SIZE,
        take: BATCH_SIZE,
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          category: true,
          variants: {
            include: {
              inventory: true,
            },
          },
        },
      });

      const documents: MeiliProduct[] = products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description || '',
        sku: product.sku,
        price: Number(product.price),
        compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
        categoryId: product.categoryId || '',
        categoryName: product.category?.name || '',
        image: product.images[0]?.url || null,
        status: product.status,
        createdAt: product.createdAt.getTime(),
        tags: product.tags || [],
        popularityScore: product.popularityScore || 0,
        inStock: product.variants.some(v => v.inventory.some(i => (i.quantity - i.reserved) > 0)),
        hasBaselinkerCategory: !!product.category?.baselinkerCategoryId,
        categoryIsActive: product.category?.isActive !== false,
      }));

      const task = await meiliClient.index(PRODUCTS_INDEX).addDocuments(documents);
      indexedCount += documents.length;

      const progress = ((batch + 1) / totalBatches * 100).toFixed(1);
      console.log(`  ✓ Batch ${batch + 1}/${totalBatches} (${progress}%) - ${indexedCount}/${totalProducts} products indexed (task: ${task.taskUid})`);
    }

    // Wait for indexing to complete
    console.log('\n⏳ Waiting for indexing to complete...');
    
    // Give Meilisearch some time to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check final stats
    const stats = await meiliClient.index(PRODUCTS_INDEX).getStats();
    console.log(`\n✅ Meilisearch sync completed!`);
    console.log(`   📊 Documents in index: ${stats.numberOfDocuments}`);
    console.log(`   🔄 Is indexing: ${stats.isIndexing}`);

  } catch (error) {
    console.error('\n❌ Error syncing to Meilisearch:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncProductsToMeilisearch();
