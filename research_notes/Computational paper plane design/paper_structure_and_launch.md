# Paper Structural Flexibility and Launch Dynamics for a Paper-Plane Simulator

Scope: (a) practical structural models for paper stiffness, folds/creases, stacks and wing deformation under aero load; (b) realistic human launch conditions. Target: a JS engine running thousands of simulations.

Source-quality note: Primary sources were read directly for Ghassaei/Demaine/Gershenfeld (Origami Simulator paper), Jules/Lechenault/Adda-Bedia (elastic fold), and Pradier et al. (paper fold stiffness). The Filipov et al. 2017 bar-and-hinge PDF could not be retrieved: the host returned an HTML/certificate error. Its exact stiffness formulas are therefore given only as "recalled, unverified" inferences. Launch-speed data for paper planes is sparse. Most of it comes from popular articles or is estimated from models rather than measured.

## Q1. Bar-and-hinge and GPU origami models: how are parameters set, and can they be coupled cheaply to aerodynamics?

### Takeaway
Bar-and-hinge models are the right fidelity for a JS engine. Ghassaei's Origami Simulator uses an explicit, matrix-free, per-node update (axial springs + crease/facet dihedral springs + face-angle springs + damping) that maps directly onto a small JS loop. The Filipov/Paulino formulation shows how to set bar, panel-bending and fold stiffnesses from E, t and ν so the results are physical rather than arbitrary. Aero coupling is cheap if aero forces are applied as nodal loads per triangle (panel or strip method) in the same explicit step, or if a static aeroelastic solve is done only a few times per flight.

### Cited Findings
- Filipov, Liu, Tachi, Schenk & Paulino, "Bar and hinge models for scalable analysis of origami", Int. J. Solids Struct. (2017). The paper refines and validates a simplified bar-and-hinge model for origami stiffness — [Paulino lab PDF](https://paulino.princeton.edu/journal_papers/2017/IJSS_17_BarAndHingeModelsForScalable.pdf)
- In the bar-and-hinge framework, bars carry in-plane stretching and shearing, bending hinges carry out-of-plane panel bending/twisting, and folding hinges carry rotation along creases. Equivalent parameters, including fold stiffness, are derived from experimental constitutive relations of folded thin sheets — [arXiv 2507.00341, "Origami of Multi-Layered Spaced Sheets"](https://arxiv.org/pdf/2507.00341)
- The earlier Filipov/Tachi/Paulino formulation defines three stiffness families: panel stretching/shear (K_S), panel bending (K_B) and fold-line bending (K_F). Panel stiffness depends on thickness, elastic modulus and Poisson's ratio, and fold stiffness uses a length parameter L* (examples around 1 mm vs 25 mm) — [Filipov, Tachi, Paulino 6OSME 2016](https://public.websites.umich.edu/~filipov/journal_papers/2016/6OSME.pdf) (as summarized in search results; slide text did not show the full formula)
- Origami Simulator (Ghassaei, Demaine, Gershenfeld, 7OSME 2018) deliberately trades physical realism for a "compliant, explicit numerical simulation method that emphasizes computational speed and interactivity". Its solver is parallel per node, with no global stiffness/Jacobian matrix — [paper PDF](https://erikdemaine.org/papers/OrigamiSimulator_Origami7/paper.pdf)
- Origami Simulator model details, all from the same paper:
  - Each mesh edge is a linear spring, F = −k_axial (l − l0), with k_axial = EA/l0. The authors "consider only the relative stiffness of the axial and angular constraints … and disregard their physical meaning".
  - Creases are dihedral springs, F = −k_crease(θ − θ_target)·∂θ/∂p, with k_crease = l0·k_fold for mountain/valley creases, l0·k_facet for triangulation ("facet") creases, and 0 for boundary or undriven creases. This follows Schenk & Guest 2011.
  - Optional face-angle springs, F = −k_face(α − α0)·∂α/∂p, improve stability.
  - Stiffnesses are chosen so that k_axial ≫ k_fold, k_facet.
- Origami Simulator integration and damping (same paper):
  - Integration is forward (semi-implicit) Euler, with unit nodal mass. The authors note that "a more accurate calculation of nodal mass would result in more realistic dynamics".
  - Damping is relative-velocity damping between neighbours, c = 2ζ√(k_axial·m). Most patterns are stable for 0.01 ≤ ζ ≤ 0.5.
  - Example parameters: EA = 100, k_fold = 0.7, k_facet = 0.7, k_face = 1, ζ = 0.45.
  - The time step is bounded by the stiffest axial spring and the minimum nodal mass, i.e. a CFL-like Δt < 1/(2π·ω_max).
  - Source: [paper PDF](https://erikdemaine.org/papers/OrigamiSimulator_Origami7/paper.pdf)
- The live app exposes axial, fold and facet stiffness and damping. Raising axial stiffness reduces strain but slows the solver, and lowering damping makes motion "springier" — [Origami Simulator app](https://apps.amandaghassaei.com/OrigamiSimulator/)
- Lechenault et al. showed that a creased sheet's response is twofold: it comes from bending of the panels and from the hinge-like intrinsic response of the crease. This is the physical basis for separate K_B and K_F — [Lechenault et al., "The mechanical response of a creased sheet" (arXiv 1404.1243 / PRL 2014)](https://ar5iv.arxiv.org/html/1404.1243)

### Inferences
- **Recalled, not verified against the 2017 PDF:**
  - Filipov et al. 2017 set panel-bending hinge stiffness as K_B = C_B·D·(D_panel/t)^{1/3}, with D = Et³/12(1−ν²) and C_B ≈ 0.55. Here D_panel is the panel diagonal length; the reported fit has the stiffness proportional to (panel diagonal / thickness)^{1/3}.
  - Fold hinge stiffness per unit length is K_F = D/L*, with L* a crease length scale. The paper suggests 25t ≤ L* ≤ 100t for thin sheets.
  - Bars use EA with Poisson effects through an "N5B8" pattern (5 nodes, 8 bars per quad panel) rather than plain triangulation "N4B5". N5B8 gives isotropic in-plane behaviour.
  - The MERLIN software (Liu & Paulino) implements this with a nonlinear implicit (modified generalized displacement control) solver.
  - All four points should be checked against the PDF before being quoted.
- **Recommended JS formulation:**
  - Use a triangulated sheet of ~50–300 nodes per plane, with Ghassaei-style explicit per-node updates.
  - Use physical stiffness values from §Q2 instead of Ghassaei's arbitrary ones.
  - Use real nodal masses: lumped areal density, 80 g/m² × triangle area / 3 per node.
- **Practical speed trick for thousands of runs:** do not co-simulate structure and flight at full rate. Run a quasi-static aeroelastic solve.
  - Apply the aero pressure distribution for the current (V, α, β) to the nodes. Relax with heavy damping (ζ ≈ 0.5–1) for a few hundred explicit steps or a few Newton iterations, then feed the deformed geometry (twist, dihedral, camber) back to the aero model.
  - Repeat at 2–3 speed levels: launch speed, transition, and trim glide.
  - Alternatively, precompute a linear "aeroelastic stiffness map" (deflection per unit q per α) once per design. Structural natural frequencies of paper wings are far above flight-dynamics frequencies (see Q3), so quasi-static coupling is justified except for flutter.
- Explicit-integration stability with real paper properties is costly. In-plane axial stiffness (E·t ≈ 5 GPa × 0.1 mm = 5×10⁵ N/m) is ~10⁶ × the bending stiffness per length², which forces tiny Δt. Two standard fixes are:
  - (a) scale k_axial down to keep k_axial/k_bend ~10³–10⁴. Paper is nearly inextensible either way, and this keeps strain <0.1% at flight loads.
  - (b) use an implicit or position-based (XPBD) solver for the bars and keep the bending/fold springs explicit.
  - Either should run in milliseconds per static solve in JS.

### Gaps
- No exact quote of the Filipov 2017 K_B, K_F and L* formulas: the PDF could not be fetched (403/certificate error from the host).
- No published fluid-structure coupling of a bar-and-hinge model to paper-airplane aerodynamics was found. The coupling recommendations above are engineering inference.

## Q2. Material properties of copy paper: modulus, bending stiffness, crease stiffness and memory, stacked layers

### Takeaway
For 80 g/m² copy paper (t ≈ 0.10–0.11 mm), use E_MD ≈ 4–6 GPa, E_CD ≈ 2–3 GPa (MD:CD ≈ 2:1) and ν ≈ 0.2–0.3. That gives a plate bending stiffness D ≈ 0.2 (CD) to 0.5 (MD) mN·m. Measured paper creases behave as nonlinear torsional springs with moment per unit fold length of order 0.01–0.07 N·m/m over 60–180° opening (120 g/m² paper). Folds show large specimen-to-specimen scatter and plastic memory or relaxation. Stacks: bonded layers give EI ∝ n³, sliding layers give EI ∝ n.

### Cited Findings
- **Thickness:** 80 g/m² office-paper datasheets give caliper of about 104–112 µm, e.g. 107 µm and 104 µm — [Plano Dynamic 80g datasheet](https://assets.ccntr.pbsnetwork.eu/assets/5790002616839/27-5414-plano-20dynamic-80g-s-en.pdf); [mtender datasheet](https://storage.mtender.gov.md/get/6892df08-f92b-4a3c-a499-afa15342dd3c-1617200276251)
- **Bending resistance (ISO 2493, "mN"), 80 g/m² copy paper, MD vs CD:**
  - MD 110 ±15 / CD 55 ±15 — [Lomax datasheet](https://cdn.lomax.dk/image/upload/dokumenter/1515200_4.pdf)
  - MD ≈110 / CD ≈45 — [Propac COPY80](https://www.propac.it/it/img/cms/Schede%20tecniche/COPY80_F01779%20scheda%20tecnica.pdf)
  - MD 110 ±10 / CD 52 ±5 — [mtender datasheet](https://storage.mtender.gov.md/get/32d09eb2-ee0b-4119-8254-e763133b43a2-1615972885438)
  - MD 140 / CD 65 — [MM Bloom Excellent](https://mm.group/wp-content/uploads/MMBLOOM-Excellent_ENG.pdf)
  - MD ≥100 / CD ≥35 — [Navigator Universal](https://pim.igepa.nl/Office/Kopieerpapier/Multifunctioneel/Navigator/Navigator%20Universal%20Brand%20Datasheet.pdf)
  - CD/MD 145/68, 125/60, 122.5/55 (column order as labelled in the source) — [globalsources photocopy sheet](https://p.globalsources.com/IMAGES/PDT/SPEC/883/K1195740883.pdf)
- **Anisotropy:** in-plane Young's modulus in MD is typically about twice CD — [BioResources paper-mechanics article](https://bioresources.cnr.ncsu.edu/wp-content/uploads/2022/01/1981.1.453.pdf). Tensile strength minimums in a US GPO spec are MD 11.5 vs CD 5.1 kg/in — [GPO spec vol 13](https://www.gpo.gov/docs/default-source/forms-and-standards-files-for-vendors/vol_13.pdf)
- **Generic modulus range:** tensile modulus of 1.2–6.5 GPa for printing/cover papers of 80–250 g/m² — [SpotMaterial](https://spotmaterial.com/material/paper/print-pap-cover-stock-and-heavyweight-paper-80-250-g-m2/)
- **Bending stiffness definition:** bending stiffness = E × I, with I ∝ t³ — [USPTO patent text 8843004](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8843004). The Taber method uses force to deflect a 38 mm-wide sample to 15°, with S = FL³/(3db) — [MM group Taber note](https://mm.group/?p=24406); [Valmet bending-stiffness datasheet](https://paperlabmultimedia.valmet.com/pdf/Datasheet-Bending-Stiffness-modules_D07693EN_V1.0.pdf)
- **Paper fold stiffness (Pradier, Cavoret, Dureisseix, Jean-Mistral, Ville, J. Mech. Des. 138(4) 041401, 2016):**
  - Material: Arjowiggins Conqueror CX22, 120 g/m² uncoated, measured t = 129 µm, ρs = 116.2 g/m².
  - Model: fold torque t = k(α)·f(L), with f(L) linear in fold length L (fit error <3.4%), so torque per unit length is a nonlinear function of opening angle α.
  - Identified k(α) ranges from ≈0.07 N (≈N·mm per mm) at α≈60° down to ≈0.01 N near flat (180°), read from their Fig. 8.
  - Unlike in-plane properties, fold stiffness is nearly independent of fold orientation (MD/CD/45°). In-plane, MD resists ~50% higher stress while CD elongates ~2× more.
  - The fold-affected zone is ~2.3× sheet thickness.
  - Folds show "large dispersion", with residual SD 0.289 N·mm across 43 specimens / 611 points. The creasing process is hard to control, so "variability is … part of the model itself".
  - Source: [HAL hal-01276578](https://hal.science/hal-01276578)
- **Crease memory and relaxation (Jules, Lechenault & Adda-Bedia, Soft Matter 15, 1619, 2019):**
  - Material: 130 µm Mylar, not paper.
  - Freshly creased folds are hysteretic. Loading crosses the plasticity threshold and changes the rest angle, and creep keeps the fold continuously relaxing. Annealing was needed to obtain a reversible elastic fold.
  - They characterise the crease by two length scales: L_c (spatial extent of the crease's elastic response) and S_c (crease rigidity). S_c depends only weakly (logarithmically) on panel length.
  - The rest configuration of a fold under load differs from its unloaded "absolute" rest configuration.
  - Source: [arXiv 1808.04892](https://arxiv.org/pdf/1808.04892); [Soft Matter](https://pubs.rsc.org/en/content/articlelanding/2019/sm/c8sm01791c)

### Inferences
- **Converting ISO 2493 numbers.** Using the standard two-point bending formula S_b = 60·F·l²/(π·θ·b) with θ = 15°, b = 38 mm:
  - At the 10 mm span typical for light papers, MD 110 mN gives S_b ≈ 0.37 mN·m and CD 55 mN gives ≈ 0.18 mN·m.
  - Back-solving D = E t³/12(1−ν²) with t = 0.105 mm gives E_MD ≈ 3.5–4 GPa and E_CD ≈ 1.8–2 GPa, consistent with the 2:1 ratio and the 1.2–6.5 GPa range.
  - The test span is not stated on the datasheets, so this is an inference. Recommended defaults: D_MD = 0.4 mN·m, D_CD = 0.2 mN·m, ν = 0.25, areal density 0.080 kg/m².
- **Crease-to-panel length scale.** Linearising Pradier's k(α) gives ~0.06 N·m/m over ~2 rad, so k_fold ≈ 0.02–0.04 N·m/(m·rad) for 120 g/m² paper. With D ≈ 0.8–1.0 mN·m for 129 µm, that gives L* = D/k_fold ≈ 25–50 mm, or ≈ 200–400 t. For 80 g/m² paper (D ∝ t³), scale k_fold roughly as t² to t³: ~0.008–0.02 N·m/(m·rad). In practice a sharp crease is "softer than the panel over ~3–5 cm".
- **Rest-angle memory for a simulator.** A folded paper crease is a torsional spring around a rest angle θ0. θ0 drifts open over time (creep) and resets after large excursions (plasticity). Model θ0 as the as-folded angle plus a random opening of a few to ~20° (inference; no paper-specific number found). Apply a per-crease stiffness multiplier with a CV of ~20–30%, given Pradier's "large dispersion". This is also a natural source of sloppiness or asymmetry between left and right wings.
- **Stacks (standard beam theory).** n layers perfectly bonded (glued or tightly crimped) act as one plate of thickness n·t, so D ∝ n³: ×8 for 3 layers. Layers free to slide sum individually, so D ∝ n: ×3. Real folded stacks held by friction and crease constraints sit in between. Recommended default is D_eff = n^p·D1 with p ≈ 1.5–2. The "Origami of Multi-Layered Spaced Sheets" paper models spaced layers in bar-and-hinge form and could inform this ([arXiv 2507.00341](https://arxiv.org/pdf/2507.00341)), but it was not read in detail.
- **Folded leading edges and keels.** Their main stiffening effect is geometric, not material. A fold or crease line that leaves the sheet non-flat (V-section keel, dihedral crease, rolled leading edge) carries bending about the span as a thin-walled beam, with I set by the section depth, not t³. A bar-and-hinge mesh captures this automatically if the folded 3D geometry is meshed. A flat-plate-plus-scalar-EI model will badly under-predict stiffness of folded parts and over-predict droop of flat parts.
- **Sanity check that structure matters.** An A4 dart weighs ≈5 g (0.0624 m² × 80 g/m²). Treat a flat single-layer wing half-span of 0.1 m as a cantilever plate under uniform wing loading of ~2.5 Pa (5 g over 0.02 m²): δ_tip = p·b⁴/(8D) ≈ 2.5×10⁻⁴/(8×4×10⁻⁴) ≈ 0.07 m. So a truly flat, unsupported single-layer paper wing would droop centimetres even in 1 g glide. At launch q (×5–20) it would fold up completely. Real planes survive because of multilayer roots, folds and creases that add geometric stiffness, and dihedral. This is exactly why a simulator must not treat paper wings as rigid: a rigid model over-rewards thin, large-span, flat wings.

### Gaps
- No direct primary measurement of E_MD/E_CD in GPa for 80 g/m² copy paper was found. The values above are inferred from ISO 2493 bending resistance with an assumed test span.
- No crease-stiffness measurement specifically for 80 g/m² copy paper was found. The closest is 120 g/m² Conqueror (Pradier 2016). The Lechenault/Jules work uses Mylar.
- No quantitative data on paper crease relaxation (rest-angle drift over minutes or hours) or on humidity effects on paper-plane folds was found.
- No measurement of effective bending stiffness of friction-held folded paper stacks (bonded vs sliding) was found.

## Q3. Aeroelastic effects observed in paper planes (washout, flutter, dihedral changes, "flies differently when thrown hard")

### Takeaway
There are almost no quantitative studies of aeroelasticity in folded paper gliders. The nearest literature covers flexible paper strips in tumbling flight, plus anecdotal and design statements from record holders. The key documented design consequence is that duration-record planes use short, low-aspect-ratio wings because high-aspect-ratio paper wings cannot survive launch loads.

### Cited Findings
- A high-aspect-ratio wing made of paper "could not withstand the launch forces" of Blackburn's ~60 mph vertical throw, hence his short, stubby, rectangular wing — [Symscape, "Paper Airplanes" (2007)](https://www.symscape.com/blog/paper-airplanes.html)
- MIT (Bush lab) studied paper strips of varying stiffness in tumbling flight. Sufficiently long wings bend symmetrically, sagging about their centre line, and this was modelled with Euler–Bernoulli beam theory. Uniform flexibility was "unconditionally detrimental" to tumbling flight — [flexiblewings TAM paper](https://thales.mit.edu/bush/wp-content/uploads/2012/10/flexiblewings-TAM.pdf); [Bush lab summary](https://thales.mit.edu/bush/?p=4350); [non-uniform flexible wings, arXiv 2004.07028](https://ar5iv.labs.arxiv.org/html/2004.07028)
- John Collins' distance-record design "Suzanne" is described as the first paper airplane design to use changing airspeed to enhance performance, i.e. it is designed to behave differently at launch speed and glide speed — [search summary of Suzanne coverage; see Popular Science](https://www.popsci.com/?p=134778) (claim reported in coverage, not independently verified)
- For context outside paper, a simulated flexible bat-like membrane wing had a 6.13% higher L/D than a rigid wing in gliding — [arXiv 1807.04411](https://arxiv.org/pdf/1807.04411)

### Inferences
- **Load scaling.** With glide speed ≈ 5–7 m/s (see Q4) and launch speeds of 10–27 m/s, dynamic pressure rises from ~20 Pa to ~60–440 Pa, i.e. 3–20× the glide aerodynamic load if α were unchanged. The likely consequences are:
  - **Wing tips bend up** (more dihedral, more roll stability, less lift).
  - **Trailing edges and elevons get blown up or flattened.** Pitch trim changes, so less up-elevator at speed, which partly suppresses looping.
  - **Washout or wash-in twist** develops, depending on where the folds sit relative to the aerodynamic centre.
  - **Possible flutter** of thin trailing edges and wingtips, which shows up as audible buzzing at high throw speed.

  This is the mechanism behind "flies differently when thrown hard". It is inferred from physics plus the Symscape and Suzanne statements, not from a measured study.
- **Separation of time scales.** The first bending frequency of a 0.1 m paper cantilever is f ≈ (1.875²/2π)·√(D/(ρs·b⁴)) ≈ 0.56·√(4×10⁻⁴/(0.08×10⁻⁴)) ≈ 4 Hz for an unsupported flat strip. Folded or stacked wings are higher: tens of Hz. Flight pitch dynamics are ~1–3 Hz. So:
  - Quasi-static deformation is acceptable for flexible but folded wings.
  - Very flimsy flat wings approach coupling with the flight dynamics. A simulator should penalise them, by detecting excessive deflection or divergence in the quasi-static solve and declaring structural failure or departure.
- **Simple divergence or failure criteria.** Pick any one:
  - (a) Quasi-static iteration fails to converge, i.e. torsional divergence.
  - (b) Tip deflection exceeds ~25–30% of semi-span at launch q.
  - (c) Any crease's moment exceeds a fold-open threshold (from Pradier-scale moments ~0.05 N·m/m), so the fold flips or opens.

### Gaps
- No peer-reviewed measurement of wing twist, dihedral change or flutter onset speed for folded paper airplanes was found.
- No data on Suzanne's speed-dependent trim mechanism beyond the press statement.

## Q4. Launch dynamics: throw speeds, angles, launch-to-glide transition, record techniques and rules

### Takeaway
Casual throws release at roughly 5–10 m/s. Record duration throws reach ~27 m/s (≈60 mph) nearly straight up. Record distance throws are by strong (often athlete) throwers at moderate climb angles (~40° quoted for one record team). Guinness rules fix A4 / ≤100 g/m² paper, no cuts or glue, one small tape piece, and indoor flights.

### Cited Findings
- **Casual/measured speeds:**
  - A Wooster undergraduate study with high-speed video (2 GoPros + Tracker) measured a basic design at 6.1 ± 0.3 m/s mean velocity (flights ≈6.8, 5.4, 6.2 m/s) — [Miller, Wooster Junior IS 2021](https://physics.wooster.edu/wp-content/uploads/2021/12/JuniorIS_2021_Miller.pdf)
  - A school project reported average speeds of 6.98 m/s and 2.40 m/s for two designs — [etwinning project PDF](https://twinspace.etwinning.net/files/collabspace/1/01/601/15601/files/ad99535a.pdf)
  - A launcher review puts an ordinary hand throw at roughly 20 mph (≈9 m/s), with no method given — [Fold'N'Fly launchers](https://cdn.foldnfly.com/lounge/paper-airplane-launcher.php)
- **Record duration throws:**
  - Launch velocity for Blackburn's record flight is estimated at 27 m/s (60 mph), back-computed from an estimated apex of 18 m (60 ft). This is consistent with his measured 65 mph baseball pitch, and a vertical throw is harder than a pitch — [core.ac.uk analysis](https://core.ac.uk/download/267013002.pdf) (via search snippet; full PDF blocked with 403)
  - Blackburn throws "directly upwards at 60mph" — [Symscape](https://www.symscape.com/blog/paper-airplanes.html)
  - Blackburn studied biomechanics and shot-put techniques to maximise the throw, and hand-launched designs must be compact — [Smithsonian Air & Space](https://www.smithsonianmag.com/air-space-magazine/toy-story-10416004/)
  - Takuo Toda advises throwing nearly straight up to gain height so the plane circles down. Accounts differ on "straight" vs "upward, not straight" — [Fold'N'Fly records](https://foldnfly.com/lounge/world-record-paper-airplanes.php); [Guinness JP record page](https://www.guinnessworldrecords.jp/world-records/longest-time-flying-a-paper-aircraft)
- **Duration records:**
  - Toda: 29.2 s, 19 Dec 2010, Fukuyama — [Guinness JP](https://www.guinnessworldrecords.jp/world-records/longest-time-flying-a-paper-aircraft)
  - Earlier: Toda 27.9 s (1998/2009, dates vary by source), Blackburn 27.6 s (Oct 1998), 18.8 s (1994), 16.9 s (1983); William Pryor 15 s (1975)
  - Liu Liwen + team: 31.2 s (Feb 2026), not Guinness-verified at time of listing
  - One outlet gives Toda 29.3 s (conflict)
  - Sources: [Fold'N'Fly records](https://foldnfly.com/lounge/world-record-paper-airplanes.php); [Denver Gazette](https://www.denvergazette.com/?p=66013)
- **Distance records:**

  | Holder | Date | Distance |
  |---|---|---|
  | Felch | 1985 | 58.82 m |
  | Kreiger | 2003 | 63.19 m |
  | Ayoob (Collins' "Suzanne") | Feb 2012 | 69.14 m / 226 ft 10 in |
  | Kim/Shin/Chee | Apr 2022 | 77.13 m |
  | Ruble/Erickson/Jensen | Dec 2022 | 88.318 m |
  | Liu Liwen + team | Dec 2025 | 98.43 m |

  Sources: [Fold'N'Fly records](https://foldnfly.com/lounge/world-record-paper-airplanes.php); [ABC News](https://abcnews.go.com/blogs/headlines/2012/02/former-college-quarterback-sets-paper-airplane-record); [Guinness news 2012](https://www.guinnessworldrecords.com/news/2012/2/video-is-this-the-farthest-ever-flight-by-a-paper-airplane)
- Collins recruited former Cal quarterback Ayoob because he lacked the arm strength himself. The record came on the 4th of 10 official throws — [ABC News](https://abcnews.go.com/blogs/headlines/2012/02/former-college-quarterback-sets-paper-airplane-record); [SI 2018](https://www.si.com/more-sports/2018/07/20/guinness-world-record-paper-airplane-throw-john-collins-joe-ayoob)
- A distance record write-up states the team found an optimal throw angle of ~40° using simulations — [Fold'N'Fly distance record page](https://cdn.foldnfly.com/lounge/paper-plane-distance-world-record.php) (as summarized in search; not independently verified)
- **Guinness rules (summarised by Fold'N'Fly):**
  - Distance: paper no larger than A4 and no denser than 100 g/m²; no glue, tears or cuts; one 25 mm × 30 mm piece of clear tape; thrown indoors from behind a line; distance measured to first ground contact.
  - Time aloft: standard A4, indoors; timed from release until the plane touches any object.
  - Ten attempts were allowed in Toda's 2010 attempt.
  - Sources: [Fold'N'Fly records](https://foldnfly.com/lounge/world-record-paper-airplanes.php); [Guinness JP](https://www.guinnessworldrecords.jp/world-records/longest-time-flying-a-paper-aircraft)
- A mechanical launcher study noted the plane spends ~0.3 s on the launcher before release — [Fold'N'Fly launchers](https://cdn.foldnfly.com/lounge/paper-airplane-launcher.php)

### Inferences
- **Throw-speed classes for the simulator:**

  | Class | Speed | Notes |
  |---|---|---|
  | Gentle "toss" | ≈ 3–6 m/s | near trim glide speed |
  | Casual | 6–12 m/s | |
  | Strong adult / athlete | 15–25 m/s | |
  | Elite record | ≈ 25–30 m/s | |

  Blackburn's 27 m/s at a vertical launch reaching only ~18 m (the drag-free apex would be ~37 m) implies heavy drag losses during climb. That is consistent with q-dependent drag and a low-aspect-ratio, high-wing-loading design.
- **Transition / loop risk.** A plane trimmed for glide (C_L,trim at ~6 m/s) thrown at V0 ≫ V_trim has excess lift ∝ (V0/V_trim)² at trim α. That gives a strong pitch-up (phugoid / loop) unless the throw is pointed so the climb absorbs the energy (duration throws: vertical), or aeroelastic deflection reduces effective camber/elevator at high q. A simulator must include this, or it will over-reward high-speed throws of glide-optimised designs.
- **Flight phases:** record duration flights are "boost → vertical coast → pitch-over at apex → circling glide". Distance flights are "boost at ~30–40° → ballistic/high-speed climb → transition to glide → long glide".

### Gaps
- No radar- or video-measured release speed for Joe Ayoob or the 2022/2025 distance teams was found. Release attitude, AoA and roll rate measurements for any expert thrower were not found.
- Official Guinness guideline text (rather than secondary summaries) was not retrieved.
- The core.ac.uk analysis (27 m/s) could not be opened (403), so its authorship and methodology are unverified beyond the snippet.

## Q5. How should a simulator model the wind-up and release (attitude, AoA, roll rate, sloppiness)?

### Takeaway
No published measured distributions of human paper-plane release states were found. A launch model should therefore be a parameterised, bounded distribution anchored to the speed and angle data above. Score designs by expected or percentile performance over that distribution, and add a structural check at launch q, so neither flimsy wings nor heroic throws are rewarded.

### Cited Findings
- Hand launch speeds range from ~6 m/s measured casual flights ([Wooster 2021](https://physics.wooster.edu/wp-content/uploads/2021/12/JuniorIS_2021_Miller.pdf)) to ~27 m/s estimated record vertical throws ([core.ac.uk](https://core.ac.uk/download/267013002.pdf); [Symscape](https://www.symscape.com/blog/paper-airplanes.html)).
- Record throwers choose launch angle by event: near-vertical for duration ([Fold'N'Fly records](https://foldnfly.com/lounge/world-record-paper-airplanes.php)), ~40° quoted for distance ([Fold'N'Fly distance page](https://cdn.foldnfly.com/lounge/paper-plane-distance-world-record.php)).
- Fold stiffness is inherently highly variable, with residual SD ≈ 0.29 N·mm across specimens ([Pradier et al. 2016](https://hal.science/hal-01276578)). Build-quality randomness is real and should be part of robustness evaluation.
- A robotic study threw 500+ planes of 50 designs and filmed them to assess flight behaviour. It is relevant as a controlled-launch methodology — [Popular Science](https://www.popsci.com/?p=520729)

### Inferences
- **Recommended launch state vector at release** (engineering defaults; none are measured):
  - **Speed:** V0 ~ lognormal per profile. Casual: median 8 m/s, 5–95% 5–12. Strong: median 15 m/s, 10–20. Record mode: up to 27 m/s, only for designs passing the structural check.
  - **Flight-path angle:** γ0 ~ N(target, 5–8°). Target is 0–10° for a casual throw, 30–45° for distance and 70–90° for duration.
  - **Angle of attack at release:** α0 ~ N(0–3°, 3–5°). Hands release roughly aligned with the throw but with pitch error.
  - **Sideslip:** β0 ~ N(0, 2–4°).
  - **Bank:** φ0 ~ N(0, 5–10°). Duration throwers deliberately add bank so the plane circles.
  - **Body rates at release:** p, q, r ~ N(0, ~0.5–1.5 rad/s) each. Release flick and wrist snap; q is biased slightly nose-down or up depending on grip.
  - **Release height:** 1.5–2.0 m standing, plus ~0.5 m arm extension for overhead throws.
- **Optionally model the wind-up itself.** Use a short (~0.1–0.3 s) prescribed hand trajectory, constant acceleration to V0 along γ0, with the plane rigidly held at its nose or keel. During this phase aero loads act, so the structural model sees launch q before release.
  - The ~0.3 s launcher contact time suggests ~30–90 m/s² for 10–27 m/s throws. Inertial g-loads are then 3–9 g, a further structural check on the paper (inference from [Fold'N'Fly launchers](https://cdn.foldnfly.com/lounge/paper-airplane-launcher.php)).
- **Anti-exploit scoring:**
  - (1) Evaluate each design over N (~20–100) Monte-Carlo launches plus build-variation samples: crease rest-angle offsets ±5–15°, crease stiffness CV 20–30%, left/right asymmetry. Score on the median or 25th percentile, not the max.
  - (2) Cap launch speed by "throwability". Compact, heavy-nosed designs can be thrown hard. Large, light, flimsy ones are capped by the structural check: deflection, divergence or fold-opening at launch q, which disqualifies or derates the design.
  - (3) Choose throw speed per design as the best of a few discrete speeds (as a smart thrower would), but within the human envelope above.
  - (4) Include the launch-to-glide transition explicitly (full 6-DOF from release), so loop-outs and stalls at high V0 are penalised naturally.
- **Concrete recommended model for the JS engine:**
  - **Structure:** triangulated bar-and-hinge mesh of the folded geometry, ~100–300 nodes.
    - Bars use scaled axial stiffness.
    - Facet/panel bending uses K_B from D_MD/D_CD (direction-dependent by edge orientation), D ≈ 0.4/0.2 mN·m for 80 g/m².
    - Creases use a torsional spring per unit length, k_fold ≈ 0.01–0.03 N·m/(m·rad), around a randomised rest angle.
    - Stacked layers: merge coincident layers into one surface with D_eff = n^1.5–2·D1, or keep separate layers with contact.
    - Lumped mass at 0.080 kg/m² per layer.
  - **Aeroelastic solve:** quasi-static at launch, transition and glide q levels, with heavy-damped explicit relaxation or a few Newton steps.
  - **Flight:** 6-DOF rigid body using the deformed geometry's aero coefficients, re-evaluated when q changes by more than ~30%.
  - **Launch:** sampled from the distributions above, with an optional 0.2 s wind-up phase during which structural loads are checked.

### Gaps
- No measured statistical distributions (speed, angle, AoA, roll/pitch rates) of human paper-plane launches were found. All distributions above are engineering assumptions and should be calibrated, e.g. with phone high-speed video of 20–50 throws using Tracker, following the Wooster methodology.
- No published data on release body rates (wrist-flick roll/pitch rates) for paper planes.
