// Game core: renderer, world construction and the frame loop. Gameplay systems
// attach themselves here (see main.js for wiring).
import * as THREE from 'three';
import { generateWorld } from './world/worldgen.js';
import { Terrain, makeTerrainMaterial, buildFarTerrain, buildReflectionTerrain } from './world/terrain.js';
import { Environment } from './world/sky.js';
import { WaterSystem, REFLECT_LAYER } from './world/water.js';
import { FX, installWorldFx, reflectionMaterial } from './world/worldfx.js';
import { TerrainLighting } from './world/lighting.js';
import { Scatter } from './world/scatter.js';
import { GrassField } from './world/grass.js';
import { Colliders } from './world/colliders.js';
import { makeWorldTextures } from './world/worldtex.js';
import { Props } from './world/props.js';
import { prepareFinishes } from './world/finish.js';
import { buildRoads } from './world/roads.js';
import { Scenery } from './world/scenery.js';
import { Floaters } from './world/floaters.js';
import { PostFX } from './world/post.js';
import { makeDetailTexture, makeCloudTexture, makeWaterNormalTexture, makeCausticTexture, makeTerrainDetailTexture } from './util/textures.js';

export const IS_TOUCH =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0));

// High is the default: the game targets iPhone 13 and newer. Medium and Low
// remain for older devices and as steps down when a device runs hot.
export const QUALITY = {
  low: { dpr: 1.0, shadow: 0, shadowDist: 0, grass: 0.45, scatter: 0.6, lod: 0.7, reflect: 0, farShadows: false, fish: 0.5, post: false },
  medium: { dpr: 1.5, shadow: 1024, shadowDist: 190, grass: 0.75, scatter: 0.85, lod: 0.9, reflect: 128, farShadows: false, fish: 0.8, post: false },
  high: { dpr: 2.0, shadow: 2048, shadowDist: 260, grass: 1.0, scatter: 1.0, lod: 1.0, reflect: 256, farShadows: true, fish: 1.0, post: true },
};

const _c = new THREE.Color();
const _v3 = new THREE.Vector3();
// cloud shadows: wind speed (m/s) and the size of one repeat of the cloud
// texture on the ground (m, as in fxCloudShadow in worldfx.js); valley mist
// density at sea level (per m)
const CLOUD_SPEED = 9;
const CLOUD_SCALE = 1800;
const MIST_DENSITY = 0.0032;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export class Game {
  constructor(container) {
    this.container = container;
    this.systems = [];
    this.timer = new THREE.Timer();
    this.time = 0;
    this.paused = false;
    this.qualityName = 'high';
  }

  async init(progress = () => {}) {
    installWorldFx();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
    this.renderer = renderer;
    // bloom, sun rays and the colour grade (High preset)
    this.post = new PostFX(renderer);
    this.container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Hotrod Outdoor Alaska Fishing game view');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.35, 9000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // the buildings' surface patterns, drawn by a worker while the world is
    // generated (see world/finish.js)
    prepareFinishes();
    // world data
    this.world = await generateWorld(
      1337,
      (f, label) => progress(f * 0.7, label),
      () => nextFrame()
    );
    progress(0.72, 'Growing the forests');
    await nextFrame();

    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.textures = {
      detail: makeDetailTexture(aniso),
      cloud: makeCloudTexture(),
      waterNormal: makeWaterNormalTexture(),
      terrainDetail: makeTerrainDetailTexture(aniso),
    };
    this.wtex = makeWorldTextures(this.world);
    this.colliders = new Colliders();
    this.sharedUniforms = { uTime: { value: 0 } };

    this.env = new Environment(this.scene, this.textures.cloud);
    // world shading inputs shared by every material (see worldfx.js)
    const wt = this.wtex;
    FX.uFxWater.value = wt.water;
    FX.uFxWaterMax.value = wt.waterMax;
    FX.uFxWorld.value.set(wt.worldMin.x, wt.worldMin.y, wt.uvScale, wt.uvOffset);
    FX.uFxMask.value = wt.mask;
    FX.uFxCaustics.value = makeCausticTexture();
    FX.uFxSunDir.value = this.env.sunDir;
    FX.uFxHorizon.value = this.env.uniforms.uHorizon.value;
    FX.uFxGlow.value = this.env.uniforms.uGlow.value;
    FX.uFxCloudTex.value = this.textures.cloud;
    this.fx = FX; // for tests and tuning
    // The reflection probe draws its own copies of the sky and the terrain
    // (same shaders and uniforms, separate material instances; see
    // reflectionMaterial), so no material switches shaders every frame. The
    // lights join the probe's layer once the scene is complete (main.js).
    const skyReflect = new THREE.Mesh(this.env.sky.geometry, reflectionMaterial(this.env.sky.material));
    skyReflect.renderOrder = this.env.sky.renderOrder;
    skyReflect.frustumCulled = false;
    skyReflect.layers.set(REFLECT_LAYER);
    this.env.sky.add(skyReflect);

    this.terrainMaterial = makeTerrainMaterial(this.textures.detail, this.textures.terrainDetail, this.wtex.surface);
    const terrainReflect = reflectionMaterial(this.terrainMaterial);
    this.terrain = new Terrain(this.world, this.terrainMaterial);
    this.scene.add(this.terrain.group);
    this.farTerrain = buildFarTerrain(this.world, this.terrainMaterial);
    this.scene.add(this.farTerrain);
    // the reflection gets a coarser copy: a cube face 128 to 256 pixels
    // across cannot show the 20 m detail, and it is drawn every frame
    const farReflect = new THREE.Mesh(buildFarTerrain(this.world, terrainReflect, 40, this.farTerrain.userData.grid).geometry, terrainReflect);
    farReflect.frustumCulled = false;
    farReflect.layers.set(REFLECT_LAYER);
    this.farTerrain.add(farReflect);
    // coarse copy of the playable terrain, seen only by the reflection probe
    this.scene.add(buildReflectionTerrain(this.world, terrainReflect, REFLECT_LAYER));
    // mountain shadows and sky occlusion maps
    this.lighting = new TerrainLighting(renderer, this.world, this.wtex, this.farTerrain.userData.grid, IS_TOUCH ? 768 : 1024);
    this.lastLight = new THREE.Vector3(0, -1, 0);
    // the eye's adaptation (see updateExposure)
    this.exposure = 1;
    this.canopy = 0;
    this.canopyT = 0;
    this.lastEye = new THREE.Vector3(1e9, 0, 0);

    this.water = new WaterSystem(this.world, this.wtex, this.textures.waterNormal, this.env, renderer);
    this.scene.add(this.water.group);
    FX.uFxWaves.value = this.water.waves.texture;
    // volcano steam, clouds on the peaks and cascades down the cliffs
    this.scenery = new Scenery(this);
    this.scene.add(this.scenery.group);

    progress(0.8, 'Planting spruce and birch');
    await nextFrame();
    this.props = new Props(this);
    const avoid = this.props.reserveAreas();
    this.scatter = new Scatter(this.world, this.colliders, this.sharedUniforms, this.textures.terrainDetail);
    this.scatter.generate(avoid);
    this.scatter.enableReflections(REFLECT_LAYER, ['spruce', 'birch', 'blackSpruce', 'poplar', 'aspen']);
    this.scene.add(this.scatter.group);
    this.props.build();
    this.scene.add(this.props.group);
    this.roads = buildRoads(this.world);
    this.scene.add(this.roads);

    this.grass = new GrassField(this.wtex, this.env);
    this.scene.add(this.grass.group);
    // driftwood, branches, petals and leaves on the water, pond lilies, ice floes
    this.floaters = new Floaters(this);
    this.scene.add(this.floaters.group);

    progress(0.9, 'Waking the wildlife');
    await nextFrame();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 200));
    this.setQuality(this.qualityName);
    this.resize();
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name;
    this.quality = q;
    this.dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.renderer.setPixelRatio(this.dpr);
    this.env.setShadowQuality(q.shadow, q.shadowDist);
    this.scatter.setFarShadows(q.farShadows);
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.grass.setDensity(q.grass);
    this.scatter.distScale = q.scatter;
    this.terrain.lodBias = q.lod;
    this.water.setReflectionSize(q.reflect);
    this.fish?.setDensity(q.fish);
    const postWas = this.post.enabled;
    this.post.enabled = !!q.post;
    // the world's shaders differ with and without the finish: compile them
    // again now rather than one by one as things come into view
    if (postWas !== this.post.enabled) this.onPostChanged?.();
    this.resize();
    this.scatter.lastPos.set(1e9, 0, 0);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a comfortable horizontal field of view in portrait
    const hfov = 90;
    const vfovFromH = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    this.baseFov = Math.min(Math.max(62, vfovFromH), 88);
    if (this.camera.aspect > 1) this.baseFov = 64;
    this.camera.fov = this.baseFov * (this.zoom || 1);
    this.camera.updateProjectionMatrix();
    for (const s of this.systems) s.resize?.(w, h);
  }

  addSystem(s) {
    this.systems.push(s);
    return s;
  }

  start() {
    const loop = (t) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(t);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  frame() {
    let dt = this.timer.getDelta();
    this.adaptResolution(dt);
    if (dt > 0.1) dt = 0.1;
    this.dt = dt;
    this.time += dt;
    this.sharedUniforms.uTime.value = this.time;
    const t0 = performance.now();
    for (const s of this.systems) s.update?.(dt, this);
    const t1 = performance.now();
    this.updateWorld(dt);
    const t2 = performance.now();
    this.menuFrame = (this.menuFrame || 0) + 1;
    if (!this.menuOpen || this.menuFrame % 3 === 0) {
      this.render();
      // a photo grabs the frame right after it is drawn
      if (this.onRendered) {
        const f = this.onRendered;
        this.onRendered = null;
        f(this.renderer.domElement);
      }
    }
    const t3 = performance.now();
    for (const s of this.systems) s.postRender?.(dt, this);
    const st = this.perf || (this.perf = { game: 0, world: 0, render: 0 });
    st.game = st.game * 0.9 + (t1 - t0) * 0.1;
    st.world = st.world * 0.9 + (t2 - t1) * 0.1;
    st.render = st.render * 0.9 + (t3 - t2) * 0.1;
  }

  // Dynamic resolution: drop the pixel ratio when frames run long, raise it
  // again (up to the quality preset) when there is headroom.
  adaptResolution(rawDt) {
    if (!this.quality || rawDt <= 0 || rawDt > 0.5) return;
    const a = this.adapt || (this.adapt = { avg: 1 / 60, t: 0, good: 0 });
    a.avg = a.avg * 0.95 + rawDt * 0.05;
    a.t += rawDt;
    if (a.t < 2.5) return;
    a.t = 0;
    const maxDpr = Math.min(window.devicePixelRatio || 1, this.quality.dpr);
    const minDpr = Math.min(1, maxDpr);
    if (a.avg > 1 / 40 && this.dpr > minDpr + 0.01) {
      this.dpr = Math.max(minDpr, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      a.good = 0;
      a.slow = 0;
    } else if (a.avg > 1 / 40 && this.started && !this.paused && !this.menuOpen) {
      // already at the lowest resolution: step the graphics preset down after
      // a few slow checks in a row, if the player allows it
      a.slow = (a.slow || 0) + 1;
      const settings = this.state?.settings;
      const next = this.qualityName === 'high' ? 'medium' : this.qualityName === 'medium' ? 'low' : null;
      if (a.slow >= 3 && next && settings && settings.autoQuality !== false) {
        a.slow = 0;
        settings.quality = next;
        this.setQuality(next);
        this.state.saveSettings?.();
        this.onQualityDrop?.(next);
      }
    } else if (a.avg < 1 / 55 && this.dpr < maxDpr - 0.01) {
      a.good++;
      if (a.good >= 4) {
        this.dpr = Math.min(maxDpr, this.dpr + 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.resize();
        a.good = 0;
      }
    } else {
      a.good = 0;
      a.slow = 0;
    }
  }

  updateWorld(dt) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const focus = this.focus || cam.position;
    if (!this.paused) this.env.advance(dt);
    this.env.update(dt, focus);
    // mountain shadows follow the light: a band per frame, all at once
    // after a jump in time of day
    const ld = this.env.lightDir;
    if (this.lastLight.dot(ld) < 0.9994) this.lighting.refresh(ld);
    else this.lighting.update(ld, 1);
    this.lastLight.copy(ld);
    this.terrain.update(cam.position.x, cam.position.z);
    this.scatter.update(cam);
    this.props.update(dt, this.time, this.env);
    this.effects?.update(dt);
    const rain = this.env.weather.rain;
    this.updateFx();
    this.updateExposure(dt);
    this.water.update(dt, rain, cam, this.scene);
    this.scenery.update(dt);
    this.floaters.update(dt);
    this.grass.update(dt, cam.position, this.env.sun, this.env.hemi, 0.3 + rain * 0.8);
  }

  // Light-dependent inputs of the shared world shading.
  updateFx() {
    const env = this.env;
    const w = env.weather;
    FX.uFxTime.value = this.time;
    const e = env.sunElevation;
    const clear = 1 - Math.min(1, Math.max(0, (w.cloud - 0.45) / 0.45));
    FX.uFxCausticStr.value = Math.min(1, Math.max(0, e / 25)) * (0.35 + 0.65 * clear) * (1 - w.rain * 0.8);
    // cloud shadows drift with the wind; under a full overcast the sun is
    // dimmed as a whole instead, and there are none at night
    const wind = FX.uFxWind.value;
    const cl = FX.uFxClouds.value;
    const drift = (this.time * CLOUD_SPEED) / CLOUD_SCALE;
    cl.x = -((drift * wind.x) % 1);
    cl.y = -((drift * wind.y) % 1);
    cl.z = 0.66 - w.cloud * 0.42;
    cl.w = 0.8 * (1 - THREE.MathUtils.smoothstep(w.cloud, 0.62, 0.95)) * THREE.MathUtils.smoothstep(e, -2, 8);
    wind.z = 1 + w.rain * 0.45;
    // the sun disc and its rays hide while a cloud's shadow covers the player
    const veil = 1 - this.cloudShadowAt(this.camera.position);
    env.uniforms.uSunVeil.value += (veil - env.uniforms.uSunVeil.value) * Math.min(1, this.dt * 3);
    // valley mist: thick at dawn, gone by late morning, back in the evening
    // and after rain; always a trace of haze in the low ground
    const h = env.time;
    let m = 0.06;
    if (h < 7.5) m = 0.75 + 0.25 * THREE.MathUtils.smoothstep(h, 4.5, 6);
    else if (h < 10.5) m = THREE.MathUtils.lerp(1, 0.06, THREE.MathUtils.smoothstep(h, 7.5, 10.5));
    else if (h > 19.5) m = THREE.MathUtils.lerp(0.06, 0.75, THREE.MathUtils.smoothstep(h, 19.5, 23.5));
    m = Math.max(m, 0.06 + 0.35 * w.wet * (1 - w.rain * 0.6));
    FX.uFxMist.value.x = MIST_DENSITY * m;
    FX.uFxWet.value = w.wet;
    // puddles mirror the water's reflection cube
    FX.uFxRefl.value = this.water.shared.uRefl.value;
    FX.uFxReflOn.value = this.water.shared.uReflOn.value;
    // light filling the water volume: sky light plus the sun from above
    const hemi = env.hemi;
    const sun = env.sun;
    const up = Math.max(0, env.lightDir.y);
    FX.uFxWaterLight.value
      .copy(hemi.color)
      .multiplyScalar(hemi.intensity * 0.7)
      .add(_c.copy(sun.color).multiplyScalar(sun.intensity * up * 0.3));
  }

  // The eye adapts, as it does outdoors: under the trees, in a cloud's
  // shadow and on a grey day the view opens up a little; looking into a low
  // sun it closes down. Kept to a narrow range so the tuned look of noon and
  // of the night stays as it was. One number for the tone mapping: no extra
  // work for the graphics processor.
  updateExposure(dt) {
    const env = this.env;
    const cam = this.camera;
    const p = cam.position;
    const S = THREE.MathUtils.smoothstep;
    // trees in leaf close round the camera (not bare snags), counted a few
    // times a second
    this.canopyT -= dt;
    if (this.canopyT <= 0) {
      this.canopyT = 0.25;
      let n = 0;
      for (const c of this.colliders.circlesNear(p.x, p.z, 9)) {
        if (c.tag === 'tree' && c.cr && (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 81) n++;
      }
      this.canopy = S(n, 2, 9);
    }
    const day = 1 - env.night;
    let t = 1;
    if (day > 0) {
      const w = env.weather;
      const grey = S(w.cloud, 0.5, 0.9);
      const shade = 1 - this.cloudShadowAt(p);
      t += day * (0.15 * this.canopy + 0.06 * shade + 0.05 * grey);
      const e = env.sunElevation;
      const low = S(e, -1, 4) * (1 - S(e, 15, 35));
      cam.getWorldDirection(_v3);
      const into = Math.max(0, _v3.dot(env.sunDir));
      t -= day * 0.12 * into ** 6 * low * (1 - grey) * (1 - 0.7 * this.canopy);
    }
    t = Math.min(1.18, Math.max(0.88, t));
    // after a jump (a fast travel, a new game) start adapted
    if (this.lastEye.distanceToSquared(p) > 30 * 30) this.exposure = t;
    else this.exposure += (t - this.exposure) * Math.min(1, dt * (t < this.exposure ? 2.5 : 0.9));
    this.lastEye.copy(p);
    this.renderer.toneMappingExposure = this.exposure;
  }

  render() {
    const r = this.renderer;
    const world = this.drawWorld || (this.drawWorld = () => r.render(this.scene, this.camera));
    const overlay =
      this.drawOverlay ||
      (this.drawOverlay = () => {
        if (this.overlay && this.overlay.enabled) r.render(this.overlay.scene, this.overlay.camera);
      });
    if (this.post.enabled) {
      const env = this.env;
      this.post.render(world, overlay, this.camera, env.sunDir, env.sun.color, this.sunRays());
      return;
    }
    r.setRenderTarget(null);
    r.clear();
    world();
    if (this.overlay && this.overlay.enabled) {
      r.clearDepth();
      overlay();
    }
  }

  // Direct sunlight left under the clouds at a point (as fxCloudShadow in
  // worldfx.js, read from the same texture on the CPU).
  cloudShadowAt(p) {
    const cl = FX.uFxClouds.value;
    if (cl.w <= 0) return 1;
    const s = this.env.sunDir;
    const k = (1400 - p.y) / Math.max(s.y, 0.25);
    const img = this.textures.cloud.image;
    const S = img.width;
    const fx = ((p.x + s.x * k) / CLOUD_SCALE + cl.x) * S - 0.5;
    const fz = ((p.z + s.z * k) / CLOUD_SCALE + cl.y) * S - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tx = fx - i0;
    const tz = fz - j0;
    const at = (i, j) => img.data[((((j % S) + S) % S) * S + (((i % S) + S) % S)) * 4] / 255;
    const n = (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - tz) + (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * tz;
    return 1 - cl.w * THREE.MathUtils.smoothstep(n, cl.z, cl.z + 0.1);
  }

  // How strongly the sun streams through gaps: most at a low sun, little
  // under cloud or rain, none at night or under water.
  sunRays() {
    const env = this.env;
    const e = env.sunElevation;
    const w = env.weather;
    const low = 1 - THREE.MathUtils.smoothstep(e, 10, 42);
    let k = THREE.MathUtils.smoothstep(e, -3, 3) * (0.3 + 0.7 * low);
    k *= 1 - 0.8 * THREE.MathUtils.smoothstep(w.cloud, 0.5, 0.95);
    k *= 1 - Math.min(1, w.rain * 1.5);
    k *= 1 - 0.85 * env.uniforms.uSunVeil.value;
    if (this.water.viewLevel != null && this.camera.position.y < this.water.viewLevel) k = 0;
    return k * 0.55;
  }
}
