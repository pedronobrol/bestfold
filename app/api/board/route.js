// Community board.
//   GET  /api/board?mission=distance          -> { engine, entries: [{ owner, genome, score, key, at }] }
//   POST /api/board { mission, engine, genome, owner }
//        The server re-simulates the design (about a second) and keeps it only if it is feasible
//        and beats the stored design for its sketch. Claimed scores are ignored.
import { NextResponse } from 'next/server';
import { getStore, allow } from '../../../lib/store.js';
import { validGenome, verifyDesign } from '../../../lib/verify.js';
import { ENGINE_VERSION } from '../../../src/version.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MISSIONS = new Set(['distance', 'hangtime']);
const boardKey = (mission) => `betterfold:board:${ENGINE_VERSION}:${mission}`;
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export async function GET(req) {
  const mission = new URL(req.url).searchParams.get('mission') || 'distance';
  if (!MISSIONS.has(mission)) return NextResponse.json({ error: 'unknown mission' }, { status: 400 });
  const all = await getStore().hgetall(boardKey(mission));
  const entries = Object.values(all || {}).map(parse).sort((a, b) => b.score - a.score).slice(0, 20)
    .map((e) => ({ ...e, engine: ENGINE_VERSION }));
  return NextResponse.json({ engine: ENGINE_VERSION, entries }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (!(await allow(`board:${ip}`, 12))) return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { mission, engine, genome, owner } = body || {};
  if (!MISSIONS.has(mission)) return NextResponse.json({ error: 'unknown mission' }, { status: 400 });
  if (engine !== ENGINE_VERSION) return NextResponse.json({ error: 'engine version mismatch; reload the page' }, { status: 409 });
  if (!validGenome(genome)) return NextResponse.json({ error: 'invalid genome' }, { status: 400 });
  const who = typeof owner === 'string' ? owner.slice(0, 40) : 'anon';

  const v = verifyDesign(mission, genome);
  if (!v.feasible) return NextResponse.json({ accepted: false, reason: 'not feasible', score: 0 });
  const s = getStore(), k = boardKey(mission);
  const prev = parse(await s.hget(k, v.key));
  if (prev && prev.score >= v.score - 1e-9) return NextResponse.json({ accepted: false, reason: 'not better than the stored design for this sketch', score: v.score });
  await s.hset(k, { [v.key]: JSON.stringify({ owner: who, genome: v.genome, score: v.score, key: v.key, at: Date.now() }) });
  return NextResponse.json({ accepted: true, score: v.score, key: v.key });
}
