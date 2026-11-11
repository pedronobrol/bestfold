#!/usr/bin/env node
// Bestfold real-throw validation: analysis of a throw-log.html CSV export against simulator predictions.
//
//   node analyze.js log.csv predictions.json [--metric distance|time] [--boot 2000] [--seed 1] [--nmax 3]
//
// CSV columns (header required, order free; written by throw-log.html):
//   id,session,timestamp,design,copy,thrower,mission,kind,throw_no,speed_ms,angle_deg,alpha_deg,
//   distance_m,time_s,ld,outcome,notes
//   kind = score | trim | glide   (only `score` rows enter the ranking; `glide` rows feed the L/D refit)
//
// predictions.json:
//   { "mission": "distance",
//     "designs": { "D1": { "label": "Classic dart",
//        "distance": 7.4, "time": 1.7,          // simulated median of the 16 randomised throws (primary)
//        "clean": 9.1, "robust": 6.0,            // optional, reported only
//        "speed": 11, "pitchDeg": 10, "height": 1.7,   // simulated launch
//        "mass_g": 5.0, "S_m2": 0.017, "CLtrim": 0.25, "CD0": 0.045, "AR": 1.3 } } }   // glide-model inputs
//   Missing glide-model inputs fall back to DEFAULTS below (and are flagged).
//
// No dependencies. Deterministic for a given --seed.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const G = 9.81, RHO = 1.2;
export const DEFAULTS = { mass_g: 5.0, S_m2: 0.018, CLtrim: 0.3, CD0: 0.045, AR: 1.5, height: 1.7, speed: 11, pitchDeg: 10 };
const OSWALD = 0.8; // span efficiency for k = 1/(π e AR); low-AR paper wings are roughly 0.7–0.9

// ---------- small utilities ----------
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = [];
    } else f += c;
  }
  row.push(f); if (row.some((x) => x !== '')) rows.push(row);
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] ?? '').trim()])));
}
const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
export function quantile(xs, p) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const h = (a.length - 1) * p, lo = Math.floor(h);
  return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (h - lo);
}
const median = (xs) => quantile(xs, 0.5);
function ranks(xs) { // average ranks for ties
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
export function spearman(a, b) { // Pearson correlation of ranks (correct with ties)
  const ra = ranks(a), rb = ranks(b), n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}
function rng(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

// ---------- simple glide model ----------
// Point-mass, longitudinal (pitch-plane) flight with the plane held at a FIXED trim lift coefficient.
// Assumptions (deliberately crude; this is for refitting ONE drag multiplier, not for prediction):
//  * Static stability keeps α ≈ α_trim, so CL = CLtrim throughout (classic Lanchester phugoid model).
//    Pitch dynamics, stall and roll/yaw are ignored; launch α₀ errors are ignored.
//  * Drag polar CD = cdMul·CD0 + k·CL², k = 1/(π e AR). cdMul is the parameter being fitted; it scales
//    only the zero-lift (profile + parasite) part, the same role as `cdMul` in src/evaluate.js.
//  * Lift magnitude is capped at nMax·W. A fixed-CL point mass thrown at 2–3× trim speed would pull
//    5–10 g and loop; real paper wings flex and wash out at high load (the reason Bestfold has flex
//    twins), so we crudely saturate the load factor. Results are sensitive to nMax — report it.
//  * Still air, constant ρ = 1.2 kg/m³, release at `height`, flight ends at first ground contact (z = 0).
//  * Launch speed/angle = measured medians for the design if logged, otherwise the simulated launch.
export function glideFlight(p, cdMul, nMax = 3) {
  const m = p.mass_g / 1000, S = p.S_m2, CL = p.CLtrim;
  const k = 1 / (Math.PI * OSWALD * p.AR), CD = cdMul * p.CD0 + k * CL * CL;
  const g0 = p.pitchDeg * Math.PI / 180;
  let x = 0, z = p.height, vx = p.speed * Math.cos(g0), vz = p.speed * Math.sin(g0), t = 0;
  const dt = 0.002, W = m * G;
  const acc = (vx, vz) => {
    const V = Math.hypot(vx, vz) || 1e-9, q = 0.5 * RHO * V * V * S;
    const L = Math.min(q * CL, nMax * W), D = q * CD;
    // lift ⟂ velocity (rotated +90°, i.e. "up" for level flight); drag opposite velocity
    return [(-L * vz - D * vx) / (m * V), (L * vx - D * vz) / (m * V) - G];
  };
  while (t < 60) {
    // RK4 on (x, z, vx, vz)
    const a1 = acc(vx, vz);
    const a2 = acc(vx + a1[0] * dt / 2, vz + a1[1] * dt / 2);
    const a3 = acc(vx + a2[0] * dt / 2, vz + a2[1] * dt / 2);
    const a4 = acc(vx + a3[0] * dt, vz + a3[1] * dt);
    const nx = x + dt * (vx + (dt / 6) * (a1[0] + a2[0] + a3[0])) ;
    const nz = z + dt * (vz + (dt / 6) * (a1[1] + a2[1] + a3[1]));
    const nvx = vx + dt / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
    const nvz = vz + dt / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
    if (nz <= 0) { const f = z / (z - nz); return { distance: x + f * (nx - x), time: t + f * dt }; }
    x = nx; z = nz; vx = nvx; vz = nvz; t += dt;
  }
  return { distance: x, time: t };
}

// Least-squares fit of cdMul on log(metric): minimise Σ (ln y_meas − ln y_model(cdMul))².
// Log residuals make it a fit of ratios, so long-flying designs don't dominate. The objective can be
// non-monotone (loops), so: coarse log-spaced scan, then golden-section refinement around the best cell.
export function fitCdMul(items, metric, nMax, lo = 0.25, hi = 4) {
  const sse = (c) => items.reduce((s, it) => {
    const y = glideFlight(it.params, c, nMax)[metric];
    return s + (Math.log(it.measured) - Math.log(Math.max(y, 1e-3))) ** 2;
  }, 0);
  const N = 49, grid = Array.from({ length: N }, (_, i) => lo * (hi / lo) ** (i / (N - 1)));
  let bi = 0, bv = Infinity;
  grid.forEach((c, i) => { const v = sse(c); if (v < bv) { bv = v; bi = i; } });
  let a = Math.log(grid[Math.max(0, bi - 1)]), b = Math.log(grid[Math.min(N - 1, bi + 1)]);
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a), d = a + r * (b - a), fc = sse(Math.exp(c)), fd = sse(Math.exp(d));
  for (let it = 0; it < 40; it++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = sse(Math.exp(c)); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = sse(Math.exp(d)); }
  }
  const best = Math.exp((a + b) / 2);
  return { cdMul: best, rmsLog: Math.sqrt(sse(best) / items.length), rmsLog1: Math.sqrt(sse(1) / items.length), atEdge: bi === 0 || bi === N - 1 };
}

// Closed form from a measured trim-glide L/D at the predicted trim CL:
//   L/D = CL / (cdMul·CD0 + k·CL²)  ⇒  cdMul = (CL/LD − k·CL²) / CD0
export function cdMulFromLD(p, ld) {
  const k = 1 / (Math.PI * OSWALD * p.AR);
  return (p.CLtrim / ld - k * p.CLtrim ** 2) / p.CD0;
}

// ---------- main analysis ----------
export function analyze(rows, pred, opt = {}) {
  const metric = opt.metric || (/hang/i.test(pred.mission || '') ? 'time' : 'distance');
  const col = metric === 'time' ? 'time_s' : 'distance_m';
  const mission = (pred.mission || '').toLowerCase();
  const scored = rows.filter((r) => (r.kind || 'score') === 'score' && (!mission || !r.mission || r.mission.toLowerCase() === mission));
  const designs = {};
  for (const r of scored) {
    const v = num(r[col]); if (v === null) continue;
    const d = (designs[r.design] ??= { copies: {}, all: [], outcomes: {}, speed: [], angle: [] });
    (d.copies[r.copy || '1'] ??= []).push(v);
    d.all.push(v);
    d.outcomes[r.outcome || '?'] = (d.outcomes[r.outcome || '?'] || 0) + 1;
    if (num(r.speed_ms) !== null) d.speed.push(num(r.speed_ms));
    if (num(r.angle_deg) !== null) d.angle.push(num(r.angle_deg));
  }
  const glides = {};
  for (const r of rows) if (r.kind === 'glide' && num(r.ld) !== null) (glides[r.design] ??= []).push(num(r.ld));

  const pd = pred.designs || {};
  const keys = Object.keys(designs).filter((k) => pd[k] && Number.isFinite(pd[k][metric])).sort();
  const stats = Object.keys(designs).sort().map((k) => {
    const d = designs[k];
    return { design: k, label: pd[k]?.label || '', n: d.all.length, copies: Object.keys(d.copies).length,
      median: median(d.all), q1: quantile(d.all, 0.25), q3: quantile(d.all, 0.75),
      predicted: pd[k]?.[metric] ?? null, speed: d.speed.length ? median(d.speed) : null,
      angle: d.angle.length ? median(d.angle) : null, outcomes: d.outcomes };
  });
  const byKey = Object.fromEntries(stats.map((s) => [s.design, s]));
  const P = keys.map((k) => pd[k][metric]), M = keys.map((k) => byKey[k].median);
  const rho = keys.length >= 3 ? spearman(P, M) : NaN;
  const logBias = keys.length ? keys.reduce((s, k, i) => s + Math.log(M[i] / P[i]), 0) / keys.length : NaN;

  // Two-stage cluster bootstrap: within each design resample COPIES with replacement, then throws within
  // each drawn copy. Copies are the independent unit (fold errors are shared by all throws of a copy),
  // so resampling throws alone would understate uncertainty.
  const B = opt.boot ?? 2000, rand = rng(opt.seed ?? 1);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const rhos = [], biases = [];
  for (let b = 0; b < B && keys.length >= 3; b++) {
    const mb = keys.map((k) => {
      const cs = Object.values(designs[k].copies), sample = [];
      for (let c = 0; c < cs.length; c++) { const cp = pick(cs); for (let t = 0; t < cp.length; t++) sample.push(pick(cp)); }
      return median(sample);
    });
    rhos.push(spearman(P, mb));
    biases.push(keys.reduce((s, k, i) => s + Math.log(mb[i] / P[i]), 0) / keys.length);
  }
  const fin = rhos.filter(Number.isFinite);
  const rhoCI = [quantile(fin, 0.025), quantile(fin, 0.975)];
  const pPass = fin.filter((r) => r >= 0.7).length / (fin.length || 1);
  const biasCI = [Math.exp(quantile(biases, 0.025)), Math.exp(quantile(biases, 0.975))];

  // Drag-multiplier refits
  const nMax = opt.nMax ?? 3, flagged = new Set();
  const params = (k) => {
    const p = { ...DEFAULTS };
    for (const f of Object.keys(DEFAULTS)) { if (Number.isFinite(pd[k]?.[f])) p[f] = pd[k][f]; else if (!['height'].includes(f)) flagged.add(`${k}.${f}`); }
    if (byKey[k]?.speed) { p.speed = byKey[k].speed; flagged.delete(`${k}.speed`); }
    if (byKey[k]?.angle !== null && byKey[k]?.angle !== undefined) { p.pitchDeg = byKey[k].angle; flagged.delete(`${k}.pitchDeg`); }
    return p;
  };
  const items = keys.map((k) => ({ design: k, measured: byKey[k].median, params: params(k) })).filter((it) => it.measured > 0);
  const fit = items.length ? fitCdMul(items, metric, nMax) : null;
  const perDesign = items.map((it) => ({ design: it.design, cdMul: fitCdMul([it], metric, nMax).cdMul,
    model1: glideFlight(it.params, 1, nMax)[metric], modelFit: fit ? glideFlight(it.params, fit.cdMul, nMax)[metric] : NaN, measured: it.measured }));
  const ldFits = Object.entries(glides).filter(([k]) => pd[k]).map(([k, lds]) => {
    const p = params(k), ld = median(lds);
    return { design: k, n: lds.length, ld, cdMul: cdMulFromLD(p, ld), ldModel: p.CLtrim / (p.CD0 + p.CLtrim ** 2 / (Math.PI * OSWALD * p.AR)) };
  });

  return { metric, stats, keys, rho, rhoCI, pPass, bias: Math.exp(logBias), biasCI, fit, perDesign, ldFits, nMax,
    missing: [...flagged].sort(), unmatched: Object.keys(designs).filter((k) => !keys.includes(k)) };
}

// ---------- report ----------
const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
export function report(res) {
  const u = res.metric === 'time' ? 's' : 'm', out = [];
  out.push(`\nPer-design measured ${res.metric} (${u}), scored throws only`);
  out.push(`${pad('design', 8)}${pad('label', 18)}${lpad('n', 4)}${lpad('cp', 4)}${lpad('median', 8)}${lpad('IQR', 14)}${lpad('pred', 8)}${lpad('ratio', 7)}${lpad('v m/s', 7)}${lpad('γ °', 6)}  outcomes`);
  for (const s of res.stats) {
    const oc = Object.entries(s.outcomes).map(([k, v]) => `${k} ${Math.round(100 * v / s.n)}%`).join(', ');
    out.push(`${pad(s.design, 8)}${pad(s.label.slice(0, 17), 18)}${lpad(s.n, 4)}${lpad(s.copies, 4)}${lpad(f(s.median), 8)}${lpad(`${f(s.q1)}–${f(s.q3)}`, 14)}${lpad(f(s.predicted), 8)}${lpad(s.predicted ? f(s.median / s.predicted) : '—', 7)}${lpad(f(s.speed, 1), 7)}${lpad(f(s.angle, 0), 6)}  ${oc}`);
  }
  if (res.unmatched.length) out.push(`(no prediction for: ${res.unmatched.join(', ')})`);
  out.push(`\nRank agreement over ${res.keys.length} designs`);
  out.push(`  Spearman ρ = ${f(res.rho)}   95% CI [${f(res.rhoCI[0])}, ${f(res.rhoCI[1])}]  (bootstrap by copy)   P(ρ ≥ 0.7) = ${f(res.pPass)}`);
  out.push(`  Verdict: ${res.rho >= 0.7 ? 'PASS' : 'FAIL'} (threshold ρ ≥ 0.7)${res.rho >= 0.7 && res.rhoCI[0] < 0.7 ? ' — but the CI reaches below 0.7; add copies before trusting it' : ''}`);
  out.push(`  Bias (geometric mean measured/predicted) = ${f(res.bias)}  95% CI [${f(res.biasCI[0])}, ${f(res.biasCI[1])}]`);
  if (res.fit) {
    out.push(`\nDrag-multiplier refit (point-mass fixed-CL glide model, load cap nMax = ${res.nMax} g)`);
    out.push(`  pooled cdMul = ${f(res.fit.cdMul)}${res.fit.atEdge ? '  (at search bound — model probably inadequate)' : ''}   rms log error: ${f(res.fit.rmsLog1, 3)} at cdMul=1 → ${f(res.fit.rmsLog, 3)}`);
    out.push(`  ${pad('design', 8)}${lpad('meas', 8)}${lpad('model@1', 9)}${lpad('model@fit', 11)}${lpad('own cdMul', 11)}`);
    for (const p of res.perDesign) out.push(`  ${pad(p.design, 8)}${lpad(f(p.measured), 8)}${lpad(f(p.model1), 9)}${lpad(f(p.modelFit), 11)}${lpad(f(p.cdMul), 11)}`);
    const own = res.perDesign.map((p) => p.cdMul);
    if (own.length > 1) out.push(`  spread of per-design cdMul: ${f(Math.min(...own))}–${f(Math.max(...own))}${Math.max(...own) / Math.min(...own) > 2 ? '  (>2×: a single drag multiplier does not explain the gap; look at CLmax / crease stiffness)' : ''}`);
  }
  if (res.ldFits.length) {
    out.push(`\nTrim-glide L/D refit (closed form at predicted CLtrim)`);
    for (const g of res.ldFits) out.push(`  ${pad(g.design, 8)} n=${lpad(g.n, 3)}  L/D meas ${f(g.ld)}  model@1 ${f(g.ldModel)}  → cdMul ${f(g.cdMul)}`);
    out.push(`  median cdMul from glides = ${f(median(res.ldFits.map((g) => g.cdMul)))}  (prefer this; it is free of launch effects)`);
  }
  if (res.missing.length) out.push(`\nNote: defaults used for ${res.missing.join(', ')}`);
  return out.join('\n');
}

// ---------- CLI ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const args = process.argv.slice(2), pos = [], opt = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--metric') opt.metric = args[++i];
    else if (args[i] === '--boot') opt.boot = +args[++i];
    else if (args[i] === '--seed') opt.seed = +args[++i];
    else if (args[i] === '--nmax') opt.nMax = +args[++i];
    else pos.push(args[i]);
  }
  if (pos.length < 2) { console.error('usage: node analyze.js log.csv predictions.json [--metric distance|time] [--boot N] [--seed S] [--nmax G]'); process.exit(1); }
  const rows = parseCSV(fs.readFileSync(pos[0], 'utf8'));
  const pred = JSON.parse(fs.readFileSync(pos[1], 'utf8'));
  console.log(report(analyze(rows, pred, opt)));
}
