# Design review brief: Aviato — computationally designing the best paper plane in the world

You are an independent senior reviewer (computational origami + low-Re aerodynamics + flight dynamics + black-box optimization). Another reviewer is answering the same brief separately; do not try to be agreeable — be specific, critical and opinionated.

## Goal
Find the best paper airplane that a person can fold by hand from ONE sheet (A4, 80 g/m²), and give them an animated, measured folding tutorial. Two missions: max distance (human throw) and max time aloft (thrown upward, indoor ceiling ~9 m).

## Hard constraints
- Pure folding only: NO tape, NO cuts, NO glue (stricter than Guinness rules). Layers must be held by folds (locks) or friction.
- Must be foldable by a normal person with a ruler; instructions must be measurable.
- Compute: a laptop limited to ~4 CPU cores (owner's Mac overheats), plus optional volunteer browsers (a shared web page where each open tab runs an "island" of the optimizer in Web Workers, posts its top designs to a shared document store, and re-simulates every design it sees before trusting it; island model with migration).
- Everything is JavaScript (Node for offline optimization; same engine bundled into the browser).

## Current implementation (read the code: /Users/pedronobre/aviato/src/*.js, scripts/optimize.js, viewer/island-worker.js)
- design.js: 24-D genome in [0,1]: orientation, up to 4 nose folds (mirrored diagonal pair through a point on the centre line, or horizontal nose fold-down), wing hinge line (keel depth at nose/tail), dihedral, winglets, full-span elevator bend, launch pitch & bank.
- fold.js: facets with 2D rigid transforms + layer index; ALL-LAYER simple folds only; validity = flap may not contain centre-line material or cross the centre line. Then phase B maps the body-folded half to 3D (keel, wing, winglet, elevator rotations).
- physics.js: mass/CG/inertia from facets; vortex-lattice (horseshoes, wake along body −x) on wings, merged keel, winglets (~80 panels); Γ precomputed linear in (u, ω) so each eval is O(N); KJ forces with induced velocity; 20% leading-edge suction retained; laminar Cf + 0.012 form drag; per-strip stall blend to flat-plate normal force CN=1.17 sin^0.6 α, using effective α (from strip cl) and geometric/reversed flow; 2D-strip added mass; wing flex = crude cantilever from layer counts (penalty); static margin computed at V=6 m/s.
- flight.js: 6DOF RK4 dt=2 ms with apparent mass on inertial acceleration.
- evaluate.js: 10 deterministic scenarios (pitch ±6°, speed ±15%, sloppy release, asymmetric fold 3°, elevator ±3°, CG 5 mm aft); score = 0.6 mean + 0.4 min, × penalties (flex, keel grip, static margin <7%).
- optimize.js: JADE-like DE, pop 64, 160 gens, nominal-throw pre-screen. Current distance best ≈17.8 m robust at 12 m/s launch (classic dart 7.6 m). Classic dart sim: ~10.7 m nominal, trim L/D max ~3.7.

## Research notes (read them all): /Users/pedronobre/aviato/research_notes/Computational paper plane design/*.md
computational_origami.md, low_re_aerodynamics.md, paper_structure_and_launch.md, record_planes.md, optimization_validation.md.

## What I need from you (write ≤ 1800 words, markdown)
1. **Verdict on the overall architecture**: what is fundamentally right/wrong. What would the most elegant end-to-end design look like?
2. **Optimization strategy (headline question)**: is JADE-DE + 10 fixed scenarios + multiplicative penalties the right approach? Compare concretely to BIPOP/CMA-ES with margin (mixed-integer), L-SHADE, MAP-Elites/quality-diversity, surrogate/multi-fidelity, Deb feasibility rules, CVaR objectives, common random numbers, and how all this maps onto the volunteer island model. Give the recommended algorithm stack and its parameters for our budget.
3. **Design representation**: how to extend beyond all-layer simple folds (some-layers folds, reverse folds, locks) elegantly; how to encode variable-length fold sequences; how to make infeasibility impossible by construction; how to represent "layers held by locks vs free to spread" since no tape is allowed.
4. **Physics fidelity**: the top 5 changes that most reduce sim-to-reality error (calibration targets from the notes: Ng 2009 dart L/D≈5 at 4.9 m/s, α_trim≈5°, stall ≈30° with vortex lift; flat plate CLmax 0.55–0.7; low Oswald e; CD0 range), Polhamus vortex lift in VLM, structural flex (bar-and-hinge static solve at 3 load cases vs our cantilever), launch distributions.
5. **Exploits**: ways the optimizer will still cheat the simulator, and guards.
6. **Validation plan** with real throws.
7. **A prioritized implementation plan** (ordered list with effort estimates), referencing specific files/functions in the repo.
