// The skeleton's bones grown off the page's own thread (intent 0036): asked for one bone at a fineness, it answers with
// that bone's surface (./mesh.js), its numbers handed over, not copied. Asked what there is, it answers with the bones'
// count, the order to grow them in (the heaviest first) and a digest of their fields and of how they are drawn out:
// other bones or other rules, another digest (the page keeps a grown surface under it). Asked for the muscles, it lays
// them on the bones (../muscles/build.js) and answers with their surface and the strands the rig moves; their digest
// (the bones', the muscles' table and how they are drawn out) comes with the bones' own.
import { skeletonBones } from '../skeleton.js';
import { prepare, unionOf, meshOfBone, DRAWN } from './mesh.js';
import { MUSCLES } from '../muscles/table.js';
import { LANDMARKS } from '../muscles/landmarks.js';
import { musclesOf, MADE } from '../muscles/build.js';

let bones = null, union = null;
const ready = () => { if (!bones) { bones = prepare(skeletonBones()); union = unionOf(bones); } return bones; };
self.onmessage = ({ data }) => {
  const B = ready();
  if (data.about) {
    let h = 2166136261, n = 0;
    for (const b of B) { const u = new Uint8Array(b.F.P.buffer, b.F.P.byteOffset, b.F.P.byteLength); n += u.length; for (let i = 0; i < u.length; i += 1) { h ^= u[i]; h = Math.imul(h, 16777619); } }
    const digest = (h >>> 0).toString(36) + '-' + n.toString(36) + '-' + DRAWN;
    let g = 2166136261; for (const c of JSON.stringify([MUSCLES, LANDMARKS])) { g ^= c.charCodeAt(0); g = Math.imul(g, 16777619); }
    return self.postMessage({ about: { n: B.length, order: B.map((_, i) => i).sort((a, b) => B[b].ops.length - B[a].ops.length), digest, muscles: digest + '-' + (g >>> 0).toString(36) + '-' + MADE } });
  }
  if (data.muscles) {
    const M = musclesOf(B), a = M.attr;
    return self.postMessage({ muscles: M }, [M.pos.buffer, a.place.buffer, a.pair.buffer, a.sec.buffer, a.nor.buffer, a.look.buffer, M.fine.buffer, M.coarse.buffer]);
  }
  const m = meshOfBone(B, data.i, { h: data.h, shade: data.shade, union });
  if (!m) return self.postMessage({ i: data.i, none: true });
  self.postMessage({ i: data.i, rig: m.rig, pos: m.pos, nor: m.nor, tri: m.tri, open: m.open, part: m.part }, [m.pos.buffer, m.nor.buffer, m.tri.buffer, m.open.buffer, m.part.buffer]);
};
