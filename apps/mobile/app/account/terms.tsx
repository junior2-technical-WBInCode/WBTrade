import React, { useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { ThemeColors } from '../../constants/Colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Section {
  title: string;
  content: string;
}

const SECTIONS: Section[] = [
  {
    title: '§ 1. Postanowienia ogólne',
    content:
      '1. Niniejszy Regulamin określa zasady korzystania ze sklepu internetowego prowadzonego pod adresem https://www.wb-trade.pl oraz aplikacji mobilnej WB Trade (dalej łącznie: „Sklep”).\n\n' +
      '2. Właścicielem i operatorem Sklepu jest: WB Partners Sp. z o.o. z siedzibą w Rzeszowie, ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów, NIP: 5170455185, REGON: 540735769, KRS: 0001151642 (dalej: „Sprzedawca”).\n\n' +
      '3. Kontakt ze Sprzedawcą:\n   a) e-mail: support@wb-partners.pl,\n   b) telefon: +48 570 034 367,\n   c) godziny obsługi: pon.–pt. 9:00–17:00.\n\n' +
      '4. Regulamin jest udostępniony nieodpłatnie w Sklepie w sposób umożliwiający jego pobranie, zapisanie i odtworzenie.\n\n' +
      '5. Do korzystania ze Sklepu niezbędne są:\n   a) urządzenie z dostępem do Internetu,\n   b) aktualna przeglądarka internetowa lub aplikacja mobilna WB Trade,\n   c) aktywny adres e-mail.\n\n' +
      '6. Regulamin ma zastosowanie do Umów sprzedaży zawieranych za pośrednictwem Sklepu na terytorium Rzeczypospolitej Polskiej, o ile Strony nie postanowią inaczej.\n\n' +
      '7. Sklep prowadzi sprzedaż:\n   a) konsumencką (B2C),\n   b) dla przedsiębiorców (B2B).\n\n' +
      '8. W zakresie nieuregulowanym odmiennie w Regulaminie do Klientów B2B stosuje się postanowienia dotyczące przedsiębiorców.\n\n' +
      '9. Postanowienia dotyczące Konsumentów oraz Przedsiębiorców na prawach konsumenta, w szczególności dotyczące prawa odstąpienia od Umowy zawartej na odległość, nie mają zastosowania do Klientów B2B, chyba że Regulamin wyraźnie stanowi inaczej.\n\n' +
      '10. Sklep nie jest marketplace’em umożliwiającym sprzedaż przez podmioty trzecie. Sprzedawca oferuje Produkty we własnym imieniu.\n\n' +
      '11. Złożenie Zamówienia wymaga akceptacji Regulaminu.\n\n' +
      '12. Sprzedawca może indywidualnie ustalać z Klientami B2B warunki współpracy handlowej, w szczególności dotyczące cen, rabatów, terminów płatności, sposobów dostawy, zasad realizacji Zamówień, zwrotów, reklamacji oraz innych warunków współpracy. Warunki te ustalane są w drodze odrębnej umowy, porozumienia lub indywidualnych ustaleń dokonanych w formie dokumentowej pomiędzy Sprzedawcą a Klientem B2B. Indywidualnie uzgodnione warunki mają pierwszeństwo przed postanowieniami niniejszego Regulaminu w zakresie, w jakim odmiennie regulują prawa i obowiązki Stron.\n\n' +
      '13. Założenie Konta w Sklepie, w tym Konta firmowego (B2B), oznacza zapoznanie się z Regulaminem oraz jego akceptację.',
  },
  {
    title: '§ 2. Definicje',
    content:
      '1. Klient – osoba fizyczna, osoba prawna lub jednostka organizacyjna posiadająca zdolność prawną korzystająca ze Sklepu.\n\n' +
      '2. Konsument – osoba fizyczna dokonująca zakupu niezwiązanego bezpośrednio z działalnością gospodarczą lub zawodową.\n\n' +
      '3. Przedsiębiorca – osoba fizyczna, osoba prawna lub jednostka organizacyjna prowadząca działalność gospodarczą lub zawodową.\n\n' +
      '4. Przedsiębiorca na prawach konsumenta – osoba fizyczna prowadząca działalność gospodarczą, zawierająca Umowę niezwiązaną zawodowo z prowadzoną działalnością.\n\n' +
      '5. Konto – indywidualne konto Klienta w Sklepie.\n\n' +
      '6. Konto firmowe (B2B) – konto przeznaczone dla przedsiębiorców, zapewniające dostęp do funkcji B2B, w szczególności indywidualnych cen hurtowych, płatności przelewem, feedu XML/CSV oraz dedykowanych metod dostawy.\n\n' +
      '7. Klient B2B – przedsiębiorca posiadający zatwierdzone Konto firmowe (B2B), korzystający z indywidualnych warunków handlowych lub cen hurtowych oferowanych przez Sprzedawcę.\n\n' +
      '8. Cennik hurtowy – indywidualne warunki cenowe udostępnione Klientowi B2B po zalogowaniu.\n\n' +
      '9. Produkt – rzecz ruchoma oferowana w Sklepie.\n\n' +
      '10. Zamówienie – oświadczenie woli Klienta zmierzające do zawarcia Umowy sprzedaży.\n\n' +
      '11. Umowa – umowa sprzedaży zawierana na odległość pomiędzy Sprzedawcą a Klientem.\n\n' +
      '12. Dzień roboczy – dzień od poniedziałku do piątku z wyłączeniem dni ustawowo wolnych od pracy.',
  },
  {
    title: '§ 3. Konto i Konto firmowe (B2B)',
    content:
      '1. Założenie Konta jest dobrowolne i bezpłatne.\n\n' +
      '2. Klient może dokonywać zakupów bez rejestracji, jeśli Sklep udostępnia taką funkcjonalność.\n\n' +
      '3. Konto firmowe (B2B) wymaga:\n   a) podania danych firmowych,\n   b) numeru NIP,\n   c) weryfikacji i zatwierdzenia przez Sprzedawcę.\n\n' +
      '4. Sprzedawca może odmówić aktywacji Konta firmowego z uzasadnionych przyczyn.\n\n' +
      '5. Konto firmowe może zapewniać dostęp do:\n   a) cen hurtowych,\n   b) płatności przelewem,\n   c) feedów XML/CSV,\n   d) dedykowanych metod dostawy,\n   e) innych funkcji B2B.\n\n' +
      '6. Uzyskanie dostępu do indywidualnego cennika hurtowego oznacza, że Zamówienia składane z wykorzystaniem Konta firmowego mają charakter zawodowy i związany z działalnością gospodarczą Klienta B2B.\n\n' +
      '7. Sprzedawca może ograniczyć lub cofnąć dostęp do funkcji B2B w przypadku:\n   a) zaległości płatniczych,\n   b) naruszenia Regulaminu,\n   c) podejrzenia nadużyć,\n   d) zmiany polityki handlowej.',
  },
  {
    title: '§ 4. Składanie Zamówień i zawarcie Umowy',
    content:
      '1. Zamówienia można składać 24 godziny na dobę.\n\n' +
      '2. W celu złożenia Zamówienia Klient:\n   a) wybiera Produkt i dodaje go do Koszyka,\n   b) wybiera sposób dostawy i płatności,\n   c) podaje dane wymagane do realizacji Zamówienia,\n   d) akceptuje Regulamin.\n\n' +
      '3. Złożenie Zamówienia stanowi ofertę zawarcia Umowy sprzedaży.\n\n' +
      '4. Umowa zostaje zawarta z chwilą przesłania przez Sprzedawcę potwierdzenia przyjęcia Zamówienia do realizacji.\n\n' +
      '5. Sprzedawca może odmówić realizacji Zamówienia w przypadku:\n   a) błędu technicznego,\n   b) błędnej ceny,\n   c) braku dostępności Produktu,\n   d) podejrzenia nadużycia,\n   e) niemożliwości realizacji z przyczyn logistycznych.\n\n' +
      '6. W przypadku odmowy realizacji Zamówienia dokonana płatność podlega zwrotowi.',
  },
  {
    title: '§ 5. Ceny i płatności',
    content:
      '1. Wszystkie ceny podawane są w PLN i zawierają podatek VAT.\n\n' +
      '2. Cena widoczna przy Produkcie w chwili składania Zamówienia jest wiążąca dla Stron, z zastrzeżeniem oczywistych błędów technicznych lub cenowych.\n\n' +
      '3. Koszty dostawy prezentowane są podczas składania Zamówienia.\n\n' +
      '4. Dostępne metody płatności:\n   a) PayU,\n   b) imoje,\n   c) karta płatnicza,\n   d) BLIK,\n   e) Google Pay,\n   f) Apple Pay,\n   g) przelew tradycyjny.\n\n' +
      '5. Sprzedawca może udostępniać Klientom B2B indywidualne ceny hurtowe.\n\n' +
      '6. Sprzedawca może zmienić lub cofnąć warunki hurtowe w przypadku:\n   a) zaległości płatniczych,\n   b) nadużyć,\n   c) zmiany polityki handlowej.\n\n' +
      '7. Dla Klientów B2B Sprzedawca może udostępnić płatność przelewem z terminem płatności 7 dni.\n\n' +
      '8. Produkt nie jest rezerwowany do czasu zaksięgowania płatności, chyba że Strony uzgodnią inaczej.\n\n' +
      '9. Faktury VAT dla Klientów B2B wystawiane są automatycznie na dane firmowe przypisane do Konta firmowego.',
  },
  {
    title: '§ 6. Dostawa',
    content:
      '1. Dostawa realizowana jest na terytorium Polski.\n\n' +
      '2. Dostępne metody dostawy:\n   a) Paczkomaty InPost,\n   b) Kurier InPost,\n   c) Kurier DPD,\n   d) przesyłki gabarytowe,\n   e) odbiór osobisty dla Produktów Outlet.\n\n' +
      '3. Czas realizacji Zamówienia wynosi zwykle od 1 do 5 dni roboczych.\n\n' +
      '4. Zamówienie może zostać zrealizowane w kilku przesyłkach.\n\n' +
      '5. Klient powinien sprawdzić stan przesyłki przy odbiorze.\n\n' +
      '6. Klienci B2B mogą korzystać z opcji „Wysyłka własna (B2B)” organizując transport we własnym zakresie.\n\n' +
      '7. Ryzyko przypadkowej utraty lub uszkodzenia Produktu przechodzi:\n   a) na Konsumenta – z chwilą objęcia Produktu w posiadanie,\n   b) na Klienta B2B – z chwilą wydania Produktu przewoźnikowi.',
  },
  {
    title: '§ 7. Gwarancja',
    content:
      '1. Produkty mogą być objęte gwarancją producenta lub dystrybutora.\n\n' +
      '2. Sprzedawca nie udziela dodatkowej gwarancji własnej, chyba że wyraźnie wskazano inaczej.',
  },
  {
    title: '§ 8. Odstąpienie od Umowy (zwroty)',
    content:
      '1. Prawo odstąpienia od Umowy zawartej na odległość przysługuje wyłącznie:\n   a) Konsumentowi,\n   b) Przedsiębiorcy na prawach konsumenta.\n\n' +
      '2. Konsument oraz Przedsiębiorca na prawach konsumenta mogą odstąpić od Umowy bez podania przyczyny w terminie 14 dni od dnia otrzymania Produktu.\n\n' +
      '3. Dla zachowania terminu wystarczy wysłanie oświadczenia przed jego upływem.\n\n' +
      '4. Oświadczenie można złożyć:\n   a) przez formularz „Zwroty i reklamacje”,\n   b) mailowo na: support@wb-partners.pl.\n\n' +
      '5. Klient zobowiązany jest zwrócić Produkt w terminie 14 dni od dnia odstąpienia od Umowy.\n\n' +
      '6. Produkt powinien zostać zwrócony kompletny i odpowiednio zabezpieczony na czas transportu.\n\n' +
      '7. Koszt zwrotu Produktu ponosi Klient, chyba że Sprzedawca postanowi inaczej.\n\n' +
      '8. Sprzedawca może wstrzymać się ze zwrotem płatności do czasu otrzymania Produktu lub dowodu jego nadania.\n\n' +
      '9. Klientowi B2B, w szczególności przedsiębiorcy posiadającemu Konto firmowe (B2B) z dostępem do indywidualnych cen hurtowych lub innych warunków handlowych B2B, nie przysługuje prawo odstąpienia od Umowy zawartej na odległość ani zwrot Produktu bez podania przyczyny.\n\n' +
      '10. Brak prawa do odstąpienia: zgodnie z art. 535 Kodeksu cywilnego, sprzedawca zobowiązuje się przenieść własność i wydać rzecz, a kupujący zobowiązuje się rzecz odebrać i zapłacić cenę. W relacjach B2B obowiązek przyjęcia zwrotu Produktu oraz zwrotu płatności nie istnieje z mocy prawa, chyba że Strony wyraźnie postanowią inaczej.\n\n' +
      '11. Sprzedawca może dobrowolnie wyrazić zgodę na przyjęcie zwrotu od Klienta B2B, jednak nie stanowi to obowiązku Sprzedawcy ani podstawy do powstania po stronie Klienta B2B roszczenia o przyjęcie zwrotu lub zwrot płatności.',
  },
  {
    title: '§ 9. Reklamacje',
    content:
      '1. Sprzedawca odpowiada za zgodność Produktu z Umową zgodnie z obowiązującymi przepisami prawa.\n\n' +
      '2. Reklamacje można składać:\n   a) przez formularz „Zwroty i reklamacje”,\n   b) mailowo na: support@wb-partners.pl.\n\n' +
      '3. Reklamacja powinna zawierać:\n   a) numer Zamówienia,\n   b) opis problemu,\n   c) dane kontaktowe,\n   d) żądanie Klienta.\n\n' +
      '4. Sprzedawca udzieli odpowiedzi w terminie 14 dni w przypadkach wymaganych przepisami prawa.\n\n' +
      '5. W relacjach z Klientami B2B odpowiedzialność Sprzedawcy z tytułu rękojmi zostaje wyłączona w najszerszym zakresie dopuszczalnym przez przepisy prawa.',
  },
  {
    title: '§ 10. Dane osobowe',
    content:
      '1. Administratorem danych osobowych jest Sprzedawca.\n\n' +
      '2. Dane osobowe przetwarzane są zgodnie z Polityką Prywatności oraz obowiązującymi przepisami prawa.',
  },
  {
    title: '§ 11. Newsletter i promocje',
    content:
      '1. Zapis do newslettera jest dobrowolny.\n\n' +
      '2. Sprzedawca może organizować akcje promocyjne i udostępniać kupony rabatowe.\n\n' +
      '3. Warunki promocji określane są każdorazowo w komunikacie promocyjnym.',
  },
  {
    title: '§ 12. Własność intelektualna',
    content:
      '1. Treści dostępne w Sklepie stanowią własność Sprzedawcy lub są wykorzystywane legalnie na podstawie odpowiednich licencji.\n\n' +
      '2. Zabrania się kopiowania treści Sklepu bez zgody Sprzedawcy.',
  },
  {
    title: '§ 13. Odpowiedzialność',
    content:
      '1. Sprzedawca dokłada należytej staranności w celu zapewnienia prawidłowego działania Sklepu.\n\n' +
      '2. Sprzedawca nie ponosi odpowiedzialności za:\n   a) przerwy techniczne,\n   b) działanie siły wyższej,\n   c) działania podmiotów trzecich niezależnych od Sprzedawcy,\n   d) korzystanie ze Sklepu niezgodnie z Regulaminem.',
  },
  {
    title: '§ 14. Postanowienia końcowe',
    content:
      '1. Sprzedawca może zmienić Regulamin z ważnych przyczyn, w szczególności:\n   a) zmiany przepisów prawa,\n   b) zmian technologicznych,\n   c) zmian organizacyjnych,\n   d) zmian zasad współpracy B2B.\n\n' +
      '2. Zmiany Regulaminu nie wpływają na Zamówienia złożone przed ich wejściem w życie.\n\n' +
      '3. W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego.\n\n' +
      '4. Spory:\n   a) z Konsumentami rozstrzygane są przez sądy właściwe zgodnie z przepisami prawa,\n   b) z Klientami B2B przez sąd właściwy dla siedziby Sprzedawcy.\n\n' +
      '5. Konsument może korzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń zgodnie z informacjami publikowanymi przez UOKiK.',
  },
];

function SectionAccordion({ section, index }: { section: Section; index: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(index === 0);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={styles.accordionItem}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.7}>
        <Text style={styles.accordionTitle}>{section.title}</Text>
        <FontAwesome
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={colors.textMuted}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.accordionBody}>
          <Text style={styles.accordionText}>{section.content}</Text>
        </View>
      )}
    </View>
  );
}

export default function TermsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Regulamin', headerBackTitle: 'Wróć' }} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <FontAwesome name="file-text-o" size={28} color={colors.tint} />
          </View>
          <Text style={styles.heroTitle}>Regulamin</Text>
          <Text style={styles.heroDate}>Ostatnia aktualizacja: 17 marca 2026 r.</Text>
        </View>

        {/* Intro */}
        <View style={styles.introCard}>
          <FontAwesome name="info-circle" size={16} color={colors.tint} />
          <Text style={styles.introText}>
            Poniżej znajdziesz pełną treść regulaminu sklepu WBTrade. Kliknij na sekcję, aby
            rozwinąć jej treść.
          </Text>
        </View>

        {/* Sections */}
        <View style={styles.accordionList}>
          {SECTIONS.map((section, i) => (
            <SectionAccordion key={i} section={section} index={i} />
          ))}
        </View>

        {/* Contact CTA */}
        <View style={styles.ctaSection}>
          <View style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>Masz pytania?</Text>
            <Text style={styles.ctaSubtitle}>
              Skontaktuj się z nami — chętnie pomożemy!
            </Text>
            <View style={styles.ctaInfo}>
              <TouchableOpacity
                style={styles.ctaRow}
                onPress={() => Linking.openURL('mailto:support@wb-partners.pl')}
              >
                <FontAwesome name="envelope" size={14} color={colors.tint} />
                <Text style={styles.ctaRowText}>support@wb-partners.pl</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaRow}
                onPress={() => Linking.openURL('tel:+48570034367')}
              >
                <FontAwesome name="phone" size={14} color={colors.tint} />
                <Text style={styles.ctaRowText}>+48 570 034 367</Text>
              </TouchableOpacity>
              <View style={styles.ctaRow}>
                <FontAwesome name="clock-o" size={14} color={colors.tint} />
                <Text style={styles.ctaRowText}>pon.–pt. 9:00–17:00</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Company footer */}
        <View style={styles.footer}>
          <View style={styles.footerCard}>
            <View style={styles.footerIconWrap}>
              <FontAwesome name="building-o" size={18} color={colors.tint} />
            </View>
            <Text style={styles.footerCompany}>WB PARTNERS Sp. z o.o.</Text>
            <View style={styles.footerDivider} />
            <Text style={styles.footerAddr}>ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów</Text>
            <Text style={styles.footerNip}>NIP: 5170455185 · KRS: 0001151642</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ─── Hero ───
  hero: {
    backgroundColor: colors.card,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tintLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  heroDate: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // ─── Intro ───
  introCard: {
    flexDirection: 'row',
    backgroundColor: colors.tintLight,
    marginHorizontal: 12,
    marginTop: 16,
    borderRadius: 10,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  introText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    flex: 1,
  },

  // ─── Accordion ───
  accordionList: {
    marginHorizontal: 12,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  accordionItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  accordionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  accordionText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 21,
  },

  // ─── Contact CTA ───
  ctaSection: {
    marginHorizontal: 12,
    marginTop: 24,
  },
  ctaCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  ctaSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  ctaInfo: {
    gap: 12,
    width: '100%',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaRowText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // ─── Footer ───
  footer: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 32,
  },
  footerCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  footerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tintLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  footerDivider: {
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.tintLight,
    marginVertical: 8,
  },
  footerCompany: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  footerAddr: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footerNip: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
