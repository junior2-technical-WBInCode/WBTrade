// --- User & Auth ---

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  emailVerified: boolean;
  companyName?: string;
  nip?: string;
  companyStreet?: string;
  companyCity?: string;
  companyPostalCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  verificationToken?: string;
}

// --- Products ---

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  lowestPrice30Days?: number;
  stock: number;
  attributes: Record<string, string>;
}

export interface Product {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  specifications?: Record<string, string>;
  price: string | number;
  compareAtPrice?: string | number;
  lowestPrice30Days?: string | number;
  lowestPrice30DaysAt?: string;
  sku?: string;
  barcode?: string;
  status: 'active' | 'draft' | 'archived';
  stock?: number;
  images?: ProductImage[];
  variants?: ProductVariant[];
  category?: Category;
  categoryId?: string;
  tags?: string[];
  badge?: 'super-price' | 'outlet' | 'bestseller' | 'new';
  rating?: string | number;
  reviewCount?: number;
  wholesaler?: string | null;
  storeName?: string;
  deliveryInfo?: string;
  warehouseLocation?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest' | 'random' | 'relevance' | 'popularity' | 'top-rated';
  status?: string;
  brand?: string;
  warehouse?: string;
  sessionSeed?: number;
  [key: string]: any;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// --- Categories ---

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  image: string | null;
  order: number;
  isActive: boolean;
  children?: Category[];
  productCount?: number;
}

// --- Cart ---

export interface CartItem {
  id: string;
  quantity: number;
  variant: {
    id: string;
    name: string;
    sku: string;
    price: number;
    compareAtPrice: number | null;
    attributes: Record<string, string>;
    product: {
      id: string;
      name: string;
      slug: string;
      images: { url: string; alt: string | null }[];
      tags?: string[];
      wholesaler?: string | null;
    };
    inventory: { quantity: number; reserved: number }[];
  };
}

export interface Cart {
  id: string;
  userId: string | null;
  sessionId: string | null;
  couponCode: string | null;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
}

// --- Addresses ---

export interface Address {
  id: string;
  userId: string | null;
  label: string | null;
  type: 'SHIPPING' | 'BILLING';
  firstName: string;
  lastName: string;
  companyName: string | null;
  nip: string | null;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressFormData {
  label?: string;
  type?: 'SHIPPING' | 'BILLING';
  firstName: string;
  lastName: string;
  companyName?: string;
  nip?: string;
  street: string;
  city: string;
  postalCode: string;
  country?: string;
  phone?: string;
  isDefault?: boolean;
}

// --- Orders ---

export interface OrderAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
  variant?: {
    id: string;
    name: string;
    product: {
      id: string;
      name: string;
      slug: string;
      wholesaler?: string;
      images: { url: string; alt: string | null }[];
      tags?: string[];
    };
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'OPEN' | 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  paymentStatus?: string;
  items: OrderItem[];
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  shippingMethod: string;
  paymentMethod: string;
  paczkomatCode?: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  trackingNumber?: string;
  notes?: string;
  wantInvoice?: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Wishlist ---

export interface WishlistItem {
  id: string;
  productId: string;
  variantId: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number | string;
    compareAtPrice: number | string | null;
    images: { url: string; alt: string | null }[];
    status?: string;
    variants?: {
      id: string;
      stock: number;
    }[];
    badge?: string;
  };
}

export interface WishlistResponse {
  items: WishlistItem[];
  count: number;
}

// --- Shopping Lists ---

export interface ShoppingListItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  note: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number | string;
    compareAtPrice: number | string | null;
    images: { url: string; alt: string | null }[];
    status?: string;
  };
  variant?: {
    id: string;
    name: string;
    price: number;
    compareAtPrice: number | null;
  } | null;
}

export interface ShoppingList {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  items: ShoppingListItem[];
}

export interface ShoppingListsResponse {
  lists: ShoppingList[];
}

// --- Shipping & Checkout ---

export interface ShippingMethod {
  id: string;
  serviceType: string;
  name: string;
  price: number;
  currency: string;
  estimatedDelivery: string;
  pickupPointRequired: boolean;
}

export interface CheckoutRequest {
  shippingAddressId?: string;
  billingAddressId?: string;
  shippingMethod: string;
  pickupPointCode?: string;
  paymentMethod: string;
  customerNotes?: string;
  acceptTerms: boolean;
  selectedItemIds?: string[];
  wantInvoice?: boolean;
  guestEmail?: string;
}

export interface CheckoutResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentUrl?: string;
  sessionId?: string;
  paymentMethod: string;
  total: number;
  redirectUrl?: string;
}
