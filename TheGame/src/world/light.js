// The light every material shares (the shading contract, intent 0002), in TSL: sun, sky light, the air, the weather,
// the shadow map, the hand-over between levels of detail, and the way to the screen. All its numbers are the shared
// uniforms (src/core/uniforms.js), which the sky writes by the hour.
//
// The weather comes to it from its conditions (src/world/weather/*.js), none of them known here by name: what they add
// to the shared lanes (wet, fog, dim), and what each does to a surface (`surface`: the snow lying on it). What is one
// condition's own (the snow's depth, the wind's push, the clouds' shade) is that condition's code, handed on from here,
// so a material asks the contract and no file but the condition's holds it.
import { Fn, float, int, vec2, vec3, vec4, ivec2, If, Loop, Break, mix, exp, pow, smoothstep, fract, floor, dot, max, min, clamp, length, normalize, cos, sin, screenCoordinate } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { passOf } from '../core/pass.js';
import { lane } from './weather/lanes.js';
import { surfaceHooks, airHooks } from './weather/index.js';
import { cloudShade } from './weather/clouds.js';
import { cascades } from './shadow.js';
import { blueAt } from './light/noise.js';
import { SUN_DIAMETER } from './light/physics.js';
import { SCREEN } from './light/screen.js';
import { canopyAt, groundColour } from './light/canopy.js';

export { snowDepth, snowCover, snowDrift, snowLift, snowLiftAtVertex, SNOW } from './weather/snow.js';
export { cloudShade, CLOUD_H } from './weather/clouds.js';
export { windAt, windDir, windStrength } from './weather/wind.js';

let texelReads = true;
/** which backend draws (before any material is built): only WebGPU reads the shadow map's own texels in a vertex stage (shadowAtVertex); on the WebGL 2 fallback what is lit per corner takes no cast shadow */
export const useBackend = (renderer) => { texelReads = !!renderer?.backend?.isWebGPUBackend; };

// air: the far land takes the sky's colour; one height fog for everything, thickest at the ground, thinning upwards
// (by e every airScale metres), so a line of sight from high up passes through less of it. The weather's fog (its lane) thickens it.
const airMean = Fn(([h]) => { const k = h.div(max(U.uAirScale, 1)); return k.lessThan(1e-3).select(float(1).sub(k.mul(0.5)), float(1).sub(exp(k.negate())).div(k)); });
// the air lit by the sun: looking towards it, the haze glows warm (light scattered forward by the air), away from it
// it keeps the horizon's colour; the more air in the line of sight, the more of it
/** The air between the eye and w, as its two parts: k, how much of a surface's colour comes through, and col, the air's
    own light: a height fog lit by the sun, worked out here. A material that lights itself per vertex (a tree:
    src/scatter/trees.js) carries them to its pixels; airAt mixes them. (Hillaire's air in froxels, stage 9b, is on its
    own branch, aven/0038-stage9b, until it fits the light's 3 ms.) */
const airHere = Fn(([w, eye]) => {
  const d = w.sub(eye), dist = length(d), towards = max(normalize(d).dot(U.uSunDir), 0);
  const glow = U.uSun.mul(pow(towards, 6).mul(0.22).add(pow(towards, 40).mul(0.25))).mul(U.uSunDir.y.max(0).mul(-1).add(1).mul(0.6).add(0.4));
  // (and by where the land is no longer drawn it is all air: from high up the land's end is not an edge against the sky)
  const end = smoothstep(U.uLandEnd.mul(0.55), U.uLandEnd.mul(0.94), dist), k0 = exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(lane.fog.mul(40).add(1))).mul(float(1).sub(end));
  return vec4(U.uHazeCol.add(glow), k0);
});
export const airOf = (w, eye = U.uCam) => {
  const A = airHere(w, eye), dist = length(w.sub(eye));
  let k = A.w, col = A.xyz;
  // what of the weather lies in the air between (the clouds, from above them): it hides a share of the surface, lit its own way
  for (const c of airHooks()) {
    const V = c.air({ eye, w, dist }), k2 = k.mul(float(1).sub(V.a));
    col = V.col.mul(V.a).mul(k).add(col.mul(float(1).sub(k))).div(max(float(1).sub(k2), 1e-4)); k = k2;
  }
  return { k, col };
};
const airAt = Fn(([c, w, eye]) => { const A = airOf(w, eye); return mix(A.col, c, A.k); });
/** The end of every material: its colour seen through the air from the eye, to the screen. */
export const finish = (c, w, eye = U.uCam) => toScreen(airAt(max(c, vec3(0)), w, eye));   // (no light is less than none)
/** The sky's light on a surface facing n (at w: past the crowns over it, src/world/light/canopy.js; else all of it): most
    from above, less on what faces sideways. And what the ground round it sends up (the bounce): the ground's own colour
    (round the eye, off the land's pages: canopy.js groundColour) in the light on it, the sun's and the sky's, as much of
    it as the crowns let reach the floor there (canopy.js canopyAt), on as much of what the surface faces as the ground
    fills (a plane's view factor: none of what faces up, half of what faces sideways, all of what faces down). clouds:
    the share of the sun the storm and the clouds let through there, where it is worked out already (lightOn). */
export const skyLight = (n, w = null, clouds = null) => {
  const C = w ? canopyAt(w) : null, sky = U.uAmb.mul(n.y.mul(0.32).add(0.68)), through = clouds ?? (w ? sunDim().mul(cloudShade(w)) : sunDim());
  const onGround = U.uSun.mul(U.uSunDir.y.max(0)).mul(through).add(U.uAmb).mul(C ? C.floor : 1);
  return (C ? sky.mul(C.sky) : sky).add(groundColour().mul(onGround).mul(float(0.5).sub(n.y.mul(0.5))));
};
/** The screen's curve: the light's numbers to the picture's (its exposure, a soft shoulder, gamma). */
export const display = (c) => pow(float(1).sub(exp(c.negate().mul(1.25).mul(U.uExposure))), vec3(1 / 2.2));
/** What every material returns, its colour for the screen. Drawn for the world's frame (either pass: src/core/pass.js)
    that is the light's own numbers: the upscale puts the screen's curve on them once, as it lays the picture on the
    screen (src/core/temporal.js). Drawn anywhere else (a library's picture), the curve is put on here. */
export const toScreen = Fn(([c], builder) => vec4(passOf(builder) ? c : display(c), 1));
/** A colour meant for the screen as it is (an overlay's), as the light's numbers the screen's curve takes back to it. */
export const fromScreen = Fn(([c], builder) => (passOf(builder) ? float(1).sub(pow(clamp(c, 0, 0.999), vec3(2.2))).log().negate().div(U.uExposure.mul(1.25)) : c));
/** What the weather does to a surface facing n: how much of its own colour stays (keep) and what is laid on it (add).
    The wet lane darkens it; then each condition's `surface` in turn (the snow lying on it). lift: how far the surface
    stands out of what lies on the ground here (a pebble's top, a blade's tip). For a material that lights itself per
    vertex (a tree); weathered() is this applied to a colour. */
export const weatherOn = (n, lift = 0) => {
  let keep = float(1).sub(lane.wet.mul(0.35)), add = null;
  for (const c of surfaceHooks()) { const s = c.surface(n, float(lift)); add = add ? add.mul(s.keep).add(s.add) : s.add; keep = keep.mul(s.keep); }
  return { keep, add: add ?? vec3(0) };
};
let weatheredF = null;   // (made when first asked for: by then every condition is there)
/** A surface under the weather: darker when wet, and what its conditions lay on it (lift: as weatherOn). */
export const weathered = (col, n, lift = 0) => (weatheredF ||= Fn(([c, nn, l]) => { const W = weatherOn(nn, l); return c.mul(W.keep).add(W.add); }))(col, n, float(lift));

// a screen noise (interleaved gradient): for the shadow's taps and the hand-over between levels
export const ign = (p) => fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));

// shadows: what the casters hide of the light, from the cascades round the camera (src/world/shadow.js: the layers of
// one depth array, the near one first, each twice the one before); 1 lit, 0 in shadow. Each cascade's matrix
// (shadow.js cascades().mats) takes a world point straight to its (u, v, depth), whichever way up the backend keeps it.
// A point is read in the first one it lies inside, the hand-over to the next dithered over a cascade's last tenth (the
// picture built over time averages it), and the last fades out at its own edge.
//
// Every cascade is soft as the sun makes it (PCSS, Fernando 2005), as far as its texels can show it: six reads round the
// point find how far the casters above it stand (the blockers' mean depth), and its penumbra is that distance times the
// width of the sun's disc (0.53°): a leaf a hand above the path throws a sharp shadow, a crown 15 m up a soft one, so a
// canopy's light falls as the round flecks a real one does, near and far. Then eight taps over that penumbra, each
// compared and filtered over 2 x 2 texels by the GPU (a comparison sampler), on a disc turned by the blue noise from
// pixel to pixel and frame to frame (one turn a pixel: its cosine and sine once, not a tap's each), the blockers looked
// for as far round as the widest penumbra reaches (U.uShadowPen: the sun's disc over the tallest caster's way along the
// light, src/world/shadow.js). No penumbra is narrower than a texel and a half of its cascade, what its texels can show;
// where even the widest is narrower than that (a far cascade, whose texels are wider than the sun blurs anything), four
// taps over that texel and a half, and no blockers looked for.
// a Vogel disc of n taps (radius 1), its first turned by a0: as numbers, turned for a pixel by its (cos, sin)
const disc = (n, a0 = 0) => Array.from({ length: n }, (_, i) => { const r = Math.sqrt((i + 0.5) / n), a = a0 + i * 2.399963; return [Math.cos(a) * r, Math.sin(a) * r]; });
const BLOCKERS = disc(6), TAPS = disc(8, 1.3), FEW = disc(4, 0.4);
const turned = ([x, y], cs) => vec2(cs.x.mul(x).sub(cs.y.mul(y)), cs.y.mul(x).add(cs.x.mul(y)));
/** a point in cascade k (a number, or an index in a shader): { q (u, v, depth), e (how far inside: 0 at its edge, 1 a
    tenth in) } */
const cascade = (w, k) => {
  const s = cascades().mats.element(int(k)).mul(vec4(w, 1)), q = s.xyz.div(s.w), m = min(min(q.x, q.y), min(float(1).sub(q.x), float(1).sub(q.y)));
  return { q, e: smoothstep(0, 0.1, m).mul(q.z.lessThan(1).select(float(1), float(0))) };
};
const depthAt = (uv, k) => { const S = cascades().S; return float(U.tShadow.load(ivec2(clamp(uv.mul(S), vec2(0), vec2(S - 1)))).depth(int(k))); };
const compareAt = (uv, k, z) => U.tShadow.sample(uv).depth(int(k)).level(0).compare(z);
// cascade k's taps D (TAPS, or FEW) over a penumbra `pen` metres wide (perM: its texture's units a metre)
const taps = (q, z, cs, pen, perM, k, D = TAPS) => { const s = float(0).toVar(); for (const d of D) s.addAssign(compareAt(q.xy.add(turned(d, cs).mul(pen.mul(perM).mul(0.5))), k, z)); return s.div(D.length); };
/** cascade k at q (z: its depth less its bias; cs: the pixel's turn), as soft as the sun's disc makes it, as far as its
    texels can show it (above) */
const softIn = (q, z, cs, k) => {
  const C = cascades(), t = C.texelAt.element(k), perM = float(1).div(t.mul(C.S)), least = t.mul(1.5), r = float(1).toVar();
  if (!texelReads) { r.assign(taps(q, z, cs, t.mul(3), perM, k)); return r; }   // (WebGL 2 reads no texel of a texture it compares: no blockers, a penumbra of three texels)
  If(U.uShadowPen.greaterThan(least), () => {
    const found = float(0).toVar(), sum = float(0).toVar();
    for (const d of BLOCKERS) { const b = depthAt(q.xy.add(turned(d, cs).mul(U.uShadowPen.mul(perM).mul(0.5))), k); If(b.lessThan(z), () => { sum.addAssign(b); found.addAssign(1); }); }
    If(found.greaterThan(0), () => { r.assign(taps(q, z, cs, clamp(z.sub(sum.div(found)).mul(C.rangeAt.element(k)).mul(SUN_DIAMETER), least, U.uShadowPen), perM, k)); });
  }).Else(() => { r.assign(taps(q, z, cs, least, perM, k, FEW)); });
  return r;
};
/** The shadow at w, a pixel's (n: its normal, for the offset that keeps a surface from shading itself). how: 'soft',
    'one' (one tap), 'pulled' (what is drawn into the map pulled towards the light allows for its own pull too). */
const shadowOf = (w, n, how) => {
  const r = float(1).toVar(), pull = how === 'pulled' ? 2 : 1, C = cascades();
  If(U.uShadowOn.greaterThan(0.5), () => {
    const N = n ?? vec3(0), noise = blueAt(screenCoordinate.xy), turn = noise.x.mul(Math.PI * 2), cs = vec2(cos(turn), sin(turn));
    // read in the first cascade the point lies in (the hand-over to the next dithered over a cascade's last tenth: the
    // picture built over time averages it), the last fading out at its own edge; moved off along its normal by 1.2 of
    // that cascade's texels, and its depth back by that cascade's bias. One loop finds which cascade and how much of it,
    // one read reads it there: the shader holds each read once, however many cascades there are
    const at = (k) => cascade(w.add(N.mul(C.texelAt.element(k).mul(1.2))), k);
    const k = int(C.n - 1).toVar(), share = float(0).toVar();
    Loop({ start: int(0), end: int(C.n), type: 'int', condition: '<' }, ({ i }) => {
      const e = at(i).e;
      If(i.equal(C.n - 1), () => { k.assign(i); share.assign(e); Break(); });
      If(e.greaterThan(noise.y), () => { k.assign(i); share.assign(1); Break(); });
    });
    If(share.greaterThan(0), () => {
      const A = at(k), z = A.q.z.sub(C.backAt.element(k).mul(pull)), read = float(1).toVar();
      if (how === 'one') read.assign(compareAt(A.q.xy, k, z));
      else read.assign(softIn(A.q, z, cs, k));
      r.assign(mix(1, read, share));
    });
  });
  return r;
};
/** The share of the sun's light what casts a shadow lets reach w (1: all of it), as sunAt reads it (how: its 'soft',
    'one', 'vertex' or 'pulled'; n: the normal, for a pixel's). For what reads the shadow alone: the land, which takes its
    clouds apart; the tools that check the cascades (tools/cascades.js, tools/shadowcheck.mjs). */
export const shadowAt = (w, how = 'soft', n = null) => SHADOWS[how](w, n);
/** the same with one sample (the GPU still filters it over 2 x 2 texels): for what is too thin for a soft edge to show (a
    blade of grass), a fraction of the reads */
const shadowAtOne = (w, n = null) => shadowOf(w, n, 'one');
/** What stands on the ground and casts (a person: characters/kit/human.js) is drawn into the atlas pulled towards the
    light by the near cascade's bias, so its shadow starts where it touches the ground: unpulled, the bias would leave
    the ground lit for a hand's breadth round its feet. This is how far, in metres along the light. */
export const casterPull = () => U.uShadowPull;
/** shadowAt for what casts pulled (casterPull): it allows for its own pull as well as the bias, or it would shade itself
    all over */
export const shadowAtPulled = Fn(([w]) => shadowOf(w, null, 'pulled'));
// the same in a vertex stage (a tree's corners: src/scatter/trees.js): no comparison is to be had there, so the atlas's
// own texels are read and compared here. Not one texel compared hard (lit, or not): a crown stands in its own shade, most
// of its corners lie at that edge, and whatever moved by a hair (the sun going on, the map's box as the camera rises, a
// crown in the wind) threw whole cards from light into shade and back, a flicker all through the crown. So nine texels
// round the corner (every other one of a 5 x 5), each weighed by how near the corner lies to it (a smooth bell: the
// weights slide as the corner moves, none jumps), and each compared over a depth (VSOFT), not at one: a corner's light
// changes as little as what moved. In the first cascade it lies inside, the next beyond, blended between.
const VSTEP = 2, VSOFT = 0.0008;   // every VSTEP-th texel; in shade from VSOFT (of the map's depth) past the bias
const vertexIn = (A, k) => {
  // i: the nearest of the texels read; f: how far the corner lies from it, -0.5 .. 0.5 of their spacing
  const S = cascades().S, t = A.q.xy.mul(S).sub(0.5).div(VSTEP), i = floor(t.add(0.5)), f = t.sub(i);
  const bell = (v) => [v.sub(0.5).mul(v.sub(0.5)).mul(0.5), float(0.75).sub(v.mul(v)), v.add(0.5).mul(v.add(0.5)).mul(0.5)];   // (the three weights along one axis: they add up to 1)
  const wx = bell(f.x), wy = bell(f.y), z = A.q.z.sub(cascades().backAt.element(int(k))), s = float(0).toVar();
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const p = clamp(i.add(vec2(a - 1, b - 1)).mul(VSTEP), 0, S - 1);
    s.addAssign(smoothstep(z.sub(VSOFT), z, float(U.tShadow.load(ivec2(p)).depth(int(k)))).mul(wx[a]).mul(wy[b]));   // lit where nothing nearer the light was drawn there
  }
  return s;
};
// (the corner's shadow from the near cascade out: each its share where the corner lies inside it, its last tenth handing
// over to the next, what is left after the last lit; one loop, ended where a cascade holds all of it)
const shadowAtVertex = Fn(([w]) => {
  const r = float(1).toVar();
  if (texelReads) If(U.uShadowOn.greaterThan(0.5), () => {
    const left = float(1).toVar(), s = float(0).toVar();
    Loop({ start: int(0), end: int(cascades().n), type: 'int', condition: '<' }, ({ i }) => {
      const A = cascade(w, i);
      If(A.e.greaterThan(0), () => { s.addAssign(left.mul(A.e).mul(vertexIn(A, i))); left.mulAssign(float(1).sub(A.e)); });
      If(left.lessThanEqual(0), () => { Break(); });
    });
    r.assign(s.add(left));
  });
  return r;
});
/** true while the casters are drawn into the shadow map: a caster's fragment does no light then (only its depth counts) */
export const unlit = () => U.uShadowPass.greaterThan(0.5);
/** the share of the sun's light the weather's sky lets through (its dim lane: a storm's) */
export const sunDim = () => float(1).sub(lane.dim.mul(0.6));

// ---- the one light (intent 0038, stage 9): every material is lit here, and nowhere else ----
const SHADOWS = { soft: (w, n) => shadowOf(w, n, 'soft'), one: (w, n) => shadowAtOne(w, n), vertex: (w) => shadowAtVertex(w), pulled: (w) => shadowAtPulled(w) };
/** The share of the sun's light that reaches w (1: all): past the storm, the clouds and what casts a shadow. how: 'soft'
    (a pixel's: the cascades with their penumbra), 'one' (one tap: what is too thin for a soft edge to show, a blade),
    'vertex' (a vertex stage's: a tree's corners), 'pulled' (what is drawn into the map pulled towards the light).
    clouds: the share the storm and the clouds let through, where it is worked out already (lightOn). */
export const sunAt = (w, how = 'soft', n = null, clouds = null) => (clouds ?? sunDim().mul(cloudShade(w))).mul(SHADOWS[how](w, n));
// what the screen's light left for this pixel (src/world/light/screen.js): one texel, loaded (no sampler), the share of
// the sun the contact shadows let through. Read in the colour pass of what takes part in the prepass (its depth is the
// one the screen's light read), in a fragment; 1 anywhere else.
const onScreen = (builder) => passOf(builder) === 'main' && builder.shaderStage === 'fragment' && (builder.material?.userData?.pre === true || builder.material?.userData?.lit === true);   // (lit: a deferred family's pass of light, src/core/pass.js LIT)
/** The share of the sun the contact shadows let reach this pixel (1: all of it): for lightOn, and for a material that lights
    itself per vertex and takes the rest per pixel (a tree's cards). */
export const contactShade = Fn((builder) => (onScreen(builder) ? mix(float(1), SCREEN.contact.load(ivec2(screenCoordinate.xy)).x, SCREEN.on) : float(1)));
/** The light a surface takes, in its parts (rgb, the light's numbers): `sky`, what its colour takes from the sky; `sun`,
    from the sun; `spec`, the highlight laid over it. lit() below puts them on a colour; a material that lights itself per
    vertex (a tree) carries them to its pixels. s, every field but n and w optional:
      n, w, eye, V  its normal (the side the eye sees), its point, the eye (U.uCam), the way to it (else from those)
      sun, how      the share of the sun that reaches it (else sunAt(w, how))
      ndl, wrap     how it faces the sun (else n·L, wrapped round its edge as far as `wrap` says: soft things, leaves)
      through, lobe, tint   how much of the sun behind it comes through it (a leaf, a blade, canvas): seen into the sun,
                    as tight as `lobe` (3), coloured by `tint` on the way
      ao            its own occlusion (its mesh's, a crown's depth): the sky's light is lost faster than the sun's
      sky           what else dims the sky's light on it (the ground's own shade)
      gloss, sharp  its highlight: how bright, how tight (shineOf: from its material's roughness)
      ns            the way its highlight is reflected from, where that is not n (a leaf: its own card's, where n is its
                    crown's dome)
      glint         its highlight's own share, worked out already where its gloss and ns were at hand (glintOf: a
                    deferred family's prepass, src/core/gbuffer.js); else from gloss, sharp and ns here */
export const lightOn = (s) => {
  const n = s.n, L = U.uSunDir, V = s.V ?? (s.w ? normalize((s.eye ?? U.uCam).sub(s.w)) : null), clouds = s.w ? sunDim().mul(cloudShade(s.w)) : null;   // (clouds: once, for its sun and for the ground's round it)
  const share = (s.sun ?? sunAt(s.w, s.how, s.n, clouds)).mul(contactShade());
  const wrap = s.wrap ?? 0, ndl = s.ndl ?? (wrap ? n.dot(L).add(wrap).div(float(wrap).add(1)) : n.dot(L)).max(0);
  const back = V ? max(V.negate().dot(L), 0) : null, light = U.uSun.mul(share);   // (how far the eye looks into the sun; the sun's light here)
  // the sky's light, less what the crowns above hide of it, and the ground's off its lit floor (skyLight)
  let sky = skyLight(n, s.w ?? null, clouds), sun = ndl;
  // through it, two-sided: the sun behind it seen through it (a lobe round the sun, as tight as `lobe`), and its far
  // side lit (what faces away from the sun, seen from the dark side, glows through)
  if (s.through) { const t = pow(back, s.lobe ?? 3).mul(0.65).add(max(n.dot(L).negate(), 0).mul(0.35)).mul(s.through); sun = sun.add(s.tint ? s.tint.mul(t) : t); }
  sun = light.mul(sun);
  if (s.sky) sky = sky.mul(s.sky);
  if (s.ao) { const ao = float(s.ao); sky = sky.mul(ao.mul(ao).mul(0.75).add(ao.mul(0.25))); sun = sun.mul(ao.mul(0.6).add(0.4)); }
  // (its highlight)
  const spec = s.glint ? light.mul(s.glint) : s.gloss ? light.mul(glintOf(s.ns ?? n, V, s.gloss, s.sharp)) : vec3(0);
  return { sky, sun, spec, light, V, back, ndl };
};
/** A surface's highlight from its material's roughness (rough: 0 … 1, its painting's, src/materials/bake.js tex.r),
    as its material is shown (src/materials/preview.js) and as it is lit in the world: { gloss, sharp } for lightOn.
    ndl: how its reflecting side faces the sun (the highlight goes with it). */
/** A highlight's own share of the sun's light where it is (lightOn's spec less that light): off ns (the way it is
    reflected from), seen from V, as bright and as tight as gloss and sharp. */
export const glintOf = (ns, V, gloss, sharp = 40) => pow(max(ns.dot(normalize(V.add(U.uSunDir))), 0), sharp).mul(gloss);
export const shineOf = (rough, ndl) => ({ gloss: float(1).sub(rough).mul(0.5).mul(ndl), sharp: mix(60, 6, rough) });
/** A surface lit and seen through the air, for the screen: { colour (its own, linear), extra (light of another kind on
    it: a fire's), glow (its own light), ...lightOn's }. */
export const lit = (s) => { const L = lightOn(s); let d = L.sky.add(L.sun); if (s.extra) d = d.add(s.extra); let c = s.colour.mul(d).add(L.spec); if (s.glow) c = c.add(s.glow); return finish(c, s.w, s.eye); };

