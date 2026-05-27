'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import Link from 'next/link';

export default function B2bFeedsPage() {

  const { user } = useAuth();
  const [copying, setCopying] = useState<string | null>(null);

  const isB2b = user && (user as any).b2bStatus === 'APPROVED';

  // Normalize apiBase to never end with /api
  let apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  if (apiBase.endsWith('/api')) {
    apiBase = apiBase.slice(0, -4);
  }

  const feedXmlUrl = `${apiBase}/api/feed/b2b/xml`;
  const feedCsvUrl = `${apiBase}/api/feed/b2b/csv`;

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopying(type);
      setTimeout(() => setCopying(null), 2000);
    } catch {
      // fallback
    }
  };

  const getToken = () => {
    try {
      const stored = localStorage.getItem('auth_tokens');
      if (stored) return JSON.parse(stored).accessToken;
    } catch {}
    return null;
  };

  const handleDownload = async (url: string, filename: string) => {
    const accessToken = getToken();
    if (!accessToken) return;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert('Nie udało się pobrać pliku. Spróbuj ponownie.');
    }
  };

  if (!user) {
    return (
      <div className="container-custom py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Wymiana plików</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">Zaloguj się, aby uzyskać dostęp do feedów produktowych B2B.</p>
        <Link href="/login" className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition">
          Zaloguj się
        </Link>
      </div>
    );
  }

  if (!isB2b) {
    return (
      <div className="container-custom py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Wymiana plików</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Ta strona jest dostępna tylko dla zatwierdzonych partnerów B2B.
        </p>
        <Link href="/cooperation" className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition">
          Dowiedz się więcej o współpracy B2B
        </Link>
      </div>
    );
  }

  return (
    <div className="container-custom py-10 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Feedy produktowe
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">
        Twoje indywidualne pliki z cenami hurtowymi. Kliknij aby pobrać lub skopiuj link do integracji.
      </p>

      {/* Feed list - simple rows */}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-secondary-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <th className="pb-3 font-medium">Plik</th>
            <th className="pb-3 font-medium hidden sm:table-cell">Format</th>
            <th className="pb-3 font-medium text-right">Akcje</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-secondary-700/50">
          <tr className="group">
            <td className="py-4">
              <span className="font-medium text-gray-900 dark:text-white">b2b-products.xml</span>
              <span className="block text-xs text-gray-400 dark:text-gray-500 sm:hidden">XML · Ceneo / BaseLinker</span>
            </td>
            <td className="py-4 hidden sm:table-cell">
              <span className="text-xs text-gray-500 dark:text-gray-400">XML · Ceneo / BaseLinker</span>
            </td>
            <td className="py-4 text-right">
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() => handleCopy(feedXmlUrl, 'xml')}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                >
                  {copying === 'xml' ? 'Skopiowano ✓' : 'Kopiuj URL'}
                </button>
                <button
                  onClick={() => handleDownload(feedXmlUrl, 'b2b-products.xml')}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition"
                >
                  Pobierz
                </button>
              </div>
            </td>
          </tr>
          <tr className="group">
            <td className="py-4">
              <span className="font-medium text-gray-900 dark:text-white">b2b-products.csv</span>
              <span className="block text-xs text-gray-400 dark:text-gray-500 sm:hidden">CSV · Excel / ERP</span>
            </td>
            <td className="py-4 hidden sm:table-cell">
              <span className="text-xs text-gray-500 dark:text-gray-400">CSV · Excel / systemy ERP</span>
            </td>
            <td className="py-4 text-right">
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() => handleCopy(feedCsvUrl, 'csv')}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                >
                  {copying === 'csv' ? 'Skopiowano ✓' : 'Kopiuj URL'}
                </button>
                <button
                  onClick={() => handleDownload(feedCsvUrl, 'b2b-products.csv')}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition"
                >
                  Pobierz
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Minimal notes */}
      <div className="mt-10 space-y-6 text-sm text-gray-600 dark:text-gray-400">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Jak to działa</h2>
          <p className="leading-relaxed">
            Feedy zawierają pełną ofertę produktów dostępnych w WB Trade z cenami hurtowymi przypisanymi
            do Twojego konta. Ceny są wyliczane indywidualnie na podstawie ustalonego z Tobą mnożnika B2B.
            W feedach znajdują się wyłącznie produkty aktywne i na stanie magazynowym.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Zawartość plików</h2>
          <p className="leading-relaxed mb-2">Każdy plik zawiera następujące dane dla każdego produktu:</p>
          <ul className="space-y-1 text-gray-500 dark:text-gray-400">
            <li>— SKU (kod produktu)</li>
            <li>— Nazwa produktu</li>
            <li>— Cena hurtowa B2B (Twoja indywidualna)</li>
            <li>— Cena sklepowa (detaliczna)</li>
            <li>— EAN / kod kreskowy</li>
            <li>— Kategoria</li>
            <li>— Producent / marka</li>
            <li>— Stan magazynowy (aktualna ilość)</li>
            <li>— Link do produktu</li>
            <li>— Zdjęcia (XML: do 5, CSV: główne)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Różnice między formatami</h2>
          <p className="leading-relaxed">
            <strong className="text-gray-700 dark:text-gray-300">XML</strong> — format zgodny z Ceneo i BaseLinker.
            Nadaje się do importu w systemach marketplace i porównywarkach cenowych.
            Zawiera opis produktu i wiele zdjęć.
          </p>
          <p className="leading-relaxed mt-2">
            <strong className="text-gray-700 dark:text-gray-300">CSV</strong> — rozdzielany średnikiem, kodowanie UTF-8.
            Otworzysz go w Excelu, Google Sheets lub zaimportujesz do systemów ERP / WMS.
            Kolumny: sku, nazwa, cena_b2b, cena_sklepowa, ean, kategoria, producent, stan, link, zdjęcie.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Automatyczna integracja</h2>
          <p className="leading-relaxed mb-3">
            Przyciski &quot;Pobierz&quot; pobierają plik bezpośrednio z autoryzacją Twoim tokenem sesji.
            Jeśli chcesz automatycznie pobierać feed w swoim systemie (cron, skrypt), wyślij żądanie
            HTTP z nagłówkiem autoryzacyjnym:
          </p>
          <pre className="font-mono text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-secondary-800 p-3 rounded-lg overflow-x-auto leading-relaxed">
{`# Pobieranie XML
curl -H "Authorization: Bearer TWOJ_TOKEN" \\
  "${feedXmlUrl}" -o products.xml

# Pobieranie CSV
curl -H "Authorization: Bearer TWOJ_TOKEN" \\
  "${feedCsvUrl}" -o products.csv`}
          </pre>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            Token uzyskasz logując się przez API (POST /api/auth/login) lub z poziomu konta w ustawieniach.
            Token jest ważny przez 24 godziny — po upłynięciu musisz zalogować się ponownie.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Częstotliwość aktualizacji</h2>
          <p className="leading-relaxed">
            Dane w feedach są odświeżane w czasie rzeczywistym. Odpowiedzi są cache&apos;owane na 1 godzinę —
            częstsze odpytywanie nie przyniesie nowszych danych. Zalecamy pobieranie feedu co 1–2 godziny.
          </p>
        </div>
      </div>
    </div>
  );
}
