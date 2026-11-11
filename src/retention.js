// Layer stacks, fold-order checks and flap retention.
//
// The plane is held together by folds alone (no tape, no glue), so whether a folded flap stays
// put in flight is a property of the stacking order. A flap is the connected set of facets that
// one fold step moved. It can spring open by turning back about its crease unless:
//  - trapped: a later all-layer crease folds it together with the paper under it (the nose fold
//    through the corner flaps, the body fold through a nose flap, the wing crease through the
//    corner flaps), or a lock tab holds it: it lies between the tab and the layer the tab is
//    hinged to (Nakamura lock);
//  - pocketed: it lies inside a later fold (between the folded-over layer and the paper that
//    layer is hinged to) without being creased by it;
//  - sandwiched: it lies inside the keel of a valley body fold, so it is held only where the keel
//    is pinched;
//  - otherwise it is free: an outer flap of a mountain-folded body, or a dog-ear on the wing.
//    Free flaps spring open in flight (drag) and large ones are a feasibility violation.
// "Lies between" is the taco–tortilla relation of flat-folding theory evaluated on the stack
// order right after the later fold, sampled over the flap's area.

import { apply2, polyArea, side } from './geom.js';
import { hingeGraph, segOnLine, pointInConvex, chordAlong, clipConvex } from './fold.js';

const CROSS_MIN = 1e-4; // a crease traps a flap if ≥ 1 cm² (or a quarter of it) lies on each side
const LOCK_MIN = 2.5e-5; // a lock traps a flap if it holds ≥ 0.25 cm² of it
const N_SAMPLES = 120; // area samples per flap

const bbox = (P) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of P) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
};
const bbHit = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const inBox = (b, q, e = 1e-9) => q[0] >= b[0] - e && q[0] <= b[2] + e && q[1] >= b[1] - e && q[1] <= b[3] + e;

// Every facet at fold state k (hist index; the last one is the body-folded flat state).
function stateOf(geom, k) {
  return geom.facets.map((f) => {
    const h = f.hist[k], pts = f.poly.map((q) => apply2(h.T, q));
    return { pts, bb: bbox(pts), layer: h.layer, moved: h.moved };
  });
}

// Per-cell stack: indices of the facets covering flat point q at state k, top first.
export function stackAt(geom, q, k = geom.facets[0].hist.length - 1, filter = () => true) {
  const S = stateOf(geom, k);
  return S.map((s, i) => i)
    .filter((i) => filter(geom.facets[i]) && inBox(S[i].bb, q) && pointInConvex(S[i].pts, q, 1e-9))
    .sort((a, b) => S[b].layer - S[a].layer);
}

// does an edge of polygon P lie on line L and pass next to point q? (`tol` along the line)
function touchesAt(P, L, q, tol) {
  const t = (p) => (p[0] - L.p[0]) * L.d[0] + (p[1] - L.p[1]) * L.d[1];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (Math.abs(side(L, a)) > 1e-7 || Math.abs(side(L, b)) > 1e-7) continue;
    const ta = t(a), tb = t(b), tq = t(q);
    if (tq >= Math.min(ta, tb) - tol && tq <= Math.max(ta, tb) + tol) return true;
  }
  return false;
}

// Taco–tortilla check for every fold step: right after the fold, no layer may lie between a
// moved facet and the stationary facet it is hinged to at the crease unless it is itself folded
// (or ends) on that crease. A violation means paper would have to pass through paper.
export function layerOrderViolations(geom) {
  const F = geom.facets, adj = hingeGraph(F), out = [];
  geom.steps.forEach((step, k) => {
    if (k === 0 || !step.lines) return;
    const S = stateOf(geom, k);
    for (let m = 0; m < F.length; m++) {
      if (!S[m].moved) continue;
      for (const { j: p, seg } of adj[m]) {
        if (S[p].moved) continue;
        const Tp = F[p].hist[k].T;
        const L = step.lines.find((Lc) => segOnLine(Tp, seg, Lc));
        if (!L) continue;
        // probe points just off the crease, on the side where both layers of the fold now lie;
        // a layer covering a probe must reach the crease within a few probe offsets (a flap
        // edge may end on the crease next to the probe and still cover it through a slanted edge)
        const a = apply2(Tp, seg[0]), b = apply2(Tp, seg[1]);
        const c = S[p].pts.reduce((s, v) => [s[0] + v[0] / S[p].pts.length, s[1] + v[1] / S[p].pts.length], [0, 0]);
        const sg = Math.sign(side(L, c)), e = 1e-5;
        for (const u of [0.25, 0.5, 0.75]) {
          const q = [a[0] + (b[0] - a[0]) * u - sg * L.d[1] * e, a[1] + (b[1] - a[1]) * u + sg * L.d[0] * e];
          if (!pointInConvex(S[m].pts, q, 1e-12) || !pointInConvex(S[p].pts, q, 1e-12)) continue;
          const lo = Math.min(S[m].layer, S[p].layer), hi = Math.max(S[m].layer, S[p].layer);
          for (let t = 0; t < F.length; t++) {
            if (t === m || t === p || S[t].layer <= lo || S[t].layer >= hi) continue;
            if (!inBox(S[t].bb, q) || !pointInConvex(S[t].pts, q, 1e-12)) continue;
            if (!touchesAt(S[t].pts, L, q, 20 * e)) out.push({ step: k, kind: step.kind, moved: m, partner: p, between: t });
          }
        }
      }
    }
  });
  return out;
}

// Area samples of a set of facets, in sheet coordinates: {i, qo, w} with Σw = material area.
function sampleFacets(F, idx, area) {
  const total = idx.reduce((s, i) => s + area[i], 0);
  const h = Math.max(0.0015, Math.sqrt(total / N_SAMPLES));
  const out = [];
  for (const i of idx) {
    const P = F[i].poly, b = bbox(P), mine = [];
    for (let x = b[0] + h / 2; x < b[2]; x += h) for (let y = b[1] + h / 2; y < b[3]; y += h) if (pointInConvex(P, [x, y], 0)) mine.push([x, y]);
    if (!mine.length) mine.push(P.reduce((s, v) => [s[0] + v[0] / P.length, s[1] + v[1] / P.length], [0, 0]));
    for (const qo of mine) out.push({ i, qo, w: area[i] / mine.length });
  }
  return out;
}

export function retentionOf(geom) {
  if (!geom.retention) geom.retention = computeRetention(geom);
  return geom.retention;
}

export function computeRetention(geom) {
  const F = geom.facets, steps = geom.steps, H = F[0].hist.length;
  const adj = hingeGraph(F);
  const area = F.map((f) => Math.abs(polyArea(f.poly)));
  const memo = new Map();
  const state = (k) => { if (!memo.has(k)) memo.set(k, stateOf(geom, k)); return memo.get(k); };
  // Stationary paper hinged to a moved facet across step k's crease: the other layer of each
  // taco. Facets with the same layer and transform at state k are one piece of paper (later
  // creases may have split it), so the whole piece counts, not just the strip at the crease.
  const pieceKey = (i, k) => { const h = F[i].hist[k], T = h.T; return [h.layer, T.a, T.b, T.c, T.d, T.tx, T.ty].map((v) => v.toFixed(9)).join('|'); };
  const pmemo = new Map();
  const partners = (k) => {
    if (pmemo.has(k)) return pmemo.get(k);
    const S = state(k), lines = steps[k].lines || [], keys = new Set();
    for (let i = 0; i < F.length; i++) {
      if (!S[i].moved) continue;
      for (const { j, seg } of adj[i]) if (!S[j].moved && lines.some((L) => segOnLine(F[j].hist[k].T, seg, L))) keys.add(pieceKey(j, k));
    }
    const P = new Set();
    for (let i = 0; i < F.length; i++) if (!S[i].moved && keys.has(pieceKey(i, k))) P.add(i);
    pmemo.set(k, P);
    return P;
  };
  // weight of samples lying inside step k's taco (between a moved layer and a partner layer)
  const enclosed = (inFlap, samples, k, keelOnly) => {
    const S = state(k), P = partners(k);
    let w = 0;
    for (const s of samples) {
      if (keelOnly && F[s.i].region !== 'keel') continue;
      const q = apply2(F[s.i].hist[k].T, s.qo), l = S[s.i].layer;
      let mUp = false, mDn = false, pUp = false, pDn = false;
      for (let t = 0; t < F.length; t++) {
        const T = S[t];
        if (inFlap[t] || !(T.moved || P.has(t)) || !inBox(T.bb, q) || !pointInConvex(T.pts, q, 1e-9)) continue;
        if (T.moved) { if (T.layer > l) mUp = true; else mDn = true; } else if (T.layer > l) pUp = true; else pDn = true;
      }
      if ((mUp && pDn) || (mDn && pUp)) w += s.w;
    }
    return w;
  };

  // Area of the flap held inside lock step k's tab, computed exactly: a lock tab is small, often
  // smaller than the sample spacing. Held = under a tab facet and over a facet the tab is hinged to.
  const lockHeld = (idx, inFlap, k) => {
    const S = state(k), P = partners(k);
    const tabs = [], parts = [];
    for (let t = 0; t < F.length; t++) {
      if (inFlap[t]) continue;
      if (S[t].moved) tabs.push(t); else if (P.has(t)) parts.push(t);
    }
    let held = 0;
    for (const i of idx) {
      let best = 0;
      for (const t of tabs) {
        if (S[t].layer < S[i].layer || !bbHit(S[t].bb, S[i].bb)) continue;
        const R = clipConvex(S[i].pts, S[t].pts);
        if (!R) continue;
        for (const p of parts) {
          if (S[p].layer > S[i].layer || !bbHit(S[p].bb, S[i].bb)) continue;
          const R2 = clipConvex(R, S[p].pts);
          if (R2) best = Math.max(best, Math.abs(polyArea(R2)));
        }
      }
      held += best;
    }
    return held;
  };

  const flaps = [];
  for (let j = 1; j < H; j++) {
    const kind = steps[j].kind;
    if (kind === 'body' || kind === 'precrease') continue;
    // connected components of the facets this step moved
    const comp = new Array(F.length).fill(-1);
    let nc = 0;
    for (let i = 0; i < F.length; i++) {
      if (!F[i].hist[j].moved || comp[i] >= 0) continue;
      const stack = [i];
      comp[i] = nc;
      while (stack.length) {
        const a = stack.pop();
        for (const { j: b } of adj[a]) if (F[b].hist[j].moved && comp[b] < 0) { comp[b] = nc; stack.push(b); }
      }
      nc++;
    }
    for (let c = 0; c < nc; c++) {
      const idx = [], inFlap = new Array(F.length).fill(false);
      F.forEach((_, i) => { if (comp[i] === c) { idx.push(i); inFlap[i] = true; } });
      const material = idx.reduce((s, i) => s + area[i], 0);
      const samples = sampleFacets(F, idx, area);
      // footprint (area of the flap as you see it), centroid and region in the final flat state
      const Sj = state(j);
      let foot = 0, cx = 0, cy = 0, keelW = 0, lW = 0;
      for (const s of samples) {
        const q = apply2(F[s.i].hist[j].T, s.qo);
        let n = 0;
        for (const i of idx) if (inBox(Sj[i].bb, q) && pointInConvex(Sj[i].pts, q, 1e-9)) n++;
        foot += s.w / Math.max(1, n);
        const qf = apply2(F[s.i].T, s.qo);
        cx += qf[0] * s.w; cy += qf[1] * s.w;
        if (F[s.i].region === 'keel') keelW += s.w;
        if (F[s.i].half === 'L') lW += s.w;
      }
      const trappedBy = [];
      const crossed = (a0, a1) => Math.min(a0, a1) > 0 && Math.min(a0, a1) >= Math.min(CROSS_MIN, 0.25 * (a0 + a1));
      let pocket = 0, sandwich = 0;
      for (let k = j + 1; k < H; k++) {
        const st = steps[k];
        if (st.allLayers) {
          let a1 = 0;
          for (const i of idx) if (F[i].hist[k].moved) a1 += area[i];
          if (crossed(material - a1, a1)) trappedBy.push(`crease:${st.kind}`);
        }
        if (st.kind === 'lock') { if (lockHeld(idx, inFlap, k) >= LOCK_MIN) trappedBy.push('lock'); }
        else if (st.kind === 'body') sandwich = Math.max(sandwich, enclosed(inFlap, samples, k, true));
        else pocket = Math.max(pocket, enclosed(inFlap, samples, k, false));
      }
      // phase-B creases fold every layer: the wing crease and the winglet crease (the elevator is
      // only a slight bend and holds nothing)
      const regionArea = (pred) => idx.reduce((s, i) => s + (pred(F[i].region) ? area[i] : 0), 0);
      if (crossed(regionArea((r) => r === 'keel'), regionArea((r) => r !== 'keel'))) trappedBy.push('crease:wing');
      if (crossed(regionArea((r) => r === 'winglet'), regionArea((r) => r === 'wing' || r === 'flap'))) trappedBy.push('crease:winglet');
      const cls = trappedBy.length ? 'trapped'
        : pocket >= 0.5 * material ? 'pocketed'
          : sandwich >= 0.5 * material ? 'sandwiched' : 'free';
      flaps.push({
        step: j, kind, facets: idx, class: cls, trappedBy: [...new Set(trappedBy)],
        area: foot, materialArea: material,
        centroid: [cx / material, cy / material],
        half: lW > 0.9 * material ? 'L' : lW < 0.1 * material ? 'R' : 'both',
        region: keelW >= 0.5 * material ? 'keel' : 'wing',
      });
    }
  }

  const facetClass = F.map(() => 'base');
  for (const fl of flaps) for (const i of fl.facets) facetClass[i] = fl.class; // latest fold wins
  const sum = (pred) => flaps.filter(pred).reduce((s, f) => s + f.area, 0);
  const flapArea = sum(() => true);
  const free = flaps.filter((f) => f.class === 'free');

  // Keel length held by a lock: where a tab that actually traps something straddles the centre
  // crease just before the body fold.
  const bodyJ = steps.findIndex((s) => s.kind === 'body');
  let keelLockedLength = 0;
  steps.forEach((st, k) => {
    if (st.kind !== 'lock' || bodyJ < 0 || !flaps.some((f) => f.step < k && f.trappedBy.includes('lock'))) return;
    const S = state(bodyJ - 1);
    const tab = F.map((f, i) => i).filter((i) => F[i].hist[k].moved);
    const r = chordAlong(tab.map((i) => S[i].pts), { p: [-1e-5, 0], d: [0, 1] });
    if (r) keelLockedLength += r[1] - r[0];
  });

  return {
    flaps, facetClass,
    flapArea,
    freeFlapArea: sum((f) => f.class === 'free'),
    maxFreeFlapArea: free.reduce((m, f) => Math.max(m, f.area), 0),
    trappedFraction: flapArea > 0 ? sum((f) => f.class === 'trapped') / flapArea : 1,
    keelLockedLength,
  };
}
