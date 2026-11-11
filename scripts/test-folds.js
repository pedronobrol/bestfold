// Fold-grammar tests: some-layers folds, tear and access checks, the Nakamura lock, flap
// retention, layer-order sanity, and that every sketch in the search space folds.
// Run: node scripts/test-folds.js
import { CLASSICS, completeDesign, MISSIONS, decode, encode, GENOME_SIZE, LEGACY_GENOME_SIZE } from '../src/design.js';
import { foldPlane, foldLayers, layersAtPoint, facetsAt } from '../src/fold.js';
import { retentionOf, computeRetention, layerOrderViolations, stackAt } from '../src/retention.js';
import { allSketches, sketchKey, toGenome, fromGenome, dims, grammarOK } from '../src/sketch.js';
import { buildInstructions } from '../src/instructions.js';
import { stepDiagrams } from '../src/template.js';
import { prepare } from '../src/evaluate.js';
import { buildAircraft } from '../src/physics.js';

const deg = Math.PI / 180;
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failures++; };
const M = MISSIONS.distance;
const plane = (over) => completeDesign({ ...CLASSICS.dart.design, ...over }, M);
const fold = (over) => foldPlane(plane(over));
const same = (A, B) => ['a', 'b', 'c', 'd', 'tx', 'ty'].every((k) => Math.abs(A[k] - B[k]) < 1e-12);

// 1. Some-layers fold: after a nose fold, fold only the top layer (the nose flap) back up.
{
  const g = fold({ noseFolds: [{ type: 'tip', depth: 0.08 }] }); // flap spans y 0.137..0.217
  const fs = facetsAt(g, 1);
  const Lc = { p: [0, 0.18], d: [-1, 0] }; // moving side: below y = 0.18
  const q = [-0.03, 0.16];
  const r = foldLayers(fs, Lc, layersAtPoint(fs, q, 1), 'top', true);
  const flapOnly = !r.bad && r.moved.every((f) => f.hist[1].moved);
  const top = !r.bad && Math.min(...r.moved.map((f) => f.layer)) > Math.max(...r.facets.filter((f) => !r.moved.includes(f)).map((f) => f.layer));
  const still = !r.bad && r.facets.filter((f) => !r.moved.includes(f)).every((f) => fs.some((o) => o.poly === f.poly) ? same(f.T, fs.find((o) => o.poly === f.poly).T) : true);
  check('top-1 fold moves only the nose flap (both halves, hinged at the centre line)', flapOnly && r.moved.some((f) => f.half === 'L') && r.moved.some((f) => f.half === 'R'), r.bad || `${r.moved.length} facets moved`);
  check('moved layers land on top, reversed; the sheet underneath keeps its transforms', top && still);
  const r2 = foldLayers(fs, Lc, layersAtPoint(fs, q, 2), 'top', true);
  check('top-2 fold also takes the sheet under the flap', !r2.bad && r2.moved.some((f) => !f.hist[1].moved));
  const r3 = foldLayers(fs, Lc, layersAtPoint(fs, q, 1, true), 'top');
  check('folding the bottom layer up through the flap above it is rejected', !!r3.bad && /covers/.test(r3.bad), r3.bad);
  check('input facets are untouched by a fold attempt', fs.every((f) => f.hist.length === 2));
}

// 2. Tear detection: in the body-folded state the two halves are joined at the keel.
{
  const g = fold({ noseFolds: [] });
  const fs = facetsAt(g, g.facets[0].hist.length - 1);
  const Lc = { p: [0, 0.2], d: [1, 0] }; // moving side: above y = 0.2
  const seed = layersAtPoint(fs, [0.05, 0.25], 1);
  const strict = foldLayers(fs, Lc, seed, 'top', true);
  check('folding only the top half while it is joined at the keel is a tear', !!strict.bad && /tear/.test(strict.bad), strict.bad);
  const loose = foldLayers(fs, Lc, seed, 'top', false);
  check('without strict, hinge closure drags the joined half along', !loose.bad && new Set(loose.moved.map((f) => f.half)).size === 2);
  // a lock deeper than the exposed tip would drag the tab out from under the corner flaps
  const deep = foldPlane(completeDesign({ ...CLASSICS.nakamura.design, noseFolds: CLASSICS.nakamura.design.noseFolds.map((f) => (f.type === 'lock' ? { ...f, depth: 0.03 } : f)) }, M));
  const lk = deep.steps.find((s) => s.kind === 'lock');
  check('too-deep lock is reduced to the deepest foldable whole millimetre', lk && lk.depth < 0.03 && Math.abs(lk.depth * 1000 - Math.round(lk.depth * 1000)) < 1e-9 && deep.warnings.some((w) => /lock depth reduced/.test(w)), lk && `${(lk.depth * 1000).toFixed(0)} mm`);
}

// 3. Nakamura lock traps the second corner flaps; the keel is locked where the tab crosses it.
{
  const g = foldPlane(completeDesign(CLASSICS.nakamura.design, M));
  const r = retentionOf(g);
  const lockJ = g.steps.findIndex((s) => s.kind === 'lock');
  const tipJ = g.steps[lockJ].tipStep;
  const corner = r.flaps.filter((f) => f.step === lockJ - 1);
  check('Nakamura classic folds with a lock step and a mountain body fold', g.ok && lockJ > 0 && g.phaseB.bodyFold === 'mountain' && !g.warnings.length, g.warnings.join('; '));
  check('lock moves only the nose-flap point (top layers), not the sheet', g.facets.filter((f) => f.hist[lockJ].moved).every((f) => f.hist[tipJ].moved) && g.steps[lockJ].allLayers === false);
  check('both second corner flaps are trapped by the lock', corner.length === 2 && corner.every((f) => f.trappedBy.includes('lock')), corner.map((f) => f.trappedBy.join('+')).join(', '));
  check('keel locked length ≈ tab depth', Math.abs(r.keelLockedLength - g.steps[lockJ].depth) < 2e-3, `${(r.keelLockedLength * 1000).toFixed(1)} mm`);
  const tab = g.facets.map((f, i) => i).filter((i) => g.facets[i].hist[lockJ].moved);
  // per-cell stack where the tab covers a corner flap: tab, corner flap, then the nose flap the
  // tab is hinged to (the lock's taco), all above the sheet
  const S = stackAt(g, [-0.004, g.steps[lockJ].lines[0].p[1] + 0.006], lockJ);
  const F = g.facets;
  const iTab = S.findIndex((i) => tab.includes(i));
  const iCorner = S.findIndex((i) => F[i].hist[lockJ - 1].moved);
  const iNose = S.findIndex((i) => F[i].hist[tipJ].moved && !F[i].hist[lockJ].moved && !F[i].hist[lockJ - 1].moved);
  check('per-cell stack under the tab: tab > corner flap > nose flap', iTab === 0 && iCorner > iTab && iNose > iCorner, `positions ${iTab}, ${iCorner}, ${iNose} of ${S.length}`);
  const noLock = foldPlane(completeDesign({ ...CLASSICS.nakamura.design, noseFolds: CLASSICS.nakamura.design.noseFolds.filter((f) => f.type !== 'lock') }, M));
  const r0 = retentionOf(noLock);
  check('without the lock nothing is lock-trapped and the keel is not locked', r0.flaps.every((f) => !f.trappedBy.includes('lock')) && r0.keelLockedLength === 0);
}

// 4. Retention classes and aggregates.
{
  const dart = retentionOf(fold({}));
  check('classic dart: every flap trapped (the wing crease crosses them), no free area', dart.freeFlapArea === 0 && dart.trappedFraction === 1 && dart.flaps.length === 4);
  const dog = fold({ noseFolds: [{ type: 'diag', theta: 45 * deg, offset: 0.06 }], bodyFold: 'mountain' });
  const r = retentionOf(dog);
  const free = r.flaps.filter((f) => f.class === 'free');
  check('dog-ear corner flaps on the wing are free', free.length === 2, r.flaps.map((f) => f.class).join(','));
  const sum = free.reduce((s, f) => s + f.area, 0), mx = Math.max(...free.map((f) => f.area)), tot = r.flaps.reduce((s, f) => s + f.area, 0);
  check('aggregates: freeFlapArea = Σ free, maxFreeFlapArea = max, trappedFraction = trapped / total',
    Math.abs(r.freeFlapArea - sum) < 1e-12 && Math.abs(r.maxFreeFlapArea - mx) < 1e-12 && Math.abs(r.trappedFraction - r.flaps.filter((f) => f.class === 'trapped').reduce((s, f) => s + f.area, 0) / tot) < 1e-12,
    `free ${(r.freeFlapArea * 1e4).toFixed(1)} cm², max ${(r.maxFreeFlapArea * 1e4).toFixed(1)} cm², trapped ${r.trappedFraction.toFixed(2)}`);
  check('footprint of a one-layer triangle flap = its area (sampling accuracy)', Math.abs(mx - 0.045 * 0.045 / 2) / (0.045 * 0.045 / 2) < 0.05, `${(mx * 1e4).toFixed(2)} vs ${(0.045 * 0.045 / 2 * 1e4).toFixed(2)} cm²`);
  check('per-facet classes: flap facets free, the rest base', r.facetClass.filter((c) => c === 'free').length === free.reduce((s, f) => s + f.facets.length, 0) && r.facetClass.every((c) => c === 'free' || c === 'base'));
  const P = prepare(plane({ noseFolds: [{ type: 'diag', theta: 45 * deg, offset: 0.06 }], bodyFold: 'mountain' }), M);
  const v = P.violations.find((x) => /unlocked flap/.test(x.name));
  check('evaluator: graded violation for an unlocked flap > 4 cm²', v && Math.abs(v.v - (r.maxFreeFlapArea - 4e-4) / 4e-4) < 1e-9, v && v.v.toFixed(2));
  check('evaluator: no unlocked-flap violation for the classic dart', !prepare(plane({}), M).violations.some((x) => /unlocked/.test(x.name)));
  const ac = buildAircraft(dog);
  check('free flaps add frontal (base) drag area; the dart has none', ac.strips.some((s) => s.flapFrontal > 0) && buildAircraft(fold({})).strips.every((s) => s.flapFrontal === 0));
  // Classifier on enclosure alone: relabel every region as keel, as if the wing hinge cleared the flaps.
  const enclosedOnly = (over) => { const g = fold(over); for (const f of g.facets) f.region = 'keel'; return computeRetention(g).flaps.map((f) => f.class); };
  const c45 = [{ type: 'diag', theta: 45 * deg, offset: 0 }];
  check('valley body fold: corner flaps sandwiched in the keel', enclosedOnly({ noseFolds: c45 }).every((c) => c === 'sandwiched'));
  check('mountain body fold: the same flaps are outside and free', enclosedOnly({ noseFolds: c45, bodyFold: 'mountain' }).every((c) => c === 'free'));
  const pk = enclosedOnly({ noseFolds: [...c45, { type: 'tip', depth: 0.11 }], bodyFold: 'mountain' });
  check('corner flaps folded inside a nose fold are pocketed', pk[0] === 'pocketed' && pk[1] === 'pocketed', pk.join(','));
}

// 5. Layer-order sanity: no facet ends up between the two layers of a fold (taco–tortilla).
{
  const designs = {
    ...Object.fromEntries(Object.entries(CLASSICS).map(([k, c]) => [k, completeDesign(c.design, M)])),
    pleat: plane({ noseFolds: [{ type: 'pleat', at: 0.05, width: 0.02 }, { type: 'diag', theta: 45 * deg, offset: 0 }] }),
    mountainDart: plane({ bodyFold: 'mountain' }),
  };
  for (const [k, d] of Object.entries(designs)) {
    const g = foldPlane(d), v = layerOrderViolations(g);
    check(`layer order: ${k}`, g.ok && v.length === 0, `${v.length} violations`);
  }
  // negative control: a stray layer slipped between the nose flap and the sheet must be caught
  const g = fold({ noseFolds: [{ type: 'tip', depth: 0.08 }] });
  const host = facetsAt(g, 1).find((f) => !f.hist[1].moved && f.half === 'L' && f.cur().some((q) => Math.abs(q[1] - 0.217) < 1e-9));
  const stray = host.clone([[-0.05, 0.2], [-0.02, 0.2], [-0.02, 0.2175], [-0.05, 0.2165]]); // crosses the crease
  stray.hist = g.facets[0].hist.map((h, k) => ({ ...host.hist[Math.min(k, 1)], T: host.hist[Math.min(k, 1)].T, layer: k >= 1 ? 0.5 : 0, moved: false }));
  check('layer-order check catches a stray layer inside a fold', layerOrderViolations({ ...g, facets: [...g.facets, stray] }).length > 0);
}

// 6. Genome, sketches and legacy compatibility.
{
  const legacy = encode(completeDesign(CLASSICS.dart.design, M)).slice(0, LEGACY_GENOME_SIZE);
  const d = decode(legacy, M);
  check(`legacy ${LEGACY_GENOME_SIZE}-gene genome decodes to the same design (valley, diag folds)`, d.bodyFold === 'valley' && d.noseFolds.map((f) => f.type).join() === 'diag,diag' && GENOME_SIZE === LEGACY_GENOME_SIZE + 5);
  const nk = decode(encode(completeDesign(CLASSICS.nakamura.design, M)), M);
  check('Nakamura round-trips through the genome', nk.bodyFold === 'mountain' && nk.noseFolds.map((f) => f.type).join() === 'diag,tip,diag,lock' && nk.noseFolds[3].depth === 0.012);
  const { sketch } = fromGenome(encode(completeDesign(CLASSICS.nakamura.design, M)));
  check('Nakamura sketch is in the archive', allSketches().some((s) => sketchKey(s) === sketchKey(sketch)), sketchKey(sketch));
  check('grammar: lock last after a nose fold then a corner fold; pleat first', grammarOK(['d', 't', 'd', 'k']) && grammarOK(['p', 't', 'd', 'k']) && !grammarOK(['t', 'k']) && !grammarOK(['d', 'p']) && !grammarOK(['t', 'd', 'k', 'd']));
}

// 7. Every sketch decodes and folds without exceptions for a few random x vectors.
{
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const all = allSketches();
  let n = 0, ok = 0, errors = 0, keyMismatch = 0, typeMismatch = 0, orderBad = 0, firstErr = null;
  const letter = { diag: 'd', tip: 't', lock: 'k', pleat: 'p' };
  const t0 = performance.now();
  all.forEach((s, si) => {
    for (let r = 0; r < 3; r++) {
      n++;
      try {
        const x = Array.from({ length: dims(s) }, rand);
        const g = toGenome(s, x);
        const back = fromGenome(g);
        if (sketchKey(back.sketch) !== sketchKey(s) || back.x.some((v, i) => Math.abs(v - x[i]) > 1e-12)) keyMismatch++;
        const d = decode(g, M);
        if (d.noseFolds.map((f) => letter[f.type]).join('') !== s.types.join('') || (d.bodyFold === 'mountain') !== s.mountain) typeMismatch++;
        const geom = foldPlane(d);
        if (!geom.ok) continue;
        ok++;
        retentionOf(geom);
        stepDiagrams(geom, buildInstructions(geom));
        if ((si + r) % 9 === 0 && layerOrderViolations(geom).length) orderBad++;
      } catch (e) { errors++; firstErr = firstErr || `${sketchKey(s)}: ${e.stack.split('\n').slice(0, 2).join(' ')}`; }
    }
  });
  const ms = performance.now() - t0;
  check(`all ${all.length} sketches × 3 random vectors fold without exceptions`, errors === 0, `${ok}/${n} foldable, ${errors} exceptions${firstErr ? ` (${firstErr})` : ''}, ${(ms / 1000).toFixed(1)} s`);
  check('sketch ↔ genome round trip and decoded fold sequence match the sketch', keyMismatch === 0 && typeMismatch === 0, `${keyMismatch} key, ${typeMismatch} type mismatches`);
  check('layer order sanity on a ninth of the random planes', orderBad === 0, `${orderBad} with violations`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
