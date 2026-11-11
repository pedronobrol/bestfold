// Turns optimiser output (results/<mission>.json) into the dataset the viewer ships with
// (public/data/bestfold.json), and writes printable instructions and step diagrams to results/.
// Usage: node scripts/prepare-data.js [results dir]   (default: results)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { MISSIONS, CLASSICS, completeDesign, decode, normalizeGenome } from '../src/design.js';
import { foldPlane } from '../src/fold.js';
import { buildAircraft } from '../src/physics.js';
import { evaluate } from '../src/evaluate.js';
import { buildInstructions, throwAdvice } from '../src/instructions.js';
import { stepDiagrams, diagramSheet } from '../src/template.js';
import { ENGINE_VERSION } from '../src/version.js';
import { designName } from '../viewer/names.js';

const root = new URL('../', import.meta.url);
const RES = process.argv[2] || process.env.BESTFOLD_RESULTS || 'results';

// Light, static specs of a design (no flight needed): used by the catalog of all designs.
function specsOf(genome, M) {
  const d = decode(normalizeGenome(genome), M);
  const geom = foldPlane(d);
  const ac = geom.ok ? buildAircraft(geom) : null;
  const r = (x, k = 3) => +x.toFixed(k);
  return {
    landscape: d.landscape, winglets: d.winglet.enabled, folds: d.noseFolds.map((f) => f.type),
    span: ac ? r(ac.span) : null, area: ac ? r(ac.Sref, 4) : null, mass: ac ? r(ac.mass, 5) : null,
  };
}

const missions = {};
for (const key of Object.keys(MISSIONS)) {
  const f = new URL(`${RES}/${key}.json`, root);
  if (!existsSync(f)) continue;
  const R = JSON.parse(readFileSync(f, 'utf8'));
  if (!R.best) continue;
  const M = MISSIONS[key];
  missions[key] = {
    mission: key, algorithm: R.algorithm, evals: R.evals, feasibleFraction: R.feasibleFraction,
    best: R.best,
    history: R.history.map((h) => ({ gen: h.gen, best: h.best, median: h.median, bestGenome: h.bestGenome, bestKey: h.bestKey, filled: h.filled, evals: h.evals })),
    // every feasible elite with the specs the catalog filters and sorts on
    archive: (R.archive || []).filter((e) => e.feasible).map((e) => ({ key: e.key, genome: e.genome, fitness: e.fitness, feasible: true, specs: specsOf(e.genome, M) })),
  };
  // Fair baseline: the classic dart gets its best trim too, under the same rules.
  let best = { cl: 0.12, s: -Infinity };
  for (const cl of [0.08, 0.12, 0.16, 0.2, 0.25, 0.3]) {
    const r = evaluate(completeDesign({ ...CLASSICS.dart.design, trimCL: cl }, M), M, { force: true });
    if (r.score > best.s) best = { cl, s: r.score };
  }
  missions[key].dartTrimCL = best.cl;
  console.log(`${key}: best ${R.best.score.toFixed(2)} (${R.best.key}); classic dart best trim CL ${best.cl} → ${best.s.toFixed(2)}`);

  // printable instructions and step diagrams (evaluate solves the elevator trim and launch pitch)
  const ev = evaluate(R.best.design, M, { quick: true, force: true });
  const instr = buildInstructions(ev.geom);
  instr.push({ title: 'Throw it', text: throwAdvice(ev.design, ev.ac).text });
  const name = designName(R.best.genome, key, ev.design.noseFolds.length);
  writeFileSync(new URL(`results/diagrams-${key}.svg`, root), diagramSheet(stepDiagrams(ev.geom, instr, { cgX: ev.ac.cg[0] }), name));
  const d = R.best.design;
  const md = [`# ${name}: folding instructions`, '', `One ${d.sheetKey} sheet, ${d.landscape ? 'landscape' : 'portrait'}, folded by hand. Step diagrams: diagrams-${key}.svg`, '',
    ...instr.map((s, i) => `${i + 1}. **${s.title}.** ${s.text}`)].join('\n');
  writeFileSync(new URL(`results/instructions-${key}.md`, root), md + '\n');
}
if (!Object.keys(missions).length) throw new Error(`no results found in ${RES}/; run the optimiser first`);
mkdirSync(new URL('public/data/', root), { recursive: true });
writeFileSync(new URL('public/data/bestfold.json', root), JSON.stringify({ engine: ENGINE_VERSION, missions }));
console.log(`public/data/bestfold.json written (${Object.keys(missions).join(', ')})`);
