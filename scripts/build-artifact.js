// Builds the single-file version of the viewer (dist/bestfold.html) for hosts without a build step
// (e.g. a claude.ai artifact). A tiny bundler wraps each module in its own function scope; the
// engine also ships as a string so the page can start island Web Workers from a Blob.
// Needs public/data/bestfold.json (scripts/prepare-data.js).
import { writeFileSync, mkdirSync } from 'node:fs';
import { read, createBundler, engineBundle, workerBundle } from './bundle.js';

const root = new URL('../', import.meta.url);
const THREE_VERSION = '0.186.1';
// The page needs the engine too (the viewer imports it); its bindings share one scope with the viewer.
const engine = engineBundle();
const { wrap } = createBundler();
const viewer = wrap('community', read('viewer/community.js')) + wrap('app', read('viewer/app.js'));
const data = read('public/data/bestfold.json');

const page = `${read('viewer/head.html')}<style>
[hidden] { display: none !important; }
${read('viewer/styles.css')}</style>
${read('viewer/markup.html')}
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
${engine}
${viewer}
const workerUrl = URL.createObjectURL(new Blob([${JSON.stringify(workerBundle())}], { type: 'text/javascript' }));
__m_app.mountBestfold({ data: ${data}, community: __m_community.claudeCommunity(), createWorker: () => new Worker(workerUrl) });
</script>
`;
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/bestfold.html', root), page);
console.log(`dist/bestfold.html  ${(page.length / 1024).toFixed(0)} KB`);
