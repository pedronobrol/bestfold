// Detailed report on the best design of a results file: rules, trim, polar, all 16 throws.
// Usage: node scripts/inspect.js [distance|hangtime] [results dir]
import { readFileSync } from 'node:fs';
import { MISSIONS, decode, normalizeGenome } from '../src/design.js';
import { evaluate } from '../src/evaluate.js';
import { aero, RHO } from '../src/physics.js';

const mission = process.argv[2] || 'distance', dir = process.argv[3] || 'results';
const M = MISSIONS[mission], deg = Math.PI / 180;
const R = JSON.parse(readFileSync(new URL(`../${dir}/${mission}.json`, import.meta.url)));
const r = evaluate(decode(normalizeGenome(R.best.genome), M), M, { force: true });
const d = r.design, ac = r.ac;
console.log(`${mission} best (${R.best.key}): robust ${r.score.toFixed(2)}, clean throw ${r.nominal.metric.toFixed(2)} (${r.nominal.end}), feasible ${r.feasible}`);
console.log(`  ${d.landscape ? 'landscape' : 'portrait'}; folds ${d.noseFolds.map((f) => f.type).join(', ') || 'none'}; body fold ${d.bodyFold || 'valley'}`);
console.log(`  mass ${(r.mass * 1e3).toFixed(2)} g, wing area ${(r.Sref * 1e4).toFixed(0)} cm², span ${(r.span * 100).toFixed(1)} cm, static margin ${(r.sm * 100).toFixed(0)}%, max plies ${r.plies.max}, glide dihedral +${(r.dGamma / deg).toFixed(1)}°`);
console.log(`  trim: elevator ${(d.elevator.angle / deg).toFixed(0)}° (${(d.elevator.chord * 100).toFixed(1)} cm) for CL ${d.trimCL}; launch ${d.launch.speed} m/s at ${(d.launch.pitch / deg).toFixed(0)}°, bank ${(d.launch.bank / deg).toFixed(0)}°`);
if (r.violations.length) console.log('  violations:', r.violations.map((v) => `${v.name} (${v.v.toFixed(2)})`).join('; '));
const V = 6, q = 0.5 * RHO * V * V * ac.Sref;
console.log('  polar at 6 m/s (body angle of attack):');
for (const a of [0, 4, 8, 12, 16, 20, 30]) {
  const u = [V * Math.cos(a * deg), 0, -V * Math.sin(a * deg)];
  const { F, M: Mo } = aero(ac, u, [0, 0, 0]);
  const D = -(F[0] * u[0] + F[2] * u[2]) / V, L = (F[2] * u[0] - F[0] * u[2]) / V;
  console.log(`    ${String(a).padStart(2)}°  CL ${(L / q).toFixed(3)}  CD ${(D / q).toFixed(3)}  L/D ${(L / D).toFixed(1)}  Cm ${(-Mo[1] / (q * ac.Sref / ac.span)).toFixed(3)}`);
}
console.log('  throws:');
for (const s of r.results) console.log(`    ${s.name.padEnd(64)} ${s.metric.toFixed(2).padStart(6)}  ${s.end}`);
