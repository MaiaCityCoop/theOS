// The eye's view, for the scatter: what stands outside it is dropped one by one, before its vertices are worked out. A
// tier draws the patches that touch the view, but a patch is tens to hundreds of metres wide: about half of what stands
// in those patches is outside it. An engine's `live` asks inView(pos, …); its tier then keys its packing on the view
// too (tier.viewKeyed), so it is made again when the camera has turned. The view is widened by MARGIN, and the packing
// made again when the camera has turned by about a third of that (TURN, of its quaternion): nothing pops in at the edge.
import { vec4, abs, length } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { pxKAt } from '../detail/measure.js';

const MARGIN = (5 * Math.PI) / 180, TURN = 0.015;

/** The most of a band of distances round the eye, [near, far] metres (the 68° lens's, the measure's), its view takes in
    at once, as a tier's region tree tests it (widened by MARGIN either way), at the window's aspect: m² of the ground,
    the most over every way the eye can look at it (level, down, straight down) from every height it can be seen from (the
    ground to as high as `far`). What a tier that packs the band's cells holds at most is this over a cell's area. */
export function viewArea(near, far, aspect = (globalThis.innerWidth || 1920) / (globalThis.innerHeight || 1080)) {
  if (!(far > near)) return 0;
  const t = 1 / (2 * pxKAt(1)), ty = Math.tan(Math.atan(t) + MARGIN), tx = Math.tan(Math.min(1.5, Math.atan(aspect * t) + MARGIN));
  const NR = 32, NA = 64, rings = [];   // (the band's ground, as cells of a polar grid round the foot of the eye)
  let most = 0;
  for (let ih = 0; ih <= 8; ih++) {
    const H = (far * ih) / 8, r0 = Math.sqrt(Math.max(0, near * near - H * H)), r1 = Math.sqrt(Math.max(0, far * far - H * H));
    if (r1 <= r0) continue;
    rings.length = 0;
    for (let i = 0; i < NR; i++) { const a = r0 + ((r1 - r0) * (i + 0.5)) / NR; rings.push([a, (a * (r1 - r0) * 2 * Math.PI) / (NR * NA)]); }
    for (let ip = 0; ip <= 18; ip++) {
      const th = (ip * Math.PI) / 36, s = Math.sin(th), c = Math.cos(th);   // (looking down by th: level to straight down)
      let area = 0;
      for (const [r, dA] of rings) for (let j = 0; j < NA; j++) {
        const phi = ((j + 0.5) * 2 * Math.PI) / NA, u = r * Math.sin(phi), v = r * Math.cos(phi);
        const z = H * s + v * c, y = v * s - H * c;   // (the point in the eye's frame: ahead, up; across is u)
        if (z > 0 && Math.abs(u) <= tx * z && Math.abs(y) <= ty * z) area += dA;
      }
      most = Math.max(most, area);
    }
  }
  return most;
}

let FRUSTUM = null;
/** The camera's view written to the shared uniforms (uView, uViewK); returns what of it a packing depends on (a key). */
export function setView(camera) {
  const e = camera.projectionMatrix.elements, M = camera.matrixWorldInverse.elements, q = camera.quaternion, r = (x) => Math.round(x / TURN);
  const k = 1 / Math.tan(Math.min(1.5, Math.atan(1 / e[0]) + MARGIN));   // the widened view's half angle across, as a cotangent
  U.uView.value.copy(camera.matrixWorldInverse); U.uViewK.value.set(k, Math.abs(M[6]) + Math.abs(M[4]), Math.hypot(k, 1));   // (then how far the view is tilted off level, and the side plane's length)
  // (and the same view as a frustum widened by MARGIN each way, for what is tested a box at a time on the CPU: the region
  // tree, src/scatter/regions.js)
  FRUSTUM = { M: Float64Array.from(M), tx: 1 / k, ty: Math.tan(Math.min(1.5, Math.atan(1 / e[5]) + MARGIN)) };
  return `${r(q.x)},${r(q.y)},${r(q.z)},${r(q.w)},${e[0].toFixed(2)}`;
}

/** The eye's view as setView last left it, widened by its margin: a box (world, x0 … z1) is 0 wholly outside it, 2 wholly
    inside, 1 across its edge (each of its eight corners against its four sides; behind the eye is outside). Null before
    the first view. */
export function viewBox() {
  const F = FRUSTUM; if (!F) return null;
  const { M, tx, ty } = F;
  return (x0, x1, y0, y1, z0, z1) => {
    let inAll = true; const out = [0, 0, 0, 0];
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? x1 : x0, y = c & 2 ? y1 : y0, z = c & 4 ? z1 : z0;
      const vx = M[0] * x + M[4] * y + M[8] * z + M[12], vy = M[1] * x + M[5] * y + M[9] * z + M[13], vz = M[2] * x + M[6] * y + M[10] * z + M[14];
      const s = [vx + tx * vz, -vx + tx * vz, vy + ty * vz, -vy + ty * vz];   // (inside where all four are at most nought: in front, within the widened half angles)
      for (let j = 0; j < 4; j++) if (s[j] > 0) { out[j]++; inAll = false; }
    }
    return out.some((n) => n === 8) ? 0 : inAll ? 2 : 1;
  };
}

/** True where a thing standing at pos (x, z), r metres round and up to `high` tall, can be in the eye's view (to the sides:
    the land's rise and its own height are allowed for above and below, more the more the view is tilted). */
export const inView = (pos, r, high = 0) => {
  const v = U.uView.mul(vec4(pos.x, U.uCam.y.sub(U.uAirH), pos.y, 1)), far = length(pos.sub(U.uCam.xz));
  return abs(v.x).mul(U.uViewK.x).add(v.z).lessThan(far.mul(0.32).add(6 + high).mul(U.uViewK.y).add(r).mul(U.uViewK.z));
};
