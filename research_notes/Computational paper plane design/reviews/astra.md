**1. Verdict**

The architecture is promising, but the current winners are not credible evidence of superior physical airplanes. Keep the shared JavaScript engine, forward fold history, facet mass accounting, and precomputed aerodynamic responses. Put physical validation ahead of broader optimization.

I read all five research notes and the referenced code. I reproduced the distance score of **17.858**, versus **7.59** for the dart. More seriously, the saved hang-time winner reaches the **40-second timeout in every scenario**. Nominally, it spins near 55 rad/s and climbs from 1.43 m at 5 seconds to 7.17 m at 40 seconds. Halving the timestep preserves this behavior. This is an unresolved simulator exploit.

The clean end-to-end design is: **measured fold program → verified connected geometry → calibrated structural/aerodynamic model → diverse robust search → physical trials → regenerated tutorial**. The tutorial’s rounded dimensions must define the evaluated airplane.

**2. Optimization strategy**

JADE-like DE is an acceptable baseline. Ten fixed perturbations and multiplicative penalties are the weaker choices. The scenarios mostly change one variable at a time; they miss interacting errors. Multipliers let exceptional simulated performance compensate for instability or structural weakness. The hang-time winner illustrates this: negative static margin merely reduces its timeout reward.

My recommended starting stack:

| Component | Recommendation |
|---|---|
| Global search | Small-budget L-SHADE variant: population 64→8, memory size 6, initial F/CR=0.5, p-best fraction 0.11, archive capacity 1.4×population. |
| Local refinement | Full-covariance BIPOP-CMA-ES within fixed fold topologies: initial population 12, normalized σ=0.2; large restarts 24/48, interleaved smaller runs. |
| Diversity | Small MAP-Elites archive: 8 aspect-ratio bins × 6 fold-complexity bins, retaining topology diversity within cells. |
| Allocation | Reserve 20% for audits; divide search expenditure approximately 60% DE, 25% CMA, 15% structural mutations. |
| Budget | Initially cap each mission at 100,000 trajectory evaluations or one hour, whichever arrives first; maximum four active workers, including verification. |

These are engineering starting settings, not demonstrated optima. L-SHADE adds success-history adaptation and population reduction to the existing approach; benchmark it against corrected JADE over five seeds at equal CPU expenditure. [L-SHADE paper](https://ryojitanabe.github.io/pdf/tf-cec2014.pdf)

CMA’s covariance suits coupled hinge, trim and launch variables. Integer margins prevent premature discretization collapse; start with margin \(1/(d\lambda)\). However, fold types are unordered categories: ordinary CMA-ES with Margin does not solve that representation problem. Keep topology outside CMA initially; consider CatCMAwM later. [CMA-ES with Margin](https://arxiv.org/abs/2205.13482), [CatCMAwM](https://arxiv.org/abs/2504.07884)

MAP-Elites supplies physically testable alternatives when one aerodynamic assumption fails. It should supplement concentrated search, because illuminating many cells consumes evaluations. [MAP-Elites](https://arxiv.org/abs/1504.04909)

Replace penalties with **Deb feasibility rules**: feasible beats infeasible; feasible candidates compete on performance; infeasible candidates compete on normalized violation. Enforce actual construction and load limits. Treat the present 7% static-margin target as an unvalidated heuristic.

Use \(0.6\,\text{mean}+0.4\,\text{lower-tail CVaR}_{25\%}\): initially 16 joint scenarios, averaging the worst four for CVaR. Use common random numbers within comparisons, refresh every ten generations, and reevaluate parents when refreshing. Audit finalists on 256 untouched scenarios. Separate manufacturing/launch variability from uncertainty about the physics.

The nominal ×1.25 screen has no valid upper-bound argument. Replace it with staged evaluation and measured rejection error; fully evaluate 10% of screened-out candidates. Surrogates should prioritize evaluations only after demonstrating useful ranking accuracy. Start with geometry caching and aircraft reuse: quick evaluation currently rebuilds work repeated by full evaluation.

Volunteer islands should use independent seeds and varied search strategies. Exchange one or two diverse elites every 20 generations or 60 seconds. Reevaluate migrants on local scenarios before selection. Preserve the existing engine hash; add scenario/model identifiers, deduplication and bounded verification queues. Current unconditional replacement by repeatedly broadcast top-three migrants promotes homogenization. Re-simulation verifies reproducibility, not physical truth.

**3. Design representation**

Retain material-coordinate facets, but add crease adjacency, local overlap-cell stacks, and explicit moving-layer selections. A single global layer integer cannot express general interleaving.

Represent a design as a typed sequence of at most ten operations, with insert/delete/replace mutations and continuous parameters attached only to active operations. Prefer semantic references—“this exposed flap,” “this edge intersection”—over absolute coordinates.

Some-layer folds must select accessible top/bottom stacks and take connectivity closure across hinges that cannot remain stationary. Reverse folds need validated compound motion templates, including opening and refolding. Add locks before squash/petal folds.

“Infeasible by construction” is achievable only within a restricted, verified grammar. Sample operations whose geometric and accessibility preconditions hold; verify endpoint layering and the intervening motion. A valid flat-folded endpoint does not certify a collision-free path or finite-thickness hand fold. The notes overstate that implication. [Flat-folded-state research](https://erikdemaine.org/papers/FlatFolder_OSME2024/)

Model locks through a contact graph: captured edges, escape directions, overlap lengths, friction, crease restoring moments and opening/sliding thresholds. Covered layers are not automatically secured or bonded. Default free stacks toward additive layer stiffness; calibrate additional restraint experimentally.

There is already a connectivity defect: the wide-glider seed separates a shared material vertex by **2.09 mm** between winglet and elevator regions. Phase-B rotations must preserve shared boundaries or introduce physically valid transition folds.

**4. Five physics changes, in priority order**

1. **Audit high-rate dynamics and added mass.** Diagnose the spinning climb before tuning coefficients. Derive a consistent coupled added-mass formulation, including translation–rotation coupling and appropriate velocity terms. Check total energy accounting and dissipative forces; avoid double-counting potential-flow moments. Body-fixed wakes and blended strip forces need explicit limits in reverse flow and rapid rotation. Timestep refinement alone does not repair this failure.

2. **Calibrate drag and trim together.** Reproduce Ng’s geometry and angle reference before targeting L/D≈5 at 4.9 m/s, flight α≈5°, and stall≈30°. Our dart’s sampled maximum L/D≈3.7 is not its trimmed glide performance, and its geometry differs. Fit lift, drag and pitching moment jointly. [Ng et al.](https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf) Use CD0≈0.015–0.07 from the notes as a broad, geometry-dependent prior, not a universal setting. Measured Oswald factors of roughly 0.3–0.8 include viscous effects; adding that entire drag term atop VLM induced drag would double-count losses. [Ananda et al.](https://m-selig.ae.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)

3. **Separate swept-dart and moderate-AR stall physics.** Calibrate moderate-AR plates against CLmax≈0.55–0.7 and their moment break, rather than applying one effective-angle threshold universally. Those measurements used substantially thicker plates than paper. [Ananda et al.](https://m-selig.ae.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf) For swept sharp edges, implement a calibrated suction-analogy correction consistent with \(C_L=K_p\sin\alpha\cos^2\alpha+K_v\cos\alpha\sin^2\alpha\). Replace the relevant potential/suction contribution; do not append the whole formula to existing VLM lift. Include corresponding drag, moment and vortex-breakdown behavior. [Polhamus](https://ntrs.nasa.gov/api/citations/19710012498/downloads/19710012498.pdf)

4. **Replace the scalar flex penalty with deformation.** Use a small orthotropic bar-and-hinge model with crease rest angles and contact/slip. Solve three representative cases: hand-constrained launch acceleration plus aerodynamic load, transition/recovery, and trimmed glide. Iterate aerodynamic loads with shape and precompute deformed responses. Load cases require incidence and acceleration, not speed alone. Reject unresolved divergence; audit highly flexible finalists dynamically. The notes’ stiffness constants and assumed timescale separation need measurement.

5. **Measure release distributions.** Separate flight-path angle, attitude, AoA, sideslip and angular rates; fit their correlations. Current pitch scenarios rotate attitude and velocity together, leaving release AoA unchanged. Sample fold-location errors that propagate through mass, inertia and geometry. A fictitious CG translation is only a sensitivity probe. Optimize achievable launch speed/angle jointly; the 9 m ceiling can favor gentler duration launches.

**5. Remaining exploits and guards**

- **Disconnected material or fictitious lifting area:** verify shared-edge continuity and preserve disjoint chord intervals; `chordAlong()` currently spans gaps using extrema.
- **Timeout rewards:** mark unresolved trajectories as censored and audit them before ranking. Duration ends at first object contact; distance requires ground contact.
- **Point-body collisions:** detect nose/wing contact, not just CG height; interpolate ceiling events.
- **Numerical singularities:** check lattice conditioning, residuals and mesh/core sensitivity.
- **Unbuildable precision:** quantize measurements before evaluation, then perturb them within measured human tolerances.
- **Metric exploitation:** specify radial distance versus downrange distance explicitly; `hypot(x,y)` rewards sideways/backward displacement equally.

**6. Real-throw validation**

First measure paper bending, crease reopening and lock pullout. Then test six designs: dart, a genuinely locked reference, and four diverse candidates.

For each mission, use three independently folded specimens per design and ten scored throws per specimen: **180 throws**. Randomize order across at least two throwers; standardize a short trimming allowance and retain failed flights. Record paper batch, humidity, wear and fold deviations.

Use two calibrated video views to recover release velocity, attitude, rates, trajectory and first contact. Estimate glide L/D from steady segments, not total thrown distance divided by release height.

Fit a small identifiable parameter set on calibration designs; hold out entire designs and a later session. Report ranking, bias, failure rate and uncertainty, with resampling grouped by specimen/thrower. Expand trials when intervals cannot distinguish contenders. Have novice folders reproduce finalists using only the tutorial.

**7. Prioritized implementation plan**

Estimates are focused developer time, excluding venue scheduling.

1. **Dynamics audit — 3–5 days:** [physics.js](/Users/pedronobre/aviato/src/physics.js) `aero()`/`buildAircraft()` and [flight.js](/Users/pedronobre/aviato/src/flight.js) `deriv()`/`simulate()`; preserve the hang-time exploit as a regression case.
2. **Geometry/tutorial correctness — 3–5 days:** [fold.js](/Users/pedronobre/aviato/src/fold.js) `makeMap3D()`/`chordAlong()`; fix [design.js](/Users/pedronobre/aviato/src/design.js) elevator round-tripping—12 mm becomes 14.16 mm—and [instructions.js](/Users/pedronobre/aviato/src/instructions.js) landscape centre length and reversed down-elevator advice. Generate ruler-checkable coordinates/heights and reevaluate rounded instructions.
3. **Initial measurements and aerodynamic calibration — 5–8 days:** extend `scripts/sanity.js` into quantitative polar, trim and trajectory checks.
4. **Robust evaluation and optimizer comparison — 4–6 days:** [evaluate.js](/Users/pedronobre/aviato/src/evaluate.js), `scripts/worker.js`, `scripts/optimize.js`; feasibility, joint scenarios, caching, corrected screening and L-SHADE.
5. **Layer-aware folds and locks — 10–15 days:** extend `foldPlane()` and tutorial animation with certified operation templates.
6. **Structural coupling — 7–12 days:** replace `wingStiffness()` with calibrated load-case solves.
7. **Portfolio search and distributed audits — 4–6 days:** CMA refinement, MAP-Elites, `viewer/island-worker.js` and `viewer/app.js` migration controls; release only physically validated finalists.