// The city's plan made off the frame's thread (./plan.js takes about half a second), handed back once.
import { plan } from './plan.js';

const city = plan();
postMessage(city, city.plots.map((p) => p.outline.buffer));
