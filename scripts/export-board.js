// Backs up the community board (current designs and superseded ones) to results/board-<mission>.json.
// Needs the Redis credentials in the environment (e.g. `vercel env pull` writes them to .env.local):
//   node --env-file=.env.local scripts/export-board.js
import { writeFileSync } from 'node:fs';
import { getStore } from '../lib/store.js';

const s = getStore();
if (s.kind !== 'redis') throw new Error('No Redis credentials in the environment (UPSTASH_REDIS_REST_* or KV_REST_API_*).');
for (const mission of ['distance', 'hangtime']) {
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const current = Object.values((await s.hgetall(`bestfold:board:${mission}`)) || {}).map(parse);
  const history = Object.values((await s.hgetall(`bestfold:board:${mission}:history`)) || {}).map(parse);
  writeFileSync(new URL(`../results/board-${mission}.json`, import.meta.url), JSON.stringify({ exportedAt: new Date().toISOString(), current, history }, null, 1));
  console.log(`${mission}: ${current.length} current, ${history.length} superseded`);
}
