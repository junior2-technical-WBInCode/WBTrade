import { prisma } from './db';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'main@ez-con.pl';
  const hashedPassword = await bcrypt.hash('Password123!', 12);
  
  console.log(`Updating user ${email} password to "Password123!"...`);
  const user = await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });
  
  console.log('User password updated successfully! ID:', user.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
