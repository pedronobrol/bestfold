// Quality-diversity search: MAP-Elites over plane "sketches" (orientation × fold-type sequence ×
// winglets), with a CMA-ES emitter refining the continuous parameters inside each sketch, and a
// successive-halving budget: every sketch gets a short run, the best third get longer runs, the
// best ninth longer still.
//
// Usage: BETTERFOLD_WORKERS=4 node scripts/optimize.js [distance|hangtime] [rung0 evals] [seed]
import { Worker } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { CLASSICS, encode, completeDesign, decode, MISSIONS, normalizeGenome } from '../src/design.js';
import { existsSync, readFileSync } from 'node:fs';
import { CMAES } from '../src/cmaes.js';
import { allSketches, sketchKey, dims, toGenome, fromGenome } from '../src/sketch.js';

const mission = process.argv[2] || 'distance';
const RUNG0 = +(process.argv[3] || 96);
let seed = +(process.argv[4] || 1);
const M = MISSIONS[mission];
const LAMBDA = 12;
const RUNGS = [RUNG0, RUNG0 * 3, RUNG0 * 9]; // cumulative budget per niche at each rung
const KEEP = [1, 1 / 3, 1 / 9];

const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// worker pool (default 4 workers to keep the machine cool)
const NW = Math.max(1, Math.min(cpus().length - 1, +(process.env.BETTERFOLD_WORKERS || 4)));
const workers = [], queue = [], pending = new Map();
let nextId = 0;
for (let i = 0; i < NW; i++) {
  const w = new Worker(new URL('./worker.js', import.meta.url));
  w.busy = false;
  w.on('message', (msg) => { const cb = pending.get(msg.id); pending.delete(msg.id); w.busy = false; cb(msg); pump(); });
  workers.push(w);
}
function pump() {
  for (const w of workers) if (!w.busy && queue.length) { const job = queue.shift(); w.busy = true; w.postMessage(job); }
}
const evalGenome = (genome, threshold = 0) => new Promise((res) => {
  const id = nextId++;
  pending.set(id, res);
  queue.push({ id, genome, mission, threshold });
  pump();
});

// archive: one elite per sketch
const niches = new Map();
for (const s of allSketches()) niches.set(sketchKey(s), { sketch: s, key: sketchKey(s), es: null, evals: 0, elite: null, x0: null });
// seed known designs into their niches
for (const c of Object.values(CLASSICS)) {
  const { sketch, x } = fromGenome(encode(completeDesign(c.design, M), M));
  const n = niches.get(sketchKey(sketch));
  if (n) n.x0 = x;
}

// warm start: seed each niche from a previous run's elites (older genome versions are padded)
for (const f of [`../results/{mission}.json`, `../results/v2/${mission}.json`]) {
  const u = new URL(f.replace('{mission}', mission), import.meta.url);
  if (!existsSync(u)) continue;
  try {
    const prev = JSON.parse(readFileSync(u, 'utf8'));
    let seeded = 0;
    for (const e of prev.archive || []) {
      if (!e.feasible) continue;
      const { sketch, x } = fromGenome(normalizeGenome(e.genome));
      const n = niches.get(sketchKey(sketch));
      if (n && !n.x0seeded) { n.x0 = x; n.x0seeded = true; seeded++; }
    }
    console.log(`warm start: ${seeded} niches seeded from ${f}`);
    break;
  } catch (err) { console.log('warm start skipped:', err.message); }
}

const t0 = Date.now();
let totalEvals = 0, feasibleEvals = 0, racedEvals = 0;
const history = [];
const bestOverall = () => [...niches.values()].filter((n) => n.elite && n.elite.feasible).sort((a, b) => b.elite.fitness - a.elite.fitness)[0];
function snapshot(label) {
  const elites = [...niches.values()].filter((n) => n.elite && n.elite.feasible).map((n) => n.elite.fitness).sort((a, b) => b - a);
  const b = bestOverall();
  history.push({
    gen: history.length, evals: totalEvals, elapsed: (Date.now() - t0) / 1000, label,
    best: b ? b.elite.fitness : 0, median: elites.length ? elites[Math.floor(elites.length / 2)] : 0,
    p90: elites.length ? elites[Math.floor(elites.length * 0.1)] : 0,
    filled: elites.length, bestKey: b ? b.key : null, bestGenome: b ? b.elite.genome.map((x) => +x.toFixed(6)) : null,
    bestStats: b ? b.elite.stats : null,
  });
}

async function runNiche(n, budget) {
  const D = dims(n.sketch);
  while (n.evals < budget) {
    if (!n.es || n.es.stagnant(15)) {
      // (re)start: from the elite if we have one (IPOP-style: larger population), else from the seed/centre
      const restart = !!n.es;
      const start = n.elite ? fromGenome(n.elite.genome).x : n.x0 || new Array(D).fill(0.5);
      const lam = restart ? Math.min(48, n.es.lambda * 2) : LAMBDA;
      n.es = new CMAES(start.map((v) => Math.min(1, Math.max(0, v + (restart ? (rand() - 0.5) * 0.1 : 0)))), restart ? 0.15 : 0.25, { lambda: lam, rand });
    }
    const X = n.es.ask();
    const thr = n.elite && n.elite.feasible ? 0.8 * n.elite.fitness : 0;
    const R = await Promise.all(X.map((x) => evalGenome(toGenome(n.sketch, x), thr)));
    n.es.tell(R.map((r) => r.fitness));
    n.evals += X.length;
    totalEvals += X.length;
    R.forEach((r, i) => {
      if (r.feasible) feasibleEvals++;
      if (r.raced) racedEvals++;
      if (!r.raced && (!n.elite || r.fitness > n.elite.fitness)) {
        n.elite = { genome: toGenome(n.sketch, X[i]), fitness: r.fitness, feasible: r.feasible, score: r.score, stats: r.stats, violations: r.violations };
      }
    });
  }
}

function report(label) {
  const b = bestOverall();
  const d = b && decode(b.elite.genome, M);
  console.log(`${label.padEnd(10)} evals ${totalEvals}  feasible ${((100 * feasibleEvals) / Math.max(1, totalEvals)).toFixed(0)}%  raced ${racedEvals}  filled ${[...niches.values()].filter((n) => n.elite && n.elite.feasible).length}/${niches.size}  best ${b ? b.elite.fitness.toFixed(2) : '-'} ${b ? b.key : ''} ${d ? `trimCL ${d.trimCL}` : ''}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
function save() {
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
  const b = bestOverall();
  const archive = [...niches.values()].filter((n) => n.elite).map((n) => ({ key: n.key, evals: n.evals, ...n.elite, genome: n.elite.genome.map((x) => +x.toFixed(6)) }));
  writeFileSync(new URL(`../results/${mission}.json`, import.meta.url), JSON.stringify({
    mission, engine: 'v2', algorithm: 'MAP-Elites (sketch) + CMA-ES emitters + successive halving',
    generations: history.length - 1, population: LAMBDA, genomeSize: toGenome(allSketches()[0], new Array(30).fill(0.5)).length,
    evals: totalEvals, feasibleFraction: feasibleEvals / Math.max(1, totalEvals),
    best: b ? { genome: b.elite.genome.map((x) => +x.toFixed(6)), score: b.elite.fitness, key: b.key, design: decode(b.elite.genome, M) } : null,
    archive, history,
  }));
}

async function main() {
  console.log(`${mission}: ${niches.size} sketches, ${NW} workers, rungs ${RUNGS.join('/')} evals`);
  snapshot('start');
  let active = [...niches.values()];
  for (let r = 0; r < RUNGS.length; r++) {
    if (r > 0) {
      active = active.filter((n) => n.elite).sort((a, b) => b.elite.fitness - a.elite.fitness).slice(0, Math.max(3, Math.ceil(niches.size * KEEP[r])));
    }
    let done = 0;
    for (const n of active) {
      await runNiche(n, RUNGS[r]);
      done++;
      if (done % 4 === 0 || done === active.length) { snapshot(`rung ${r}`); report(`rung ${r} ${done}/${active.length}`); save(); }
    }
  }
  snapshot('done');
  save();
  report('done');
  for (const w of workers) w.terminate();
}
main();
