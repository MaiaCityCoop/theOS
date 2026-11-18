// The library's small pictures: each drawn once by the game's renderer into a 2D canvas (src/materials/preview.js),
// once the page's first view is complete (game.ready: the stage's subject comes first). A list's are made when they
// scroll into sight, a few a frame: a library of thousands opens at once, and a material only the library holds is
// painted only when its picture is wanted (src/materials/bake.js).
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { geometryOf } from '../../assets/index.js';
import { most } from '../../assets/kinds.js';
import { engineOf, rowOf } from '../scatter/index.js';
import { sceneThumb } from '../materials/preview.js';

/** The pictures for the game (src/boot.js): later(element, make) makes one when its element comes into sight; asset(a,
    canvas), person(c, canvas, wide) draw an asset's and a person's. */
export function createPictures(game) {
  const { renderer, tex } = game;
  const queue = [], made = new Map();
  const lazy = new IntersectionObserver((seen) => { for (const e of seen) if (e.isIntersecting) { lazy.unobserve(e.target); queue.push(e.target); } });
  game.ready.then(function work() { const t = performance.now(); while (queue.length && performance.now() - t < 12) { const b = queue.shift(); made.get(b)?.(); made.delete(b); } requestAnimationFrame(work); });
  return {
    later(b, make) { made.set(b, make); lazy.observe(b); },
    /** Make one now, once the page's first view is complete. */
    now(make) { game.ready.then(make); },
    /** An asset's picture: a scattered one's as its engine draws it (src/scatter: a rock in the world's own stone, a tree
        in its bark and needles, a tuft of grass), any other by its own faces: its nearest level, lit, on nothing. */
    asset(a, canvas) {
      const E = engineOf(a);
      if (E?.thumb) { const t = E.thumb(tex, rowOf(a)); return sceneThumb(renderer, t.things, canvas, t.eye, { look: t.look, tex }); }
      if (!a.detail?.levels?.length) return;
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.position.set(4, 7, 3);
      const things = [new THREE.HemisphereLight(0xdbe9ff, 0x4a5a3a, 1.4), sun, new THREE.Mesh(geometryOf(a), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }))];
      const d = Math.max(most(a.size.length), most(a.size.width), most(a.size.height)) * 1.9;
      const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100); cam.position.set(d * 0.7, d * 0.55, -d * 0.7); cam.lookAt(0, most(a.size.height) * 0.4, 0);
      sceneThumb(renderer, things, canvas, cam, { tex });
    },
    /** A person's picture: built anew (its own material, lit for the picture's eye), posed at ease, seen from the front;
        one that is grown in the page (the skeleton: characters/kit/bones.js) is drawn when its quick surface is there,
        then let go. */
    person(c, canvas, wide) {
      const P = c.make(tex, { eye: uniform(new THREE.Vector3()), quick: true });
      const draw = () => {
        P.step(0.5); P.object.position.set(0, 0, 0); P.object.rotation.y = 0.35; P.object.updateMatrixWorld(true);   // (in the middle of the picture, not on its walk's round)
        const h = P.height, cam = new THREE.PerspectiveCamera(wide ? 26 : 22, 1, 0.05, 50), d = h * (wide ? 3 : 1.35);
        cam.position.set(d * 0.45, wide ? h * 0.62 : h * 0.86, d * 0.89); cam.lookAt(0, wide ? h * 0.5 : h * 0.82, 0);
        return sceneThumb(renderer, [P.object], canvas, cam, { tex });
      };
      if (P.grown) P.grown.then(draw).then(() => P.dispose?.()); else draw();
    },
  };
}
