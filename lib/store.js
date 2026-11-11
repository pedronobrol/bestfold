// Storage for the community board and presence. Uses Upstash Redis when configured
// (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_* names Vercel's
// marketplace integration sets); otherwise an in-memory store, which is fine for local
// development but does not persist and is not shared between serverless instances.
import { Redis } from '@upstash/redis';

function memoryStore() {
  const hashes = new Map(), zsets = new Map(), counters = new Map();
  const h = (k) => hashes.get(k) || hashes.set(k, new Map()).get(k);
  const z = (k) => zsets.get(k) || zsets.set(k, new Map()).get(k);
  return {
    kind: 'memory',
    async hget(k, f) { return h(k).get(f) ?? null; },
    async hset(k, obj) { for (const [f, v] of Object.entries(obj)) h(k).set(f, v); },
    async hgetall(k) { return Object.fromEntries(h(k)); },
    async zadd(k, { score, member }) { z(k).set(member, score); },
    async zrem(k, member) { z(k).delete(member); },
    async zremrangebyscore(k, min, max) { for (const [m, s] of z(k)) if (s >= min && s <= max) z(k).delete(m); },
    async zcard(k) { return z(k).size; },
    async incr(k) {
      const now = Date.now(), c = counters.get(k);
      const next = c && c.until > now ? { n: c.n + 1, until: c.until } : { n: 1, until: now + 60000 };
      counters.set(k, next);
      return next.n;
    },
    async expire() {},
  };
}

let store = null;
export function getStore() {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  store = url && token ? Object.assign(new Redis({ url, token }), { kind: 'redis' }) : memoryStore();
  return store;
}

// Fixed-window rate limit: at most `limit` calls per minute per key.
export async function allow(key, limit) {
  const s = getStore();
  const k = `bestfold:rl:${key}:${Math.floor(Date.now() / 60000)}`;
  const n = await s.incr(k);
  if (n === 1) await s.expire(k, 70);
  return n <= limit;
}
