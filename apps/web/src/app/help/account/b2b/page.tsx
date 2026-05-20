import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import Link from 'next/link';

export const metadata = {
  title: 'Konto firmowe B2B - Centrum pomocy - WB Trade',
  description: 'Informacje o rejestracji konta firmowego B2B, warunkach współpracy hurtowej i procesie weryfikacji.',
};

export default function HelpB2BPage() {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <Header />

      <main className="py-12 lg:py-16">
        <div className="container-custom max-w-4xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-secondary-500 mb-8">
            <Link href="/help" className="hover:text-primary-500">Centrum pomocy</Link>
            <span>/</span>
            <Link href="/help" className="hover:text-primary-500">Konto</Link>
            <span>/</span>
            <span className="text-secondary-900 dark:text-white">Konto firmowe B2B</span>
          </nav>

          <h1 className="text-3xl lg:text-4xl font-bold text-secondary-900 dark:text-white mb-8">
            Konto firmowe (B2B)
          </h1>

          <div className="bg-white dark:bg-secondary-800 rounded-2xl p-8 shadow-sm space-y-8">
            {/* Czym jest konto B2B */}
            <section>
              <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-3">
                Czym jest konto firmowe B2B?
              </h2>
              <p className="text-secondary-700 dark:text-secondary-300 leading-relaxed">
                Konto firmowe B2B przeznaczone jest dla przedsiębiorców i firm, które chcą kupować produkty w cenach hurtowych.
                Po weryfikacji otrzymujesz dostęp do dedykowanego cennika, płatności przelewem oraz obniżonych kosztów dostawy.
              </p>
            </section>

            {/* Jak założyć */}
            <section>
              <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-3">
                Jak założyć konto firmowe?
              </h2>
              <ol className="list-decimal list-inside space-y-3 text-secondary-700 dark:text-secondary-300">
                <li>
                  Przejdź do <Link href="/register" className="text-primary-600 hover:underline">strony rejestracji</Link> i wybierz zakładkę <strong>&quot;Konto firmowe (B2B)&quot;</strong>.
                </li>
                <li>
                  Wypełnij formularz podając dane firmy: nazwę, NIP, adres siedziby i numer telefonu kontaktowego.
                </li>
                <li>
                  Poczekaj na weryfikację — nasz zespół sprawdzi podane dane (zazwyczaj 1-2 dni robocze).
                </li>
                <li>
                  Po zatwierdzeniu otrzymasz powiadomienie e-mail. Od tego momentu zobaczysz ceny hurtowe.
                </li>
              </ol>
            </section>

            {/* Warunki */}
            <section>
              <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-3">
                Warunki współpracy B2B
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-2">💰 Ceny</h4>
                  <p className="text-sm text-secondary-600 dark:text-secondary-400">
                    Dedykowany cennik hurtowy z indywidualnym mnożnikiem. Ceny widoczne po zalogowaniu na zatwierdzone konto B2B.
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-2">🚚 Dostawa</h4>
                  <p className="text-sm text-secondary-600 dark:text-secondary-400">
                    Wysyłka własna: 1,99 zł (przy zamówieniach od 50 zł) lub 4,99 zł (poniżej 50 zł).
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-2">🏦 Płatności</h4>
                  <p className="text-sm text-secondary-600 dark:text-secondary-400">
                    Przelew bankowy z terminem płatności 7 dni. Faktura VAT generowana automatycznie.
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-2">📋 Feed produktowy</h4>
                  <p className="text-sm text-secondary-600 dark:text-secondary-400">
                    Dostęp do pliku produktowego (XML/CSV) do integracji z własnym sklepem lub marketplace.
                  </p>
                </div>
              </div>
            </section>

            {/* Wysyłka własna B2B */}
            <section>
              <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-3">
                Wysyłka własna B2B — jak to działa?
              </h2>
              <p className="text-secondary-700 dark:text-secondary-300 leading-relaxed mb-4">
                Jako partner B2B masz dostęp do opcji <strong>&quot;Wysyłka własna (B2B)&quot;</strong>. Oznacza to, że samodzielnie organizujesz transport zamówienia za pomocą swojego kuriera.
              </p>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-5 space-y-4">
                <h4 className="font-medium text-secondary-900 dark:text-white">📦 Krok po kroku:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-secondary-700 dark:text-secondary-300">
                  <li>Przy składaniu zamówienia wybierz metodę dostawy <strong>&quot;Wysyłka własna (B2B)&quot;</strong>.</li>
                  <li>Koszt wysyłki: <strong>1,99 zł</strong> (zamówienia od 50 zł) lub <strong>4,99 zł</strong> (poniżej 50 zł) — jest to opłata obsługowa.</li>
                  <li>Po złożeniu zamówienia przejdź do szczegółów zamówienia w panelu konta.</li>
                  <li>W sekcji <strong>&quot;Etykieta wysyłkowa&quot;</strong> wgraj etykietę swojego kuriera (PDF, JPEG, PNG lub WebP, max 10 MB).</li>
                  <li>Nasz magazyn nalepi etykietę na paczkę i wyda ją Twojemu kurierowi.</li>
                </ol>
              </div>
              <div className="mt-4 bg-gray-50 dark:bg-secondary-700/50 rounded-xl p-4">
                <h4 className="font-medium text-secondary-900 dark:text-white mb-2">ℹ️ Ważne informacje:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary-600 dark:text-secondary-400">
                  <li>Etykietę możesz przesłać w dowolnym momencie po złożeniu zamówienia.</li>
                  <li>Możesz też usunąć i ponownie wgrać etykietę, jeśli pomylisz się przy pierwszym przesłaniu.</li>
                  <li>Dozwolone formaty: PDF, JPEG, PNG, WebP. Maksymalny rozmiar pliku: 10 MB.</li>
                  <li>Zamówienie zostanie wysłane po wgraniu etykiety i zgłoszeniu kuriera po odbiór.</li>
                </ul>
              </div>
            </section>

            {/* FAQ */}
            <section>
              <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-3">
                Najczęściej zadawane pytania
              </h2>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-1">
                    Ile trwa weryfikacja konta?
                  </h4>
                  <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                    Zazwyczaj 1-2 dni robocze. W razie potrzeby skontaktujemy się telefonicznie w celu potwierdzenia danych.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-1">
                    Czy mogę zmienić konto indywidualne na firmowe?
                  </h4>
                  <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                    Tak — skontaktuj się z nami przez <Link href="/contact" className="text-primary-600 hover:underline">formularz kontaktowy</Link>, a pomożemy przekształcić konto.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-secondary-900 dark:text-white mb-1">
                    Jaki jest minimalny próg zamówienia?
                  </h4>
                  <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                    Nie ma minimalnej kwoty zamówienia. Możesz zamawiać pojedyncze sztuki w cenach hurtowych.
                  </p>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-6">
              <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                Masz więcej pytań? Sprawdź stronę <Link href="/cooperation" className="text-primary-600 hover:underline">Współpraca B2B</Link> lub skontaktuj się z nami.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/register"
                  className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Zarejestruj konto firmowe
                </Link>
                <Link
                  href="/contact"
                  className="px-5 py-2.5 border border-secondary-300 dark:border-secondary-600 text-secondary-700 dark:text-secondary-300 font-medium rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors text-sm"
                >
                  Kontakt
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
