// The baked materials (src/materials/bake.js) for node code that reads a tile by itself, not as a ground: the clouds'
// field and the snow's clumps read the billows, the land its noise. Which material plays a part is said by the
// material's own file (its `role`), not by a path here: another file with that role takes the part over.
//
// It also holds the one way a material is worn by a shape that carries no uv of its own (`wrap`): read from the three
// sides and blended by the normal. The world's rocks are drawn that way (src/scatter/rocks.js) and so is anything
// standing at a place that names its materials (src/world/place.js).
import { abs, normalize, pow, vec3 } from 'three/tsl';
import { byRole } from '../core/registry.js';

let tex = null;
/** The baked arrays: set once at the start, before any material is built (src/boot.js). */
export const useTiles = (t) => { tex = t; };
/** A read of the tile that plays `role`, at uv: a node, as any texture's (with .level(), .grad()). */
export const tile = (role, uv) => tex.a(byRole(role), uv);
/** A material's number in the library: what a shape's `part` is turned into to be read (src/materials/bake.js). */
export const layerOf = (m) => tex.layer(m);

/** A material worn by a shape with no uv of its own: read from the three sides and blended by the normal, so nothing
    stretches and nothing seams. `m` the material (a recipe, a uid, or its number as a node), `p` the point in the
    material's own scale (metres divided by the metres a tile spans), `N0` the face's normal, `relief` how deep its
    bumps read. -> { col: its colour in gamma 2 (square it for light), height: its height there, n: the normal with
    the material's relief folded into the shape's }. */
export function wrap(m, p, N0, relief = 1) {
  const b0 = pow(abs(N0), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));   // which of the three sides this face faces
  const a = tex.a(m, p.zy).mul(b.x).add(tex.a(m, p.xz).mul(b.y)).add(tex.a(m, p.xy).mul(b.z));
  const tx = tex.n(m, p.zy).xy.mul(2).sub(1), ty = tex.n(m, p.xz).xy.mul(2).sub(1), tz = tex.n(m, p.xy).xy.mul(2).sub(1);
  const n = normalize(N0.add(vec3(0, tx.y, tx.x).mul(b.x).add(vec3(ty.x, 0, ty.y).mul(b.y)).add(vec3(tz.x, tz.y, 0).mul(b.z)).mul(relief)));
  return { col: a.rgb, height: a.a, n };
}
/** The same, read with the gradients given (gx, gy: how fast p runs across the screen, dFdx and dFdy of it, asked
    outside any branch): what may be read inside a branch whose way differs pixel by pixel (src/scatter/placed.js: a
    face that names no material reads none). */
export function wrapGrad(m, p, gx, gy, N0, relief = 1) {
  const b0 = pow(abs(N0), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));
  const r = (f, uv, x, y) => tex[f](m, uv).grad(x, y);
  const a = r('a', p.zy, gx.zy, gy.zy).mul(b.x).add(r('a', p.xz, gx.xz, gy.xz).mul(b.y)).add(r('a', p.xy, gx.xy, gy.xy).mul(b.z));
  const tx = r('n', p.zy, gx.zy, gy.zy).xy.mul(2).sub(1), ty = r('n', p.xz, gx.xz, gy.xz).xy.mul(2).sub(1), tz = r('n', p.xy, gx.xy, gy.xy).xy.mul(2).sub(1);
  const n = normalize(N0.add(vec3(0, tx.y, tx.x).mul(b.x).add(vec3(ty.x, 0, ty.y).mul(b.y)).add(vec3(tz.x, tz.y, 0).mul(b.z)).mul(relief)));
  return { col: a.rgb, height: a.a, n };
}
