// Rock: ridged and bedded stone, a few cracks, weathering pits, crusts of lichen grey-green and orange (materials/README.md).
import { float, vec3, mix, smoothstep, sin, max } from 'three/tsl';
import { pn, pfbm, pridge, warp, cracks, pvor } from '../src/materials/paint.js';
export default {
  uid: '506c509b-300d-42eb-8403-f3969b06b271',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Rock",
  kind: 'stone',
  role: 'rock',   // the part it plays for the engine (src/core/registry.js: byRole)
  about: "Ridged, bedded stone with a few cracks, weathering pits, and crusts of lichen, grey-green and orange.",
  usedBy: "stones and boulders; steep slopes",
  swatch: [0.22, 0.21, 0.2],
  bump: 0.035,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const w = warp(uv, 3, 9, 0.25), rid = pridge(uv.add(w), 4, 1, 6), body = pfbm(uv.add(w), 2, 2, 5);
    const bed = uv.y.mul(7).add(body.mul(2.2)), strata = sin(bed.mul(6.2831853)).mul(0.5).add(0.5), seam = smoothstep(0.92, 0.99, strata);
    const k = cracks(uv, 4, 12, 1.4), open = smoothstep(0.45, 0.62, pn(uv.mul(6), 6, 15));   // only some cell edges open into cracks
    const crack = float(1).sub(smoothstep(0.002, 0.02, k.x)).mul(open), hair = float(1).sub(smoothstep(0, 0.02, cracks(uv, 11, 16, 1.2).x)).mul(0.4);
    const pv = pvor(uv.mul(48), 48, 17), pit = smoothstep(0.1, 0, pv.x).mul(smoothstep(0.7, 0.76, pv.z)).mul(0.5);
    const grain = pn(uv.mul(260), 260, 13), speck = smoothstep(0.72, 0.8, pn(uv.mul(150), 150, 18));
    const h = rid.mul(0.55).add(body.mul(0.15)).add(strata.mul(0.08)).add(grain.mul(0.06)).sub(seam.mul(0.06)).sub(max(crack, hair).mul(0.3)).add(0.14);
    const mineral = mix(vec3(1.04, 0.97, 0.88), vec3(0.9, 0.96, 1.04), pfbm(uv, 3, 19, 4));   // warm and cool clouds in the stone
    let col = mix(vec3(0.13, 0.125, 0.118), vec3(0.3, 0.29, 0.27), rid.mul(0.7).add(body.mul(0.3))).mul(mineral).mul(grain.mul(0.24).add(0.88));
    col = mix(col, vec3(0.42, 0.4, 0.37), speck.mul(0.35));
    col = mix(col, col.mul(vec3(0.75, 0.72, 0.7)), seam.mul(0.6).add(pit.mul(0.7)));
    // lichen: crusts on what stands out, their rims ragged
    const lp = pfbm(uv, 5, 14, 5), lr = pn(uv.mul(120), 120, 20).mul(0.08), crust = smoothstep(0.7, 0.72, lp.add(lr).add(rid.mul(0.06))), crustIn = pn(uv.mul(200), 200, 23);
    const orange = smoothstep(0.75, 0.77, pfbm(uv.add(0.3), 11, 21, 4).add(lr));
    col = mix(col, mix(vec3(0.3, 0.32, 0.23), vec3(0.47, 0.49, 0.4), pn(uv.mul(60), 60, 22)).mul(crustIn.mul(0.3).add(0.8)), crust.mul(0.45));
    col = mix(col, mix(vec3(0.5, 0.26, 0.06), vec3(0.62, 0.42, 0.12), crustIn), orange.mul(0.5));
    return { h: h.add(crust.mul(0.02)), col: mix(col, vec3(0.04), max(crack.mul(0.7), hair.mul(0.45))), rough: float(0.82) };
  },
};
