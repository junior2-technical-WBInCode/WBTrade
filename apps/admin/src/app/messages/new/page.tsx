'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, MessageSquare } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const tokens = localStorage.getItem('admin_auth_tokens');
  if (!tokens) return null;
  try {
    return JSON.parse(tokens).accessToken;
  } catch {
    return null;
  }
}

const categoryOptions = [
  { value: 'ORDER', label: 'Zamówienie' },
  { value: 'DELIVERY', label: 'Dostawa' },
  { value: 'COMPLAINT', label: 'Reklamacja' },
  { value: 'RETURN', label: 'Zwrot' },
  { value: 'PAYMENT', label: 'Płatność' },
  { value: 'ACCOUNT', label: 'Konto' },
  { value: 'GENERAL', label: 'Ogólne' },
];

function NewMessageForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = searchParams.get('orderId') || '';
  const orderNumber = searchParams.get('orderNumber') || '';
  const userId = searchParams.get('userId') || '';

  const [subject, setSubject] = useState(orderNumber ? `Dotyczy zamówienia ${orderNumber}` : '');
  const [category, setCategory] = useState(orderId ? 'ORDER' : 'GENERAL');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    try {
      setSending(true);
      setError('');
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/support/tickets/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          subject,
          category,
          message,
          ...(orderId && { orderId }),
          ...(userId && { userId }),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/messages/${data.id}`);
      } else {
        const errData = await response.json().catch(() => ({ message: 'Wystąpił błąd' }));
        setError(errData.message || 'Nie udało się utworzyć zgłoszenia');
      }
    } catch (err) {
      setError('Nie udało się połączyć z serwerem');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/messages"
          className="p-2 bg-slate-800 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Nowe zgłoszenie</h1>
          <p className="text-gray-400 text-sm">Wyślij wiadomość do klienta</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
          {orderNumber && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 text-sm">
                Powiązane z zamówieniem: <strong>{orderNumber}</strong>
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Temat</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Temat wiadomości..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Kategoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Wiadomość</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={6}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Treść wiadomości..."
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={!subject.trim() || !message.trim() || sending}
            className="px-6 py-3 bg-orange-500 rounded-lg text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Wysyłanie...' : 'Wyślij wiadomość'}
          </button>
          <Link
            href="/messages"
            className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Anuluj
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function NewMessagePage() {
  return (
    <Suspense fallback={<div className="h-64 bg-slate-800/50 rounded-xl animate-pulse" />}>
      <NewMessageForm />
    </Suspense>
  );
}
