// Calibration & regression harness: compares the aerodynamic model with published
// measurements and checks that the physics cannot create energy. Run: node scripts/calibrate.js
//
// References (see reports/Computational paper plane design.md):
//  - Ananda, Sukumar & Selig 2015: thin flat-plate wings, AR 2-5, Re 60k-160k:
//    CLmax 0.55-0.7, stall near 10°, lift slope ≈ Helmbold, CDmin 0.01-0.02.
//  - Polhamus 1971 (NASA TN D-6243): sharp-edged deltas, CL = Kp sinα cos²α + Kv cosα sin²α.
//  - Ng et al. 2009: A4 dart in flight, L/D ≈ 5, stall ≈ 30° (vortex lift).
import { latticeFromRows, assembleAircraft, aero, RHO } from '../src/physics.js';
import { CLASSICS, completeDesign, MISSIONS } from '../src/design.js';
import { foldPlane } from '../src/fold.js';
import { buildAircraft } from '../src/physics.js';
import { simulate } from '../src/flight.js';

const deg = Math.PI / 180;
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failures++; };

// A planar wing from leading/trailing edge functions over span y ∈ [-b/2, b/2]
function plateAircraft(b, xLE, xTE, ns = 16, nc = 5) {
  const rows = [];
  for (let j = 0; j <= ns; j++) {
    const y = -b / 2 + (b * j) / ns;
    const le = xLE(y), te = xTE(y);
    const pts = [];
    for (let i = 0; i <= nc; i++) pts.push([le + ((te - le) * i) / nc, y, 0]);
    rows.push({ pts, chord: le - te });
  }
  const { panels, strips } = latticeFromRows(rows, { kind: 'wing', half: 'L', nc });
  for (const s of strips) { s.layers = 1; s.plies = 1; }
  return assembleAircraft(panels, strips, { m: 0.005, cg: [0, 0, 0], I: [[1e-5, 0, 0], [0, 1e-5, 0], [0, 0, 2e-5]] });
}
function polar(ac, V, alphas) {
  const q = 0.5 * RHO * V * V * ac.Sref;
  return alphas.map((a) => {
    const u = [V * Math.cos(a * deg), 0, -V * Math.sin(a * deg)];
    const { F } = aero(ac, u, [0, 0, 0]);
    const D = -(F[0] * u[0] + F[2] * u[2]) / V, L = (F[2] * u[0] - F[0] * u[2]) / V;
    return { a, CL: Math.abs(L / q), CD: D / q, LD: L / D };
  });
}
const alphas = Array.from({ length: 41 }, (_, i) => i);

// 1. Rectangular flat plate, AR 2.4 (Ananda et al.)
{
  const c = 0.1, b = 0.24;
  const ac = plateAircraft(b, () => c, () => 0);
  const P = polar(ac, 12, alphas);
  const peak = P.slice(0, 26).reduce((m, r) => (r.CL > m.CL ? r : m));
  const A = b / c, helm = (2 * Math.PI * A) / (2 + Math.sqrt(A * A + 4));
  const slope = (P[4].CL - P[0].CL) / (4 * deg);
  check('flat plate AR 2.4: CLmax 0.55-0.75', peak.CL >= 0.55 && peak.CL <= 0.75, `CLmax ${peak.CL.toFixed(2)} at ${peak.a}°`);
  // measured plates stall near 10° and then hold a flat lift plateau to ~30°
  const at = (a) => P.find((r) => r.a === a).CL;
  const gain = at(25) - at(12);
  check('flat plate AR 2.4: CL(12°) 0.5-0.72, then a plateau (ΔCL 12→25° < 0.12)', at(12) >= 0.5 && at(12) <= 0.72 && gain < 0.12, `CL(12°) ${at(12).toFixed(2)}, CL(25°) ${at(25).toFixed(2)}`);
  check('flat plate AR 2.4: lift slope within 20% of Helmbold', Math.abs(slope / helm - 1) < 0.2, `${slope.toFixed(2)} vs ${helm.toFixed(2)} /rad`);
  check('flat plate AR 2.4: CDmin 0.008-0.03', P[0].CD > 0.008 && P[0].CD < 0.03, `CD0 ${P[0].CD.toFixed(4)}`);
}
// 2. Sharp delta, 67° leading-edge sweep (Polhamus): vortex lift keeps CL rising to ~30°
{
  const c = 0.2, Lam = 67 * deg, b = 2 * c / Math.tan(Lam);
  const ac = plateAircraft(b, (y) => c - Math.abs(y) * Math.tan(Lam), () => 0);
  const P = polar(ac, 8, alphas);
  const peak = P.reduce((m, r) => (r.CL > m.CL ? r : m));
  const AR = (b * b) / ac.Sref, Kp = (Math.PI * AR) / 2, Kv = Math.PI;
  const pol = (a) => Kp * Math.sin(a) * Math.cos(a) ** 2 + Kv * Math.cos(a) * Math.sin(a) ** 2;
  const at = (a) => P.find((r) => r.a === a).CL;
  check('delta 67°: stall 22-38° (vortex lift)', peak.a >= 22 && peak.a <= 38, `peak CL ${peak.CL.toFixed(2)} at ${peak.a}°`);
  check('delta 67°: CL(15°) within 30% of Polhamus', Math.abs(at(15) / pol(15 * deg) - 1) < 0.3, `${at(15).toFixed(2)} vs ${pol(15 * deg).toFixed(2)} (AR ${AR.toFixed(2)})`);
}
// 3. Classic dart (Ng et al. 2009): glide L/D ≈ 5
{
  const d = completeDesign(CLASSICS.dart.design, MISSIONS.distance);
  const ac = buildAircraft(foldPlane(d));
  const P = polar(ac, 4.9, alphas);
  const best = P.reduce((m, r) => (r.LD > m.LD ? r : m));
  check('classic dart: max L/D 4.3-5.7', best.LD > 4.3 && best.LD < 5.7, `L/D ${best.LD.toFixed(2)} at body α ${best.a}°`);
}
// 4. Energy audit: a hard spin must lose energy, never gain it
{
  const d = completeDesign(CLASSICS.glider.design, MISSIONS.hangtime);
  const ac = buildAircraft(foldPlane(d));
  const r = simulate(ac, { speed: 8, pitch: 10 * deg, height: 3 }, { rates: [0, 0, 55] }, { maxTime: 20, tumbleRate: 1e9 });
  check('energy audit: spinning release never gains energy', r.energyGain <= 0.02, `energy gain ${(r.energyGain * 100).toFixed(1)}%, end ${r.end}`);
}
// 5. Regression: the old hang-time spinner exploit (saved genome) must not stay aloft
import { readFileSync, existsSync } from 'node:fs';
{
  const f = new URL('../results/exploit-hangtime-spinner.json', import.meta.url);
  if (existsSync(f)) {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    const ac = buildAircraft(foldPlane(d));
    const r = simulate(ac, d.launch, {}, { maxTime: 60, ceiling: 9 });
    check('regression: old spinner exploit no longer flies forever', r.time < 30 && r.energyGain <= 0.02, `${r.time.toFixed(1)} s, end ${r.end}, energy gain ${(r.energyGain * 100).toFixed(1)}%`);
  }
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
