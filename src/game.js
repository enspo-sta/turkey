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

// The tone curve: Khronos PBR Neutral with three quarters of its black
// offset. Neutral takes 0.04 off every colour to cancel the 4% reflection
// that glossy materials have; the matte ground and plants have none, and the
// full offset crushed their shade to muddy, over-coloured black (linear 0.05
// came out as 0.016). With 0.03 it comes out as 0.021: the shade keeps more
// of its detail, the greens keep most of their colour (with half the offset
// they lost a tenth of it) and the night stays as dark.
// The same instructions as Neutral; only two constants differ.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
	const float K = 0.03;
	const float StartCompression = 0.8 - K;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 2.0 * K ? x - x * x / ( 4.0 * K ) : K;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}`
);

// the shaders' clocks start over after this many seconds (see frame)
const SHADER_PERIOD = 7200;

export class Game {
  constructor(container) {
    this.container = container;
    this.systems = [];
    this.timer = new THREE.Timer();
    this.time = 0;
    this.paused = false;
    this.qualityName = 'high';
    // The frame-rate optimisations' switches, so each can be compared with
    // the picture and the frame time it saves: key -> { label, get(), set(on) }.
    // Every one is on in the game. The key is short, for the line of the
    // detailed performance check, where its window is "D" + key (a number,
    // with a letter for a part: '8', '3a'); the label is the name
    // tools/same-frame.mjs gives its drawing with it off ('<label> off').
    this.perfSwitches = new Map();
  }

  async init(progress = () => {}) {
    installWorldFx();
    // the page's own font, loaded before any sign or label is painted with
    // it (fonts in the page load only when first asked for: a sign painted
    // before would keep a stand-in font for good); never waits long
    try {
      if (document.fonts && document.fonts.load) {
        const fonts = Promise.all(['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 30px "Barlow Condensed"`)));
        await Promise.race([fonts, new Promise((r) => setTimeout(r, 2000))]);
      }
    } catch (e) {
      /* a stand-in font then */
    }
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    // three.js asks the driver for each new shader's error log on its first
    // use, a wait for the compile every time; the release build skips it
    renderer.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
    renderer.toneMapping = THREE.CustomToneMapping;
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
    FX.uFxZenith.value = this.env.uniforms.uZenith.value;
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
    // (kept for the detailed performance check, which switches the ground's
    // detail off in both)
    this.terrainReflectMaterial = terrainReflect;
    this.terrain = new Terrain(this.world, this.terrainMaterial);
    this.scene.add(this.terrain.group);
    this.perfSwitches.set('tb', {
      label: 'terrain blocks',
      get: () => this.terrain.blocksOn,
      set: (on) => {
        this.terrain.blocksOn = on;
        this.terrain.showBlocks();
      },
    });
    this.farTerrain = buildFarTerrain(this.world, this.terrainMaterial);
    this.scene.add(this.farTerrain);
    // the reflection gets a coarser copy: a cube face 128 to 256 pixels
    // across cannot show the 20 m detail, and it is drawn every frame
    this.farReflect = buildFarTerrain(this.world, terrainReflect, 40, this.farTerrain.userData.grid, REFLECT_LAYER);
    this.farTerrain.add(this.farReflect);
    // both drawn only from the first of their cells a view (or a face of
    // the reflection) can see to the last (see FarTerrain in terrain.js)
    this.perfSwitches.set('5', {
      label: 'far terrain trim',
      get: () => this.farTerrain.trimOn,
      set: (on) => {
        this.farTerrain.setTrim(on);
        this.farReflect.setTrim(on);
      },
    });
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
    // the world's buffer, the screen, the finish's buffers and the
    // reflection's faces each cleared inside the pass that draws into them
    // (see PostFX.drawCleared)
    this.perfSwitches.set('8', {
      label: 'clear in pass',
      get: () => this.post.clearInPass,
      set: (on) => (this.post.clearInPass = this.water.clearInPass = on),
    });
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
    const grassMats = [this.grass.grass.material, this.grass.flowers.material];
    this.perfSwitches.set('ge', {
      label: 'grass early out',
      get: () => 'EARLY_OUT' in grassMats[0].defines,
      set: (on) => {
        for (const m of grassMats) {
          if (('EARLY_OUT' in m.defines) === on) continue;
          if (on) m.defines.EARLY_OUT = '';
          else delete m.defines.EARLY_OUT;
          m.needsUpdate = true;
        }
      },
    });
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

  // Sets the preset's work (and, unless setDpr is false, its resolution).
  setQuality(name, setDpr = true) {
    const q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name;
    this.quality = q;
    if (setDpr) {
      this.dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      this.renderer.setPixelRatio(this.dpr);
    }
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
      // (the detailed performance check draws frames of its own meanwhile,
      // with the clock stopped; the timer keeps ticking, so the first frame
      // after it is an ordinary one)
      if (this.frameOverride) this.frameOverride();
      else this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  frame() {
    const f0 = performance.now();
    let dt = this.timer.getDelta();
    const rawDt = dt;
    this.adaptResolution(dt);
    if (dt > 0.1) dt = 0.1;
    this.dt = dt;
    this.time += dt;
    // (the shaders' clock kept within two hours: a clock that grew all
    // session would leave waves and swaying too few digits to move smoothly)
    this.sharedUniforms.uTime.value = this.time % SHADER_PERIOD;
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
    // the performance check's record: the time from one frame to the next,
    // and the processor's own work on this one
    this.frameProbe?.(rawDt, performance.now() - f0);
  }

  // A game has just started: for a while the work of its first moments (the
  // ground filling in around you, the sounds handed over) is no reason to
  // step the graphics down, which would recompile every shader (a stall of
  // its own) and lower the look.
  settleIn(secs) {
    const a = this.adaptState();
    a.calmUntil = a.clock + secs;
    a.trial = null;
    a.n = 0;
    a.sum = 0;
    a.t = 0;
    a.goodRun = 0;
  }

  adaptState() {
    return (this.adapt ||= { clock: 0, sum: 0, n: 0, t: 0, calmUntil: 0, trial: null, failed: [], goodRun: 0, downHold: 0, downBackoff: 60, upHold: { dpr: 0, preset: 0 }, upBackoff: { dpr: 20, preset: 60 }, last: 0 });
  }

  // The presets the graphics may run at: the player's own (High unless they
  // picked another) and, with "Adjust graphics automatically" on, the
  // cheaper ones below it.
  presetsBelow() {
    const order = ['high', 'medium', 'low'];
    const top = this.ceiling || 'high';
    const auto = this.state?.settings?.autoQuality !== false;
    return auto ? order.slice(order.indexOf(top)) : [top];
  }

  maxDpr(q) {
    return Math.min(window.devicePixelRatio || 1, QUALITY[q].dpr);
  }

  minDpr(q) {
    return Math.min(1, this.maxDpr(q));
  }

  // Runs the graphics at preset q and resolution d (pixels per point, kept
  // within what the preset allows). True when the preset changed.
  setLevel(q, d) {
    const presetChanged = q !== this.qualityName;
    if (presetChanged) this.setQuality(q, false);
    d = Math.round(Math.max(this.minDpr(q), Math.min(this.maxDpr(q), d)) * 100) / 100;
    if (Math.abs(this.dpr - d) > 0.001 || presetChanged) {
      this.dpr = d;
      this.renderer.setPixelRatio(d);
      this.resize();
    }
    return presetChanged;
  }

  // Where the graphics start: the player's preset at its full resolution,
  // or the level the adaptation last settled on for it on this device.
  startQuality() {
    const s = this.state?.settings;
    this.ceiling = (s && QUALITY[s.quality] && s.quality) || 'high';
    const lv = s?.autoLevel;
    const ok = lv && lv.ceiling === this.ceiling && lv.screen === (window.devicePixelRatio || 1) && this.presetsBelow().includes(lv.q);
    if (ok) this.setLevel(lv.q, lv.d);
    else this.setLevel(this.ceiling, this.maxDpr(this.ceiling));
    const a = this.adaptState();
    a.trial = null;
    a.failed = [];
  }

  // The player picked a preset in Settings: it is the top from now on, and
  // the adaptation starts over from it.
  chooseQuality(name) {
    const s = this.state.settings;
    s.quality = name;
    s.autoLevel = null;
    this.state.saveSettings?.();
    const a = this.adaptState();
    a.downHold = 0;
    a.upHold = { dpr: 0, preset: 0 };
    this.startQuality();
  }

  // Adaptive graphics, on two dials: the resolution (in quarter steps down
  // to one pixel per point) and the preset (down to Low, when the player
  // allows it). Frame times are averaged over windows of 2.5 s.
  // - Slower than 50 frames a second: one dial goes down to its cheapest
  //   setting, as a trial: the resolution first, then the preset. It is
  //   kept only if the frames then come quicker (by at least 8%); if not,
  //   it is undone and the other dial is tried. When neither helps, the limit is not the
  //   game's work (Low Power Mode holds Safari at 30 frames a second, a hot
  //   phone slows down): the picture is left as it is, and no step down is
  //   tried for a while.
  // - Quicker than 57 frames a second for 10 s: one step back up (a quarter
  //   of the resolution, or one preset; the resolution first), as a trial,
  //   undone if the frames then drop below 50; each failed try waits
  //   longer before the next.
  // The level the adaptation settles on is remembered for the next game,
  // apart from the player's own choice of preset, which it never changes.
  adaptResolution(rawDt) {
    if (!this.quality || this.adaptHold || rawDt <= 0 || rawDt > 0.5) return;
    const a = this.adaptState();
    a.clock += rawDt;
    // only while playing: menus draw one frame in three, and a paused or
    // settling game says nothing about play
    if (!this.started || this.paused || this.menuOpen || a.clock < a.calmUntil) {
      a.sum = 0;
      a.n = 0;
      a.t = 0;
      return;
    }
    a.sum += rawDt;
    a.n++;
    a.t += rawDt;
    if (a.t < 2.5) return;
    const mean = a.sum / a.n;
    a.sum = 0;
    a.n = 0;
    a.t = 0;
    a.last = mean;
    const SLOW = 1 / 50;
    const GOOD = 1 / 57;
    const tr = a.trial;
    if (tr) {
      // the first window after a change has its rebuilt buffers (and, for a
      // preset, its shaders) in it: skipped
      if (tr.skip > 0) {
        tr.skip--;
        return;
      }
      a.trial = null;
      if (tr.dir < 0) {
        if (mean < tr.before * 0.92 || mean <= SLOW) {
          a.failed = [];
          a.downBackoff = 60;
          this.rememberLevel();
          if (tr.kind === 'preset') this.onQualityChange?.(this.qualityName, 'down');
        } else {
          // no quicker: put it back; the other dial next, if still slow
          this.setLevel(tr.q, tr.d);
          a.failed.push(tr.kind);
          a.goodRun = 0;
        }
        return;
      }
      if (mean > SLOW) {
        this.setLevel(tr.q, tr.d);
        a.upHold[tr.kind] = a.clock + a.upBackoff[tr.kind];
        a.upBackoff[tr.kind] = Math.min(tr.kind === 'preset' ? 900 : 600, a.upBackoff[tr.kind] * 2);
        a.goodRun = 0;
      } else {
        a.upBackoff[tr.kind] = tr.kind === 'preset' ? 60 : 20;
        this.rememberLevel();
        if (tr.kind === 'preset') this.onQualityChange?.(this.qualityName, 'up');
      }
      return;
    }
    const q = this.qualityName;
    const d = this.dpr;
    const presets = this.presetsBelow();
    const pi = presets.indexOf(q);
    if (mean > SLOW) {
      a.goodRun = 0;
      if (a.clock < a.downHold) return;
      const can = [];
      if (d > this.minDpr(q) + 0.01) can.push('dpr');
      if (pi >= 0 && pi < presets.length - 1) can.push('preset');
      const kind = can.find((k) => !a.failed.includes(k));
      if (!kind) {
        // nothing the game can lower helps: leave the picture alone
        a.failed = [];
        a.downHold = a.clock + a.downBackoff;
        a.downBackoff = Math.min(600, a.downBackoff * 2);
        return;
      }
      // (the dial goes to its cheapest setting at once: on a 60 Hz screen
      // frames come on whole refreshes, so a small step can be cheaper and
      // still show no quicker; if the cheapest helps, the steps back up
      // below find the best setting that keeps the frames smooth)
      if (kind === 'dpr') this.setLevel(q, this.minDpr(q));
      else this.setLevel(presets[presets.length - 1], d);
      a.trial = { dir: -1, kind, q, d, before: mean, skip: kind === 'preset' ? 2 : 1 };
      return;
    }
    a.failed = [];
    if (mean < GOOD) {
      a.goodRun++;
      if (a.goodRun < 4) return;
      let kind = null;
      if (d < this.maxDpr(q) - 0.01) kind = 'dpr';
      else if (pi > 0) kind = 'preset';
      if (!kind || a.clock < a.upHold[kind]) return;
      a.goodRun = 0;
      if (kind === 'dpr') this.setLevel(q, d + 0.25);
      else this.setLevel(presets[pi - 1], d);
      a.trial = { dir: 1, kind, q, d, skip: kind === 'preset' ? 2 : 1 };
    } else a.goodRun = 0;
  }

  // The level the adaptation has settled on, kept for the next game.
  rememberLevel() {
    const s = this.state?.settings;
    if (!s) return;
    const top = this.qualityName === this.ceiling && Math.abs(this.dpr - this.maxDpr(this.ceiling)) < 0.01;
    const lv = top ? null : { ceiling: this.ceiling, q: this.qualityName, d: this.dpr, screen: window.devicePixelRatio || 1 };
    if (JSON.stringify(lv) === JSON.stringify(s.autoLevel ?? null)) return;
    s.autoLevel = lv;
    this.state.saveSettings?.();
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
    this.detailCull?.update();
    // where the plants' shadows fall, for keeping those whose shadows reach
    // into the view (see scatter.js)
    const sv = this.scatter.shadowVec || (this.scatter.shadowVec = { x: 0, z: 0, len: 0 });
    const lh = Math.hypot(ld.x, ld.z);
    if (ld.y > 0.035 && lh > 1e-3 && this.renderer.shadowMap.enabled) {
      sv.len = Math.min(120, (28 * lh) / ld.y);
      sv.x = (-ld.x / lh) * sv.len;
      sv.z = (-ld.z / lh) * sv.len;
    } else sv.len = sv.x = sv.z = 0;
    this.scatter.update(cam);
    this.props.update(dt, this.time, this.env);
    this.effects?.update(dt);
    const rain = this.env.weather.rain;
    this.updateFx();
    this.updateExposure(dt);
    this.scenery.update(dt);
    this.floaters.update(dt);
    this.grass.update(dt, cam.position, this.env.sun, this.env.hemi, 0.3 + rain * 0.8);
    // last, so that the water's reflection, which brings every object's
    // place in the world up to date as it is drawn, leaves them as the view
    // will find them: the view need not work them all out again (see
    // render). The three just above only change what they draw themselves,
    // none of it in the reflection, so it shows the same as before them.
    this.matricesFresh = this.water.update(dt, rain, cam, this.scene);
  }

  // Light-dependent inputs of the shared world shading.
  updateFx() {
    const env = this.env;
    const w = env.weather;
    FX.uFxTime.value = this.time % SHADER_PERIOD;
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
    env.uniforms.uSunVeil.value += (veil - env.uniforms.uSunVeil.value) * Math.min(1, (this.dt || 0) * 3);
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
    // every object's place was worked out by the reflection just before
    // (see updateWorld): once is enough for the frame
    const fresh = this.matricesFresh;
    this.matricesFresh = false;
    if (!fresh) return this.draw();
    this.scene.matrixWorldAutoUpdate = false;
    try {
      this.draw();
    } finally {
      this.scene.matrixWorldAutoUpdate = true;
    }
  }

  draw() {
    const r = this.renderer;
    // the sun's cascades worked out for this view, and the plants' shadow
    // twins split for them, before three.js goes through the scene (see
    // ShadowBatcher.prepare)
    this.shadowBatch?.prepare(this.camera);
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
    // (the screen cleared inside the world's pass, as the finish's buffer
    // is; the hands below keep their own clear of the depth)
    this.post.drawCleared(world);
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
