// Community board.
//   GET  /api/board?mission=distance          -> { engine, entries: [{ owner, genome, score, key, at, engine }] }
//   POST /api/board { mission, engine, genome, owner }
//        The server re-simulates the design (about a second) and keeps it only if it is feasible
//        and beats the stored design for its sketch. Claimed scores are ignored.
//
// Designs are stored per mission, independent of the engine version, so they are never lost when
// the physics changes. Each entry records the engine that scored it; entries from an older engine
// are re-simulated with the current one, a few per request, before they are shown again.
import { NextResponse } from 'next/server';
import { getStore, allow } from '../../../lib/store.js';
import { validGenome, verifyDesign } from '../../../lib/verify.js';
import { ENGINE_VERSION } from '../../../src/version.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MISSIONS = new Set(['distance', 'hangtime']);
const boardKey = (mission) => `bestfold:board:${mission}`;
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const RECHECK_PER_REQUEST = 2;

export async function GET(req) {
  const mission = new URL(req.url).searchParams.get('mission') || 'distance';
  if (!MISSIONS.has(mission)) return NextResponse.json({ error: 'unknown mission' }, { status: 400 });
  const s = getStore(), k = boardKey(mission);
  const all = Object.values((await s.hgetall(k)) || {}).map(parse);
  // bring a few entries scored by an older engine up to date
  const stale = all.filter((e) => e.engine !== ENGINE_VERSION && !e.retired).slice(0, RECHECK_PER_REQUEST);
  for (const e of stale) {
    const v = verifyDesign(mission, e.genome);
    Object.assign(e, { score: v.score, engine: ENGINE_VERSION, retired: !v.feasible, recheckedAt: Date.now() });
    await s.hset(k, { [e.key]: JSON.stringify(e) });
  }
  const entries = all.filter((e) => e.engine === ENGINE_VERSION && !e.retired).sort((a, b) => b.score - a.score).slice(0, 200);
  const pending = all.filter((e) => e.engine !== ENGINE_VERSION && !e.retired).length;
  return NextResponse.json({ engine: ENGINE_VERSION, entries, pending }, { headers: { 'cache-control': 'no-store' } });
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
  if (prev && prev.engine === ENGINE_VERSION && !prev.retired && prev.score >= v.score - 1e-9) {
    return NextResponse.json({ accepted: false, reason: 'not better than the stored design for this sketch', score: v.score });
  }
  const at = Date.now();
  await s.hset(k, { [v.key]: JSON.stringify({ owner: who, genome: v.genome, score: v.score, key: v.key, at, engine: ENGINE_VERSION }) });
  // keep superseded designs too, so nothing anyone found is ever thrown away
  if (prev) await s.hset(`${k}:history`, { [`${prev.key}:${prev.at}`]: JSON.stringify(prev) });
  return NextResponse.json({ accepted: true, score: v.score, key: v.key });
}
