// Bestfold viewer: hero, flight lab, wind tunnel, evolution explorer, folding tutorial and the
// "Fly together" volunteer search. Framework-free; mounted by the Next.js page (app/Viewer.jsx)
// or by the single-file artifact build (scripts/build-artifact.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MISSIONS, LEGACY_GENOME_SIZE, GENOME_SIZE, decode, completeDesign, CLASSICS, normalizeGenome } from '../src/design.js';
import { NOMINAL, SCENARIOS, evaluate } from '../src/evaluate.js';
import { simulate } from '../src/flight.js';
import { foldPlane, facets3D, chordAlong } from '../src/fold.js';
import { dot, rotateAbout, apply2, qinvrot } from '../src/geom.js';
import { buildInstructions, throwAdvice } from '../src/instructions.js';
import { RHO, NU, buildAircraft, aero, inducedVelocity } from '../src/physics.js';
import { sketchKey, fromGenome } from '../src/sketch.js';
import { stepDiagrams, diagramSheet, visibleEdges } from '../src/template.js';
import { designName } from './names.js';
import { ENGINE_VERSION } from '../src/version.js';

// data: results (see lib/results.js); community: viewer/community.js backend;
// createWorker(): a Web Worker running viewer/island-worker.js.
export function mountBestfold({ data, community, createWorker }) {
const DATA = data;
const DEG = Math.PI / 180;
const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (x, d = 1) => (isFinite(x) ? x.toFixed(d) : '–');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- coordinate frames ----------------
// Engine "base/body" frame: X forward, Y left, Z up.  three.js: Y up.
const Q_FLIGHT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // (X,Y,Z)->(X,Z,-Y)
const Q_SHEET = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)),
); // (X,Y,Z)->(Z,X,Y): sheet seen flat, nose up
const simToThree = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const simQuat = (q) => new THREE.Quaternion(q[1], q[3], -q[2], q[0]);

// ---------------- theme ----------------
let THEME = {};
function readTheme() {
  THEME = {
    ink: new THREE.Color(css('--ink')), ink3: new THREE.Color(css('--ink-3')), rule: new THREE.Color(css('--rule')),
    sheet: new THREE.Color(css('--sheet')), back: new THREE.Color(css('--sheet-back')),
    valley: new THREE.Color(css('--valley')), mountain: new THREE.Color(css('--mountain')), stage: new THREE.Color(css('--stage')),
  };
}
readTheme();
const themeListeners = [];
const mo = new MutationObserver(() => { readTheme(); themeListeners.forEach((f) => f()); });
mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); themeListeners.forEach((f) => f()); });

// ---------------- stages (renderers) ----------------
const stages = [];
// A stage's WebGL renderer is created the first time its view is on screen, so a page never holds
// more GPU contexts than the views someone has opened (phones allow only a few).
function makeStage(el, { fov = 35, controls = true } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const st = { el, renderer: null, scene, camera, visible: false, tick: null };
  if (controls) {
    st.controls = new OrbitControls(camera);
    st.controls.enableDamping = true;
    st.controls.enablePan = false;
  }
  const resize = () => {
    if (!st.renderer) return;
    const w = el.clientWidth, h = el.clientHeight || w * 0.75;
    if (!w || !h) return;
    st.renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ensure = () => {
    if (st.renderer) return;
    st.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    st.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.prepend(st.renderer.domElement);
    if (st.controls) st.controls.connect(st.renderer.domElement);
    resize();
  };
  new ResizeObserver(resize).observe(el);
  new IntersectionObserver((e) => { st.visible = e[0].isIntersecting; if (st.visible) ensure(); }).observe(el);
  stages.push(st);
  return st;
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const s of stages) {
    if (!s.visible || !s.renderer) continue;
    if (s.tick) s.tick(dt);
    if (s.controls) s.controls.update();
    s.renderer.render(s.scene, s.camera);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------- paper model ----------------
const DZ = 0.0005; // visual layer spacing (m)
class Paper {
  constructor(geom) {
    this.geom = geom;
    let nv = 0;
    const idx = [];
    this.start = [];
    for (const f of geom.facets) {
      const n = f.poly.length;
      this.start.push(nv);
      for (let i = 1; i + 1 < n; i++) idx.push(nv, nv + i, nv + i + 1);
      nv += n;
    }
    this.pos = new Float32Array(nv * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.geo = g;
    const po = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, roughness: 0.92, metalness: 0 };
    this.front = new THREE.MeshStandardMaterial({ color: THEME.sheet, side: THREE.FrontSide, ...po });
    this.backM = new THREE.MeshStandardMaterial({ color: THEME.back, side: THREE.BackSide, ...po });
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', g.getAttribute('position'));
    this.eg = eg;
    this.edgeKey = null;
    this.setEdges(geom.facets[0].hist.length - 1, true);
    this.lineM = new THREE.LineBasicMaterial({ color: THEME.ink3, transparent: true, opacity: 0.55 });
    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(g, this.front), new THREE.Mesh(g, this.backM), new THREE.LineSegments(eg, this.lineM));
    this.layerZ = computeLayerZ(geom);
    themeListeners.push(() => this.recolor());
  }
  // Show only edges that exist physically at hist state k (outlines + creases already made)
  setEdges(k, byRegion = false) {
    const key = k + ':' + byRegion;
    if (key === this.edgeKey) return;
    this.edgeKey = key;
    const idx = [];
    for (const [i, e] of visibleEdges(this.geom, k, byRegion)) {
      const n = this.geom.facets[i].poly.length, s0 = this.start[i];
      idx.push(s0 + e, s0 + ((e + 1) % n));
    }
    this.eg.setIndex(idx);
  }
  recolor(tint) {
    this.front.color.copy(tint || THEME.sheet);
    this.backM.color.copy(THEME.back);
    this.lineM.color.copy(THEME.ink3);
  }
  set(points) { // points: array per facet of [X,Y,Z] (engine base frame)
    let k = 0;
    for (const P of points) for (const p of P) { this.pos[k++] = p[0]; this.pos[k++] = p[1]; this.pos[k++] = p[2]; }
    const a = this.geo.getAttribute('position');
    a.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  dispose() { this.geo.dispose(); }
}
function computeLayerZ(geom) {
  const H = geom.facets[0].hist.length, out = [];
  for (let k = 0; k < H; k++) {
    const ls = [...new Set(geom.facets.map((f) => f.hist[k].layer))].sort((a, b) => a - b);
    out.push(new Map(ls.map((l, i) => [l, (i - (ls.length - 1) / 2) * DZ])));
  }
  return out;
}
// flat (x,y,z) -> base frame (X=y, Y=z, Z=x)
const flatToBase = (x, y, z) => [y, z, x];

// Phase A: state during step j (transition hist[j-1] -> hist[j]) at progress t
function pointsA(paper, j, t) {
  const g = paper.geom, LZ = paper.layerZ;
  const step = g.steps[j];
  return g.facets.map((f) => {
    if (j === 0) return f.poly.map((q) => { const p = apply2(f.hist[0].T, q); return flatToBase(p[0], p[1], LZ[0].get(f.hist[0].layer)); });
    const h0 = f.hist[j - 1], h1 = f.hist[j];
    if (t >= 1 || !h1.moved) {
      const h = t >= 1 ? h1 : h0, z = LZ[t >= 1 ? j : j - 1].get(h.layer);
      return f.poly.map((q) => { const p = apply2(h.T, q); return flatToBase(p[0], p[1], z); });
    }
    const ax = step.axes.find((a) => !a.half || a.half === f.half);
    const z = LZ[j - 1].get(h0.layer);
    return f.poly.map((q) => {
      const p = apply2(h0.T, q);
      const r = rotateAbout([p[0], p[1], z], [ax.p[0], ax.p[1], 0], [ax.d[0], ax.d[1], 0], ax.angle * ease(t));
      return flatToBase(r[0], r[1], r[2]);
    });
  });
}
// Phase B: wings etc. via the engine's 3D map, with an animation state
function pointsB(paper, anim) {
  const g = paper.geom, LZ = paper.layerZ[paper.layerZ.length - 1];
  return g.facets.map((f) => {
    const T = f.hist[f.hist.length - 1].T, s = f.half === 'L' ? 1 : -1, z = LZ.get(f.layer);
    return f.poly.map((q) => g.map3D(apply2(T, q), f.half, f.region, anim, s * z));
  });
}
const FINAL = { wingOpen: 1, winglet: 1, elev: 1 };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Final flying shape in body coordinates (relative to the CG)
function flightPoints(paper, cg) {
  return pointsB(paper, FINAL).map((P) => P.map((p) => [p[0] - cg[0], p[1] - cg[1], p[2] - cg[2]]));
}

// ---------------- evaluation cache ----------------
const cache = new Map();
function getMission(key) {
  if (cache.has(key)) return cache.get(key);
  const R = DATA.missions[key];
  if (!R) return null;
  const M = MISSIONS[key];
  const champ = evaluate(R.best.design, M, { record: true, recordEvery: 1 / 30, force: true });
  const design = champ.design; // with the solved elevator angle and launch pitch
  const dart = evaluate(completeDesign({ ...CLASSICS.dart.design, trimCL: R.dartTrimCL ?? 0.12 }, M), M, { record: true, recordEvery: 1 / 30, force: true });
  const dartDesign = dart.design;
  const instr = buildInstructions(champ.geom);
  const advice = throwAdvice(design, champ.ac);
  instr.push({ anim: { kind: 'C' }, title: 'Throw it', text: advice.text });
  const m = { key, R, M, design, champ, dart, dartDesign, instr, advice, polar: polar(champ.ac), dartPolar: polar(dart.ac) };
  cache.set(key, m);
  return m;
}
function polar(ac) {
  const V = 6, q = 0.5 * RHO * V * V * ac.Sref, rows = [];
  for (let a = -2; a <= 24; a += 1) {
    const u = [V * Math.cos(a * DEG), 0, -V * Math.sin(a * DEG)];
    const { F } = aero(ac, u, [0, 0, 0]);
    const D = -(F[0] * u[0] + F[2] * u[2]) / V, L = (F[2] * u[0] - F[0] * u[2]) / V;
    rows.push({ a, CL: L / q, CD: D / q, LD: L / D });
  }
  return rows;
}
const metricFor = (m, r) => (m.key === 'distance' ? r.distance : r.time);
const unitOf = (m) => (m.key === 'distance' ? 'm' : 's');

// ---------------- hero ----------------
const hero = makeStage($('#hero-stage'));
let heroPaper = null;
function renderHero(m) {
  $('#hero-loading').hidden = true;
  const d = m.design, c = m.champ, u = unitOf(m);
  const name = m.key === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1';
  const what = m.key === 'distance' ? 'distance' : 'time aloft';
  $('#hero-title').textContent = name;
  $('#hero-lede').textContent = `Every design is folded by hand from one sheet of A4 and tested in simulation, and anyone can help the search from their browser. This is the current best for ${what}.`;
  $('#hero-num').innerHTML = `${fmt(c.robust)}<small>${u === 'm' ? 'm' : 's'}</small>`;
  $('#hero-what').textContent = `Average of its worst 8 out of 16 imperfect throws in simulation. A clean throw gives ${fmt(c.nominal.metric)} ${u}.`;
  $('#hero-compare').innerHTML = `Classic dart, same test <b>${fmt(m.dart.robust)} ${u}</b>`;
  const maxLD = Math.max(...m.polar.map((r) => r.LD));
  const rows = [
    ['Wingspan', `${fmt(c.span * 100)} cm`], ['Wing area', `${fmt(c.Sref * 1e4, 0)} cm²`],
    ['Mass', `${fmt(c.mass * 1000, 2)} g`], ['Glide ratio', fmt(maxLD)],
    ['Folding steps', String(m.instr.length - 1)], ['Sheet', d.landscape ? 'A4 landscape' : 'A4 portrait'],
  ];
  $('#hero-figs').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#hero-more').textContent = `See all ${(m.R.archive || []).length} designs`;
  if (heroPaper) hero.scene.remove(heroPaper.group);
  heroPaper = new Paper(c.geom);
  heroPaper.set(flightPoints(heroPaper, c.ac.cg));
  heroPaper.group.quaternion.copy(Q_FLIGHT);
  const g = new THREE.Group();
  g.add(heroPaper.group);
  heroPaper.root = g;
  hero.scene.add(g);
  hero.camera.position.set(-0.25, 0.15, 0.28);
  hero.controls.target.set(0, 0, 0);
  hero.tick = (dt) => { if (!reduceMotion) g.rotation.y += dt * 0.25; };
  if (hero.root) hero.scene.remove(hero.root);
  hero.root = g;
}

// ---------------- aerodynamics overlay ----------------
// Draws what the vortex-lattice model computes at the current instant: per-strip force
// arrows (blue attached, orange stalled), panel loading heat map, total force vs weight,
// and wingtip vortex trails.
const K_STRIP = 9; // metres of arrow (body scale) per newton, per strip
const K_TOTAL = 1.1; // for the total-force and weight arrows
const HEAT = [new THREE.Color('#f2f4f1'), new THREE.Color('#ffd58a'), new THREE.Color('#e8592b')];
class AeroViz {
  constructor(ac, parentGroup) {
    this.ac = ac;
    this.group = new THREE.Group();
    parentGroup.add(this.group);
    // lattice heat map
    const P = ac.panels, pos = new Float32Array(P.length * 6 * 3), col = new Float32Array(P.length * 6 * 3);
    P.forEach((p, i) => {
      const off = p.n.map((x) => x * 0.0012);
      const c = p.corners.map((v) => [v[0] + off[0], v[1] + off[1], v[2] + off[2]]);
      const tri = [c[0], c[1], c[2], c[0], c[2], c[3]];
      tri.forEach((v, k) => pos.set(v, (i * 6 + k) * 3));
    });
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    hg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.heat = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    this.heat.renderOrder = 2;
    this.group.add(this.heat);
    this.heatCol = col;
    // strip arrows
    const n = ac.strips.length;
    this.sPos = new Float32Array(n * 2 * 3);
    this.sCol = new Float32Array(n * 2 * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3));
    this.strips = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.strips.renderOrder = 5;
    this.group.add(this.strips);
    // total force & weight arrows (at CG = body origin)
    this.total = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.05, THEME.valley, 0.012, 0.008);
    this.weight = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.05, THEME.ink3, 0.012, 0.008);
    for (const a of [this.total, this.weight]) { a.line.material.depthTest = false; a.cone.material.depthTest = false; a.renderOrder = 6; this.group.add(a); }
    // wingtip points (outermost wing strip trailing edges)
    const tipOf = (half) => ac.strips.filter((st) => st.kind === 'wing' && st.half === half).reduce((b, st) => (!b || Math.abs(st.TE[1]) > Math.abs(b.TE[1]) ? st : b), null);
    this.tips = ['L', 'R'].map((h) => tipOf(h)).filter(Boolean).map((st) => new THREE.Vector3(...st.TE));
    this.loadRef = 1e-9;
  }
  update(row) {
    const ac = this.ac, out = [];
    const v = [row[9], row[10], row[11]], w = [row[12], row[13], row[14]];
    const res = aero(ac, v, w, out);
    // strips
    const vc = THEME.valley, mc = THEME.mountain, tmp = new THREE.Color();
    out.forEach((o, k) => {
      const Q = o.Q, F = o.F;
      this.sPos.set([Q[0], Q[1], Q[2], Q[0] + F[0] * K_STRIP, Q[1] + F[1] * K_STRIP, Q[2] + F[2] * K_STRIP], k * 6);
      tmp.copy(vc).lerp(mc, Math.min(1, o.wS * 1.4));
      this.sCol.set([tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b], k * 6);
    });
    this.strips.geometry.attributes.position.needsUpdate = true;
    this.strips.geometry.attributes.color.needsUpdate = true;
    // heat map: loading per unit area, normalised by a slowly decaying reference
    const P = ac.panels, g = out.gamma;
    let mx = 0;
    const load = P.map((p, i) => { const l = Math.abs(g[i]) * Math.hypot(ac.LV[i * 3], ac.LV[i * 3 + 1], ac.LV[i * 3 + 2]) / p.area; mx = Math.max(mx, l); return l; });
    this.loadRef = Math.max(mx, this.loadRef * 0.995);
    load.forEach((l, i) => {
      const t = Math.min(1, l / this.loadRef);
      const c = t < 0.5 ? tmp.copy(HEAT[0]).lerp(HEAT[1], t * 2) : tmp.copy(HEAT[1]).lerp(HEAT[2], (t - 0.5) * 2);
      for (let k = 0; k < 6; k++) this.heatCol.set([c.r, c.g, c.b], (i * 6 + k) * 3);
    });
    this.heat.geometry.attributes.color.needsUpdate = true;
    // total force and weight (both body axes)
    const F = res.F, Fm = Math.hypot(...F);
    this.total.setDirection(new THREE.Vector3(...F).normalize());
    this.total.setLength(Math.max(0.004, Fm * K_TOTAL), 0.012, 0.008);
    const q = [row[4], row[5], row[6], row[7]];
    const Wb = qinvrot(q, [0, 0, -ac.mass * 9.81]);
    this.weight.setDirection(new THREE.Vector3(...Wb).normalize());
    this.weight.setLength(ac.mass * 9.81 * K_TOTAL, 0.012, 0.008);
    this.total.setColor(THEME.valley);
    this.weight.setColor(THEME.ink3);
    const alpha = Math.atan2(-v[2], v[0]) / DEG;
    return { alpha, speed: Math.hypot(...v), lw: Fm / (ac.mass * 9.81), stall: res.stall };
  }
  set visible(b) { this.group.visible = b; }
}

// ---------------- flight lab ----------------
const lab = makeStage($('#lab-stage'), { fov: 40 });
const labState = { view: 'side', t: 0, playing: false, runs: [] };
const SCALE = 5;
function buildLabScene() {
  const s = lab.scene;
  for (const o of [...s.children]) if (o.userData.lab) s.remove(o);
  const grid = new THREE.GridHelper(80, 80, THEME.rule, THEME.rule);
  grid.position.set(35, 0, 0);
  grid.userData.lab = true;
  s.add(grid);
  for (let x = 5; x <= 70; x += 5) {
    const spr = textSprite(`${x} m`);
    spr.position.set(x, 0.02, 2.6);
    spr.userData.lab = true;
    s.add(spr);
  }
  const start = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 3), new THREE.MeshBasicMaterial({ color: THEME.ink }));
  start.userData.lab = true;
  s.add(start);
}
function textSprite(txt) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 48;
  const x = c.getContext('2d');
  x.font = '500 26px IBM Plex Mono, monospace';
  x.fillStyle = '#' + THEME.ink3.getHexString();
  x.textAlign = 'center';
  x.fillText(txt, 64, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(1.6, 0.6, 1);
  return sp;
}
themeListeners.push(() => { buildLabScene(); labState.runs.forEach((r) => r.trailM.color.copy(r.color())); });
function makeRun(geom, ac, colorFn) {
  const paper = new Paper(geom);
  paper.set(flightPoints(paper, ac.cg));
  paper.group.quaternion.copy(Q_FLIGHT);
  const root = new THREE.Group();
  root.add(paper.group);
  root.scale.setScalar(SCALE);
  paper.recolor(new THREE.Color().copy(THEME.sheet).lerp(colorFn(), 0.35));
  lab.scene.add(root);
  const trailG = new THREE.BufferGeometry();
  const trailM = new THREE.LineBasicMaterial({ color: colorFn() });
  const trail = new THREE.Line(trailG, trailM);
  lab.scene.add(trail);
  const viz = new AeroViz(ac, paper.group);
  // wingtip vortex trails (world space, last ~1.5 s)
  const tipTrails = viz.tips.map(() => {
    const n = 120, buf = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    g.setDrawRange(0, 0);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colorFn(), transparent: true, opacity: 0.55 }));
    lab.scene.add(line);
    return { line, buf, n, count: 0 };
  });
  return { paper, root, trail, trailG, trailM, color: colorFn, traj: null, res: null, viz, tipTrails };
}
let labMission = null;
function setupLab(m) {
  labMission = m;
  for (const r of labState.runs) { lab.scene.remove(r.root); lab.scene.remove(r.trail); r.tipTrails.forEach((t) => lab.scene.remove(t.line)); }
  buildLabScene();
  labState.runs = [
    { ...makeRun(m.champ.geom, m.champ.ac, () => THEME.valley), name: m.simName || (m.key === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1'), dot: 'v', which: 'champ' },
    { ...makeRun(m.dart.geom, m.dart.ac, () => THEME.mountain), name: 'Classic dart', dot: 'm', which: 'dart' },
  ];
  const sel = $('#lab-scn');
  sel.innerHTML = [NOMINAL, ...SCENARIOS].map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
  $('#lab-speed').value = m.design.launch.speed;
  $('#lab-pitch').value = Math.round(m.design.launch.pitch / DEG);
  updateLabLabels();
  renderScenarioTable(m);
  throwLab();
}
function updateLabLabels() {
  $('#lab-speed-v').textContent = `${(+$('#lab-speed').value).toFixed(1)} m/s`;
  $('#lab-pitch-v').textContent = `${$('#lab-pitch').value}°`;
}
function aircraftFor(ev, sc) {
  const ac = (ev.acs && ev.acs[sc.geo]) || ev.ac;
  const set = (a, cd, cl) => { a.cdMul = cd; a.clmaxMul = cl; if (a.flex) { a.flex.twin.cdMul = cd; a.flex.twin.clmaxMul = cl; } };
  set(ac, sc.cdMul || 1, sc.clmaxMul || 1);
  return { ac, done: () => set(ac, 1, 1) };
}
function throwLab() {
  const m = labMission;
  if (!m) return;
  const sc = [NOMINAL, ...SCENARIOS][+$('#lab-scn').value || 0];
  const speed = +$('#lab-speed').value, pitch = +$('#lab-pitch').value * DEG;
  for (const r of labState.runs) {
    const ev = r.which === 'champ' ? m.champ : m.dart;
    const d = r.which === 'champ' ? m.design : m.dartDesign;
    const launch = { ...d.launch, speed, pitch };
    const A = aircraftFor(ev, sc);
    const res = simulate(A.ac, launch, sc, { maxTime: m.M.maxTime, ceiling: m.M.ceiling, record: true, recordEvery: 1 / 60, dt: 0.004 });
    A.done();
    r.res = res;
    r.traj = res.traj;
    const pts = new Float32Array(res.traj.length * 3);
    res.traj.forEach((p, i) => { const v = simToThree([p[1], p[2], p[3]]); pts.set([v.x, v.y, v.z], i * 3); });
    r.trailG.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    r.trailG.setDrawRange(0, 0);
    r.tipTrails.forEach((t) => { t.count = 0; t.line.geometry.setDrawRange(0, 0); });
    r.lastI = -1;
  }
  labState.t = 0;
  labState.playing = true;
}
function sampleTraj(traj, t) {
  const dt = traj.length > 1 ? traj[1][0] - traj[0][0] : 1;
  const i = Math.min(traj.length - 1, Math.floor(t / dt));
  return { i, p: traj[i] };
}
lab.controls.enabled = true;
lab.tick = (dt) => {
  if (!labMission) return;
  if (labState.playing) labState.t += dt * (+$('#lab-rate').value || 1);
  const showAero = $('#lab-aero').checked;
  let hud = null;
  let lead = null, maxT = 0;
  const rows = [];
  for (const r of labState.runs) {
    if (!r.traj) continue;
    const { i, p } = sampleTraj(r.traj, labState.t);
    r.root.position.copy(simToThree([p[1], p[2], p[3]]));
    r.root.quaternion.copy(simQuat([p[4], p[5], p[6], p[7]]));
    r.trailG.setDrawRange(0, i + 1);
    r.viz.visible = showAero;
    r.tipTrails.forEach((t) => (t.line.visible = showAero));
    if (showAero && p.length > 12) {
      const h = r.viz.update(p);
      if (r.which === 'champ') hud = { ...h, height: p[3], name: r.name };
      if (i !== r.lastI) {
        r.root.updateMatrixWorld(true);
        r.viz.tips.forEach((tip, k) => {
          const t = r.tipTrails[k], wv = tip.clone().applyMatrix4(r.paper.group.matrixWorld);
          if (t.count < t.n) t.count++; else t.buf.copyWithin(0, 3);
          t.buf.set([wv.x, wv.y, wv.z], (t.count - 1) * 3);
          t.line.geometry.attributes.position.needsUpdate = true;
          t.line.geometry.setDrawRange(0, t.count);
        });
        r.lastI = i;
      }
    }
    maxT = Math.max(maxT, r.traj[r.traj.length - 1][0]);
    if (!lead || p[1] > lead.p[1]) lead = { p, r };
    const done = i >= r.traj.length - 1;
    rows.push(`<div class="ro-row"><span class="dot ${r.dot}"></span><span>${r.name}</span><b>${fmt(Math.hypot(p[1], p[2]))} m</b><b>${fmt(p[0])} s${done ? (r.res.end === 'landed' ? '' : ' ·' + r.res.end) : ''}</b></div>`);
  }
  $('#lab-readout').innerHTML = rows.join('');
  $('#aero-key').hidden = !showAero;
  $('#lab-hud').innerHTML = hud
    ? `<span>${hud.name}</span><b></b><span>airspeed</span><b>${fmt(hud.speed)} m/s</b><span>angle of attack</span><b>${fmt(hud.alpha)}°</b><span>height</span><b>${fmt(hud.height, 2)} m</b><span>aero force ÷ weight</span><b>${fmt(hud.lw, 2)}</b><span>stalled area</span><b>${fmt(hud.stall * 100, 0)}%</b><span class="bar"><i style="width:${Math.min(100, hud.lw * 50)}%"></i><s></s></span>`
    : '';
  if (labState.t > maxT + 1.5) labState.playing = false;
  if (!lead) return;
  const target = simToThree([lead.p[1], lead.p[2], lead.p[3]]);
  const cam = lab.camera, ctr = lab.controls;
  let want;
  if (labState.view === 'side') want = new THREE.Vector3(target.x + 1, 2.2, 13);
  else if (labState.view === 'top') want = new THREE.Vector3(target.x, 18, 0.01);
  else {
    const vq = simQuat([lead.p[4], lead.p[5], lead.p[6], lead.p[7]]);
    const back = new THREE.Vector3(-2.4, 0.9, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), new THREE.Euler().setFromQuaternion(vq, 'YXZ').y));
    want = target.clone().add(back);
  }
  if (!labState.dragging) cam.position.lerp(want, Math.min(1, dt * 3));
  ctr.target.lerp(target, Math.min(1, dt * 4));
};
lab.controls.addEventListener('start', () => (labState.dragging = true));
lab.controls.addEventListener('end', () => setTimeout(() => (labState.dragging = false), 1500));
$('#lab-throw').addEventListener('click', throwLab);
$('#lab-scn').addEventListener('change', throwLab);
for (const id of ['#lab-speed', '#lab-pitch']) {
  $(id).addEventListener('input', updateLabLabels);
  $(id).addEventListener('change', throwLab);
}
document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => {
  labState.view = b.dataset.view;
  document.querySelectorAll('.views button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
function renderScenarioTable(m) {
  const u = unitOf(m), name = m.simName || (m.key === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1');
  const cell = (r) => `${fmt(r.metric)} ${u}${r.end === 'tumbling' ? ' · tumbled' : ''}`;
  const rows = [`<tr><td>${NOMINAL.name}</td><td class="n">${cell(m.champ.nominal)}</td><td class="n">${cell(m.dart.nominal)}</td></tr>`,
    ...SCENARIOS.map((s, i) => `<tr><td>${s.name}</td><td class="n">${m.champ.results[i] ? cell(m.champ.results[i]) : '–'}</td><td class="n">${m.dart.results[i] ? cell(m.dart.results[i]) : '–'}</td></tr>`)].join('');
  $('#scn-table').innerHTML = `<thead><tr><th>Throw</th><th class="n">${name}</th><th class="n">Classic dart</th></tr></thead><tbody>${rows}<tr><td><b>Robust score: average of the worst 8</b></td><td class="n"><b>${fmt(m.champ.robust)} ${u}</b></td><td class="n"><b>${fmt(m.dart.robust)} ${u}</b></td></tr></tbody>`;
}

// ---------------- wind tunnel ----------------
// The plane is held still at a chosen angle of attack and sideslip while smoke particles are
// advected through the flow field of the vortex lattice: free stream + Biot–Savart velocity of
// every horseshoe vortex (circulations from the same aero() call that computes the forces).
// Over stalled strips the attached-flow circulation is faded out and particles get turbulent jitter.
const tunnel = makeStage($('#tunnel-stage'), { fov: 32 });
const TN = { m: null, which: 'champ', paper: null, viz: null, ac: null, root: null, P: [], out: null, gammaViz: null, frame: 0 };
const NPART = matchMedia('(max-width: 600px)').matches ? 300 : 520, TRAIL = 22;
const tPos = new Float32Array(NPART * (TRAIL - 1) * 2 * 3), tCol = new Float32Array(NPART * (TRAIL - 1) * 2 * 3);
const tGeo = new THREE.BufferGeometry();
tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
const smoke = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
tunnel.scene.add(smoke);
const SLOW = new THREE.Color('#4f7fd8'), FAST = new THREE.Color('#f2a03d'), MID = new THREE.Color('#8b929b');
const BOX = { x0: 0.22, x1: -0.6, y: [-0.07, 0.09], z: [-0.13, 0.13] };
function spawn(p, anywhere) {
  let x = anywhere ? BOX.x1 + Math.random() * (BOX.x0 - BOX.x1) : BOX.x0;
  let y = BOX.y[0] + Math.random() * (BOX.y[1] - BOX.y[0]), z = BOX.z[0] + Math.random() * (BOX.z[1] - BOX.z[0]);
  // seed some particles right at the wing tips so the tip vortices show up as corkscrews
  if (TN.tipsW && Math.random() < 0.22) {
    const t = TN.tipsW[Math.floor(Math.random() * TN.tipsW.length)], r = 0.004 + Math.random() * 0.012, a = Math.random() * 2 * Math.PI;
    x = t.x + 0.03; y = t.y + r * Math.cos(a); z = t.z + r * Math.sin(a);
  }
  p.h = Array.from({ length: TRAIL }, () => new THREE.Vector3(x, y, z));
  p.sp = 1;
}
for (let i = 0; i < NPART; i++) { const p = {}; spawn(p, true); TN.P.push(p); }

function setupTunnel(m) {
  TN.m = m;
  $('#tp-champ').textContent = m.simName || 'Bestfold';
  if (TN.root) tunnel.scene.remove(TN.root);
  const ev = TN.which === 'champ' ? m.champ : m.dart;
  TN.ac = ev.ac;
  TN.paper = new Paper(ev.geom);
  TN.paper.set(flightPoints(TN.paper, ev.ac.cg));
  TN.paper.group.quaternion.copy(Q_FLIGHT);
  TN.viz = new AeroViz(ev.ac, TN.paper.group);
  TN.viz.weight.visible = false;
  TN.root = new THREE.Group();
  TN.root.add(TN.paper.group);
  tunnel.scene.add(TN.root);
  if (!TN.placed) { tunnel.camera.position.set(-0.05, 0.12, 0.62); tunnel.controls.target.set(-0.08, 0, 0); TN.placed = true; }
  document.querySelectorAll('[data-tplane]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tplane === TN.which)));
  updateTunnel();
}
function updateTunnel() {
  if (!TN.ac) return;
  const a = +$('#t-alpha').value * DEG, b = +$('#t-beta').value * DEG, V = +$('#t-speed').value;
  $('#t-alpha-v').textContent = `${(+$('#t-alpha').value).toFixed(1)}°`;
  $('#t-speed-v').textContent = `${V.toFixed(1)} m/s`;
  $('#t-beta-v').textContent = `${$('#t-beta').value}°`;
  // attitude in three.js world: pitch nose up about +z, yaw about +y (flow comes from +x)
  const att = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b, a, 'YZX'));
  TN.root.quaternion.copy(att);
  TN.Q = att.clone().multiply(Q_FLIGHT); // body (engine axes) -> three world
  TN.Qi = TN.Q.clone().invert();
  TN.tipsW = TN.viz.tips.map((t) => t.clone().applyQuaternion(TN.Q));
  TN.V = V;
  // body-frame velocity of the plane relative to still air = -(air velocity in body axes)
  const air = new THREE.Vector3(-V, 0, 0).applyQuaternion(TN.Qi);
  TN.u = [-air.x, -air.y, -air.z];
  const out = [];
  const res = aero(TN.ac, TN.u, [0, 0, 0], out);
  TN.out = out;
  // circulation for the flow picture: attached-flow part only (stalled strips shed it)
  const g = Float64Array.from(out.gamma);
  out.forEach((o, k) => { for (const i of TN.ac.strips[k].panels) g[i] *= 1 - o.wS; });
  TN.gammaViz = g;
  const q = 0.5 * RHO * V * V * TN.ac.Sref, cbar = TN.ac.Sref / TN.ac.span;
  const uu = TN.u, F = res.F;
  const D = -(F[0] * uu[0] + F[1] * uu[1] + F[2] * uu[2]) / V, L = (F[2] * uu[0] - F[0] * uu[2]) / Math.hypot(uu[0], uu[2]);
  const rows = [['Lift coefficient', fmt(L / q, 2)], ['Drag coefficient', fmt(D / q, 3)], ['Lift ÷ drag', fmt(L / D, 1)],
    ['Pitching moment', `${fmt(-res.M[1] / (q * cbar), 3)} ${-res.M[1] > 0 ? '(nose up)' : '(nose down)'}`], ['Stalled area', `${fmt(res.stall * 100, 0)}%`],
    ['Lift', `${fmt((L / (TN.ac.mass * 9.81)) * 100, 0)}% of weight`]];
  $('#tunnel-readout').innerHTML = rows.map(([k, v]) => `<div class="ro-row"><span></span><span>${k}</span><b></b><b>${v}</b></div>`).join('');
  $('#tunnel-hud').innerHTML = `<span>Reynolds number</span><b>${Math.round((V * cbar) / NU).toLocaleString()}</b><span>dynamic pressure</span><b>${fmt(0.5 * RHO * V * V, 1)} Pa</b>`;
  const row = [0, 0, 0, 0, 1, 0, 0, 0, V, ...TN.u, 0, 0, 0];
  TN.viz.update(row);
}
const _o = [0, 0, 0], _pb = new THREE.Vector3(), _v = new THREE.Vector3();
function flowAt(P) { // world point -> world air velocity
  _pb.copy(P).applyQuaternion(TN.Qi);
  inducedVelocity(TN.ac, _pb.x, _pb.y, _pb.z, TN.gammaViz, _o);
  _v.set(_o[0], _o[1], _o[2]).applyQuaternion(TN.Q);
  _v.x -= TN.V;
  // turbulent wake over stalled strips (suction side, within about a chord)
  const st = TN.ac.strips;
  for (let k = 0; k < st.length; k++) {
    const w = TN.out[k].wS;
    if (w < 0.15) continue;
    const s = st[k], dx = _pb.x - s.Q[0], dy = _pb.y - s.Q[1], dz = _pb.z - s.Q[2];
    if (dx * dx + dy * dy + dz * dz > (1.2 * s.chord) ** 2) continue;
    const side = (dx * s.n[0] + dy * s.n[1] + dz * s.n[2]) * Math.sign(TN.out[k].F[0] * s.n[0] + TN.out[k].F[1] * s.n[1] + TN.out[k].F[2] * s.n[2]);
    if (side < 0) continue;
    const j = 0.45 * w * TN.V;
    _v.x += (Math.random() - 0.5) * j * 0.6; _v.y += (Math.random() - 0.5) * j; _v.z += (Math.random() - 0.5) * j;
    break;
  }
  return _v;
}
tunnel.tick = (dt) => {
  if (!TN.ac) return;
  TN.viz.visible = $('#t-loads').checked;
  smoke.visible = $('#t-smoke').checked;
  if (!smoke.visible) return;
  const h = Math.min(dt, 0.033) * (0.045 / Math.max(0.5, TN.V / 6)); // slow motion, roughly constant on screen
  const stage = THEME.stage;
  const tmp = new THREE.Color();
  let k = 0;
  for (const p of TN.P) {
    const cur = p.h[0];
    // midpoint (RK2) step through the flow field
    const v1 = flowAt(cur).clone();
    const mid = cur.clone().addScaledVector(v1, h * 0.5);
    const v2 = flowAt(mid);
    const next = cur.clone().addScaledVector(v2, h);
    p.sp = v2.length() / TN.V;
    p.h.pop();
    p.h.unshift(next);
    if (next.x < BOX.x1 || Math.abs(next.y) > 0.4 || Math.abs(next.z) > 0.4) spawn(p, false);
    const c = p.sp < 1 ? tmp.copy(MID).lerp(SLOW, Math.min(1, (1 - p.sp) * 10)) : tmp.copy(MID).lerp(FAST, Math.min(1, (p.sp - 1) * 10));
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = p.h[i], b = p.h[i + 1], fade = 1 - i / (TRAIL - 1);
      tPos[k * 6] = a.x; tPos[k * 6 + 1] = a.y; tPos[k * 6 + 2] = a.z;
      tPos[k * 6 + 3] = b.x; tPos[k * 6 + 4] = b.y; tPos[k * 6 + 5] = b.z;
      const r = stage.r + (c.r - stage.r) * fade, gg = stage.g + (c.g - stage.g) * fade, bb = stage.b + (c.b - stage.b) * fade;
      const f2 = 1 - (i + 1) / (TRAIL - 1);
      tCol.set([r, gg, bb, stage.r + (c.r - stage.r) * f2, stage.g + (c.g - stage.g) * f2, stage.b + (c.b - stage.b) * f2], k * 6);
      k++;
    }
  }
  tGeo.attributes.position.needsUpdate = true;
  tGeo.attributes.color.needsUpdate = true;
};
for (const id of ['#t-alpha', '#t-speed', '#t-beta']) $(id).addEventListener('input', updateTunnel);
document.querySelectorAll('[data-tplane]').forEach((b) => b.addEventListener('click', () => { TN.which = b.dataset.tplane; if (TN.m) setupTunnel(TN.m); }));

// ---------------- evolution ----------------
const evo = makeStage($('#evo-stage'));
let evoPaper = null, evoMission = null;
const evoCache = new Map();
function setupEvolution(m) {
  evoMission = m;
  const H = m.R.history, u = unitOf(m);
  const gs = $('#evo-gen');
  gs.max = H.length - 1;
  gs.value = H.length - 1;
  const filled = H[H.length - 1].filled;
  $('#evo-lede').textContent = `The optimiser keeps the best plane of each type (sheet orientation, sequence of folds, with or without winglets) and improves each one in turn. It simulated ${H[H.length - 1].evals.toLocaleString()} planes. ${Math.round((m.R.feasibleFraction || 0) * 100)}% of them passed every rule (foldable without tearing, at most eight layers per crease, no loose flaps, stable, trimmable, strong enough to throw), and ${filled} types produced at least one valid plane.`;
  drawEvoChart(m);
  buildLineage(m);
  showGen(H.length - 1);
}
function drawEvoChart(m) {
  const H = m.R.history, u = unitOf(m);
  const W = 640, Ht = 260, L = 44, R = 16, T = 12, B = 30;
  const maxY = Math.max(...H.map((h) => h.best)) * 1.08;
  const niceStep = maxY > 40 ? 10 : maxY > 16 ? 5 : maxY > 6 ? 2 : 1;
  const x = (g) => L + ((W - L - R) * g) / (H.length - 1), y = (v) => T + (Ht - T - B) * (1 - v / maxY);
  let s = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Best and median score per generation">`;
  for (let v = 0; v <= maxY; v += niceStep) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const gStep = Math.max(1, Math.round(H.length / 6));
  for (let g = 0; g < H.length; g += gStep) s += `<text x="${x(g)}" y="${Ht - 8}" text-anchor="middle">${H[g].evals >= 1000 ? Math.round(H[g].evals / 1000) + 'k' : H[g].evals}</text>`;

  s += `<text x="${L}" y="${T - 2}" text-anchor="start">${u === 'm' ? 'robust score, metres' : 'robust score, seconds'} · horizontal: planes simulated</text>`;
  const path = (k) => H.map((h, g) => `${g ? 'L' : 'M'}${x(g).toFixed(1)},${y(Math.max(0, h[k])).toFixed(1)}`).join('');
  s += `<path d="${path('median')}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="4 3"/>`;
  s += `<path d="${path('best')}" fill="none" stroke="var(--valley)" stroke-width="2"/>`;
  const lastG = H.length - 1;
  s += `<circle cx="${x(lastG)}" cy="${y(H[lastG].best)}" r="4" fill="var(--valley)" stroke="var(--paper)" stroke-width="2"/>`;
  s += `<line id="evo-cursor" x1="0" x2="0" y1="${T}" y2="${Ht - B}" stroke="var(--ink)" stroke-width="1" opacity="0.5"/>`;
  s += `<rect id="evo-hit" x="${L}" y="${T}" width="${W - L - R}" height="${Ht - T - B}" fill="transparent"/>`;
  s += '</svg><div class="tooltip" id="evo-tip" hidden></div>';
  const box = $('#evo-chart');
  box.innerHTML = s;
  const svg = box.querySelector('svg'), tip = $('#evo-tip');
  const genAt = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(H.length - 1, Math.round(((px - L) / (W - L - R)) * (H.length - 1))));
  };
  const hit = box.querySelector('#evo-hit');
  hit.addEventListener('pointermove', (ev) => {
    const g = genAt(ev), r = svg.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = `${(x(g) / W) * r.width}px`;
    tip.style.top = `${(y(H[g].best) / Ht) * r.height}px`;
    tip.textContent = `${H[g].evals.toLocaleString()} planes · best ${fmt(H[g].best)} ${u} · median sketch ${fmt(H[g].median)} ${u}`;
  });
  hit.addEventListener('pointerleave', () => (tip.hidden = true));
  hit.addEventListener('click', (ev) => showGen(genAt(ev)));
  m.evoX = x;
}
function designForGen(m, g) {
  while (g > 0 && !m.R.history[g].bestGenome) g--;
  const key = m.key + ':' + g;
  if (evoCache.has(key)) return evoCache.get(key);
  if (!m.R.history[g].bestGenome) return { d: null, geom: null, ac: null };
  const d = decode(m.R.history[g].bestGenome, m.M);
  const geom = foldPlane(d);
  const ac = geom.ok ? buildAircraft(geom) : null;
  const v = { d, geom, ac };
  evoCache.set(key, v);
  return v;
}
function buildLineage(m) {
  const H = m.R.history;
  const ms = [];
  let prev = null;
  H.forEach((h, g) => { if (!h.bestGenome) return; const k = h.bestGenome.join(','); if (k !== prev && h.best > 0) ms.push(g); prev = k; });
  let pick = ms;
  if (ms.length > 12) {
    pick = [];
    for (let i = 0; i < 12; i++) pick.push(ms[Math.round((i * (ms.length - 1)) / 11)]);
    pick = [...new Set(pick)];
  }
  $('#evo-lineage').innerHTML = pick.map((g) => {
    const v = designForGen(m, g);
    return `<button data-gen="${g}" aria-pressed="false" aria-label="After ${H[g].evals} planes">${silhouette(v)}<span>${H[g].evals >= 1000 ? (H[g].evals / 1000).toFixed(1) + 'k' : H[g].evals} · ${fmt(H[g].best)}</span></button>`;
  }).join('');
  document.querySelectorAll('#evo-lineage button').forEach((b) => b.addEventListener('click', () => showGen(+b.dataset.gen)));
}
function silhouette(v) {
  if (!v.ac) return '<svg viewBox="0 0 10 10"></svg>';
  const pts = facets3D(v.geom).map((f) => f.pts.map((p) => [p[1], -p[0]]));
  const all = pts.flat();
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 0.01;
  return `<svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" preserveAspectRatio="xMidYMid meet">${pts.map((P) => `<polygon points="${P.map((p) => p.join(',')).join(' ')}" fill="var(--valley)" fill-opacity="0.16" stroke="none"/>`).join('')}</svg>`;
}
function showGen(g) {
  const m = evoMission, H = m.R.history, u = unitOf(m);
  $('#evo-gen').value = g;
  $('#evo-gen-v').textContent = `${H[g].evals.toLocaleString()} planes`;
  const cur = $('#evo-cursor');
  if (cur) { cur.setAttribute('x1', m.evoX(g)); cur.setAttribute('x2', m.evoX(g)); }
  document.querySelectorAll('#evo-lineage button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.gen === g)));
  const v = designForGen(m, g);
  if (evoPaper) evo.scene.remove(evoPaper.root);
  if (!v.ac) { $('#evo-readout').innerHTML = ''; return; }
  evoPaper = new Paper(v.geom);
  evoPaper.set(flightPoints(evoPaper, v.ac.cg));
  evoPaper.group.quaternion.copy(Q_FLIGHT);
  evoPaper.root = new THREE.Group();
  evoPaper.root.add(evoPaper.group);
  evo.scene.add(evoPaper.root);
  if (!evo.placed) { evo.camera.position.set(-0.3, 0.28, 0.34); evo.placed = true; }
  const NOSE = { tip: 'nose', diag: 'corners', lock: 'lock', pleat: 'pleat' };
  const folds = (v.d.noseFolds.map((f) => NOSE[f.type]).join(', ') || 'none') + (v.d.bodyFold === 'mountain' ? ' · flaps outside' : '');
  $('#evo-readout').innerHTML = [
    ['Score', `${fmt(H[g].best)} ${u}`], ['Nose folds', folds], ['Sheet', v.d.landscape ? 'landscape' : 'portrait'],
    ['Span', `${fmt(v.ac.span * 100)} cm`], ['Wing area', `${fmt(v.ac.Sref * 1e4, 0)} cm²`], ['Dihedral', `${fmt(v.d.wing.dihedral / DEG, 0)}°`],
    ['Elevator', v.d.elevator.chord > 0 ? `${fmt(v.d.elevator.chord * 100)} cm, trimmed for CL ${v.d.trimCL}` : 'none'],
    ['Winglets', v.geom.phaseB.wingletX !== null ? `${fmt(v.d.winglet.angle / DEG, 0)}°` : 'none'],
  ].map(([k, val]) => `<div class="ro-row"><span></span><span>${k}</span><b></b><b>${val}</b></div>`).join('');
}
evo.tick = (dt) => { if (evoPaper && !reduceMotion) evoPaper.root.rotation.y += dt * 0.3; };
$('#evo-gen').addEventListener('input', (e) => showGen(+e.target.value));

// ---------------- fold tutorial ----------------
const fold = makeStage($('#fold-stage'), { fov: 32 });
const F = { m: null, paper: null, i: 0, t: 0, playing: false, root: null, crease: null };
function setupFold(m) {
  F.m = m;
  if (F.root) fold.scene.remove(F.root);
  F.paper = new Paper(m.champ.geom);
  F.root = new THREE.Group();
  F.root.add(F.paper.group);
  F.paper.group.quaternion.copy(Q_SHEET);
  fold.scene.add(F.root);
  const cm = new THREE.LineDashedMaterial({ color: 0xd23c2a, dashSize: 0.006, gapSize: 0.004, depthTest: false });
  F.crease = new THREE.LineSegments(new THREE.BufferGeometry(), cm);
  F.crease.renderOrder = 10;
  F.paper.group.add(F.crease);
  $('#fold-title').textContent = `How to fold ${m.simName || (m.key === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1')}`;
  $('#fold-steps').innerHTML = m.instr.map((s, i) => `<li><button data-i="${i}"><span><span class="st">${s.title}</span><span class="sx">${s.text}</span></span></button></li>`).join('');
  document.querySelectorAll('#fold-steps button').forEach((b) => b.addEventListener('click', () => goStep(+b.dataset.i, true)));
  const sheet = m.design.sheet;
  fold.camera.position.set(0, 0, Math.max(sheet.W, sheet.L) * 2.6);
  fold.controls.target.set(0, sheet.L / 2, 0);
  fold.camera.position.y = sheet.L / 2;
  renderTemplate(m);
  goStep(0, false);
}
function goStep(i, play) {
  F.i = Math.max(0, Math.min(F.m.instr.length - 1, i));
  F.t = play ? 0 : 1;
  F.playing = play;
  document.querySelectorAll('#fold-steps button').forEach((b) => (+b.dataset.i === F.i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  $('#f-count').textContent = `${F.i + 1} / ${F.m.instr.length}`;
  $('#f-play').textContent = 'Replay';
  drawFoldFrame();
}
function animAt(a, t) {
  const o = {};
  for (const k of new Set([...Object.keys(a.from), ...Object.keys(a.to)])) o[k] = (a.from[k] ?? 0) + ((a.to[k] ?? 0) - (a.from[k] ?? 0)) * ease(t);
  return o;
}
function drawFoldFrame() {
  const s = F.m.instr[F.i], a = s.anim, P = F.paper;
  let pts, crease = null;
  if (a.kind === 'A') {
    P.setEdges(a.step === 0 ? 0 : F.t >= 1 ? a.step : a.step - 1);
    pts = pointsA(P, a.step, a.step === 0 ? 1 : F.t);
    crease = creaseLineA(a.step);
  } else if (a.kind === 'B') {
    P.setEdges(P.layerZ.length - 1, true);
    pts = pointsB(P, animAt(a, F.t));
    if (F.t < 0.15) crease = creaseLineB(s, a);
  } else {
    P.setEdges(P.layerZ.length - 1, true);
    pts = pointsB(P, FINAL);
  }
  P.set(pts);
  // orientation: sheet view for folding; flight view for the final step
  const target = a.kind === 'C' ? Q_FLIGHT : Q_SHEET;
  P.group.quaternion.slerp(target, a.kind === 'C' ? Math.min(1, F.t * 1.2) : 1);
  if (crease && F.t < 0.999) {
    F.crease.geometry.dispose();
    F.crease.geometry = new THREE.BufferGeometry().setFromPoints(crease.map((p) => new THREE.Vector3(...p)));
    F.crease.computeLineDistances();
    F.crease.visible = true;
  } else F.crease.visible = false;
}
function creaseLineA(j) {
  const g = F.paper.geom;
  if (j === 0) {
    const L = g.design.sheet.L;
    return [flatToBase(0, 0, 0.002), flatToBase(0, L, 0.002)];
  }
  const step = g.steps[j];
  const k = j - 1;
  const zTop = Math.max(...F.paper.layerZ[k].values()) + 0.001;
  const lines = [];
  for (const ax of step.axes) {
    // a some-layers fold (movedOnly) creases just the flap that turns; it only touches the line
    // along its edge, so clip a line nudged 1 µm into it
    const polys = g.facets.filter((f) => (!ax.half || f.half === ax.half) && (!ax.movedOnly || f.hist[j].moved)).map((f) => f.poly.map((q) => apply2(f.hist[k].T, q)));
    const Lc = ax.movedOnly ? { p: [ax.p[0] - ax.d[1] * 1e-6, ax.p[1] + ax.d[0] * 1e-6], d: ax.d } : { p: ax.p, d: ax.d };
    const r = chordAlong(polys, Lc);
    if (!r) continue;
    const A = [Lc.p[0] + Lc.d[0] * r[0], Lc.p[1] + Lc.d[1] * r[0]], B = [Lc.p[0] + Lc.d[0] * r[1], Lc.p[1] + Lc.d[1] * r[1]];
    lines.push(flatToBase(A[0], A[1], zTop), flatToBase(B[0], B[1], zTop));
  }
  return lines; // pairs of endpoints, drawn as separate segments
}
function creaseLineB(s, a) {
  const g = F.paper.geom, pb = g.phaseB;
  const zTop = Math.max(...F.paper.layerZ[F.paper.layerZ.length - 1].values()) + 0.001;
  const anim = animAt(a, 0);
  const m3 = (q, region) => g.map3D(q, 'L', region, anim, zTop);
  if (s.title.startsWith('Fold the wings')) return [m3(pb.hinge.a, 'keel'), m3(pb.hinge.b, 'keel')];
  if (s.title.startsWith('Fold the winglets') && pb.wingletX !== null) return [m3([pb.wingletX, pb.ymin], 'wing'), m3([pb.wingletX, pb.ymax], 'wing')];
  if (pb.elevY !== null && /elevator|trailing/i.test(s.title)) return [m3([pb.hinge.a[0], pb.elevY], 'wing'), m3([pb.wingletX ?? pb.wingXmax, pb.elevY], 'wing')];
  return null;
}
fold.tick = (dt) => {
  if (!F.m || !F.playing) return;
  const dur = F.m.instr[F.i].anim.kind === 'C' ? 2.2 : 1.8;
  F.t = Math.min(1, F.t + dt / dur);
  $('#f-prog').style.width = `${F.t * 100}%`;
  drawFoldFrame();
  if (F.t >= 1) {
    F.playing = false;
    if (F.autoplay && F.i < F.m.instr.length - 1) setTimeout(() => F.autoplay && goStep(F.i + 1, true), 900);
    else F.autoplay = false;
  }
};
$('#f-prev').addEventListener('click', () => { F.autoplay = false; goStep(F.i - 1, true); });
$('#f-next').addEventListener('click', () => { F.autoplay = false; goStep(F.i + 1, true); });
$('#f-play').addEventListener('click', () => { F.autoplay = true; goStep(F.i >= F.m.instr.length - 1 ? 0 : F.i, true); });
function renderTemplate(m) {
  const name = m.key === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1';
  const diags = stepDiagrams(m.champ.geom, m.instr, { cgX: m.champ.ac.cg[0], colors: { paper: css('--sheet'), back: css('--sheet-back'), edge: css('--ink-3'), grip: css('--valley') } });
  $('#diagrams').innerHTML = diags.map((d) => `<figure class="diagram" style="margin:0"><figcaption class="dh"><b>${d.num}</b><span>${d.title}</span></figcaption><div class="dv">${d.svg.replace(/ width="[\d.]+mm" height="[\d.]+mm"/, '')}</div></figure>`).join('');
  m.templateSvg = diagramSheet(stepDiagrams(m.champ.geom, m.instr, { cgX: m.champ.ac.cg[0] }), name);
}
$('#copy-svg').addEventListener('click', () => {
  const t = F.m && F.m.templateSvg;
  if (!t) return;
  navigator.clipboard.writeText(t).then(() => ($('#copy-msg').textContent = 'Copied. Paste into a drawing app and print at 100%.'), () => ($('#copy-msg').textContent = 'Copy is blocked here. The same sheet is in the repository under results/.'));
});

// ---------------- polar chart ----------------
function drawPolar(m) {
  const W = 520, Ht = 240, L = 40, R = 70, T = 10, B = 30;
  const A = m.polar, D = m.dartPolar;
  const maxY = Math.ceil(Math.max(...A.map((r) => r.LD), ...D.map((r) => r.LD)) + 0.5);
  const x = (a) => L + ((W - L - R) * (a + 2)) / 26, y = (v) => T + (Ht - T - B) * (1 - Math.max(0, v) / maxY);
  const name = m.key === 'distance' ? 'D-1' : 'H-1';
  let s = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Lift to drag ratio versus angle of attack">`;
  for (let v = 0; v <= maxY; v += 1) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let a = 0; a <= 24; a += 4) s += `<text x="${x(a)}" y="${Ht - 8}" text-anchor="middle">${a}°</text>`;
  const path = (rows) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.a).toFixed(1)},${y(r.LD).toFixed(1)}`).join('');
  s += `<path d="${path(D)}" fill="none" stroke="var(--mountain)" stroke-width="2"/>`;
  s += `<path d="${path(A)}" fill="none" stroke="var(--valley)" stroke-width="2"/>`;
  for (const [rows, col, lab] of [[A, 'var(--valley)', name], [D, 'var(--mountain)', 'dart']]) {
    const pk = rows.reduce((p, r) => (r.LD > p.LD ? r : p));
    s += `<circle cx="${x(pk.a)}" cy="${y(pk.LD)}" r="4" fill="${col}" stroke="var(--paper)" stroke-width="2"/>`;
    s += `<text x="${x(pk.a) + 8}" y="${y(pk.LD) - 6}" style="fill:var(--ink-2)">${lab} ${fmt(pk.LD)}</text>`;
  }
  s += '</svg>';
  $('#polar-chart').innerHTML = s;
  $('#polar-legend').innerHTML = `<span><span class="dot v"></span> Bestfold ${name}</span><span><span class="dot m"></span> Classic dart</span>`;
}

// ---------------- mission switching ----------------
let current = null;
function show(key) {
  if (!DATA.missions[key]) return;
  document.querySelectorAll('[data-mission]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mission === key)));
  $('#hero-loading').hidden = false;
  setTimeout(() => {
    const m = getMission(key);
    current = m;
    renderHero(m);
    setupLab(m);
    setupTunnel(m);
    fillSimPicker();
    setupEvolution(m);
    setupFold(m);
    drawPolar(m);
  }, 30);
}
document.querySelectorAll('[data-mission]').forEach((b) => {
  if (!DATA.missions[b.dataset.mission]) b.disabled = true;
  b.addEventListener('click', () => show(b.dataset.mission));
});
themeListeners.push(() => { if (current) { drawPolar(current); renderTemplate(current); } });
show(DATA.missions.distance ? 'distance' : 'hangtime');

// ---------------- fly together (volunteer island model) ----------------
// Each open page runs islands (Web Workers). Islands report improved designs; the page posts
// its best ones to the community backend. Entries that arrive unverified (claude.ai artifact)
// are re-simulated here before they are trusted; the hosted app's server verifies before storing.
const T = { workers: [], verifier: null, running: false, shared: false, myTop: [], verified: new Map(), pending: new Map(),
  lastWrite: 0, writeTimer: null, peers: 0, entries: new Map(), elites: new Map(), stats: [] };
const gkey = (g) => g.map((x) => x.toFixed(5)).join(',');
const validGenome = (g) => Array.isArray(g) && (g.length === GENOME_SIZE || g.length === LEGACY_GENOME_SIZE) && g.every((x) => typeof x === 'number' && isFinite(x) && x >= 0 && x <= 1);
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 5000);
}
function missionKey() { return current ? current.key : 'distance'; }

async function initTogether() {
  T.verifier = createWorker();
  T.verifier.onmessage = (e) => onVerified(e.data);
  community.onEntries((entries, mission) => {
    // a backend may send one mission at a time; replace that mission's entries
    for (const [k, e] of T.entries) if (!mission || e.mission === mission) T.entries.delete(k);
    for (const e of entries) T.entries.set(`${e.owner}|${e.mission}|${gkey(e.genome || [])}`, e);
    ingest();
  });
  community.onPresence((n) => { T.peers = n; liveLine(); });
  community.onBest((d) => { if (d.mission === missionKey()) toast(`Someone just found a ${fmt(d.score)} ${d.mission === 'distance' ? 'm' : 's'} design.`); });
  const r = await community.init();
  T.shared = r.shared;
  if (r.note) $('#t-note').textContent = r.note;
  liveLine();
}
function liveLine() {
  const n = Math.max(T.peers, T.running ? 1 : 0);
  $('#t-live').textContent = n ? `${n} browser${n > 1 ? 's are' : ' is'} contributing right now.` : 'No one is contributing right now.';
}
// Bring board entries into the verified set (re-simulating any that are not verified yet).
function ingest() {
  const mk = missionKey();
  for (const e of T.entries.values()) {
    if (e.engine !== ENGINE_VERSION || e.mission !== mk || !validGenome(e.genome) || typeof e.score !== 'number') continue;
    const k = mk + '|' + gkey(e.genome);
    const v = T.verified.get(k);
    if (v) { v.owners.add(e.owner); continue; }
    if (e.verified) { T.verified.set(k, { genome: e.genome, score: e.score, ok: true, owners: new Set([e.owner]), at: e.at, by: 'server' }); continue; }
    if (T.pending.has(k)) continue;
    T.pending.set(k, { genome: e.genome, claim: e.score, owner: e.owner, at: e.at });
    T.verifier.postMessage({ type: 'verify', id: k, mission: mk, genome: e.genome });
  }
  renderBoard();
  migrate();
}
function onVerified({ id, fitness }) {
  const p = T.pending.get(id);
  if (!p) return;
  T.pending.delete(id);
  const ok = Math.abs(fitness - p.claim) <= Math.max(0.05, 0.03 * Math.abs(p.claim));
  T.verified.set(id, { genome: p.genome, score: fitness, claim: p.claim, ok, owners: new Set([p.owner]), at: p.at, by: 'device' });
  renderBoard();
  if (ok) migrate();
}
function boardRows() {
  const mk = missionKey();
  return [...T.verified.entries()].filter(([k, v]) => k.startsWith(mk + '|') && v.ok).map(([, v]) => v).sort((a, b) => b.score - a.score).slice(0, 10);
}
// Contributions show up in the Designs catalog; refresh it when the board changes.
function renderBoard() {
  if (shown === 'designs') renderDesigns();
}
function migrate() {
  const entries = boardRows().slice(0, 8).map((r) => ({ key: sketchKey(fromGenome(r.genome).sketch), genome: r.genome, fitness: r.score }));
  if (entries.length) for (const w of T.workers) w.postMessage({ type: 'archive', entries });
}
function startIslands() {
  const n = +$('#t-threads').value || 1, mk = missionKey();
  // start from the shipped archive plus everything verified on the shared board
  const R = DATA.missions[mk];
  const archive = [...((R && R.archive) || []).filter((e) => e.feasible).map((e) => ({ key: e.key, genome: e.genome, fitness: e.fitness })),
    ...boardRows().map((r) => ({ key: sketchKey(fromGenome(r.genome).sketch), genome: r.genome, fitness: r.score }))];
  T.stats = new Array(n).fill(null);
  T.elites = new Map();
  for (let k = 0; k < n; k++) {
    const w = createWorker();
    w.onmessage = (e) => onIsland(k, e.data);
    w.postMessage({ type: 'start', mission: mk, archive });
    T.workers.push(w);
  }
  T.running = true;
  T.mission = mk;
  $('#t-toggle').textContent = 'Stop contributing';
  community.setPresence({ folding: true, mission: mk });
  liveLine();
}
function stopIslands() {
  for (const w of T.workers) w.terminate();
  T.workers = [];
  T.running = false;
  $('#t-toggle').textContent = 'Start contributing';
  community.setPresence({ folding: false, mission: null });
  liveLine();
}
function onIsland(k, msg) {
  let improved = false;
  if (msg.type === 'elite') {
    const cur = T.elites.get(msg.key);
    if (!cur || msg.fitness > cur.score) { T.elites.set(msg.key, { genome: msg.genome, score: msg.fitness, key: msg.key }); improved = true; }
  } else if (msg.type === 'progress') T.stats[k] = msg;
  else return;
  const all = T.stats.filter(Boolean);
  const evals = all.reduce((a, s) => a + s.evals, 0);
  T.myTop = [...T.elites.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  const best = T.myTop[0], u = current ? unitOf(current) : 'm';
  const gb = boardRows()[0];
  $('#t-mine').innerHTML = [
    ['Planes simulated', evals.toLocaleString()], ['Working on sketch', all.map((s) => s.sketch).join(', ') || '–'],
    ['Your best', best ? `${fmt(best.score, 2)} ${u}` : '–'], ['Board best', gb ? `${fmt(gb.score, 2)} ${u}` : '–'],
  ].map(([a, b]) => `<div class="ro-row"><span></span><span>${a}</span><b></b><b>${b}</b></div>`).join('');
  scheduleWrite(improved && best && (!T.lastBest || best.score > T.lastBest + 1e-6));
}
// One submission at a time, at most every 30 s, sooner (10 s) when the island finds a new best.
function scheduleWrite(improved) {
  if (!T.shared || !T.myTop.length || T.writeTimer) return;
  const gap = improved ? 10000 : 30000;
  const wait = Math.max(0, T.lastWrite + gap - Date.now());
  T.writeTimer = setTimeout(async () => {
    T.writeTimer = null;
    T.lastWrite = Date.now();
    const top = T.myTop.map((t) => ({ genome: t.genome, score: +t.score.toFixed(4) }));
    const evals = T.stats.filter(Boolean).reduce((a, s) => a + s.evals, 0);
    try {
      await community.submit({ mission: T.mission, engine: ENGINE_VERSION, top, evals });
      const gb = boardRows()[0];
      if (top[0] && (!gb || top[0].score > gb.score + 1e-6) && (!T.lastBest || top[0].score > T.lastBest)) community.announceBest({ score: top[0].score, mission: T.mission });
      T.lastBest = Math.max(T.lastBest || 0, top[0].score);
    } catch (e) {
      $('#t-note').textContent = e && e.code === 'not_granted' ? 'Your access to this page is view-only, so your island runs locally without posting to the board.'
        : e && e.code === 'rate_limited' ? 'The board is busy; your island keeps running and will post again shortly.' : 'Could not post to the board just now; your island keeps running.';
    }
  }, wait);
}
$('#t-toggle').addEventListener('click', () => (T.running ? stopIslands() : startIslands()));
$('#t-threads').addEventListener('change', () => { if (T.running) { stopIslands(); startIslands(); } });
document.querySelectorAll('[data-mission]').forEach((b) => b.addEventListener('click', () => {
  if (T.running) { stopIslands(); setTimeout(startIslands, 100); }
  setTimeout(ingest, 200);
}));
initTogether();

// ---------------- design catalog ----------------
// Every design has a deterministic name (viewer/names.js). Rows expand in place to show a rotating
// preview (one shared WebGL stage that moves into the open row), metrics simulated on demand, and
// buttons to fly or fold the design.
const FOLD_WORDS = { diag: 'corner', tip: 'nose', lock: 'lock', pleat: 'pleat' };
let openKey = null; // the open row survives list refreshes
const specCache = new Map();
function catalogItem({ genome, score, source, at = 0, owner = null, specs = null }) {
  const mk = missionKey();
  const k = gkey(genome);
  let sp = specs || specCache.get(k);
  if (!sp) {
    const d = decode(normalizeGenome(genome), MISSIONS[mk]);
    const geom = foldPlane(d), ac = geom.ok ? buildAircraft(geom) : null;
    sp = { landscape: d.landscape, winglets: d.winglet.enabled, folds: d.noseFolds.map((f) => f.type), span: ac && ac.span, area: ac && ac.Sref, mass: ac && ac.mass };
    specCache.set(k, sp);
  }
  return { genome, score, source, at, owner, specs: sp, mission: mk, name: designName(genome, mk, sp.folds.length) };
}
function describe(sp) {
  const folds = sp.folds.length ? sp.folds.map((t) => FOLD_WORDS[t] || t).join(', ') : 'no nose folds';
  return `${sp.landscape ? 'Landscape' : 'Portrait'} · ${folds}${sp.winglets ? ' · winglets' : ''}${sp.span ? ` · ${fmt(sp.span * 100)} cm span` : ''}`;
}
const preview = (() => {
  const el = document.createElement('div');
  el.className = 'stage';
  const st = makeStage(el);
  st.camera.position.set(-0.24, 0.16, 0.3);
  const P = { el, st, paper: null };
  st.tick = (dt) => { if (P.paper && !reduceMotion) P.paper.root.rotation.y += dt * 0.4; };
  return P;
})();
function showPreview(holder, genome) {
  holder.appendChild(preview.el);
  if (preview.paper) preview.st.scene.remove(preview.paper.root);
  const d = decode(normalizeGenome(genome), MISSIONS[missionKey()]);
  const geom = foldPlane(d);
  if (!geom.ok) return;
  const ac = buildAircraft(geom);
  const paper = new Paper(geom);
  paper.set(flightPoints(paper, ac.cg));
  paper.group.quaternion.copy(Q_FLIGHT);
  paper.root = new THREE.Group();
  paper.root.add(paper.group);
  preview.st.scene.add(paper.root);
  preview.paper = paper;
}
function designRow(item, rank) {
  const u = unitOf({ key: item.mission });
  const row = document.createElement('div');
  row.className = 'drow';
  const by = item.source === 'community' ? `Found by ${item.owner || 'a contributor'}` : 'Found by the search';
  row.innerHTML = `<button aria-expanded="false"><span class="rk">${rank}</span><span><span class="nm"></span><span class="meta"></span></span><span class="sc">${fmt(item.score, 2)} ${u}</span><span class="chev" aria-hidden="true"></span></button>
    <div class="detail"><div class="pv"></div><div><dl></dl><div class="acts"><a class="btn" href="#lab">Fly it</a><a class="btn quiet" href="#fold">Fold it</a></div></div></div>`;
  row.querySelector('.nm').textContent = item.name;
  const R = DATA.missions[item.mission];
  const champ = R && R.best && gkey(R.best.genome) === gkey(item.genome);
  row.querySelector('.meta').textContent = (champ ? `Current best (${item.mission === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1'}) · ` : '') + describe(item.specs);
  const head = row.querySelector('button'), dl = row.querySelector('dl');
  const k = gkey(item.genome);
  const toggle = (open) => {
    for (const other of document.querySelectorAll('.drow.open')) if (other !== row) { other.classList.remove('open'); other.querySelector('button').setAttribute('aria-expanded', 'false'); }
    row.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
    if (!open) { if (openKey === k) openKey = null; return; }
    openKey = k;
    showPreview(row.querySelector('.pv'), item.genome);
    const sp = item.specs;
    const base = [['Score', `${fmt(item.score, 2)} ${u}`], ['Clean throw', '…'], ['Wingspan', sp.span ? `${fmt(sp.span * 100)} cm` : '–'], ['Wing area', sp.area ? `${fmt(sp.area * 1e4, 0)} cm²` : '–'],
      ['Mass', sp.mass ? `${fmt(sp.mass * 1000, 2)} g` : '–'], ['Stability margin', '…'], ['Sheet', sp.landscape ? 'A4 landscape' : 'A4 portrait'], ['Source', by]];
    const draw = (rows) => { dl.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''); };
    draw(base);
    // the clean throw needs a short simulation; run it after the row has opened
    setTimeout(() => {
      const ev = evaluate(decode(normalizeGenome(item.genome), MISSIONS[item.mission]), MISSIONS[item.mission], { quick: true, force: true });
      if (!row.classList.contains('open')) return;
      base[1][1] = ev.nominal ? `${fmt(ev.nominal.metric)} ${u}` : '–';
      base[5][1] = ev.sm !== undefined ? `${fmt(ev.sm * 100, 0)}%` : '–';
      draw(base);
    }, 30);
  };
  head.addEventListener('click', () => toggle(!row.classList.contains('open')));
  if (openKey === k) setTimeout(() => toggle(true), 0); // re-open after a refresh
  row.querySelector('a[href="#lab"]').addEventListener('click', (e) => { e.preventDefault(); selectDesign(item.genome); location.hash = 'lab'; });
  row.querySelector('a[href="#fold"]').addEventListener('click', (e) => { e.preventDefault(); selectDesign(item.genome); location.hash = 'fold'; });
  return row;
}
// All designs: the shipped archive (best plane of every type from the search) plus contributions.
const DV = { page: 1, per: 25 };
function allItems() {
  const mk = missionKey(), R = DATA.missions[mk];
  const items = ((R && R.archive) || []).map((e) => catalogItem({ genome: e.genome, score: e.fitness, source: 'search', specs: e.specs }));
  const seen = new Set(items.map((i) => gkey(i.genome)));
  for (const r of boardRows()) if (!seen.has(gkey(r.genome))) items.push(catalogItem({ genome: r.genome, score: r.score, source: 'community', at: r.at, owner: [...r.owners].map((id) => (id === community.me ? 'You' : 'a contributor')).join(', ') }));
  return items;
}
function renderDesigns() {
  const q = $('#d-q').value.trim().toLowerCase(), sheet = $('#d-sheet').value, wing = $('#d-wing').value, folds = $('#d-folds').value, src = $('#d-src').value, sort = $('#d-sort').value;
  let items = allItems().filter((i) => (!q || i.name.toLowerCase().includes(q))
    && (!sheet || (sheet === 'landscape') === i.specs.landscape)
    && (!wing || (wing === 'yes') === i.specs.winglets)
    && (folds === '' || i.specs.folds.length === +folds)
    && (!src || i.source === src));
  const by = { score: (a, b) => b.score - a.score, span: (a, b) => (b.specs.span || 0) - (a.specs.span || 0), area: (a, b) => (b.specs.area || 0) - (a.specs.area || 0), new: (a, b) => (b.at || 0) - (a.at || 0) || b.score - a.score };
  items.sort(by[sort]);
  const total = allItems().length;
  $('#d-lede').textContent = `The best plane of every type found by the search, plus everything contributors have found: ${total} designs for ${missionKey() === 'distance' ? 'distance' : 'time aloft'}.`;
  $('#d-count').textContent = items.length === total ? `${total} designs` : `${items.length} of ${total} designs`;
  const list = $('#d-list');
  list.innerHTML = '';
  const shownItems = items.slice(0, DV.page * DV.per);
  if (!shownItems.length) list.innerHTML = '<p class="empty">No designs match these filters.</p>';
  shownItems.forEach((it, i) => list.appendChild(designRow(it, i + 1)));
  $('#d-more').hidden = items.length <= shownItems.length;
}
for (const id of ['#d-q', '#d-sheet', '#d-wing', '#d-folds', '#d-src', '#d-sort']) $(id).addEventListener('input', () => { DV.page = 1; renderDesigns(); });
$('#d-more').addEventListener('click', () => { DV.page++; renderDesigns(); });
document.querySelectorAll('[data-mission]').forEach((b) => b.addEventListener('click', () => setTimeout(() => { if (shown === 'designs') { DV.page = 1; renderDesigns(); } }, 60)));

// ---------------- design picker (Simulate and Fold it) ----------------
// One selected design drives Flight, Wind tunnel and the folding tutorial (default: #1, the
// current champion). The overview always shows the champion.
const SIM = { items: [], idx: 0 };
function fillSimPicker() {
  const mk = missionKey(), u = mk === 'distance' ? 'm' : 's';
  SIM.items = allItems().sort((a, b) => b.score - a.score).slice(0, 50);
  SIM.idx = 0;
  const champ = mk === 'distance' ? 'Bestfold D-1' : 'Bestfold H-1';
  const html = SIM.items.map((it, i) => `<option value="${i}">${i + 1}. ${it.name}${i === 0 ? ` (${champ})` : ''} · ${fmt(it.score, 2)} ${u}</option>`).join('');
  for (const sel of document.querySelectorAll('.sim-pick')) { sel.innerHTML = html; sel.value = '0'; }
}
function selectDesign(genome) {
  if (!current) return;
  if (!SIM.items.length || SIM.items[0].mission !== missionKey()) fillSimPicker();
  let i = SIM.items.findIndex((it) => gkey(it.genome) === gkey(genome));
  if (i < 0) { SIM.items.push(catalogItem({ genome, score: 0, source: 'search' })); i = SIM.items.length - 1; for (const sel of document.querySelectorAll('.sim-pick')) sel.insertAdjacentHTML('beforeend', `<option value="${i}">${SIM.items[i].name}</option>`); }
  pickSim(i);
}
function pickSim(i) {
  SIM.idx = i;
  for (const sel of document.querySelectorAll('.sim-pick')) sel.value = String(i);
  const m = current;
  if (i === 0 || !SIM.items[i]) { setupLab(m); setupTunnel(m); setupFold(m); return; }
  const it = SIM.items[i];
  $('#lab-readout').innerHTML = '<div class="ro-row"><span></span><span>Simulating…</span><b></b><b></b></div>';
  setTimeout(() => { // let the "Simulating…" state paint first
    const ev = evaluate(decode(normalizeGenome(it.genome), m.M), m.M, { record: true, recordEvery: 1 / 30, force: true });
    const instr = buildInstructions(ev.geom);
    instr.push({ anim: { kind: 'C' }, title: 'Throw it', text: throwAdvice(ev.design, ev.ac).text });
    const m2 = { ...m, champ: ev, design: ev.design, simName: it.name, instr };
    setupLab(m2);
    setupTunnel(m2);
    setupFold(m2);
  }, 30);
}
for (const sel of document.querySelectorAll('.sim-pick')) sel.addEventListener('change', () => pickSim(+sel.value));
document.querySelectorAll('[data-mission]').forEach((b) => b.addEventListener('click', () => setTimeout(fillSimPicker, 80)));

// ---------------- views ----------------
// One view at a time, chosen by the URL hash (#overview, #lab, …), so every view has its own
// address and the back button works. Switching lands at the top of the view instantly.
const views = [...document.querySelectorAll('.view')];
const navLinks = [...document.querySelectorAll('header.site nav a')];
const titles = { designs: 'Designs', lab: 'Flight', tunnel: 'Wind tunnel', fold: 'Fold it', hood: 'How it works', evolution: 'Search history' };
var shown = null; // var: read by board rendering before the router runs
function route() {
  const id = location.hash.slice(1);
  // Views are keyed by data-view, not id, so the browser never does its own jump-to-anchor
  // scroll after we have placed the view at the top.
  const target = views.some((v) => v.dataset.view === id) ? id : 'overview';
  if (target === shown) return;
  shown = target;
  for (const v of views) v.classList.toggle('active', v.dataset.view === target);
  // pages grouped under one nav item: Simulate (flight, wind tunnel), How it works (method, search history)
  const navTarget = { tunnel: 'lab', evolution: 'hood' }[target] || target;
  for (const a of document.querySelectorAll('.subtabs a')) {
    if (a.dataset.sub === target) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  for (const a of navLinks) {
    if (a.getAttribute('href') === '#' + navTarget) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = target === 'overview' ? 'Bestfold' : `${titles[target]} · Bestfold`;
  window.scrollTo(0, 0);
  if (target === 'lab' && labMission) throwLab(); // replay the throw when the view opens
  if (target === 'designs') { DV.page = 1; renderDesigns(); }
}
window.addEventListener('hashchange', route);
route();
}
