// Pine needles: a stone pine forest's floor (materials/README.md). Not one even mat: needles lie thick and rusty where
// they fell last, matted and grey where they have lain, and thin over dark bare earth between; on them twigs, cones and
// flakes of bark; moss in cushions where the earth shows. Every part has its height, so the sun models it (the normals)
// and the hollows between are dark (the shade painted into the colour): a floor with depth, not a print.
import { float, vec2, vec3, mix, smoothstep, max, min } from 'three/tsl';
import { pn, pfbm, fibre, warp, pebbles } from '../src/materials/paint.js';

// the litter's layers, bottom to top: a direction (whole steps, so it tiles), the needles' length and thinness
const LAYERS = [[[1, 0], 14, 260], [[0, 1], 15, 250], [[1, 1], 11, 210], [[1, -1], 11, 200], [[2, 1], 8, 160], [[1, -2], 8, 150]];
// the twigs lying over them: a direction, how many along and across the tile (long and few), its seed
const TWIGS = [[[1, 1], 3, 84, 81], [[2, -1], 2, 70, 83], [[1, -3], 2, 58, 85]];

export default {
  uid: '795da1c3-9cfe-4c4e-88c7-a58ce86444d4',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine needles',
  kind: 'ground',
  about: "A pine forest's floor: needles thick and rusty where they fell last, grey and matted where they have lain, thin over dark earth between; twigs, cones and bark flakes on them, moss in cushions where the earth shows.",
  usedBy: 'the floor of the pine forest',
  swatch: [0.24, 0.16, 0.1],
  bump: 0.042,   // how deep its relief reads in the normals (a deep litter: twigs and cones stand out of it)
  paint: (uv) => {
    const soil = pfbm(uv, 5, 1, 5), grain = pn(uv.mul(200), 200, 2), drift = pfbm(uv, 3, 3, 3);
    // where the needles lie thick (1) and where the earth shows through (0): patches a hand to a stride across, ragged
    const thick = smoothstep(0.34, 0.6, pfbm(uv, 4, 7, 4).add(pn(uv.mul(23), 23, 8).sub(0.5).mul(0.22)));
    const col = mix(vec3(0.04, 0.03, 0.02), vec3(0.095, 0.065, 0.04), soil).mul(grain.mul(0.35).add(0.8)).toVar();
    const h = soil.mul(0.16).add(grain.mul(0.04)).toVar(), rough = float(0.92).toVar();
    // crumbs of humus in the bare earth
    const crumb = pebbles(uv, 61, 5, 0.3, 0.8);
    col.assign(mix(col, col.mul(1.5), smoothstep(0.1, 0.5, crumb.x))); h.assign(max(h, crumb.x.mul(0.14)));
    // moss, in cushions where the earth shows: low domes, their skin a fine nap
    const cush = pebbles(uv, 6, 31, 0.2, 0.55), nap = pn(uv.mul(310), 310, 33), mossy = smoothstep(0.08, 0.3, cush.x).mul(float(1).sub(thick.mul(0.85)));
    col.assign(mix(col, mix(vec3(0.07, 0.115, 0.035), vec3(0.17, 0.235, 0.07), nap.mul(0.6).add(cush.x.mul(0.5))).mul(cush.y.mul(0.3).add(0.85)), mossy));
    h.assign(mix(h, cush.x.mul(0.5).add(nap.mul(0.08)).add(0.12), mossy));
    // bark flakes: small plates of the trees' bark
    const flake = pebbles(uv, 23, 4, 0.16, 0.9);
    col.assign(mix(col.mul(float(1).sub(flake.z.mul(0.35))), mix(vec3(0.13, 0.085, 0.055), vec3(0.23, 0.15, 0.1), flake.y), smoothstep(0.05, 0.2, flake.x))); h.assign(max(h, flake.x.mul(0.3)));
    // the needles, layer over layer: fewer where the earth shows, each layer casting a little shade on what lies under it
    LAYERS.forEach(([[a, b], along, across], i) => {
      const q0 = uv.add(warp(uv, 9, 40 + i, 0.05)), q = vec2(q0.x.mul(a).add(q0.y.mul(b)), q0.x.mul(-b).add(q0.y.mul(a)));
      const up = (i + 1) / LAYERS.length, f = fibre(q.mul(vec2(along, across)), [along, across], 10 + i).mul(mix(0.25 + 0.2 * up, 1, thick));
      const tone = pn(q.mul(vec2(along * 2, 4)), [along * 2, 4], 60 + i);
      // rust where fresh, a greyed brown where they have lain longest (as dark as litter is: a forest's floor is not straw)
      const needle = mix(mix(vec3(0.4, 0.21, 0.085), vec3(0.27, 0.15, 0.07), tone), vec3(0.24, 0.21, 0.17), smoothstep(0.55, 0.85, drift.add(tone.mul(0.3))));
      col.assign(mix(col.mul(float(1).sub(f.mul(0.12))), needle.mul(0.5 + 0.5 * up), f.mul(0.92))); h.assign(max(h, f.mul(0.26 + 0.34 * up)));
    });
    // twigs fallen across them: round, grey-brown, lighter along their backs, the litter dark beside them
    TWIGS.forEach(([[a, b], along, across, s]) => {
      const q0 = uv.add(warp(uv, 5, s, 0.09)), q = vec2(q0.x.mul(a).add(q0.y.mul(b)), q0.x.mul(-b).add(q0.y.mul(a))).mul(vec2(along, across));
      const n = pn(q, [along, across], s + 1), body = smoothstep(0.8, 0.9, n), back = smoothstep(0.86, 0.97, n);
      const bark = mix(vec3(0.1, 0.075, 0.055), vec3(0.24, 0.19, 0.14), back).mul(pn(q.mul(vec2(30, 3)), [along * 30, across * 3], s + 2).mul(0.35).add(0.8));
      col.assign(mix(col.mul(float(1).sub(smoothstep(0.7, 0.8, n).mul(0.4))), bark, body)); h.assign(max(h, body.mul(0.55).add(back.mul(0.35))));
    });
    // cones, whole and broken: scaled domes
    const cone = pebbles(uv, 13, 9, 0.06, 0.35), scale = pn(uv.mul(150), 150, 11);
    col.assign(mix(col.mul(float(1).sub(cone.z.mul(0.45))), mix(vec3(0.06, 0.036, 0.02), vec3(0.17, 0.1, 0.055), scale).mul(cone.x.mul(0.6).add(0.55)), smoothstep(0.08, 0.22, cone.x)));
    h.assign(max(h, cone.x.mul(0.85).add(scale.mul(0.12).mul(smoothstep(0.08, 0.22, cone.x)))));
    rough.assign(mix(rough, 1, mossy));
    // the shade in the hollows: what lies deep between the needles and beside a twig gets little of the sky
    col.mulAssign(mix(0.42, 1.08, smoothstep(0.06, 0.62, min(h, 1))));
    return { h, col, rough };
  },
};
