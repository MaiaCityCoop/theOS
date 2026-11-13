// A shading model (src/shading/index.js): the light round its edge and through it.
import { pow, max } from 'three/tsl';

export default { id: 'leafy', order: 3, lit: (c) => c.colour.mul(c.sky.add(c.sun.mul(max(c.normal.dot(c.toSun).add(0.5).div(1.5), 0).add(pow(c.back, 3).mul(c.through))))) };
