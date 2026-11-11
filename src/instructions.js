// Human folding instructions derived from the exact fold geometry.
// Every measurement is something you can check with a ruler on the folded paper.

import { chordAlong } from './fold.js';
import { apply2 } from './geom.js';

const deg = 180 / Math.PI;
const cm = (m) => `${(m * 100).toFixed(1)} cm`;
const r5 = (x) => Math.round(x / 5) * 5;

// Tutorial steps. `anim` tells the viewer which animation to play for each step.
export function buildInstructions(geom) {
  const { design, steps, facets, phaseB } = geom;
  const out = [];
  const { L } = design.sheet;
  out.push({
    anim: { kind: 'A', step: 0 },
    title: 'Crease the centre line',
    text: `Lay the sheet ${design.landscape ? 'landscape (long side across)' : 'portrait (long side up)'}. Fold it in half from left to right, crease sharply, and unfold. This centre crease (${cm(L)} long) is the reference for every fold that follows.`,
  });
  let foldNo = 0;
  for (let j = 1; j < steps.length; j++) {
    const s = steps[j];
    // shape at the start of this step
    const cur = facets.map((f) => f.poly.map((q) => apply2(f.hist[j - 1].T, q)));
    const top = Math.max(...cur.flat().map((q) => q[1]));
    if (s.kind === 'tip') {
      foldNo++;
      out.push({
        anim: { kind: 'A', step: j },
        title: 'Fold the nose down',
        text: `Measure ${cm(s.depth)} down from the nose along the centre crease and fold the whole nose down along a straight crease square to the centre line. The tip now lies ${cm(s.depth)} below the crease, on top.`,
      });
    } else if (s.kind === 'diag') {
      foldNo++;
      const Lx = s.lines[0];
      const leftPolys = facets.map((f, i) => (f.half === 'L' ? cur[i] : null)).filter(Boolean);
      const r = chordAlong(leftPolys, Lx);
      let endTxt = '';
      if (r) {
        const t = r[1];
        const end = [Lx.p[0] + Lx.d[0] * t, Lx.p[1] + Lx.d[1] * t];
        endTxt = ` It meets the outer edge ${cm(top - end[1])} below the nose and ${cm(-end[0])} out from the centre crease.`;
      }
      const start = s.offset < 0.002 ? 'at the nose tip' : `on the centre line ${cm(s.offset)} above the nose (off the paper, so line up a ruler)`;
      out.push({
        anim: { kind: 'A', step: j },
        title: 'Fold the corners in',
        text: `Fold the left corner inward. The crease starts ${start} and runs at ${(s.theta * deg).toFixed(1)}° to the centre crease.${endTxt} Repeat on the right so both sides match.`,
      });
    } else if (s.kind === 'pleat' && s.part === 1) {
      foldNo++;
      out.push({
        anim: { kind: 'A', step: j },
        title: 'Pleat the nose (1 of 2)',
        text: `Measure ${cm(s.at)} down from the nose along the centre crease and fold the whole nose down along a straight crease square to the centre line.`,
      });
    } else if (s.kind === 'pleat') {
      out.push({
        anim: { kind: 'A', step: j },
        title: 'Pleat the nose (2 of 2)',
        text: `Fold only the flap you just made back up, along a crease square to the centre line ${cm(s.width)} below the first crease; leave the sheet underneath flat. The nose is now a Z-shaped pleat ${cm(s.width)} deep, three layers thick.`,
      });
    } else if (s.kind === 'lock') {
      foldNo++;
      out.push({
        anim: { kind: 'A', step: j },
        title: 'Lock the flaps',
        text: `Find the point of the nose flap on the centre crease, ${cm(top - (s.lines[0].p[1] - s.depth))} below the nose. Fold only that flap up (${s.layersMoved > 1 ? `its ${s.layersMoved} layers together, ` : ''}not the sheet underneath) along a crease square to the centre line ${cm(s.depth)} above its point, so it lies over the inner corners of the flaps and holds them down. Crease it firmly: this tab is the lock.`,
      });
    } else if (s.kind === 'body') {
      out.push({
        anim: { kind: 'A', step: j },
        title: 'Fold in half',
        text: s.mountain
          ? 'Fold the plane in half along the centre crease away from you (a mountain fold), so the folded flaps and the lock stay on the outside. Crease the bottom edge (this becomes the keel) firmly.'
          : 'Fold the plane in half along the centre crease, with the folded flaps on the inside. Crease the bottom edge (this becomes the keel) firmly.',
      });
    }
  }
  const { hinge } = phaseB;
  const dN = hinge.b[0], dT = hinge.a[0];
  out.push({
    anim: { kind: 'B', from: { wingFlat: 0 }, to: { wingFlat: 1 } },
    title: 'Fold the wings down',
    text: `Fold the top wing down. The crease is ${cm(dN)} above the keel edge at the nose and ${cm(dT)} above it at the tail; mark both points and crease between them. Flip the plane over and fold the other wing to match exactly.`,
  });
  out.push({
    anim: { kind: 'B', from: { wingFlat: 1 }, to: { wingOpen: 1 } },
    title: 'Set the wings',
    text: `Open the wings so each sits about ${Math.round(design.wing.dihedral * deg)}° ${design.wing.dihedral >= 0 ? 'above' : 'below'} horizontal: viewed from behind, a ${design.wing.dihedral >= 0 ? 'shallow V' : 'slight droop'}. Pinch the keel firmly along its length so the layers stay together; no tape or glue is needed.`,
  });
  if (phaseB.wingletX !== null) {
    out.push({
      anim: { kind: 'B', from: { wingOpen: 1, winglet: 0 }, to: { wingOpen: 1, winglet: 1 } },
      title: 'Fold the winglets',
      text: `Fold the outer ${cm(phaseB.wingXmax - phaseB.wingletX)} of each wing straight up along a crease parallel to the keel, then open it to about ${r5(design.winglet.angle * deg)}° from the wing.`,
    });
  }
  if (phaseB.elevY !== null) {
    const up = design.elevator.angle >= 0;
    out.push({
      anim: { kind: 'B', from: { wingOpen: 1, winglet: 1, elev: 0 }, to: { wingOpen: 1, winglet: 1, elev: 1 } },
      title: up ? 'Bend the elevator up' : 'Bend the trailing edge down',
      text: `Along the rear ${cm(design.elevator.chord)} of each wing, bend the paper ${up ? 'up' : 'down'} by about ${Math.abs(design.elevator.angle * deg).toFixed(0)}°. This is the trim tab. Test-glide gently: if the plane dives, bend the trailing edge up a little; if it swoops up and stalls, bend it down a little. Repeat until it glides smoothly.`,
    });
  }
  return out;
}

export function throwAdvice(design, ac) {
  const noseX = geomNoseX(ac);
  const grip = noseX - ac.cg[0];
  const p = design.launch.pitch * deg, b = (design.launch.bank || 0) * deg;
  return {
    grip,
    text: `Pinch the keel ${cm(grip)} behind the nose (that is the balance point). Throw firmly, about ${design.launch.speed} m/s (a brisk overhand toss), aiming ${p.toFixed(0)}° ${p >= 0 ? 'above' : 'below'} level${Math.abs(b) > 3 ? ` with the wings banked about ${b.toFixed(0)}°` : ' with the wings level'}.`,
  };
}
function geomNoseX(ac) {
  return ac.geom.phaseB.ymax;
}
