import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Polityka prywatności - WB Trade',
  description: 'Polityka prywatności i ochrony danych osobowych w WB Trade',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <Header />

      {/* Hero Section */}
      <section className="bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700 py-16">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-bold mb-4 text-secondary-900 dark:text-white">
              Polityka prywatności
            </h1>
            <p className="text-secondary-500 dark:text-secondary-400">
              Ostatnia aktualizacja: 20 maja 2026
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-secondary-800 rounded-2xl shadow-sm p-8 lg:p-12">
              <div className="prose prose-lg dark:prose-invert max-w-none">

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-0 mb-4">
                  1. Informacje ogólne
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Niniejsza Polityka Prywatności określa zasady przetwarzania i&nbsp;ochrony danych osobowych
                  przekazanych przez Użytkowników w&nbsp;związku z&nbsp;korzystaniem ze&nbsp;Sklepu prowadzonego pod adresem wb-trade.pl oraz aplikacji mobilnej WB&nbsp;Trade („Sklep").
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Administratorem danych osobowych jest WB&nbsp;Partners Sp.&nbsp;z&nbsp;o.o. z&nbsp;siedzibą w&nbsp;Rzeszowie pod ul.&nbsp;Juliusza
                  Słowackiego 24/11, 35-060 Rzeszów, wpisana do&nbsp;rejestru przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez Sąd Rejonowy w&nbsp;Rzeszowie, XII&nbsp;Wydział Gospodarczy Krajowego Rejestru Sądowego pod numerem
                  0001151642, NIP:&nbsp;5170455185, REGON:&nbsp;540735769.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Podanie danych osobowych jest dobrowolne, lecz niezbędne do&nbsp;korzystania z&nbsp;określonych funkcji Sklepu,
                  w&nbsp;szczególności do&nbsp;składania zamówień, zakładania konta, kontaktu z&nbsp;Biurem Obsługi Klienta oraz
                  realizacji płatności za&nbsp;pośrednictwem operatorów płatności (PayU, imoje).
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  2. Zakres zbieranych danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Zbieramy następujące dane osobowe:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>imię i nazwisko,</li>
                  <li>adres e-mail,</li>
                  <li>numer telefonu,</li>
                  <li>adres dostawy,</li>
                  <li>dane rozliczeniowe,</li>
                  <li>dane do faktury,</li>
                  <li>dane zamówień,</li>
                  <li>dane techniczne i analityczne.</li>
                </ul>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  W przypadku rejestracji Konta firmowego (B2B) dodatkowo przetwarzamy dane firmowe, takie jak:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>NIP,</li>
                  <li>nazwa firmy,</li>
                  <li>adres siedziby firmy,</li>
                  <li>numer telefonu kontaktowego,</li>
                  <li>adres e-mail,</li>
                  <li>dane osoby kontaktowej, jeżeli zostały podane.</li>
                </ul>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  W przypadku korzystania z&nbsp;usługi „Wysyłka własna (B2B)" możemy przetwarzać dane zawarte na&nbsp;etykiecie wysyłkowej przesłanej przez Klienta B2B, w&nbsp;zakresie niezbędnym do&nbsp;przygotowania paczki, umieszczenia etykiety na&nbsp;przesyłce i&nbsp;przekazania jej przewoźnikowi wskazanemu przez Klienta B2B.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  3. Źródło danych osobowych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Dane osobowe pozyskujemy bezpośrednio od&nbsp;Ciebie, w&nbsp;szczególności podczas:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>rejestracji konta,</li>
                  <li>rejestracji Konta firmowego (B2B),</li>
                  <li>składania zamówienia,</li>
                  <li>wypełniania formularzy kontaktowych,</li>
                  <li>zapisu do newslettera,</li>
                  <li>kontaktu z Biurem Obsługi Klienta,</li>
                  <li>przesłania etykiety wysyłkowej w ramach usługi „Wysyłka własna (B2B)".</li>
                </ul>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Dodatkowo, po&nbsp;wyrażeniu zgody na&nbsp;pliki cookies, możemy pozyskiwać dane z&nbsp;urządzenia i&nbsp;przeglądarki, w&nbsp;szczególności identyfikatory cookies, adres IP oraz informacje o&nbsp;aktywności w&nbsp;Sklepie, w&nbsp;związku z&nbsp;korzystaniem z&nbsp;narzędzi analitycznych i&nbsp;marketingowych.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  4. Cel przetwarzania danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Dane osobowe przetwarzane są w celu:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>realizacji zamówień i umów sprzedaży,</li>
                  <li>obsługi konta użytkownika, jeżeli zostało założone,</li>
                  <li>obsługi Konta firmowego (B2B),</li>
                  <li>weryfikacji statusu przedsiębiorcy w ramach współpracy B2B,</li>
                  <li>obsługi współpracy hurtowej, w tym indywidualnego cennika oraz warunków płatności,</li>
                  <li>generowania i przechowywania faktur VAT,</li>
                  <li>obsługi etykiet wysyłkowych przesłanych przez Klienta B2B w ramach usługi „Wysyłka własna (B2B)",</li>
                  <li>obsługi zwrotów i reklamacji,</li>
                  <li>kontaktu z klientem w sprawach zamówienia, zwrotu lub reklamacji,</li>
                  <li>prowadzenia analiz i statystyk,</li>
                  <li>marketingu bezpośredniego – na podstawie prawnie uzasadnionego interesu,</li>
                  <li>wysyłki newslettera – wyłącznie na podstawie zgody użytkownika,</li>
                  <li>wypełnienia obowiązków prawnych, w szczególności podatkowych i księgowych,</li>
                  <li>ustalenia, dochodzenia i obrony roszczeń.</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  5. Podstawa prawna przetwarzania
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Przetwarzamy dane osobowe na podstawie:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>art. 6 ust. 1 lit. a RODO – zgoda użytkownika,</li>
                  <li>art. 6 ust. 1 lit. b RODO – niezbędność do wykonania umowy lub podjęcia działań przed jej zawarciem,</li>
                  <li>art. 6 ust. 1 lit. c RODO – wypełnienie obowiązku prawnego,</li>
                  <li>art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes administratora.</li>
                </ul>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Szczegółowe cele i&nbsp;przypisane im podstawy prawne wskazujemy w&nbsp;dokumencie „RODO" dostępnym
                  w&nbsp;Sklepie.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  6. Okres przechowywania danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Dane osobowe przechowywane są przez okres niezbędny do&nbsp;realizacji celów, dla których zostały
                  zebrane, a&nbsp;następnie przez okres wymagany przepisami prawa, w&nbsp;szczególności przepisami podatkowymi i&nbsp;księgowymi.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Dane przetwarzane na&nbsp;podstawie zgody przechowujemy do&nbsp;momentu jej wycofania, chyba że dalsze przetwarzanie jest niezbędne na&nbsp;innej podstawie prawnej.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Szczegółowe informacje o&nbsp;okresie przechowywania danych wskazujemy w&nbsp;dokumencie „RODO"
                  dostępnym w&nbsp;Sklepie.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  7. Prawa użytkownika
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Każdy użytkownik ma prawo do:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>dostępu do swoich danych osobowych,</li>
                  <li>sprostowania nieprawdziwych danych,</li>
                  <li>usunięcia danych („prawo do bycia zapomnianym"),</li>
                  <li>ograniczenia przetwarzania,</li>
                  <li>przenoszenia danych,</li>
                  <li>sprzeciwu wobec przetwarzania,</li>
                  <li>sprzeciwu wobec przetwarzania danych na potrzeby marketingu bezpośredniego,</li>
                  <li>wycofania zgody w dowolnym momencie,</li>
                  <li>wniesienia skargi do organu nadzorczego (UODO).</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  8. Odbiorcy danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Dane osobowe mogą być przekazywane następującym podmiotom:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>firmom kurierskim i pocztowym – w celu dostawy zamówień,</li>
                  <li>operatorom płatności – PayU S.A. oraz imoje (ING Bank Śląski S.A.) – w celu realizacji płatności,</li>
                  <li>dostawcom usług IT i hostingu,</li>
                  <li>podmiotom świadczącym usługi księgowe,</li>
                  <li>kancelariom prawnym – jeżeli jest to niezbędne do obsługi sprawy, dochodzenia roszczeń lub obrony przed roszczeniami,</li>
                  <li>organom państwowym – na podstawie przepisów prawa,</li>
                  <li>kurierom lub przewoźnikom wskazanym przez Klienta B2B w ramach usługi „Wysyłka własna (B2B)" – w zakresie danych zawartych na etykiecie wysyłkowej przesłanej przez Klienta.</li>
                </ul>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Etykieta wysyłkowa w&nbsp;ramach usługi „Wysyłka własna (B2B)" jest dostarczana przez Klienta B2B. Klient B2B decyduje, jakie dane znajdują się na&nbsp;etykiecie, a&nbsp;Sprzedawca przetwarza ją wyłącznie w&nbsp;celu przygotowania paczki, umieszczenia etykiety na&nbsp;przesyłce i&nbsp;wydania przesyłki przewoźnikowi.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  9. Pliki cookies
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Serwis wykorzystuje pliki cookies oraz podobne technologie.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Narzędzia analityczne i&nbsp;marketingowe, w&nbsp;tym Google Analytics 4 oraz Google Ads, są uruchamiane zgodnie z&nbsp;ustawieniami plików cookies użytkownika.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  W Sklepie stosowany jest mechanizm zarządzania zgodami (Consent Mode v2), który pozwala dostosować działanie tagów analitycznych i&nbsp;reklamowych do&nbsp;udzielonych zgód.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Użytkownik może w&nbsp;każdej chwili zmienić lub wycofać zgodę w&nbsp;ustawieniach cookies dostępnych w&nbsp;Sklepie.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  10. Bezpieczeństwo danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Stosujemy odpowiednie środki techniczne i&nbsp;organizacyjne w&nbsp;celu ochrony danych osobowych
                  przed nieuprawnionym dostępem, utratą lub zniszczeniem. Wykorzystujemy szyfrowanie SSL,
                  kontrolę dostępu oraz&nbsp;regularne kopie zapasowe.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  11. Profilowanie
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Administrator może wykorzystywać profilowanie w&nbsp;celu:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-4 space-y-2">
                  <li>dostosowania treści i&nbsp;ofert do&nbsp;preferencji użytkownika (np.&nbsp;rekomendacje produktów na&nbsp;podstawie historii przeglądanych produktów i&nbsp;wcześniejszych zakupów),</li>
                  <li>prowadzenia analiz statystycznych dotyczących sposobu korzystania ze&nbsp;Sklepu,</li>
                  <li>kierowania komunikatów marketingowych dopasowanych do&nbsp;zainteresowań użytkownika (wyłącznie za&nbsp;jego zgodą).</li>
                </ul>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Efektem profilowania może być w&nbsp;szczególności: wyświetlanie spersonalizowanych rekomendacji produktów, przyznanie rabatów w&nbsp;ramach programu lojalnościowego, przesyłanie dopasowanych treści newslettera, a&nbsp;także wyświetlanie spersonalizowanych reklam.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Profilowanie nie skutkuje podejmowaniem decyzji wywołujących wobec użytkownika skutki prawne
                  lub istotnie wpływających na&nbsp;niego w&nbsp;podobny sposób w&nbsp;rozumieniu art.&nbsp;22 RODO. Użytkownik ma prawo
                  wnieść sprzeciw wobec profilowania na&nbsp;zasadach opisanych w&nbsp;sekcji 7 niniejszej Polityki.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  12. Kontakt
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  W sprawach związanych z ochroną danych osobowych można kontaktować się:
                </p>
                <ul className="list-none text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li><strong>E-mail:</strong> support@wb-partners.pl</li>
                  <li><strong>Telefon:</strong> +48 570 034 367</li>
                  <li><strong>Adres:</strong> WB Partners Sp. z o.o., ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  13. Zmiany polityki prywatności
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Administrator może wprowadzać zmiany w&nbsp;Polityce Prywatności w&nbsp;szczególności w&nbsp;przypadku zmian przepisów prawa, zmian funkcjonalności Sklepu, zmian zasad współpracy B2B lub zmian wykorzystywanych narzędzi technologicznych.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Aktualna wersja Polityki Prywatności jest publikowana w&nbsp;Sklepie.
                </p>

              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
