// Load environment variables FIRST - before any other imports
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from apps/.env (shared config)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try root .env and local .env as fallback
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import productsRoutes from './routes/products';
import searchRoutes from './routes/search';
import ordersRoutes from './routes/orders';
import cartRoutes from './routes/cart';
import authSecureRoutes from './routes/auth.secure';
import inventoryRoutes from './routes/inventory';
import addressesRoutes from './routes/addresses';
import wishlistRoutes from './routes/wishlist';
import shoppingListRoutes from './routes/shopping-list';
import categoriesRoutes from './routes/categories';
import checkoutRoutes from './routes/checkout';
import { payuWebhook } from './controllers/checkout.controller';
import dashboardRoutes from './routes/dashboard';
import adminDashboardRoutes from './routes/admin-dashboard';
import locationsRoutes from './routes/locations';
import usersRoutes from './routes/users';
import reviewsRoutes from './routes/reviews';
import healthRoutes from './routes/health';
import baselinkerRoutes from './routes/baselinker';
import reportsRoutes from './routes/reports';
import uploadRoutes from './routes/upload';
import priceHistoryRoutes from './routes/price-history';
import adminSettingsRoutes from './routes/admin-settings';
import adminCouponsRoutes from './routes/admin-coupons';
import adminSaleCampaignsRoutes from './routes/admin-sale-campaigns';
import adminNotificationsRoutes from './routes/admin-notifications';
import adminNewsletterRoutes from './routes/admin-newsletter';
import adminActivityLogRoutes from './routes/admin-activity-log';
import adminOmnibusRoutes from './routes/admin-omnibus';
import adminWarehouseRoutes from './routes/admin-warehouse';
import adminReviewsRoutes from './routes/admin-reviews';
import carouselsRoutes from './routes/carousels';
import newsletterRoutes from './routes/newsletter';
import contactRoutes from './routes/contact';
import feedRoutes from './routes/feed';
import couponsRoutes from './routes/coupons';
import loyaltyRoutes from './routes/loyalty';
import adminLoyaltyRoutes from './routes/admin-loyalty';
import chatbotRoutes from './routes/chatbot';
import supportRoutes from './routes/support';
import adminSyncRoutes from './routes/admin-sync';
import adminCategoriesRoutes from './routes/admin-categories';
import adminSupportRoutes from './routes/admin-support';
import adminReturnsRoutes from './routes/admin-returns';
import adminDeliveryDelaysRoutes from './routes/admin-delivery-delays';
import adminEmailTemplatesRoutes from './routes/admin-email-templates';
import userNotificationsRoutes from './routes/user-notifications';
import emailInboundRoutes from './routes/email-inbound';
import imageProxyRoutes from './routes/image-proxy';
import adminWholesalersRoutes from './routes/admin-wholesalers';
import wholesalersRoutes from './routes/wholesalers';
import manufacturersRoutes from './routes/manufacturers';
import { generalRateLimiter } from './middleware/rate-limit.middleware';
import { initializeMeilisearch, meiliClient, PRODUCTS_INDEX, isMeilisearchAvailable } from './lib/meilisearch';
import { startSearchIndexWorker } from './workers/search-index.worker';
import { startEmailWorker } from './workers/email.worker';
import { startInventorySyncWorker } from './workers/inventory-sync.worker';
import { startImportWorker, startExportWorker } from './workers/import-export.worker';
import { startShippingWorker } from './workers/shipping.worker';
import { scheduleReservationCleanup } from './lib/queue';

const app = express();
// Render używa PORT, lokalnie APP_PORT
const PORT = process.env.PORT || process.env.APP_PORT || 5000;

// Trust proxy for rate limiting behind reverse proxy (e.g. nginx)
app.set('trust proxy', 1);

// InPost Paczkomat map — custom Leaflet widget using public InPost API (no token needed)
app.get('/api/inpost-widget', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(`<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
#map{width:100%;height:100%}
.search-panel{position:absolute;top:0;left:0;right:0;z-index:1000;padding:10px;display:flex;gap:8px;background:rgba(255,255,255,0.95);box-shadow:0 2px 8px rgba(0,0,0,0.15)}
.search-input{flex:1;padding:10px 14px;border:2px solid #FFCD00;border-radius:8px;font-size:14px;outline:none;background:#fff}
.search-input:focus{border-color:#1D1D1B}
.search-input::placeholder{color:#999}
.locate-btn{width:42px;height:42px;border:none;border-radius:8px;background:#FFCD00;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.locate-btn:active{background:#e6b800}
.locate-btn svg{width:22px;height:22px;fill:#1D1D1B}
.filters{position:absolute;top:62px;left:10px;right:10px;z-index:1000;display:flex;gap:6px}
.filter-btn{padding:6px 14px;border:1.5px solid #ddd;border-radius:20px;background:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.filter-btn.active{background:#FFCD00;border-color:#FFCD00;color:#1D1D1B}
.point-card{position:absolute;bottom:0;left:0;right:0;z-index:1000;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);padding:20px;transform:translateY(100%);transition:transform 0.3s ease}
.point-card.visible{transform:translateY(0)}
.point-card .name{font-size:16px;font-weight:700;color:#1D1D1B;margin-bottom:4px}
.point-card .address{font-size:13px;color:#666;margin-bottom:4px}
.point-card .type-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-bottom:12px}
.point-card .type-badge.locker{background:#FFCD00;color:#1D1D1B}
.point-card .type-badge.pop{background:#e8e8e8;color:#555}
.select-btn{width:100%;padding:14px;border:none;border-radius:10px;background:#FFCD00;font-size:15px;font-weight:700;color:#1D1D1B;cursor:pointer}
.select-btn:active{background:#e6b800}
.close-card{position:absolute;top:12px;right:16px;width:30px;height:30px;border:none;background:rgba(0,0,0,0.08);border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
.loading-overlay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999;background:rgba(255,255,255,0.9);padding:16px 24px;border-radius:10px;font-size:13px;color:#666;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.marker-cluster{background:rgba(255,205,0,0.6);border-radius:50%;text-align:center;font-weight:700;color:#1D1D1B;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;border:2px solid #FFCD00}
</style>
</head>
<body>
<div class="search-panel">
  <input class="search-input" id="search" placeholder="Wpisz adres lub miasto..." autocomplete="off"/>
  <button class="locate-btn" id="locateBtn" title="Moja lokalizacja">
    <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
  </button>
</div>
<div class="filters">
  <button class="filter-btn active" data-type="all">Wszystkie</button>
  <button class="filter-btn" data-type="parcel_locker">Paczkomat&reg;</button>
  <button class="filter-btn" data-type="pop">PaczkoPunkt</button>
</div>
<div id="map"></div>
<div class="point-card" id="pointCard">
  <button class="close-card" id="closeCard">&times;</button>
  <div class="type-badge locker" id="cardBadge">Paczkomat&reg;</div>
  <div class="name" id="cardName"></div>
  <div class="address" id="cardAddr1"></div>
  <div class="address" id="cardAddr2"></div>
  <button class="select-btn" id="selectBtn">Wybierz ten punkt</button>
</div>
<div class="loading-overlay" id="loading">Ładowanie paczkomatów...</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
(function(){
  const INPOST_API='https://api-shipx-pl.easypack24.net/v1/points';
  const map=L.map('map',{zoomControl:false}).setView([52.2297,21.0122],13);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap | InPost',maxZoom:19
  }).addTo(map);

  const lockerIcon=L.divIcon({className:'',html:'<div style="width:28px;height:28px;background:#FFCD00;border:2px solid #1D1D1B;border-radius:6px;display:flex;align-items:center;justify-content:center"><svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'#1D1D1B\\'><path d=\\'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z\\'/></svg></div>',iconSize:[28,28],iconAnchor:[14,14]});
  const popIcon=L.divIcon({className:'',html:'<div style="width:24px;height:24px;background:#fff;border:2px solid #FFCD00;border-radius:50%;display:flex;align-items:center;justify-content:center"><svg width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'#1D1D1B\\'><path d=\\'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z\\'/></svg></div>',iconSize:[24,24],iconAnchor:[12,12]});

  let markers=[];
  let allPoints=[];
  let activeFilter='all';
  let selectedPoint=null;
  let searchTimeout=null;
  let userMarker=null;

  const loadingEl=document.getElementById('loading');
  const cardEl=document.getElementById('pointCard');
  const searchEl=document.getElementById('search');

  function showLoading(show){loadingEl.style.display=show?'block':'none'}
  function showCard(show){cardEl.classList.toggle('visible',show)}

  function clearMarkers(){markers.forEach(m=>map.removeLayer(m));markers=[]}

  function renderPoints(points){
    clearMarkers();
    const filtered=activeFilter==='all'?points:points.filter(p=>{
      if(activeFilter==='parcel_locker')return p.type&&p.type.includes('parcel_locker');
      if(activeFilter==='pop')return p.type&&p.type.includes('pop');
      return true;
    });
    filtered.forEach(p=>{
      if(!p.location||!p.location.latitude)return;
      const isLocker=p.type&&p.type.includes('parcel_locker');
      const m=L.marker([p.location.latitude,p.location.longitude],{icon:isLocker?lockerIcon:popIcon});
      m.on('click',()=>selectPoint(p));
      m.addTo(map);
      markers.push(m);
    });
  }

  function selectPoint(p){
    selectedPoint=p;
    const isLocker=p.type&&p.type.includes('parcel_locker');
    document.getElementById('cardBadge').textContent=isLocker?'Paczkomat\\u00AE':'PaczkoPunkt';
    document.getElementById('cardBadge').className='type-badge '+(isLocker?'locker':'pop');
    document.getElementById('cardName').textContent=p.name||'';
    document.getElementById('cardAddr1').textContent=(p.address_details?p.address_details.street+' '+(p.address_details.building_number||''):'')|| (p.address?p.address.line1:'');
    document.getElementById('cardAddr2').textContent=(p.address_details?p.address_details.post_code+' '+p.address_details.city:'')|| (p.address?p.address.line2:'');
    showCard(true);
    map.setView([p.location.latitude,p.location.longitude],16);
  }

  async function loadPoints(lat,lng){
    showLoading(true);
    try{
      const url=INPOST_API+'?relative_point='+lat+','+lng+'&type%5B%5D=parcel_locker&type%5B%5D=pop&per_page=100';
      const resp=await fetch(url);
      if(!resp.ok)throw new Error('API error '+resp.status);
      const data=await resp.json();
      allPoints=data.items||[];
      renderPoints(allPoints);
    }catch(e){console.error('Failed to load points',e);document.getElementById('loading').textContent='Blad ladowania: '+e.message}
    showLoading(false);
  }

  async function searchAddress(query){
    try{
      const resp=await fetch('https://nominatim.openstreetmap.org/search?format=json&countrycodes=pl&limit=1&q='+encodeURIComponent(query));
      const results=await resp.json();
      if(results&&results.length>0){
        const r=results[0];
        map.setView([parseFloat(r.lat),parseFloat(r.lon)],14);
        loadPoints(r.lat,r.lon);
      }
    }catch(e){console.error('Geocode error',e)}
  }

  function geolocate(){
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lng=pos.coords.longitude;
      map.setView([lat,lng],14);
      if(userMarker)map.removeLayer(userMarker);
      userMarker=L.circleMarker([lat,lng],{radius:8,fillColor:'#4285F4',fillOpacity:1,color:'#fff',weight:3}).addTo(map);
      loadPoints(lat,lng);
    },err=>console.error('Geolocation error',err),{enableHighAccuracy:true,timeout:10000});
  }

  // Event listeners
  document.getElementById('locateBtn').addEventListener('click',geolocate);
  document.getElementById('closeCard').addEventListener('click',()=>showCard(false));
  document.getElementById('selectBtn').addEventListener('click',()=>{
    if(!selectedPoint)return;
    const p=selectedPoint;
    const msg={type:'POINT_SELECTED',point:{
      name:p.name,
      address:{line1:(p.address_details?p.address_details.street+' '+(p.address_details.building_number||''):p.address?p.address.line1:''),line2:(p.address_details?p.address_details.post_code+' '+p.address_details.city:p.address?p.address.line2:'')},
      address_details:p.address_details||{city:p.address?p.address.line2:'',street:p.address?p.address.line1:'',building_number:'',post_code:''}
    }};
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  });

  searchEl.addEventListener('input',()=>{
    clearTimeout(searchTimeout);
    const q=searchEl.value.trim();
    if(q.length>=3)searchTimeout=setTimeout(()=>searchAddress(q),600);
  });

  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter=btn.dataset.type;
      renderPoints(allPoints);
    });
  });

  let moveTimeout=null;
  map.on('moveend',()=>{
    clearTimeout(moveTimeout);
    moveTimeout=setTimeout(()=>{
      const c=map.getCenter();
      if(map.getZoom()>=11)loadPoints(c.lat,c.lng);
    },400);
  });

  // Initial load
  loadPoints(52.2297,21.0122);
})();
<\/script>
</body>
</html>`);
});

// Proxy InPost API to avoid CORS issues in WebView
app.get('/api/inpost-points', async (req, res) => {
  try {
    const lat = req.query.lat || '52.2297';
    const lng = req.query.lng || '21.0122';
    const perPage = req.query.per_page || '100';
    const params = new URLSearchParams();
    params.append('relative_point', `${lat},${lng}`);
    params.append('type[]', 'parcel_locker');
    params.append('type[]', 'pop');
    params.append('per_page', String(perPage));
    const url = `https://api-shipx-pl.easypack24.net/v1/points?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('InPost proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch InPost points' });
  }
});

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'http://localhost:5000'],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for API
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded from other origins
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
// Note: Production domains should be configured via FRONTEND_URL environment variable
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

// Parse FRONTEND_URL if it's a comma-separated string
if (process.env.FRONTEND_URL) {
  const frontendUrls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
  allowedOrigins.push(...frontendUrls);
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Session-Id', 'X-CSRF-Token', 'X-Platform', 'X-Cart-Id'],
};

// Middleware
app.use(cors(corsOptions));

// Custom JSON parser that preserves raw body for webhook signature verification
app.use(express.json({ 
  limit: '10mb',
  verify: (req: any, res, buf) => {
    // Store raw body for webhook signature verification
    // Only for webhook endpoints
    if (req.url?.includes('/webhooks/')) {
      req.rawBody = buf.toString('utf-8');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiting to all routes
app.use(generalRateLimiter);

// Health check endpoint (skip rate limiter)
const BUILD_VERSION = '2026-04-13-v10';
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: BUILD_VERSION, timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: BUILD_VERSION, timestamp: new Date().toISOString() });
});

// Diagnostic endpoint to verify compiled code
app.get('/api/debug-prefix', async (req, res) => {
  try {
    const { baselinkerService } = require('./services/baselinker.service');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 1. Test prefix mapping
    const testNames = ['Forcetop', 'Leker', 'Hurtownia Przemysłowa', 'BTP', 'HP'];
    const prefixes: Record<string, string> = {};
    for (const name of testNames) {
      prefixes[name] = (baselinkerService as any).getInventoryPrefix(name);
    }

    // 2. Count DB products by prefix
    const dbCounts: Record<string, number> = {};
    for (const pfx of ['btp-', 'leker-', 'hp-', 'outlet-']) {
      dbCounts[pfx] = await prisma.product.count({ where: { baselinkerProductId: { startsWith: pfx } } });
    }
    const totalWithBlId = await prisma.product.count({ where: { baselinkerProductId: { not: null } } });

    // 3. Test matching: simulate what syncProducts does for Forcetop
    const existingProducts = await prisma.product.findMany({
      where: { baselinkerProductId: { not: null } },
      select: { baselinkerProductId: true },
    });
    const existingMap = new Map(existingProducts.map((p: any) => [p.baselinkerProductId, true]));

    // Sample BL product IDs from Forcetop (known IDs)
    const sampleBlIds = ['212547476', '212547477', '212547478', '212547479', '212547481'];
    const matchTest: Record<string, any> = {};
    for (const blId of sampleBlIds) {
      const withPrefix = `btp-${blId}`;
      const withoutPrefix = blId;
      matchTest[blId] = {
        'btp-id': withPrefix,
        'found_with_prefix': existingMap.has(withPrefix),
        'found_without_prefix': existingMap.has(withoutPrefix),
      };
    }

    // 4. Check stored config
    const config = await prisma.baselinkerConfig.findFirst({ select: { inventoryId: true } });

    // 5. Check existingMap size and sample keys
    const mapKeys = Array.from(existingMap.keys()).slice(0, 10);

    await prisma.$disconnect();

    res.json({
      version: BUILD_VERSION,
      prefixes,
      dbCounts,
      totalWithBlId,
      existingMapSize: existingMap.size,
      sampleMapKeys: mapKeys,
      matchTest,
      storedInventoryId: config?.inventoryId || 'NOT SET',
    });
  } catch (err) {
    res.json({ version: BUILD_VERSION, error: String(err) });
  }
});

// Check compiled JS file content
app.get('/api/debug-compiled', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const jsFile = path.join(__dirname, 'services', 'baselinker.service.js');
    const content = fs.readFileSync(jsFile, 'utf8');
    
    // Search for key patterns
    const hasInvId = content.includes('[invId:');
    const hasForcetop = content.includes("'forcetop'");
    const hasBtpPrefix = content.includes("'btp-'");
    const hasDebugSamples = content.includes('debugSamples');
    const hasPrefixMatch = content.includes('prefixMatchCount');
    
    // Find the getInventoryPrefix function
    const prefixFnMatch = content.match(/getInventoryPrefix[\s\S]{0,500}/);
    
    // Find the "Synchronizacja produktów" message
    const syncMsgMatch = content.match(/Synchronizacja produkt[\s\S]{0,200}/);
    
    res.json({
      version: BUILD_VERSION,
      fileExists: true,
      fileSize: content.length,
      checks: { hasInvId, hasForcetop, hasBtpPrefix, hasDebugSamples, hasPrefixMatch },
      getInventoryPrefixSnippet: prefixFnMatch ? prefixFnMatch[0].substring(0, 300) : 'NOT FOUND',
      syncMessageSnippet: syncMsgMatch ? syncMsgMatch[0].substring(0, 200) : 'NOT FOUND',
    });
  } catch (err) {
    res.json({ version: BUILD_VERSION, error: String(err) });
  }
});

// Detailed health checks
app.use('/api/health', healthRoutes);

// =====================================================================
// SELF-CONTAINED PRODUCT UPDATE ENDPOINT
// Uses WholesalerConfigService for dynamic prefix/warehouse resolution
// =====================================================================

// Helper: call Baselinker API
async function callBaselinkerAPI(apiToken: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const formData = new URLSearchParams();
  formData.append('method', method);
  formData.append('parameters', JSON.stringify(params));

  const response = await fetch('https://api.baselinker.com/connector.php', {
    method: 'POST',
    headers: {
      'X-BLToken': apiToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
    signal: AbortSignal.timeout(60000),
  });

  const data = await response.json();
  if (data.status === 'ERROR') {
    throw new Error(`Baselinker API error: ${data.error_message || data.error_code || 'Unknown'}`);
  }
  return data;
}

// POST /api/admin/direct-update - self-contained product update
app.post('/api/admin/direct-update', async (req, res) => {
  try {
    // 1. Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token wymagany' });
    }
    const token = authHeader.substring(7);
    const { secureAuthService } = await import('./services/auth.service.secure');
    const payload = await secureAuthService.verifyAccessToken(token);
    if (payload.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Brak uprawnień' });
    }

    const { inventoryId } = req.body;
    if (!inventoryId) {
      return res.status(400).json({ message: 'inventoryId jest wymagany' });
    }

    // 2. Get Baselinker token from DB
    const { prisma } = await import('./db');
    const { decryptToken } = await import('./lib/encryption');
    const config = await prisma.baselinkerConfig.findFirst();
    if (!config) {
      return res.status(400).json({ message: 'Brak konfiguracji Baselinker' });
    }

    let apiToken: string;
    try {
      apiToken = decryptToken(config.apiTokenEncrypted, config.encryptionIv, config.authTag);
    } catch {
      apiToken = process.env.BASELINKER_API_TOKEN || '';
      if (!apiToken) {
        return res.status(500).json({ message: 'Nie udalo się odszyfrować tokena Baselinker' });
      }
    }

    // 3. Create sync log
    const { BaselinkerSyncStatus } = await import('@prisma/client');
    const syncLog = await prisma.baselinkerSyncLog.create({
      data: { type: 'PRODUCTS', status: BaselinkerSyncStatus.RUNNING },
    });
    const syncLogId = syncLog.id;

    // 4. Get syncProgress manager
    const { syncProgress } = await import('./services/sync-progress');

    // Send initial response with syncLogId
    res.json({ syncLogId, message: 'Direct update started' });

    // 5. Run sync in background
    (async () => {
      try {
        // Get inventory name from Baselinker
        syncProgress.sendProgress(syncLogId, {
          type: 'phase',
          message: `Rozpoczynanie synchronizacji products (update-only)...`,
          phase: 'init',
          mode: 'update-only',
        });

        const inventoriesData = await callBaselinkerAPI(apiToken, 'getInventories');
        const allInventories = inventoriesData.inventories || [];
        const currentInventory = allInventories.find((inv: any) => inv.inventory_id.toString() === inventoryId.toString());

        if (!currentInventory) {
          syncProgress.sendProgress(syncLogId, { type: 'error', message: `Nie znaleziono magazynu o ID ${inventoryId}` });
          await prisma.baselinkerSyncLog.update({ where: { id: syncLogId }, data: { status: BaselinkerSyncStatus.FAILED, errors: ['Inventory not found'], completedAt: new Date() } });
          return;
        }

        const invName = currentInventory.name.trim();
        const { wholesalerConfigService } = await import('./services/wholesaler-config.service');
        const prefix = await wholesalerConfigService.getInventoryPrefix(invName);
        const warehouseKey = await wholesalerConfigService.getWarehouseKey(invName);
        const skuPrefix = await wholesalerConfigService.getSkuPrefix(invName);

        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Magazyn: ${invName} (ID: ${inventoryId}), prefix: "${prefix}", warehouse: ${warehouseKey || 'unknown'}, skuPrefix: "${skuPrefix}"`,
        });

        console.log(`[DirectUpdate] Inventory: ${invName}, prefix: "${prefix}", warehouse: ${warehouseKey}`);

        // 6. Get ALL product IDs from Baselinker (paginated)
        syncProgress.sendProgress(syncLogId, {
          type: 'phase',
          message: `Synchronizacja produktów...`,
          phase: 'products',
        });

        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Pobieranie listy produktów z Baselinker (tryb: update-only)...`,
        });

        const allBlProducts: Array<{ id: number; sku: string; ean: string; name: string; quantity: number; price: number }> = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const listData = await callBaselinkerAPI(apiToken, 'getInventoryProductsList', {
            inventory_id: parseInt(inventoryId),
            page,
          });

          const products = listData.products || {};
          const productArray = Object.entries(products).map(([id, data]: [string, any]) => ({
            id: parseInt(id),
            sku: data.sku || '',
            ean: data.ean || '',
            name: data.name || '',
            quantity: data.quantity || 0,
            price: data.price || 0,
          }));

          allBlProducts.push(...productArray);
          hasMore = productArray.length >= 1000;
          page++;

          if (syncProgress.isAborted(syncLogId)) {
            syncProgress.sendProgress(syncLogId, { type: 'aborted', message: 'Synchronizacja przerwana przez użytkownika' });
            await prisma.baselinkerSyncLog.update({ where: { id: syncLogId }, data: { status: BaselinkerSyncStatus.FAILED, errors: ['Aborted by user'], completedAt: new Date() } });
            return;
          }
        }

        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Pobrano ${allBlProducts.length} produktów z Baselinker.`,
        });

        // 7. Load existing products from DB - ONLY with matching prefix
        const existingProducts = await prisma.product.findMany({
          where: prefix
            ? { baselinkerProductId: { startsWith: prefix } }
            : { baselinkerProductId: { not: null } },
          select: {
            id: true,
            baselinkerProductId: true,
            name: true,
            sku: true,
            barcode: true,
            price: true,
          },
        });

        const existingMap = new Map(
          existingProducts.map((p: any) => [p.baselinkerProductId as string, p])
        );

        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Baza: ${existingProducts.length} produktów z prefixem "${prefix}"`,
        });

        console.log(`[DirectUpdate] DB products with prefix "${prefix}": ${existingProducts.length}`);

        // 8. Match BL products to DB products
        const productsToUpdate: Array<{ blProduct: any; dbProduct: any }> = [];
        let skipped = 0;
        const debugSamples: string[] = [];

        for (const blProduct of allBlProducts) {
          const blIdRaw = blProduct.id.toString();
          const blId = `${prefix}${blIdRaw}`;
          const existing = existingMap.get(blId);

          if (debugSamples.length < 5) {
            debugSamples.push(`BL:${blIdRaw} → "${blId}" → ${existing ? 'FOUND (' + existing.name?.substring(0, 30) + ')' : 'NOT FOUND'}`);
          }

          if (existing) {
            productsToUpdate.push({ blProduct, dbProduct: existing });
          } else {
            skipped++;
          }
        }

        // Log debug samples
        for (const sample of debugSamples) {
          syncProgress.sendProgress(syncLogId, { type: 'info', message: `[DEBUG] ${sample}` });
          console.log(`[DirectUpdate] ${sample}`);
        }

        syncProgress.sendProgress(syncLogId, {
          type: 'info',
          message: `Znaleziono ${productsToUpdate.length} produktów do aktualizacji, ${skipped} pominiętych (nie istnieje w bazie)`,
          current: 0,
          total: productsToUpdate.length,
          percent: 0,
        });

        console.log(`[DirectUpdate] To update: ${productsToUpdate.length}, skipped: ${skipped}`);

        if (productsToUpdate.length === 0) {
          syncProgress.sendProgress(syncLogId, {
            type: 'warning',
            message: `Brak produktów do aktualizacji. Sprawdź czy prefix "${prefix}" jest poprawny.`,
          });
          syncProgress.sendProgress(syncLogId, { type: 'complete', message: 'Synchronizacja zakończona (0 produktów)' });
          await prisma.baselinkerSyncLog.update({ where: { id: syncLogId }, data: { status: 'SUCCESS' as any, itemsProcessed: 0, completedAt: new Date() } });
          return;
        }

        // 9. Fetch full product data from Baselinker in batches and update DB
        const BATCH_SIZE = 50;
        let processed = 0;
        let updated = 0;
        let errors = 0;

        for (let i = 0; i < productsToUpdate.length; i += BATCH_SIZE) {
          if (syncProgress.isAborted(syncLogId)) {
            syncProgress.sendProgress(syncLogId, { type: 'aborted', message: `Przerwano po ${processed} produktach` });
            await prisma.baselinkerSyncLog.update({ where: { id: syncLogId }, data: { status: BaselinkerSyncStatus.FAILED, errors: ['Aborted'], completedAt: new Date() } });
            return;
          }

          const batch = productsToUpdate.slice(i, i + BATCH_SIZE);
          const blIds = batch.map(b => b.blProduct.id);

          try {
            // Get detailed product data from Baselinker
            const detailData = await callBaselinkerAPI(apiToken, 'getInventoryProductsData', {
              inventory_id: parseInt(inventoryId),
              products: blIds,
            });

            const productsData = detailData.products || {};

            for (const item of batch) {
              try {
                const blDetail = productsData[item.blProduct.id.toString()];
                if (!blDetail) {
                  processed++;
                  continue;
                }

                // Extract product data
                let productName = '';
                if (blDetail.text_fields) {
                  productName = blDetail.text_fields.name || '';
                  if (!productName && blDetail.text_fields['pl']?.name) {
                    productName = blDetail.text_fields['pl'].name;
                  }
                  if (!productName) {
                    for (const langCode of Object.keys(blDetail.text_fields)) {
                      const tf = blDetail.text_fields[langCode];
                      if (typeof tf === 'object' && tf?.name) {
                        productName = tf.name;
                        break;
                      }
                    }
                  }
                }
                if (!productName) productName = blDetail.name || item.blProduct.name || '';

                // Description
                let description = '';
                if (blDetail.text_fields) {
                  description = blDetail.text_fields.description || blDetail.text_fields.extra_field_1 || '';
                  if (!description && blDetail.text_fields['pl']) {
                    description = blDetail.text_fields['pl'].description || blDetail.text_fields['pl'].extra_field_1 || '';
                  }
                }

                // Price
                let price = 0;
                if (blDetail.prices && typeof blDetail.prices === 'object') {
                  const priceValues = Object.values(blDetail.prices).map((p: any) => parseFloat(String(p))).filter((p: number) => p > 0);
                  price = priceValues.length > 0 ? priceValues[0] : 0;
                }
                if (price === 0 && blDetail.price_brutto) {
                  price = parseFloat(blDetail.price_brutto) || 0;
                }

                // EAN
                const ean = (blDetail.ean && String(blDetail.ean).trim()) || null;

                // SKU
                const blSku = blDetail.sku || item.blProduct.sku || '';

                // Build update data - only update what's changed
                const updateData: Record<string, any> = {};
                
                if (productName && productName !== item.dbProduct.name) {
                  updateData.name = productName;
                }
                if (ean && ean !== item.dbProduct.barcode) {
                  updateData.barcode = ean;
                }
                if (description) {
                  updateData.description = description;
                }
                if (price > 0 && Math.abs(price - parseFloat(item.dbProduct.price?.toString() || '0')) > 0.01) {
                  updateData.price = price;
                }

                if (Object.keys(updateData).length > 0) {
                  await prisma.product.update({
                    where: { id: item.dbProduct.id },
                    data: updateData,
                  });
                  updated++;
                }

                processed++;
                const percent = Math.round((processed / productsToUpdate.length) * 100);
                
                if (processed % 50 === 0 || processed === productsToUpdate.length) {
                  syncProgress.sendProgress(syncLogId, {
                    type: 'progress',
                    message: `Zaktualizowano ${processed}/${productsToUpdate.length}...`,
                    current: processed,
                    total: productsToUpdate.length,
                    percent,
                    productName: productName?.substring(0, 60),
                    sku: blSku,
                  });
                }
              } catch (productErr) {
                errors++;
                processed++;
                console.error(`[DirectUpdate] Error updating product ${item.blProduct.id}:`, productErr);
              }
            }
          } catch (batchErr) {
            console.error(`[DirectUpdate] Batch error:`, batchErr);
            syncProgress.sendProgress(syncLogId, {
              type: 'error',
              message: `Błąd pobierania partii: ${batchErr instanceof Error ? batchErr.message : 'Unknown'}`,
            });
            errors++;
            processed += batch.length;
          }

          // Rate limit: small delay between batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 10. Sync stock
        syncProgress.sendProgress(syncLogId, {
          type: 'phase',
          message: 'Synchronizacja stanów magazynowych...',
          phase: 'stock',
        });

        try {
          // Get default location (MAIN warehouse)
          let defaultLocation = await prisma.location.findFirst({
            where: { code: 'MAIN', type: 'WAREHOUSE', isActive: true },
          });
          if (!defaultLocation) {
            defaultLocation = await prisma.location.create({
              data: { name: 'Magazyn główny', code: 'MAIN', type: 'WAREHOUSE', isActive: true },
            });
          }

          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `📦 Pobieranie stanów z magazynu: ${invName}...`,
          });

          const stockData = await callBaselinkerAPI(apiToken, 'getInventoryProductsStock', {
            inventory_id: parseInt(inventoryId),
            page: 1,
          });

          const stockProducts = stockData.products || {};
          let stockUpdated = 0;

          for (const [blIdRaw, warehouses] of Object.entries(stockProducts)) {
            const blId = `${prefix}${blIdRaw}`;
            const dbProduct = existingMap.get(blId);
            if (!dbProduct) continue;

            // Get total stock across all warehouses
            let totalStock = 0;
            if (typeof warehouses === 'object') {
              for (const qty of Object.values(warehouses as Record<string, number>)) {
                totalStock += Number(qty) || 0;
              }
            }

            // Update inventory for default variant
            const variant = await prisma.productVariant.findFirst({
              where: { productId: dbProduct.id },
              select: { id: true },
            });

            if (variant) {
              await prisma.inventory.upsert({
                where: {
                  variantId_locationId: {
                    variantId: variant.id,
                    locationId: defaultLocation.id,
                  },
                },
                create: {
                  variantId: variant.id,
                  locationId: defaultLocation.id,
                  quantity: totalStock,
                  reserved: 0,
                  minimum: 0,
                },
                update: { quantity: totalStock },
              });
              stockUpdated++;
            }
          }

          syncProgress.sendProgress(syncLogId, {
            type: 'info',
            message: `📦 Forcetop: pobrano ${Object.keys(stockProducts).length} pozycji, dopasowywanie...`,
          });

          syncProgress.sendProgress(syncLogId, {
            type: 'success',
            message: `Zaktualizowano stany magazynowe dla ${stockUpdated} produktów`,
          });
        } catch (stockErr) {
          syncProgress.sendProgress(syncLogId, {
            type: 'error',
            message: `Błąd synchronizacji stanów: ${stockErr instanceof Error ? stockErr.message : 'Unknown'}`,
          });
        }

        // 11. Done
        syncProgress.sendProgress(syncLogId, {
          type: 'complete',
          message: `Synchronizacja zakończona! Zaktualizowano ${updated} produktów, ${errors} błędów.`,
          current: processed,
          total: productsToUpdate.length,
          percent: 100,
        });

        await prisma.baselinkerSyncLog.update({
          where: { id: syncLogId },
          data: {
            status: 'SUCCESS' as any,
            itemsProcessed: processed,
            completedAt: new Date(),
          },
        });

        console.log(`[DirectUpdate] Done! Updated: ${updated}, errors: ${errors}, skipped: ${skipped}`);

      } catch (err) {
        console.error('[DirectUpdate] Fatal error:', err);
        syncProgress.sendProgress(syncLogId, {
          type: 'error',
          message: `Błąd synchronizacji: ${err instanceof Error ? err.message : 'Unknown'}`,
        });
        await prisma.baselinkerSyncLog.update({
          where: { id: syncLogId },
          data: { status: BaselinkerSyncStatus.FAILED, errors: [String(err)], completedAt: new Date() },
        });
      }
    })();

  } catch (err) {
    console.error('[DirectUpdate] Setup error:', err);
    res.status(500).json({ message: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
  }
});

// SSE progress endpoint for direct-update (shared with baselinker sync progress)
// Uses the same syncProgress manager - clients connect via /api/admin/baselinker/sync/progress/:syncLogId

// Root endpoint - API info
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'WBTrade API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      categories: '/api/categories',
      search: '/api/search',
      orders: '/api/orders',
      cart: '/api/cart',
      inventory: '/api/inventory',
      addresses: '/api/addresses',
      wishlist: '/api/wishlist',
      dashboard: '/api/dashboard',
      health: '/health',
    },
    documentation: 'https://github.com/wbtrade/docs',
  });
});

// API Routes - Auth with enhanced security
app.use('/api/auth', authSecureRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/shopping-lists', shoppingListRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/manufacturers', manufacturersRoutes);
// Direct webhook endpoints for payment providers
app.post('/api/webhooks/payu', payuWebhook);
app.use('/api/webhooks/email-inbound', emailInboundRoutes); // Resend inbound email webhook
app.use('/api/webhooks', checkoutRoutes); // Other webhook routes
app.use('/api/admin/dashboard', adminDashboardRoutes); // Admin dashboard
app.use('/api/admin/settings', adminSettingsRoutes); // Admin settings (carousels, etc.)
app.use('/api/admin/coupons', adminCouponsRoutes); // Admin coupons management
app.use('/api/admin/sale-campaigns', adminSaleCampaignsRoutes); // Sale campaigns (przeceny)
app.use('/api/admin/notifications', adminNotificationsRoutes); // Admin notifications
app.use('/api/admin/newsletter', adminNewsletterRoutes); // Admin newsletter management
app.use('/api/admin/activity-log', adminActivityLogRoutes); // Admin activity log / audit trail
app.use('/api/admin/omnibus', adminOmnibusRoutes); // Admin Omnibus + top products
app.use('/api/admin/warehouse', adminWarehouseRoutes); // Admin WMS warehouse management
app.use('/api/admin/reviews', adminReviewsRoutes); // Admin reviews management
app.use('/api/carousels', carouselsRoutes); // Dynamic carousels (public + admin)
app.use('/api/admin/baselinker', baselinkerRoutes); // Baselinker integration
app.use('/api/newsletter', newsletterRoutes); // Newsletter subscription
app.use('/api/contact', contactRoutes); // Contact forms & complaints
app.use('/api/reports', reportsRoutes); // Reports
app.use('/api/locations', locationsRoutes); // Warehouse locations
app.use('/api/users', usersRoutes); // Users management
app.use('/api/upload', uploadRoutes); // File uploads
app.use('/api/price-history', priceHistoryRoutes); // Omnibus price history
app.use('/api/feed', feedRoutes); // Google Merchant / Product feeds
app.use('/api/coupons', couponsRoutes); // User coupons / discounts
app.use('/api/loyalty', loyaltyRoutes); // User loyalty program
app.use('/api/admin/loyalty', adminLoyaltyRoutes); // Admin loyalty management
app.use('/api/chatbot', chatbotRoutes); // WuBuś chatbot unmatched questions
app.use('/api/support', supportRoutes); // Customer support messaging
app.use('/api/admin/support', adminSupportRoutes); // Admin support management
app.use('/api/admin/sync', adminSyncRoutes); // Admin manual XML price sync
app.use('/api/admin/categories', adminCategoriesRoutes); // Admin categories management
app.use('/api/admin/returns', adminReturnsRoutes); // Admin returns management
app.use('/api/admin/delivery-delays', adminDeliveryDelaysRoutes); // Admin delivery delay alerts
app.use('/api/admin/email-templates', adminEmailTemplatesRoutes); // Admin email templates management
app.use('/api/notifications', userNotificationsRoutes); // User in-app notifications
app.use('/api/img', imageProxyRoutes); // Image proxy with disk cache
app.use('/api/admin/wholesalers', adminWholesalersRoutes); // Admin wholesaler management
app.use('/api/wholesalers', wholesalersRoutes); // Public wholesaler config

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Preload wholesaler config cache so transformProduct has data
  try {
    const { wholesalerConfigService } = await import('./services/wholesaler-config.service');
    const configs = await wholesalerConfigService.getAll();
    console.log(`✅ Wholesaler config loaded: ${configs.length} active wholesalers`);
  } catch (err) {
    console.error('⚠️ Failed to preload wholesaler config:', err);
  }
  // Global error handlers to prevent silent crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // Don't exit — keep the server running
  });
  
  // Initialize Redis connection
  let redisAvailable = false;
  try {
    console.log('🔗 Initializing Redis connection...');
    const { getRedisClient } = await import('./lib/redis');
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      console.log('✅ Redis connection verified');
      redisAvailable = true;
      // Wyczyść cache kategorii przy starcie serwera — nowa wersja kodu wymaga świeżych danych
      const { invalidateCategoryCache } = await import('./lib/cache');
      await invalidateCategoryCache();
      console.log('✅ Category cache cleared on startup');
    } else {
      console.warn('⚠️  Redis unavailable - app will run without caching/workers');
    }
  } catch (error: any) {
    console.error('❌ Redis initialization failed:', error?.message || error);
    if (error?.message?.includes('max requests limit')) {
      console.warn('⚠️  Redis limit exceeded - app will run without caching/workers');
    } else if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
      console.error('💥 CRITICAL: REDIS_URL is not set in production!');
    }
    console.warn('⚠️  Application will continue but Redis-dependent features disabled');
  }
  
  // Initialize Meilisearch
  await initializeMeilisearch();
  
  // Auto-reindex if Meilisearch index is empty (e.g. after Render redeploy)
  if (isMeilisearchAvailable()) {
    try {
      const stats = await meiliClient.index(PRODUCTS_INDEX).getStats();
      if (stats.numberOfDocuments === 0) {
        console.log('⚠️  Meilisearch index is empty — starting automatic reindex in background...');
        // Run in background so it doesn't block server startup
        import('./services/search.service').then(async ({ SearchService }) => {
          try {
            const svc = new SearchService();
            const result = await svc.reindexAllProducts();
            console.log(`✅ Auto-reindex completed: ${result.indexed} products indexed (task: ${result.taskUid})`);
          } catch (err) {
            console.error('❌ Auto-reindex failed:', err instanceof Error ? err.message : err);
          }
        });
      } else {
        console.log(`✅ Meilisearch index has ${stats.numberOfDocuments} documents — skipping reindex`);
      }
    } catch (err) {
      console.warn('⚠️  Could not check Meilisearch index stats:', err instanceof Error ? err.message : err);
    }
  }
  
  // Start background cron jobs (only essential ones)
  console.log('⚙️  Starting cron jobs...');
  try {
    // 1. Reservation cleanup - every 5 minutes (requires Redis/BullMQ)
    if (redisAvailable) {
      await scheduleReservationCleanup();
      console.log('✅ Reservation cleanup scheduled (every 5 minutes)');
    } else {
      console.log('⚠️  Reservation cleanup skipped (Redis unavailable)');
    }
    
    // 2. Baselinker order status sync + delivery tracking
    //    Try BullMQ (requires Redis) → fallback to setInterval if Redis unavailable
    //    Workers only run in production (on Render) - not locally to avoid competing with prod
    const workersEnabled = process.env.NODE_ENV === 'production' || process.env.ENABLE_WORKERS === 'true';
    let bullmqSyncStarted = false;
    if (!workersEnabled) {
      console.log('ℹ️  Workers wyłączone lokalnie (NODE_ENV=development). Ustaw ENABLE_WORKERS=true aby włączyć.');
    }
    if (workersEnabled && redisAvailable) try {
      const { createBaselinkerSyncWorker, scheduleBaselinkerSync } = await import('./workers/baselinker-sync.worker');
      createBaselinkerSyncWorker();
      await scheduleBaselinkerSync();
      bullmqSyncStarted = true;
      console.log('✅ Baselinker sync scheduled via BullMQ (orders: 15min, delivery: 15min, stock: 2h, ceny: 2h)');
    } catch (redisErr) {
      console.warn('⚠️  BullMQ/Redis unavailable — falling back to setInterval for delivery sync:', (redisErr as Error).message);
    }

    // Fallback: setInterval-based sync when Redis/BullMQ is not available
    if (!bullmqSyncStarted && workersEnabled) {
      const { orderStatusSyncService } = await import('./services/order-status-sync.service');
      const { deliveryTrackingService } = await import('./services/delivery-tracking.service');

      // Sync order statuses every 30 minutes
      setInterval(async () => {
        try {
          console.log('[Fallback] Running order status sync...');
          const result = await orderStatusSyncService.syncOrderStatuses(6);
          console.log(`[Fallback] Order status sync: ${result.synced} synced, ${result.skipped} skipped, ${result.errors.length} errors`);
        } catch (e) {
          console.error('[Fallback] Order status sync error:', e);
        }
      }, 30 * 60 * 1000); // 30 minutes

      // Sync delivery tracking every 30 minutes (offset 10 min from order status sync)
      setTimeout(() => {
        setInterval(async () => {
          try {
            console.log('[Fallback] Running delivery tracking sync...');
            const result = await deliveryTrackingService.syncDeliveryStatuses();
            console.log(`[Fallback] Delivery tracking sync: ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
          } catch (e) {
            console.error('[Fallback] Delivery tracking sync error:', e);
          }
        }, 30 * 60 * 1000); // 30 minutes
      }, 10 * 60 * 1000); // offset by 10 min

      // Run initial sync after 2 minutes (to let server fully start)
      setTimeout(async () => {
        try {
          console.log('[Fallback] Running initial order status sync...');
          const result = await orderStatusSyncService.syncOrderStatuses(24);
          console.log(`[Fallback] Initial order status sync: ${result.synced} synced, ${result.skipped} skipped`);
        } catch (e) {
          console.error('[Fallback] Initial order status sync error:', e);
        }
        try {
          console.log('[Fallback] Running initial delivery tracking sync...');
          const result = await deliveryTrackingService.syncDeliveryStatuses();
          console.log(`[Fallback] Initial delivery tracking sync: ${result.updated} updated, ${result.skipped} skipped`);
        } catch (e) {
          console.error('[Fallback] Initial delivery tracking sync error:', e);
        }
      }, 2 * 60 * 1000); // 2 min after start

      console.log('✅ Baselinker sync scheduled via setInterval fallback (every 30 min)');
    }

    // Clean up any RUNNING syncs left over from before this restart
    const { prisma: prismaClient } = await import('./db');
    const { BaselinkerSyncStatus } = await import('@prisma/client');
    const stuckOnStartup = await prismaClient.baselinkerSyncLog.updateMany({
      where: { status: BaselinkerSyncStatus.RUNNING },
      data: {
        status: BaselinkerSyncStatus.FAILED,
        errors: ['Sync przerwany — serwer zrestartował się w trakcie synchronizacji'],
        completedAt: new Date(),
      },
    });
    if (stuckOnStartup.count > 0) {
      console.log(`✅ Marked ${stuckOnStartup.count} stuck sync(s) as FAILED on startup`);
    }

    // Periodic cleanup: mark RUNNING syncs older than 30 min as FAILED (every 10 minutes)
    setInterval(async () => {
      try {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const stuck = await prismaClient.baselinkerSyncLog.updateMany({
          where: {
            status: BaselinkerSyncStatus.RUNNING,
            startedAt: { lt: thirtyMinutesAgo },
          },
          data: {
            status: BaselinkerSyncStatus.FAILED,
            errors: ['Sync przekroczył limit 30 minut — oznaczony jako błąd'],
            completedAt: new Date(),
          },
        });
        if (stuck.count > 0) {
          console.warn(`[SyncCleanup] Marked ${stuck.count} stuck sync(s) as FAILED (>30 min)`);
        }
      } catch (e) {
        console.error('[SyncCleanup] Cleanup interval error:', e);
      }
    }, 10 * 60 * 1000);
    
    // 3. Payment reminder - daily at 10:00 AM (requires Redis/BullMQ)
    if (redisAvailable) {
      const { createPaymentReminderWorker, schedulePaymentReminders } = await import('./workers/payment-reminder.worker');
      createPaymentReminderWorker();
      await schedulePaymentReminders();
      console.log('✅ Payment reminder scheduled (daily at 10:00 AM)');
    } else {
      console.log('⚠️  Payment reminder skipped (Redis unavailable)');
    }
    
    // 4. Newsletter campaign scheduler - every minute (no Redis needed)
    const { startNewsletterScheduler } = await import('./workers/newsletter-campaign.worker');
    startNewsletterScheduler();

    // 5. Loyalty cron worker - birthday/quarterly/monthly coupons
    const { startLoyaltyCronWorker } = await import('./workers/loyalty-cron.worker');
    startLoyaltyCronWorker();

    // 6. Delivery delay detection - every 6 hours (08:00, 14:00, 20:00, 02:00)
    const { deliveryDelayService } = await import('./services/delivery-delay.service');
    setInterval(async () => {
      try {
        console.log('[DeliveryDelayCron] Running delay detection...');
        const result = await deliveryDelayService.detectDelays();
        console.log(`[DeliveryDelayCron] Detection complete: ${result.detected} new alerts, ${result.skipped} skipped`);
      } catch (e) {
        console.error('[DeliveryDelayCron] Error:', e);
      }
    }, 6 * 60 * 60 * 1000); // every 6 hours

    // Run initial delay detection after 3 minutes
    setTimeout(async () => {
      try {
        console.log('[DeliveryDelayCron] Running initial delay detection...');
        const result = await deliveryDelayService.detectDelays();
        console.log(`[DeliveryDelayCron] Initial detection: ${result.detected} new alerts, ${result.skipped} skipped`);
      } catch (e) {
        console.error('[DeliveryDelayCron] Initial detection error:', e);
      }
    }, 3 * 60 * 1000);
    console.log('✅ Delivery delay detection scheduled (every 6 hours)');

    console.log('✅ All cron jobs started');
  } catch (error) {
    console.error('⚠️  Failed to start cron jobs:', error);
    console.warn('⚠️  Application will continue but background sync may not run');
  }
});