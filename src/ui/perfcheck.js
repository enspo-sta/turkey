// The performance check (Settings, during a game): about 15 seconds of play
// measured on the device itself, to say what holds the frame rate back.
//
// It records, frame by frame, the time from one frame to the next and the
// processor's own work on each: first at the graphics as they are, then at
// the lowest resolution. From those it tells apart:
// - full speed: about 60 frames a second, nothing to fix;
// - the graphics chip: fewer pixels make the frames quicker;
// - the processor: the game's own work fills the frame, and fewer pixels
//   do not help;
// - a cap: frames held at a steady 30 a second while the processor idles
//   half the time, and fewer pixels do not help (Safari in Low Power Mode,
//   or a hot phone).
// The result ends in one line to copy and send, with the device, the
// graphics and the state of the sound in it.
//
// The detailed check (Settings, "Detailed check"; see startDetailed) is for
// the developer: it times each part of the drawing in turn.
import * as THREE from 'three';

const SETTLE = 2;
const MEASURE = 6;
const SETTLE_LOW = 1.5;
const MEASURE_LOW = 5;

// The detailed check's frames: settle and timed frames a state, the
// with/base repeats, warm-up frames a window, frames before each picture of
// the pixel check, and the seconds of play timed at the end. The quick set
// is for the headless test (tools/scenarios/perf-breakdown-check.json): its
// numbers mean nothing; it checks that every window gives one and that all
// is put back.
const DETAIL = { settle: 3, frames: 15, reps: 3, warm: 2, check: 2, fpsSecs: 4, maxWall: 600000 };
const DETAIL_QUICK = { settle: 0, frames: 1, reps: 1, warm: 1, check: 1, fpsSecs: 1, maxWall: 600000 };
// the two resolutions of every window, and A0's
const HI = 2;
const LO = 0.5;
const LADDER = [0.5, 1, 1.5, 2];
const EXTRA_DRAWS = 100;
const EXTRA_TREES = 160;
const DRAWS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'];

export class PerfCheck {
  constructor(game) {
    this.game = game;
    this.run = null;
    this.result = null;
    // the longest a check may take, in ms
    this.maxWall = 90000;
  }

  get busy() {
    return !!this.run || !!this.detailRun;
  }

  // The verdict for a record made elsewhere (the checks in tools/ use it).
  analyse(r) {
    return analyse(r, this.game);
  }

  // Starts the check; onDone(result) is called at the end (result.cancelled
  // when the player opened a menu or left the game meanwhile).
  start(onDone) {
    const g = this.game;
    if (this.busy || !g.started) return false;
    const steady = { q: g.qualityName, d: g.dpr };
    const low = g.minDpr(g.qualityName);
    this.run = { phase: 'settle', t: 0, began: performance.now(), base: [], low: [], steady, lowDpr: low, onDone };
    g.adaptHold = true;
    this.status = g.hud.toast('Checking performance: stand still and look ahead for 15 seconds', '', 15);
    g.frameProbe = (dt, cpu) => this.sample(dt, cpu);
    return true;
  }

  sample(dt, cpu) {
    const g = this.game;
    const r = this.run;
    if (!r) return;
    if (g.menuOpen || !g.started) {
      this.finish(true);
      return;
    }
    if (!(dt > 0)) return;
    // (a frame held for seconds is the page hidden, not the game's work)
    if (dt > 2) return;
    r.t += dt;
    // never more than a minute and a half, however slow the device
    if (performance.now() - r.began > this.maxWall && r.base.length) {
      this.finish(false);
      return;
    }
    if (r.phase === 'settle') {
      if (r.t >= SETTLE) this.next('base');
    } else if (r.phase === 'base') {
      r.base.push([dt * 1000, cpu]);
      if (r.t >= MEASURE) {
        if (r.lowDpr < g.dpr - 0.01) {
          g.setLevel(g.qualityName, r.lowDpr);
          this.next('settleLow');
        } else this.finish(false);
      }
    } else if (r.phase === 'settleLow') {
      if (r.t >= SETTLE_LOW) this.next('low');
    } else if (r.phase === 'low') {
      r.low.push([dt * 1000, cpu]);
      if (r.t >= MEASURE_LOW) this.finish(false);
    }
  }

  next(phase) {
    this.run.phase = phase;
    this.run.t = 0;
  }

  finish(cancelled) {
    const g = this.game;
    const r = this.run;
    this.run = null;
    g.frameProbe = null;
    g.setLevel(r.steady.q, r.steady.d);
    g.adaptHold = false;
    if (this.status) {
      this.status.classList.add('out');
      this.status = null;
    }
    const res = cancelled ? { cancelled: true } : analyse(r, g);
    this.result = res;
    r.onDone?.(res);
  }

  // ------------------------------------------------------------- detailed
  // The detailed check: about four minutes standing still, for the
  // developer rather than the player. Safari has no timer for the graphics
  // chip, so each part of the drawing is timed by what the frame costs
  // without it, or with a known amount of work added: the windows of
  // detailWindows.
  // Frames are timed one at a time, not from one to the next (those come
  // in whole refreshes of the screen and hide anything smaller): each draws
  // the world, then reads back one pixel of the screen, which waits until
  // the graphics chip has finished. Nothing moves meanwhile (the clock
  // stopped, the reflection drawn on the same face every frame), so every
  // frame has the same work. A state's time is the median of its frames
  // after a few to settle; a window runs as base, with, base, with, base,
  // with, base, and its cost is each "with" against the mean of the bases
  // either side.
  // Every window runs at 2.00x and at 0.50x resolution. At 0.50x a
  // sixteenth of the pixels is left, so the cost there is nearly all the
  // part that does not grow with the resolution, and the difference is the
  // part that does. Frames timed one at a time lose the overlap of the
  // processor and the graphics chip, so they are longer than the frames of
  // play: only the differences count. It ends with the frame rate as
  // played, at the player's own setting, and one line to copy and send.
  // opts: quick (one frame a state, once: the headless test), maxWall (ms).
  startDetailed(onDone, opts = {}) {
    const g = this.game;
    if (this.busy || !g.started || g.frameOverride) return false;
    const cfg = { ...(opts.quick ? DETAIL_QUICK : DETAIL) };
    if (opts.maxWall) cfg.maxWall = opts.maxWall;
    this.runs = (this.runs || 0) + 1;
    const r = {
      cfg,
      onDone,
      quick: !!opts.quick,
      n: this.runs,
      began: performance.now(),
      now: performance.now(),
      saved: { q: g.qualityName, d: g.dpr, timeScale: g.env.timeScale, hud: g.hud.root.hidden, autoUpdate: g.renderer.shadowMap.autoUpdate },
      ladder: [],
      undo: null,
      done: 0,
      outOfTime: false,
      restored: false,
      stop: false,
    };
    this.detailRun = r;
    g.adaptHold = true;
    // High, the clock stopped, the view clear of the HUD
    g.setLevel('high', g.maxDpr('high'));
    g.env.timeScale = 0;
    g.hud.show(false);
    g.input.resetAll();
    r.list = this.detailWindows();
    const states = 1 + LADDER.length + 2 * (1 + r.list.length * 2 * cfg.reps);
    r.total = r.list.length + states + r.list.filter((w) => w.sw).length;
    r.it = this.detailScript();
    // the HUD is hidden: a note of its own says how far it has gone, and a
    // tap on it stops the check (as do a menu and the page being hidden)
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'perf-status';
    el.addEventListener('click', () => this.finishDetail(!r.restored, 'you tapped it'));
    (document.getElementById('app') || document.body).appendChild(el);
    r.el = el;
    this.tick(0);
    r.onHide = () => {
      if (document.hidden) this.finishDetail(!r.restored, 'the page was hidden');
    };
    document.addEventListener('visibilitychange', r.onHide);
    r.step = () => this.detailStep();
    g.frameOverride = r.step;
    return true;
  }

  // Each frame, from the game's loop, in place of the game's own frame.
  detailStep() {
    const g = this.game;
    const r = this.detailRun;
    if (!r) return;
    r.now = performance.now();
    const why = g.menuOpen ? 'a menu was opened' : !g.started ? 'the game ended' : document.hidden ? 'the page was hidden' : g.renderer.getContext().isContextLost() ? 'the graphics were reset' : null;
    if (why) {
      // (once everything is back, the last window is plain play: a menu or
      // a hidden page only ends it early)
      if (!r.restored) return this.finishDetail(true, why);
      r.stop = true;
    }
    if (r.now - r.began > r.cfg.maxWall) r.outOfTime = true;
    let s;
    try {
      s = r.it.next();
    } catch (e) {
      console.error(e);
      this.finishDetail(!r.restored, 'it failed: ' + (e && e.message));
      return;
    }
    if (s.done) this.finishDetail(false);
  }

  *detailScript() {
    const g = this.game;
    const r = this.detailRun;
    const c = r.cfg;
    // every window once, so that no shader is built and no buffer made for
    // the first time inside a timed state
    this.setDpr(HI);
    for (const w of r.list) {
      if (r.outOfTime) break;
      r.undo = w.apply();
      for (let i = 0; i < c.warm; i++) {
        this.timedFrame();
        yield;
      }
      this.undoWindow();
      this.timedFrame();
      yield;
      this.tick();
    }
    // A0: the frame at four resolutions
    const size = new THREE.Vector2();
    for (const s of LADDER) {
      if (r.outOfTime) break;
      this.setDpr(s);
      const st = yield* this.state();
      g.renderer.getDrawingBufferSize(size);
      r.ladder.push({ s, ms: st.ms, js: st.js, px: size.x * size.y });
    }
    yield* this.detailPass(HI);
    // each switch of the optimisations: the picture with it off and on
    for (const w of r.list) if (w.sw && !r.outOfTime) yield* this.pixelCheck(w);
    yield* this.detailPass(LO);
    // everything as it was, then the frame rate as played
    this.restoreDetail();
    this.note('Last: the frame rate at your own setting, for a few seconds');
    const end = r.now + c.fpsSecs * 1000;
    const times = [];
    while (!r.stop && (r.now < end || times.length < 4)) {
      g.frame();
      times.push(r.now);
      yield;
    }
    // (the first frame carries the putting back)
    const t = times.slice(1);
    r.fps = t.length > 1 ? ((t.length - 1) * 1000) / (t[t.length - 1] - t[0]) : NaN;
  }

  // Every window at one resolution: base, then with and base again, reps
  // times.
  *detailPass(res) {
    const r = this.detailRun;
    if (r.outOfTime) return;
    this.setDpr(res);
    let base = yield* this.state();
    for (const w of r.list) {
      if (r.outOfTime) return;
      const t = [];
      const b = [base.ms];
      for (let k = 0; k < r.cfg.reps; k++) {
        r.undo = w.apply();
        t.push((yield* this.state()).ms);
        this.undoWindow();
        base = yield* this.state();
        b.push(base.ms);
      }
      const d = t.map((x, i) => x - (b[i] + b[i + 1]) / 2);
      w.res[res] = { d: median(d), spread: (Math.max(...d) - Math.min(...d)) / 2, t: median(t), b: median(b) };
    }
  }

  // One state: frames to settle, then the median of the timed ones.
  *state() {
    const c = this.detailRun.cfg;
    const ms = [];
    const js = [];
    for (let i = 0; i < c.settle + c.frames; i++) {
      const [a, b] = this.timedFrame();
      if (i >= c.settle) {
        ms.push(a);
        js.push(b);
      }
      yield;
    }
    this.tick();
    return { ms: median(ms), js: median(js) };
  }

  // The picture with a switch off and with it on, read back whole and
  // compared pixel by pixel: the optimisation must not change it on this
  // device either (its graphics chip and driver are not the headless
  // checks').
  *pixelCheck(w) {
    const r = this.detailRun;
    const s = w.sw;
    const was = s.get();
    r.undo = () => s.set(was);
    const shots = [];
    for (const on of [false, true]) {
      s.set(on);
      for (let i = 0; i < r.cfg.check; i++) {
        this.timedFrame();
        yield;
      }
      shots.push(this.timedFrame(true));
      yield;
    }
    this.undoWindow();
    const c = comparePixels(shots[0], shots[1]);
    w.px = c.n;
    w.maxd = c.max;
    this.tick();
  }

  // One frame of the world, timed to the end of the graphics chip's work:
  // [ms, the processor's part in ms], or with full the whole picture read
  // back.
  timedFrame(full = false) {
    const g = this.game;
    const probe = g.water.probe;
    // the reflection drawn on the same side face every frame (the game
    // turns through five), so that every frame has the same work
    if (probe && probe.ready) probe.next = 0;
    g.dt = 0;
    const t0 = performance.now();
    g.updateWorld(0);
    g.render();
    const t1 = performance.now();
    const px = this.readBack(full);
    const t2 = performance.now();
    // (the scenarios count frames by it)
    g.menuFrame = (g.menuFrame || 0) + 1;
    return full ? px : [t2 - t0, t1 - t0];
  }

  // The screen read back: one pixel, which makes the browser wait for the
  // graphics chip, or the whole picture.
  readBack(full) {
    const gl = this.game.renderer.getContext();
    const w = full ? gl.drawingBufferWidth : 1;
    const h = full ? gl.drawingBufferHeight : 1;
    const px = full ? new Uint8Array(w * h * 4) : this._px || (this._px = new Uint8Array(4));
    const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
    return px;
  }

  // The resolution, set past the preset's limits (the player's own level is
  // set back at the end).
  setDpr(d) {
    const g = this.game;
    if (Math.abs(g.dpr - d) < 0.001 && g.renderer.getPixelRatio() === d) return;
    g.dpr = d;
    g.renderer.setPixelRatio(d);
    g.resize();
  }

  undoWindow() {
    const r = this.detailRun;
    const u = r.undo;
    r.undo = null;
    if (u) u();
  }

  // One more step done: the note's percentage.
  tick(n = 1) {
    const r = this.detailRun;
    r.done += n;
    this.note(`Detailed check, ${Math.min(99, Math.round((100 * r.done) / Math.max(1, r.total)))}%: stand still. Tap here to stop.`);
  }

  note(text) {
    const el = this.detailRun?.el;
    if (el && el.textContent !== text) el.textContent = text;
  }

  // Everything as it was before the check; once only.
  restoreDetail() {
    const g = this.game;
    const r = this.detailRun;
    if (!r || r.restored) return;
    r.restored = true;
    try {
      this.undoWindow();
    } catch (e) {
      console.error(e);
    }
    const s = r.saved;
    g.renderer.shadowMap.autoUpdate = s.autoUpdate;
    g.env.timeScale = s.timeScale;
    g.setLevel(s.q, s.d);
    // (the check set the resolution itself, past the preset's limits)
    if (g.renderer.getPixelRatio() !== g.dpr) {
      g.renderer.setPixelRatio(g.dpr);
      g.resize();
    }
    g.hud.show(!s.hud);
    // (nothing tapped or dragged meanwhile carries over into play)
    g.input.resetAll();
  }

  finishDetail(cancelled, why) {
    const g = this.game;
    const r = this.detailRun;
    if (!r) return;
    this.restoreDetail();
    this.detailRun = null;
    if (g.frameOverride === r.step) g.frameOverride = null;
    g.adaptHold = false;
    document.removeEventListener('visibilitychange', r.onHide);
    r.el?.remove();
    this.disposeExtras();
    const res = cancelled ? { cancelled: true, detailed: true, why } : analyseDetail(r);
    if (!cancelled) this.detail = res;
    r.onDone?.(res);
  }

  // The windows, each { code, name, apply() -> undo }: what is switched off
  // or added for the "with" states. A: calibration; B: the passes besides
  // the view; C: what the view draws; D: the optimisations' own switches,
  // each also checked for an unchanged picture.
  detailWindows() {
    const g = this.game;
    const rr = g.renderer;
    const W = [];
    const add = (code, name, apply, more) => W.push({ code, name, apply, res: {}, ...more });
    const hide = (list) => () => {
      const was = list.map((o) => o.visible);
      for (const o of list) o.visible = false;
      return () => list.forEach((o, i) => (o.visible = was[i]));
    };

    // A: calibration
    // every draw call left out, every other call made: what is left is the
    // page's, Safari's and the driver's handling of the frame
    add('A1', 'no draw calls', () => {
      const gl = rr.getContext();
      const undo = DRAWS.filter((f) => gl[f]).map((f) => patch(gl, f, () => {}));
      return () => undo.forEach((u) => u());
    });
    // one draw's own cost, from 100 draws of a triangle of no size
    add('A2', `${EXTRA_DRAWS} more draws`, () => this.addExtra('draws'));
    // a vertex's cost, from a tree's vertices shaded and come to nothing
    // (160 trees of no size, each vertex through the trees' full shader)
    const tree = g.scatter.types.spruce?.meshes[0];
    if (tree) {
      const geo = tree.geometry;
      const verts = EXTRA_TREES * (geo.index ? geo.index.count : geo.attributes.position.count);
      add('A3', `${Math.round(verts / 1000)}k more vertices`, () => this.addExtra('trees'), { verts });
    }
    // the world's pixels left out (a 1x1 scissor on its buffer), its
    // vertices and draws kept
    add('A4', "world's pixels left out", () => {
      const t = g.post.worldTarget;
      if (!t) return () => {};
      const was = t.scissor.clone();
      const test = t.scissorTest;
      t.scissor.set(0, 0, 1, 1);
      t.scissorTest = true;
      return () => {
        t.scissor.copy(was);
        t.scissorTest = test;
      };
    });

    // B: the passes besides the view (nothing moves, so a frozen shadow map
    // or reflection stays exactly right)
    add('B1', 'shadow map frozen', () => {
      const sm = rr.shadowMap;
      const was = sm.autoUpdate;
      sm.autoUpdate = false;
      return () => (sm.autoUpdate = was);
    });
    add('B2', 'vegetation casts no shadow', () => noCasting(g.scatter.group, []));
    add('B3', 'objects cast no shadow', () => noCasting(g.scene, [g.scatter.group]));
    // the shadow map's colour image (never read) not stored: discarded by
    // a caster of nothing drawn last into it (one more draw: see A2)
    const gl = rr.getContext();
    if (gl.invalidateFramebuffer) add('B4', "shadow map's colour not stored", () => this.addExtra('tail'));
    // the stand-ins' matrices (shadowbatch.js) not filled in or uploaded
    // again, before the shadow map's pass (preload) or in it (load)
    add('B5', 'stand-in matrices not uploaded', () => {
      const sb = g.shadowBatch;
      if (!sb) return () => {};
      const fill = sb.fill;
      return patch(sb, 'fill', () => {
        if (sb.matrices) sb.loaded = sb.stamp;
        else fill.call(sb);
      });
    });
    // the reflection's face not drawn (the view then works out the places
    // of things itself, as when there is no reflection)
    add('B6', 'reflection frozen', () => {
      const probe = g.water.probe;
      if (!probe) return () => {};
      const render = g.render;
      const u1 = patch(probe, 'update', () => {});
      const u2 = patch(g, 'render', () => {
        g.matricesFresh = false;
        return render.call(g);
      });
      return () => {
        u2();
        u1();
      };
    });
    add('B7', 'waves and mountain-shadow band frozen', () => {
      const u = [patch(g.water.waves, 'render', () => {}), patch(g.lighting, 'update', () => {})];
      return () => u.forEach((f) => f());
    });

    // C: what the view draws
    // vegetation out of the view only: drawn into the shadow map's two
    // cascades as before
    add('C1', 'vegetation out of the view', () => {
      const sh = g.env.sun.shadow;
      const f0 = sh.getFrustum(0);
      const f1 = sh.getFrustum(1);
      const undo = [];
      g.scatter.group.traverse((o) => {
        if (!o.isMesh || !o.layers.isEnabled(0)) return;
        const culled = o.frustumCulled;
        o.frustumCulled = true;
        const u = patch(o, 'intersectsFrustum', (f) => f === f0 || f === f1);
        undo.push(() => {
          u();
          o.frustumCulled = culled;
        });
      });
      return () => undo.forEach((u) => u());
    });
    add('C2', 'grass and fireweed hidden', hide([g.grass.group]));
    // the far mountains out of the view (their copy in the reflection kept)
    add('C3', 'far mountains out of the view', () => {
      const off = [];
      g.farTerrain.traverse((o) => {
        if (o.isMesh && o.layers.isEnabled(0)) {
          o.layers.disable(0);
          off.push(o);
        }
      });
      return () => off.forEach((o) => o.layers.enable(0));
    });
    add('C4', 'ground hidden', hide([g.terrain.group]));
    // the ground's detail (its reads of the detail textures and its rules)
    // as one tone, in the view and the reflection (see terrain.js)
    add('C5', "ground's detail as one tone", () => {
      const mats = [g.terrainMaterial, g.terrainReflectMaterial].filter(Boolean);
      const was = mats.map((m) => m.defines);
      for (const m of mats) {
        m.defines = { ...(m.defines || {}), TERRAIN_LITE: '' };
        m.needsUpdate = true;
      }
      return () =>
        mats.forEach((m, i) => {
          m.defines = was[i];
          m.needsUpdate = true;
        });
    });
    const objects = [g.props, g.observatory, g.pitstop, g.tors, g.solarwalk, g.tesla, g.scientists, g.hotrod, g.racer, g.boat, g.wildlife, g.insects, g.bigfoot].map((s) => s && s.group);
    add('C6', 'objects hidden', hide([...objects, g.fish && g.fish.mesh].filter(Boolean)));
    // the world drawn straight to the screen, as on Medium (the finish's
    // buffers kept, not given back and made again at each switch)
    add('C7', 'finish off', () => {
      const p = g.post;
      if (!p.enabled) return () => {};
      p._enabled = false;
      return () => (p._enabled = true);
    });

    // D: the optimisations' switches (Game.perfSwitches)
    for (const [key, s] of g.perfSwitches)
      add(
        'D' + key,
        `${s.label} off`,
        () => {
          const was = s.get();
          s.set(false);
          return () => s.set(was);
        },
        { sw: s }
      );
    return W;
  }

  // A2's draws, A3's trees and B4's last caster: made at the first use in a
  // check, added to the scene for the "with" states.
  addExtra(kind) {
    const o = this.extraObject(kind);
    this.game.scene.add(o);
    o.updateMatrixWorld(true);
    return () => o.removeFromParent();
  }

  extraObject(kind) {
    const g = this.game;
    const x = this.extras || (this.extras = {});
    if (x[kind]) return x[kind];
    if (!x.tri) {
      // a triangle of no size: drawn, and dropped before it makes a pixel
      x.tri = new THREE.BufferGeometry();
      x.tri.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    }
    // a little ahead of the camera
    const at = g.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5).add(g.camera.position);
    let o;
    if (kind === 'draws') {
      // each with a world material and a place of its own, as a prop has
      x.lambert = new THREE.MeshLambertMaterial({ color: 0x808080 });
      o = new THREE.Group();
      for (let i = 0; i < EXTRA_DRAWS; i++) {
        const m = new THREE.Mesh(x.tri, x.lambert);
        m.frustumCulled = false;
        m.position.set(i * 0.01, 0, 0);
        o.add(m);
      }
      o.position.copy(at);
    } else if (kind === 'trees') {
      // the detailed spruce with the spruce's own material, at no size:
      // every vertex goes through the swaying, every triangle is dropped
      const src = g.scatter.types.spruce.meshes[0];
      o = new THREE.InstancedMesh(src.geometry, src.material, EXTRA_TREES);
      const m = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(at);
      for (let i = 0; i < EXTRA_TREES; i++) o.setMatrixAt(i, m);
      if (src.instanceColor) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(EXTRA_TREES * 3).fill(1), 3);
      o.frustumCulled = false;
      o.receiveShadow = src.receiveShadow;
    } else {
      // the scene's last child, so drawn last into each cascade: after it the
      // colour image is discarded while the shadow map is still bound
      const gl = g.renderer.getContext();
      x.basic = new THREE.MeshBasicMaterial();
      o = new THREE.Mesh(x.tri, x.basic);
      o.frustumCulled = false;
      o.castShadow = true;
      o.position.copy(at);
      o.onAfterShadow = () => gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]);
    }
    o.name = 'perfCheck-' + kind;
    x[kind] = o;
    return o;
  }

  disposeExtras() {
    const x = this.extras;
    if (!x) return;
    this.extras = null;
    for (const k of ['draws', 'trees', 'tail']) x[k]?.removeFromParent();
    // (the trees' own instance buffers only: the geometry and the material
    // are the spruce's)
    x.trees?.dispose();
    for (const k of ['tri', 'lambert', 'basic']) x[k]?.dispose();
  }
}

// fn in place of obj[name], on the object itself; the undo puts back what
// was there (its own value, or none, so that the class's method shows again).
function patch(obj, name, fn) {
  const own = Object.prototype.hasOwnProperty.call(obj, name);
  const was = obj[name];
  obj[name] = fn;
  return () => {
    if (own) obj[name] = was;
    else delete obj[name];
  };
}

// Every mesh under root that casts a shadow made not to, but those under
// the roots in skip; the undo lets them cast again.
function noCasting(root, skip) {
  const off = [];
  const walk = (o) => {
    if (skip.includes(o)) return;
    if ((o.isMesh || o.isLine || o.isPoints) && o.castShadow) {
      o.castShadow = false;
      off.push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return () => off.forEach((o) => (o.castShadow = true));
}

// Pixels that differ between two pictures read back (red, green or blue),
// and the largest difference.
function comparePixels(a, b) {
  if (!a || !b || a.length !== b.length) return { n: -1, max: 255 };
  let n = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d) {
      n++;
      if (d > max) max = d;
    }
  }
  return { n, max };
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

// The verdict from the two records.
export function analyse(r, g) {
  const iv = r.base.map((x) => x[0]);
  const cpu = r.base.map((x) => x[1]);
  const sum = iv.reduce((a, b) => a + b, 0);
  const fps = sum > 0 ? (iv.length * 1000) / sum : 0;
  const low1 = pct(iv, 0.99) > 0 ? 1000 / pct(iv, 0.99) : 0;
  const frameMs = sum / Math.max(1, iv.length);
  const cpuMs = median(cpu);
  const share = frameMs > 0 ? cpuMs / frameMs : 0;
  const near = (v, ms, tol) => Math.abs(v - ms) <= tol;
  const at30 = iv.filter((v) => near(v, 1000 / 30, 2.5)).length / Math.max(1, iv.length);
  const lowIv = r.low.map((x) => x[0]);
  const lowSum = lowIv.reduce((a, b) => a + b, 0);
  const lowFps = lowSum > 0 ? (lowIv.length * 1000) / lowSum : null;
  const gain = lowFps ? lowFps / fps - 1 : null;
  let kind;
  let verdict;
  if (iv.length < 60) {
    kind = 'too few frames';
    verdict = `Too few frames to tell (${iv.length} in a minute and a half): the game hardly drew. Run the check again during play, with the game in front.`;
  } else if (fps >= 57) {
    kind = 'full speed';
    verdict = 'Full speed: about 60 frames a second. Nothing holds the game back here.';
  } else if (gain !== null && gain >= 0.1) {
    kind = 'graphics chip';
    verdict = `The graphics chip: with fewer pixels the game ran ${Math.round(gain * 100)}% quicker. With "Adjust graphics automatically" on, the game lowers the resolution by itself when it needs to.`;
  } else if (cpuMs >= 15 || share >= 0.75) {
    // (15 ms is nine tenths of a frame at 60 a second: work that alone
    // leaves no room for 60, whatever the screen then rounds the frames to)
    kind = 'processor';
    verdict = `The processor: the game's own work takes ${cpuMs.toFixed(1)} of every ${frameMs.toFixed(1)} ms, and fewer pixels did not help. A cheaper preset (Medium or Low) does less of that work.`;
  } else if (at30 >= 0.7 && cpuMs < 12) {
    kind = 'cap';
    verdict =
      'A cap at 30 frames a second, not the game’s work: the processor is idle for much of each frame and fewer pixels did not help. Low Power Mode is the usual cause (iPhone Settings, Battery); a hot phone is another. Lowering the graphics would not help.';
  } else {
    kind = 'unclear';
    verdict =
      'Not clear: fewer pixels did not help, and the processor is not busy all the time. A hot phone is the likeliest cause; let it cool and run the check again.';
  }
  const a = g.audio;
  const ctx = a && a.ctx;
  const session = typeof navigator !== 'undefined' && navigator.audioSession ? navigator.audioSession.type : 'none';
  const inApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.store);
  const loop = a && a.silentEl && !a.silentEl.paused ? ', silent loop on' : '';
  const sound = `${ctx ? ctx.state : 'not started'}, session ${session}${loop}, ${inApp ? 'in the app' : 'in the browser'}`;
  const { ua, ios, build } = about();
  const res = {
    kind,
    verdict,
    fps,
    low1,
    frameMs,
    cpuMs,
    share,
    at30,
    lowFps,
    lowDpr: r.lowDpr,
    gain,
    preset: r.steady.q,
    dpr: r.steady.d,
    top: g.ceiling,
    sound,
    frames: iv.length,
  };
  res.line = [
    `Hotrod check ${build}`,
    `${fps.toFixed(1)} fps (1% low ${low1.toFixed(0)})`,
    `frame ${frameMs.toFixed(1)} ms, game work ${cpuMs.toFixed(1)} ms (${Math.round(share * 100)}%)`,
    `steady 30: ${Math.round(at30 * 100)}%`,
    lowFps ? `at ${r.lowDpr.toFixed(2)}x: ${lowFps.toFixed(1)} fps` : r.lowDpr < r.steady.d - 0.01 ? 'fewer pixels not tried (out of time)' : 'already at the lowest resolution',
    `running ${r.steady.q.toUpperCase()} ${r.steady.d.toFixed(2)}x of ${String(g.ceiling || 'high').toUpperCase()}`,
    `screen ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`,
    `verdict: ${kind}`,
    `sound: ${sound}`,
    `${ua}${ios ? ' ' + ios : ''}`,
  ].join(' · ');
  return res;
}

// The build, the device and its iOS version, for the lines to send.
function about() {
  const ua = (navigator.userAgent.match(/(iPhone|iPad|Mac|Android|Windows|Linux)[^;)]*/) || [''])[0];
  const ios = (navigator.userAgent.match(/OS (\d+[_.]\d+)/) || [, ''])[1].replace('_', '.');
  const build = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
  return { ua, ios, build };
}

// The detailed check's result: each window's cost at 2.00x and at 0.50x,
// split into the part that does not grow with the resolution (fixed) and
// the part that does (per pixel, at 2.00x); A0's straight line through the
// four resolutions; and the line to send, with short codes (A1, B6, Dsb)
// to keep it within what a message holds.
// Reading it: a cost under about 0.4 ms, or under twice its spread, is
// noise. A1 at 40% or more of the frame at 0.50x, or A2 at 40 µs a draw or
// more, says the part that does not grow with the pixels is mostly the
// handling of the commands, not the graphics chip's work: fewer draws and
// passes help most. A3 at about 0.3 ms per 100k vertices or more says the
// chip is held back by vertices.
export function analyseDetail(r) {
  const { ua, ios, build } = about();
  // (whole numbers from 100 up: a slow machine's hundreds of ms need no
  // tenths, and the line stays short)
  const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(Math.abs(v) >= 100 ? 0 : d) : '–');
  // A0: time = fixed + per megapixel x megapixels, by least squares
  const pts = r.ladder.filter((l) => Number.isFinite(l.ms));
  let fit = null;
  if (pts.length >= 2) {
    const xs = pts.map((p) => p.px / 1e6);
    const ys = pts.map((p) => p.ms);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i] - my);
      sxx += (x - mx) ** 2;
    });
    const perMpx = sxx > 0 ? sxy / sxx : 0;
    const fixed = my - perMpx * mx;
    fit = { fixed, perMpx, miss: Math.max(...xs.map((x, i) => Math.abs(ys[i] - fixed - perMpx * x))) };
  }
  const windows = r.list.map((w) => {
    const a = w.res[HI];
    const b = w.res[LO];
    const d2 = a ? a.d : NaN;
    const d05 = b ? b.d : NaN;
    const sp = [a && a.spread, b && b.spread].filter(Number.isFinite);
    // (0.50x has a sixteenth of 2.00x's pixels: d = fixed + pixels' part)
    const out = { code: w.code, name: w.name, d2, d05, fixed: (16 * d05 - d2) / 15, perPixel: ((d2 - d05) * 16) / 15, spread: sp.length ? Math.max(...sp) : NaN, t2: a ? a.t : NaN, t05: b ? b.t : NaN, b2: a ? a.b : NaN, b05: b ? b.b : NaN };
    if (w.verts) out.verts = w.verts;
    if (w.sw) {
      out.px = Number.isFinite(w.px) ? w.px : NaN;
      out.maxd = w.maxd || 0;
    }
    return out;
  });
  const by = Object.fromEntries(windows.map((w) => [w.code, w]));
  // A1 as the frame's time with no draws, and its share of the frame at
  // 0.50x; A2 as one draw's cost; A3 as the cost of 100,000 vertices
  const A1 = by.A1 && { ms2: by.A1.t2, ms05: by.A1.t05, share: by.A1.t05 / by.A1.b05 };
  const A2 = by.A2 && { us2: (by.A2.d2 * 1000) / EXTRA_DRAWS, us05: (by.A2.d05 * 1000) / EXTRA_DRAWS };
  const A3 = by.A3 && { ms2: by.A3.d2 / (by.A3.verts / 1e5), ms05: by.A3.d05 / (by.A3.verts / 1e5) };
  const entry = (w) => {
    let s = `${w.code} ${num(w.d2)}/${num(w.d05)} f${num(w.fixed)} p${num(w.perPixel)} ±${num(w.spread)}`;
    if (w.code === 'A1') s += ` =${num(A1.ms2)}/${num(A1.ms05)}ms ${Number.isFinite(A1.share) ? Math.round(A1.share * 100) : '–'}%`;
    if (w.code === 'A2') s += ` =${num(A2.us2, 0)}/${num(A2.us05, 0)}µs/draw`;
    if (w.code === 'A3') s += ` =${num(A3.ms2, 2)}/${num(A3.ms05, 2)}ms/100kv`;
    if ('px' in w) s += ` px${Number.isFinite(w.px) ? w.px : '–'}${w.maxd ? '@' + w.maxd : ''}`;
    return s;
  };
  const top = r.ladder.find((l) => l.s === HI);
  const level = `${r.saved.q.toUpperCase()} ${r.saved.d.toFixed(2)}x`;
  const line = [
    `Hotrod breakdown ${build}`,
    `run ${r.n}${r.quick ? ' quick' : ''}${r.outOfTime ? ' out of time' : ''}`,
    `${ua}${ios ? ' ' + ios : ''}`,
    `screen ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`,
    `A0 ${r.ladder.map((l) => `${l.s}x ${num(l.ms)}`).join(' ')}${fit ? ` fix ${num(fit.fixed)} ${num(fit.perMpx, 2)}/Mpx miss ${num(fit.miss)}` : ''} js ${num(top && top.js)}`,
    ...windows.map(entry),
    `fps ${num(r.fps)} at ${level}`,
  ].join(' · ');
  return {
    detailed: true,
    cancelled: false,
    build,
    device: ua,
    ios,
    run: r.n,
    quick: r.quick,
    outOfTime: r.outOfTime,
    ladder: r.ladder.map((l) => ({ ...l })),
    fit,
    windows,
    A1,
    A2,
    A3,
    fps: r.fps,
    level,
    line,
  };
}
