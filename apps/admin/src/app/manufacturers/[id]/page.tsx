'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Factory, Globe, Mail, Phone, MapPin, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  safetyInfo?: string;
  euRepName?: string;
  euRepAddress?: string;
  euRepEmail?: string;
  baselinkerManufacturerId?: string;
  _count: { products: number };
}

export default function ManufacturerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const manufacturerId = params.id as string;

  const [manufacturer, setManufacturer] = useState<Manufacturer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [safetyInfo, setSafetyInfo] = useState('');
  const [euRepName, setEuRepName] = useState('');
  const [euRepAddress, setEuRepAddress] = useState('');
  const [euRepEmail, setEuRepEmail] = useState('');

  useEffect(() => {
    loadManufacturer();
  }, [manufacturerId]);

  async function loadManufacturer() {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/manufacturers/${manufacturerId}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) { router.push('/manufacturers'); return; }
      const data = await res.json();
      setManufacturer(data);
      setName(data.name || '');
      setSlug(data.slug || '');
      setAddress(data.address || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setWebsite(data.website || '');
      setSafetyInfo(data.safetyInfo || '');
      setEuRepName(data.euRepName || '');
      setEuRepAddress(data.euRepAddress || '');
      setEuRepEmail(data.euRepEmail || '');
    } catch (err) {
      console.error('Error loading manufacturer:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/manufacturers/${manufacturerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          name, slug, address, email, phone, website,
          safetyInfo, euRepName, euRepAddress, euRepEmail,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Error saving manufacturer:', err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="text-gray-400">Ładowanie...</div></div>;
  }

  if (!manufacturer) {
    return <div className="text-center py-12 text-gray-400">Nie znaleziono producenta</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/manufacturers" className="p-2 rounded-lg hover:bg-admin-hover text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Factory className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{manufacturer.name}</h1>
            <p className="text-sm text-gray-400">{manufacturer._count.products} produktów</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Zapisywanie...' : saved ? 'Zapisano!' : 'Zapisz'}
        </button>
      </div>

      {/* Dane producenta */}
      <div className="bg-admin-card rounded-xl border border-admin-border p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Factory className="w-5 h-5 text-primary" />
          Dane producenta
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nazwa producenta *</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Slug (URL)</label>
            <input
              type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1"><MapPin className="w-3 h-3 inline mr-1" />Adres pocztowy</label>
          <textarea
            value={address} onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="ul. Przykładowa 1, 00-001 Warszawa, Polska"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1"><Mail className="w-3 h-3 inline mr-1" />E-mail</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1"><Phone className="w-3 h-3 inline mr-1" />Telefon</label>
            <input
              type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1"><Globe className="w-3 h-3 inline mr-1" />Strona www</label>
            <input
              type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="https://"
            />
          </div>
        </div>
      </div>

      {/* Bezpieczeństwo */}
      <div className="bg-admin-card rounded-xl border border-admin-border p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-green-400" />
          Informacje o bezpieczeństwie (GPSR)
        </h2>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Ostrzeżenia i informacje bezpieczeństwa</label>
          <textarea
            value={safetyInfo} onChange={(e) => setSafetyInfo(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Np. ograniczenia wiekowe, sposób bezpiecznego użycia, ryzyka..."
          />
        </div>
      </div>

      {/* Podmiot odpowiedzialny w UE */}
      <div className="bg-admin-card rounded-xl border border-admin-border p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          🇪🇺 Podmiot odpowiedzialny w UE
        </h2>
        <p className="text-xs text-gray-400">
          Wymagane tylko gdy producent nie ma siedziby na terenie UE
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Nazwa podmiotu w UE</label>
            <input
              type="text" value={euRepName} onChange={(e) => setEuRepName(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Adres podmiotu w UE</label>
            <textarea
              value={euRepAddress} onChange={(e) => setEuRepAddress(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">E-mail podmiotu w UE</label>
            <input
              type="email" value={euRepEmail} onChange={(e) => setEuRepEmail(e.target.value)}
              className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Baselinker info */}
      {manufacturer.baselinkerManufacturerId && (
        <div className="text-xs text-gray-500">
          Baselinker Manufacturer ID: {manufacturer.baselinkerManufacturerId}
        </div>
      )}
    </div>
  );
}
