const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.settings.findMany();
  console.log("=== Settings in Database ===");
  console.log(JSON.stringify(settings, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);
