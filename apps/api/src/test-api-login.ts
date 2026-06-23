import { prisma } from './db';
import { authService } from './services/auth.service';

async function main() {
  console.log('--- Logging in via authService ---');
  const result = await authService.login({
    email: 'main@ez-con.pl',
    password: 'Komeczek2026!',
  });

  console.log('Login response user keys:', Object.keys(result.user));
  console.log('b2bWholesalerRules:', JSON.stringify(result.user.b2bWholesalerRules, null, 2));
  console.log('b2bPriceMultiplier:', result.user.b2bPriceMultiplier);
  console.log('b2bStatus:', result.user.b2bStatus);
}

main().catch(console.error).finally(() => prisma.$disconnect());
