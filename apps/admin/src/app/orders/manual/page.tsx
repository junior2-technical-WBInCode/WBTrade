'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import {
  ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, Settings,
  Building2, MapPin, Truck, CreditCard, Package, Check, X, Loader2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────
interface Partner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  nip: string | null;
  b2bStatus: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface ShippingMethod {
  id: string;
  name: string;
}

interface Address {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string | null;
  companyName: string | null;
  type: string;
  isDefault: boolean;
}

interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  storePrice: number;
  price: number;
  available: number;
}

interface WorkingProduct {
  id: string;
  name: string;
  sku: string;
  image: string | null;
  variants: ProductVariant[];
}

interface CartLine {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  price: number;
  available: number;
  quantity: number;
}

// Static method options (identifiers match the Baselinker mapper).
const PAYMENT_METHODS = [
  { id: 'transfer', label: 'Przelew bankowy' },
  { id: 'payu', label: 'PayU' },
  { id: 'blik', label: 'BLIK' },
  { id: 'card', label: 'Karta płatnicza' },
  { id: 'cod', label: 'Płatność przy odbiorze' },
];

function fmt(v: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v);
}

export default function ManualOrderPage() {
  const { token } = useAuth();
  const router = useRouter();

  // Config
  const [partners, setPartners] = useState<Partner[]>([]);
  const [workingCategory, setWorkingCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);

  // Form state
  const [partnerId, setPartnerId] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [shippingAddressId, setShippingAddressId] = useState('');
  const [billingAddressId, setBillingAddressId] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].id);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');

  // Products
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<WorkingProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);

  // UX
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load config ──────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    apiJson
      .get<{ workingCategory: Category | null; partners: Partner[]; shippingMethods: ShippingMethod[] }>('/admin/manual-orders/config', token)
      .then((data) => {
        setPartners(data.partners);
        setWorkingCategory(data.workingCategory);
        setShippingMethods(data.shippingMethods || []);
        if (data.shippingMethods?.length) setShippingMethod(data.shippingMethods[0].id);
      })
      .catch((e) => setError(e.message));
    apiJson
      .get<Category[]>('/admin/manual-orders/categories', token)
      .then(setCategories)
      .catch(() => {});
  }, [token]);

  // ── Load partner addresses on partner change ─────────
  useEffect(() => {
    if (!token || !partnerId) {
      setAddresses([]);
      setShippingAddressId('');
      setBillingAddressId('');
      return;
    }
    apiJson
      .get<Address[]>(`/admin/manual-orders/partners/${partnerId}/addresses`, token)
      .then((data) => {
        setAddresses(data);
        const defShip = data.find((a) => a.type === 'SHIPPING' && a.isDefault) || data.find((a) => a.type === 'SHIPPING') || data[0];
        setShippingAddressId(defShip?.id || '');
        const defBill = data.find((a) => a.type === 'BILLING' && a.isDefault) || data.find((a) => a.type === 'BILLING');
        setBillingAddressId(defBill?.id || '');
      })
      .catch((e) => setError(e.message));
  }, [token, partnerId]);

  // ── Load working-category products (debounced) ───────
  const loadProducts = useCallback(() => {
    if (!token) return;
    setLoadingProducts(true);
    const params = new URLSearchParams();
    if (partnerId) params.set('partnerId', partnerId);
    if (search.trim()) params.set('search', search.trim());
    apiJson
      .get<{ products: WorkingProduct[] }>(`/admin/manual-orders/products?${params.toString()}`, token)
      .then((data) => setProducts(data.products))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProducts(false));
  }, [token, partnerId, search]);

  useEffect(() => {
    const t = setTimeout(loadProducts, 300);
    return () => clearTimeout(t);
  }, [loadProducts]);

  // ── Cart helpers ─────────────────────────────────────
  const addToCart = (product: WorkingProduct, variant: ProductVariant) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) {
        if (existing.quantity >= variant.available) return prev;
        return prev.map((l) => (l.variantId === variant.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          price: variant.price,
          available: variant.available,
          quantity: 1,
        },
      ];
    });
  };

  const setQty = (variantId: string, qty: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(qty, l.available)) } : l
      )
    );
  };

  const removeLine = (variantId: string) => setCart((prev) => prev.filter((l) => l.variantId !== variantId));

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const shippingNum = parseFloat(shippingCost) || 0;
  const total = subtotal + shippingNum;

  // ── Save working category ────────────────────────────
  const saveWorkingCategory = async (categoryId: string) => {
    if (!token || !categoryId) return;
    setSavingCategory(true);
    try {
      const data = await apiJson.put<{ workingCategory: Category }>(
        '/admin/manual-orders/working-category',
        { categoryId },
        token
      );
      setWorkingCategory(data.workingCategory);
      setShowSettings(false);
      loadProducts();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingCategory(false);
    }
  };

  // ── Submit ───────────────────────────────────────────
  const submit = async () => {
    setError(null);
    if (!token) return;
    if (!partnerId) return setError('Wybierz partnera B2B.');
    if (!shippingAddressId) return setError('Wybierz adres dostawy.');
    if (!shippingMethod) return setError('Wybierz metodę dostawy.');
    if (cart.length === 0) return setError('Dodaj co najmniej jeden produkt.');

    setSubmitting(true);
    try {
      const order = await apiJson.post<{ id: string; orderNumber: string }>(
        '/admin/manual-orders',
        {
          partnerId,
          shippingAddressId,
          billingAddressId: billingAddressId || undefined,
          shippingMethod,
          shippingCost: shippingNum,
          paymentMethod,
          markAsPaid,
          customerNotes: customerNotes.trim() || undefined,
          items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        },
        token
      );
      router.push(`/orders/${order.id}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const selectedPartner = partners.find((p) => p.id === partnerId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/orders" className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-gray-300 hover:bg-slate-700">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Nowe zamówienie B2B</h1>
            <p className="text-gray-400 text-sm">
              Ręczne zamówienie dla partnera na produkty z kategorii roboczej
              {workingCategory ? ` — „${workingCategory.name}”` : ' (nie skonfigurowano)'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Kategoria robocza
        </button>
      </div>

      {/* Working category settings */}
      {showSettings && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <p className="text-sm text-gray-300">
            Wybierz kategorię, z której produkty będą dostępne do ręcznego zamówienia B2B.
          </p>
          <div className="flex items-center gap-3">
            <select
              defaultValue={workingCategory?.id || ''}
              onChange={(e) => saveWorkingCategory(e.target.value)}
              disabled={savingCategory}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">— wybierz kategorię —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
            {savingCategory && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3">
          <X className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: partner, address, methods */}
        <div className="lg:col-span-1 space-y-6">
          {/* Partner */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-white font-semibold">
              <Building2 className="w-4 h-4 text-blue-400" /> Partner B2B
            </h2>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">— wybierz partnera —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.companyName || `${p.firstName} ${p.lastName}`} — {p.email}
                </option>
              ))}
            </select>
            {selectedPartner && (
              <div className="text-xs text-gray-400 space-y-0.5">
                <div>{selectedPartner.firstName} {selectedPartner.lastName}</div>
                {selectedPartner.nip && <div>NIP: {selectedPartner.nip}</div>}
                {selectedPartner.b2bStatus === 'SUSPENDED' && (
                  <div className="text-amber-400">Konto zawieszone</div>
                )}
              </div>
            )}
          </div>

          {/* Address */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-white font-semibold">
              <MapPin className="w-4 h-4 text-blue-400" /> Adres dostawy
            </h2>
            {!partnerId ? (
              <p className="text-xs text-gray-500">Najpierw wybierz partnera.</p>
            ) : addresses.length === 0 ? (
              <p className="text-xs text-amber-400">Partner nie ma zapisanych adresów.</p>
            ) : (
              <>
                <select
                  value={shippingAddressId}
                  onChange={(e) => setShippingAddressId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">— wybierz adres dostawy —</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.type === 'BILLING' ? 'Rozl.' : 'Dost.'}] {a.street}, {a.postalCode} {a.city}
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-gray-400 mt-2">Adres rozliczeniowy (opcjonalnie)</label>
                <select
                  value={billingAddressId}
                  onChange={(e) => setBillingAddressId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">— taki sam jak dostawy —</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.type === 'BILLING' ? 'Rozl.' : 'Dost.'}] {a.street}, {a.postalCode} {a.city}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Delivery */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-white font-semibold">
              <Truck className="w-4 h-4 text-blue-400" /> Dostawa
            </h2>
            <select
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              {shippingMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <label className="block text-xs text-gray-400">Koszt dostawy (PLN)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>

          {/* Payment */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-white font-semibold">
              <CreditCard className="w-4 h-4 text-blue-400" /> Płatność
            </h2>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={markAsPaid}
                onChange={(e) => setMarkAsPaid(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              Oznacz jako opłacone od razu
            </label>
            <p className="text-xs text-gray-500">
              {markAsPaid
                ? 'Zamówienie zostanie utworzone jako opłacone (płatność poza systemem) i przekazane do BaseLinkera jako „Nowe zamówienia”.'
                : 'Zamówienie zostanie utworzone jako nieopłacone — partner opłaci je w swoim koncie.'}
            </p>
          </div>

          {/* Notes */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
            <h2 className="text-white font-semibold text-sm">Uwagi do zamówienia</h2>
            <textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Opcjonalne uwagi…"
            />
          </div>
        </div>

        {/* Middle: product picker */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-white font-semibold">
              <Package className="w-4 h-4 text-blue-400" /> Produkty (kategoria robocza)
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj po nazwie lub SKU…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm"
              />
            </div>
            {!workingCategory && (
              <p className="text-xs text-amber-400">
                Skonfiguruj kategorię roboczą (przycisk u góry), aby zobaczyć produkty.
              </p>
            )}
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : products.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">Brak produktów ze stanem magazynowym.</p>
              ) : (
                products.map((p) => (
                  <div key={p.id} className="border border-slate-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className="w-10 h-10 rounded object-cover bg-slate-900" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-slate-900 flex items-center justify-center">
                          <Package className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{p.name}</div>
                        <div className="text-xs text-gray-500">SKU: {p.sku}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {p.variants.map((v) => (
                        <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="text-gray-300">{v.name}</span>
                            <span className="text-gray-500"> • stan: {v.available}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-blue-300 font-medium">{fmt(v.price)}</span>
                            <button
                              onClick={() => addToCart(p, v)}
                              disabled={!partnerId}
                              title={!partnerId ? 'Najpierw wybierz partnera' : 'Dodaj'}
                              className="p-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: cart + summary */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-white font-semibold">
              <ShoppingCart className="w-4 h-4 text-blue-400" /> Pozycje zamówienia
            </h2>
            {cart.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">Brak pozycji. Dodaj produkty z listy.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((l) => (
                  <div key={l.variantId} className="border border-slate-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{l.productName}</div>
                        <div className="text-xs text-gray-500">{l.variantName} • {l.sku}</div>
                      </div>
                      <button onClick={() => removeLine(l.variantId)} className="p-1 text-gray-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(l.variantId, l.quantity - 1)} className="p-1 rounded bg-slate-700 text-white">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={l.available}
                          value={l.quantity}
                          onChange={(e) => setQty(l.variantId, parseInt(e.target.value) || 1)}
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-center text-sm"
                        />
                        <button onClick={() => setQty(l.variantId, l.quantity + 1)} className="p-1 rounded bg-slate-700 text-white">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-sm text-white font-medium">{fmt(l.price * l.quantity)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span>Wartość produktów</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-300">
              <span>Dostawa</span>
              <span>{fmt(shippingNum)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-white pt-2 border-t border-slate-700">
              <span>Razem</span>
              <span>{fmt(total)}</span>
            </div>
            <button
              onClick={submit}
              disabled={submitting || cart.length === 0 || !partnerId || !shippingAddressId}
              className="w-full flex items-center justify-center gap-2 mt-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-white font-medium transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Utwórz zamówienie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
