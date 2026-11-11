import { parentPort } from 'node:worker_threads';
import { decode, MISSIONS } from '../src/design.js';
import { evaluate } from '../src/evaluate.js';

// Evaluates one genome. threshold enables exact racing (early rejection after 8 scenarios).
parentPort.on('message', ({ id, genome, mission, threshold }) => {
  const M = MISSIONS[mission];
  let out;
  try {
    const r = evaluate(decode(genome, M), M, { threshold });
    out = {
      fitness: r.fitness, score: r.score || 0, feasible: !!r.feasible, raced: !!r.raced,
      violations: (r.violations || []).map((v) => v.name),
      stats: r.ac ? { mass: r.mass, S: r.Sref, span: r.span, sm: r.sm, plies: r.plies && r.plies.max, mean: r.mean, nominal: r.nominal && r.nominal.metric } : null,
    };
  } catch (e) {
    out = { fitness: -20, score: 0, feasible: false, violations: ['error: ' + e.message] };
  }
  parentPort.postMessage({ id, ...out });
});
