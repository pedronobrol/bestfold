# Computational Origami: Representing and Searching Fold Sequences for Real Paper Airplanes

Context: the engine (JS, `src/fold.js` etc.) currently uses only all-layer simple folds on a facet/layer model with a 2D rigid transform per facet. Goal: decide the representation and algorithms needed so the optimizer can also express reverse folds, squash folds, partial-layer folds, centre-line interleaving, and locks (for example the Nakamura lock), while producing only physically foldable designs and running thousands of evaluations per minute.

## Q1. Formal models: simple folds, flat-foldability, hardness, and tractability for 5-10 step sequences

### Takeaway
Use a forward, sequential "some-layers simple fold" model plus a small set of compound moves (reverse, squash), and check every intermediate state with the facewise layer-order constraints. Never pose "is this crease pattern globally flat-foldable?", which is NP-hard. Simulating a given 5-10 step sequence is polynomial. The exponential part is only the search over which layers each step moves, and that branching is small (a stack of at most a few dozen layers).

### Cited Findings
- **Simple-fold layer models** (Akitaya, Demaine, Ku and co-authors):
  - *some-layers* folds the top or bottom k layers for any k.
  - *one-layer* folds only one layer, which suits thick material.
  - *all-layers* folds every layer under the fold line together.
  - Under all three models, deciding simple-foldability of an assigned crease pattern on orthogonal polygons is (weakly) NP-complete. This is from "Simple Folding is Really Hard" (JCDCGGG 2016 / JIP 2017). — [Akitaya et al. 2016 PDF](https://erikdemaine.org/papers/SimpleFolds_JCDCGGG2016/paper.pdf); [JIP version](https://scripts.mit.edu/~jasonku/pdf/SIMPLEFOLDS_JIP.pdf)
- A 2023 paper classifies polynomial vs NP-hard for every case (finite or infinite; one, some or all layers; assigned, unassigned or mixed orthogonal crease patterns; 1D, rectangular or arbitrary paper), except infinite all-layers folds of assigned orthogonal patterns on arbitrary paper. — [Complexity of Simple Folding of Mixed Orthogonal Crease Patterns, arXiv:2306.00702 (2023)](https://arxiv.org/pdf/2306.00702)
- Infinite all-layers simple foldability of a fully unassigned orthogonal crease pattern can be decided in linear time. — [summary in arXiv:2306.00702](https://web3.arxiv.org/abs/2306.00702); [INFINITEALLLAYERS paper](https://scripts.mit.edu/~jasonku/pdf/INFINITEALLLAYERS_JCDCGGG.pdf)
- Arkin, Bender, Demaine, Demaine, Mitchell, Sethia and Skiena, "When Can You Fold a Map?" (2000/2004), is the origin of the one-layer / all-layers / some-layers simple-fold framework and of map-folding decidability for rectangular grids. — [arXiv cs/0011026](https://arxiv.org/pdf/cs/0011026v2)
- **Bern & Hayes (SODA 1996)**, "The Complexity of Flat Origami", showed that deciding global flat-foldability is NP-hard for both assigned and unassigned crease patterns. They also disproved the idea that local (single-vertex) conditions are sufficient. — [summary via Wikipedia, Kawasaki's theorem](https://en.wikipedia.org/wiki/Kawasaki%27s_theorem); [Akitaya et al. 2016](https://erikdemaine.org/papers/SimpleFolds_JCDCGGG2016/paper.pdf)
- Global flat-foldability remains NP-hard even for box-pleated crease patterns. — Akitaya, Cheung, Demaine, Horiyama, Hull, Ku, Tachi, Uehara, "Box Pleating is Hard" (JCDCG 2015 / LNCS 2016). [PDF](https://scripts.mit.edu/~jasonku/pdf/BOXPLEATINGHARD_JCDCGG2015.pdf)
- **Local conditions:**
  - Kawasaki's theorem: at a flat-foldable vertex, the alternating sum of sector angles is 0, so each alternating set sums to 180°.
  - Maekawa's theorem: at a flat vertex, |M − V| = 2.
  - Both are necessary but not sufficient globally. Flat-Folder flags vertices that violate either one.
  - [Wikipedia: Kawasaki's theorem](https://en.wikipedia.org/wiki/Kawasaki%27s_theorem); [Flat-Folder README](https://github.com/origamimagiro/flat-folder)
- **Facewise global conditions (Akitaya, Demaine, Ku, "Computing Flat-Folded States", OSME 2024):**
  - Justin (1994) introduced the superposition of faces in the folded state (the "s-net"). The paper proves that a facewise definition is equivalent to the pointwise one.
  - A layer order between overlapping convex faces is valid iff it satisfies five constraint types:
    1. Antisymmetry.
    2. Transitivity: Λij, Λjk, Λki are not all equal.
    3. Tortilla-tortilla: an unfolded crease overlapped by other faces or creases.
    4. Taco-tortilla: a folded crease overlapping a face, so Λik = Λjk.
    5. Taco-taco: two overlapping folded creases, Λik+Λjk+Λil+Λjl ≡ 0 mod 4.
  - Verifying a facewise layer order takes O(min{n²p, n² + m·p²}) = O(n³) time, where p is the ply (maximum thickness). So verification is in P and finding an order is in NP.
  - [Akitaya, Demaine, Ku 2024 PDF](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf); [paper page](https://erikdemaine.org/papers/FlatFolder_OSME2024/)
- The same paper notes that computing folded geometry exactly runs into the sum-of-square-roots problem, so it is open whether crease-pattern flat-foldability is in NP. Practical code uses floating-point with epsilon tolerances. — [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)
- Eppstein (2023) gives a fixed-parameter algorithm for flat folding, parameterized by ply and the treewidth of the cell graph. It decides whether a folded state exists, but does not produce a move sequence. — [Eppstein blog, "Flat folding and map folding" (2023)](https://11011110.github.io/blog/2023/06/21/flat-folding-map.html); cited as [Eppstein 23] in [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)

### Inferences
- Every hardness result above concerns the inverse problem: given a crease pattern, find a sequence or folded state. A forward generative optimizer applies operations one at a time to a known valid state. Each step then only has to:
  1. compute the new geometry (polynomial),
  2. decide where the moved layers go in the stack (known by construction for some-layers simple folds), and
  3. optionally re-verify with the O(n³) facewise constraints.
- For paper airplanes (n roughly 10-200 faces, ply ≤ ~16), full verification is cheap enough to run on every candidate. The NP-hardness does not bite.
- The current all-layers model is the most restrictive. Switching to some-layers (fold the top k, or bottom k, layers of the stack under the line) gets most of the extra expressiveness at minimal cost, and stays a "simple fold" in the formal sense.
- Some-layers needs a connectivity closure. If you fold a layer, any layer hinged to it on the far side of the fold line must also move, unless the hinge lies on the fold line. Otherwise the paper tears.
- Reverse, squash and petal folds are not simple folds: they move several creases simultaneously, and some layers rotate the opposite way. They need to be compound operations (see Q3).

### Gaps
- I did not retrieve the full text of Arkin et al. or Bern & Hayes. The statements above come from abstracts and later papers' summaries of them.
- I found no published bound specific to sequences of 5-10 steps. The tractability argument here is my inference from polynomial per-step verification and small branching.

## Q2. How existing software represents fold sequences and layer orders

### Takeaway
Nearly all modern tools use the FOLD format (Demaine, Ku, Lang 2016): vertices, edges with M/V/F/B assignments, faces, per-vertex folded coordinates, and pairwise `faceOrders` for layering. Flat-Folder (Ku, JavaScript, MIT licence) is the best reference implementation of layer-order solving. Rabbit Ear (Kraft, JavaScript, GPLv3) offers an importable JS library with a layer solver based on Ku's algorithm. Sequence generation from crease patterns (ORIZU: Akitaya, Mitani et al. 2012-13) uses graph rewriting run backwards.

### Cited Findings
- **FOLD format** (Demaine, Ku, Lang 2016):
  - Uses flat arrays (`vertices_coords`, `edges_vertices`, `edges_assignment`, `faces_vertices`, …) and supports multiple frames (crease pattern and folded state).
  - `faceOrders` (and `edgeOrders`) store above/below relations between pairs of overlapping faces, which is enough to specify a flat-folded state.
  - [FOLD spec](https://edemaine.github.io/fold/doc/spec.html); [FOLD CGW2016 paper](https://scripts.mit.edu/~jasonku/pdf/FOLD_CGW2016.pdf)
- **Flat-Folder** (Jason S. Ku, 2022):
  - Browser application, MIT licence, `src/` plus `package.json`, so JavaScript.
  - Computes valid flat-folded states of assigned or unassigned crease patterns, the overlap graph (cells, segments, points), layer orders, and the number of states.
  - It creates O(n²) Boolean variables in O(n⁴) time and a constraint graph of size O(n³) in O(n⁵) time. Each component is then solved by brute force.
  - Inputs: FOLD, SVG (red/blue/grey strokes for M/V/flat), .opx and .cp. Chrome is reported faster than Firefox, and much faster than Safari.
  - [GitHub flat-folder](https://github.com/origamimagiro/flat-folder)
- **Flat-Folder algorithm** (Akitaya, Demaine, Ku 2024):
  1. Build a pruned constraint graph over unassigned pairwise order variables.
  2. Split it into k independent components.
  3. Enumerate each component's 2^tᵢ assignments.
  - Total time is O(n³ + Σ tᵢ³ 2^tᵢ). The result is an implicit representation of all folded states as a product of component solutions.
  - [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)
- **Benchmark scale:**
  - Flat-Folder found at least one folded state "within seconds or minutes" for every example in a 366-crease-pattern Instagram dataset (n = 7 to 11,859 faces). It caps output at 10,000 states per component.
  - Kamiya's Ryujin 2.1 (5,773 faces) produced 453,998 variables and about 30.5M transitivity constraints. It has more than 9·10⁸⁴ folded states.
  - A follow-up (Ku, Terao, Terao 2024) treats the non-transitivity constraints as a linear system, so more variables are inferred before brute force.
  - [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)
- **ORIPA** (Mitani 2007): "Development of origami pattern editor (ORIPA) and a method for estimating a folded configuration of origami from the crease pattern", IPSJ Journal 48(9):3309-3317. ORIZU uses it to compute folded forms, and the facewise-layer-order paper cites it ([Mitani 08]) for exploiting the cell structure of the folded arrangement. — [citation in Akitaya et al. SIGGRAPH 2013 poster](https://history.siggraph.org/wp-content/uploads/2023/01/2013-Poster-47-Akitaya_Generating-Folding-Sequences-from-Crease-Patterns-of-Flat-Foldable-Origami.pdf); [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)
- **ORIZU / sequence generation** (Akitaya, Mitani, Kanamori, Fukui; SIGGRAPH 2013 poster; 2012 Dynamics & Design Conference "graph pattern matching" paper):
  - Works backwards from the crease pattern to the blank square.
  - Creases are grouped into "reflection paths" using Bern-Hayes local foldability. A "complete" path (a loop, or border to border) can be removed directly, which undoes a simple fold.
  - Otherwise one of four catalogued "maneuvers" (recurring diagram steps) is applied as a graph-rewriting rule.
  - All matches are stored in a "step sequence graph" from which the user picks a path. Diagram arrows are derived by diffing consecutive states.
  - Akitaya's seminar slides use the inside reverse fold as the worked rewriting example.
  - [SIGGRAPH 2013 poster PDF](https://history.siggraph.org/wp-content/uploads/2023/01/2013-Poster-47-Akitaya_Generating-Folding-Sequences-from-Crease-Patterns-of-Flat-Foldable-Origami.pdf); [project page](https://cgg.cs.tsukuba.ac.jp/projects/2013/generation_diagrams/index.html); [Akitaya seminar slides](https://www.npal.cs.tsukuba.ac.jp/~akitaya/CSSeminarAkitaya.pdf)
- **Origami Simulator** (Ghassaei, Demaine, Gershenfeld, 7OSME 2018):
  - Folds every crease at once rather than in sequence. It is a compliant bar-and-hinge dynamic model:
    - distance (axial) constraints,
    - face (anti-shear) constraints,
    - angular constraints, with separate fold and facet stiffness.
  - It uses Euler/Verlet integration with damping, runs in GPU fragment shaders, and builds on Schenk & Guest and Tachi's "Freeform Variations of Origami".
  - The page I read does not describe collision or layer handling.
  - [origamisimulator.org](https://origamisimulator.org/)
- **Rabbit Ear** (Robby Kraft):
  - JavaScript library built on the FOLD graph.
  - Its `layer/` module solves face stacking order. `ear.layer.solver(graph)` takes a folded model and implements Ku's algorithm; there are also single-vertex and assignment solvers.
  - npm package `rabbit-ear`, GPLv3.
  - [npm rabbit-ear](https://www.npmjs.com/package/rabbit-ear); [GitHub](https://github.com/rabbit-ear/rabbit-ear); [unpkg readme](https://unpkg.com/rabbit-ear@0.9.4/readme.md)
- Jia, Mitani, Uehara (2020) study whether a given overlapping order of all squares of an m×n map is valid under simple folding. This is relevant for checking whether a layer order is reachable by a sequence of simple folds. — [J. Information Processing 28 (2020)](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_816/_article)

### Inferences
- Adopt FOLD as the internal or interchange format:
  - per-vertex 2D folded coordinates, or a per-face affine/reflection transform as now;
  - `edges_assignment`;
  - an explicit layer order.
- This lets you dump any optimizer candidate into Flat-Folder or Rabbit Ear to cross-check validity during development.
- ORIZU's backward graph-rewriting is the wrong direction for a generative optimizer. Its catalogue of "maneuvers" is still exactly the set of compound operations to implement forwards.
- Origami Simulator's compliant 3D solver is useful for the final 3D shape (dihedral, wing droop), but it is too slow and too collision-agnostic for validating layer orders in the inner loop.
- Licensing: Flat-Folder is MIT, so code can be borrowed. Rabbit Ear is GPLv3, so it is a copyleft risk if the engine is distributed.

### Gaps
- I could not access ORIPA's 2007 layer-estimation algorithm in full text (Japanese IPSJ paper).
- I could not confirm technical details of ORIEDITA / Orihime (successors of ORIPA), Tachi's Rigid Origami Simulator, Origamizer, or Lang's TreeMaker and ReferenceFinder from primary sources in this session. From prior knowledge, those are crease-pattern design tools and do not represent fold sequences, but this is unverified here.
- I did not verify Ku, Terao, Terao 2024 ("An Algebraic Approach to …") beyond its citation.

## Q3. Representing and validating reverse, squash and petal folds and locks on a layered flat state

### Takeaway
Treat each non-simple maneuver as a macro of simultaneous creases applied to a selected sub-stack of layers. After applying it, run the facewise constraint check (antisymmetry, transitivity, taco-tortilla, taco-taco) on only the faces it touched. Model a lock (for example the Nakamura lock) as a some-layers fold of a single top flap over others. Its holding effect is a "trapped-layers" property you compute from the layer order, not a new kind of fold.

### Cited Findings
- ORIZU confirms that classical steps beyond simple folds can be modelled as discrete graph-rewriting rules ("maneuvers") that keep the crease pattern locally flat-foldable. The inside reverse fold is the worked example. — [SIGGRAPH 2013 poster](https://history.siggraph.org/wp-content/uploads/2023/01/2013-Poster-47-Akitaya_Generating-Folding-Sequences-from-Crease-Patterns-of-Flat-Foldable-Origami.pdf); [Akitaya slides](https://www.npal.cs.tsukuba.ac.jp/~akitaya/CSSeminarAkitaya.pdf)
- Ida & Takahashi (ADG 2021, EPTCS 352, arXiv 2022) propose modelling the squash fold, and potentially other classical folds, by temporarily cutting along a crease. This turns the compound move into simpler fold operations; the cut is then rejoined. It is in the line of Ida's "Eos"/"Orikoto" computational-origami systems. — [arXiv:2201.00536](https://arxiv.org/pdf/2201.00536)
- Facewise validity constraints that any compound operation's result must satisfy: taco-tortilla, taco-taco, tortilla-tortilla and transitivity, as listed under Q1. — [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)

### Inferences (concrete design proposal)

**State.** Keep the following:
- Facets, each with a rigid transform (rotation, translation and reflection flag) plus its polygon in sheet space.
- Folded-space cells: the arrangement of all folded facet outlines.
- Per cell, an ordered stack of facet ids, bottom to top. This is equivalent to FOLD `faceOrders` restricted to overlapping pairs, and makes "top k layers" queries O(1).
- Edges (hinges) between facets, with M/V and folded/unfolded state.

**Operations** (forward, each producing a new state or rejecting):
1. **SomeLayersFold(line, side, k, direction)**: fold the top (or bottom) k layers on one side of the line, for a valley or a mountain.
   - Take the closure over hinges not on the line. If closure pulls in layers outside the top k, reject or expand k.
   - The moved layers are reflected and their stack order reversed. Valley places them on top of the stationary stack on the other side; mountain places them beneath.
   - The all-layers fold is the special case k = ∞.
2. **InsideReverseFold(flap, line)**: precondition is a 2-layer (or 2m-layer) flap folded along a spine crease, as in an airplane's centre fold.
   - Mirror the fold line across the spine into both layers. The two layers get opposite M/V on the new crease, and the spine segment beyond the line flips from valley to mountain.
   - Geometrically, both halves are reflected across the line. Their order becomes inverted and inserted between the two stationary layers.
   - The outside reverse fold is the same, except the moved layers wrap outside.
   - Validate by checking Kawasaki/Maekawa at the new degree-4 vertex on the spine (automatically satisfied by mirror symmetry) and taco-taco between the new crease pair.
3. **SquashFold(flap, spineLine)**: open a 2-layer flap and flatten it symmetrically about a new line. This is equivalent to Ida & Takahashi's cut-then-two-simple-folds decomposition. Implement it as "cut along hinge h, apply two simple folds, rejoin h, verify".
4. **PetalFold**: two squash-like moves plus a valley fold. It is unlikely to matter for airplanes, so implement it last.
5. **Lock (Nakamura-style)**: a SomeLayersFold with k = 1 (or the top flap only), so a nose tip is folded over flaps that lie beneath it.
   - Derive a feature `lockedFacets`: the set of facets whose free edges are covered from above or below by a folded-over flap whose crease is perpendicular-ish to their opening direction.
   - Feed this into the physics/robustness model (unfolding resistance) rather than geometry.

**Validation per step:**
- Recompute only the cells touched by moved facets.
- Check transitivity and taco-taco/taco-tortilla constraints for pairs involving moved facets. Stacking by construction (insert the moved block contiguously) makes the result valid whenever the moved block does not need to interleave with stationary layers.
- Crossing-the-centre-line folds with interleaving are where a real penetration can happen. In those cases, run the local constraint check.

### Gaps
- I found no paper that formalises the inside/outside reverse fold as an operation on a layered flat state with a correctness proof. The formalisation above is my synthesis.
- I found no formal treatment of "locks" in computational-origami literature.
- I could not access the full text of Ida & Takahashi to see whether their framework (Eos / Orikoto) already defines reverse folds.

## Q4. Practical algorithms for layer ordering and penetration checking

### Takeaway
For a forward simulator, maintain the layer order incrementally, so no solving is needed. Use the Akitaya-Demaine-Ku facewise constraints as an O(n³)-worst, roughly O(n·p²)-in-practice checker on moved faces. Use Ku's component-decomposed brute force (or a small SAT encoding) only when an operation leaves insertion positions ambiguous. That ambiguous case is a tiny search, because airplane ply is small.

### Cited Findings
- Layer ordering can be expressed as Boolean pairwise variables, one per overlapping face pair, with the constraints antisymmetry, transitivity, taco-taco, taco-tortilla and tortilla-tortilla.
  - In practice, decomposing the pruned constraint graph into components makes even huge models tractable: Ryujin 2.1 ends up as 248 components, most having 2 assignments.
  - Low ply allows faster verification via the cell adjacency structure, O(n² + m·p²), and the same structure was used by Mitani (2008) and Eppstein (2023).
  - [Akitaya, Demaine, Ku 2024](https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf)
- A layer-ordering graph on faces, with an edge where one face must be above another, needs to be acyclic for a valid order. Edges implied by transitivity can be pruned. — [Folding Flat Crease Patterns with Thick Materials, arXiv:1601.05747](https://arxiv.org/pdf/1601.05747) (Ku & Demaine)
- Eppstein's (2023) algorithm is fixed-parameter tractable in ply and treewidth. — [Eppstein 2023 blog](https://11011110.github.io/blog/2023/06/21/flat-folding-map.html)

### Inferences
- **Recommended algorithm for the engine:**
  1. Stack-per-cell representation. For each folded-space cell, keep an array of facet ids. A some-layers fold slices the top k entries and reverses them, then pushes them onto the target cells. That costs O(cells touched × ply).
  2. Penetration check. For each newly created folded crease (taco), and for every other folded crease collinear and overlapping with it, assert the taco-taco nesting condition: the two tacos must be nested or disjoint in the stack, never interleaved. For each face overlapping the taco's crease line, assert taco-tortilla: the face is not between the two taco layers. That costs O(ply²) per crease pair.
  3. Global sanity (debug mode only): export to FOLD and verify with Flat-Folder's checker.
- **Throughput estimate (inference, not measured):**
  - A typical dart or glider has ≤ 8 steps, ≤ ~64 facets and ply ≤ ~16.
  - Per-step work is then about 10⁴-10⁵ primitive operations, so the cost is microseconds to a millisecond in JS.
  - Thousands of full sequences per minute are realistic. Use typed arrays and avoid allocating polygons per step.
- **Floating-point.** Exact geometry involves square roots (sum-of-square-roots is open). Snap fold-line parameters to a grid, or use rational reference points as in ReferenceFinder. This avoids sliver facets and epsilon-induced false overlaps, and also makes designs reproducible by hand.

### Gaps
- I found no dedicated "layer ordering via SAT" paper with a published SAT encoding and benchmarks. Flat-Folder uses component-wise brute force instead. The FOLD/SAT link in search results came from an unrelated Hugging Face project and was not used.
- I did not obtain Ku, Terao, Terao 2024 (algebraic inference of more variables).

## Q5. Prior work on computational design and generation of paper airplanes

### Takeaway
Graphics and robotics work on flyable paper or foam planes exists, but none of it searches over fold sequences: designs are parameterised by a few fold or wing-shape parameters. This project's "fold-sequence plus validity" approach appears to be unexplored territory.

### Cited Findings
- **Pteromys** (Umetani, Koyama, Schmidt, Igarashi, ACM TOG / SIGGRAPH 2014): interactive design and optimisation of free-formed hand-launched gliders, which are flat plates, not folded.
  - It learned a nonlinear wing-force model from video-captured flight trajectories.
  - It optimises the user's wing configuration to maximise "flight-ability".
  - The paper compares Pteromys with a traditional workflow for novice users.
  - [Autodesk Research page](https://www.research.autodesk.com/publications/pteromys-interactive-design-and-optimization-of-free-formed-free-flight-model-airplanes/); [project page](https://cgenglab.github.io/en/publication/sigg14_pteromys); [PDF](https://research.autodesk.com/app/uploads/2023/03/pteromys-interactive-design-and.pdf_recBi2ySn7hwQD2eS.pdf)
- **PaperBot** (Columbia / Stanford, arXiv 2403.09566, 2024):
  - A robot folds and throws paper airplanes in a 5-parameter space: two fold-position/orientation pairs (left and right) plus release timing, with a 3-parameter symmetric ablation.
  - It uses an MLP surrogate (4 layers × 512 units) with ε-greedy sampling, and gradient-ascent inverse design on the surrogate.
  - Within 100 real trials (about 3 hours) it exceeded the best human design, entirely without simulation.
  - The authors say air interaction is "notably difficult to simulate".
  - [arXiv 2403.09566](https://arxiv.org/html/2403.09566v1); [project](https://paperbot.cs.columbia.edu/)
- **Obayashi et al. 2023** (EPFL CREATE Lab, Scientific Reports): a robotic system fabricates, launches and models paper airplanes with parameterised wing geometry. It observed discrete trajectory classes (nose dive, glide, recovery glide). It cites a graphics tool that does aerodynamics-driven optimisation constrained to flyable configurations. — [Sci. Rep. 2023](https://www.nature.com/articles/s41598-023-31395-0)

### Inferences
- The fold-sequence parameterisations used so far (PaperBot's 4 fold parameters) are far narrower than what is proposed here.
- The flight-model side can borrow from Pteromys (a data-fitted wing-force model) and from Obayashi's trajectory classes, which give a natural fitness discretisation.
- A cheap foldability-validity layer (Q3/Q4) is exactly what neither project has. It would let the optimiser explore real traditional designs (darts, Nakamura lock, gliders with reverse-folded tails) safely.

### Gaps
- I found no SIGGRAPH or graphics paper that generates paper-airplane fold sequences.
- I found no OSME paper specifically on paper airplanes. I did not search OSME proceedings exhaustively.
- I did not verify any Disney Research work on foldable designs.
