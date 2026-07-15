/**
 * Standalone worker entrypoint (audyt V-05).
 *
 * Runs all background jobs (Baselinker sync, payment reminders, newsletter,
 * loyalty/affiliate crons, delivery-delay detection) in a dedicated process,
 * isolated from the HTTP API — so heavy syncs no longer compete with request
 * handling for the 512 MB heap.
 *
 * Deployment: Render Worker Service running `node dist/worker.js`.
 * Remember to set DISABLE_IN_PROCESS_WORKERS=true on the API service so jobs
 * are not executed twice.
 */

// Load environment variables FIRST - before any other imports
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// Global error handlers to prevent silent crashes
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Promise Rejection (worker):', reason);
});
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception (worker):', error);
  // Don't exit — keep the worker running
});

async function main(): Promise<void> {
  // The dedicated worker process should always run jobs, regardless of NODE_ENV
  if (!process.env.ENABLE_WORKERS) {
    process.env.ENABLE_WORKERS = 'true';
  }

  console.log('🛠️  WBTrade worker process starting...');
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize Redis connection (same logic as API startup)
  let redisAvailable = false;
  try {
    const { getRedisClient } = await import('./lib/redis');
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      redisAvailable = true;
      console.log('✅ Redis connection verified (worker)');
    } else {
      console.warn('⚠️  Redis unavailable — worker will use setInterval fallbacks');
    }
  } catch (error: any) {
    console.error('❌ Redis initialization failed (worker):', error?.message || error);
  }

  const { startBackgroundJobs } = await import('./workers/background-jobs');
  await startBackgroundJobs(redisAvailable);

  console.log('✅ Worker process ready');
}

main().catch((error) => {
  console.error('💥 Worker startup failed:', error);
  process.exit(1);
});
