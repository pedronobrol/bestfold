// Design space: a genome in [0,1]^D decoded into a concrete, foldable design.
// Everything a human needs to reproduce the plane is in the decoded design:
// sheet, fold sequence, wing geometry, trims and how to throw it.

export const SHEETS = {
  A4: { W: 0.210, L: 0.297, name: 'A4 (210 × 297 mm)' },
  LETTER: { W: 0.2159, L: 0.2794, name: 'US Letter (8.5 × 11 in)' },
};
export const PAPER_GSM = 80; // g/m²

export const MISSIONS = {
  distance: {
    key: 'distance',
    title: 'Distance',
    launchSpeed: 11, // m/s, median of a firm overhand throw
    launchHeight: 1.7,
    pitchRange: [-4, 45],
    bankRange: [0, 20],
    maxTime: 25,
    ceiling: 9,
  },
  hangtime: {
    key: 'hangtime',
    title: 'Hang time',
    launchSpeed: 15, // m/s, thrown hard and steeply upward
    launchHeight: 1.7,
    pitchRange: [30, 85],
    bankRange: [0, 50],
    maxTime: 40,
    ceiling: 9,
  },
};

export const MAX_NOSE_FOLDS = 4;
// v2 genomes (before locks, pleats and the body-fold choice) had 23 genes; they still decode, to
// the same design, because every gene added since reads 0 as "the old behaviour".
export const LEGACY_GENOME_SIZE = 2 + 3 * MAX_NOSE_FOLDS + 9;
export const GENOME_SIZE = LEGACY_GENOME_SIZE + 1 + MAX_NOSE_FOLDS;
const O = 2 + 3 * MAX_NOSE_FOLDS; // first gene after the nose-fold slots

// Pad a legacy genome with zeros and clamp to [0,1].
export const normalizeGenome = (genome) => Array.from({ length: GENOME_SIZE }, (_, i) => Math.min(1, Math.max(0, genome[i] ?? 0)));

const deg = Math.PI / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const L = (a, b, t) => a + (b - a) * t;

// What the tutorial prints is what gets simulated: lengths snap to 1 mm, angles to 1°.
const mm = (x) => Math.round(x * 1000) / 1000;
const d1 = (radians) => Math.round(radians / deg) * deg;

// Genome layout (all genes in [0,1]):
//  0 orientation | 1 fold count | 3 per nose fold: type, a, b |
//  keel depth at nose, at tail | dihedral | winglet on, width, angle | elevator chord | trim CL | launch bank |
//  body fold (< 0.5 valley, flaps inside; ≥ 0.5 mountain, flaps outside) | 1 variant per nose fold
// A nose fold's type gene picks a corner fold (< 0.72) or a fold square to the centre line; for the
// latter its variant gene picks a plain nose fold (< 0.5), a Nakamura lock (< 0.75) or a pleat.
// The elevator angle and the launch pitch are not genes: they are solved per plane (see evaluate.js),
// the way a person trims and throws a plane.
export const VARIANT = { tip: 0.25, lock: 0.625, pleat: 0.875 };
const variantOf = (v) => (v < 0.5 ? 'tip' : v < 0.75 ? 'lock' : 'pleat');
export function decode(genome, mission = MISSIONS.distance, sheetKey = 'A4') {
  const g = normalizeGenome(genome);
  const base = SHEETS[sheetKey];
  const landscape = g[0] >= 0.5;
  const sheet = landscape ? { W: base.L, L: base.W } : { W: base.W, L: base.L };
  const nFolds = Math.min(MAX_NOSE_FOLDS, Math.floor(g[1] * (MAX_NOSE_FOLDS + 1)));
  const noseFolds = [];
  for (let i = 0; i < nFolds; i++) {
    const t = g[2 + 3 * i], a = g[3 + 3 * i], b = g[4 + 3 * i];
    if (t < 0.72) {
      noseFolds.push({ type: 'diag', theta: d1(L(10, 65, a) * deg), offset: b < 0.35 ? 0 : mm((b - 0.35) * 0.16) });
    } else if (variantOf(g[O + 10 + i]) === 'tip') {
      noseFolds.push({ type: 'tip', depth: mm(L(0.01, 0.14, a)) });
    } else if (variantOf(g[O + 10 + i]) === 'lock') {
      noseFolds.push({ type: 'lock', depth: mm(L(0.005, 0.03, a)) });
    } else {
      const at = mm(L(0.015, 0.08, a));
      noseFolds.push({ type: 'pleat', at, width: mm(L(0.25, 0.75, b) * at) });
    }
  }
  const o = O;
  return {
    sheetKey,
    landscape,
    sheet,
    noseFolds,
    bodyFold: g[o + 9] >= 0.5 ? 'mountain' : 'valley',
    wing: {
      dNose: mm(L(0.002, 0.05, g[o])),
      dTail: mm(L(0.006, 0.07, g[o + 1])),
      dihedral: d1(L(-6, 24, g[o + 2]) * deg),
    },
    winglet: { enabled: g[o + 3] > 0.6, width: mm(L(0.008, 0.045, g[o + 4])), angle: Math.round(L(20, 90, g[o + 5]) / 5) * 5 * deg },
    elevator: { chord: g[o + 6] < 0.12 ? 0 : mm(L(0.008, 0.03, (g[o + 6] - 0.12) / 0.88)), angle: 0 },
    trimCL: Math.round(L(0.08, 0.5, g[o + 7]) * 100) / 100,
    launch: {
      pitch: null, // solved per plane
      bank: d1(L(mission.bankRange[0], mission.bankRange[1], g[o + 8]) * deg),
      speed: mission.launchSpeed,
      height: mission.launchHeight,
    },
  };
}

// Inverse helpers for seeding the optimiser with known classics.
const inv = (a, b, v) => clamp01((v - a) / (b - a));
export function encode(d, mission = MISSIONS.distance) {
  const g = new Array(GENOME_SIZE).fill(0.5);
  g[0] = d.landscape ? 0.75 : 0.25;
  g[1] = (d.noseFolds.length + 0.5) / (MAX_NOSE_FOLDS + 1);
  for (let i = 0; i < MAX_NOSE_FOLDS; i++) g[O + 10 + i] = VARIANT.tip;
  d.noseFolds.forEach((f, i) => {
    if (f.type === 'diag') {
      g[2 + 3 * i] = 0.3;
      g[3 + 3 * i] = inv(10, 65, f.theta / deg);
      g[4 + 3 * i] = f.offset > 0 ? 0.35 + f.offset / 0.16 : 0.1;
    } else {
      g[2 + 3 * i] = 0.9;
      g[O + 10 + i] = VARIANT[f.type];
      if (f.type === 'tip') g[3 + 3 * i] = inv(0.01, 0.14, f.depth);
      else if (f.type === 'lock') g[3 + 3 * i] = inv(0.005, 0.03, f.depth);
      else { g[3 + 3 * i] = inv(0.015, 0.08, f.at); g[4 + 3 * i] = inv(0.25, 0.75, f.width / f.at); }
    }
  });
  const o = O;
  g[o + 9] = d.bodyFold === 'mountain' ? 0.75 : 0.25;
  g[o] = inv(0.002, 0.05, d.wing.dNose);
  g[o + 1] = inv(0.006, 0.07, d.wing.dTail);
  g[o + 2] = inv(-6, 24, d.wing.dihedral / deg);
  g[o + 3] = d.winglet.enabled ? 0.8 : 0.2;
  g[o + 4] = inv(0.008, 0.045, d.winglet.width);
  g[o + 5] = inv(20, 90, d.winglet.angle / deg);
  g[o + 6] = d.elevator.chord === 0 ? 0.05 : 0.12 + 0.88 * inv(0.008, 0.03, d.elevator.chord);
  g[o + 7] = inv(0.08, 0.5, d.trimCL ?? 0.3);
  g[o + 8] = inv(mission.bankRange[0], mission.bankRange[1], (d.launch.bank || 0) / deg);
  return g;
}

// Well-known reference designs, expressed in the same design language.
export const CLASSICS = {
  dart: {
    name: 'Classic Dart',
    design: {
      sheetKey: 'A4', landscape: false,
      noseFolds: [
        { type: 'diag', theta: 45 * deg, offset: 0 },
        { type: 'diag', theta: 22.5 * deg, offset: 0 },
      ],
      wing: { dNose: 0.004, dTail: 0.035, dihedral: 4 * deg },
      winglet: { enabled: false, width: 0.02, angle: 60 * deg },
      elevator: { chord: 0.01, angle: 0 }, // most people bend the tail up a little
      launch: { pitch: 6 * deg },
    },
  },
  // Corners to the centre; nose down past the ends of those folds so its point shows below the
  // next pair; corners to the centre again; the point folded up over them locks them; fold in
  // half away from you (mountain) so the lock stays outside.
  nakamura: {
    name: 'Nakamura Lock',
    design: {
      sheetKey: 'A4', landscape: false,
      noseFolds: [
        { type: 'diag', theta: 45 * deg, offset: 0 },
        { type: 'tip', depth: 0.12 },
        { type: 'diag', theta: 45 * deg, offset: 0 },
        { type: 'lock', depth: 0.012 },
      ],
      bodyFold: 'mountain',
      wing: { dNose: 0.006, dTail: 0.03, dihedral: 6 * deg },
      winglet: { enabled: false, width: 0.02, angle: 60 * deg },
      elevator: { chord: 0.012, angle: 8 * deg },
      launch: { pitch: 6 * deg },
    },
  },
  glider: {
    name: 'Wide Glider',
    design: {
      sheetKey: 'A4', landscape: true,
      noseFolds: [
        { type: 'tip', depth: 0.04 },
        { type: 'tip', depth: 0.03 },
        { type: 'tip', depth: 0.025 },
      ],
      wing: { dNose: 0.015, dTail: 0.017, dihedral: 8 * deg },
      winglet: { enabled: true, width: 0.018, angle: 80 * deg },
      elevator: { chord: 0.012, angle: 10 * deg },
      launch: { pitch: 4 * deg },
    },
  },
};

export function completeDesign(partial, mission = MISSIONS.distance) {
  const base = SHEETS[partial.sheetKey || 'A4'];
  const sheet = partial.landscape ? { W: base.L, L: base.W } : { W: base.W, L: base.L };
  return {
    bodyFold: 'valley',
    ...partial,
    sheet,
    trimCL: partial.trimCL ?? 0.3,
    launch: { speed: mission.launchSpeed, height: mission.launchHeight, bank: 0, pitch: null, ...partial.launch },
  };
}
