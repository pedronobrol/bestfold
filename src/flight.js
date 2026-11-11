// 6-DOF rigid-body flight with apparent mass, RK4 integration.
// World frame: X downrange, Y left, Z up. Body frame: X nose, Y left wing, Z up.

import { add, scale, cross, norm, qmul, qnormalize, qrot, qinvrot, qFromAxisAngle } from './geom.js';
import { aero, mv3 } from './physics.js';

const G = 9.81;

export function launchState(launch, sc = {}) {
  const pitch = launch.pitch + (sc.dPitch || 0);
  const bank = (launch.bank || 0) + (sc.dBank || 0);
  const yaw = sc.dYaw || 0;
  // yaw about Z, pitch-up is a negative rotation about +Y, bank right = right wing (-Y) down
  let q = qFromAxisAngle([0, 0, 1], yaw);
  q = qmul(q, qFromAxisAngle([0, 1, 0], -pitch));
  q = qmul(q, qFromAxisAngle([1, 0, 0], -bank));
  const V = launch.speed * (sc.speedMul || 1);
  const a0 = sc.alpha || 0; // angle of attack at release
  const b0 = sc.beta || 0; // sideslip at release
  return {
    p: [0, 0, launch.height + (sc.dHeight || 0)],
    q,
    v: [V * Math.cos(a0) * Math.cos(b0), V * Math.sin(b0), -V * Math.sin(a0) * Math.cos(b0)],
    w: sc.rates ? sc.rates.slice() : [0, 0, 0],
  };
}

// Load-dependent wing flex: the root creases are springs, so above 1 g the wings ride up and
// shed lift. ac.flex = {twin: same plane with wings FLEX_SPAN higher, perG: extra dihedral per g}.
function flexAero(ac, v, w) {
  const A = aero(ac, v, w);
  const fx = ac.flex;
  if (!fx) return A;
  const n = A.F[2] / (ac.mass * G); // load factor (body-up aerodynamic force / weight)
  const t = Math.min(1, Math.max(0, ((n - 1) * fx.perG) / fx.span));
  if (t < 0.01) return A;
  const B = aero(fx.twin, v, w);
  return {
    F: [A.F[0] + (B.F[0] - A.F[0]) * t, A.F[1] + (B.F[1] - A.F[1]) * t, A.F[2] + (B.F[2] - A.F[2]) * t],
    M: [A.M[0] + (B.M[0] - A.M[0]) * t, A.M[1] + (B.M[1] - A.M[1]) * t, A.M[2] + (B.M[2] - A.M[2]) * t],
    stall: A.stall,
  };
}

function deriv(ac, s) {
  const { F, M } = flexAero(ac, s.v, s.w);
  const gB = qinvrot(s.q, [0, 0, -G * ac.mass]);
  // Apparent (added) air mass in body axes:  (m + Ma) v' = F + m g − m ω×v.
  // This form conserves ½vᵀ(m+Ma)v + ½ωᵀ(I+Ja)ω exactly when no force acts (checked by the
  // energy audit). The Munk moment is left out because the vortex-lattice lift already contains it.
  const wv = cross(s.w, s.v);
  const dv = mv3(ac.MtInv, [F[0] + gB[0] - ac.mass * wv[0], F[1] + gB[1] - ac.mass * wv[1], F[2] + gB[2] - ac.mass * wv[2]]);
  const Iw = mv3(ac.I, s.w);
  const gyro = cross(s.w, Iw);
  const dw = mv3(ac.JtInv, [M[0] - gyro[0], M[1] - gyro[1], M[2] - gyro[2]]);
  const dp = qrot(s.q, s.v);
  const dq = qmul(s.q, [0, s.w[0], s.w[1], s.w[2]]).map((x) => 0.5 * x);
  return { dp, dq, dv, dw };
}

const step = (s, d, h) => ({
  p: add(s.p, scale(d.dp, h)),
  q: [s.q[0] + d.dq[0] * h, s.q[1] + d.dq[1] * h, s.q[2] + d.dq[2] * h, s.q[3] + d.dq[3] * h],
  v: add(s.v, scale(d.dv, h)),
  w: add(s.w, scale(d.dw, h)),
});

export function simulate(ac, launch, sc = {}, opts = {}) {
  const dt = opts.dt || 0.002;
  const maxT = opts.maxTime || 60;
  const ceiling = opts.ceiling || 9;
  const record = opts.record ? (opts.recordEvery || 0.02) : 0;
  let s = launchState(launch, sc);
  let t = 0, nextRec = 0, maxH = s.p[2];
  // Energy audit: kinetic (incl. apparent air mass) + potential energy may never rise,
  // because the plane has no engine. A rise means the model is being exploited.
  const energy = (st) => {
    const Mv = mv3(ac.Mt, st.v), Jw = mv3(ac.Jt, st.w);
    return 0.5 * (st.v[0] * Mv[0] + st.v[1] * Mv[1] + st.v[2] * Mv[2]) + 0.5 * (st.w[0] * Jw[0] + st.w[1] * Jw[1] + st.w[2] * Jw[2]) + ac.mass * G * st.p[2];
  };
  const E0 = energy(s);
  let Emax = E0, fastSpin = 0;
  const traj = [];
  let end = 'timeout';
  while (t < maxT) {
    if (record && t >= nextRec - 1e-9) {
      traj.push([t, ...s.p, ...s.q, norm(s.v), ...s.v, ...s.w]);
      nextRec += record;
    }
    const k1 = deriv(ac, s);
    const k2 = deriv(ac, step(s, k1, dt / 2));
    const k3 = deriv(ac, step(s, k2, dt / 2));
    const k4 = deriv(ac, step(s, k3, dt));
    const prev = s;
    s = {
      p: add(s.p, scale(add(add(k1.dp, scale(add(k2.dp, k3.dp), 2)), k4.dp), dt / 6)),
      q: qnormalize([0, 1, 2, 3].map((i) => s.q[i] + (dt / 6) * (k1.dq[i] + 2 * k2.dq[i] + 2 * k3.dq[i] + k4.dq[i]))),
      v: add(s.v, scale(add(add(k1.dv, scale(add(k2.dv, k3.dv), 2)), k4.dv), dt / 6)),
      w: add(s.w, scale(add(add(k1.dw, scale(add(k2.dw, k3.dw), 2)), k4.dw), dt / 6)),
    };
    t += dt;
    maxH = Math.max(maxH, s.p[2]);
    if (!isFinite(s.p[0]) || norm(s.w) > 300 || norm(s.v) > 80) { end = 'diverged'; break; }
    const E = energy(s);
    Emax = Math.max(Emax, E);
    if (E > E0 * 1.02 + 2e-4) { end = 'energy'; break; }
    // sustained fast rotation is a tumble, not flight
    fastSpin = norm(s.w) > (opts.tumbleRate || 15) ? fastSpin + dt : 0;
    if (fastSpin > 0.5) { end = 'tumbling'; break; }
    if (s.p[2] <= 0.02) {
      // interpolate touchdown
      const f = (prev.p[2] - 0.02) / (prev.p[2] - s.p[2] || 1);
      s.p = add(prev.p, scale(add(s.p, scale(prev.p, -1)), f));
      t = t - dt + dt * f;
      end = 'landed';
      break;
    }
    if (s.p[2] >= ceiling) { end = 'ceiling'; break; }
  }
  if (record) traj.push([t, ...s.p, ...s.q, norm(s.v), ...s.v, ...s.w]);
  const dist = Math.hypot(s.p[0], s.p[1]);
  return { time: t, distance: dist, downrange: s.p[0], lateral: s.p[1], maxHeight: maxH, end, traj, energyGain: Emax / E0 - 1 };
}
