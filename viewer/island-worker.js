// Browser "island": runs CMA-ES inside one plane sketch at a time (the same quality-diversity
// scheme as scripts/optimize.js). Runs as a module Web Worker in the hosted app; the single-file
// artifact build inlines the engine and strips these imports.
//
// In:  {type:'start', mission, archive:[{key, genome, fitness}]}   start searching
//      {type:'archive', entries:[{key, genome, fitness}]}          verified elites from everyone
//      {type:'verify', id, mission, genome}                        re-simulate a shared design
//      {type:'stop'}
// Out: {type:'progress', evals, sketch, best:{key, genome, fitness}}
//      {type:'elite', key, genome, fitness}                        new best for a sketch on this island
//      {type:'verified', id, fitness}
import { decode, MISSIONS } from '../src/design.js';
import { evaluate } from '../src/evaluate.js';
import { CMAES } from '../src/cmaes.js';
import { allSketches, sketchKey, dims, toGenome, fromGenome } from '../src/sketch.js';

let S = null;
const round6 = (g) => g.map((x) => Math.round(x * 1e6) / 1e6);

function fitnessOf(genome, M, threshold) {
  try {
    const r = evaluate(decode(round6(genome), M), M, { threshold });
    return { fitness: r.fitness, raced: !!r.raced };
  } catch (e) {
    return { fitness: -20, raced: false };
  }
}

function pickSketch() {
  const known = [...S.archive.values()].filter((e) => e.fitness > 0).sort((a, b) => b.fitness - a.fitness);
  if (!known.length || Math.random() < 0.2) {
    const all = allSketches();
    return { sketch: all[Math.floor(Math.random() * all.length)], elite: null };
  }
  // rank-weighted choice: better sketches get more attention, the tail still gets some
  const w = known.map((_, i) => 1 / (i + 2));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
  while ((r -= w[i]) > 0 && i < known.length - 1) i++;
  return { sketch: fromGenome(known[i].genome).sketch, elite: known[i] };
}

function newRun() {
  const { sketch, elite } = pickSketch();
  const x0 = elite ? fromGenome(elite.genome).x : new Array(dims(sketch)).fill(0.5);
  S.run = { sketch, key: sketchKey(sketch), es: new CMAES(x0, elite ? 0.12 : 0.25, { lambda: 8 }), X: null, F: [], gens: 0, bestF: elite ? elite.fitness : -Infinity };
}

function start(m) {
  S = { M: MISSIONS[m.mission], mission: m.mission, archive: new Map(), evals: 0, running: true, run: null };
  for (const e of m.archive || []) S.archive.set(e.key, e);
  newRun();
  setTimeout(work, 0);
}

// one candidate per tick so stop/verify messages stay responsive
function work() {
  if (!S || !S.running) return;
  const R = S.run;
  if (!R.X) { R.X = R.es.ask(); R.F = []; }
  const k = R.F.length;
  const g = toGenome(R.sketch, R.X[k]);
  const known = S.archive.get(R.key);
  const res = fitnessOf(g, S.M, known && known.fitness > 0 ? 0.8 * known.fitness : 0);
  R.F.push(res.fitness);
  S.evals++;
  if (!res.raced && res.fitness > (known ? known.fitness : -Infinity)) {
    const e = { key: R.key, genome: round6(g), fitness: res.fitness };
    S.archive.set(R.key, e);
    if (res.fitness > 0) postMessage({ type: 'elite', ...e });
  }
  if (R.F.length === R.X.length) {
    R.es.tell(R.F);
    R.X = null;
    R.gens++;
    if (R.gens >= 12 || R.es.stagnant(6)) newRun();
  }
  if (S.evals % 4 === 0) {
    const best = [...S.archive.values()].sort((a, b) => b.fitness - a.fitness)[0] || null;
    postMessage({ type: 'progress', evals: S.evals, sketch: S.run.key, best });
  }
  setTimeout(work, 0);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') start(m);
  else if (m.type === 'stop') { if (S) S.running = false; }
  else if (m.type === 'archive') {
    if (S) for (const x of m.entries) { const cur = S.archive.get(x.key); if (!cur || x.fitness > cur.fitness) S.archive.set(x.key, x); }
  } else if (m.type === 'verify') {
    postMessage({ type: 'verified', id: m.id, fitness: fitnessOf(m.genome, MISSIONS[m.mission], 0).fitness });
  }
};
