// The lakes round a place, found off the page's thread (src/world/land.js: findLakes): a look over 16 km square, a cell
// every 40 m, some 30 ms; asked again when the camera has gone two kilometres (src/world/lakes.js).
import { findLakes } from './land.js';
self.onmessage = ({ data: { id, x, z } }) => self.postMessage({ id, lakes: findLakes(x, z) });
