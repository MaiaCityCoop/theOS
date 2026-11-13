// A shading model (src/shading/index.js): a highlight.
import { pow } from 'three/tsl';

export default { id: 'glossy', order: 1, lit: (c) => c.plain.add(c.sun.mul(pow(c.ndh, 40)).mul(c.gloss).mul(0.5)) };
