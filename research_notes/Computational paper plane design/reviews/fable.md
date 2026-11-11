# Aviato design review (Fable)

## Bottom line

The optimizer is not the bottleneck: the simulator and objective are being exploited today. I ran the engine read-only against `results/*.json`:

| Finding | Evidence |
|---|---|
| Hangtime "best" (score 10.00) is a perpetual-motion machine | Yaw-spins at ~55 rad/s and *climbs* from 1.4 m (t=5 s) to 7.2 m (t=40 s). Total energy rises 70 → 351 mJ; aero power F·u + M·ω = +0.12 W. All 10 scenarios hit `maxTime`, so the score saturated at 40 × the 0.25 `smFactor` floor (sm = −0.26). |
| Distance "best" (17.86) is not foldable | 14 cm stick, S = 0.0073 m² (12% of the sheet), 16 plies per half at the wing hinge, 32 through the keel (~3 mm). It would spring open without tape. |
| Lateral travel counts as distance | "Sloppy release" is credited 18.4 m while landing 11.1 m sideways (downrange 14.7 m): `simulate` returns `hypot(x, y)`. |
| Aero is miscalibrated | Dart: L/Dmax 3.6 (Ng: 5.0), CD0 0.0285 (≈0.02), CL 0.53 at wing α = 30° (≈1.0). AR 2.4 flat wing: CLmax 0.97 at 26°, no stall before (Ananda: 0.55–0.7 at ≈10°). |
| Search collapsed | Final population best 17.86, median 17.83; ~20% of evaluations invalid. |

## 1. Architecture

**Right:** forward fold simulation, exact mass from facets, Γ linear in (u, ω), one engine for Node and browser, re-simulate-before-trust.

**Wrong:**
- **Trim and launch are genes.** Elevator angle, launch pitch and bank are what a human tunes per plane. In the genome they are co-adapted with geometry, so most geometry moves are rejected. The winning launch pitch (−3.6° on [−4, 30]) sits on its bound.
- **Categoricals are thresholded continua** (`g[0] >= 0.5`, `floor(g[1]*5)`, `t < 0.72`) inside one population.
- **Constraints are discounts.** The optimizer buys metres exactly where the sim is least valid.
- **No foldability, thickness or retention model.** Layers stay shut for free.
- **What is printed is not what is simulated.** `instructions.js` rounds to 1 mm / 5°; the genome is continuous.

**Most elegant design: sketch + holes + policy.**
- *Sketch* (discrete): a sequence of typed fold operations. It is the niche key of a quality-diversity archive.
- *Holes* (continuous, 8–16 D): each operation's parameters, decoded onto feasible intervals and snapped to 1 mm / 1° *before* evaluation.
- *Policy* (inner loop, not genes): elevator from a static trim solve (add elevator as a 7th column of `Gf`), launch pitch from a 1-D search on the nominal throw. The tutorial ends with a trim procedure, not "bend 12.6°".
- *Evaluation ladder:* foldability → static aero (trim, margin, launch-q structure) → 6-DOF on joint scenarios → 256-scenario audit.

## 2. Optimization strategy

Swapping JADE for CMA-ES on the current genome would buy a few percent; niching, constraints and the objective buy far more.

**Recommended stack**

1. **Outer: MAP-Elites keyed by sketch** (orientation × operation-type sequence × body-fold direction, 10²–10³ niches). Structural mutations (insert, delete, retype, swap) spawn niches from elites and inherit their holes.
2. **Inner: plain CMA-ES per niche.** D = 8–16, λ = 12 (three batches on 4 cores), σ₀ = 0.2, two IPOP restarts (λ × 2) after 20 generations with < 0.5% gain. Integers live in the key, so no margin variant is needed. L-SHADE (N 12·D → 4, H = 6, with archive) is an acceptable fallback; the current JADE has no archive.
3. **Budget by successive halving.** An evaluation is 0.35–0.55 s (measured), so about 25k per hour on 4 cores and 200k overnight. Rungs: 300 evaluations for every niche, 900 for the top third, 2,700 for the top ninth.
4. **Deb feasibility rules, checked before flight**, with graded violations:
   - ply ≤ 8 at any crease; crease spacing and features ≥ 8 mm
   - keel grip ≥ 12 mm at the CG
   - static margin 5–25%; a stable trim exists at CL 0.15–0.5
   - launch-q deflection limit; no unlocked outer flap > 4 cm²
   - crash fraction ≤ 2/16 (checked after flight)

   Infeasible designs never fly. Delete `flexFactor`, `gripFactor`, `smFactor`.
5. **CVaR over joint scenarios with common random numbers.** The current list varies one factor at a time, so `0.4·min` is not a tail of anything. Use K = 16 scrambled-Sobol draws over ~12 factors with a fixed seed. Score = mean of the worst 8 (CVaR₅₀). Audit elites on 256 fresh draws and rank on P25.
6. **Exact racing replaces the pre-screen.** After 8 scenarios, the mean of the 8 lowest seen is an upper bound on the final score; abort once it drops below the incumbent. `q.score * 1.25 < threshold` is a heuristic.
7. **No GP or neural surrogate.** The landscape is discontinuous and evaluations are cheap; the physics ladder is the multi-fidelity scheme.

**Volunteer islands.** The shared document *is* the archive, keyed `(engineHash, mission, scenarioSetId, sketch)`. Each tab runs one CMA emitter on a niche chosen by Thompson sampling on recent improvement, and writes by compare-and-set after two independent re-simulations agree within 0.5% (transcendental functions differ across JS engines). Fixes for `viewer/island-worker.js`:
- `report()` posts the genome rounded to 6 dp with the score of the unrounded genome.
- Migrants replace the worst member immediately and every island seeds the same classics, so islands homogenise.
- There is no engine version in the stored record.

## 3. Design representation

- **State:** keep facet transforms; add a per-cell stack order (FOLD `faceOrders`).
- **Operations:**
  - `Fold(line, side, k, M|V)`: some-layers fold with hinge closure; all-layers is k = ∞.
  - `BodyFold(M|V)`: `foldPlane` hard-codes valley, flaps inside. Suzanne uses mountain.
  - `Pleat`: two parallel folds, the standard CG mover.
  - `ReverseFold(spine, line)`: fins and blunt noses after the body fold.
  - `Tuck(flap, pocket)`: the Nakamura lock.
  - Skip squash and petal folds.
- **Lines by reference.** Each operation picks from a small catalogue (point-to-point, edge-to-crease, through-landmark-at-angle) plus a snapped offset.
- **Feasible by construction.** Decode each hole as a fraction of the feasible interval computed from the current state. `fail('flap crosses centre line')` and the silent "skipped" folds disappear.
- **Variable length.** The sequence is the niche key, so each niche is fixed-length: no count gene, no dead slots.
- **Locks.** Derive a retention class per flap from the stack order: *trapped* (a later crease crosses it), *pocketed*, *sandwiched* (in the keel, held only where gripped), or *free*. Use it three ways:
  - stack stiffness n² for trapped or pocketed layers, n¹ for free ones (`wingStiffness` assumes n² everywhere);
  - free outer flaps spring open ~20°, costing drag and a constraint violation;
  - keel-opening stiffness scales with trapped length.

## 4. Physics: top five changes

1. **Passivity and rotation guards (first).**
   - `aero()` strips the chordwise Kutta–Joukowski component regardless of sign; remove only forward thrust.
   - Fade VLM to the plate model when |ω|c/V > 0.3: a body-fixed −x wake is meaningless in a spin.
   - Assert total energy never rises over a flight.
   - End the flight as "tumbling" at sustained |ω| > 15 rad/s (`flight.js` allows 300).
2. **Polhamus vortex lift and sweep-dependent stall.** Rotate the removed suction into normal force, weighted by leading-edge sweep, and include side edges. Set strip cl_max ≈ 0.65 for sweep < 30°, rising to a 30° stall at ≥ 60°. Targets: dart α_trim ≈ 5°, stall ≈ 30°; AR 2–5 plates CLmax 0.55–0.7.
3. **Drag build-up.** `FORM_CD = 0.012` on every wetted panel, keel included, gives the CD0 of 0.0285. Use ~0.004 on planform plus base drag proportional to blunt-edge frontal area (ply × thickness × length) plus a free-flap increment. Targets: dart CD0 ≈ 0.020, L/D 5 ± 0.5 at 4.9 m/s. Oswald e is already ≈ 0.42 at AR 2.4.
4. **Root-crease aeroelasticity, not bar-and-hinge, in the loop.** At 1 g the root crease carries ~4 mN·m/m against k_fold ≈ 0.01–0.02 N·m/(m·rad): 10–20° of dihedral change, more than plate bending. Add dihedral(q) and keel opening as two static degrees of freedom, keep the cantilever with real section properties, and solve at glide, launch-q and pull-up. Blend two precomputed aircraft by q. Bar-and-hinge is an offline audit only.
5. **Launch and build distributions** (the Sobol factors): speed lognormal, median 10 m/s (7–14); path angle ±6°; release α₀ ±4° (always 0 in `launchState`); sideslip ±3°; bank ±8°; rates σ = 1 rad/s; height ±0.15 m; symmetric dihedral ±8°; elevator ±5°; CG ±4 mm; CD0 × 0.8–1.4; CLmax × 0.8–1.1.

## 5. Exploits and guards

| Exploit | Guard |
|---|---|
| Energy-pumping spin | Passivity assert, tumbling cut-off |
| Lateral distance | Score downrange inside a ±3 m corridor |
| `maxTime` saturation | No time cap in the metric |
| 32-ply bricks | Ply, spacing and retention constraints |
| Unstable design at 25% score | Deb rules |
| Knife-edge launch genes | Inner policy plus joint noise |
| 4 mm elevators, 8 mm winglets | Minimum feature size; angles in 5° steps |
| Parachuting in hangtime | Stalled fraction < 20% for ≥ 80% of the flight |

## 6. Validation plan

- **Phase 0, no throws:** `scripts/calibrate.js` regression against the Ng dart and Ananda plates, plus the energy audit, run in `npm test`.
- **Phase 1:** six designs (dart, Nakamura, four elites from different sketches, one predicted-bad), 3 copies × 10 throws × 2 throwers.
  - 240 fps side video with a 1 m reference gives release speed, angle and α₀: this becomes the launch distribution.
  - Hand-released trim glides give L/D and speed (Ng's method).
  - A rear-view frame gives in-flight dihedral, which calibrates the crease spring.
- **Folding trial:** three naive folders work from the tutorial; measure crease errors.
- **Pass criterion:** Spearman ρ ≥ 0.7 between simulated and real medians. Then fit the CD0 multiplier, crease stiffness and CLmax, re-run, and throw five new elites.

## 7. Prioritized plan

1. **Guards** (1 day): passivity, tumbling cut-off, downrange metric, no time cap. `physics.js: aero`, `flight.js: simulate`, `evaluate.js`.
2. **Calibration harness and drag fix** (1–2 days): new `scripts/calibrate.js`; `FORM_CD`.
3. **Polhamus and sweep-dependent stall** (2–3 days): `aero`.
4. **Deb constraints, ply and feature limits, snap-before-evaluate** (2 days): `evaluate.js`, `design.js: decode`, `fold.js: layersAt`.
5. **Sobol scenarios, CVaR₅₀, exact racing** (1–2 days): `evaluate.js: SCENARIOS`, `scripts/worker.js`.
6. **Trim and launch as inner policy** (2 days): `buildAircraft`, `evaluate`.
7. **Sketch-keyed MAP-Elites with CMA-ES emitters** (3–4 days): rewrite `scripts/optimize.js`; then the archive protocol in `island-worker.js` (2 days).
8. **Root-crease aeroelastic degrees of freedom** (2–3 days): replace `wingStiffness`.
9. **Stack order, some-layers folds, `BodyFold(M|V)`, retention classes** (5–7 days): `fold.js`. Then pleat, tuck and reverse folds (4–5 days).
10. **Phase 1 throws** (2 days), then recalibrate.

Do not start step 7 before steps 1–5: a better optimizer on the current simulator only finds better exploits.
