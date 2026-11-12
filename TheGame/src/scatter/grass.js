// Grass: instanced blades. A blade's place, height, bend, colour and dryness are hashed from its cell; its density comes
// from the ground pass (ground.js); the wind bends it (windAt) and each blade flutters on its own. Three rings (the grass's
// own file, assets/grass.js: its tiers): dense and fine close, sparse and wide far.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, vec2, vec3, vec4, If, min, varyingProperty, positionGeometry, frontFacing, mix, smoothstep, step, clamp, normalize, cross, cos, sin, pow, max, length, floor } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { hashI, camDist, BASE } from '../world/land.nodes.js';
import { finish, skyLight, weathered, cloudAtOne, windAt, windStrength, snowDepth, SNOW } from '../world/light.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { scatterRow } from '../../assets/index.js';

const u8 = (h, sh) => float(h.shiftRight(uint(sh)).bitAnd(uint(0xFF))).mul(1 / 256);   // one byte of a hash, 0..1

function blade(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs; pos.push(-1, t, 0, 1, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx);
  return g;
}

// what stands in a cell: a blade, or nothing. Its place, the ground under it, its height, its lean and bend, its colour,
// a flower now and then; packed into three vec4 (A: x, z, the ground's height, the blade's height; B: its heading, its
// bend, a hash for its flutter, a flower; C: its colour, how much its tip has dried). Done once per blade (src/scatter/tier.js).
function bladeIn(c, asset, T, ground) {
  // three hashes carry everything a blade is; nothing is read before the blade is known to stand
  const h1 = hashI(c.x, c.y, uint(100));
  const pos = vec2(c).add(vec2(float(h1.bitAnd(uint(0xFFF))), float(h1.shiftRight(uint(12)).bitAnd(uint(0xFFF)))).mul(1 / 4096)).mul(T.cell);
  const dist = camDist(pos), hf = u8(h1, 24), G = ground.A(pos), dens = G.y, h2 = hashI(c.x, c.y, uint(101));
  const inBand = dist.lessThanEqual(hf.mul(-T.farFade).add(T.far)).and(dist.greaterThanEqual(hf.mul(-T.nearFade).add(T.near)));
  const r1 = u8(h2, 0), r2 = u8(h2, 8), r3 = u8(h2, 16);
  // blades stand in tufts: the tuft they are in gives them a height, a lean and a shade in common
  const hc = hashI(int(floor(pos.x.div(0.6))), int(floor(pos.y.div(0.6))), uint(102)), c1 = u8(hc, 0), c2 = u8(hc, 8), c3 = u8(hc, 16);
  const tint = ground.tint(pos);
  const flower = step(0.985, r2).mul(float(1).sub(clamp(tint.a.sub(0.28).mul(1.6), 0, 1))).mul(BASE.grass.flowers ? 1 : 0);   // now and then a stalk with a small white head, not where it is dry
  const hgt = float(asset.height).mul(float(0.5).add(r1.mul(r1).mul(0.55)).add(c1.mul(c1).mul(0.8)).add(flower.mul(0.35))).mul(G.z)
    .mul(dens.mul(0.4).add(0.6)).mul(float(1).sub(smoothstep(T.end * 0.7, T.end, dist)));
  const ang = c2.add(r2.sub(0.5).mul(0.55)).mul(6.2831853), bend = float(0.2).add(r3.mul(0.55)).add(c3.mul(0.35)).mul(float(1).sub(flower.mul(0.7)));
  const base = tint.rgb.mul(float(0.7).add(r3.mul(0.35)).add(c3.mul(0.35))), dried = clamp(tint.a.mul(1.2).add(r2.mul(0.35)).sub(0.25), 0, 1);
  return { alive: inBand.and(u8(h2, 24).lessThanEqual(dens)).and(hgt.greaterThan(snowDepth.mul(2.5))),   // a blade not much taller than the snow is deep lies bent under it
    data: [vec4(pos, G.x, hgt), vec4(ang, bend, r1, flower), vec4(base, dried)] };
}

function bladeMaterial(T) {
  // shape(A, B, C): its vertex from what bladeIn packed, bent by the wind; lit in the fragment
  return () => {
    const vCol = varyingProperty('vec3', 'vCol'), vN = varyingProperty('vec3', 'vN'), vSide = varyingProperty('vec3', 'vSide'), vTS = varyingProperty('vec3', 'vTS'), vWorld = varyingProperty('vec3', 'vWorld');
    const shape = (A, B, C) => {
      const pos = A.xy, hgt = A.w, ang = B.x, r1 = B.z, flower = B.w;
      const bend = B.y.add(clamp(snowDepth.mul(3), 0, 0.6));   // snow weighs the blades down: deep, they bow over
      const dir = vec2(cos(ang), sin(ang)), side = vec2(dir.y.negate(), dir.x);
      const t = positionGeometry.y, s = positionGeometry.x, wd = float(T.w).mul(r1.mul(0.5).add(0.75)).mul(float(1).sub(t.mul(t).mul(0.8)));
      // the wind (src/world/light.js): the gust here, and each blade's own flutter, quicker and wider the harder it blows
      const ws = windStrength, flutter = sin(U.uTime.mul(ws.mul(9).add(3)).add(r1.mul(6.2831853)).add(pos.x.mul(0.7))).mul(ws.mul(0.35).add(0.08));
      const k0 = windAt(pos).mul(flutter.add(1)).mul(float(1).sub(flower.mul(0.5))), kl = length(k0), k = k0.mul(min(kl, 1.25).div(kl.max(1e-5)));   // in a storm a blade may lie nearly flat
      const kk = k.dot(k), lean = t.mul(t).mul(1.1);
      const up = hgt.mul(t).mul(float(1).sub(bend.mul(0.42).mul(t))).mul(float(1).sub(kk.mul(0.4).mul(t))), fw = hgt.mul(bend).mul(t).mul(t).mul(1.15);   // long blades arc over; pushed, they bow
      const w = vec3(pos.x, A.z, pos.y).add(vec3(side.x, 0, side.y).mul(s.mul(wd))).add(vec3(dir.x.mul(fw).add(k.x.mul(hgt).mul(lean)), up, dir.y.mul(fw).add(k.y.mul(hgt).mul(lean))));
      const tg = normalize(vec3(dir.x.mul(2).mul(bend).mul(t).add(k.x.mul(2.2).mul(t)), float(1).sub(bend.mul(0.6).mul(t)).sub(kk.mul(0.8).mul(t)), dir.y.mul(2).mul(bend).mul(t).add(k.y.mul(2.2).mul(t))));
      const sd = vec3(side.x, 0, side.y);
      vWorld.assign(w); vSide.assign(sd); vN.assign(cross(sd, tg)); vTS.assign(vec3(t, s, flower));
      vCol.assign(mix(C.rgb, vec3(0.42, 0.34, 0.15), smoothstep(0.5, 1, t).mul(max(C.w, clamp(snowDepth.mul(2.5), 0, 0.65)))).mul(mix(0.14, 1.45, t.mul(t.mul(0.4).add(0.6)))));   // dark in the thick of it, light at the tips; in snow, pale and straw-coloured
      return clipOf(w);
    };
    const frag = Fn(() => {
      const vT = vTS.x, n0 = normalize(vN.add(vSide.mul(vTS.y).mul(0.6)));   // a blade is a little rounded
      const n = normalize(frontFacing.select(n0, n0.negate()).add(vec3(0, 1.4, 0)));   // and a meadow lights as a soft whole
      const ndl = n.dot(U.uSunDir).mul(0.5).add(0.5), V = normalize(U.uCam.sub(vWorld));
      const thru = pow(max(V.negate().dot(U.uSunDir), 0), 2).mul(vT);   // light through the blade: the bright yellow-green of a lit meadow
      const sheen = pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 20).mul(0.16).mul(vT);
      const sun = U.uSun.mul(cloudAtOne(vWorld));   // one sample of the shadow map: a blade is too thin for a soft edge to show
      const onIt = max(clamp(snowDepth.mul(4), 0, 0.4).mul(float(1).sub(smoothstep(0.05, 0.5, vT))), clamp(snowDepth.mul(2.5), 0, 0.6).mul(smoothstep(0.3, 0.8, n0.y.abs())).mul(smoothstep(0.3, 0.8, vT)));   // snow at the foot, and lying on what bows over
      const col0 = weathered(mix(vCol, SNOW, onIt), n, 9).mul(skyLight(n).mul(vT.mul(0.45).add(0.55)).add(sun.mul(ndl.mul(ndl).mul(1.1).add(vec3(0.5, 1, 0.22).mul(thru))))).add(sun.mul(sheen));
      const col = vTS.z.greaterThan(0.5).and(vT.greaterThan(0.86)).select(vec3(0.92, 0.92, 0.86).mul(skyLight(n).add(U.uSun.mul(0.7))), col0);
      return finish(col, vWorld);
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide;
    return { m, shape };
  };
}

/** The asset `grass`: a tier per row of its table. gpu: on WebGPU, what stands is packed by a compute pass (tier.js). */
export function createGrass(scene, tex, ground, asset, gpu = false) {
  return asset.tiers.map((T) => {
    const make = bladeMaterial(T), live = (c) => bladeIn(c, asset, T, ground);
    const material = (src) => {
      const { m, shape } = make();
      m.vertexNode = src.read ? Fn(() => shape(src.read(0), src.read(1), src.read(2)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive, () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out here, per vertex
      return m;
    };
    // the most that may stand at once: the ring's area in cells, as much as the frustum can hold of it
    const cap = Math.ceil((Math.PI * (T.far ** 2 - Math.max(0, T.near - T.nearFade) ** 2)) / (T.cell * T.cell) * 0.6);
    return new Tier(scene, blade(T.segs), material, { cell: T.cell, P: T.P, near: T.near - T.nearFade, far: T.far, order: 0, live, gpu, cap, slots: 3 });
  });
}

// a tuft for the library's list: a few dozen blades as plain strips in the meadow's greens (a picture, not the engine's own)
function tuft(height) {
  const pos = [], col = [], R = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < 70; i++) {
    const a = R(i) * 6.283, r = Math.sqrt(R(i + 0.5)) * 0.22, x = Math.cos(a) * r, z = Math.sin(a) * r, h = height * (0.45 + 0.6 * R(i + 0.25)), lean = (R(i + 0.75) - 0.5) * 0.5, tw = R(i + 0.1) * 6.283;
    const sx = Math.cos(tw) * 0.012, sz = Math.sin(tw) * 0.012, tx = x + Math.cos(a) * lean * h, tz = z + Math.sin(a) * lean * h, g = 0.5 + 0.5 * R(i + 0.33);
    pos.push(x - sx, 0, z - sz, x + sx, 0, z + sz, tx, h, tz);
    col.push(0.05 * g, 0.13 * g, 0.03 * g, 0.05 * g, 0.13 * g, 0.03 * g, 0.2 * g, 0.42 * g, 0.1 * g);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'grass' names. */
export const engine = {
  id: 'grass',
  row: (a) => ({ ...scatterRow(a), height: a.height, tiers: a.tiers }),   // its blade's height and its rings, over the common row
  create: createGrass,
  // the library: a tuft for the list; on the stage the meadow itself, grown over the bare round
  thumb: (tex, row) => ({ things: [tuft(row.height)], eye: [0.55, 0.42, 0.75], look: [0, row.height * 0.42, 0] }),
  stage(tex, row, { x, z, ground }) { ground.stage(x, z, 0); return new THREE.Group(); },
  frame: (a) => ({ height: a.height, dist: 4.2, pitch: 0.3, span: a.height }),
};
