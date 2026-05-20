import { Request, Response } from 'express';
import { secureAuthService } from '../services/auth.service.secure';
import { getUserAgent } from '../middleware/auth.middleware.secure';

/**
 * Secure Auth Controller
 * Handles all authentication-related HTTP requests with full security features
 */
export class SecureAuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, newsletter,
              accountType, companyName, nip, companyStreet, companyCity, companyPostalCode, phone } = req.body;

      // Validate required fields
      if (!email || !password) {
        res.status(400).json({
          message: 'Email i hasło są wymagane',
          code: 'MISSING_FIELDS',
        });
        return;
      }

      const result = await secureAuthService.register({
        email,
        password,
        firstName,
        lastName,
        newsletter: !!newsletter,
        userAgent: getUserAgent(req),
        accountType,
        companyName,
        nip,
        companyStreet,
        companyCity,
        companyPostalCode,
        phone,
      });

      res.status(201).json({
        message: 'Rejestracja zakończona pomyślnie. Proszę zweryfikować email.',
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          emailVerified: result.user.emailVerified,
        },
        tokens: result.tokens,
        // In production, send verification token via email, not in response
        ...(process.env.NODE_ENV !== 'production' && {
          verificationToken: result.verificationToken,
        }),
      });
    } catch (error) {
      if (error instanceof Error) {
        // Handle specific errors
        if (error.message === 'Email already exists') {
          res.status(409).json({
            message: 'Konto z tym adresem email już istnieje',
            code: 'EMAIL_EXISTS',
          });
          return;
        }

        if (error.message.includes('Password')) {
          res.status(400).json({
            message: error.message,
            code: 'WEAK_PASSWORD',
          });
          return;
        }

        if (error.message.includes('Invalid email')) {
          res.status(400).json({
            message: error.message,
            code: 'INVALID_EMAIL',
          });
          return;
        }
      }

      console.error('Registration error', error instanceof Error ? error.message : error);
      res.status(500).json({
        message: 'Rejestracja nie powiodła się',
        code: 'REGISTRATION_ERROR',
      });
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          message: 'Email i hasło są wymagane',
          code: 'MISSING_FIELDS',
        });
        return;
      }

      const result = await secureAuthService.login({
        email,
        password,
        userAgent: getUserAgent(req),
      });

      res.json({
        message: 'Zalogowano pomyślnie',
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          emailVerified: result.user.emailVerified,
        },
        tokens: result.tokens,
        requiresEmailVerification: !result.user.emailVerified,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Account is locked') {
          res.status(423).json({
            message: 'Konto jest tymczasowo zablokowane z powodu zbyt wielu nieudanych prób logowania. Spróbuj ponownie później.',
            code: 'ACCOUNT_LOCKED',
          });
          return;
        }

        if (error.message === 'Invalid credentials') {
          res.status(401).json({
            message: 'Nieprawidłowy email lub hasło',
            code: 'INVALID_CREDENTIALS',
          });
          return;
        }
      }

      console.error('Login error:', error);
      res.status(500).json({
        message: 'Logowanie nie powiodło się',
        code: 'LOGIN_ERROR',
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          message: 'Token odświeżania jest wymagany',
          code: 'MISSING_TOKEN',
        });
        return;
      }

      const result = await secureAuthService.refreshToken({
        refreshToken,
        userAgent: getUserAgent(req),
      });

      res.json({
        message: 'Token odświeżony pomyślnie',
        tokens: result.tokens,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid or expired refresh token') {
          res.status(401).json({
            message: 'Nieprawidłowy lub wygasły token odświeżania',
            code: 'INVALID_REFRESH_TOKEN',
          });
          return;
        }

        if (error.message === 'Refresh token has been revoked') {
          res.status(401).json({
            message: 'Sesja została zakończona. Proszę zalogować się ponownie.',
            code: 'TOKEN_REVOKED',
          });
          return;
        }
      }

      console.error('Token refresh error:', error);
      res.status(500).json({
        message: 'Nie udało się odświeżyć tokena',
        code: 'REFRESH_ERROR',
      });
    }
  }

  /**
   * Logout current session
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];

      const { refreshToken } = req.body;

      if (!accessToken) {
        res.status(400).json({
          message: 'Token dostępu jest wymagany',
          code: 'MISSING_TOKEN',
        });
        return;
      }

      await secureAuthService.logout({
        accessToken,
        refreshToken,
      });

      res.json({
        message: 'Wylogowano pomyślnie',
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Always return success for logout to prevent token probing
      res.json({
        message: 'Wylogowano pomyślnie',
      });
    }
  }

  /**
   * Logout from all devices
   * POST /api/auth/logout-all
   */
  async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];

      await secureAuthService.logoutAll({
        userId: req.user.userId,
        currentAccessToken: accessToken || '',
      });

      res.json({
        message: 'Wylogowano ze wszystkich urządzeń pomyślnie',
      });
    } catch (error) {
      console.error('Logout all error:', error);
      res.status(500).json({
        message: 'Nie udało się wylogować ze wszystkich urządzeń',
        code: 'LOGOUT_ALL_ERROR',
      });
    }
  }

  /**
   * Verify email
   * POST /api/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          message: 'Token weryfikacyjny jest wymagany',
          code: 'MISSING_TOKEN',
        });
        return;
      }

      await secureAuthService.verifyEmail(token);

      res.json({
        message: 'Email zweryfikowany pomyślnie',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid or expired verification token') {
          res.status(400).json({
            message: 'Nieprawidłowy lub wygasły token weryfikacyjny',
            code: 'INVALID_TOKEN',
          });
          return;
        }
      }

      console.error('Email verification error:', error);
      res.status(500).json({
        message: 'Weryfikacja email nie powiodła się',
        code: 'VERIFICATION_ERROR',
      });
    }
  }

  /**
   * Resend verification email
   * POST /api/auth/resend-verification
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          message: 'Email jest wymagany',
          code: 'MISSING_EMAIL',
        });
        return;
      }

      const token = await secureAuthService.resendVerificationEmail(
        email
      );

      res.json({
        message: 'Email weryfikacyjny wysłany jeśli konto istnieje',
        // In production, send via email, not in response
        ...(process.env.NODE_ENV !== 'production' && { verificationToken: token }),
      });
    } catch {
      // Always return success to prevent user enumeration
      res.json({
        message: 'Email weryfikacyjny wysłany jeśli konto istnieje',
      });
    }
  }

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          message: 'Email jest wymagany',
          code: 'MISSING_EMAIL',
        });
        return;
      }

      const token = await secureAuthService.requestPasswordReset(
        email
      );

      res.json({
        message: 'Instrukcje resetowania hasła wysłane jeśli konto istnieje',
        // In production, send via email, not in response
        ...(process.env.NODE_ENV !== 'production' && { resetToken: token }),
      });
    } catch {
      // Always return success to prevent user enumeration
      res.json({
        message: 'Instrukcje resetowania hasła wysłane jeśli konto istnieje',
      });
    }
  }

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({
          message: 'Token i nowe hasło są wymagane',
          code: 'MISSING_FIELDS',
        });
        return;
      }

      await secureAuthService.resetPassword({
        token,
        newPassword: password,
      });

      res.json({
        message: 'Hasło zresetowane pomyślnie',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid or expired reset token') {
          res.status(400).json({
            message: 'Nieprawidłowy lub wygasły token resetowania',
            code: 'INVALID_TOKEN',
          });
          return;
        }

        if (error.message.includes('Password')) {
          res.status(400).json({
            message: error.message,
            code: 'WEAK_PASSWORD',
          });
          return;
        }
      }

      console.error('Password reset error:', error);
      res.status(500).json({
        message: 'Resetowanie hasła nie powiodło się',
        code: 'RESET_ERROR',
      });
    }
  }

  /**
   * Change password (authenticated)
   * POST /api/auth/change-password
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          message: 'Obecne hasło i nowe hasło są wymagane',
          code: 'MISSING_FIELDS',
        });
        return;
      }

      await secureAuthService.changePassword({
        userId: req.user.userId,
        currentPassword,
        newPassword,
      });

      res.json({
        message: 'Hasło zmienione pomyślnie',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Current password is incorrect') {
          res.status(400).json({
            message: 'Obecne hasło jest nieprawidłowe',
            code: 'WRONG_PASSWORD',
          });
          return;
        }

        if (error.message.includes('Password')) {
          res.status(400).json({
            message: error.message,
            code: 'WEAK_PASSWORD',
          });
          return;
        }
      }

      console.error('Change password error:', error);
      res.status(500).json({
        message: 'Zmiana hasła nie powiodła się',
        code: 'CHANGE_PASSWORD_ERROR',
      });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const user = await secureAuthService.getUserById(req.user.userId);

      if (!user) {
        res.status(404).json({
          message: 'Nie znaleziono użytkownika',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          companyName: user.companyName,
          nip: user.nip,
          companyStreet: user.companyStreet,
          companyCity: user.companyCity,
          companyPostalCode: user.companyPostalCode,
          b2bStatus: (user as any).b2bStatus || null,
          b2bPriceMultiplier: (user as any).b2bPriceMultiplier || null,
        },
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        message: 'Nie udało się pobrać profilu',
        code: 'PROFILE_ERROR',
      });
    }
  }

  /**
   * Get active sessions
   * GET /api/auth/sessions
   */
  async getSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const sessions = await secureAuthService.getActiveSessions(req.user.userId);

      res.json({
        sessions: sessions.map(session => ({
          id: session.id,
          deviceInfo: session.deviceInfo,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          isCurrent: session.id === req.user?.sessionId,
        })),
      });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({
        message: 'Nie udało się pobrać sesji',
        code: 'SESSIONS_ERROR',
      });
    }
  }

  /**
   * Revoke specific session
   * DELETE /api/auth/sessions/:sessionId
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { sessionId } = req.params;

      await secureAuthService.revokeSession(
        req.user.userId,
        sessionId
      );

      res.json({
        message: 'Sesja anulowana pomyślnie',
      });
    } catch (error) {
      console.error('Revoke session error:', error);
      res.status(500).json({
        message: 'Nie udało się anulować sesji',
        code: 'REVOKE_SESSION_ERROR',
      });
    }
  }
  /**
   * Delete user account permanently
   * DELETE /api/auth/delete-account
   */
  async deleteAccount(req: Request, res: Response): Promise<void> {
    console.log('[AUTH] Delete account request received');
    
    try {
      if (!req.user) {
        console.log('[AUTH] No user in request');
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({
          message: 'Hasło jest wymagane do usunięcia konta',
          code: 'PASSWORD_REQUIRED',
        });
        return;
      }

      await secureAuthService.deleteAccount(req.user.userId, password);

      res.json({
        message: 'Konto zostało trwale usunięte',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('incorrect')) {
          res.status(400).json({
            message: 'Nieprawidłowe hasło',
            code: 'INVALID_PASSWORD',
          });
          return;
        }
        if (error.message.includes('not found')) {
          res.status(404).json({
            message: 'Użytkownik nie znaleziony',
            code: 'USER_NOT_FOUND',
          });
          return;
        }
        if (error.message.includes('OAuth')) {
          res.status(400).json({
            message: 'Nie można usunąć konta OAuth bez ustawionego hasła',
            code: 'OAUTH_ACCOUNT',
          });
          return;
        }
      }
      console.error('Delete account error:', error);
      res.status(500).json({
        message: 'Usunięcie konta nie powiodło się',
        code: 'DELETE_ACCOUNT_ERROR',
      });
    }
  }
  /**
   * Update user profile
   * PATCH /api/auth/profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          message: 'Wymagane uwierzytelnienie',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { firstName, lastName, phone, companyName, nip, companyStreet, companyCity, companyPostalCode } = req.body;

      const updatedUser = await secureAuthService.updateProfile(req.user.userId, {
        firstName,
        lastName,
        phone,
        companyName,
        nip,
        companyStreet,
        companyCity,
        companyPostalCode,
      });

      res.json({
        message: 'Profil zaktualizowany pomyślnie',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          role: updatedUser.role,
          emailVerified: updatedUser.emailVerified,
          companyName: updatedUser.companyName,
          nip: updatedUser.nip,
          companyStreet: updatedUser.companyStreet,
          companyCity: updatedUser.companyCity,
          companyPostalCode: updatedUser.companyPostalCode,
        },
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        message: 'Aktualizacja profilu nie powiodła się',
        code: 'UPDATE_PROFILE_ERROR',
      });
    }
  }
}

export const secureAuthController = new SecureAuthController();
