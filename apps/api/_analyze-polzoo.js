/**
 * Analyze polzoo XML - statistics on available dimensions/weight data
 */
const fs = require('fs');

const XML_PATH = 'C:\\Users\\Pracownik Biuro 1\\Downloads\\stock_export_full_for_support@wb-partners.pl.xml';
const raw = fs.readFileSync(XML_PATH, 'utf-8');

// Split into products
const products = raw.split(/<product id="/).slice(1);
console.log(`Total products: ${products.length}`);

let hasWeight = 0;
let hasDimsInDesc = 0;
let hasLength = 0;
let hasWidth = 0;
let hasHeight = 0;
let hasAnyDim = 0;

const dimPatterns = [
  /wymiar[yó]?\s*[:;]\s*[\d,\.]+/i,
  /d[lł]ugo[sś][cć]\s*[:;]?\s*[\d,\.]+/i,
  /szeroko[sś][cć]\s*[:;]?\s*[\d,\.]+/i,
  /wysoko[sś][cć]\s*[:;]?\s*[\d,\.]+/i,
  /(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
  /(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
  /LENGTH\s*[:;]\s*[\d,\.]+/i,
  /WIDTH\s*[:;]\s*[\d,\.]+/i,
  /HEIGHT\s*[:;]\s*[\d,\.]+/i,
  /rozmiar\s*[:;]\s*[\d,\.]+/i,
];

const lengthPat = [/d[lł]ugo[sś][cć]\s*[:;]?\s*[\d,\.]+/i, /LENGTH\s*[:;]\s*[\d,\.]+/i];
const widthPat = [/szeroko[sś][cć]\s*[:;]?\s*[\d,\.]+/i, /WIDTH\s*[:;]\s*[\d,\.]+/i];
const heightPat = [/wysoko[sś][cć]\s*[:;]?\s*[\d,\.]+/i, /HEIGHT\s*[:;]\s*[\d,\.]+/i];
const multiDimPat = /(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*(?:[x×]\s*(\d+[\.,]?\d*)\s*)?(cm|mm|m)\b/i;

const wagaPatterns = [
  /waga\s*[:;]?\s*[\d,\.]+\s*(kg|g)\b/i,
  /WEIGHT\s*[:;]?\s*[\d,\.]+/i,
  /masa\s*[:;]?\s*[\d,\.]+/i,
  /ci[eę][żz]ar\s*[:;]?\s*[\d,\.]+/i,
];

let hasWeightInDesc = 0;

for (const prod of products) {
  // Weight from <size weight="N">
  const wMatch = prod.match(/weight="(\d+(?:\.\d+)?)"/);
  if (wMatch && parseFloat(wMatch[1]) > 0) hasWeight++;

  // Dims from description HTML
  const desc = prod.match(/long_desc[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>/);
  const descText = desc ? desc[1] : '';
  
  let foundLength = lengthPat.some(p => p.test(descText)) || multiDimPat.test(descText);
  let foundWidth = widthPat.some(p => p.test(descText)) || multiDimPat.test(descText);
  let foundHeight = heightPat.some(p => p.test(descText));
  // 3-dim pattern provides height too
  const m3 = descText.match(/(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i);
  if (m3) foundHeight = true;

  if (foundLength) hasLength++;
  if (foundWidth) hasWidth++;
  if (foundHeight) hasHeight++;
  if (foundLength || foundWidth || foundHeight) hasAnyDim++;
  if (dimPatterns.some(p => p.test(descText))) hasDimsInDesc++;
  if (wagaPatterns.some(p => p.test(descText))) hasWeightInDesc++;
}

console.log('\n=== STATYSTYKI WYMIARÓW I WAG ===');
console.log(`\nWaga (z atrybutu XML <size weight>):`);
console.log(`  Niezerowa waga: ${hasWeight} / ${products.length} (${(hasWeight/products.length*100).toFixed(1)}%)`);
console.log(`\nWaga (z opisu HTML):`);
console.log(`  Znaleziona w opisie: ${hasWeightInDesc} / ${products.length} (${(hasWeightInDesc/products.length*100).toFixed(1)}%)`);
console.log(`\nWymiary (z opisu HTML):`);
console.log(`  Jakikolwiek wymiar: ${hasDimsInDesc} / ${products.length} (${(hasDimsInDesc/products.length*100).toFixed(1)}%)`);
console.log(`  Długość: ${hasLength} / ${products.length} (${(hasLength/products.length*100).toFixed(1)}%)`);
console.log(`  Szerokość: ${hasWidth} / ${products.length} (${(hasWidth/products.length*100).toFixed(1)}%)`);
console.log(`  Wysokość: ${hasHeight} / ${products.length} (${(hasHeight/products.length*100).toFixed(1)}%)`);
console.log(`  Min. 1 wymiar: ${hasAnyDim} / ${products.length} (${(hasAnyDim/products.length*100).toFixed(1)}%)`);

// Sample products with dims
console.log('\n=== PRZYKŁADY PRODUKTÓW Z WYMIARAMI ===');
let shown = 0;
for (const prod of products) {
  if (shown >= 5) break;
  const desc = prod.match(/long_desc[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>/);
  const descText = desc ? desc[1] : '';
  if (dimPatterns.some(p => p.test(descText))) {
    const nameM = prod.match(/name xml:lang="pol"><!\[CDATA\[([^\]]*)\]\]>/);
    const name = nameM ? nameM[1].substring(0, 60) : '?';
    // Extract the matching dimension text
    const dimMatch = descText.match(/(?:wymiar[yó]?\s*[:;][^\n<]{3,60}|d[lł]ugo[sś][cć]\s*[:;]?[^\n<]{3,40}|szeroko[sś][cć]\s*[:;]?[^\n<]{3,40}|wysoko[sś][cć]\s*[:;]?[^\n<]{3,40}|\d+[\.,]?\d*\s*[x×]\s*\d+[\.,]?\d*\s*[x×]?\s*\d*[\.,]?\d*\s*(?:cm|mm|m)\b)/i);
    console.log(`  ${name}`);
    console.log(`    -> ${dimMatch ? dimMatch[0].trim() : '?'}`);
    shown++;
  }
}
