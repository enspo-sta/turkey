// Game core: renderer, world construction and the frame loop. Gameplay systems
// attach themselves here (see main.js for wiring).
import * as THREE from 'three';
import { generateWorld } from './world/worldgen.js';
import { Terrain, makeTerrainMaterial, buildFarTerrain } from './world/terrain.js';
import { Environment } from './world/sky.js';
import { WaterSystem } from './world/water.js';
import { Scatter } from './world/scatter.js';
import { GrassField } from './world/grass.js';
import { Colliders } from './world/colliders.js';
import { makeWorldTextures } from './world/worldtex.js';
import { Props } from './world/props.js';
import { buildRoads } from './world/roads.js';
import { makeDetailTexture, makeCloudTexture, makeWaterNormalTexture } from './util/textures.js';

export const IS_TOUCH =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0));

export const QUALITY = {
  low: { dpr: 1.0, shadow: 0, grass: 0.45, scatter: 0.6, lod: 0.7 },
  medium: { dpr: 1.5, shadow: 1024, grass: 0.75, scatter: 0.85, lod: 0.9 },
  high: { dpr: 2.0, shadow: 2048, grass: 1.0, scatter: 1.0, lod: 1.0 },
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export class Game {
  constructor(container) {
    this.container = container;
    this.systems = [];
    this.timer = new THREE.Timer();
    this.time = 0;
    this.paused = false;
    this.qualityName = IS_TOUCH ? 'medium' : 'high';
  }

  async init(progress = () => {}) {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Ruben Hotrod Fishing game view');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.35, 9000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

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
    };
    this.wtex = makeWorldTextures(this.world);
    this.colliders = new Colliders();
    this.sharedUniforms = { uTime: { value: 0 } };

    this.env = new Environment(this.scene, this.textures.cloud);

    this.terrainMaterial = makeTerrainMaterial(this.textures.detail);
    this.terrain = new Terrain(this.world, this.terrainMaterial);
    this.scene.add(this.terrain.group);
    this.farTerrain = buildFarTerrain(this.world, this.terrainMaterial);
    this.scene.add(this.farTerrain);

    this.water = new WaterSystem(this.world, this.wtex, this.textures.waterNormal, this.env);
    this.scene.add(this.water.group);

    progress(0.8, 'Planting spruce and birch');
    await nextFrame();
    this.props = new Props(this);
    const avoid = this.props.reserveAreas();
    this.scatter = new Scatter(this.world, this.colliders, this.sharedUniforms);
    this.scatter.generate(avoid);
    this.scene.add(this.scatter.group);
    this.props.build();
    this.scene.add(this.props.group);
    this.roads = buildRoads(this.world);
    this.scene.add(this.roads);

    this.grass = new GrassField(this.wtex, this.env);
    this.scene.add(this.grass.group);

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
    this.env.setShadowQuality(q.shadow);
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.grass.setDensity(q.grass);
    this.scatter.distScale = q.scatter;
    this.terrain.lodBias = q.lod;
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
    if (!this.menuOpen || this.menuFrame % 3 === 0) this.render();
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
    } else if (a.avg < 1 / 55 && this.dpr < maxDpr - 0.01) {
      a.good++;
      if (a.good >= 4) {
        this.dpr = Math.min(maxDpr, this.dpr + 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.resize();
        a.good = 0;
      }
    } else a.good = 0;
  }

  updateWorld(dt) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const focus = this.focus || cam.position;
    if (!this.paused) this.env.advance(dt);
    this.env.update(dt, focus);
    this.terrain.update(cam.position.x, cam.position.z);
    this.scatter.update(cam);
    this.props.update(dt, this.time, this.env);
    this.effects?.update(dt);
    const rain = this.env.weather.rain;
    this.water.update(dt, rain, this.env.hemi.color);
    this.grass.update(dt, cam.position, this.env.sun, this.env.hemi, 0.3 + rain * 0.8);
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.overlay && this.overlay.enabled) {
      r.clearDepth();
      r.render(this.overlay.scene, this.overlay.camera);
    }
  }
}
