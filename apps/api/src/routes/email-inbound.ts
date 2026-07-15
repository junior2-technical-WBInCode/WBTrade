import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import * as supportService from '../services/support.service';
import { emailService } from '../services/email.service';
import crypto from 'crypto';

const router = Router();

// ─── Resend Inbound Email Webhook ───
// Receives emails sent to support+{TICKET_NUMBER}@wb-trade.pl
// Adds admin reply as a message in the corresponding support ticket

// Safe HTML-to-text converter:
// 1. Convert block/br tags to newlines BEFORE stripping
// 2. Strip all HTML tags iteratively (prevents incomplete multi-char sanitization)
// 3. Decode entities with &amp; LAST to avoid double-unescaping
function stripHtml(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n');

  // Iteratively strip tags until none remain (CodeQL: incomplete multi-char sanitization fix)
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(/<[^>]*>/g, '');
  }

  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract the actual reply from email body (strip quoted reply chain)
function extractReplyContent(text: string): string {
  // Common reply separators
  const separators = [
    /^-{2,}\s*Original Message\s*-{2,}/im,
    /^-{2,}\s*Oryginalna wiadomość\s*-{2,}/im,
    /^On .+ wrote:$/im,
    /^W dniu .+ napisał/im,
    /^Dnia .+ napisał/im,
    /^>{1,}/m, // Quoted text starting with >
    /^\*{3,}/m, // *** separator
    /^_{3,}/m, // ___ separator
    /^From:/im, // Forwarded message header
    /^Od:/im,
    /^Sent:/im,
    /^Wysłano:/im,
  ];

  let content = text;

  for (const sep of separators) {
    const match = content.search(sep);
    if (match > 0) {
      content = content.substring(0, match);
    }
  }

  return content.trim();
}

// Verify webhook signature from Resend (required — fails closed if not configured)
function verifyResendSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature) return false; // Reject if secret or signature missing
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── POST /api/webhooks/email-inbound ───
router.post('/', async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || '';

    if (!webhookSecret) {
      console.error('[EmailInbound] RESEND_WEBHOOK_SECRET not configured — rejecting webhook');
      return res.status(401).json({ error: 'Webhook not configured' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawBody = (req as any).rawBody;
    const signature = req.headers['resend-signature'] as string || req.headers['svix-signature'] as string;
    if (!rawBody || !verifyResendSignature(rawBody, signature, webhookSecret)) {
      console.error('[EmailInbound] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Resend inbound payload structure
    const { type, data } = req.body;

    // Handle Resend webhook events
    if (type === 'email.received') {
      // Resend Inbound format
      const { to, from, text, html } = data;
      
      await processInboundEmail({ to, from, text, html });
      return res.status(200).json({ received: true });
    }
    
    // Fallback: direct inbound format (to, from, text, html at top level)
    if (req.body.to && req.body.from) {
      const { to, from, text, html } = req.body;
      await processInboundEmail({ to, from, text, html });
      return res.status(200).json({ received: true });
    }

    console.log('[EmailInbound] Unknown webhook event type:', type || 'none');
    res.status(200).json({ received: true });
  } catch (error: unknown) {
    console.error('[EmailInbound] Webhook processing error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

async function processInboundEmail(data: {
  to: string | string[];
  from: string;

  text?: string;
  html?: string;
}) {
  const { to, from, text, html } = data;

  // Normalize 'to' to string
  const toAddress = Array.isArray(to) ? to[0] : to;

  // Extract ticket number from To address
  // Pattern: support+SUP-20260304-001@wb-trade.pl
  const ticketMatch = toAddress.match(/support\+([A-Z]+-\d+-\d+)@/i);
  if (!ticketMatch) {
    console.log('[EmailInbound] No ticket number found in To address:', toAddress);
    return;
  }

  const ticketNumber = ticketMatch[1].toUpperCase();
  console.log(`[EmailInbound] Processing email reply for ticket ${ticketNumber} from ${from}`);

  // Find the ticket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = await (prisma as any).supportTicket.findFirst({
    where: { ticketNumber },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!ticket) {
    console.error(`[EmailInbound] Ticket ${ticketNumber} not found`);
    return;
  }

  // Extract reply content (prefer text, fall back to stripped HTML)
  let replyContent = text || (html ? stripHtml(html) : '');
  replyContent = extractReplyContent(replyContent);

  if (!replyContent || replyContent.length === 0) {
    console.log(`[EmailInbound] Empty reply content for ticket ${ticketNumber}`);
    return;
  }

  // Truncate if too long
  if (replyContent.length > 5000) {
    replyContent = replyContent.substring(0, 5000) + '...';
  }

  // Extract sender email from "Name <email>" format (ReDoS-safe regex)
  const senderEmailMatch = from.match(/<([^<>]+)>/);
  const senderEmail = senderEmailMatch ? senderEmailMatch[1] : from;

  // Determine if sender is admin or customer
  const adminEmail = process.env.SUPPORT_EMAIL || 'support@wb-partners.pl';
  const adminEmails = [adminEmail.toLowerCase()];
  
  // Also check if sender is any admin user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminUser = await (prisma as any).user.findFirst({
    where: { 
      email: { equals: senderEmail, mode: 'insensitive' },
      role: 'ADMIN' 
    },
    select: { id: true },
  });

  const isAdmin = adminEmails.includes(senderEmail.toLowerCase()) || !!adminUser;

  if (isAdmin) {
    // Admin replying via email → add as ADMIN message
    const message = await supportService.addMessage({
      ticketId: ticket.id,
      senderId: adminUser?.id,
      senderRole: 'ADMIN',
      content: replyContent,
    });

    console.log(`✅ [EmailInbound] Admin reply added to ticket ${ticketNumber} (msg: ${message.id})`);

    // Send notification email to customer
    if (ticket.user?.email) {
      emailService.sendSupportReplyToCustomer({
        to: ticket.user.email,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        customerName: ticket.user.firstName || 'Kliencie',
        replyContent: replyContent,
      }).catch((err) => console.error('[EmailInbound] Failed to notify customer:', err.message));
    } else if (ticket.guestEmail) {
      emailService.sendSupportReplyToCustomer({
        to: ticket.guestEmail,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        customerName: 'Kliencie',
        replyContent: replyContent,
      }).catch((err) => console.error('[EmailInbound] Failed to notify guest:', err.message));
    }
  } else {
    // Customer replying via email → add as CUSTOMER message
    const message = await supportService.addMessage({
      ticketId: ticket.id,
      senderId: ticket.userId || undefined,
      senderRole: 'CUSTOMER',
      content: replyContent,
    });

    console.log(`✅ [EmailInbound] Customer reply added to ticket ${ticketNumber} (msg: ${message.id})`);

    // Notify admin about customer reply
    emailService.sendSupportCustomerReplyToAdmin({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      userName: ticket.user ? `${ticket.user.firstName} ${ticket.user.lastName}` : undefined,
      userEmail: ticket.user?.email || ticket.guestEmail || senderEmail,
      message: replyContent,
    }).catch((err) => console.error('[EmailInbound] Failed to notify admin:', err.message));
  }
}

export default router;
