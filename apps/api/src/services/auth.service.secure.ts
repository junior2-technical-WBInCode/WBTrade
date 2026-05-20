import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db';
import { UserRole } from '@prisma/client';
import { queueEmail } from '../lib/queue';
import { discountService } from './discount.service';
import { emailService } from './email.service';
import {
  blacklistToken,
  isTokenBlacklisted,
  recordFailedLogin,
  resetFailedLoginAttempts,
  lockAccount,
  isAccountLocked,
  storeEmailVerificationToken,
  verifyEmailToken,
  storePasswordResetToken,
  verifyPasswordResetToken,
  storeSession,
  deleteSession,
  deleteAllUserSessions,
} from '../lib/redis';
import {
  logLoginSuccess,
  logLoginFailed,
  logAccountLocked,
  logRegistration,
  logPasswordChanged,
  logSuspiciousActivity,
  checkSuspiciousLogin,
} from '../lib/audit';
import { validatePassword } from '../lib/validation';

// Structured logger (console only, dev mode only)
function debugLog(msg: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(msg);
  }
}

// ============================================
// CONFIGURATION - NO FALLBACKS IN PRODUCTION!
// ============================================

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    // Development fallbacks - NEVER use in production
    console.warn(`⚠️ WARNING: Using development fallback for ${key}`);
    const fallbacks: Record<string, string> = {
      JWT_ACCESS_SECRET: 'dev-access-secret-change-in-production-' + crypto.randomBytes(16).toString('hex'),
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-in-production-' + crypto.randomBytes(16).toString('hex'),
    };
    return fallbacks[key] || '';
  }
  return value;
}

const ACCESS_TOKEN_SECRET = getEnvOrThrow('JWT_ACCESS_SECRET');
const REFRESH_TOKEN_SECRET = getEnvOrThrow('JWT_REFRESH_SECRET');
const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SALT_ROUNDS = 12;

// Security settings
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes
const PASSWORD_MIN_LENGTH = 8;

// ============================================
// TYPES
// ============================================

interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  newsletter?: boolean;
  ipAddress?: string;
  userAgent?: string;
  // B2B fields
  accountType?: 'personal' | 'business';
  companyName?: string;
  nip?: string;
  companyStreet?: string;
  companyCity?: string;
  companyPostalCode?: string;
}

interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
  rememberMe?: boolean;
}

interface RefreshInput {
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LogoutInput {
  accessToken: string;
  refreshToken?: string;
  ipAddress?: string;
}

interface LogoutAllInput {
  userId: string;
  currentAccessToken: string;
  ipAddress?: string;
}

interface ResetPasswordInput {
  token: string;
  newPassword: string;
  ipAddress?: string;
}

interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt?: Date | null;
  // Company data fields
  companyName?: string | null;
  nip?: string | null;
  companyStreet?: string | null;
  companyCity?: string | null;
  companyPostalCode?: string | null;
  // B2B fields
  b2bStatus?: string;
  b2bPriceMultiplier?: number;
}

interface RegisterResult {
  user: UserResponse;
  tokens: AuthTokens;
  verificationToken?: string;
}

interface LoginResult {
  user: UserResponse;
  tokens: AuthTokens;
  warning?: string;
}

interface RefreshResult {
  tokens: AuthTokens;
}

interface Session {
  id: string;
  deviceInfo: string | null;
  createdAt: Date;
  expiresAt: Date;
}

// ============================================
// SECURE AUTH SERVICE
// ============================================

export class SecureAuthService {
  /**
   * Register a new user with full security checks
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const { email, password, firstName, lastName, phone, newsletter, ipAddress, userAgent,
            accountType, companyName, nip, companyStreet, companyCity, companyPostalCode } = input;

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors[0]);
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Basic email validation
    if (!normalizedEmail.includes('@') || normalizedEmail.length < 5) {
      throw new Error('Invalid email format');
    }

    // Check if user already exists (timing-safe)
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    // Use constant-time comparison to prevent timing attacks
    if (existingUser) {
      // Wait a random amount to prevent user enumeration
      await this.randomDelay();
      throw new Error('Email already exists');
    }

    // Hash password with high cost factor
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Determine if this is a B2B registration
    const isBusinessAccount = accountType === 'business';

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        phone: phone?.trim() || null,
        role: isBusinessAccount ? 'CUSTOMER' : 'CUSTOMER', // stays CUSTOMER until admin approves
        emailVerified: false,
        failedLoginAttempts: 0,
        // B2B fields
        ...(isBusinessAccount && {
          b2bStatus: 'PENDING',
          companyName: companyName?.trim() || null,
          nip: nip?.replace(/[\s-]/g, '') || null,
          companyStreet: companyStreet?.trim() || null,
          companyCity: companyCity?.trim() || null,
          companyPostalCode: companyPostalCode?.trim() || null,
        }),
      },
    });

    // Generate email verification token
    const verificationToken = this.generateSecureToken();
    await storeEmailVerificationToken(user.id, verificationToken);

    // Generate session and tokens for immediate login
    const sessionId = uuidv4();
    const tokens = await this.generateTokens(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId,
      },
      ipAddress,
      userAgent
    );

    // Log registration
    await logRegistration(user.id, normalizedEmail, ipAddress, userAgent);

    // Send verification email
    // Extract first URL from FRONTEND_URL (in case it contains multiple URLs separated by comma)
    const frontendUrl = (process.env.FRONTEND_URL || 'https://www.wb-trade.pl').split(',')[0].trim();
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    try {
      await queueEmail({
        to: normalizedEmail,
        subject: 'Potwierdź swój email - WBTrade',
        template: 'email-verification',
        context: {
          name: user.email.split('@')[0],
          verifyUrl,
        },
      });
    } catch (emailErr: any) {
      console.error('[SecureAuthService] Failed to send verification email:', emailErr.message);
      // Don't block registration if email fails
    }

    // Generate welcome discount code and send email (async, don't block registration)
    // Skip for B2B accounts — they don't get personal discount coupons
    if (!isBusinessAccount) {
      debugLog('[SecureAuthService] Starting welcome discount...');
      this.sendWelcomeDiscount(user.id, user.email, user.firstName || '').catch((err) => {
        console.error('[SecureAuthService] Failed to send welcome discount:', err.message);
      });
    }

    // If user opted in for newsletter, auto-subscribe and generate newsletter discount
    if (newsletter) {
      this.subscribeToNewsletter(user.id, normalizedEmail, user.firstName || '').catch((err) => {
        console.error('[SecureAuthService] Failed to subscribe to newsletter:', err.message);
      });
    }

    return {
      user: this.sanitizeUser(user),
      tokens,
      verificationToken: process.env.NODE_ENV !== 'production' ? verificationToken : undefined, // Only in dev
    };
  }

  /**
   * Generate welcome discount and send email
   * Called after successful registration (async)
   */
  private async sendWelcomeDiscount(userId: string, email: string, firstName: string): Promise<void> {
    try {
      debugLog('[SecureAuthService] Generating discount...');
      const discount = await discountService.generateWelcomeDiscount(userId, email);
      debugLog('[SecureAuthService] Discount generated');
      
      debugLog('[SecureAuthService] Sending welcome email...');
      const result = await emailService.sendWelcomeDiscountEmail(
        email,
        firstName || email.split('@')[0],
        discount.couponCode,
        discount.discountPercent,
        discount.expiresAt
      );
      
      if (result.success) {
        debugLog('✅ [SecureAuthService] Welcome discount sent successfully');
      } else {
        console.error('❌ [SecureAuthService] Welcome email failed:', result.error);
      }
    } catch (err: any) {
      console.error('[SecureAuthService] Welcome discount error:', err.message);
      // Don't throw - registration should succeed even if discount email fails
    }
  }

  /**
   * Subscribe user to newsletter during registration
   * Creates newsletter_subscriptions record (auto-verified) and generates NEWS-XXXXXX discount code
   */
  private async subscribeToNewsletter(userId: string, email: string, firstName: string): Promise<void> {
    try {
      debugLog('[SecureAuthService] Subscribing to newsletter...');

      // Check if already subscribed
      const existing = await prisma.newsletter_subscriptions.findUnique({
        where: { email },
      });

      const token = this.generateSecureToken();

      if (existing) {
        // Re-activate if previously unsubscribed
        if (existing.unsubscribed_at) {
          await prisma.newsletter_subscriptions.update({
            where: { email },
            data: {
              is_verified: true,
              verified_at: new Date(),
              unsubscribed_at: null,
              token,
            },
          });
        }
      } else {
        // Create new subscription (auto-verified since user just registered)
        await prisma.newsletter_subscriptions.create({
          data: {
            id: uuidv4(),
            email,
            token,
            is_verified: true,
            verified_at: new Date(),
          },
        });
      }

      // Generate newsletter discount code
      const discount = await discountService.generateNewsletterDiscount(email, userId);
      debugLog('✅ [SecureAuthService] Newsletter subscription + discount created');

      // Send newsletter welcome email with discount code
      await emailService.sendNewsletterWelcomeEmail(email, token);
    } catch (err: any) {
      console.error('[SecureAuthService] Newsletter subscription error:', err.message);
      // Don't throw - registration should succeed even if newsletter subscription fails
    }
  }

  /**
   * Login with full security checks
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const { email, password, ipAddress, userAgent, rememberMe } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if account is locked (in Redis)
    const lockStatus = await isAccountLocked(normalizedEmail);
    if (lockStatus.locked) {
      await logLoginFailed(normalizedEmail, 'Account locked', ipAddress, userAgent);
      throw new Error(`Account is temporarily locked. Please try again in ${Math.ceil(lockStatus.ttl / 60)} minutes.`);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Check if user exists and has a password (OAuth users don't have passwords)
    if (user && !user.password) {
      throw new Error('This account uses Google login. Please sign in with Google.');
    }

    // Always hash password to prevent timing attacks (even if user doesn't exist)
    const dummyHash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.4Oo4AAhJ5gZZ2i';
    const passwordToCompare = user?.password || dummyHash;
    const isValidPassword = await bcrypt.compare(password, passwordToCompare);

    if (!user || !isValidPassword) {
      // Record failed attempt
      const attempts = await recordFailedLogin(normalizedEmail);
      
      // Update user failed attempts in DB if user exists
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
        });
      }

      // Lock account after max attempts
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        await lockAccount(normalizedEmail, LOCKOUT_DURATION_SECONDS);
        await logAccountLocked(normalizedEmail, 'Too many failed attempts', LOCKOUT_DURATION_SECONDS, ipAddress);
        
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_SECONDS * 1000) },
          });
        }
        
        throw new Error('Account has been temporarily locked due to too many failed login attempts.');
      }

      await logLoginFailed(normalizedEmail, 'Invalid credentials', ipAddress, userAgent, attempts);
      
      // Generic error message (don't reveal if email exists)
      throw new Error('Invalid email or password');
    }

    // Check if account is active
    if (!user.isActive) {
      await logLoginFailed(normalizedEmail, 'Account deactivated', ipAddress, userAgent);
      throw new Error('This account has been deactivated. Please contact support.');
    }

    // Check if account is locked in DB
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await logLoginFailed(normalizedEmail, 'Account locked (DB)', ipAddress, userAgent);
      throw new Error(`Account is temporarily locked. Please try again in ${remainingMinutes} minutes.`);
    }

    // Check for suspicious login patterns
    let warning: string | undefined;
    if (ipAddress) {
      const suspiciousCheck = await checkSuspiciousLogin(user.id, ipAddress);
      if (suspiciousCheck.suspicious) {
        await logSuspiciousActivity(
          suspiciousCheck.reason || 'Suspicious login',
          normalizedEmail,
          user.id,
          ipAddress
        );
        warning = 'We noticed this login is from a new location. If this wasn\'t you, please change your password immediately.';
      }
    }

    // Reset failed attempts on successful login
    await resetFailedLoginAttempts(normalizedEmail);
    
    // Update user login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Generate session and tokens
    const sessionId = uuidv4();
    const tokens = await this.generateTokens(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId,
      },
      ipAddress,
      userAgent,
      rememberMe
    );

    // Log successful login
    await logLoginSuccess(user.id, normalizedEmail, ipAddress, userAgent);

    return {
      user: this.sanitizeUser(user),
      tokens,
      warning,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(input: RefreshInput): Promise<RefreshResult> {
    const { refreshToken, ipAddress, userAgent } = input;

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      throw new Error('Refresh token has been revoked');
    }

    // Verify refresh token
    let payload: TokenPayload;
    try {
      payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as TokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Invalid or expired refresh token');
      }
      throw new Error('Invalid or expired refresh token');
    }

    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new Error('Invalid or expired refresh token');
    }

    // Blacklist old refresh token (token rotation)
    await blacklistToken(refreshToken, REFRESH_TOKEN_EXPIRY_SECONDS);

    // Generate new tokens with new session
    const newSessionId = uuidv4();
    const tokens = await this.generateTokens(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId: newSessionId,
      },
      ipAddress,
      userAgent
    );

    return { tokens };
  }

  /**
   * Logout - revoke tokens
   */
  async logout(input: LogoutInput): Promise<void> {
    const { accessToken, refreshToken, ipAddress } = input;

    // Blacklist access token
    await blacklistToken(accessToken, 15 * 60); // 15 minutes

    // Blacklist refresh token if provided
    if (refreshToken) {
      await blacklistToken(refreshToken, REFRESH_TOKEN_EXPIRY_SECONDS);
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(input: LogoutAllInput): Promise<void> {
    const { userId, currentAccessToken, ipAddress } = input;
    
    // Blacklist current access token
    await blacklistToken(currentAccessToken, 15 * 60);
    
    // Delete all user sessions
    await deleteAllUserSessions(userId);
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    // Check blacklist
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new Error('Token has been revoked');
    }

    try {
      const payload = jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenPayload;
      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      }
      throw new Error('Invalid access token');
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    const userId = await verifyEmailToken(token);
    
    if (!userId) {
      throw new Error('Invalid or expired verification token');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(
    email: string,
    ipAddress?: string
  ): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find user (don't reveal if exists)
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    // Always return same message (prevent user enumeration)
    const message = 'If an account exists with this email, you will receive a password reset link.';

    if (user) {
      // Generate secure reset token
      const resetToken = this.generateSecureToken();
      await storePasswordResetToken(user.id, resetToken);

      // Send reset email
      const frontendUrl = (process.env.FRONTEND_URL || 'https://www.wb-trade.pl').split(',')[0].trim();
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
      await queueEmail({
        to: user.email,
        subject: 'Reset hasła - WBTrade',
        template: 'password-reset',
        context: {
          resetUrl,
        },
      });

      // For development, log the token
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
      }
    }

    // Add random delay to prevent timing attacks
    await this.randomDelay();

    return { message };
  }

  /**
   * Reset password with token
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const { token, newPassword, ipAddress } = input;

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors[0]);
    }

    // Verify reset token
    const userId = await verifyPasswordResetToken(token);
    if (!userId) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Invalidate all existing sessions
    await deleteAllUserSessions(userId);

    // Log password change
    await logPasswordChanged(userId, user.email, 'reset', ipAddress);
  }

  /**
   * Change password (for authenticated users)
   */
  async changePassword(input: ChangePasswordInput): Promise<void> {
    const { userId, currentPassword, newPassword, ipAddress } = input;

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors[0]);
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // OAuth users cannot change password this way
    if (!user.password) {
      throw new Error('Password change not available for OAuth accounts');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new Error('New password must be different from current password');
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Log password change
    await logPasswordChanged(userId, user.email, 'change', ipAddress);
  }

  /**
   * Get user by ID (for middleware and profile)
   */
  async getUserById(userId: string): Promise<UserResponse | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    return {
      ...this.sanitizeUser(user),
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<Session[]> {
    // In a real implementation, this would query Redis for active sessions
    // For now, we'll return a placeholder
    // TODO: Implement proper session tracking in Redis
    return [];
  }

  /**
   * Revoke specific session
   */
  async revokeSession(userId: string, sessionId: string, ipAddress?: string): Promise<void> {
    await deleteSession(userId, sessionId);
  }

  /**
   * Resend email verification
   */
  async resendVerificationEmail(email: string, ipAddress?: string): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user || user.emailVerified) {
      // Don't reveal if user exists
      return null;
    }

    // Generate new verification token
    const verificationToken = this.generateSecureToken();
    await storeEmailVerificationToken(user.id, verificationToken);

    // Send verification email
    const frontendUrl = (process.env.FRONTEND_URL || 'https://www.wb-trade.pl').split(',')[0].trim();
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    await queueEmail({
      to: user.email,
      subject: 'Potwierdź swój email - WBTrade',
      template: 'email-verification',
      context: {
        name: user.email.split('@')[0],
        verifyUrl,
      },
    });

    // For development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Verification token for ${user.email}: ${verificationToken}`);
    }

    return verificationToken;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    payload: Omit<TokenPayload, 'iat' | 'exp'>,
    ipAddress?: string,
    userAgent?: string,
    rememberMe?: boolean
  ): Promise<AuthTokens> {
    const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshTokenExpiry = rememberMe ? 30 * 24 * 60 * 60 : REFRESH_TOKEN_EXPIRY_SECONDS;
    const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, {
      expiresIn: refreshTokenExpiry,
    });

    // Store session in Redis (IP address intentionally not stored per privacy policy)
    await storeSession(
      payload.userId,
      payload.sessionId,
      { userAgent, createdAt: new Date().toISOString() },
      refreshTokenExpiry
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Generate cryptographically secure token
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Random delay to prevent timing attacks
   */
  private async randomDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * 200) + 100; // 100-300ms
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Delete user account permanently
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has password (not OAuth-only account)
    if (!user.password) {
      throw new Error('Cannot delete account - no password set (OAuth account?)');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Password is incorrect');
    }

    // Delete all related data in transaction
    await prisma.$transaction(async (tx) => {
      // Delete cart items and carts
      await tx.cartItem.deleteMany({ where: { cart: { userId } } });
      await tx.cart.deleteMany({ where: { userId } });

      // Delete wishlist items
      await tx.wishlistItem.deleteMany({ where: { userId } });

      // Delete addresses
      await tx.address.deleteMany({ where: { userId } });

      // Delete newsletter subscriptions
      await tx.newsletter_subscriptions.deleteMany({ where: { email: user.email } });

      // Delete user coupons (welcome discount etc.)
      await tx.coupon.deleteMany({ where: { userId } });

      // Finally delete the user (orders remain with userId = null)
      await tx.user.delete({ where: { id: userId } });
    });

    // Delete all sessions from Redis
    await deleteAllUserSessions(userId);

    console.log(`[SecureAuthService] Account deleted: ${user.email}`);
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: UserRole;
    emailVerified: boolean;
    createdAt: Date;
    password?: string | null;
    failedLoginAttempts?: number;
    lockedUntil?: Date | null;
    companyName?: string | null;
    nip?: string | null;
    companyStreet?: string | null;
    companyCity?: string | null;
    companyPostalCode?: string | null;
    b2bStatus?: any;
    b2bPriceMultiplier?: any;
  }): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      companyName: user.companyName,
      nip: user.nip,
      companyStreet: user.companyStreet,
      companyCity: user.companyCity,
      companyPostalCode: user.companyPostalCode,
      b2bStatus: user.b2bStatus || undefined,
      b2bPriceMultiplier: user.b2bPriceMultiplier ? Number(user.b2bPriceMultiplier) : undefined,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      companyName?: string;
      nip?: string;
      companyStreet?: string;
      companyCity?: string;
      companyPostalCode?: string;
    }
  ): Promise<UserResponse> {
    // Filter out undefined values
    const updateData: Record<string, any> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.companyName !== undefined) updateData.companyName = data.companyName || null;
    if (data.nip !== undefined) updateData.nip = data.nip ? data.nip.replace(/[^0-9]/g, '') : null;
    if (data.companyStreet !== undefined) updateData.companyStreet = data.companyStreet || null;
    if (data.companyCity !== undefined) updateData.companyCity = data.companyCity || null;
    if (data.companyPostalCode !== undefined) updateData.companyPostalCode = data.companyPostalCode || null;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return this.sanitizeUser(user);
  }
}

// Export singleton instance
export const secureAuthService = new SecureAuthService();
