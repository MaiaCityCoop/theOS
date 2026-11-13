// A shading model (src/shading/index.js): glowing in its second colour where its texture stands high, slowly beating.
import { sin, smoothstep } from 'three/tsl';

export default { id: 'glowing', order: 4, lit: (c) => c.plain.add(c.second.mul(c.glow).mul(smoothstep(0.55, 0.8, c.height)).mul(sin(c.time.mul(2).add(c.phase)).mul(0.2).add(0.4))) };
