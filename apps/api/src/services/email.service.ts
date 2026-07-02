import { Resend } from 'resend';
import { discountService } from './discount.service';

// ============================================
// EMAIL SERVICE — Redesigned Templates
// Wysyłka emaili przez Resend
// ============================================

function debugLog(msg: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EmailService] ${msg}`);
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'WBTrade <noreply@wb-trade.pl>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wb-trade.pl';

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================
// SHARED DESIGN SYSTEM
// ============================================

const LOGO_URL = process.env.EMAIL_LOGO_URL || `${SITE_URL}/images/WB-TRADE-logo.png`;
const YEAR = new Date().getFullYear();

function emailWrapper(opts: {
  title: string;
  headerColor?: string;
  content: string;
  footerNote?: string;
  footerExtra?: string;
}): string {
  const headerBg = opts.headerColor || 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
  const isGradient = headerBg.includes('gradient');
  const bgStyle = isGradient ? `background: ${headerBg};` : `background-color: ${headerBg};`;
  const footerNote = opts.footerNote || 'Ten email został wysłany automatycznie.';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- HEADER -->
          <tr>
            <td style="${bgStyle} padding: 36px 40px 28px; text-align: center;">
              <p style="margin: 0 0 16px; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: 1px;">WB-Trade</p>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">${opts.title}</h1>
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="background-color: #ffffff; padding: 36px 40px;">
              ${opts.content}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px 40px; text-align: center;">
              <p style="margin: 0 0 6px; color: #cbd5e1; font-size: 13px; font-weight: 600;">Zespół WB Trade</p>
              <p style="margin: 0 0 12px; color: #64748b; font-size: 12px;">${footerNote}</p>
              ${opts.footerExtra || ''}
              <p style="margin: 0; color: #475569; font-size: 11px;">© ${YEAR} WBTrade - <a href="${SITE_URL}" style="color: #f97316; text-decoration: none;">wb-trade.pl</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, href: string, color?: string): string {
  const bg = color || 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
  const isGrad = bg.includes('gradient');
  const bgProp = isGrad ? `background: ${bg};` : `background-color: ${bg};`;
  return `<div style="text-align: center; margin: 32px 0 8px;">
  <a href="${href}" style="display: inline-block; ${bgProp} color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: 0.3px; mso-padding-alt: 14px 36px;">${text}</a>
</div>`;
}

function infoBox(content: string, borderColor?: string): string {
  const border = borderColor || '#f97316';
  return `<div style="background-color: #f8fafc; border-left: 4px solid ${border}; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0;">
  ${content}
</div>`;
}

function alertBox(content: string, type: 'warning' | 'error' | 'success' | 'info' = 'warning'): string {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
    success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  };
  const c = colors[type];
  return `<div style="background-color: ${c.bg}; border-left: 4px solid ${c.border}; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 20px 0;">
  <p style="margin: 0; color: ${c.text}; font-size: 14px; line-height: 1.5;">${content}</p>
</div>`;
}

function greeting(name: string): string {
  return `<p style="font-size: 17px; color: #1e293b; margin: 0 0 16px; line-height: 1.5;">Cześć <strong>${escapeHtml(name)}</strong>,</p>`;
}

function paragraph(text: string): string {
  return `<p style="font-size: 15px; color: #334155; line-height: 1.7; margin: 0 0 16px;">${text}</p>`;
}

function divider(): string {
  return `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`;
}

function helpSection(email?: string): string {
  const addr = email || 'support@wb-partners.pl';
  return `${divider()}
<p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">Masz pytania? Napisz do nas: <a href="mailto:${addr}" style="color: #f97316; text-decoration: none; font-weight: 600;">${addr}</a></p>`;
}

function badge(label: string, color: string): string {
  return `<span style="display: inline-block; background-color: ${color}; color: #ffffff; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.3px;">${escapeHtml(label)}</span>`;
}

function metaRow(label: string, value: string): string {
  return `<tr>
  <td style="padding: 6px 0; color: #64748b; font-size: 13px; vertical-align: top; width: 130px;">${label}</td>
  <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${value}</td>
</tr>`;
}

// ============================================
// EMAIL SERVICE CLASS
// ============================================

export class EmailService {

  // ──────────────────────────────────────
  // 1. WELCOME DISCOUNT
  // ──────────────────────────────────────

  async sendWelcomeDiscountEmail(
    to: string,
    firstName: string,
    couponCode: string,
    discountPercent: number,
    expiresAt: Date
  ): Promise<EmailResult> {
    debugLog('sendWelcomeDiscountEmail called');
    try {
      const resend = getResend();
      const formattedExpiry = expiresAt.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `🎉 Twoja zniżka -${discountPercent}% czeka na Ciebie!`,
        html: this.getWelcomeDiscountHtml(firstName, couponCode, discountPercent, formattedExpiry),
        text: this.getWelcomeDiscountText(firstName, couponCode, discountPercent, formattedExpiry),
      });

      if (error) {
        console.error('[EmailService] Resend error:', error.message);
        return { success: false, error: error.message };
      }
      debugLog(`Welcome discount email sent, messageId: ${data?.id}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  private getWelcomeDiscountHtml(firstName: string, couponCode: string, discountPercent: number, expiresAt: string): string {
    return emailWrapper({
      title: '🎉 Witaj w WB Trade!',
      content: `
        ${greeting(firstName)}
        ${paragraph('Dziękujemy za założenie konta w naszym sklepie! Na początek mamy dla Ciebie specjalną niespodziankę:')}

        <!-- Discount Box -->
        <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 2px dashed #f97316; border-radius: 16px; padding: 28px 20px; text-align: center; margin: 24px 0;">
          <p style="font-size: 12px; color: #9a3412; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Twój kod rabatowy</p>
          <div style="background-color: #ffffff; border: 2px solid #ea580c; border-radius: 10px; padding: 14px 28px; display: inline-block; margin: 8px 0;">
            <p style="font-size: 30px; font-weight: 800; color: #ea580c; margin: 0; letter-spacing: 5px; font-family: 'Courier New', monospace;">${escapeHtml(couponCode)}</p>
          </div>
          <p style="font-size: 22px; font-weight: 800; color: #1e293b; margin: 12px 0 0;">-${discountPercent}% na pierwsze zakupy</p>
        </div>

        ${alertBox(`⏰ <strong>Uwaga!</strong> Kod jest ważny tylko do <strong>${expiresAt}</strong> (14 dni).`, 'error')}
        ${paragraph('Aby skorzystać ze zniżki, dodaj produkty do koszyka i wpisz kod przy finalizacji zamówienia.')}
        ${ctaButton('Rozpocznij zakupy →', `${SITE_URL}/products`)}
      `,
    });
  }

  private getWelcomeDiscountText(firstName: string, couponCode: string, discountPercent: number, expiresAt: string): string {
    return `Witaj ${firstName}!\n\nDziękujemy za założenie konta w WB Trade!\n\nTwój kod rabatowy: ${couponCode}\nZniżka: -${discountPercent}% na pierwsze zakupy\n\nUWAGA: Kod jest ważny tylko do ${expiresAt} (14 dni).\n\nRozpocznij zakupy: ${SITE_URL}/products\n\nPozdrawiamy,\nZespół WB Trade`;
  }

  // ──────────────────────────────────────
  // 2. NEWSLETTER VERIFICATION
  // ──────────────────────────────────────

  async sendNewsletterVerificationEmail(to: string, token: string): Promise<EmailResult> {
    try {
      const resend = getResend();
      const verifyUrl = `${SITE_URL}/newsletter/verify?token=${token}`;

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: '📬 Potwierdź zapis do newslettera WB Trade',
        html: this.getNewsletterVerificationHtml(verifyUrl),
        text: this.getNewsletterVerificationText(verifyUrl),
      });

      if (error) {
        console.error('[EmailService] Newsletter verification error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Newsletter verification email sent to ${to}, messageId: ${data?.id}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Newsletter verification exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  private getNewsletterVerificationHtml(verifyUrl: string): string {
    return emailWrapper({
      title: '📬 Potwierdź zapis do newslettera',
      content: `
        <p style="font-size: 17px; color: #1e293b; margin: 0 0 16px;">Cześć!</p>
        ${paragraph('Dziękujemy za zainteresowanie naszym newsletterem! Aby potwierdzić swój adres e-mail, kliknij poniższy przycisk:')}
        ${ctaButton('✅ Potwierdź zapis', verifyUrl)}
        <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 24px;">Jeśli nie zapisywałeś/aś się, zignoruj tę wiadomość.</p>
        ${divider()}
        <p style="font-size: 15px; color: #1e293b; font-weight: 700; margin: 0 0 12px;">Co zyskujesz jako subskrybent?</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%;">
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">🎁 Ekskluzywne kody rabatowe</td></tr>
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">🆕 Informacje o nowościach przed innymi</td></tr>
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">💰 Specjalne promocje tylko dla subskrybentów</td></tr>
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">📦 Powiadomienia o wyprzedażach</td></tr>
        </table>
      `,
    });
  }

  private getNewsletterVerificationText(verifyUrl: string): string {
    return `Cześć!\n\nDziękujemy za zainteresowanie naszym newsletterem!\n\nPotwierdź zapis: ${verifyUrl}\n\nCo zyskujesz?\n- Ekskluzywne kody rabatowe\n- Informacje o nowościach\n- Specjalne promocje\n- Powiadomienia o wyprzedażach\n\nPozdrawiamy,\nZespół WB Trade`;
  }

  // ──────────────────────────────────────
  // 3. NEWSLETTER WELCOME
  // ──────────────────────────────────────

  async sendNewsletterWelcomeEmail(to: string, unsubscribeToken: string): Promise<EmailResult> {
    debugLog('sendNewsletterWelcomeEmail called');
    try {
      const resend = getResend();

      let discountCode = '';
      let discountExpiry = '';
      try {
        const discount = await discountService.generateNewsletterDiscount(to);
        discountCode = discount.couponCode;
        discountExpiry = discount.expiresAt.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
        debugLog('Newsletter discount generated');
      } catch (discountErr) {
        console.error('[EmailService] Failed to generate newsletter discount:', discountErr);
      }

      const unsubscribeUrl = `${SITE_URL}/newsletter/unsubscribe?token=${unsubscribeToken}`;

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: discountCode ? '🎁 Twój kod -10% czeka! Witaj w newsletterze WB Trade!' : '🎉 Witaj w newsletterze WB Trade!',
        html: this.getNewsletterWelcomeHtml(unsubscribeUrl, discountCode, discountExpiry),
        text: this.getNewsletterWelcomeText(unsubscribeUrl, discountCode, discountExpiry),
      });

      if (error) {
        console.error('[EmailService] Newsletter welcome error:', error.message);
        return { success: false, error: error.message };
      }
      debugLog(`Newsletter welcome email sent, messageId: ${data?.id}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Newsletter welcome exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  private getNewsletterWelcomeHtml(unsubscribeUrl: string, discountCode?: string, discountExpiry?: string): string {
    const discountSection = discountCode ? `
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 2px dashed #f59e0b; border-radius: 16px; padding: 24px 20px; text-align: center; margin: 24px 0;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #92400e; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Twój ekskluzywny kod rabatowy</p>
          <div style="background-color: #ffffff; border: 2px solid #d97706; border-radius: 10px; padding: 12px 20px; display: inline-block; margin: 8px 0;">
            <p style="margin: 0; font-size: 30px; font-weight: 800; color: #78350f; letter-spacing: 5px; font-family: 'Courier New', monospace;">${escapeHtml(discountCode)}</p>
          </div>
          <p style="margin: 8px 0 4px; font-size: 18px; color: #92400e; font-weight: 700;">-10% na Twoje kolejne zakupy!</p>
          <p style="margin: 0; font-size: 12px; color: #a16207;">Ważny do: <strong>${discountExpiry}</strong> · Jednorazowego użytku</p>
          <p style="margin: 6px 0 0; font-size: 11px; color: #b45309;">⚠️ Nie łączy się z rabatem za rejestrację (20%) ani kuponami promocyjnymi (30%)</p>
        </div>` : '';

    return emailWrapper({
      title: discountCode ? '🎁 Mamy prezent dla Ciebie!' : '🎉 Dziękujemy za zapis!',
      content: `
        <p style="font-size: 17px; color: #1e293b; margin: 0 0 16px;">Cześć!</p>
        ${discountSection}
        ${paragraph(discountCode
          ? 'Twój adres e-mail został potwierdzony! Na powitanie mamy dla Ciebie <strong>kod rabatowy -10%</strong> na kolejne zakupy. Od teraz będziesz otrzymywać:'
          : 'Twój adres e-mail został potwierdzony! Od teraz będziesz otrzymywać:'
        )}
        <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 8px;">
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">🎁 <strong>Ekskluzywne kody rabatowe</strong></td></tr>
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">🆕 <strong>Informacje o nowościach</strong> przed innymi</td></tr>
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">💰 <strong>Specjalne promocje</strong> tylko dla subskrybentów</td></tr>
          <tr><td style="padding: 6px 0; font-size: 14px; color: #334155;">📦 <strong>Powiadomienia o wyprzedażach</strong></td></tr>
        </table>
        ${ctaButton(discountCode ? '🛒 Wykorzystaj kod teraz!' : '🛒 Przejdź do sklepu', `${SITE_URL}/products`)}
      `,
      footerExtra: `<p style="margin: 0 0 10px;"><a href="${unsubscribeUrl}" style="color: #64748b; font-size: 11px; text-decoration: underline;">Wypisz się z newslettera</a></p>`,
    });
  }

  private getNewsletterWelcomeText(unsubscribeUrl: string, discountCode?: string, discountExpiry?: string): string {
    const dc = discountCode ? `\n🎁 TWÓJ KOD RABATOWY: ${discountCode}\n-10% na kolejne zakupy!\nWażny do: ${discountExpiry}\n` : '';
    return `Cześć!\n\nDziękujemy za zapis do newslettera WB Trade!\n${dc}\nPrzejdź do sklepu: ${SITE_URL}/products\n\nWypisz się: ${unsubscribeUrl}\n\nPozdrawiamy,\nZespół WB Trade`;
  }

  // ──────────────────────────────────────
  // 4. PAYMENT REMINDER
  // ──────────────────────────────────────

  async sendPaymentReminderEmail(
    to: string,
    customerName: string,
    orderNumber: string,
    orderId: string,
    total: number,
    items: { name: string; variant: string; quantity: number; price: number; total: number; imageUrl: string | null }[],
    reminderNumber: number,
    daysRemaining: number
  ): Promise<EmailResult> {
    try {
      const resend = getResend();
      const paymentUrl = `${SITE_URL}/order/${orderId}/payment`;

      let urgencyEmoji = '⏰';
      let urgencyText = 'Przypomnienie o płatności';
      let urgencyColor = '#f97316';

      if (daysRemaining <= 2) {
        urgencyEmoji = '🚨'; urgencyText = 'Pilne! Ostatnie dni na płatność'; urgencyColor = '#dc2626';
      } else if (daysRemaining <= 4) {
        urgencyEmoji = '⚠️'; urgencyText = 'Przypomnienie o płatności'; urgencyColor = '#f59e0b';
      }

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `${urgencyEmoji} ${urgencyText} - Zamówienie #${orderNumber}`,
        html: this.getPaymentReminderHtml(customerName, orderNumber, orderId, total, items, reminderNumber, daysRemaining, paymentUrl, urgencyColor),
        text: this.getPaymentReminderText(customerName, orderNumber, total, items, daysRemaining, paymentUrl),
      });

      if (error) {
        console.error('[EmailService] Payment reminder error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Payment reminder #${reminderNumber} sent to ${to} for order ${orderNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Payment reminder exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  private getPaymentReminderHtml(
    customerName: string, orderNumber: string, orderId: string, total: number,
    items: { name: string; variant: string; quantity: number; price: number; total: number; imageUrl: string | null }[],
    reminderNumber: number, daysRemaining: number, paymentUrl: string, urgencyColor: string
  ): string {
    const productsHtml = items.map(item => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">
          ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" width="48" height="48" style="border-radius: 8px; vertical-align: middle; margin-right: 10px;" />` : ''}
          <span style="color: #1e293b; font-size: 14px; font-weight: 600;">${escapeHtml(item.name)}</span>
          ${item.variant ? `<br><span style="color: #64748b; font-size: 12px;">${escapeHtml(item.variant)}</span>` : ''}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #64748b; font-size: 14px;">${item.quantity} szt.</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #1e293b; font-size: 14px;">${item.total.toFixed(2)} zł</td>
      </tr>`).join('');

    const urgencyMsg = daysRemaining <= 1
      ? '🚨 <strong>Ostatni dzień!</strong> Twoje zamówienie zostanie anulowane jutro.'
      : daysRemaining <= 2
        ? `⚠️ <strong>Zostały tylko ${daysRemaining} dni!</strong> Opłać zamówienie, aby nie zostało anulowane.`
        : `⏰ Masz jeszcze <strong>${daysRemaining} dni</strong> na opłacenie zamówienia.`;

    const alertType = daysRemaining <= 2 ? 'error' : 'warning';

    return emailWrapper({
      title: '⏰ Przypomnienie o płatności',
      headerColor: urgencyColor,
      content: `
        ${greeting(customerName)}
        ${paragraph(`Zauważyliśmy, że Twoje zamówienie <strong>#${escapeHtml(orderNumber)}</strong> nie zostało jeszcze opłacone. Twoje produkty czekają na Ciebie!`)}
        ${alertBox(urgencyMsg, alertType)}

        <!-- Product table -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 24px 0;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Produkt</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 12px; color: #64748b; text-transform: uppercase;">Ilość</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase;">Cena</th>
            </tr>
          </thead>
          <tbody>${productsHtml}</tbody>
          <tfoot>
            <tr style="background-color: #f8fafc;">
              <td colspan="2" style="padding: 14px 12px; text-align: right; font-weight: 700; color: #1e293b; font-size: 15px;">Do zapłaty:</td>
              <td style="padding: 14px 12px; text-align: right; font-weight: 800; color: ${urgencyColor}; font-size: 20px;">${total.toFixed(2)} zł</td>
            </tr>
          </tfoot>
        </table>

        ${ctaButton('💳 Opłać teraz', paymentUrl, urgencyColor)}
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 4px 0 0;">Kliknij aby przejść do bezpiecznej płatności</p>
        ${helpSection('kontakt@wb-trade.pl')}
      `,
    });
  }

  private getPaymentReminderText(
    customerName: string, orderNumber: string, total: number,
    items: { name: string; variant: string; quantity: number; price: number; total: number; imageUrl: string | null }[],
    daysRemaining: number, paymentUrl: string
  ): string {
    const pl = items.map(i => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity} - ${i.total.toFixed(2)} zł`).join('\n');
    return `Cześć ${customerName}!\n\nPrzypomnienie o płatności — Zamówienie #${orderNumber}\n\n${daysRemaining <= 2 ? `⚠️ Zostały tylko ${daysRemaining} dni!` : `Masz jeszcze ${daysRemaining} dni.`}\n\nProdukty:\n${pl}\n\nDo zapłaty: ${total.toFixed(2)} zł\n\nOpłać: ${paymentUrl}\n\nPozdrawiamy,\nZespół WB Trade`;
  }

  // ──────────────────────────────────────
  // 5. ORDER CANCELLED (non-payment)
  // ──────────────────────────────────────

  async sendOrderCancelledDueToNonPaymentEmail(to: string, customerName: string, orderNumber: string, total: number): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `❌ Zamówienie #${orderNumber} zostało anulowane`,
        html: this.getOrderCancelledHtml(customerName, orderNumber, total),
        text: this.getOrderCancelledText(customerName, orderNumber, total),
      });

      if (error) {
        console.error('[EmailService] Order cancelled email error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Order cancelled email sent to ${to} for order ${orderNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Order cancelled exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  private getOrderCancelledHtml(customerName: string, orderNumber: string, total: number): string {
    return emailWrapper({
      title: '❌ Zamówienie anulowane',
      headerColor: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
      content: `
        ${greeting(customerName)}
        ${paragraph(`Z przykrością informujemy, że Twoje zamówienie <strong>#${escapeHtml(orderNumber)}</strong> o wartości <strong>${total.toFixed(2)} zł</strong> zostało automatycznie anulowane z powodu braku płatności.`)}

        ${infoBox('<p style="margin: 0; color: #64748b; font-size: 14px; text-align: center;">Zamówienie oczekiwało na płatność przez 7 dni.</p>', '#94a3b8')}

        ${paragraph('Jeśli nadal jesteś zainteresowany/a naszymi produktami, zapraszamy do złożenia nowego zamówienia. Wszystkie produkty są nadal dostępne w naszym sklepie!')}
        ${ctaButton('🛒 Przejdź do sklepu', `${SITE_URL}/products`)}
        ${helpSection('kontakt@wb-trade.pl')}
      `,
    });
  }

  private getOrderCancelledText(customerName: string, orderNumber: string, total: number): string {
    return `Cześć ${customerName},\n\nZamówienie #${orderNumber} o wartości ${total.toFixed(2)} zł zostało anulowane z powodu braku płatności (7 dni).\n\nZłóż nowe zamówienie: ${SITE_URL}/products\n\nPozdrawiamy,\nZespół WB Trade`;
  }

  // ──────────────────────────────────────
  // 6. ORDER CONFIRMATION
  // ──────────────────────────────────────

  async sendOrderConfirmationEmail(
    to: string, customerName: string, orderNumber: string, orderId: string, total: number,
    items: { name: string; variant: string; quantity: number; price: number; total: number; imageUrl: string | null }[],
    shippingAddress: { firstName: string; lastName: string; street: string; city: string; postalCode: string; phone?: string },
    shippingMethod: string, paymentMethod: string, isPaid: boolean
  ): Promise<EmailResult> {
    try {
      const resend = getResend();
      const orderUrl = `${SITE_URL}/order/${orderId}/confirmation`;

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `✅ Potwierdzenie zamówienia #${orderNumber}`,
        html: this.getOrderConfirmationHtml(customerName, orderNumber, orderId, total, items, shippingAddress, shippingMethod, paymentMethod, isPaid, orderUrl),
        text: this.getOrderConfirmationText(customerName, orderNumber, total, items, shippingAddress, shippingMethod, paymentMethod, isPaid, orderUrl),
      });

      if (error) {
        console.error('[EmailService] Order confirmation email error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Order confirmation email sent to ${to} for order ${orderNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Order confirmation exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  private getOrderConfirmationHtml(
    customerName: string, orderNumber: string, orderId: string, total: number,
    items: { name: string; variant: string; quantity: number; price: number; total: number; imageUrl: string | null }[],
    shippingAddress: { firstName: string; lastName: string; street: string; city: string; postalCode: string; phone?: string },
    shippingMethod: string, paymentMethod: string, isPaid: boolean, orderUrl: string
  ): string {
    const shippingMethodNames: Record<string, string> = {
      'inpost_paczkomat': 'InPost Paczkomat', 'inpost_paczkomaty': 'InPost Paczkomat',
      'inpost_kurier': 'Kurier InPost', 'inpost_courier': 'Kurier InPost',
      'dpd_kurier': 'Kurier DPD', 'dpd_courier': 'Kurier DPD', 'dpd': 'Kurier DPD',
      'dhl_kurier': 'Kurier DHL', 'dhl': 'Kurier DHL', 'ups': 'Kurier UPS', 'gls': 'Kurier GLS',
      'poczta_polska': 'Poczta Polska', 'pocztex': 'Pocztex', 'fedex': 'Kurier FedEx',
      'wysylka_gabaryt': 'Wysyłka gabaryt', 'orlen': 'Paczka Orlen',
      'pickup': 'Odbiór osobisty', 'odbior_osobisty_outlet': 'Odbiór osobisty (Outlet)',
    };
    const paymentMethodNames: Record<string, string> = {
      'cod': 'Płatność przy odbiorze', 'blik': 'BLIK', 'card': 'Karta płatnicza',
      'transfer': 'Przelew bankowy', 'przelewy24': 'Przelewy24', 'payu': 'PayU',
      'b2b_przelew': 'Przelew bankowy (B2B)',
      'b2b_transfer': 'Przelew bankowy (B2B)',
    };
    const shippingDisplay = shippingMethodNames[shippingMethod] || shippingMethod;
    const paymentDisplay = paymentMethodNames[paymentMethod] || paymentMethod;

    const productsHtml = items.map(item => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">
          ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" width="48" height="48" style="border-radius: 8px; vertical-align: middle; margin-right: 10px;" />` : ''}
          <span style="color: #1e293b; font-size: 14px; font-weight: 600;">${escapeHtml(item.name)}</span>
          ${item.variant ? `<br><span style="color: #64748b; font-size: 12px;">${escapeHtml(item.variant)}</span>` : ''}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #64748b; font-size: 14px;">${item.quantity} szt.</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #1e293b; font-size: 14px;">${item.total.toFixed(2)} zł</td>
      </tr>`).join('');

    const paymentBadge = isPaid
      ? '<span style="color: #16a34a; font-weight: 700;">✓ Opłacone</span>'
      : '<span style="color: #f59e0b; font-weight: 600;">⏳ Oczekuje</span>';

    const isB2bTransfer = paymentMethod === 'b2b_przelew' || paymentMethod === 'b2b_transfer';
    const b2bTransferDetailsHtml = (isB2bTransfer && !isPaid)
      ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
          <tr>
            <td style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 20px;">
              <p style="margin: 0 0 10px; color: #1e3a8a; font-size: 15px; font-weight: 700;">🏦 Dane do przelewu tradycyjnego</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #1e293b; line-height: 1.6;">
                <tr>
                  <td width="35%" style="color: #64748b; padding: 3px 0; font-size: 13px;">Odbiorca:</td>
                  <td style="font-weight: 600; padding: 3px 0; color: #1e293b;">WB PARTNERS Sp. z o.o.</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Adres odbiorcy:</td>
                  <td style="font-weight: 500; padding: 3px 0; color: #1e293b;">ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Bank:</td>
                  <td style="font-weight: 600; padding: 3px 0; color: #1e293b;">ING</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Numer konta:</td>
                  <td style="font-family: monospace; font-weight: 700; padding: 3px 0; color: #1e3a8a; font-size: 15px; letter-spacing: 0.5px;">19 1050 1445 1000 0090 8466 1967</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Tytuł przelewu:</td>
                  <td style="font-family: monospace; font-weight: 700; padding: 3px 0; color: #ea580c; font-size: 15px;">#${escapeHtml(orderNumber)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Kwota:</td>
                  <td style="font-weight: 700; padding: 3px 0; color: #ea580c; font-size: 15px;">${total.toFixed(2)} zł</td>
                </tr>
              </table>
              <p style="margin: 10px 0 0; color: #1e3a8a; font-size: 12px; font-style: italic;">Zamówienie zostanie przekazane do realizacji po zaksięgowaniu wpłaty.</p>
            </td>
          </tr>
        </table>
      `
      : '';

    return emailWrapper({
      title: '✅ Dziękujemy za zamówienie!',
      headerColor: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      content: `
        ${greeting(customerName)}
        ${paragraph(`Twoje zamówienie <strong>#${escapeHtml(orderNumber)}</strong> zostało przyjęte${isPaid ? ' i opłacone' : ''}. Poniżej znajdziesz podsumowanie:`)}

        <!-- Order number -->
        <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #22c55e; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
          <p style="font-size: 12px; color: #16a34a; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Numer zamówienia</p>
          <p style="font-size: 26px; font-weight: 800; color: #059669; margin: 0; letter-spacing: 2px;">#${escapeHtml(orderNumber)}</p>
        </div>

        <!-- Products -->
        <p style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 24px 0 12px;">📦 Zamówione produkty</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Produkt</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 12px; color: #64748b; text-transform: uppercase;">Ilość</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase;">Cena</th>
            </tr>
          </thead>
          <tbody>${productsHtml}</tbody>
          <tfoot>
            <tr style="background-color: #f0fdf4;">
              <td colspan="2" style="padding: 14px 12px; text-align: right; font-weight: 700; color: #1e293b; font-size: 15px;">Razem:</td>
              <td style="padding: 14px 12px; text-align: right; font-weight: 800; color: #059669; font-size: 20px;">${total.toFixed(2)} zł</td>
            </tr>
          </tfoot>
        </table>

        <!-- Shipping + Payment -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0 12px 0;">
          <tr>
            <td style="background-color: #f8fafc; border-radius: 12px; padding: 16px 20px; vertical-align: top;" width="50%">
              <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">📍 Adres dostawy</p>
              <p style="margin: 0; color: #1e293b; font-size: 14px; line-height: 1.6;">
                ${escapeHtml(shippingAddress.firstName)} ${escapeHtml(shippingAddress.lastName)}<br>
                ${escapeHtml(shippingAddress.street)}<br>
                ${escapeHtml(shippingAddress.postalCode)} ${escapeHtml(shippingAddress.city)}
                ${shippingAddress.phone ? `<br>Tel: ${escapeHtml(shippingAddress.phone)}` : ''}
              </p>
            </td>
          </tr>
          <tr><td style="height: 12px;"></td></tr>
          <tr>
            <td style="background-color: #f8fafc; border-radius: 12px; padding: 16px 20px;">
              <p style="margin: 0 0 6px; color: #1e293b; font-size: 14px;"><strong>🚚 Dostawa:</strong> ${escapeHtml(shippingDisplay)}</p>
              <p style="margin: 0; color: #1e293b; font-size: 14px;"><strong>💳 Płatność:</strong> ${escapeHtml(paymentDisplay)} ${paymentBadge}</p>
            </td>
          </tr>
        </table>

        ${b2bTransferDetailsHtml}

        ${ctaButton('📋 Szczegóły zamówienia', orderUrl)}
        ${helpSection('kontakt@wb-trade.pl')}
      `,
    });
  }

  private getOrderConfirmationText(
    customerName: string, orderNumber: string, total: number,
    items: { name: string; variant: string; quantity: number; price: number; total: number; imageUrl: string | null }[],
    shippingAddress: { firstName: string; lastName: string; street: string; city: string; postalCode: string; phone?: string },
    shippingMethod: string, paymentMethod: string, isPaid: boolean, orderUrl: string
  ): string {
    const il = items.map(i => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity} = ${i.total.toFixed(2)} zł`).join('\n');
    const isB2bTransfer = paymentMethod === 'b2b_przelew' || paymentMethod === 'b2b_transfer';
    const b2bTransferDetailsText = (isB2bTransfer && !isPaid)
      ? `\n🏦 DANE DO PRZELEWU TRADYCYJNEGO:\nOdbiorca: WB PARTNERS Sp. z o.o.\nAdres: ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów\nBank: ING\nNumer konta: 19 1050 1445 1000 0090 8466 1967\nTytuł przelewu: #${orderNumber}\nKwota: ${total.toFixed(2)} zł\n\nZamówienie zostanie przekazane do realizacji po zaksięgowaniu wpłaty.\n`
      : '';
    const paymentMethodNames: Record<string, string> = {
      'cod': 'Płatność przy odbiorze', 'blik': 'BLIK', 'card': 'Karta płatnicza',
      'transfer': 'Przelew bankowy', 'przelewy24': 'Przelewy24', 'payu': 'PayU',
      'b2b_przelew': 'Przelew bankowy (B2B)',
      'b2b_transfer': 'Przelew bankowy (B2B)',
    };
    const paymentDisplay = paymentMethodNames[paymentMethod] || paymentMethod;
    return `Cześć ${customerName},\n\nDziękujemy za zamówienie #${orderNumber}!\n\nStatus: ${isPaid ? 'Opłacone' : 'Oczekuje na płatność'}\n${b2bTransferDetailsText}\nProdukty:\n${il}\n\nRazem: ${total.toFixed(2)} zł\n\nAdres dostawy:\n${shippingAddress.firstName} ${shippingAddress.lastName}\n${shippingAddress.street}\n${shippingAddress.postalCode} ${shippingAddress.city}\n\nDostawa: ${shippingMethod}\nPłatność: ${paymentDisplay}\n\nSzczegóły: ${orderUrl}\n\nPozdrawiamy,\nZespół WB Trade`;
  }

  // ──────────────────────────────────────
  // 7. COMPLAINT (to admin)
  // ──────────────────────────────────────

  async sendComplaintEmail(data: {
    customerEmail: string;
    subject: string;
    description: string;
    orderNumber?: string;
    images?: string[];
  }): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { customerEmail, subject, description, orderNumber, images = [] } = data;

      const attachments: { filename: string; content: Buffer }[] = [];
      for (let i = 0; i < Math.min(images.length, 5); i++) {
        const img = images[i];
        if (img && img.startsWith('data:image')) {
          const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
          if (matches) {
            attachments.push({ filename: `zdjecie_${i + 1}.${matches[1]}`, content: Buffer.from(matches[2], 'base64') });
          }
        }
      }

      const now = new Date().toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' });
      const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';

      const { data: responseData, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [adminEmail],
        replyTo: customerEmail,
        subject: `[Reklamacja] ${subject}`,
        html: emailWrapper({
          title: '⚠️ Nowe zgłoszenie reklamacyjne',
          headerColor: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          content: `
            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 16px;">
              ${metaRow('Data zgłoszenia', now)}
              ${metaRow('Email klienta', `<a href="mailto:${customerEmail}" style="color: #f97316; text-decoration: none;">${escapeHtml(customerEmail)}</a>`)}
              ${orderNumber ? metaRow('Nr zamówienia', escapeHtml(orderNumber)) : ''}
              ${metaRow('Temat', `<strong>${escapeHtml(subject)}</strong>`)}
            </table>
            ${divider()}
            <p style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Opis problemu</p>
            <div style="background-color: #f8fafc; border-radius: 10px; padding: 18px 20px;">
              <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(description)}</p>
            </div>
            ${attachments.length > 0 ? alertBox(`📎 Załączono <strong>${attachments.length}</strong> ${attachments.length === 1 ? 'zdjęcie' : 'zdjęcia'}. Sprawdź załączniki tego emaila.`, 'warning') : ''}
            ${ctaButton('Odpowiedz klientowi', `mailto:${customerEmail}?subject=Re: ${encodeURIComponent(subject)}`)}
          `,
          footerNote: 'Zgłoszenie reklamacyjne — WB Trade',
        }),
        text: `REKLAMACJA\n\nData: ${now}\nEmail: ${customerEmail}\n${orderNumber ? `Zamówienie: ${orderNumber}\n` : ''}Temat: ${subject}\n\nOpis:\n${description}`,
        ...(attachments.length > 0 && { attachments }),
      });

      if (error) {
        console.error('[EmailService] Complaint email error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Complaint email sent, messageId: ${responseData?.id}`);
      return { success: true, messageId: responseData?.id };
    } catch (err: any) {
      console.error('[EmailService] Complaint email exception:', err);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 8. CONTACT FORM (to admin)
  // ──────────────────────────────────────

  async sendContactFormEmail(data: { name: string; email: string; subject: string; message: string }): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { name, email, subject, message } = data;
      const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';

      const { data: responseData, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [adminEmail],
        replyTo: email,
        subject: `[Kontakt] ${subject}`,
        html: emailWrapper({
          title: '📬 Nowa wiadomość ze strony',
          content: `
            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 16px;">
              ${metaRow('Od', `<strong>${escapeHtml(name)}</strong> (<a href="mailto:${escapeHtml(email)}" style="color: #f97316; text-decoration: none;">${escapeHtml(email)}</a>)`)}
              ${metaRow('Temat', `<strong>${escapeHtml(subject)}</strong>`)}
            </table>
            ${divider()}
            <p style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Treść wiadomości</p>
            <div style="background-color: #f8fafc; border-radius: 10px; padding: 18px 20px;">
              <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(message)}</p>
            </div>
            ${ctaButton('Odpowiedz', `mailto:${escapeHtml(email)}?subject=Re: ${encodeURIComponent(subject)}`)}
          `,
          footerNote: 'Formularz kontaktowy — WB Trade',
        }),
        text: `Od: ${name} (${email})\nTemat: ${subject}\n\n${message}`,
      });

      if (error) {
        console.error('[EmailService] Contact form error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, messageId: responseData?.id };
    } catch (err: any) {
      console.error('[EmailService] Contact form exception:', err);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 9. CONTACT CONFIRMATION (to customer)
  // ──────────────────────────────────────

  async sendContactConfirmationEmail(data: { name: string; email: string; subject: string }): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { name, email, subject } = data;

      const { data: responseData, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject: `Potwierdzenie otrzymania wiadomości — ${subject}`,
        html: emailWrapper({
          title: '✅ Otrzymaliśmy Twoją wiadomość',
          content: `
            ${greeting(name)}
            ${paragraph(`Dziękujemy za kontakt! Potwierdzamy otrzymanie Twojej wiadomości dotyczącej tematu: <strong>${escapeHtml(subject)}</strong>.`)}
            ${paragraph('Nasz zespół odpowie najszybciej jak to możliwe — zwykle w ciągu <strong>24 godzin</strong> w dni robocze (poniedziałek–piątek, 9:00–17:00).')}
            ${alertBox('Nie musisz odpowiadać na tego maila. Jeśli masz dodatkowe pytania, napisz do nas przez formularz na stronie lub na adres <a href="mailto:support@wb-partners.pl" style="color: #f97316; text-decoration: none; font-weight: 600;">support@wb-partners.pl</a>.', 'success')}
          `,
          footerNote: 'WB Partners Sp. z o.o. | ul. Słowackiego 24/11, 35-060 Rzeszów',
        }),
        text: `Cześć ${name},\n\nDziękujemy za kontakt! Potwierdzamy otrzymanie wiadomości: ${subject}.\nOdpowiemy w ciągu 24h w dni robocze.\n\nPozdrawiamy,\nZespół WB Trade`,
      });

      if (error) {
        console.error('[EmailService] Contact confirmation error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, messageId: responseData?.id };
    } catch (err: any) {
      console.error('[EmailService] Contact confirmation exception:', err);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 10. SUPPORT — NEW TICKET TO ADMIN
  // ──────────────────────────────────────

  async sendSupportNewTicketToAdmin(ticket: {
    ticketNumber: string; subject: string; category: string;
    userName?: string; userEmail?: string; message: string;
  }): Promise<EmailResult> {
    try {
      const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';
      const resend = getResend();

      const categoryLabels: Record<string, string> = {
        ORDER: 'Zamówienie', DELIVERY: 'Dostawa', COMPLAINT: 'Reklamacja',
        RETURN: 'Zwrot', PAYMENT: 'Płatność', ACCOUNT: 'Konto', GENERAL: 'Ogólne',
      };

      const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || 'wb-trade.pl';
      const replyToAddr = `support+${ticket.ticketNumber}@${inboundDomain}`;

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: replyToAddr,
        to: adminEmail,
        subject: `[${ticket.ticketNumber}] Nowa wiadomość: ${ticket.subject}`,
        html: emailWrapper({
          title: '📩 Nowa wiadomość od klienta',
          content: `
            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 16px;">
              ${metaRow('Ticket', `<strong>${ticket.ticketNumber}</strong>`)}
              ${metaRow('Od', `${escapeHtml(ticket.userName || 'Nieznany')} (${escapeHtml(ticket.userEmail || 'brak emaila')})`)}
              ${metaRow('Kategoria', badge(categoryLabels[ticket.category] || ticket.category, '#f97316'))}
              ${metaRow('Temat', `<strong>${escapeHtml(ticket.subject)}</strong>`)}
            </table>
            ${divider()}
            <div style="background-color: #f8fafc; border-radius: 10px; padding: 18px 20px;">
              <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(ticket.message).replace(/\n/g, '<br>')}</p>
            </div>
            ${ctaButton('Odpowiedz w panelu', `${SITE_URL.replace('wb-trade.pl', 'admin.wb-trade.pl')}/messages`)}
          `,
          footerNote: 'Powiadomienie support — WB Trade',
        }),
      });

      if (error) {
        console.error('[EmailService] Support ticket notification error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Support ticket notification sent for ${ticket.ticketNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Support notification exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 11. SUPPORT — REPLY TO CUSTOMER
  // ──────────────────────────────────────

  async sendSupportReplyToCustomer(data: {
    to: string; ticketNumber: string; subject: string; customerName: string; replyContent?: string;
  }): Promise<EmailResult> {
    try {
      const resend = getResend();
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';

      const replySection = data.replyContent
        ? `<div style="background-color: #f8fafc; border-left: 4px solid #f97316; border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 16px 0;">
             <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(data.replyContent)}</p>
           </div>`
        : paragraph('Aby zobaczyć szczegóły odpowiedzi, zaloguj się do swojego konta.');

      const { data: responseData, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: data.to,
        replyTo: [supportEmail],
        subject: `[${data.ticketNumber}] Odpowiedź na Twoją wiadomość`,
        html: emailWrapper({
          title: '💬 Masz nową odpowiedź',
          content: `
            ${greeting(data.customerName)}
            ${paragraph(`Odpowiedzieliśmy na Twoją wiadomość <strong>${escapeHtml(data.ticketNumber)}</strong>.`)}

            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 8px;">
              ${metaRow('Temat', escapeHtml(data.subject))}
            </table>
            ${divider()}
            ${replySection}
            ${ctaButton('Zobacz wiadomości', `${SITE_URL}/account/messages`)}
          `,
          footerNote: `Odpowiedz na tego maila lub napisz do nas: ${supportEmail}`,
        }),
      });

      if (error) {
        console.error('[EmailService] Support reply notification error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Support reply notification sent to ${data.to}`);
      return { success: true, messageId: responseData?.id };
    } catch (err: any) {
      console.error('[EmailService] Support reply exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 12. SUPPORT — CUSTOMER REPLY TO ADMIN
  // ──────────────────────────────────────

  async sendSupportCustomerReplyToAdmin(ticket: {
    ticketNumber: string; subject: string; userName?: string; userEmail?: string; message: string;
  }): Promise<EmailResult> {
    try {
      const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';
      const resend = getResend();

      const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || 'wb-trade.pl';
      const replyToAddr = `support+${ticket.ticketNumber}@${inboundDomain}`;

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: replyToAddr,
        to: adminEmail,
        subject: `[${ticket.ticketNumber}] Nowa odpowiedź klienta: ${ticket.subject}`,
        html: emailWrapper({
          title: '🔔 Klient odpowiedział na ticket',
          headerColor: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          content: `
            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 16px;">
              ${metaRow('Ticket', `<strong>${ticket.ticketNumber}</strong>`)}
              ${metaRow('Od', `${escapeHtml(ticket.userName || 'Nieznany')} (${escapeHtml(ticket.userEmail || 'brak emaila')})`)}
              ${metaRow('Temat', escapeHtml(ticket.subject))}
            </table>
            ${divider()}
            <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 0 10px 10px 0; padding: 16px 20px;">
              <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(ticket.message).replace(/\n/g, '<br>')}</p>
            </div>
            ${ctaButton('Odpowiedz w panelu', `${SITE_URL.replace('wb-trade.pl', 'admin.wb-trade.pl')}/messages`, '#3b82f6')}
          `,
          footerNote: 'Powiadomienie support — WB Trade',
        }),
      });

      if (error) {
        console.error('[EmailService] Customer reply notification error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Customer reply notification sent for ${ticket.ticketNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Customer reply notification exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 13. ORDER STATUS CHANGE (to admin)
  // ──────────────────────────────────────

  async sendOrderStatusChangeToAdmin(order: {
    orderNumber: string; status: string; previousStatus: string; total: number;
    customerName?: string; customerEmail?: string; itemCount?: number; paymentMethod?: string; note?: string;
  }): Promise<EmailResult> {
    try {
      const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';
      const resend = getResend();

      const statusLabels: Record<string, string> = {
        OPEN: 'Otwarte', PENDING: 'Oczekujące', CONFIRMED: 'Potwierdzone',
        PROCESSING: 'W realizacji', SHIPPED: 'Wysłane', DELIVERED: 'Dostarczone',
        COMPLETED: 'Zakończone', CANCELLED: 'Anulowane', REFUNDED: 'Zwrócone',
      };
      const statusColors: Record<string, string> = {
        CONFIRMED: '#22c55e', PROCESSING: '#3b82f6', SHIPPED: '#8b5cf6',
        DELIVERED: '#22c55e', COMPLETED: '#059669', CANCELLED: '#ef4444', REFUNDED: '#f59e0b',
      };
      const statusIcons: Record<string, string> = {
        CONFIRMED: '✅', PROCESSING: '⚙️', SHIPPED: '🚚', DELIVERED: '📦',
        COMPLETED: '🏁', CANCELLED: '❌', REFUNDED: '💸',
      };

      const statusLabel = statusLabels[order.status] || order.status;
      const prevStatusLabel = statusLabels[order.previousStatus] || order.previousStatus;
      const color = statusColors[order.status] || '#6b7280';
      const icon = statusIcons[order.status] || '📋';

      const formattedTotal = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(order.total / 100);

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: adminEmail,
        subject: `${icon} [${order.orderNumber}] Status: ${statusLabel}`,
        html: emailWrapper({
          title: `${icon} Zmiana statusu zamówienia`,
          headerColor: color,
          content: `
            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 16px;">
              ${metaRow('Zamówienie', `<strong>${escapeHtml(order.orderNumber)}</strong>`)}
              ${metaRow('Status', `${badge(escapeHtml(prevStatusLabel), '#94a3b8')} → ${badge(escapeHtml(statusLabel), color)}`)}
              ${metaRow('Klient', `${escapeHtml(order.customerName || 'Nieznany')} (${escapeHtml(order.customerEmail || 'brak emaila')})`)}
              ${metaRow('Kwota', formattedTotal)}
              ${order.itemCount ? metaRow('Produkty', `${order.itemCount} szt.`) : ''}
              ${order.paymentMethod ? metaRow('Płatność', escapeHtml(order.paymentMethod)) : ''}
            </table>
            ${order.note ? `${divider()}${infoBox(`<p style="margin: 0; color: #334155; font-size: 14px;"><strong>Notatka:</strong> ${escapeHtml(order.note)}</p>`, color)}` : ''}
            ${ctaButton('Zobacz zamówienie', `${SITE_URL.replace('wb-trade.pl', 'admin.wb-trade.pl')}/orders`, color)}
          `,
          footerNote: 'Powiadomienie o statusie — WB Trade',
        }),
      });

      if (error) {
        console.error('[EmailService] Order status notification error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Order status notification sent for ${order.orderNumber} → ${order.status}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Order status notification exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 14. RETURN / COMPLAINT CONFIRMATION
  // ──────────────────────────────────────

  async sendReturnConfirmationEmail(data: {
    to: string; customerName: string; returnNumber: string;
    type: 'RETURN' | 'COMPLAINT'; orderNumber: string; reason: string;
    returnAddress: { name: string; street: string; city: string; postalCode: string };
  }): Promise<EmailResult> {
    try {
      const resend = getResend();
      const typeLabel = data.type === 'RETURN' ? 'zwrotu' : 'reklamacji';
      const typeLabelUpper = data.type === 'RETURN' ? 'Zwrot' : 'Reklamacja';
      const headerColor = data.type === 'RETURN'
        ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
        : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
      const accentColor = data.type === 'RETURN' ? '#f97316' : '#dc2626';

      const { data: responseData, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: data.to,
        subject: `[${data.returnNumber}] Potwierdzenie zgłoszenia ${typeLabel}`,
        html: emailWrapper({
          title: `📋 Potwierdzenie zgłoszenia ${typeLabel}`,
          headerColor,
          content: `
            ${greeting(data.customerName)}
            ${paragraph(`Twoje zgłoszenie ${typeLabel} zostało przyjęte. Poniżej znajdziesz szczegóły i instrukcję wysyłki.`)}

            <!-- Return number -->
            <div style="background-color: ${data.type === 'RETURN' ? '#fff7ed' : '#fef2f2'}; border: 2px solid ${accentColor}; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="margin: 0 0 4px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Numer ${typeLabel}</p>
              <p style="margin: 0; color: ${accentColor}; font-size: 26px; font-weight: 800; letter-spacing: 2px;">${escapeHtml(data.returnNumber)}</p>
            </div>

            <!-- Critical warning -->
            <div style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
              <p style="margin: 0 0 4px; color: #991b1b; font-weight: 800; font-size: 14px;">⚠️ WAŻNE: Umieść numer ${escapeHtml(data.returnNumber)} NA PACZCE (na zewnątrz)!</p>
              <p style="margin: 0; color: #b91c1c; font-size: 13px; line-height: 1.5;">Numer musi być widoczny na opakowaniu — nie umieszczaj go wewnątrz paczki. Bez tego numeru nie będziemy mogli zidentyfikować Twojego ${typeLabel === 'zwrotu' ? 'zwrotu' : 'zgłoszenia'}.</p>
            </div>

            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin: 16px 0;">
              ${metaRow('Zamówienie', escapeHtml(data.orderNumber))}
              ${metaRow('Typ', typeLabelUpper)}
              ${metaRow('Powód', escapeHtml(data.reason))}
            </table>

            ${divider()}
            <p style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 8px;">📦 Adres do wysyłki</p>
            <div style="background-color: #f8fafc; border-radius: 10px; padding: 16px 20px;">
              <p style="margin: 0; color: #1e293b; font-size: 14px; line-height: 1.6;">
                ${escapeHtml(data.returnAddress.name)}<br>
                ${escapeHtml(data.returnAddress.street)}<br>
                ${escapeHtml(data.returnAddress.postalCode)} ${escapeHtml(data.returnAddress.city)}
              </p>
            </div>
          `,
        }),
      });

      if (error) {
        console.error('[EmailService] Return confirmation email error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Return confirmation sent to ${data.to}, number: ${data.returnNumber}`);
      return { success: true, messageId: responseData?.id };
    } catch (err: any) {
      console.error('[EmailService] Return confirmation exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 15. DELIVERY DELAY NOTIFICATION
  // ──────────────────────────────────────

  async sendDeliveryDelayEmail(data: {
    to: string; customerName: string; orderNumber: string; messageContent: string; replyTo?: string;
  }): Promise<EmailResult> {
    debugLog(`sendDeliveryDelayEmail called for order ${data.orderNumber}`);
    try {
      const resend = getResend();
      const safeOrderNumber = escapeHtml(data.orderNumber);
      const htmlContent = escapeHtml(data.messageContent).replace(/\n/g, '<br>');

      const replyNote = data.replyTo
        ? `Masz pytanie lub chcesz przekazać nam informację? <strong style="color: #1e293b;">Po prostu odpowiedz na tego maila</strong> — Twoja wiadomość trafi bezpośrednio do naszego zespołu obsługi.`
        : 'W razie pytań skontaktuj się z nami przez formularz na stronie.';

      const { data: responseData, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [data.to],
        ...(data.replyTo ? { replyTo: [data.replyTo] } : {}),
        subject: `Informacja o zamówieniu #${data.orderNumber} — WBTrade`,
        html: emailWrapper({
          title: 'Informacja o Twoim zamówieniu',
          content: `
            ${greeting(data.customerName)}

            <div style="background-color: #fff7ed; border-radius: 10px; padding: 10px 16px; display: inline-block; margin: 0 0 20px;">
              <p style="margin: 0; color: #9a3412; font-size: 13px; font-weight: 700;">📦 Zamówienie #${safeOrderNumber}</p>
            </div>

            <div style="background-color: #f8fafc; border-left: 4px solid #f97316; border-radius: 0 12px 12px 0; padding: 20px 24px; margin: 0 0 24px;">
              <p style="color: #334155; font-size: 15px; line-height: 1.8; margin: 0;">${htmlContent}</p>
            </div>

            ${ctaButton('Sprawdź status zamówienia', `${SITE_URL}/account/orders`)}

            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 24px 0 0; text-align: center;">${replyNote}</p>
          `,
          footerNote: data.replyTo ? `Odpowiedz na tego maila lub napisz: ${data.replyTo}` : undefined,
        }),
        text: `Informacja o zamówieniu #${data.orderNumber}\n\n${data.messageContent}\n\nSprawdź status: ${SITE_URL}/account/orders\n\n© ${YEAR} WBTrade - wb-trade.pl`,
      });

      if (error) {
        console.error('[EmailService] Delivery delay email error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Delivery delay email sent to ${data.to}, order: ${data.orderNumber}`);
      return { success: true, messageId: responseData?.id };
    } catch (err: any) {
      console.error('[EmailService] Delivery delay email exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // 16. INVOICE REQUEST NOTIFICATION (ADMIN)
  // ──────────────────────────────────────

  async sendInvoiceRequestNotification(order: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    billingNip?: string | null;
    billingCompanyName?: string | null;
    total: number;
  }): Promise<EmailResult> {
    try {
      const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';
      const resend = getResend();

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: adminEmail,
        subject: `🧾 Prośba o fakturę — zamówienie #${order.orderNumber}`,
        html: emailWrapper({
          title: '🧾 Klient prosi o fakturę VAT',
          content: `
            <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 16px;">
              ${metaRow('Zamówienie', `<strong>#${escapeHtml(order.orderNumber)}</strong>`)}
              ${metaRow('Klient', escapeHtml(order.customerName))}
              ${metaRow('Email', escapeHtml(order.customerEmail))}
              ${order.billingCompanyName ? metaRow('Firma', escapeHtml(order.billingCompanyName)) : ''}
              ${order.billingNip ? metaRow('NIP', `<strong>${escapeHtml(order.billingNip)}</strong>`) : ''}
              ${metaRow('Kwota', `<strong>${order.total.toFixed(2)} PLN</strong>`)}
            </table>
            ${divider()}
            <p style="margin: 12px 0; color: #334155; font-size: 14px;">
              Klient zaznaczył opcję faktury VAT. Faktura <strong>nie została</strong> automatycznie utworzona w Fakturowni — proszę wystawić ręcznie.
            </p>
            ${ctaButton('Otwórz panel zamówień', `${SITE_URL.replace('wb-trade.pl', 'admin.wb-trade.pl')}/orders`)}
          `,
          footerNote: 'Powiadomienie o fakturze — WB Trade',
        }),
        text: `Prośba o fakturę VAT\n\nZamówienie: #${order.orderNumber}\nKlient: ${order.customerName} (${order.customerEmail})\n${order.billingCompanyName ? `Firma: ${order.billingCompanyName}\n` : ''}${order.billingNip ? `NIP: ${order.billingNip}\n` : ''}Kwota: ${order.total.toFixed(2)} PLN\n\nFaktura NIE została automatycznie utworzona — proszę wystawić ręcznie.`,
      });

      if (error) {
        console.error('[EmailService] Invoice request notification error:', error);
        return { success: false, error: error.message };
      }
      console.log(`✅ [EmailService] Invoice request notification sent for order ${order.orderNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error('[EmailService] Invoice request notification exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────
  // B2B COOPERATION EMAILS
  // ──────────────────────────────────────

  async sendB2bApprovalEmail(to: string, firstName: string, companyName: string): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: '✅ Twój wniosek o współpracę B2B został zatwierdzony!',
        html: emailWrapper({
          title: '✅ Współpraca B2B zatwierdzona',
          content: `
            ${greeting(firstName)}
            ${paragraph(`Z przyjemnością informujemy, że Twój wniosek o współpracę B2B dla firmy <strong>${escapeHtml(companyName)}</strong> został zatwierdzony!`)}
            ${paragraph('Od teraz masz dostęp do:')}
            <ul style="color: #374151; font-size: 14px; line-height: 1.8;">
              <li>Cen hurtowych na wszystkie produkty</li>
              <li>Dedykowanego feedu produktowego (XML/CSV)</li>
              <li>Metody dostawy "Wysyłka własny"</li>
              <li>Płatności przelewem na konto</li>
              <li>Sekcji faktur w panelu konta</li>
              <li>Centrum pomocy B2B</li>
            </ul>
            ${paragraph('Zaloguj się na swoje konto, aby zobaczyć nowe ceny i funkcje.')}
          `,
        }),
      });

      if (error) return { success: false, error: error.message };
      console.log(`✅ [EmailService] B2B approval email sent to ${to}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async sendB2bRejectionEmail(to: string, firstName: string, reason?: string): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: 'Informacja dotycząca wniosku o współpracę B2B',
        html: emailWrapper({
          title: 'Wniosek o współpracę B2B',
          content: `
            ${greeting(firstName)}
            ${paragraph('Dziękujemy za zainteresowanie współpracą B2B z WB Trade.')}
            ${paragraph('Niestety, po weryfikacji Twój wniosek nie został zatwierdzony.')}
            ${reason ? paragraph(`<strong>Powód:</strong> ${escapeHtml(reason)}`) : ''}
            ${paragraph('Jeśli uważasz, że to pomyłka lub chcesz uzyskać więcej informacji, skontaktuj się z nami.')}
          `,
        }),
      });

      if (error) return { success: false, error: error.message };
      console.log(`✅ [EmailService] B2B rejection email sent to ${to}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Tabela zamówionych produktów do maila ofertowego (email-safe, inline style, z miniaturą). */
  private orderItemsTable(items?: Array<{ name: string; quantity: number; unitPrice: number; imageUrl?: string | null }>): string {
    if (!items || items.length === 0) return '';
    const absolutize = (u?: string | null): string =>
      !u ? '' : (/^https?:\/\//i.test(u) ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`);
    let itemsTotal = 0;
    const rows = items.map((it) => {
      const lineTotal = it.unitPrice * it.quantity;
      itemsTotal += lineTotal;
      const img = absolutize(it.imageUrl);
      const imageCell = img
        ? `<img src="${escapeHtml(img)}" width="64" height="64" alt="" style="display:block; width:64px; height:64px; border-radius:8px; border:1px solid #e2e8f0; object-fit:cover; background:#f1f5f9;" />`
        : `<div style="width:64px; height:64px; border-radius:8px; border:1px solid #e2e8f0; background:#f1f5f9; text-align:center; line-height:64px; font-size:26px;">📦</div>`;
      return `
        <tr>
          <td width="76" style="padding:12px 0 12px 12px; vertical-align:top;">${imageCell}</td>
          <td style="padding:12px; vertical-align:top;">
            <p style="margin:0; font-size:14px; font-weight:600; color:#1e293b; line-height:1.35;">${escapeHtml(it.name)}</p>
            <p style="margin:4px 0 0; font-size:13px; color:#64748b;">${it.quantity} szt. × ${it.unitPrice.toFixed(2)} zł</p>
          </td>
          <td style="padding:12px; vertical-align:top; text-align:right; white-space:nowrap; font-size:14px; font-weight:700; color:#1e293b;">${lineTotal.toFixed(2)} zł</td>
        </tr>
        <tr><td colspan="3" style="border-bottom:1px solid #eef2f7; font-size:0; line-height:0;">&nbsp;</td></tr>`;
    }).join('');
    return `
      <p style="margin: 24px 0 8px; color:#1e293b; font-size:15px; font-weight:700;">📦 Zamówione produkty</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#ffffff;">
        ${rows}
        <tr>
          <td colspan="2" style="padding:12px 14px; background:#f8fafc; font-size:14px; font-weight:700; color:#1e293b;">Razem za produkty</td>
          <td style="padding:12px 14px; background:#f8fafc; text-align:right; white-space:nowrap; font-size:15px; font-weight:800; color:#ea580c;">${itemsTotal.toFixed(2)} zł</td>
        </tr>
      </table>`;
  }

  async sendPaymentLinkEmail(
    to: string,
    customerName: string,
    orderNumber: string,
    orderId: string,
    total: number,
    items?: Array<{ name: string; quantity: number; unitPrice: number; imageUrl?: string | null }>
  ): Promise<EmailResult> {
    try {
      const resend = getResend();
      const paymentUrl = `${SITE_URL}/order/${orderId}/payment`;

      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `Dokończ płatność za zamówienie #${orderNumber}`,
        html: emailWrapper({
          title: 'Dokończ płatność online',
          headerColor: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          content: `
            ${greeting(customerName)}
            ${paragraph(`Twoje zamówienie <strong>#${escapeHtml(orderNumber)}</strong> o wartości <strong>${total.toFixed(2)} PLN</strong> zostało przygotowane przez naszego handlowca.`)}
            ${this.orderItemsTable(items)}
            ${paragraph('Aby dokończyć zamówienie i opłacić je online, kliknij w poniższy przycisk:')}
            ${ctaButton('💳 Opłać zamówienie online', paymentUrl)}
            ${paragraph('Link do płatności wygaśnie za kilka dni. Po opłaceniu zamówienia natychmiast przystąpimy do jego realizacji.')}
          `,
        }),
      });

      if (error) return { success: false, error: error.message };
      console.log(`✅ [EmailService] Payment link email sent to ${to} for order ${orderNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async sendBankTransferDetailsEmail(
    to: string,
    customerName: string,
    orderNumber: string,
    total: number,
    items?: Array<{ name: string; quantity: number; unitPrice: number; imageUrl?: string | null }>
  ): Promise<EmailResult> {
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `Dane do przelewu bankowego - Zamówienie #${orderNumber}`,
        html: emailWrapper({
          title: 'Dane do przelewu bankowego',
          headerColor: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          content: `
            ${greeting(customerName)}
            ${paragraph(`Twoje zamówienie <strong>#${escapeHtml(orderNumber)}</strong> o wartości <strong>${total.toFixed(2)} PLN</strong> zostało utworzone. Poniżej znajdują się dane do wykonania przelewu tradycyjnego:`)}
            ${this.orderItemsTable(items)}

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0 24px 0;">
              <tr>
                <td style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 20px;">
                  <p style="margin: 0 0 10px; color: #1e3a8a; font-size: 15px; font-weight: 700;">🏦 Dane do przelewu tradycyjnego</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #1e293b; line-height: 1.6;">
                    <tr>
                      <td width="35%" style="color: #64748b; padding: 3px 0; font-size: 13px;">Odbiorca:</td>
                      <td style="font-weight: 600; padding: 3px 0; color: #1e293b;">WB PARTNERS Sp. z o.o.</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Adres odbiorcy:</td>
                      <td style="font-weight: 500; padding: 3px 0; color: #1e293b;">ul. Juliusza Słowackiego 24/11, 35-060 Rzeszów</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Bank:</td>
                      <td style="font-weight: 600; padding: 3px 0; color: #1e293b;">ING</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Numer konta:</td>
                      <td style="font-family: monospace; font-weight: 700; padding: 3px 0; color: #1e3a8a; font-size: 15px; letter-spacing: 0.5px;">19 1050 1445 1000 0090 8466 1967</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Tytuł przelewu:</td>
                      <td style="font-family: monospace; font-weight: 700; padding: 3px 0; color: #ea580c; font-size: 15px;">#${escapeHtml(orderNumber)}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 3px 0; font-size: 13px;">Kwota:</td>
                      <td style="font-weight: 700; padding: 3px 0; color: #ea580c; font-size: 15px;">${total.toFixed(2)} zł</td>
                    </tr>
                  </table>
                  <p style="margin: 10px 0 0; color: #1e3a8a; font-size: 12px; font-style: italic;">Zamówienie zostanie przekazane do realizacji po zaksięgowaniu wpłaty.</p>
                </td>
              </tr>
            </table>
            
            ${paragraph('Prosimy o dokonanie płatności w ciągu 7 dni. Po zaksięgowaniu wpłaty otrzymasz kolejne powiadomienie o zmianie statusu zamówienia.')}
          `,
        }),
      });

      if (error) return { success: false, error: error.message };
      console.log(`✅ [EmailService] Bank transfer details email sent to ${to} for order ${orderNumber}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const emailService = new EmailService();
