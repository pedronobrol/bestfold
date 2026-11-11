// Robust mission evaluation.
//
//  1. Feasibility rules (Deb): a design that cannot be built or flown sensibly never flies.
//     Infeasible designs are ranked by their total normalised violation instead of a score.
//  2. Per-plane policy: the elevator is solved for static trim at the design's target lift
//     coefficient, and the launch pitch is found by a short search, the way a person trims and
//     throws a plane. Neither is a gene.
//  3. Root-crease flex: paper creases are springs, so wings ride up under load. The glide
//     dihedral is solved statically; a hard launch must not fold the wings past 60°.
//  4. Robustness: 16 joint scenarios (throw, release, folding errors, model uncertainty) drawn
//     once by Latin hypercube (common random numbers for every design). Score = CVaR50, the
//     mean of the worst 8 outcomes. After 8 scenarios the mean of the worst 8 seen is an upper
//     bound on the final score, which allows exact early rejection ("racing").

import { foldPlane } from './fold.js';
import { retentionOf } from './retention.js';
import { buildAircraft, staticMargin, aero, RHO } from './physics.js';
import { simulate } from './flight.js';

const deg = Math.PI / 180;

// ---------- fixed scenario set ----------
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lhs(n, dims, seed) {
  const r = rng(seed), cols = [];
  for (let d = 0; d < dims; d++) {
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    cols.push(perm.map((p) => (p + r()) / n));
  }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}
const lerp = (a, b, t) => a + (b - a) * t;
// inverse normal CDF (Acklam's rational approximation)
const ninv = (u) => {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const p = Math.min(1 - 1e-9, Math.max(1e-9, u));
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
};

// Folding-error variants: how a real person's copy differs from the design.
const GV = lhs(4, 5, 7);
export const GEOS = Object.fromEntries(GV.map((u, k) => [`g${k}`, {
  dihSym: (u[0] * 2 - 1) * 6 * deg, // both wings set a little higher/lower than instructed
  dDihedral: (u[1] * 2 - 1) * 3 * deg, // left/right dihedral mismatch
  elevSym: (u[2] * 2 - 1) * 3 * deg, // elevator bent a bit more/less
  dElev: (u[3] * 2 - 1) * 3 * deg, // left/right elevator mismatch
  cgShift: [(u[4] * 2 - 1) * 0.004, 0, 0], // balance point ±4 mm
}]));
export const N_SCENARIOS = 16;
export const SCENARIOS = lhs(N_SCENARIOS, 11, 2026).map((u, i) => {
  const sc = {
    geo: `g${i % 4}`,
    speedMul: Math.exp(0.15 * ninv(u[0])),
    dPitch: (u[1] * 2 - 1) * 6 * deg,
    alpha: (u[2] * 2 - 1) * 4 * deg,
    beta: (u[3] * 2 - 1) * 3 * deg,
    dBank: (u[4] * 2 - 1) * 8 * deg,
    rates: [ninv(u[5]), ninv(u[6]), ninv(u[7])],
    dHeight: (u[8] * 2 - 1) * 0.15,
    cdMul: lerp(0.8, 1.4, u[9]),
    clmaxMul: lerp(0.8, 1.1, u[10]),
  };
  const pct = Math.round((sc.speedMul - 1) * 100);
  sc.name = `Throw ${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% speed, nose ${sc.dPitch >= 0 ? '+' : '−'}${Math.abs(sc.dPitch / deg).toFixed(0)}°, ${Math.abs(sc.dBank / deg).toFixed(0)}° bank, folded copy ${(i % 4) + 1}`;
  return sc;
});
export const NOMINAL = { name: 'Clean throw', geo: 'nominal' };

// ---------- helpers ----------
// Pitching-moment coefficient (nose-up positive) at a target lift coefficient, V = 6 m/s.
export function cmAtCL(ac, CLt, V = 6) {
  const cbar = ac.Sref / Math.max(ac.span, 1e-3), q = 0.5 * RHO * V * V * ac.Sref;
  const at = (a) => {
    const u = [V * Math.cos(a), 0, -V * Math.sin(a)];
    const { F, M } = aero(ac, u, [0, 0, 0]);
    return { CL: (F[2] * u[0] - F[0] * u[2]) / V / q, Cm: -M[1] / (q * cbar) };
  };
  let lo = -6 * deg, hi = 22 * deg, plo = at(lo), phi = at(hi);
  if (CLt < plo.CL || CLt > phi.CL) return null;
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2, pm = at(mid);
    if (pm.CL < CLt) { lo = mid; plo = pm; } else { hi = mid; phi = pm; }
  }
  return { alpha: (lo + hi) / 2, Cm: (plo.Cm + phi.Cm) / 2 };
}
const withElevator = (design, angle) => ({ ...design, elevator: { ...design.elevator, angle } });

// Crease stiffness, N·m per metre of crease per radian, per ply (Pradier et al. 2016, scaled to 80 g/m²)
const K_CREASE = 0.015;
// A lock tab wrapped round the keel crease holds it closed far better than a bare crease: each
// metre of locked keel counts as this many metres of crease (uncalibrated; refit in step 11).
const KEEL_LOCK_GAIN = 10;
// Largest flap that may be held by nothing (it springs open in flight and catches the air).
const MAX_FREE_FLAP = 4e-4; // 4 cm²

// An aircraft at its glide dihedral plus a twin with the wings FLEX_SPAN higher; the flight
// model blends between them by load factor (see flexAero in flight.js).
const FLEX_SPAN = 25 * deg;
export function withFlex(geom, asym, cgShift, perG) {
  const ac = buildAircraft(geom, { asym, cgShift });
  if (!ac) return null;
  if (perG > 0.2 * deg) {
    const twin = buildAircraft(geom, { asym: { ...asym, dihSym: (asym.dihSym || 0) + FLEX_SPAN }, cgShift });
    if (twin) ac.flex = { twin, perG, span: FLEX_SPAN };
  }
  return ac;
}

// ---------- preparation: feasibility + per-plane policy ----------
export function prepare(design, mission) {
  const viol = [];
  const add = (name, v) => { if (v > 0) viol.push({ name, v }); };
  const fail = (name) => ({ feasible: false, violation: 10, violations: [{ name, v: 10 }] });
  const geom0 = foldPlane(design);
  if (!geom0.ok) return fail(geom0.reason);
  const plies = geom0.phaseB.plies;
  add('more than 8 layers at a crease', (plies.max - 8) / 4);
  // folds alone must hold the plane together: a large loose flap is not a finished plane
  const retention = retentionOf(geom0);
  add('unlocked flap larger than 4 cm²', (retention.maxFreeFlapArea - MAX_FREE_FLAP) / MAX_FREE_FLAP);
  // a design that asks for a lock must get one (the fold engine skips a lock whose nose point is
  // not exposed); otherwise lock sketches would be filled by planes without a lock
  const locksAsked = design.noseFolds.filter((f) => f.type === 'lock').length;
  add('lock cannot be folded (nose point not exposed)', locksAsked - geom0.steps.filter((s) => s.kind === 'lock').length);

  // trim: elevator angle that gives Cm = 0 at the target lift coefficient
  const d = { ...design, launch: { ...design.launch } };
  const ac0 = buildAircraft(geom0);
  if (!ac0) return fail('degenerate lattice');
  let elevAngle = 0, trimAlpha = null;
  if (design.elevator.chord > 0) {
    const ac1 = buildAircraft(foldPlane(withElevator(design, 12 * deg)));
    const c0 = cmAtCL(ac0, design.trimCL), c1 = ac1 && cmAtCL(ac1, design.trimCL);
    if (!c0 || !c1) add('target lift coefficient unreachable', 1);
    else {
      const need = (-c0.Cm * 12) / (c1.Cm - c0.Cm || 1e-9);
      const clamped = Math.max(-8, Math.min(20, need));
      add('cannot trim with the elevator', Math.abs(need - clamped) / 10);
      elevAngle = Math.round(clamped) * deg;
      trimAlpha = c0.alpha;
    }
  } else {
    const c0 = cmAtCL(ac0, design.trimCL);
    if (!c0) add('target lift coefficient unreachable', 1);
    else { add('not trimmed (no elevator)', Math.abs(c0.Cm) / 0.02); trimAlpha = c0.alpha; }
  }
  d.elevator = { ...design.elevator, angle: elevAngle };
  const geom = elevAngle ? foldPlane(d) : geom0;
  let ac = elevAngle ? buildAircraft(geom) : ac0;
  if (!ac) return fail('degenerate lattice');

  // root-crease flex: wings ride up under load (springs at the wing root and the keel crease)
  const W = ac.mass * 9.81;
  const pb = geom.phaseB;
  const hingeX = (y) => pb.hinge.a[0] + ((pb.hinge.b[0] - pb.hinge.a[0]) * (y - pb.hinge.a[1])) / (pb.hinge.b[1] - pb.hinge.a[1]);
  const ws = ac.strips.filter((s) => s.kind === 'wing' && s.half === 'L' && s.flatMid);
  const area = ws.reduce((a, s) => a + s.area, 0) || 1;
  const arm = ws.reduce((a, s) => a + s.area * Math.max(0, s.flatMid[0] - hingeX(s.flatMid[1])), 0) / area;
  const keelDepth = Math.max(0, hingeX(ac.cg[0]));
  const kRoot = K_CREASE * Math.max(0.02, plies.hingeLength) * Math.max(1, plies.wing);
  const kBody = K_CREASE * (Math.max(0.02, plies.keelLength) + KEEL_LOCK_GAIN * retention.keelLockedLength) * Math.max(1, plies.body);
  const dGamma = ((W / 2) * arm) / kRoot + ((W / 2) * (arm + keelDepth)) / kBody;
  // A firm launch pulls ~2.5 g; creases stiffen as they close, so the linear estimate is conservative.
  const launchLoad = 2.5;
  add('wings fold up at launch', (design.wing.dihedral + dGamma * launchLoad - 70 * deg) / (30 * deg));
  ac = withFlex(geom, { dihSym: dGamma }, null, dGamma);
  if (!ac) return fail('degenerate lattice');

  // stability and handling
  const { sm } = staticMargin(ac);
  add('static margin below 5%', (0.05 - sm) / 0.05);
  add('static margin above 25%', (sm - 0.25) / 0.1);
  add('keel too shallow to grip (<12 mm)', (0.012 - ac.keelGrip) / 0.012);

  const violation = viol.reduce((a, x) => a + x.v, 0);
  return { feasible: violation <= 0, violation, violations: viol, design: d, geom, ac, plies, retention, sm, dGamma, trimAlpha };
}

export function metricOf(mission, r) {
  if (r.end === 'energy' || r.end === 'diverged') return 0;
  // distance counts downrange progress inside a ±3 m corridor
  if (mission.key === 'distance') return Math.max(0, r.downrange - Math.max(0, Math.abs(r.lateral) - 3));
  return r.time;
}
const crashed = (r) => r.end === 'tumbling' || r.end === 'diverged' || r.end === 'energy';

// Best launch pitch for the nominal throw: coarse grid, then refine around the best.
function solvePitch(ac, launch, mission) {
  const [lo, hi] = mission.pitchRange;
  const fly = (p) => metricOf(mission, simulate(ac, { ...launch, pitch: p * deg }, {}, { maxTime: mission.maxTime, ceiling: mission.ceiling, dt: 0.004 }));
  let best = { p: lo, m: -1 };
  const N = 5;
  for (let k = 0; k < N; k++) { const p = lo + ((hi - lo) * k) / (N - 1); const m = fly(p); if (m > best.m) best = { p, m }; }
  const step = (hi - lo) / (N - 1) / 2;
  for (const p of [best.p - step, best.p + step]) if (p >= lo && p <= hi) { const m = fly(p); if (m > best.m) best = { p, m }; }
  return Math.round(best.p) * deg;
}

// ---------- evaluation ----------
// opts: threshold (score to beat, enables racing), record, recordEvery, quick (nominal only),
//       pitch (fixed launch pitch), force (fly even if infeasible, for display)
export function evaluate(design, mission, opts = {}) {
  const P = prepare(design, mission);
  if (!P.feasible && !(opts.force && P.ac)) return { score: 0, fitness: -1 - P.violation, valid: false, ...P };
  const d = P.design;
  d.launch.pitch = opts.pitch ?? solvePitch(P.ac, d.launch, mission);
  const simOpts = { maxTime: mission.maxTime, ceiling: mission.ceiling, dt: 0.004, record: !!opts.record, recordEvery: opts.recordEvery };
  const nominal = simulate(P.ac, d.launch, {}, simOpts);
  const acs = { nominal: P.ac };
  const results = [];
  let raced = false;
  if (!opts.quick) {
    for (const k of Object.keys(GEOS)) {
      const g = GEOS[k];
      acs[k] = withFlex(P.geom, { ...g, dihSym: g.dihSym + (P.dGamma || 0) }, g.cgShift, P.dGamma || 0);
    }
    for (const sc of SCENARIOS) {
      const ac = acs[sc.geo];
      const set = (a, cd, cl) => { a.cdMul = cd; a.clmaxMul = cl; if (a.flex) { a.flex.twin.cdMul = cd; a.flex.twin.clmaxMul = cl; } };
      set(ac, sc.cdMul, sc.clmaxMul);
      const r = simulate(ac, d.launch, sc, simOpts);
      set(ac, 1, 1);
      results.push({ name: sc.name, metric: metricOf(mission, r), ...r });
      if (opts.threshold > 0 && results.length >= 8 && results.length < SCENARIOS.length) {
        const worst = results.map((x) => x.metric).sort((a, b) => a - b).slice(0, 8);
        if (worst.reduce((a, b) => a + b, 0) / 8 < opts.threshold) { raced = true; break; }
      }
    }
  }
  const ms = results.map((r) => r.metric).sort((a, b) => a - b);
  const nominalMetric = metricOf(mission, nominal);
  const cvar = ms.length ? ms.slice(0, 8).reduce((a, b) => a + b, 0) / Math.min(8, ms.length) : nominalMetric;
  const mean = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : cvar;
  // flight-behaviour rule: a design may tumble in at most 2 of 16 throws
  const crashFrac = results.length ? results.filter(crashed).length / results.length : crashed(nominal) ? 1 : 0;
  let violation = P.violation;
  const violations = [...P.violations];
  if (crashFrac > 2 / 16) { const v = (crashFrac - 2 / 16) * 4; violation += v; violations.push({ name: 'tumbles in too many throws', v }); }
  const feasible = violation <= 0;
  return {
    score: cvar, robust: cvar, mean, min: ms[0] ?? cvar, raced, feasible, valid: true,
    fitness: feasible ? cvar : -1 - violation, violation, violations,
    nominal: { name: NOMINAL.name, metric: nominalMetric, ...nominal },
    results, design: d, geom: P.geom, ac: P.ac, acs, sm: P.sm, plies: P.plies, retention: P.retention, dGamma: P.dGamma, trimAlpha: P.trimAlpha,
    mass: P.ac.mass, Sref: P.ac.Sref, span: P.ac.span, keelGrip: P.ac.keelGrip,
  };
}
