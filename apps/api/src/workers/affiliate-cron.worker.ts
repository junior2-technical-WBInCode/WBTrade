/**
 * Affiliate Cron Worker
 * 
 * Periodically processes referral holds (runs hold release logic).
 * Releases 14-day hold on PAID referrals, moving them to APPROVED status.
 */

import { referralService } from '../services/referral.service';

let lastCheckDate = '';

async function checkAffiliateTasks() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const hour = now.getHours();

  // Run daily at 03:00 AM (or on initial boot)
  if (hour >= 3 && today !== lastCheckDate) {
    lastCheckDate = today;
    try {
      console.log('[AffiliateCron] Starting daily referral holds processing...');
      const result = await referralService.processReferralHolds();
      if (result.approved > 0 || result.cancelled > 0) {
        console.log(`[AffiliateCron] Finished: ${result.approved} approved, ${result.cancelled} cancelled`);
      } else {
        console.log('[AffiliateCron] Finished: No eligible referrals to process.');
      }
    } catch (error) {
      console.error('[AffiliateCron] Error processing referral holds:', error);
    }
  }
}

export function startAffiliateCronWorker() {
  // Check every hour
  setInterval(checkAffiliateTasks, 60 * 60 * 1000);
  // Run initial check after 15 seconds (let server boot first)
  setTimeout(checkAffiliateTasks, 15 * 1000);
  console.log('✅ Affiliate cron worker started (referral hold checks)');
}
