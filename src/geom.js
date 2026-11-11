// Small, dependency-free geometry helpers shared by the fold engine,
// the aerodynamics and the browser viewer. Units are metres and radians.

// ---------- 3D vectors (plain arrays) ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
export const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Rotate point p about the axis through `o` with unit direction `k` by angle th (Rodrigues).
export function rotateAbout(p, o, k, th) {
  const v = sub(p, o);
  const c = Math.cos(th), s = Math.sin(th);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    o[0] + v[0] * c + kv[0] * s + k[0] * kd,
    o[1] + v[1] * c + kv[1] * s + k[1] * kd,
    o[2] + v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

// ---------- 2D ----------
// A line is {p:[x,y], d:[dx,dy]} with d unit length. side(q) > 0 is the left of d.
export function line2(p, q) {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const n = Math.hypot(dx, dy) || 1;
  return { p: [p[0], p[1]], d: [dx / n, dy / n] };
}
export const side = (L, q) => L.d[0] * (q[1] - L.p[1]) - L.d[1] * (q[0] - L.p[0]);

// Split a convex polygon by a line. Returns {left, right} (either may be null).
export function splitPoly(poly, L, eps = 1e-10) {
  const left = [], right = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const sa = side(L, a), sb = side(L, b);
    if (sa >= -eps) left.push(a);
    if (sa <= eps) right.push(a);
    if ((sa > eps && sb < -eps) || (sa < -eps && sb > eps)) {
      const t = sa / (sa - sb);
      const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      left.push(q);
      right.push(q);
    }
  }
  const ok = (P) => (P.length >= 3 && Math.abs(polyArea(P)) > 1e-12 ? dedupe(P) : null);
  return { left: ok(left), right: ok(right) };
}

function dedupe(P) {
  const out = [];
  for (const q of P) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-12) out.push(q);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12) out.pop();
  }
  return out;
}

export function polyArea(P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// Range [tmin,tmax] of the parameter t along line L that lies inside a convex polygon.
export function clipLineToPoly(L, P) {
  let tmin = -Infinity, tmax = Infinity;
  const ccw = polyArea(P) > 0 ? 1 : -1;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    // inward normal
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const nx = -ey * ccw, ny = ex * ccw;
    const num = nx * (L.p[0] - a[0]) + ny * (L.p[1] - a[1]);
    const den = nx * L.d[0] + ny * L.d[1];
    if (Math.abs(den) < 1e-14) {
      if (num < 0) return null;
    } else {
      const t = -num / den;
      if (den > 0) tmin = Math.max(tmin, t);
      else tmax = Math.min(tmax, t);
    }
  }
  return tmax > tmin + 1e-9 ? [tmin, tmax] : null;
}

// ---------- 2D rigid transforms (original sheet -> current flat state) ----------
// x' = a x + b y + tx ; y' = c x + d y + ty
export const I2 = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
export const apply2 = (T, q) => [T.a * q[0] + T.b * q[1] + T.tx, T.c * q[0] + T.d * q[1] + T.ty];
export function compose2(A, B) {
  // A after B
  return {
    a: A.a * B.a + A.b * B.c,
    b: A.a * B.b + A.b * B.d,
    c: A.c * B.a + A.d * B.c,
    d: A.c * B.b + A.d * B.d,
    tx: A.a * B.tx + A.b * B.ty + A.tx,
    ty: A.c * B.tx + A.d * B.ty + A.ty,
  };
}
export function invert2(T) {
  const det = T.a * T.d - T.b * T.c;
  const a = T.d / det, b = -T.b / det, c = -T.c / det, d = T.a / det;
  return { a, b, c, d, tx: -(a * T.tx + b * T.ty), ty: -(c * T.tx + d * T.ty) };
}
export function reflectT(L) {
  const [dx, dy] = L.d;
  const a = dx * dx - dy * dy, b = 2 * dx * dy, c = 2 * dx * dy, d = dy * dy - dx * dx;
  const [px, py] = L.p;
  return { a, b, c, d, tx: px - (a * px + b * py), ty: py - (c * px + d * py) };
}

// ---------- quaternions [w,x,y,z] ----------
export function qmul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
export function qnormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
export function qrot(q, v) {
  // rotate body vector v into world
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
export const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
export const qinvrot = (q, v) => qrot(qconj(q), v);
export function qFromAxisAngle(k, th) {
  const s = Math.sin(th / 2);
  return [Math.cos(th / 2), k[0] * s, k[1] * s, k[2] * s];
}
// Solve dense linear system via LU with partial pivoting. A is array of Float64Array rows.
// Returns an object with solve(b) -> x.
export function lu(Ain) {
  const n = Ain.length;
  const A = Ain.map((r) => Float64Array.from(r));
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    let p = k, m = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > m) { m = Math.abs(A[i][k]); p = i; }
    if (p !== k) { [A[p], A[k]] = [A[k], A[p]]; [piv[p], piv[k]] = [piv[k], piv[p]]; }
    const akk = A[k][k] || 1e-30;
    for (let i = k + 1; i < n; i++) {
      const f = (A[i][k] /= akk);
      if (f === 0) continue;
      const Ai = A[i], Ak = A[k];
      for (let j = k + 1; j < n; j++) Ai[j] -= f * Ak[j];
    }
  }
  return {
    solve(b) {
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = b[piv[i]];
      for (let i = 0; i < n; i++) { let s = x[i]; const Ai = A[i]; for (let j = 0; j < i; j++) s -= Ai[j] * x[j]; x[i] = s; }
      for (let i = n - 1; i >= 0; i--) { let s = x[i]; const Ai = A[i]; for (let j = i + 1; j < n; j++) s -= Ai[j] * x[j]; x[i] = s / Ai[i]; }
      return x;
    },
  };
}
