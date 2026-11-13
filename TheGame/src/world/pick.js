// The point of the ground under a point of the screen (intent 0015): one way of finding it, for every click on the
// world (the city's plots, a mover to follow). Marched along the ray from the camera, coarse far off, then halved
// down to where it meets the land. [x, z], or null when the ray meets no land within 40 km.
import * as THREE from 'three/webgpu';
import { heightAt } from './land.js';

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function groundAt(camera, canvas, cx, cy) {
  const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction;
  let t0 = 0, t = 0;
  for (let i = 0; i < 400 && t < 40000; i++) { t0 = t; t += Math.max(15, t * 0.02); if (o.y + d.y * t < heightAt(o.x + d.x * t, o.z + d.z * t)) break; }
  if (t >= 40000) return null;
  for (let i = 0; i < 12; i++) { const m = (t0 + t) / 2; if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m)) t = m; else t0 = m; }
  return [o.x + d.x * t, o.z + d.z * t];
}
