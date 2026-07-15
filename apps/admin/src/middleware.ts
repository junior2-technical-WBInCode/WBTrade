import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ========================================
// KONFIGURACJA ZABEZPIECZEŃ PANELU ADMINA
// ========================================

// Tajny klucz dostępu — MUSI być ustawiony przez zmienną środowiskową ADMIN_ACCESS_SECRET (min. 32 znaki).
// SECURITY: brak fallbacku w kodzie — bez ustawionego sekretu dostęp przez token jest niemożliwy.
const ADMIN_ACCESS_SECRET = process.env.ADMIN_ACCESS_SECRET;
if (!ADMIN_ACCESS_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[ADMIN SECURITY] ADMIN_ACCESS_SECRET is not set — admin access gate is locked.');
}

// Nazwa ciasteczka przechowującego dostęp
const ACCESS_COOKIE_NAME = 'admin_access_granted';

// Czas ważności dostępu (w sekundach) - domyślnie 24 godziny
const ACCESS_DURATION = 60 * 60 * 24;

// Whitelist IP (opcjonalnie) - zostaw pustą tablicę aby wyłączyć
// Przykład: ['192.168.1.1', '10.0.0.1']
const IP_WHITELIST: string[] = process.env.ADMIN_IP_WHITELIST 
  ? process.env.ADMIN_IP_WHITELIST.split(',').map(ip => ip.trim())
  : [];

// Czy włączyć sprawdzanie IP?
const ENABLE_IP_CHECK = IP_WHITELIST.length > 0;

// Ścieżki pomijające sprawdzanie (np. static assets)
const BYPASS_PATHS = [
  '/_next',
  '/favicon.ico',
  '/api',
];

// ========================================

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  
  // Pomiń sprawdzanie dla static assets
  if (BYPASS_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Pobierz IP klienta
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() 
    || request.headers.get('x-real-ip') 
    || 'unknown';

  // === SPRAWDZENIE IP WHITELIST ===
  if (ENABLE_IP_CHECK && !IP_WHITELIST.includes(clientIP)) {
    console.log(`[ADMIN SECURITY] IP blocked: ${clientIP}`);
    return new NextResponse('Access Denied', { status: 403 });
  }

  // === SPRAWDZENIE SECRET TOKEN ===
  const accessToken = searchParams.get('access');
  const hasValidCookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value === 'true';

  // Jeśli podano prawidłowy token w URL - ustaw ciasteczko i przekieruj
  // SECURITY: wymagany sekret z env — bez niego bramka pozostaje zamknięta
  if (ADMIN_ACCESS_SECRET && accessToken === ADMIN_ACCESS_SECRET) {
    console.log(`[ADMIN SECURITY] Access granted for IP: ${clientIP}`);
    
    // Usuń token z URL (dla bezpieczeństwa)
    const url = request.nextUrl.clone();
    url.searchParams.delete('access');
    
    const response = NextResponse.redirect(url);
    
    // Ustaw ciasteczko z czasem ważności
    response.cookies.set(ACCESS_COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: ACCESS_DURATION,
      path: '/',
    });
    
    return response;
  }

  // Jeśli nie ma ważnego ciasteczka i nie podano tokena - blokuj dostęp
  if (!hasValidCookie) {
    console.log(`[ADMIN SECURITY] Access denied - no valid token or cookie. IP: ${clientIP}`);
    
    // Zwróć stronę 403 z formularzem do wpisania kodu
    return new NextResponse(getAccessDeniedPage(), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Dostęp przyznany
  return NextResponse.next();
}

// Konfiguracja matcher - wszystkie ścieżki
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

// ========================================
// STRONA BLOKADY DOSTĘPU
// ========================================
function getAccessDeniedPage(): string {
  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dostęp Ograniczony</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 90%;
      text-align: center;
    }
    .lock-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      color: #f8f9fa;
    }
    p {
      color: #adb5bd;
      margin-bottom: 30px;
      font-size: 14px;
    }
    form { display: flex; flex-direction: column; gap: 15px; }
    input[type="password"] {
      padding: 15px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(255,255,255,0.1);
      color: #fff;
      font-size: 16px;
      outline: none;
      transition: border-color 0.3s;
    }
    input[type="password"]:focus {
      border-color: #4f46e5;
    }
    input[type="password"]::placeholder {
      color: rgba(255,255,255,0.5);
    }
    button {
      padding: 15px;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3);
    }
    .error {
      color: #ef4444;
      font-size: 14px;
      margin-top: 10px;
      display: none;
    }
    .footer {
      margin-top: 30px;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="lock-icon">🔐</div>
    <h1>Panel Administracyjny</h1>
    <p>Ten obszar wymaga specjalnego klucza dostępu.</p>
    
    <form id="accessForm" onsubmit="return submitAccess(event)">
      <input 
        type="password" 
        id="accessKey" 
        name="access" 
        placeholder="Wprowadź klucz dostępu"
        autocomplete="off"
        required
      />
      <button type="submit">Uzyskaj dostęp</button>
      <div class="error" id="errorMsg">Nieprawidłowy klucz dostępu</div>
    </form>
    
    <div class="footer">
      WBTrade Admin Panel
    </div>
  </div>

  <script>
    function submitAccess(e) {
      e.preventDefault();
      const key = document.getElementById('accessKey').value;
      if (key) {
        window.location.href = window.location.pathname + '?access=' + encodeURIComponent(key);
      }
      return false;
    }
  </script>
</body>
</html>
`;
}
