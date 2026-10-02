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
import { Screens } from './ui/screens.js';
import { GameState } from './gameplay/state.js';
import { Player } from './entities/player.js';
import { HotRod } from './entities/hotrod.js';
import { Boat } from './entities/boat.js';
import { Areas } from './world/areas.js';
import { Viewmodel } from './entities/viewmodel.js';
import { Fishing } from './gameplay/fishing.js';
import { Hunting } from './gameplay/hunting.js';
import { Wildlife } from './entities/wildlife.js';
import { AmbientFish } from './entities/ambientfish.js';
import { Insects } from './entities/insects.js';
import { makeFishModel } from './entities/fishmodels.js';
import { Bears } from './gameplay/bears.js';
import { Effects } from './world/effects.js';
import { Calving } from './world/calving.js';
import { AudioEngine } from './audio/audio.js';
import { LURES, CHALLENGES } from './gameplay/data.js';
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
    g.boat = new Boat(g);
    g.scene.add(g.hotrod.group);
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
    g.screens = new Screens(g);
    g.onEvent = (ev) => this.onEvent(ev);
    g.save = () => this.save();
    g.fastTravel = (id, hours) => this.fastTravel(id, hours);
    g.onPostChanged = () => {
      if (this.fishProbes) this.precompile();
    };
    g.onQualityDrop = (name) => g.hud.toast(`Graphics set to ${name.toUpperCase()} to keep the game smooth. Change it in Settings.`);
    g.toTitle = () => this.toTitle();
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
    this.updateEnvMap();
    // resize hooks
    const resize = () => {
      const w = g.container.clientWidth;
      const h = g.container.clientHeight;
      g.effects.resize(w, h, g.dpr);
      g.fishing.resize(w * g.dpr, h * g.dpr);
      g.viewmodel.resize(w, h);
      g.hud.minimap?.resize();
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
    // every light (the hot rod's headlight too) also shines in the water
    // reflections, so the probe and the main view share one light setup
    g.scene.traverse((o) => {
      if (o.isLight) o.layers.enable(REFLECT_LAYER);
    });
    this.precompile();
  }

  // Compile every shader up front so the first arrow, fish or bear
  // does not stall a frame.
  precompile() {
    const g = this.game;
    const hidden = [];
    const show = (o) => {
      o.traverse((c) => {
        if (!c.visible) {
          hidden.push(c);
          c.visible = true;
        }
      });
    };
    for (const h of Object.values(g.wildlife.herds)) {
      h.mesh.count = Math.max(1, h.mesh.count);
    }
    const arrowCount = g.hunting.mesh.count;
    g.hunting.mesh.count = Math.max(1, arrowCount);
    show(g.wildlife.group);
    show(g.viewmodel.scene);
    show(g.fishing.float);
    show(g.fishing.line);
    show(g.hotrod.group);
    show(g.insects.group);
    show(g.glider.canopy);
    for (const s of [g.secret.glint, ...g.secret.glows]) if (s) show(s);
    // a fish in the world (under water, fog) and in the hands (no fog), so the
    // first bite and the first catch do not stall on shader compiles
    const fishWorld = makeFishModel('pink');
    const fishHand = makeFishModel('pink');
    g.scene.add(fishWorld);
    g.viewmodel.scene.add(fishHand);
    try {
      // the world is compiled for the buffer it is drawn into (the High
      // finish draws it in linear light), the hands for the screen
      g.renderer.setRenderTarget(g.post.worldTarget);
      g.renderer.compile(g.scene, g.camera);
      g.renderer.setRenderTarget(null);
      g.renderer.compile(g.viewmodel.scene, g.viewmodel.camera);
    } catch (e) {
      /* compile is only an optimisation */
    }
    g.renderer.setRenderTarget(null);
    // keep the probes (not their place in the scenes): disposing them would
    // release the compiled programs again
    fishWorld.removeFromParent();
    fishHand.removeFromParent();
    this.fishProbes = [fishWorld, fishHand];
    for (const c of hidden) c.visible = false;
    for (const h of Object.values(g.wildlife.herds)) {
      h.mesh.count = 0;
      h.mesh.visible = false;
    }
    g.hunting.mesh.count = arrowCount;
  }

  updateEnvMap() {
    const g = this.game;
    try {
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 1, 5000);
      if (g.scene.environment) g.scene.environment.dispose?.();
      g.scene.environment = rt.texture;
      g.scene.environmentIntensity = 0.6 + (1 - g.env.night) * 0.4;
      this.lastEnvElevation = g.env.sunElevation;
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
    if (g.player.mode === 'drive') this.exitCar(true);
    if (g.player.mode === 'boat' || g.player.boat) g.boat.leave(true);
    g.glider.end();
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
    s.started = true;
    g.started = true;
    $('title').hidden = true;
    g.hud.show(true);
    g.overlay.enabled = true;
    g.env.setTime(s.time);
    g.env.day = s.day;
    g.player.health = s.health || 100;
    g.glider.end();
    g.player.mode = 'foot';
    g.player.boat = null;
    g.hotrod.occupied = false;
    g.hotrod.driver.visible = false;
    g.player.tool = 'rod';
    g.viewmodel.setTool('rod');
    g.hotrod.setPaint(s.gear.paint);
    g.hotrod.setLook(s.look);
    g.viewmodel.setBowWood(s.gear.yew);
    g.viewmodel.applyLook(s.look);
    if (continueSave && s.car) g.hotrod.place(s.car.x, s.car.z, s.car.yaw);
    else this.placeAtStart();
    if (continueSave && s.player) g.player.place(s.player.x, s.player.z, s.player.yaw);
    else {
      // start on the riverbank in front of the cabin, facing the water
      const landing = g.world.place('landing');
      g.player.place(landing.x, landing.z, landing.face);
    }
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
    } else g.hud.toast(`Welcome back. ${formatMoney(s.money)} in the tin`);
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

  // ---------------------------------------------------------------- events
  onEvent(ev) {
    const g = this.game;
    const done = g.state.event(ev);
    for (const c of done) {
      g.hud.toast(`Challenge complete: ${c.text} (+${formatMoney(c.reward)})`, 'money');
      g.audio.cash();
    }
    if (done.length) {
      const next = g.state.currentChallenge();
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
    let P = g.player.mode === 'drive' ? g.hotrod.exitPoint(1) : g.player.pos;
    let yaw = g.player.yaw;
    // out on the boat: remember that, and a spot on the shore to fall back on
    const aboard = g.player.mode === 'boat' || !!g.player.boat;
    if (aboard) P = g.boat.shoreSpot() || g.hotrod.exitPoint(1);
    // in the air: the edge you launched from
    if (g.player.mode === 'glide' && g.glider.from) {
      P = g.glider.from;
      yaw = g.glider.from.yaw;
    }
    s.player = { x: P.x, z: P.z, yaw, aboard };
    s.boat = g.boat.toJSON();
    s.car = { x: g.hotrod.pos.x, z: g.hotrod.pos.z, yaw: g.hotrod.yaw };
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
    this.fade(true, text);
    await new Promise((r) => setTimeout(r, 700));
    await fn();
    // after a jump, finish the ground detail while the screen is dark
    // instead of two chunks a frame after the fade has lifted
    const g = this.game;
    const at = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
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
      g.onEvent({ type: 'soak' });
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
    g.fishing.cancel();
    g.hunting.reset();
    this.withFade(`Driving to ${p.name}…`, () => {
      g.glider.end();
      const wasDriving = g.player.mode === 'drive';
      g.hotrod.place(pk.x, pk.z, pk.yaw);
      g.hotrod.speed = 0;
      if (!wasDriving) {
        const ex = g.hotrod.exitPoint(1);
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

  enterCar() {
    const g = this.game;
    g.fishing.cancel();
    g.hunting.reset();
    g.player.mode = 'drive';
    g.hotrod.occupied = true;
    g.hotrod.camYaw = 0;
    g.hotrod.camPitch = -0.05;
    g.input.leftZoneMode = 'move';
    g.audio.tone?.('square', 200, 0.05, 0.05);
    g.hud.hint(IS_TOUCH ? 'Hold GAS, steer by dragging on the left. Camera button for the outside view.' : 'W gas, S brake, A/D steer, C camera, H horn, E to get out.', 5);
  }

  // Where to step out of the car: the driver's side, or the other side when
  // that is deep water or blocked.
  exitSpot() {
    const g = this.game;
    const car = g.hotrod;
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
    const car = g.hotrod;
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
      input.endFrame();
      return;
    }
    if (g.menuOpen) {
      g.paused = true;
      g.player.applyCamera(g.camera);
      if (g.player.mode === 'drive') g.hotrod.applyCamera(g.camera, 0, input);
      else if (g.player.mode === 'boat') g.boat.applyCamera(g.camera, 0, input);
      else if (g.player.mode === 'glide') g.glider.applyCamera(g.camera);
      input.endFrame();
      return;
    }
    g.paused = false;
    const P = g.player;
    const car = g.hotrod;

    // tool switch: rod, longbow, camera (once bought), empty hands (Q
    // cycles, 1 2 3 4 pick directly)
    if (P.mode === 'foot' && g.fishing.state === 'idle' && !g.hud.blocking) {
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

    if (P.mode === 'foot') {
      P.update(dt, input);
      // place the camera now so fishing and hunting use this frame's view
      P.applyCamera(g.camera);
      g.camera.updateMatrixWorld();
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
        g.audio.horn();
        g.wildlife.scare(car.pos.x, car.pos.z, 80);
      }
      P.pos.copy(car.pos);
      P.tick(dt);
    }
    car.update(dt, input, g.state);
    g.boat.update(dt, input);
    g.audio.updateEngine(car.rpm || 850, car.throttle, P.mode === 'drive' ? 0 : car.pos.distanceTo(g.camera.position), car.occupied);

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

    // camera
    if (P.mode === 'foot') P.applyCamera(g.camera);
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
    g.overlay.enabled = P.mode === 'foot' || P.mode === 'glide';
    g.viewmodel.visible = P.mode === 'foot' || P.mode === 'glide';
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

    // env map refresh when the light changes
    this.envT -= dt;
    if (this.envT <= 0 && Math.abs(g.env.sunElevation - (this.lastEnvElevation ?? -999)) > 3) {
      this.envT = 2;
      this.updateEnvMap();
    }

    // autosave
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 45;
      this.save();
    }

    g.hud.update(dt);
    input.endFrame();
  }

  updateInteraction() {
    const g = this.game;
    const P = g.player;
    const car = g.hotrod;
    const B = g.boat;
    let ia = null;
    // a second action beside the first: the boat's launch, load and board
    let ia2 = null;
    // nothing to do mid-cast, mid-fight, with the catch card up, in the air
    // or while the screen fades (a trip, a sleep, a soak)
    if ((g.fishing.state !== 'idle' && g.fishing.state !== 'catch') || g.hud.blocking || P.mode === 'glide' || this.fadeBusy) {
      g.interaction = g.interaction2 = null;
      return;
    }
    if (P.mode === 'drive') {
      ia = { label: 'EXIT', icon: 'car', act: () => this.exitCar() };
      if (B.canLaunch()) ia2 = { label: 'LAUNCH', icon: 'boat', act: () => B.launch() };
      else if (B.canLoad()) ia2 = { label: 'LOAD BOAT', icon: 'boat', act: () => B.load() };
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
      if (dCar < 3.6) ia = { label: 'DRIVE', icon: 'car', act: () => this.enterCar() };
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
