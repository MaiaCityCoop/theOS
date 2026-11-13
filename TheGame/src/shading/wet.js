// A shading model (src/shading/index.js): darker, a hard highlight, the sky at its edge.
import { float, pow } from 'three/tsl';

export default { id: 'wet', order: 5, lit: (c) => c.colour.mul(0.6).mul(c.sky.add(c.sun.mul(c.ndl))).add(c.sun.mul(pow(c.ndh, 200)).mul(1.2)).add(c.sky.mul(pow(float(1).sub(c.nv), 5)).mul(0.6)) };
