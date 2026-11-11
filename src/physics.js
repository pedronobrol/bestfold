// Aircraft model built from the folded geometry:
//  * exact mass, centre of gravity and inertia from the paper facets (every layer counted)
//  * vortex-lattice aerodynamics on wings, keel and winglets, with the
//    boundary-condition solve precomputed so each force evaluation is O(N)
//  * partial leading-edge suction (sharp paper edges), viscous drag,
//    full-range post-stall flat-plate model, apparent (added) air mass
//  * a wing-flex estimate from layer counts, so flimsy single-layer wings are penalised
//  * free (unretained) flaps spring partly open and add their frontal area as base drag

import {
  add, sub, scale, dot, cross, norm, normalize, lerp3, lu, line2, polyArea,
} from './geom.js';
import { facets3D, makeMap3D, regionOf, chordAlong, layersAt } from './fold.js';
import { PAPER_GSM } from './design.js';
import { retentionOf } from './retention.js';

export const RHO = 1.204; // kg/m³
export const NU = 1.5e-5; // m²/s
const PAPER_T = 1.0e-4; // paper thickness (m)
const SUCTION = 0.2; // fraction of leading-edge suction realised by a sharp paper edge
const FORM_CD = 0.004; // planform roughness and crease ridges (per unit wetted planform)
const BASE_CD = 1.0; // base drag of a blunt multi-ply leading edge, on its frontal area
// A flap held by nothing springs open until its crease spring balances the airload: ~20° for a
// sharp 80 g/m² crease at glide speed (Fable review §3; to be refitted in the validation step).
const FREE_FLAP_OPEN = (20 * Math.PI) / 180;
const CORE = 0.003; // vortex core size (m)
const WAKE = 30; // trailing leg length (m)
const deg = Math.PI / 180;

// ---------- mass properties ----------
export function massProps(tris3D) {
  const sigma = PAPER_GSM / 1000;
  let m = 0;
  const c = [0, 0, 0];
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const P of tris3D) {
    for (let i = 1; i + 1 < P.length; i++) {
      const v = [P[0], P[i], P[i + 1]];
      const A = 0.5 * norm(cross(sub(v[1], v[0]), sub(v[2], v[0])));
      if (A <= 0) continue;
      const mt = sigma * A;
      const s = add(add(v[0], v[1]), v[2]);
      m += mt;
      for (let k = 0; k < 3; k++) c[k] += (mt * s[k]) / 3;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        let vv = 0;
        for (const p of v) vv += p[a] * p[b];
        S[a][b] += (mt / 12) * (vv + s[a] * s[b]);
      }
    }
  }
  const cg = c.map((x) => x / m);
  const Sc = S.map((r, a) => r.map((x, b) => x - m * cg[a] * cg[b]));
  const tr = Sc[0][0] + Sc[1][1] + Sc[2][2];
  const I = Sc.map((r, a) => r.map((x, b) => (a === b ? tr : 0) - x));
  return { m, cg, I };
}

// ---------- Biot–Savart for a straight segment, unit strength ----------
function segVel(P, A, B, core = CORE) {
  const r1 = sub(P, A), r2 = sub(P, B), r0 = sub(B, A);
  const cr = cross(r1, r2);
  const cr2 = dot(cr, cr) + core * core * dot(r0, r0);
  const n1 = norm(r1), n2 = norm(r2);
  if (n1 < 1e-9 || n2 < 1e-9) return [0, 0, 0];
  const k = (dot(r0, r1) / n1 - dot(r0, r2) / n2) / (4 * Math.PI * cr2);
  return scale(cr, k);
}
function horseshoeVel(P, hs, includeBound = true) {
  const Ainf = [hs.A[0] - WAKE, hs.A[1], hs.A[2]];
  const Binf = [hs.B[0] - WAKE, hs.B[1], hs.B[2]];
  // core radius scales with the panel width so narrow panels still see their own vortex
  const core = Math.min(CORE, 0.15 * norm(sub(hs.B, hs.A)));
  let v = add(segVel(P, Ainf, hs.A, core), segVel(P, hs.B, Binf, core));
  if (includeBound) v = add(v, segVel(P, hs.A, hs.B, core));
  return v;
}

// ---------- lattice ----------
function buildSurface(geom, map, spec) {
  const { root, outer, polys, half, ns, nc, kind } = spec;
  const elevY = geom.phaseB.elevY;
  const rows = [];
  for (let j = 0; j <= ns; j++) {
    // wings: sine spacing (finer toward the tip, where loading changes fastest); others uniform
    const t = kind === 'wing' ? 0.004 + 0.992 * Math.sin((Math.PI / 2) * (j / ns)) : 0.005 + 0.99 * (j / ns);
    const p0 = [root[0][0] + (outer[0][0] - root[0][0]) * t, root[0][1] + (outer[0][1] - root[0][1]) * t];
    const p1 = [root[1][0] + (outer[1][0] - root[1][0]) * t, root[1][1] + (outer[1][1] - root[1][1]) * t];
    const Lc = line2(p0, p1);
    const r = chordAlong(polys, Lc);
    if (!r) { rows.push(null); continue; }
    const at = (u) => [Lc.p[0] + Lc.d[0] * u, Lc.p[1] + Lc.d[1] * u];
    const LE = at(r[1]), TE = at(r[0]);
    let us;
    if (kind === 'wing' && elevY !== null && TE[1] < elevY - 0.002 && LE[1] > elevY + 0.01) {
      const uh = r[0] + (r[1] - r[0]) * ((elevY - TE[1]) / (LE[1] - TE[1]));
      us = [];
      for (let i = 0; i < nc; i++) us.push(r[1] + ((uh - r[1]) * i) / (nc - 1)); // LE..hinge
      us.push(r[0]);
    } else {
      us = [];
      for (let i = 0; i <= nc; i++) us.push(r[1] + ((r[0] - r[1]) * i) / nc);
    }
    const flat = us.map(at);
    rows.push({
      flat,
      pts: flat.map((q) => map(q, half, kind === 'keel' ? 'keel' : regionOfSurface(geom, q, kind))),
      chord: r[1] - r[0],
    });
  }
  return latticeFromRows(rows, { kind, half, nc });
}

// Panels and strips from spanwise rows of chordwise points (each row: {pts:[LE..TE], flat?, chord}).
export function latticeFromRows(rows, { kind, half, nc }) {
  const ns = rows.length - 1;
  const panels = [], strips = [];
  for (let j = 0; j < ns; j++) {
    const ra = rows[j], rb = rows[j + 1];
    if (!ra || !rb || ra.chord < 0.004 || rb.chord < 0.004) continue;
    const strip = { panels: [], kind, half };
    for (let i = 0; i < nc; i++) {
      const P00 = ra.pts[i], P01 = rb.pts[i], P10 = ra.pts[i + 1], P11 = rb.pts[i + 1];
      const A = lerp3(P00, P10, 0.25), B = lerp3(P01, P11, 0.25);
      const C = lerp3(lerp3(P00, P10, 0.75), lerp3(P01, P11, 0.75), 0.5);
      const d1 = sub(P11, P00), d2 = sub(P01, P10);
      const cr = cross(d1, d2);
      const area = 0.5 * norm(cr);
      let n = normalize(cr);
      // orient normals: wings/winglets "up-ish" in base sense is irrelevant; keep consistent per strip
      strip.panels.push(panels.length);
      panels.push({ A, B, C, n, area, mid: lerp3(A, B, 0.5), corners: [P00, P01, P11, P10] });
    }
    const LEm = lerp3(ra.pts[0], rb.pts[0], 0.5), TEm = lerp3(ra.pts[nc], rb.pts[nc], 0.5);
    strip.LE = LEm;
    strip.TE = TEm;
    if (ra.flat && rb.flat) {
      const fm = (r) => [(r.flat[0][0] + r.flat[nc][0]) / 2, (r.flat[0][1] + r.flat[nc][1]) / 2];
      strip.flatMid = [(fm(ra)[0] + fm(rb)[0]) / 2, (fm(ra)[1] + fm(rb)[1]) / 2];
    }
    strip.chord = norm(sub(TEm, LEm));
    strip.ec = normalize(sub(TEm, LEm));
    let nsum = [0, 0, 0], S = 0;
    for (const k of strip.panels) { nsum = add(nsum, scale(panels[k].n, panels[k].area)); S += panels[k].area; }
    strip.n = normalize(nsum);
    strip.area = S;
    strip.span = S / Math.max(strip.chord, 1e-6);
    strip.Q = lerp3(LEm, TEm, 0.25);
    // leading-edge sweep: angle between the LE line and the spanwise direction (flow is along body x)
    const dLE = sub(rb.pts[0], ra.pts[0]);
    strip.sweep = Math.asin(Math.min(1, Math.abs(dLE[0]) / (norm(dLE) || 1)));
    strip.vortexK = kind === 'keel' ? 0 : Math.min(1, Math.max(0, (strip.sweep - 25 * deg) / (35 * deg)));
    strips.push(strip);
  }
  return { panels, strips };
}
function regionOfSurface(geom, q, kind) {
  const r = regionOf(geom, q);
  if (kind === 'winglet') return 'winglet';
  if (kind === 'wing') return r === 'flap' ? 'flap' : 'wing';
  return r;
}

// ---------- aircraft ----------
export function buildAircraft(geom, opts = {}) {
  const asym = opts.asym || null;
  const map = asym ? makeMap3D(geom, asym) : geom.map3D;
  const res = opts.resolution || { wingS: 8, wingC: 4, keelS: 4, keelC: 3, tipS: 3, tipC: 3 };
  const f3 = facets3D(geom, asym);
  const mp = massProps(f3.map((f) => f.pts));
  const { phaseB } = geom;
  const y0 = phaseB.ymin - 0.05, y1 = phaseB.ymax + 0.05;
  const lineX = (x) => [[x, y0], [x, y1]];
  const hingeAt = (y) => {
    const { a, b } = phaseB.hinge;
    return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  };
  const hingeLine = [[hingeAt(y0), y0], [hingeAt(y1), y1]];
  const polysOf = (half, regions) => geom.facets.filter((f) => f.half === half && regions.includes(f.region)).map((f) => f.cur());
  const outerWing = phaseB.wingletX !== null ? lineX(phaseB.wingletX) : lineX(phaseB.wingXmax);

  const specs = [];
  for (const half of ['L', 'R']) {
    specs.push({ kind: 'wing', half, polys: polysOf(half, ['wing', 'flap']), root: hingeLine, outer: outerWing, ns: res.wingS, nc: res.wingC });
    if (phaseB.wingletX !== null)
      specs.push({ kind: 'winglet', half, polys: polysOf(half, ['winglet']), root: lineX(phaseB.wingletX), outer: lineX(phaseB.wingXmax), ns: res.tipS, nc: res.tipC });
  }
  specs.push({ kind: 'keel', half: 'L', polys: polysOf('L', ['keel']), root: lineX(0), outer: hingeLine, ns: res.keelS, nc: res.keelC });

  let panels = [], strips = [];
  for (const s of specs) {
    const r = buildSurface(geom, map, s);
    const off = panels.length;
    panels = panels.concat(r.panels);
    for (const st of r.strips) { st.panels = st.panels.map((k) => k + off); strips.push(st); }
  }
  for (const s of strips) {
    const filt = s.kind === 'keel' ? (r) => r === 'keel' : s.kind === 'winglet' ? (r) => r === 'winglet' : (r) => r === 'wing' || r === 'flap';
    s.layers = Math.max(1, layersAt(geom, s.flatMid, filt));
    s.plies = s.kind === 'keel' ? 2 * s.layers : s.layers; // keel carries both halves
    s.flapFrontal = 0;
  }
  // Free flaps: their open frontal area goes to the nearest strip of the surface they lie on.
  for (const fl of retentionOf(geom).flaps) {
    if (fl.class !== 'free') continue;
    const cands = strips.filter((s) => s.flatMid && (fl.region === 'keel' ? s.kind === 'keel' : s.kind !== 'keel' && (fl.half === 'both' || s.half === fl.half)));
    let best = null, bd = Infinity;
    for (const s of cands) { const d = Math.hypot(s.flatMid[0] - fl.centroid[0], s.flatMid[1] - fl.centroid[1]); if (d < bd) { bd = d; best = s; } }
    if (best) best.flapFrontal += fl.area * Math.sin(FREE_FLAP_OPEN);
  }
  const ac = assembleAircraft(panels, strips, mp, opts);
  if (!ac) return null;
  ac.geom = geom;
  ac.facets = f3;
  ac.keelGrip = keelGrip(geom, ac.cg);
  return ac;
}

// Vortex-lattice precomputation + mass/apparent-mass assembly for any lattice.
// mp = {m, cg, I} (body coords); opts.cgShift displaces the balance point.
export function assembleAircraft(panels, strips, mp, opts = {}) {
  // shift everything to CG (optionally displaced, to model an imprecisely folded plane)
  const cg = opts.cgShift ? add(mp.cg, opts.cgShift) : mp.cg;
  for (const p of panels) for (const key of ['A', 'B', 'C', 'mid']) p[key] = sub(p[key], cg);
  for (const p of panels) p.corners = p.corners.map((c) => sub(c, cg));
  for (const s of strips) for (const key of ['LE', 'TE', 'Q']) s[key] = sub(s[key], cg);
  const N = panels.length;
  if (N < 4) return null;

  // AIC and precomputed responses
  const AIC = [];
  for (let i = 0; i < N; i++) {
    const row = new Float64Array(N);
    for (let j = 0; j < N; j++) row[j] = dot(horseshoeVel(panels[i].C, panels[j]), panels[i].n);
    AIC.push(row);
  }
  const LU = lu(AIC);
  // RHS_i = (u + ω×r_i)·n_i = u·n_i + ω·(r_i×n_i)
  const G = []; // 6 columns: Γ = Σ G[k] * x_k with x = [u, ω]
  for (let k = 0; k < 6; k++) {
    const b = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const v = k < 3 ? panels[i].n : cross(panels[i].C, panels[i].n);
      b[i] = v[k % 3];
    }
    G.push(LU.solve(b));
  }
  // induced velocity at bound midpoints: Vind_i = Σ_j Γ_j D_ij  -> H[i] (3x6)
  const H = new Float64Array(N * 18);
  for (let i = 0; i < N; i++) {
    const acc = new Array(18).fill(0);
    for (let j = 0; j < N; j++) {
      const v = horseshoeVel(panels[i].mid, panels[j], i !== j);
      for (let k = 0; k < 6; k++) {
        const g = G[k][j];
        acc[k * 3] += v[0] * g; acc[k * 3 + 1] += v[1] * g; acc[k * 3 + 2] += v[2] * g;
      }
    }
    H.set(acc, i * 18);
  }
  const Gf = new Float64Array(N * 6);
  for (let i = 0; i < N; i++) for (let k = 0; k < 6; k++) Gf[i * 6 + k] = G[k][i];

  // flat arrays for speed
  const pv = (key) => { const a = new Float64Array(N * 3); panels.forEach((p, i) => a.set(p[key], i * 3)); return a; };
  const MID = pv('mid'), CP = pv('C'), NRM = pv('n');
  const LV = new Float64Array(N * 3);
  panels.forEach((p, i) => LV.set(sub(p.B, p.A), i * 3));
  const AREA = Float64Array.from(panels.map((p) => p.area));
  const panelStrip = new Int32Array(N);
  strips.forEach((s, k) => s.panels.forEach((i) => (panelStrip[i] = k)));

  // reference quantities (both wings, projected onto horizontal plane)
  let Sref = 0, span = 0;
  for (const s of strips) if (s.kind === 'wing') {
    Sref += s.area * Math.abs(s.n[2]);
    for (const k of s.panels) for (const c of panels[k].corners) span = Math.max(span, Math.abs(c[1]) * 2);
  }
  // added mass (2D strip theory, reduced for finite aspect ratio)
  const Ma = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Ja = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const s of strips) {
    const ma = 0.6 * RHO * Math.PI / 4 * s.chord * s.chord * s.span;
    const rc = cross(lerp3(s.LE, s.TE, 0.5), s.n);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      Ma[a][b] += ma * s.n[a] * s.n[b];
      Ja[a][b] += ma * rc[a] * rc[b];
    }
  }
  const Mt = Ma.map((r, a) => r.map((x, b) => x + (a === b ? mp.m : 0)));
  const Jt = mp.I.map((r, a) => r.map((x, b) => x + Ja[a][b]));

  for (const s of strips) {
    if (s.plies === undefined) { s.layers = 1; s.plies = 1; }
    if (s.flapFrontal === undefined) s.flapFrontal = 0;
  }
  return {
    mass: mp.m, cg, I: mp.I, Mt, Jt, MtInv: inv3(Mt), JtInv: inv3(Jt),
    panels, strips, N, Gf, H, MID, CP, NRM, LV, AREA, panelStrip, Sref, span,
  };
}

export function inv3(M) {
  const [a, b, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const mv3 = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
export { mv3 };

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const CN_plate = (a) => 1.17 * Math.pow(Math.max(0, Math.sin(a)), 0.6);

// Aerodynamic force & moment about CG in body axes, for body velocity u and rates w.
// Returns {F, M, stalled} ; `out` (optional) receives per-strip diagnostics.
export function aero(ac, u, w, out = null) {
  const { N, Gf, H, MID, CP, NRM, LV, AREA, strips } = ac;
  const x = [u[0], u[1], u[2], w[0], w[1], w[2]];
  const Gam = new Float64Array(N);
  const FX = new Float64Array(N), FY = new Float64Array(N), FZ = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const g6 = i * 6;
    const G = Gf[g6] * x[0] + Gf[g6 + 1] * x[1] + Gf[g6 + 2] * x[2] + Gf[g6 + 3] * x[3] + Gf[g6 + 4] * x[4] + Gf[g6 + 5] * x[5];
    Gam[i] = G;
    const h = i * 18;
    let vx = 0, vy = 0, vz = 0;
    for (let k = 0; k < 6; k++) { vx += H[h + 3 * k] * x[k]; vy += H[h + 3 * k + 1] * x[k]; vz += H[h + 3 * k + 2] * x[k]; }
    const mx = MID[i * 3], my = MID[i * 3 + 1], mz = MID[i * 3 + 2];
    // local air velocity relative to the panel: -(u + w×r) + induced
    const Wx = -(u[0] + w[1] * mz - w[2] * my) + vx;
    const Wy = -(u[1] + w[2] * mx - w[0] * mz) + vy;
    const Wz = -(u[2] + w[0] * my - w[1] * mx) + vz;
    const lx = LV[i * 3], ly = LV[i * 3 + 1], lz = LV[i * 3 + 2];
    FX[i] = RHO * G * (Wy * lz - Wz * ly);
    FY[i] = RHO * G * (Wz * lx - Wx * lz);
    FZ[i] = RHO * G * (Wx * ly - Wy * lx);
  }
  // Same physics as the readable vector version, written with scalars because this is the
  // hot loop of every flight (no temporary arrays).
  let Fx = 0, Fy = 0, Fz = 0, Mx = 0, My = 0, Mz = 0;
  let stalledArea = 0, totalArea = 0;
  const u0 = u[0], u1 = u[1], u2 = u[2], w0 = w[0], w1 = w[1], w2 = w[2];
  const wmag = Math.sqrt(w0 * w0 + w1 * w1 + w2 * w2);
  const clmaxMul = ac.clmaxMul || 1, cdMul = ac.cdMul || 1;
  for (let k = 0; k < strips.length; k++) {
    const s = strips[k];
    const ecx = s.ec[0], ecy = s.ec[1], ecz = s.ec[2], nx = s.n[0], ny = s.n[1], nz = s.n[2];
    const Qx = s.Q[0], Qy = s.Q[1], Qz = s.Q[2];
    const Lx = s.LE[0], Ly = s.LE[1], Lz = s.LE[2];
    // strip air velocity at quarter chord (no induced)
    const Wx = -(u0 + w1 * Qz - w2 * Qy), Wy = -(u1 + w2 * Qx - w0 * Qz), Wz = -(u2 + w0 * Qy - w1 * Qx);
    const V = Math.sqrt(Wx * Wx + Wy * Wy + Wz * Wz) + 1e-9;
    const Wn = Wx * nx + Wy * ny + Wz * nz, Wc = Wx * ecx + Wy * ecy + Wz * ecz;
    const aPlate = Math.asin(Math.min(1, Math.abs(Wn) / V)); // 0..90°
    const kv = s.vortexK; // 0 (unswept) .. 1 (strongly swept sharp edge)
    let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0, gsum = 0;
    const pl = s.panels;
    for (let j = 0; j < pl.length; j++) {
      const i = pl[j], px = FX[i], py = FY[i], pz = FZ[i];
      const rx = MID[i * 3], ry = MID[i * 3 + 1], rz = MID[i * 3 + 2];
      fx += px; fy += py; fz += pz;
      mx += ry * pz - rz * py; my += rz * px - rx * pz; mz += rx * py - ry * px;
      gsum += Gam[i];
    }
    // Leading-edge suction (the strip's net forward chordwise force) is mostly lost on a sharp
    // paper edge. On a swept edge it reappears as vortex lift normal to the plate, amplified by
    // 1/cos(sweep) (Polhamus leading-edge suction analogy), acting aft of the quarter chord.
    const fcs = fx * ecx + fy * ecy + fz * ecz;
    if (fcs < 0) {
      const lost = -(1 - SUCTION) * fcs;
      const dx = ecx * lost, dy = ecy * lost, dz = ecz * lost;
      fx += dx; fy += dy; fz += dz;
      mx += Ly * dz - Lz * dy; my += Lz * dx - Lx * dz; mz += Lx * dy - Ly * dx;
      if (kv > 0) {
        const sg = Math.sign(fx * nx + fy * ny + fz * nz) || 1;
        const m = kv * lost * Math.min(3, 1 / Math.cos(s.sweep)) * sg;
        const vx = nx * m, vy = ny * m, vz = nz * m;
        const rvx = Lx + (s.TE[0] - Lx) * 0.45, rvy = Ly + (s.TE[1] - Ly) * 0.45, rvz = Lz + (s.TE[2] - Lz) * 0.45;
        fx += vx; fy += vy; fz += vz;
        mx += rvy * vz - rvz * vy; my += rvz * vx - rvx * vz; mz += rvx * vy - rvy * vx;
      }
    }
    const clEff = Math.abs((2 * gsum) / (V * s.chord));
    // Stall: straight sharp-edged plates stall near 10° (CLmax 0.55-0.7); swept edges hold a
    // leading-edge vortex to ~30°.
    const aStall = (10 + 20 * kv) * deg * Math.min(1.15, clmaxMul);
    let wS = smooth((aPlate - aStall) / (8 * deg));
    wS = Math.max(wS, (1 - kv) * smooth((clEff - 0.62 * clmaxMul) / 0.25));
    if (Wc < 0) wS = Math.max(wS, smooth(-Wc / V / 0.25)); // reversed flow: VLM meaningless
    wS = Math.max(wS, smooth(((wmag * s.chord) / V - 0.3) / 0.3)); // fast rotation: body-fixed wake invalid
    wS = Math.max(wS, smooth((0.55 - Math.abs(Wc) / V) / 0.25)); // mostly spanwise flow
    if (wS > 0) {
      const mag = 0.5 * RHO * V * V * s.area * CN_plate(aPlate) * Math.sign(Wn); // air moving along W pushes the plate along W
      const ppx = nx * mag, ppy = ny * mag, ppz = nz * mag;
      const fwd = Wc >= 0;
      const xcp = (0.25 + 0.22 * (aPlate / (Math.PI / 2))) * s.chord * (fwd ? 1 : -1);
      const ux = fwd ? Lx : s.TE[0], uy = fwd ? Ly : s.TE[1], uz = fwd ? Lz : s.TE[2];
      const rpx = ux + ecx * xcp, rpy = uy + ecy * xcp, rpz = uz + ecz * xcp;
      const a1 = 1 - wS;
      fx = fx * a1 + ppx * wS; fy = fy * a1 + ppy * wS; fz = fz * a1 + ppz * wS;
      mx = mx * a1 + (rpy * ppz - rpz * ppy) * wS;
      my = my * a1 + (rpz * ppx - rpx * ppz) * wS;
      mz = mz * a1 + (rpx * ppy - rpy * ppx) * wS;
      stalledArea += wS * s.area;
    }
    // blunt multi-ply edge: base drag on the frontal area of the leading edge
    const iv = 1 / V, Whx = Wx * iv, Why = Wy * iv, Whz = Wz * iv;
    const qd = 0.5 * RHO * V * V * BASE_CD * cdMul * (s.span * s.plies * PAPER_T + s.flapFrontal);
    fx += Whx * qd; fy += Why * qd; fz += Whz * qd;
    mx += (Ly * Whz - Lz * Why) * qd; my += (Lz * Whx - Lx * Whz) * qd; mz += (Lx * Why - Ly * Whx) * qd;
    // Passivity: a passive strip can never do positive work on the plane. Rigid-body power is
    // F·u + M·ω; any excess is cancelled by an equal drag along the local airflow at Q.
    const P = fx * u0 + fy * u1 + fz * u2 + mx * w0 + my * w1 + mz * w2;
    if (P > 0) {
      const c = P / V, dx = Whx * c, dy = Why * c, dz = Whz * c;
      fx += dx; fy += dy; fz += dz;
      mx += Qy * dz - Qz * dy; my += Qz * dx - Qx * dz; mz += Qx * dy - Qy * dx;
    }
    totalArea += s.area;
    Fx += fx; Fy += fy; Fz += fz; Mx += mx; My += my; Mz += mz;
    if (out) out.push({ aEff: clEff / (2 * Math.PI), aPlate, wS, F: [fx, fy, fz], Q: s.Q });
  }
  // skin friction per panel (both sides) + planform roughness/crease drag
  for (let i = 0; i < N; i++) {
    const cx = CP[i * 3], cy = CP[i * 3 + 1], cz = CP[i * 3 + 2];
    const Wx = -(u0 + w1 * cz - w2 * cy), Wy = -(u1 + w2 * cx - w0 * cz), Wz = -(u2 + w0 * cy - w1 * cx);
    const V = Math.sqrt(Wx * Wx + Wy * Wy + Wz * Wz);
    if (V < 1e-6) continue;
    const ch = strips[ac.panelStrip[i]].chord;
    const Re = Math.max(8000, (V * ch) / NU);
    const k = 0.5 * RHO * V * (2 * 1.328 / Math.sqrt(Re) + FORM_CD) * cdMul * AREA[i];
    const px = Wx * k, py = Wy * k, pz = Wz * k;
    Fx += px; Fy += py; Fz += pz;
    Mx += cy * pz - cz * py; My += cz * px - cx * pz; Mz += cx * py - cy * px;
  }
  const F = [Fx, Fy, Fz], M = [Mx, My, Mz];
  if (out) out.gamma = Gam;
  return { F, M, stall: stalledArea / (totalArea || 1) };
}

// ---------- handling ----------

function keelGrip(geom, cg) {
  // keel depth (flat coords) at the CG station, where the plane is held
  const { a, b } = geom.phaseB.hinge;
  const y = cg[0];
  const d = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  return d;
}


// Static margin (fraction of mean chord) from two angles of attack at glide speed.
export function staticMargin(ac, V = 6) {
  const deg = Math.PI / 180;
  const cbar = ac.Sref / Math.max(ac.span, 1e-3);
  const q = 0.5 * RHO * V * V * ac.Sref;
  const pt = (a) => {
    const u = [V * Math.cos(a * deg), 0, -V * Math.sin(a * deg)];
    const { F, M } = aero(ac, u, [0, 0, 0]);
    const CL = (F[2] * u[0] - F[0] * u[2]) / V / q;
    const Cm = -M[1] / (q * cbar);
    return [CL, Cm];
  };
  const [L1, m1] = pt(3), [L2, m2] = pt(9);
  return { sm: -(m2 - m1) / (L2 - L1 || 1e-9), cbar };
}

// Velocity induced at body-frame point (px,py,pz) by the whole vortex lattice with circulations
// gamma (for flow visualisation: add the free stream to get the local air velocity). Allocation-free
// because the wind-tunnel view calls it for hundreds of particles every frame.
export function inducedVelocity(ac, px, py, pz, gamma, out = [0, 0, 0]) {
  if (!ac._hs) {
    const n = ac.panels.length, hs = new Float64Array(n * 7);
    ac.panels.forEach((p, j) => {
      hs.set([p.A[0], p.A[1], p.A[2], p.B[0], p.B[1], p.B[2], Math.min(CORE, 0.15 * norm(sub(p.B, p.A)))], j * 7);
    });
    ac._hs = hs;
  }
  const hs = ac._hs, n = ac.panels.length;
  let vx = 0, vy = 0, vz = 0;
  // one straight segment a->b with core radius c, unit strength, scaled by g
  const seg = (ax, ay, az, bx, by, bz, c, g) => {
    const r1x = px - ax, r1y = py - ay, r1z = pz - az, r2x = px - bx, r2y = py - by, r2z = pz - bz;
    const r0x = bx - ax, r0y = by - ay, r0z = bz - az;
    const cx = r1y * r2z - r1z * r2y, cy = r1z * r2x - r1x * r2z, cz = r1x * r2y - r1y * r2x;
    const cr2 = cx * cx + cy * cy + cz * cz + c * c * (r0x * r0x + r0y * r0y + r0z * r0z);
    const n1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z), n2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
    if (n1 < 1e-9 || n2 < 1e-9) return;
    const k = (g * ((r0x * r1x + r0y * r1y + r0z * r1z) / n1 - (r0x * r2x + r0y * r2y + r0z * r2z) / n2)) / (4 * Math.PI * cr2);
    vx += cx * k; vy += cy * k; vz += cz * k;
  };
  for (let j = 0; j < n; j++) {
    const g = gamma[j];
    if (g === 0) continue;
    const o = j * 7, ax = hs[o], ay = hs[o + 1], az = hs[o + 2], bx = hs[o + 3], by = hs[o + 4], bz = hs[o + 5], c = hs[o + 6];
    seg(ax - WAKE, ay, az, ax, ay, az, c, g);
    seg(ax, ay, az, bx, by, bz, c, g);
    seg(bx, by, bz, bx - WAKE, by, bz, c, g);
  }
  out[0] = vx; out[1] = vy; out[2] = vz;
  return out;
}
