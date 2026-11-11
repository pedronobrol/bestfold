// A plane's "sketch" is its discrete structure: sheet orientation, the sequence of nose-fold
// operations, the body-fold direction and whether it has winglets. The optimizer keeps one elite
// per sketch (MAP-Elites) and searches the continuous parameters within a sketch with CMA-ES.
// Here we map between a sketch plus a continuous vector x ∈ [0,1]^D and the full genome used by
// design.decode().
//
// Operation letters: d corner (diagonal) fold, t nose (tip) fold, k Nakamura lock, p pleat.
import { GENOME_SIZE, MAX_NOSE_FOLDS, VARIANT, normalizeGenome } from './design.js';

const OPS = ['d', 't', 'k', 'p'];
const NAME = { d: 'diag', t: 'tip', k: 'lock', p: 'pleat' };
const O = 2 + 3 * MAX_NOSE_FOLDS;
const params = (t) => (t === 'd' || t === 'p' ? 2 : 1); // continuous genes per operation

// The search grammar. The fold engine accepts any sequence, but these rules keep the archive to
// sequences that mean something on paper:
//  - a pleat shortens the flat sheet, so it comes first;
//  - a lock folds the point of a nose flap over corner flaps made after it, so it is last and
//    needs a nose fold followed by a corner fold before it.
export function grammarOK(types) {
  if (types.length > MAX_NOSE_FOLDS) return false;
  if (types.indexOf('p') > 0 || types.filter((t) => t === 'p').length > 1) return false;
  const k = types.indexOf('k');
  if (k >= 0) {
    if (k !== types.length - 1) return false;
    const t = types.indexOf('t');
    if (t < 0 || !types.slice(t + 1, k).includes('d')) return false;
  }
  return true;
}

export function allSketches() {
  const seqs = [[]];
  for (let len = 1; len <= MAX_NOSE_FOLDS; len++) {
    for (const p of seqs.filter((s) => s.length === len - 1)) for (const t of OPS) seqs.push([...p, t]);
  }
  const out = [];
  for (const landscape of [false, true]) {
    for (const types of seqs.filter(grammarOK)) {
      for (const winglet of [false, true]) for (const mountain of [false, true]) out.push({ landscape, types, winglet, mountain });
    }
  }
  return out;
}
// Keys of valley-fold sketches are unchanged from v2 ('P:dd:n'); mountain adds ':M'.
export const sketchKey = (s) => `${s.landscape ? 'L' : 'P'}:${s.types.join('') || '-'}:${s.winglet ? 'W' : 'n'}${s.mountain ? ':M' : ''}`;
export const dims = (s) => s.types.reduce((a, t) => a + params(t), 0) + 3 + (s.winglet ? 2 : 0) + 3;

export function toGenome(s, x) {
  const g = new Array(GENOME_SIZE).fill(0.5);
  let k = 0;
  g[0] = s.landscape ? 0.75 : 0.25;
  g[1] = (s.types.length + 0.5) / (MAX_NOSE_FOLDS + 1);
  for (let i = 0; i < MAX_NOSE_FOLDS; i++) g[O + 10 + i] = VARIANT.tip;
  s.types.forEach((t, i) => {
    g[2 + 3 * i] = t === 'd' ? 0.3 : 0.9;
    if (t !== 'd') g[O + 10 + i] = VARIANT[NAME[t]];
    g[3 + 3 * i] = x[k++];
    if (params(t) === 2) g[4 + 3 * i] = x[k++];
  });
  const o = O;
  g[o] = x[k++]; g[o + 1] = x[k++]; g[o + 2] = x[k++];
  g[o + 3] = s.winglet ? 0.8 : 0.2;
  if (s.winglet) { g[o + 4] = x[k++]; g[o + 5] = x[k++]; }
  g[o + 6] = 0.12 + 0.88 * x[k++]; // elevator always present (it is how a paper plane is trimmed)
  g[o + 7] = x[k++];
  g[o + 8] = x[k++];
  g[o + 9] = s.mountain ? 0.75 : 0.25;
  return g;
}
export function fromGenome(genome) {
  const g = normalizeGenome(genome);
  const len = Math.min(MAX_NOSE_FOLDS, Math.floor(g[1] * (MAX_NOSE_FOLDS + 1)));
  const v = (i) => g[O + 10 + i];
  const types = Array.from({ length: len }, (_, i) => (g[2 + 3 * i] < 0.72 ? 'd' : v(i) < 0.5 ? 't' : v(i) < 0.75 ? 'k' : 'p'));
  const o = O;
  const s = { landscape: g[0] >= 0.5, types, winglet: g[o + 3] > 0.6, mountain: g[o + 9] >= 0.5 };
  const x = [];
  types.forEach((t, i) => { x.push(g[3 + 3 * i]); if (params(t) === 2) x.push(g[4 + 3 * i]); });
  x.push(g[o], g[o + 1], g[o + 2]);
  if (s.winglet) x.push(g[o + 4], g[o + 5]);
  x.push(Math.max(0, (g[o + 6] - 0.12) / 0.88), g[o + 7], g[o + 8]);
  return { sketch: s, x };
}
