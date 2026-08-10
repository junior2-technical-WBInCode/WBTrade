'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { searchApi } from '../lib/api';

// Bot branding
const BOT_NAME = 'WuBuś';
const WB_LOGO = '/images/wubus-chatbot.png';

// ─── FAQ Knowledge Base ───
const FAQ_DATA: { keywords: string[]; question: string; answer: string; category: string }[] = [
  // ═══ ZAMÓWIENIA ═══
  {
    keywords: ['zamówienie', 'złożyć', 'składanie', 'kupić', 'zakup', 'jak zamówić', 'jak kupić'],
    question: 'Jak złożyć zamówienie?',
    answer: 'Aby złożyć zamówienie:\n1. Dodaj produkty do koszyka\n2. Przejdź do koszyka (ikona 🛒)\n3. Kliknij „Dostawa i płatność"\n4. Podaj adres dostawy\n5. Wybierz metodę wysyłki i płatności\n6. Potwierdź zamówienie\n\nOtrzymasz e-mail z potwierdzeniem.',
    category: 'Zamówienia',
  },
  {
    keywords: ['status', 'śledzić', 'śledzenie', 'gdzie zamówienie', 'sprawdzić zamówienie', 'tracking', 'moje zamówienia'],
    question: 'Jak sprawdzić status zamówienia?',
    answer: 'Przejdź do: Konto → Moje zamówienia. Zobaczysz listę wszystkich zamówień z aktualnym statusem (Nowe → Potwierdzone → W realizacji → Wysłane → Dostarczone). Kliknij w zamówienie, aby zobaczyć szczegóły i numer śledzenia przesyłki.',
    category: 'Zamówienia',
  },
  {
    keywords: ['anulować', 'anulowanie', 'odwołać', 'rezygnacja', 'zrezygnować'],
    question: 'Jak anulować zamówienie?',
    answer: 'Zamówienie możesz anulować w zakładce Konto → Moje zamówienia, o ile nie zostało jeszcze wysłane. Kliknij w zamówienie i wybierz opcję anulowania. Jeśli zamówienie zostało już nadane, skorzystaj z procedury zwrotu.',
    category: 'Zamówienia',
  },
  {
    keywords: ['faktura', 'vat', 'rachunek', 'dokument', 'firma', 'nip'],
    question: 'Jak otrzymać fakturę VAT?',
    answer: 'Fakturę VAT możesz pobrać z zakładki Konto → Moje zamówienia po kliknięciu w dane zamówienie. Ważne: aby otrzymać fakturę na firmę, podaj dane firmy (nazwa, NIP) w kroku „Adres" podczas składania zamówienia lub uzupełnij je w swoim profilu.',
    category: 'Zamówienia',
  },
  {
    keywords: ['zamówienie bez konta', 'gość', 'bez rejestracji', 'bez logowania'],
    question: 'Czy mogę zamówić bez zakładania konta?',
    answer: 'Tak! Możesz złożyć zamówienie jako gość. W koszyku kliknij „Dostawa i płatność" — pojawi się opcja „Kontynuuj bez logowania". Podaj adres i dane dostawy. Pamiętaj jednak, że z kontem masz dostęp do historii zamówień, kuponów i list zakupowych.',
    category: 'Zamówienia',
  },
  {
    keywords: ['statusy zamówienia', 'etapy', 'oś czasu', 'timeline'],
    question: 'Jakie są etapy realizacji zamówienia?',
    answer: 'Zamówienie przechodzi przez następujące etapy:\n\n1. 📝 Nowe — zamówienie złożone\n2. ✅ Potwierdzone — płatność zweryfikowana\n3. 📦 W realizacji — kompletowane w magazynie\n4. 🚚 Wysłane — przekazane do kuriera\n5. ✔️ Dostarczone — odebrane\n\nCały postęp widzisz w szczegółach zamówienia.',
    category: 'Zamówienia',
  },

  // ═══ KOSZYK I CHECKOUT ═══
  {
    keywords: ['koszyk', 'dodać do koszyka', 'co jest w koszyku', 'produkty w koszyku'],
    question: 'Jak działa koszyk?',
    answer: 'Koszyk znajdziesz klikając ikonę 🛒 w nagłówku strony. Produkty są automatycznie grupowane według magazynów jako osobne paczki (Paczka 1, Paczka 2...). Możesz zmieniać ilość produktów, usuwać je, oraz dodawać kupony rabatowe.',
    category: 'Koszyk',
  },
  {
    keywords: ['paczka', 'magazyn', 'dlaczego kilka paczek', 'kilka przesyłek', 'grupowanie'],
    question: 'Dlaczego moje zamówienie jest podzielone na paczki?',
    answer: 'Produkty w WBTrade pochodzą z różnych magazynów. Każdy magazyn wysyła osobną paczkę, dlatego w koszyku widzisz podział na „Paczka 1", „Paczka 2" itd. Aby zaoszczędzić na wysyłce, dodawaj produkty z tego samego magazynu.',
    category: 'Koszyk',
  },
  {
    keywords: ['checkout', 'realizacja zamówienia', 'kroki zamówienia', 'jak zamówić krok po kroku'],
    question: 'Jak wygląda proces składania zamówienia?',
    answer: 'Proces zamówienia ma 4 kroki:\n\n1. 📍 Adres — podaj dane i adres dostawy\n2. 🚚 Dostawa — wybierz metodę wysyłki dla każdej paczki\n3. 💳 Płatność — wybierz sposób zapłaty\n4. 📋 Podsumowanie — sprawdź wszystko i złóż zamówienie\n\nMożesz się cofać między krokami.',
    category: 'Koszyk',
  },

  // ═══ PŁATNOŚCI ═══
  {
    keywords: ['płatność', 'płacić', 'metody płatności', 'blik', 'karta', 'przelew', 'zapłacić', 'przelewy24'],
    question: 'Jakie metody płatności są dostępne?',
    answer: 'Akceptujemy:\n• Szybkie przelewy online (Przelewy24)\n• BLIK\n• Karty płatnicze (Visa, Mastercard)\n• Apple Pay, Google Pay\n• Przelewy tradycyjne\n• Płatność przy odbiorze (za pobraniem)\n\nWszystkie transakcje online są szyfrowane i bezpieczne.',
    category: 'Płatności',
  },
  {
    keywords: ['bezpieczne', 'bezpieczeństwo płatności', 'szyfrowanie', 'ssl'],
    question: 'Czy płatności są bezpieczne?',
    answer: 'Tak, wszystkie płatności są realizowane przez certyfikowanego operatora Przelewy24 z szyfrowaniem SSL. Nie przechowujemy danych Twoich kart płatniczych.',
    category: 'Płatności',
  },
  {
    keywords: ['zwrot pieniędzy', 'refund', 'oddać pieniądze', 'zwrot środków', 'zwrot na konto'],
    question: 'Jak otrzymać zwrot pieniędzy?',
    answer: 'Zwrot środków następuje automatycznie po zaakceptowaniu zwrotu produktu. Pieniądze wrócą na konto, z którego dokonano płatności w ciągu 5-14 dni roboczych, w zależności od banku.',
    category: 'Płatności',
  },

  // ═══ ZWROTY I REKLAMACJE ═══
  {
    keywords: ['zwrot', 'zwrócić', 'odesłać', 'odstąpienie', '14 dni', 'zwrot produktu'],
    question: 'Jak złożyć zwrot?',
    answer: 'Masz 14 dni od otrzymania produktu na odstąpienie od umowy bez podania przyczyny.\n\n1. Przejdź do Konto → Moje zamówienia\n2. Kliknij zamówienie ze statusem „Dostarczone" lub „Wysłane"\n3. Kliknij „Złóż wniosek o zwrot"\n4. Otrzymasz numer zwrotu i adres do odesłania\n5. Wyślij produkt w oryginalnym opakowaniu\n\nMożesz też napisać na support@wb-partners.pl.',
    category: 'Zwroty',
  },
  {
    keywords: ['reklamacja', 'reklamować', 'uszkodzony', 'wadliwy', 'zepsuty', 'nie działa'],
    question: 'Jak złożyć reklamację?',
    answer: 'Reklamację możesz złożyć:\n• Na stronie: Konto → Moje zamówienia → kliknij zamówienie → „Zgłoś reklamację"\n• Mailowo: support@wb-partners.pl\n\nOpisz problem i dołącz zdjęcia uszkodzonego produktu. Rozpatrzymy reklamację w ciągu 14 dni.',
    category: 'Zwroty',
  },
  {
    keywords: ['koszty zwrotu', 'kto płaci za zwrot', 'opłata za zwrot'],
    question: 'Kto pokrywa koszty zwrotu?',
    answer: 'W przypadku odstąpienia od umowy (14 dni) koszty przesyłki zwrotnej ponosi kupujący. W przypadku uznanej reklamacji koszty pokrywa sklep.',
    category: 'Zwroty',
  },

  // ═══ DOSTAWA ═══
  {
    keywords: ['dostawa', 'wysyłka', 'metody dostawy', 'kurier', 'paczkomat', 'inpost', 'dpd'],
    question: 'Jakie są metody dostawy?',
    answer: 'Oferujemy:\n• 📦 Paczkomaty InPost — od 12,99 zł\n• 🚚 Kurier InPost — od 14,99 zł\n• 🚛 Kurier DPD — od 15,99 zł\n• 📐 Wysyłka gabarytowa (duże przedmioty)\n• 🏪 Odbiór osobisty (Outlet)',
    category: 'Dostawa',
  },
  {
    keywords: ['ile kosztuje dostawa', 'cena dostawy', 'koszt wysyłki', 'darmowa dostawa', 'za darmo'],
    question: 'Ile kosztuje dostawa i kiedy jest darmowa?',
    answer: 'Koszty wysyłki:\n• Paczkomaty InPost — od 12,99 zł\n• Kurier InPost — od 14,99 zł\n• Kurier DPD — od 15,99 zł\n\n🎉 Dostawa GRATIS przy zamówieniach powyżej 299 zł!',
    category: 'Dostawa',
  },
  {
    keywords: ['ile trwa dostawa', 'czas dostawy', 'kiedy przyjdzie', 'kiedy dostanę'],
    question: 'Ile trwa dostawa?',
    answer: 'Standardowe czasy dostawy:\n• Paczkomaty InPost — zwykle następnego dnia roboczego\n• Kurier InPost/DPD — 1-2 dni robocze\n• Wysyłka gabarytowa — 2-5 dni roboczych\n\nCzas może się wydłużyć w okresach promocyjnych.',
    category: 'Dostawa',
  },
  {
    keywords: ['śledzenie przesyłki', 'tracking', 'numer śledzenia', 'gdzie paczka', 'numer paczki'],
    question: 'Jak śledzić przesyłkę?',
    answer: 'Po nadaniu przesyłki:\n1. Otrzymasz e-mail z numerem śledzenia\n2. Na stronie przejdź do Konto → Moje zamówienia → kliknij zamówienie\n3. W sekcji „Przesyłka" zobaczysz numer śledzenia i link do śledzenia',
    category: 'Dostawa',
  },

  // ═══ KUPONY I RABATY ═══
  {
    keywords: ['kupon', 'kod rabatowy', 'zniżka', 'rabat', 'kod promocyjny', 'gdzie kupony', 'moje kupony'],
    question: 'Gdzie znajdę swoje kody rabatowe?',
    answer: 'Wszystkie Twoje kupony znajdziesz w: Konto → Moje rabaty.\n\nZobaczysz tam:\n• Aktywne kupony z kodem do skopiowania\n• Wartość rabatu (%, kwota lub darmowa dostawa)\n• Datę ważności i minimalną kwotę zamówienia\n\nKupony możesz też szybko zastosować bezpośrednio w koszyku!',
    category: 'Kupony i Rabaty',
  },
  {
    keywords: ['użyć kuponu', 'wpisać kupon', 'zastosować kupon', 'jak użyć kodu', 'pole kuponu'],
    question: 'Jak użyć kodu rabatowego?',
    answer: 'W koszyku wpisz kod w polu „Kod kuponu" i kliknij „Zastosuj". Możesz też kliknąć na dostępny kupon pod polem, aby zastosować go automatycznie. Rabat zostanie natychmiast naliczony.',
    category: 'Kupony i Rabaty',
  },
  {
    keywords: ['zdobyć kupon', 'jak dostać rabat', 'skąd kupony', 'rabaty do zdobycia', 'darmowy kupon'],
    question: 'Jak zdobyć kupony rabatowe?',
    answer: 'Przejdź do Konto → Moje rabaty → sekcja „Rabaty do zdobycia":\n\n📧 Zapisz się do newslettera → -10%\n⭐ Wystaw pierwszą opinię → -5%\n👥 Poleć znajomemu → -10%\n🎂 Urodzinowy prezent → -15%',
    category: 'Kupony i Rabaty',
  },
  {
    keywords: ['newsletter kupon', 'kupon za newsletter', 'newsletter rabat', '-10%', 'nie zapisałem', 'zapomniałem newsletter'],
    question: 'Jak dostać kupon za newsletter?',
    answer: 'Aby otrzymać kupon -10% za newsletter:\n\n📌 Przy rejestracji — zaznacz checkbox „Chcę otrzymywać newsletter"\n\n💡 Przegapiłeś? Przejdź do Konto → Moje rabaty → „Zapisz się do newslettera" → kliknij „Odbierz" — kupon -10% pojawi się automatycznie na Twoim koncie! 🎉',
    category: 'Kupony i Rabaty',
  },

  // ═══ WYSZUKIWANIE ═══
  {
    keywords: ['szukać', 'wyszukiwarka', 'szukaj', 'znaleźć produkt', 'wyszukać', 'szukanie'],
    question: 'Jak szukać produktów?',
    answer: 'Użyj paska wyszukiwania na górze strony. Wpisz frazę, a zobaczysz podpowiedzi w czasie rzeczywistym (produkty i kategorie). Wyniki możesz sortować (cena, popularność, ocena, nowości) i filtrować.',
    category: 'Nawigacja',
  },
  {
    keywords: ['sortowanie', 'sortować', 'po cenie', 'od najtańszego', 'od najdroższego', 'filtrowanie'],
    question: 'Jak sortować i filtrować produkty?',
    answer: 'W wynikach wyszukiwania i na stronach kategorii możesz sortować:\n\n• Trafność / Popularność\n• Najlepiej oceniane\n• Najnowsze\n• Cena: rosnąco ↑ lub malejąco ↓\n• Nazwa A-Z',
    category: 'Nawigacja',
  },

  // ═══ PRODUKT ═══
  {
    keywords: ['strona produktu', 'szczegóły produktu', 'informacje o produkcie', 'opis produktu', 'specyfikacja'],
    question: 'Co znajdę na stronie produktu?',
    answer: 'Strona produktu zawiera:\n\n• 🖼️ Galerię zdjęć\n• 💰 Cenę z ewentualną zniżką i ceną Omnibus\n• 📏 Wybór wariantów (kolor, rozmiar itp.)\n• 📦 Status dostępności\n• 🛒 Przycisk „Dodaj do koszyka"\n• ❤️ Przycisk ulubionych\n• 📝 Opis i Specyfikacja\n• ⭐ Opinie klientów',
    category: 'Produkty',
  },
  {
    keywords: ['omnibus', 'najniższa cena', 'cena omnibus', 'cena z 30 dni'],
    question: 'Co to jest cena Omnibus?',
    answer: 'Cena Omnibus to najniższa cena produktu z ostatnich 30 dni przed obniżką. Wyświetlamy ją zgodnie z dyrektywą UE Omnibus — dzięki temu zawsze wiesz, czy promocja jest rzeczywista.',
    category: 'Produkty',
  },

  // ═══ ULUBIONE ═══
  {
    keywords: ['ulubione', 'wishlist', 'polubione', 'serce', 'dodać do ulubionych', 'zapisać produkt'],
    question: 'Jak dodać produkt do ulubionych?',
    answer: 'Kliknij ikonę ❤️ (serce) na karcie produktu lub na stronie produktu. Wymaga to zalogowania. Wszystkie ulubione produkty znajdziesz na stronie „Ulubione" w swoim koncie.',
    category: 'Ulubione',
  },

  // ═══ OPINIE ═══
  {
    keywords: ['opinia', 'recenzja', 'ocena', 'gwiazdki', 'dodać opinię', 'napisać opinię'],
    question: 'Jak dodać opinię o produkcie?',
    answer: 'Na stronie kupionego produktu przewiń do sekcji „Opinie" i kliknij „Dodaj opinię". Wybierz ocenę (1-5 gwiazdek), wpisz recenzję i wyślij. Za pierwszą opinię otrzymasz kupon -5%! ⭐',
    category: 'Opinie',
  },

  // ═══ KONTO ═══
  {
    keywords: ['konto', 'rejestracja', 'założyć konto', 'zarejestrować', 'nowe konto'],
    question: 'Jak założyć konto?',
    answer: 'Kliknij „Zarejestruj się" w prawym górnym rogu strony. Podaj:\n• Imię i nazwisko\n• Adres e-mail\n• Hasło (min. 8 znaków)\n• Zaznacz akceptację regulaminu\n• Opcjonalnie: zaznacz newsletter (dostaniesz kupon -10%!)\n\nPo rejestracji możesz od razu kupować!',
    category: 'Konto',
  },
  {
    keywords: ['logowanie', 'zalogować', 'nie mogę się zalogować', 'login'],
    question: 'Jak się zalogować?',
    answer: 'Kliknij „Zaloguj się" w prawym górnym rogu strony. Wpisz swój e-mail i hasło. Jeśli zapomniałeś hasła, kliknij „Zapomniałem hasła" — otrzymasz link do resetu na e-mail.',
    category: 'Konto',
  },
  {
    keywords: ['zmienić hasło', 'nowe hasło', 'reset hasła', 'zapomniane hasło', 'nie pamiętam hasła'],
    question: 'Jak zmienić hasło?',
    answer: 'Jeśli jesteś zalogowany: Konto → Zmień hasło.\n\nJeśli zapomniałeś hasła: Na stronie logowania kliknij „Zapomniałem hasła" → podaj e-mail → otrzymasz link do resetu.',
    category: 'Konto',
  },

  // ═══ NEWSLETTER ═══
  {
    keywords: ['newsletter', 'subskrypcja', 'zapisać się', 'powiadomienia', 'maile'],
    question: 'Jak zapisać się do newslettera?',
    answer: 'Możesz zapisać się do newslettera:\n\n1️⃣ Przy rejestracji — zaznacz checkbox „Chcę otrzymywać newsletter"\n2️⃣ W dowolnym momencie — Konto → Moje rabaty → „Zapisz się do newslettera"\n\nKorzyści:\n✉️ Kupon -10% od razu po zapisie!\n📢 Informacje o wyprzedażach i nowościach',
    category: 'Newsletter',
  },

  // ═══ KONTAKT ═══
  {
    keywords: ['kontakt', 'pomoc', 'support', 'obsługa', 'telefon', 'email support', 'napisać', 'numer telefonu'],
    question: 'Jak się z nami skontaktować?',
    answer: 'Masz kilka sposobów na kontakt z nami:\n\n📧 E-mail: support@wb-partners.pl\n📞 Telefon: +48 570 034 367\n💬 Ten czat — zadaj pytanie!\n\nOdpowiadamy w ciągu 24 godzin w dni robocze.\n\nFirma: WB Partners Sp. z o.o., ul. Słowackiego 24/11, Rzeszów',
    category: 'Kontakt',
  },
  {
    keywords: ['regulamin', 'warunki', 'zasady', 'terms'],
    question: 'Gdzie znajdę regulamin?',
    answer: 'Regulamin sklepu znajdziesz na dole strony w stopce lub w Konto → Regulamin.',
    category: 'Kontakt',
  },
  {
    keywords: ['polityka prywatności', 'dane osobowe', 'rodo', 'cookies', 'ciasteczka'],
    question: 'Gdzie znajdę politykę prywatności?',
    answer: 'Politykę prywatności znajdziesz na dole strony w stopce lub w Konto → Polityka prywatności.',
    category: 'Kontakt',
  },
  {
    keywords: ['o nas', 'kto prowadzi', 'właściciel', 'firma', 'siedziba'],
    question: 'Kim jesteście? Informacje o firmie',
    answer: 'WBTrade to sklep internetowy prowadzony przez:\n\n🏢 WB Partners Sp. z o.o.\n📍 ul. Słowackiego 24/11, Rzeszów\n🔢 NIP: 5170455185\n📧 support@wb-partners.pl\n📞 +48 570 034 367',
    category: 'Kontakt',
  },

  // ═══ PROBLEMY TECHNICZNE ═══
  {
    keywords: ['nie ładuje', 'błąd', 'problem', 'nie działa', 'freeze', 'zawiesza się'],
    question: 'Strona nie działa poprawnie — co robić?',
    answer: 'Spróbuj tych kroków:\n\n1. 🔄 Odśwież stronę (F5 lub Ctrl+R)\n2. 📶 Sprawdź połączenie z internetem\n3. 🗑️ Wyczyść cache przeglądarki\n4. 🌐 Spróbuj inną przeglądarkę\n\nJeśli problem nie ustępuje — napisz na support@wb-partners.pl.',
    category: 'Pomoc techniczna',
  },

  // ═══ O BOCIE ═══
  {
    keywords: ['wubuś', 'wubus', 'kim jesteś', 'kim jest wubuś', 'bot', 'chatbot', 'asystent', 'co umiesz', 'jak ci na imię', 'twoje imię'],
    question: 'Kim jest WuBuś?',
    answer: `Jestem ${BOT_NAME} — wirtualny asystent sklepu WBTrade! 🤖\n\nMogę pomóc Ci z:\n• 📦 Zamówieniami — składanie, śledzenie, anulowanie\n• 💳 Płatnościami — metody, bezpieczeństwo, statusy\n• 🚚 Dostawą — metody, koszty, śledzenie paczek\n• 🔄 Zwrotami i reklamacjami\n• 🎁 Kuponami i rabatami\n• 👤 Kontem — rejestracja, logowanie, ustawienia\n• 🔍 Wyszukiwaniem produktów\n\nJeśli nie znam odpowiedzi — przekieruję Cię do naszego zespołu wsparcia! 😊`,
    category: 'O bocie',
  },

  // ═══ GWARANCJA ═══
  {
    keywords: ['gwarancja', 'gwarancyjny', 'serwis gwarancyjny', 'ile gwarancji', 'rękojmia', 'karta gwarancyjna'],
    question: 'Jak działa gwarancja?',
    answer: 'Każdy produkt w WBTrade objęty jest **rękojmią** (24 miesiące od daty zakupu) — to Twoje ustawowe prawo niezależne od producenta.\n\nDodatkowo wiele produktów posiada **gwarancję producenta** — czas trwania i warunki znajdziesz na karcie gwarancyjnej dołączonej do produktu lub na stronie producenta.\n\n📋 Jak zgłosić reklamację gwarancyjną?\n1. Przejdź do Konto → Zamówienia → wybierz produkt\n2. Kliknij „Zgłoś reklamację"\n3. Opisz usterkę i dołącz zdjęcia\n\nMożesz też napisać na support@wb-partners.pl z numerem zamówienia.',
    category: 'Gwarancja',
  },

  // ═══ WYMIANA PRODUKTU ═══
  {
    keywords: ['wymiana', 'wymienić', 'zamienić', 'inny rozmiar', 'inny kolor', 'zamiana', 'wymiana produktu'],
    question: 'Czy mogę wymienić produkt na inny?',
    answer: 'Obecnie nie oferujemy bezpośredniej wymiany produktów. Aby otrzymać inny wariant (np. rozmiar, kolor), wykonaj dwa kroki:\n\n1. **Zwróć produkt** — masz na to 14 dni od otrzymania przesyłki. Przejdź do Konto → Zamówienia → „Zwróć produkt"\n2. **Złóż nowe zamówienie** — wybierz właściwy wariant i zamów ponownie\n\n💡 Zwrot pieniędzy nastąpi w ciągu 14 dni od otrzymania przez nas paczki zwrotnej.\n\nJeśli potrzebujesz pomocy — napisz do nas na kontakt@wbtrade.pl!',
    category: 'Zwroty',
  },

  // ═══ OUTLET / WYPRZEDAŻ ═══
  {
    keywords: ['outlet', 'wyprzedaż', 'promocje', 'okazje', 'tanie', 'black friday', 'sale', 'przecena', 'obniżka', 'produkt dnia'],
    question: 'Gdzie znajdę promocje i wyprzedaże?',
    answer: 'Najlepsze okazje znajdziesz w kilku miejscach:\n\n🏷️ **Sekcja Promocje** — na stronie głównej, sekcja z aktualnymi ofertami\n🔥 **Produkt dnia** — codziennie nowa oferta w specjalnej cenie na stronie głównej\n📧 **Newsletter** — zapisz się, aby otrzymywać kody rabatowe i informacje o wyprzedażach\n🛍️ **Outlet** — produkty w obniżonych cenach znajdziesz w kategorii „Outlet"\n\n💡 Zapisz się do newslettera, aby nie przegapić najlepszych ofert i akcji typu Black Friday!',
    category: 'Promocje',
  },

  // ═══ BEZPIECZEŃSTWO KONTA ═══
  {
    keywords: ['bezpieczeństwo', 'włamanie', 'podejrzane logowanie', 'hakerzy', 'zhakowane', 'ktoś się zalogował', 'bezpieczeństwo konta'],
    question: 'Jak zadbać o bezpieczeństwo konta?',
    answer: '🔐 **Zasady bezpiecznego konta:**\n\n1. Używaj **silnego hasła** — min. 8 znaków, duże i małe litery, cyfry, znaki specjalne\n2. **Nie udostępniaj** danych logowania nikomu\n3. Nigdy nie podawaj hasła przez e-mail ani telefon — nasz zespół nigdy o to nie prosi\n4. Regularnie **zmieniaj hasło** (Konto → Ustawienia → Zmień hasło)\n\n⚠️ **Podejrzewasz włamanie?**\n• Natychmiast zmień hasło\n• Sprawdź historię zamówień\n• Napisz do nas: support@wb-partners.pl\n\nZareagujemy w ciągu 24h i pomożemy zabezpieczyć konto!',
    category: 'Pomoc techniczna',
  },

  // ═══ GODZINY PRACY OBSŁUGI ═══
  {
    keywords: ['godziny pracy', 'kiedy odpowiecie', 'czas odpowiedzi', 'kiedy dzwonić', 'godziny obsługi', 'kontakt godziny'],
    question: 'Jakie są godziny pracy obsługi klienta?',
    answer: `🕐 **Godziny pracy zespołu wsparcia:**\n\n📞 **Telefon:** poniedziałek–piątek, 9:00–17:00\n📧 **E-mail:** odpowiadamy w ciągu 24h w dni robocze (kontakt@wbtrade.pl)\n🤖 **${BOT_NAME} (ja!):** dostępny **24/7** — zawsze chętnie pomogę!\n\nW weekendy i święta obsługa mailowa może działać z opóźnieniem — odpowiemy najszybciej jak to możliwe w najbliższy dzień roboczy.\n\n💡 Jeśli sprawa jest pilna, opisz ją jak najdokładniej w mailu — przyspieszy to rozwiązanie!`,
    category: 'Obsługa klienta',
  },

  // ═══ WIELOKROTNE ADRESY DOSTAWY ═══
  {
    keywords: ['różne adresy', 'kilka adresów', 'inny adres', 'prezent', 'inny adres dostawy', 'dwa adresy'],
    question: 'Czy mogę wysłać zamówienie na różne adresy?',
    answer: 'Jedno zamówienie może zostać wysłane tylko na **jeden adres dostawy**.\n\n🎁 Jeśli chcesz wysłać produkty pod różne adresy (np. prezenty), złóż **osobne zamówienia** — każde z innym adresem dostawy.\n\n📋 **Jak dodać nowy adres?**\n1. Podczas składania zamówienia kliknij „Zmień adres"\n2. Wpisz nowy adres lub wybierz z zapisanych\n3. Możesz zapisać wiele adresów w Konto → Adresy\n\n💡 Dodaj adnotację „Prezent — nie dołączać paragonu" w uwagach do zamówienia, jeśli wysyłasz jako upominek!',
    category: 'Dostawa',
  },

  // ═══ PŁATNOŚĆ RATALNA ═══
  {
    keywords: ['raty', 'ratalna', 'na raty', 'kredyt', 'odroczona płatność', 'płatność odroczona', 'ratalne'],
    question: 'Czy mogę zapłacić na raty?',
    answer: 'Tak! Dla zamówień powyżej 300 zł oferujemy opcje płatności ratalnej:\n\n💳 **Raty PayU** — od 3 do 30 rat, decyzja w kilka minut\n🏦 **Odroczona płatność** — kup teraz, zapłać za 30 dni (PayPo / Twisto)\n\n📋 **Jak skorzystać?**\n1. Dodaj produkty do koszyka\n2. Przejdź do płatności\n3. Wybierz „Raty" lub „Zapłać później"\n4. Wypełnij krótki formularz — decyzja online\n\n⚠️ Dostępność rat zależy od weryfikacji kredytowej. Szczegóły warunków znajdziesz na stronie wybranego operatora.',
    category: 'Płatności',
  },

  // ═══ STATUS PŁATNOŚCI ═══
  {
    keywords: ['status płatności', 'czy zapłacono', 'opłacone', 'nieopłacone'],
    question: 'Jak sprawdzić status płatności?',
    answer: 'Status płatności znajdziesz w szczegółach zamówienia (Konto → Moje zamówienia → kliknij zamówienie). Przy płatności zobaczysz status: Opłacone ✅, Oczekuje ⏳, Nieudana ❌ lub Zwrócone 🔄.',
    category: 'Płatności',
  },

  // ═══ KIEDY OBCIĄŻENIE ═══
  {
    keywords: ['obciążony', 'pobranie', 'kiedy płatność', 'kiedy pobrana', 'za pobraniem'],
    question: 'Kiedy zostanę obciążony?',
    answer: 'Obciążenie następuje w momencie potwierdzenia płatności. Przy szybkich przelewach i BLIK — natychmiast. Przy kartach — kwota może być zablokowana od razu, a pobrana po wysyłce. Przy płatności za pobraniem płacisz kurierowi przy odbiorze.',
    category: 'Płatności',
  },

  // ═══ ZAPISANE ADRESY ═══
  {
    keywords: ['zapisany adres', 'adres dostawy', 'moje adresy', 'zarządzać adresami'],
    question: 'Jak zarządzać adresami dostawy?',
    answer: 'Przejdź do Konto → Dane do zamówień. Tam możesz:\n• Dodawać nowe adresy (wysyłkowe i fakturowe)\n• Edytować istniejące adresy\n• Ustawiać adres domyślny\n• Usuwać zbędne adresy\n\nPrzy składaniu zamówienia zapisane adresy pojawią się automatycznie do wyboru.',
    category: 'Koszyk',
  },

  // ═══ DOSTĘPNOŚĆ PRODUKTU ═══
  {
    keywords: ['niedostępny', 'brak', 'kiedy będzie', 'restock', 'brak w magazynie', 'wyczerpany', 'ponownie dostępny', 'dostępność'],
    question: 'Produkt jest niedostępny — kiedy wróci?',
    answer: 'Jeśli produkt jest chwilowo niedostępny, masz kilka opcji:\n\n🔔 **Powiadomienie o dostępności** — na stronie produktu kliknij „Powiadom mnie, gdy będzie dostępny". Wyślemy Ci e-mail, gdy produkt wróci do sprzedaży.\n\n📦 **Sprawdź warianty** — czasem inny kolor lub rozmiar jest dostępny od ręki\n\n⏳ **Czas oczekiwania** — zwykle produkty wracają w ciągu 1–3 tygodni, ale zależy to od producenta\n\n💡 Jeśli zależy Ci na konkretnym produkcie, napisz do nas (kontakt@wbtrade.pl) — sprawdzimy u dostawcy przewidywany termin dostawy!',
    category: 'Produkty',
  },

  // ═══ TRYB CIEMNY ═══
  {
    keywords: ['tryb ciemny', 'dark mode', 'ciemny motyw', 'jasny motyw', 'zmienić motyw', 'tryb nocny'],
    question: 'Jak włączyć tryb ciemny?',
    answer: 'Możesz zmienić motyw strony klikając ikonę 🌙/☀️ w prawym górnym rogu nagłówka. Dostępne opcje to:\n\n☀️ **Jasny** — klasyczny, biały motyw\n🌙 **Ciemny** — ciemne tło, oszczędza oczy wieczorem\n⚙️ **Systemowy** — automatycznie dopasowuje się do ustawień Twojego systemu\n\nWybrane ustawienie jest zapamiętywane w przeglądarce.',
    category: 'Pomoc techniczna',
  },
];

// Quick suggestion chips
const PRODUCT_SEARCH_KEYWORDS = [
  'szukam', 'szukasz', 'znajdź', 'znajdz', 'znajde', 'znajdę',
  'poszukaj', 'pokaż', 'pokaz', 'wyszukaj',
  'chcę kupić', 'chce kupic', 'chciałbym kupić', 'chcialbym kupic',
  'interesuje mnie', 'potrzebuję', 'potrzebuje',
  'szukasz produktu', 'szukam produktu',
  'polecasz', 'polecisz', 'poleć', 'polec',
  'jaki produkt', 'jakie produkty', 'co polecasz',
  'czy macie', 'czy masz', 'czy jest', 'czy są', 'czy sa',
  'czy sprzedajecie', 'sprzedajecie', 'oferujecie',
  'macie w ofercie', 'jest w ofercie', 'w ofercie',
  'na stronie', 'w sklepie', 'w waszym sklepie',
  'gdzie kupię', 'gdzie kupie', 'gdzie znajdę', 'gdzie znajde',
  'pokaż mi', 'pokaz mi', 'daj mi', 'podaj mi',
  'są tu', 'sa tu', 'tu są', 'tu sa',
  'macie', 'może jakieś', 'moze jakies', 'a może', 'a moze',
  'co z', 'a co z',
];

// Extra patterns that strongly indicate product search when combined with a noun
const PRODUCT_INTENT_PATTERNS = [
  /(?:czy|powiedz|wubu[sś]).*(?:znajd[ęe]|masz|macie|jest|s[aą]|kupi[ęe]|sprzeda|ofer)/i,
  /(?:gdzie|jak).*(?:kupi[ćce]|znale[źz][ćce]|dosta[ćce])/i,
  /(?:szukam|potrzebuj[eę]|interesuj[eą]).*\w{3,}/i,
  /(?:poka[żz]|wy[sś]wietl|poszukaj).*\w{3,}/i,
  /(?:czy|powiedz).*(?:na tej stronie|w sklepie|w ofercie)/i,
  /(?:a\s+)?mo[żz]e\s+(?:jakie[sś]?|co[sś]?)\s+\w{3,}/i,
  /(?:s[aą]|jest)\s+(?:tu|tutaj)\s+(?:jakie[sś]?)?\s*\w{3,}/i,
  /(?:macie|masz)\s+\w{3,}/i,
  /(?:a\s+)?co\s+z\s+\w{3,}/i,
];

// Words that are clearly FAQ-related, NOT product names
const FAQ_TOPIC_WORDS = new Set([
  'zamówienie', 'zamowienie', 'zamówienia', 'zamowienia', 'zamówień', 'zamowien',
  'dostawa', 'dostawy', 'dostawę', 'dostawe', 'wysyłka', 'wysylka',
  'zwrot', 'zwrotu', 'zwroty', 'reklamacja', 'reklamacji',
  'kupon', 'kuponu', 'kupony', 'kuponów', 'kuponow',
  'płatność', 'platnosc', 'płatności', 'platnosci', 'zapłacić', 'zaplacic',
  'konto', 'konta', 'rejestracja', 'logowanie', 'hasło', 'haslo',
  'newsletter', 'rabat', 'rabatu', 'rabaty', 'zniżka', 'znizka',
  'przesyłka', 'przesylka', 'przesyłki', 'przesylki', 'paczka', 'paczki',
  'opinia', 'opinii', 'opinie', 'ocena', 'oceny',
  'motyw', 'ciemny', 'jasny', 'tryb',
  'pomoc', 'pomocy', 'kontakt', 'support', 'wsparcie',
  'śledzić', 'sledzic', 'śledzenie', 'sledzenie', 'tracking',
]);

const QUICK_QUESTIONS = [
  '🔍 Szukasz produktu?',
  'Kim jest WuBuś?',
  'Jak złożyć zamówienie?',
  'Gdzie moje kupony?',
  'Kupon za newsletter',
  'Jak zwrócić produkt?',
  'Darmowa dostawa',
  'Jak zdobyć kupon?',
  'Ile trwa dostawa?',
  'Jak dodać opinię?',
  'Dlaczego kilka paczek?',
  'Jak śledzić przesyłkę?',
  'Tryb ciemny',
  'Kontakt z supportem',
];

const FOLLOWUP_MESSAGES = [
  'Czy mogę Ci jeszcze w czymś pomóc? 😊',
  'Masz jeszcze jakieś pytanie? Chętnie pomogę! 💬',
  'Czy jest coś jeszcze, w czym mogę pomóc? 🙂',
  'Potrzebujesz pomocy z czymś innym? Pytaj śmiało!',
];

// ─── Types ───
interface MessageAction {
  label: string;
  icon: 'envelope' | 'phone' | 'external-link';
  type: 'email' | 'link';
  payload: string;
  subject?: string;
  body?: string;
}

interface ProductResult {
  id: string;
  name: string;
  price: string | number;
  rating?: string | number;
  reviewCount?: number;
  imageUrl?: string;
}

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
  actions?: MessageAction[];
  showSuggestions?: boolean;
  products?: ProductResult[];
}

// ─── Polish normalization ───
const POLISH_MAP: Record<string, string> = {
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
  'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
};

function normalizePolish(text: string): string {
  return text.replace(/[ąćęłńóśźż]/g, (ch) => POLISH_MAP[ch] || ch);
}

// ─── Levenshtein distance ───
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function isFuzzyMatch(word: string, keyword: string): boolean {
  if (word.length < 4) return false;
  const dist = levenshtein(word, keyword);
  return dist <= 2 && dist < word.length * 0.4;
}

// ─── Polish stem suffixes (simple stemmer) ───
const POLISH_SUFFIXES = [
  'owania', 'owanie', 'owaniu', 'ywanie', 'ywania',
  'ności', 'nosci', 'acje', 'acji', 'anie', 'aniu', 'enia', 'eniu',
  'iego', 'owej', 'owym', 'owej',
  'ach', 'ami', 'iem', 'iem', 'owi', 'owy', 'owa', 'owe',
  'ów', 'ek', 'om', 'ie', 'ię', 'ią', 'ić',
  'y', 'i', 'e', 'a', 'u', 'ę',
];

function stemPolish(word: string): string {
  const w = normalizePolish(word.toLowerCase());
  if (w.length <= 4) return w;
  for (const suffix of POLISH_SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      return w.slice(0, w.length - suffix.length);
    }
  }
  return w;
}

// ─── Prefix matching ───
function isPrefixMatch(word: string, keyword: string): boolean {
  if (word.length < 3) return false;
  const wNorm = normalizePolish(word);
  const kwNorm = normalizePolish(keyword);
  return kwNorm.startsWith(wNorm) || wNorm.startsWith(kwNorm);
}

// ─── Synonym expansion ───
const SYNONYMS: Record<string, string> = {
  'zw': 'zwrot', 'zam': 'zamowienie', 'pw': 'powiadomienie',
  'rek': 'reklamacja', 'dost': 'dostawa', 'info': 'informacja',
  'koszty': 'koszt', 'zamowienia': 'zamowienie', 'zwroty': 'zwrot',
  'platnosci': 'platnosc', 'reklamacje': 'reklamacja', 'dostawy': 'dostawa',
  'kupony': 'kupon', 'produkty': 'produkt',
  'wysylka': 'dostawa', 'paczka': 'dostawa', 'przesylka': 'dostawa',
  'kasa': 'platnosc', 'platnosc': 'platnosc', 'zaplata': 'platnosc',
  'haslo': 'haslo', 'password': 'haslo', 'pass': 'haslo',
  'mail': 'email', 'mejl': 'email',
  'cena': 'cena', 'cennik': 'cena', 'ile kosztuje': 'cena',
  'pomoc': 'kontakt', 'wsparcie': 'kontakt', 'obsluga': 'kontakt',
  'konto': 'konto', 'profil': 'konto', 'rejestracja': 'konto',
  'zwracac': 'zwrot', 'zwrocic': 'zwrot', 'oddac': 'zwrot',
  'zareklamowac': 'reklamacja', 'reklamowac': 'reklamacja',
  'gwarancyjny': 'gwarancja', 'gwarancyjna': 'gwarancja',
  'oplacic': 'platnosc', 'zaplacic': 'platnosc',
  'sledzic': 'sledzenie', 'sledz': 'sledzenie',
  'anulowac': 'anulowanie', 'odwolac': 'anulowanie',
  'zareklamować': 'reklamacja',
};

function expandSynonyms(text: string): string {
  return text.split(/\s+/).map((w) => {
    const norm = normalizePolish(w.toLowerCase());
    return SYNONYMS[norm] ?? w;
  }).join(' ');
}

// ─── Polish stop words for product search ───
const POLISH_STOP_WORDS = new Set([
  'dla', 'do', 'na', 'w', 'z', 'i', 'o', 'od', 'po', 'za', 'pod', 'nad',
  'ze', 'się', 'sie', 'to', 'jest', 'jak', 'co', 'czy', 'nie', 'tak',
  'sa', 'są', 'ma', 'tu', 'my', 'on', 'no', 'bo', 'by', 'że', 'ze', 'a',
  'ale', 'lub', 'ani', 'mi', 'mnie', 'ten', 'ta', 'te', 'tym', 'tych',
  'tego', 'tej', 'ci', 'je', 'ich', 'go', 'mu', 'ją', 'ja',
  'jakiś', 'jakis', 'jakaś', 'jakas', 'jakieś', 'jakies',
  'bardzo', 'też', 'tez', 'już', 'juz', 'jeszcze', 'tylko',
  'może', 'moze', 'proszę', 'prosze', 'chcę', 'chce',
  'potrzebuję', 'potrzebuje', 'szukam', 'chciałbym', 'chcialbym',
  'chciałabym', 'chcialabym', 'jakiegos', 'dobrego', 'dobra', 'dobre',
  'fajne', 'fajny', 'fajnego', 'ładny', 'ladny', 'ładnego', 'ladnego',
  'tani', 'tanie', 'taniego', 'najlepszy', 'najlepsza', 'najlepsze',
  'stronie', 'strona', 'strone', 'tutaj', 'waszej', 'wasza', 'waszym',
  'jakąś', 'jakas', 'pewien', 'cos', 'coś', 'jakiekolwiek',
]);

// ─── Product search query normalizer ───
function normalizeProductQuery(query: string): string {
  // Remove stop words
  const words = query.toLowerCase().split(/\s+/)
    .filter(w => w.length >= 2 && !POLISH_STOP_WORDS.has(w));

  // Normalize each word to a more search-friendly form
  return words.map(w => {
    // Try to get a base/nominative form for common product-related suffixes
    const n = normalizePolish(w);
    // Genitive/accusative plural → nominative plural (e.g. zabawek → zabawki)
    if (n.endsWith('ek') && n.length > 4) return n.slice(0, -2) + 'ki';
    if (n.endsWith('ow') && n.length > 4) return n.slice(0, -2) + 'y';
    if (n.endsWith('ów') && n.length > 4) return normalizePolish(n.slice(0, -2)) + 'y';
    // Genitive singular → nominative (e.g. telefonu → telefon)
    if (n.endsWith('u') && n.length > 4) return n.slice(0, -1);
    // Instrumental (e.g. telefonem → telefon)
    if (n.endsWith('em') && n.length > 5) return n.slice(0, -2);
    // Locative (e.g. telefonie → telefon)  
    if (n.endsWith('ie') && n.length > 5) return n.slice(0, -2);
    // Nominative plural -e → singular -a (frytkownice → frytkownica)
    if (n.endsWith('ce') && n.length > 4) return n.slice(0, -1) + 'a';
    if (n.endsWith('ne') && n.length > 4) return n.slice(0, -1) + 'a';
    if (n.endsWith('ke') && n.length > 4) return n.slice(0, -1) + 'a';
    // Generic plural -e ending for feminine nouns
    if (n.endsWith('e') && n.length > 4) return n.slice(0, -1) + 'a';
    // Adjective endings → base
    if (n.endsWith('ych') && n.length > 5) return n.slice(0, -3);
    if (n.endsWith('ego') && n.length > 5) return n.slice(0, -3);
    if (n.endsWith('owej') && n.length > 6) return n.slice(0, -4);
    return w;
  }).join(' ');
}

// ─── Generate search query variants for retry ───
function generateSearchVariants(query: string): string[] {
  const normalized = normalizeProductQuery(query);
  const words = normalized.split(/\s+/).filter(w => w.length >= 3);
  const variants: string[] = [normalized];

  // Try individual words (longest first - often the product name)
  const sortedWords = [...words].sort((a, b) => b.length - a.length);
  for (const w of sortedWords) {
    if (w.length >= 4 && !variants.includes(w)) {
      variants.push(w);
    }
  }

  // Try stemmed forms of each word
  for (const w of sortedWords) {
    const stemmed = stemPolish(w);
    if (stemmed.length >= 3 && !variants.includes(stemmed)) {
      variants.push(stemmed);
    }
  }

  // Try original query without normalization but without stop words
  const cleaned = query.toLowerCase().split(/\s+/)
    .filter(w => w.length >= 3 && !POLISH_STOP_WORDS.has(w))
    .join(' ');
  if (cleaned && !variants.includes(cleaned)) {
    variants.push(cleaned);
  }

  return variants;
}

// ─── Product relevance validation ───
function isProductRelevant(productName: string, searchQuery: string): boolean {
  const nameNorm = normalizePolish(productName.toLowerCase());
  const nameWordsNorm = nameNorm.split(/\s+/).filter(w => w.length >= 2);
  const queryWords = searchQuery.toLowerCase().split(/\s+/)
    .filter(w => w.length >= 3 && !POLISH_STOP_WORDS.has(w));

  if (queryWords.length === 0) return false;

  for (const qw of queryWords) {
    const qwNorm = normalizePolish(qw);
    const qwStem = stemPolish(qw);

    // Find where in the product name the match occurs
    const matchIdx = nameWordsNorm.findIndex(nw => {
      if (nw === qwNorm || nw.startsWith(qwNorm) || qwNorm.startsWith(nw)) return true;
      if (stemPolish(nw) === qwStem) return true;
      if (qwNorm.length >= 4 && isFuzzyMatch(qwNorm, nw)) return true;
      return false;
    });

    if (matchIdx === -1) continue;

    // Product type is in the first 1-2 words of the name.
    // If the query matches there → it IS that product type, accept.
    // If it only matches later → it's a modifier/accessory (e.g. "odkurzacz DO dywanów"), reject.
    if (matchIdx <= 1) return true;
  }
  return false;
}

function filterRelevantProducts(products: any[], searchQuery: string): any[] {
  const relevant = products.filter((p: any) => isProductRelevant(p.name || '', searchQuery));
  return relevant;
}

// ─── FAQ Matching ───
interface FaqResult {
  answer: string;
  score: number;
}

function findBestAnswer(query: string): FaqResult | null {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return null;

  const POLITE_RESPONSES: { patterns: string[]; replies: string[] }[] = [
    {
      patterns: ['dziękuję', 'dziekuje', 'dzięki', 'dzieki', 'dzięks', 'thanks', 'thx', 'wielkie dzięki', 'super dzięki', 'dziękuje bardzo', 'dziekuje bardzo', 'bardzo dziękuję'],
      replies: [
        'Nie ma za co! 😊 Cieszę się, że mogłem pomóc. Gdybyś miał jeszcze pytania — pisz śmiało!',
        'Proszę bardzo! 🙌 Zawsze chętnie pomogę. Miłych zakupów w WBTrade!',
        'Cała przyjemność po mojej stronie! 😄 Jeśli coś jeszcze — jestem tutaj.',
        'Nie ma sprawy! ✨ Życzę udanych zakupów!',
      ],
    },
    {
      patterns: ['miłego dnia', 'milego dnia', 'dobrego dnia', 'miłego wieczoru', 'dobrej nocy', 'dobranoc', 'do widzenia', 'pa pa', 'papa', 'nara', 'cześć', 'hej hej', 'trzymaj się', 'do zobaczenia', 'bye'],
      replies: [
        'Miłego dnia! ☀️ Do zobaczenia w WBTrade!',
        'Nawzajem! 😊 Życzę Ci świetnego dnia i udanych zakupów!',
        'Do zobaczenia! 👋 Gdybyś potrzebował pomocy — zawsze tu jestem!',
        'Trzymaj się ciepło! 🌟 Wpadaj do nas kiedy chcesz!',
      ],
    },
    {
      patterns: ['super', 'świetnie', 'extra', 'ekstra', 'bomba', 'git', 'top', 'zajebiste', 'kozak', 'pięknie', 'rewelacja', 'idealnie', 'genialnie', 'wspaniale'],
      replies: [
        'Cieszę się! 🎉 Jeśli potrzebujesz czegoś jeszcze — pytaj!',
        'Super, że mogłem pomóc! 💪 Miłych zakupów!',
        'To miło słyszeć! 😊 Jestem tu, gdybyś potrzebował pomocy.',
      ],
    },
    {
      patterns: ['hej', 'hejka', 'siema', 'elo', 'yo', 'witam', 'witaj', 'cześć', 'czesc', 'dzień dobry', 'dzien dobry', 'dobry wieczór', 'hello', 'hi'],
      replies: [
        `Hej! 👋 Jestem ${BOT_NAME}. W czym mogę Ci dzisiaj pomóc?`,
        `Cześć! 😊 Jestem ${BOT_NAME}, Twój asystent WBTrade. Zadaj mi pytanie!`,
        `Witaj! 🙌 Jak mogę Ci pomóc? Pytaj o zamówienia, dostawę, kupony i więcej!`,
      ],
    },
    {
      patterns: ['ok', 'okej', 'okay', 'dobra', 'jasne', 'rozumiem', 'zrozumiałem', 'spoko', 'w porządku', 'no dobra'],
      replies: [
        'Jasne! 👍 Gdybyś miał jeszcze pytania — pisz śmiało!',
        'Okej! 😊 Jestem tu, jeśli będziesz potrzebować pomocy.',
        'Super! Jeśli coś jeszcze — pytaj bez wahania! 💬',
      ],
    },
  ];

  for (const group of POLITE_RESPONSES) {
    for (const pattern of group.patterns) {
      if (q === pattern || q.includes(pattern)) {
        return { answer: group.replies[Math.floor(Math.random() * group.replies.length)], score: 100 };
      }
    }
  }

  // Expand synonyms before scoring
  const qExpanded = expandSynonyms(q);
  const qNorm = normalizePolish(qExpanded);
  const qWords = qExpanded.split(/\s+/).filter(w => w.length >= 2);
  const qWordsNorm = qNorm.split(/\s+/).filter(w => w.length >= 2);
  const qStems = qWordsNorm.map(w => stemPolish(w));

  let bestScore = 0;
  let secondBestScore = 0;
  let bestAnswer: typeof FAQ_DATA[0] | null = null;

  for (const faq of FAQ_DATA) {
    let score = 0;
    let matchedKeywords = 0;

    for (const keyword of faq.keywords) {
      const kw = keyword.toLowerCase();
      const kwNorm = normalizePolish(kw);
      let keywordMatched = false;

      // Exact keyword in query (highest weight)
      if (qExpanded.includes(kw)) {
        score += kw.length * 3;
        keywordMatched = true;
      } else if (qNorm.includes(kwNorm)) {
        score += kwNorm.length * 2.5;
        keywordMatched = true;
      }

      // Individual words overlap + stemming + prefix matching
      const kwWords = kw.split(/\s+/);
      const kwStems = kwWords.map(w => stemPolish(w));

      for (let i = 0; i < qWords.length; i++) {
        const w = qWords[i];
        const wN = qWordsNorm[i] ?? normalizePolish(w);
        const wStem = qStems[i] ?? stemPolish(w);

        if (w.length >= 3) {
          // Direct substring match
          if (kw.includes(w)) {
            score += w.length * 1.2;
            keywordMatched = true;
          } else if (kwNorm.includes(wN)) {
            score += wN.length;
            keywordMatched = true;
          }
          // Stem matching (new!)
          else if (kwStems.some(ks => ks === wStem)) {
            score += w.length * 0.9;
            keywordMatched = true;
          }
          // Prefix matching (new!)
          else if (kwWords.some(kwPart => isPrefixMatch(wN, normalizePolish(kwPart)))) {
            score += w.length * 0.8;
            keywordMatched = true;
          }
          // Fuzzy matching
          else if (w.length >= 4) {
            for (const kwPart of kwWords) {
              if (isFuzzyMatch(wN, normalizePolish(kwPart))) {
                score += w.length * 0.7;
                keywordMatched = true;
                break;
              }
            }
          }
        }
      }

      if (keywordMatched) matchedKeywords++;
    }

    // Bonus for high keyword coverage
    if (faq.keywords.length > 0 && matchedKeywords / faq.keywords.length > 0.5) {
      score += 10;
    }
    // Extra bonus for very high keyword coverage
    if (faq.keywords.length > 0 && matchedKeywords / faq.keywords.length > 0.8) {
      score += 5;
    }

    // Bonus for question text match
    if (faq.question.toLowerCase().includes(qExpanded)) {
      score += 20;
    } else if (normalizePolish(faq.question.toLowerCase()).includes(qNorm)) {
      score += 16;
    }
    // Partial question text match (stem-based)
    else {
      const questionStems = normalizePolish(faq.question.toLowerCase())
        .split(/\s+/)
        .filter(w => w.length >= 3)
        .map(w => stemPolish(w));
      const stemOverlap = qStems.filter(qs => questionStems.includes(qs)).length;
      if (stemOverlap >= 2) {
        score += stemOverlap * 4;
      }
    }

    // Category bonus if user mentions category name
    const catNorm = normalizePolish(faq.category.toLowerCase());
    if (qNorm.includes(catNorm) && catNorm.length >= 4) {
      score += 6;
    }

    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestAnswer = faq;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  // Confidence threshold with gap analysis
  // Lower threshold for short queries (single words), higher for longer ones
  const minThreshold = qWords.length <= 1 ? 5 : 8;

  if (bestScore >= minThreshold && bestAnswer) {
    // If scores are very close, answer is ambiguous but still return best
    return { answer: bestAnswer.answer, score: bestScore };
  }

  return null;
}

// ─── Icons (inline SVG) ───
function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 512 512" width="24" height="24">
      <path d="M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c0 0 0 0 0 0s0 0 0 0s0 0 0 0c0 0 0 0 0 0l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z"/>
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 512 512" width="16" height="16">
      <path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 492.3 160 480V396.4c0-4 1.5-7.8 4.2-10.7L331.8 202.8c5.8-6.3 5.4-16.1-.9-21.9s-16.1-5.4-21.9 .9l-165 176.3-73.3-33.3c-10.4-4.7-17.2-14.4-17.6-25.3s5.4-21.2 15.3-26.7L486.8 .4c10.3-4.4 22.3-1.8 29.6 5.2z"/>
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 448 512" width="16" height="16">
      <path d="M432 256c0 17.7-14.3 32-32 32H48c-17.7 0-32-14.3-32-32s14.3-32 32-32H400c17.7 0 32 14.3 32 32z"/>
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 384 512" width="16" height="16">
      <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 576 512" width="12" height="12">
      <path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.4 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/>
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 320 512" width="12" height="12">
      <path d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/>
    </svg>
  );
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 512 512" width="14" height="14">
      <path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/>
    </svg>
  );
}

// ─── Initial message with dynamic greeting ───
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Dzień dobry! ☀️';
  if (hour >= 12 && hour < 18) return 'Cześć! 👋';
  if (hour >= 18 && hour < 22) return 'Dobry wieczór! 🌙';
  return 'Hej, jeszcze nie śpisz? 🦉';
}

const createInitialMessage = (): Message => ({
  id: '0',
  text: `${getGreeting()} Jestem ${BOT_NAME} — Twój wirtualny asystent WBTrade. Zadaj mi pytanie dotyczące zamówień, płatności, dostawy, zwrotów lub konta — chętnie pomogę!`,
  isBot: true,
  timestamp: new Date(),
});

// ─── Chat Bubble Component ───
export function ChatBubble({ onClick, hasActiveChat }: { onClick: () => void; hasActiveChat?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <button
          onClick={onClick}
          className="relative w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 animate-pulse-gentle focus:outline-none overflow-hidden ring-2 ring-white/70 dark:ring-white/25"
          aria-label="Otwórz czat z WuBuś"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/wubus-chat.png" alt="WuBuś" className="w-full h-full object-cover" />
        </button>
        {/* Online status dot — always visible, outside the clipped button */}
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full shadow-sm" />
      </div>
      <span className="mt-1 px-2 py-0.5 text-[10px] font-bold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        Zapytaj
      </span>
    </div>
  );
}

// ─── Placeholder rotation ───
const ROTATING_PLACEHOLDERS = [
  'Napisz pytanie...',
  'Zapytaj o zamówienie...',
  'Szukasz produktu? Napisz!',
  'Zapytaj o dostawę...',
  'Masz pytanie o zwrot?',
  'Wpisz kod kuponu...',
  'Jak mogę pomóc?',
];

// ─── Timestamp formatter ───
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

// ─── Allowed paths for chatbot visibility ───
function shouldShowChatBot(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname.startsWith('/product')) return true;
  if (pathname.startsWith('/category')) return true;
  if (pathname.startsWith('/search')) return true;
  if (pathname.startsWith('/account')) return true;
  if (pathname.startsWith('/cart') || pathname.startsWith('/checkout')) return true;
  return false;
}

// ─── Chat Modal Component ───
export default function ChatBotWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([createInitialMessage()]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [bubbleHidden, setBubbleHidden] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [endChatConfirm, setEndChatConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noMatchCount = useRef(0);
  const waitingForProductSearch = useRef(false);
  const productSearchRetryCount = useRef(0);

  // Check if chatbot should be visible on this page
  const isAllowedPage = shouldShowChatBot(pathname);

  const hasConversation = messages.length > 1;
  const showInitialChips = messages.length <= 1;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Rotate placeholder every 4s
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx(prev => (prev + 1) % ROTATING_PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isMinimized]);

  const handleOpen = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
      setIsOpen(true);
    } else {
      setIsOpen(true);
    }
  }, [isMinimized]);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(true);
  }, []);

  const resetChat = useCallback(() => {
    setEndChatConfirm(false);
    setIsOpen(false);
    setIsMinimized(false);
    setMessages([createInitialMessage()]);
    setInput('');
    noMatchCount.current = 0;
    productSearchRetryCount.current = 0;
  }, []);

  const handleEndChat = useCallback(() => {
    if (hasConversation) {
      setEndChatConfirm(true);
      return;
    }
    resetChat();
  }, [hasConversation, resetChat]);

  const handleProductSearch = useCallback(async (rawQuery: string) => {
    // Strip punctuation, noise words, bot name and normalize at the entry point
    const query = rawQuery
      .replace(/[?!.,;:()\[\]{}'"\u2026\u201e\u201d\u201c\u2018\u2019`~@#$%^&*+=<>|\\/]/g, '')
      .replace(/wubu[sś]/gi, '')
      .replace(/powiedz\s*(mi)?/gi, '')
      .replace(/czy/gi, '')
      .replace(/jakieś|jakies|jakiś|jakis|jakiegos|jakie|jaki|jakąś|jakas/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length >= 2 && !POLISH_STOP_WORDS.has(w.toLowerCase()))
      .join(' ')
      .trim();

    if (!query) {
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    scrollToEnd();

    // displayQuery = same as cleaned query (already clean)
    const displayQuery = query;

    try {
      // Generate smart search variants from user query
      const variants = generateSearchVariants(query);
      let products: any[] = [];
      let usedQuery = variants[0];

      // Try each variant until we find RELEVANT results
      for (const variant of variants) {
        const result = await searchApi.search(variant, { limit: 20 } as any);
        const allFound = ((result as any).products || []);
        // Filter only products whose name actually matches the search query
        const relevant = filterRelevantProducts(allFound, query);
        const topRelevant = relevant
          .sort((a: any, b: any) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
          .slice(0, 3);
        if (topRelevant.length > 0) {
          products = topRelevant;
          usedQuery = variant;
          break;
        }
      }

      if (products.length === 0) {
        productSearchRetryCount.current += 1;
        if (productSearchRetryCount.current < 2) {
          waitingForProductSearch.current = true;
          const retryMsg: Message = {
            id: (Date.now() + 1).toString(),
            text: `Niestety, nie mamy w ofercie produktów pasujących do "${displayQuery}" 😔\n\nMożliwe, że tego typu produkty nie są dostępne w naszym sklepie. Spróbuj wpisać inną frazę — np. nazwę kategorii lub markę produktu.`,
            isBot: true,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, retryMsg]);
        } else {
          productSearchRetryCount.current = 0;
          const noResultMsg: Message = {
            id: (Date.now() + 1).toString(),
            text: `Niestety, tego produktu nie mamy w naszej ofercie 😔\n\nSkorzystaj z wyszukiwarki na górze strony lub przejrzyj nasze kategorie — może znajdziesz coś ciekawego! 🛍️`,
            isBot: true,
            timestamp: new Date(),
            showSuggestions: true,
          };
          setMessages(prev => [...prev, noResultMsg]);
        }
      } else {
        productSearchRetryCount.current = 0;
        const productResults: ProductResult[] = products.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          rating: p.rating,
          reviewCount: p.reviewCount,
          imageUrl: p.images?.[0]?.url,
        }));

        const resultMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: `Oto ${products.length} najlepiej oceniane produkty dla "${displayQuery}" ⭐`,
          isBot: true,
          timestamp: new Date(),
          products: productResults,
        };
        setMessages(prev => [...prev, resultMsg]);

        setTimeout(() => {
          setIsTyping(true);
          scrollToEnd();
          setTimeout(() => {
            const followupMsg: Message = {
              id: (Date.now() + 2).toString(),
              text: 'Kliknij w produkt, żeby zobaczyć szczegóły! 😊 Mogę też wyszukać coś innego — wystarczy napisać!',
              isBot: true,
              timestamp: new Date(),
              showSuggestions: true,
            };
            setMessages(prev => [...prev, followupMsg]);
            setIsTyping(false);
            scrollToEnd();
          }, 500);
        }, 800);
      }
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Ups, coś poszło nie tak przy wyszukiwaniu 😅 Spróbuj ponownie za chwilę!',
        isBot: true,
        timestamp: new Date(),
        showSuggestions: true,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
      scrollToEnd();
    }
  }, [scrollToEnd]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    scrollToEnd();

    if (waitingForProductSearch.current) {
      waitingForProductSearch.current = false;
      // Normalize the product query from free-text input
      const cleanedProductQuery = text.trim().toLowerCase()
        .replace(/[?!.,;:()\[\]{}'"]/g, '')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !POLISH_STOP_WORDS.has(w))
        .join(' ') || text.trim();
      handleProductSearch(cleanedProductQuery);
      return;
    }

    const lowerText = text.trim().toLowerCase();
    const hasKeywordIntent = PRODUCT_SEARCH_KEYWORDS.some(kw => lowerText.includes(kw));
    const hasPatternIntent = PRODUCT_INTENT_PATTERNS.some(rx => rx.test(lowerText));
    const isProductSearchIntent = hasKeywordIntent || hasPatternIntent ||
      lowerText === '🔍 szukasz produktu?' || lowerText === 'szukasz produktu?';

    if (isProductSearchIntent) {
      const isQuickQuestionTap = lowerText === '🔍 szukasz produktu?' ||
        lowerText === 'szukasz produktu?' || lowerText === 'szukasz produktu';

      // Strip intent keywords + noise words to extract actual product query
      let searchQuery = lowerText;
      const sortedKeywords = [...PRODUCT_SEARCH_KEYWORDS].sort((a, b) => b.length - a.length);
      for (const kw of sortedKeywords) {
        searchQuery = searchQuery.replace(kw, '').trim();
      }
      // Strip bot name, filler and punctuation
      searchQuery = searchQuery
        .replace(/wubu[sś]/gi, '')
        .replace(/powiedz\s*(mi)?/gi, '')
        .replace(/czy/gi, '')
        .replace(/jakieś|jakies|jakiś|jakis|jakiegos|jakie|jaki|jakąś|jakas/gi, '')
        .replace(/[?!.,🔍]/g, '')
        .trim();
      // Final stop-word pass
      searchQuery = searchQuery.split(/\s+/)
        .filter(w => w.length >= 2 && !POLISH_STOP_WORDS.has(w))
        .join(' ')
        .trim();

      if (!isQuickQuestionTap && searchQuery.length >= 2) {
        handleProductSearch(searchQuery);
        return;
      } else {
        setTimeout(() => {
          waitingForProductSearch.current = true;
          productSearchRetryCount.current = 0;
          const askMsg: Message = {
            id: (Date.now() + 1).toString(),
            text: 'Jasne! 🔍 Napisz czego szukasz, a znajdę dla Ciebie 3 najlepiej oceniane produkty!\n\nNp. "głośnik bluetooth", "frytkownica", "kamera" itp.',
            isBot: true,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, askMsg]);
          setIsTyping(false);
          scrollToEnd();
        }, 600);
        return;
      }
    }

    setTimeout(() => {
      const faqResult = findBestAnswer(text);
      let botMsg: Message;

      // Smart fallback: if FAQ score is low and query has product-like words,
      // try product search instead of showing a weak FAQ answer
      if (faqResult && faqResult.score < 15) {
        const potentialProductWords = text.toLowerCase().split(/\s+/)
          .filter(w => w.length >= 4 && !POLISH_STOP_WORDS.has(w) && !FAQ_TOPIC_WORDS.has(w))
          .filter(w => !['może', 'moze', 'jakieś', 'jakies', 'jakie', 'tutaj', 'gdzie', 'macie', 'powiedz', 'wubuś', 'wubus'].includes(w));
        if (potentialProductWords.length > 0) {
          // Likely a product search, not a FAQ question
          const productQuery = potentialProductWords.join(' ');
          handleProductSearch(productQuery);
          return;
        }
      }

      if (faqResult) {
        noMatchCount.current = 0;
        botMsg = {
          id: (Date.now() + 1).toString(),
          text: faqResult.answer,
          isBot: true,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, botMsg]);
        setIsTyping(false);
        scrollToEnd();

        setTimeout(() => {
          setIsTyping(true);
          scrollToEnd();
          setTimeout(() => {
            const followup = FOLLOWUP_MESSAGES[Math.floor(Math.random() * FOLLOWUP_MESSAGES.length)];
            const followupMsg: Message = {
              id: (Date.now() + 2).toString(),
              text: followup,
              isBot: true,
              timestamp: new Date(),
              showSuggestions: true,
            };
            setMessages(prev => [...prev, followupMsg]);
            setIsTyping(false);
            scrollToEnd();
          }, 600 + Math.random() * 400);
        }, 1200);
        return;
      } else {
        // No FAQ match — try product search as last resort if query has product-like words
        const lastResortWords = text.toLowerCase().split(/\s+/)
          .filter(w => w.length >= 4 && !POLISH_STOP_WORDS.has(w) && !FAQ_TOPIC_WORDS.has(w))
          .filter(w => !['może', 'moze', 'jakieś', 'jakies', 'jakie', 'tutaj', 'gdzie', 'macie', 'powiedz', 'wubuś', 'wubus', 'hejka', 'siema', 'witam', 'witaj', 'cześć', 'czesc'].includes(w));
        if (lastResortWords.length > 0) {
          handleProductSearch(lastResortWords.join(' '));
          return;
        }

        noMatchCount.current += 1;

        if (noMatchCount.current === 1) {
          botMsg = {
            id: (Date.now() + 1).toString(),
            text: 'Hmm, nie jestem pewien odpowiedzi na to pytanie. 🤔\n\nSpróbuj zapytać inaczej lub wyślij wiadomość e-mail do naszego centrum pomocy — odpowiemy w ciągu 24h!',
            isBot: true,
            timestamp: new Date(),
            actions: [{
              label: 'Wyślij e-mail do pomocy',
              icon: 'envelope',
              type: 'email',
              payload: 'support@wb-partners.pl',
              subject: `Pytanie ze strony: ${text.trim().substring(0, 80)}`,
              body: `Cześć,\n\nMam pytanie:\n\n${text.trim()}\n\nProszę o pomoc.\n\nPozdrawiam`,
            }],
          };
        } else {
          botMsg = {
            id: (Date.now() + 1).toString(),
            text: 'Niestety, to pytanie wykracza poza moje możliwości. 😅\n\nZalecam skontaktować się bezpośrednio z naszym zespołem wsparcia!',
            isBot: true,
            timestamp: new Date(),
            actions: [{
              label: '📧 Napisz do centrum pomocy',
              icon: 'envelope',
              type: 'email',
              payload: 'support@wb-partners.pl',
              subject: 'Pytanie ze strony WBTrade',
              body: `Cześć,\n\nMam pytanie, z którym bot nie mógł mi pomóc:\n\n${text.trim()}\n\nProszę o odpowiedź.\n\nPozdrawiam`,
            }],
          };
        }
      }

      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
      scrollToEnd();
    }, 800 + Math.random() * 600);
  }, [scrollToEnd, handleProductSearch]);

  const handleAction = useCallback((action: MessageAction) => {
    if (action.type === 'email') {
      const subject = encodeURIComponent(action.subject || 'Pytanie ze strony WBTrade');
      const body = encodeURIComponent(action.body || '');
      window.open(`mailto:${action.payload}?subject=${subject}&body=${body}`, '_blank');
    } else if (action.type === 'link') {
      window.open(action.payload, '_blank');
    }
  }, []);

  const getAvailableSuggestions = useCallback(() => {
    const askedTexts = new Set(
      messages.filter(m => !m.isBot).map(m => m.text.toLowerCase().trim()),
    );
    return QUICK_QUESTIONS.filter(
      q => q === '🔍 Szukasz produktu?' || !askedTexts.has(q.toLowerCase()),
    ).slice(0, 6);
  }, [messages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isOpen) return;
      // The confirmation sits on top of the window, so it swallows the first Escape.
      if (endChatConfirm) {
        setEndChatConfirm(false);
        return;
      }
      handleMinimize();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, endChatConfirm, handleMinimize]);

  // Smart-hide chatbot on scroll - only on mobile viewport (< 768px)
  // Hide after 0.6s continuous scrolling down, only restore by clicking
  useEffect(() => {
    let scrollDownTimer: ReturnType<typeof setTimeout> | null = null;
    let lastScrollY = window.scrollY;
    let scrollingDown = false;

    const clearTimer = () => {
      if (scrollDownTimer) {
        clearTimeout(scrollDownTimer);
        scrollDownTimer = null;
      }
      scrollingDown = false;
    };

    const onScroll = () => {
      // Desktop viewport — never hide the bubble
      if (window.innerWidth >= 768) {
        clearTimer();
        return;
      }

      const y = window.scrollY;
      const delta = y - lastScrollY;
      lastScrollY = y;

      if (delta > 0) {
        // Scrolling down — start timer if not already running
        if (!scrollingDown) {
          scrollingDown = true;
          scrollDownTimer = setTimeout(() => {
            setBubbleHidden(true);
            scrollingDown = false;
          }, 600);
        }
      } else if (delta < 0) {
        // Scrolling up — cancel any pending hide
        clearTimer();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimer();
    };
  }, []);

  // Hide chatbot on disallowed pages (must be after all hooks!)
  if (!isAllowedPage && !isOpen) return null;

  return (
    <>
      {/* Floating Bubble */}
      {!isOpen && (
        <div
          className={`fixed bottom-6 right-0 z-50 transition-all duration-700 ease-in-out print:hidden ${
            bubbleHidden
              ? 'translate-x-[calc(100%-20px)] rotate-90'
              : 'translate-x-[-24px] rotate-0'
          }`}
          style={{ zIndex: 9999, transformOrigin: 'center center' }}
        >
          <div
            onClick={() => {
              if (bubbleHidden) {
                setBubbleHidden(false);
              } else {
                handleOpen();
              }
            }}
            className={`cursor-pointer ${
              bubbleHidden ? 'p-3 -ml-4' : ''
            }`}
          >
            <ChatBubble
              onClick={() => {
                if (bubbleHidden) {
                  setBubbleHidden(false);
                } else {
                  handleOpen();
                }
              }}
              hasActiveChat={isMinimized && hasConversation}
            />
          </div>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-3rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-slide-up print:hidden"
          style={{ zIndex: 9999 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center overflow-hidden">
                <Image src={WB_LOGO} alt="WuBuś" width={28} height={28} className="object-contain" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{BOT_NAME}</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMinimize}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Minimalizuj"
              >
                <MinusIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
              <button
                onClick={handleEndChat}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                aria-label="Zamknij czat"
              >
                <XIcon className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onAction={handleAction}
                onQuickQuestion={sendMessage}
                availableSuggestions={msg.showSuggestions ? getAvailableSuggestions() : []}
              />
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center overflow-hidden shrink-0">
                  <Image src={WB_LOGO} alt="" width={18} height={18} className="object-contain" />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* Initial chips */}
            {showInitialChips && (
              <div className="pl-9 pt-1">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2">Popularne pytania:</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_QUESTIONS.slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ROTATING_PLACEHOLDERS[placeholderIdx]}
              className="flex-1 px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-full border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 bg-orange-500 hover:bg-orange-600 text-white disabled:cursor-not-allowed"
              aria-label="Wyślij"
            >
              <SendIcon className="w-4 h-4" />
            </button>
          </div>

          {/* End-chat confirmation, kept inside the widget so it matches the chat design */}
          {endChatConfirm && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center p-5 bg-gray-900/50 dark:bg-black/60 backdrop-blur-[2px] animate-fade-in"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wubus-end-chat-title"
              onClick={() => setEndChatConfirm(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <div className="px-5 pt-5 pb-4 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center overflow-hidden">
                    <Image src={WB_LOGO} alt="" width={34} height={34} className="object-contain" />
                  </div>
                  <h3 id="wubus-end-chat-title" className="text-base font-bold text-gray-900 dark:text-white">
                    Zakończyć rozmowę?
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Historia tej rozmowy zostanie usunięta i nie da się jej odzyskać.
                    Jeśli chcesz wrócić do niej później, zminimalizuj okno zamiast zamykać.
                  </p>
                </div>

                <div className="flex gap-2 px-5 pb-5">
                  <button
                    onClick={() => setEndChatConfirm(false)}
                    autoFocus
                    className="flex-1 py-2.5 rounded-full text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800"
                  >
                    Anuluj
                  </button>
                  <button
                    onClick={resetChat}
                    className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800"
                  >
                    Zakończ
                  </button>
                </div>

                <button
                  onClick={() => { setEndChatConfirm(false); handleMinimize(); }}
                  className="w-full py-2.5 text-xs font-semibold text-orange-500 hover:text-orange-600 border-t border-gray-100 dark:border-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400"
                >
                  Zminimalizuj i zachowaj rozmowę
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Message Bubble Sub-Component ───
function MessageBubble({
  message,
  onAction,
  onQuickQuestion,
  availableSuggestions,
}: {
  message: Message;
  onAction: (action: MessageAction) => void;
  onQuickQuestion: (q: string) => void;
  availableSuggestions: string[];
}) {
  if (message.isBot) {
    return (
      <>
        <div className="flex items-end gap-2">
          <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center overflow-hidden shrink-0">
            <Image src={WB_LOGO} alt="" width={18} height={18} className="object-contain" />
          </div>
          <div className="max-w-[72%] bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            {message.id !== '0' && (
              <p className="text-[11px] font-bold text-orange-500 dark:text-orange-400 mb-0.5 tracking-wide">{BOT_NAME}</p>
            )}
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">{message.text}</p>

            {/* Product results */}
            {message.products && message.products.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {message.products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-14 h-14 rounded-lg object-contain bg-white dark:bg-gray-800"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                        📷
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight">{product.name}</p>
                      <p className="text-sm font-bold text-orange-500 dark:text-orange-400 mt-0.5">{Number(product.price).toFixed(2)} zł</p>
                      {product.rating && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <StarIcon className="w-3 h-3 text-amber-400" />
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {Number(product.rating).toFixed(1)}{product.reviewCount ? ` (${product.reviewCount})` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    <ChevronRightIcon className="w-3 h-3 text-gray-400 group-hover:text-orange-500 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {/* Action buttons */}
            {message.actions && message.actions.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {message.actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAction(action)}
                    className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    {action.icon === 'phone' ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 512 512" width="14" height="14"><path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/></svg>
                    ) : (
                      <EnvelopeIcon className="w-3.5 h-3.5" />
                    )}
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-right">{formatTimestamp(message.timestamp)}</p>
          </div>
        </div>

        {/* Inline suggestions */}
        {availableSuggestions.length > 0 && (
          <div className="pl-9 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {availableSuggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => onQuickQuestion(q)}
                  className="px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // User message
  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] bg-orange-500 rounded-2xl rounded-br-sm px-3.5 py-2.5">
        <p className="text-sm text-white leading-relaxed">{message.text}</p>
        <p className="text-[10px] text-orange-200 mt-1 text-right">{formatTimestamp(message.timestamp)}</p>
      </div>
    </div>
  );
}
