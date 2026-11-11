// The camera's frustum as six planes, set once a frame; and the one question asked of it.
const PL = new Float64Array(24);         // the frustum's six planes

export function setPlanes(m) {
  const e = m.elements;
  for (let i = 0; i < 3; i++) for (let s = 0; s < 2; s++) {
    const o = (i * 2 + s) * 4, k = s ? -1 : 1;
    PL[o] = e[3] + k * e[i]; PL[o + 1] = e[7] + k * e[4 + i]; PL[o + 2] = e[11] + k * e[8 + i]; PL[o + 3] = e[15] + k * e[12 + i];
  }
}
export function boxIn(x0, x1, y0, y1, z0, z1) {
  for (let o = 0; o < 24; o += 4) {
    const a = PL[o], b = PL[o + 1], c = PL[o + 2];
    if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + PL[o + 3] < 0) return false;
  }
  return true;
}
