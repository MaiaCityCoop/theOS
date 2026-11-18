// The skeleton's bones grown off the page's own thread (intent 0036): asked for one bone at a fineness, it answers with
// that bone's surface (./mesh.js), its numbers handed over, not copied. Asked what there is, it answers with the bones'
// count and the order to grow them in (the heaviest first). Asked for the muscles, it lays them on the bones
// (../muscles/build.js) and answers with their surface and the strands the rig moves. (What the page keeps of all
// this is kept under the registry's version of what grows it: ../bones.js.)
import { skeletonBones } from '../skeleton.js';
import { prepare, unionOf, meshOfBone } from './mesh.js';
import { musclesOf } from '../muscles/build.js';
import { skinOf } from '../skin/build.js';

let bones = null, union = null;
const ready = () => { if (!bones) { bones = prepare(skeletonBones()); union = unionOf(bones); } return bones; };
self.onmessage = ({ data }) => {
  const B = ready();
  if (data.about) return self.postMessage({ about: { n: B.length, order: B.map((_, i) => i).sort((a, b) => B[b].ops.length - B[a].ops.length) } });
  const bufs = (S) => [S.pos.buffer, ...Object.values(S.attr).map((a) => a.buffer), S.fine.buffer, S.coarse.buffer, ...(S.far ? [S.far.buffer] : [])];
  if (data.muscles) {
    const M = musclesOf(B); delete M.inner;
    return self.postMessage({ muscles: M }, bufs(M));
  }
  // a body: the muscles, and the fat and the skin over them (one surface, its points hung on the muscles' strands and
  // on the bones); its rows the muscles' and the skin's together
  if (data.body) {
    const M = musclesOf(B), S = skinOf(B, M, { h: data.h });
    const body = { rows: [...M.rows, ...S.rows], muscleList: M.muscles, muscles: { pos: M.pos, attr: M.attr, fine: M.fine, coarse: M.coarse }, skin: { pos: S.pos, attr: S.attr, fine: S.fine, coarse: S.coarse, far: S.far, off: S.off, rest: S.rest }, soles: S.soles, skinThick: S.skin, counts: { ...M.counts, skin: S.counts } };
    return self.postMessage({ body }, [...bufs(body.muscles), ...bufs(body.skin), S.rest.buffer]);
  }
  const m = meshOfBone(B, data.i, { h: data.h, shade: data.shade, union });
  if (!m) return self.postMessage({ i: data.i, none: true });
  self.postMessage({ i: data.i, rig: m.rig, pos: m.pos, nor: m.nor, tri: m.tri, open: m.open, part: m.part }, [m.pos.buffer, m.nor.buffer, m.tri.buffer, m.open.buffer, m.part.buffer]);
};
