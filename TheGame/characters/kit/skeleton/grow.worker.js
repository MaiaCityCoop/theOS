// The skeleton's bones grown off the page's own thread (intent 0033): asked for one bone at a fineness, it answers with
// that bone's surface (./mesh.js), its numbers handed over, not copied. Asked what there is, it answers with the bones'
// count, the order to grow them in (the heaviest first) and a digest of their fields and of how they are drawn out:
// other bones or other rules, another digest (the page keeps a grown surface under it).
import { skeletonBones } from '../skeleton.js';
import { prepare, unionOf, meshOfBone, DRAWN } from './mesh.js';

let bones = null, union = null;
const ready = () => { if (!bones) { bones = prepare(skeletonBones()); union = unionOf(bones); } return bones; };
self.onmessage = ({ data }) => {
  const B = ready();
  if (data.about) {
    let h = 2166136261, n = 0;
    for (const b of B) { const u = new Uint8Array(b.F.P.buffer, b.F.P.byteOffset, b.F.P.byteLength); n += u.length; for (let i = 0; i < u.length; i += 1) { h ^= u[i]; h = Math.imul(h, 16777619); } }
    return self.postMessage({ about: { n: B.length, order: B.map((_, i) => i).sort((a, b) => B[b].ops.length - B[a].ops.length), digest: (h >>> 0).toString(36) + '-' + n.toString(36) + '-' + DRAWN } });
  }
  const m = meshOfBone(B, data.i, { h: data.h, shade: data.shade, union });
  if (!m) return self.postMessage({ i: data.i, none: true });
  self.postMessage({ i: data.i, rig: m.rig, pos: m.pos, nor: m.nor, tri: m.tri, open: m.open, part: m.part }, [m.pos.buffer, m.nor.buffer, m.tri.buffer, m.open.buffer, m.part.buffer]);
};
