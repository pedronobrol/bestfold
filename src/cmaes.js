// Compact CMA-ES (Hansen 2016 tutorial defaults) for small dimensions, maximising a fitness
// over the box [0,1]^D. Candidates are clipped to the box; the unclipped sample drives
// adaptation, which is the standard, robust boundary treatment for small boxes.
//
//   const es = new CMAES(x0, sigma0, {lambda, rand})
//   const X = es.ask();            // array of lambda candidates (clipped to [0,1])
//   es.tell(fitnesses);            // higher is better
//   es.best, es.stagnant(gens), es.sigma

export class CMAES {
  constructor(x0, sigma = 0.2, opts = {}) {
    const n = x0.length;
    this.n = n;
    this.rand = opts.rand || Math.random;
    this.lambda = opts.lambda || 4 + Math.floor(3 * Math.log(n));
    this.mu = Math.floor(this.lambda / 2);
    const w = Array.from({ length: this.mu }, (_, i) => Math.log(this.mu + 0.5) - Math.log(i + 1));
    const sw = w.reduce((a, b) => a + b, 0);
    this.w = w.map((x) => x / sw);
    this.mueff = 1 / this.w.reduce((a, b) => a + b * b, 0);
    const me = this.mueff;
    this.cc = (4 + me / n) / (n + 4 + (2 * me) / n);
    this.cs = (me + 2) / (n + me + 5);
    this.c1 = 2 / ((n + 1.3) ** 2 + me);
    this.cmu = Math.min(1 - this.c1, (2 * (me - 2 + 1 / me)) / ((n + 2) ** 2 + me));
    this.damps = 1 + 2 * Math.max(0, Math.sqrt((me - 1) / (n + 1)) - 1) + this.cs;
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.m = x0.slice();
    this.sigma = sigma;
    this.pc = new Array(n).fill(0);
    this.ps = new Array(n).fill(0);
    this.C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    this.B = this.C.map((r) => r.slice());
    this.D = new Array(n).fill(1);
    this.gen = 0;
    this.best = { x: x0.slice(), f: -Infinity };
    this.history = [];
  }
  randn() {
    let u = 0;
    while (u === 0) u = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rand());
  }
  ask() {
    const n = this.n;
    this.Z = []; this.Y = []; this.X = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = Array.from({ length: n }, () => this.randn());
      const y = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) y[i] += this.B[i][j] * this.D[j] * z[j];
      const x = this.m.map((mi, i) => mi + this.sigma * y[i]);
      this.Z.push(z); this.Y.push(y);
      this.X.push(x.map((v) => Math.min(1, Math.max(0, v))));
    }
    return this.X;
  }
  tell(fit) {
    const n = this.n, lam = this.lambda, mu = this.mu;
    const order = fit.map((f, i) => [f, i]).sort((a, b) => b[0] - a[0]).map((o) => o[1]);
    if (fit[order[0]] > this.best.f) this.best = { x: this.X[order[0]].slice(), f: fit[order[0]] };
    this.history.push(fit[order[0]]);
    const yw = new Array(n).fill(0);
    for (let k = 0; k < mu; k++) { const y = this.Y[order[k]]; for (let i = 0; i < n; i++) yw[i] += this.w[k] * y[i]; }
    const mOld = this.m.slice();
    // keep the mean inside the box (clipped mean, so sampling stays useful near bounds)
    this.m = this.m.map((mi, i) => Math.min(1.2, Math.max(-0.2, mi + this.sigma * yw[i])));
    // C^(-1/2) yw = B diag(1/D) B^T yw
    const t = new Array(n).fill(0), invsq = new Array(n).fill(0);
    for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += this.B[i][j] * yw[i]; t[j] = s / this.D[j]; }
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += this.B[i][j] * t[j]; invsq[i] = s; }
    const csn = Math.sqrt(this.cs * (2 - this.cs) * this.mueff);
    for (let i = 0; i < n; i++) this.ps[i] = (1 - this.cs) * this.ps[i] + csn * invsq[i];
    const psn = Math.sqrt(this.ps.reduce((a, b) => a + b * b, 0));
    this.gen++;
    const hsig = psn / Math.sqrt(1 - (1 - this.cs) ** (2 * this.gen)) / this.chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    const ccn = Math.sqrt(this.cc * (2 - this.cc) * this.mueff);
    for (let i = 0; i < n; i++) this.pc[i] = (1 - this.cc) * this.pc[i] + hsig * ccn * yw[i];
    const c1a = this.c1 * (1 - (1 - hsig * hsig) * this.cc * (2 - this.cc));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let r = 0;
      for (let k = 0; k < mu; k++) r += this.w[k] * this.Y[order[k]][i] * this.Y[order[k]][j];
      const v = (1 - c1a - this.cmu) * this.C[i][j] + this.c1 * this.pc[i] * this.pc[j] + this.cmu * r;
      this.C[i][j] = v; this.C[j][i] = v;
    }
    this.sigma *= Math.exp((this.cs / this.damps) * (psn / this.chiN - 1));
    this.sigma = Math.min(this.sigma, 0.6);
    this.eigen();
    return mOld;
  }
  // Jacobi eigen-decomposition (n ≤ ~20, called once per generation)
  eigen() {
    const n = this.n, A = this.C.map((r) => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    this.B = V;
    this.D = A.map((r, i) => Math.sqrt(Math.max(1e-20, r[i])));
  }
  // true if the best value has not improved by more than tol (relative) over the last g generations
  stagnant(g = 20, tol = 0.005) {
    const h = this.history;
    if (h.length < g + 1) return false;
    const recent = Math.max(...h.slice(-g)), before = Math.max(...h.slice(0, -g));
    return recent <= before + tol * Math.abs(before || 1) || this.sigma < 1e-3;
  }
}
