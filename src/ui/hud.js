// In-game HUD: stats, compass, objective, contextual touch controls, cast and
// fight meters, speedometer, toasts, banners, prompts and the catch card.
import { formatMoney, formatTime, clamp, wrapAngle } from '../util/math.js';
import { LURES, FISH, CHALLENGES } from '../gameplay/data.js';

const $ = (id) => document.getElementById(id);

const OBJECTIVE_PLACE = {
  first: 'landing',
  sell: 'post',
  sockeye: 'bend',
  lure: 'post',
  falls: 'falls',
  king: 'falls',
  bear: 'falls',
  caribou: 'tundra',
  pike: 'moose',
  char: 'glacier',
  halibut: 'pier',
  moose: 'moose',
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      money: $('hud-money'),
      health: $('hud-health'),
      cooler: $('hud-cooler'),
      chipCooler: $('chip-cooler'),
      arrows: $('hud-arrows'),
      chipArrows: $('chip-arrows'),
      lure: $('hud-lure'),
      chipLure: $('chip-lure'),
      time: $('hud-time'),
      day: $('hud-day'),
      fps: $('hud-fps'),
      strip: $('compass-strip'),
      objective: $('objective'),
      toasts: $('toasts'),
      banner: $('banner'),
      prompt: $('prompt'),
      hint: $('hint'),
      placeTitle: $('place-title'),
      meter: $('meter'),
      meterStep: $('meter-step'),
      meterHelp: $('meter-help'),
      meterWater: $('meter-water'),
      meterHot: $('meter-hot'),
      meterAcc: $('meter-acc'),
      meterPower: $('meter-power'),
      meterNeedle: $('meter-needle'),
      fight: $('fight'),
      fightStamina: $('fight-stamina'),
      fightDist: $('fight-dist'),
      fightNeedle: $('fight-needle'),
      fightArrow: $('fight-arrow'),
      fightTip: $('fight-tip'),
      speedo: $('speedo'),
      speedoNeedle: $('speedo-needle'),
      speedoArc: $('speedo-arc'),
      speedoVal: $('speedo-val'),
      speedoGear: $('speedo-gear'),
      crosshair: $('crosshair'),
      hitmark: $('hitmark'),
      dmg: $('dmg'),
      dangerL: $('danger-left'),
      dangerR: $('danger-right'),
      dangerB: $('danger-back'),
      primary: $('btn-primary'),
      secondary: $('btn-secondary'),
      tool: $('btn-tool'),
      spray: $('btn-spray'),
      sprayCount: $('spray-count'),
      med: $('btn-med'),
      medCount: $('med-count'),
      horn: $('btn-horn'),
      cam: $('btn-cam'),
      gas: $('btn-gas'),
      brake: $('btn-brake'),
      interact: $('btn-interact'),
      leftHint: $('left-hint'),
      catchCard: $('catch'),
    };
    this.toastList = [];
    this.bannerTimer = 0;
    this.promptTimer = 0;
    this.hintTimer = 0;
    this.blocking = false;
    this.interactAction = null;
    this.cache = {};
    this.buildSpeedo();
    const input = game.input;
    input.bindButton(this.el.primary, 'primary');
    input.bindButton(this.el.secondary, 'secondary');
    input.bindButton(this.el.tool, 'tool');
    input.bindButton(this.el.spray, 'spray');
    input.bindButton(this.el.med, 'med');
    input.bindButton(this.el.horn, 'horn');
    input.bindButton(this.el.cam, 'cam');
    input.bindButton(this.el.gas, 'gas');
    input.bindButton(this.el.brake, 'brake');
    input.bindButton(this.el.interact, 'interact');
    input.setStickElements($('stick'), $('stick-knob'));
    $('btn-map').addEventListener('click', () => game.screens.open('map'));
    $('btn-journal').addEventListener('click', () => game.screens.open('journal'));
    $('btn-pause').addEventListener('click', () => game.screens.open('pause'));
    for (const id of ['btn-map', 'btn-journal', 'btn-pause', 'catch']) {
      $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }
  }

  show(on) {
    this.root.hidden = !on;
  }

  buildSpeedo() {
    const g = $('speedo-ticks');
    let html = '';
    for (let i = 0; i <= 8; i++) {
      const v = i * 20;
      const a = Math.PI + (i / 8) * Math.PI;
      const x1 = 100 + Math.cos(a) * 80;
      const y1 = 110 + Math.sin(a) * 80;
      const x2 = 100 + Math.cos(a) * 68;
      const y2 = 110 + Math.sin(a) * 68;
      const tx = 100 + Math.cos(a) * 56;
      const ty = 110 + Math.sin(a) * 56 + 4;
      html += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="2"/>`;
      if (i % 2 === 0) html += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${v}</text>`;
    }
    g.innerHTML = html;
  }

  // ---- messages
  // Brief "Saved" under the clock whenever progress is written.
  // Frames per second over the last half second, when enabled in Settings.
  updateFps() {
    const el = this.el.fps;
    const on = !!this.game.state.settings.showFps;
    if (el.hidden === on) el.hidden = !on;
    if (!on) return;
    const now = performance.now();
    const f = this.fpsAcc || (this.fpsAcc = { t0: now, n: 0 });
    f.n++;
    if (now - f.t0 >= 500) {
      const fps = (f.n * 1000) / (now - f.t0);
      f.t0 = now;
      f.n = 0;
      const g = this.game;
      el.textContent = `${Math.round(fps)} FPS · ${g.qualityName.toUpperCase()} · ${g.dpr.toFixed(2)}x`;
      el.classList.toggle('slow', fps < 50 && fps >= 35);
      el.classList.toggle('bad', fps < 35);
    }
  }

  savedFlash() {
    const el = $('hud-saved');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(this.savedT);
    this.savedT = setTimeout(() => el.classList.remove('show'), 1600);
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    this.el.toasts.appendChild(el);
    this.toastList.push(el);
    while (this.toastList.length > 3) {
      const old = this.toastList.shift();
      old.remove();
    }
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => {
      el.remove();
      const i = this.toastList.indexOf(el);
      if (i >= 0) this.toastList.splice(i, 1);
    }, 3700);
  }

  banner(text, kind = 'good') {
    const b = this.el.banner;
    b.textContent = text;
    b.className = '';
    void b.offsetWidth;
    b.className = 'show ' + kind;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => (b.className = ''), 1950);
  }

  prompt(text, kind = 'hot', duration = 1) {
    const p = this.el.prompt;
    clearTimeout(this.promptT);
    if (!text) {
      p.className = '';
      return;
    }
    p.textContent = text;
    p.className = 'show ' + kind;
    this.promptT = setTimeout(() => (p.className = ''), duration * 1000);
  }

  hint(text, duration = 3) {
    const h = this.el.hint;
    clearTimeout(this.hintT);
    if (!text) {
      h.classList.remove('show');
      return;
    }
    h.textContent = text;
    h.classList.add('show');
    this.hintT = setTimeout(() => h.classList.remove('show'), duration * 1000);
  }

  placeTitle(small, big) {
    const el = this.el.placeTitle;
    el.querySelector('small').textContent = small;
    el.querySelector('b').textContent = big;
    el.className = '';
    void el.offsetWidth;
    el.className = 'show';
    clearTimeout(this.placeT);
    this.placeT = setTimeout(() => (el.className = ''), 3700);
  }

  damageFlash(amount) {
    this.el.dmg.style.opacity = String(clamp(amount / 40, 0.3, 0.9));
    clearTimeout(this.dmgT);
    this.dmgT = setTimeout(() => (this.el.dmg.style.opacity = '0'), 260);
  }

  hitmark(kill) {
    const h = this.el.hitmark;
    h.className = '';
    void h.offsetWidth;
    h.className = 'show' + (kill ? ' kill' : '');
  }

  // relAngle: bearing of the threat relative to view (-PI..PI); intensity 0..1
  danger(relAngle, intensity) {
    const L = this.el.dangerL;
    const R = this.el.dangerR;
    const B = this.el.dangerB;
    if (intensity <= 0) {
      L.style.opacity = R.style.opacity = B.style.opacity = '0';
      return;
    }
    const pulse = 0.6 + 0.4 * Math.sin(this.game.time * 10);
    const a = relAngle;
    const left = a < -0.35 && a > -2.6 ? 1 : 0;
    const right = a > 0.35 && a < 2.6 ? 1 : 0;
    const back = Math.abs(a) > 2.2 ? 1 : 0;
    L.style.opacity = String(left * intensity * pulse);
    R.style.opacity = String(right * intensity * pulse);
    B.style.opacity = String(back * intensity * pulse);
  }

  // ---- cast meter
  showMeter(m) {
    const el = this.el;
    el.meter.hidden = false;
    el.fight.hidden = true;
    const pct = (v) => `${clamp(v, -0.1, 1.02) * 100}%`;
    el.meterNeedle.style.left = pct(Math.max(m.needle, -0.02));
    el.meterStep.textContent = m.phase === 0 ? 'POWER' : 'ACCURACY';
    el.meterHelp.textContent =
      m.phase === 0 ? (m.hot ? 'Stop the needle in the gold zone' : 'Tap to set casting power') : 'Tap again on the green mark';
    const key = JSON.stringify(m.water) + (m.hot ? m.hot.p0.toFixed(3) + m.hot.p1.toFixed(3) : '');
    if (this.cache.meterKey !== key) {
      this.cache.meterKey = key;
      el.meterWater.innerHTML = m.water
        .map((b) => `<div class="w" style="left:${b.p0 * 100}%;width:${Math.max(0.5, (b.p1 - b.p0) * 100)}%"></div>`)
        .join('');
      if (m.hot) {
        el.meterHot.hidden = false;
        el.meterHot.style.left = pct(m.hot.p0);
        el.meterHot.style.width = `${Math.max(1.2, (m.hot.p1 - m.hot.p0) * 100)}%`;
      } else el.meterHot.hidden = true;
      el.meterAcc.style.left = `${(m.accTarget - 0.022) * 100}%`;
      el.meterAcc.style.width = `${0.044 * 100}%`;
    }
    if (m.power !== null) {
      el.meterPower.hidden = false;
      el.meterPower.style.left = pct(m.power);
    } else el.meterPower.hidden = true;
    el.meterAcc.style.opacity = m.phase === 1 ? '1' : '0.45';
  }

  hideMeter() {
    this.el.meter.hidden = true;
    this.cache.meterKey = null;
  }

  // ---- fight meter
  showFight() {
    this.el.fight.hidden = false;
    this.el.meter.hidden = true;
  }

  hideFight() {
    this.el.fight.hidden = true;
    this.el.leftHint.textContent = '';
  }

  setFight(f) {
    const el = this.el;
    el.fightNeedle.style.left = `${clamp(f.tension, 0, 1.05) * 95}%`;
    el.fightStamina.style.width = `${f.stamina * 100}%`;
    el.fightDist.textContent = `${f.dist.toFixed(0)} m`;
    el.fight.classList.toggle('danger', f.tension > 0.92 || f.overload);
    let arrow = '';
    if (f.state === 'jump') arrow = 'JUMP!';
    else if (f.dir > 0) arrow = 'RUNNING ▶';
    else if (f.dir < 0) arrow = '◀ RUNNING';
    el.fightArrow.textContent = arrow;
    let tip;
    if (f.state === 'jump') tip = 'Release REEL while it jumps';
    else if (f.tension > 0.9) tip = 'Ease off! Let the drag work';
    else if (f.state === 'run' && f.dir !== 0) tip = f.opposing ? 'Good angle, keep the rod over' : `Pull the rod ${f.dir > 0 ? 'left ◀' : 'right ▶'} (drag on the left side)`;
    else if (f.tension < 0.1 && !f.reeling) tip = 'Keep tension on the line: hold REEL';
    else if (f.state === 'tired') tip = 'It is tiring. Reel, reel, reel!';
    else tip = 'Hold REEL to bring it in';
    el.fightTip.textContent = tip;
    el.leftHint.textContent = this.game.input.usingTouch ? '◀ drag to steer rod ▶' : 'A / D steer rod';
  }

  setWaitingHint(bite) {
    if (bite) return;
    if (!this.cache.waitHintShown) {
      this.cache.waitHintShown = true;
      this.hint('Watch the float. When it plunges under, tap HOOK. Hold REEL to retrieve.', 5);
    }
  }

  // ---- catch card
  showCatch(info, coolerFull, cb) {
    const card = this.el.catchCard;
    card.hidden = false;
    this.blocking = true;
    const badges = [];
    if (info.legend) badges.push('<span class="legend">LEGENDARY</span>');
    if (info.isNew) badges.push('<span>NEW SPECIES</span>');
    if (info.isBest) badges.push('<span class="best">PERSONAL BEST</span>');
    $('catch-badges').innerHTML = badges.join('');
    $('catch-name').textContent = info.name;
    $('catch-species').textContent = info.legend ? `Legendary ${info.speciesName}` : `${FISH[info.species].nick}${info.place ? ' · ' + info.place : ''}`;
    $('catch-weight').textContent = `${info.weight.toFixed(1)} kg`;
    $('catch-length').textContent = `${info.length} cm`;
    $('catch-value').textContent = formatMoney(info.value);
    $('catch-info').textContent = coolerFull ? 'Your cooler is full. Sell at the Trading Post or release this one.' : FISH[info.species].info;
    const keep = $('catch-keep');
    const rel = $('catch-release');
    keep.disabled = coolerFull;
    keep.classList.toggle('disabled', coolerFull);
    // a mouse locked to the view would hide the cursor and send every click
    // to the game instead of these buttons
    this.game.input.exitPointerLock();
    // one way out for taps, clicks and keys (E or Enter keeps, R releases)
    this.catchChoice = (k) => {
      if (card.hidden || (k && coolerFull)) return;
      this.closeCatch();
      this.game.audio?.click();
      cb(k);
    };
    keep.onclick = () => this.catchChoice?.(true);
    rel.onclick = () => this.catchChoice?.(false);
  }

  // Hide the catch card without choosing (the caller settles the fish).
  closeCatch() {
    this.el.catchCard.hidden = true;
    this.blocking = false;
    this.catchChoice = null;
    $('catch-keep').onclick = $('catch-release').onclick = null;
  }

  // ---- per-frame update
  update(dt) {
    const g = this.game;
    const s = g.state;
    const el = this.el;
    const P = g.player;
    this.updateFps();
    // never stay blocked once the card is gone
    if (this.blocking && el.catchCard.hidden) this.closeCatch();
    const set = (k, v, fn) => {
      if (this.cache[k] !== v) {
        this.cache[k] = v;
        fn(v);
      }
    };
    set('money', s.money, (v) => (el.money.textContent = formatMoney(v)));
    set('health', Math.round(P.health), (v) => (el.health.style.width = v + '%'));
    const cool = `${s.cooler.length}/${s.coolerCap()}`;
    set('cooler', cool, (v) => {
      el.cooler.textContent = v;
      el.chipCooler.classList.toggle('full', s.coolerFull());
    });
    set('time', formatTime(g.env.time), (v) => (el.time.textContent = v));
    set('day', g.env.day, (v) => (el.day.textContent = `Day ${v}`));
    set('lure', s.gear.lure, (v) => (el.lure.textContent = LURES[v].name.replace('Hotrod ', '')));

    const mode = P.mode;
    const tool = P.tool;
    const fishing = g.fishing;
    const hunting = g.hunting;
    const onFoot = mode === 'foot';
    el.chipArrows.hidden = !(onFoot && tool === 'bow');
    el.chipLure.hidden = !(onFoot && tool === 'rod');
    if (!el.chipArrows.hidden) set('arrows', String(s.gear.arrows), (v) => (el.arrows.textContent = v));

    // objective
    const ch = s.currentChallenge();
    set('objective', ch ? ch.id : 'none', () => {
      el.objective.innerHTML = ch ? `<b>GOAL</b>${ch.text}` : '<b>DONE</b>Every challenge complete. Legend of the Kenai!';
    });

    // controls by context
    const catchOpen = !el.catchCard.hidden;
    const driving = mode === 'drive';
    el.gas.hidden = !driving;
    el.brake.hidden = !driving;
    el.horn.hidden = !driving;
    el.cam.hidden = !driving;
    el.speedo.hidden = !driving;
    el.primary.hidden = driving || catchOpen || tool === 'none';
    el.tool.hidden = driving || catchOpen || (fishing && fishing.state !== 'idle');
    el.spray.hidden = !onFoot || s.gear.spray <= 0 || catchOpen || !g.bears?.threat;
    el.med.hidden = !onFoot || s.gear.medkit <= 0 || P.health > 70 || catchOpen;
    set('spray', s.gear.spray, (v) => (el.sprayCount.textContent = v));
    set('med', s.gear.medkit, (v) => (el.medCount.textContent = v));
    // the button shows the tool it switches to: rod, longbow, empty hands
    set('toolIcon', tool, (v) => (el.tool.innerHTML = `<svg><use href="#i-${v === 'rod' ? 'bow' : v === 'bow' ? 'hand' : 'rod'}"/></svg>`));
    el.tool.classList.toggle('pulse', !!(g.bears?.threat && tool !== 'bow'));

    let pLabel = '';
    let pClass = 'btn round primary';
    let sLabel = null;
    if (onFoot && tool === 'rod' && fishing) {
      switch (fishing.state) {
        case 'idle':
          pLabel = 'CAST';
          if (!fishing.aim.hasWater) pClass += ' off';
          sLabel = 'LURE';
          break;
        case 'meter':
          pLabel = 'TAP';
          pClass += ' alert';
          break;
        case 'flight':
        case 'tangle':
          pLabel = '...';
          break;
        case 'waiting':
          pLabel = fishing.encounter && fishing.encounter.phase === 'bite' ? 'HOOK!' : 'REEL';
          if (fishing.encounter && fishing.encounter.phase === 'bite') pClass += ' alert';
          break;
        case 'fight':
          pLabel = 'REEL';
          break;
        default:
          pLabel = 'REEL';
      }
    } else if (onFoot && tool === 'bow' && hunting) {
      pLabel = hunting.drawing ? (hunting.draw >= 1 ? 'LOOSE' : 'DRAW') : hunting.nockT > 0 ? '...' : s.gear.arrows > 0 ? 'DRAW' : 'EMPTY';
      pClass += ' fire';
      if (hunting.drawing && hunting.draw >= 1) pClass += ' alert';
      if (!hunting.drawing && s.gear.arrows <= 0) pClass += ' off';
      sLabel = hunting.aiming ? 'BACK' : 'AIM';
    }
    // how far the string is drawn, as a ring around the button
    const drawAmt = onFoot && tool === 'bow' && hunting ? hunting.draw : 0;
    set('drawRing', Math.round(drawAmt * 40), (v) => el.primary.style.setProperty('--draw', String(v / 40)));
    set('pLabel', pLabel, (v) => (el.primary.innerHTML = `<span>${v}</span>`));
    set('pClass', pClass, (v) => (el.primary.className = v));
    el.secondary.hidden = driving || catchOpen || !sLabel || (fishing && fishing.state !== 'idle' && tool === 'rod');
    if (sLabel) set('sLabel', sLabel, (v) => (el.secondary.innerHTML = `<span>${v}</span>`));
    el.secondary.classList.toggle('on', !!(hunting && hunting.aiming && tool === 'bow'));

    // interact pill
    const ia = g.interaction;
    const iaKey = ia ? ia.label + ia.icon : '';
    set('interact', iaKey, () => {
      el.interact.hidden = !ia;
      if (ia) el.interact.innerHTML = `<svg><use href="#i-${ia.icon}"/></svg><span>${ia.label}</span>`;
    });
    if (catchOpen) el.interact.hidden = true;
    else el.interact.hidden = !ia;
    el.interact.classList.toggle('driving', driving);

    // crosshair: a ring for the bow, a dot for the rod, none with empty hands
    el.crosshair.hidden = driving || catchOpen || tool === 'none';
    set('xhair', tool === 'bow' && onFoot ? 'bow' : '', (v) => (el.crosshair.className = v));

    // left hint text when idle
    if (!fishing || fishing.state !== 'fight') {
      let lh = '';
      if (driving) lh = g.input.usingTouch ? '◀ drag to steer ▶' : 'W/S drive · A/D steer';
      else if (g.input.usingTouch && g.time < (this.firstShown || 0) + 20) lh = 'drag here to walk';
      set('leftHint', lh, (v) => (el.leftHint.textContent = v));
    }
    if (!this.firstShown) this.firstShown = g.time;

    // speedometer
    if (driving) {
      const kmh = Math.abs(g.hotrod.speed) * 3.6;
      const f = clamp(kmh / 160, 0, 1);
      const a = Math.PI + f * Math.PI;
      el.speedoNeedle.setAttribute('x2', (100 + Math.cos(a) * 66).toFixed(1));
      el.speedoNeedle.setAttribute('y2', (110 + Math.sin(a) * 66).toFixed(1));
      el.speedoArc.setAttribute('stroke-dasharray', `${(f * 251).toFixed(1)} 999`);
      set('kmh', Math.round(kmh), (v) => (el.speedoVal.textContent = v));
      set('gear', g.hotrod.speed < -0.3 ? 'R' : String(g.hotrod.gear), (v) => (el.speedoGear.textContent = v));
    }

    this.updateCompass(dt);
  }

  updateCompass(dt) {
    const g = this.game;
    const cam = g.camera;
    const dir = cam.getWorldDirection(this._dir || (this._dir = cam.position.clone()));
    const heading = Math.atan2(dir.x, -dir.z);
    if (!this.compassEls) {
      this.compassEls = new Map();
      this.compassTextT = 0;
    }
    this.compassTextT -= dt;
    const refreshText = this.compassTextT <= 0;
    if (refreshText) this.compassTextT = 0.25;
    const items = [];
    const card = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 0; i < 8; i++) items.push({ key: 'c' + i, a: (i * Math.PI) / 4, t: card[i], cls: i % 2 ? 'minor' : '' });
    const px = cam.position.x;
    const pz = cam.position.z;
    const s = g.state;
    const ch = s.currentChallenge();
    const goal = ch ? OBJECTIVE_PLACE[ch.id] : null;
    for (const p of g.world.places) {
      const known = s.discovered[p.id];
      if (!known && p.id !== goal) continue;
      const dx = p.x - px;
      const dz = p.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 25) continue;
      items.push({ key: 'p' + p.id, a: Math.atan2(dx, -dz), t: p.name, d, cls: 'marker' + (p.id === goal ? ' goal' : '') });
    }
    if (g.player.mode === 'foot') {
      const dx = g.hotrod.pos.x - px;
      const dz = g.hotrod.pos.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > 20) items.push({ key: 'car', a: Math.atan2(dx, -dz), t: 'Hot rod', d, cls: 'marker' });
    }
    if (g.bears && g.bears.threat) {
      const b = g.bears.threat;
      const dx = b.x - px;
      const dz = b.z - pz;
      items.push({ key: 'bear', a: Math.atan2(dx, -dz), t: 'GRIZZLY', d: Math.hypot(dx, dz), cls: 'marker bear' });
    }
    // Place labels by importance so none overlap: a charging grizzly, then
    // the current goal, the hot rod, nearer places, and the compass letters
    // last. Widths are estimated from the text to avoid layout reads.
    if (refreshText || !this.stripW) this.stripW = this.el.strip.clientWidth || 360;
    const W = this.stripW;
    const rank = (it) => (it.key === 'bear' ? 5 : it.cls.includes('goal') ? 4 : it.key === 'car' ? 3 : it.d !== undefined ? 2 : it.cls === 'minor' ? 0 : 1);
    const placed = [];
    const seen = new Set();
    const order = items
      .map((it) => ({ it, rel: wrapAngle(it.a - heading) }))
      .filter((o) => Math.abs(o.rel) <= Math.PI / 2)
      .sort((a, b) => rank(b.it) - rank(a.it) || (a.it.d ?? 0) - (b.it.d ?? 0));
    const shown = new Set();
    for (const o of order) {
      const it = o.it;
      const x = (0.5 + (o.rel / (Math.PI / 2)) * 0.5) * W;
      const chars = it.d !== undefined ? Math.max(it.t.length, 6) : it.t.length;
      const half = (chars * (it.d !== undefined ? 7.2 : it.cls === 'minor' ? 7.5 : 9.5)) / 2 + 5;
      if (placed.some(([a, b]) => x + half > a && x - half < b)) continue;
      placed.push([x - half, x + half]);
      shown.add(it.key);
      o.x = x;
    }
    for (const it of items) {
      seen.add(it.key);
      let el = this.compassEls.get(it.key);
      if (!el) {
        el = document.createElement('span');
        this.el.strip.appendChild(el);
        this.compassEls.set(it.key, el);
        el._text = null;
      }
      const vis = shown.has(it.key);
      el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const rel = wrapAngle(it.a - heading);
      el.style.left = (50 + (rel / (Math.PI / 2)) * 50).toFixed(2) + '%';
      if (el.className !== it.cls) el.className = it.cls;
      if (refreshText || el._text === null) {
        const label =
          it.d !== undefined ? `${it.t}<i>${it.d > 1000 ? (it.d / 1000).toFixed(1) + ' km' : Math.round(it.d) + ' m'}</i>` : it.t;
        if (label !== el._text) {
          el._text = label;
          el.innerHTML = label;
        }
      }
    }
    for (const [k, el] of this.compassEls) {
      if (!seen.has(k)) {
        el.remove();
        this.compassEls.delete(k);
      }
    }
  }
}
