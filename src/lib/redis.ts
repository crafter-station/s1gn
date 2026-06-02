import Redis from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

const globalForRedis = globalThis as unknown as { __s1ngRedis?: Redis };

export const redis =
  globalForRedis.__s1ngRedis ??
  new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.__s1ngRedis = redis;
