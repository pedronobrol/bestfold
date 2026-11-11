// Evaluate the classic reference designs and print the full physics report.
import { CLASSICS, completeDesign, MISSIONS } from '../src/design.js';
import { evaluate } from '../src/evaluate.js';
const deg = Math.PI / 180;
const mission = MISSIONS[process.argv[2] || 'distance'];
for (const [k, c] of Object.entries(CLASSICS)) {
  const d = completeDesign(c.design, mission);
  const t0 = performance.now();
  const r = evaluate(d, mission, { force: true });
  const ms = performance.now() - t0;
  console.log(`\n== ${c.name} (${mission.key}) ${(ms).toFixed(0)} ms`);
  if (!r.valid && !r.ac) { console.log('   cannot build:', r.violations); continue; }
  console.log(`   feasible ${r.feasible}  violations ${r.violations.map((v) => `${v.name} (${v.v.toFixed(2)})`).join('; ') || 'none'}`);
  console.log(`   mass ${(r.mass * 1e3).toFixed(2)} g  S ${(r.Sref * 1e4).toFixed(0)} cm²  span ${(r.span * 100).toFixed(1)} cm  SM ${(r.sm * 100).toFixed(0)}%  plies ${r.plies.max}  glide dihedral +${(r.dGamma / deg).toFixed(1)}°`);
  console.log(`   trim: elevator ${(r.design.elevator.angle / deg).toFixed(0)}° at CL ${d.trimCL}  launch pitch ${(r.design.launch.pitch / deg).toFixed(0)}°`);
  console.log(`   clean throw ${r.nominal.metric.toFixed(2)} (${r.nominal.end}, ${r.nominal.time.toFixed(1)} s)  CVaR50 ${r.score.toFixed(2)}  mean ${r.mean.toFixed(2)}  worst ${r.min.toFixed(2)}`);
  console.log(`   ends: ${Object.entries(r.results.reduce((a, x) => ((a[x.end] = (a[x.end] || 0) + 1), a), {})).map(([e, n]) => `${e} ${n}`).join(', ')}`);
}
