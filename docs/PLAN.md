# Betterfold v2 plan

Consolidated from the research report (`reports/Computational paper plane design.md`) and two independent
reviews (`research_notes/Computational paper plane design/reviews/fable.md`, `astra.md`).

Constraint: one A4 sheet, 80 g/m², folded by hand. **No tape, no cuts, no glue.**

## Principles
- Fix the simulator before the optimizer: a better search on an exploitable model finds better exploits.
- What the tutorial prints is exactly what was simulated (snap to 1 mm / 1° before evaluation).
- Infeasible designs never fly (feasibility rules, not score discounts).
- Robustness is judged on joint random scenarios with common random numbers, scored on the lower tail.

## Status (all steps implemented except where noted)

- Steps 1–10 are implemented and covered by `npm test` (calibration, energy audit, fold tests).
- Step 9: the L-SHADE baseline comparison was not run; DE (v1) vs MAP-Elites+CMA-ES (v2/v3) are not directly comparable because the objective changed.
- Step 11 (real throws) is ready to run: `docs/VALIDATION.md`, `validation/`.
- Hosting: Next.js app with server-verified community board (`app/api/board`), see README.

## Steps
1. **Physics guards** — passivity per strip (no aerodynamic thrust except retained suction), VLM fades to plate model in fast rotation, energy audit, tumbling cut-off (|ω| > 15 rad/s sustained), distance = downrange inside a ±3 m corridor, flights end at first contact, no time-cap reward.
2. **Calibration harness** (`scripts/calibrate.js`, part of `npm test`) — Ng et al. 2009 dart (L/D ≈ 5 at 4.9 m/s, α_trim ≈ 5°, stall ≈ 30°), Ananda/Selig flat plates AR 2–5 (CLmax 0.55–0.7 at ≈ 10°), energy audit, hang-time spinner regression.
3. **Aero fixes** — Polhamus vortex lift (lost leading-edge suction rotated into normal force, weighted by sweep), sweep-dependent stall, drag build-up: planform skin friction + blunt-edge base drag from ply count.
4. **Feasibility rules** — ply ≤ 8 per half at any crease, features ≥ 8 mm, keel grip ≥ 12 mm, static margin 5–25 %, trim exists, launch-load structure OK, graded violation for ranking infeasibles.
5. **Joint scenarios** — 16 Latin-hypercube draws (fixed seed): throw speed, path angle, release α, bank, rates, sideslip, height; folding errors (dihedral, elevator, CG) in 4 geometry variants; model uncertainty (CD0 × 0.8–1.4, CLmax × 0.8–1.1). Score = CVaR50 (mean of worst 8). Exact racing: after 8 scenarios the mean of the worst 8 seen is an upper bound.
6. **Inner policy** — elevator from static trim at a target CL (the gene is the trim CL, not the angle); launch pitch by a short 1-D search on the nominal throw.
7. **Root-crease aeroelasticity** — crease springs (≈ 0.015 N·m/(m·rad) per ply) at wing root and body fold; glide-load dihedral is solved statically, launch-load deflection is a feasibility check.
8. **Correctness bugs** — elevator round-trip in `encode`, landscape centre length, down-elevator advice, winglet/elevator corner continuity, `chordAlong` spanning gaps, worker rounding/score mismatch.
9. **Search** — MAP-Elites archive keyed by fold sketch (operation types), CMA-ES emitter per niche (λ = 12, σ₀ = 0.2, IPOP restarts), successive halving; L-SHADE baseline for comparison. Islands: shared store is the archive; each tab works one niche.
10. **Fold grammar** — per-cell layer stacks, some-layers folds, body fold mountain/valley, pleat, tuck (Nakamura lock), reverse fold; flap retention classes (trapped / pocketed / sandwiched / free) feeding stiffness, drag and constraints.
    *Done:* some-layers folds with hinge closure, tear and access checks (`foldLayers`); body fold valley/mountain; pleat; Nakamura lock; retention classes (`src/retention.js`) feeding free-flap drag, an unlocked-flap violation and keel-lock stiffness; taco–tortilla order check; sketch letters d/t/k/p + `:M`; `scripts/test-folds.js`. *Not yet:* reverse folds and tucks *into* pockets (they interleave layers and need true per-cell orders); lock/free-flap constants are uncalibrated (step 11).
11. **Validation protocol** — 6 designs × 3 copies × 10 throws, 240 fps side video; pass at Spearman ρ ≥ 0.7; then refit CD0 multiplier, crease stiffness, CLmax.
