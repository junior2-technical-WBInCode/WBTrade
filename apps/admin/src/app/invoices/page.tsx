'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, Receipt } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

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

interface Invoice {
  id: number;
  number: string;
  kind: string;
  issueDate: string | null;
  totalGross: number | null;
  currency: string;
  buyerName: string;
  buyerNip: string | null;
  orderId: number | null;
  externalInvoiceNumber: string | null;
}

const kindLabels: Record<string, string> = {
  vat: 'Faktura VAT',
  proforma: 'Proforma',
  receipt: 'Paragon',
  correction: 'Korekta',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err: any) {
      setError(err.message || 'Błąd pobierania faktur');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pl-PL');
  };

  const formatCurrency = (amount: number | null, currency: string) => {
    if (amount === null) return '—';
    return `${amount.toFixed(2)} ${currency}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Faktury</h1>
        </div>
        <button
          onClick={() => fetchInvoices()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Odśwież
        </button>
      </div>

      {/* Info */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        Lista faktur pobierana z Baselinkera. Działa niezależnie od podłączonego systemu fakturowania (Fakturownia, inFakt, wFirma itp.).
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr faktury</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data wystawienia</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nabywca</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NIP</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kwota brutto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID zamówienia (BL)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Ładowanie faktur...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Brak faktur do wyświetlenia
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {inv.number}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {kindLabels[inv.kind] || inv.kind}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(inv.issueDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                      {inv.buyerName || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {inv.buyerNip || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {formatCurrency(inv.totalGross, inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.orderId || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Count */}
        {!loading && invoices.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-600">Łącznie: {invoices.length} faktur</span>
          </div>
        )}
      </div>
    </div>
  );
}
