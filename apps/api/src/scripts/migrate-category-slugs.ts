/**
 * Migracja slugów kategorii — dodaje kontekst rodzica do slugów podkategorii.
 * 
 * Problem: Podkategorie "Akcesoria" w różnych kategoriach głównych miały slugi
 * "akcesoria", "akcesoria-1", "akcesoria-2" — co powodowało mieszanie produktów.
 * 
 * Rozwiązanie: Slug podkategorii zawiera teraz nazwę rodzica, np.:
 *   "Elektronika > Akcesoria"  → "elektronika-akcesoria"
 *   "Dom > Akcesoria"          → "dom-akcesoria"
 * 
 * Użycie: npx tsx src/scripts/migrate-category-slugs.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

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

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN — żadne zmiany nie zostaną zapisane ===\n');
  }

  // Pobierz wszystkie podkategorie (te, które mają parentId)
  const subcategories = await prisma.category.findMany({
    where: { parentId: { not: null } },
    include: { parent: true },
    orderBy: { name: 'asc' },
  });

  console.log(`Znaleziono ${subcategories.length} podkategorii do sprawdzenia.\n`);

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cat of subcategories) {
    const parentName = cat.parent!.name;
    const expectedSlug = slugify(`${parentName}-${cat.name}`);

    // Jeśli slug już zawiera kontekst rodzica, pomiń
    if (cat.slug === expectedSlug) {
      skipped++;
      continue;
    }

    // Sprawdź czy expectedSlug jest wolny
    let newSlug = expectedSlug;
    const existing = await prisma.category.findUnique({ where: { slug: newSlug } });
    if (existing && existing.id !== cat.id) {
      // Slug zajęty — dodaj suffix
      let counter = 1;
      while (counter < 100) {
        const candidate = `${expectedSlug}-${counter}`;
        const taken = await prisma.category.findUnique({ where: { slug: candidate } });
        if (!taken || taken.id === cat.id) {
          newSlug = candidate;
          break;
        }
        counter++;
      }
    }

    console.log(`  ${cat.parent!.name} > ${cat.name}`);
    console.log(`    ${cat.slug}  →  ${newSlug}`);

    if (!dryRun) {
      try {
        await prisma.category.update({
          where: { id: cat.id },
          data: { slug: newSlug },
        });
        updated++;
      } catch (err) {
        const msg = `Błąd aktualizacji "${cat.name}" (${cat.id}): ${err instanceof Error ? err.message : err}`;
        console.error(`    ❌ ${msg}`);
        errors.push(msg);
      }
    } else {
      updated++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Podsumowanie:`);
  console.log(`  Zaktualizowano: ${updated}`);
  console.log(`  Pominięto (już OK): ${skipped}`);
  console.log(`  Błędy: ${errors.length}`);
  if (errors.length > 0) {
    console.log(`\nBłędy:`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
  if (dryRun) {
    console.log(`\n(To był DRY RUN — uruchom bez --dry-run aby zapisać zmiany)`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
