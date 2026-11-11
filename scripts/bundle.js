// A tiny module bundler for the browser engine: each ES module runs in its own function scope and
// its exports are bound by name. Used for the island Web Worker (public/island-worker.js) and the
// single-file artifact (dist/bestfold.html), so neither depends on a framework's worker support.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
export const read = (p) => readFileSync(new URL(p, root), 'utf8');
export const ENGINE = ['version', 'geom', 'design', 'fold', 'retention', 'physics', 'flight', 'evaluate', 'cmaes', 'sketch', 'instructions', 'template'];
export const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'(?:\.\.?\/)+(?:src\/|viewer\/)?(\w+)\.js';?/gm;

export function createBundler() {
  const exported = new Map();
  const wrap = (name, src) => {
    const names = [];
    src = src.replace(IMPORT, (_, list, mod) => `const {${list}} = __m_${mod};`);
    src = src.replace(/^import .* from 'three.*$/gm, ''); // three.js is imported once by the page
    src = src.replace(/^export\s+(async\s+)?(function|class|const|let)\s+(\w+)/gm, (_, a, kw, id) => { names.push(id); return `${a || ''}${kw} ${id}`; });
    src = src.replace(/^export\s*\{([^}]*)\};?/gm, (_, list) => { list.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => names.push(x)); return ''; });
    if (/^\s*(import|export)\s/m.test(src)) throw new Error(`unhandled import/export in ${name}.js`);
    for (const n of names) {
      if (exported.has(n)) throw new Error(`export name collision: ${n} in ${name}.js and ${exported.get(n)}.js`);
      exported.set(n, name);
    }
    return `const __m_${name} = (() => {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
  };
  return { wrap, exported };
}

// The engine as one script that defines every export as a top-level binding.
export function engineBundle() {
  const { wrap, exported } = createBundler();
  let out = ENGINE.map((n) => wrap(n, read(`src/${n}.js`))).join('');
  out += ENGINE.map((n) => `const { ${[...exported].filter(([, m]) => m === n).map(([k]) => k).join(', ')} } = __m_${n};`).join('\n');
  return out;
}

// The island worker as a classic (non-module) script: engine + worker code.
export function workerBundle() {
  return `${engineBundle()}\n${read('viewer/island-worker.js').replace(IMPORT, '')}`;
}
