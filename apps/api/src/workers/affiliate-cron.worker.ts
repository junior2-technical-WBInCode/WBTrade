/**
 * Affiliate Cron Worker
 * 
 * Periodically processes referral holds (runs hold release logic).
 * Releases 14-day hold on PAID referrals, moving them to APPROVED status.
 */

import { referralService } from '../services/referral.service';
import { salesRepService } from '../services/sales-rep.service';
import { partnerVolumeService, currentPeriod } from '../services/partner-volume.service';
import { partnerRankService } from '../services/partner-rank.service';
import { getMlmConfig } from '../services/mlm-config.service';

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

      console.log('[SalesRepCron] Starting daily commission holds processing...');
      await salesRepService.processCommissionHolds();

      // WB TRADE PARTNERS (PLAN_03): recompute qualified turnover + WL.
      // Behind the MLM legal gate — zero cost while enabled=false.
      const mlmCfg = await getMlmConfig();
      if (mlmCfg.enabled) {
        console.log('[PartnerVolumeCron] Recomputing monthly volumes + WL...');
        await partnerVolumeService.recomputeMonthlyVolumes(currentPeriod(now));
        // On the 1st of the month: finalize the previous (just closed) period
        // and run the rank promotion engine on it (PLAN_03/PR-5).
        if (now.getDate() === 1) {
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
          const prevPeriod = currentPeriod(prev);
          await partnerVolumeService.recomputeMonthlyVolumes(prevPeriod);
          console.log('[RankEngineCron] Evaluating partner ranks for closed period...');
          await partnerRankService.evaluatePeriod(prevPeriod);
        }
      }
    } catch (error) {
      console.error('[AffiliateCron/SalesRepCron] Error processing holds:', error);
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
