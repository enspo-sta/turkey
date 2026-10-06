// Entry point and gameplay orchestration: boot, title screen, modes (on foot,
// driving), interactions, discovery, sleeping, fast travel, saving and events.
import * as THREE from 'three';
import { Game, IS_TOUCH } from './game.js';
import { Input } from './ui/input.js';
import { HUD } from './ui/hud.js';
import { Announcer } from './audio/announcer.js';
import { PhotoCamera } from './gameplay/camera.js';
import { Jobs } from './gameplay/jobs.js';
import { Bigfoot } from './entities/bigfoot.js';
import { Glider } from './entities/glider.js';
import { Secret, GUS_NOTES } from './world/secret.js';
import { Oddities } from './world/oddities.js';
import { Scientists } from './world/scientists.js';
import { SCIENTIST, SCIENTISTS } from './world/scientistdata.js';
import { Pitstop, PITSTOP, clearPitstop } from './world/pitstop.js';
import { Observatory } from './world/observatory.js';
import { SolarWalk } from './world/solarwalk.js';
import { Tors } from './world/tors.js';
import { TeslaMemorial } from './world/tesla.js';
import { DetailCull } from './world/detailcull.js';
import { Visitor } from './gameplay/visitor.js';
import { Climbing } from './gameplay/climbing.js';
import { Meteors } from './world/meteors.js';
import { Satellites } from './world/satellites.js';
import { SkyGuide } from './ui/skyguide.js';
import { eqVector } from './world/astro.js';
import { KP_WORDS, kpForNight } from './world/spaceweather.js';
import { Screens } from './ui/screens.js';
import { GameState } from './gameplay/state.js';
import { Player } from './entities/player.js';
import { HotRod } from './entities/hotrod.js';
import { RaceCar } from './entities/racecar.js';
import { Boat } from './entities/boat.js';
import { Areas } from './world/areas.js';
import { Viewmodel } from './entities/viewmodel.js';
import { Fishing } from './gameplay/fishing.js';
import { Hunting } from './gameplay/hunting.js';
import { Wildlife } from './entities/wildlife.js';
import { AmbientFish } from './entities/ambientfish.js';
import { Insects } from './entities/insects.js';
import { makeFishModel, lengthFor } from './entities/fishmodels.js';
import { Bears } from './gameplay/bears.js';
import { Effects } from './world/effects.js';
import { Calving } from './world/calving.js';
import { AudioEngine } from './audio/audio.js';
import { LURES, CHALLENGES, FISH, LEGENDS } from './gameplay/data.js';
import { formatMoney, clamp, damp, wrapAngle } from './util/math.js';
import { ROAD_HALF } from './world/worldgen.js';
import { REFLECT_LAYER } from './world/water.js';
import { reflectionMaterial } from './world/worldfx.js';

const $ = (id) => document.getElementById(id);

class Session {
  constructor(game) {
    this.game = game;
    this.mode = 'title';
    this.titleT = 0;
    this.saveT = 30;
    this.envT = 0;
    this.runT = 200;
    this.fadeBusy = false;
  }

  // ---------------------------------------------------------------- setup
  async setup() {
    const g = this.game;
    g.state = new GameState();
    g.input = new Input($('app'));
    g.input.usingTouch = IS_TOUCH;
    $('app').classList.toggle('show-keys', !IS_TOUCH);
    g.input.sensitivity = g.state.settings.sens;
    g.input.invertY = g.state.settings.invert;
    if (g.state.settings.quality) g.setQuality(g.state.settings.quality);
    g.effects = new Effects(g);
    g.scene.add(g.effects.group);
    g.audio = new AudioEngine(g);
    g.audio.setVolumes(g.state.settings.volume, g.state.settings.music);
    g.player = new Player(g);
    g.player.onStep = (surf, water, sprint) => g.audio.step(surf, water, sprint);
    g.hotrod = new HotRod(g);
    g.racer = new RaceCar(g);
    // the car you are in, or the one you last drove
    g.car = g.hotrod;
    g.boat = new Boat(g);
    g.scene.add(g.hotrod.group, g.racer.group);
    // the race car waits under a tarp at the end of an old logging track
    clearPitstop(g);
    g.pitstop = new Pitstop(g);
    g.racer.place(PITSTOP.x, PITSTOP.z, PITSTOP.yaw);
    g.pitstop.cover(g.racer, false);
    // the night sky: the observatory on the tundra, the scale model of the
    // solar system on the Lighthouse Road, meteors, satellites and the guide
    // to the constellations
    g.observatory = new Observatory(g);
    g.solarwalk = new SolarWalk(g);
    // the granite tors off the Tundra Road, for climbing
    g.tors = new Tors(g);
    g.climbing = new Climbing(g);
    // Nikola Tesla on the rim of the gorge at Bear Falls, the coil house and
    // the falls' little hydro plant
    g.tesla = new TeslaMemorial(g);
    // the visitor from the sky: the meteor outburst, the crash, Zib
    g.visitor = new Visitor(g);
    g.meteors = new Meteors(g);
    g.satellites = new Satellites(g);
    g.skyguide = new SkyGuide(g);
    g.viewmodel = new Viewmodel(g);
    g.overlay = { scene: g.viewmodel.scene, camera: g.viewmodel.camera, enabled: false };
    g.fishing = new Fishing(g);
    g.hunting = new Hunting(g);
    g.wildlife = new Wildlife(g);
    g.fish = new AmbientFish(g);
    g.fish.setDensity(g.quality.fish);
    g.insects = new Insects(g);
    g.scene.add(g.insects.group);
    g.bears = new Bears(g);
    g.hud = new HUD(g);
    g.announcer = new Announcer(g);
    g.photo = new PhotoCamera(g);
    g.areas = new Areas(g);
    g.jobs = new Jobs(g);
    g.bigfoot = new Bigfoot(g);
    g.glider = new Glider(g);
    g.secret = new Secret(g);
    g.oddities = new Oddities(g);
    // the scientists' busts, by the places their work belongs to
    g.scientists = new Scientists(g);
    g.screens = new Screens(g);
    g.onEvent = (ev) => this.onEvent(ev);
    g.save = () => this.save();
    g.fastTravel = (id, hours) => this.fastTravel(id, hours);
    // the world's shaders differ with and without the finish: the new set is
    // compiled and drawn once at the change, not one by one as things come
    // into view
    g.onPostChanged = () => {
      if (!this.fishProbes) return;
      // in a frame of its own, followed by the whole view: the warm draw
      // leaves a single pixel in the drawing buffer
      this.precompile().then(() =>
        requestAnimationFrame(() => {
          this.warmDraw();
          g.render();
        })
      );
    };
    g.onQualityDrop = (name) => g.hud.toast(`Graphics set to ${name.toUpperCase()} to keep the game smooth. Change it in Settings.`);
    g.toTitle = () => this.toTitle();
    g.waitForDark = () => this.waitForDark();
    g.skySubjects = () => this.skySubjects();
    g.haptic = (kind) => this.haptic(kind);
    g.events = { emit: (type, data) => this.onPlayerEvent(type, data) };
    g.addSystem(this);
    g.calving = g.addSystem(new Calving(g));
    // Bear Falls mist emitter
    const W = g.world;
    const fp = W.river.sample(W.fallsS + 3);
    g.fallsMist = new THREE.Vector3(fp.x, W.riverLevel(W.fallsS + 3), fp.z);
    g.fallsMist.w = W.riverWidth(W.fallsS) * 1.6;
    g.fallsMist.dz = 0;
    // environment map for chrome and paint
    this.pmrem = new THREE.PMREMGenerator(g.renderer);
    this.envScene = new THREE.Scene();
    // its own copy of the sky material (like the water reflections), so
    // refreshing the map never switches the main sky's shader
    const skyClone = new THREE.Mesh(g.env.sky.geometry, reflectionMaterial(g.env.skyMaterial));
    this.envScene.add(skyClone);
    // the sky is drawn into one small cube and filtered into one reflection
    // map, both made once and reused: a fresh map each time the sun moved
    // cost a big allocation and a hitch every few seconds at dusk
    this.envCube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    this.envCubeCam = new THREE.CubeCamera(1, 5000, this.envCube);
    this.updateEnvMap();
    // resize hooks
    const resize = () => {
      const w = g.container.clientWidth;
      const h = g.container.clientHeight;
      g.effects.resize(w, h, g.dpr);
      g.fishing.resize(w * g.dpr, h * g.dpr);
      g.viewmodel.resize(w, h);
      g.hud.minimap?.resize();
      g.hud.measureCatch();
      g.skyguide.resize();
      this.checkOrientation();
    };
    g.systems.push({ resize });
    resize();
    // the map image for the map screen and the minimap, made while loading
    g.screens.ensureMapImage();
    this.bindTitle();
    this.bindKeys();
    this.bindLifecycle();
    // place the car at the cabin for the title shot
    this.placeAtStart(true);
    // small parts far away are left out of the frame (see detailcull.js)
    g.detailCull = new DetailCull(g);
    for (const o of [g.props.group, g.observatory.group, g.racer.group, g.hotrod.group, g.pitstop.group, g.tors.group, g.solarwalk.group, g.tesla.group, g.boat.group, g.scientists.group]) g.detailCull.add(o);
    // every light (the hot rod's headlight too) also shines in the water
    // reflections, so the probe and the main view share one light setup
    g.scene.traverse((o) => {
      if (o.isLight) o.layers.enable(REFLECT_LAYER);
    });
    this.warm = this.precompile();
  }

  // Show everything for a moment: every hidden part, one of every kind of
  // instanced thing, nothing left out for being off screen. Returns the undo.
  revealAll(roots) {
    this.game.detailCull?.reset();
    const undo = [];
    for (const root of roots) {
      root.traverse((o) => {
        if (!o.visible) {
          o.visible = true;
          undo.push(() => (o.visible = false));
        }
        if (o.frustumCulled) {
          o.frustumCulled = false;
          undo.push(() => (o.frustumCulled = true));
        }
        if (o.isInstancedMesh && o.count === 0 && o.instanceMatrix.count > 0) {
          o.count = 1;
          undo.push(() => (o.count = 0));
        }
      });
    }
    return () => {
      for (let i = undo.length - 1; i >= 0; i--) undo[i]();
    };
  }

  // Compile every shader up front so the first arrow, fish or bear
  // does not stall a frame.
  precompile() {
    const g = this.game;
    // a fish in the world (under water, fog) and in the hands (no fog), so the
    // first bite and the first catch do not stall on shader compiles
    if (!this.fishProbes) this.fishProbes = [makeFishModel('pink'), makeFishModel('pink')];
    const [fishWorld, fishHand] = this.fishProbes;
    g.scene.add(fishWorld);
    g.viewmodel.scene.add(fishHand);
    // the hands reflect the same sky as the world once the game is on (see
    // Viewmodel.update): compiled without it, all their shaders would be
    // built again on the first frame of the game
    g.viewmodel.scene.environment = g.scene.environment;
    const undo = this.revealAll([g.scene, g.viewmodel.scene]);
    // compileAsync starts every compile at once and, where the browser can
    // say when a shader is done without waiting for it, resolves when they
    // all are (see warmDraw)
    let ready = Promise.resolve();
    try {
      // the world is compiled for the buffer it is drawn into (the High
      // finish draws it in linear light), the hands for the screen
      g.renderer.setRenderTarget(g.post.worldTarget);
      const world = g.renderer.compileAsync(g.scene, g.camera);
      g.renderer.setRenderTarget(null);
      const hands = g.renderer.compileAsync(g.viewmodel.scene, g.viewmodel.camera);
      ready = Promise.all([world, hands]).catch(() => {});
    } catch (e) {
      /* compile is only an optimisation */
    }
    g.renderer.setRenderTarget(null);
    undo();
    // keep the probes (not their place in the scenes): disposing them would
    // release the compiled programs again
    for (const f of this.fishProbes) f.removeFromParent();
    return ready;
  }

  // A compiled shader is not the end of it: the graphics driver builds the
  // program it really runs (one for each shader, target and kind of mesh)
  // the first time something is drawn with it, and that is the stall when a
  // bear, the boat or a building first comes into view. So everything is
  // drawn once here, behind the loading screen: the whole world, its
  // shadows, its reflection and the hands, into a single pixel of the view
  // (the driver's work does not depend on how much is drawn).
  warmDraw() {
    const g = this.game;
    const r = g.renderer;
    // the world brought up to the camera first (its ground, its plants, the
    // reflections), and only then everything shown for the draw: shown
    // first, the update's own changes (chunks of ground made visible) would
    // be undone with the rest. No time passes, and none has yet at load
    // (the first frame sets g.dt).
    try {
      g.dt = 0;
      g.updateWorld(0);
    } catch (e) {
      /* only an optimisation */
    }
    const [fishWorld, fishHand] = this.fishProbes;
    g.scene.add(fishWorld);
    g.viewmodel.scene.add(fishHand);
    g.viewmodel.scene.environment = g.scene.environment;
    const undo = this.revealAll([g.scene, g.viewmodel.scene]);
    const overlayWas = g.overlay.enabled;
    g.overlay.enabled = true;
    // the finish's buffers at their size now: sizing them in the draw would
    // reset the one-pixel scissor and draw the whole view
    if (g.post.enabled) {
      const size = r.getDrawingBufferSize(this._warmSize || (this._warmSize = new THREE.Vector2()));
      g.post.setSize(size.x, size.y);
    }
    const t = g.post.worldTarget;
    if (t) {
      t.scissor.set(0, 0, 1, 1);
      t.scissorTest = true;
    }
    r.setScissor(0, 0, 1, 1);
    r.setScissorTest(true);
    // the sun rays too, which are drawn only when the sun is in view
    g.post.warm = true;
    try {
      g.render();
    } catch (e) {
      /* only an optimisation */
    } finally {
      g.post.warm = false;
      if (t) t.scissorTest = false;
      r.setScissorTest(false);
      undo();
      g.overlay.enabled = overlayWas;
      for (const f of this.fishProbes) f.removeFromParent();
    }
  }

  // Behind the loading screen, once the compiles are done (or have had their
  // time): draw everything once, then wait for the last shader that left
  // compiling. On a phone that is a few seconds more of loading bar instead
  // of a frozen title screen or stalls in the first minutes of the game.
  finishWarmUp() {
    const g = this.game;
    // the title's camera where the title will show it, so the drawing builds
    // the ground round it and not round the middle of the map
    try {
      this.updateTitle(0);
    } catch (e) {
      /* the first frame places it anyway */
    }
    this.warmDraw();
    try {
      const gl = g.renderer.getContext();
      const P = g.renderer.info.programs;
      // the browser runs the compiles in order: asking about the last one
      // waits for them all
      if (P.length) gl.getProgramParameter(P[P.length - 1].program, gl.LINK_STATUS);
    } catch (e) {
      /* only an optimisation */
    }
  }

  updateEnvMap() {
    const g = this.game;
    try {
      this.envCubeCam.update(g.renderer, this.envScene);
      this.envRT = this.pmrem.fromCubemap(this.envCube.texture, this.envRT || null);
      if (g.scene.environment !== this.envRT.texture) g.scene.environment = this.envRT.texture;
      // (a little less than the full sky's light in the shade: with the hemisphere
      // light as well it left shade too flat; the contrast comes from the sun)
      g.scene.environmentIntensity = 0.5 + (1 - g.env.night) * 0.35;
      // the race car's carbon reflects less than paint: a material only keeps
      // its own strength with a map of its own (three uses the scene's
      // otherwise), so it gets the same map at its share of the strength
      const M = g.racer?.materials;
      if (M) {
        for (const [k, share] of [
          ['carbon', 0.6],
          ['carbon2', 0.45],
        ]) {
          if (!M[k]) continue;
          if (M[k].envMap !== this.envRT.texture) {
            M[k].envMap = this.envRT.texture;
            M[k].needsUpdate = true;
          }
          M[k].envMapIntensity = g.scene.environmentIntensity * share;
        }
      }
      this.lastEnvElevation = g.env.sunElevation;
      this.lastEnvOvercast = g.env.overcast || 0;
    } catch (e) {
      /* environment reflections are optional */
    }
  }

  placeAtStart(titleShot = false) {
    const g = this.game;
    const L = g.props.layout;
    const pk = L.parking.landing;
    g.hotrod.place(pk.x, pk.z, pk.yaw + Math.PI);
    g.hotrod.setPaint(g.state.gear.paint);
    g.hotrod.setLook(g.state.look);
    g.viewmodel.setBowWood(g.state.gear.yew);
    g.viewmodel.applyLook(g.state.look);
    const landing = g.world.place('landing');
    const ex = g.hotrod.exitPoint(1);
    g.player.place(ex.x, ex.z, landing.face);
    if (titleShot) {
      g.player.pos.set(landing.x, landing.y, landing.z);
    }
  }

  // --------------------------------------------------------------- title
  bindTitle() {
    const g = this.game;
    const cont = $('btn-continue');
    const refresh = () => {
      const has = g.state.hasSave();
      cont.hidden = !has;
      $('btn-new').textContent = has ? 'New game' : 'Start fishing';
      $('btn-new').classList.toggle('hot', !has);
      $('title-foot').textContent = IS_TOUCH
        ? 'Best played in landscape with sound on'
        : 'Keyboard and mouse: WASD to move, drag to look, Space to cast';
    };
    this.refreshTitle = refresh;
    refresh();
    cont.addEventListener('click', () => this.startGame(true));
    $('btn-new').addEventListener('click', () => {
      if (g.state.hasSave()) {
        g.screens.dialog('Start a new game?', 'Your current progress will be replaced.', [
          ['Cancel', 'ghost', null],
          ['New game', 'hot', () => this.startGame(false)],
        ]);
      } else this.startGame(false);
    });
    $('btn-howto').addEventListener('click', () => {
      g.audio.unlock();
      g.screens.open('howto');
    });
    $('btn-settings').addEventListener('click', () => {
      g.audio.unlock();
      g.screens.open('settings');
    });
    for (const id of ['btn-continue', 'btn-new', 'btn-howto', 'btn-settings']) {
      $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }
    $('rotate-dismiss').addEventListener('click', () => {
      this.rotateDismissed = true;
      $('rotate').hidden = true;
    });
  }

  showTitle() {
    const g = this.game;
    this.mode = 'title';
    g.started = false;
    // no glint or lantern frozen in the title shot
    g.secret.update(0);
    $('title').hidden = false;
    g.hud.show(false);
    this.refreshTitle();
    g.overlay.enabled = false;
  }

  toTitle() {
    const g = this.game;
    g.fishing.cancel();
    g.hunting.reset();
    // off the rock: the next game must not start with the climbing hands
    if (g.climbing.active) g.climbing.finish('foot');
    this.coilNoteT = 0;
    if (g.player.mode === 'drive') this.exitCar(true);
    if (g.player.mode === 'boat' || g.player.boat) g.boat.leave(true);
    g.glider.end();
    this.endGaze();
    g.audio.stopEngine();
    g.audio.updateOutboard?.(0, 0, 999, false);
    g.announcer.stop();
    clearTimeout(this.koRetry);
    this.koRetry = null;
    this.showTitle();
  }

  startGame(continueSave) {
    const g = this.game;
    g.audio.unlock();
    g.announcer.unlock();
    const s = g.state;
    if (continueSave) s.load();
    else {
      s.wipe();
      g.photo.wipe();
    }
    // a save from before the magazine's sales were kept: what is in the
    // album was sold then, so it does not sell twice
    if (continueSave && s.photoSoldMissing) {
      for (const [id, shot] of Object.entries(g.photo.album.shots)) s.photoSold[id] ??= shot.stars;
    }
    // a save from before the science objectives: what you had already done
    const caughtUp = continueSave ? s.backfillScience() : [];
    s.started = true;
    g.started = true;
    $('title').hidden = true;
    g.hud.show(true);
    g.hud.resetGoal();
    g.settleIn(20);
    g.overlay.enabled = true;
    g.env.setTime(s.time);
    g.env.day = s.day;
    g.player.health = s.health || 100;
    g.glider.end();
    g.player.mode = 'foot';
    g.player.boat = null;
    g.hotrod.occupied = false;
    g.hotrod.driver.visible = false;
    g.racer.occupied = false;
    g.racer.driver.visible = false;
    g.car = g.hotrod;
    g.player.tool = 'rod';
    g.viewmodel.setTool('rod');
    g.hotrod.setPaint(s.gear.paint);
    g.hotrod.setLook(s.look);
    g.viewmodel.setBowWood(s.gear.yew);
    g.viewmodel.applyLook(s.look);
    if (continueSave && s.car) g.hotrod.place(s.car.x, s.car.z, s.car.yaw);
    else this.placeAtStart();
    // the race car: where you left it once found, else under its tarp
    const found = !!s.flags.racer;
    if (continueSave && found && s.racer) g.racer.place(s.racer.x, s.racer.z, s.racer.yaw);
    else g.racer.place(PITSTOP.x, PITSTOP.z, PITSTOP.yaw);
    g.pitstop.cover(g.racer, found);
    // a fireball's stone still lying where it fell
    this.endGaze();
    g.meteors.restore(s.meteorite);
    if (continueSave && s.player) g.player.place(s.player.x, s.player.z, s.player.yaw);
    else {
      // start on the riverbank in front of the cabin, facing the water
      const landing = g.world.place('landing');
      g.player.place(landing.x, landing.z, landing.face);
    }
    // (after you are in place, so a Zib who is with you starts at your side)
    g.visitor.restore();
    // the boat: on its trailer behind the car, or moored where you left it
    g.boat.restore(continueSave ? s.boat : null);
    if (continueSave && s.player && s.player.aboard) {
      if (g.boat.where === 'water') g.boat.board();
      else {
        // the boat could not stay where it was (it is back on its trailer):
        // carry on beside the car instead of in deep water, as if you had
        // just stepped out of it
        const ex = this.exitSpot();
        g.player.place(ex.x, ex.z, g.hotrod.yaw + Math.PI);
      }
    }
    this.mode = 'play';
    g.input.resetAll();
    if (!IS_TOUCH) g.input.requestPointerLock();
    g.audio.startEngine();
    this.save();
    if (!continueSave) {
      setTimeout(() => {
        g.hud.placeTitle('Welcome to Alaska', 'Hotrod Landing');
        g.hud.hint(IS_TOUCH ? 'Drag left side to walk, right side to look. Face the river and tap CAST.' : 'WASD to walk, drag to look. Face the river and press Space to cast.', 7);
      }, 400);
    } else {
      g.hud.toast(`Welcome back. ${formatMoney(s.money)} in the tin`);
      if (caughtUp.length) {
        const pay = caughtUp.reduce((a, o) => a + o.reward, 0);
        const names = caughtUp.map((o) => o.title).join(', ');
        setTimeout(() => g.hud.toast(`New in the Journal: science objectives. ${caughtUp.length} of them you had already done (${names}): ${formatMoney(pay)} for what you found out`, 'money', 9), 2500);
      }
    }
    this.checkOrientation();
  }

  checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    const phone = IS_TOUCH && Math.min(window.innerWidth, window.innerHeight) < 600;
    $('rotate').hidden = !(portrait && phone && !this.rotateDismissed);
  }

  // ---------------------------------------------------------------- keys
  bindKeys() {
    const g = this.game;
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'play') return;
      // catch card: E or Enter keeps the fish, R lets it go
      if (g.hud.catchChoice && !g.screens.isOpen) {
        const keep = e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter';
        const release = e.code === 'KeyR';
        if ((keep || release) && !e.repeat) {
          // don't let the same press also enter the car
          g.input.keyEdges.delete(e.code);
          e.preventDefault();
          g.hud.catchChoice(keep);
        }
        return;
      }
      if (e.code === 'Escape' && !g.screens.isOpen && !g.hud.blocking) {
        if (g.hunting.aiming) g.hunting.setAiming(false);
        else g.screens.open('pause');
      }
      if (g.screens.isOpen || g.hud.blocking) return;
      if (e.code === 'KeyM') g.screens.open('map');
      if (e.code === 'KeyJ') g.screens.open('journal');
      if (e.code === 'KeyL' && g.fishing.state === 'idle') g.screens.open('lure');
    });
    $('app').addEventListener('click', () => {
      if (this.mode === 'play' && !g.menuOpen && !IS_TOUCH && !g.input.pointerLocked && !g.hud.blocking) g.input.requestPointerLock();
    });
  }

  // Pause and go quiet when the app is sent to the background (home
  // gesture, incoming call), and bring interrupted audio back on the next tap.
  bindLifecycle() {
    const g = this.game;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'play' && !g.screens.isOpen && !g.hud.blocking) g.screens.open('pause');
        g.audio.suspend();
        g.announcer.stop();
        this.save();
      } else g.audio.resume();
    });
    // In a browser the first Esc only frees a locked mouse; treat losing the
    // lock as a pause, like most first-person games, so one press opens the menu
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) {
        g.input.selfRelease = false;
        return;
      }
      // the game freed the mouse itself (a menu or the catch card opened)
      if (g.input.selfRelease) {
        g.input.selfRelease = false;
        return;
      }
      if (document.hidden) return;
      if (this.mode === 'play' && !g.menuOpen && !g.hud.blocking) g.screens.open('pause');
    });
    const wake = () => {
      if (!document.hidden) g.audio.resume();
    };
    window.addEventListener('touchend', wake, { passive: true });
    window.addEventListener('mousedown', wake);
  }

  // The summit register on the big tor: an old ammunition can with a
  // notebook, as on real summits. The first time you sign it.
  signRegister() {
    const g = this.game;
    const s = g.state;
    const names = ['K. Ahtuangaruak, 2019: windy!', 'The Hendersons, all five of us', 'Dale (radio), saw Bigfoot from here. Maybe.', 'Ptarmigan Crack in the rain. Never again.', 'Gus. Where is my paraglider?', 'Roof on the third try!'];
    const first = !s.climb.signed;
    s.climb.signed = true;
    const line = names[(g.env.day + names.length) % names.length];
    g.hud.toast(first ? `You sign the register: Day ${g.env.day}, ${Object.keys(s.climb.sent).length} route${Object.keys(s.climb.sent).length === 1 ? '' : 's'} up. The line above yours: "${line}"` : `The register: "${line}"`, 'good', 6);
    if (first) this.onEvent({ type: 'register' });
    this.save();
  }

  // A chip off the loose flake on top of the big tor, for the science log.
  takeSample() {
    const g = this.game;
    const s = g.state;
    // (one chip for the log, and another for the geologist when asked)
    const job = s.job && !s.job.done && s.job.id === 'geologist';
    if (s.climb.sample && !job) return;
    s.climb.sample = true;
    if (g.tors.flake) g.tors.flake.scale.set(0.85, 0.9, 0.85);
    g.audio.climbTick?.(0.8);
    g.hud.toast('A chip of granite in your pocket: pink feldspar, grey quartz, flakes of black mica. The crystals are big because the rock cooled slowly, deep underground', 'good', 8);
    this.onEvent({ type: 'sample', rock: 'granite' });
    g.jobs.onEvent('sample');
    this.save();
  }

  // The Tesla Memorial: the plaque, the coil and the hydro plant's board.
  readTesla() {
    const g = this.game;
    const n = g.tesla.plaqueNote();
    g.screens.note(n.title, n.html);
    if (!g.state.flags.tesla) {
      g.state.flags.tesla = true;
      this.onEvent({ type: 'tesla' });
      this.save();
    }
  }

  // A scientist's bust: the plaque's full text, and the count of plaques read.
  readBust(id) {
    const g = this.game;
    const s = SCIENTIST[id];
    if (!s) return;
    g.screens.note(`${s.name}, ${s.years}`, [`<b>${s.line}</b>`, ...s.note]);
    if (g.state.busts[id]) return;
    g.state.busts[id] = g.env.day;
    const n = Object.keys(g.state.busts).length;
    g.hud.toast(n < SCIENTISTS.length ? `Plaques read: ${n} of ${SCIENTISTS.length}. The Journal says where the others stand` : `All ${SCIENTISTS.length} plaques read`, 'good', 5);
    this.onEvent({ type: 'bust', id, count: n });
    this.save();
  }

  runCoil() {
    const g = this.game;
    if (!g.tesla.runCoil()) return;
    g.player.shake = Math.min(1, (g.player.shake || 0) + 0.15);
    const first = !g.state.flags.coil;
    g.hud.toast(first ? 'Sparks a metre long, and the tube on the stand lights up with no wire to it: the coil\'s field drives the gas inside to glow' : 'The coil crackles; the tube glows', 'good', first ? 7 : 3);
    if (first) {
      g.state.flags.coil = true;
      // what it is, once the show is over (see update)
      this.coilNoteT = 6.5;
      this.onEvent({ type: 'coil' });
      this.save();
    }
  }

  readHydro() {
    const g = this.game;
    const n = g.tesla.hydroNote();
    g.screens.note(n.title, n.html);
    if (!g.state.flags.hydro) {
      g.state.flags.hydro = true;
      this.onEvent({ type: 'hydro', kw: Math.round(g.tesla.power) });
      this.save();
    }
  }

  // ---------------------------------------------------------------- events
  onEvent(ev) {
    const g = this.game;
    const done = g.state.event(ev);
    for (const c of done) {
      g.hud.toast(`Challenge complete: ${c.text} (+${formatMoney(c.reward)})`, 'money');
      g.audio.cash();
    }
    // the science log: what you found out (the Journal keeps it)
    for (const o of g.state.lastScience || []) {
      g.hud.toast(`Science: ${o.title} (+${formatMoney(o.reward)}). ${o.learn}`, 'good', 10);
      g.audio.chime();
    }
    if (done.length) {
      // the next one named, and the GOAL line, the compass and the map on it
      const next = g.state.currentChallenge();
      g.hud.resetGoal();
      if (next) setTimeout(() => g.hud.toast(`Next: ${next.text}`), 1200);
    }
  }

  onPlayerEvent(type, data) {
    const g = this.game;
    if (type === 'hurt') {
      g.hud.damageFlash(data.amount);
      g.haptic('heavy');
    }
    if (type === 'down') this.knockedOut();
  }

  haptic(kind) {
    try {
      if (!this.game.state.settings.haptics) return;
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.haptic;
      if (h) h.postMessage(kind);
      else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 40 : kind === 'success' ? [20, 60, 30] : 12);
    } catch (e) {
      /* no haptics available */
    }
  }

  save() {
    const g = this.game;
    const s = g.state;
    if (!g.started) return false;
    s.time = g.env.time;
    s.day = g.env.day;
    s.health = Math.max(30, Math.round(g.player.health));
    let P = g.player.mode === 'drive' ? g.car.exitPoint(1) : g.player.pos;
    let yaw = g.player.yaw;
    // out on the boat: remember that, and a spot on the shore to fall back on
    const aboard = g.player.mode === 'boat' || !!g.player.boat;
    if (aboard) P = g.boat.shoreSpot() || g.hotrod.exitPoint(1);
    // in the air: the edge you launched from
    if (g.player.mode === 'glide' && g.glider.from) {
      P = g.glider.from;
      yaw = g.glider.from.yaw;
    }
    // on the rock: the foot of the route, a step out from it
    if (g.player.mode === 'climb' && g.climbing.route) {
      const r = g.climbing.route;
      P = { x: r.base.x + r.n.x * 0.6, z: r.base.z + r.n.z * 0.6 };
      yaw = Math.atan2(r.n.x, r.n.z);
    }
    s.player = { x: P.x, z: P.z, yaw, aboard };
    s.boat = g.boat.toJSON();
    s.car = { x: g.hotrod.pos.x, z: g.hotrod.pos.z, yaw: g.hotrod.yaw };
    s.racer = { x: g.racer.pos.x, z: g.racer.pos.z, yaw: g.racer.yaw };
    const ok = s.save();
    if (ok) g.hud.savedFlash();
    else if (!this.saveWarned) {
      // private browsing or blocked website data: say so instead of losing progress silently
      this.saveWarned = true;
      g.hud.toast("Can't save: this browser is blocking website data for this page", 'bad');
    }
    return ok;
  }

  // ------------------------------------------------------------- transitions
  fade(on, text = '') {
    const f = $('fade');
    f.textContent = text;
    f.classList.toggle('on', on);
  }

  async withFade(text, fn) {
    if (this.fadeBusy) return;
    this.fadeBusy = true;
    // a trip, a sleep or a knock-out gets you up out of a deck chair
    this.endGaze();
    this.fade(true, text);
    await new Promise((r) => setTimeout(r, 700));
    await fn();
    // after a jump, finish the ground detail while the screen is dark
    // instead of two chunks a frame after the fade has lifted
    const g = this.game;
    const at = g.player.mode === 'drive' ? g.car.pos : g.player.pos;
    g.terrain.prime(at.x, at.z);
    await new Promise((r) => setTimeout(r, 900));
    this.fade(false);
    this.fadeBusy = false;
  }

  // A soak in the hot pool: an hour gone, every ache with it.
  soak() {
    const g = this.game;
    const lines = [
      'Ahhh. Ruben forgets he ever drove a hot rod',
      'Your back stops aching. Your fingers go wrinkly',
      'A moose watches you soak. It looks jealous',
      'Pure bliss, with a faint smell of eggs',
    ];
    this.withFade('Ahhh…', () => {
      g.env.setTime(g.env.time + 1);
      if (g.env.time < 1) g.env.day++;
      g.player.health = g.player.maxHealth;
      g.bears.clearThreat();
      g.hud.toast(lines[Math.floor(Math.random() * lines.length)], 'good');
      g.onEvent({ type: 'soak', companion: g.visitor.following && Math.hypot(g.visitor.zib.pos.x - g.player.pos.x, g.visitor.zib.pos.z - g.player.pos.z) < 30 });
      g.jobs.onEvent('soak');
      this.save();
    });
  }

  // The machine at Mosquito Flats: two hours without the state bird.
  buyBugDope() {
    const g = this.game;
    const s = g.state;
    if (s.money < 15) {
      g.hud.toast('Fifteen dollars, please. The mosquitoes accept blood', 'bad');
      return;
    }
    s.money -= 15;
    g.audio.cash();
    g.bugDopeT = 120;
    g.hud.toast('Bug dope on. The mosquitoes sulk off to find a tourist', 'good');
  }

  // The sea chest in the Unsinkable II's wheelhouse.
  openChest() {
    const g = this.game;
    const s = g.state;
    if (s.flags.chest) return;
    s.flags.chest = true;
    s.addMoney(600);
    g.audio.cash();
    g.announcer.say('treasure', { sub: '$600!', kind: 'legend' });
    g.hud.toast("Inside: $600 in soggy bills, a captain's cap and an IOU for one boat, signed 'Gus'", 'money');
    this.save();
  }

  // Gus's secret, step one: his paraglider on the summit.
  takeGlider() {
    const g = this.game;
    const s = g.state;
    if (s.flags.glider) return;
    s.flags.glider = true;
    g.audio.chime();
    g.announcer.say('glider', { sub: 'PROPERTY OF GUS', kind: 'legend' });
    g.hud.toast(`A note on the sack: '${GUS_NOTES[0].text}'`, 'good', 8);
    setTimeout(() => g.hud.hint(IS_TOUCH ? 'Face a long drop and tap GLIDE' : 'Face a long drop and press E to GLIDE', 6), 3000);
    g.onEvent({ type: 'glider' });
    this.save();
  }

  // Step two: the key in the grotto on the ledge.
  takeKey() {
    const g = this.game;
    const s = g.state;
    if (s.flags.key) return;
    s.flags.key = true;
    g.audio.chime();
    g.announcer.say('key', { sub: 'GUS LEFT A NOTE', kind: 'legend' });
    g.hud.toast(`A brass key in a tin, and a note: '${GUS_NOTES[1].text}'`, 'good', 8);
    g.onEvent({ type: 'key' });
    this.save();
  }

  // Step three: Gus's chest behind Bear Falls.
  openGoldChest() {
    const g = this.game;
    const s = g.state;
    if (s.flags.treasure) return;
    if (!s.flags.key) {
      g.audio.tick(1);
      g.hud.toast('Locked tight. A brass keyhole, and a G scratched in the lid', 'bad');
      return;
    }
    s.flags.treasure = true;
    s.addMoney(5000);
    if (!s.gear.lures.includes('gold')) s.gear.lures.push('gold');
    g.audio.cash();
    g.audio.chime();
    g.announcer.say('treasure', { sub: "GUS'S GOLD!", kind: 'legend' });
    g.hud.toast("$5,000 in gold nuggets, and Gus's Golden Spoon is in your tackle box", 'money', 6);
    g.haptic('success');
    g.onEvent({ type: 'treasure' });
    this.save();
  }

  // Little things that happen at the newer places.
  updatePlaces(dt) {
    const g = this.game;
    const P = g.player;
    // bug dope wears off whether you walk, drive or float
    g.bugDopeT = Math.max(0, (g.bugDopeT || 0) - dt);
    if (P.mode !== 'foot') return;
    // aboard the Unsinkable II
    const D = g.props.wreckDeck;
    if (D && P.onDeck && !g.state.flags.deck && Math.hypot(P.pos.x - D.x, P.pos.z - D.z) < 14) {
      g.state.flags.deck = true;
      g.hud.toast('Welcome aboard the Unsinkable II. Mind the holes', 'good');
      g.onEvent({ type: 'deck' });
    }
    // Mosquito Flats: the state bird has opinions
    const bog = g.areas.near('flats', 90, 200);
    if (bog > 0.5 && g.bugDopeT <= 0) {
      this.mozzieT = (this.mozzieT ?? 12) - dt;
      if (this.mozzieT <= 0) {
        this.mozzieT = 35 + Math.random() * 30;
        const lines = [
          'A mosquito the size of a sparrow lands on your arm',
          'Bzzz. Something just drank a cup of your blood',
          'The mosquitoes have formed a union. They want more Ruben',
          'Bug dope is sold by the giant mosquito. Coincidence?',
        ];
        g.hud.toast(lines[Math.floor(Math.random() * lines.length)]);
        g.audio.buzz?.();
      }
    }
  }

  sleep() {
    const g = this.game;
    this.withFade('Zzz…', () => {
      const t = g.env.time;
      if (t > 6.5) g.env.day++;
      g.env.setTime(6.5);
      g.player.health = g.player.maxHealth;
      g.bears.clearThreat();
      g.hud.toast(`Day ${g.env.day}. Rise and shine, Ruben`, 'good');
      this.save();
    });
  }

  fastTravel(id, hours) {
    const g = this.game;
    const p = g.world.place(id);
    const pk = g.props.layout.parking[id];
    if (!p || !pk) return;
    if (g.player.mode === 'boat' || g.player.boat) {
      g.hud.toast('Get ashore first. The boat stays where you leave it');
      return;
    }
    if (g.player.mode === 'glide') {
      g.hud.toast('Land first. The hot rod does not fly');
      return;
    }
    if (g.player.mode === 'climb') {
      g.hud.toast('Lower off first: you are on the rope');
      return;
    }
    g.fishing.cancel();
    g.hunting.reset();
    this.withFade(`Driving to ${p.name}…`, () => {
      g.glider.end();
      const wasDriving = g.player.mode === 'drive';
      // on foot the hot rod comes along; in the race car, the race car
      const car = wasDriving ? g.car : g.hotrod;
      car.place(pk.x, pk.z, pk.yaw);
      // the other car is parked there already: stop beside it
      const other = car === g.hotrod ? g.racer : g.hotrod;
      if (Math.hypot(other.pos.x - pk.x, other.pos.z - pk.z) < 5.5) car.place(pk.x + Math.cos(pk.yaw) * 4.6, pk.z - Math.sin(pk.yaw) * 4.6, pk.yaw);
      car.speed = 0;
      if (!wasDriving) {
        const ex = car.exitPoint(1);
        g.player.place(ex.x, ex.z, Math.atan2(-(p.x - ex.x), -(p.z - ex.z)));
      }
      g.env.setTime(g.env.time + hours);
      if (g.env.time < hours) g.env.day++;
      g.bears.clearThreat();
      g.scatter.lastPos.set(1e9, 0, 0);
      this.discover(p, true);
      this.save();
    });
  }

  knockedOut() {
    const g = this.game;
    if (this.koBusy) return;
    // another fade is running (a soak, a fast travel): try again once it is over
    if (this.fadeBusy) {
      if (!this.koRetry)
        this.koRetry = setTimeout(() => {
          this.koRetry = null;
          if (this.mode === 'play' && g.player.health <= 0) this.knockedOut();
        }, 400);
      return;
    }
    this.koBusy = true;
    g.fishing.cancel();
    g.hunting.reset();
    const s = g.state;
    const lost = s.cooler.length;
    const fee = Math.min(s.money, Math.round(s.money * 0.1));
    this.withFade('Mauled by a grizzly…', () => {
      s.cooler = [];
      s.money -= fee;
      if (g.climbing.active) g.climbing.finish('foot');
      if (g.player.mode === 'drive') this.exitCar(true);
      if (g.player.mode === 'boat' || g.player.boat) g.boat.leave(true);
      g.glider.end();
      this.placeAtStart();
      g.player.health = 60;
      // three hours out cold, and no waking before eight
      const t = g.env.time + 3;
      if (t >= 24) g.env.day++;
      g.env.setTime(Math.max(8, t % 24));
      g.bears.clearThreat();
      this.koBusy = false;
      g.hud.toast(`A ranger patched you up. Lost ${lost} fish and paid ${formatMoney(fee)}`, 'bad');
      this.save();
    });
  }

  enterCar(car = this.game.hotrod) {
    const g = this.game;
    g.fishing.cancel();
    g.hunting.reset();
    g.player.mode = 'drive';
    g.car = car;
    car.occupied = true;
    car.camYaw = 0;
    car.camPitch = car.spec.cam.pitch;
    g.input.leftZoneMode = 'move';
    g.hud.setCar?.(car);
    if (car === g.racer) {
      g.audio.racerStart?.();
      if (!g.state.flags.racerDriven) {
        g.state.flags.racerDriven = true;
        g.hud.hint('It sits two fingers off the ground: crawl it to the road, then let it fly. No headlights.', 7);
      } else g.hud.hint(IS_TOUCH ? 'Hold GAS, steer by dragging on the left.' : 'W gas, S brake, A/D steer, C camera, E to get out.', 4);
      return;
    }
    g.audio.door?.();
    g.hud.hint(IS_TOUCH ? 'Hold GAS, steer by dragging on the left. Camera button for the outside view.' : 'W gas, S brake, A/D steer, C camera, H horn, E to get out.', 5);
  }

  // Speed marks in the race car, and the best top speed kept.
  racerRecords(car) {
    const g = this.game;
    const s = g.state;
    const kmh = Math.abs(car.speed) * 3.6;
    if (kmh > (s.racerTop || 0) + 0.5) s.racerTop = Math.round(kmh);
    for (const mark of [200, 250, 300]) {
      if (kmh >= mark && !s.flags['racer' + mark]) {
        s.flags['racer' + mark] = true;
        g.announcer.say('speed', { sub: `${mark} KM/H`, kind: 'legend' });
        g.audio.chime();
        g.onEvent({ type: 'racerSpeed', kmh: mark });
      }
    }
  }

  // Under the tarp at the end of the logging track.
  revealRacer() {
    const g = this.game;
    const s = g.state;
    if (s.flags.racer) return;
    s.flags.racer = true;
    g.pitstop.reveal();
    g.audio.chime();
    g.audio.tarpPull?.();
    g.announcer.say('racer', { sub: 'IN THE MIDDLE OF THE WOODS', kind: 'legend' });
    g.hud.toast("A Formula One car under a tarp, keys in it. A note on the seat: 'Back after the salmon run. Do not touch. The team'", 'good', 8);
    setTimeout(() => g.hud.hint(IS_TOUCH ? 'Walk up to it and tap DRIVE' : 'Walk up to it and press E to DRIVE', 5), 3500);
    g.haptic('success');
    g.onEvent({ type: 'racer' });
    this.save();
  }

  // ------------------------------------------------------------ the sky
  // Lie back in a deck chair at the observatory: the night slows to a game
  // hour every two minutes and the sky guide names what is up there. Any
  // move gets you up again.
  startGaze(chair) {
    const g = this.game;
    const P = g.player;
    g.fishing.cancel();
    g.hunting.reset();
    this.gaze = { tool: P.tool };
    P.place(chair.x, chair.z, chair.yaw ?? 0);
    P.eye = 0.95;
    P.pitch = 0.7;
    P.moveLocked = true;
    if (P.tool !== 'camera') {
      P.tool = 'none';
      g.viewmodel.setTool('none');
    }
    g.env.stargazing = true;
    g.skyguide.forced = true;
    g.audio.tick(1);
    g.hud.hint(IS_TOUCH ? 'Drag to look around the sky. Move to get up.' : 'Look around the sky. The night passes slower here. Move to get up.', 6);
  }

  endGaze() {
    const g = this.game;
    if (!this.gaze) return;
    const P = g.player;
    P.moveLocked = false;
    P.eye = 1.66;
    P.pitch = Math.min(P.pitch, 0.3);
    g.env.stargazing = false;
    g.skyguide.forced = false;
    P.tool = this.gaze.tool;
    g.viewmodel.setTool(P.tool === 'camera' ? 'none' : P.tool);
    this.gaze = null;
  }

  // From the observatory: sit out the evening until the stars come out.
  waitForDark() {
    const g = this.game;
    const t = g.env.time;
    if (t < 5 || t >= 22.8) return;
    this.withFade('Waiting for the stars…', () => {
      g.env.setTime(23);
      g.bears.clearThreat();
      g.hud.toast('Dark at last. The stars are out', 'good');
      this.save();
    });
  }

  // The sky in the camera's view: the Moon, the northern lights, the Milky
  // Way, the space station and meteors, about 550 m out along their
  // directions (see gameplay/camera.js).
  skySubjects() {
    const g = this.game;
    const env = g.env;
    const eye = g.camera.position;
    const out = [];
    const clear = env.weather.cloud < 0.8;
    if (!clear) return out;
    // (placed 550 m out for the camera's framing; far is how far away or
    // how high it really is, for the viewfinder and the album)
    const at = (id, dir, size, far) => {
      if (dir.y < 0.03) return;
      out.push({ id, x: eye.x + dir.x * 550, y: eye.y + dir.y * 550, z: eye.z + dir.z * 550, size, far });
    };
    const km = (n) => `${Math.round(n).toLocaleString('en-GB')} km away`;
    const moon = env.uniforms.uMoonPos.value;
    if (env.astro && env.astro.moon.illum > 0.08) at('moon', moon, 12, km(env.astro.moon.km));
    if (env.uniforms.uAurora.value > 0.25) at('aurora', this._north || (this._north = new THREE.Vector3(0, Math.sin(0.45), -Math.cos(0.45))), 300, '100 to 300 km up');
    if (env.night > 0.8 && env.moonUp < 0.35) at('milkyway', eqVector(300, 36, this._mw || (this._mw = new THREE.Vector3())).applyMatrix3(env.uniforms.uEq.value), 250, '26,000 light-years to its centre');
    if (g.satellites.issVisible) {
      // the straight line to a station 420 km up, seen this high
      const v = g.satellites.issDir;
      const R = 6371;
      const s = Math.max(0, v.y);
      at('iss', v, 8, km(Math.round((Math.sqrt((R + 420) ** 2 - R * R * (1 - s * s)) - R * s) / 10) * 10));
    }
    for (const k of g.meteors.streaks) {
      if (!k.active || k.t / k.dur > 0.85) continue;
      const head = k.from.clone().lerp(k.to, Math.min(1, (k.t / k.dur) * 1.05)).normalize();
      const big = k.width > 3;
      at(big ? 'fireball' : 'meteor', head, big ? 60 : 30, big ? '20 to 100 km up' : 'about 100 km up');
    }
    return out;
  }

  // The night's space weather: an alert at dusk when a storm is due, and
  // the strongest aurora you have seen kept in the sky log.
  updateSkyEvents(dt) {
    const g = this.game;
    const env = g.env;
    const s = g.state;
    const sw = env.spaceWeather;
    const night = sw.nightOf(env);
    if (night !== this.alertNight && env.time > 21.2 && env.time < 22.9) {
      this.alertNight = night;
      // (tonight's own Kp: the space weather may not have caught up yet
      // on the first frame after a Continue)
      const kp = kpForNight(Math.max(1, night));
      if (kp >= 5) {
        g.announcer.say('storm', { sub: `KP ${kp}: ${KP_WORDS[kp].toUpperCase()}`, kind: 'legend' });
        g.hud.toast(`Aurora alert: a geomagnetic storm tonight (Kp ${kp}, ${KP_WORDS[kp]}). The northern lights may reach overhead, red at the top. Find a dark spot with a view north`, 'good', 8);
      }
    }
    // the meteor outburst: the observatory calls it at dusk on a clear night
    if (g.visitor.stage() === 'due' && night !== this.outburstNight && env.time > 21.4 && env.time < 23.5 && env.weather.cloud < 0.7) {
      this.outburstNight = night;
      g.announcer.say('storm', { sub: 'METEOR OUTBURST TONIGHT', kind: 'legend' });
      g.hud.toast('The Tundra Observatory calls a meteor outburst tonight: the Kappa Cygnids, slow and bright, pouring out of Cygnus high overhead. Watch it through the telescope', 'good', 9);
    }
    const aur = env.uniforms.uAurora.value;
    if (aur > 0.3 && env.weather.cloud < 0.7 && sw.kp > (s.sky.kpMax || 0)) {
      this.aurT = (this.aurT || 0) + dt;
      if (this.aurT > 4) {
        this.aurT = 0;
        s.sky.kpMax = sw.kp;
        if (sw.kp >= 4) g.hud.toast(`The northern lights at Kp ${sw.kp}: your strongest aurora yet`, 'good', 5);
        this.onEvent({ type: 'aurora', kp: sw.kp });
      }
    }
  }

  // Where to step out of the car: the driver's side, or the other side when
  // that is deep water or blocked.
  exitSpot() {
    const g = this.game;
    const car = g.car;
    for (const side of [1, -1]) {
      const e = car.exitPoint(side);
      const w = g.world.waterAt(e.x, e.z);
      if (w && w.depth > 0.8) continue;
      const r = g.colliders.resolve(e.x, e.z, 0.4, car.pos.y, 1.8);
      if (Math.hypot(r.x - e.x, r.z - e.z) < 0.3) return e;
    }
    return car.exitPoint(1);
  }

  exitCar(force = false) {
    const g = this.game;
    const car = g.car;
    car.driver.visible = false;
    if (!force && Math.abs(car.speed) > 3) {
      g.hud.toast('Stop the car first');
      return;
    }
    const spot = this.exitSpot();
    car.occupied = false;
    car.speed = 0;
    g.player.mode = 'foot';
    g.player.place(spot.x, spot.z, car.yaw + Math.PI + (Math.random() - 0.5) * 0.2);
    g.player.yaw = car.yaw + car.camYaw + Math.PI;
    g.player.pitch = -0.05;
  }

  // --------------------------------------------------------------- discovery
  discover(p, silent = false) {
    const g = this.game;
    if (g.state.discovered[p.id]) return;
    g.state.discovered[p.id] = true;
    if (!silent) {
      g.hud.placeTitle('Discovered', p.name);
      g.audio.chime();
    }
    g.onEvent({ type: 'discover', id: p.id });
    this.save();
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    if (!g.state) return;
    const input = g.input;
    g.audio.update(dt, g);
    if (this.mode === 'title') {
      this.updateTitle(dt);
      g.skyguide.update(dt);
      input.endFrame();
      return;
    }
    if (g.menuOpen) {
      g.paused = true;
      g.skyguide.update(dt);
      // the dome and the dish turn to what the observatory's screen picks
      g.observatory.update(dt);
      g.player.applyCamera(g.camera);
      if (g.player.mode === 'climb') g.climbing.applyCamera(g.camera);
      else if (g.player.mode === 'drive') g.car.applyCamera(g.camera, 0, input);
      else if (g.player.mode === 'boat') g.boat.applyCamera(g.camera, 0, input);
      else if (g.player.mode === 'glide') g.glider.applyCamera(g.camera);
      input.endFrame();
      return;
    }
    g.paused = false;
    const P = g.player;
    const car = g.car;
    // the Tesla coil's story, once its show is over and no screen is open
    if (this.coilNoteT > 0) {
      this.coilNoteT -= dt;
      if (this.coilNoteT <= 0) {
        const n = g.tesla.coilNote();
        g.screens.note(n.title, n.html);
      }
    }

    // tool switch: rod, longbow, camera (once bought), empty hands (Q
    // cycles, 1 2 3 4 pick directly)
    if (P.mode === 'foot' && g.fishing.state === 'idle' && !g.hud.blocking && !this.gaze) {
      let next = null;
      const hasCam = g.photo.owned();
      if (input.pressed('tool') || input.keyPressed('KeyQ')) next = P.tool === 'rod' ? 'bow' : P.tool === 'bow' ? (hasCam ? 'camera' : 'none') : P.tool === 'camera' ? 'none' : 'rod';
      else if (input.keyPressed('Digit1')) next = 'rod';
      else if (input.keyPressed('Digit2')) next = 'bow';
      else if (input.keyPressed('Digit3')) next = 'none';
      else if (input.keyPressed('Digit4') && hasCam) next = 'camera';
      if (next && next !== P.tool) {
        P.tool = next;
        // the camera goes up to the eye: no hands in the picture
        g.viewmodel.setTool(next === 'camera' ? 'none' : next);
        g.hunting.reset();
        g.audio.tick(1);
      }
    }
    if (input.pressed('secondary') && P.mode === 'foot' && P.tool === 'rod' && g.fishing.state === 'idle') g.screens.open('lure');
    // RUN: tap to run, tap again to walk
    if (P.mode === 'foot' && input.pressed('run')) {
      P.running = !P.running;
      g.audio.tick(1);
    }
    if (input.pressed('med') || input.keyPressed('KeyX')) {
      if (g.state.gear.medkit > 0 && P.health < P.maxHealth) {
        g.state.gear.medkit--;
        P.health = P.maxHealth;
        g.hud.toast('Patched up with the first aid kit', 'good');
      }
    }

    // interactions
    this.updateInteraction();
    const ia = g.interaction;
    if (ia && (input.pressed('interact') || input.keyPressed('KeyE') || input.keyPressed('KeyF'))) ia.act();
    else if (g.interaction2 && (input.pressed('interact2') || input.keyPressed('KeyV'))) g.interaction2.act();

    // lying back in a deck chair: any move gets you up, and so does dawn
    if (this.gaze) {
      const mv = input.readMove();
      if (Math.hypot(mv.x, mv.y) > 0.5 || P.mode !== 'foot') this.endGaze();
      else if (g.env.night < 0.15) {
        this.endGaze();
        g.hud.toast('Dawn. The stars fade, and the chair is cold', 'good');
      }
    }
    if (P.mode === 'foot') {
      P.update(dt, input);
      // place the camera now so fishing and hunting use this frame's view
      P.applyCamera(g.camera);
      g.camera.updateMatrixWorld();
    } else if (P.mode === 'climb') {
      // on the rock at the Granite Tors (see gameplay/climbing.js)
      g.climbing.update(dt, input);
      if (P.mode === 'climb') {
        P.pos.set(g.climbing.body.x, g.climbing.body.y - 1.0, g.climbing.body.z);
        P.tick(dt);
      }
    } else if (P.mode === 'boat') {
      // at the tiller: the camera button swaps the seat and the chase view
      if (input.pressed('cam') || input.keyPressed('KeyC')) g.boat.camMode = g.boat.camMode === 'seat' ? 'chase' : 'seat';
      if (input.pressed('horn') || input.keyPressed('KeyH')) {
        g.audio.horn();
        g.wildlife.scare(g.boat.pos.x, g.boat.pos.z, 80);
      }
      P.pos.copy(g.boat.pos);
      P.tick(dt);
    } else if (P.mode === 'glide') {
      g.glider.update(dt, input);
      P.tick(dt);
    } else {
      // driving controls
      if (input.pressed('cam') || input.keyPressed('KeyC')) car.camMode = car.camMode === 'cockpit' ? 'chase' : 'cockpit';
      if (input.pressed('horn') || input.keyPressed('KeyH')) {
        // a race car has no horn: the radio squawks instead
        if (car === g.racer) g.audio.radioBeep?.();
        else {
          g.audio.horn();
          g.wildlife.scare(car.pos.x, car.pos.z, 80);
        }
      }
      P.pos.copy(car.pos);
      P.tick(dt);
      if (car === g.racer) this.racerRecords(car);
    }
    g.hotrod.update(dt, input, g.state);
    // the race car only matters near the camera or with you in it
    if (g.racer.occupied || g.racer.pos.distanceToSquared(g.camera.position) < 400 * 400) g.racer.update(dt, input, g.state);
    g.pitstop.update(dt);
    g.boat.update(dt, input);
    const inRod = P.mode === 'drive' && car === g.hotrod;
    const inRacer = P.mode === 'drive' && car === g.racer;
    g.audio.updateEngine(g.hotrod.rpm || 850, g.hotrod.throttle, inRod ? 0 : g.hotrod.pos.distanceTo(g.camera.position), g.hotrod.occupied);
    g.audio.updateRacer?.(g.racer.rpm, g.racer.throttle, inRacer ? 0 : g.racer.pos.distanceTo(g.camera.position), g.racer.occupied);

    g.fishing.update(dt);
    g.hunting.update(dt);
    g.photo.update(dt);
    g.wildlife.update(dt);
    g.fish.update(dt);
    g.insects.update(dt);
    g.areas.update(dt);
    g.bigfoot.update(dt);
    g.secret.update(dt);
    g.oddities.update(dt);
    this.updatePlaces(dt);
    g.bears.update(dt);
    g.observatory.update(dt);
    g.solarwalk.update(dt);
    // one budget a frame for all the sculpting going on (the statue, Zib):
    // two at once never take longer than one would
    // (Zib first: it is small and quick, the statue takes the rest)
    g.sculptLeft = 3;
    g.visitor.update(dt);
    g.tesla.update(dt);
    g.scientists.update();
    g.meteors.update(dt);
    g.satellites.update(dt);
    this.updateSkyEvents(dt);

    // camera
    if (P.mode === 'foot') P.applyCamera(g.camera);
    else if (P.mode === 'climb') g.climbing.applyCamera(g.camera);
    else if (P.mode === 'glide') g.glider.applyCamera(g.camera);
    else if (P.mode === 'boat') g.boat.applyCamera(g.camera, dt, input);
    else car.applyCamera(g.camera, dt, input);
    g.camera.updateMatrixWorld();
    g.focus = P.mode === 'drive' ? car.pos : P.mode === 'boat' ? g.boat.pos : P.pos;

    // aiming the bow narrows the view, more with the bow sight; the camera
    // zooms through its lens
    const camUp = P.mode === 'foot' && P.tool === 'camera';
    const zoom = camUp ? 1 / g.photo.zoom : g.hunting.aiming ? (g.state.gear.sight ? 0.5 : 0.66) : 1;
    g.zoom = damp(g.zoom || 1, zoom, 14, dt);
    const fov = g.baseFov * g.zoom;
    if (Math.abs(g.camera.fov - fov) > 0.01) {
      g.camera.fov = fov;
      g.camera.updateProjectionMatrix();
    }

    // viewmodel: the rod, the bow or the camera on foot, the brakes in the air
    g.overlay.enabled = P.mode === 'foot' || P.mode === 'glide' || P.mode === 'climb';
    g.viewmodel.visible = P.mode === 'foot' || P.mode === 'glide' || P.mode === 'climb';
    g.viewmodel.update(dt, { bobPhase: P.bobPhase, bobAmt: P.bobAmt, lookDX: P.lookDelta.x, lookDY: P.lookDelta.y });

    // discovery
    const pos = P.mode === 'drive' ? car.pos : P.pos;
    for (const p of g.world.places) {
      if (g.state.discovered[p.id]) continue;
      const r = p.kind === 'landmark' ? 90 : 70;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < r) this.discover(p);
    }

    // salmon runs come and go
    this.runT -= dt;
    if (this.runT <= 0) {
      this.runT = 240 + Math.random() * 240;
      const s = g.state;
      if (s.salmonRun) {
        s.salmonRun = null;
      } else {
        const opts = ['bend', 'falls', 'landing'];
        const id = opts[Math.floor(Math.random() * opts.length)];
        s.salmonRun = { place: id };
        const pl = g.world.place(id);
        g.hud.toast(`Salmon run at ${pl.name}! Bears will be out too`, 'good');
      }
    }

    // env map refresh when the light changes: every 4 degrees of the sun,
    // not more often than every 5 seconds, and not at all deep in the night
    // (the dark sky barely changes)
    this.envT -= dt;
    const el = g.env.sunElevation;
    const last = this.lastEnvElevation ?? -999;
    // (and when the cloud cover has changed: shade turns grey under a grey sky)
    const greyer = Math.abs((g.env.overcast || 0) - (this.lastEnvOvercast ?? 0)) > 0.25;
    if (this.envT <= 0 && (Math.abs(el - last) > 4 || greyer) && !(el < -12 && last < -12)) {
      this.envT = 5;
      this.updateEnvMap();
    }

    // autosave
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 45;
      this.save();
    }

    g.skyguide.update(dt);
    // stars and planets as big on a sharp screen as on any other
    g.env.starfield.uniforms.uScale.value = g.renderer.getPixelRatio();
    g.hud.update(dt);
    input.endFrame();
  }

  updateInteraction() {
    const g = this.game;
    const P = g.player;
    const car = g.hotrod;
    const R = g.racer;
    const B = g.boat;
    let ia = null;
    // a second action beside the first: the boat's launch, load and board
    let ia2 = null;
    // nothing to do mid-cast, mid-fight, with the catch card up, in the air
    // or while the screen fades (a trip, a sleep, a soak)
    if ((g.fishing.state !== 'idle' && g.fishing.state !== 'catch') || g.hud.blocking || P.mode === 'glide' || P.mode === 'climb' || this.fadeBusy) {
      g.interaction = g.interaction2 = null;
      return;
    }
    if (P.mode === 'drive') {
      ia = { label: 'EXIT', icon: 'car', act: () => this.exitCar() };
      // the boat rides behind the hot rod only
      if (g.car === car && B.canLaunch()) ia2 = { label: 'LAUNCH', icon: 'boat', act: () => B.launch() };
      else if (g.car === car && B.canLoad()) ia2 = { label: 'LOAD BOAT', icon: 'boat', act: () => B.load() };
    } else if (P.mode === 'boat') {
      if (Math.abs(B.speed) < 1.5) ia = { label: 'FISH', icon: 'rod', act: () => B.fishHere() };
      if (B.canLoad()) ia2 = { label: 'LOAD BOAT', icon: 'boat', act: () => B.load() };
      else if (Math.abs(B.speed) < 1.5 && B.nearShore()) ia2 = { label: 'ASHORE', icon: 'hand', act: () => B.leave() };
    } else if (P.boat) {
      // fishing from the anchored boat
      ia = { label: 'DRIVE', icon: 'boat', act: () => B.takeHelm() };
      if (B.nearShore()) ia2 = { label: 'ASHORE', icon: 'hand', act: () => B.leave() };
    } else {
      const dCar = Math.hypot(car.pos.x - P.pos.x, car.pos.z - P.pos.z);
      if (dCar < 3.6) ia = { label: 'DRIVE', icon: 'car', act: () => this.enterCar(car) };
      // the race car: first the tarp, then the keys
      const dR = Math.hypot(R.pos.x - P.pos.x, R.pos.z - P.pos.z);
      if (dR < 4.3 && !g.state.flags.racer) ia = { label: 'PULL TARP', icon: 'hand', act: () => this.revealRacer() };
      else if (dR < 3.9 && g.state.flags.racer && !(dCar < dR && ia)) ia = { label: 'DRIVE', icon: 'car', act: () => this.enterCar(R) };
      for (const it of g.props.interactions) {
        const d = Math.hypot(it.x - P.pos.x, it.z - P.pos.z);
        if (d < it.r) {
          if (it.id === 'post') ia = { label: 'TRADE', icon: 'bag', act: () => g.screens.open('shop') };
          if (it.id === 'soak') ia = { label: 'SOAK', icon: 'hand', act: () => this.soak() };
          if (it.id === 'bugdope') ia = { label: 'BUG DOPE $15', icon: 'bag', act: () => this.buyBugDope() };
          if (it.id === 'chest' && Math.abs(P.pos.y - it.y) < 1.6 && !g.state.flags.chest) ia = { label: 'OPEN', icon: 'claim', act: () => this.openChest() };
          // Gus's secret (see world/secret.js)
          const fl = g.state.flags;
          if (it.id === 'glider' && !fl.glider && Math.abs(P.pos.y - it.y) < 2) ia = { label: 'TAKE PARAGLIDER', icon: 'glide', act: () => this.takeGlider() };
          if (it.id === 'key' && !fl.key && Math.abs(P.pos.y - it.y) < 2) ia = { label: 'TAKE KEY', icon: 'key', act: () => this.takeKey() };
          if (it.id === 'goldchest' && !fl.treasure && Math.abs(P.pos.y - it.y) < 1.6) ia = { label: 'OPEN', icon: fl.key ? 'key' : 'claim', act: () => this.openGoldChest() };
          // the strange things in the woods (see world/oddities.js)
          if (it.id.startsWith('odd:')) ia = g.oddities.action(it.id.slice(4)) || ia;
          // the Granite Tors (see world/tors.js): climb from the foot of a
          // route, lower off from its anchor on the top
          if (it.id.startsWith('climb:')) {
            const r = g.tors.route(it.id.slice(6));
            if (r && Math.abs(P.pos.y - r.ground) < 2.5) ia = { label: `CLIMB ${r.grade}`, icon: 'hand', act: () => g.climbing.start(r.id) };
          }
          if (it.id.startsWith('lower:')) {
            const r = g.tors.route(it.id.slice(6));
            if (r && Math.abs(P.pos.y - it.y) < 1.5) ia = { label: 'LOWER OFF', icon: 'hand', act: () => g.climbing.lowerFromTop(r.id) };
          }
          if (it.id === 'register' && Math.abs(P.pos.y - it.y) < 1.5) ia = { label: g.state.climb.signed ? 'READ THE REGISTER' : 'SIGN THE REGISTER', icon: 'book', act: () => this.signRegister() };
          if (it.id === 'sample' && Math.abs(P.pos.y - it.y) < 1.5 && (!g.state.climb.sample || (g.state.job && !g.state.job.done && g.state.job.id === 'geologist'))) ia = { label: 'TAKE A ROCK SAMPLE', icon: 'rock', act: () => this.takeSample() };
          // the Tesla Memorial at Bear Falls (see world/tesla.js)
          if (it.id === 'tesla' && Math.abs(P.pos.y - it.y) < 1.6) ia = { label: 'READ THE PLAQUE', icon: 'book', act: () => this.readTesla() };
          // the scientists' busts (see world/scientists.js)
          if (it.id.startsWith('bust:') && Math.abs(P.pos.y - it.y) < 1.8) {
            const id = it.id.slice(5);
            ia = { label: 'READ THE PLAQUE', icon: 'book', act: () => this.readBust(id) };
          }
          if (it.id === 'coil') ia = { label: g.tesla.coilRunning ? 'CRACKLING' : 'RUN THE TESLA COIL', icon: 'bolt', act: () => this.runCoil() };
          if (it.id === 'hydro') ia = { label: 'BEAR FALLS HYDRO', icon: 'book', act: () => this.readHydro() };
          // Zib, the visitor from the sky (see gameplay/visitor.js)
          if (it.id === 'zib') ia = g.visitor.action() || ia;
          // the Tundra Observatory (see world/observatory.js)
          if (it.id === 'scope') ia = { label: 'TELESCOPE', icon: 'scope', act: () => g.screens.open('telescope', { tab: 'scope' }) };
          if (it.id === 'radio') ia = { label: 'RADIO DISH', icon: 'dish', act: () => g.screens.open('telescope', { tab: 'radio' }) };
          if (it.id === 'board') ia = { label: 'TONIGHT', icon: 'book', act: () => g.screens.open('telescope', { tab: 'tonight' }) };
          if (it.id === 'chair' && Math.abs(P.pos.y - it.y) < 1.4 && !this.gaze) {
            const t = g.env.time;
            if (g.env.night > 0.4) ia = { label: 'STARGAZE', icon: 'star', act: () => this.startGaze(g.observatory.chairNear(P.pos)) };
            else if (t >= 5 && t < 22.8) ia = { label: 'WAIT FOR DARK', icon: 'clock', act: () => this.waitForDark() };
          }
          if (it.id === 'cabin') {
            const t = g.env.time;
            const canSleep = t > 19.5 || t < 5;
            ia = {
              label: canSleep ? 'SLEEP' : 'REST',
              icon: 'bed',
              act: () => {
                if (canSleep) this.sleep();
                else {
                  g.hud.toast('Too early to sleep. Saved your progress', 'good');
                  g.player.health = g.player.maxHealth;
                  this.save();
                }
              },
            };
          }
        }
      }
      const claim = g.hunting.claimable();
      if (claim) ia = { label: 'CLAIM', icon: 'claim', act: () => g.hunting.claim(claim) };
      // a fireball's stone
      if (g.meteors.near(P.pos)) ia = { label: 'PICK UP', icon: 'rock', act: () => g.meteors.pickUp() };
      if (this.gaze) {
        ia = { label: 'GET UP', icon: 'hand', act: () => this.endGaze() };
        ia2 = null;
      }
      if (B.canBoard()) ia2 = { label: 'BOARD', icon: 'boat', act: () => B.board() };
      else if (B.owned) {
        // standing by the trailer
        const r = B.rear();
        const near = Math.hypot(r.x - P.pos.x, r.z - P.pos.z) < 7 || dCar < 6;
        if (near && B.canLaunch()) ia2 = { label: 'LAUNCH', icon: 'boat', act: () => B.launch() };
        else if (near && B.canLoad()) ia2 = { label: 'LOAD BOAT', icon: 'boat', act: () => B.load() };
      }
      // at an edge with Gus's paraglider
      if ((!ia || !ia2) && g.glider.offer()) {
        const glide = { label: 'GLIDE', icon: 'glide', act: () => g.glider.launch() };
        if (!ia) ia = glide;
        else ia2 = glide;
      }
    }
    g.interaction = ia;
    g.interaction2 = ia2;
  }

  updateTitle(dt) {
    const g = this.game;
    g.paused = true;
    this.titleT += dt;
    // hero shot: the hot rod at the cabin with the river behind, drifting slowly
    const car = g.hotrod;
    const cam = g.camera;
    const a = car.yaw + 0.75 + Math.sin(this.titleT * 0.07) * 0.35;
    const r = 8.2;
    const x = car.pos.x + Math.sin(a) * r;
    const z = car.pos.z + Math.cos(a) * r;
    const y = Math.max(g.world.heightAt(x, z) + 1.4, car.pos.y + 1.8);
    cam.position.set(x, y, z);
    // frame the car in the lower right, clear of the logo and the menu,
    // whatever the screen shape
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const yawOff = Math.atan(0.6 * tanV * cam.aspect);
    const pitchOff = Math.atan(0.46 * tanV);
    const pitch0 = Math.atan2(car.pos.y + 0.7 - y, r);
    cam.rotation.set(pitch0 + pitchOff, a + yawOff, 0, 'YXZ');
    cam.updateMatrixWorld();
    g.focus = g.camera.position;
    g.env.advance(dt * 0.3);
    g.wildlife.update(dt);
    g.hotrod.update(dt, g.input, g.state);
  }

}

async function boot() {
  const stage = $('stage');
  const fill = $('load-fill');
  const label = $('load-label');
  const game = new Game(stage);
  window.__rhf = { game };
  try {
    await game.init((f, l) => {
      fill.style.width = Math.round(f * 100) + '%';
      if (l) label.textContent = l;
    });
    const session = new Session(game);
    window.__rhf.session = session;
    await session.setup();
    // every shader compiles now, while the loading bar is up
    label.textContent = 'Preparing the view';
    fill.style.width = '96%';
    await new Promise((r) => requestAnimationFrame(() => r()));
    await Promise.race([session.warm, new Promise((r) => setTimeout(r, 15000))]);
    session.finishWarmUp();
    fill.style.width = '100%';
    $('loading').hidden = true;
    session.showTitle();
    game.start();
    window.__rhf.ready = true;
    // artifact viewer hot-reload hook (no-op elsewhere)
    try {
      window.claude?.hot?.snapshot?.(() => game.state.toJSON());
    } catch (e) {
      /* optional */
    }
    // debug helpers for automated tests
    Object.assign(window.__rhf, {
      // the fish tables, for checks that go through every species
      data: { FISH, LEGENDS, lengthFor },
      start: (cont = false) => session.startGame(cont),
      tp: (id) => {
        const p = game.world.place(id);
        game.player.place(p.x, p.z, p.face ?? 0);
      },
      time: (h) => game.env.setTime(h),
      // finish the ground detail around the camera (screenshots after a jump)
      settle: () => game.terrain.prime(game.camera.position.x, game.camera.position.z),
      god: (on = true) => (game.godMode = on),
      press: (name) => {
        const b = game.input.button(name);
        b.pressed = true;
        b.down = true;
        setTimeout(() => {
          b.down = false;
          b.released = true;
        }, 60);
      },
      hold: (name, on) => {
        const b = game.input.button(name);
        if (on && !b.down) b.pressed = true;
        if (!on && b.down) b.released = true;
        b.down = on;
      },
    });
  } catch (err) {
    console.error(err);
    label.textContent = 'Could not start: ' + err.message;
  }
}

boot();
