// Presence: POST /api/presence { id, folding, mission } -> { folding: number of pages contributing }.
// Each contributing page checks in every ~20 s; entries older than 60 s expire.
import { NextResponse } from 'next/server';
import { getStore, allow } from '../../../lib/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bestfold:presence';

export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (!(await allow(`presence:${ip}`, 30))) return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const id = typeof body.id === 'string' ? body.id.slice(0, 40) : null;
  const s = getStore(), now = Date.now();
  if (id) {
    if (body.folding) await s.zadd(KEY, { score: now, member: id });
    else await s.zrem(KEY, id);
  }
  await s.zremrangebyscore(KEY, 0, now - 60000);
  return NextResponse.json({ folding: await s.zcard(KEY) }, { headers: { 'cache-control': 'no-store' } });
}
