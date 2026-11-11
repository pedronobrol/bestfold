import { apply2 } from './geom.js';
import { chordAlong } from './fold.js';
// ---------------------------------------------------------------------------
// Step diagrams: the folded shape at the start of each step with that step's
// crease drawn on it, the way origami instructions are drawn. Units: mm, nose up.

export function stepDiagrams(geom, instructions, opts = {}) {
  const C = { paper: '#ffffff', back: '#d9e3f5', edge: '#4c545e', crease: '#d23c2a', grip: '#2456c9', ...opts.colors };
  const out = [];
  const H = geom.facets[0].hist.length - 1;
  const stateAt = (k, byRegion = false) => {
    const fs = geom.facets.map((f, i) => ({
      i, pts: f.poly.map((q) => apply2(f.hist[k].T, q)),
      layer: f.hist[k].layer, half: f.half, region: f.region,
      front: f.hist[k].T.a * f.hist[k].T.d - f.hist[k].T.b * f.hist[k].T.c > 0,
    }));
    fs.k = k; fs.byRegion = byRegion;
    return fs;
  };
  const clip = (fs, L) => {
    const r = chordAlong(fs.map((f) => f.pts), L);
    return r ? [[L.p[0] + L.d[0] * r[0], L.p[1] + L.d[1] * r[0]], [L.p[0] + L.d[0] * r[1], L.p[1] + L.d[1] * r[1]]] : null;
  };
  const draw = (fs, lines, dot) => {
    const all = fs.flatMap((f) => f.pts);
    const xs = all.map((p) => p[0] * 1000), ys = all.map((p) => -p[1] * 1000);
    const x0 = Math.min(...xs) - 6, y0 = Math.min(...ys) - 6, w = Math.max(...xs) + 6 - x0, h = Math.max(...ys) + 6 - y0;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm">`;
    const P = (p) => `${(p[0] * 1000).toFixed(1)},${(-p[1] * 1000).toFixed(1)}`;
    const vis = new Map();
    for (const [i, e] of visibleEdges(geom, fs.k, fs.byRegion)) { if (!vis.has(i)) vis.set(i, []); vis.get(i).push(e); }
    for (const f of [...fs].sort((a, b) => a.layer - b.layer)) {
      const col = f.front ? C.paper : C.back;
      s += `<polygon points="${f.pts.map(P).join(' ')}" fill="${col}" stroke="${col}" stroke-width="0.3" stroke-linejoin="round"/>`;
      for (const e of vis.get(f.i) || []) s += `<line x1="${P(f.pts[e]).split(',')[0]}" y1="${P(f.pts[e]).split(',')[1]}" x2="${P(f.pts[(e + 1) % f.pts.length]).split(',')[0]}" y2="${P(f.pts[(e + 1) % f.pts.length]).split(',')[1]}" stroke="${C.edge}" stroke-width="0.35" stroke-linecap="round"/>`;
    }
    for (const seg of lines) if (seg) {
      s += `<line x1="${(seg[0][0] * 1000).toFixed(1)}" y1="${(-seg[0][1] * 1000).toFixed(1)}" x2="${(seg[1][0] * 1000).toFixed(1)}" y2="${(-seg[1][1] * 1000).toFixed(1)}" stroke="${C.crease}" stroke-width="1" stroke-dasharray="3.5 2"/>`;
    }
    if (dot) s += `<circle cx="${(dot[0] * 1000).toFixed(1)}" cy="${(-dot[1] * 1000).toFixed(1)}" r="3" fill="${C.grip}"/>`;
    return s + '</svg>';
  };
  instructions.forEach((st, i) => {
    const a = st.anim || {};
    let svg = null;
    if (a.kind === 'A') {
      const k = Math.max(0, a.step - 1), fs = stateAt(k);
      let lines;
      if (a.step === 0) lines = [[[0, 0], [0, geom.design.sheet.L]]];
      // A some-layers fold (movedOnly) creases just the flap that turns, not the paper under it.
      // That flap only touches the line along its edge, so clip a line nudged 1 µm into it.
      else lines = geom.steps[a.step].axes.map((ax) => {
        if (!ax.movedOnly) return clip(fs.filter((f) => !ax.half || f.half === ax.half), { p: ax.p, d: ax.d });
        const p = [ax.p[0] - ax.d[1] * 1e-6, ax.p[1] + ax.d[0] * 1e-6];
        return clip(fs.filter((f) => geom.facets[f.i].hist[a.step].moved), { p, d: ax.d });
      });
      svg = draw(fs, lines);
    } else {
      const fs = stateAt(H, /throw/i.test(st.title)), pb = geom.phaseB;
      const wingFs = fs.filter((f) => f.region !== 'keel');
      let lines = [], dot = null;
      if (/wings down/i.test(st.title)) {
        const dx = pb.hinge.b[0] - pb.hinge.a[0], dy = pb.hinge.b[1] - pb.hinge.a[1], n = Math.hypot(dx, dy);
        lines = [clip(fs, { p: pb.hinge.a, d: [dx / n, dy / n] })];
      } else if (/winglet/i.test(st.title) && pb.wingletX !== null) lines = [clip(wingFs, { p: [pb.wingletX, 0], d: [0, 1] })];
      else if (/elevator|trailing/i.test(st.title) && pb.elevY !== null) lines = [clip(wingFs, { p: [0, pb.elevY], d: [1, 0] })];
      else if (/throw/i.test(st.title) && opts.cgX !== undefined) dot = [0.006, opts.cgX];
      else if (!/set the wings/i.test(st.title)) return;
      if (/set the wings/i.test(st.title)) return;
      svg = draw(fs, lines, dot);
    }
    out.push({ num: i + 1, title: st.title, svg });
  });
  return out;
}

// One printable sheet with every step diagram at true scale.
export function diagramSheet(diagrams, title) {
  const cols = 2, cellW = 310, cellH = 330;
  const rows = Math.ceil(diagrams.length / cols);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cellW}mm" height="${rows * cellH + 20}mm" viewBox="0 0 ${cols * cellW} ${rows * cellH + 20}" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">`;
  s += `<text x="6" y="12" font-size="8" font-weight="600">${title} · step diagrams at true scale · print at 100%</text>`;
  diagrams.forEach((d, i) => {
    const x = (i % cols) * cellW, y = 20 + Math.floor(i / cols) * cellH;
    s += `<text x="${x + 6}" y="${y + 10}" font-size="7">${d.num}. ${d.title}</text>`;
    const inner = d.svg.replace(/<svg ([^>]*)width="([\d.]+)mm" height="([\d.]+)mm">/, (_, attrs, w, h) => `<svg ${attrs}x="${x + 6}" y="${y + 16}" width="${w}" height="${h}">`);
    s += inner;
  });
  return s + '</svg>';
}

// Edges that are physically visible at a given state: piece outlines and creases already made.
// Facets that share transform + layer (+ region when byRegion) form one unbroken piece of paper,
// so edges between them are not creases yet and are hidden.
export function visibleEdges(geom, k, byRegion = false) {
  const F = geom.facets;
  const key = (f) => { const h = f.hist[k], T = h.T; return [h.layer, T.a, T.b, T.c, T.d, T.tx, T.ty].map((v) => v.toFixed(7)).join('|') + (byRegion ? f.region : ''); };
  const groups = new Map();
  F.forEach((f, i) => { const kk = key(f); if (!groups.has(kk)) groups.set(kk, []); groups.get(kk).push(i); });
  const inside = (P, q) => {
    let sgn = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      if (Math.abs(c) < 1e-12) continue;
      if (sgn === 0) sgn = Math.sign(c); else if (Math.sign(c) !== sgn) return false;
    }
    return true;
  };
  const out = [];
  for (const idx of groups.values()) {
    for (const i of idx) {
      const P = F[i].poly; // original coords: same rigid map for the whole group, so test there
      for (let e = 0; e < P.length; e++) {
        const a = P[e], b = P[(e + 1) % P.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], o = 2e-5;
        const q1 = [m[0] - (dy / n) * o, m[1] + (dx / n) * o], q2 = [m[0] + (dy / n) * o, m[1] - (dx / n) * o];
        const in1 = idx.some((j) => inside(F[j].poly, q1)), in2 = idx.some((j) => inside(F[j].poly, q2));
        if (!(in1 && in2)) out.push([i, e]);
      }
    }
  }
  return out;
}
