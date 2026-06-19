/**
 * Update dimensions and weight for Baselinker inventory 28447 (polzoo.pl)
 * 
 * Source: XML file (IOF 3.0 format)
 * Weight: from <size weight="N"> attribute (in grams → convert to kg)
 * Dimensions: parsed from HTML descriptions (length, width, height in cm)
 * Mapping: XML iaiext:code_external → BL product SKU
 * 
 * Usage:
 *   node _update-polzoo-dims.js          # dry-run (no changes)
 *   node _update-polzoo-dims.js --go     # execute updates
 *   node _update-polzoo-dims.js --go --skip 100  # skip first 100
 */

require('dotenv').config();
const fs = require('fs');

const API_TOKEN = process.env.BASELINKER_API_TOKEN;
const INVENTORY_ID = 28447;
const XML_PATH = 'C:\\Users\\Pracownik Biuro 1\\Downloads\\stock_export_full_for_support@wb-partners.pl.xml';

const DRY_RUN = !process.argv.includes('--go');
const SKIP = (() => { const i = process.argv.indexOf('--skip'); return i > -1 ? parseInt(process.argv[i + 1]) || 0 : 0; })();

// ============ XML PARSING ============

function parseXML() {
  console.log('Reading XML...');
  const raw = fs.readFileSync(XML_PATH, 'utf-8');
  
  const products = raw.split(/<product id="/).slice(1);
  console.log(`XML products: ${products.length}`);
  
  const result = new Map(); // code_external → { weight, height, width, length }
  
  for (const prod of products) {
    // Get code_external (= BL SKU)
    const codeMatch = prod.match(/iaiext:code_external="([^"]+)"/);
    if (!codeMatch) continue;
    const sku = codeMatch[1];
    
    // Weight in grams from <size weight="N">
    const weightMatch = prod.match(/<size[^>]*\bweight="(\d+(?:\.\d+)?)"/);
    const weightGrams = weightMatch ? parseFloat(weightMatch[1]) : 0;
    const weightKg = weightGrams > 0 ? weightGrams / 1000 : 0;
    
    // Dimensions from HTML description
    const desc = prod.match(/long_desc[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>/);
    const descText = desc ? desc[1] : '';
    
    const dims = extractDimensions(descText);
    
    result.set(sku, {
      weight: weightKg,
      height: dims.height,
      width: dims.width,
      length: dims.length,
    });
  }
  
  return result;
}

function extractDimensions(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  
  let length = 0, width = 0, height = 0;
  
  // Pattern: NxNxN cm (3 dimensions)
  const m3 = text.match(/(\d+[\.,]?\d*)\s*[x×X]\s*(\d+[\.,]?\d*)\s*[x×X]\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i);
  if (m3) {
    const vals = [parseNum(m3[1]), parseNum(m3[2]), parseNum(m3[3])];
    const unit = m3[4].toLowerCase();
    const factor = unit === 'mm' ? 0.1 : unit === 'm' ? 100 : 1;
    // Sort: longest=length, middle=width, shortest=height
    vals.sort((a, b) => b - a);
    length = vals[0] * factor;
    width = vals[1] * factor;
    height = vals[2] * factor;
    return { length, width, height };
  }
  
  // Pattern: NxN cm (2 dimensions)
  const m2 = text.match(/(\d+[\.,]?\d*)\s*[x×X]\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i);
  if (m2) {
    const vals = [parseNum(m2[1]), parseNum(m2[2])];
    const unit = m2[3].toLowerCase();
    const factor = unit === 'mm' ? 0.1 : unit === 'm' ? 100 : 1;
    vals.sort((a, b) => b - a);
    length = vals[0] * factor;
    width = vals[1] * factor;
    return { length, width, height };
  }
  
  // Individual dimension patterns
  const lengthPats = [
    /d[lł]ugo[sś][cć]\s*[:;=]?\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
    /LENGTH\s*[:;=]?\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
  ];
  const widthPats = [
    /szeroko[sś][cć]\s*[:;=]?\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
    /WIDTH\s*[:;=]?\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
  ];
  const heightPats = [
    /wysoko[sś][cć]\s*[:;=]?\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
    /HEIGHT\s*[:;=]?\s*(\d+[\.,]?\d*)\s*(cm|mm|m)\b/i,
  ];
  
  for (const pat of lengthPats) {
    const m = text.match(pat);
    if (m) { length = convertToCm(parseNum(m[1]), m[2]); break; }
  }
  for (const pat of widthPats) {
    const m = text.match(pat);
    if (m) { width = convertToCm(parseNum(m[1]), m[2]); break; }
  }
  for (const pat of heightPats) {
    const m = text.match(pat);
    if (m) { height = convertToCm(parseNum(m[1]), m[2]); break; }
  }
  
  // Wymiary: NxNxN or NxN pattern (alternative keyword)
  if (!length && !width && !height) {
    const wymM = text.match(/wymiar[yó]?\s*[:;=]?\s*(\d+[\.,]?\d*)\s*[x×X]\s*(\d+[\.,]?\d*)\s*(?:[x×X]\s*(\d+[\.,]?\d*)\s*)?(cm|mm|m)\b/i);
    if (wymM) {
      const unit = wymM[4].toLowerCase();
      const factor = unit === 'mm' ? 0.1 : unit === 'm' ? 100 : 1;
      const vals = [parseNum(wymM[1]) * factor, parseNum(wymM[2]) * factor];
      if (wymM[3]) vals.push(parseNum(wymM[3]) * factor);
      vals.sort((a, b) => b - a);
      length = vals[0] || 0;
      width = vals[1] || 0;
      height = vals[2] || 0;
    }
  }
  
  return { length, width, height };
}

function parseNum(s) {
  return parseFloat(s.replace(',', '.')) || 0;
}

function convertToCm(val, unit) {
  unit = unit.toLowerCase();
  if (unit === 'mm') return val * 0.1;
  if (unit === 'm') return val * 100;
  return val; // cm
}

// ============ BASELINKER API ============

async function blCall(method, params = {}) {
  const res = await fetch('https://api.baselinker.com/connector.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${API_TOKEN}&method=${method}&parameters=${JSON.stringify(params)}`
  });
  return res.json();
}

async function fetchAllBLProducts() {
  console.log('Fetching BL inventory 28447 products...');
  const skuToId = new Map();
  let page = 1;
  
  while (true) {
    const res = await blCall('getInventoryProductsList', { inventory_id: INVENTORY_ID, page });
    if (res.status === 'ERROR') { console.error('BL Error:', res); break; }
    
    const products = res.products || {};
    const ids = Object.keys(products);
    
    for (const id of ids) {
      const p = products[id];
      if (p.sku) skuToId.set(p.sku, Number(id));
    }
    
    console.log(`  Page ${page}: ${ids.length} products (total SKUs: ${skuToId.size})`);
    if (ids.length < 1000) break;
    page++;
    await sleep(300);
  }
  
  return skuToId;
}

async function updateProduct(productId, data, retries = 3) {
  const params = { inventory_id: INVENTORY_ID, product_id: productId };
  if (data.weight > 0) params.weight = data.weight;
  if (data.height > 0) params.height = data.height;
  if (data.width > 0) params.width = data.width;
  if (data.length > 0) params.length = data.length;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await blCall('addInventoryProduct', params);
    if (res.status === 'SUCCESS') return { ok: true };
    
    if (res.error_message?.includes('limit exceeded') || res.error_message?.includes('too many')) {
      console.log(`    Rate limited, waiting 120s (attempt ${attempt}/${retries})...`);
      await sleep(120000);
      continue;
    }
    
    return { ok: false, error: res.error_message || res.error_code };
  }
  return { ok: false, error: 'max retries' };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============ MAIN ============

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no changes)' : 'LIVE UPDATE'}`);
  if (SKIP > 0) console.log(`Skipping first ${SKIP} matches`);
  console.log('');
  
  // 1. Parse XML
  const xmlData = parseXML();
  console.log(`XML entries with code_external: ${xmlData.size}`);
  
  // Stats
  let xmlWithWeight = 0, xmlWithDims = 0;
  for (const [, d] of xmlData) {
    if (d.weight > 0) xmlWithWeight++;
    if (d.length > 0 || d.width > 0 || d.height > 0) xmlWithDims++;
  }
  console.log(`  With weight: ${xmlWithWeight}`);
  console.log(`  With any dimension: ${xmlWithDims}`);
  console.log('');
  
  // 2. Fetch BL products
  const skuToId = await fetchAllBLProducts();
  console.log(`\nBL products with SKU: ${skuToId.size}`);
  
  // 3. Match
  const toUpdate = [];
  for (const [sku, data] of xmlData) {
    const blId = skuToId.get(sku);
    if (!blId) continue;
    if (data.weight <= 0 && data.length <= 0 && data.width <= 0 && data.height <= 0) continue;
    toUpdate.push({ blId, sku, ...data });
  }
  
  console.log(`Matched products to update: ${toUpdate.length}`);
  const withWeight = toUpdate.filter(p => p.weight > 0).length;
  const withDims = toUpdate.filter(p => p.length > 0 || p.width > 0 || p.height > 0).length;
  console.log(`  With weight: ${withWeight}`);
  console.log(`  With dimensions: ${withDims}`);
  console.log('');
  
  if (DRY_RUN) {
    console.log('--- DRY RUN - sample updates ---');
    for (const p of toUpdate.slice(0, 15)) {
      const dims = [p.length, p.width, p.height].filter(v => v > 0).map(v => v.toFixed(1)).join('x') || '-';
      console.log(`  ${p.sku} → weight=${p.weight.toFixed(3)}kg dims=${dims}cm`);
    }
    console.log(`\nRun with --go to execute ${toUpdate.length} updates.`);
    return;
  }
  
  // 4. Execute updates
  let updated = 0, errors = 0, skipped = 0;
  
  for (let i = 0; i < toUpdate.length; i++) {
    if (i < SKIP) { skipped++; continue; }
    
    const p = toUpdate[i];
    const res = await updateProduct(p.blId, p);
    
    if (res.ok) {
      updated++;
    } else {
      errors++;
      console.log(`  ERROR [${i}] ${p.sku}: ${res.error}`);
    }
    
    if ((i + 1) % 100 === 0 || i === toUpdate.length - 1) {
      console.log(`  Progress: ${i + 1}/${toUpdate.length} (updated=${updated} errors=${errors})`);
    }
    
    // BL limit: 100 req/min → 600ms between requests to stay safe
    await sleep(600);
  }
  
  console.log(`\n=== DONE ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(console.error);
