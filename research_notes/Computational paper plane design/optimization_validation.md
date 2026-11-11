# Optimization Methods and Validation Strategy for a Computational Paper Airplane Designer

Problem context: mixed discrete/continuous, variable-length (fold sequence with discrete fold types + continuous fold params, wing geometry, trim, launch params), ~25-60 dims, ~50% random samples infeasible, 50-500 ms per evaluation across ~10 robustness scenarios, JavaScript engine on a laptop with ~4 worker cores.

Budget arithmetic (inference, not sourced): at 50-500 ms per design-evaluation and 4 workers, throughput is roughly 8-80 designs/s, i.e. ~30k-300k evaluations per hour. That is a "medium budget" regime (roughly 500-10,000 x D for D=30-60) where population-based evolutionary methods are appropriate and full Gaussian-process Bayesian optimization is too slow/overkill, except for a small low-dimensional inner problem (e.g. trim/launch tuning).

## 1. Which optimizers perform best for this problem class

### Takeaway
No single benchmark matches this problem; evidence points to a hybrid: (a) a CMA-ES with restarts (BIPOP/IPOP) using integer-margin handling (CMA-ESwM / CatCMAwM) or an L-SHADE-family DE for the fixed-length mixed vector, (b) a structural outer layer (MAP-Elites or a GA over fold-sequence "genomes") for variable-length topology and to produce a diverse portfolio, and (c) TPE/SMAC only for low-budget, conditional sub-problems. Budget size decides between BO-style and EA-style methods.

### Cited Findings
- CMA-ES with Margin (Hamano, Saito, Nomura, Shirakawa, GECCO 2022) addresses the failure of plain CMA-ES on integer variables: with naive discretization, the variance on integer coordinates collapses below the discretization granularity before the optimum is reached, causing stagnation. The fix lower-bounds the marginal probability of generating each integer value. — [arXiv 2205.13482](https://arxiv.org/abs/2205.13482v2)
- Reference implementation exists (Python); README recommends a margin of 1/(N·λ) (N = dimension, λ = population size). — [EvoConJP/CMA-ES_with_Margin GitHub](https://github.com/EvoConJP/CMA-ES_with_Margin)
- Extended journal version adds a multi-objective (MO-CMA-ES-based) variant. — [arXiv 2212.09260](https://arxiv.org/html/2212.09260v2)
- CatCMA with Margin (CatCMAwM) extends this to mixed continuous + integer + categorical variables together (directly relevant to discrete fold types). — [search result referencing alphaxiv 2504.07884](https://alphaxiv.org/overview/2504.07884v5)
- BIPOP-CMA-ES (Hansen, GECCO 2009) uses independent restarts with alternating large and small population sizes (9 stop criteria controlling restarts); IPOP restarts with increasing population (Auger & Hansen, CEC 2005). Implemented in DEAP and Optuna (`restart_strategy='ipop'|'bipop'`). — [DEAP BIPOP example](https://deap.readthedocs.io/en/master/examples/bipop_cmaes.html); [Optuna hub restart CMA-ES](https://hub.optuna.org/samplers/restart_cmaes/)
- L-SHADE (SHADE + linear population size reduction) won CEC 2014; SHADE ranked 4th in CEC 2013; successors jSO (CEC 2017), LSHADE-EpSin (joint winner CEC 2016), NL-SHADE-RSP (CEC 2021). Success-history adaptation of F and CR is credited with keeping DE competitive in CEC competitions. (Secondary sources; verify against official CEC pages.) — [Longitudinal analysis of CEC competitions 2010-2024, arXiv 2603.24140](https://arxiv.org/pdf/2603.24140); [iL-SHADE CEC2016](https://labraj.feri.um.si/wp-content/uploads/janez/CEC2016-iL-SHADE.pdf)
- Older BBOB-era comparison: CMA-ES (with good population size) is best on non-separable functions; DE does better on additively decomposable (separable) ones. — [aCMA-ES benchmarking paper](https://typeset.io/pdf/benchmarking-a-weighted-negative-covariance-matrix-update-on-21tb8z2kzs.pdf)
- SMAC vs CMA-ES on BBOB (2013): at a 10·D budget a SMAC variant mostly beat CMA-ES, but CMA-ES gains as budget grows to 100·D. — [Hutter et al. 2013 SMAC-BBOB](https://www.cs.ubc.ca/~kevinlb/papers/2013-SMAC-BBOB.pdf)
- Tanabe (2020) notes DE had not been shown competitive with state-of-the-art optimizers under very small evaluation budgets (expensive setting). — [EasyChair preprint](https://2wvvw.easychair.org/publications/preprint/MtB7/open)
- Low-budget BBOB comparison study (budgets 10·D and 100·D, CMA-ES as baseline). — [arXiv 2310.00077](https://arxiv.org/pdf/2310.00077)
- TPE and SMAC handle conditional (tree-structured) spaces where a parameter is only active given another's value — i.e., exactly the "fold k's parameters only exist if sequence length ≥ k" structure. SMAC uses random-forest surrogates; TPE (Bergstra et al., NIPS 2011) is parallelizable but less sample-efficient than GPs. — [Thornton et al., Auto-WEKA/CASH arXiv 1208.3719](https://arxiv.org/html/1208.3719); [AutoML NeurIPS 2018 tutorial](https://www.automl.org/wp-content/uploads/2018/12/AutoML-Tutorial-NeurIPS2018-HPO_and_NAS.pdf)
- MAP-Elites (Mouret & Clune 2015) keeps a grid of best-performing solutions across user-chosen behavior/feature dimensions ("illuminating" the search space), demonstrated on neural networks and soft robots. — [arXiv 1504.04909](https://arxiv.org/abs/1504.04909)
- Prior GA work on folded paper flyers: "Creative evolution of flying objects" applied GAs to folded sheets and produced a variety of developments improving flight; a follow-up extended to distance and 3D objects (venue/year unconfirmed). — [Academia.edu](https://www.academia.edu/15279619/Creative_evolution_of_flying_objects)

### Inferences
- Recommended architecture for the JS engine:
  1. **Genome encoding**: fixed-maximum-length fold array (e.g. up to K_max folds) with an integer "active length" gene and per-slot categorical fold type + continuous params; inactive slots are ignored (this turns variable length into a fixed-dimensional conditional vector that CMA-ES/DE/TPE can all handle). Grammatical evolution/GP is an alternative but I found no evidence it beats this for short sequences (gap).
  2. **Inner continuous optimizer**: BIPOP-CMA-ES (or sep-CMA-ES at 60D for speed) with margin handling for integers/categoricals; L-SHADE/jSO as a second baseline — both are ~200-400 lines of JS and dependency-free. CMA-ES O(D²) per sample cost is negligible vs 50-500 ms sims.
  3. **Outer diversity layer**: MAP-Elites with features such as {number of folds, wing aspect ratio / span, CG position or flight style (glider vs dart)}, using CMA-ES-style emitters (CMA-ME) or simple Gaussian/line mutation. This yields a portfolio of buildable alternatives, which is valuable because the sim will be wrong in places (see section 3).
  4. **TPE**: useful early on to tune the optimizer's own hyperparameters, or for small expensive real-world loops (e.g. selecting which designs to physically test), not as the main 30k-evaluation engine.
- Run 4 web workers (or Node worker_threads) evaluating a population batch in parallel; population sizes that are multiples of 4 avoid idle cores.

### Gaps
- No direct published head-to-head of CMA-ESwM vs L-SHADE vs TPE on a mixed-integer, constrained, variable-length engineering problem resembling this one; the bbob-mixint benchmarking companion paper was cited but not retrieved.
- No evidence found on grammatical evolution / GP for fold sequences specifically.
- Surrogate-assisted EA evidence was not retrieved in this session.

## 2. Constraint handling

### Takeaway
Use a decoder/repair representation first (make geometric infeasibility impossible by construction), then Deb's feasibility rules or ε-constrained selection for the remaining constraints, with graded (not binary) constraint-violation measures so the optimizer gets a gradient toward feasibility.

### Cited Findings
- Deb (2000), "An efficient constraint handling method for genetic algorithms," Comput. Methods Appl. Mech. Eng. 186:311-338: parameter-free tournament rules — feasible beats infeasible; between two feasibles, better objective wins; between two infeasibles, smaller total violation wins. The objective need not be evaluated for infeasible individuals. — [modified-Deb comparison paper (cites and describes Deb 2000)](https://aj.tubitak.gov.tr/elektrik/issues/elk-21-29-7/elk-29-7-24-2101-88.pdf)
- Mezura-Montes et al. adapted Deb's feasibility rules to DE. — [Simple feasibility rules and DE](https://typeset.io/pdf/simple-feasibility-rules-and-differential-evolution-for-2l4w80yy30.pdf)
- Takahama & Sakai ε-constrained DE (IEEE SMC 2006; CEC 2006 with gradient-based mutation; 2008 dynamic ε-level control): solutions with violation below ε are compared by objective only; ε is decreased over generations to 0. — [Springer chapter](https://link.springer.com/chapter/10.1007/978-3-540-68830-3_5)
- Feasibility-preserving strategies for real-parameter EAs (boundary repair etc.) are surveyed in — [Padhye et al., arXiv 1504.04421](https://ar5iv.labs.arxiv.org/html/1504.04421)

### Inferences
- With ~50% infeasibility, the cheapest win is the representation: e.g. express fold-line positions as fractions of the currently-available edge/segment, clamp angles to valid ranges, enforce symmetric folds by construction, reject layer counts above a threshold by decoding fewer folds. Each infeasible region removed by decoding is evaluation budget saved.
- For remaining checks (paper tears/too-thick stacks, CG outside stable range, non-flying trims), compute a cheap pre-simulation violation score and short-circuit before the expensive sim — Deb's rules let you skip the objective for infeasibles.
- For CMA-ES, Deb's rule ranking works directly (rank by (violation, objective) tuple). ε-constrained ranking is a drop-in alternative if the feasible region is thin (prevents premature convergence to feasible-but-poor regions).
- Avoid fixed penalty coefficients — they need tuning and interact badly with robust/noisy objectives.

### Gaps
- No quantitative comparison found of penalty vs Deb vs ε on folding/geometry problems specifically.

## 3. Robust optimization under uncertainty and simulator exploitation

### Takeaway
Optimize a risk-aware statistic (lower quantile or CVaR of distance/flight time) over a fixed set of scenarios reused for all candidates (common random numbers), and treat the simulator's known weak spots as noise (Jakobi's envelope of noise / domain randomization) so the optimizer cannot exploit modelling errors. Keep a transferability check against real throws.

### Cited Findings
- Evolutionary robotics "reality gap": top-performing simulated controllers often exploit poorly modelled physics and fail on hardware. Koos, Mouret & Doncieux's transferability approach (IEEE TEC 2012) adds a second objective — estimated sim-to-real transferability, learned by a surrogate from a few real tests — and found well-transferring solutions with ~10 real-robot experiments (8-DOF quadruped, T-maze). — [Koos et al. TEC 2012 PDF](https://www.mn.uio.no/ifi/english/studies/masters-projects/robin/papers/evorob-koos-reality-gap.pdf); [abstract](https://search.isc.ac/inventory/49/3963.htm); [short intro arXiv 1307.1870](https://arxiv.org/pdf/1307.1870)
- Jakobi, Husbands & Harvey (1995) "Noise and the Reality Gap": sim-to-real correspondence depended on the amount of noise in simulation; realistic noise gave very good transfer. — [1995 PDF](https://cse-robotics.engr.tamu.edu/dshell/cs689/papers/jakobi95noise.pdf)
- Jakobi (1997) "radical envelope-of-noise hypothesis" / minimal simulation: model only the interactions needed for the behaviour; treat the rest as unreliable and mask it with randomness so evolved solutions cannot depend on it. — [Jakobi 1997 PDF](https://www2.cs.sfu.ca/~vaughan/teaching/889/papers/jakobi_radical.pdf)
- Domain randomization (Tobin et al., IROS 2017): training only on heavily randomized simulation transferred to the real world (1.5 cm detector accuracy) — now a standard zero-shot transfer baseline. — [arXiv 1703.06907](https://arxiv.org/pdf/1703.06907); [Understanding DR, arXiv 2110.03239](https://arxiv.org/pdf/2110.03239)
- Common random numbers in robust EAs: a robust NSGA-II study reuses one fixed set of environmental samples across all generations so quantile-based fitness comparisons are consistent (citing Spall 2003). — [arXiv 2203.01996](https://arxiv.org/pdf/2203.01996)
- CVaR is the expectation beyond the quantile; it is often preferred over a plain quantile because it is continuous in its level parameter and hence more stable; classical robust optimization uses mean + variance. — [Sunflower crop-model robust optimization, arXiv 1509.05697](https://arxiv.org/pdf/1509.05697); [Statistics of Robust Optimization, arXiv 1610.03425](https://arxiv.org/pdf/1610.03425)
- Mean-based fitness rewards strong averages while tolerating severe failures on rare seeds/instances; CVaR fitness in an evolutionary loop addresses this. — [CVaR-RMD, Findings EMNLP 2026](https://aclanthology.org/2026.findings-emnlp.687.pdf)
- Physical evidence that paper planes are inherently stochastic: in EPFL's robotic study, identical folds did not produce identical flights; behaviour clustered into nose-dive, glide, and recovery-glide classes. — [PopSci on Obayashi et al., Sci. Rep. 2023](https://www.popsci.com/technology/paper-airplane-robot-epfl/)
- Hobbyist physical GA on paper planes: identical genotypes yield different phenotypes because foldings are imperfect. — [2010 blog](https://sicnemstrebor.blogspot.com/2010/03)

### Inferences
- Scenario design (~10 scenarios): sample launch speed, launch pitch/roll, fold-placement error (± a few mm/degrees), paper stiffness/weight, CG offset, small wind/turbulence, and aero-coefficient multipliers (the "envelope of noise" on the parts of the aero model you trust least — e.g. post-stall, sideslip, flexible wing deformation). Use a fixed scenario set per generation (CRN) so ranking noise is small; refresh the set every N generations to avoid overfitting to those 10 draws; re-evaluate final elites on 100-1000 fresh scenarios.
- Objective: e.g. maximize CVaR_20% of distance (mean of the worst 2 of 10 scenarios) or mean − k·std; also add a "crash fraction" constraint (e.g. ≤10% of scenarios nose-dive/stall) handled via Deb rules.
- Ten scenarios gives a crude CVaR estimate; use antithetic/Latin hypercube scenario sampling to reduce variance (standard variance-reduction; not sourced here).
- Exploitation guards: penalize/flag designs whose performance hinges on regimes outside the model's validity (extreme AoA, Reynolds numbers below calibration, very high launch speeds, phugoid exploits), cap launch speed at a measured human range, and run a final "audit" with a higher-fidelity or perturbed-model sim.
- Transferability-style loop: after physical tests of ~5-10 designs, fit a simple disparity model (sim vs real) and add it as an objective/constraint — this is Koos et al.'s method scaled to paper planes.

### Gaps
- No source found quantifying how many scenarios are needed for paper/small-glider robust optimization specifically.

## 4. Multi-fidelity screening

### Takeaway
Use a cheap longitudinal (2D, point-mass or 3-DOF pitch-plane) sim plus geometric/stability checks as a filter, then the full 6-DOF robust sim only for survivors; this mirrors the Koos et al. idea of spending expensive evaluations only where needed.

### Cited Findings
- NASA's glider equations: with measured glide angle and weight, lift and drag can be solved from two equations — the basis for a closed-form longitudinal screen (glide ratio L/D ≈ distance/height). — [NASA Glenn glider problem](https://www.grc.nasa.gov/WWW/K-12/VirtualAero/BottleRocket/airplane/glidprob.html)
- Expensive quantile estimation (thousands of model evaluations each) motivates surrogate/adaptive approaches in robust EA. — [arXiv 2203.01996](https://arxiv.org/pdf/2203.01996)

### Inferences
- Pipeline: (0) decode + geometric feasibility (µs) → (1) static stability margin/CG/trim check and longitudinal glide sim on nominal scenario (~1-5 ms) → discard bottom 50-70% or anything unstable → (2) full 6-DOF on 10 scenarios → (3) elite audit on 200+ scenarios. Calibrate the screen by checking rank correlation (Spearman) between fidelities on a few thousand random feasible designs; only use the screen aggressively if correlation is high.
- Alternatively use the cheap sim as a pre-selection inside CMA-ES (evaluate 2λ candidates cheaply, run full sim on best λ).

### Gaps
- No direct paper on multi-fidelity optimization for paper airplanes / small free-flight gliders was retrieved.

## 5. Validation: physical testing and sim-to-real comparison

### Takeaway
Measure launch conditions (speed, angle) with phone slow-motion video, record distance and flight time over enough throws per design to estimate a mean with a confidence interval, and fit/calibrate aero coefficients from tracked trajectories. Expect large throw-to-throw variance; compare distributions, not single throws, and validate rank-order (does the sim order designs correctly?) as the primary metric.

### Cited Findings
- Video-tracked paper airplane drag: Miller (College of Wooster, 2021) used two GoPro cameras and Tracker software (with Igor Pro) on five paper airplane designs to extract drag force and drag-coefficient-area per design. — [Miller Junior IS 2021](https://physics.wooster.edu/wp-content/uploads/2021/12/JuniorIS_2021_Miller.pdf)
- APS DFD 2023: two high-speed cameras with marker tracking gave 3D reconstruction of paper airplane flight, combined with wind-tunnel lift/drag/moment measurements to explain flapping behaviour. — [APS DFD23 A04.4](https://meetings.aps.org/Meeting/DFD23/Session/A04.4)
- Record paper airplane flight (27.6 s) analysis estimated launch velocity ~27 m/s and lift coefficient ~0.06 for 80 gsm paper — useful as a sanity range for launch speeds. — [core.ac.uk paper](https://core.ac.uk/download/267013002.pdf)
- Glide angle method: measure distance and height drop to get glide angle; with weight known, solve for lift and drag. — [NASA Glenn](https://www.grc.nasa.gov/WWW/K-12/VirtualAero/BottleRocket/airplane/glidprob.html)
- Lift-to-drag study of three paper wing shapes measuring L/D and total aerodynamic force across airspeed/AoA (student IB essay; low authority). — [Gulko](https://u.osu.edu/gulko.3/files/2015/06/EE-Paper-New-19cgprr.pdf)
- EPFL robot (Obayashi et al., Sci. Rep. 2023, "Robotic automation and unsupervised cluster assisted modeling for solving the forward and reverse design problem of paper airplanes"): 500+ planes from ~50 designs, camera-measured flights, robot launch; same design varies across launches; behaviour clusters (nose dive / glide / recovery glide); models used for the reverse problem (design for target distance). — [Sci. Rep. DOI page](https://www.nature.com/articles/s41598-023-31395-0); [PopSci summary](https://www.popsci.com/technology/paper-airplane-robot-epfl/)

### Inferences
- Protocol suggestion:
  - Indoor, still air (gym/hallway), same paper stock (weigh sheets), folded with a template/jig to limit fold error; record fold-error tolerances as they feed the scenario noise model.
  - Launch: phone slow-motion (120-240 fps) side-on with a known-length reference in frame; track nose position in the first ~10 frames (Tracker or a simple JS frame-differencing tool) to get release speed and angle. A launch rig (rubber band catapult / rail) greatly reduces launch variance and isolates design effects.
  - Per design: ≥10-20 valid throws after a trimming phase (inference: with coefficient of variation of maybe 20-40%, 15 throws gives a ~±10-20% 95% CI on the mean; confirm with pilot data). Record distance, flight time, lateral deviation, and behaviour class (nose dive / glide / stall-recovery / spiral), following the EPFL classification.
  - Trimming protocol: fixed number of trim adjustments allowed (elevator up/down in fixed increments), logged as parameters so the sim can be re-run at the measured trim state.
  - Analysis: compare sim distribution (with measured launch speed/angle inserted) to real distribution per design; primary metric = Spearman rank correlation across ~5-10 designs; secondary = per-design bias/ratio; use Mann-Whitney or bootstrap CIs for design-vs-design comparisons.
  - System identification: from 2D tracked trajectories fit CL0, CLα, CD0, k (induced) and pitch-damping multipliers by least squares on the longitudinal model (start with glide-angle method for L/D), then feed calibrated values/uncertainty back into the scenario randomization.

### Gaps
- Could not retrieve the full Sci. Rep. text (paywall redirect) for exact repeat-throw variance figures.
- No published validation of a paper-airplane-specific flight simulator against throws was found; no specific sources retrieved on XFLR5 / free-flight model sims for small gliders, or on radar launch speed measurement.
- No authoritative source found for "how many throws" — the numbers above are inference.

## 6. Prior work combining optimization with physical paper airplane testing

### Takeaway
Real-world paper airplane optimization has been done robotically (EPFL 2023, PaperBot 2024) with small budgets (~100-500 throws) and no simulator; their main lessons are high flight-to-flight variance, distinct behaviour classes, and that a learned surrogate + few real trials beats naive evolutionary baselines in very low budgets.

### Cited Findings
- PaperBot (Columbia/Stanford, arXiv 2403.09566, 2024): two robot arms fold and throw; 4 fold parameters (left/right fold position and orientation) + throwing angle; 100 real trials (~100 s each, ~3 h); distance measured by two ceiling RealSense D435i cameras over a 9 m × 1.5 m runway. Optimizer: ε-greedy with an MLP surrogate (4 layers, hidden 512, Huber loss) and gradient ascent on the surrogate with projection to feasible params. Beat the second-best baseline (SNES, pop 5 × 20 iters) by 87% and beat the best human design; baselines (grid, random, SNES) degraded as parameters went from 3 to 5; found a slightly asymmetric design flying straighter. No simulator, no repeat-throw variance reported; mentions airflow and calibration as real-world noise. — [arXiv 2403.09566](https://arxiv.org/html/2403.09566v1); [project page](https://paperbot.cs.columbia.edu/)
- EPFL (Obayashi et al., Sci. Rep. 2023): 500+ planes, ~50 designs, fully automated fold-launch-measure-model loop; unsupervised clustering of flight behaviour; same design varies between launches; models used to narrow design space for a target distance. — [Sci. Rep.](https://www.nature.com/articles/s41598-023-31395-0); [PopSci](https://www.popsci.com/technology/paper-airplane-robot-epfl/)
- 2010 hobbyist GA with human folding and measured throw distance as fitness; fold imperfection means equal genotypes → different phenotypes. — [blog](https://sicnemstrebor.blogspot.com/2010/03)
- "Creative evolution of flying objects": GA over folded sheets improved flight performance. — [Academia.edu](https://www.academia.edu/15279619/Creative_evolution_of_flying_objects)
- Ornithopter hardware-in-the-loop evolution (GECCO 2005) highlights the practical issue of evaluating non-flying individuals physically (damage / wasted trials). — [GECCO 2005 p957](https://gpbib.pmacs.upenn.edu/gecco2005/docs/p957.pdf)
- Classroom "Evolution in Plane Sight" activity uses recreate-the-farthest-flyers selection to teach evolution (not a real GA). — [howtosmile.org](https://www.howtosmile.org/resource/evolution-plane-sight)

### Inferences
- The project's niche (sim-driven search of a rich ~25-60D fold space, then a handful of real tests) is distinct from these real-only, ≤5-parameter studies; real testing budget will be tiny (tens of designs), so the sim must do the search and the real tests should validate rank order and calibrate noise (transferability approach).
- Pick physical test candidates from a MAP-Elites portfolio (diverse styles) rather than only top-k by sim score, so one model error cannot invalidate all tested designs.

### Gaps
- No credible source found for YouTube/Microsoft "AI designs paper airplane" projects; not verified, so not included.
