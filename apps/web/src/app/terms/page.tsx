import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Regulamin - WB Trade',
  description: 'Regulamin sklepu internetowego WB Trade - zasady korzystania z serwisu',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <Header />

      {/* Hero Section */}
      <section className="bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700 py-16">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-bold mb-4 text-secondary-900 dark:text-white">
              Regulamin
            </h1>
            <p className="text-secondary-500 dark:text-secondary-400">
              Ostatnia aktualizacja: 20 maja 2026 r.
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
                  § 1. Postanowienia ogólne
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Niniejszy Regulamin określa zasady korzystania ze Sklepu prowadzonego za pośrednictwem serwisu internetowego dostępnego pod adresem https://www.wb-trade.pl oraz aplikacji mobilnej WB&nbsp;Trade (dalej łącznie: „Sklep").</li>
                  <li>Właścicielem i operatorem Sklepu jest: WB Partners Sp.&nbsp;z&nbsp;o.o. z&nbsp;siedzibą w&nbsp;Rzeszowie, ul.&nbsp;Juliusza Słowackiego 24/11, 35-060 Rzeszów, NIP:&nbsp;5170455185, REGON:&nbsp;540735769, KRS:&nbsp;0001151642 (dalej: „Sprzedawca").</li>
                  <li>
                    Kontakt ze Sprzedawcą:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>e-mail: support@wb-partners.pl,</li>
                      <li>telefon: +48 570 034 367,</li>
                      <li>godziny obsługi: pon.–pt. 9:00–17:00.</li>
                    </ul>
                  </li>
                  <li>Regulamin jest udostępniony nieodpłatnie w Sklepie w sposób umożliwiający jego pozyskanie, odtwarzanie i utrwalanie.</li>
                  <li>Do korzystania ze Sklepu niezbędne są: urządzenie z dostępem do Internetu, aktualna przeglądarka internetowa lub aplikacja mobilna WB&nbsp;Trade w aktualnej wersji oraz aktywne konto e-mail w przypadku składania Zamówień.</li>
                  <li>Regulamin ma zastosowanie do Umów sprzedaży zawieranych w Sklepie z Klientami na terytorium Rzeczypospolitej Polskiej, o ile Strony nie postanowią inaczej. Szczegółowe zasady współpracy z&nbsp;Klientami B2B mogą być opisane również na stronie „Współpraca" oraz w&nbsp;Centrum pomocy, jeżeli takie sekcje są udostępnione w&nbsp;Sklepie. Postanowienia Regulaminu stosuje się do Klientów B2B, z&nbsp;zastrzeżeniem szczególnych zasad dotyczących Konta firmowego (B2B), cennika hurtowego, płatności przelewem bankowym, faktur B2B, feedu produktowego XML/CSV, wysyłki własnej B2B oraz realizacji Zamówień z&nbsp;różnych lokalizacji logistycznych.</li>
                  <li>Sklep nie jest marketplace'em umożliwiającym sprzedaż przez zewnętrznych sprzedawców – Sprzedawca oferuje produkty we własnym imieniu.</li>
                  <li>Złożenie Zamówienia w Sklepie wymaga zapoznania się z Regulaminem i jego akceptacji w toku składania Zamówienia.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 2. Definicje
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li><strong>Klient</strong> – osoba fizyczna, osoba prawna lub jednostka organizacyjna posiadająca zdolność prawną, korzystająca ze Sklepu, w tym składająca Zamówienie.</li>
                  <li><strong>Konsument</strong> – osoba fizyczna dokonująca zakupu niezwiązanego bezpośrednio z jej działalnością gospodarczą lub zawodową.</li>
                  <li><strong>Przedsiębiorca</strong> – osoba fizyczna, osoba prawna lub jednostka organizacyjna prowadząca działalność gospodarczą lub zawodową.</li>
                  <li><strong>Przedsiębiorca na prawach konsumenta</strong> – osoba fizyczna zawierająca Umowę bezpośrednio związaną z jej działalnością gospodarczą, gdy z treści Umowy wynika, że nie ma ona dla tej osoby charakteru zawodowego (w rozumieniu przepisów prawa).</li>
                  <li><strong>Konto</strong> – indywidualne konto Klienta w Sklepie, umożliwiające korzystanie z wybranych funkcji, w tym podgląd Zamówień.</li>
                  <li><strong>Konto firmowe (B2B)</strong> – Konto w Sklepie przeznaczone dla przedsiębiorców, zapewniające dostęp do funkcji B2B udostępnionych przez Sprzedawcę, w szczególności indywidualnego cennika hurtowego, płatności przelewem bankowym, feedu produktowego XML/CSV oraz dedykowanych metod dostawy. Założenie Konta firmowego wymaga weryfikacji i zatwierdzenia przez Sprzedawcę.</li>
                  <li><strong>Klient B2B</strong> – Klient będący przedsiębiorcą, który posiada zatwierdzone Konto firmowe (B2B) albo korzysta z funkcji B2B udostępnionych przez Sprzedawcę.</li>
                  <li><strong>Cennik hurtowy</strong> – indywidualny cennik lub warunki cenowe udostępnione Klientowi B2B po zalogowaniu na zatwierdzone Konto firmowe.</li>
                  <li><strong>Wysyłka własna (B2B)</strong> – metoda realizacji dostawy, w której Klient B2B samodzielnie organizuje transport Zamówienia za pośrednictwem wybranego przez siebie przewoźnika i przekazuje Sprzedawcy etykietę wysyłkową.</li>
                  <li><strong>Feed produktowy XML/CSV</strong> – plik lub link techniczny udostępniony zatwierdzonemu Klientowi B2B, zawierający dane o Produktach, w szczególności nazwy, parametry, ceny, dostępność lub inne informacje techniczne, mający charakter informacyjny.</li>
                  <li><strong>Produkt</strong> – rzecz ruchoma oferowana w Sklepie. Sklep nie oferuje produktów cyfrowych.</li>
                  <li><strong>Koszyk</strong> – funkcjonalność Sklepu umożliwiająca gromadzenie wybranych Produktów przed złożeniem Zamówienia.</li>
                  <li><strong>Zamówienie</strong> – oświadczenie woli Klienta zmierzające bezpośrednio do zawarcia Umowy sprzedaży Produktu/Produktów.</li>
                  <li><strong>Oferta</strong> – złożone przez Klienta Zamówienie, które stanowi ofertę w rozumieniu przepisów prawa, do czasu otrzymania przez Klienta oświadczenia Sprzedawcy o przyjęciu Zamówienia do realizacji (dalej: „Potwierdzenie przyjęcia Zamówienia do realizacji"). Potwierdzenie przyjęcia Zamówienia do realizacji jest wysyłane w formie wiadomości e-mail na adres podany przez Klienta podczas składania Zamówienia.</li>
                  <li><strong>Umowa</strong> – umowa sprzedaży zawarta pomiędzy Sprzedawcą a Klientem na odległość, na zasadach określonych w Regulaminie.</li>
                  <li><strong>Dzień roboczy</strong> – dzień od poniedziałku do piątku, z wyłączeniem dni ustawowo wolnych od pracy.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 3. Konto, zakupy bez rejestracji i Konto firmowe (B2B)
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Założenie Konta jest dobrowolne i bezpłatne.</li>
                  <li>Klient może dokonywać zakupów bez rejestracji (jako „gość"), jeżeli Sklep udostępnia taką funkcjonalność.</li>
                  <li>Założenie Konta wymaga podania co najmniej adresu e-mail i utworzenia hasła. Klient jest zobowiązany do podania danych zgodnych z prawdą.</li>
                  <li>Klient ponosi odpowiedzialność za zachowanie poufności danych logowania. Sprzedawca nie ponosi odpowiedzialności za skutki ujawnienia danych logowania osobom trzecim z przyczyn leżących po stronie Klienta.</li>
                  <li>
                    Sprzedawca może zablokować lub usunąć Konto, jeżeli:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Klient narusza postanowienia Regulaminu lub przepisy prawa,</li>
                      <li>działania Klienta zagrażają bezpieczeństwu Sklepu, Sprzedawcy lub innych Klientów,</li>
                      <li>Klient podejmuje działania o charakterze nadużyciowym, w szczególności próby wyłudzeń, manipulacje kuponami lub fałszywe zgłoszenia.</li>
                    </ul>
                  </li>
                  <li>Usunięcie Konta nie wpływa na ważność Umów zawartych przed jego usunięciem. Klient może utracić dostęp do historii zamówień w panelu Konta – w takiej sytuacji informacje o Zamówieniach Sprzedawca udostępni Klientowi po weryfikacji danych zamówienia.</li>
                  <li>
                    Rejestracja Konta firmowego (B2B):
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Klient może wybrać opcję „Konto firmowe (B2B)" podczas rejestracji, jeżeli taka funkcjonalność jest dostępna w Sklepie.</li>
                      <li>Do rejestracji Konta firmowego wymagane są co najmniej: nazwa firmy, NIP, adres siedziby, numer telefonu kontaktowego oraz adres e-mail.</li>
                      <li>Po złożeniu wniosku Sprzedawca weryfikuje dane przedsiębiorcy. Weryfikacja trwa zazwyczaj 1–2 dni robocze. W przypadku kontaktu z Biurem Obsługi Klienta lub infolinią Sprzedawca może, w miarę możliwości organizacyjnych, przeprowadzić weryfikację jeszcze tego samego dnia.</li>
                      <li>Po pozytywnej weryfikacji Klient otrzymuje powiadomienie e-mail o zatwierdzeniu Konta firmowego. Od tego momentu Klient może uzyskać dostęp do funkcji B2B udostępnionych przez Sprzedawcę, w szczególności: cennika hurtowego, płatności przelewem bankowym, feedu produktowego XML/CSV, wysyłki własnej B2B, innych dokumentów, plików lub materiałów związanych ze współpracą B2B, jeżeli są potrzebne do realizacji współpracy i Sprzedawca je posiada.</li>
                      <li>Sprzedawca może odmówić aktywacji Konta firmowego, w szczególności w przypadku negatywnej weryfikacji danych, braku możliwości potwierdzenia statusu przedsiębiorcy, podejrzenia nadużycia, naruszenia Regulaminu albo innych uzasadnionych przyczyn organizacyjnych, bezpieczeństwa lub polityki handlowej Sprzedawcy.</li>
                    </ul>
                  </li>
                  <li>Sprzedawca może udostępnić zatwierdzonym Klientom B2B feed produktowy XML/CSV. Feed ma charakter informacyjny i techniczny. Dane o dostępności, cenach, parametrach Produktów oraz czasie realizacji mogą ulegać zmianom, a wiążące dla Stron są dane widoczne w Sklepie w chwili składania Zamówienia, z zastrzeżeniem postanowień Regulaminu dotyczących błędów technicznych, dostępności Produktów oraz odmowy przyjęcia Zamówienia do realizacji.</li>
                  <li>Sprzedawca może ograniczyć, zawiesić lub cofnąć dostęp do feedu produktowego XML/CSV w przypadku naruszenia Regulaminu, podejrzenia nadużycia, zaległości płatniczych albo zmiany zasad współpracy B2B.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 4. Składanie Zamówień i zawarcie Umowy
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Zamówienia w Sklepie można składać 24 godziny na dobę, 7 dni w tygodniu, z zastrzeżeniem przerw technicznych.</li>
                  <li>
                    W celu złożenia Zamówienia Klient:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>wybiera Produkt/Produkty i dodaje je do Koszyka,</li>
                      <li>wybiera sposób dostawy i płatności,</li>
                      <li>podaje dane wymagane do realizacji Zamówienia, w tym adres dostawy,</li>
                      <li>potwierdza Zamówienie, akceptując Regulamin.</li>
                    </ul>
                  </li>
                  <li>Złożenie Zamówienia przez Klienta stanowi ofertę zakupu Produktów na warunkach wskazanych w Sklepie.</li>
                  <li>Umowa zostaje zawarta z chwilą otrzymania przez Klienta potwierdzenia przyjęcia Zamówienia do realizacji.</li>
                  <li>Złożenie Zamówienia nie oznacza automatycznej rezerwacji Produktu.</li>
                  <li>Produkt zostaje przeznaczony do realizacji Zamówienia dopiero po przyjęciu Zamówienia do realizacji przez Sprzedawcę oraz, jeżeli Zamówienie wymaga wcześniejszej płatności, po zaksięgowaniu płatności na rachunku bankowym Sprzedawcy.</li>
                  <li>W przypadku płatności przelewem bankowym Produkt nie jest rezerwowany do czasu zaksięgowania płatności, chyba że Strony wyraźnie uzgodnią inaczej w formie dokumentowej.</li>
                  <li>Dostępność Produktów prezentowana w Sklepie może zależeć od danych pochodzących z różnych lokalizacji logistycznych, magazynów własnych, magazynów zewnętrznych, centrów realizacji zamówień lub systemów dostawców usług logistycznych.</li>
                  <li>
                    Sprzedawca może odmówić przyjęcia Zamówienia do realizacji w szczególności, gdy:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Zamówienie zawiera oczywiste błędy, w szczególności rażąco zaniżoną cenę wynikającą z błędu technicznego,</li>
                      <li>brak jest możliwości realizacji Zamówienia z przyczyn niezależnych od Sprzedawcy, w szczególności w przypadku braku faktycznej dostępności Produktu mimo prezentowania go jako dostępnego w Sklepie, na skutek błędu technicznego, opóźnienia lub błędu synchronizacji stanów magazynowych, równoczesnej sprzedaży kilku sztuk w krótkim czasie, błędnych danych o stanie magazynowym, rozbieżności danych z różnych lokalizacji logistycznych albo innych nieprawidłowości systemowych,</li>
                      <li>wystąpiło zdarzenie logistyczne, techniczne lub organizacyjne uniemożliwiające realizację Zamówienia na warunkach wskazanych w Sklepie,</li>
                      <li>zachodzi uzasadnione podejrzenie nadużycia lub działania niezgodnego z prawem.</li>
                    </ul>
                  </li>
                  <li>Postanowienia ust. 9 dotyczą w szczególności akcji promocyjnych oraz Produktów objętych obniżką ceny, gdy zwiększony ruch i jednoczesne zakupy mogą nasilać ryzyko niezgodności stanów, ograniczeń dostępności lub opóźnień synchronizacji danych.</li>
                  <li>W przypadkach, o których mowa powyżej, Sprzedawca niezwłocznie poinformuje Klienta o odmowie przyjęcia Zamówienia do realizacji. Jeżeli Klient dokonał płatności, Sprzedawca dokona jej zwrotu zgodnie z § 5 ust. 9.</li>
                  <li>
                    Anulowanie Zamówienia:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Do czasu opłacenia Zamówienia Klient może anulować Zamówienie bez podania przyczyny – anulowanie oznacza rezygnację ze złożonej oferty, a Umowa nie zostaje zawarta.</li>
                      <li>Po opłaceniu Zamówienia, tj. po przyjęciu Zamówienia do realizacji i wysłaniu Potwierdzenia przyjęcia Zamówienia do realizacji, anulowanie Zamówienia nie jest gwarantowane i wymaga kontaktu z Biurem Obsługi Klienta; każdorazowo możliwość anulowania jest oceniana indywidualnie, w zależności od etapu realizacji i możliwości logistycznych.</li>
                      <li>Anulowanie Zamówienia z poziomu panelu Sklepu jest możliwe wyłącznie do czasu zrealizowania płatności. Po zmianie statusu Zamówienia na „w realizacji" Klient powinien skontaktować się z Biurem Obsługi Klienta w celu weryfikacji, czy anulowanie jest jeszcze możliwe.</li>
                      <li>Po nadaniu przesyłki anulowanie Zamówienia może nie być możliwe; w takim wypadku Klient może skorzystać z prawa odstąpienia, jeżeli takie prawo mu przysługuje zgodnie z § 8.</li>
                    </ul>
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 5. Ceny i płatności
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Ceny Produktów podawane są w złotych polskich (PLN) i zawierają podatek VAT.</li>
                  <li>Cena widoczna przy Produkcie w chwili składania Zamówienia jest wiążąca dla Stron, z zastrzeżeniem § 4 ust. 9 lit. a.</li>
                  <li>Koszty dostawy są podawane w trakcie składania Zamówienia i zależą od wybranej metody dostawy oraz rodzaju/parametrów Produktu.</li>
                  <li>
                    Dostępne metody płatności w Sklepie:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>szybkie płatności online, w szczególności za pośrednictwem operatorów PayU oraz imoje,</li>
                      <li>płatność kartą w ramach systemu płatności online,</li>
                      <li>BLIK w ramach systemu płatności online,</li>
                      <li>Google Pay i Apple Pay w ramach systemu płatności online, jeżeli są dostępne w Sklepie,</li>
                      <li>przelew tradycyjny na rachunek Sprzedawcy, jeżeli taka metoda jest dostępna w Sklepie.</li>
                    </ul>
                  </li>
                  <li>W przypadku płatności przelewem tradycyjnym Sprzedawca przystępuje do realizacji Zamówienia po zaksięgowaniu środków.</li>
                  <li>Sprzedawca może udostępniać kupony rabatowe i akcje promocyjne na zasadach określonych w § 11.</li>
                  <li>
                    Faktury:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Dla Klientów indywidualnych Sprzedawca wystawia fakturę, w tym fakturę VAT, na życzenie Klienta, na podstawie danych podanych przez Klienta podczas składania Zamówienia.</li>
                      <li>Klient indywidualny ma obowiązek podać kompletne i prawidłowe dane do faktury przed sfinalizowaniem Zamówienia.</li>
                      <li>Po sfinalizowaniu Zamówienia nie ma możliwości wystawienia faktury, jeżeli Klient nie zaznaczył opcji faktury i nie podał danych do faktury w trakcie składania Zamówienia.</li>
                      <li>Dla Klientów posiadających zatwierdzone Konto firmowe (B2B) faktura VAT generowana jest do każdego Zamówienia na podstawie danych firmowych podanych przy rejestracji Konta firmowego albo danych zaktualizowanych przez Klienta B2B przed złożeniem Zamówienia.</li>
                      <li>Klient B2B odpowiada za podanie prawidłowych i aktualnych danych do faktury.</li>
                      <li>Zmiana danych nabywcy po złożeniu Zamówienia może nie być możliwa, jeżeli przepisy prawa lub proces księgowy nie pozwalają na dokonanie takiej zmiany.</li>
                    </ul>
                  </li>
                  <li>
                    Bezpieczeństwo transakcji:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Sprzedawca nie przechowuje danych kart płatniczych Klientów,</li>
                      <li>Płatności online realizowane są przez zewnętrznego operatora płatności, zgodnie z jego regulaminem.</li>
                    </ul>
                  </li>
                  <li>
                    Zwrot płatności:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Zwrot płatności realizowany jest w formie odpowiadającej pierwotnej metodzie płatności, o ile to możliwe, chyba że Klient wyraźnie zgodzi się na inne rozwiązanie,</li>
                      <li>Sprzedawca może wstrzymać się ze zwrotem do czasu otrzymania zwracanego Produktu.</li>
                    </ul>
                  </li>
                  <li>Klienci posiadający zatwierdzone Konto firmowe (B2B) mogą uzyskać dostęp do indywidualnego cennika hurtowego. Ceny hurtowe widoczne są po zalogowaniu na zatwierdzone Konto firmowe. Wysokość rabatu hurtowego, zakres rabatu oraz pozostałe warunki handlowe mogą być ustalane indywidualnie przez Sprzedawcę.</li>
                  <li>Sprzedawca może zmienić, ograniczyć lub cofnąć indywidualne warunki hurtowe Klienta B2B w przypadku naruszenia Regulaminu, zaległości płatniczych, podejrzenia nadużyć, braku aktywności handlowej, zmiany polityki handlowej Sprzedawcy albo innych uzasadnionych przyczyn organizacyjnych lub bezpieczeństwa.</li>
                  <li>Dla Klientów posiadających zatwierdzone Konto firmowe (B2B) Sprzedawca może udostępnić płatność przelewem bankowym z terminem płatności 7 dni kalendarzowych od dnia złożenia Zamówienia lub wystawienia dokumentu płatności.</li>
                  <li>Płatność przelewem bankowym z terminem 7 dni nie stanowi odroczonego terminu płatności uprawniającego do wysyłki przed zapłatą.</li>
                  <li>Zamówienie jest przekazywane do realizacji i wysyłki dopiero po zaksięgowaniu płatności na rachunku bankowym Sprzedawcy, chyba że Strony wyraźnie uzgodnią inaczej w formie dokumentowej. Do czasu zaksięgowania płatności Produkt nie jest rezerwowany. Jeżeli przed zaksięgowaniem płatności Produkt przestanie być dostępny lub jego realizacja nie będzie możliwa na warunkach wskazanych w Zamówieniu, Sprzedawca może odmówić przyjęcia Zamówienia do realizacji albo anulować Zamówienie, informując o tym Klienta B2B.</li>
                  <li>Jeżeli płatność zostanie zaksięgowana po utracie dostępności Produktu albo po wystąpieniu innej przeszkody uniemożliwiającej realizację Zamówienia, Sprzedawca poinformuje Klienta B2B o braku możliwości realizacji Zamówienia i dokona zwrotu otrzymanej płatności.</li>
                  <li>W przypadku opóźnienia Klienta B2B w płatności Sprzedawca może czasowo zablokować możliwość składania kolejnych Zamówień B2B, ograniczyć dostęp do płatności przelewem, ograniczyć dostęp do wybranych funkcji B2B lub wstrzymać realizację kolejnych Zamówień do czasu uregulowania zaległości.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 6. Dostawa i realizacja Zamówień
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Dostawa realizowana jest na terytorium Polski.</li>
                  <li>
                    Dostępne metody dostawy/odbioru (w zależności od Produktu i jego parametrów):
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Paczkomaty InPost,</li>
                      <li>Kurier InPost,</li>
                      <li>Kurier DPD,</li>
                      <li>przesyłka gabarytowa (dla wybranych Produktów),</li>
                      <li>odbiór osobisty w siedzibie Sprzedawcy – wyłącznie dla Produktów w kategorii „Outlet". Produkty z kategorii „Outlet" mogą nosić ślady ekspozycji, posiadać uszkodzone opakowanie lub inne cechy wskazane w opisie/ofercie Produktu.</li>
                    </ul>
                  </li>
                  <li>Odbiór osobisty nie jest realizowany z magazynów logistycznych. Odbiór osobisty jest dostępny wyłącznie dla Produktów z kategorii „Outlet" i odbywa się wyłącznie w siedzibie Sprzedawcy: WB Partners Sp.&nbsp;z&nbsp;o.o., ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów.</li>
                  <li>
                    Dostawa gabarytowa:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Dla wybranych Produktów obowiązują kwoty dostawy gabarytowej przypisane do konkretnych Produktów,</li>
                      <li>Informacja o koszcie i dostępności dostawy gabarytowej jest prezentowana w Koszyku i/lub na etapie składania Zamówienia.</li>
                    </ul>
                  </li>
                  <li>
                    Czas realizacji Zamówienia:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Czas realizacji Zamówienia wynosi zwykle 1–5 dni roboczych od dnia przyjęcia Zamówienia do realizacji (wysłania Potwierdzenia przyjęcia Zamówienia do realizacji),</li>
                      <li>Termin może ulec wydłużeniu w przypadku Produktów wymagających indywidualnej kompletacji, przesyłek gabarytowych lub zdarzeń losowych – Sprzedawca poinformuje o tym Klienta.</li>
                    </ul>
                  </li>
                  <li>Terminy realizacji i dostawy prezentowane w Sklepie mają charakter przewidywany, chyba że przy danym Produkcie lub Zamówieniu wskazano wyraźnie termin gwarantowany. Sprzedawca informuje Klienta o istotnym wydłużeniu terminu realizacji, jeżeli takie wydłużenie wystąpi.</li>
                  <li>
                    Termin realizacji Zamówienia może zależeć od:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>lokalizacji logistycznej Produktu,</li>
                      <li>dostępności Produktu,</li>
                      <li>parametrów przesyłki,</li>
                      <li>konieczności indywidualnej kompletacji,</li>
                      <li>działania podmiotów uczestniczących w procesie logistycznym.</li>
                    </ul>
                  </li>
                  <li>Sprzedawca przekazuje Klientowi informację o nadaniu przesyłki, w tym – numer przesyłki do śledzenia.</li>
                  <li>Produkty oferowane w Sklepie mogą być realizowane z różnych lokalizacji logistycznych, magazynów własnych, magazynów zewnętrznych lub centrów realizacji zamówień współpracujących ze Sprzedawcą.</li>
                  <li>W przypadku Zamówienia obejmującego Produkty realizowane z różnych lokalizacji, Zamówienie może zostać wysłane w kilku odrębnych przesyłkach.</li>
                  <li>W procesie realizacji Zamówienia Sprzedawca może korzystać z usług zewnętrznych podmiotów logistycznych, magazynowych, przewoźników oraz operatorów obsługujących kompletację i wysyłkę Produktów. Korzystanie z takich podmiotów nie zmienia faktu, że stroną Umowy sprzedaży wobec Klienta pozostaje Sprzedawca.</li>
                  <li>W przypadku Zamówień obejmujących Produkty o różnej dostępności, różnych gabarytach lub realizowanych z różnych lokalizacji logistycznych, Sprzedawca może zrealizować Zamówienie w kilku przesyłkach. Realizacja Zamówienia w kilku przesyłkach nie wpływa na zakres odpowiedzialności Sprzedawcy za prawidłową realizację Zamówienia.</li>
                  <li>Produkty gabarytowe są co do zasady nadawane w odrębnych przesyłkach.</li>
                  <li>
                    Odbiór i szkody w transporcie:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Klient powinien sprawdzić stan przesyłki przy odbiorze (w obecności kuriera lub niezwłocznie po odbiorze z Paczkomatu),</li>
                      <li>W przypadku uszkodzenia przesyłki zaleca się sporządzenie protokołu szkody (kurier) albo zgłoszenie uszkodzenia w aplikacji/przez infolinię przewoźnika (Paczkomat) oraz wykonanie zdjęć,</li>
                      <li>Powyższe czynności ułatwiają i przyspieszają rozpatrzenie zgłoszenia.</li>
                    </ul>
                  </li>
                  <li>Ryzyko przypadkowej utraty lub uszkodzenia Produktu przechodzi na Klienta z chwilą wydania Produktu Klientowi (Konsumentowi – z chwilą objęcia w posiadanie przez Konsumenta lub wskazaną przez niego osobę trzecią, inną niż przewoźnik), zgodnie z przepisami prawa.</li>
                  <li>
                    Wysyłka własna (B2B):
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Klienci posiadający zatwierdzone Konto firmowe (B2B) mogą skorzystać z opcji „Wysyłka własna (B2B)", organizując transport Zamówienia samodzielnie za pośrednictwem wybranego przez siebie przewoźnika.</li>
                      <li>Za przygotowanie paczki do wysyłki własnej Sprzedawca może naliczyć opłatę obsługową w wysokości: 1,99 zł brutto – dla Zamówień o wartości co najmniej 50 zł, 4,99 zł brutto – dla Zamówień o wartości poniżej 50 zł.</li>
                      <li>Po złożeniu Zamówienia Klient B2B zobowiązany jest przesłać etykietę wysyłkową swojego przewoźnika za pośrednictwem panelu Konta, w szczegółach Zamówienia.</li>
                      <li>Dozwolone formaty etykiety to: PDF, JPEG, PNG oraz WebP. Maksymalny rozmiar pliku wynosi 10 MB.</li>
                      <li>Sprzedawca przygotowuje paczkę, umieszcza na niej etykietę dostarczoną przez Klienta B2B i wydaje przesyłkę przewoźnikowi wskazanemu przez Klienta B2B.</li>
                      <li>Klient B2B odpowiada za prawidłowość danych umieszczonych na etykiecie oraz za skutki podania błędnych danych przewozowych.</li>
                      <li>Brak przesłania prawidłowej etykiety wysyłkowej może wstrzymać przygotowanie lub wydanie przesyłki do czasu dostarczenia poprawnej etykiety.</li>
                      <li>Sprzedawca nie odpowiada za opóźnienie wynikające z braku etykiety, błędów na etykiecie, nieczytelności etykiety albo podania nieprawidłowych danych przewozowych przez Klienta B2B.</li>
                      <li>W przypadku wyboru opcji „Wysyłka własna (B2B)" Klient B2B samodzielnie organizuje transport i ponosi odpowiedzialność za wybór przewoźnika, prawidłowość danych przewozowych oraz dalszą obsługę przesyłki po jej wydaniu przewoźnikowi wskazanemu przez Klienta B2B.</li>
                    </ul>
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 7. Gwarancja producenta
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Produkty mogą być objęte gwarancją udzieloną przez producenta lub dystrybutora („Gwarancja").</li>
                  <li>Sprzedawca nie udziela dodatkowej gwarancji własnej ponad uprawnienia wynikające z przepisów prawa.</li>
                  <li>Warunki i zakres Gwarancji określa dokument gwarancyjny producenta/dystrybutora dołączony do Produktu lub udostępniony przez producenta/dystrybutora.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 8. Odstąpienie od Umowy (zwroty) – Konsument i Przedsiębiorca na prawach konsumenta
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Konsument oraz Przedsiębiorca na prawach konsumenta mają prawo odstąpić od Umowy bez podania przyczyny w terminie 14 dni od dnia otrzymania Produktu.</li>
                  <li>Dla zachowania terminu wystarczy wysłanie oświadczenia o odstąpieniu przed jego upływem.</li>
                  <li>
                    Oświadczenie o odstąpieniu:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>może zostać złożone za pośrednictwem formularza „Zwroty i reklamacje" dostępnego w Sklepie lub mailowo na: support@wb-partners.pl,</li>
                      <li>powinno zawierać: numer Zamówienia, dane identyfikujące Klienta, wskazanie zwracanych Produktów,</li>
                      <li>W przypadku, gdy zgłoszenie odstąpienia składa Przedsiębiorca, może ono zostać złożone za pośrednictwem formularza „Zwroty i reklamacje" dostępnego w Sklepie lub poprzez kontakt z Biurem Obsługi Klienta. Sprzedawca weryfikuje, czy zakup ma dla danej osoby charakter zawodowy oraz czy Klientowi przysługują uprawnienia do odstąpienia (w szczególności jako Przedsiębiorcy na prawach konsumenta) – każdorazowo na podstawie przepisów prawa.</li>
                    </ul>
                  </li>
                  <li>Warunek formalny: zgłoszenie odstąpienia wymaga podania numeru Zamówienia oraz danych identyfikujących Klienta; Zamówienie musi zostać dostarczone do Klienta, a zgłoszenie musi nastąpić w terminie 14 dni.</li>
                  <li>
                    Zwrot Produktu:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Klient odsyła Produkt niezwłocznie, nie później niż 14 dni od dnia złożenia oświadczenia o odstąpieniu od Umowy.</li>
                      <li>
                        Produkt powinien być zwrócony kompletny, w stanie niepogorszonym ponad konieczny do stwierdzenia cech, charakteru i funkcjonowania oraz solidnie zabezpieczony na czas transportu. W szczególności przesyłka zwrotna powinna:
                        <ul className="list-disc pl-6 mt-2 space-y-1">
                          <li>posiadać opakowanie zabezpieczające Produkt przed uszkodzeniem (rekomendowany karton oraz wypełnienie, np. folia bąbelkowa),</li>
                          <li>nie być narażona na wgniecenia i uszkodzenia mechaniczne (samo owinięcie cienką warstwą folii nie jest wystarczające),</li>
                          <li>zawierać, o ile zostało dostarczone, oryginalne opakowanie produktowe w stanie niepogorszonym; opakowanie produktowe jest elementem istotnym dla oceny stanu i wartości Produktu, a jego brak lub uszkodzenie może skutkować odpowiednim zmniejszeniem kwoty zwrotu, w zakresie dopuszczalnym przez przepisy prawa.</li>
                        </ul>
                      </li>
                      <li>W przypadku uszkodzenia Produktu w transporcie zwrotnym z przyczyn leżących po stronie Klienta (np. niewłaściwe zabezpieczenie przesyłki), Sprzedawca może odpowiednio pomniejszyć kwotę zwrotu w zakresie dopuszczalnym przez przepisy prawa.</li>
                    </ul>
                  </li>
                  <li>Koszty zwrotu Produktu ponosi Klient, chyba że Sprzedawca wyraźnie zgodzi się pokryć te koszty.</li>
                  <li>
                    Zwrot płatności:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Sprzedawca zwróci Klientowi płatności otrzymane z tytułu Umowy, w tym koszt dostawy do Klienta w wysokości odpowiadającej najtańszej zwykłej metodzie dostawy oferowanej w Sklepie dla danego Zamówienia,</li>
                      <li>Zwrot nastąpi nie później niż w terminie 14 dni od dnia otrzymania oświadczenia o odstąpieniu, z zastrzeżeniem prawa wstrzymania zwrotu do czasu otrzymania Produktu lub dowodu jego odesłania.</li>
                    </ul>
                  </li>
                  <li>Wyłączenia prawa odstąpienia: Prawo odstąpienia nie przysługuje w przypadkach przewidzianych przepisami prawa, w szczególności dotyczących produktów wykonanych według specyfikacji Klienta lub służących zaspokojeniu jego zindywidualizowanych potrzeb, a także innych ustawowych wyjątków (jeśli mają zastosowanie do danego Zamówienia).</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 9. Reklamacje (niezgodność towaru z umową / rękojmia) oraz szkody
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Sprzedawca odpowiada wobec Klienta za zgodność Produktu z Umową na zasadach wynikających z przepisów prawa (dla Konsumenta i Przedsiębiorcy na prawach konsumenta – w szczególności na zasadach przewidzianych dla niezgodności towaru z umową; dla Przedsiębiorcy – na zasadach ogólnych kodeksu cywilnego, o ile przepisy nie stanowią inaczej).</li>
                  <li>
                    Zgłoszenie reklamacji:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>za pośrednictwem formularza „Zwroty i reklamacje" dostępnego w Sklepie albo mailowo: support@wb-partners.pl,</li>
                      <li>reklamacja powinna zawierać: numer Zamówienia, opis problemu, żądanie Klienta (np. naprawa, wymiana, obniżenie ceny, odstąpienie), dane kontaktowe.</li>
                    </ul>
                  </li>
                  <li>Zaleca się, aby Klient dołączył zdjęcia dokumentujące problem, a w przypadku usterek wymagających przedstawienia działania Produktu – również nagranie wideo pokazujące nieprawidłowe działanie Produktu.</li>
                  <li>Termin rozpatrzenia reklamacji: Sprzedawca udzieli odpowiedzi w terminie 14 dni od dnia otrzymania reklamacji (dotyczy Konsumenta i Przedsiębiorcy na prawach konsumenta – w zakresie wymaganym przepisami; dla pozostałych Klientów – w rozsądnym terminie).</li>
                  <li>
                    Koszty:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>w przypadku uznania reklamacji Sprzedawca ponosi uzasadnione koszty związane z reklamacją, w tym koszty odesłania Produktu, jeśli jest to wymagane do rozpatrzenia i realizacji roszczenia,</li>
                      <li>jeżeli reklamacja okaże się bezzasadna, Sprzedawca może obciążyć Klienta kosztami odesłania Produktu.</li>
                    </ul>
                  </li>
                  <li>
                    Szkody w transporcie:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Jeżeli przesyłka nosi ślady uszkodzenia, otwarcia lub zgniecenia, Klient powinien sprawdzić jej stan przy odbiorze i niezwłocznie zgłosić szkodę przewoźnikowi zgodnie z procedurą przewoźnika (np. sporządzić protokół szkody przy kurierze albo zgłosić zdarzenie w aplikacji/na infolinii, jeżeli protokół nie jest sporządzany). Zgłoszenie szkody przewoźnikowi oraz kompletna dokumentacja są istotne, ponieważ stanowią podstawę do dochodzenia roszczeń od przewoźnika i mogą znacząco przyspieszyć obsługę sprawy.</li>
                      <li>Zgłoszenie do Sprzedawcy powinno zawierać w szczególności: numer Zamówienia, opis sytuacji, zdjęcia opakowania (z widocznymi uszkodzeniami) oraz zdjęcia uszkodzeń Produktu, a także – jeżeli sporządzono – protokół szkody / potwierdzenie zgłoszenia u przewoźnika. Sprzedawca może poprosić o dodatkowe informacje lub dokumenty niezbędne do zgłoszenia roszczeń przewoźnikowi.</li>
                      <li>Brak zgłoszenia szkody przewoźnikowi i/lub brak dokumentacji może utrudnić ustalenie okoliczności zdarzenia i wydłużyć rozpatrzenie sprawy. W relacji z Konsumentem oraz Przedsiębiorcą na prawach konsumenta zgłoszenie szkody przewoźnikowi nie wyłącza uprawnień Klienta wynikających z przepisów prawa; Sprzedawca może równolegle dochodzić roszczeń od przewoźnika.</li>
                    </ul>
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 10. Ochrona danych osobowych
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Administratorem danych osobowych jest Sprzedawca.</li>
                  <li>Dane osobowe przetwarzane są w celach i na zasadach opisanych w Polityce Prywatności oraz Polityce RODO dostępnych w Sklepie.</li>
                  <li>Podanie danych jest dobrowolne, lecz niezbędne do realizacji Zamówienia oraz świadczenia usług w Sklepie.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 11. Newsletter, kupony rabatowe i akcje promocyjne
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Newsletter:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>zapis do newslettera jest dobrowolny,</li>
                      <li>zasady zapisu, wypisu oraz ewentualnych benefitów (w tym kuponów) wynikają z komunikatów w Sklepie i warunków danej akcji.</li>
                    </ul>
                  </li>
                  <li>
                    Kupony rabatowe:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>kupon po rejestracji – ważny 14 dni od momentu rejestracji Konta,</li>
                      <li>kupon po zapisie do newslettera – ważny 30 dni od momentu zapisu,</li>
                      <li>Sprzedawca może przekazywać kody rabatowe w ramach działań marketingowych – ich warunki (m.in. czas, zakres, wyłączenia, minimalna wartość) określa opis danej akcji lub komunikat w Sklepie.</li>
                    </ul>
                  </li>
                  <li>Jeżeli warunki konkretnego kuponu/akcji promocyjnej przewidują ograniczenia (np. brak łączenia promocji, wyłączenia kategorii, limit użyć), są one wiążące dla Klienta.</li>
                  <li>Sprzedawca może odmówić realizacji kuponu w przypadku uzasadnionego podejrzenia nadużycia (np. wielokrotne zakładanie kont w celu uzyskania rabatów).</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 12. Własność intelektualna
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Wszelkie treści dostępne w Sklepie (teksty, grafiki, zdjęcia, logotypy, elementy UI) stanowią własność Sprzedawcy lub są wykorzystywane na podstawie licencji.</li>
                  <li>Zabrania się kopiowania, rozpowszechniania lub wykorzystywania treści Sklepu w celach komercyjnych bez zgody Sprzedawcy, poza dozwolonym użytkiem przewidzianym przepisami prawa.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 13. Odpowiedzialność i zasady bezpieczeństwa
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Sprzedawca dokłada należytej staranności, aby informacje prezentowane w Sklepie były aktualne i rzetelne, jednak nie wyklucza możliwości wystąpienia błędów technicznych, w tym błędów cenowych i opisowych.</li>
                  <li>W przypadku oczywistego błędu (np. rażąco zaniżona cena wynikająca z błędu systemu) Sprzedawca może odmówić realizacji Zamówienia zgodnie z § 4, informując Klienta.</li>
                  <li>
                    W zakresie dopuszczalnym przez przepisy prawa Sprzedawca nie ponosi odpowiedzialności za:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>przerwy w działaniu Sklepu wynikające z przyczyn niezależnych od Sprzedawcy, w szczególności awarie, działania dostawców usług, przerwy techniczne lub siłę wyższą,</li>
                      <li>korzystanie ze Sklepu przez Klienta w sposób sprzeczny z Regulaminem lub przepisami prawa.</li>
                    </ul>
                  </li>
                  <li>Klient zobowiązuje się do korzystania ze Sklepu zgodnie z prawem, dobrymi obyczajami oraz postanowieniami Regulaminu.</li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 14. Postanowienia końcowe
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Sprzedawca zastrzega sobie prawo do zmiany Regulaminu z ważnych przyczyn, w szczególności: zmiany przepisów, zmiany sposobów płatności/dostawy, zmian technologicznych, zmian organizacyjnych, zmian funkcjonalności Sklepu lub zmian zasad współpracy B2B.</li>
                  <li>Zmiany Regulaminu wchodzą w życie z dniem publikacji w Sklepie (na stronie internetowej i/lub w aplikacji mobilnej), z zastrzeżeniem, że do Zamówień złożonych przed zmianą stosuje się Regulamin obowiązujący w dniu złożenia Zamówienia.</li>
                  <li>O istotnych zmianach Regulaminu Sprzedawca może poinformować Klientów za pośrednictwem komunikatu w Sklepie, aplikacji mobilnej lub wiadomości e-mail.</li>
                  <li>W sprawach nieuregulowanych Regulaminem zastosowanie mają przepisy prawa polskiego.</li>
                  <li>
                    Ewentualne spory:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>dla Konsumentów – sąd właściwy zgodnie z przepisami prawa,</li>
                      <li>dla Klientów niebędących Konsumentami – sąd właściwy dla siedziby Sprzedawcy, o ile przepisy nie stanowią inaczej.</li>
                    </ul>
                  </li>
                  <li>Konsument może skorzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń (ADR). Szczegółowe informacje są dostępne na stronie UOKiK: <a href="https://polubowne.uokik.gov.pl" target="_blank" rel="noopener noreferrer" className="text-secondary-900 dark:text-white underline">polubowne.uokik.gov.pl</a>.</li>
                </ol>

              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
