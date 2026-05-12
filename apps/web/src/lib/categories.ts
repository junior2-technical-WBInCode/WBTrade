// Centralna konfiguracja kategorii - jedno źródło prawdy
// Uwaga: główne kategorie są teraz pobierane dynamicznie z API (categoriesApi.getMain())
// Ten plik zawiera definicje typów i helper functions
//
// NOWA LOGIKA KATEGORII (01/2026):
// - Kategorie są mapowane na podstawie TAGÓW z Baselinkera
// - Każdy produkt ma 2 tagi: główna kategoria + podkategoria
// - Główne kategorie to KONTENERY - nie wyświetlają produktów bezpośrednio
// - Produkty wyświetlają się TYLKO w podkategoriach

/**
 * Usuwa prefiksy [BTP], [HP] itp. z nazwy kategorii
 * Te prefiksy są używane wewnętrznie do identyfikacji źródła kategorii,
 * ale nie powinny być widoczne dla użytkowników
 */
export function cleanCategoryName(name: string): string {
  // Usuwa prefiksy w formacie [XXX] na początku nazwy
  return name.replace(/^\[[A-Z]+\]\s*/g, '').trim();
}

export interface Category {
  name: string;
  slug: string;
  children?: Category[];
}

// Główne kategorie (zsynchronizowane z tagami Baselinker)
// UWAGA: Te kategorie to KONTENERY - produkty wyświetlają się tylko w podkategoriach
// UWAGA: Slugi podkategorii w DB zawierają prefiks rodzica (np. "elektronika-i-gsm-akcesoria-gsm")
//        Lista poniżej jest referencją — rzeczywiste dane ładowane dynamicznie z API
export const mainCategories: Category[] = [
  {
    name: 'Elektronika i GSM',
    slug: 'elektronika-i-gsm',
    children: [
      { name: 'Akcesoria GSM', slug: 'akcesoria-gsm' },
      { name: 'Audio (słuchawki i głośniki)', slug: 'audio-sluchawki-i-glosniki' },
      { name: 'Drukarki i skanery', slug: 'drukarki-i-skanery' },
      { name: 'Etui i pokrowce', slug: 'etui-i-pokrowce' },
      { name: 'Kable i adaptery', slug: 'kable-i-adaptery' },
      { name: 'Komputery i akcesoria', slug: 'komputery-i-akcesoria' },
      { name: 'Komputery i laptopy', slug: 'komputery-i-laptopy' },
      { name: 'Konsole i gry', slug: 'konsole-i-gry' },
      { name: 'Ładowanie i zasilanie', slug: 'ladowanie-i-zasilanie' },
      { name: 'Monitoring', slug: 'monitoring' },
      { name: 'Monitory', slug: 'monitory' },
      { name: 'Podzespoły komputerowe', slug: 'podzespoly-komputerowe' },
      { name: 'Sieci i serwery', slug: 'sieci-i-serwery' },
      { name: 'Smartfony i telefony', slug: 'smartfony-i-telefony' },
      { name: 'Smartwatche', slug: 'smartwatche' },
      { name: 'Szkła i folie ochronne', slug: 'szkla-i-folie-ochronne' },
      { name: 'UPSy i zasilanie', slug: 'upsy-i-zasilanie' },
    ]
  },
  {
    name: 'Dom',
    slug: 'dom',
    children: [
      { name: 'Energia i ogrzewanie', slug: 'energia-i-ogrzewanie' },
      { name: 'Gadżety', slug: 'gadzety' },
      { name: 'Kuchnia', slug: 'kuchnia' },
      { name: 'Łazienka', slug: 'lazienka' },
      { name: 'Oświetlenie (domowe)', slug: 'oswietlenie-domowe' },
      { name: 'Smart home', slug: 'smart-home' },
      { name: 'Sprzęt AGD', slug: 'sprzet-agd' },
      { name: 'Wyposażenie i akcesoria', slug: 'wyposazenie-i-akcesoria' },
      { name: 'Zabezpieczenia', slug: 'zabezpieczenia' },
      { name: 'Zwierzęta', slug: 'zwierzeta' },
    ]
  },
  {
    name: 'Sport i turystyka',
    slug: 'sport-i-turystyka',
    children: [
      { name: 'Akcesoria sportowe', slug: 'akcesoria-sportowe' },
      { name: 'Fitness i trening', slug: 'fitness-i-trening' },
      { name: 'Kemping i przetrwanie', slug: 'kemping-i-przetrwanie' },
      { name: 'Rowery i akcesoria', slug: 'rowery-i-akcesoria' },
      { name: 'Sprzęt turystyczny', slug: 'sprzet-turystyczny' },
      { name: 'Wykrywacze metalu', slug: 'wykrywacze-metalu' },
    ]
  },
  {
    name: 'Dla dziecka',
    slug: 'dla-dziecka',
    children: [
      { name: 'Artykuły plastyczne i kreatywne', slug: 'artykuly-plastyczne-i-kreatywne' },
      { name: 'Artykuły szkolne i papiernicze', slug: 'artykuly-szkolne-i-papiernicze' },
      { name: 'Gry edukacyjne i planszowe', slug: 'gry-edukacyjne-i-planszowe' },
      { name: 'Naczynia i akcesoria dziecięce', slug: 'naczynia-i-akcesoria-dzieciece' },
      { name: 'Pluszaki', slug: 'pluszaki' },
      { name: 'Pojazdy i jeździki', slug: 'pojazdy-i-jezdziki' },
      { name: 'Przebrania', slug: 'przebrania' },
      { name: 'Przybory i akcesoria', slug: 'przybory-i-akcesoria' },
      { name: 'Zabawki', slug: 'zabawki' },
      { name: 'Zabawki ogrodowe', slug: 'zabawki-ogrodowe' },
      { name: 'LEGO', slug: 'lego' },
    ]
  },
  {
    name: 'Gastronomia',
    slug: 'gastronomia',
    children: [
      { name: 'Cukiernictwo', slug: 'cukiernictwo' },
      { name: 'Higiena i utrzymanie czystości', slug: 'higiena-i-utrzymanie-czystosci' },
      { name: 'Pizzeria', slug: 'pizzeria' },
      { name: 'Sprzęt do wyrobu alkoholu', slug: 'sprzet-do-wyrobu-alkoholu' },
      { name: 'Sprzęt gastronomiczny', slug: 'sprzet-gastronomiczny' },
      { name: 'Ubój i wędzenie', slug: 'uboj-i-wedzenie' },
      { name: 'Wyposażenie lokali', slug: 'wyposazenie-lokali' },
    ]
  },
  {
    name: 'Wagi',
    slug: 'wagi',
    children: [
      { name: 'Wagi kuchenne', slug: 'wagi-kuchenne' },
      { name: 'Wagi przemysłowe', slug: 'wagi-przemyslowe' },
    ]
  },
  {
    name: 'Zdrowie i Uroda',
    slug: 'zdrowie-i-uroda',
    children: [
      { name: 'Grooming', slug: 'grooming' },
      { name: 'Masaż i rehabilitacja', slug: 'masaz-i-rehabilitacja' },
      { name: 'Modele anatomiczne', slug: 'modele-anatomiczne' },
      { name: 'Oczyszczacze powietrza i dezynfekcja', slug: 'oczyszczacze-powietrza-i-dezynfekcja' },
      { name: 'Wyposażenie gabinetów i salonów', slug: 'wyposazenie-gabinetow-i-salonow' },
    ]
  },
  {
    name: 'Chemia profesjonalna',
    slug: 'chemia-profesjonalna',
    children: [
      { name: 'Chemia dla gastronomii', slug: 'chemia-dla-gastronomii' },
      { name: 'Chemia przemysłowa', slug: 'chemia-przemyslowa' },
      { name: 'Chemia samochodowa', slug: 'chemia-samochodowa' },
      { name: 'Chemia warsztatowa', slug: 'chemia-warsztatowa' },
    ]
  },
  {
    name: 'Ogród i Gospodarstwo',
    slug: 'ogrod-i-gospodarstwo',
    children: [
      { name: 'Akcesoria garażowe', slug: 'akcesoria-garazowe' },
      { name: 'Artykuły dla zwierząt', slug: 'artykuly-dla-zwierzat' },
      { name: 'Baseny i akcesoria', slug: 'baseny-i-akcesoria' },
      { name: 'Meble ogrodowe', slug: 'meble-ogrodowe' },
      { name: 'Nawadnianie', slug: 'nawadnianie' },
      { name: 'Ogród i narzędzia ogrodowe', slug: 'ogrod-i-narzedzia-ogrodowe' },
      { name: 'Oświetlenie zewnętrzne', slug: 'oswietlenie-zewnetrzne' },
      { name: 'Place zabaw', slug: 'place-zabaw' },
      { name: 'Pojemniki i zbiorniki gospodarcze', slug: 'pojemniki-i-zbiorniki-gospodarcze' },
      { name: 'Pszczelarstwo', slug: 'pszczelarstwo' },
    ]
  },
  {
    name: 'Narzędzia',
    slug: 'narzedzia',
    children: [
      { name: 'Akcesoria', slug: 'narzedzia-akcesoria' },
      { name: 'Czujniki', slug: 'czujniki' },
      { name: 'Elektronarzędzia', slug: 'elektronarzedzia' },
      { name: 'Maszyny i urządzenia', slug: 'maszyny-i-urzadzenia' },
      { name: 'Narzędzia ręczne', slug: 'narzedzia-reczne' },
      { name: 'Spawalnictwo', slug: 'spawalnictwo' },
      { name: 'Sprzęt Laboratoryjny', slug: 'sprzet-laboratoryjny' },
      { name: 'Urządzenia', slug: 'urzadzenia' },
    ]
  },
  {
    name: 'Motoryzacja',
    slug: 'motoryzacja',
    children: [
      { name: 'Akcesoria i części', slug: 'akcesoria-i-czesci' },
      { name: 'Ładowarki samochodowe', slug: 'ladowarki-samochodowe' },
      { name: 'Uchwyty samochodowe', slug: 'uchwyty-samochodowe' },
      { name: 'Wyposażenie warsztatu', slug: 'wyposazenie-warsztatu' },
    ]
  },
  {
    name: 'Biurowe i papiernicze',
    slug: 'biurowe-i-papiernicze',
    children: []
  },
  {
    name: 'Opakowania i materiały wysyłkowe',
    slug: 'opakowania-i-materialy-wysylkowe',
    children: []
  },
  {
    name: 'Chemia gospodarcza',
    slug: 'chemia-gospodarcza',
    children: []
  },
  {
    name: 'Outlet',
    slug: 'outlet',
    children: []
  },
];

// Helper: znajdź kategorię po slug
export function findCategoryBySlug(slug: string, categories: Category[] = mainCategories): Category | null {
  for (const cat of categories) {
    if (cat.slug === slug) return cat;
    if (cat.children) {
      const found = findCategoryBySlug(slug, cat.children);
      if (found) return found;
    }
  }
  return null;
}

// Helper: znajdź ścieżkę do kategorii (breadcrumb)
export function getCategoryPath(slug: string, categories: Category[] = mainCategories, path: Category[] = []): Category[] | null {
  for (const cat of categories) {
    const newPath = [...path, cat];
    if (cat.slug === slug) return newPath;
    if (cat.children) {
      const found = getCategoryPath(slug, cat.children, newPath);
      if (found) return found;
    }
  }
  return null;
}

// Helper: sprawdź czy slug jest główną kategorią
export function isMainCategory(slug: string): boolean {
  return mainCategories.some(cat => cat.slug === slug);
}

// Helper: sprawdź czy kategoria jest kontenerem (ma podkategorie z produktami)
// Kontenery nie wyświetlają produktów bezpośrednio - tylko ich podkategorie
export function isCategoryContainer(slug: string): boolean {
  const cat = findCategoryBySlug(slug, mainCategories);
  if (!cat) return false;
  
  // Główna kategoria z podkategoriami to kontener
  if (isMainCategory(slug) && cat.children && cat.children.length > 0) {
    return true;
  }
  
  return false;
}

// Helper: sprawdź czy produkty mogą być wyświetlane bezpośrednio w tej kategorii
export function canShowProductsDirectly(slug: string): boolean {
  // Jeśli to podkategoria - zawsze może wyświetlać produkty
  if (!isMainCategory(slug)) {
    return true;
  }
  
  // Jeśli to główna kategoria bez podkategorii (np. "Zdrowie i uroda", "Biurowe i papiernicze")
  // - produkty trafiają bezpośrednio tutaj
  const cat = findCategoryBySlug(slug, mainCategories);
  if (cat && (!cat.children || cat.children.length === 0)) {
    return true;
  }
  
  // Główna kategoria z podkategoriami - nie wyświetla produktów bezpośrednio
  return false;
}

// Helper: znajdź główną kategorię dla podkategorii
export function getMainCategoryFor(slug: string): Category | null {
  for (const mainCat of mainCategories) {
    if (mainCat.slug === slug) return mainCat;
    if (mainCat.children) {
      const found = findCategoryBySlug(slug, mainCat.children);
      if (found) return mainCat;
    }
  }
  return null;
}

// Helper: pobierz listę nazw głównych kategorii (do wyświetlenia w Header)
export function getMainCategoryNames(): string[] {
  return mainCategories.map(cat => cat.name);
}

// Helper: pobierz slug dla nazwy kategorii
export function getSlugByName(name: string, categories: Category[] = mainCategories): string | null {
  for (const cat of categories) {
    if (cat.name === name) return cat.slug;
    if (cat.children) {
      const found = getSlugByName(name, cat.children);
      if (found) return found;
    }
  }
  return null;
}

// Helper: pobierz nazwę dla slug kategorii
export function getNameBySlug(slug: string): string | null {
  const cat = findCategoryBySlug(slug);
  return cat ? cat.name : null;
}
