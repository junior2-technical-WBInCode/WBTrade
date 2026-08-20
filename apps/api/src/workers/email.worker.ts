/**
 * Email Worker
 * Processes email sending jobs from the queue
 */

import { Worker, Job } from 'bullmq';
import { Resend } from 'resend';
import { QUEUE_NAMES, queueConnection } from '../lib/queue';

// Structured logger (console only, no file)
function debugLog(msg: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EmailWorker] ${msg}`);
  }
}

// HTML entity escaping to prevent XSS in email templates
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Lazy-init Resend to avoid crash when RESEND_API_KEY is not yet loaded
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY || '');
  }
  return resend;
}
const FROM_EMAIL = process.env.FROM_EMAIL || 'WBTrade <noreply@wb-trade.pl>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wb-trade.pl';

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

// Helper function to wrap email content with logo header
const wrapWithLogo = (title: string, content: string) => `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header with Logo -->
    <tr>
      <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; text-align: center;">
        <img src="${SITE_URL}/images/WB-TRADE-logo.png" alt="WBTrade" style="height: 45px; width: auto; margin-bottom: 15px;" />
        <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 30px;">
        ${content}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">
          Pozdrawiamy,<br><strong>Zespół WB Trade</strong>
        </p>
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          Ten email został wysłany automatycznie. Nie odpowiadaj na niego.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

// Email templates
export const EMAIL_TEMPLATES: Record<string, (context: Record<string, any>) => { subject: string; html: string; text: string }> = {
  'order-confirmation': (ctx) => ({
    subject: `Potwierdzenie zamówienia #${escapeHtml(ctx.orderId)}`,
    html: wrapWithLogo('Dziękujemy za zamówienie!', `
      <p style="font-size: 16px; color: #333;">Twoje zamówienie <strong>#${escapeHtml(ctx.orderId)}</strong> zostało przyjęte.</p>
      <p style="font-size: 16px; color: #555;">Wartość zamówienia: <strong>${escapeHtml(String(ctx.total))} PLN</strong></p>
      <p style="font-size: 16px; color: #555;">Status: <strong>${escapeHtml(ctx.status)}</strong></p>
    `),
    text: `Dziękujemy za zamówienie! Zamówienie #${ctx.orderId}, wartość: ${ctx.total} PLN`,
  }),
  
  'order-shipped': (ctx) => ({
    subject: `Twoje zamówienie #${escapeHtml(ctx.orderId)} zostało wysłane`,
    html: wrapWithLogo('🚚 Twoja paczka jest w drodze!', `
      <p style="font-size: 16px; color: #333;">Zamówienie <strong>#${escapeHtml(ctx.orderId)}</strong> zostało wysłane.</p>
      ${ctx.trackingNumber ? `<p style="font-size: 16px; color: #555;">Numer przesyłki: <strong>${escapeHtml(ctx.trackingNumber)}</strong></p>` : ''}
      ${ctx.carrier ? `<p style="font-size: 16px; color: #555;">Przewoźnik: <strong>${escapeHtml(ctx.carrier)}</strong></p>` : ''}
      ${ctx.trackingUrl ? `<div style="text-align: center; margin: 25px 0;">
        <a href="${ctx.trackingUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: bold;">Śledź przesyłkę</a>
      </div>` : ''}
    `),
    text: `Zamówienie #${ctx.orderId} zostało wysłane.${ctx.trackingNumber ? ` Numer przesyłki: ${ctx.trackingNumber}` : ''}`,
  }),
  
  'password-reset': (ctx) => ({
    subject: 'Reset hasła - WBTrade',
    html: wrapWithLogo('🔐 Reset hasła', `
      <p style="font-size: 16px; color: #333;">Otrzymaliśmy prośbę o reset hasła do Twojego konta.</p>
      <p style="font-size: 16px; color: #555;">Kliknij poniższy przycisk, aby ustawić nowe hasło:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${ctx.resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: bold;">Resetuj hasło</a>
      </div>
      <p style="font-size: 14px; color: #888;">Link jest ważny przez 1 godzinę.</p>
    `),
    text: `Reset hasła. Link: ${ctx.resetUrl}. Ważny 1 godzinę.`,
  }),
  
  'email-verification': (ctx) => ({
    subject: 'Potwierdź swój email - WBTrade',
    html: wrapWithLogo('📧 Potwierdź swój email', `
      <p style="font-size: 18px; color: #333;">Witaj <strong>${escapeHtml(ctx.name)}</strong>!</p>
      <p style="font-size: 16px; color: #555;">Kliknij poniższy przycisk, aby potwierdzić swój adres email:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${ctx.verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: bold;">Potwierdź email</a>
      </div>
    `),
    text: `Potwierdź email: ${ctx.verifyUrl}`,
  }),
  
  'low-stock-alert': (ctx) => ({
    subject: `Niski stan magazynowy - ${ctx.productName}`,
    html: wrapWithLogo('⚠️ Niski stan magazynowy', `
      <p style="font-size: 16px; color: #333;"><strong>Produkt:</strong> ${escapeHtml(ctx.productName)}</p>
      <p style="font-size: 16px; color: #555;"><strong>SKU:</strong> ${escapeHtml(ctx.sku)}</p>
      <p style="font-size: 16px; color: #dc2626;"><strong>Aktualny stan:</strong> ${escapeHtml(String(ctx.currentStock))}</p>
      <p style="font-size: 16px; color: #555;"><strong>Minimum:</strong> ${escapeHtml(String(ctx.minimumStock))}</p>
    `),
    text: `Niski stan: ${ctx.productName} (${ctx.currentStock}/${ctx.minimumStock})`,
  }),
  
  'newsletter': (ctx) => ({
    subject: ctx.subject || 'Newsletter WBTrade',
    html: ctx.content || '',
    text: ctx.textContent || '',
  }),
};

/**
 * Send email using Resend
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  debugLog('sendEmail called');
  try {
    // If no API key configured, log only (development mode)
    if (!process.env.RESEND_API_KEY) {
      debugLog('No RESEND_API_KEY configured - skipping email send');
      return;
    }

    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[EmailWorker] Resend error:', error.message);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    debugLog(`Email sent successfully, ID: ${data?.id}`);
  } catch (error: any) {
    console.error('[EmailWorker] Failed to send email:', error.message);
    throw error;
  }
}

/**
 * Send email directly (synchronously) - use when worker is disabled
 * This is the fallback for when background workers are not running
 */
export async function sendEmailDirect(data: EmailJobData): Promise<void> {
  debugLog(`sendEmailDirect called, template: ${data.template}`);
  const { to, template, context } = data;
  
  const templateFn = EMAIL_TEMPLATES[template];
  if (!templateFn) {
    throw new Error(`Unknown email template: ${template}`);
  }
  
  const { subject, html, text } = templateFn(context);
  await sendEmail(to, subject, html, text);
  debugLog('sendEmailDirect complete');
}

/**
 * Create and start the email worker
 */
export function startEmailWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job: Job<EmailJobData>) => {
      console.log(`[EmailWorker] Processing job: ${job.name} (${job.id})`);
      
      const { to, template, context } = job.data;
      
      // Get template function
      const templateFn = EMAIL_TEMPLATES[template];
      
      if (!templateFn) {
        throw new Error(`Unknown email template: ${template}`);
      }
      
      // Generate email content
      const { subject, html, text } = templateFn(context);
      
      // Send email
      await sendEmail(to, subject, html, text);
      
      return { sent: true, to, template };
    },
    {
      connection: queueConnection,
      concurrency: 10, // Process up to 10 emails concurrently
    }
  );

  worker.on('completed', (job) => {
    console.log(`[EmailWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[EmailWorker] Worker error:', err);
  });

  console.log('✓ Email worker started');
  return worker;
}
