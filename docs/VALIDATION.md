# Bestfold real-throw validation protocol

Goal: check that the simulator **ranks** real hand-folded A4 planes correctly, then refit three parameters. **Pass: Spearman ρ ≥ 0.7** between simulated and measured per-design medians (with 6 designs: Σd² ≤ 10).

## 1. Materials

- 80 g/m² A4 from **one batch**; weigh 10 sheets (0.1 g scale) and note g/m².
- Phone with 120–240 fps slow motion; tripod or books.
- 1.00 m reference (metre stick or wall tape marks) in the throw plane.
- 30 m tape, coins, masking tape (throw line), hygrometer, pencil (CG balance).
- `throw-log.html` on the phone (works offline).

**Venue:** gym or long hallway, no drafts, fans/HVAC off.

## 2. Designs and counts

| Code | Design | Why |
|---|---|---|
| D1 | Classic dart | Baseline everyone knows |
| D2 | Bestfold champion | The claim under test |
| D3, D4 | Two elites from **different** MAP-Elites cells | Tests ranking, not one shape |
| D5 | Nakamura lock (optional) | Locked-nose reference |
| D6 | Predicted-bad control | Must come last |

**Count:** 3 copies × 10 scored throws = **30 per design, 180 per mission**. Distance (≈11 m/s) first; hang time (≈15 m/s, steep) is a second session with the same structure.

**Power estimate:** this assumes a throw-to-throw CV of about 30% and a copy-to-copy ICC of about 0.2. The design effect is 1 + 9·0.2 = 2.8, so the effective n is ≈ 11. The SE of the median is then ≈ 1.25·0.30/√11 ≈ 11%. Medians ≥ 30% apart separate at ~2 SE; closer pairs may swap. Add **copies before throws**. If the pilot shows ICC > 0.3, use 4 copies × 8 throws (4×8 gives SE ≈ 10%, versus 11% for 3×10). Note that ρ = 0.7 at n = 6 is not significant on its own (one-sided p < 0.05 needs ρ ≥ 0.83). Treat it as a practical gate, read together with the bootstrap CI.

## 3. Folding and build record

Fold each copy from the Bestfold instructions only (no tape/cuts/glue). Write a code (e.g. `K7`) underneath, not the name. Record mass, CG (mm from nose), span, dihedral, elevator bend, fold errors > 2 mm.

## 4. Randomisation and blinding

- Randomise throw order in blocks: shuffle design cards, throw each design once per block, repeat. This spreads fatigue and humidity drift.
- If possible, a helper codes the copies and keeps the key; you won't know which elite is which.
- **Don't open the predictions** until all throws are logged. The page only compares against predictions once you paste them in.
- Keep every scored throw, including dives and loops. Never "redo" a bad one.

## 5. Trimming allowance (fixed and logged)

- **Up to 5 trim throws** per copy, logged as `trim`.
- Allowed: symmetric elevator bend in 1 mm steps; re-setting dihedral to spec. Nothing else.
- Record the final elevator bend; the copy is then **frozen**.
- Crushed (nose dent > 5 mm) or torn: retire it, fold `copy 4`, note it.

## 6. Throwing and filming

- One thrower, same stance, line and release height (~1.7 m); steady medium-hard throw for distance.
- Camera **side-on**, 4–6 m away, perpendicular to the throw plane, still; 1 m reference visible at release. 240 fps (120 minimum).
- **Launch extraction:** step to the release frame (the hand is fully off). Read the nose pixel (x₀, y₀) and the tail pixel. Then read the nose 6–12 frames later (x₁, y₁), and the reference endpoints in pixels.
  - Speed = (|Δpx| · 1 m/ref px) · fps/Δframes
  - Angle = atan2(−Δy, Δx), corrected for gravity over Δt/2
  - Attitude comes from the nose–tail line, and α₀ = attitude − angle
  - The helper in `throw-log.html` does this math. Measure **at least every 3rd throw**, and all throws if you have the time.
- **Distance:** tape from the throw line to the **first ground contact**, not where the plane slides to. Mark contact with a coin and log lateral offset in the notes.
- **Time aloft:** release frame to first contact, from video (frames / fps). A stopwatch is the fallback; flag it in the notes.
- **Outcome class:** glide / nose-dive / stall-recovery / loop / turned (heading > 45° off).

## 7. Hand-released trim glide (L/D)

- For each copy, after trimming, stand on a step (hand height ~2.2 m). Release **gently at glide speed** (≈ 4–7 m/s), level, 5 times.
- Film side-on. In the helper's **glide** mode, pick two points on the steady part of the flight (after the first ~0.5 m), never on the release.
  - L/D = Δx / Δy
  - Glide speed = path length / time
- Log the median L/D per copy as a throw with outcome `glide`, mission `glide`, and the ratio in the L/D field.

## 8. Conditions to record (per session, and on change)

Date, times, venue, temperature, RH % (re-read every ~60 throws; paper goes limp above ~60%), paper, thrower, air movement.

## 9. Analysis (`node analyze.js log.csv predictions.json`)

1. **Per design:** n, median, IQR, outcome mix (scored throws only).
2. **Re-simulate at the measured launch.** Put each design's median measured speed and angle into Bestfold. Use the **median of the 16 randomised throws** as the prediction; clean-throw and the robust score are secondary.
3. **Spearman ρ** between predicted and measured medians. The 95% CI uses a two-stage bootstrap: resample copies within each design, then throws within copies. **Pass:** ρ ≥ 0.7, and D6 is measured last or second-last.
4. **Bias:** the geometric mean of measured/predicted, with a CI. A bias of 0.7–1.3 is acceptable before the refit. Larger bias with a good ρ means the parameters are off but the physics is sound.
5. **Refit, then re-check ranks:**
   - **CD0 multiplier (`cdMul`):** fit it from the glide L/D, with the script's closed form at the predicted trim C_L. Cross-check it against the distance medians with the point-mass glide model in `analyze.js`.
   - **Crease stiffness (`K_CREASE`):** take one rear-view frame per copy in glide and at launch. Measure the in-flight dihedral change against the folded dihedral, and scale K so the simulated flex matches it.
   - **CLmax multiplier (`clmaxMul`):** use the stall-recovery and loop frequency. Raise or lower it until the simulated share of stall/loop over the 16 throws matches the observed share (±10%) for D1–D4.
   - Fit on D1–D4 and **hold out D5–D6**. Then fly 5 new elites in a fresh session to confirm.

## 10. Printable data sheet

```
SESSION  date ____  venue ______  T ___°C  RH ___%  paper ________ ___g/m²  thrower ____
COPY     code ___ design ___ copy# _ mass ___g  CG ___mm  span ___mm  dihedral ___°  elev ___mm
         fold errors ____________________   trim throws used _/5

 #  | code | type(trim/score) | dist m | time s | video frame# | outcome (G/N/S/L/T) | notes
----+------+-----------------+--------+--------+--------------+---------------------+------
  1 |      |                 |        |        |              |                     |
  2 |      |                 |        |        |              |                     |
 ...  (30 rows per page)

FRAME HELPER  fps ___  ref ___px = 1.00 m  release f___ nose(x,y)___ tail(x,y)___  +Δf ___ nose(x,y)___
GLIDE         p1 f___ (x,y)___   p2 f___ (x,y)___   →  L/D ____  V ____ m/s
```
