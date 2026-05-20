import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Link from 'next/link';

export const metadata = {
  title: 'Współpraca B2B - WB Trade',
  description: 'Zostań partnerem biznesowym WB Trade. Oferujemy atrakcyjne warunki współpracy hurtowej, dedykowane ceny i wsparcie.',
};

export default function CooperationPage() {
  const benefits = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Ceny hurtowe',
      description: 'Dedykowany cennik z atrakcyjnymi marżami. Im więcej zamawiasz, tym lepsze warunki.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      ),
      title: 'Szeroki asortyment',
      description: 'Tysiące produktów z wielu kategorii — kuchnia, dom i ogród, narzędzia, elektronika, meble i więcej.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: 'Szybka realizacja',
      description: 'Ekspresowa wysyłka zamówień hurtowych. Własna logistyka zapewnia terminowość dostaw.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: 'Faktury i przelew',
      description: 'Płatność przelewem z 7-dniowym terminem. Faktura VAT do każdego zamówienia.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      title: 'Dedykowane wsparcie',
      description: 'Osobisty opiekun klienta biznesowego. Pomoc w doborze asortymentu i indywidualne warunki.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
      title: 'Feed produktowy',
      description: 'Dostęp do pliku XML/CSV z pełną ofertą produktową — integracja z Twoim sklepem lub marketplace.',
    },
  ];

  const steps = [
    {
      number: '1',
      title: 'Zarejestruj konto firmowe',
      description: 'Wypełnij formularz rejestracji wybierając opcję "Konto firmowe (B2B)". Podaj dane firmy i NIP.',
    },
    {
      number: '2',
      title: 'Poczekaj na weryfikację',
      description: 'Nasz zespół zweryfikuje dane Twojej firmy. Proces trwa zazwyczaj 1-2 dni robocze.',
    },
    {
      number: '3',
      title: 'Rozpocznij zakupy',
      description: 'Po zatwierdzeniu konta otrzymasz dostęp do cen hurtowych, płatności przelewem i dedykowanej dostawy.',
    },
  ];

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <Header />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-500 to-orange-700 text-white py-16 lg:py-24">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 mb-6">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="text-sm font-medium">Współpraca B2B</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6">
              Zostań partnerem WB Trade
            </h1>
            <p className="text-xl text-orange-100 mb-8">
              Oferujemy atrakcyjne warunki współpracy hurtowej. Dołącz do grona naszych partnerów 
              biznesowych i rozwijaj swój biznes razem z nami.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-orange-700 font-bold rounded-xl hover:bg-orange-50 transition-colors"
              >
                Zarejestruj konto firmowe
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-medium rounded-xl hover:bg-white/10 transition-colors"
              >
                Skontaktuj się z nami
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 lg:py-24">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-secondary-900 dark:text-white mb-4">
              Dlaczego warto współpracować?
            </h2>
            <p className="text-lg text-secondary-600 dark:text-secondary-400 max-w-2xl mx-auto">
              Zapewniamy kompleksową obsługę klientów biznesowych z naciskiem na jakość i terminowość.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="bg-white dark:bg-secondary-800 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all border border-secondary-100 dark:border-secondary-700"
              >
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
                  {benefit.title}
                </h3>
                <p className="text-secondary-600 dark:text-secondary-400">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to start */}
      <section className="py-16 lg:py-24 bg-white dark:bg-secondary-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-secondary-900 dark:text-white mb-4">
              Jak rozpocząć współpracę?
            </h2>
            <p className="text-lg text-secondary-600 dark:text-secondary-400">
              Trzy proste kroki do rozpoczęcia zakupów w cenach hurtowych.
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="space-y-8">
              {steps.map((step, index) => (
                <div key={index} className="flex gap-6 items-start">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl shrink-0">
                    {step.number}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-secondary-600 dark:text-secondary-400">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Conditions */}
      <section className="py-16 lg:py-24">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 rounded-3xl p-8 lg:p-12 border border-blue-200 dark:border-blue-800">
              <h2 className="text-2xl lg:text-3xl font-bold text-secondary-900 dark:text-white mb-6">
                Warunki współpracy
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-secondary-900 dark:text-white mb-3">Ceny i marże</h4>
                  <ul className="space-y-2 text-secondary-700 dark:text-secondary-300">
                    <li className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Dedykowany cennik hurtowy
                    </li>
                    <li className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Indywidualny mnożnik cenowy
                    </li>
                    <li className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Możliwość negocjacji przy dużych zamówieniach
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-secondary-900 dark:text-white mb-3">Dostawa i płatności</h4>
                  <ul className="space-y-2 text-secondary-700 dark:text-secondary-300">
                    <li className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Wysyłka własna od 1,99 zł
                    </li>
                    <li className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Płatność przelewem — termin 7 dni
                    </li>
                    <li className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Faktura VAT do każdego zamówienia
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20 bg-secondary-900 dark:bg-secondary-950 text-white">
        <div className="container-custom text-center">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            Gotowy na współpracę?
          </h2>
          <p className="text-lg text-secondary-300 mb-8 max-w-xl mx-auto">
            Zarejestruj konto firmowe i zacznij kupować w cenach hurtowych już dziś.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            Załóż konto B2B
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
