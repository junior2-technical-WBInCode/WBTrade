'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  emailVerified: boolean;
  // Company data fields
  companyName?: string;
  nip?: string;
  companyStreet?: string;
  companyCity?: string;
  companyPostalCode?: string;
  // B2B fields
  b2bStatus?: string;
  b2bPriceMultiplier?: number;
  b2bWholesalerRules?: any;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  issuedAt?: number; // Timestamp when token was issued
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string; verificationToken?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<{ success: boolean; error?: string }>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  newsletter?: boolean;
  // B2B fields
  accountType?: 'personal' | 'business';
  companyName?: string;
  nip?: string;
  companyStreet?: string;
  companyCity?: string;
  companyPostalCode?: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Load tokens from localStorage on mount
  useEffect(() => {
    const storedTokens = localStorage.getItem('auth_tokens');
    if (storedTokens) {
      try {
        const parsed = JSON.parse(storedTokens);
        setTokens(parsed);
      } catch {
        localStorage.removeItem('auth_tokens');
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
    setInitialLoadDone(true);
  }, []);

  // Fetch user profile when tokens change
  useEffect(() => {
    if (!initialLoadDone) return;
    
    if (tokens?.accessToken) {
      fetchProfile();
    } else {
      setUser(null);
      setIsLoading(false);
    }
  }, [tokens?.accessToken, initialLoadDone]);

  const fetchProfile = async () => {
    if (!tokens?.accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        if (data.user?.id) {
          localStorage.setItem('user_id', data.user.id);
        }
      } else if (response.status === 401) {
        // Token expired, try to refresh
        const refreshed = await refreshToken();
        if (!refreshed) {
          handleLogout();
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTokens = (newTokens: AuthTokens) => {
    // Add issuedAt timestamp if not present
    const tokensWithTimestamp = {
      ...newTokens,
      issuedAt: newTokens.issuedAt || Date.now(),
    };
    setTokens(tokensWithTimestamp);
    localStorage.setItem('auth_tokens', JSON.stringify(tokensWithTimestamp));
  };

  const clearTokens = () => {
    setTokens(null);
    setUser(null);
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('user_id');
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        saveTokens(data.tokens);
        setUser(data.user);
        if (data.user?.id) {
          localStorage.setItem('user_id', data.user.id);
        }
        return { success: true };
      } else {
        return { success: false, error: data.message || 'Logowanie nie powiodło się' };
      }
    } catch (error) {
      return { success: false, error: 'Błąd sieci. Spróbuj ponownie.' };
    }
  };

  const register = async (registerData: RegisterData): Promise<{ success: boolean; error?: string; verificationToken?: string }> => {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerData),
      });

      const data = await response.json();

      if (response.ok) {
        saveTokens(data.tokens);
        setUser(data.user);
        if (data.user?.id) {
          localStorage.setItem('user_id', data.user.id);
        }
        return { success: true, verificationToken: data.verificationToken };
      } else {
        return { success: false, error: data.message || 'Rejestracja nie powiodła się' };
      }
    } catch (error) {
      return { success: false, error: 'Błąd sieci. Spróbuj ponownie.' };
    }
  };

  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (!tokens?.refreshToken) return false;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        saveTokens(data.tokens);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [tokens?.refreshToken]);

  const handleLogout = () => {
    clearTokens();
  };

  const logout = async () => {
    if (tokens?.accessToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      } catch {
        // Ignore errors on logout
      }
    }
    handleLogout();
  };

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!tokens?.accessToken || !tokens?.expiresIn) return;

    // Calculate time until token expires
    const issuedAt = tokens.issuedAt || Date.now();
    const expiresAt = issuedAt + tokens.expiresIn * 1000;
    const now = Date.now();
    
    // Refresh 1 minute before expiry
    const refreshTime = expiresAt - now - 60 * 1000;
    
    // If token already expired or will expire very soon, refresh now
    if (refreshTime <= 0) {
      refreshToken();
      return;
    }

    const timeout = setTimeout(() => {
      refreshToken();
    }, refreshTime);

    return () => clearTimeout(timeout);
  }, [tokens, refreshToken]);

  // Set tokens from OAuth callback
  const setTokensFromOAuth = useCallback(async (accessToken: string, refreshToken: string): Promise<void> => {
    const newTokens: AuthTokens = {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 60 minutes
      issuedAt: Date.now(),
    };
    saveTokens(newTokens);
  }, []);

  // Delete account permanently
  const deleteAccount = async (password: string): Promise<{ success: boolean; error?: string }> => {
    if (!tokens?.accessToken) {
      return { success: false, error: 'Nie zalogowany' };
    }

    try {
      const response = await fetch(`${API_URL}/auth/delete-account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Clear user data and tokens
        clearTokens();
        return { success: true };
      } else {
        return { success: false, error: data.message || 'Usunięcie konta nie powiodło się' };
      }
    } catch (error) {
      return { success: false, error: 'Błąd sieci. Spróbuj ponownie.' };
    }
  };

  // Expose fetchProfile as refreshProfile
  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [tokens?.accessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshToken,
        refreshProfile,
        setTokens: setTokensFromOAuth,
        deleteAccount,
      }}
    >
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
