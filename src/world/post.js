// Cinematic finish for the High preset. The scene and the first-person view
// are drawn into a high dynamic range buffer; bright light (the sun, glints
// on the water, sunlit snow, lit windows and lamps at night) blooms softly,
// sun rays stream through gaps in the trees and ridges when the sun is in
// view, and a gentle colour grade and vignette finish the picture.
//
// Bloom is a chain of half-size steps down to 1/32 of the screen and back
// up, blurred on the way (the "dual filter" method), so it costs a handful
// of small passes. The sun rays are a radial blur of the bright sky towards
// the sun at a quarter of the screen size.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Bright parts of the image, filtered down to half size.
const BRIGHT = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 tap(vec2 o) { return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(40.0)); }
void main() {
  vec3 c = (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float k = max(soft, b - uThreshold) / max(b, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}`;

// Dual filter downsample: centre plus four diagonal taps.
const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

// Dual filter upsample of the smaller level, added to this level.
const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;
void main() {
  vec2 h = uTexel * uSpread;
  vec3 c = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}`;

// Sun rays: march from each pixel towards the sun through the bright image,
// letting the light fade with distance along the way.
const RAYS = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 d = (uSun - vUv);
  float len = length(d * vec2(uAspect, 1.0));
  d *= 0.9 / 28.0;
  vec2 p = vUv;
  vec3 sum = vec3(0.0);
  float w = 1.0;
  float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
  p += d * jitter;
  for (int i = 0; i < 28; i++) {
    vec3 s = texture2D(tSrc, p).rgb;
    sum += s * w;
    w *= 0.955;
    p += d;
  }
  // stronger near the sun, fading towards the edges of the view
  float fall = 1.0 - smoothstep(0.1, 1.1, len);
  gl_FragColor = vec4(sum / 16.0 * fall, 1.0);
}`;

// Final picture: scene, bloom and rays, tone mapping, colour grade.
const COMPOSITE = /* glsl */ `
#include <common>
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uBloom;
uniform vec3 uRays;
uniform float uGrade;
uniform float uVignette;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c += texture2D(tRays, vUv).rgb * uRays;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  vec3 g = gl_FragColor.rgb;
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  // a touch more colour, cool shadows and warm highlights
  vec3 graded = mix(vec3(l), g, 1.1);
  graded *= mix(vec3(0.965, 0.99, 1.045), vec3(1.035, 1.0, 0.955), smoothstep(0.04, 0.55, l));
  // gentle S-curve for depth
  graded = mix(graded, graded * graded * (3.0 - 2.0 * graded), 0.18);
  g = mix(g, clamp(graded, 0.0, 1.0), uGrade);
  // soft vignette
  vec2 v = (vUv - 0.5) * vec2(1.0, 0.82);
  g *= 1.0 - uVignette * smoothstep(0.25, 0.75, length(v));
  gl_FragColor.rgb = g;
  #include <colorspace_fragment>
  // fine noise against banding in the sky
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`;

const LEVELS = 5; // 1/2 .. 1/32

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const ext = renderer.extensions;
    this.hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.type = type;
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type, samples: 4, depthBuffer: true });
    this.scene.texture.name = 'post-scene';
    const small = { type, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.down = [];
    this.up = [];
    for (let i = 0; i < LEVELS; i++) {
      this.down.push(new THREE.WebGLRenderTarget(1, 1, small));
      this.up.push(new THREE.WebGLRenderTarget(1, 1, small));
    }
    this.rays = new THREE.WebGLRenderTarget(1, 1, small);

    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const mat = (fragmentShader, uniforms, extra = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
    this.bright = mat(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: this.hdr ? 1.0 : 0.82 }, uKnee: { value: 0.5 } });
    this.downMat = mat(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mat(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 } });
    this.raysMat = mat(RAYS, { tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } });
    this.composite = mat(
      COMPOSITE,
      {
        tScene: { value: this.scene.texture },
        tBloom: { value: null },
        tRays: { value: this.rays.texture },
        uBloom: { value: 0.32 },
        uRays: { value: new THREE.Vector3() },
        uGrade: { value: 1 },
        uVignette: { value: 0.22 },
      },
      { toneMapped: true }
    );
    this.quad = new THREE.Mesh(tri, this.bright);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();
    this.size = new THREE.Vector2(1, 1);
    this.enabled = false;
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._size = new THREE.Vector2();
  }

  setSize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.size.x && h === this.size.y) return;
    this.size.set(w, h);
    this.scene.setSize(w, h);
    let lw = w;
    let lh = h;
    for (let i = 0; i < LEVELS; i++) {
      lw = Math.max(1, Math.round(lw / 2));
      lh = Math.max(1, Math.round(lh / 2));
      this.down[i].setSize(lw, lh);
      this.up[i].setSize(lw, lh);
    }
    this.rays.setSize(this.down[1].width, this.down[1].height);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // Draws the frame: `drawScene` renders the world and the first-person
  // view into the current target. `sun` is the direction to the sun, `sunK`
  // how strong its rays should be.
  render(drawScene, camera, sunDir, sunColor, sunK) {
    const r = this.renderer;
    r.getDrawingBufferSize(this._size);
    this.setSize(this._size.x, this._size.y);
    r.setRenderTarget(this.scene);
    r.clear();
    drawScene();

    // bright pass and the chain down
    let src = this.scene.texture;
    let sw = this.size.x;
    let sh = this.size.y;
    this.bright.uniforms.tSrc.value = src;
    this.bright.uniforms.uTexel.value.set(0.5 / sw, 0.5 / sh);
    this.pass(this.bright, this.down[0]);
    for (let i = 1; i < LEVELS; i++) {
      const s = this.down[i - 1];
      this.downMat.uniforms.tSrc.value = s.texture;
      this.downMat.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.pass(this.downMat, this.down[i]);
    }
    // and back up, adding each level
    let low = this.down[LEVELS - 1];
    for (let i = LEVELS - 2; i >= 0; i--) {
      this.upMat.uniforms.tSrc.value = low.texture;
      this.upMat.uniforms.tAdd.value = this.down[i].texture;
      this.upMat.uniforms.uTexel.value.set(0.5 / low.width, 0.5 / low.height);
      this.pass(this.upMat, this.up[i]);
      low = this.up[i];
    }

    // sun rays when the sun is in front of the camera
    camera.getWorldDirection(this._f);
    const facing = this._f.dot(sunDir);
    let rays = 0;
    if (sunK > 0.001 && facing > 0.05) {
      this._v.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
      const sx = this._v.x * 0.5 + 0.5;
      const sy = this._v.y * 0.5 + 0.5;
      // fade as the sun leaves the view
      const edge = Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5));
      rays = sunK * THREE.MathUtils.smoothstep(facing, 0.05, 0.5) * (1 - THREE.MathUtils.smoothstep(edge, 0.55, 1.1));
      if (rays > 0.001) {
        this.raysMat.uniforms.tSrc.value = this.down[1].texture;
        this.raysMat.uniforms.uSun.value.set(sx, sy);
        this.raysMat.uniforms.uAspect.value = this.size.x / this.size.y;
        this.pass(this.raysMat, this.rays);
      }
    }
    const cu = this.composite.uniforms;
    cu.tBloom.value = this.up[0].texture;
    cu.uRays.value.set(sunColor.r, sunColor.g, sunColor.b).multiplyScalar(rays);
    this.pass(this.composite, null);
  }

  dispose() {
    this.scene.dispose();
    for (const t of [...this.down, ...this.up, this.rays]) t.dispose();
    for (const m of [this.bright, this.downMat, this.upMat, this.raysMat, this.composite]) m.dispose();
  }
}
