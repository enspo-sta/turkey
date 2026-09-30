// Unified input: floating touch joystick (left), drag-to-look (right), DOM
// buttons with hold/tap edges, and keyboard + mouse (pointer lock optional).

export class Input {
  constructor(root) {
    this.root = root;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, held: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.buttons = new Map();
    this.keys = new Set();
    this.keyEdges = new Set();
    this.sensitivity = 1;
    this.invertY = false;
    this.enabled = true;
    this.pointerLocked = false;
    this.mouseDown = false;
    this.lastTouchTime = 0;
    this.usingTouch = false;
    this.leftZoneMode = 'move'; // 'move' | 'steer' | 'rod' | 'off'
    this.stickEl = null;
    this.knobEl = null;
    this.bind();
  }

  setStickElements(base, knob) {
    this.stickEl = base;
    this.knobEl = knob;
  }

  isLeftZone(x) {
    return x < window.innerWidth * 0.42;
  }

  bind() {
    const root = this.root;
    const opts = { passive: false };
    root.addEventListener(
      'touchstart',
      (e) => {
        this.usingTouch = true;
        this.lastTouchTime = performance.now();
        if (!this.enabled) return;
        let steering = false;
        for (const t of e.changedTouches) {
          if (t.target.closest && t.target.closest('.btn, .panel, button, .no-look')) continue;
          steering = true;
          if (this.isLeftZone(t.clientX) && this.leftZoneMode !== 'off' && this.stick.id === null) {
            this.stick.id = t.identifier;
            this.stick.active = true;
            this.stick.ox = t.clientX;
            this.stick.oy = t.clientY;
            this.stick.x = 0;
            this.stick.y = 0;
            this.stick.held = 0;
            this.showStick(t.clientX, t.clientY);
          } else if (this.lookTouch.id === null) {
            this.lookTouch.id = t.identifier;
            this.lookTouch.x = t.clientX;
            this.lookTouch.y = t.clientY;
          }
        }
        // Only swallow touches that walk or look. Cancelling a touch that
        // starts on a button makes iOS drop its click, so those pass through.
        if (steering) e.preventDefault();
      },
      opts
    );
    root.addEventListener(
      'touchmove',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.stick.id) {
            const R = 58;
            let dx = t.clientX - this.stick.ox;
            let dy = t.clientY - this.stick.oy;
            const l = Math.hypot(dx, dy);
            if (l > R) {
              // drag the origin along so direction changes stay responsive
              this.stick.ox += (dx / l) * (l - R);
              this.stick.oy += (dy / l) * (l - R);
              dx = (dx / l) * R;
              dy = (dy / l) * R;
            }
            this.stick.x = dx / R;
            this.stick.y = dy / R;
            this.moveStick(dx, dy);
          } else if (t.identifier === this.lookTouch.id) {
            this.look.dx += t.clientX - this.lookTouch.x;
            this.look.dy += t.clientY - this.lookTouch.y;
            this.lookTouch.x = t.clientX;
            this.lookTouch.y = t.clientY;
          }
        }
        e.preventDefault();
      },
      opts
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.id = null;
          this.stick.active = false;
          this.stick.x = 0;
          this.stick.y = 0;
          this.hideStick();
        }
        if (t.identifier === this.lookTouch.id) this.lookTouch.id = null;
      }
    };
    root.addEventListener('touchend', end, opts);
    root.addEventListener('touchcancel', end, opts);
    // block iOS pinch-zoom and double-tap zoom gestures
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);

    // mouse
    root.addEventListener('mousedown', (e) => {
      if (performance.now() - this.lastTouchTime < 800) return;
      if (e.target.closest && e.target.closest('.btn, .panel, button, .no-look')) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.pressKey('Mouse0');
      }
      if (e.button === 2) this.pressKey('Mouse2');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.releaseKey('Mouse0');
      }
      if (e.button === 2) this.releaseKey('Mouse2');
    });
    window.addEventListener('mousemove', (e) => {
      if (performance.now() - this.lastTouchTime < 800) return;
      if (this.pointerLocked) {
        this.look.dx += e.movementX * 0.6;
        this.look.dy += e.movementY * 0.6;
      } else if (this.mouseDown && this.enabled) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === root;
    });

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!e.repeat) this.pressKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.releaseKey(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      for (const b of this.buttons.values()) b.down = false;
    });
  }

  pressKey(code) {
    this.keys.add(code);
    this.keyEdges.add(code);
  }
  releaseKey(code) {
    this.keys.delete(code);
  }
  key(code) {
    return this.keys.has(code);
  }
  keyPressed(code) {
    return this.keyEdges.has(code);
  }

  requestPointerLock() {
    if (this.usingTouch) return;
    try {
      const p = this.root.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* optional */
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  showStick(x, y) {
    if (!this.stickEl) return;
    this.stickEl.style.left = x + 'px';
    this.stickEl.style.top = y + 'px';
    this.stickEl.classList.add('on');
    this.moveStick(0, 0);
  }
  moveStick(dx, dy) {
    if (!this.knobEl) return;
    if (this.stickEl) {
      this.stickEl.style.left = this.stick.ox + 'px';
      this.stickEl.style.top = this.stick.oy + 'px';
    }
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  hideStick() {
    if (this.stickEl) this.stickEl.classList.remove('on');
  }

  // Register a DOM element as a named button.
  bindButton(el, name) {
    const state = this.button(name);
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'touchstart') {
        this.usingTouch = true;
        this.lastTouchTime = performance.now();
      } else if (performance.now() - this.lastTouchTime < 800) return;
      if (!state.down) state.pressed = true;
      state.down = true;
      state.touchId = e.changedTouches ? e.changedTouches[0].identifier : 'mouse';
      el.classList.add('down');
    };
    const up = (e) => {
      if (e.changedTouches) {
        let mine = false;
        for (const t of e.changedTouches) if (t.identifier === state.touchId) mine = true;
        if (!mine) return;
      } else if (state.touchId !== 'mouse') return;
      if (state.down) state.released = true;
      state.down = false;
      state.touchId = null;
      el.classList.remove('down');
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    return state;
  }

  button(name) {
    let b = this.buttons.get(name);
    if (!b) {
      b = { down: false, pressed: false, released: false, touchId: null };
      this.buttons.set(name, b);
    }
    return b;
  }

  held(name) {
    return this.button(name).down;
  }
  pressed(name) {
    return this.button(name).pressed;
  }
  released(name) {
    return this.button(name).released;
  }

  // Movement vector combining the touch stick and WASD/arrows.
  readMove() {
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.key('KeyA') || this.key('ArrowLeft')) x -= 1;
    if (this.key('KeyD') || this.key('ArrowRight')) x += 1;
    if (this.key('KeyW') || this.key('ArrowUp')) y -= 1;
    if (this.key('KeyS') || this.key('ArrowDown')) y += 1;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.move.x = x;
    this.move.y = y;
    return this.move;
  }

  // Look delta in radians since last call.
  readLook() {
    const touchScale = 0.0055 * this.sensitivity;
    const mouseScale = 0.0032 * this.sensitivity;
    const s = this.usingTouch ? touchScale : mouseScale;
    const dx = this.look.dx * s;
    const dy = this.look.dy * s * (this.invertY ? -1 : 1);
    this.look.dx = 0;
    this.look.dy = 0;
    return { dx, dy };
  }

  // Clear per-frame edges. Call once at the end of each frame.
  endFrame() {
    for (const b of this.buttons.values()) {
      b.pressed = false;
      b.released = false;
    }
    this.keyEdges.clear();
    if (this.stick.active) this.stick.held += 1 / 60;
  }

  resetAll() {
    for (const b of this.buttons.values()) {
      b.down = false;
      b.pressed = false;
      b.released = false;
    }
    this.stick.id = null;
    this.stick.active = false;
    this.stick.x = 0;
    this.stick.y = 0;
    this.lookTouch.id = null;
    this.hideStick();
    this.keys.clear();
  }
}
