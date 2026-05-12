/**
 * Skrypt synchronizacji kategorii produktów z Baselinker
 * 
 * Pobiera kategorie z 3 magazynów (HP, LEKER, BTP),
 * tworzy drzewko kategorii z uwzględnieniem separatora "|"
 * i aktualizuje istniejące kategorie w bazie danych.
 * 
 * Użycie: npx tsx src/scripts/sync-categories.ts [--test] [--dry-run] [--limit N]
 * 
 * Opcje:
 *   --test     Tryb testowy (10 produktów)
 *   --dry-run  Tylko symulacja, bez zmian w bazie
 *   --limit N  Limit produktów do przetworzenia
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';

// Konfiguracja magazynów do synchronizacji (bez IKONKA)
const WAREHOUSE_CONFIG = {
  hp: {
    prefix: 'hp-',
    skuPrefix: 'HP-',
    inventoryId: null as string | null, // Zostanie uzupełnione automatycznie
    name: 'HP',
  },
  leker: {
    prefix: 'leker-',
    skuPrefix: 'LEKER-',
    inventoryId: null as string | null,
    name: 'LEKER',
  },
  btp: {
    prefix: 'btp-',
    skuPrefix: 'BTP-',
    inventoryId: null as string | null,
    name: 'BTP',
  },
};

// Mapa polskich znaków do ASCII
const polishCharsMap: Record<string, string> = {
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
  'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
  'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
  'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
};

function slugify(text: string): string {
  let result = text.toString();
  for (const [polish, ascii] of Object.entries(polishCharsMap)) {
    result = result.replace(new RegExp(polish, 'g'), ascii);
  }
  
  return result
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

interface BaselinkerCategory {
  category_id: number;
  name: string;
  parent_id: number;
}

interface BaselinkerProduct {
  id: number;
  sku: string;
  ean: string;
  name: string;
  quantity: number;
  price_brutto: number;
  category_id: number;
  text_fields?: Record<string, any>;
  prices?: Record<string, string>;
}

interface ParsedCategory {
  main: string;
  parts: string[];
  fullPath: string;
  depth: number;
}

interface CategoryNode {
  id?: string;
  baselinkerCategoryId: string;
  name: string;
  fullPath: string;
  slug: string;
  parentId?: string;
  children: Map<string, CategoryNode>;
  productCount: number;
}

// ============================================
// Baselinker API helpers
// ============================================

async function blRequest<T>(method: string, parameters: Record<string, any> = {}): Promise<T> {
  const token = process.env.BASELINKER_API_TOKEN;
  if (!token) {
    throw new Error('BASELINKER_API_TOKEN nie jest ustawiony w .env');
  }

  const formData = new URLSearchParams();
  formData.append('method', method);
  formData.append('parameters', JSON.stringify(parameters));
  
  const response = await fetch(BASELINKER_API_URL, {
    method: 'POST',
    headers: {
      'X-BLToken': token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });
  
  const data = await response.json() as { status: string; error_message?: string } & T;
  
  if (data.status === 'ERROR') {
    throw new Error(`Baselinker API error: ${data.error_message}`);
  }
  
  return data;
}

async function getInventories(): Promise<{ inventory_id: number; name: string }[]> {
  const response = await blRequest<{ inventories: { inventory_id: number; name: string }[] }>('getInventories');
  return response.inventories || [];
}

async function getCategories(inventoryId: string): Promise<BaselinkerCategory[]> {
  const response = await blRequest<{ categories: BaselinkerCategory[] }>('getInventoryCategories', {
    inventory_id: parseInt(inventoryId, 10)
  });
  return response.categories || [];
}

async function getProductsList(inventoryId: string, page: number = 1): Promise<BaselinkerProduct[]> {
  const response = await blRequest<{ products: Record<string, BaselinkerProduct> }>('getInventoryProductsList', {
    inventory_id: parseInt(inventoryId, 10),
    page
  });
  
  return Object.entries(response.products || {}).map(([id, product]) => ({
    ...product,
    id: parseInt(id, 10),
  }));
}

async function getProductsData(inventoryId: string, productIds: number[]): Promise<BaselinkerProduct[]> {
  if (productIds.length === 0) return [];
  
  // Baselinker API limits to 1000 products per request
  const CHUNK_SIZE = 500; // Use 500 to be safe
  const allProducts: BaselinkerProduct[] = [];
  
  for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
    const chunk = productIds.slice(i, i + CHUNK_SIZE);
    console.log(`        Pobieranie danych produktów ${i + 1}-${Math.min(i + CHUNK_SIZE, productIds.length)} z ${productIds.length}...`);
    
    const response = await blRequest<{ products: Record<string, BaselinkerProduct> }>('getInventoryProductsData', {
      inventory_id: parseInt(inventoryId, 10),
      products: chunk
    });
    
    const products = Object.entries(response.products || {}).map(([id, product]) => ({
      ...product,
      id: parseInt(id, 10),
    }));
    
    allProducts.push(...products);
    
    // Wait between chunks to avoid rate limiting
    if (i + CHUNK_SIZE < productIds.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  return allProducts;
}

// ============================================
// Parsowanie kategorii
// ============================================

function parseCategory(categoryName: string): ParsedCategory {
  const parts = categoryName.split('|').map(p => p.trim());
  
  return {
    main: parts[0],
    parts,
    fullPath: categoryName,
    depth: parts.length,
  };
}

// ============================================
// Budowanie drzewka kategorii
// ============================================

function buildCategoryTree(
  categories: BaselinkerCategory[],
  warehousePrefix: string
): Map<string, CategoryNode> {
  const tree = new Map<string, CategoryNode>();
  
  for (const cat of categories) {
    const parsed = parseCategory(cat.name);
    const categoryId = `${warehousePrefix}${cat.category_id}`;
    
    // Znajdź lub utwórz kategorię główną
    let mainNode = tree.get(parsed.main);
    if (!mainNode) {
      mainNode = {
        baselinkerCategoryId: parsed.depth === 1 ? categoryId : '',
        name: parsed.main,
        fullPath: parsed.main,
        slug: slugify(parsed.main),
        children: new Map(),
        productCount: 0,
      };
      tree.set(parsed.main, mainNode);
    }
    
    // Jeśli to kategoria główna (bez |), aktualizuj ID
    if (parsed.depth === 1) {
      mainNode.baselinkerCategoryId = categoryId;
    }
    
    // Jeśli są podkategorie, twórz drzewko
    if (parsed.depth > 1) {
      let currentNode = mainNode;
      
      for (let i = 1; i < parsed.parts.length; i++) {
        const partName = parsed.parts[i];
        const partPath = parsed.parts.slice(0, i + 1).join('|');
        const isLast = i === parsed.parts.length - 1;
        
        let childNode = currentNode.children.get(partName);
        if (!childNode) {
          // Include parent name in slug to avoid collisions between
          // same-named subcategories under different parents (e.g. "Akcesoria")
          const parentName = parsed.parts[i - 1];
          childNode = {
            baselinkerCategoryId: isLast ? categoryId : '',
            name: partName,
            fullPath: partPath,
            slug: slugify(`${parentName}-${partName}`),
            children: new Map(),
            productCount: 0,
          };
          currentNode.children.set(partName, childNode);
        }
        
        if (isLast) {
          childNode.baselinkerCategoryId = categoryId;
        }
        
        currentNode = childNode;
      }
    }
  }
  
  return tree;
}

function mergeCategoryTrees(trees: Map<string, CategoryNode>[]): Map<string, CategoryNode> {
  const merged = new Map<string, CategoryNode>();
  
  for (const tree of trees) {
    for (const [mainName, node] of tree) {
      if (!merged.has(mainName)) {
        merged.set(mainName, { ...node, children: new Map(node.children) });
      } else {
        const existing = merged.get(mainName)!;
        // Merguj podkategorie
        for (const [childName, childNode] of node.children) {
          if (!existing.children.has(childName)) {
            existing.children.set(childName, childNode);
          }
        }
        // Jeśli brak ID, użyj z nowego
        if (!existing.baselinkerCategoryId && node.baselinkerCategoryId) {
          existing.baselinkerCategoryId = node.baselinkerCategoryId;
        }
      }
    }
  }
  
  return merged;
}

// ============================================
// Usuwanie starych kategorii
// ============================================

async function deleteAllCategories(dryRun: boolean): Promise<{ deleted: number; productsReset: number }> {
  console.log('\n🗑️  Usuwanie starych kategorii...');
  
  if (dryRun) {
    const count = await prisma.category.count();
    const productsWithCategory = await prisma.product.count({ where: { categoryId: { not: null } } });
    console.log(`   [DRY-RUN] Usunięto by ${count} kategorii`);
    console.log(`   [DRY-RUN] Zresetowano by categoryId dla ${productsWithCategory} produktów`);
    return { deleted: count, productsReset: productsWithCategory };
  }
  
  // 1. Najpierw resetuj categoryId na wszystkich produktach
  const productsReset = await prisma.product.updateMany({
    where: { categoryId: { not: null } },
    data: { categoryId: null },
  });
  console.log(`   ✓ Zresetowano categoryId dla ${productsReset.count} produktów`);
  
  // 2. Usuń wszystkie kategorie (podkategorie najpierw przez kaskadę lub ręcznie)
  // Usuwaj od najgłębszych (bez dzieci) do głównych
  let totalDeleted = 0;
  let deletedInRound = 1;
  
  while (deletedInRound > 0) {
    // Znajdź kategorie bez dzieci
    const categoriesToDelete = await prisma.category.findMany({
      where: {
        children: { none: {} }
      },
      select: { id: true }
    });
    
    if (categoriesToDelete.length === 0) break;
    
    const ids = categoriesToDelete.map(c => c.id);
    const result = await prisma.category.deleteMany({
      where: { id: { in: ids } }
    });
    
    deletedInRound = result.count;
    totalDeleted += deletedInRound;
    console.log(`   ✓ Usunięto ${deletedInRound} kategorii...`);
  }
  
  console.log(`   ✅ Usunięto łącznie ${totalDeleted} kategorii`);
  return { deleted: totalDeleted, productsReset: productsReset.count };
}

// ============================================
// Synchronizacja do bazy danych
// ============================================

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (counter < 10000) {
    const existing = await prisma.category.findUnique({
      where: { slug },
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return `${baseSlug}-${Date.now()}`;
}

async function syncCategoryToDb(
  node: CategoryNode,
  parentId: string | null,
  dryRun: boolean,
  depth: number = 0
): Promise<string | null> {
  const indent = '  '.repeat(depth + 1);
  const slug = await ensureUniqueSlug(node.slug);
  
  console.log(`${indent}📁 ${node.name} (${node.baselinkerCategoryId || 'no-id'})`);
  
  if (dryRun) {
    // Rekurencyjnie przetwórz dzieci
    for (const [, childNode] of node.children) {
      await syncCategoryToDb(childNode, `dry-run-${node.slug}`, dryRun, depth + 1);
    }
    return `dry-run-${node.slug}`;
  }
  
  // Sprawdź czy istnieje
  let existingCategory: any = null;
  if (node.baselinkerCategoryId) {
    existingCategory = await prisma.category.findUnique({
      where: { baselinkerCategoryId: node.baselinkerCategoryId },
    });
  }
  
  if (!existingCategory) {
    // Szukaj po ścieżce
    existingCategory = await prisma.category.findFirst({
      where: { baselinkerCategoryPath: node.fullPath },
    });
  }
  
  let categoryId: string;
  
  if (existingCategory) {
    // Aktualizuj
    const updated = await prisma.category.update({
      where: { id: existingCategory.id },
      data: {
        name: node.name,
        slug: existingCategory.slug, // Nie zmieniaj sluga
        parentId,
        baselinkerCategoryPath: node.fullPath,
        isActive: true,
      },
    });
    categoryId = updated.id;
    console.log(`${indent}  ✓ Zaktualizowano`);
  } else {
    // Utwórz nową
    const created = await prisma.category.create({
      data: {
        name: node.name,
        slug,
        parentId,
        baselinkerCategoryId: node.baselinkerCategoryId || undefined,
        baselinkerCategoryPath: node.fullPath,
        isActive: true,
      },
    });
    categoryId = created.id;
    console.log(`${indent}  ✓ Utworzono nową`);
  }
  
  // Rekurencyjnie przetwórz dzieci
  for (const [, childNode] of node.children) {
    await syncCategoryToDb(childNode, categoryId, dryRun, depth + 1);
  }
  
  return categoryId;
}

// ============================================
// Aktualizacja kategorii produktów
// ============================================

async function updateProductCategories(
  products: { id: number; sku: string; category_id: number; name: string }[],
  warehousePrefix: string,
  categories: BaselinkerCategory[],
  dryRun: boolean
): Promise<{ updated: number; notFound: number; errors: string[] }> {
  let updated = 0;
  let notFound = 0;
  let noCategory = 0;
  const errors: string[] = [];
  const total = products.length;
  let lastProgressLog = 0;
  
  // Mapa kategorii z Baselinker
  const categoryMap = new Map<number, BaselinkerCategory>();
  for (const cat of categories) {
    categoryMap.set(cat.category_id, cat);
  }
  
  // Pre-load wszystkie kategorie z bazy dla szybszego wyszukiwania
  console.log(`      Ładowanie kategorii z bazy...`);
  const allDbCategories = await prisma.category.findMany({
    select: { id: true, baselinkerCategoryId: true, baselinkerCategoryPath: true },
  });
  const categoryByBlId = new Map<string, string>();
  const categoryByPath = new Map<string, string>();
  for (const cat of allDbCategories) {
    if (cat.baselinkerCategoryId) categoryByBlId.set(cat.baselinkerCategoryId, cat.id);
    if (cat.baselinkerCategoryPath) categoryByPath.set(cat.baselinkerCategoryPath, cat.id);
  }
  console.log(`      Załadowano ${allDbCategories.length} kategorii`);
  
  console.log(`      Aktualizacja kategorii produktów...`);
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const baselinkerProductId = `${warehousePrefix}${product.id}`;
    const categoryPath = categoryMap.get(product.category_id)?.name || '';
    
    // Progress co 1000 produktów
    if (i - lastProgressLog >= 1000 || i === products.length - 1) {
      const percent = Math.round((i + 1) / total * 100);
      process.stdout.write(`\r        Postęp: ${i + 1}/${total} (${percent}%) | Zaktualizowano: ${updated} | Brak w bazie: ${notFound} | Brak kategorii: ${noCategory}`);
      lastProgressLog = i;
    }
    
    // Znajdź produkt w bazie
    const dbProduct = await prisma.product.findUnique({
      where: { baselinkerProductId },
      select: { id: true, baselinkerCategoryPath: true, categoryId: true },
    });
    
    if (!dbProduct) {
      notFound++;
      continue;
    }
    
    // Znajdź kategorię w bazie (używając pre-loaded map)
    let categoryId: string | null = null;
    if (categoryPath) {
      const blCategoryId = `${warehousePrefix}${product.category_id}`;
      categoryId = categoryByBlId.get(blCategoryId) || categoryByPath.get(categoryPath) || categoryByPath.get(categoryPath.trim()) || null;
      
      if (!categoryId) {
        noCategory++;
      }
    }
    
    if (!dryRun && (dbProduct.baselinkerCategoryPath !== categoryPath || categoryId !== dbProduct.categoryId)) {
      try {
        await prisma.product.update({
          where: { id: dbProduct.id },
          data: {
            baselinkerCategoryPath: categoryPath,
            categoryId,
          },
        });
        updated++;
      } catch (err) {
        errors.push(`Błąd dla produktu ${product.id}: ${err instanceof Error ? err.message : 'Nieznany błąd'}`);
      }
    } else if (dryRun) {
      updated++;
    }
  }
  
  console.log(''); // Nowa linia po progress bar
  
  return { updated, notFound, errors };
}

// ============================================
// Główna funkcja
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = isTest ? 10 : (limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1], 10) : undefined);
  
  console.log('═'.repeat(80));
  console.log('🔄 SYNCHRONIZACJA KATEGORII Z BASELINKER');
  console.log('═'.repeat(80));
  console.log(`📋 Tryb: ${isTest ? 'TESTOWY (10 produktów)' : 'PEŁNY'}`);
  console.log(`📋 Dry-run: ${isDryRun ? 'TAK (bez zmian w bazie)' : 'NIE'}`);
  if (limit) console.log(`📋 Limit: ${limit} produktów`);
  console.log('─'.repeat(80));
  
  try {
    // 1. Pobierz listę magazynów
    console.log('\n📦 Pobieranie listy magazynów...');
    const inventories = await getInventories();
    console.log(`   Znaleziono ${inventories.length} magazynów`);
    
    // Mapuj ID magazynów
    for (const inv of inventories) {
      const invNameLower = inv.name.toLowerCase();
      if (invNameLower.includes('hp') || invNameLower === 'hp') {
        WAREHOUSE_CONFIG.hp.inventoryId = inv.inventory_id.toString();
        console.log(`   ✓ HP: ${inv.inventory_id}`);
      } else if (invNameLower.includes('leker')) {
        WAREHOUSE_CONFIG.leker.inventoryId = inv.inventory_id.toString();
        console.log(`   ✓ LEKER: ${inv.inventory_id}`);
      } else if (invNameLower.includes('btp')) {
        WAREHOUSE_CONFIG.btp.inventoryId = inv.inventory_id.toString();
        console.log(`   ✓ BTP: ${inv.inventory_id}`);
      }
    }
    
    // 2. Usuń stare kategorie przed synchronizacją
    const deleteResult = await deleteAllCategories(isDryRun);
    
    // 3. Pobierz kategorie z każdego magazynu
    console.log('\n📂 Pobieranie kategorii z magazynów...');
    const allCategoryTrees: Map<string, CategoryNode>[] = [];
    const warehouseCategories: Map<string, BaselinkerCategory[]> = new Map();
    
    for (const [key, config] of Object.entries(WAREHOUSE_CONFIG)) {
      if (!config.inventoryId) {
        console.log(`   ⚠️ ${config.name}: Nie znaleziono magazynu`);
        continue;
      }
      
      console.log(`   📦 ${config.name} (${config.inventoryId})...`);
      const categories = await getCategories(config.inventoryId);
      console.log(`      Znaleziono ${categories.length} kategorii`);
      
      warehouseCategories.set(key, categories);
      
      // Buduj drzewko
      const tree = buildCategoryTree(categories, config.prefix);
      allCategoryTrees.push(tree);
      
      // Pokaż przykłady kategorii z |
      const withPipe = categories.filter(c => c.name.includes('|')).slice(0, 3);
      for (const cat of withPipe) {
        console.log(`      Przykład: "${cat.name}"`);
      }
      
      await new Promise(r => setTimeout(r, 1000)); // Rate limiting
    }
    
    // 4. Merguj drzewka kategorii
    console.log('\n🌳 Budowanie wspólnego drzewka kategorii...');
    const mergedTree = mergeCategoryTrees(allCategoryTrees);
    console.log(`   Kategorie główne: ${mergedTree.size}`);
    
    let totalSubcategories = 0;
    for (const [, node] of mergedTree) {
      totalSubcategories += node.children.size;
    }
    console.log(`   Podkategorie (1 poziom): ${totalSubcategories}`);
    
    // 5. Synchronizuj kategorie do bazy
    console.log('\n💾 Synchronizacja kategorii do bazy danych...');
    for (const [mainName, node] of mergedTree) {
      await syncCategoryToDb(node, null, isDryRun);
    }
    
    // 6. Pobierz produkty i zaktualizuj ich kategorie
    console.log('\n📦 Aktualizacja kategorii produktów...');
    
    let totalUpdated = 0;
    let totalNotFound = 0;
    const allErrors: string[] = [];
    
    for (const [key, config] of Object.entries(WAREHOUSE_CONFIG)) {
      if (!config.inventoryId) continue;
      
      console.log(`\n   📦 ${config.name}:`);
      const categories = warehouseCategories.get(key) || [];
      
      // Pobierz listę produktów
      let productsList: BaselinkerProduct[] = [];
      let page = 1;
      
      while (true) {
        const pageProducts = await getProductsList(config.inventoryId, page);
        productsList.push(...pageProducts);
        
        if (limit && productsList.length >= limit) {
          productsList = productsList.slice(0, limit);
          break;
        }
        
        if (pageProducts.length < 1000) break;
        page++;
        
        await new Promise(r => setTimeout(r, 500));
      }
      
      console.log(`      Znaleziono ${productsList.length} produktów na liście`);
      
      // Pobierz pełne dane produktów (z category_id)
      console.log(`      Pobieranie pełnych danych produktów...`);
      const productIds = productsList.map(p => p.id);
      const products = await getProductsData(config.inventoryId, productIds);
      console.log(`      Pobrano dane dla ${products.length} produktów`);
      
      // Aktualizuj kategorie produktów
      const result = await updateProductCategories(products, config.prefix, categories, isDryRun);
      totalUpdated += result.updated;
      totalNotFound += result.notFound;
      allErrors.push(...result.errors);
      
      console.log(`      ✓ Zaktualizowano: ${result.updated}`);
      console.log(`      ⚠️ Nie znaleziono w bazie: ${result.notFound}`);
      if (result.errors.length > 0) {
        console.log(`      ❌ Błędów: ${result.errors.length}`);
      }
      
      if (limit && totalUpdated >= limit) break;
    }
    
    // 7. Podsumowanie
    console.log('\n' + '═'.repeat(80));
    console.log('✅ PODSUMOWANIE');
    console.log('═'.repeat(80));
    console.log(`   Usunięte stare kategorie: ${deleteResult.deleted}`);
    console.log(`   Nowe kategorie główne: ${mergedTree.size}`);
    console.log(`   Produkty zaktualizowane: ${totalUpdated}`);
    console.log(`   Produkty nieznalezione: ${totalNotFound}`);
    console.log(`   Błędy: ${allErrors.length}`);
    
    if (allErrors.length > 0) {
      console.log('\n   Błędy:');
      allErrors.slice(0, 10).forEach(e => console.log(`      ❌ ${e}`));
      if (allErrors.length > 10) {
        console.log(`      ... i ${allErrors.length - 10} więcej`);
      }
    }
    
    if (isDryRun) {
      console.log('\n   ℹ️ To był dry-run - żadne zmiany nie zostały zapisane.');
    }
    
  } catch (error) {
    console.error('\n❌ Błąd:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
