import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { CartProvider } from '../contexts/CartContext';
import { AuthProvider } from '../contexts/AuthContext';
import { WishlistProvider } from '../contexts/WishlistContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { GoogleTagManager, GoogleTagManagerNoScript } from '../components/analytics/GoogleTagManager';
import LazyOverlays from '../components/LazyOverlays';
import { Metadata } from 'next';
import { ReferralTracker } from '../components/ReferralTracker';
import { Suspense } from 'react';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'WB Trade - Shop Everything',
  description: 'Najniższe ceny na rynku na tysiące produktów. Sprawdź nasze oferty i oszczędzaj więcej przy każdym zakupie. Kupuj teraz.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'WB Trade - Shop Everything',
    description: 'Najniższe ceny na rynku na tysiące produktów. Sprawdź nasze oferty i oszczędzaj więcej przy każdym zakupie.',
    url: 'https://www.wb-trade.pl',
    siteName: 'WB Trade',
    locale: 'pl_PL',
    type: 'website',
    images: [
      {
        url: 'https://www.wb-trade.pl/images/WB-TRADE-logo.png',
        width: 1267,
        height: 771,
        alt: 'WB Trade - Shop Everything',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WB Trade - Shop Everything',
    description: 'Najniższe ceny na rynku na tysiące produktów. Sprawdź nasze oferty i oszczędzaj więcej przy każdym zakupie.',
    images: ['https://www.wb-trade.pl/images/WB-TRADE-logo.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Preconnect to critical origins for faster resource fetching */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('wb-trade-theme')||'system';var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t==='system'&&d))document.documentElement.classList.add('dark')})()`,
          }}
        />
        {/* Google Consent Mode v2 - default denied MUST be before GTM */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                'ad_storage': 'denied',
                'ad_user_data': 'denied',
                'ad_personalization': 'denied',
                'analytics_storage': 'denied',
                'functionality_storage': 'granted',
                'security_storage': 'granted',
                'wait_for_update': 500
              });
              // Restore consent from localStorage if already accepted
              try {
                var c = JSON.parse(localStorage.getItem('wb_cookie_consent') || 'null');
                if (c) {
                  gtag('consent', 'update', {
                    'ad_storage': c.marketing ? 'granted' : 'denied',
                    'ad_user_data': c.marketing ? 'granted' : 'denied',
                    'ad_personalization': c.marketing ? 'granted' : 'denied',
                    'analytics_storage': c.analytics ? 'granted' : 'denied'
                  });
                }
              } catch(e) {}
            `,
          }}
        />
        <GoogleTagManager />
        {/* Meta Pixel */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('consent', 'revoke');
              fbq('init', '2342496569562576');
              fbq('track', 'PageView');
              // Grant Meta pixel if marketing consent already given
              try {
                var c = JSON.parse(localStorage.getItem('wb_cookie_consent') || 'null');
                if (c && c.marketing) { fbq('consent', 'grant'); }
              } catch(e) {}
            `,
          }}
        />
        <noscript>
          <img height="1" width="1" style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=2342496569562576&ev=PageView&noscript=1"
          />
        </noscript>
      </head>
      <body className="font-sans">
        <GoogleTagManagerNoScript />
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                <Suspense fallback={null}>
                  <ReferralTracker />
                </Suspense>
                {children}
                <LazyOverlays />
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}