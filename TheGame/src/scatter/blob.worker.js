// Builds test assets' meshes and textures off the main thread (assets/kit/blob.js), as a file's decoder would: asked for
// kinds' levels (each [kind, n, the next coarser n]) or their own textures (each ['skin', kind, pixels a side]), answers
// with their packed arrays, handed over without a copy.
import { blobMesh, blobSkin } from '../../assets/kit/blob.js';

onmessage = ({ data: { id, jobs } }) => {
  const out = jobs.map((j) => (j[0] === 'skin' ? blobSkin(j[1], j[2]) : blobMesh(j[0], j[1], j[2])));
  postMessage({ id, out }, out.flatMap((m) => (m.levels ? m.levels.map((l) => l.buffer) : [m.index.buffer, m.verts.buffer])));
};
