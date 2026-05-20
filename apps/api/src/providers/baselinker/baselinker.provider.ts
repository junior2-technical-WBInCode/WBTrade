/**
 * Baselinker REST API Provider
 * 
 * Implements connection to Baselinker API with:
 * - Rate limiting (token bucket algorithm)
 * - Automatic pagination
 * - Retry with exponential backoff
 * 
 * API Documentation: https://api.baselinker.com/
 */

import {
  IBaselinkerProvider,
  BaselinkerProviderConfig,
  BaselinkerInventory,
  BaselinkerCategory,
  BaselinkerProductListItem,
  BaselinkerProductData,
  BaselinkerStockEntry,
  BaselinkerApiResponse,
  BaselinkerAddOrderRequest,
  BaselinkerAddOrderResponse,
  BaselinkerOrderPackage,
} from './baselinker-provider.interface';

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60; // Baselinker allows ~100/min, use 60 for safety
const DEFAULT_RETRY_ATTEMPTS = 5; // Increased retries
const DEFAULT_RETRY_DELAY_MS = 2000; // Increased delay
const PRODUCTS_PER_PAGE = 1000;
const REQUEST_TIMEOUT_MS = 30000; // 30s timeout per API request

/**
 * Token Bucket Rate Limiter
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(maxRequestsPerMinute: number) {
    this.maxTokens = maxRequestsPerMinute;
    this.tokens = maxRequestsPerMinute;
    this.refillRate = maxRequestsPerMinute / 60000; // tokens per ms
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.refillRate;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refill();
    }

    this.tokens -= 1;
  }
}

/**
 * Baselinker API Provider Implementation
 */
export class BaselinkerProvider implements IBaselinkerProvider {
  private config: BaselinkerProviderConfig;
  private rateLimiter: RateLimiter;

  constructor(config: BaselinkerProviderConfig) {
    this.config = {
      ...config,
      maxRequestsPerMinute:
        config.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE,
      retryAttempts: config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs: config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };

    this.rateLimiter = new RateLimiter(this.config.maxRequestsPerMinute!);
  }

  /**
   * Make API request to Baselinker
   */
  private async request<T>(
    method: string,
    parameters: Record<string, any> = {}
  ): Promise<T> {
    await this.rateLimiter.acquire();

    let lastError: Error | null = null;
    console.log(`[Baselinker] Calling API method: ${method}`);

    for (let attempt = 0; attempt < this.config.retryAttempts!; attempt++) {
      try {
        console.log(`[Baselinker] Attempt ${attempt + 1}/${this.config.retryAttempts} for ${method}`);
        const formData = new URLSearchParams();
        formData.append('method', method);
        formData.append('parameters', JSON.stringify(parameters));

        const response = await fetch(BASELINKER_API_URL, {
          method: 'POST',
          headers: {
            'X-BLToken': this.config.apiToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
          console.warn(`Baselinker rate limited. Waiting ${retryAfter}s...`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // Handle server errors with retry
        if (response.status >= 500) {
          const delay = this.config.retryDelayMs! * Math.pow(2, attempt);
          console.warn(`Baselinker server error ${response.status}. Retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        const data: BaselinkerApiResponse<T> = await response.json();

        if (data.status === 'ERROR') {
          // Handle rate limiting error - wait and retry
          if (data.error_message?.includes('Query limit exceeded') || 
              data.error_message?.includes('token blocked')) {
            // Extract wait time from message like "token blocked until 2025-12-24 13:30:04"
            const match = data.error_message.match(/until (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
            let waitMs = 60000; // Default 1 minute
            
            if (match) {
              const blockedUntil = new Date(match[1]);
              waitMs = Math.max(blockedUntil.getTime() - Date.now() + 5000, 10000); // Add 5s buffer, min 10s
            }
            
            console.warn(`Baselinker rate limit hit. Waiting ${Math.round(waitMs / 1000)}s until ${match?.[1] || 'unknown'}...`);
            await this.sleep(waitMs);
            continue; // Retry after waiting
          }
          
          throw new BaselinkerApiError(
            data.error_message || 'Unknown Baselinker error',
            data.error_code || 'UNKNOWN'
          );
        }

        // Baselinker returns data directly in response, not wrapped in 'data' field
        // The response itself is the data we need (after status check)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { status, error_code, error_message, ...responseData } = data as any;
        return responseData as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on API errors (invalid token, bad request, etc.)
        if (error instanceof BaselinkerApiError) {
          throw error;
        }

        // Retry on network errors
        if (attempt < this.config.retryAttempts! - 1) {
          const delay = this.config.retryDelayMs! * Math.pow(2, attempt);
          console.warn(`Baselinker request failed. Retrying in ${delay}ms...`, error);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Baselinker request failed after all retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get all available inventories
   */
  async getInventories(): Promise<BaselinkerInventory[]> {
    const response = await this.request<{ inventories: BaselinkerInventory[] }>(
      'getInventories'
    );
    return response.inventories || [];
  }

  /**
   * Get categories for an inventory
   * Note: BaseLinker returns categories as an array, not as an object keyed by ID
   */
  async getInventoryCategories(inventoryId: string): Promise<BaselinkerCategory[]> {
    const response = await this.request<{ categories: BaselinkerCategory[] }>(
      'getInventoryCategories',
      { inventory_id: parseInt(inventoryId, 10) }
    );

    // Categories are returned as an array directly from API
    // Handle both array format (correct) and object format (legacy/fallback)
    if (Array.isArray(response.categories)) {
      return response.categories;
    }
    
    // Fallback for object format (shouldn't happen with current API)
    console.warn('[Baselinker] Categories returned as object instead of array, converting...');
    return Object.entries(response.categories || {}).map(([id, category]) => ({
      ...(category as BaselinkerCategory),
      category_id: parseInt(id, 10),
    }));
  }

  /**
   * Get paginated list of products
   */
  async getInventoryProductsList(
    inventoryId: string,
    page: number = 1
  ): Promise<{ products: BaselinkerProductListItem[]; hasMore: boolean }> {
    const response = await this.request<{ products: Record<string, BaselinkerProductListItem> }>(
      'getInventoryProductsList',
      {
        inventory_id: parseInt(inventoryId, 10),
        page,
      }
    );

    const products = Object.entries(response.products || {}).map(([id, product]) => ({
      ...product,
      id: parseInt(id, 10),
    }));

    return {
      products,
      hasMore: products.length === PRODUCTS_PER_PAGE,
    };
  }

  /**
   * Get all products with automatic pagination
   */
  async getAllInventoryProducts(
    inventoryId: string,
    onPageFetched?: (page: number, totalSoFar: number) => void,
    shouldAbort?: () => boolean
  ): Promise<BaselinkerProductListItem[]> {
    const allProducts: BaselinkerProductListItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Check for abort between pages
      if (shouldAbort?.()) {
        console.log(`[Baselinker] Product list fetch aborted at page ${page}`);
        throw new Error('ABORTED');
      }
      console.log(`[Baselinker] Fetching product list page ${page}...`);
      const result = await this.getInventoryProductsList(inventoryId, page);
      allProducts.push(...result.products);
      console.log(`[Baselinker] Page ${page}: got ${result.products.length} products (total: ${allProducts.length})`);
      onPageFetched?.(page, allProducts.length);
      hasMore = result.hasMore;
      page++;
    }

    return allProducts;
  }

  /**
   * Get detailed product data for specific product IDs
   */
  async getInventoryProductsData(
    inventoryId: string,
    productIds: number[],
    onChunkFetched?: (chunk: number, totalChunks: number, productsSoFar: number) => void
  ): Promise<BaselinkerProductData[]> {
    if (productIds.length === 0) {
      return [];
    }

    // Baselinker limits to 1000 products per request
    const chunks = this.chunkArray(productIds, 1000);
    const allProducts: BaselinkerProductData[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[Baselinker] Fetching products chunk ${i + 1}/${chunks.length} (${chunk.length} products)`);
      
      const response = await this.request<{ products: Record<string, BaselinkerProductData> }>(
        'getInventoryProductsData',
        {
          inventory_id: parseInt(inventoryId, 10),
          products: chunk,
        }
      );

      const products = Object.entries(response.products || {}).map(([id, product]) => ({
        ...product,
        id: parseInt(id, 10),
      }));

      allProducts.push(...products);
      onChunkFetched?.(i + 1, chunks.length, allProducts.length);
      
      // Add delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await this.sleep(500); // 500ms delay between chunks (rate limiter handles throttling)
      }
    }

    return allProducts;
  }

  /**
   * Get prices for all products in inventory
   */
  async getInventoryProductsPrices(inventoryId: string): Promise<Record<string, Record<string, number>>> {
    const allPrices: Record<string, Record<string, number>> = {};
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.request<{ products: Record<string, Record<string, number>> }>(
        'getInventoryProductsPrices',
        {
          inventory_id: parseInt(inventoryId, 10),
          page,
        }
      );

      const products = response.products || {};
      const entries = Object.entries(products);
      for (const [id, productData] of entries) {
        // BL returns {product_id, prices: {groupId: price}} — extract the prices sub-object
        allPrices[id] = (productData as any).prices || productData;
      }
      hasMore = entries.length === PRODUCTS_PER_PAGE;
      page++;
    }

    return allPrices;
  }

  /**
   * Get stock levels for all products in inventory
   */
  async getInventoryProductsStock(inventoryId: string): Promise<BaselinkerStockEntry[]> {
    const allStock: BaselinkerStockEntry[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.request<{ products: Record<string, any> }>(
        'getInventoryProductsStock',
        {
          inventory_id: parseInt(inventoryId, 10),
          page,
        }
      );

      const entries = Object.entries(response.products || {}).map(([id, data]) => ({
        product_id: parseInt(id, 10),
        variant_id: 0,
        stock: data.stock || {},
        reservations: data.reservations || {},
      }));

      allStock.push(...entries);
      hasMore = entries.length === PRODUCTS_PER_PAGE;
      page++;
    }

    return allStock;
  }

  /**
   * Test connection to Baselinker API
   */
  async testConnection(): Promise<boolean> {
    try {
      const inventories = await this.getInventories();
      return Array.isArray(inventories);
    } catch (error) {
      console.error('Baselinker connection test failed:', error);
      return false;
    }
  }

  /**
   * Add order to Baselinker
   * This automatically decreases stock in Baselinker inventory when products
   * are linked to the inventory (storage='bl')
   * 
   * @param orderData - Order data following Baselinker addOrder API format
   * @returns Object containing the new order_id from Baselinker
   */
  async addOrder(orderData: BaselinkerAddOrderRequest): Promise<BaselinkerAddOrderResponse> {
    console.log('[Baselinker] Adding order to Baselinker:', {
      productsCount: orderData.products.length,
      email: orderData.email,
      deliveryMethod: orderData.delivery_method,
    });

    const response = await this.request<BaselinkerAddOrderResponse>('addOrder', orderData);
    
    console.log('[Baselinker] Order added successfully, order_id:', response.order_id);
    
    return response;
  }

  /**
   * Update stock levels for products in inventory
   * Use this for manual stock adjustments or when not using addOrder
   * 
   * @param inventoryId - The inventory ID
   * @param products - Map of product_id to warehouse stock levels
   *                   Format: { "product_id": { "warehouse_id": stock_quantity } }
   */
  async updateInventoryProductsStock(
    inventoryId: string,
    products: Record<string, Record<string, number>>
  ): Promise<void> {
    console.log('[Baselinker] Updating stock for', Object.keys(products).length, 'products');

    await this.request('updateInventoryProductsStock', {
      inventory_id: parseInt(inventoryId, 10),
      products,
    });

    console.log('[Baselinker] Stock updated successfully');
  }

  /**
   * Set order status in Baselinker
   * @param orderId - Baselinker order ID
   * @param statusId - New status ID
   */
  async setOrderStatus(orderId: string | number, statusId: number): Promise<void> {
    console.log(`[Baselinker] Setting order ${orderId} status to ${statusId}`);

    await this.request('setOrderStatus', {
      order_id: typeof orderId === 'string' ? parseInt(orderId, 10) : orderId,
      status_id: statusId,
    });

    console.log(`[Baselinker] Order ${orderId} status updated to ${statusId}`);
  }

  /**
   * Set order payment in Baselinker
   * @param orderId - Baselinker order ID
   * @param paymentDone - Amount paid
   * @param paymentDate - Payment date (unix timestamp)
   * @param paymentComment - Optional comment
   */
  async setOrderPayment(
    orderId: string | number, 
    paymentDone: number, 
    paymentDate?: number,
    paymentComment?: string
  ): Promise<void> {
    console.log(`[Baselinker] Setting order ${orderId} payment to ${paymentDone} PLN`);

    await this.request('setOrderPayment', {
      order_id: typeof orderId === 'string' ? parseInt(orderId, 10) : orderId,
      payment_done: paymentDone,
      payment_date: paymentDate || Math.floor(Date.now() / 1000),
      payment_comment: paymentComment || 'Płatność online',
    });

    console.log(`[Baselinker] Order ${orderId} payment updated`);
  }

  /**
   * Set order field value in Baselinker
   * @param orderId - Baselinker order ID
   * @param field - Field name (e.g., 'admin_comments', 'user_comments', 'extra_field_1')
   * @param value - Field value
   */
  async setOrderField(orderId: string | number, field: string, value: string | number): Promise<void> {
    console.log(`[Baselinker] Setting order ${orderId} field ${field}`);

    await this.request('setOrderFields', {
      order_id: typeof orderId === 'string' ? parseInt(orderId, 10) : orderId,
      [field]: value,
    });

    console.log(`[Baselinker] Order ${orderId} field ${field} updated`);
  }

  /**
   * Get orders from Baselinker
   * @param params - Optional filters
   */
  async getOrders(params?: {
    date_from?: number;
    date_to?: number;
    status_id?: number;
    order_id?: number;
    filter_order_source_id?: number;
  }): Promise<import('./baselinker-provider.interface').BaselinkerOrderResponse[]> {
    console.log('[Baselinker] Getting orders with params:', params);

    const response = await this.request<{ orders: import('./baselinker-provider.interface').BaselinkerOrderResponse[] }>(
      'getOrders',
      {
        ...params,
        get_unconfirmed_orders: false,
      }
    );

    console.log(`[Baselinker] Retrieved ${response.orders?.length || 0} orders`);
    return response.orders || [];
  }

  /**
   * Get packages (shipments) for a specific order from Baselinker
   * @param orderId - Baselinker order ID
   */
  async getOrderPackages(orderId: string | number): Promise<BaselinkerOrderPackage[]> {
    console.log(`[Baselinker] Getting packages for order ${orderId}`);

    const response = await this.request<{ packages: BaselinkerOrderPackage[] }>(
      'getOrderPackages',
      {
        order_id: typeof orderId === 'string' ? parseInt(orderId, 10) : orderId,
      }
    );

    console.log(`[Baselinker] Retrieved ${response.packages?.length || 0} packages for order ${orderId}`);
    return response.packages || [];
  }

  /**
   * Get invoices from Baselinker (works with any connected invoicing system: Fakturownia, inFakt, wFirma, etc.)
   * @param params - Optional filters (series_id, date_from, id_from)
   */
  async getInvoices(params?: {
    series_id?: number;
    date_from?: number; // Unix timestamp
    id_from?: number;
  }): Promise<any[]> {
    console.log('[Baselinker] Getting invoices with params:', params);

    const response = await this.request<{ invoices: any[] }>(
      'getInvoices',
      params || {}
    );

    console.log(`[Baselinker] Retrieved ${response.invoices?.length || 0} invoices`);
    return response.invoices || [];
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Custom error class for Baselinker API errors
 */
export class BaselinkerApiError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BaselinkerApiError';
    this.code = code;
  }
}
