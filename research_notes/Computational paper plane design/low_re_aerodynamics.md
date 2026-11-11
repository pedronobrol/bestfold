# Low-Reynolds-Number Aerodynamics of Paper Airplanes and Thin Flat-Plate / Delta Wings (Re ~2x10^4 to 1.5x10^5)

Scope note: I read the full text of three primary sources: Ng/Pey/Schluter 2009 (paper dart), Ananda/Sukumar/Selig 2015 (flat-plate wings AR 2-5), and Tokuhiro/Kawashima/Ohtake 2017 (Nihon Univ. paper glider). I also extracted the equations from Polhamus NASA TN D-6243 (1971). Pelletier & Mueller 2000, Torres & Mueller 2004, Laitone 1997 and Mueller 1999 sit behind paywalls (AIAA/Springer). For those I could only get abstracts and secondary quotes. Their numbers here come from abstracts, or from other papers that quote them, and each one is labelled that way.

---

## 1. Measured CL, CD, Cm for thin flat and cambered plates at Re 20k-150k (lift slope, CLmax, stall, CD0, AR and leading-edge effects)

### Takeaway
At Re 6x10^4 to 1.6x10^5, thin flat-plate wings of AR 2-5 have:
- CLmax of about 0.55-0.7, nearly independent of AR, with stall near α ≈ 10°
- CDmin of about 0.01-0.02
- a lift slope that follows Helmbold/lifting-line theory but falls slightly as Re drops
- a very low Oswald factor (e0 ≈ 0.3-0.8, lower at higher AR)
- no hysteresis
- a flat post-stall lift plateau up to 30°

Thin plates, and 5% circular-arc cambered plates in particular, are insensitive to Re and turbulence below Re 70k. Conventional thick airfoils such as the NACA 0012 are not. Cambered plates outperform flat plates.

### Cited Findings
**Ananda, Sukumar & Selig (2015), Aerospace Sci. & Tech. 42:392-406.** Ten flat-plate wings, AR = 2, 3, 4, 5, taper λ = 0.5/0.75/1, Re = 60,000-160,000, α from -15° to 30°. — [Ananda et al. 2015 PDF](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Models:** t/c 4.3% (3.81 mm), 5:1 elliptical leading edge, 10:1 elliptical trailing edge, MAC 88.9 mm. Pelletier & Mueller and Shields & Mohseni used t/c 2.6% with a 5:1 trailing edge. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **CLmax** was 0.55-0.7 for all models. It rose only slightly with Re and stayed "relatively constant with variation in aspect ratio" for AR 2-5. This contrasts with the large CLmax increase at lower AR that Torres & Mueller saw for AR ≤ 2. Stall α ≈ 10° on the AR-3 wing (Re 60k flow visualisation). — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Stall definition:** stall was taken as the α of maximum |dCm/dα|, because the flat plates showed "relatively flat post-stall curves". In the post-stall region, lift and moment coefficients stayed roughly constant up to 30°. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **CDmin:** about 0.01-0.02 for all wings. For comparison, flat-plate skin friction over the same Re range is 0.0066-0.0108 laminar (Blasius) and 0.0134-0.0164 turbulent. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Lift slope:** CLα rises with Re and AR, and taper has minimal effect. The measured values follow the elliptic-loading formula CLα = 2π·A/(A+2) and the Helmbold equation. AR 2 and AR 3 agree closely with theory. At AR 2, the measured slope also matches slender-wing theory, CLα = πA/2. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Low-AR excess over Helmbold:** the trend relative to Helmbold is more lift at lower AR. The authors speculate this is side-edge vortex lift (the Polhamus analogy applied to the tips) but did not verify it. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Laminar separation bubble:** oil flow showed a bubble at the leading edge of the centre section before stall. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Pitching moment:** before stall, Cm,c/4 is small. At and after stall, large nose-down moments appear, and they are larger for low-AR, low-taper wings. The aerodynamic centre sits near c/4 at low α and moves toward the trailing edge as stall approaches. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Oswald factor (Ananda):** e0 was fitted from CD vs CL² over CL 0-0.5. It ranges from about 0.3 to 0.8. It increases with Re and decreases with AR, from about 0.81 at AR 2 to about 0.33 at higher AR. Literature values of 0.6-0.9 do not apply. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Oswald factor (quoted from other papers):** Pelletier & Mueller's flat-plate rectangular wings at Re 140k gave e0 ≈ 0.39, 0.34 and 0.22 for AR 2, 3 and 6. Torres & Mueller's flat plates at Re 70-100k gave e0 ≈ 0.82, 0.57 and 0.38 for AR 0.5, 1 and 2. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **L/D:** for flat plates the high-L/D α range is narrow, with "precipitous drops" on either side. Max L/D increases with Re. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Hysteresis:** none was observed for any wing at any Re tested. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Pelletier & Mueller (2000), J. Aircraft 37(5):825-832.**
  - Thin flat and cambered plates (t/c 1.93%), Re ≈ 60,000-200,000, measuring lift, drag and quarter-chord moment. — [Typeset abstract](https://typeset.io/papers/low-reynolds-number-aerodynamics-of-low-aspect-ratio-thin-2jtrp6hdzi)
  - Cambered plates performed better than flat plates. Trailing-edge geometry and tunnel turbulence had little effect on lift and drag. — [Typeset abstract](https://typeset.io/papers/low-reynolds-number-aerodynamics-of-low-aspect-ratio-thin-2jtrp6hdzi)
  - Flow on the cambered wing stayed attached to a higher α than on the flat plate (secondary summary). — [search summary](https://typeset.io/papers/low-reynolds-number-aerodynamics-of-low-aspect-ratio-thin-2jtrp6hdzi)
- **Laitone (1997), Exp. Fluids 23:405-409.**
  - Rectangular wings at Re down to 20,000 in a low-turbulence tunnel. — [Springer](https://link.springer.com/content/pdf/10.1007%2Fs003480050128.pdf); [ScholarHub abstract](https://scholarhub.vn/publication/:slug/5e7c0907-cddf-47f4-895d-201e52b0e75f)
  - Below Re 70,000 the best profile was a thin plate with 5% circular-arc camber. — [Springer](https://link.springer.com/content/pdf/10.1007%2Fs003480050128.pdf); [ScholarHub abstract](https://scholarhub.vn/publication/:slug/5e7c0907-cddf-47f4-895d-201e52b0e75f)
  - The 5% cambered plate and all thin plates were "relatively insensitive" to Re and turbulence. The NACA 0012 was "very seriously affected" by both below Re 50,000. — [Springer](https://link.springer.com/content/pdf/10.1007%2Fs003480050128.pdf); [ScholarHub abstract](https://scholarhub.vn/publication/:slug/5e7c0907-cddf-47f4-895d-201e52b0e75f)
  - A sharp trailing edge was not needed to develop lift. A thin wedge gave about the same lift as a 1% flat plate. Data at Re 20,700 supported Schmitz's earlier conclusions. — [Springer](https://link.springer.com/content/pdf/10.1007%2Fs003480050128.pdf); [ScholarHub abstract](https://scholarhub.vn/publication/:slug/5e7c0907-cddf-47f4-895d-201e52b0e75f)
- **Torres & Mueller.** "Low-Aspect-Ratio Wing Aerodynamics at Low Reynolds Numbers", AIAA J. 42:865-873 (2004). Wings of AR 0.5-2.0 at Re ≈ 70,000-200,000. — [WPI thesis reference list](https://digital.wpi.edu/concern/etds/j6731386g?locale=fr); [Mueller & Torres report](https://typeset.io/pdf/aerodynamics-of-low-aspect-ratio-wings-at-low-reynolds-4puhe92oc5.pdf)
- **Torres & Mueller lift and drag correlations** exist for rectangular plates with 0.5 ≤ AR ≤ 2 and α ≤ 50°. They are reproduced in an Energies (2015) paper that I could not open (HTTP 403). — [MDPI Energies 8(4):2438](https://mdpi.com/1996-1073/8/4/2438)
- **Re effect on low-AR plates (Japanese tunnel studies).**
  - Rectangular AR-1 thin plate: at Re = 1×10^4 the lift slope was small and CLmax large because of extra vortex lift. CLmax fell as Re decreased, and the vortex lift had nearly disappeared by Re ≈ 10^3. — [J-STAGE TJSASS 62(6) 2019](https://www.jstage.jst.go.jp/article/tjsass/62/6/62_T-19-11/_article/-char/en)
  - A companion study covering AR 0.5-2 found the same trend, which it attributes to tip-vortex behaviour. — [J-STAGE TJSASS 62(6) 2019](https://www.jstage.jst.go.jp/article/tjsass/62/6/62_T-19-11/_article/-char/en)
- **Nonlinear lift threshold:** for thin plates, a high stall angle and vortex lift produce clearly nonlinear lift curves once AR falls below about 1.6. — [Cambridge J. Mech., low-AR thin-plate wings](https://resolve.cambridge.org/core/journals/journal-of-mechanics/article/aerodynamic-investigations-of-lowaspectratio-thin-plate-wings-at-low-reynolds-numbers/9099066D94CDB704D93C86F0752B3427)
- **Corrugated/pleated thin airfoils at Re 10^3-10^4 (Okamoto group).** With the corrugation placed appropriately, CDmin fell and max L/D rose compared with a plain thin airfoil. Vortices trapped in the concave pleats were credited. Okamoto, Yasuda & Azuma (1996, J. Exp. Biol. 199:281-294) found pleated models better than the flat-plate model at all α (secondary citation). — [Okamoto et al. search summary; Akita repository](https://akita.repo.nii.ac.jp/record/927/files/KJ00005254825.pdf); [APS DFD 2006 abstract](https://archive.aps.org/dfd/2006/ab/10)

### Inferences
- **Moderate-AR (2-5) paper gliders.**
  - Use CLα from Helmbold with a 2D slope a bit below 2π at Re < 10^5. Measured values sit slightly under theory at the lowest Re.
  - CD0 ≈ 0.015-0.02 for a smooth single plate. Paper surfaces, creases and multi-layer leading edges will be higher (see Q5).
  - Use e0 ≈ 0.4-0.8 rather than 0.9+. This is the single largest correction relative to textbook models.
  - Stall at α ≈ 8-12°, with a flat post-stall CL plateau of about 0.55-0.7 rather than an abrupt drop.
- **Thin-plate robustness:** because thin plates are insensitive to Re and turbulence (Laitone; Pelletier & Mueller), a single Re-independent table for 2×10^4-1.5×10^5 is defensible to first order. That would not hold for thick airfoils.
- **Pitch modelling:** Cm,c/4 ≈ 0 pre-stall for a flat plate. A strong nose-down break at stall, with the aerodynamic centre moving aft, gives a natural stall-recovery moment. This matters for phugoid and stall behaviour in a sim.

### Gaps
- I could not get Torres & Mueller (2004) CLmax and stall-angle numbers for AR 0.5/1/2. From memory of the literature, CLmax is roughly 1.0-1.2 at AR ≈ 1 with stall in the 30-45° range, but I could not verify this, so I am not citing it. A paywalled copy would be needed.
- I could not access Mueller (1999) "Aerodynamic measurements at low Reynolds numbers for fixed wing MAVs" (RTO/VKI lecture). The typeset PDF link returned no content.
- I could not extract Laitone's Re 20,700 numeric lift slope or CLmax from the figures.
- I found no data on the effect of Okamoto & Azuma-style thin plates at Re ~10^4 beyond the qualitative summaries.

---

## 2. Low-aspect-ratio delta wings: vortex lift (Polhamus), when it matters, VLM inclusion, low-Re data

### Takeaway
For sharp-edged deltas, Polhamus' leading-edge-suction analogy gives
CL = Kp·sinα·cos²α + Kv·cosα·sin²α, with ΔCD = CL·tanα.
NASA reports "excellent predictions" across a wide range of α and AR.

Sharp-edged delta lift is nearly Re-independent: a 70° delta at Re 60,000 matches higher-Re data. A paper dart (AR ≈ 1.1, 67° sweep) has a vortex-lift-dominated lift curve that stalls only at about 30°.

Rectangular low-AR plates (AR ≲ 1.6) also get nonlinear "side-edge" vortex lift, but there is a dispute over whether this is truly leading-edge vortex lift.

### Cited Findings
- **Polhamus equations (NASA TN D-6243, 1971, charts for delta, arrow and diamond wings):** CL = Kp sinα cos²α + Kv cosα sin²α and ΔCD = CL tanα. Kp is the potential-flow constant (equal to the lifting-surface lift slope) and Kv is the vortex-lift constant derived from the leading-edge suction. Both are given as charts versus AR and planform. Combining potential and vortex lift gives "excellent predictions of lift and drag due to lift of sharp-edge delta wings over a wide range of angles of attack and aspect ratios." — [Polhamus TN D-6243 (NTRS)](https://ntrs.nasa.gov/api/citations/19710012498/downloads/19710012498.pdf)
- **Physical basis:** the potential-flow leading-edge suction force, lost to separation at a sharp edge, reappears as a normal force from the reattached leading-edge vortex. — [arXiv analysis of delta wings](https://arxiv.org/pdf/2609.15957)
- **NASA validation at very low AR:** the method was applied to a sharp-edge delta of AR 0.25 at Mach 0.143-10.4. — [NTRS 19740011530](https://ntrs.nasa.gov/api/citations/19740011530/downloads/19740011530.pdf)
- **Side-edge extension:** the same analogy applied to the side edges of rectangular wings (Lamar's method) explains nonlinear lift on low-AR rectangular wings, because strong tip vortices create low-pressure peaks inboard of the side edges. — [Ananda et al. 2015 citing Lamar 1974 & Polhamus 1966/1971](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Low-Re delta data (Traub, Moeller & Rediniotis, J. Aircraft, "Low-Reynolds-number effects on delta-wing aerodynamics"):** lift curve for a 70° delta at Re 60,000. Compared with Wentz & Kohlman's higher-Re data for the same geometry, "the influence of the Reynolds-number on sharp edged delta wings is minimal." — [Ng et al. 2009 citing Traub et al. and Wentz & Kohlman 1971](https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf)
- **Kaplan, Altman & Ol (Univ. Dayton / AFRL), water tunnel:** low-AR flat plates, including delta planforms, at Re 8,000 and 24,000. Lift inferred from wake tip-vortex circulation agreed well with force-balance data and with classical inviscid predictions. — [Wake vorticity measurements, U. Dayton](https://ecommons.udayton.edu/mee_fac_pub/123); [Planform effects on flat-plate vortices](https://ecommons.udayton.edu/mee_fac_pub/83)
- **Contradicting view:** Traub's (2023, Aerospace 10(7):597) analysis of low-AR rectangular flat plates finds low sensitivity to Re over three orders of magnitude. It questions whether a leading-edge-vortex lift component exists for unswept leading edges in steady flow, i.e. the nonlinear lift may come from the tips only. — [MDPI Aerospace 10(7):597](https://mdpi.com/2226-4310/10/7/597)
- **Rectangular AR-1 plates at very low Re:** vortex lift (and the associated high CLmax) disappears as Re falls toward 10^3. It is present at Re 10^4. — [J-STAGE TJSASS 2019](https://www.jstage.jst.go.jp/article/tjsass/62/6/62_T-19-11/_article/-char/en)
- **Nonlinear threshold:** clear nonlinear lift increase from vortex lift appears for AR < 1.6 (thin plates). — [Cambridge J. Mech.](https://resolve.cambridge.org/core/journals/journal-of-mechanics/article/aerodynamic-investigations-of-lowaspectratio-thin-plate-wings-at-low-reynolds-numbers/9099066D94CDB704D93C86F0752B3427)

### Inferences
- **When vortex lift matters:**
  - For the dart (AR ≈ 1, Λ ≈ 67°), vortex lift is first-order at all α above a few degrees, because the Kv sin²α term grows quadratically.
  - For moderate-AR gliders (AR 2-5, low sweep), it is a small correction: Ananda saw only mild excess lift at AR 2, consistent with slender-wing theory.
  - A rough rule: include it when AR ≲ 1.6 or leading-edge sweep ≳ 55-60°.
- **VLM implementation:** this is standard practice, inferred from the Polhamus/Lamar approach rather than from a single source I verified.
  1. Run the VLM to get the potential lift (Kp, the linear slope).
  2. Compute leading-edge suction from the VLM's spanwise loading, using the Lan/Lamar suction-analogy method.
  3. Rotate that suction to act normal to the surface (vortex lift) instead of in-plane (thrust), giving Kv·sin²α·cosα.
  4. Do the same for side edges on rectangular tips.
  5. Set leading-edge thrust to zero, because the edge is sharp. That gives ΔCD = CL·tanα, the "no-suction" drag-due-to-lift that dominates paper-dart drag.
- **Example constants for AR = 1:** Kp ≈ πA/2 ≈ 1.57 (slender-wing theory, consistent with Ananda's quote of CLα = πA/2). Kv approaches π for slender deltas, which I recall from Polhamus' charts. Kv should be read from Fig. 1 of TN D-6243 before use.
- **Low-Re delta stall:** vortex breakdown, not Re, limits CLmax for deltas. Expect stall at about 30-35° and CLmax around 1.0-1.2 for a 67-70° sweep. The ~30° stall is cited for the paper dart (Q3). The CLmax value is an expectation and has not been verified.

### Gaps
- I could not extract numeric Kp/Kv chart values from TN D-6243 because the OCR text was garbled. Read them from the PDF figures.
- I found no air-tunnel force data for an AR ≈ 1 flat-plate delta at Re 2×10^4-10^5 other than Traub et al. (70° delta, Re 60k; values not extracted) and the Ng et al. paper-dart water-tunnel test.
- Vortex breakdown position versus α at low Re for thin paper edges (rounded by folding) was not found.

---

## 3. Measurements of actual paper airplanes (wind/water tunnel and flight)

### Takeaway
Two primary measurement sets were found.

1. **A4 dart (Ng, Pey, Schluter et al., NTU, AIAA 2009-3958).**
   - Flight: L/D ≈ 5.0, CL ≈ 0.17, V ≈ 4.9 m/s (Re ≈ 95k based on length).
   - Water tunnel: stall at α ≈ 30°, trimmed α ≈ 5°.
2. **Japanese Kent-paper glider (Nihon Univ., 2017), AR ≈ 9.5.**
   - Tunnel at Re 1.23×10^4: CLα = 0.133/deg, CDmin = 0.0685, (L/D)max = 8.82 at α = 2°.
   - Minimum sink 0.497 m/s.
   - Flight: V = 5.04 m/s at α = 5.5°.

No public Ken Blackburn tunnel data was found.

### Cited Findings
**Ng, Pey, Schluter et al. (2009), "On the Aerodynamics of Paper Airplanes", AIAA paper 2009-3958 (Nanyang Technological Univ.)** — [PDF](https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf)

*Geometry and flight test*
- **Geometry:** A4 dart, span b ≈ 0.16 m, area S ≈ 0.023 m², AR = 1.1, sweep 67°, mass ≈ 5 g, length 0.297 m.
- **Flight test design:** 5 planes × 3 launchers × 10 flights. L/D was taken from the distance/height glide ratio, and CL from weight.
- **Results:** mean flight speed 4.90 m/s (SD 1.98), L/D 5.05 (SD 1.0), CL 0.17, CD 0.03. Per-plane means: V 4.15-6.00 m/s, L/D 4.88-5.44, CL 0.11-0.23, CD 0.02-0.05. Most flights fell between 3 and 6 m/s.

*Water tunnel*
- **Similarity:** Re = 95,000 based on length at 4.90 m/s. The half-scale model in water at 0.6 m/s gives Re = 91,000.
- **Stall:** at about α = 30°, "consistent with ... delta wings with high sweep". The wing vortex energises the upper-surface flow. Vortex visualised at Re 55,000 and Re 28,000.
- **Trim:** the flight CL of 0.17 corresponds to α ≈ 5° on the tunnel lift curve. The large margin between cruise α and stall α explains the dart's robustness to launch conditions.
- **Drag:** tunnel drag exceeded flight drag because of incomplete sting-fixture drag correction, and drag uncertainty was high.
- **Centerfold (keel):** the centerfold displaces the wing vortex inboard and gives slightly higher CL than with the fold taped over, but within error bars.

*CFD (Fluent, Spalart-Allmaras)*
- The centerfold model gives about 5% higher CLmax than a flat trapezoidal plate.
- A steeper centerfold (anhedral/dihedral panels) mainly shifts the lift curve left.
- L/D is unchanged except at high lift.

**Tokuhiro, Kawashima & Ohtake (2017), Nihon Univ. CST proceedings K3-57, "Measurement of aerodynamic characteristics of a model paper airplane"** (Japanese with English abstract) — [PDF](https://www.cst.nihon-u.ac.jp/research/gakujutu/61/pdf/K3-57.pdf)

*Model*
- Kent paper, span 330 mm, mass 11.5 g, length 300 mm, wing incidence 1.5°.
- Section: layered paper builds a bulge from the leading edge to mid-chord, with max thickness at about 24% chord. The aft section is slit spanwise and bent to give camber.
- Design by Ishii Junji, a record paper-plane designer.

*Wind tunnel*
- 500×500 mm open tunnel, 3-component balance, α = -17° to +15°, V = 5.11 m/s, MAC 35.1 mm → Re = 1.23×10^4.
- Linear CL from α = -10° to 5° with slope 0.133/deg (7.6/rad).
- CL plateaus from α = 7° to 10° with little drag change (benign stall).
- CDmin = 0.0685. (L/D)max ≈ 8.82 at α = 2°. Minimum sink 0.497 m/s, also at α = 2°.

*Flight test*
- High-speed camera measured steady glide at 5.04 m/s, with α = 5.5° from the trajectory. This agrees with the force-balance estimate of about 5 m/s.

**Other sources**
- **Earlier Japanese measurements:** Koike et al. (2009, J. Japan Soc. Aero. Space Sci. 57(663):166-174) on hand-launch glider sections. Okamoto et al. (2009, Akita NCT Research Bulletin 45:19-26) on wing characteristics of low-speed model aircraft at Re 10,000-20,000. — [cited in Tokuhiro et al. 2017](https://www.cst.nihon-u.ac.jp/research/gakujutu/61/pdf/K3-57.pdf)
- **Other student-level studies:**
  - A 2025/26 Scholarly Review Journal paper (Y. Wang) tests a dart and non-traditional paper aircraft in a wind tunnel and in flight. Only qualitative results were visible to me. — [Scholarly Review PDF](https://www.scholarlyreview.org/article/155068-aerodynamic-analysis-of-conventional-and-non-traditional-paper-aircraft-wind-tunnel-and-flight-analysis.pdf)
  - An Atlantis Press high-school paper reports max L/D at α between -5° and 0°. This is low quality and looks physically odd. — [Atlantis Press](https://www.atlantis-press.com/article/126021487.pdf)
- **NASA K-12 glide method:** lift and drag can be estimated from weight, glide distance and launch height, the same method Ng et al. used. — [NASA GRC](https://www.grc.nasa.gov/WWW/k-12/VirtualAero/BottleRocket/airplane/glidprob.html)
- **Kline-Fogleman stepped airfoil:** derived from a paper airplane. Wind-tunnel L/D was poor (Finaish & Witherspoon 1998, per Wikipedia). — [Wikipedia](https://en.wikipedia.org/wiki/Kline%E2%80%93Fogleman_airfoil)

### Inferences
- **Calibration targets:**
  - Dart: L/D ≈ 5 (±1), V ≈ 4-6 m/s, trim α ≈ 5°, CL_trim ≈ 0.1-0.25.
  - High-performance glider (AR ~9): L/D ≈ 8-9, V ≈ 5 m/s, min sink ≈ 0.5 m/s, α_trim ≈ 2-5°.
  - A sim that cannot reproduce these is mis-modelling drag.
- **Dart drag:** CD ≈ 0.03 at CL 0.17 implies CD0 ≈ 0.02-0.025 if induced drag is CL²/(πeA) with e ≈ 0.6-0.8. Much of the remainder may be the keel/fuselage fold.
- **Glider drag:** CDmin = 0.0685 is about 3-4× a smooth flat plate at similar Re. The very low Re (1.2×10^4) and the thick layered nose plus the fuselage stick are the likely causes. Use CD0 ≈ 0.05-0.07 for real paper gliders at Re ~10^4, not 0.015.
- **Glider lift slope:** 7.6/rad is high for a wing alone. It probably includes tail lift referenced to wing area, plus camber effects.

### Gaps
- I found no publicly accessible Ken Blackburn wind-tunnel data, nor primary JSME papers by Ninomiya or Toda with numbers. Only the Nihon Univ. and Akita NCT references surfaced.
- I found no Physics Education or American Journal of Physics paper with measured paper-plane coefficients in my searches.
- I could not extract the full digitised CL(α) curve from Ng et al. Fig. 8; only stall ≈ 30° and the trim point are stated in text.
- No Cm(α) or static margin measurements exist for real paper planes in the sources found.

---

## 4. Best practical model for a fast 6-DOF sim; which errors matter most

### Takeaway
A practical, defensible model is:
- **Attached flow:** VLM (or Helmbold lifting-surface slopes) with the Polhamus/Lamar suction analogy for leading and side edges. Zero leading-edge thrust for sharp paper edges, so ΔCD = CL·tanα.
- **Stall:** blend into a flat-plate normal-force model, with CN rising and saturating toward the normal-plate value (CN_90 decreases with lower AR), acting near mid-chord.
- **Drag:** use measured CD0 and low e0, which dominate glide-distance error.

Hysteresis is not observed statically for flat plates at these Re. Unsteady and dynamic-stall effects are secondary for steady glide but matter for launch and loops.

### Cited Findings
- **Lifting-line validity:** lifting line is fine for AR ≥ 7. For AR ≤ 2, "the lifting-line concept becomes of limited value" because of nonlinear tip-vortex lift. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Helmbold/elliptic slopes:** these match measured flat-plate CLα for AR 2-5 at Re 60-160k. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Inviscid lift prediction at very low Re:** for low-AR plates at Re 8,000-24,000, lift from tip-vortex circulation agreed with force balance and "classical inviscid predictions", so potential-flow lift with vortex corrections is adequate. — [Kaplan/Altman/Ol, U. Dayton](https://ecommons.udayton.edu/mee_fac_pub/123)
- **Polhamus combined method:** potential plus vortex lift gives excellent CL and drag-due-to-lift for sharp-edge deltas over wide α and AR. — [Polhamus TN D-6243](https://ntrs.nasa.gov/api/citations/19710012498/downloads/19710012498.pdf)
- **Post-stall flat plates (Fage & Johansen 1927, 2D):** two regimes in CN, a fast rise at low α, then a plateau above about 80° equal to the normal-plate drag coefficient. — [Parnis et al., Soton (J. Wind Eng./Ind. Aero.)](https://eprints.soton.ac.uk/506944/1/WEIA_INDAER_106246_CleanPDF.pdf)
- **AR effect on post-stall CN:** lower AR gives lower CN at large incidence. — [Parnis et al.](https://eprints.soton.ac.uk/506944/1/WEIA_INDAER_106246_CleanPDF.pdf)
- **Zero-AR limit:** Bollay gives CN ∝ sin²α. — [Parnis et al.](https://eprints.soton.ac.uk/506944/1/WEIA_INDAER_106246_CleanPDF.pdf)
- **Torres & Mueller correlations:** lift and drag correlations exist for rectangular plates with 0.5 ≤ AR ≤ 2 and α ≤ 50°, reproduced in an Energies (2015) paper. The angle of maximum CN is strongly AR-dependent, about 9° for a 2D plate. — [MDPI Energies 8:2438 via search summary](https://mdpi.com/1996-1073/8/4/2438)
- **Ragheb & Selig, stalled spinning flat-plate wings at Re 3,000-25,000:** no Re effects were observed. This supports Re-independent post-stall tables. — [Ragheb & Selig 2016](https://m-selig.web.engr.illinois.edu/pubs/RaghebSelig-2016-AIAA-Paper-2016-1073-StalledSpinningWingTunnelTests.pdf)
- **Flat-plate post-stall characteristics (Ananda):** flat lift plateau and constant Cm up to 30°, no static hysteresis, and nose-down Cm break at stall. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Ready-made code:** AeroSandbox implements flat-plate and post-stall polar blending functions. — [AeroSandbox airfoil_polar_functions](https://aerosandbox.readthedocs.io/en/master/_modules/aerosandbox/aerodynamics/aero_2D/airfoil_polar_functions.html)
- **Robustness margin:** the dart's operating α (about 5°) is far from stall (about 30°), which is why its flight is robust to launch conditions. — [Ng et al. 2009](https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf)

### Inferences
**Recommended architecture**
1. **Precompute** for each folded geometry: a VLM with sharp edges, giving Kp, the leading-edge and side-edge suction distribution (Kv), neutral point, and roll/yaw/pitch damping derivatives.
2. **At runtime, use:**
   - CN(α) = Kp·sinα·cosα + Kv·sin²α (Polhamus) for |α| up to stall. Cap or blend into a flat-plate normal-force curve for |α| > stall.
   - CN_90 ≈ 1.2 for low AR, rising toward about 2 for 2D. The trend is from Parnis et al.; the exact values are textbook (Hoerner), not verified here.
   - Axial force ≈ CD0·cos α, with no leading-edge suction.
   - The centre of pressure moves from the neutral point toward about 0.5c at 90°.
3. **Moderate-AR gliders:** add an empirical stall break (CLmax 0.6-0.8 for flat, about 0.9-1.1 for cambered) and use e0 ≈ 0.5-0.8.

**Error budget for glide distance and time**
- Glide distance scales as L/D. L/D is set mainly by CD0 and e0, both poorly known for paper. CD0 ranges from 0.015 (smooth plate) to 0.07 (real glider at Re 1.2×10^4).
- Getting CD0 wrong by 2× changes range by roughly 30-40%. Lift slope errors mostly shift the trim α and barely change L/D.
- Trim, i.e. CG versus neutral point plus camber/curl Cm0, sets the trim CL and hence speed and whether the plane flies near (L/D)max. That is the second-largest error source.
- Launch transients (phugoid damping, stall at launch) matter for short indoor flights. That is where post-stall CN and pitch damping (Cmq) matter.

**Unsteady effects**
- Apparent mass of a 5 g plate is non-trivial. Added mass of a flat plate in normal motion ≈ ρπ(c/2)²·span: for c ≈ 0.15 m and b ≈ 0.16 m, roughly 3-4 g, i.e. comparable to the plane's mass.
- So include added-mass terms, at least in heave and pitch, for launch and loop dynamics. This is an estimate from standard potential-flow formulas; I found no paper-plane-specific source.

### Gaps
- I could not open the Torres & Mueller correlation equations (MDPI 403) or the exact Hoerner/Viterna CN constants.
- I found no source comparing VLM+Polhamus against measured paper-dart data, and no source on dynamic stall or apparent mass specific to paper planes.
- I found no published sensitivity analysis of paper-plane glide range to aerodynamic parameters; the error ranking above is inference.

---

## 5. Surface roughness, multi-layer thickness, paper curl camber, crease ridges

### Takeaway
Direct paper-specific data is scarce, and none of the sources I read gives roughness numbers specific to paper. The evidence available:
- Thin plates are insensitive to leading-edge and trailing-edge details and to turbulence at Re < 70k.
- Modest camber (about 5%) is the single best performance improver.
- Pleats and corrugations can reduce drag at Re 10^3-10^4.
- Thick layered noses with a fuselage push measured CDmin to about 0.07 at Re 1.2×10^4.
- A dart's centerfold gives a small (about 5%) CLmax gain.

### Cited Findings
- **Camber:** a 5% circular-arc camber thin plate was the best profile at all Re < 70,000. Thin plates were insensitive to Re and turbulence. A thin wedge gave about the same lift as a 1% flat plate, and a sharp trailing edge was not required. — [Laitone 1997 abstract](https://scholarhub.vn/publication/:slug/5e7c0907-cddf-47f4-895d-201e52b0e75f)
- **Trailing edge and turbulence:** cambered plates beat flat plates. Trailing-edge geometry and turbulence had little effect on lift and drag of thin wings at Re 60-200k. — [Pelletier & Mueller 2000 abstract](https://typeset.io/papers/low-reynolds-number-aerodynamics-of-low-aspect-ratio-thin-2jtrp6hdzi)
- **Thickness:** a 4.3% t/c flat plate with an elliptical leading edge (Ananda) "showed good agreement" with 2.6% t/c plates (Pelletier & Mueller) at similar Re. Differences were mainly in stall angle and CLmax. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)
- **Corrugation/pleats** (Okamoto group, Re 10^3-10^4): inserting corrugation at an appropriate chord position reduced CDmin and raised max L/D compared with a thin airfoil, attributed to trapped vortices in the concave pleats. — [Akita NCT repository](https://akita.repo.nii.ac.jp/record/927/files/KJ00005254825.pdf); [APS DFD 2006](https://archive.aps.org/dfd/2006/ab/10)
- **Layered nose glider:** the leading edge is built up from layered paper (max thickness at 24% chord) with slit and bent aft camber. Measured CDmin = 0.0685 and (L/D)max = 8.82 at Re 1.23×10^4. — [Tokuhiro et al. 2017](https://www.cst.nihon-u.ac.jp/research/gakujutu/61/pdf/K3-57.pdf)
- **Centerfold (dart keel):** CFD gives about +5% CLmax. Water-tunnel lift was slightly higher with the fold open, but within error bars. Taping over the fold created a bluff trailing edge with much higher drag. — [Ng et al. 2009](https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf)
- **Kline-Fogleman step:** stepped (multi-layer step) airfoils derived from a paper airplane showed poor L/D in wind tunnel tests (Finaish & Witherspoon 1998). — [Wikipedia summary](https://en.wikipedia.org/wiki/Kline%E2%80%93Fogleman_airfoil)
- **Skin friction bounds at Re 60-160k:** laminar 0.0066-0.0108 versus turbulent 0.0134-0.0164. Measured CDmin of 0.01-0.02 sits between them, consistent with a transitional, bubble-dominated flow. — [Ananda et al. 2015](https://m-selig.web.engr.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf)

### Inferences
- **Roughness:** paper roughness (about 5-10 µm) and crease ridges are probably secondary to the bubble-dominated separation physics on a sharp-edged thin plate. At these Re a sharp leading edge already trips separation (laminar bubble at the leading edge, per Ananda's oil flow). Roughness may slightly reduce bubble length, but it is not a major drag term.
- **Camber dominates:** curl or camber of a few percent should be modelled explicitly (as a camber line in the VLM, plus Cm0). It changes zero-lift α, Cm0 and trim much more than roughness changes CD0.
- **Multi-layer step drag:** a multi-layer leading edge with a step (Kline-Fogleman-like) plausibly adds pressure drag. A smooth layered bulge, as in the Nihon glider, is used by record designers. Assign it a CD0 increment of order +0.01-0.03; this is inferred from the high measured CDmin and is unvalidated.
- **Bluff fold and keel bases:** these add drag. Taping showed that a bluff trailing edge raises drag "significantly". Model the fuselage/keel as an added CD0 based on its frontal and base area.

### Gaps
- I found no quantitative study of paper surface roughness or crease-ridge drag at Re 10^4-10^5.
- I found no measured effect of paper flexibility or aeroelastic curl under load on paper-plane performance.
- The Okamoto & Azuma (1996) dragonfly numbers and Finaish & Witherspoon (1998) step-airfoil numbers were not retrieved.
