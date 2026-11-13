// A shading model (src/shading/index.js): bright at its edge.
import { float, pow } from 'three/tsl';

export default { id: 'velvet', order: 6, lit: (c) => c.plain.add(c.second.mul(pow(float(1).sub(c.nv), 3)).mul(c.sky.add(c.sun.mul(0.5))).mul(0.6)) };
