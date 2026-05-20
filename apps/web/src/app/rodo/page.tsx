import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Polityka RODO - WB Trade',
  description: 'Informacje o przetwarzaniu danych osobowych zgodnie z RODO w WB Trade',
};

export default function RodoPage() {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <Header />

      {/* Hero Section */}
      <section className="bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700 py-16">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-bold mb-4 text-secondary-900 dark:text-white">
              Polityka RODO
            </h1>
            <p className="text-secondary-500 dark:text-secondary-400">
              Informacje o przetwarzaniu danych osobowych
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
                  1. Administrator danych osobowych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Administratorem Twoich danych osobowych jest WB Partners Sp.&nbsp;z&nbsp;o.o. z&nbsp;siedzibą w&nbsp;Rzeszowie pod ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów, wpisana do rejestru przedsiębiorców KRS pod numerem 0001151642, NIP:&nbsp;5170455185, REGON:&nbsp;540735769.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  2. Kontakt w sprawach danych osobowych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  We wszystkich sprawach dotyczących przetwarzania danych osobowych możesz się z nami skontaktować:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>e-mail: support@wb-partners.pl,</li>
                  <li>telefon: +48 570 034 367,</li>
                  <li>adres: ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów.</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  3. Twoje prawa wynikające z RODO
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO) przysługują Ci następujące prawa:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li><strong>Prawo dostępu</strong> – masz prawo uzyskać potwierdzenie, czy przetwarzamy Twoje dane oraz uzyskać do nich dostęp.</li>
                  <li><strong>Prawo do sprostowania</strong> – masz prawo żądać poprawienia nieprawidłowych lub uzupełnienia niekompletnych danych.</li>
                  <li><strong>Prawo do usunięcia</strong> – masz prawo żądać usunięcia swoich danych („prawo do bycia zapomnianym").</li>
                  <li><strong>Prawo do ograniczenia przetwarzania</strong> – masz prawo żądać ograniczenia przetwarzania danych w określonych przypadkach.</li>
                  <li><strong>Prawo do przenoszenia danych</strong> – masz prawo otrzymać swoje dane w formacie nadającym się do odczytu maszynowego.</li>
                  <li><strong>Prawo do sprzeciwu</strong> – masz prawo wnieść sprzeciw wobec przetwarzania Twoich danych na potrzeby marketingu bezpośredniego.</li>
                  <li><strong>Prawo do cofnięcia zgody</strong> – jeśli przetwarzamy dane na podstawie zgody, możesz ją w każdej chwili wycofać.</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  4. Źródło danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Dane osobowe pozyskujemy bezpośrednio od Ciebie, w szczególności podczas: rejestracji konta, rejestracji Konta firmowego (B2B), składania zamówienia, wypełniania formularzy kontaktowych, zapisu do newslettera, przesłania etykiety wysyłkowej w ramach usługi „Wysyłka własna (B2B)" oraz w trakcie kontaktu z Biurem Obsługi Klienta.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Dodatkowo, po wyrażeniu zgody na pliki cookies, możemy pozyskiwać dane z urządzenia i przeglądarki, w szczególności identyfikatory cookies, adres IP oraz informacje o aktywności w Sklepie, w związku z korzystaniem z narzędzi analitycznych i marketingowych.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  5. Cele i podstawy prawne przetwarzania
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Twoje dane osobowe przetwarzamy w następujących celach:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li><strong>Realizacja zamówień</strong> – art. 6 ust. 1 lit. b RODO – przetwarzanie jest niezbędne do wykonania umowy.</li>
                  <li><strong>Obsługa konta użytkownika</strong> – art. 6 ust. 1 lit. b RODO – przetwarzanie jest niezbędne do świadczenia usług.</li>
                  <li><strong>Marketing bezpośredni</strong> – art. 6 ust. 1 lit. f RODO – na podstawie prawnie uzasadnionego interesu Administratora.</li>
                  <li><strong>Newsletter</strong> – art. 6 ust. 1 lit. a RODO – na podstawie Twojej dobrowolnej zgody.</li>
                  <li><strong>Rozpatrywanie reklamacji, zwrotów oraz realizacja praw konsumenta</strong> – art. 6 ust. 1 lit. b oraz c RODO – w ramach realizacji umowy oraz obowiązków prawnych.</li>
                  <li><strong>Obowiązki prawne</strong> – art. 6 ust. 1 lit. c RODO – w szczególności prowadzenie dokumentacji księgowej i podatkowej.</li>
                  <li><strong>Ustalenie, dochodzenie i obrona roszczeń</strong> – art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora.</li>
                  <li><strong>Weryfikacja i obsługa Konta firmowego (B2B)</strong>, w tym przetwarzanie danych takich jak NIP, nazwa firmy, adres siedziby oraz telefon kontaktowy – art. 6 ust. 1 lit. b RODO (działania zmierzające do zawarcia lub wykonania umowy) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora polegający na weryfikacji kontrahenta i zapobieganiu nadużyciom).</li>
                  <li><strong>Obsługa współpracy hurtowej B2B</strong>, w tym indywidualnego cennika, warunków płatności oraz realizacji Zamówień B2B – art. 6 ust. 1 lit. b RODO.</li>
                  <li><strong>Wystawianie i przechowywanie faktur VAT dla Klientów B2B</strong> – art. 6 ust. 1 lit. c RODO.</li>
                  <li><strong>Obsługa etykiet wysyłkowych przekazanych przez Klienta B2B</strong> w ramach usługi „Wysyłka własna (B2B)" – art. 6 ust. 1 lit. b RODO, w zakresie niezbędnym do wykonania Zamówienia.</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  6. Dobrowolność podania danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Podanie danych jest dobrowolne, jednak w niektórych przypadkach niezbędne do zawarcia i wykonania umowy oraz świadczenia usług.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Brak podania danych oznaczonych jako wymagane może uniemożliwić: złożenie i realizację zamówienia, wystawienie faktury, obsługę zwrotu lub reklamacji, aktywację Konta firmowego (B2B), obsługę wysyłki własnej (B2B) oraz kontakt w sprawie zamówienia.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  7. Okres przechowywania danych
                </h2>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li><strong>Dane konta:</strong> przez okres korzystania z usług; po usunięciu konta dane związane z profilem konta są usuwane i nie są dalej przechowywane.</li>
                  <li><strong>Dane zamówień:</strong> przez 5 lat od końca roku, w którym dokonano zakupu (wymogi podatkowe).</li>
                  <li><strong>Dane dotyczące Konta firmowego (B2B):</strong> przez okres korzystania z Konta firmowego, a następnie przez okres niezbędny do rozliczenia współpracy, wykonania obowiązków prawnych oraz ustalenia, dochodzenia lub obrony roszczeń.</li>
                  <li><strong>Dane dotyczące faktur i rozliczeń:</strong> przez okres wymagany przepisami podatkowymi i księgowymi.</li>
                  <li><strong>Dane marketingowe:</strong> do momentu wycofania zgody lub zgłoszenia sprzeciwu.</li>
                  <li><strong>Dane z formularzy kontaktowych:</strong> przez 2 lata od zakończenia sprawy.</li>
                  <li><strong>Etykiety wysyłkowe przesłane przez Klienta B2B:</strong> przez okres niezbędny do realizacji wysyłki i obsługi ewentualnych zgłoszeń związanych z daną przesyłką, a następnie przez okres niezbędny do ustalenia, dochodzenia lub obrony roszczeń, jeżeli jest to konieczne.</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  8. Pliki cookies i narzędzia analityczne/marketingowe
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Sklep wykorzystuje pliki cookies oraz podobne technologie.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Narzędzia analityczne i marketingowe (w tym Google Analytics 4 oraz Google Ads) są uruchamiane zgodnie z Twoimi ustawieniami plików cookies.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  W Sklepie stosujemy mechanizm zarządzania zgodami (Consent Mode v2), który pozwala na dostosowanie działania tagów analitycznych i reklamowych do udzielonych zgód.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Zgodę możesz w każdej chwili zmienić lub wycofać w ustawieniach cookies dostępnych w Sklepie.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  9. Odbiorcy danych
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Twoje dane mogą być przekazywane:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>firmom kurierskim realizującym dostawy,</li>
                  <li>operatorom płatności elektronicznych,</li>
                  <li>dostawcom usług IT i hostingu,</li>
                  <li>podmiotom świadczącym usługi księgowe,</li>
                  <li>organom państwowym – wyłącznie na podstawie przepisów prawa,</li>
                  <li>kurierom lub przewoźnikom wskazanym przez Klienta B2B w ramach usługi „Wysyłka własna (B2B)" – w zakresie danych zawartych na etykiecie wysyłkowej przekazanej przez Klienta B2B.</li>
                </ul>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  10. Przekazywanie danych poza EOG
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Co do zasady nie przekazujemy Twoich danych osobowych poza Europejski Obszar Gospodarczy (EOG).
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Jeżeli korzystamy z dostawców mających siedzibę poza EOG lub przetwarzających dane poza EOG, przekazanie odbywa się na podstawie odpowiednich zabezpieczeń, w szczególności standardowych klauzul umownych zatwierdzonych przez Komisję Europejską.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  11. Zautomatyzowane podejmowanie decyzji
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Nie podejmujemy wobec Ciebie decyzji wywołujących skutki prawne lub w podobny sposób istotnie na Ciebie wpływających, opartych wyłącznie na zautomatyzowanym przetwarzaniu.
                </p>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Możemy natomiast wykorzystywać narzędzia analityczne i marketingowe do tworzenia statystyk oraz kierowania reklam (profilowanie marketingowe), jeżeli wyrazisz na to zgodę w ramach ustawień plików cookie.
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  12. Skarga do organu nadzorczego
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                  Jeśli uważasz, że przetwarzanie Twoich danych osobowych narusza przepisy RODO, masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).
                </p>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  13. Kontakt
                </h2>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  W sprawach dotyczących przetwarzania danych osobowych możesz skontaktować się z nami:
                </p>
                <ul className="list-disc pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-2">
                  <li>e-mail: support@wb-partners.pl,</li>
                  <li>telefon: +48 570 034 367.</li>
                </ul>

              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
