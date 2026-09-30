// Menu sheets: map with fast travel, journal (fish, trophies, challenges),
// Trading Post shop, lure picker, pause/settings, how-to-play and dialogs.
import { FISH, SPECIES_IDS, LEGENDS, LURES, RODS, COOLERS, ENGINES, TIRES, PAINTS, GEAR, GAME, CHALLENGES, QUIVER } from '../gameplay/data.js';
import { formatMoney, formatTime, clamp } from '../util/math.js';
import { privacyHTML, PRIVACY_UPDATED } from './privacy.js';
import { renderMapRGBA, worldToMap } from '../world/maprender.js';
import { HALF, SIZE } from '../world/worldgen.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

// Simple side-view fish drawing for journal cards.
export function drawFish2D(canvas, id, known = true) {
  const f = FISH[id];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (canvas.width = Math.round((canvas.clientWidth || 180) * dpr));
  const h = (canvas.height = Math.round((canvas.clientHeight || 64) * dpr));
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const shape = f.shape;
  const L = w * 0.8;
  const x0 = w * 0.08;
  const cy = h * 0.52;
  const H = { salmon: 0.26, trout: 0.24, grayling: 0.22, pike: 0.16, eel: 0.14, flat: 0.42, ling: 0.2, rockfish: 0.36, cod: 0.24 }[shape] * L;
  const grad = g.createLinearGradient(0, cy - H / 2, 0, cy + H / 2);
  grad.addColorStop(0, hex(f.col.back));
  grad.addColorStop(0.45, hex(f.col.side));
  grad.addColorStop(1, hex(f.col.belly));
  g.fillStyle = known ? grad : '#000';
  // tail
  g.beginPath();
  g.moveTo(x0 + L * 0.12, cy);
  g.lineTo(x0, cy - H * 0.5);
  g.lineTo(x0 + L * 0.04, cy);
  g.lineTo(x0, cy + H * 0.5);
  g.closePath();
  g.fill();
  // body
  g.beginPath();
  g.moveTo(x0 + L * 0.1, cy);
  g.bezierCurveTo(x0 + L * 0.3, cy - H * 0.6, x0 + L * 0.75, cy - H * 0.62, x0 + L, cy - (shape === 'pike' ? 0 : H * 0.05));
  g.bezierCurveTo(x0 + L * 0.75, cy + H * 0.55, x0 + L * 0.3, cy + H * 0.5, x0 + L * 0.1, cy);
  g.fill();
  if (!known) return;
  // dorsal
  g.fillStyle = hex(f.col.fin || f.col.back);
  g.beginPath();
  const dx = shape === 'pike' ? 0.25 : 0.5;
  const dh = shape === 'grayling' ? 0.7 : 0.3;
  g.moveTo(x0 + L * dx, cy - H * 0.45);
  g.lineTo(x0 + L * (dx + 0.08), cy - H * (0.45 + dh));
  g.lineTo(x0 + L * (dx + (shape === 'grayling' ? 0.3 : 0.16)), cy - H * 0.42);
  g.fill();
  if (f.col.band && id !== 'chum') {
    g.strokeStyle = hex(f.col.band);
    g.globalAlpha = 0.7;
    g.lineWidth = H * 0.12;
    g.beginPath();
    g.moveTo(x0 + L * 0.2, cy);
    g.lineTo(x0 + L * 0.85, cy - H * 0.05);
    g.stroke();
    g.globalAlpha = 1;
  }
  if (id === 'chum') {
    g.fillStyle = hex(f.col.band);
    g.globalAlpha = 0.55;
    for (let i = 0; i < 6; i++) g.fillRect(x0 + L * (0.28 + i * 0.09), cy - H * 0.35, L * 0.035, H * 0.7);
    g.globalAlpha = 1;
  }
  if (f.col.spots) {
    g.fillStyle = hex(f.col.spots);
    let seed = id.length * 31;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const u = 0.2 + rnd() * 0.72;
      const v = -0.35 + rnd() * 0.45;
      g.beginPath();
      g.arc(x0 + L * u, cy + H * v, Math.max(1, H * 0.035), 0, Math.PI * 2);
      g.fill();
    }
  }
  // eye
  g.fillStyle = '#0a0a0a';
  g.beginPath();
  g.arc(x0 + L * 0.88, cy - H * 0.1, Math.max(1.5, H * 0.07), 0, Math.PI * 2);
  g.fill();
}

export class Screens {
  constructor(game) {
    this.game = game;
    this.overlay = $('overlay');
    this.title = $('sheet-title');
    this.tabs = $('sheet-tabs');
    this.body = $('sheet-body');
    this.current = null;
    this.tab = null;
    $('sheet-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    // allow scrolling inside sheets on touch devices
    this.body.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    this.overlay.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.current) {
        e.preventDefault();
        this.close();
      }
    });
    this.mapImage = null;
  }

  get isOpen() {
    return !!this.current;
  }

  open(name, opts = {}) {
    const g = this.game;
    if (g.fishing && (g.fishing.state === 'fight' || g.fishing.state === 'meter') && name !== 'pause') return;
    this.current = name;
    this.opts = opts;
    this.overlay.hidden = false;
    g.menuOpen = true;
    g.input.resetAll();
    g.input.exitPointerLock();
    g.audio?.click();
    this.tab = opts.tab || null;
    this.render();
  }

  close() {
    if (!this.current) return;
    const was = this.current;
    this.current = null;
    this.overlay.hidden = true;
    this.body.innerHTML = '';
    this.game.menuOpen = false;
    this.game.audio?.click();
    if (this.opts && this.opts.onClose) this.opts.onClose();
    if (was === 'shop') this.game.save();
  }

  setTabs(list, active) {
    this.tabs.innerHTML = list.map(([id, label]) => `<button class="tab ${id === active ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('');
    this.tabs.querySelectorAll('.tab').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab;
        this.game.audio?.click();
        this.render();
      })
    );
  }

  render() {
    const n = this.current;
    this.body.scrollTop = 0;
    if (n === 'map') this.renderMap();
    else if (n === 'journal') this.renderJournal();
    else if (n === 'shop') this.renderShop();
    else if (n === 'pause') this.renderPause();
    else if (n === 'settings') this.renderSettings();
    else if (n === 'howto') this.renderHowto();
    else if (n === 'privacy') this.renderPrivacy();
    else if (n === 'lure') this.renderLures();
    else if (n === 'dialog') this.renderDialog();
  }

  // ------------------------------------------------------------------ map
  ensureMapImage() {
    if (this.mapImage) return this.mapImage;
    const size = 640;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    img.data.set(renderMapRGBA(this.game.world, size));
    ctx.putImageData(img, 0, 0);
    // roads and river line
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of this.game.world.roads) {
      ctx.strokeStyle = 'rgba(60,40,20,0.8)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      const P = road.path;
      for (let i = 0; i < P.count; i += 2) {
        const [x, y] = worldToMap(P.x[i], P.z[i], size);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#e8d8b0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    for (const b of this.game.world.bridges) {
      const [x0, y0] = worldToMap(b.x0, b.z0, size);
      const [x1, y1] = worldToMap(b.x1, b.z1, size);
      ctx.strokeStyle = '#3e6b5a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // grid and compass rose
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i * size) / 8, 0);
      ctx.lineTo((i * size) / 8, size);
      ctx.moveTo(0, (i * size) / 8);
      ctx.lineTo(size, (i * size) / 8);
      ctx.stroke();
    }
    this.mapImage = c;
    return c;
  }

  renderMap() {
    const g = this.game;
    this.title.textContent = 'Kenai Country';
    this.setTabs([], null);
    const places = g.world.places;
    if (!this.selPlace) this.selPlace = null;
    const list = places
      .map((p) => {
        const known = g.state.discovered[p.id];
        const run = g.state.salmonRun && g.state.salmonRun.place === p.id ? ' · Salmon run!' : '';
        const kind = p.kind === 'fishing' ? 'Fishing' : p.kind === 'hunting' ? 'Hunting' : p.kind === 'service' ? 'Trading Post' : 'Landmark';
        return `<button class="place-btn ${known ? '' : 'unknown'} ${this.selPlace === p.id ? 'sel' : ''}" data-id="${p.id}"><b>${known ? esc(p.name) : 'Undiscovered'}</b><small>${kind}${known ? run : ''}</small></button>`;
      })
      .join('');
    this.body.innerHTML = `<div class="map-wrap"><div class="map-canvas-wrap"><canvas id="map-canvas" width="640" height="640"></canvas></div><div class="map-side"><div id="place-info"></div>${list}</div></div>`;
    const canvas = $('map-canvas');
    const draw = () => this.drawMap(canvas);
    draw();
    this.mapTimer = setInterval(() => {
      if (this.current !== 'map') {
        clearInterval(this.mapTimer);
        return;
      }
      draw();
    }, 250);
    this.body.querySelectorAll('.place-btn').forEach((b) =>
      b.addEventListener('click', () => {
        this.selPlace = b.dataset.id;
        g.audio?.click();
        this.renderMap();
      })
    );
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * SIZE - HALF;
      const mz = ((e.clientY - r.top) / r.height) * SIZE - HALF;
      let best = null;
      let bd = 90;
      for (const p of places) {
        const d = Math.hypot(p.x - mx, p.z - mz);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        this.selPlace = best.id;
        this.renderMap();
      }
    });
    this.renderPlaceInfo();
  }

  renderPlaceInfo() {
    const g = this.game;
    const box = $('place-info');
    if (!box) return;
    const p = this.selPlace ? g.world.place(this.selPlace) : null;
    if (!p) {
      box.innerHTML = `<div class="place-info"><p>Tap a place to see it. Discovered places can be reached by driving the hot rod there on the road, or with a quick trip from this map.</p></div>`;
      return;
    }
    const known = g.state.discovered[p.id];
    const pos = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    const dist = d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
    const hours = Math.max(0.25, d / 15000 + 0.25);
    const busy = g.fishing.state !== 'idle' || (g.bears && g.bears.threat);
    box.innerHTML = `<div class="place-info"><b>${known ? esc(p.name) : 'Undiscovered place'}</b><p>${known ? esc(p.blurb) : 'Explore to find it. Follow the roads and watch the compass.'}</p><p>${dist} away</p>${
      known && d > 60
        ? `<button class="btn hot" id="travel-btn" ${busy ? 'disabled' : ''}>Drive there · about ${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + ' h'}</button>${busy ? '<p>Deal with the situation at hand first.</p>' : ''}`
        : ''
    }</div>`;
    const tb = $('travel-btn');
    if (tb && !busy)
      tb.addEventListener('click', () => {
        this.close();
        g.fastTravel(p.id, hours);
      });
  }

  drawMap(canvas) {
    const g = this.game;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.drawImage(this.ensureMapImage(), 0, 0, size, size);
    const s = g.state;
    // places
    for (const p of g.world.places) {
      const known = s.discovered[p.id];
      const [x, y] = worldToMap(p.x, p.z, size);
      ctx.beginPath();
      ctx.arc(x, y, this.selPlace === p.id ? 10 : 7, 0, Math.PI * 2);
      ctx.fillStyle = !known ? 'rgba(20,20,20,0.6)' : p.kind === 'fishing' ? '#ff7a1a' : p.kind === 'hunting' ? '#c8231b' : p.kind === 'service' ? '#ffcc3a' : '#5fc8c0';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0d1a1f';
      ctx.stroke();
      ctx.font = '700 15px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,20,24,0.85)';
      const label = known ? p.name : '?';
      ctx.strokeText(label, x, y - 13);
      ctx.fillStyle = '#f4ead6';
      ctx.fillText(label, x, y - 13);
      if (known && s.salmonRun && s.salmonRun.place === p.id) {
        ctx.fillStyle = '#ffcc3a';
        ctx.fillText('SALMON RUN', x, y + 24);
      }
    }
    // hot rod
    const car = g.hotrod;
    const [cx, cy] = worldToMap(car.pos.x, car.pos.z, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-car.yaw + Math.PI);
    ctx.fillStyle = '#c8231b';
    ctx.fillRect(-4, -7, 8, 14);
    ctx.fillStyle = '#ffcc3a';
    ctx.fillRect(-4, -7, 8, 4);
    ctx.restore();
    // player arrow
    const P = g.player.mode === 'drive' ? car.pos : g.player.pos;
    const yaw = g.player.mode === 'drive' ? car.yaw + Math.PI : g.player.yaw;
    const [px, py] = worldToMap(P.x, P.z, size);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0d1a1f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // north arrow
    ctx.fillStyle = 'rgba(13,26,31,0.75)';
    ctx.beginPath();
    ctx.arc(size - 30, 30, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4ead6';
    ctx.font = '800 18px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', size - 30, 37);
  }

  // -------------------------------------------------------------- journal
  renderJournal() {
    const g = this.game;
    const s = g.state;
    this.title.textContent = 'Journal';
    const tab = this.tab || 'fish';
    this.setTabs(
      [
        ['fish', `Fish ${s.speciesCaughtCount()}/${SPECIES_IDS.length}`],
        ['legends', 'Legends'],
        ['trophies', 'Hunting'],
        ['goals', 'Challenges'],
        ['stats', 'Stats'],
      ],
      tab
    );
    if (tab === 'fish') {
      this.body.innerHTML = `<div class="grid">${SPECIES_IDS.map((id) => {
        const j = s.journal[id];
        const f = FISH[id];
        return `<div class="fishcard ${j ? '' : 'unknown'}"><canvas data-fish="${id}"></canvas><h4>${j ? f.name : '??? ' + f.nick}</h4><small>${
          j ? `Best ${j.best.toFixed(1)} kg · ${j.bestLen} cm · caught ${j.count}` : `Record range ${f.min}-${f.max} kg`
        }</small><small>${j ? esc(f.info) : ''}</small></div>`;
      }).join('')}</div>`;
      this.body.querySelectorAll('canvas[data-fish]').forEach((c) => drawFish2D(c, c.dataset.fish, !!s.journal[c.dataset.fish]));
    } else if (tab === 'legends') {
      this.body.innerHTML = `<h3>Six legendary fish swim these waters</h3><div class="list">${Object.entries(LEGENDS)
        .map(([id, L]) => {
          const got = s.legends[id];
          const pl = g.world.place(L.place);
          return `<div class="li"><b>${got ? esc(L.name) : '??? ' + FISH[L.base].name}</b><span>${pl ? esc(pl.name) : ''}</span><span class="v">${
            got ? got.weight.toFixed(1) + ' kg' : 'Hint: ' + LURES[L.lure].name
          }</span></div>`;
        })
        .join('')}</div><p class="catch-info" style="margin-top:12px">Legends bite more often on the right lure, in a gold hotspot, with a perfect cast. A strong rod helps.</p>`;
    } else if (tab === 'trophies') {
      const rows = Object.entries(GAME)
        .map(([id, a]) => `<div class="li"><b>${a.name}</b><span>${s.hunted[id] || 0} taken</span><span class="v">${formatMoney(a.value)} each</span></div>`)
        .join('');
      const held = s.trophies.length
        ? s.trophies.map((t) => `<div class="li"><b>${esc(t.name)}</b><span>${t.weight} kg</span><span class="v">${formatMoney(t.value)}</span></div>`).join('')
        : '<p class="catch-info">No unsold trophies. Hunt caribou on the tundra, moose by the lakes, deer and black bears in the forests and mountain goats on the cliffs of Mount Ruben.</p>';
      this.body.innerHTML = `<h3>Hunting log</h3><div class="list">${rows}</div><h3 style="margin-top:16px">Trophies to sell</h3><div class="list">${held}</div>`;
    } else if (tab === 'goals') {
      const cur = s.currentChallenge();
      this.body.innerHTML = `<div class="list">${CHALLENGES.map((c) => {
        const done = s.challenges[c.id];
        return `<div class="challenge ${done ? 'done' : ''} ${cur && cur.id === c.id ? 'current' : ''}"><div class="check">${done ? '✓' : ''}</div><p>${esc(c.text)}</p><span class="reward">${formatMoney(c.reward)}</span></div>`;
      }).join('')}</div>`;
    } else {
      const st = s.stats;
      const rows = [
        ['Days in Alaska', g.env.day],
        ['Casts', st.casts],
        ['Perfect casts', st.perfects],
        ['Fish caught', st.caught],
        ['Fish released', st.released],
        ['Lines snapped', st.snapped],
        ['Animals hunted', st.hunted],
        ['Grizzly charges survived', st.bearsSurvived],
        ['Money earned', formatMoney(st.earned)],
      ];
      this.body.innerHTML = `<div class="list">${rows.map(([k, v]) => `<div class="li"><b>${k}</b><span></span><span class="v">${v}</span></div>`).join('')}</div>`;
    }
  }

  // ----------------------------------------------------------------- shop
  renderShop() {
    const g = this.game;
    const s = g.state;
    this.title.textContent = 'Kenai Trading Post';
    const tab = this.tab || 'sell';
    this.setTabs(
      [
        ['sell', 'Sell'],
        ['tackle', 'Tackle'],
        ['gear', 'Bow & gear'],
        ['garage', 'Garage'],
      ],
      tab
    );
    const head = `<div class="sell-bar"><span class="money-line">${formatMoney(s.money)}</span><span class="tag">Cooler ${s.cooler.length}/${s.coolerCap()}</span></div>`;
    if (tab === 'sell') {
      const fish = s.cooler;
      const total = fish.reduce((a, f) => a + f.value, 0) + s.trophies.reduce((a, t) => a + t.value, 0);
      const rows =
        fish.map((f) => `<div class="li"><b>${esc(f.name)}</b><span>${f.weight.toFixed(1)} kg</span><span class="v">${formatMoney(f.value)}</span></div>`).join('') +
        s.trophies.map((t) => `<div class="li"><b>${esc(t.name)}</b><span>${t.weight} kg</span><span class="v">${formatMoney(t.value)}</span></div>`).join('');
      this.body.innerHTML = `${head}<div class="list">${rows || '<p class="catch-info">Nothing to sell. Fill the cooler at the fishing spots or bring in hunting trophies.</p>'}</div><div class="dialog-actions"><button class="btn big hot" id="sell-all" ${total ? '' : 'disabled'}>Sell everything · ${formatMoney(total)}</button></div>`;
      const b = $('sell-all');
      if (b && total)
        b.addEventListener('click', () => {
          const count = fish.length + s.trophies.length;
          s.addMoney(total);
          s.cooler = [];
          s.trophies = [];
          g.audio?.cash();
          g.hud.toast(`Sold for ${formatMoney(total)}`, 'money');
          g.onEvent({ type: 'sell', count });
          this.render();
        });
      return;
    }
    const cards = [];
    const card = (id, title, desc, price, owned, equipped, action, extra = '') => {
      const can = s.money >= price;
      let btn;
      if (equipped) btn = `<span class="tag good">EQUIPPED</span>`;
      else if (owned) btn = `<button class="btn" data-act="${action}" data-id="${id}">Use</button>`;
      else btn = `<button class="btn ${can ? 'hot' : ''}" data-act="buy-${action}" data-id="${id}" ${can ? '' : 'disabled'}>Buy</button>`;
      cards.push(
        `<div class="item ${owned ? 'owned' : ''}">${extra}<h4>${esc(title)}</h4><p>${esc(desc)}</p><div class="row"><span class="price">${
          owned ? 'Owned' : price ? formatMoney(price) : 'Free'
        }</span>${btn}</div></div>`
      );
    };
    if (tab === 'tackle') {
      for (const r of RODS) card(r.id, r.name, `${r.desc} Max tension ${r.maxTension}, casts ${r.cast} m.`, r.price, s.gear.rods.includes(r.id), s.gear.rod === r.id, 'rod');
      for (const [id, l] of Object.entries(LURES))
        card(id, l.name, l.desc, l.price, s.gear.lures.includes(id), s.gear.lure === id, 'lure', `<div class="swatch" style="background:${hex(l.color)}"></div>`);
    } else if (tab === 'gear') {
      const consumable = (id, title, desc, price, have, max) => {
        const can = s.money >= price && have < max;
        cards.push(
          `<div class="item"><h4>${esc(title)}</h4><p>${esc(desc)}</p><div class="row"><span class="price">${formatMoney(price)}</span><span class="tag">Have ${have}${
            max < 999 ? '/' + max : ''
          }</span><button class="btn ${can ? 'hot' : ''}" data-act="buy-item" data-id="${id}" ${can ? '' : 'disabled'}>Buy</button></div></div>`
        );
      };
      consumable('arrows', GEAR.arrows.name, GEAR.arrows.desc, GEAR.arrows.price, s.gear.arrows, QUIVER);
      consumable('spray', GEAR.spray.name, GEAR.spray.desc, GEAR.spray.price, s.gear.spray, 2);
      consumable('medkit', GEAR.medkit.name, GEAR.medkit.desc, GEAR.medkit.price, s.gear.medkit, 3);
      card('yew', GEAR.yew.name, GEAR.yew.desc, GEAR.yew.price, s.gear.yew, s.gear.yew, 'yew');
      card('sight', GEAR.sight.name, GEAR.sight.desc, GEAR.sight.price, s.gear.sight, s.gear.sight, 'sight');
      COOLERS.forEach((c, i) => {
        if (i === 0) return;
        card(String(i), c.name, `Holds ${c.cap} fish.`, c.price, s.gear.cooler >= i, s.gear.cooler === i, 'cooler');
      });
    } else if (tab === 'garage') {
      ENGINES.forEach((e, i) => card(String(i), e.name, `Top speed ${Math.round(e.top * 3.6)} km/h.`, e.price, s.gear.engine >= i, s.gear.engine === i, 'engine'));
      TIRES.forEach((t, i) => card(String(i), t.name, i ? 'Much better grip off the road, on gravel and tundra.' : 'Grippy on asphalt and gravel roads.', t.price, s.gear.tires >= i, s.gear.tires === i, 'tires'));
      PAINTS.forEach((p) =>
        card(p.id, p.name, 'Hot rod paint job with hand-laid flames.', p.price, s.gear.paints.includes(p.id), s.gear.paint === p.id, 'paint', `<div class="swatch" style="background:linear-gradient(135deg, ${p.base} 55%, ${p.b} 55%, ${p.a})"></div>`)
      );
    }
    this.body.innerHTML = `${head}<div class="grid">${cards.join('')}</div>`;
    this.body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.shopAction(b.dataset.act, b.dataset.id)));
  }

  shopAction(act, id) {
    const g = this.game;
    const s = g.state;
    const pay = (price) => {
      if (s.money < price) {
        g.hud.toast('Not enough money', 'bad');
        return false;
      }
      s.money -= price;
      g.audio?.cash();
      return true;
    };
    switch (act) {
      case 'buy-rod': {
        const r = RODS.find((x) => x.id === id);
        if (pay(r.price)) {
          s.gear.rods.push(id);
          s.gear.rod = id;
          g.hud.toast(`${r.name} equipped`, 'good');
        }
        break;
      }
      case 'rod':
        s.gear.rod = id;
        break;
      case 'buy-lure': {
        const l = LURES[id];
        if (pay(l.price)) {
          s.gear.lures.push(id);
          s.gear.lure = id;
          g.hud.toast(`${l.name} tied on`, 'good');
          g.onEvent({ type: 'buy', kind: 'lure' });
        }
        break;
      }
      case 'lure':
        s.gear.lure = id;
        break;
      case 'buy-item': {
        const item = GEAR[id];
        if (pay(item.price)) {
          if (id === 'arrows') s.gear.arrows = Math.min(QUIVER, s.gear.arrows + 12);
          if (id === 'spray') s.gear.spray = Math.min(2, s.gear.spray + 1);
          if (id === 'medkit') s.gear.medkit = Math.min(3, s.gear.medkit + 1);
        }
        break;
      }
      case 'buy-sight':
        if (pay(GEAR.sight.price)) {
          s.gear.sight = true;
          g.hud.toast('Bow sight fitted', 'good');
        }
        break;
      case 'buy-yew':
        if (pay(GEAR.yew.price)) {
          s.gear.yew = true;
          g.viewmodel.setBowWood?.(true);
          g.hud.toast('Yew longbow strung', 'good');
        }
        break;
      case 'buy-cooler': {
        const i = Number(id);
        if (i === s.gear.cooler + 1 && pay(COOLERS[i].price)) s.gear.cooler = i;
        else if (i > s.gear.cooler + 1) g.hud.toast('Buy the smaller upgrade first', 'bad');
        break;
      }
      case 'buy-engine': {
        const i = Number(id);
        if (i === s.gear.engine + 1 && pay(ENGINES[i].price)) {
          s.gear.engine = i;
          g.audio?.rev?.();
        } else if (i > s.gear.engine + 1) g.hud.toast('Install the previous engine first', 'bad');
        break;
      }
      case 'engine':
        break;
      case 'buy-tires': {
        const i = Number(id);
        if (pay(TIRES[i].price)) s.gear.tires = i;
        break;
      }
      case 'buy-paint': {
        const p = PAINTS.find((x) => x.id === id);
        if (pay(p.price)) {
          s.gear.paints.push(id);
          s.gear.paint = id;
          g.hotrod.setPaint(id);
        }
        break;
      }
      case 'paint':
        s.gear.paint = id;
        g.hotrod.setPaint(id);
        break;
      default:
        break;
    }
    this.render();
  }

  // ------------------------------------------------------------ lure picker
  renderLures() {
    const g = this.game;
    const s = g.state;
    this.title.textContent = 'Tackle box';
    this.setTabs([], null);
    this.body.innerHTML = `<div class="lure-grid">${Object.entries(LURES)
      .map(([id, l]) => {
        const owned = s.gear.lures.includes(id);
        return `<div class="item ${owned ? 'owned' : 'locked'}"><div class="row" style="justify-content:flex-start;gap:10px"><div class="swatch" style="background:${hex(l.color)}"></div><h4>${esc(
          l.name
        )}</h4></div><p>${esc(l.desc)}</p><div class="row">${
          owned
            ? s.gear.lure === id
              ? '<span class="tag good">ON THE LINE</span>'
              : `<button class="btn hot" data-lure="${id}">Tie on</button>`
            : `<span class="tag">Trading Post · ${formatMoney(l.price)}</span>`
        }</div></div>`;
      })
      .join('')}</div><p class="catch-info" style="margin-top:12px">Rod: <b>${esc(s.rod().name)}</b>. Each species prefers certain lures. Match the lure to the water.</p>`;
    this.body.querySelectorAll('[data-lure]').forEach((b) =>
      b.addEventListener('click', () => {
        s.gear.lure = b.dataset.lure;
        g.hud.toast(`${LURES[b.dataset.lure].name} tied on`);
        this.close();
      })
    );
  }

  // ---------------------------------------------------------------- pause
  renderPause() {
    const g = this.game;
    this.title.textContent = 'Paused';
    this.setTabs([], null);
    this.body.innerHTML = `<div class="settings pause-menu">
      <button class="btn big hot" id="p-resume">Resume</button>
      <button class="btn big" id="p-save">Save game</button>
      <button class="btn big" id="p-settings">Settings</button>
      <button class="btn big" id="p-howto">How to play</button>
      <button class="btn big ghost" id="p-quit">Save and return to title</button>
      <p class="catch-info" id="p-note">The game also saves by itself every 45 seconds and whenever you keep a fish, trade, sleep or travel. Pick up where you left off with Continue on the title screen.</p>
    </div>`;
    $('p-resume').addEventListener('click', () => this.close());
    $('p-save').addEventListener('click', () => {
      const ok = g.save();
      $('p-note').textContent = ok
        ? `Game saved: day ${g.env.day}, ${formatTime(g.env.time)}. Choose Continue on the title screen to pick it up.`
        : "Couldn't save. This browser is blocking website data for this page (for example in private browsing).";
      g.audio?.click();
    });
    $('p-settings').addEventListener('click', () => {
      this.current = 'settings';
      this.render();
    });
    $('p-howto').addEventListener('click', () => {
      this.current = 'howto';
      this.render();
    });
    $('p-quit').addEventListener('click', () => {
      this.close();
      g.save();
      g.toTitle();
    });
  }

  renderSettings() {
    const g = this.game;
    const st = g.state.settings;
    this.title.textContent = 'Settings';
    this.setTabs([], null);
    const q = g.qualityName;
    this.body.innerHTML = `<div class="settings">
      <div class="setting"><label>Graphics</label><div class="seg" id="s-quality">${['low', 'medium', 'high']
        .map((k) => `<button data-q="${k}" class="${q === k ? 'on' : ''}">${k.toUpperCase()}</button>`)
        .join('')}</div></div>
      <p class="setting-note">High adds bloom, sun rays, the longest shadows and the densest forests. Medium and Low run cooler on older devices.</p>
      <div class="setting"><label>Adjust graphics automatically</label><div class="seg" id="s-auto"><button data-v="0" class="${st.autoQuality === false ? 'on' : ''}">OFF</button><button data-v="1" class="${st.autoQuality === false ? '' : 'on'}">ON</button></div></div>
      <div class="setting"><label>Show frame rate</label><div class="seg" id="s-fps"><button data-v="0" class="${st.showFps ? '' : 'on'}">OFF</button><button data-v="1" class="${st.showFps ? 'on' : ''}">ON</button></div></div>
      <div class="setting"><label for="s-vol">Sound volume</label><input type="range" id="s-vol" min="0" max="1" step="0.05" value="${st.volume}"></div>
      <div class="setting"><label for="s-music">Music volume</label><input type="range" id="s-music" min="0" max="1" step="0.05" value="${st.music}"></div>
      <div class="setting"><label for="s-sens">Look sensitivity</label><input type="range" id="s-sens" min="0.4" max="2.2" step="0.05" value="${st.sens}"></div>
      <div class="setting"><label>Invert look up/down</label><div class="seg" id="s-invert"><button data-v="0" class="${st.invert ? '' : 'on'}">OFF</button><button data-v="1" class="${st.invert ? 'on' : ''}">ON</button></div></div>
      <div class="setting"><label>Start over</label><button class="btn ghost" id="s-reset">Reset progress</button></div>
      <div class="setting"><label>Privacy</label><button class="btn ghost" id="s-privacy">Privacy policy</button></div>
      <button class="btn big hot" id="s-done">Done</button>
    </div>`;
    $('s-privacy').addEventListener('click', () => {
      this.current = 'privacy';
      this.render();
    });
    this.body.querySelectorAll('#s-quality button').forEach((b) =>
      b.addEventListener('click', () => {
        st.quality = b.dataset.q;
        g.setQuality(b.dataset.q);
        g.state.saveSettings();
        this.render();
      })
    );
    $('s-vol').addEventListener('input', (e) => {
      st.volume = Number(e.target.value);
      g.audio?.setVolumes(st.volume, st.music);
      g.state.saveSettings();
    });
    $('s-music').addEventListener('input', (e) => {
      st.music = Number(e.target.value);
      g.audio?.setVolumes(st.volume, st.music);
      g.state.saveSettings();
    });
    $('s-sens').addEventListener('input', (e) => {
      st.sens = Number(e.target.value);
      g.input.sensitivity = st.sens;
      g.state.saveSettings();
    });
    this.body.querySelectorAll('#s-fps button').forEach((b) =>
      b.addEventListener('click', () => {
        st.showFps = b.dataset.v === '1';
        g.state.saveSettings();
        this.render();
      })
    );
    this.body.querySelectorAll('#s-auto button').forEach((b) =>
      b.addEventListener('click', () => {
        st.autoQuality = b.dataset.v === '1';
        g.state.saveSettings();
        this.render();
      })
    );
    this.body.querySelectorAll('#s-invert button').forEach((b) =>
      b.addEventListener('click', () => {
        st.invert = b.dataset.v === '1';
        g.input.invertY = st.invert;
        g.state.saveSettings();
        this.render();
      })
    );
    $('s-reset').addEventListener('click', () => {
      this.dialog('Reset all progress?', 'Money, gear, the journal and challenges will be wiped. This cannot be undone.', [
        ['Keep playing', 'ghost', () => this.open('settings')],
        [
          'Reset',
          'hot',
          () => {
            g.state.wipe();
            this.close();
            g.toTitle();
          },
        ],
      ]);
    });
    $('s-done').addEventListener('click', () => (g.started ? this.open('pause') : this.close()));
  }

  renderHowto() {
    const g = this.game;
    this.title.textContent = 'How to play';
    this.setTabs([], null);
    const touch = g.input.usingTouch || /iPhone|iPad|Android/i.test(navigator.userAgent);
    this.body.innerHTML = `<div class="howto">
      <section><h4>Get around</h4><p>${touch ? 'Drag on the left side of the screen to walk. Push far to jog. Drag on the right side to look around.' : 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, hold <kbd>Shift</kbd> to jog, drag the mouse to look (click the view to lock the mouse).'}</p><p>Walk up to the hot rod and tap <b>DRIVE</b>. The compass shows places, your car and your current goal.</p></section>
      <section><h4>Casting</h4><p>Face the water with the rod out and tap <b>CAST</b>. A needle runs along the meter at the bottom:</p>
        <div class="demo-meter"><i style="left:30%;width:40%;background:rgba(95,200,192,.3)"></i><i style="left:52%;width:9%;background:#ffcc3a"></i><i style="left:4.8%;width:4.4%;background:#8fbf5a"></i></div>
        <ul><li>Tap once to set <b>power</b>. Blue shows where water is. Gold is a fish hotspot.</li><li>The needle swings back. Tap again on the <b>green mark</b> for accuracy.</li><li>Hit both for a <b>PERFECT CAST</b> and better bites. Miss the green completely and you get a backlash.</li></ul></section>
      <section><h4>Bites</h4><p>Watch the float. Small twitches are nibbles, so wait. When it plunges under, tap <b>HOOK!</b> fast.</p><p>Tap <b>REEL</b> while waiting to twitch the lure, hold it to retrieve.</p></section>
      <section><h4>The fight</h4><ul><li>Hold <b>REEL</b> to bring the fish in. Keep the needle in the green.</li><li>When it runs, let go before the line snaps, then reel again.</li><li>Steer the rod against the run: ${touch ? 'drag left or right on the left side' : 'press <kbd>A</kbd> or <kbd>D</kbd>'}.</li><li>When it jumps, release REEL or it throws the hook.</li></ul></section>
      <section><h4>Driving</h4><p>${touch ? 'Hold <b>GAS</b> and <b>BRAKE</b>, steer by dragging on the left side.' : '<kbd>W</kbd> gas, <kbd>S</kbd> brake and reverse, <kbd>A</kbd>/<kbd>D</kbd> steer.'} Tap the camera button to see the hot rod from behind, and the horn to say hello. Street tires slide on gravel and tundra.</p></section>
      <section><h4>The tool button</h4><p>It switches between the fishing rod, the longbow and empty hands, so you can put the rod away when you are not fishing.</p></section>
      <section><h4>Hunting with the longbow</h4><p>Hold <b>DRAW</b> to pull the string back and let go to shoot. A full draw flies fastest and flattest; arrows drop over distance, so aim a little high far away. <b>AIM</b> narrows your view. Holding a full draw for long makes your arms shake.</p><p>Walk over arrows that missed to pick them up. Walk up to downed game and tap <b>CLAIM</b>.</p><p>Grizzlies smell fish in your cooler. When one charges, the screen edge turns red: switch to the bow and shoot, or use bear spray up close.</p></section>
      <section><h4>Money and upgrades</h4><p>Sell fish and trophies at the Kenai Trading Post. Buy rods that can handle kings and halibut, new lures, arrows, a yew longbow and a bow sight, a bigger cooler, a better engine and new paint.</p><p>Sleep at Ruben's cabin to skip the night. Watch for the northern lights first.</p></section>
      <section><h4>Saving</h4><p>The game saves by itself every 45 seconds and whenever you keep a fish, trade, sleep or travel. A <b>SAVED</b> note flashes under the clock. To save right now, open the pause menu${touch ? ' (top right)' : ' (<kbd>Esc</kbd>)'} and choose <b>Save game</b>. Next time, choose <b>Continue</b> on the title screen.</p></section>
      ${touch ? '' : '<section><h4>Keyboard</h4><p><kbd>Space</kbd> or click: cast and reel; hold and let go to shoot the bow. <kbd>Right click</kbd> aim. <kbd>E</kbd> interact, or keep a catch (<kbd>R</kbd> releases it). <kbd>Q</kbd> next tool, or <kbd>1</kbd> rod, <kbd>2</kbd> longbow, <kbd>3</kbd> empty hands. <kbd>G</kbd> bear spray. <kbd>X</kbd> first aid kit. <kbd>L</kbd> lures. <kbd>M</kbd> map. <kbd>J</kbd> journal. <kbd>C</kbd> camera. <kbd>H</kbd> horn. <kbd>Esc</kbd> pause.</p></section>'}
    </div><div class="dialog-actions"><button class="btn big hot" id="h-done">Got it</button></div>`;
    $('h-done').addEventListener('click', () => (g.started ? this.open('pause') : this.close()));
  }

  renderPrivacy() {
    this.title.textContent = 'Privacy';
    this.setTabs([], null);
    this.body.innerHTML = `<div class="howto privacy">${privacyHTML()}<p class="catch-info">Last updated ${PRIVACY_UPDATED}</p></div><div class="dialog-actions"><button class="btn big hot" id="pv-back">Back</button></div>`;
    $('pv-back').addEventListener('click', () => {
      this.current = 'settings';
      this.render();
    });
  }

  // --------------------------------------------------------------- dialogs
  dialog(title, text, actions) {
    this.dialogData = { title, text, actions };
    if (!this.current) this.open('dialog');
    else {
      this.current = 'dialog';
      this.render();
    }
  }

  renderDialog() {
    const d = this.dialogData;
    this.title.textContent = d.title;
    this.setTabs([], null);
    this.body.innerHTML = `<p class="catch-info" style="font-size:17px;color:var(--ink)">${esc(d.text)}</p><div class="dialog-actions">${d.actions
      .map(([label, cls], i) => `<button class="btn big ${cls}" data-i="${i}">${esc(label)}</button>`)
      .join('')}</div>`;
    this.body.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = d.actions[Number(b.dataset.i)];
        this.close();
        a[2] && a[2]();
      })
    );
  }
}
