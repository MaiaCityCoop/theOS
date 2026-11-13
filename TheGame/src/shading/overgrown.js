// A shading model (src/shading/index.js): green on what faces up.
import { vec3, mix, smoothstep } from 'three/tsl';

export default { id: 'overgrown', order: 11, lit: (c) => { const top = smoothstep(0.45, 0.8, c.normal.y).mul(c.bare); return mix(c.colour, c.colour.mul(vec3(0.5, 1.1, 0.3)).add(vec3(0.004, 0.02, 0.002)), top).mul(c.sky.add(c.sun.mul(c.ndl))); } };
