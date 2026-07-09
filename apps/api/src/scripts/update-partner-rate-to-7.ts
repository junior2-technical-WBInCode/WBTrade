/**
 * One-off script: raise partner commission rate 5% → 7% (plan "WB TRADE PARTNERS").
 *
 * Updates ONLY partners still on the old default 5.00 — individually customized
 * rates are left untouched.
 *
 * Usage (from apps/api):
 *   npx ts-node src/scripts/update-partner-rate-to-7.ts [--dry-run]
 *
 * ⚠️ Run only after the management decision (PLAN_03, decyzja #1).
 */

import { prisma } from '../db';

const OLD_RATE = 5.0;
const NEW_RATE = 7.0;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const affected = await prisma.partnerProfile.findMany({
    where: { commissionRate: OLD_RATE },
    select: { id: true, referralCode: true, commissionRate: true },
  });

  console.log(`Partners on ${OLD_RATE}%: ${affected.length}`);
  for (const p of affected) {
    console.log(`  - ${p.referralCode} (${p.id})`);
  }

  if (dryRun) {
    console.log('[dry-run] No changes written.');
    return;
  }

  const result = await prisma.partnerProfile.updateMany({
    where: { commissionRate: OLD_RATE },
    data: { commissionRate: NEW_RATE },
  });

  console.log(`Updated ${result.count} partner(s) to ${NEW_RATE}%.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
