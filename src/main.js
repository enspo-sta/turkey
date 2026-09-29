// Entry point and gameplay orchestration: boot, title screen, modes (on foot,
// driving), interactions, discovery, sleeping, fast travel, saving and events.
import * as THREE from 'three';
import { Game, IS_TOUCH } from './game.js';
import { Input } from './ui/input.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { GameState } from './gameplay/state.js';
import { Player } from './entities/player.js';
import { HotRod } from './entities/hotrod.js';
import { Viewmodel } from './entities/viewmodel.js';
import { Fishing } from './gameplay/fishing.js';
import { Hunting } from './gameplay/hunting.js';
import { Wildlife } from './entities/wildlife.js';
import { Bears } from './gameplay/bears.js';
import { Effects } from './world/effects.js';
import { AudioEngine } from './audio/audio.js';
import { LURES, CHALLENGES } from './gameplay/data.js';
import { formatMoney, clamp, damp, wrapAngle } from './util/math.js';
import { ROAD_HALF } from './world/worldgen.js';

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
    g.scene.add(g.hotrod.group);
    g.viewmodel = new Viewmodel(g);
    g.overlay = { scene: g.viewmodel.scene, camera: g.viewmodel.camera, enabled: false };
    g.fishing = new Fishing(g);
    g.hunting = new Hunting(g);
    g.wildlife = new Wildlife(g);
    g.bears = new Bears(g);
    g.hud = new HUD(g);
    g.screens = new Screens(g);
    g.onEvent = (ev) => this.onEvent(ev);
    g.save = () => this.save();
    g.fastTravel = (id, hours) => this.fastTravel(id, hours);
    g.toTitle = () => this.toTitle();
    g.haptic = (kind) => this.haptic(kind);
    g.events = { emit: (type, data) => this.onPlayerEvent(type, data) };
    g.addSystem(this);
    // Bear Falls mist emitter
    const W = g.world;
    const fp = W.river.sample(W.fallsS + 3);
    g.fallsMist = new THREE.Vector3(fp.x, W.riverLevel(W.fallsS + 3), fp.z);
    g.fallsMist.w = W.riverWidth(W.fallsS) * 1.6;
    g.fallsMist.dz = 0;
    // environment map for chrome and paint
    this.pmrem = new THREE.PMREMGenerator(g.renderer);
    this.envScene = new THREE.Scene();
    const skyClone = new THREE.Mesh(g.env.sky.geometry, g.env.skyMaterial);
    this.envScene.add(skyClone);
    this.updateEnvMap();
    // resize hooks
    const resize = () => {
      const w = g.container.clientWidth;
      const h = g.container.clientHeight;
      g.effects.resize(w, h, g.dpr);
      g.fishing.resize(w * g.dpr, h * g.dpr);
      g.viewmodel.resize(w, h);
      this.checkOrientation();
    };
    g.systems.push({ resize });
    resize();
    this.bindTitle();
    this.bindKeys();
    // place the car at the cabin for the title shot
    this.placeAtStart(true);
    this.precompile();
  }

  // Compile every shader up front so the first rifle shot, fish or bear
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
    show(g.wildlife.group);
    show(g.viewmodel.scene);
    show(g.fishing.float);
    show(g.fishing.line);
    show(g.hotrod.group);
    const probe = g.wildlife.jumperModels;
    void probe;
    try {
      g.renderer.compile(g.scene, g.camera);
      g.renderer.compile(g.viewmodel.scene, g.viewmodel.camera);
    } catch (e) {
      /* compile is only an optimisation */
    }
    for (const c of hidden) c.visible = false;
    for (const h of Object.values(g.wildlife.herds)) {
      h.mesh.count = 0;
      h.mesh.visible = false;
    }
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
    g.audio.stopEngine();
    this.showTitle();
  }

  startGame(continueSave) {
    const g = this.game;
    g.audio.unlock();
    const s = g.state;
    if (continueSave) s.load();
    else {
      s.wipe();
    }
    s.started = true;
    g.started = true;
    $('title').hidden = true;
    g.hud.show(true);
    g.overlay.enabled = true;
    g.env.setTime(s.time);
    g.env.day = s.day;
    g.player.health = s.health || 100;
    g.player.mode = 'foot';
    g.hotrod.occupied = false;
    g.hotrod.driver.visible = false;
    g.player.tool = 'rod';
    g.viewmodel.setTool('rod');
    g.hotrod.setPaint(s.gear.paint);
    if (continueSave && s.car) g.hotrod.place(s.car.x, s.car.z, s.car.yaw);
    else this.placeAtStart();
    if (continueSave && s.player) g.player.place(s.player.x, s.player.z, s.player.yaw);
    else {
      // start on the riverbank in front of the cabin, facing the water
      const landing = g.world.place('landing');
      g.player.place(landing.x, landing.z, landing.face);
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
      if (e.code === 'Escape' && !g.screens.isOpen && !g.hud.blocking) {
        if (g.hunting.scoped) g.hunting.setScoped(false);
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
      else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 40 : 12);
    } catch (e) {
      /* no haptics available */
    }
  }

  save() {
    const g = this.game;
    const s = g.state;
    if (!g.started) return;
    s.time = g.env.time;
    s.day = g.env.day;
    s.health = Math.max(30, Math.round(g.player.health));
    const P = g.player.mode === 'drive' ? g.hotrod.exitPoint(1) : g.player.pos;
    s.player = { x: P.x, z: P.z, yaw: g.player.yaw };
    s.car = { x: g.hotrod.pos.x, z: g.hotrod.pos.z, yaw: g.hotrod.yaw };
    s.save();
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
    await new Promise((r) => setTimeout(r, 900));
    this.fade(false);
    this.fadeBusy = false;
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
    g.fishing.cancel();
    g.hunting.setScoped(false);
    this.withFade(`Driving to ${p.name}…`, () => {
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
    this.koBusy = true;
    g.fishing.cancel();
    g.hunting.setScoped(false);
    const s = g.state;
    const lost = s.cooler.length;
    const fee = Math.min(s.money, Math.round(s.money * 0.1));
    this.withFade('Mauled by a grizzly…', () => {
      s.cooler = [];
      s.money -= fee;
      if (g.player.mode === 'drive') this.exitCar(true);
      this.placeAtStart();
      g.player.health = 60;
      g.env.setTime(Math.max(8, g.env.time + 3));
      g.bears.clearThreat();
      this.koBusy = false;
      g.hud.toast(`A ranger patched you up. Lost ${lost} fish and paid ${formatMoney(fee)}`, 'bad');
      this.save();
    });
  }

  enterCar() {
    const g = this.game;
    g.fishing.cancel();
    g.hunting.setScoped(false);
    g.player.mode = 'drive';
    g.hotrod.occupied = true;
    g.hotrod.camYaw = 0;
    g.hotrod.camPitch = -0.05;
    g.input.leftZoneMode = 'move';
    g.audio.tone?.('square', 200, 0.05, 0.05);
    g.hud.hint(IS_TOUCH ? 'Hold GAS, steer by dragging on the left. Camera button for the outside view.' : 'W gas, S brake, A/D steer, C camera, H horn, E to get out.', 5);
  }

  exitCar(force = false) {
    const g = this.game;
    const car = g.hotrod;
    car.driver.visible = false;
    if (!force && Math.abs(car.speed) > 3) {
      g.hud.toast('Stop the car first');
      return;
    }
    let spot = null;
    for (const side of [1, -1]) {
      const e = car.exitPoint(side);
      const w = g.world.waterAt(e.x, e.z);
      if (w && w.depth > 0.8) continue;
      const r = g.colliders.resolve(e.x, e.z, 0.4, car.pos.y, 1.8);
      if (Math.hypot(r.x - e.x, r.z - e.z) < 0.3) {
        spot = e;
        break;
      }
    }
    if (!spot) spot = car.exitPoint(1);
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
      input.endFrame();
      return;
    }
    g.paused = false;
    const P = g.player;
    const car = g.hotrod;

    // tool switch
    if ((input.pressed('tool') || input.keyPressed('KeyQ')) && P.mode === 'foot' && g.fishing.state === 'idle' && !g.hud.blocking) {
      P.tool = P.tool === 'rod' ? 'rifle' : 'rod';
      g.viewmodel.setTool(P.tool);
      g.hunting.setScoped(false);
      g.audio.tick(1);
    }
    if (input.pressed('secondary') && P.mode === 'foot' && P.tool === 'rod' && g.fishing.state === 'idle') g.screens.open('lure');
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

    if (P.mode === 'foot') {
      P.update(dt, input);
    } else {
      // driving controls
      if (input.pressed('cam') || input.keyPressed('KeyC')) car.camMode = car.camMode === 'cockpit' ? 'chase' : 'cockpit';
      if (input.pressed('horn') || input.keyPressed('KeyH')) {
        g.audio.horn();
        g.wildlife.scare(car.pos.x, car.pos.z, 80);
      }
      P.pos.copy(car.pos);
    }
    car.update(dt, input, g.state);
    g.audio.updateEngine(car.rpm || 850, car.throttle, P.mode === 'drive' ? 0 : car.pos.distanceTo(g.camera.position), car.occupied);

    g.fishing.update(dt);
    g.hunting.update(dt);
    g.wildlife.update(dt);
    g.bears.update(dt);

    // camera
    if (P.mode === 'foot') P.applyCamera(g.camera);
    else car.applyCamera(g.camera, dt, input);
    g.camera.updateMatrixWorld();
    g.focus = P.mode === 'drive' ? car.pos : P.pos;

    // zoom for the scope
    const zoom = g.hunting.scoped ? (g.state.gear.scope ? 0.125 : 0.25) : 1;
    g.zoom = damp(g.zoom || 1, zoom, 14, dt);
    const fov = g.baseFov * g.zoom;
    if (Math.abs(g.camera.fov - fov) > 0.01) {
      g.camera.fov = fov;
      g.camera.updateProjectionMatrix();
    }

    // viewmodel
    g.overlay.enabled = P.mode === 'foot';
    g.viewmodel.visible = P.mode === 'foot';
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
    let ia = null;
    if (g.fishing.state !== 'idle' && g.fishing.state !== 'catch') {
      g.interaction = null;
      return;
    }
    if (P.mode === 'drive') {
      ia = { label: 'EXIT', icon: 'car', act: () => this.exitCar() };
    } else {
      const dCar = Math.hypot(car.pos.x - P.pos.x, car.pos.z - P.pos.z);
      if (dCar < 3.6) ia = { label: 'DRIVE', icon: 'car', act: () => this.enterCar() };
      for (const it of g.props.interactions) {
        const d = Math.hypot(it.x - P.pos.x, it.z - P.pos.z);
        if (d < it.r) {
          if (it.id === 'post') ia = { label: 'TRADE', icon: 'bag', act: () => g.screens.open('shop') };
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
    }
    g.interaction = ia;
  }

  updateTitle(dt) {
    const g = this.game;
    g.paused = true;
    this.titleT += dt;
    const landing = g.world.place('landing');
    const L = g.props.layout;
    const c = L.cabin;
    const t = this.titleT * 0.035;
    const cx = (landing.x + c.x) / 2;
    const cz = (landing.z + c.z) / 2;
    const r = 34;
    const x = cx + Math.sin(t + 0.6) * r;
    const z = cz + Math.cos(t + 0.6) * r;
    const y = Math.max(g.world.heightAt(x, z) + 7, landing.y + 9);
    g.camera.position.set(x, y, z);
    g.camera.lookAt(cx, landing.y + 2.5, cz);
    g.camera.updateMatrixWorld();
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
