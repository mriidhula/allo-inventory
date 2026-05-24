import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

function createRedisClient() {
  const url = process.env.REDIS_URL
  if (!url) {
    console.warn('REDIS_URL not set — distributed locking disabled')
    return null
  }
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 })
  client.on('error', (err) => console.error('Redis error:', err))
  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis ?? undefined
}

/**
 * Acquire a Redis lock. Returns true if acquired, false if not.
 * Uses SET NX PX for atomicity.
 */
export async function acquireLock(key: string, ttlMs = 5000): Promise<string | null> {
  if (!redis) return null
  const token = Math.random().toString(36).slice(2)
  const result = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX')
  return result === 'OK' ? token : null
}

/**
 * Release a Redis lock, only if we own it (Lua script for atomicity).
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  if (!redis) return
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  await redis.eval(luaScript, 1, `lock:${key}`, token)
}
