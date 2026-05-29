import Header from "../../components/Header";
import Footer from "../../components/Footer";

export const metadata = {
  title: "Regulamin - WB Trade",
  description:
    "Regulamin sklepu internetowego WB Trade - zasady korzystania z serwisu",
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
                  <li>
                    Niniejszy Regulamin określa zasady korzystania ze sklepu
                    internetowego prowadzonego pod adresem
                    https://www.wb-trade.pl oraz aplikacji mobilnej WB Trade
                    (dalej łącznie: „Sklep”).
                  </li>
                  <li>
                    Właścicielem i operatorem Sklepu jest: WB Partners Sp. z
                    o.o. z siedzibą w Rzeszowie, ul. Juliusza Słowackiego 24/11,
                    35-060 Rzeszów, NIP: 5170455185, REGON: 540735769, KRS:
                    0001151642 (dalej: „Sprzedawca”).
                  </li>
                  <li>
                    Kontakt ze Sprzedawcą:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>e-mail: support@wb-partners.pl,</li>
                      <li>telefon: +48 570 034 367,</li>
                      <li>godziny obsługi: pon.–pt. 9:00–17:00.</li>
                    </ul>
                  </li>
                  <li>
                    Regulamin jest udostępniony nieodpłatnie w Sklepie w sposób
                    umożliwiający jego pobranie, zapisanie i odtworzenie.
                  </li>
                  <li>
                    Do korzystania ze Sklepu niezbędne są:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>urządzenie z dostępem do Internetu,</li>
                      <li>
                        aktualna przeglądarka internetowa lub aplikacja mobilna
                        WB Trade,
                      </li>
                      <li>aktywny adres e-mail.</li>
                    </ul>
                  </li>
                  <li>
                    Regulamin ma zastosowanie do Umów sprzedaży zawieranych za
                    pośrednictwem Sklepu na terytorium Rzeczypospolitej
                    Polskiej, o ile Strony nie postanowią inaczej.
                  </li>
                  <li>
                    Sklep prowadzi sprzedaż:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>konsumencką (B2C),</li>
                      <li>dla przedsiębiorców (B2B).</li>
                    </ul>
                  </li>
                  <li>
                    W zakresie nieuregulowanym odmiennie w Regulaminie do
                    Klientów B2B stosuje się postanowienia dotyczące
                    przedsiębiorców.
                  </li>
                  <li>
                    Postanowienia dotyczące Konsumentów oraz Przedsiębiorców na
                    prawach konsumenta, w szczególności dotyczące prawa
                    odstąpienia od Umowy zawartej na odległość, nie mają
                    zastosowania do Klientów B2B, chyba że Regulamin wyraźnie
                    stanowi inaczej.
                  </li>
                  <li>
                    Sklep nie jest marketplace’em umożliwiającym sprzedaż przez
                    podmioty trzecie. Sprzedawca oferuje Produkty we własnym
                    imieniu.
                  </li>
                  <li>Złożenie Zamówienia wymaga akceptacji Regulaminu.</li>
                  <li>
                    Sprzedawca może indywidualnie ustalać z Klientami B2B
                    warunki współpracy handlowej, w szczególności dotyczące cen,
                    rabatów, terminów płatności, sposobów dostawy, zasad
                    realizacji Zamówień, zwrotów, reklamacji oraz innych
                    warunków współpracy. Warunki te ustalane są w drodze
                    odrębnej umowy, porozumienia lub indywidualnych ustaleń
                    dokonanych w formie dokumentowej pomiędzy Sprzedawcą a
                    Klientem B2B. Indywidualnie uzgodnione warunki mają
                    pierwszeństwo przed postanowieniami niniejszego Regulaminu w
                    zakresie, w jakim odmiennie regulują prawa i obowiązki
                    Stron.
                  </li>
                  <li>
                    Założenie Konta w Sklepie, w tym Konta firmowego (B2B),
                    oznacza zapoznanie się z Regulaminem oraz jego akceptację.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 2. Definicje
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    <strong>Klient</strong> – osoba fizyczna, osoba prawna lub
                    jednostka organizacyjna posiadająca zdolność prawną
                    korzystająca ze Sklepu.
                  </li>
                  <li>
                    <strong>Konsument</strong> – osoba fizyczna dokonująca
                    zakupu niezwiązanego bezpośrednio z działalnością
                    gospodarczą lub zawodową.
                  </li>
                  <li>
                    <strong>Przedsiębiorca</strong> – osoba fizyczna, osoba
                    prawna lub jednostka organizacyjna prowadząca działalność
                    gospodarczą lub zawodową.
                  </li>
                  <li>
                    <strong>Przedsiębiorca na prawach konsumenta</strong> –
                    osoba fizyczna prowadząca działalność gospodarczą,
                    zawierająca Umowę niezwiązaną zawodowo z prowadzoną
                    działalnością.
                  </li>
                  <li>
                    <strong>Konto</strong> – indywidualne konto Klienta w
                    Sklepie.
                  </li>
                  <li>
                    <strong>Konto firmowe (B2B)</strong> – konto przeznaczone
                    dla przedsiębiorców, zapewniające dostęp do funkcji B2B, w
                    szczególności indywidualnych cen hurtowych, płatności
                    przelewem, feedu XML/CSV oraz dedykowanych metod dostawy.
                  </li>
                  <li>
                    <strong>Klient B2B</strong> – przedsiębiorca posiadający
                    zatwierdzone Konto firmowe (B2B), korzystający z
                    indywidualnych warunków handlowych lub cen hurtowych
                    oferowanych przez Sprzedawcę.
                  </li>
                  <li>
                    <strong>Cennik hurtowy</strong> – indywidualne warunki
                    cenowe udostępnione Klientowi B2B po zalogowaniu.
                  </li>
                  <li>
                    <strong>Produkt</strong> – rzecz ruchoma oferowana w
                    Sklepie.
                  </li>
                  <li>
                    <strong>Zamówienie</strong> – oświadczenie woli Klienta
                    zmierzające do zawarcia Umowy sprzedaży.
                  </li>
                  <li>
                    <strong>Umowa</strong> – umowa sprzedaży zawierana na
                    odległość pomiędzy Sprzedawcą a Klientem.
                  </li>
                  <li>
                    <strong>Dzień roboczy</strong> – dzień od poniedziałku do
                    piątku z wyłączeniem dni ustawowo wolnych od pracy.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 3. Konto i Konto firmowe (B2B)
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Założenie Konta jest dobrowolne i bezpłatne.</li>
                  <li>
                    Klient może dokonywać zakupów bez rejestracji, jeśli Sklep
                    udostępnia taką funkcjonalność.
                  </li>
                  <li>
                    Konto firmowe (B2B) wymaga:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>podania danych firmowych,</li>
                      <li>numeru NIP,</li>
                      <li>weryfikacji i zatwierdzenia przez Sprzedawcę.</li>
                    </ul>
                  </li>
                  <li>
                    Sprzedawca może odmówić aktywacji Konta firmowego z
                    uzasadnionych przyczyn.
                  </li>
                  <li>
                    Konto firmowe może zapewniać dostęp do:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>cen hurtowych,</li>
                      <li>płatności przelewem,</li>
                      <li>feedów XML/CSV,</li>
                      <li>dedykowanych metod dostawy,</li>
                      <li>innych funkcji B2B.</li>
                    </ul>
                  </li>
                  <li>
                    Uzyskanie dostępu do indywidualnego cennika hurtowego
                    oznacza, że Zamówienia składane z wykorzystaniem Konta
                    firmowego mają charakter zawodowy i związany z działalnością
                    gospodarczą Klienta B2B.
                  </li>
                  <li>
                    Sprzedawca może ograniczyć lub cofnąć dostęp do funkcji B2B
                    w przypadku:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>zaległości płatniczych,</li>
                      <li>naruszenia Regulaminu,</li>
                      <li>podejrzenia nadużyć,</li>
                      <li>zmiany polityki handlowej.</li>
                    </ul>
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 4. Składanie Zamówień i zawarcie Umowy
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Zamówienia można składać 24 godziny na dobę.</li>
                  <li>
                    W celu złożenia Zamówienia Klient:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>wybiera Produkt i dodaje go do Koszyka,</li>
                      <li>wybiera sposób dostawy i płatności,</li>
                      <li>podaje dane wymagane do realizacji Zamówienia,</li>
                      <li>akceptuje Regulamin.</li>
                    </ul>
                  </li>
                  <li>
                    Złożenie Zamówienia stanowi ofertę zawarcia Umowy sprzedaży.
                  </li>
                  <li>
                    Umowa zostaje zawarta z chwilą przesłania przez Sprzedawcę
                    potwierdzenia przyjęcia Zamówienia do realizacji.
                  </li>
                  <li>
                    Sprzedawca może odmówić realizacji Zamówienia w przypadku:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>błędu technicznego,</li>
                      <li>błędnej ceny,</li>
                      <li>braku dostępności Produktu,</li>
                      <li>podejrzenia nadużycia,</li>
                      <li>
                        niemożliwości realizacji z przyczyn logistycznych.
                      </li>
                    </ul>
                  </li>
                  <li>
                    W przypadku odmowy realizacji Zamówienia dokonana płatność
                    podlega zwrotowi.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 5. Ceny i płatności
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Wszystkie ceny podawane są w PLN i zawierają podatek VAT.
                  </li>
                  <li>
                    Cena widoczna przy Produkcie w chwili składania Zamówienia
                    jest wiążąca dla Stron, z zastrzeżeniem oczywistych błędów
                    technicznych lub cenowych.
                  </li>
                  <li>
                    Koszty dostawy prezentowane są podczas składania Zamówienia.
                  </li>
                  <li>
                    Dostępne metody płatności:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>PayU,</li>
                      <li>imoje,</li>
                      <li>karta płatnicza,</li>
                      <li>BLIK,</li>
                      <li>Google Pay,</li>
                      <li>Apple Pay,</li>
                      <li>przelew tradycyjny.</li>
                    </ul>
                  </li>
                  <li>
                    Sprzedawca może udostępniać Klientom B2B indywidualne ceny
                    hurtowe.
                  </li>
                  <li>
                    Sprzedawca może zmienić lub cofnąć warunki hurtowe w
                    przypadku:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>zaległości płatniczych,</li>
                      <li>nadużyć,</li>
                      <li>zmiany polityki handlowej.</li>
                    </ul>
                  </li>
                  <li>
                    Dla Klientów B2B Sprzedawca może udostępnić płatność
                    przelewem z terminem płatności 7 dni.
                  </li>
                  <li>
                    Produkt nie jest rezerwowany do czasu zaksięgowania
                    płatności, chyba że Strony uzgodnią inaczej.
                  </li>
                  <li>
                    Faktury VAT dla Klientów B2B wystawiane są automatycznie na
                    dane firmowe przypisane do Konta firmowego.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 6. Dostawa
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Dostawa realizowana jest na terytorium Polski.</li>
                  <li>
                    Dostępne metody dostawy:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Paczkomaty InPost,</li>
                      <li>Kurier InPost,</li>
                      <li>Kurier DPD,</li>
                      <li>przesyłki gabarytowe,</li>
                      <li>odbiór osobisty dla Produktów Outlet.</li>
                    </ul>
                  </li>
                  <li>
                    Czas realizacji Zamówienia wynosi zwykle od 1 do 5 dni
                    roboczych.
                  </li>
                  <li>
                    Zamówienie może zostać zrealizowane w kilku przesyłkach.
                  </li>
                  <li>
                    Klient powinien sprawdzić stan przesyłki przy odbiorze.
                  </li>
                  <li>
                    Klienci B2B mogą korzystać z opcji „Wysyłka własna (B2B)”
                    organizując transport we własnym zakresie.
                  </li>
                  <li>
                    Ryzyko przypadkowej utraty lub uszkodzenia Produktu
                    przechodzi:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>
                        na Konsumenta – z chwilą objęcia Produktu w posiadanie,
                      </li>
                      <li>
                        na Klienta B2B – z chwilą wydania Produktu
                        przewoźnikowi.
                      </li>
                    </ul>
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 7. Gwarancja
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Produkty mogą być objęte gwarancją producenta lub
                    dystrybutora.
                  </li>
                  <li>
                    Sprzedawca nie udziela dodatkowej gwarancji własnej, chyba
                    że wyraźnie wskazano inaczej.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 8. Odstąpienie od Umowy (zwroty)
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Prawo odstąpienia od Umowy zawartej na odległość przysługuje
                    wyłącznie:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>Konsumentowi,</li>
                      <li>Przedsiębiorcy na prawach konsumenta.</li>
                    </ul>
                  </li>
                  <li>
                    Konsument oraz Przedsiębiorca na prawach konsumenta mogą
                    odstąpić od Umowy bez podania przyczyny w terminie 14 dni od
                    dnia otrzymania Produktu.
                  </li>
                  <li>
                    Dla zachowania terminu wystarczy wysłanie oświadczenia przed
                    jego upływem.
                  </li>
                  <li>
                    Oświadczenie można złożyć:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>przez formularz „Zwroty i reklamacje”,</li>
                      <li>mailowo na: support@wb-partners.pl.</li>
                    </ul>
                  </li>
                  <li>
                    Klient zobowiązany jest zwrócić Produkt w terminie 14 dni od
                    dnia odstąpienia od Umowy.
                  </li>
                  <li>
                    Produkt powinien zostać zwrócony kompletny i odpowiednio
                    zabezpieczony na czas transportu.
                  </li>
                  <li>
                    Koszt zwrotu Produktu ponosi Klient, chyba że Sprzedawca
                    postanowi inaczej.
                  </li>
                  <li>
                    Sprzedawca może wstrzymać się ze zwrotem płatności do czasu
                    otrzymania Produktu lub dowodu jego nadania.
                  </li>
                  <li>
                    Klientowi B2B, w szczególności przedsiębiorcy posiadającemu
                    Konto firmowe (B2B) z dostępem do indywidualnych cen
                    hurtowych lub innych warunków handlowych B2B, nie
                    przysługuje prawo odstąpienia od Umowy zawartej na odległość
                    ani zwrot Produktu bez podania przyczyny.
                  </li>
                  <li>
                    Brak prawa do odstąpienia: zgodnie z art. 535 Kodeksu
                    cywilnego, sprzedawca zobowiązuje się przenieść własność i
                    wydać rzecz, a kupujący zobowiązuje się rzecz odebrać i
                    zapłacić cenę. W relacjach B2B obowiązek przyjęcia zwrotu
                    Produktu oraz zwrotu płatności nie istnieje z mocy prawa,
                    chyba że Strony wyraźnie postanowią inaczej.
                  </li>
                  <li>
                    Sprzedawca może dobrowolnie wyrazić zgodę na przyjęcie
                    zwrotu od Klienta B2B, jednak nie stanowi to obowiązku
                    Sprzedawcy ani podstawy do powstania po stronie Klienta B2B
                    roszczenia o przyjęcie zwrotu lub zwrot płatności.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 9. Reklamacje
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Sprzedawca odpowiada za zgodność Produktu z Umową zgodnie z
                    obowiązującymi przepisami prawa.
                  </li>
                  <li>
                    Reklamacje można składać:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>przez formularz „Zwroty i reklamacje”,</li>
                      <li>mailowo na: support@wb-partners.pl.</li>
                    </ul>
                  </li>
                  <li>
                    Reklamacja powinna zawierać:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>numer Zamówienia,</li>
                      <li>opis problemu,</li>
                      <li>dane kontaktowe,</li>
                      <li>żądanie Klienta.</li>
                    </ul>
                  </li>
                  <li>
                    Sprzedawca udzieli odpowiedzi w terminie 14 dni w
                    przypadkach wymaganych przepisami prawa.
                  </li>
                  <li>
                    W relacjach z Klientami B2B odpowiedzialność Sprzedawcy z
                    tytułu rękojmi zostaje wyłączona w najszerszym zakresie
                    dopuszczalnym przez przepisy prawa.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 10. Dane osobowe
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Administratorem danych osobowych jest Sprzedawca.</li>
                  <li>
                    Dane osobowe przetwarzane są zgodnie z Polityką Prywatności
                    oraz obowiązującymi przepisami prawa.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 11. Newsletter i promocje
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>Zapis do newslettera jest dobrowolny.</li>
                  <li>
                    Sprzedawca może organizować akcje promocyjne i udostępniać
                    kupony rabatowe.
                  </li>
                  <li>
                    Warunki promocji określane są każdorazowo w komunikacie
                    promocyjnym.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 12. Własność intelektualna
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Treści dostępne w Sklepie stanowią własność Sprzedawcy lub
                    są wykorzystywane legalnie na podstawie odpowiednich
                    licencji.
                  </li>
                  <li>
                    Zabrania się kopiowania treści Sklepu bez zgody Sprzedawcy.
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 13. Odpowiedzialność
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Sprzedawca dokłada należytej staranności w celu zapewnienia
                    prawidłowego działania Sklepu.
                  </li>
                  <li>
                    Sprzedawca nie ponosi odpowiedzialności za:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>przerwy techniczne,</li>
                      <li>działanie siły wyższej,</li>
                      <li>
                        działania podmiotów trzecich niezależnych od Sprzedawcy,
                      </li>
                      <li>korzystanie ze Sklepu niezgodnie z Regulaminem.</li>
                    </ul>
                  </li>
                </ol>

                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mt-10 mb-4">
                  § 14. Postanowienia końcowe
                </h2>
                <ol className="list-decimal pl-6 text-secondary-600 dark:text-secondary-400 mb-6 space-y-3">
                  <li>
                    Sprzedawca może zmienić Regulamin z ważnych przyczyn, w
                    szczególności:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>zmiany przepisów prawa,</li>
                      <li>zmian technologicznych,</li>
                      <li>zmian organizacyjnych,</li>
                      <li>zmian zasad współpracy B2B.</li>
                    </ul>
                  </li>
                  <li>
                    Zmiany Regulaminu nie wpływają na Zamówienia złożone przed
                    ich wejściem w życie.
                  </li>
                  <li>
                    W sprawach nieuregulowanych zastosowanie mają przepisy prawa
                    polskiego.
                  </li>
                  <li>
                    Spory:
                    <ul className="list-[lower-alpha] pl-6 mt-2 space-y-1">
                      <li>
                        z Konsumentami rozstrzygane są przez sądy właściwe
                        zgodnie z przepisami prawa,
                      </li>
                      <li>
                        z Klientami B2B przez sąd właściwy dla siedziby
                        Sprzedawcy.
                      </li>
                    </ul>
                  </li>
                  <li>
                    Konsument może korzystać z pozasądowych sposobów
                    rozpatrywania reklamacji i dochodzenia roszczeń zgodnie z
                    informacjami publikowanymi przez UOKiK.
                  </li>
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
