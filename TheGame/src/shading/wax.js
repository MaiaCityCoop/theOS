// A shading model (src/shading/index.js): the light deep in it.
import { max } from 'three/tsl';

export default { id: 'wax', order: 10, lit: (c) => c.colour.mul(c.sky.add(c.sun.mul(max(c.normal.dot(c.toSun).add(0.7).div(1.7), 0)))).add(c.tint.mul(c.sun).mul(c.back.mul(c.back)).mul(c.through).mul(0.25)) };
