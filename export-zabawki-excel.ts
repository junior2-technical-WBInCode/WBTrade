/**
 * Export products from category: Zabawki (only ACTIVE products displayed on website)
 * Columns: Nazwa produktu, Stan magazynowy, Cena na stronie, Cena B2B (mnożnik 1.1)
 * Includes all products even with stock = 0
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

// Load env from apps/api/.env
require('dotenv').config({ path: path.join(__dirname, 'apps/api/.env') });

const prisma = new PrismaClient();

const STORE_BASE_MULTIPLIER = 1.35;
const B2B_MULTIPLIER = 1.1;

function calculateB2bPrice(storePrice: number): number {
  if (storePrice <= 0) return 0;
  const basePrice = storePrice / STORE_BASE_MULTIPLIER;
  return Math.floor(basePrice * B2B_MULTIPLIER) + 0.99;
}

async function main() {
  console.log('Pobieranie kategorii Zabawki...');

  // Find "Zabawki" category
  const categories = await prisma.category.findMany({
    where: {
      OR: [
        { slug: 'zabawki' },
        { name: 'Zabawki' },
      ],
    },
  });

  const categoryIds = categories.map((c) => c.id);
  console.log(`Znalezione kategorie: ${categories.map((c) => c.name).join(', ')}`);

  // Also get child categories (subcategories of Zabawki)
  const childCategories = await prisma.category.findMany({
    where: { parentId: { in: categoryIds } },
  });
  const allCategoryIds = [...categoryIds, ...childCategories.map((c) => c.id)];

  if (childCategories.length > 0) {
    console.log(`Podkategorie: ${childCategories.map((c) => c.name).join(', ')}`);
  }

  console.log('Pobieranie produktów (tylko ACTIVE - wyświetlane na stronie)...');

  const products = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { categoryId: { in: allCategoryIds } },
        { baselinkerCategoryPath: { contains: 'Zabawki', mode: 'insensitive' } },
      ],
    },
    include: {
      category: true,
      manufacturer: true,
      variants: {
        include: {
          inventory: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Znaleziono ${products.length} produktów`);

  // Build Excel data
  const rows = products.map((product) => {
    // Calculate total stock across all variants and locations
    let totalStock = 0;
    for (const variant of product.variants) {
      for (const inv of variant.inventory) {
        totalStock += inv.quantity;
      }
    }

    const price = Number(product.price);
    const b2bPrice = calculateB2bPrice(price);

    return {
      'Nazwa produktu': product.name,
      'SKU': product.sku,
      'Kategoria': product.category?.name || product.baselinkerCategoryPath || '-',
      'Producent': product.manufacturer?.name || '-',
      'Stan magazynowy': totalStock,
      'Cena na stronie (PLN)': price,
      'Cena B2B (mnożnik 1.1) (PLN)': b2bPrice,
    };
  });

  if (rows.length === 0) {
    console.log('Brak produktów do eksportu.');
    await prisma.$disconnect();
    return;
  }

  // Create Excel workbook
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 60 }, // Nazwa produktu
    { wch: 18 }, // SKU
    { wch: 25 }, // Kategoria
    { wch: 20 }, // Producent
    { wch: 16 }, // Stan magazynowy
    { wch: 20 }, // Cena na stronie
    { wch: 25 }, // Cena B2B
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Zabawki');

  const outputPath = path.join(__dirname, 'export-zabawki-lego.xlsx');
  XLSX.writeFile(workbook, outputPath);

  console.log(`\nEksport zakończony!`);
  console.log(`Plik: ${outputPath}`);
  console.log(`Produktów: ${rows.length}`);
  console.log(`  - Ze stanem > 0: ${rows.filter((r) => r['Stan magazynowy'] > 0).length}`);
  console.log(`  - Ze stanem = 0: ${rows.filter((r) => r['Stan magazynowy'] === 0).length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Błąd:', err);
  prisma.$disconnect();
  process.exit(1);
});
