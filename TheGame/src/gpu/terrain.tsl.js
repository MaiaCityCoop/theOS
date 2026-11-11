// The terrain in TSL (intent 0008, step 1): terrain.glsl.js's vertex and fragment as one node material, on the land
// (land.tsl.js) and the shading contract's light (here: sun, sky, haze, weather, exposure; the shadow map comes with
// step 2). Same grid, same morphing, same materials, same blending; the branches that skip a texture where it is not
// laid are kept (If), so it costs what today's does.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uniform, attribute, positionGeometry, varying, texture, dFdx, dFdy, If, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, exp, fract, exp2, step } from 'three/tsl';
import { L, camDist, riverInfo, heightAt, pathN, pathMask, bareMask, outcropMask, tuftMask, bankMask, cutMask, barMask, grassTintAB, vnoise, baseB } from './land.tsl.js';
import { uint } from 'three/tsl';
import { at, BIOME } from '../../biomes/index.js';
import { MATERIALS } from '../../materials/index.js';

// ---- the light (light.glsl.js): one set of uniforms, the sky writes them ----
export const LIGHT = {
  sunDir: uniform(new THREE.Vector3(0.5, 0.78, 0.36).normalize()), sun: uniform(new THREE.Vector3(1.75, 1.66, 1.5)), amb: uniform(new THREE.Vector3(0.5, 0.56, 0.66)),
  hazeCol: uniform(new THREE.Vector3(0.6, 0.7, 0.8)), haze: uniform(1 / 6500), airH: uniform(0), airScale: uniform(1200),
  weather: uniform(new THREE.Vector4(0, 0, 0, 0)), exposure: uniform(1),
};
const airMean = Fn(([h]) => { const k = h.div(LIGHT.airScale); return k.lessThan(1e-3).select(float(1).sub(k.mul(0.5)), float(1).sub(exp(k.negate())).div(k)); });
export const haze = Fn(([c, dist]) => mix(LIGHT.hazeCol, c, exp(dist.negate().mul(LIGHT.haze).mul(airMean(LIGHT.airH)).mul(LIGHT.weather.z.mul(40).add(1)))));
export const toScreen = Fn(([c]) => vec4(pow(float(1).sub(exp(c.negate().mul(1.25).mul(LIGHT.exposure))), vec3(1 / 2.2)), 1));
export const weathered = Fn(([col, n]) => mix(col.mul(float(1).sub(LIGHT.weather.x.mul(0.35))), vec3(0.85, 0.87, 0.9), LIGHT.weather.y.mul(smoothstep(0.35, 0.8, n.y))));
const cloudAt = () => float(1).sub(LIGHT.weather.w.mul(0.6));

export const GRID = 16, R0 = 48;

/** The terrain's material: tex is the baked materials ({ of(id) } of three/webgpu textures). */
export function terrainMaterial(tex) {
  const node = attribute('aNode', 'vec4'), g = positionGeometry.xz;
  // ---- vertex: the node's grid, morphed towards the coarser one, raised to the land ----
  const cell = node.z.div(GRID), rng = exp2(node.w).mul(R0);
  const wp0 = node.xy.add(g.mul(cell)), k = clamp(camDist(wp0).sub(rng.mul(0.8)).div(rng.mul(0.15)), 0, 1);
  const wp = node.xy.add(g.sub(fract(g.mul(0.5)).mul(2).mul(k)).mul(cell)), dist = camDist(wp);
  const I = riverInfo(wp), h = heightAt(wp, dist, abs(I.x), I.y, I.z), e = max(0.3, dist.div(96));
  const px = wp.add(vec2(e, 0)), pz = wp.add(vec2(0, e)), Ix = riverInfo(px), Iz = riverInfo(pz);
  const hx = heightAt(px, dist, abs(Ix.x), Ix.y, Ix.z), hz = heightAt(pz, dist, abs(Iz.x), Iz.y, Iz.z);
  const world = vec3(wp.x, h, wp.y);
  const vWorld = varying(world), vI = varying(I), vN = varying(normalize(vec3(h.sub(hx), e, h.sub(hz))));
  const vPth = varying(pathN(wp)), vOut = varying(outcropMask(wp)), vHill = varying(h.sub(baseB(wp)));

  // ---- fragment ----
  const mat = (id) => { const i = MATERIALS.findIndex((m) => m.id === id); return { a: tex.a[i], n: tex.n[i] }; };
  const land = at('land'), arid = at('arid'), bank = at('bank'), cut = at('cutbank'), bar = at('bar');
  const T = (gr) => ({ ...mat(gr.material), t1: gr.tile[0], t2: gr.tile[1] });
  const FLOOR = T(land.floor), PATCH = T(land.patches), SLOPE = T(land.slopes), AFLOOR = T(arid.floor), ASPOT = T(arid.spots), BANK = T(bank.floor), CUT = T(cut.floor), BAR = T(bar.floor);
  const carpet = mat(land.grass.carpet), noise = mat('noise').a;

  const frag = Fn(() => {
    const p = vWorld.xz, dx = dFdx(p), dy = dFdy(p);
    const rdist = length(vWorld.sub(L.cam)), dist2 = rdist.mul(L.lodInv);
    const mx = dist2.lessThan(140).select(mix(vnoise(p.mul(1 / 5.3), uint(90)), 0.5, smoothstep(50, 140, dist2)), float(0.5));
    const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6)));
    const prr = vec2(p.x.mul(0.8).add(p.y.mul(0.6)), p.x.mul(-0.6).add(p.y.mul(0.8)));
    const m1 = texture(noise, prr.mul(1 / 97).add(0.37)).b.sub(0.5), m2 = texture(noise, pr.mul(1 / 700)).a.sub(0.5), m3 = texture(noise, p.mul(1 / 4500).add(0.11)).r.sub(0.5);
    const macro = m1.mul(0.16).add(m2.mul(0.2)).add(m3.mul(0.18)).add(1);
    const aridV = smoothstep(0.5, 0.66, vnoise(p.mul(1 / 700), uint(50)).add(vnoise(p.mul(1 / 150), uint(51)).sub(0.5).mul(0.3).mul(float(1).sub(smoothstep(3000, 8000, dist2)))));
    const ta = clamp(texture(noise, p.mul(1 / 150)).r.add(texture(noise, pr.mul(1 / 397)).a).sub(1).mul(0.8).add(0.5), 0, 1), tb = texture(noise, pr.mul(1 / 45)).g;
    const tint = grassTintAB(ta, tb, aridV);
    const tuft = aridV.greaterThan(0.003).and(dist2.lessThan(900)).select(mix(tuftMask(p), 0.5, smoothstep(350, 900, dist2)), float(0.5));
    const g1 = texture(carpet.a, p.div(1.6)), g2 = texture(carpet.a, pr.div(9.6)), g3 = texture(carpet.a, prr.div(57));
    const gn1 = texture(carpet.n, p.div(1.6)), gn2 = texture(carpet.n, pr.div(9.6));
    const gk = smoothstep(25, 110, dist2), gk2 = smoothstep(300, 1400, dist2);
    const glum = mix(mix(g1.a, g2.a, gk), mix(g2.a, g3.a, 0.6), gk2);
    const gq0 = gn2.xy.mul(2).sub(1), gq = vec2(gq0.x.mul(0.6).add(gq0.y.mul(0.8)), gq0.x.mul(-0.8).add(gq0.y.mul(0.6)));
    const gnrm = mix(gn1.xy.mul(2).sub(1), gq, gk).mul(float(1).sub(gk2.mul(0.7)));
    const d = abs(vI.x), w = vI.y, b = vI.z;
    const path = pathMask(vPth).mul(float(1).sub(smoothstep(70, 220, dist2)));
    const bare = dist2.lessThan(160).select(bareMask(p).mul(float(1).sub(smoothstep(100, 160, dist2))), float(0));

    // two takes of a material, turned and resized, mixed by noise (smp), into the working material M (hblend)
    const smp = (S) => {
      const p2 = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6)));
      const dx2 = vec2(dx.x.mul(0.6).sub(dx.y.mul(0.8)), dx.x.mul(0.8).add(dx.y.mul(0.6))), dy2 = vec2(dy.x.mul(0.6).sub(dy.y.mul(0.8)), dy.x.mul(0.8).add(dy.y.mul(0.6)));
      const a1 = texture(S.a, p.div(S.t1)).grad(dx.div(S.t1), dy.div(S.t1)), a2 = texture(S.a, p2.div(S.t2)).grad(dx2.div(S.t2), dy2.div(S.t2));
      const n1 = texture(S.n, p.div(S.t1)).grad(dx.div(S.t1), dy.div(S.t1)), n2 = texture(S.n, p2.div(S.t2)).grad(dx2.div(S.t2), dy2.div(S.t2));
      const q0 = n2.xy.mul(2).sub(1), q = vec2(q0.x.mul(0.6).add(q0.y.mul(0.8)), q0.x.mul(-0.8).add(q0.y.mul(0.6)));
      const kk = smoothstep(0.35, 0.65, mx.add(a2.a.sub(a1.a).mul(0.3)));
      return { c: mix(a1.rgb.mul(a1.rgb), a2.rgb.mul(a2.rgb), kk), h: mix(a1.a, a2.a, kk), n: mix(n1.xy.mul(2).sub(1), q, kk), r: mix(n1.a, n2.a, kk) };
    };
    const M = (() => { const s = smp(FLOOR); return { c: s.c.toVar(), h: s.h.toVar(), n: s.n.toVar() }; })();
    const hblend = (B, t) => {
      const k0 = clamp(t.sub(0.5).mul(3).add(0.5).add(B.h.sub(M.h).mul(0.8)), 0, 1), k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
      M.c.assign(mix(M.c, B.c, k)); M.h.assign(mix(M.h, B.h, k)); M.n.assign(mix(M.n, B.n, k));
    };
    const bk = bankMask(p, d, w, b), bankW = clamp(bk.add(M.h.sub(0.5).mul(0.3).mul(step(0.01, bk))), 0, 1);
    If(aridV.greaterThan(0.003), () => {
      const c = smp(AFLOOR), C = { c: c.c.toVar(), h: c.h.toVar(), n: c.n.toVar() };
      const sp = dist2.lessThan(1500).select(smoothstep(0.55, 0.72, vnoise(p.mul(1 / 45), uint(73))).mul(float(1).sub(smoothstep(600, 1500, dist2))), float(0));
      If(sp.greaterThan(0.003), () => {
        const s = smp(ASPOT), k0 = clamp(sp.sub(0.5).mul(3).add(0.5).add(s.h.sub(C.h).mul(0.8)), 0, 1), k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
        C.c.assign(mix(C.c, s.c, k)); C.h.assign(mix(C.h, s.h, k)); C.n.assign(mix(C.n, s.n, k));
      });
      hblend(C, aridV);
    });
    const bd = max(bare.mul(float(1).sub(aridV)), vOut.mul(0.25));
    If(bd.greaterThan(0.003).or(path.greaterThan(0.003)), () => {
      const dirt = smp(PATCH);
      If(bd.greaterThan(0.003), () => hblend(dirt, bd));
    });
    const cover = float(1).sub(bare).mul(mix(1, tuft.mul(BIOME.dryland.grass.cover), aridV));
    const cv = cover.mul(smoothstep(4, 60, dist2).mul(0.18).add(0.82));
    M.c.assign(mix(M.c, tint.rgb.mul(glum.mul(1.05).add(0.32)).mul(mix(0.5, 1, smoothstep(3, 70, dist2))), cv)); M.n.assign(mix(M.n, gnrm.mul(1.4), cv)); M.h.assign(mix(M.h, glum, cv));
    If(path.greaterThan(0.003), () => hblend(smp(PATCH), path));
    If(bankW.greaterThan(0.003), () => hblend(smp(BANK), bankW));
    const barW = barMask(p, d, w, b).mul(0.75), cutW = cutMask(p, d, w, b);
    If(barW.greaterThan(0.003), () => hblend(smp(BAR), barW));
    const steep = smoothstep(0.8, 0.68, vN.y);
    If(steep.greaterThan(0.003), () => hblend(smp(SLOPE), steep));
    If(cutW.greaterThan(0.003), () => hblend(smp(CUT), cutW));

    const wet = float(1).sub(smoothstep(w.mul(0.9), w.add(2.5), d));
    const c0 = M.c.mul(mix(1, 0.5, wet));
    const n = normalize(vN.add(vec3(M.n.x, 0, M.n.y).mul(float(1).sub(smoothstep(60, 400, dist2).mul(0.7)))));
    const relief = mix(0.74, 1.1, smoothstep(-6, 16, vHill));
    const s0 = max(n.dot(LIGHT.sunDir), 0), sunl = mix(s0, smoothstep(0.55, 0.95, s0), smoothstep(60, 600, dist2).mul(0.5));
    const col = weathered(c0.mul(macro).mul(relief), n).mul(LIGHT.amb.add(LIGHT.sun.mul(cloudAt()).mul(sunl)));
    const V = normalize(L.cam.sub(vWorld));
    const lit = col.add(LIGHT.sun.mul(pow(max(n.dot(normalize(V.add(LIGHT.sunDir))), 0), 48)).mul(0.3).mul(wet));
    return toScreen(haze(lit, rdist));
  });

  const m = new THREE.NodeMaterial();
  m.positionNode = world;
  m.fragmentNode = frag();
  return m;
}
