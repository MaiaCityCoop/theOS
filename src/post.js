// Depth of field, for the virtual camera: the picture is drawn into a target with its depth, then
// every pixel is blurred by how far it lies from the plane of focus, as a lens of that focal
// length and aperture would. Anamorphic: the blur is an upright oval, twice as tall as wide.
import * as THREE from 'three';

const TAPS = 28;
const FRAG = /* glsl */ `
uniform sampler2D tC, tD;
uniform vec2 uTexel;
uniform float uNear, uFar, uFocus, uK, uF, uMaxR;
in vec2 vUv;
float distAt(vec2 uv){ float z = texture(tD, uv).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
// the blur's radius in pixels (upright) for a thing d metres away: the thin lens's circle of confusion
float coc(float d){ return min(uK * abs(d - uFocus) / (d * max(uFocus - uF, 1e-3)), uMaxR); }
void main(){
  float d0 = distAt(vUv), c0 = coc(d0);
  vec3 sum = texture(tC, vUv).rgb; float w = 1.0;
  if (c0 > 0.5) {
    for (int i = 0; i < ${TAPS}; i++) {
      float r = sqrt((float(i) + 0.5) / ${TAPS}.0), a = float(i) * 2.39996323;
      vec2 uv = vUv + vec2(cos(a) * 0.5, sin(a)) * r * c0 * uTexel;
      float dt = distAt(uv);
      // what lies behind may spread here freely; what lies in front only as far as its own blur reaches
      float k = dt >= d0 * 0.97 ? 1.0 : step(r * c0, coc(dt) + 0.5);
      sum += texture(tC, uv).rgb * k; w += k;
    }
  }
  gl_FragColor = vec4(sum / w, 1.0);
}`;

export function createPost(renderer, skyHex) {
  let rt = null;
  // the sky's colour as plain numbers: into a target, three writes a clear colour unconverted
  const sky = new THREE.Color().setRGB(((skyHex >> 16) & 255) / 255, ((skyHex >> 8) & 255) / 255, (skyHex & 255) / 255, THREE.LinearSRGBColorSpace), keep = new THREE.Color();
  const size = new THREE.Vector2();
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: FRAG,
    uniforms: { tC: { value: null }, tD: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.15 }, uFar: { value: 30000 }, uFocus: { value: 10 }, uK: { value: 0 }, uF: { value: 0.05 }, uMaxR: { value: 24 } },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad.frustumCulled = false;
  return {
    /** dof: { focus (m), mm, N, aspect (the picture's shape) } */
    render(scene, camera, dof) {
      renderer.getDrawingBufferSize(size);
      if (!rt || rt.width !== size.x || rt.height !== size.y) {
        rt?.dispose();
        rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
        mat.uniforms.tC.value = rt.texture; mat.uniforms.tD.value = rt.depthTexture;
      }
      renderer.getClearColor(keep); renderer.setClearColor(sky);
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
      renderer.setClearColor(keep);
      const u = mat.uniforms, f = dof.mm / 1000, wa = size.x / size.y, picH = dof.aspect > wa ? size.x / dof.aspect : size.y;
      u.uTexel.value.set(1 / size.x, 1 / size.y); u.uNear.value = camera.near; u.uFar.value = camera.far;
      u.uFocus.value = Math.max(dof.focus, f * 2); u.uF.value = f;
      u.uK.value = ((f * f) / dof.N / 0.01782) * picH * 0.5;   // 17.82 mm: the gate's height
      u.uMaxR.value = picH * 0.03;
      renderer.render(quad, cam);
    },
  };
}
