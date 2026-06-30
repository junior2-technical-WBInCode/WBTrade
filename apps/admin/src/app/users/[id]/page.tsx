'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import {
  ArrowLeft, User, Mail, Phone, Shield, Calendar,
  Clock, MapPin, Package, ShoppingBag, Lock, Unlock,
  CheckCircle, XCircle, AlertTriangle, Edit2, Save, X,
  Key, Ban, ChevronRight, Hash,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Address {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
}

interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: 'CUSTOMER' | 'ADMIN' | 'WAREHOUSE' | 'B2B_PARTNER' | 'HANDLOWIEC';
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    orders: number;
    addresses: number;
  };
  addresses: Address[];
  orders: RecentOrder[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const roleColors: Record<string, string> = {
  ADMIN: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  WAREHOUSE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CUSTOMER: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  B2B_PARTNER: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  HANDLOWIEC: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrator',
  WAREHOUSE: 'Magazynier',
  CUSTOMER: 'Klient',
  B2B_PARTNER: 'Partner B2B',
  HANDLOWIEC: 'Handlowiec',
};

const roleIcons: Record<string, React.ReactNode> = {
  ADMIN: <Shield className="w-4 h-4" />,
  WAREHOUSE: <Package className="w-4 h-4" />,
  CUSTOMER: <User className="w-4 h-4" />,
  B2B_PARTNER: <User className="w-4 h-4" />,
  HANDLOWIEC: <Shield className="w-4 h-4" />,
};

const orderStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  CONFIRMED: 'bg-blue-500/20 text-blue-400',
  PROCESSING: 'bg-indigo-500/20 text-indigo-400',
  SHIPPED: 'bg-cyan-500/20 text-cyan-400',
  DELIVERED: 'bg-green-500/20 text-green-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
  REFUNDED: 'bg-orange-500/20 text-orange-400',
  RETURNED: 'bg-amber-500/20 text-amber-400',
};

const orderStatusLabels: Record<string, string> = {
  PENDING: 'Oczekujące',
  CONFIRMED: 'Potwierdzone',
  PROCESSING: 'W realizacji',
  SHIPPED: 'Wysłane',
  DELIVERED: 'Dostarczone',
  CANCELLED: 'Anulowane',
  REFUNDED: 'Zwrot',
  RETURNED: 'Zwrócone',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });

  // Password reset
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Role change
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState<'CUSTOMER' | 'ADMIN' | 'WAREHOUSE' | 'B2B_PARTNER' | 'HANDLOWIEC'>('CUSTOMER');

  useEffect(() => {
    if (token && id) loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const loadUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiJson.get<UserDetail>(`/api/users/${id}`, token!);
      setUser(data);
      setEditForm({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || '',
        email: data.email || '',
      });
    } catch (e: any) {
      setError(e.message || 'Nie udało się załadować użytkownika');
    } finally {
      setLoading(false);
    }
  };

  // ── Actions ───

  const handleSaveEdit = async () => {
    if (!user || !token) return;
    setActionLoading(true);
    try {
      await apiJson.put(`/api/users/${user.id}`, editForm, token);
      await loadUser();
      setEditing(false);
      flash('success', 'Dane zaktualizowane');
    } catch (e: any) {
      flash('error', e.message || 'Błąd zapisu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!user || !token) return;
    setActionLoading(true);
    try {
      const endpoint = user.isActive ? 'block' : 'unblock';
      await apiJson.post(`/api/users/${user.id}/${endpoint}`, {}, token);
      await loadUser();
      flash('success', user.isActive ? 'Użytkownik zablokowany' : 'Użytkownik odblokowany');
    } catch (e: any) {
      flash('error', e.message || 'Błąd operacji');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlockAccount = async () => {
    if (!user || !token) return;
    setActionLoading(true);
    try {
      await apiJson.post(`/api/users/${user.id}/unlock`, {}, token);
      await loadUser();
      flash('success', 'Konto odblokowane');
    } catch (e: any) {
      flash('error', e.message || 'Błąd operacji');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user || !token || !newPassword) return;
    setActionLoading(true);
    try {
      await apiJson.post(`/api/users/${user.id}/reset-password`, { newPassword }, token);
      setShowPasswordModal(false);
      setNewPassword('');
      flash('success', 'Hasło zmienione');
    } catch (e: any) {
      flash('error', e.message || 'Błąd zmiany hasła');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeRole = async () => {
    if (!user || !token) return;
    setActionLoading(true);
    try {
      await apiJson.patch(`/api/users/${user.id}/role`, { role: newRole }, token);
      await loadUser();
      setShowRoleModal(false);
      flash('success', `Rola zmieniona na: ${roleLabels[newRole]}`);
    } catch (e: any) {
      flash('error', e.message || 'Błąd zmiany roli');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Loading / Error states ───

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-2 border-slate-600 border-t-orange-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-400">Ładowanie profilu użytkownika...</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-6">
        <Link href="/users" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Powrót do użytkowników
        </Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 text-lg font-medium">{error || 'Użytkownik nie znaleziony'}</p>
          <Link href="/users" className="mt-4 inline-block text-orange-400 hover:text-orange-300">
            Wróć do listy użytkowników
          </Link>
        </div>
      </div>
    );
  }

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  // ── Render ───

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back + Header */}
      <Link href="/users" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Powrót do użytkowników
      </Link>

      {/* Flash message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {message.text}
        </div>
      )}

      {/* User Header Card */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
              user.role === 'ADMIN' ? 'bg-purple-500/30 text-purple-300' :
              user.role === 'WAREHOUSE' ? 'bg-blue-500/30 text-blue-300' :
              'bg-orange-500/30 text-orange-300'
            }`}>
              {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
            </div>
            <div>
              {editing ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={editForm.firstName}
                    onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="Imię"
                    className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-lg font-bold w-36 focus:outline-none focus:border-orange-500"
                  />
                  <input
                    value={editForm.lastName}
                    onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Nazwisko"
                    className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-lg font-bold w-44 focus:outline-none focus:border-orange-500"
                  />
                  <button onClick={handleSaveEdit} disabled={actionLoading} className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg">
                    <Save className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditing(false)} className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  {user.firstName} {user.lastName}
                  <button onClick={() => setEditing(true)} className="p-1 text-slate-400 hover:text-white">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </h1>
              )}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleColors[user.role]}`}>
                  {roleIcons[user.role]} {roleLabels[user.role]}
                </span>
                {!user.isActive && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                    <Ban className="w-3 h-3" /> Zablokowany
                  </span>
                )}
                {isLocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Lock className="w-3 h-3" /> Konto zablokowane
                  </span>
                )}
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Email zweryfikowany
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> Email niezweryfikowany
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setNewRole(user.role); setShowRoleModal(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
              title="Zmień rolę"
            >
              <Shield className="w-4 h-4" /> Rola
            </button>
            <button
              onClick={() => { setNewPassword(''); setShowPasswordModal(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
              title="Resetuj hasło"
            >
              <Key className="w-4 h-4" /> Hasło
            </button>
            {isLocked && (
              <button
                onClick={handleUnlockAccount}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-sm transition-colors"
              >
                <Unlock className="w-4 h-4" /> Odblokuj
              </button>
            )}
            <button
              onClick={handleToggleBlock}
              disabled={actionLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                user.isActive
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                  : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
              }`}
            >
              {user.isActive ? <><Ban className="w-4 h-4" /> Zablokuj</> : <><Unlock className="w-4 h-4" /> Odblokuj</>}
            </button>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* ─── Left column: Details ──────── */}
        <div className="col-span-8 space-y-6">

          {/* Contact info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-orange-400" />
              Dane kontaktowe
            </h2>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    value={editForm.email}
                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Telefon</label>
                  <input
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Brak"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-white">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Telefon</p>
                    <p className="text-white">{user.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Hash className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">ID</p>
                    <p className="text-white text-sm font-mono">{user.id}</p>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Addresses */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-400" />
              Adresy ({user.addresses.length})
            </h2>
            {user.addresses.length === 0 ? (
              <p className="text-slate-500 text-sm">Brak zapisanych adresów</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {user.addresses.map(addr => (
                  <div key={addr.id} className={`p-4 rounded-lg border ${
                    addr.isDefault ? 'bg-orange-500/10 border-orange-500/30' : 'bg-slate-900 border-slate-700'
                  }`}>
                    {addr.isDefault && (
                      <span className="text-xs text-orange-400 font-medium mb-2 block">Domyślny</span>
                    )}
                    <p className="text-white font-medium">{addr.firstName} {addr.lastName}</p>
                    <p className="text-slate-400 text-sm">{addr.street}</p>
                    <p className="text-slate-400 text-sm">{addr.postalCode} {addr.city}</p>
                    <p className="text-slate-400 text-sm">{addr.country}</p>
                    {addr.phone && <p className="text-slate-400 text-sm mt-1">{addr.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-orange-400" />
                Ostatnie zamówienia ({user._count.orders} łącznie)
              </h2>
              {user._count.orders > 5 && (
                <Link href={`/orders?userId=${user.id}`} className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1">
                  Wszystkie <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
            {user.orders.length === 0 ? (
              <p className="text-slate-500 text-sm">Brak zamówień</p>
            ) : (
              <div className="space-y-2">
                {user.orders.map(order => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-white text-sm font-medium group-hover:text-orange-400 transition-colors">
                        #{order.orderNumber}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColors[order.status] || 'bg-slate-500/20 text-slate-400'}`}>
                        {orderStatusLabels[order.status] || order.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-white font-medium">{Number(order.total).toFixed(2)} zł</span>
                      <span className="text-slate-400 text-sm">{formatDate(order.createdAt)}</span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right column: Stats & Meta ──────── */}
        <div className="col-span-4 space-y-6">

          {/* Stats */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-400" />
              Statystyki
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Zamówienia</span>
                <span className="text-white font-semibold text-lg">{user._count.orders}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Adresy</span>
                <span className="text-white font-semibold text-lg">{user._count.addresses}</span>
              </div>
              {user.orders.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Łączna wartość (ost. 5)</span>
                  <span className="text-orange-400 font-semibold">
                    {user.orders.reduce((s, o) => s + Number(o.total), 0).toFixed(2)} zł
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline / Meta */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-400" />
              Historia
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500">Rejestracja</p>
                <p className="text-white text-sm">{formatDate(user.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ostatnie logowanie</p>
                <p className="text-white text-sm">{formatDate(user.lastLoginAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Weryfikacja email</p>
                <p className="text-white text-sm">{user.emailVerified ? formatDate(user.emailVerifiedAt) : 'Niezweryfikowany'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Zmiana hasła</p>
                <p className="text-white text-sm">{formatDate(user.passwordChangedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ostatnia aktualizacja</p>
                <p className="text-white text-sm">{formatDate(user.updatedAt)}</p>
              </div>
              {user.failedLoginAttempts > 0 && (
                <div>
                  <p className="text-xs text-slate-500">Nieudane logowania</p>
                  <p className="text-amber-400 text-sm font-medium">{user.failedLoginAttempts}</p>
                </div>
              )}
              {isLocked && (
                <div>
                  <p className="text-xs text-slate-500">Zablokowane do</p>
                  <p className="text-red-400 text-sm font-medium">{formatDate(user.lockedUntil)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Security */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-400" />
              Bezpieczeństwo
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 text-sm">Status konta</span>
                {user.isActive ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Aktywne
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400">
                    <XCircle className="w-3.5 h-3.5" /> Zablokowane
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 text-sm">Email</span>
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Zweryfikowany
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> Niezweryfikowany
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 text-sm">Blokada konta</span>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400">
                    <Lock className="w-3.5 h-3.5" /> Tak
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Nie</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Password Reset Modal ─────── */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Resetuj hasło</h2>
            <p className="text-slate-400 text-sm mb-3">
              Nowe hasło dla: <span className="text-white">{user.email}</span>
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Nowe hasło (min. 8 znaków)"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                Anuluj
              </button>
              <button
                onClick={handleResetPassword}
                disabled={actionLoading || newPassword.length < 8}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Zapisuję...' : 'Zmień hasło'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Role Change Modal ─────── */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRoleModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Zmień rolę</h2>
            <p className="text-slate-400 text-sm mb-3">
              Użytkownik: <span className="text-white">{user.firstName} {user.lastName}</span>
            </p>
            <div className="space-y-2 mb-4">
              {(['CUSTOMER', 'WAREHOUSE', 'B2B_PARTNER', 'HANDLOWIEC', 'ADMIN'] as const).map(role => (
                <button
                  key={role}
                  onClick={() => setNewRole(role)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2 ${
                    newRole === role
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {roleIcons[role]}
                  <span className="font-medium text-sm">{roleLabels[role]}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRoleModal(false)} className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                Anuluj
              </button>
              <button
                onClick={handleChangeRole}
                disabled={actionLoading || newRole === user.role}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Zapisuję...' : 'Zmień rolę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
