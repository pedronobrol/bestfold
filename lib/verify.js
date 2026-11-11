// Server-side verification: every submitted design is re-simulated with the same engine the
// browsers run, so the board only ever shows scores the server computed itself.
import { decode, MISSIONS, GENOME_SIZE, LEGACY_GENOME_SIZE, normalizeGenome } from '../src/design.js';
import { evaluate } from '../src/evaluate.js';
import { fromGenome, sketchKey } from '../src/sketch.js';

export function validGenome(g) {
  return Array.isArray(g) && (g.length === GENOME_SIZE || g.length === LEGACY_GENOME_SIZE)
    && g.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1);
}

// Returns { feasible, score, key, genome } for a mission ('distance' | 'hangtime').
export function verifyDesign(mission, genome) {
  const M = MISSIONS[mission];
  const g = normalizeGenome(genome.map((x) => Math.round(x * 1e6) / 1e6));
  const r = evaluate(decode(g, M), M);
  return { feasible: !!r.feasible, score: r.feasible ? r.score : 0, key: sketchKey(fromGenome(g).sketch), genome: g };
}
