// A shading model (src/shading/index.js): its colour turns with the angle.
import { vec3, pow, mix, cos } from 'three/tsl';

export default { id: 'iridescent', order: 7, lit: (c) => mix(c.colour, cos(vec3(0, 0.33, 0.67).add(c.nv.mul(1.5)).mul(6.2831853)).mul(0.25).add(0.25), 0.5).mul(c.sky.add(c.sun.mul(c.ndl))).add(c.sun.mul(pow(c.ndh, 60)).mul(0.4)) };
