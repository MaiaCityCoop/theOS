// A shading model (src/shading/index.js): flat and soft.
import { pow } from 'three/tsl';

export default { id: 'chalk', order: 8, lit: (c) => c.colour.mul(c.sky.mul(1.1).add(c.sun.mul(pow(c.ndl, 0.6)).mul(0.9))) };
