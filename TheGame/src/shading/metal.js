// A shading model (src/shading/index.js): the sky in it, its highlight its own colour.
import { pow, reflect } from 'three/tsl';

export default { id: 'metal', order: 2, lit: (c) => c.colour.mul(0.3).mul(c.sky.add(c.sun.mul(c.ndl))).add(c.skyLight(reflect(c.eye.negate(), c.normal)).mul(c.tint).mul(0.35)).add(c.sun.mul(c.tint).mul(pow(c.ndh, 120)).mul(c.gloss)) };
