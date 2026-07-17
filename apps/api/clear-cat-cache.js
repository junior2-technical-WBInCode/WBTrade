require('dotenv').config();
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('❌ REDIS_URL environment variable is not set!');
  process.exit(1);
}

const redis = new Redis(redisUrl);

async function main() {
  // Delete category tree cache
  const del1 = await redis.del('cache:categories:tree');
  console.log(`Deleted cache:categories:tree: ${del1}`);
  
  // Delete individual category caches
  const keys = await redis.keys('cache:category:*');
  if (keys.length > 0) {
    const del2 = await redis.del(...keys);
    console.log(`Deleted ${del2} individual category cache keys`);
  } else {
    console.log('No individual category cache keys found');
  }
  
  console.log('Category cache cleared!');
  redis.disconnect();
}

main().catch(e => { console.error(e); redis.disconnect(); });
