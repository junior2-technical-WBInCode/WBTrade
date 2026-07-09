const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

function buildApiUrl(endpoint: string): string {
  // Allow absolute URLs (rare, but keeps helper flexible)
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // If base already includes /api and endpoint also starts with /api, avoid /api/api
  if (
    API_URL.endsWith('/api') &&
    (normalizedEndpoint === '/api' || normalizedEndpoint.startsWith('/api/'))
  ) {
    return `${API_URL}${normalizedEndpoint.slice(4)}`;
  }

  return `${API_URL}${normalizedEndpoint}`;
}

// Generic API helper - returns Response (for backward compatibility)
export const api = {
  get: async (endpoint: string, token?: string): Promise<Response> => {
    return fetch(buildApiUrl(endpoint), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  },
  
  post: async (endpoint: string, data: any, token?: string): Promise<Response> => {
    return fetch(buildApiUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(data),
    });
  },
  
  put: async (endpoint: string, data: any, token?: string): Promise<Response> => {
    return fetch(buildApiUrl(endpoint), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(data),
    });
  },
  
  patch: async (endpoint: string, data: any, token?: string): Promise<Response> => {
    return fetch(buildApiUrl(endpoint), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(data),
    });
  },
  
  delete: async (endpoint: string, token?: string): Promise<Response> => {
    return fetch(buildApiUrl(endpoint), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  },
};

// JSON API helper - returns parsed JSON with error handling
export const apiJson = {
  get: async <T = any>(endpoint: string, token?: string): Promise<T> => {
    const response = await api.get(endpoint, token);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
  
  post: async <T = any>(endpoint: string, data: any, token?: string): Promise<T> => {
    const response = await api.post(endpoint, data, token);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
  
  put: async <T = any>(endpoint: string, data: any, token?: string): Promise<T> => {
    const response = await api.put(endpoint, data, token);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
  
  patch: async <T = any>(endpoint: string, data: any, token?: string): Promise<T> => {
    const response = await api.patch(endpoint, data, token);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
  
  delete: async <T = any>(endpoint: string, token?: string): Promise<T> => {
    const response = await api.delete(endpoint, token);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
};

// Typy dla dashboardu
export interface DashboardKPIs {
  ordersToday: number;
  ordersTodayChange: number;
  revenueToday: number;
  revenueTodayChange: number;
  newCustomersToday: number;
  newCustomersTodayChange: number;
  pendingOrders: number;
  lowStockProducts: number;
}

export interface SalesChartData {
  date: string;
  revenue: number;
  orders: number;
  cancelledRevenue: number;
  cancelledOrders: number;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  status: string;
  itemsCount: number;
  createdAt: string;
}

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  minStock: number;
  stockPercentage: number;
  image: string | null;
}

export interface DashboardAlert {
  id: string;
  type: 'order' | 'stock' | 'payment' | 'return';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  link?: string;
  createdAt: string;
}

export interface DashboardSummary {
  kpis: DashboardKPIs;
  salesChart: SalesChartData[];
  recentOrders: RecentOrder[];
  lowStockProducts: LowStockProduct[];
  alerts: DashboardAlert[];
}

// Pobierz token z localStorage
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const tokens = localStorage.getItem('admin_auth_tokens');
  if (!tokens) return null;
  try {
    return JSON.parse(tokens).accessToken;
  } catch {
    return null;
  }
}

// Fetch z autoryzacja
async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  console.log('fetchWithAuth:', endpoint, 'token:', token ? 'exists' : 'null');
  
  const response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// API funkcje
export const dashboardApi = {
  // Pobierz wszystkie dane dashboardu naraz
  getSummary: (): Promise<DashboardSummary> => fetchWithAuth('/api/admin/dashboard'),

  // Pobierz KPI
  getKPIs: (): Promise<DashboardKPIs> => fetchWithAuth('/api/admin/dashboard/kpis'),

  // Pobierz dane wykresu
  getSalesChart: (days = 30): Promise<SalesChartData[]> => 
    fetchWithAuth(`/api/admin/dashboard/sales-chart?days=${days}`),

  // Pobierz ostatnie zamowienia
  getRecentOrders: (limit = 10): Promise<RecentOrder[]> => 
    fetchWithAuth(`/api/admin/dashboard/recent-orders?limit=${limit}`),

  // Pobierz produkty z niskim stanem
  getLowStock: (limit = 10, threshold = 10): Promise<LowStockProduct[]> => 
    fetchWithAuth(`/api/admin/dashboard/low-stock?limit=${limit}&threshold=${threshold}`),

  // Pobierz alerty
  getAlerts: (): Promise<DashboardAlert[]> => fetchWithAuth('/api/admin/dashboard/alerts'),
};

// ============================================
// PARTNER / AFFILIATE PROGRAM ADMIN API
// ============================================

export const partnersApi = {
  list: (status?: string, page = 1, limit = 20, rank?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/partners?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}${rank ? `&rank=${rank}` : ''}`),
  
  getDetail: (id: string): Promise<any> =>
    fetchWithAuth(`/api/admin/partners/${id}`),
  
  updateStatus: (id: string, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED'): Promise<any> =>
    fetchWithAuth(`/api/admin/partners/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  updateRank: (id: string, rank: string, note?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/partners/${id}/rank`, {
      method: 'PATCH',
      body: JSON.stringify({ rank, note }),
    }),
  
  listPayouts: (status?: string, page = 1, limit = 20): Promise<any> =>
    fetchWithAuth(`/api/admin/partners/payouts/list?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),
  
  completePayout: (id: string, notes?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/partners/payouts/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
  
  rejectPayout: (id: string, reason?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/partners/payouts/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  getMlmConfig: (): Promise<any> =>
    fetchWithAuth('/api/admin/settings/mlm-config'),

  saveMlmConfig: (config: {
    enabled: boolean;
    maxDepth: number;
    overrideBase: string;
    overrideRatesPct: number[];
    stopOnInactiveUpline: boolean;
    minMarginPct?: number;
  }): Promise<any> =>
    fetchWithAuth('/api/admin/settings/mlm-config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getRankConfig: (): Promise<any> =>
    fetchWithAuth('/api/admin/settings/rank-config'),

  saveRankConfig: (config: any): Promise<any> =>
    fetchWithAuth('/api/admin/settings/rank-config', {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),
};

export const adminSalesRepsApi = {
  list: (): Promise<any> =>
    fetchWithAuth('/api/admin/sales-reps'),

  promote: (email: string): Promise<any> =>
    fetchWithAuth('/api/admin/sales-reps/promote', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  listPayouts: (status?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/sales-reps/payouts${status ? `?status=${status}` : ''}`),

  completePayout: (id: string, notes?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/sales-reps/payouts/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),

  rejectPayout: (id: string, notes?: string): Promise<any> =>
    fetchWithAuth(`/api/admin/sales-reps/payouts/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),

  getConfig: (): Promise<any> =>
    fetchWithAuth('/api/admin/settings/sales-rep-config'),

  saveConfig: (config: {
    baseCommissionPct: number;
    maxDiscountPct: number;
    minCompanyMarginPct: number;
    markupMultiplier: number;
    holdDays: number;
    blockAffiliation: boolean;
    modules: {
      offerTemplates: boolean;
      offerTracking: boolean;
      leaderboard: boolean;
    };
    monthlyGoalAmount: number;
  }): Promise<any> =>
    fetchWithAuth('/api/admin/settings/sales-rep-config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};
