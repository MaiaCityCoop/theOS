// A shading model (src/shading/index.js): its highlight a band round it.
import { float, vec3, pow, max, sqrt, cross, normalize } from 'three/tsl';

export default { id: 'brushed', order: 9, lit: (c) => { const th = normalize(cross(c.normal, vec3(0, 1, 0)).add(1e-4)).dot(c.half); return c.plain.add(c.sun.mul(pow(sqrt(max(float(1).sub(th.mul(th)), 0)), 80)).mul(c.gloss).mul(0.6)); } };
