import { prisma } from './db';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      b2bStatus: { not: 'NONE' }
    },
    select: {
      id: true,
      email: true,
      role: true,
      b2bStatus: true,
      b2bPriceMultiplier: true,
      b2bWholesalerRules: true,
      companyName: true,
      nip: true
    }
  });

  console.log('--- B2B Users in Database ---');
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
