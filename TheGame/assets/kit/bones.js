// A skeleton's bones moved, in plain JS: the same reckoning as the vertex stage's (src/scatter/stress.js: boned), for
// what the CPU must know of a thing that moves on its skeleton: where its colliders are (src/world/bodies.js).
//
//   rows   a kind's bones, twelve numbers each: [pivot x, y, z, parent], [axis x, y, z, type], [amp, rate, phase, base]
//          (assets/kit/creature.js says what a bone is: 0 still, 1 swings, 2 shifts, 3 turns)
//   g      the mover's stride, radians
/** Point p (in the thing's own frame) as bone `bone` has moved it, and then the bone it hangs on. */
export function moved(rows, bone, g, p, out = [0, 0, 0]) {
  let x = p[0], y = p[1], z = p[2];
  for (let hop = 0, b = bone; hop < 2; hop++) {
    const o = b * 12, type = rows[o + 7], kx = rows[o + 4], ky = rows[o + 5], kz = rows[o + 6], s = Math.sin(g * rows[o + 9] + rows[o + 10]);
    const ang = type === 1 ? rows[o + 11] + rows[o + 8] * s : type === 3 ? g * rows[o + 9] : 0, c = Math.cos(ang), sn = Math.sin(ang), sh = type === 2 ? rows[o + 8] * s : 0;
    const qx = x - rows[o], qy = y - rows[o + 1], qz = z - rows[o + 2], d = (kx * qx + ky * qy + kz * qz) * (1 - c);
    x = rows[o] + qx * c + (ky * qz - kz * qy) * sn + kx * (d + sh); y = rows[o + 1] + qy * c + (kz * qx - kx * qz) * sn + ky * (d + sh); z = rows[o + 2] + qz * c + (kx * qy - ky * qx) * sn + kz * (d + sh);
    b = rows[o + 3];
  }
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
