import { prisma } from './db';
import { getB2bUserInfo, calculateB2bPriceForProduct } from './services/b2b-pricing.service';

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'main@ez-con.pl' },
  });

  if (!user) {
    console.log('User not found!');
    return;
  }

  const b2bInfo = await getB2bUserInfo(user.id);
  if (!b2bInfo) {
    console.log('User B2B info not found!');
    return;
  }

  console.log('=== User B2B Info ===');
  console.log(JSON.stringify(b2bInfo, null, 2));

  const product = await prisma.product.findFirst({
    where: { sku: '1000225' },
    include: {
      variants: true,
    }
  });

  if (!product) {
    console.log('Product not found!');
    return;
  }

  console.log('=== Product DB Info ===');
  console.log({
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: product.price.toString(),
    baselinkerProductId: product.baselinkerProductId,
    tags: product.tags,
  });

  console.log('=== Calculating price using database product values ===');
  const b2bPrice = await calculateB2bPriceForProduct(
    product.price,
    product.baselinkerProductId,
    product.sku,
    b2bInfo
  );

  console.log('Resulting B2B Price:', b2bPrice);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

