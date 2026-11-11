# References

These are the external works that Betterfold's engine and design rely on. Most entries come from the project's literature review (`reports/Computational paper plane design.md`), its research notes (`research_notes/Computational paper plane design/*.md`) and the two design reviews (`.../reviews/`); the section *Standard methods used in the code* lists textbook methods the implementation follows directly.

Each entry ends with a **Used for** line. It says what Betterfold takes from the work and where. "Background" means the work shaped a design decision but is not implemented directly.

Entries marked **[unverified: …]** have a bibliographic detail that could not be confirmed against a publisher or indexing page. The marker says which detail.

## Computational origami and folding

- Arkin, E. M., Bender, M. A., Demaine, E. D., Demaine, M. L., Mitchell, J. S. B., Sethia, S., & Skiena, S. S. (2004). When can you fold a map? *Computational Geometry*, 29(1), 23–46. https://doi.org/10.1016/j.comgeo.2004.03.012. Preprint: arXiv:cs/0011026.
  *Used for:* the one-layer, some-layers and all-layers simple-fold models. `src/fold.js` implements all-layer folds and some-layer folds (`foldLayers`).

- Bern, M., & Hayes, B. (1996). The complexity of flat origami. In *Proceedings of the 7th Annual ACM-SIAM Symposium on Discrete Algorithms (SODA '96)*, 175–183.
  *Used for:* background. Global flat-foldability is NP-hard, so Betterfold generates fold *sequences* forward instead of searching crease patterns (`src/fold.js`, `src/sketch.js`).

- Akitaya, H. A., Cheung, K. C., Demaine, E. D., Horiyama, T., Hull, T. C., Ku, J. S., Tachi, T., & Uehara, R. (2016). Box pleating is hard. In *Discrete and Computational Geometry and Graphs (JCDCGG 2015)*, LNCS 9943, 167–179. Springer. https://scripts.mit.edu/~jasonku/pdf/BOXPLEATINGHARD_JCDCGG2015.pdf
  *Used for:* background. It is part of the same argument for forward generation over crease-pattern search.

- Akitaya, H. A., Demaine, E. D., & Ku, J. S. (2017). Simple folding is really hard. *Journal of Information Processing*, 25, 580–589. https://doi.org/10.2197/ipsjjip.25.580. Conference version: JCDCGGG 2016.
  *Used for:* the definitions of the some-layers and all-layers simple-fold models. It also motivated keeping every operation a simple fold or a fixed compound of simple folds (`src/fold.js`).

- Akitaya, H. A., Demaine, E. D., & Ku, J. S. (2026). Computing flat-folded states. In *Origami⁸* (8OSME, 2024), Vol. III, Lecture Notes in Mechanical Engineering, 201–219. Springer. https://doi.org/10.1007/978-981-96-6561-7_14. Preprint: https://erikdemaine.org/papers/FlatFolder_OSME2024/
  *Used for:* the facewise layer-order conditions. Two places use them:
  - the taco–tortilla check after every fold step (`layerOrderViolations` in `src/retention.js`);
  - the "lies between" relation behind the trapped, pocketed and sandwiched retention classes (`computeRetention`).

- Demaine, E. D., Ku, J. S., & Lang, R. J. (2016). A new file standard to represent folded structures. In *Abstracts from the 26th Fall Workshop on Computational Geometry (FWCG 2016)*. https://erikdemaine.org/papers/FOLD_CGW2016/. Specification: https://edemaine.github.io/fold/doc/spec.html
  *Used for:* the model of per-cell stacks as `faceOrders`-style queries on the layer order (`stackAt` in `src/retention.js`). FOLD export itself is not implemented.

- Akitaya, H. A., Mitani, J., Kanamori, Y., & Fukui, Y. (2013). Generating folding sequences from crease patterns of flat-foldable origami. *ACM SIGGRAPH 2013 Posters*. https://doi.org/10.1145/2503385.2503407. Project page (ORIZU): https://cgg.cs.tsukuba.ac.jp/projects/2013/generation_diagrams/index.html
  *Used for:* background. Its catalogue of folding "maneuvers" served as the checklist for the fold grammar: corner fold, nose fold, pleat, lock, body fold (`src/sketch.js`, `grammarOK`).

- Ida, T., & Takahashi, H. (2021). A new modeling of classical folds in computational origami. In *Proceedings of Automated Deduction in Geometry (ADG 2021)*, EPTCS 352, 41–53. https://doi.org/10.4204/EPTCS.352.5. Preprint: arXiv:2201.00536.
  *Used for:* background only. Squash folds were considered and left out of the grammar (`docs/PLAN.md`, step 10).

## Prior computational design of paper planes

- Umetani, N., Koyama, Y., Schmidt, R., & Igarashi, T. (2014). Pteromys: Interactive design and optimization of free-formed free-flight model airplanes. *ACM Transactions on Graphics (SIGGRAPH 2014)*, 33(4), Article 65. https://doi.org/10.1145/2601097.2601129
  *Used for:* background. It is evidence that earlier work optimised flat gliders, not fold sequences, and so it frames Betterfold's fold-sequence search space.

- Liu, R., Liang, J., Sudhakar, S., Ha, H., Chi, C., Song, S., & Vondrick, C. (2024). PaperBot: Learning to design real-world tools using paper. arXiv:2403.09566. https://paperbot.cs.columbia.edu/
  *Used for:* background. Real-world-only search works with about 5 parameters, which is why the simulator does the searching and real throws do the judging (`docs/VALIDATION.md`).

- Obayashi, N., Junge, K., Ilić, S., & Hughes, J. (2023). Robotic automation and unsupervised cluster assisted modeling for solving the forward and reverse design problem of paper airplanes. *Scientific Reports*, 13, 4212. https://doi.org/10.1038/s41598-023-31395-0
  *Used for:* two things:
  - Identical folds fly differently. This is why the scenario set includes folding-error copies (`GEOS` in `src/evaluate.js`).
  - Its flight-outcome classes (nose-dive, glide, recovery) are reused in the validation log (`docs/VALIDATION.md` §6, `validation/throw-log.html`).

## Low-Reynolds-number aerodynamics and paper-plane measurements

- Ng, B. F., Kng, Q. M., Pey, Y. Y., & Schlüter, J. (2009). On the aerodynamics of paper airplanes. *27th AIAA Applied Aerodynamics Conference*, AIAA Paper 2009-3958. https://doi.org/10.2514/6.2009-3958
  *Used for:* the classic-dart calibration target: L/D ≈ 5 at 4.9 m/s, trim α ≈ 5°, stall ≈ 30°. It is the "classic dart: max L/D 4.3–5.7" check in `scripts/calibrate.js`, and the source of the vortex-lift requirement in `aero()` (`src/physics.js`).

- Ananda, G. K., Sukumar, P. P., & Selig, M. S. (2015). Measured aerodynamic characteristics of wings at low Reynolds numbers. *Aerospace Science and Technology*, 42, 392–406. https://doi.org/10.1016/j.ast.2014.11.016
  *Used for:* the flat-plate calibration targets for AR 2–5:
  - CLmax 0.55–0.7;
  - stall near 10° followed by a lift plateau;
  - Helmbold lift slope;
  - CDmin 0.01–0.02.

  These are the "flat plate AR 2.4" checks in `scripts/calibrate.js`. They also set the unswept-edge stall threshold in `aero()` (`src/physics.js`).

- Tokuhiro, S., Kawashima, K., & Ohtake, T. (2017). Measurement of aerodynamic characteristic of a model paper airplane (模型紙飛行機の空力特性の測定). *Proceedings of the Academic Lecture Meeting, College of Science and Technology, Nihon University* (61st), K3-57. https://www.cst.nihon-u.ac.jp/research/gakujutu/61/pdf/K3-57.pdf
  *Used for:* the measured drag of a slow, high-aspect-ratio paper glider (CDmin 0.0685, L/D 8.82). It informed the drag build-up in `aero()`. It is not yet a calibration check (see README, Limitations).

- Laitone, E. V. (1997). Wind tunnel tests of wings at Reynolds numbers below 70 000. *Experiments in Fluids*, 23, 405–409. https://doi.org/10.1007/s003480050128
  *Used for:* evidence that thin plates are insensitive to Re and turbulence below Re 70 000. It justifies a single Re-independent stall and post-stall model in `aero()`.

- Pelletier, A., & Mueller, T. J. (2000). Low Reynolds number aerodynamics of low-aspect-ratio, thin/flat/cambered-plate wings. *Journal of Aircraft*, 37(5), 825–832. https://doi.org/10.2514/2.2676
  *Used for:* the same Re-insensitivity argument, and low measured Oswald factors. It informed the calibration ranges in `scripts/calibrate.js`.

- Torres, G. E., & Mueller, T. J. (2004). Low aspect ratio aerodynamics at low Reynolds numbers. *AIAA Journal*, 42(5), 865–873. https://doi.org/10.2514/1.439
  *Used for:* background on CLmax rising at AR ≤ 2. That rise is why swept, low-AR strips get a later stall than unswept ones in `aero()`.

- Traub, L. W. (2023). Examination and prediction of the lift components of low aspect ratio rectangular flat plate wings. *Aerospace*, 10(7), 597. https://doi.org/10.3390/aerospace10070597
  *Used for:* its caution that unswept leading edges may not produce vortex lift in steady flow. This is why vortex lift in `aero()` is weighted by leading-edge sweep and is zero below 25°.

- Kaplan, S. M., Altman, A., & Ol, M. (2007). Wake vorticity measurements for low aspect ratio wings at low Reynolds number. *Journal of Aircraft*, 44(1), 241–251. https://doi.org/10.2514/1.23096
  *Used for:* evidence that potential-flow lift stays adequate for low-AR plates at Re 8 000–24 000. This supports a vortex lattice as the attached-flow model (`src/physics.js`).

- Post-stall flat-plate normal force. `CN_plate` (1.17·sin^0.6 α, `src/physics.js`) is an engineering fit with the classic shape (fast rise, plateau near 1.1–1.2 at 90°) and is not taken from a specific dataset; it is one of the uncalibrated constants listed in the README.

- Ragheb, A. M., & Selig, M. S. (2016). Wind tunnel testing of wings in spin. *54th AIAA Aerospace Sciences Meeting*, AIAA Paper 2016-1073. https://doi.org/10.2514/6.2016-1073
  *Used for:* evidence of no Re effect on stalled, spinning plates at Re 3 000–25 000. It supports the Re-independent post-stall blend used in fast rotation (`aero()`).

## Vortex lattice and vortex lift

- Polhamus, E. C. (1971). *Charts for predicting the subsonic vortex-lift characteristics of arrow, delta, and diamond wings*. NASA TN D-6243. https://ntrs.nasa.gov/citations/19710012498
  *Used for:* the leading-edge suction analogy, CL = Kp sinα cos²α + Kv cosα sin²α. In `aero()` (`src/physics.js`), suction lost on a swept sharp edge is rotated into normal force. The "delta 67°" checks in `scripts/calibrate.js` use the same formula.

- Polhamus, E. C. (1966). *A concept of the vortex lift of sharp-edge delta wings based on a leading-edge-suction analogy*. NASA TN D-3767.
  *Used for:* the original statement of the analogy that TN D-6243 tabulates. It is cited through Ananda et al. 2015.

- Lamar, J. E. (1974). *Extension of leading-edge-suction analogy to wings with separated flow around the side edges at subsonic speeds*. NASA TR R-428. https://ntrs.nasa.gov/citations/19740026346 (the research notes link NTRS 19740011530, which is a different report)
  *Used for:* background. The suction analogy can be extended to side edges. Betterfold applies vortex lift by leading-edge sweep only (`vortexK` in `latticeFromRows`).

- Traub, L. W., Moeller, B., & Rediniotis, O. Low-Reynolds-number effects on delta-wing aerodynamics. *Journal of Aircraft*. Cited through Ng et al. (2009). **[unverified: year, volume, pages]**
  *Used for:* evidence that sharp-edged delta lift barely depends on Re down to Re 60 000. This is what makes the Polhamus targets applicable at paper-plane Reynolds numbers.

## Paper mechanics and creases

- Pradier, C., Cavoret, J., Dureisseix, D., Jean-Mistral, C., & Ville, F. (2016). An experimental study and model determination of the mechanical stiffness of paper folds. *Journal of Mechanical Design*, 138(4), 041401. https://doi.org/10.1115/1.4032629. Open copy: https://hal.science/hal-01276578
  *Used for:* the crease spring constant (`K_CREASE` = 0.015 N·m/(m·rad) per ply in `src/evaluate.js`), scaled from 120 g/m² to 80 g/m². Its large specimen-to-specimen scatter is why dihedral and elevator errors appear in the scenario set.

- Jules, T., Lechenault, F., & Adda-Bedia, M. (2019). Local mechanical description of an elastic fold. *Soft Matter*, 15, 1619–1626. https://doi.org/10.1039/C8SM01791C. Preprint: arXiv:1808.04892.
  *Used for:* evidence that creases creep and lose their rest angle. This motivated the symmetric-dihedral error of ±6° in the folding-error copies (`GEOS`, `src/evaluate.js`). Creep itself is not modelled.

- Lechenault, F., Thiria, B., & Adda-Bedia, M. (2014). Mechanical response of a creased sheet. *Physical Review Letters*, 112, 244301. https://doi.org/10.1103/PhysRevLett.112.244301
  *Used for:* the separation of panel bending from crease-hinge stiffness. Betterfold keeps panels rigid and puts all flex in crease springs (`withFlex`, `src/evaluate.js`).

- Filipov, E. T., Liu, K., Tachi, T., Schenk, M., & Paulino, G. H. (2017). Bar and hinge models for scalable analysis of origami. *International Journal of Solids and Structures*, 124, 26–45. https://doi.org/10.1016/j.ijsolstr.2017.05.028
  *Used for:* background. A bar-and-hinge solve was considered and deferred. The design reviews recommended root-crease springs in the loop instead (`docs/PLAN.md`, step 7).

- Ghassaei, A., Demaine, E. D., & Gershenfeld, N. (2018). Fast, interactive origami simulation using GPU computation. In *Origami⁷: Proceedings of the 7th International Meeting on Origami in Science, Mathematics and Education*, Vol. 4, 1151–1166. Tarquin. https://erikdemaine.org/papers/OrigamiSimulator_Origami7/
  *Used for:* background, as the same deferred structural option as Filipov et al.

- Lomax A/S. *Copy paper 80 g/m², product datasheet* (bending resistance MD 110 / CD 55 mN). https://cdn.lomax.dk/image/upload/dokumenter/1515200_4.pdf **[unverified: document title]**
  *Used for:* background. It gives the bending stiffness of 80 g/m² paper and its 2:1 grain anisotropy, which the research report used to show that a 1 g cantilever check misses launch-load failure. That led to the launch-load crease check in `prepare`.

## Launch, records and design practice

- Guinness World Records (2026). Evolution of the paper plane flight and how far it's actually possible to throw one. https://www.guinnessworldrecords.com/news/2026/5/evolution-of-the-paper-plane-flight-and-how-far-its-actually-possible-to-throw-one. See also the record pages "Farthest flight by a paper aircraft" and "Longest time flying a paper aircraft" (guinnessworldrecords.com, guinnessworldrecords.jp).
  *Used for:* the record rules, which allow a 25 × 30 mm tape piece and cuts, and the record targets. Betterfold's no-tape, no-cut rule is stricter. That stricter rule is why flap retention and locks are modelled (`src/retention.js`).

- Fold'N Fly. World record paper airplanes. https://www.foldnfly.com/lounge/world-record-paper-airplanes.php
  *Used for:* two things:
  - The record rules: distance is measured to first contact, and time aloft runs until the plane touches any object. Flights in `src/flight.js` end at first contact, and `docs/VALIDATION.md` measures to first contact.
  - Toda's near-vertical hang-time throw. It sets the hang-time pitch range of 30–85° (`MISSIONS` in `src/design.js`).

- Collins, J., via Make: magazine. World's best paper airplane (Suzanne). https://makezine.com/projects/worlds-best-paper-airplane/
  *Used for:* evidence that record distance planes used many tape strips to keep layers shut at launch speed. This is why the 4 cm² free-flap limit and the launch-load wing check exist (`prepare` in `src/evaluate.js`).

- Make: (2010). Paper airplane flight-time record (Takuo Toda, 26.1 s with an uncut, untaped sheet). https://makezine.com/article/home/fun-games/paper-airplane-flight-time-record-a
  *Used for:* the like-for-like hang-time benchmark under Betterfold's rules (README and report).

- Freethink. How Boeing engineers broke the paper plane distance record. https://www.freethink.com/science/paper-plane-distance-record. Also UPI (2023-03-01), https://www.upi.com/Odd_News/2023/03/01/Guinness-World-Records-farthest-flight-paper-aircraft/6171677705180/ **[unverified: Freethink article title]**
  *Used for:* the Mach 5 launch at about 40°. It set the upper end of the distance pitch range (`pitchRange` up to 45° in `src/design.js`).

- Symscape (2007). Paper airplanes. https://www.symscape.com/blog/paper-airplanes.html
  *Used for:* Blackburn's observation that high-aspect-ratio paper wings fail at launch. This is the reason for the launch-load wing check ("wings fold up at launch", `prepare`).

- Miller, L. (2021). Oh what a drag: Determining drag force and drag coefficient area for five paper airplane designs. Junior Independent Study, Department of Physics, The College of Wooster. https://physics.wooster.edu/wp-content/uploads/2021/12/JuniorIS_2021_Miller.pdf
  *Used for:* measured casual throw speeds of about 6 m/s, taken from video with Tracker. This is the low end when choosing the 11 m/s distance throw. Its video method is reused in `docs/VALIDATION.md` §6.

- Back, A., Hall, B., Brown, G., & Turner, S. (2011). P1_6 Paper planes – long-haul flight. *Physics Special Topics* (University of Leicester), 10(1). https://journals.le.ac.uk/index.php/pst/article/view/2045. PDF: https://core.ac.uk/download/267013002.pdf **[unverified: the ≈ 27 m/s figure itself. The full text could not be opened]**
  *Used for:* the high end of hand-launch speeds. It informed the 15 m/s hang-time throw (`MISSIONS`).

- Exploratorium. Paper airplanes: the science of flight. https://annex.exploratorium.edu/exploring/paper/airplanes2.html **[unverified: page title]**
  *Used for:* the practical trim principles: CG just ahead of the centre of lift, up-elevator trim, positive dihedral. The trim policy (`prepare`) and the throw advice (`throwAdvice` in `src/instructions.js`) follow them.

- NASA Glenn Research Center. Glider problem (glide angle and L/D from distance and height). https://www.grc.nasa.gov/WWW/k-12/VirtualAero/BottleRocket/airplane/glidprob.html
  *Used for:* measuring L/D from a hand-released glide (`docs/VALIDATION.md` §7, glide mode in `validation/throw-log.html`).

## Optimization and robustness

- Mouret, J.-B., & Clune, J. (2015). Illuminating search spaces by mapping elites. arXiv:1504.04909.
  *Used for:* the MAP-Elites archive with one elite per sketch (`scripts/optimize.js`, `viewer/island-worker.js`).

- Hansen, N. (2009). Benchmarking a BI-population CMA-ES on the BBOB-2009 function testbed. In *GECCO '09 Companion (Workshop on Black-Box Optimization Benchmarking)*, 2389–2396. https://doi.org/10.1145/1570256.1570333
  *Used for:* restart strategies for CMA-ES. Betterfold uses the IPOP-style part: a restart doubles λ when progress stalls (`runNiche` in `scripts/optimize.js`).

- Auger, A., & Hansen, N. (2005). A restart CMA evolution strategy with increasing population size. In *2005 IEEE Congress on Evolutionary Computation (CEC)*, 1769–1776. https://doi.org/10.1109/CEC.2005.1554902
  *Used for:* the same IPOP restart rule (`scripts/optimize.js`). The CMA-ES itself is in `src/cmaes.js`.

- Hamano, R., Saito, S., Nomura, M., & Shirakawa, S. (2022). CMA-ES with margin: Lower-bounding marginal probability for mixed-integer black-box optimization. In *GECCO '22*, 639–647. https://doi.org/10.1145/3512290.3528827. Preprint: arXiv:2205.13482.
  *Used for:* the design decision to keep discrete choices out of CMA-ES. Fold types live in the sketch key, so plain CMA-ES only sees continuous parameters (`src/sketch.js`).

- Tanabe, R., & Fukunaga, A. S. (2014). Improving the search performance of SHADE using linear population size reduction. In *2014 IEEE Congress on Evolutionary Computation (CEC)*, 1658–1665. https://doi.org/10.1109/CEC.2014.6900380
  *Used for:* background. L-SHADE was the recommended comparison baseline for the search (`docs/PLAN.md`, step 9). It is not implemented yet.

- Hutter, F., Hoos, H., & Leyton-Brown, K. (2013). An evaluation of sequential model-based optimization for expensive blackbox functions. In *GECCO '13 Companion (BBOB workshop)*, 1209–1216. https://doi.org/10.1145/2464576.2501592
  *Used for:* the decision not to use a surrogate model. At Betterfold's evaluation budget, population methods are the better fit.

- Deb, K. (2000). An efficient constraint handling method for genetic algorithms. *Computer Methods in Applied Mechanics and Engineering*, 186(2–4), 311–338. https://doi.org/10.1016/S0045-7825(99)00389-8
  *Used for:* the feasibility rules. Feasible beats infeasible, and infeasible designs rank by total graded violation and are never flown (`prepare` and `evaluate` in `src/evaluate.js`, where infeasible fitness is −1 − violation).

- Takahama, T., & Sakai, S. (2008). Constrained optimization by ε constrained differential evolution with dynamic ε-level control. In *Advances in Differential Evolution*, Studies in Computational Intelligence, 139–154. Springer. https://doi.org/10.1007/978-3-540-68830-3_5
  *Used for:* background. ε-constrained selection is the fallback if the feasible region turns out to be thin. It is not implemented.

- Jakobi, N., Husbands, P., & Harvey, I. (1995). Noise and the reality gap: The use of simulation in evolutionary robotics. In *Advances in Artificial Life (ECAL '95)*, LNCS 929, 704–720. https://doi.org/10.1007/3-540-59496-5_337
  *Used for:* randomising the quantities the simulator cannot be trusted on, through the CD0 and CLmax multipliers in the scenarios (`SCENARIOS` in `src/evaluate.js`).

- Jakobi, N. (1997). Evolutionary robotics and the radical envelope-of-noise hypothesis. *Adaptive Behavior*, 6(2), 325–368. https://doi.org/10.1177/105971239700600205
  *Used for:* the same envelope-of-noise principle behind the model-uncertainty factors (`src/evaluate.js`).

- Tobin, J., Fong, R., Ray, A., Schneider, J., Zaremba, W., & Abbeel, P. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. In *IEEE/RSJ IROS 2017*, 23–30. https://doi.org/10.1109/IROS.2017.8202133
  *Used for:* the modern form of the same idea. It supports joint randomisation over throw, folding and model factors (`SCENARIOS`).

- Koos, S., Mouret, J.-B., & Doncieux, S. (2013). The transferability approach: Crossing the reality gap in evolutionary robotics. *IEEE Transactions on Evolutionary Computation*, 17(1), 122–145. https://doi.org/10.1109/TEVC.2012.2185849
  *Used for:* the plan to refit and re-rank after a small number of real tests (`docs/VALIDATION.md` §9). A learned transferability objective is not implemented.

## Validation methodology

The validation design draws on works already listed above:

- Obayashi et al. (2023): outcome classes, and the fact that the same design flies differently.
- Koos et al. (2013): refit after a few real tests.
- Miller (2021): launch extraction from slow-motion video.
- NASA Glenn glider problem: L/D from a glide.
- Pradier et al. (2016): copy-to-copy variability, which leads to copies being added before throws.

These shape `docs/VALIDATION.md`, `validation/throw-log.html` and `validation/analyze.js`. The statistical tools (Spearman rank correlation, two-stage bootstrap, design-effect power estimate) are standard methods and are not drawn from a specific source in the notes.

## Standard methods used in the code

- Katz, J., & Plotkin, A. (2001). *Low-Speed Aerodynamics* (2nd ed.). Cambridge University Press. https://doi.org/10.1017/CBO9780511810329
  *Used for:* the vortex-lattice method: horseshoe vortices, Biot–Savart segment velocities, three-quarter-chord control points and Kutta–Joukowski panel forces (`latticeFromRows`, `assembleAircraft`, `aero`, `inducedVelocity` in `src/physics.js`).

- Hansen, N. (2016). The CMA evolution strategy: A tutorial. arXiv:1604.00772. https://arxiv.org/abs/1604.00772
  *Used for:* the CMA-ES implementation and its default parameters (`src/cmaes.js`).

- McKay, M. D., Beckman, R. J., & Conover, W. J. (1979). A comparison of three methods for selecting values of input variables in the analysis of output from a computer code. *Technometrics*, 21(2), 239–245. https://doi.org/10.1080/00401706.1979.10489755
  *Used for:* Latin hypercube sampling of the 16 robustness scenarios and the folding-error copies (`lhs` in `src/evaluate.js`).

- Rockafellar, R. T., & Uryasev, S. (2000). Optimization of conditional value-at-risk. *Journal of Risk*, 2(3), 21–41. https://doi.org/10.21314/JOR.2000.038
  *Used for:* the CVaR risk measure. The robust score is CVaR₅₀, the mean of the worst half of the 16 outcomes (`evaluate` in `src/evaluate.js`); every design is judged on the same fixed scenarios (common random numbers).

- Karnin, Z., Koren, T., & Somekh, O. (2013). Almost optimal exploration in multi-armed bandits. In *Proceedings of the 30th International Conference on Machine Learning (ICML)*, PMLR 28(3), 1238–1246. https://proceedings.mlr.press/v28/karnin13.html
  *Used for:* successive halving, the budget schedule over sketches (`RUNGS` in `scripts/optimize.js`).

- Jamieson, K., & Talwalkar, A. (2016). Non-stochastic best arm identification and hyperparameter optimization. In *Proceedings of the 19th International Conference on Artificial Intelligence and Statistics (AISTATS)*, PMLR 51, 240–248. https://proceedings.mlr.press/v51/jamieson16.html
  *Used for:* the same successive-halving schedule, applied to non-stochastic search budgets (`scripts/optimize.js`).

- Acklam, P. J. An algorithm for computing the inverse normal cumulative distribution function (web note). **[unverified: original URL, which is no longer online]**
  *Used for:* the rational approximation of the inverse normal CDF used to draw scenario factors (`ninv` in `src/evaluate.js`).

## Software and tools

- Ku, J. S. *Flat-Folder* (JavaScript, MIT licence). https://github.com/origamimagiro/flat-folder
  *Used for:* the reference implementation of layer-order checking, which `layerOrderViolations` (`src/retention.js`) follows in spirit. No code was copied, and Betterfold has no dependency on it.

- Kraft, R. *Rabbit Ear* (JavaScript origami library, GPL-3.0). https://github.com/rabbit-ear/rabbit-ear
  *Used for:* background. It was evaluated and not used.

- Ghassaei, A. *Origami Simulator*. https://origamisimulator.org/
  *Used for:* background, for the deferred bar-and-hinge option (see Filipov et al. and Ghassaei et al. above).

- DEAP: BIPOP-CMA-ES example. https://deap.readthedocs.io/en/master/examples/bipop_cmaes.html
  *Used for:* the reference for the restart scheme (`scripts/optimize.js`). Betterfold has its own dependency-free CMA-ES (`src/cmaes.js`).

- three.js (MIT licence). https://threejs.org/
  *Used for:* 3D rendering in the viewer (`viewer/app.js`).

- Next.js (MIT licence), Vercel. https://nextjs.org/
  *Used for:* the hosted web app and its API routes (`app/`).

- Upstash Redis client (MIT licence). https://github.com/upstash/redis-js
  *Used for:* storage of the community board and presence (`lib/store.js`).
