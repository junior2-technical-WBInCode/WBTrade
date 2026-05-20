import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import Link from 'next/link';

export const metadata = {
  title: 'Współpraca B2B - Centrum pomocy - WB Trade',
  description: 'FAQ i informacje o współpracy B2B: konto firmowe, cennik hurtowy, płatność przelewem, wysyłka własna, feed XML/CSV, lokalizacje logistyczne.',
};

export default function HelpB2BCooperationPage() {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <Header />

      <main className="py-12 lg:py-16">
        <div className="container-custom max-w-4xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-secondary-500 mb-8">
            <Link href="/help" className="hover:text-primary-500">Centrum pomocy</Link>
            <span>/</span>
            <span className="text-secondary-900 dark:text-white">Współpraca B2B</span>
          </nav>

          <h1 className="text-3xl lg:text-4xl font-bold text-secondary-900 dark:text-white mb-8">
            FAQ / Centrum pomocy — Współpraca B2B
          </h1>

          <div className="bg-white dark:bg-secondary-800 rounded-2xl p-8 shadow-sm">
            <div className="prose prose-lg dark:prose-invert max-w-none">

              {/* § 1 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-0 mb-4">
                § 1. Konto firmowe B2B
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Konto firmowe (B2B) jest przeznaczone dla przedsiębiorców, którzy chcą korzystać z funkcji hurtowych w Sklepie.</li>
                <li>
                  Podczas rejestracji należy podać dane firmy, w tym:
                  <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                    <li>nazwę firmy,</li>
                    <li>NIP,</li>
                    <li>adres siedziby,</li>
                    <li>numer telefonu kontaktowego,</li>
                    <li>adres e-mail.</li>
                  </ul>
                </li>
                <li>Po złożeniu wniosku Konto firmowe podlega weryfikacji przez Sprzedawcę.</li>
                <li>Weryfikacja trwa zazwyczaj 1–2 dni robocze. W przypadku kontaktu z Biurem Obsługi Klienta lub infolinią weryfikacja może zostać przeprowadzona jeszcze tego samego dnia, jeżeli będzie to możliwe organizacyjnie.</li>
                <li>Po zatwierdzeniu Konta firmowego Klient otrzymuje wiadomość e-mail i może korzystać z funkcji B2B udostępnionych w Sklepie.</li>
              </ol>

              {/* § 2 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                § 2. Cennik hurtowy
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Ceny hurtowe są dostępne wyłącznie dla Klientów posiadających zatwierdzone Konto firmowe (B2B).</li>
                <li>Po zalogowaniu na zatwierdzone konto Klient może zobaczyć ceny i warunki przypisane do jego konta.</li>
                <li>Wysokość rabatu hurtowego oraz warunki handlowe mogą być ustalane indywidualnie przez Sprzedawcę.</li>
                <li>Sprzedawca może zmienić, ograniczyć lub cofnąć warunki hurtowe w przypadku naruszenia Regulaminu, zaległości płatniczych, podejrzenia nadużyć, braku aktywności handlowej albo zmiany polityki handlowej.</li>
              </ol>

              {/* § 3 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                § 3. Płatność przelewem B2B
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Dla zatwierdzonych Klientów B2B może być dostępna płatność przelewem bankowym z terminem płatności 7 dni kalendarzowych.</li>
                <li>Termin 7 dni oznacza czas na dokonanie płatności.</li>
                <li>Ta metoda nie oznacza wysyłki przed zapłatą.</li>
                <li>Zamówienie jest przekazywane do realizacji i wysyłki dopiero po zaksięgowaniu płatności na rachunku bankowym Sprzedawcy.</li>
                <li>Do czasu zaksięgowania płatności Produkt nie jest rezerwowany.</li>
                <li>Jeżeli przed zaksięgowaniem płatności Produkt przestanie być dostępny albo realizacja zamówienia nie będzie możliwa, Sprzedawca poinformuje Klienta B2B o braku możliwości realizacji zamówienia i zwróci otrzymaną płatność, jeżeli została już zaksięgowana.</li>
              </ol>

              {/* § 4 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                § 4. Wysyłka własna B2B
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Wysyłka własna (B2B) pozwala Klientowi B2B zorganizować transport zamówienia samodzielnie za pośrednictwem wybranego przewoźnika.</li>
                <li>Po złożeniu zamówienia Klient przesyła etykietę wysyłkową w panelu konta, w szczegółach zamówienia.</li>
                <li>Sprzedawca przygotowuje paczkę, umieszcza na niej etykietę i wydaje przesyłkę przewoźnikowi wskazanemu przez Klienta.</li>
                <li>Dozwolone formaty etykiety to: PDF, JPEG, PNG oraz WebP. Maksymalny rozmiar pliku wynosi 10 MB.</li>
                <li>Błędna, nieczytelna lub brakująca etykieta może opóźnić przygotowanie albo wydanie przesyłki.</li>
                <li>Klient B2B odpowiada za poprawność danych na etykiecie i wybór przewoźnika.</li>
              </ol>

              {/* § 5 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                § 5. Feed XML/CSV
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Zatwierdzeni Klienci B2B mogą uzyskać dostęp do feedu produktowego XML/CSV, jeżeli taka funkcja jest dostępna dla ich konta.</li>
                <li>Feed ma charakter informacyjny i techniczny.</li>
                <li>Dane o dostępności, cenach, parametrach produktów oraz czasie realizacji mogą się zmieniać.</li>
                <li>Wiążące są dane widoczne w Sklepie w chwili składania zamówienia.</li>
              </ol>

              {/* § 6 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                § 6. Produkty z różnych lokalizacji logistycznych
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Część zamówień może być realizowana z różnych lokalizacji logistycznych.</li>
                <li>Oznacza to, że produkty z jednego zamówienia mogą zostać wysłane w kilku paczkach i w różnych terminach.</li>
                <li>Informacje o wysyłce i numerach przesyłek są przekazywane po nadaniu paczek.</li>
                <li>Jeżeli termin realizacji ulegnie istotnemu wydłużeniu, Sprzedawca poinformuje o tym Klienta.</li>
              </ol>

              {/* § 7 */}
              <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                § 7. Brak automatycznej rezerwacji produktu
              </h2>
              <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                <li>Złożenie zamówienia nie oznacza automatycznej rezerwacji produktu.</li>
                <li>Produkt zostaje przeznaczony do realizacji zamówienia dopiero po przyjęciu zamówienia do realizacji przez Sprzedawcę oraz, jeżeli zamówienie wymaga wcześniejszej płatności, po zaksięgowaniu płatności.</li>
                <li>Przy płatności przelewem produkt nie jest rezerwowany do czasu zaksięgowania płatności.</li>
              </ol>

            </div>

            {/* CTA */}
            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-6 mt-8">
              <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                Masz więcej pytań? Skontaktuj się z nami lub sprawdź szczegóły na stronie Współpraca B2B.
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
