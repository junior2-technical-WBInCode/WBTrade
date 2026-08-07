import { prisma } from '../db';

// ============================================
// SECURITY AUDIT LOGGING
// ============================================

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGIN_BLOCKED = 'LOGIN_BLOCKED',
  LOGOUT = 'LOGOUT',
  
  // Registration events
  REGISTER_SUCCESS = 'REGISTER_SUCCESS',
  REGISTER_FAILED = 'REGISTER_FAILED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  
  // Password events
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_RESET_FAILED = 'PASSWORD_RESET_FAILED',
  
  // Account events
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  
  // Token events
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  
  // Security events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Contact events
  CONTACT_FORM_SENT = 'CONTACT_FORM_SENT',
  CONTACT_FORM_FAILED = 'CONTACT_FORM_FAILED',

  // Partner program admin events
  PARTNER_UPLINE_ATTACHED = 'PARTNER_UPLINE_ATTACHED',
  PARTNER_UPLINE_DETACHED = 'PARTNER_UPLINE_DETACHED',
  PARTNER_STATUS_CHANGED = 'PARTNER_STATUS_CHANGED',
  PARTNER_RANK_CHANGED = 'PARTNER_RANK_CHANGED',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

interface AuditLogData {
  action: AuditAction;
  userId?: string;
  email?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
  success?: boolean;
}

/**
 * Log security audit event
 */
export async function logAuditEvent(data: AuditLogData): Promise<void> {
  const {
    action,
    userId,
    email,
    userAgent,
    metadata,
    severity = AuditSeverity.INFO,
    success = true,
  } = data;

  try {
    // Log to database (IP address intentionally not stored per privacy policy)
    await prisma.securityAuditLog.create({
      data: {
        action,
        userId,
        email,
        userAgent,
        metadata: metadata ? JSON.stringify(metadata) : null,
        severity,
        success,
        createdAt: new Date(),
      },
    });

    // Also log to console for immediate visibility
    const logLevel = severity === AuditSeverity.CRITICAL ? 'error' :
                     severity === AuditSeverity.ERROR ? 'error' :
                     severity === AuditSeverity.WARNING ? 'warn' : 'info';
    
    console[logLevel](`[AUDIT] ${action}`, {
      userId,
      email,
      success,
      severity,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error('Failed to log audit event:', error);
  }
}

/**
 * Log successful login
 */
export async function logLoginSuccess(
  userId: string,
  email: string,
  _ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.LOGIN_SUCCESS,
    userId,
    email,
    userAgent,
    severity: AuditSeverity.INFO,
    success: true,
  });
}

/**
 * Log failed login attempt
 */
export async function logLoginFailed(
  email: string,
  reason: string,
  _ipAddress?: string,
  userAgent?: string,
  attemptCount?: number
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.LOGIN_FAILED,
    email,
    userAgent,
    metadata: { reason, attemptCount },
    severity: attemptCount && attemptCount >= 3 ? AuditSeverity.WARNING : AuditSeverity.INFO,
    success: false,
  });
}

/**
 * Log account lockout
 */
export async function logAccountLocked(
  email: string,
  reason: string,
  duration: number,
  _ipAddress?: string
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.ACCOUNT_LOCKED,
    email,
    metadata: { reason, durationSeconds: duration },
    severity: AuditSeverity.WARNING,
    success: true,
  });
}

/**
 * Log registration
 */
export async function logRegistration(
  userId: string,
  email: string,
  _ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.REGISTER_SUCCESS,
    userId,
    email,
    userAgent,
    severity: AuditSeverity.INFO,
    success: true,
  });
}

/**
 * Log password change
 */
export async function logPasswordChanged(
  userId: string,
  email: string,
  method: 'change' | 'reset',
  _ipAddress?: string
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.PASSWORD_CHANGED,
    userId,
    email,
    metadata: { method },
    severity: AuditSeverity.INFO,
    success: true,
  });
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  description: string,
  email?: string,
  userId?: string,
  _ipAddress?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.SUSPICIOUS_ACTIVITY,
    userId,
    email,
    metadata: { description, ...metadata },
    severity: AuditSeverity.CRITICAL,
    success: false,
  });
}

/**
 * Get recent audit logs for user
 */
export async function getUserAuditLogs(
  userId: string,
  limit = 50
): Promise<Array<{
  action: string;
  createdAt: Date;
  success: boolean;
}>> {
  const logs = await prisma.securityAuditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      action: true,
      createdAt: true,
      success: true,
    },
  });

  return logs;
}

/**
 * Get failed login attempts for email
 */
export async function getFailedLoginAttempts(
  email: string,
  since: Date
): Promise<number> {
  const count = await prisma.securityAuditLog.count({
    where: {
      email,
      action: AuditAction.LOGIN_FAILED,
      createdAt: { gte: since },
    },
  });

  return count;
}

/**
 * Check for suspicious login patterns
 */
/**
 * Check for suspicious login patterns
 * Note: IP-based checks removed per privacy policy — IP addresses are not stored.
 */
export async function checkSuspiciousLogin(
  _userId: string,
  _ipAddress: string
): Promise<{
  suspicious: boolean;
  reason?: string;
}> {
  // IP-based suspicious login detection disabled per privacy policy.
  // IP addresses are not stored or compared.
  return { suspicious: false };
}
