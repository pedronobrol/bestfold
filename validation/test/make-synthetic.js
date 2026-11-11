// Generates a synthetic throw log + predictions to exercise analyze.js.
// Ground truth: real drag is 1.35× the simulator's (cdMul_true = 1.35); copy-to-copy noise σ=0.15 (log),
// throw-to-throw σ=0.25 (log). Expect: ρ high-ish, bias < 1, pooled cdMul ≈ 1.35, glide L/D fit ≈ 1.35.
import fs from 'node:fs';
import { glideFlight, DEFAULTS } from '../analyze.js';

const dir = new URL('.', import.meta.url).pathname;
let s = 42; const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

const designs = {
  D1: { label: 'Classic dart', mass_g: 5.0, S_m2: 0.016, CLtrim: 0.18, CD0: 0.05, AR: 1.1 },
  D2: { label: 'Bestfold champion', mass_g: 5.1, S_m2: 0.022, CLtrim: 0.30, CD0: 0.035, AR: 2.0 },
  D3: { label: 'Elite wide', mass_g: 5.0, S_m2: 0.024, CLtrim: 0.35, CD0: 0.04, AR: 2.4 },
  D4: { label: 'Elite canard', mass_g: 5.2, S_m2: 0.020, CLtrim: 0.26, CD0: 0.045, AR: 1.6 },
  D5: { label: 'Nakamura lock', mass_g: 5.0, S_m2: 0.019, CLtrim: 0.24, CD0: 0.05, AR: 1.4 },
  D6: { label: 'Predicted-bad', mass_g: 5.0, S_m2: 0.013, CLtrim: 0.15, CD0: 0.09, AR: 0.8 },
};
const TRUE_CD = 1.35, cols = 'id,session,timestamp,design,copy,thrower,mission,kind,throw_no,speed_ms,angle_deg,alpha_deg,distance_m,time_s,ld,outcome,notes'.split(',');
const rows = [], pred = { mission: 'distance', designs: {} };
let id = 0;
for (const [k, d] of Object.entries(designs)) {
  const p = { ...DEFAULTS, ...d, speed: 11, pitchDeg: 10 };
  const sim = glideFlight(p, 1);
  const simErr = Math.exp(0.08 * gauss()); // the simulator's own design-specific error
  pred.designs[k] = { ...d, distance: +(sim.distance * simErr).toFixed(2), time: +(sim.time * simErr).toFixed(2), clean: +(sim.distance * 1.2).toFixed(2), robust: +(sim.distance * 0.8).toFixed(2), speed: 11, pitchDeg: 10, height: 1.7 };
  for (let c = 1; c <= 3; c++) {
    const copyEff = Math.exp(0.15 * gauss());
    for (let t = 1; t <= 10; t++) {
      const v = 11 * Math.exp(0.1 * gauss()), g = 10 + 5 * gauss();
      const f = glideFlight({ ...p, speed: v, pitchDeg: g }, TRUE_CD);
      const e = copyEff * Math.exp(0.25 * gauss());
      const r = rand(), outcome = r < 0.65 ? 'glide' : r < 0.75 ? 'nose-dive' : r < 0.85 ? 'stall-recovery' : r < 0.92 ? 'loop' : 'turned';
      const measured = t % 3 === 1; // speed measured on every 3rd throw, as the protocol suggests
      rows.push({ id: ++id, session: 'S1', timestamp: new Date(Date.UTC(2026, 10, 14, 10, 0, id * 20)).toISOString(), design: k, copy: c, thrower: 'P', mission: 'distance', kind: 'score', throw_no: t,
        speed_ms: measured ? v.toFixed(2) : '', angle_deg: measured ? g.toFixed(1) : '', alpha_deg: '', distance_m: (f.distance * e).toFixed(2), time_s: (f.time * e).toFixed(2), ld: '', outcome, notes: t === 4 && c === 2 ? 'hit wall, "nose" dented, kept' : '' });
    }
    // trim-glide tests: true L/D with 1.35× profile drag, ±5% noise
    const kInd = 1 / (Math.PI * 0.8 * d.AR), ld = d.CLtrim / (TRUE_CD * d.CD0 + kInd * d.CLtrim ** 2);
    for (let t = 1; t <= 2; t++) rows.push({ id: ++id, session: 'S1', timestamp: '', design: k, copy: c, thrower: 'P', mission: 'glide', kind: 'glide', throw_no: t, speed_ms: '', angle_deg: '', alpha_deg: '', distance_m: '', time_s: '', ld: (ld * Math.exp(0.05 * gauss())).toFixed(2), outcome: 'glide', notes: '' });
    rows.push({ id: ++id, session: 'S1', timestamp: '', design: k, copy: c, thrower: 'P', mission: 'distance', kind: 'trim', throw_no: 0, speed_ms: '', angle_deg: '', alpha_deg: '', distance_m: '1.0', time_s: '', ld: '', outcome: 'nose-dive', notes: 'trim; elevator +1mm' });
  }
}
const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
fs.writeFileSync(dir + 'synthetic-log.csv', [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n');
fs.writeFileSync(dir + 'synthetic-predictions.json', JSON.stringify(pred, null, 2));
console.log(`wrote ${rows.length} rows`);
