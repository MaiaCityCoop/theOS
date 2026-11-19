// The canopy map and the sky probes (intent 0038, stage 9): how much of the sky a point in the stand sees past the crowns
// and the shrubs drawn from above (Wronski's World AO, GDC 2014; Ghost of Tsushima's sky visibility, Patry 2021). Its
// layout is the crowns' own (what the cascades were laid out from: src/world/shadow.js cascades().casters, the stands'
// trees at their oldest, src/terrain/layers.js):
//
//   the map     what casts (layer CASTS, by its shadow twins: depth and cut-out, src/core/pass.js) drawn straight down
//               from above and straight up from below into one depth atlas of two squares: its top and its underside. A
//               crown is the slab between them; its gaps are gaps. As far round the eye as the shadow cascades reach (the
//               farthest of them, SHADE_REACH), a texel half the probes' spacing
//   the probes  one every quarter of the smallest crown's reach round its trunk (so the smallest crown's gaps are
//               resolved), at the floor, at a person's eyes and at the lowest crown's base over the ground: the share of
//               its sky its crowns leave it, as a surface facing up takes the sky (cosine-weighted, Lambert's): nine ways
//               up, a Vogel disc (Vogel 1979) lifted onto the sky as Malley's method lifts it (a way's sine its point's
//               radius on the disc), each an equal share. Each lets through as much as the slab it crosses is thin along
//               it (Beer–Lambert, as much a metre as the stands' crowns over the probe take, each stand's measured from
//               its kinds' own: src/terrain/layers.js crownsAt; the slab over the probe's height there, over the way's
//               cosine), read where the way crosses its crowns' middle: where it crosses, from the floor, the middle of
//               the slab over the probe (else halfway between the lowest crown's base and the tallest top), then again
//               where it crosses the middle of the slab it met there (that read the one taken; the first shared by the
//               three heights); past the map, sky. Its fourth number is the ground's height there
//   when        made again once the eye has crossed a probe's spacing (the map held to the probes' grid, so a probe stays
//               where it stood: no work while the eye stands still), a piece a frame: the view from above, from below,
//               then the probes; the map and the probes each a pair, the materials reading one while the other is made.
//               The first time, all at once
//
// A surface reads its probe (canopyAt: one read, its three heights blended by its own over the ground, and all the sky
// from there up to the tallest crown; and the floor's, how much of the light reaches the ground round it). Beyond the
// map, the sky is all there. (The probes marched ray by ray, stage 9b, are on their own branch, aven/0038-stage9b.)
//
//   the ground  round the eye: its own colour, off the land's pages (src/terrain/pages.js read), what the lit floor
//               sends up onto what faces it (src/world/light.js skyLight: the bounce). Out to twice the lowest crown's
//               height: four fifths of the ground a crown's underside sees (a disc R round the point under it, H below
//               it, fills R² / (R² + H²) of what faces down). Read again with the probes, and while the pages change
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, ivec2, uniform, texture, screenCoordinate, clamp, mix, smoothstep, exp, max } from 'three/tsl';
import { castRoute, arrived, CASTS, cascades } from '../shadow.js';
import { drawMade } from '../../core/compile.js';
import { shown, arriving } from '../../core/settle.js';
import { note, mark } from '../../core/gpu.js';
import { HMIN, HMAX } from '../land.js';
import { WALKER } from '../../../world/scale.js';

// the canopy's layout from the cascades' reach and the crowns (made when first asked for: by then the cascades are laid
// out, src/boot.js): side (m), probes a side (P), the map's texels a side (S), the probes' ways up ([m east, m south] for
// every metre up, and how much longer a metre up is along it: 1 / its cosine), their heights over the ground (m), the
// crowns' middle over the ground where no slab is over a probe (m), their spacing (m)
let LAYOUT = null;
const layout = () => {
  if (LAYOUT) return LAYOUT;
  const C = cascades(), { crown, radius, top } = C.casters, side = 2 * C.half[C.n - 1], spacing = radius / 4;
  const P = Math.ceil(side / spacing), S = 2 * P, N = 9, turn = Math.PI * (3 - Math.sqrt(5));   // (nine ways, as many as the columns before them; the golden angle)
  const ways = Array.from({ length: N }, (_, i) => { const sin = Math.sqrt((i + 0.5) / N), cos = Math.sqrt(1 - sin * sin), a = i * turn; return [(Math.cos(a) * sin) / cos, (Math.sin(a) * sin) / cos, 1 / cos]; });
  LAYOUT = { side, P, S, ways, heights: [0, WALKER.eye, crown], mid: (crown + top) / 2, spacing };
  return LAYOUT;
};

const black = Object.assign(new THREE.DataTexture(new Uint16Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType), { needsUpdate: true });
/** The canopy's numbers for the materials: its probes and where they lie (x, z of their middle, side, their ground's
    reference height); its map and where it lies, and its cameras' heights (over, under, their depth's range); whether
    it is there. */
const CANOPY = {
  probes: texture(black), at: uniform(new THREE.Vector4(0, 0, 1, 0)), ground: uniform(new THREE.Color(0, 0, 0)),   // (ground: none until it is read, no colour of its own; a uniform, read back from its texel: the light's textures are few, src/world/light/tables.js)
  map: texture(new THREE.DepthTexture(1, 1)), mapAt: uniform(new THREE.Vector4(0, 0, 1, 0)), cams: uniform(new THREE.Vector3()), on: uniform(0), groundOn: uniform(0),   // (on, groundOn: how much of the probes and of the ground's colour is read: none until made, then faded in, createCanopy)
};

const uvIn = (w, at) => w.xz.sub(at.xy).div(at.z).add(0.5);
const inside = (uv) => smoothstep(0, 0.08, uv.x).mul(smoothstep(0, 0.08, uv.y)).mul(smoothstep(1, 0.92, uv.x)).mul(smoothstep(1, 0.92, uv.y));
// the slab at a point of the map: its top (seen from above) and its underside (from below: a mirror image, its rows the
// other way), world heights. Where nothing was drawn, a top far below and an underside far above: nothing between
const slabAt = (uv) => {
  const S = layout().S, t = ivec2(clamp(uv, 0, 0.9999).mul(S));
  const top = CANOPY.cams.x.sub(float(CANOPY.map.load(t)).mul(CANOPY.cams.z));
  const under = CANOPY.cams.y.add(float(CANOPY.map.load(ivec2(t.x.add(S), t.y.negate().add(S - 1)))).mul(CANOPY.cams.z));
  return { top, under };
};

/** What of the light the crowns let reach a point at w, from its probe (1: all of it): sky, the share of the sky it sees,
    by its height over the ground; floor, the share the ground round it gets (its probe's at the floor). In any stage. */
export const canopyAt = (w) => {
  const H = layout().heights, top = cascades().top;
  const uv = uvIn(w, CANOPY.at), P4 = CANOPY.probes.sample(uv).level(0), h = w.y.sub(P4.w.add(CANOPY.at.w)), on = inside(uv).mul(CANOPY.on);
  const v = mix(mix(P4.x, P4.y, smoothstep(H[0], H[1], h)), mix(P4.z, float(1), smoothstep(H[2], top, h)), smoothstep(H[1], H[2], h));
  return { sky: mix(float(1), v, on), floor: mix(float(1), P4.x, on) };
};
/** The ground's own colour round the eye (linear; black until it has been read: then no light comes off it). In any
    stage. */
export const groundColour = () => CANOPY.ground.mul(CANOPY.groundOn);
/** groundAt: the ground's height at a point, as a node (src/world/land.nodes.js); land: the land's pages
    (src/terrain/pages.js), whose colour the ground round the eye is read off; crowns: { at(p), version() }, how much of
    the light a metre of crown takes at p, and how many times that has changed (src/terrain/layers.js crownsAt,
    crownsVersion). All handed in, so this file, which the one light imports, does not pull in the land's. */
export function createCanopy(renderer, { groundAt, land, crowns }) {
  if (!renderer.backend?.isWebGPUBackend) return null;   // (the WebGL 2 fallback: no canopy, all the sky)
  const { side, P, S, ways, heights, mid, spacing } = layout();
  // how far above (and below) the ground under the eye the cameras stand: clear of any ground the land has and of the
  // tallest that stands on it (src/world/land.js HMIN, HMAX; src/world/shadow.js cascades().top)
  const UP = HMAX - HMIN + cascades().top;
  const atlas = () => { const rt = new THREE.RenderTarget(2 * S, S, { count: 0, depthBuffer: true }); rt.depthTexture = new THREE.DepthTexture(2 * S, S); rt.depthTexture.type = THREE.FloatType; return rt; };
  const target = () => new THREE.RenderTarget(P, P, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const maps = [atlas(), atlas()], probes = [target(), target()];   // (each a pair: the one the materials read, the one being made)
  note('the canopy map, its probes and the ground round the eye', 2 * (2 * S * S * 4 + P * P * 8) + 8, 0, 'light');
  // the cameras: straight down from above, straight up from below (both with north at the top of their picture)
  const cam = (down) => { const c = new THREE.OrthographicCamera(-side / 2, side / 2, side / 2, -side / 2, 0, 2 * UP); c.layers.set(CASTS); c.up.set(0, 0, down ? -1 : 1); c.userData.shadow = true; return c; };   // (shadow: what is drawn keeps the levels the eye chose, src/detail/index.js)
  // (a caster drawn once it is made, and the map made again, all at once, once what it left out has come: made by need,
  // src/world/shadow.js castRoute)
  // (the map, its probes and the ground round the eye are made after what the first view waits for, as near as the near
  // cascade's edge, src/core/compile.js ask; and each fades in as it comes, src/core/settle.js arriving)
  const AFTER = cascades().half[0], probesIn = arriving((v) => { CANOPY.on.value = v; }), groundIn = arriving((v) => { CANOPY.groundOn.value = v; });
  const cams = [cam(true), cam(false)], missing = new Set(), route = castRoute(renderer, () => maps[front], () => cams[0], (o) => missing.add(o), () => AFTER);
  // the probes: at each of its heights over the ground, along each of its ways up, the slab where the way crosses its
  // crowns' middle, each an equal share
  const probeMat = new THREE.NodeMaterial();
  probeMat.fragmentNode = Fn(() => {
    const uv = screenCoordinate.xy.div(P), xz = CANOPY.mapAt.xy.add(uv.sub(0.5).mul(CANOPY.mapAt.z)), g = groundAt(xz, float(0));
    const at = (o, rise) => { const q = xz.add(vec2(o[0], o[1]).mul(rise)), u = uvIn(vec3(q.x, 0, q.y), CANOPY.mapAt); return { s: slabAt(u), inMap: u.x.greaterThanEqual(0).and(u.y.greaterThanEqual(0)).and(u.x.lessThan(1)).and(u.y.lessThan(1)) }; };
    const middleOf = (s, or) => s.top.greaterThan(s.under).select(s.top.add(s.under).mul(0.5), or);   // (where nothing was drawn its top lies under its underside: no slab)
    const middle = middleOf(at([0, 0], 0).s, g.add(mid)), met = ways.map((o) => middleOf(at(o, max(middle.sub(g), 0)).s, middle)), K = crowns.at(xz).toVar();   // (K: what a metre of the crowns here takes)
    const seen = heights.map((h) => {
      const y = g.add(h), sum = float(0).toVar();
      ways.forEach((o, i) => { const A = at(o, max(met[i].sub(y), 0)); sum.addAssign(A.inMap.select(exp(max(A.s.top.sub(max(y, A.s.under)), 0).mul(K.mul(-o[2]))), float(1))); });
      return sum.div(ways.length);
    });
    return vec4(seen[0], seen[1], seen[2], g.sub(CANOPY.mapAt.w));
  })();
  const quad = new THREE.QuadMesh(probeMat), at = new THREE.Vector4(), was = new THREE.Vector2(Infinity, Infinity);   // (at: where the map being made lies, and its ground's height; was: the probes' grid point it was made round)
  // the ground round the eye: the land's pages read at the level whose texels are that wide (lod: no steps in a quad's
  // pass to read by), into one texel
  const groundTo = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false }), R = 2 * cascades().casters.crown;
  const groundMat = new THREE.NodeMaterial();
  groundMat.fragmentNode = Fn(() => vec4(land.read(CANOPY.mapAt.xy, vec2(R, 0), vec2(0, R), float(0), { lod: true }).c, 1))();
  const groundQuad = new THREE.QuadMesh(groundMat);
  let groundDue = true, reading = null;
  // (read: whether it was drawn, once its pass is made, src/core/compile.js drawMade; else read again next frame)
  const drawGround = () => {
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear, route0 = renderer.getRenderObjectFunction();
    mark('probes'); renderer.setRenderObjectFunction(null); renderer.autoClear = false; renderer.setRenderTarget(groundTo);
    const read = drawMade(renderer, groundQuad, groundQuad.camera, 'the ground round the eye', AFTER);
    if (read && !reading) {   // (its texel read back, one read at a time, into the uniform every lit material reads)
      reading = renderer.readRenderTargetPixelsAsync(groundTo, 0, 0, 1, 1).then((px) => { CANOPY.ground.value.setRGB(...[0, 1, 2].map((c) => THREE.DataUtils.fromHalfFloat(px[c]))); groundIn.arrive(); }).finally(() => { reading = null; });
    }
    mark(null); renderer.setRenderObjectFunction(route0); renderer.autoClear = ac; renderer.setRenderTarget(prev);
    return read;
  };
  const ground = () => { if (groundDue || land.changing) groundDue = !drawGround(); };   // (with the probes, and while what the pages hold changes)
  // what is due, while nothing is being made: the map and the probes again round (gx, gz) once the eye has crossed a
  // probe's spacing; else the probes alone, the map as it is, once the stands' crowns were measured since they were made
  const due = (gx, gz, groundY) => {
    if (piece !== PIECES) return;
    if (gx !== was.x || gz !== was.y) { piece = 0; at.set(gx, gz, side, groundY); was.set(gx, gz); }
    else if (crowns.version() !== crownsMade) piece = 2;
  };
  const PIECES = cams.length + 1;   // (the view from above, from below, the probes)
  let piece = PIECES, front = 0, everProbed = false, crownsMade = -1;   // (the piece to be made next, PIECES: none; which of each pair the materials read; whether its probes were ever drawn; the stands' crowns they were made with: crowns.version)
  // the map's views, from above and from below (which: the ones drawn now), into its atlas rt; whole: both are in, what
  // the probes are made from
  const drawViews = (scene, rt, which, whole) => {
    mark('canopy');   // (whose passes these are, for a tool's timing: src/core/gpu.js)
    renderer.setRenderTarget(rt); renderer.setRenderObjectFunction(route);
    for (const i of which) {
      const c = cams[i]; c.position.set(at.x, at.w + (i ? -UP : UP), at.y); c.lookAt(at.x, at.w, at.y); c.updateMatrixWorld();
      rt.viewport.set(i * S, 0, S, S); rt.scissor.set(i * S, 0, S, S); rt.scissorTest = true;
      renderer.autoClear = i === 0; renderer.render(scene, c);   // (the whole atlas cleared with the first)
    }
    rt.viewport.set(0, 0, 2 * S, S); rt.scissorTest = false;
    if (whole) { CANOPY.mapAt.value.copy(at); CANOPY.cams.value.set(at.w + UP, at.w - UP, 2 * UP); CANOPY.map.value = rt.depthTexture; }
  };
  // the probes, from the map, into the pair's `back`, then read: whether they were drawn (once their pass is made,
  // src/core/compile.js drawMade)
  const drawProbes = (back) => {
    mark('probes'); renderer.setRenderObjectFunction(null); renderer.autoClear = false;   // (every probe written: nothing cleared)
    const to = probes[back];
    renderer.setRenderTarget(to);
    if (!drawMade(renderer, quad, quad.camera, 'the sky probes', AFTER)) return false;
    front = back; CANOPY.at.value.copy(CANOPY.mapAt.value); CANOPY.probes.value = to.texture; everProbed = true; probesIn.arrive(); groundDue = true; crownsMade = crowns.version();
    return true;
  };
  return {
    /** Before the frame: once the eye has crossed a probe's spacing since the map was made, the map made again round
        where it stands, a piece a frame (its view from above, from below, then its probes), then both pairs turned.
        The first time, all at once. */
    render(scene, camera, groundY) {
      probesIn.step(); groundIn.step();
      if (shown()) missing.clear();   // (after the first frame what it left out comes with the eye's next probe)
      const came = piece === PIECES && !shown() && arrived(missing);
      if (came) piece = 0;
      const first = !everProbed || came, gx = Math.round(camera.position.x / spacing) * spacing, gz = Math.round(camera.position.z / spacing) * spacing;
      due(gx, gz, groundY);
      if (piece === PIECES) { ground(); return; }
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear, route0 = renderer.getRenderObjectFunction(), back = first ? front : 1 - front;
      if (first || piece < 2) drawViews(scene, maps[back], first ? [0, 1] : [piece], first || piece === 1);
      const probed = first || piece === 2 ? drawProbes(back) : true;   // (not drawn: this piece made again next frame)
      piece = !probed ? piece : first ? PIECES : piece + 1;
      mark(null); renderer.setRenderObjectFunction(route0); renderer.autoClear = ac; renderer.setRenderTarget(prev);
      ground();
    },
  };
}
