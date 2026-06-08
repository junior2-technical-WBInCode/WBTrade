import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { UserRole } from '@prisma/client';
import { discountService } from './discount.service';
import { emailService } from './email.service';

// Types
interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  // B2B fields
  accountType?: 'personal' | 'business';
  companyName?: string;
  nip?: string;
  companyStreet?: string;
  companyCity?: string;
  companyPostalCode?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
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
  createdAt: Date;
  // Company data fields
  companyName?: string | null;
  nip?: string | null;
  companyStreet?: string | null;
  companyCity?: string | null;
  companyPostalCode?: string | null;
  // B2B fields
  b2bStatus?: string | null;
  b2bPriceMultiplier?: any;
  b2bWholesalerRules?: any;
}

// Constants
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_EXPIRY = '7d';
const SALT_ROUNDS = 12;

// Token blacklist (in production use Redis)
const tokenBlacklist = new Set<string>();

export class AuthService {
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Determine if this is a B2B registration
    const isBusinessAccount = data.accountType === 'business';

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: 'CUSTOMER',
        // B2B fields
        ...(isBusinessAccount && {
          companyName: data.companyName,
          nip: data.nip,
          companyStreet: data.companyStreet,
          companyCity: data.companyCity,
          companyPostalCode: data.companyPostalCode,
          b2bStatus: 'PENDING',
        }),
      },
    });

    // Generate tokens
    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Generate welcome discount code and send email (async, don't block registration)
    // Skip for B2B accounts - they don't get welcome discount
    if (!isBusinessAccount) {
      this.sendWelcomeDiscount(user.id, user.email, user.firstName).catch((err) => {
        console.error('[AuthService] Failed to send welcome discount:', err.message);
      });
    }

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Generate welcome discount and send email
   * Called after successful registration (async)
   */
  private async sendWelcomeDiscount(userId: string, email: string, firstName: string): Promise<void> {
    try {
      const discount = await discountService.generateWelcomeDiscount(userId, email);
      
      await emailService.sendWelcomeDiscountEmail(
        email,
        firstName,
        discount.couponCode,
        discount.discountPercent,
        discount.expiresAt
      );
      
      console.log(`✅ [AuthService] Welcome discount sent to ${email}: ${discount.couponCode}`);
    } catch (err: any) {
      console.error(`[AuthService] Welcome discount error for ${email}:`, err.message);
      // Don't throw - registration should succeed even if discount email fails
    }
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated. Please contact support.');
    }

    // OAuth users don't have password
    if (!user.password) {
      throw new Error('This account uses Google login. Please sign in with Google.');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    // Check if token is blacklisted
    if (tokenBlacklist.has(refreshToken)) {
      throw new Error('Token has been revoked');
    }

    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as TokenPayload;

      // Check if user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Blacklist old refresh token
      tokenBlacklist.add(refreshToken);

      // Generate new tokens
      return this.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Logout - blacklist token
   */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    // Blacklist access token
    tokenBlacklist.add(accessToken);

    // Blacklist refresh token if provided
    if (refreshToken) {
      tokenBlacklist.add(refreshToken);
    }
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): TokenPayload {
    // Check blacklist
    if (tokenBlacklist.has(token)) {
      throw new Error('Token has been revoked');
    }

    try {
      return jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserResponse | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Forgot password - generate reset token
   */
  async forgotPassword(email: string): Promise<{ resetToken: string; expiresAt: Date }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal if email exists
      throw new Error('If this email exists, a reset link will be sent');
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'password-reset' },
      ACCESS_TOKEN_SECRET,
      { expiresIn: '1h' }
    );

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // In production: send email with reset link
    // await emailService.sendPasswordResetEmail(user.email, resetToken);

    return { resetToken, expiresAt };
  }

  /**
   * Reset password using token
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    try {
      const payload = jwt.verify(resetToken, ACCESS_TOKEN_SECRET) as {
        userId: string;
        purpose: string;
      };

      if (payload.purpose !== 'password-reset') {
        throw new Error('Invalid reset token');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

      // Update password
      await prisma.user.update({
        where: { id: payload.userId },
        data: { password: hashedPassword },
      });

      // Blacklist the reset token
      tokenBlacklist.add(resetToken);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Reset token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid reset token');
      }
      throw error;
    }
  }

  /**
   * Change password (for logged in users)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // OAuth users cannot change password
    if (!user.password) {
      throw new Error('Password change not available for OAuth accounts');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
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
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return this.sanitizeUser(user);
  }

  /**
   * Delete user account permanently
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify password
    if (!user.password) {
      throw new Error('Cannot delete account - no password set (OAuth account?)');
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Password is incorrect');
    }

    // Delete user and related data (cascade should handle most relations)
    // But we'll explicitly delete some things for safety
    await prisma.$transaction(async (tx) => {
      // Delete cart items
      await tx.cartItem.deleteMany({
        where: { cart: { userId } },
      });

      // Delete carts
      await tx.cart.deleteMany({
        where: { userId },
      });

      // Delete wishlist items (WishlistItem has direct userId)
      await tx.wishlistItem.deleteMany({
        where: { userId },
      });

      // Delete addresses
      await tx.address.deleteMany({
        where: { userId },
      });

      // Delete newsletter subscription if exists
      await tx.newsletter_subscriptions.deleteMany({
        where: { email: user.email },
      });

      // Delete coupons created for this user
      await tx.coupon.deleteMany({
        where: { userId },
      });

      // Don't delete orders - keep them for records but anonymize
      // Note: We can't update fields that don't exist, so we just set userId to null or leave them
      // Orders have customerEmail etc. which are separate from user relation
      
      // Finally delete the user (cascade will handle remaining relations)
      await tx.user.delete({
        where: { id: userId },
      });
    });
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Generate access and refresh tokens
   */
  private generateTokens(payload: TokenPayload): AuthTokens {
    const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
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
    createdAt: Date;
    password?: string | null;
    companyName?: string | null;
    nip?: string | null;
    companyStreet?: string | null;
    companyCity?: string | null;
    companyPostalCode?: string | null;
    b2bStatus?: string | null;
    b2bPriceMultiplier?: any;
    b2bWholesalerRules?: any;
  }): UserResponse {
    const { password, ...sanitized } = user;
    return sanitized as UserResponse;
  }
}

// Export singleton instance
export const authService = new AuthService();
