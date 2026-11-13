// Builds test assets' meshes off the main thread (assets/kit/blob.js), as a file's decoder would: asked for kinds'
// levels, answers with their packed arrays, handed over without a copy.
import { blobMesh } from '../../assets/kit/blob.js';

onmessage = ({ data: { id, jobs } }) => {
  const out = jobs.map(([k, n]) => blobMesh(k, n));
  postMessage({ id, out }, out.flatMap((m) => [m.index.buffer, m.verts.buffer]));
};
