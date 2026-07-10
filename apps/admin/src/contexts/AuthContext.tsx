'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'WAREHOUSE' | 'CUSTOMER';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  hasRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Publiczne ścieżki (nie wymagają logowania)
const publicPaths = ['/login', '/forgot-password'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Sprawdź czy użytkownik jest zalogowany
  useEffect(() => {
    checkAuth();
  }, []);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!token) return;

    // Refresh token every 7 hours (token expires in 8h)
    const refreshInterval = setInterval(async () => {
      try {
        const stored = localStorage.getItem('admin_auth_tokens');
        if (!stored) return;
        const { refreshToken } = JSON.parse(stored);
        if (!refreshToken) return;

        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (response.ok) {
          const data = await response.json();
          const newAccessToken = data.tokens?.accessToken;
          const newRefreshToken = data.tokens?.refreshToken || refreshToken;
          if (newAccessToken) {
            localStorage.setItem('admin_auth_tokens', JSON.stringify({
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
            }));
            setToken(newAccessToken);
            console.log('Token auto-refreshed successfully');
          }
        } else {
          console.warn('Token refresh failed, session may expire soon');
        }
      } catch (error) {
        console.error('Token auto-refresh error:', error);
      }
    }, 7 * 60 * 60 * 1000); // 7 hours

    return () => clearInterval(refreshInterval);
  }, [token]);

  // Przekierowanie niezalogowanych
  useEffect(() => {
    if (!loading) {
      const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
      
      if (!user && !isPublicPath) {
        router.push('/login');
      } else if (user && pathname === '/login') {
        router.push('/');
      }
    }
  }, [user, loading, pathname, router]);

  async function checkAuth() {
    try {
      const tokens = localStorage.getItem('admin_auth_tokens');
      console.log('checkAuth: tokens from localStorage:', tokens ? 'exists' : 'null');
      
      if (!tokens) {
        setLoading(false);
        return;
      }

      const { accessToken } = JSON.parse(tokens);
      console.log('checkAuth: accessToken:', accessToken ? 'exists' : 'null');
      
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('checkAuth: user data:', data.user);
        // Sprawdź czy użytkownik ma uprawnienia admina
        if (['ADMIN', 'WAREHOUSE'].includes(data.user.role)) {
          setUser(data.user);
          setToken(accessToken);
          console.log('checkAuth: token set successfully');
        } else {
          // Brak uprawnień - wyloguj
          localStorage.removeItem('admin_auth_tokens');
        }
      } else {
        localStorage.removeItem('admin_auth_tokens');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('admin_auth_tokens');
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Błąd logowania');
    }

    // Sprawdź czy użytkownik ma uprawnienia do panelu admin
    if (!['ADMIN', 'WAREHOUSE'].includes(data.user.role)) {
      throw new Error('Brak uprawnień do panelu administracyjnego');
    }

    // Zapisz tokeny (API zwraca tokens.accessToken, tokens.refreshToken)
    const accessToken = data.tokens?.accessToken || data.accessToken;
    const refreshToken = data.tokens?.refreshToken || data.refreshToken;
    
    localStorage.setItem('admin_auth_tokens', JSON.stringify({
      accessToken,
      refreshToken,
    }));

    setUser(data.user);
    setToken(accessToken);
    router.push('/');
  }

  async function logout() {
    try {
      const tokens = localStorage.getItem('admin_auth_tokens');
      if (tokens) {
        const { accessToken } = JSON.parse(tokens);
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('admin_auth_tokens');
      setUser(null);
      setToken(null);
      router.push('/login');
    }
  }

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  
  const hasRole = (roles: string[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, isManager, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
