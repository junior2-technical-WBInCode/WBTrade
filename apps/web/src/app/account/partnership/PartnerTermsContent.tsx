'use client';

/**
 * Full text of "Warunki Współpracy — Program Partnerski WB Trade".
 * Rendered inside a scrollable modal on the partnership registration page so
 * that we can require the user to scroll to the very end before allowing
 * them to check the "acceptedTerms" confirmation checkbox.
 *
 * Keep this in sync with:
 *   scripts/generate_partner_terms_pdf.py
 *   apps/web/public/documents/warunki-wspolpracy-programu-partnerskiego.pdf
 */

function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-2">{children}</h3>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-4 mb-1">{children}</h4>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">{children}</p>;
}

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2 space-y-1">{children}</ol>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2 space-y-1">{children}</ul>;
}

function MiniTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-sm border border-gray-200 dark:border-secondary-700 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-900 dark:bg-secondary-900 text-white">
            {head.map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 1 ? 'bg-gray-50 dark:bg-secondary-800/60' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-secondary-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PartnerTermsContent() {
  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Warunki Współpracy</h2>
        <p className="text-sm text-orange-600 dark:text-orange-400">Program Partnerski WB Trade</p>
        <p className="text-xs text-gray-400 mt-1">Data ostatniej aktualizacji: 2026-07-09</p>
      </div>

      <H2>1. Postanowienia ogólne</H2>
      <Ol>
        <li>
          Organizatorem programu <strong>WB Trade Partners</strong> jest: <strong>WB Partners Sp. z o.o.</strong>, ul. Juliusza
          Słowackiego 24/11, 35-060 Rzeszów, NIP: 5170455185, REGON: 540735769, KRS: 0001151642.
        </li>
        <li>
          Program WB Trade Partners jest programem partnerskim skierowanym głównie do osób fizycznych, umożliwiającym
          osiąganie wynagrodzenia z tytułu: sprzedaży własnej, budowy zespołu oraz rozwoju liderów w strukturze.
        </li>
        <li>Program działa w oparciu o zasady określone w niniejszym regulaminie oraz bieżące warunki opublikowane przez Organizatora.</li>
        <li>Kontakt programu: agencja@wb-horizon.pl • 570 038 828</li>
      </Ol>

      <H2>2. Definicje</H2>
      <P><strong>Program</strong> — Program partnerski WB Trade Partners.</P>
      <P><strong>Partner</strong> — Osoba uczestnicząca w programie, posiadająca dostęp do własnego konta i linku partnerskiego.</P>
      <P><strong>Sprzedaż własna</strong> — Sprzedaż zrealizowana z wykorzystaniem własnego linku partnerskiego partnera.</P>
      <P><strong>Struktura</strong> — Układ partnerów rozwijający się pod danym partnerem.</P>
      <P><strong>Poziom struktury</strong> — Pozycja danej osoby w dół struktury względem konkretnego partnera.</P>
      <P><strong>Poziom programu / poziom kariery</strong> — Status partnera w programie, określający jego zakres uprawnień, poziom prowizji zespołowych i premii liderów.</P>
      <P><strong>Linia</strong> — Osoba bezpośrednio zaproszona przez partnera oraz cała struktura rozwijająca się pod tą osobą.</P>
      <P><strong>WL (Wolumen Linii)</strong> — Obrót wygenerowany przez daną linię zgodnie z zasadami programu.</P>
      <P><strong>Premia Liderów</strong> — Dodatkowe wynagrodzenie przypisane do poziomu programu partnera, związane z rozwojem liderów w strukturze.</P>
      <P><strong>Saldo partnerskie</strong> — Łączne saldo środków partnera, obejmujące prowizje, premie i dodatki, widoczne w panelu rozliczeń.</P>

      <H2>3. Zakres programu</H2>
      <Ol>
        <li>Program WB Trade Partners opiera się na trzech ścieżkach rozwoju: sprzedaży własnej, rozwoju struktury oraz rozwoju liderów.</li>
        <li>Partner może rozwijać się w programie poprzez: generowanie sprzedaży własnej, budowanie aktywnej struktury, realizację warunków awansowych, osiąganie i potwierdzanie kolejnych poziomów.</li>
        <li>Program przewiduje 7 poziomów rozwoju.</li>
      </Ol>

      <H2>4. Prowizje podstawowe</H2>
      <P>Partnerowi przysługuje wynagrodzenie w następujących wysokościach:</P>
      <MiniTable
        head={['Źródło wynagrodzenia', 'Stawka']}
        rows={[
          ['Sprzedaż własna z własnego linku partnerskiego', '7%'],
          ['1. poziom zespołu', '2%'],
          ['2. poziom zespołu', '1,5%'],
          ['3. poziom zespołu', '1%'],
          ['4. poziom zespołu', '0,5%'],
        ]}
      />

      <H2>5. Poziomy programu</H2>
      <P>
        Program składa się z 7 poziomów kariery, które Partner osiąga poprzez realizację warunków awansowych określonych
        w sekcji 10. Poziom kariery determinuje zakres uprawnień Partnera w zakresie prowizji zespołowych oraz premii
        liderów. Wyższy poziom oznacza dostęp do prowizji z większej liczby poziomów struktury oraz wyższe stawki Premii
        Liderów.
      </P>
      <MiniTable
        head={['Poziom', 'Sprzedaż własna', 'Zakres zespołu', 'Premia Liderów']}
        rows={[
          ['Poziom 1', '7%', '1 poziom', '—'],
          ['Poziom 2', '7%', '1–2 poziom', '—'],
          ['Poziom 3', '7%', '1–3 poziom', '0,25–0,50%'],
          ['Poziom 4', '7%', '1–4 poziom', '0,50–0,75%'],
          ['Poziom 5', '7%', '1–4 poziom', '0,75–1,00%'],
          ['Poziom 6', '7%', '1–4 poziom', '1,00–1,25%'],
          ['Poziom 7', '7%', '1–4 poziom', '1,25–1,50%'],
        ]}
      />
      <H3>Zasada zakresu zespołu</H3>
      <P>Poziom programu określa, z ilu poziomów struktury partner może pobierać prowizję zespołową:</P>
      <Ul>
        <li>Poziom 1 — 1 poziom w dół</li>
        <li>Poziom 2 — 2 poziomy w dół</li>
        <li>Poziom 3 — 3 poziomy w dół</li>
        <li>Poziomy 4–7 — 4 poziomy w dół</li>
      </Ul>

      <H2>6. Premia Liderów</H2>
      <Ol>
        <li>Premia Liderów jest dodatkowym wynagrodzeniem przypisanym do poziomu programu partnera.</li>
        <li>Premia Liderów przysługuje od Poziomu 3.</li>
        <li>Premia Liderów może być naliczana głębiej niż prowizja zespołowa, zgodnie z zasadami programu.</li>
      </Ol>
      <MiniTable
        head={['Poziom', 'Premia bazowa', 'Dodatek WL', 'Maksymalnie']}
        rows={[
          ['Poziom 3', '0,25%', '+0,25%', '0,50%'],
          ['Poziom 4', '0,50%', '+0,25%', '0,75%'],
          ['Poziom 5', '0,75%', '+0,25%', '1,00%'],
          ['Poziom 6', '1,00%', '+0,25%', '1,25%'],
          ['Poziom 7', '1,25%', '+0,25%', '1,50%'],
        ]}
      />
      <P>Premia bazowa wynika z osiągniętego poziomu programu. Dodatek WL przysługuje wyłącznie po spełnieniu warunku wolumenu linii. Jeżeli linia nie spełnia warunku WL, partner zachowuje wyłącznie premię bazową.</P>

      <H2>7. WL — Wolumen Linii</H2>
      <P>
        Wolumen Linii (WL) określa miesięczny obrót kwalifikacyjny wygenerowany przez daną linię. Spełnienie warunku WL
        aktywuje dodatek do Premii Liderów w wysokości +0,25% dla kwalifikujących się Partnerów. Obrót jest liczony
        wyłącznie zgodnie z zasadami określonymi w sekcji 13.
      </P>
      <MiniTable
        head={['Skrót', 'Znaczenie']}
        rows={[
          ['WL10', 'linia z obrotem min. 10 000 zł / mies.'],
          ['WL25', 'linia z obrotem min. 25 000 zł / mies.'],
          ['WL50', 'linia z obrotem min. 50 000 zł / mies.'],
          ['WL100', 'linia z obrotem min. 100 000 zł / mies.'],
          ['WL250', 'linia z obrotem min. 250 000 zł / mies.'],
          ['WL500', 'linia z obrotem min. 500 000 zł / mies.'],
          ['WL1000', 'linia z obrotem min. 1 000 000 zł / mies.'],
        ]}
      />
      <H3>WL dla pełnej Premii Liderów</H3>
      <MiniTable
        head={['Poziom', 'Premia bazowa', 'Pełna premia', 'Warunek WL']}
        rows={[
          ['Poziom 3', '0,25%', '0,50%', 'WL25'],
          ['Poziom 4', '0,50%', '0,75%', 'WL50'],
          ['Poziom 5', '0,75%', '1,00%', 'WL100'],
          ['Poziom 6', '1,00%', '1,25%', 'WL250'],
          ['Poziom 7', '1,25%', '1,50%', 'WL500'],
        ]}
      />

      <H2>8. Podział tej samej premii w jednej linii</H2>
      <Ol>
        <li>Jeżeli w jednej linii występuje kilka osób z tym samym poziomem programu, przypisana pula tej samej premii nie mnoży się.</li>
        <li>Pula dzieli się w następujący sposób:</li>
      </Ol>
      <MiniTable
        head={['Pozycja osoby z tym samym poziomem w jednej linii', 'Udział']}
        rows={[
          ['Najbliższa osoba', '60%'],
          ['Druga osoba wyżej', '30%'],
          ['Trzecia osoba wyżej', '10%'],
        ]}
      />
      <P>Dodatek WL +0,25% dzieli się wyłącznie między osoby z tym samym poziomem, których linia spełnia wymagany warunek WL.</P>

      <H2>9. Łączenie prowizji zespołowej i Premii Liderów</H2>
      <P>
        Premia Liderów jest naliczana równolegle z prowizją zespołową z tytułu tej samej transakcji w strukturze.
        Łączna stawka wynagrodzenia zależy od poziomu kariery Partnera oraz odległości miejsca sprzedaży w strukturze.
        Premia Liderów może być naliczana również głębiej niż obowiązujący zakres prowizji zespołowej.
      </P>
      <H3>Przykład — Poziom 3</H3>
      <MiniTable
        head={['Miejsce sprzedaży', 'Prowizja zesp.', 'Premia Liderów', 'Razem']}
        rows={[
          ['1. poziom', '2%', '0,25–0,50%', '2,25–2,50%'],
          ['2. poziom', '1,5%', '0,25–0,50%', '1,75–2,00%'],
          ['3. poziom', '1%', '0,25–0,50%', '1,25–1,50%'],
          ['Głębiej niż 3. poziom', '—', '0,25–0,50%', '0,25–0,50%'],
        ]}
      />
      <H3>Przykład — Poziom 7</H3>
      <MiniTable
        head={['Miejsce sprzedaży', 'Prowizja zesp.', 'Premia Liderów', 'Razem']}
        rows={[
          ['1. poziom', '2%', '1,25–1,50%', '3,25–3,50%'],
          ['2. poziom', '1,5%', '1,25–1,50%', '2,75–3,00%'],
          ['3. poziom', '1%', '1,25–1,50%', '2,25–2,50%'],
          ['4. poziom', '0,5%', '1,25–1,50%', '1,75–2,00%'],
          ['Głębiej niż 4. poziom', '—', '1,25–1,50%', '1,25–1,50%'],
        ]}
      />

      <H2>10. Warunki awansu</H2>
      <P>
        Awans na wyższy poziom następuje po spełnieniu jednej z trzech ścieżek awansowych w danym miesiącu
        rozliczeniowym: sprzedaży własnej, modelu łączonego lub rozwoju struktury. Wszystkie warunki dotyczą obrotu
        kwalifikacyjnego zgodnie z zasadami określonymi w sekcji 13. Dodatkowe ograniczenia udziału jednej linii określa
        sekcja 11.
      </P>
      <H3>Poziom 1 → Poziom 2</H3>
      <Ul>
        <li>Sprzedaż własna: 20 000 zł / mies.</li>
        <li>Model łączony: 8 000 zł własnej sprzedaży + 30 000 zł z 1. poziomu</li>
        <li>Struktura: 60 000 zł z 1. poziomu + min. 3 linie WL10</li>
      </Ul>
      <H3>Poziom 2 → Poziom 3</H3>
      <Ul>
        <li>Sprzedaż własna: 50 000 zł / mies.</li>
        <li>Model łączony: 20 000 zł własnej sprzedaży + 80 000 zł z 1–2 poziomu</li>
        <li>Struktura: 150 000 zł z 1–2 poz. + min. 4 linie WL25 + min. 1 osoba na Poz. 2 w osobnej linii</li>
      </Ul>
      <H3>Poziom 3 → Poziom 4</H3>
      <Ul>
        <li>Sprzedaż własna: 120 000 zł / mies.</li>
        <li>Model łączony: 40 000 zł własnej sprzedaży + 250 000 zł obrotu struktury</li>
        <li>Struktura: 600 000 zł obrotu struktury + min. 5 linii WL50 + min. 2 osoby na Poz. 3 w osobnych liniach</li>
      </Ul>
      <H3>Poziom 4 → Poziom 5</H3>
      <Ul>
        <li>Sprzedaż własna: 250 000 zł / mies.</li>
        <li>Model łączony: 75 000 zł własnej sprzedaży + 750 000 zł obrotu struktury</li>
        <li>Struktura: 1 500 000 zł obrotu struktury + min. 6 linii WL100 + min. 2 osoby na Poz. 4 w osobnych liniach</li>
      </Ul>
      <H3>Poziom 5 → Poziom 6</H3>
      <Ul>
        <li>Sprzedaż własna: 500 000 zł / mies.</li>
        <li>Model łączony: 150 000 zł własnej sprzedaży + 1 500 000 zł obrotu struktury</li>
        <li>Struktura: 2 750 000 zł obrotu struktury + min. 7 linii WL250 + min. 2 osoby na Poz. 5 w osobnych liniach</li>
      </Ul>
      <H3>Poziom 6 → Poziom 7</H3>
      <Ul>
        <li>Sprzedaż własna: 1 000 000 zł / mies.</li>
        <li>Model łączony: 250 000 zł własnej sprzedaży + 2 500 000 zł obrotu struktury</li>
        <li>Struktura: 4 000 000 zł obrotu struktury + min. 8 linii WL250 + min. 2 os. na Poz. 6 lub 4 os. na Poz. 5 w osobnych liniach</li>
      </Ul>

      <H2>11. Maksymalny udział jednej linii przy awansie</H2>
      <P>
        W celu zapewnienia stabilności i rzeczywistego zróżnicowania struktury, przy ocenie warunków awansu obowiązuje
        limit udziału pojedynczej linii w łącznym obrocie kwalifikacyjnym. Przekroczenie limitu oznacza, że nadwyżkowy
        obrót z danej linii nie jest uwzględniany przy awansie.
      </P>
      <MiniTable
        head={['Awans na poziom', 'Maksymalny udział jednej linii']}
        rows={[
          ['Poziom 2', '60%'],
          ['Poziom 3', '50%'],
          ['Poziom 4', '45%'],
          ['Poziom 5', '35%'],
          ['Poziom 6', '30%'],
          ['Poziom 7', '25%'],
        ]}
      />

      <H2>12. Potwierdzanie i utrwalanie poziomu</H2>
      <Ol>
        <li>Awans jest miesięczny.</li>
        <li>Po spełnieniu warunków partner przechodzi na kolejny poziom.</li>
        <li>W kolejnym okresie partner potwierdza wynik — poziom zostaje potwierdzony po raz pierwszy.</li>
        <li>Po dwukrotnym potwierdzeniu poziom zostaje utrwalony.</li>
        <li>Po utrwaleniu poziom staje się minimalnym poziomem stałym — partner zachowuje go niezależnie od wyników w kolejnych miesiącach.</li>
        <li>Partner może awansować dalej.</li>
        <li>Partner nie spada poniżej utrwalonego poziomu.</li>
        <li>Dodatki WL zależą od bieżących wyników linii.</li>
        <li>Bieżące rozliczenia pozostają zależne od realnego obrotu miesiąca.</li>
      </Ol>

      <H2>13. Zasady obrotu kwalifikacyjnego</H2>
      <P>
        Do prowizji, WL, premii i awansów liczy się wyłącznie obrót: opłacony, dostarczony, niezwrócony, z produktów
        objętych programem (bez kosztów dostawy). Zasada ta dotyczy sprzedaży własnej, obrotu zespołu, obrotu struktury,
        WL oraz warunków awansu.
      </P>

      <H2>14. Saldo partnerskie</H2>
      <Ol>
        <li>Wszystkie prowizje, premie i dodatki trafiają do jednego salda partnerskiego.</li>
        <li>Szczegóły rozliczeń są widoczne w panelu rozliczeń partnera.</li>
        <li>Saldo partnerskie może być: wykorzystane na zakupy na stronie albo zlecone do wypłaty.</li>
      </Ol>

      <H2>15. Zasady blokady i odblokowania prowizji</H2>
      <P>
        Naliczone prowizje podlegają tymczasowej blokadzie do czasu weryfikacji prawidłowości realizacji zamówienia.
        Odblokowanie prowizji następuje automatycznie po upływie ustawowego okresu reklamacyjnego, o ile zamówienie nie
        zostało zwrócone ani anulowane.
      </P>
      <MiniTable
        head={['Etap zamówienia', 'Status prowizji']}
        rows={[
          ['Zamówienie opłacone', 'prowizja oczekująca'],
          ['Zamówienie dostarczone', 'prowizja nadal zablokowana'],
          ['14 dni od dostawy bez zwrotu', 'prowizja dostępna'],
          ['Zwrot lub anulowanie', 'prowizja anulowana lub korygowana'],
        ]}
      />

      <H2>16. Zlecenie wypłaty</H2>
      <Ol>
        <li>Partner może zlecić wypłatę środków po ich odblokowaniu.</li>
        <li>Minimalna kwota zlecenia wypłaty wynosi 10 zł.</li>
        <li>Po zleceniu wypłata następuje w terminie do 2 dni roboczych.</li>
        <li>Organizator zastrzega możliwość weryfikacji poprawności naliczeń przed realizacją wypłaty.</li>
      </Ol>

      <H2>17. Reklamacje i spory rozliczeniowe</H2>
      <Ol>
        <li>Partner ma prawo zgłosić zastrzeżenia dotyczące: naliczenia prowizji, statusu prowizji, awansu, przypisania WL, podziału premii w strukturze.</li>
        <li>Zgłoszenie należy przekazać na adres: agencja@wb-horizon.pl</li>
        <li>W zgłoszeniu partner powinien podać: dane identyfikacyjne, opis sprawy, numer zamówienia lub okres rozliczeniowy.</li>
        <li>Organizator analizuje zgłoszenie i udziela odpowiedzi w rozsądnym terminie operacyjnym.</li>
        <li>W przypadku sporu interpretacyjnego wiążąca jest aktualna wersja programu oraz dane systemowe Organizatora.</li>
      </Ol>

      <H2>18. Zmiany programu</H2>
      <Ol>
        <li>Organizator zastrzega sobie prawo do aktualizacji zasad programu, poziomów, warunków awansu, modelu rozliczeń, zasad WL oraz zasad wypłat i salda.</li>
        <li>Aktualna wersja zasad programu powinna być publikowana i komunikowana w sposób przyjęty przez Organizatora.</li>
        <li>Zmiany nie naruszają praw nabytych partnera wynikających z już prawidłowo naliczonych i odblokowanych środków, chyba że korekta wynika ze zwrotu, anulowania zamówienia lub błędu systemowego.</li>
      </Ol>

      <H2>19. Postanowienia końcowe</H2>
      <Ol>
        <li>Niniejszy dokument stanowi podstawowy regulamin programu WB Trade Partners.</li>
        <li>Partner uczestniczący w programie akceptuje zasady wynikające z niniejszego regulaminu.</li>
        <li>W sprawach nieuregulowanych zastosowanie mają przepisy prawa powszechnie obowiązującego oraz aktualne zasady organizacyjne programu publikowane przez Organizatora.</li>
      </Ol>
      <div className="mt-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-sm text-orange-800 dark:text-orange-300">
        <strong>WAŻNE:</strong> W przypadku rozbieżności między treścią Planu Marketingowego a niniejszym dokumentem,
        rozstrzygające są postanowienia Warunków Współpracy.
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        WB Partners Sp. z o.o. • ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów • NIP: 5170455185 • REGON: 540735769 •
        KRS: 0001151642
        <br />
        agencja@wb-horizon.pl • 570 038 828
      </p>
      <p className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 mt-6 pb-1" data-testid="terms-end-marker">
        — Koniec dokumentu —
      </p>
    </div>
  );
}
