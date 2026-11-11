# <img src="public/logo.svg" width="36" alt="" align="top"> Bestfold

**[bestfold.org](https://bestfold.org)**: watch the planes fly, learn to fold them, and help the search from your browser.

Bestfold is an attempt to design the best paper plane in the world by simulation. Every design is folded by hand from a single sheet of A4 paper, and only folded: nothing is cut, taped or glued, so the folds have to hold the plane together.

It takes an A4 sheet of 80 g/m² paper, folds it in a geometric fold engine, computes mass and aerodynamics from the folded layers, and flies the result in a six-degree-of-freedom simulator through 16 randomised throws. Designs that could not be folded or would not fly sensibly are rejected outright. The best design becomes a folding tutorial with measured step diagrams. The search runs offline, and also in visitors' browsers: anyone can leave the site open to help, and the server re-simulates every design they submit before accepting it.

This repository started five years ago as **Aviato**, a small Python experiment that generated random crease patterns and plotted them (still in the git history). I never had the time to finish it. In 2026 I picked it up again with Claude and finally built what I had in mind: a real fold engine, a physics model checked against wind-tunnel data, a robust search, and a way for anyone to contribute.

## Current results

The best design for each mission so far. Every design gets a generated name: an adjective, a word that fits the mission, and a Roman numeral for its number of nose folds.

| | Solar Quill III (distance) | Lone Petrel IV (time aloft) |
|---|---|---|
| Score: average of the worst 8 of 16 imperfect throws | **14.2 m** | **5.4 s** |
| Clean throw | 18.4 m | 5.0 s |
| Classic dart, same test, best trim | 3.3 m | 3.3 s |
| Sheet | A4 landscape | A4 portrait |
| Folds before the body fold | 2 corner folds, nose fold-down | 3 corner folds, nose fold-down |
| Wingspan / wing area | 11.4 cm / 142 cm² | 19.6 cm / 248 cm² |
| Throw | 11 m/s, slightly downward | 15 m/s, 58° up, slight bank |

These are simulation results from about 47 000 simulated planes per mission. They have not yet been checked against real throws (see [Validation](#validation)). Folding instructions and printable step diagrams for both planes are in `results/` and on the site.

## Contents

- [Current results](#current-results)
- [How it works](#how-it-works)
- [Physics model](#physics-model)
- [Limitations](#limitations)
- [Quick start](#quick-start)
- [Deploying to Vercel](#deploying-to-vercel)
- [Repository layout](#repository-layout)
- [Validation](#validation)
- [Credits](#credits)
- [License](#license)

## How it works

```
genome ─► fold engine ─► mass + aerodynamics ─► trim & launch policy ─► 6-DOF flights ─► robust score ─► search
          (fold.js,       (physics.js)          (evaluate.js)            (flight.js)       (evaluate.js)    (optimize.js,
           retention.js)                                                                                  island-worker.js)
```

### 1. Design space: `src/design.js`, `src/sketch.js`

A design has two parts: a discrete **sketch** and a continuous parameter vector.

- **Sketch:** sheet orientation, then a sequence of up to four nose operations, then body-fold direction and winglets.
  - Nose operations: `d` corner fold, `t` nose fold-down, `k` Nakamura lock, `p` pleat.
  - Body fold: valley (flaps inside the keel) or mountain (flaps outside).
  - A small grammar keeps the sequences meaningful. A pleat can only come first. A lock must come last, after a nose fold followed by a corner fold.
  - This gives 416 sketches.
- **Continuous parameters:** 6–16 numbers in [0, 1].
  - Fold angles and depths.
  - Keel depth at nose and tail.
  - Dihedral.
  - Winglet width and angle.
  - Elevator chord.
  - Target trim lift coefficient.
  - Launch bank.

Decoding snaps lengths to 1 mm and angles to 1°, so **the plane in the printed tutorial is exactly the plane that was simulated**.

The elevator angle and the launch pitch are not genes. They are solved for each plane, the way a person trims and throws one (see step 4).

### 2. Fold engine: `src/fold.js`, `src/retention.js`

The sheet is modelled as a set of convex facets. Each facet has a 2D rigid transform and a position in a global layer order.

- **All-layer simple folds** (corner folds, nose folds, the body fold): split every facet on the fold line, reflect the moving side, and restack it.
- **Some-layer folds** (the Nakamura lock, the second crease of a pleat): move only the selected flap plus everything hinged to it off the fold line.
  - The fold is rejected if it would tear the sheet (a hinge closure crossing the line).
  - It is also rejected if it would drag a flap through a layer lying on top of it.
- **Layer-order checks:** after each step, a taco–tortilla check confirms that no layer ends up between the two layers of a fold.
- **Flap retention** (`retention.js`): every flap is classified from the stacking order:
  - **trapped:** a later crease or a lock tab holds it;
  - **pocketed:** it sits inside a later fold;
  - **sandwiched:** it sits inside a valley-folded keel;
  - **free.**

  Free flaps spring partly open in flight and add drag. A free flap larger than 4 cm² makes the design infeasible, because only the folds could hold it shut.
- **Phase B:** the flat, body-folded state is mapped to 3D: keel, wings at their dihedral, winglets and elevator.

### 3. Mass and aerodynamics: `src/physics.js`

- **Mass, CG and inertia** come from every layer of every facet (80 g/m²).
- **Vortex-lattice aerodynamics** run on the wings, keel and winglets.
  - Circulation is precomputed as a linear function of body velocity and rates, so each force evaluation costs O(N).
- **Corrections on top of the lattice** (summarised in [Physics model](#physics-model)):
  - leading-edge suction and vortex lift;
  - stall;
  - viscous and base drag;
  - added (apparent) air mass;
  - a passivity guard.

### 4. Per-plane policy and feasibility: `src/evaluate.js`

`prepare()` builds each plane and decides whether it may fly at all. These are Deb-style feasibility rules: an infeasible design is never flown, and it is ranked only by how far it is from feasible.

| Rule | Limit |
|---|---|
| Layers at any crease | ≤ 8 per half |
| Largest unlocked flap | ≤ 4 cm² |
| Lock step | Must actually be foldable if the sketch asks for one |
| Trim | Elevator angle for Cm = 0 at the target C_L must lie in −8°…20° |
| Wings at launch | Dihedral plus root-crease flex at 2.5 g must stay under 70° |
| Static margin | 5–25 % of mean chord |
| Keel depth at the CG (grip) | ≥ 12 mm |
| Tumbles | At most 2 of the 16 throws (checked after flight) |

How the policy is set for each plane:

- **Elevator:** the angle is solved for static trim at the design's target lift coefficient.
- **Launch pitch:** found by a short 1-D search on the nominal throw.
- **Glide dihedral:** solved statically from crease springs at the wing root and the keel. The simulator then blends between the plane at that dihedral and a twin with the wings raised further, according to load factor.

### 5. Flight: `src/flight.js`

- **Integration:** a 6-DOF rigid body with quaternions, RK4 at 4 ms during search and 2 ms by default, and added mass in the equations of motion.
- **Guards:** the flight ends with zero score if any of these happen:
  - total mechanical energy (including the apparent mass) rises by more than 2 %;
  - the plane spins faster than 15 rad/s for 0.5 s;
  - the integration diverges.
- **End of flight:** first ground contact, or the 9 m ceiling.
- **Metrics:**
  - Distance is downrange travel inside a ±3 m corridor. Sideways travel does not count.
  - Hang time is time aloft. There is no time-cap reward.

### 6. Robust score: `src/evaluate.js`

Each feasible design flies 16 joint scenarios. The scenarios are drawn once by Latin hypercube with a fixed seed, so every design sees the same throws (common random numbers).

| Factor | Range |
|---|---|
| Throw speed | lognormal, σ = 15 % |
| Path angle | ±6° |
| Release angle of attack | ±4° |
| Sideslip | ±3° |
| Bank | ±8° |
| Body rates | σ = 1 rad/s |
| Release height | ±0.15 m |
| Folding errors | 4 "copies" with symmetric and asymmetric dihedral (±6°, ±3°), elevator (±3°, ±3°) and CG (±4 mm) errors |
| Model uncertainty | CD0 × 0.8–1.4, CLmax × 0.8–1.1 |

**Score = CVaR₅₀**, the mean of the worst 8 of the 16 outcomes.

After 8 scenarios, the mean of the worst 8 seen so far is an upper bound on the final score. A candidate is stopped as soon as that bound falls below the threshold (exact racing).

Missions:

- **Distance:** 11 m/s throw from 1.7 m.
- **Hang time:** 15 m/s throw at 30–85° pitch, 9 m ceiling.

### 7. Search: `scripts/optimize.js`

Quality-diversity search over sketches:

- **MAP-Elites archive:** keeps one elite per sketch (416 niches).
- **CMA-ES emitter per niche** (`src/cmaes.js`):
  - λ = 12;
  - σ₀ = 0.25;
  - IPOP-style restarts from the elite when progress stalls (λ doubles, up to 48).
- **Successive halving:**
  - every niche gets a short run;
  - the best third get 3× the budget;
  - the best ninth get 9×.
- **Seeding:** classic designs (dart, Nakamura lock, wide glider) seed their niches. A previous `results/<mission>.json` warm-starts the rest.

### Volunteer search ("Fly together")

The web app can also run the search in visitors' browsers:

1. A visitor presses **Start contributing**. The page starts 1–4 Web Workers ("islands", `viewer/island-worker.js`).
2. Each island picks a sketch: rank-weighted from the shared archive, or uniformly at random 20 % of the time. It runs a short CMA-ES inside that sketch.
3. When an island beats the known elite for a sketch, the page `POST`s the genome to `/api/board`.
4. **The server does not trust the submitted score.** It re-simulates the genome with the same engine and the same 16 scenarios. It accepts the design only if it is feasible and better than the stored elite for that sketch, and it stores the score it computed itself. A submission cannot claim a score its genome does not earn.
5. Pages pull the verified board, show it as a leaderboard, and feed the best designs back to their islands as migrants.
6. `/api/presence` counts active contributors.

Storage is Upstash Redis in production, and an in-memory store when the Upstash variables are not set (local development).

Re-simulation shows that a design is reproducible on the engine. It says nothing about whether the engine is right about real paper: that is the job of [validation](#validation).

## Physics model

| Component | Model | Where |
|---|---|---|
| Mass properties | Exact from folded facets, every layer counted, 80 g/m² | `massProps` |
| Lift | Vortex lattice (horseshoe vortices, 30 m wake along body −x, 3 mm core), sine-spaced on wings | `buildAircraft`, `assembleAircraft` |
| Leading-edge suction | 20 % retained as thrust on sharp paper edges; the rest is removed, or, on swept edges, rotated into normal force (Polhamus suction analogy) scaled by sweep (25°→60°) | `aero` |
| Stall | Per strip: unswept edges stall near 10° / CL ≈ 0.62, swept edges hold to ≈30°; blended into a flat-plate normal-force model (CN = 1.17 sin^0.6 α); also blended in reversed flow, mostly spanwise flow and fast rotation (ωc/V > 0.3) | `aero` |
| Drag | Laminar skin friction (both sides) + 0.004 planform roughness + blunt-edge base drag on ply-count × 0.1 mm frontal area + open free flaps | `aero` |
| Passivity | A strip can never do positive work on the plane; any excess is removed as drag | `aero` |
| Added mass | 2D strip theory, reduced for finite aspect ratio | `assembleAircraft` |
| Structure | Rigid panels; root and keel creases are torsional springs (0.015 N·m/(m·rad) per ply), lock tabs stiffen the keel | `prepare`, `withFlex` |
| Dynamics | 6-DOF, quaternions, RK4, energy audit | `simulate` |

### Calibration targets (`scripts/calibrate.js`)

| Check | Target | Source |
|---|---|---|
| Flat plate, AR 2.4: CLmax | 0.55–0.75 | Ananda, Sukumar & Selig 2015 |
| Flat plate, AR 2.4: post-stall | CL(12°) 0.50–0.72, then a plateau (ΔCL 12°→25° < 0.12) | Ananda et al. 2015 |
| Flat plate, AR 2.4: lift slope | Within 20 % of Helmbold | Ananda et al. 2015 |
| Flat plate, AR 2.4: CDmin | 0.008–0.03 | Ananda et al. 2015 |
| Sharp 67° delta: stall | 22–38° (vortex lift) | Polhamus 1971 |
| Sharp 67° delta: CL(15°) | Within 30 % of the Polhamus formula | Polhamus 1971 |
| Classic A4 dart: max L/D at 4.9 m/s | 4.3–5.7 | Ng et al. 2009 (L/D ≈ 5) |
| Energy audit | A hard-spinning release gains no energy | — |
| Regression | A saved "perpetual spinner" exploit from an earlier engine no longer stays aloft | — |

Bibliographic details for every source are in [REFERENCES.md](REFERENCES.md).

### What `npm test` checks

`npm test` runs `scripts/calibrate.js` (the table above), then `scripts/test-folds.js`.

`test-folds.js` checks:

- **Some-layer folds:** they move only the selected layers, they land on top in reverse order, and a fold attempt leaves its input untouched.
- **Rejections:**
  - folding a lower layer up through the layer above it;
  - folding one half while it is joined at the keel (a tear).
- **Nakamura lock:**
  - it traps both second corner flaps;
  - the keel's locked length equals the tab depth;
  - the per-cell stack under the tab is in the right order;
  - a too-deep lock is reduced to the deepest foldable whole millimetre.
- **Retention classes:**
  - the dart has no free flaps;
  - dog-ears are free;
  - valley body fold gives sandwiched flaps, mountain body fold gives free ones;
  - pocketed flaps are detected;
  - free flaps add drag and trigger the 4 cm² violation.
- **Layer order:** the taco–tortilla check catches an injected stray layer.
- **Genomes:**
  - legacy genomes still decode;
  - the Nakamura lock round-trips through the genome;
  - the sketch grammar accepts and rejects the right sequences.
- **Every sketch:** each of the 416 decodes and folds for random parameters, round-trips through the genome, and passes the layer-order check on a sample of planes.

## Limitations

- **Rigid panels.** Paper bends, curls and twists. The model has only two flexible degrees of freedom: the root and keel creases, as linear springs. Panel bending, camber from curl, and crease creep or rest-angle drift are not modelled.
- **Quasi-steady aerodynamics.** The vortex lattice has a fixed straight wake. There is no dynamic stall, no unsteady wake and no vortex breakdown. Stall and post-stall come from a blended flat-plate model.
- **Uncalibrated constants.** The following were taken from the literature or from engineering judgement and have not been fitted to measurements of Bestfold planes:
  - `SUCTION` = 0.2: fraction of leading-edge suction kept.
  - `FORM_CD` = 0.004: planform roughness drag.
  - `BASE_CD` = 1.0: base drag of blunt edges.
  - `FREE_FLAP_OPEN` = 20°: opening angle of a free flap.
  - `K_CREASE` = 0.015 N·m/(m·rad) per ply: scaled from a 120 g/m² measurement.
  - `KEEL_LOCK_GAIN` = 10: keel stiffening from a lock tab.
  - The free-flap limit of 4 cm².
  - The vortex-lift sweep window (25–60°) and the stall angles.
  - The plate normal-force curve.
  - The added-mass factor.
  - The 2.5 g launch load.
  - The static-margin band.
- **Calibration is partial.** The A4 dart check covers maximum L/D only. The trim angle (≈ 5°) and stall angle (≈ 30°) reported for the dart by Ng et al. are not yet regression targets. Low-Re form drag of slow, high-aspect-ratio gliders, which the research report flags as the largest single error, has no target.
- **Folding is limited to the grammar.** Reverse folds, squash folds and tucks into pockets are not modelled. They interleave layers, and the engine keeps a single global layer order. A valid fold sequence is checked step by step for tearing and layer order. It is not checked for a collision-free motion path, or for the effect of paper thickness on a hand fold.
- **Launch distributions are assumed, not measured.** Throw speeds (11 and 15 m/s), angles and rates are engineering estimates.
- **No real-throw validation yet.** The validation protocol and analysis tooling exist, but no measured throws have been compared with the simulator. Until they are, scores rank designs inside the model. They are not predictions of metres or seconds with real paper.

## Quick start

Requires Node.js 20.9 or newer (Next.js 16). The engine and the offline scripts have no runtime dependencies; the web app uses Next.js, three.js and the Upstash Redis client.

```sh
npm install

# Web app at http://localhost:3000 (volunteer board uses an in-memory store
# unless the Upstash variables below are set)
npm run dev

# Calibration checks + fold-engine tests
npm test

# Offline search. Arguments: mission (distance | hangtime), budget per niche at
# the first rung (default 96; later rungs get 3x and 9x), random seed (default 1).
# Writes results/<mission>.json. BESTFOLD_WORKERS sets worker threads (default 4).
BESTFOLD_WORKERS=4 node scripts/optimize.js distance 96 1

# Print the physics report for a result: polar, per-scenario flights, trajectory
node scripts/inspect.js distance

# Evaluate the classic reference designs (dart, Nakamura lock, wide glider)
node scripts/sanity.js distance

# After a search: ship its results to the app (public/data/bestfold.json) and write
# results/instructions-*.md and printable step diagrams results/diagrams-*.svg
npm run prepare-data

# Single-file version of the app: dist/bestfold.html
npm run build:artifact
```

A full offline search is CPU-heavy: it keeps `BESTFOLD_WORKERS` threads busy for the whole run (about 45 minutes per mission with 4 workers). `node scripts/prepare-data.js <dir>` ships results from another folder.

## Deploying to Vercel

1. Create an Upstash Redis database. Through the Vercel Marketplace integration is easiest, or create one directly at upstash.com.
2. Import the repository in Vercel. The framework preset is Next.js and no build settings need changing.
3. Set these environment variables for Production (and for Preview if previews should share or have their own board):

   | Variable | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | REST URL of the Redis database |
   | `UPSTASH_REDIS_REST_TOKEN` | REST token of the Redis database |

   The Vercel Marketplace integration may name them `KV_REST_API_URL` and `KV_REST_API_TOKEN`; both spellings work.

4. Deploy.

Without the two variables the API falls back to the in-memory store. That store is per server instance and is lost on cold start, so it is only suitable for local development.

Because `/api/board` re-simulates every submission (about 0.6 s locally), the route sets `maxDuration = 30`. It also rate-limits submissions per IP (12 per minute).

The single-file build (`dist/bestfold.html`) runs without a server: as a claude.ai artifact it keeps the board in the artifact's shared storage, and every browser re-simulates designs before trusting them.

## Repository layout

| Path | Contents |
|---|---|
| `app/` | Next.js App Router: `page` + `Viewer` (mounts the viewer), `api/board` (submit and list verified designs), `api/presence` (active contributors) |
| `lib/` | Server helpers: `store.js` (Upstash Redis or in-memory), `verify.js` (re-simulation of submissions) |
| `public/` | `data/bestfold.json` (shipped results, from `prepare-data`), `island-worker.js` (generated by `build-worker`) |
| `src/` | Simulation engine shared by Node, the browser and the API: `design`, `sketch`, `fold`, `retention`, `physics`, `flight`, `evaluate`, `cmaes`, `instructions`, `template`, `geom` |
| `viewer/` | Client code shared by both builds: `app.js` (3D hero, flight lab, wind tunnel, evolution explorer, folding tutorial, Fly together), `community.js` (board backends: hosted HTTP API or claude.ai artifact storage), `island-worker.js`, `markup.html`, `styles.css`, `head.html` |
| `scripts/` | `optimize.js` + `worker.js` (offline search), `calibrate.js` and `test-folds.js` (tests), `sanity.js` and `inspect.js` (reports), `engine-version.js` (writes `src/version.js`), `prepare-data.js` (results → `public/data/bestfold.json`, printable instructions and diagrams), `bundle.js`, `build-worker.js` and `build-artifact.js` (browser bundles) |
| `results/` | Search output per mission (`<mission>.json`, `.log`), generated instructions (`instructions-*.md`) and printable step diagrams (`diagrams-*.svg`), and the saved exploit used as a regression test |
| `validation/` | Real-throw tooling: `throw-log.html` (offline phone logger and video-frame helper), `analyze.js` (ranking statistics and refit), `test/` (synthetic data that exercises the analysis) |
| `docs/` | `PLAN.md` (v2 engineering plan and status), `VALIDATION.md` (throw protocol) |
| `reports/`, `research_notes/` | Literature review behind the v2 design, and the two independent design reviews (`research_notes/.../reviews/`) |
| `dist/` | `bestfold.html`, the single-file build (`npm run build:artifact`), used for the claude.ai artifact; not committed |

## Validation

Real-throw validation has not been run yet. [`docs/VALIDATION.md`](docs/VALIDATION.md) defines the protocol:

- **Designs:** six, including a classic dart, the Bestfold champion, two elites from different MAP-Elites cells, and a predicted-bad control.
- **Throws:** 3 copies × 10 scored throws of each design, filmed side-on at 120–240 fps.
- **Pass criterion:** Spearman ρ ≥ 0.7 between the simulated and measured per-design medians, with the predicted-bad control finishing last or second-last.
- **Refit:** after a pass, refit three parameters (CD0 multiplier, crease stiffness, CLmax multiplier) on four designs, and check them on the two held-out designs.

Tooling:

- `validation/throw-log.html` records throws on a phone and extracts launch speed and angle from video frames.
- `node validation/analyze.js log.csv predictions.json` computes medians, Spearman ρ with a two-stage bootstrap CI, bias, and the refits.

## Credits

Bestfold grew out of **Aviato**, a project I started in late 2021 and never finished. The original prototype generated random crease patterns and plotted them in 2D and 3D; it lives on in the early commits of this repository.

Version 2, Bestfold, was built in 2026 with Claude (Anthropic) as a coding and research partner. Its design came from three inputs:

- a literature review of computational origami, low-Reynolds-number aerodynamics, paper mechanics, record planes and optimisation (`reports/`, `research_notes/`);
- two design reviews written independently by different AI models from the same brief;
- the engineering plan that consolidates them (`docs/PLAN.md`).

The reviews caught the main simulator exploits (an energy-gaining spin, sideways travel counted as distance, unfoldable many-layer designs) and shaped the guards, the feasibility rules, the robust score and the search.

Every published measurement and method the engine relies on is cited in [REFERENCES.md](REFERENCES.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
