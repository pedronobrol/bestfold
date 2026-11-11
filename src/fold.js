// Fold engine.
//
// Phase A (flat): the sheet is a set of convex facets, each with a rigid 2D
// transform (original sheet coords -> current flat coords) and a layer index.
// Two kinds of simple fold are supported:
//  - all-layer folds (corner folds, nose folds, the body fold): split every facet by
//    a line, reflect the moving side and stack it on top (valley) or underneath
//    (mountain) in reverse order;
//  - some-layers folds (the Nakamura lock, the second crease of a pleat): only a
//    chosen flap moves, together with everything hinged to it across edges that are
//    not on the fold line. The fold is rejected if that closure would tear the sheet
//    or drag a flap through a layer lying on top of it.
//
// Layer order. `layer` is a global linear extension of the stacking order: for any two
// facets that overlap in the flat state, the higher layer is on top. That is exact for
// every operation here because each one inserts its moved block contiguously at an
// extreme of the stack (all of it on top, or all of it underneath): the moved facets
// were the topmost layers wherever they lay, and after reflection they only overlap
// stationary paper that they now cover. Per-cell stacks are queries on this order
// (see stackAt in retention.js). Operations that interleave layers (tucking a flap
// *into* a pocket, inside-reverse folds) would need true per-cell orders and are not
// part of the grammar.
//
// Phase B (3D): from the body-folded flat state, the wings, winglets and
// elevator are rotated about their hinge lines to give the flight shape.
//
// Sheet coordinates: x across the sheet (centre crease at x=0), y along it
// with the nose at y=L. Body frame: X forward, Y left, Z up.

import {
  I2, apply2, compose2, invert2, reflectT, line2, side, splitPoly, polyArea,
  rotateAbout, normalize, sub, clipLineToPoly,
} from './geom.js';

const TOL = 1e-7;
const MIN_FLAP_AREA = 2e-4; // 2 cm²: smaller folds are pointless; skip them

class Facet {
  constructor(poly, T, layer, half, hist = []) {
    this.poly = poly; // original sheet coords
    this.T = T; // original -> current flat
    this.layer = layer;
    this.half = half; // 'L' | 'R'
    this.hist = hist; // [{T, layer, moved}] per completed step (index 0 = initial)
    this.region = 'keel';
  }
  cur() { return this.poly.map((q) => apply2(this.T, q)); }
  clone(poly) {
    const f = new Facet(poly, this.T, this.layer, this.half, this.hist.slice());
    f.region = this.region;
    return f;
  }
}

// Split every facet in `facets` (optionally filtered) by a line expressed in current coords.
function splitAll(facets, Lc, filter = () => true) {
  const out = [];
  for (const f of facets) {
    if (!filter(f)) { out.push(f); continue; }
    const Ti = invert2(f.T);
    const p0 = apply2(Ti, Lc.p);
    const p1 = apply2(Ti, [Lc.p[0] + Lc.d[0], Lc.p[1] + Lc.d[1]]);
    const Lo = line2(p0, p1);
    const { left, right } = splitPoly(f.poly, Lo);
    // side() in original coords flips sign if T is a reflection; we just keep both pieces.
    if (left && right) { out.push(f.clone(left), f.clone(right)); } else out.push(f);
  }
  return out;
}

const facetSide = (f, Lc) => {
  // mean signed distance of the facet's current vertices (facets never straddle after a split)
  const c = f.cur();
  let s = 0;
  for (const q of c) s += side(Lc, q);
  return s / c.length;
};

function maxLayer(facets) { let m = -Infinity; for (const f of facets) m = Math.max(m, f.layer); return m; }

function snapshot(facets, moved) {
  for (const f of facets) f.hist.push({ T: f.T, layer: f.layer, moved: moved.has(f) });
}

// Bounds of current flat shape.
function bounds(facets, filter = () => true) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const f of facets) {
    if (!filter(f)) continue;
    for (const q of f.cur()) {
      xmin = Math.min(xmin, q[0]); xmax = Math.max(xmax, q[0]);
      ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]);
    }
  }
  return { xmin, xmax, ymin, ymax };
}

// Collect crease segments (in original coords) that lie on line Lc for the given facets.
function creasesOn(facets, Lc, valleyFromTop, step, kind) {
  const segs = [];
  for (const f of facets) {
    const c = f.cur();
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if (Math.abs(side(Lc, a)) < 1e-7 && Math.abs(side(Lc, b)) < 1e-7) {
        const front = f.T.a * f.T.d - f.T.b * f.T.c > 0; // front face up?
        segs.push({
          a: f.poly[i], b: f.poly[(i + 1) % c.length], step, kind,
          valley: front ? valleyFromTop : !valleyFromTop,
        });
      }
    }
  }
  return mergeSegs(segs);
}

function mergeSegs(segs) {
  // de-duplicate identical segments (shared by two facets)
  const key = (s) => [s.a, s.b].map((p) => p.map((v) => v.toFixed(6)).join(',')).sort().join('|');
  const seen = new Map();
  for (const s of segs) if (!seen.has(key(s))) seen.set(key(s), s);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Hinges: two facets are joined wherever they share a stretch of edge in sheet coordinates,
// because the paper is continuous there. A fold may move one and not the other only if that
// shared stretch lies on the fold line; anything else would tear the sheet.
const bboxOf = (P) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of P) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
};
const bbHit = (a, b, e) => a[0] <= b[2] + e && b[0] <= a[2] + e && a[1] <= b[3] + e && b[1] <= a[3] + e;

// The common stretch of edge of two convex polygons (convex facets share at most one), or null.
function sharedSegment(P, Q) {
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    const ux = ex / len, uy = ey / len;
    for (let k = 0; k < Q.length; k++) {
      const c = Q[k], d = Q[(k + 1) % Q.length];
      const dc = ux * (c[1] - a[1]) - uy * (c[0] - a[0]), dd = ux * (d[1] - a[1]) - uy * (d[0] - a[0]);
      if (Math.abs(dc) > 1e-9 || Math.abs(dd) > 1e-9) continue;
      const tc = ux * (c[0] - a[0]) + uy * (c[1] - a[1]), td = ux * (d[0] - a[0]) + uy * (d[1] - a[1]);
      const t0 = Math.max(0, Math.min(tc, td)), t1 = Math.min(len, Math.max(tc, td));
      if (t1 - t0 > 1e-6) return [[a[0] + ux * t0, a[1] + uy * t0], [a[0] + ux * t1, a[1] + uy * t1]];
    }
  }
  return null;
}

// adjacency list: hinges[i] = [{j, seg}] with seg in sheet coordinates
export function hingeGraph(facets) {
  const bb = facets.map((f) => bboxOf(f.poly));
  const adj = facets.map(() => []);
  for (let i = 0; i < facets.length; i++) {
    for (let j = i + 1; j < facets.length; j++) {
      if (!bbHit(bb[i], bb[j], 1e-9)) continue;
      const seg = sharedSegment(facets[i].poly, facets[j].poly);
      if (seg) { adj[i].push({ j, seg }); adj[j].push({ j: i, seg }); }
    }
  }
  return adj;
}

// does a sheet-coordinate segment, mapped by transform T, lie on line Lc?
export const segOnLine = (T, seg, Lc) => seg.every((p) => Math.abs(side(Lc, apply2(T, p))) < 1e-7);

// Intersection of two convex polygons (either orientation), or null.
export function clipConvex(P, Q) {
  const ccw = polyArea(Q) > 0;
  let R = P;
  for (let i = 0; i < Q.length && R; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12) continue;
    const { left, right } = splitPoly(R, line2(a, b));
    R = ccw ? left : right;
  }
  return R;
}
export function overlapArea(P, Q) {
  const R = clipConvex(P, Q);
  return R ? Math.abs(polyArea(R)) : 0;
}

// Rotation angle about Lc (through +z for a valley, -z for a mountain) that swings its left side over.
function swingAngle(Lc, valley = true) {
  const q = [Lc.p[0] - Lc.d[1] * 0.01, Lc.p[1] + Lc.d[0] * 0.01, 0];
  const r = rotateAbout(q, [Lc.p[0], Lc.p[1], 0], [Lc.d[0], Lc.d[1], 0], Math.PI / 2);
  return (r[2] > 0) === valley ? Math.PI : -Math.PI;
}

// Some-layers simple fold about Lc (current coords); the moving side is the left of Lc.d.
// seed(f) marks the layers the folder takes hold of; the moving set is their closure over
// hinges that are not on the fold line (paper you lift drags along whatever it is joined to).
// With strict, the closure may not add anything: "fold only these layers" while they are joined
// to other paper away from the crease would tear the sheet. Also rejected when the closure
// reaches across the line, or when a stationary layer lies on top of a moving one (the flap
// would have to pass through it). place 'top' = valley towards the viewer, the moved block
// reversed onto the top of the stack; 'bottom' = mountain, underneath.
// Returns {facets, moved} or {bad}. Does not mutate the input facets.
export function foldLayers(facets, Lc, seed, place = 'top', strict = false) {
  // splitAll keeps unsplit facets by reference: copy them so a rejected fold leaves no trace
  const orig = new Set(facets);
  const next = splitAll(facets, Lc).map((f) => (orig.has(f) ? f.clone(f.poly) : f));
  const sideOf = next.map((f) => facetSide(f, Lc));
  const adj = hingeGraph(next);
  const moving = new Set(), queue = [];
  next.forEach((f, i) => { if (sideOf[i] > TOL && seed(f)) { moving.add(i); queue.push(i); } });
  if (!moving.size) return { bad: 'nothing to fold' };
  while (queue.length) {
    const i = queue.pop();
    for (const { j, seg } of adj[i]) {
      if (moving.has(j) || segOnLine(next[i].T, seg, Lc)) continue;
      if (strict || sideOf[j] <= TOL) return { bad: 'the flap is joined to other layers away from the crease (would tear)' };
      moving.add(j); queue.push(j);
    }
  }
  const cur = next.map((f) => f.cur()), bb = cur.map(bboxOf);
  for (const i of moving) {
    for (let j = 0; j < next.length; j++) {
      if (moving.has(j) || sideOf[j] <= TOL || !bbHit(bb[i], bb[j], 0)) continue;
      const over = place === 'top' ? next[j].layer > next[i].layer : next[j].layer < next[i].layer;
      if (over && overlapArea(cur[i], cur[j]) > 1e-8) return { bad: 'another layer covers the flap' };
    }
  }
  const R = reflectT(Lc);
  let lo = Infinity, hi = -Infinity;
  for (const f of next) { lo = Math.min(lo, f.layer); hi = Math.max(hi, f.layer); }
  const moved = [...moving].map((i) => next[i]);
  for (const f of moved) {
    f.T = compose2(R, f.T);
    f.layer = place === 'top' ? 2 * hi + 1 - f.layer : 2 * lo - 1 - f.layer;
  }
  return { facets: next, moved };
}

// Seed for foldLayers: the k topmost layers (k bottommost with fromBottom) covering point q.
// Facets with the same layer and transform are one piece of paper, so the seed also matches
// the pieces foldLayers splits them into.
export function layersAtPoint(facets, q, k, fromBottom = false) {
  const key = (f) => [f.layer, f.T.a, f.T.b, f.T.c, f.T.d, f.T.tx, f.T.ty].map((v) => v.toFixed(9)).join('|');
  const hit = facets.filter((f) => pointInConvex(f.cur(), q, 1e-9));
  const ls = [...new Set(hit.map((f) => f.layer))].sort((a, b) => (fromBottom ? a - b : b - a)).slice(0, k);
  const keys = new Set(hit.filter((f) => ls.includes(f.layer)).map(key));
  return (f) => keys.has(key(f));
}

// Fresh facets in the flat state after step k of a folded plane (to try further operations).
export const facetsAt = (geom, k) => geom.facets.map((f) => new Facet(f.poly, f.hist[k].T, f.hist[k].layer, f.half, f.hist.slice(0, k + 1)));

// ---------------------------------------------------------------------------
export function foldPlane(design) {
  const { W, L } = design.sheet;
  let facets = [
    new Facet([[-W / 2, 0], [0, 0], [0, L], [-W / 2, L]], I2, 0, 'L'),
    new Facet([[0, 0], [W / 2, 0], [W / 2, L], [0, L]], I2, 0, 'R'),
  ];
  snapshot(facets, new Set());
  const steps = [];
  const creases = [{ a: [0, 0], b: [0, L], step: 0, kind: 'precrease', valley: true }];
  const warnings = [];
  const fail = (reason) => ({ ok: false, reason, design });

  // Step 0: pre-crease the centre line (purely instructional).
  steps.push({ kind: 'precrease', axes: [], note: 'centre' });

  // All-layer nose fold square to the centre line, `depth` below the current top.
  const tipFold = (depth, extra) => {
    const yl = bounds(facets).ymax - depth;
    const Lc = { p: [0, yl], d: [1, 0] }; // left of d (+x) is +y: the nose side moves
    const next = splitAll(facets, Lc);
    const moving = next.filter((f) => facetSide(f, Lc) > TOL);
    const area = moving.reduce((s, f) => s + Math.abs(polyArea(f.poly)), 0);
    if (area < MIN_FLAP_AREA * 2) return false;
    facets = next;
    const plyTip = pliesAlong(facets, Lc, 'L');
    const R = reflectT(Lc), m = maxLayer(facets);
    const cre = creasesOn(moving, Lc, true, steps.length, extra.kind);
    for (const f of moving) { f.T = compose2(R, f.T); f.layer = 2 * m + 1 - f.layer; }
    snapshot(facets, new Set(moving));
    creases.push(...cre);
    steps.push({ depth, ...extra, allLayers: true, plies: plyTip, axes: [{ p: [0, yl], d: [1, 0], angle: Math.PI }], lines: [Lc] });
    return true;
  };
  // Some-layers fold: commit a foldLayers() result as a step. Only the moved facets turn about
  // the axis, so the axis carries movedOnly for the viewer and the step diagrams.
  const layersFold = (Lc, r, extra) => {
    facets = r.facets;
    const moved = new Set(r.moved);
    // the moved facets are already reflected (their facing flipped), hence valleyFromTop = false
    creases.push(...creasesOn(r.moved, Lc, false, steps.length, extra.kind));
    snapshot(facets, moved);
    steps.push({
      ...extra, allLayers: false, layersMoved: new Set(r.moved.map((f) => f.layer)).size,
      plies: pliesAlong(r.moved, Lc, 'L'),
      axes: [{ p: Lc.p, d: Lc.d, angle: swingAngle(Lc, true), movedOnly: true }], lines: [Lc],
    });
  };
  // facets that moved at step j and have stayed put since (the exposed part of that flap)
  const flapOf = (j) => (f) => f.hist[j].moved && f.hist.slice(j + 1).every((h) => !h.moved);

  for (const nf of design.noseFolds) {
    const top = bounds(facets).ymax;
    if (nf.type === 'tip') {
      if (!tipFold(nf.depth, { kind: 'tip' })) warnings.push('tip fold skipped (too small)');
    } else if (nf.type === 'pleat') {
      // Pleat: fold the nose down at `at` below the top (all layers), then fold that flap alone
      // back up `width` below the first crease. Three layers in the band pull the CG forward.
      if (!tipFold(nf.at, { kind: 'pleat', part: 1, at: nf.at, width: nf.width })) { warnings.push('pleat skipped (too small)'); continue; }
      const j1 = steps.length - 1, y2 = top - nf.at - nf.width;
      const Lc = { p: [0, y2], d: [-1, 0] }; // left of -x is -y: the part of the flap below y2 moves
      const r = foldLayers(facets, Lc, flapOf(j1), 'top', true);
      if (r.bad) { warnings.push(`pleat second crease skipped (${r.bad})`); continue; }
      layersFold(Lc, r, { kind: 'pleat', part: 2, at: nf.at, width: nf.width });
    } else if (nf.type === 'lock') {
      // Nakamura lock: the point of the latest nose flap shows below the corner flaps; fold only
      // that flap up over them. If the requested depth would drag the flap out from under other
      // layers (or tear it), use the deepest whole-millimetre depth that works.
      let jt = -1;
      steps.forEach((s, j) => { if (s.kind === 'tip') jt = j; });
      if (jt < 0) { warnings.push('lock skipped (no nose flap to lock with)'); continue; }
      const flap = flapOf(jt);
      const own = facets.filter(flap);
      if (!own.length) { warnings.push('lock skipped (nose flap is covered)'); continue; }
      const apex = Math.min(...own.flatMap((f) => f.cur().map((q) => q[1])));
      const attempt = (dep) => {
        const Lc = { p: [0, apex + dep], d: [-1, 0] };
        return { Lc, r: foldLayers(facets, Lc, flap, 'top', true), dep };
      };
      const MIN_LOCK = 0.003;
      let A = attempt(nf.depth);
      if (A.r.bad) {
        let lo = MIN_LOCK, hi = nf.depth;
        if (attempt(lo).r.bad) { warnings.push(`lock skipped (${A.r.bad})`); continue; }
        for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (attempt(mid).r.bad) hi = mid; else lo = mid; }
        let dep = Math.floor(lo * 1000 + 1e-9) / 1000;
        A = attempt(dep);
        while (A.r.bad && dep > MIN_LOCK) { dep = Math.round((dep - 0.001) * 1000) / 1000; A = attempt(dep); }
        if (A.r.bad) { warnings.push(`lock skipped (${A.r.bad})`); continue; }
        warnings.push(`lock depth reduced to ${Math.round(A.dep * 1000)} mm so the tip is free to fold`);
      }
      const tabArea = A.r.moved.reduce((s, f) => s + Math.abs(polyArea(f.poly)), 0);
      if (tabArea < MIN_FLAP_AREA / 4) { warnings.push('lock skipped (too small)'); continue; }
      layersFold(A.Lc, A.r, { kind: 'lock', depth: A.dep, tipStep: jt });
    } else {
      // Mirrored diagonal pair through (0, top + offset), angle theta from the centre line.
      // Feasible by construction: if the requested angle would push the flap across the centre
      // line (or tear centre-line material), use the nearest valid angle, in whole degrees.
      const P0 = [0, top + nf.offset];
      const trial = (theta) => {
        const dl = [-Math.sin(theta), -Math.cos(theta)];
        const Ll = { p: P0, d: dl };
        const Lr = { p: P0, d: [-dl[0], dl[1]] };
        const ref = [0, P0[1] - 1]; // moving side = side not containing the centre line below P0
        const sL = side(Ll, ref) > 0 ? -1 : 1, sR = side(Lr, ref) > 0 ? -1 : 1;
        let next = splitAll(facets, Ll, (f) => f.half === 'L');
        next = splitAll(next, Lr, (f) => f.half === 'R');
        const movL = next.filter((f) => f.half === 'L' && sL * facetSide(f, Ll) > TOL);
        const movR = next.filter((f) => f.half === 'R' && sR * facetSide(f, Lr) > TOL);
        const RL = reflectT(Ll);
        let bad = null;
        for (const f of movL) for (const q of f.cur()) {
          if (q[0] > -1e-6 && Math.abs(side(Ll, q)) > 1e-6) bad = 'diagonal flap contains centre line (would tear)';
          else if (apply2(RL, q)[0] > 1e-4) bad = bad || 'flap crosses centre line';
        }
        return { Ll, Lr, sL, sR, next, movL, movR, bad, theta };
      };
      let T = trial(nf.theta);
      if (T.bad) {
        let lo = nf.theta, hi = 89 * (Math.PI / 180);
        if (trial(hi).bad) return fail(T.bad);
        for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (trial(mid).bad) lo = mid; else hi = mid; }
        const deg1 = Math.PI / 180;
        let th = Math.ceil(hi / deg1 - 1e-9) * deg1;
        T = trial(th);
        while (T.bad && th < 89 * deg1) { th += deg1; T = trial(th); }
        if (T.bad) return fail(T.bad);
        warnings.push(`corner fold angle raised to ${Math.round(th / deg1)}° so the flap stays on its side`);
      }
      const { Ll, Lr, sL, sR, next, movL, movR } = T;
      const area = movL.reduce((s, f) => s + Math.abs(polyArea(f.poly)), 0);
      if (area < MIN_FLAP_AREA) { warnings.push('diagonal fold skipped (too small)'); continue; }
      const RL = reflectT(Ll), RR = reflectT(Lr);
      facets = next;
      const plyDiag = pliesAlong(facets, Ll, 'L');
      const m = maxLayer(facets);
      const cre = [
        ...creasesOn(movL, Ll, true, steps.length, 'diag'),
        ...creasesOn(movR, Lr, true, steps.length, 'diag'),
      ];
      for (const f of movL) { f.T = compose2(RL, f.T); f.layer = 2 * m + 1 - f.layer; }
      for (const f of movR) { f.T = compose2(RR, f.T); f.layer = 2 * m + 1 - f.layer; }
      snapshot(facets, new Set([...movL, ...movR]));
      creases.push(...cre);
      // Valley fold: flap rotates up (+z) and over. Sign chosen so the flap passes through +z.
      const sgn = (Lx, s) => {
        const q = [Lx.p[0] - s * Lx.d[1] * 0.01, Lx.p[1] + s * Lx.d[0] * 0.01, 0];
        const r = rotateAbout(q, [Lx.p[0], Lx.p[1], 0], [Lx.d[0], Lx.d[1], 0], Math.PI / 2);
        return r[2] > 0 ? Math.PI : -Math.PI;
      };
      steps.push({
        kind: 'diag', theta: T.theta, offset: nf.offset, plies: plyDiag, allLayers: true,
        axes: [
          { p: Ll.p, d: Ll.d, angle: sgn(Ll, sL), half: 'L' },
          { p: Lr.p, d: Lr.d, angle: sgn(Lr, sR), half: 'R' },
        ],
        lines: [Ll, Lr],
      });
    }
  }

  // Body fold along the centre crease. Valley (default): the left half goes over the top onto the
  // right half, so the flaps end up inside the keel. Mountain: it goes underneath, so the flaps
  // (and a lock tab) stay on the outside.
  const mountain = design.bodyFold === 'mountain';
  const plyBody = pliesAlong(facets, { p: [-1e-4, 0], d: [0, 1] }, 'L');
  {
    const Lc = { p: [0, 0], d: [0, 1] };
    const moving = facets.filter((f) => f.half === 'L');
    const R = reflectT(Lc);
    let lo = Infinity, hi = -Infinity;
    for (const f of facets) { lo = Math.min(lo, f.layer); hi = Math.max(hi, f.layer); }
    for (const f of moving) { f.T = compose2(R, f.T); f.layer = mountain ? 2 * lo - 1 - f.layer : 2 * hi + 1 - f.layer; }
    snapshot(facets, new Set(moving));
    steps.push({ kind: 'body', mountain, allLayers: true, plies: plyBody, axes: [{ p: [0, 0], d: [0, 1], angle: mountain ? -Math.PI : Math.PI }], lines: [Lc] });
  }

  // ---------------- Phase B: wing geometry in the body-folded flat state ----------------
  const bb = bounds(facets);
  const { ymin, ymax, xmax } = bb;
  const w = design.wing;
  const H0 = [w.dTail, ymin], H1 = [w.dNose, ymax];
  const Lw = line2(H0, H1); // direction +y roughly; wing side is to the right (x larger)
  const wingSide = (q) => -side(Lw, q); // > 0 on wing side
  // keel depth must leave a wing; require material beyond the hinge
  let wingMat = 0;
  for (const f of facets) for (const q of f.cur()) wingMat = Math.max(wingMat, wingSide(q));
  if (wingMat < 0.02) return fail('wing too small (hinge outside sheet)');
  const plyWing = pliesAlong(facets, Lw, 'L');
  const hingeSpan = chordAlong(facets.filter((f) => f.half === 'L').map((f) => f.cur()), Lw);
  facets = splitAll(facets, Lw);
  for (const f of facets) f.region = facetSide(f, Lw) < -TOL ? 'wing' : 'keel';
  const wingB = bounds(facets, (f) => f.region === 'wing');
  if (!isFinite(wingB.xmax)) return fail('no wing');

  let xw = null;
  if (design.winglet.enabled) {
    xw = wingB.xmax - design.winglet.width;
    const hingeMax = Math.max(w.dTail, w.dNose);
    if (xw < hingeMax + 0.025) { warnings.push('winglet disabled (wing too narrow)'); xw = null; }
  }
  const Lt = xw === null ? null : { p: [xw, 0], d: [0, 1] }; // tip side is right (x > xw)
  if (Lt) {
    facets = splitAll(facets, Lt, (f) => f.region === 'wing');
    for (const f of facets) if (f.region === 'wing' && facetSide(f, Lt) < -TOL) f.region = 'winglet';
  }
  const elevY = design.elevator.chord > 0 ? ymin + design.elevator.chord : null;
  const Le = elevY === null ? null : { p: [0, elevY], d: [1, 0] }; // flap side: y < elevY -> right of d
  if (Le) {
    facets = splitAll(facets, Le, (f) => f.region === 'wing');
    for (const f of facets) if (f.region === 'wing' && facetSide(f, Le) < -TOL) f.region = 'flap';
  }

  // Phase B creases on original sheet.
  const regionCreases = (Lc, kind, filterA) => {
    const segs = [];
    for (const f of facets) {
      if (!filterA(f)) continue;
      const c = f.cur();
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        if (Math.abs(side(Lc, a)) < 1e-7 && Math.abs(side(Lc, b)) < 1e-7)
          segs.push({ a: f.poly[i], b: f.poly[(i + 1) % c.length], step: -1, kind, valley: f.half === 'R' });
      }
    }
    return mergeSegs(segs);
  };
  creases.push(...regionCreases(Lw, 'wing', () => true));
  if (Lt) creases.push(...regionCreases(Lt, 'winglet', (f) => f.region === 'wing' || f.region === 'winglet'));
  if (Le) creases.push(...regionCreases(Le, 'elevator', (f) => f.region === 'wing' || f.region === 'flap'));

  const keelSpan = chordAlong(facets.filter((f) => f.half === 'L').map((f) => f.cur()), { p: [1e-4, 0], d: [0, 1] });
  const plies = {
    max: Math.max(plyBody, plyWing, ...steps.map((st) => st.plies || 0)),
    body: plyBody, wing: plyWing,
    hingeLength: hingeSpan ? hingeSpan[1] - hingeSpan[0] : 0,
    keelLength: keelSpan ? keelSpan[1] - keelSpan[0] : 0,
  };
  const phaseB = {
    plies,
    ymin, ymax, xmax, wingXmax: wingB.xmax,
    hinge: { a: H0, b: H1 },
    bodyFold: mountain ? 'mountain' : 'valley',
    wingletX: xw,
    elevY,
  };

  const geom = {
    ok: true, design, warnings, facets, steps, creases, phaseB,
  };
  geom.map3D = makeMap3D(geom);
  return geom;
}

// ---------------------------------------------------------------------------
// Phase-B mapping: flat body-folded coords (x >= 0 out from keel, y along) -> body 3D.
// `angles` lets the viewer animate: {wing: 0..1, winglet: 0..1, elev: 0..1, wingFlat: 0..1}
export function makeMap3D(geom, asym = {}) {
  const dDih = asym.dDihedral || 0, dEl = asym.dElev || 0, elevSym = asym.elevSym || 0, dihSym = asym.dihSym || 0;
  const { design, phaseB } = geom;
  const H0 = [phaseB.hinge.a[1], 0, phaseB.hinge.a[0]];
  const H1 = [phaseB.hinge.b[1], 0, phaseB.hinge.b[0]];
  const kw = normalize(sub(H1, H0));
  const Lw = line2(phaseB.hinge.a, phaseB.hinge.b);
  const G = design.wing.dihedral;
  // After a mountain body fold the left half lies *under* the right one in the flat stack, so
  // flat layer height maps to -Y (the 3D shape is the same; only the viewer's layer offsets care).
  const zs = phaseB.bodyFold === 'mountain' ? -1 : 1;
  return function map3D(q, half, region, anim = null, layerOffset = 0) {
    const s = half === 'L' ? 1 : -1;
    let P = [q[1], zs * s * layerOffset, q[0]];
    const a = anim || { wing: 1, winglet: 1, elev: 1, wingFlat: 0 };
    if (region === 'keel') return P;
    // children first (in base frame)
    if (region === 'winglet') {
      const ang = s * design.winglet.angle * (a.winglet ?? 0);
      P = rotateAbout(P, [0, 0, phaseB.wingletX], [1, 0, 0], ang);
    } else if (region === 'flap') {
      const de = (half === 'L' ? dEl / 2 : -dEl / 2) + elevSym;
      const ang = s * (design.elevator.angle + de) * (a.elev ?? 0);
      P = rotateAbout(P, [phaseB.elevY, 0, 0], [0, 0, 1], ang);
    }
    // wing rotation: target -(90°-Γ) for L, +(90°-Γ) for R; wingFlat animates a full crease (180°)
    const dG = half === 'L' ? dDih / 2 : -dDih / 2;
    const target = -s * (Math.PI / 2 - (G + dG + dihSym));
    let ang;
    if (a.wingOpen !== undefined) ang = -s * Math.PI + (target + s * Math.PI) * a.wingOpen; // flat -> flight angle
    else if (a.wingFlat > 0) ang = -s * Math.PI * a.wingFlat;
    else ang = target * (a.wing ?? 0);
    P = rotateAbout(P, H0, kw, ang);
    return P;
  };
}

// Region of a point in the flat body-folded state.
export function regionOf(geom, q) {
  const { phaseB } = geom;
  const Lw = line2(phaseB.hinge.a, phaseB.hinge.b);
  if (side(Lw, q) > 0) return 'keel';
  if (phaseB.wingletX !== null && q[0] > phaseB.wingletX) return 'winglet';
  if (phaseB.elevY !== null && q[1] < phaseB.elevY) return 'flap';
  return 'wing';
}

// Final 3D facets for physics & rendering.
export function facets3D(geom, asym) {
  const map = asym ? makeMap3D(geom, asym) : geom.map3D;
  return geom.facets.map((f) => ({
    half: f.half, region: f.region, layer: f.layer,
    pts: f.cur().map((q) => map(q, f.half, f.region)),
  }));
}

// Spanwise extents of material (union of facet polygons) along a line in flat coords.
// Uses the longest connected stretch of material, so gaps between separate flaps never count
// as lifting surface.
export function chordAlong(polys, Lc) {
  const iv = [];
  for (const P of polys) { const r = clipLineToPoly(Lc, P); if (r) iv.push(r); }
  if (!iv.length) return null;
  iv.sort((a, b) => a[0] - b[0]);
  let best = null, cur = iv[0].slice();
  for (let i = 1; i <= iv.length; i++) {
    const r = iv[i];
    if (r && r[0] <= cur[1] + 1e-3) cur[1] = Math.max(cur[1], r[1]);
    else {
      if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur;
      if (r) cur = r.slice();
    }
  }
  return best[1] > best[0] ? best : null;
}

// Maximum number of stacked layers (one half) that a crease line passes through, sampled
// along the part of the line that lies on paper. Used for the ply limit.
export function pliesAlong(facets, Lc, half) {
  const hf = facets.filter((f) => f.half === half);
  const polys = hf.map((f) => f.cur());
  const r = chordAlong(polys, Lc);
  if (!r) return 0;
  let mx = 0;
  for (let k = 1; k < 24; k++) {
    const t = r[0] + ((r[1] - r[0]) * k) / 24;
    const q = [Lc.p[0] + Lc.d[0] * t, Lc.p[1] + Lc.d[1] * t];
    // a point on a facet boundary touches two facets of the same layer: count layers, not facets
    const layers = new Set();
    hf.forEach((f, i) => { if (pointInConvex(polys[i], q, 1e-7)) layers.add(f.layer); });
    mx = Math.max(mx, layers.size);
  }
  return mx;
}
export function pointInConvex(P, q, eps) {
  let sgn = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    if (Math.abs(c) < eps) continue;
    if (!sgn) sgn = Math.sign(c); else if (Math.sign(c) !== sgn) return false;
  }
  return true;
}

// Number of stacked layers at a flat point (used for stiffness estimates).
export function layersAt(geom, q, regionFilter) {
  let n = 0;
  for (const f of geom.facets) {
    if (f.half !== 'L' || (regionFilter && !regionFilter(f.region))) continue;
    const c = f.cur();
    let inside = true;
    const sgn = polyArea(c) > 0 ? 1 : -1;
    for (let i = 0; i < c.length && inside; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if (sgn * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) < -1e-9) inside = false;
    }
    if (inside) n++;
  }
  return n;
}
