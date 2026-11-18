// The ground near the eye in relief (intent 0038, stage 6c). WebGPU has no tessellation, so the mesh is made finer
// where it is near and its points are worked out in compute (as Call of Duty's 2023 terrain does):
//
//   nodes    the land's quadtree (src/terrain/terrain.js) goes on below its finest level near the eye, and from where
//            the relief shows (the measure's: terrain.js, U.uReliefFirst) its LEVELS levels are this one's, each node a
//            tile of GRID × GRID quads, each level reaching half as far as the one before. Its outer vertices morph to
//            the coarser grid as the land's do, so the levels meet without a crack; the first of them morphs twice, to
//            the land's grid, where it meets it
//   points   one compute pass a frame works out every vertex of every such node once (not once for each pass that
//            draws it): the land's height and normal there, the river, how high it stands over the valley (the land's
//            own vertex code: material.js landPoint), and the ground's own height from its virtual texture's page
//            (src/terrain/pages.js), read as finely as the mesh is fine, raised or lowered by it (RELIEF from its
//            lowest to its highest), as much as the one measure says only geometry can show it (pages.js
//            reliefShares: where even parallax would be off by more than ERROR_PX); none where the mesh folds into the
//            land's grid, so they meet; further out the pixels take the height on (parallax, pages.js read)
//   drawn    one instanced mesh of the land's material, its vertex stage reading what the pass worked out; its pixels
//            are the land's (the prepass's asks, the page read, the light)
// Where the grass's carpet covers the ground, its blades stand over it: it is raised less (its share of the page).
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec2, vec3, vec4, uniform, exp2, clamp, fract, max, sqrt, smoothstep, globalId, instanceIndex, vertexIndex } from 'three/tsl';
import { gpuStorage } from '../core/gpu.js';
import { camDist } from '../world/land.nodes.js';
import { snowDepth } from '../world/light.js';
import { FINE, landPoint } from './material.js';
import { U } from '../core/uniforms.js';
import { RELIEF, reliefShares, reliefOverSnow } from './pages.js';

export const GRID = 32, LEVELS = 4;   // quads a node of relief has a side; levels of it below the land's finest
const V = (GRID + 1) ** 2;   // vertices a node

/** The tile of a node of relief: GRID × GRID quads, every other quad's diagonal turned (as the land's: it folds into
    the coarser grid as it morphs). */
function tile() {
  const n = GRID + 1, pos = new Float32Array(n * n * 3), idx = new Uint16Array(GRID * GRID * 6);
  for (let z = 0, i = 0; z < n; z++) for (let x = 0; x < n; x++, i += 3) { pos[i] = x; pos[i + 2] = z; }
  for (let z = 0, i = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const a = z * n + x, b = a + 1, c = a + n, d = c + 1;
    if ((x + z) & 1) { idx[i++] = a; idx[i++] = c; idx[i++] = b; idx[i++] = b; idx[i++] = c; idx[i++] = d; }
    else { idx[i++] = a; idx[i++] = c; idx[i++] = d; idx[i++] = a; idx[i++] = d; idx[i++] = b; }
  }
  return { pos: new THREE.BufferAttribute(pos, 3), idx: new THREE.BufferAttribute(idx, 1) };
}

/** The relief near the eye, drawn into `scene` with the land's material (made by `material(from)`: material.js
    terrainMaterial with its vertex stage reading from here), its heights from the land's pages `vt`. */
export function createRelief(scene, renderer, vt, material, CAP) {
  // (CAP: nodes at most, as many as its levels can hold round the camera: src/terrain/terrain.js; were it full, the land
  // draws what is left flat for that frame, and makes it again twice as large)
  const NODES = gpuStorage('vec4', CAP, 'the relief near the eye: its nodes'), nodes = new Float32Array(CAP * 4);
  const P = gpuStorage('vec4', CAP * V, 'the relief near the eye: its points'), Q = gpuStorage('vec4', CAP * V, 'the relief near the eye: their normals and the river');
  const uN = uniform(0, 'uint');
  // ---- every vertex of every node: where it lies (morphed), the land there, raised by its page ----
  const kernel = Fn(() => {
    const id = globalId.x, n = id.div(uint(V)), v = id.sub(n.mul(uint(V)));
    If(n.lessThan(uN), () => {
      const node = NODES.node.element(n), cell = node.z.div(GRID), rng = exp2(node.w).mul(U.uLandR0).mul(FINE);
      const g0 = vec2(float(v.mod(uint(GRID + 1))), float(v.div(uint(GRID + 1)))), at = (g) => node.xy.add(g.mul(cell));
      // the morph to the coarser grid at the node's outer edge (the land's gridPoint); the first level of relief morphs
      // twice over its outer part, to the land's own grid (its quads four of these)
      const d0 = camDist(at(g0)).toVar(), k = clamp(d0.sub(rng.mul(0.8)).div(rng.mul(0.15)), 0, 1).toVar(), k1 = clamp(d0.sub(rng.mul(0.6)).div(rng.mul(0.15)), 0, 1);
      const first = node.w.greaterThan(U.uReliefFirst.sub(0.5)), g = vec2(g0).toVar();   // (its first level: where it meets the land's grid, twice as coarse as its parent's)
      If(first, () => { g.assign(g0.sub(fract(g0.mul(0.5)).mul(2).mul(k1))); g.assign(g.sub(fract(g.mul(0.25)).mul(4).mul(k))); })
        .Else(() => { g.assign(g0.sub(fract(g0.mul(0.5)).mul(2).mul(k))); });
      const wp = at(g).toVar(), L = landPoint(wp, true), dist = camDist(wp).toVar();
      // (the mesh's own spacing there: what it can show of the page, so a vertex on the edge of a finer node, morphed,
      // reads what the coarser node's vertex there reads)
      const sp = cell.mul(first.select(float(1).add(k1).add(k.mul(2)), float(1).add(k))), dx = vec2(sp, 0), dy = vec2(0, sp);
      const G = vt.read(wp, dx, dy, dist, { compute: true });
      // (as much as the one measure says the geometry must show it (pages.js reliefShares), the soil's (not the grass's
      // carpet: its blades stand over it), what of it stands out of the snow)
      const raise = reliefShares(dist).geometry.mul(float(1).sub(G.cv)).mul(reliefOverSnow(snowDepth));
      const y = L.h.add(G.h.sub(0.5).mul(RELIEF).mul(raise));
      const at2 = n.mul(uint(V)).add(v);
      P.node.element(at2).assign(vec4(wp.x, y, wp.y, L.hill));
      Q.node.element(at2).assign(vec4(L.N.x, L.N.z, L.I.x, L.I.y));
    });
  })().computeKernel([64, 1, 1]);

  // ---- drawn: the land's material, its vertex stage reading the points ----
  const from = () => {
    const k = instanceIndex.mul(uint(V)).add(vertexIndex), p = P.node.element(k).toVar(), q = Q.node.element(k).toVar();
    const N = vec3(q.x, sqrt(max(float(1).sub(q.x.mul(q.x)).sub(q.y.mul(q.y)), 0)), q.y);
    return { world: p.xyz, I: vec4(q.z, q.w, 0, 0), N, hill: p.w };
  };
  const { pos, idx } = tile(), g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', pos); g.setIndex(idx); g.instanceCount = 0;
  const mesh = new THREE.Mesh(g, material(from));
  mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.visible = false;
  scene.add(mesh);
  let n = 0, was = '', at = 0;
  return {
    mesh,
    /** The nodes of this frame begin (before the quadtree is walked). */
    clear() { n = 0; },
    /** A node of relief (x, z its corner, size its side, level its level: -1 … -LEVELS): false where there is no room
        left (the land then draws it, flat). */
    add(x, z, size, level) { if (n >= CAP) return false; nodes.set([x, z, size, level], n * 4); n++; return true; },
    /** Its points worked out, for this frame's nodes (once the land's pages are sent: they are read), where anything
        they come from may have changed since: the camera (what the land lets go with distance, the morph), the pages,
        the nodes; and every half second (the snow). always: whatever has changed (a timing: tools/bench.js parts). */
    build(camera, always = false) {
      g.instanceCount = n; mesh.visible = n > 0; if (!n) return;
      const c = camera.position, key = `${c.x},${c.y},${c.z},${n},${nodes[0]},${nodes[1]},${nodes[(n - 1) * 4]},${nodes[(n - 1) * 4 + 1]}`;
      if (!always && key === was && !vt.changing && ++at < 30) return;
      was = key; at = 0;
      NODES.write(0, nodes.subarray(0, n * 4)); uN.value = n;
      renderer.compute(kernel, [Math.ceil((n * V) / 64), 1, 1]);
    },
    compile: () => renderer.compileComputeAsync(kernel),
    /** Nodes it holds at most. */
    cap: CAP,
    /** Let go of it (made again larger: src/terrain/terrain.js). */
    dispose() { scene.remove(mesh); g.dispose(); mesh.material.dispose(); for (const B of [NODES, P, Q]) renderer.backend.get(B.attr)?.buffer?.destroy?.(); },
    get count() { return n; },
  };
}
