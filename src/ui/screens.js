// Menu sheets: map with fast travel, journal (fish, trophies, challenges),
// Trading Post shop, lure picker, pause/settings, how-to-play and dialogs.
import { biteOutlook, bestTime } from '../gameplay/bite.js';
import { PHOTO_SUBJECTS, PHOTO_GROUPS, CAMERA_PRICE } from '../gameplay/camera.js';
import { BOAT } from '../entities/boat.js';
import { jobGoal } from '../gameplay/jobs.js';
import { FISH, SPECIES_IDS, LEGENDS, LURES, RODS, COOLERS, ENGINES, TIRES, PAINTS, GEAR, GAME, CHALLENGES, ARROWS, ARROW_ORDER, LOOKS, lookColors, RARITY, RARITY_ORDER, timingGradient, placeSpecies } from '../gameplay/data.js';
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
  const H = { salmon: 0.26, trout: 0.24, grayling: 0.22, pike: 0.16, eel: 0.14, flat: 0.42, ling: 0.2, rockfish: 0.36, cod: 0.24, whitefish: 0.22, quillback: 0.38, greenling: 0.2, sculpin: 0.3, shark: 0.18, skate: 0.62 }[shape] * L;
  const grad = g.createLinearGradient(0, cy - H / 2, 0, cy + H / 2);
  grad.addColorStop(0, hex(f.col.back));
  grad.addColorStop(0.45, hex(f.col.side));
  grad.addColorStop(1, hex(f.col.belly));
  g.fillStyle = known ? grad : '#000';
  if (shape === 'skate') {
    // seen from above: a diamond with a long thin tail
    g.beginPath();
    g.moveTo(x0 + L * 1.0, cy);
    g.lineTo(x0 + L * 0.62, cy - H * 0.5);
    g.lineTo(x0 + L * 0.42, cy);
    g.lineTo(x0 + L * 0.62, cy + H * 0.5);
    g.closePath();
    g.fill();
    g.fillRect(x0, cy - H * 0.03, L * 0.46, H * 0.06);
    if (!known) return;
    g.fillStyle = hex(f.col.eyespot || 0x2a2620);
    for (const s2 of [-1, 1]) {
      g.beginPath();
      g.arc(x0 + L * 0.66, cy + s2 * H * 0.22, Math.max(1.5, H * 0.07), 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  // tail
  g.beginPath();
  g.moveTo(x0 + L * 0.12, cy);
  g.lineTo(x0 - (shape === 'shark' ? L * 0.05 : 0), cy - H * (shape === 'shark' ? 0.85 : 0.5));
  g.lineTo(x0 + L * 0.04, cy);
  g.lineTo(x0, cy + H * (shape === 'shark' ? 0.3 : 0.5));
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
  const dh = shape === 'grayling' ? 0.7 : shape === 'quillback' ? 0.6 : 0.3;
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

// A portrait of you in the wardrobe: shirt pattern, face, beard and hat.
function drawPortrait(canvas, look) {
  if (!canvas) return;
  const c = lookColors(look);
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const hx = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const shade = (n, k) => {
    const r = Math.min(255, ((n >> 16) & 255) * k);
    const gg = Math.min(255, ((n >> 8) & 255) * k);
    const b = Math.min(255, (n & 255) * k);
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  };
  g.clearRect(0, 0, W, H);
  // a lake under the mountains behind you
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7fb6d8');
  sky.addColorStop(0.55, '#cfe4ee');
  sky.addColorStop(0.56, '#4f8aa0');
  sky.addColorStop(1, '#2c5a6c');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#6d8296';
  g.beginPath();
  g.moveTo(0, 150);
  g.lineTo(40, 92);
  g.lineTo(78, 128);
  g.lineTo(122, 70);
  g.lineTo(170, 120);
  g.lineTo(205, 88);
  g.lineTo(W, 130);
  g.lineTo(W, 146);
  g.lineTo(0, 146);
  g.fill();
  g.fillStyle = '#f2f6f8';
  g.beginPath();
  g.moveTo(122, 70);
  g.lineTo(108, 88);
  g.lineTo(118, 84);
  g.lineTo(128, 92);
  g.lineTo(136, 84);
  g.fill();
  g.fillStyle = '#2f5a3a';
  for (let i = 0; i < 14; i++) {
    const x = i * 18 + (i % 3) * 4;
    g.beginPath();
    g.moveTo(x, 146);
    g.lineTo(x + 7, 118 + (i % 4) * 5);
    g.lineTo(x + 14, 146);
    g.fill();
  }
  const cx = W / 2;
  // shoulders and the shirt
  g.save();
  g.beginPath();
  g.moveTo(cx - 100, H);
  g.quadraticCurveTo(cx - 98, 196, cx - 46, 186);
  g.lineTo(cx + 46, 186);
  g.quadraticCurveTo(cx + 98, 196, cx + 100, H);
  g.closePath();
  g.fillStyle = hx(c.shirt.main);
  g.fill();
  g.clip();
  const S = c.shirt;
  if (S.id === 'camo') {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = hx(i % 2 ? S.band : S.alt);
      g.beginPath();
      g.ellipse(cx - 100 + ((i * 53) % 200), 186 + ((i * 37) % 80), 16, 9, i, 0, Math.PI * 2);
      g.fill();
    }
  } else if (S.id === 'hawaii') {
    for (let i = 0; i < 14; i++) {
      const x = cx - 96 + ((i * 47) % 192);
      const y = 192 + ((i * 29) % 70);
      g.fillStyle = hx(S.band);
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(x + Math.cos(k * 1.256) * 6, y + Math.sin(k * 1.256) * 6, 4.5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = hx(S.alt);
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  } else if (S.id === 'racing') {
    g.fillStyle = hx(S.band);
    g.fillRect(cx - 100, 214, 200, 10);
    g.fillStyle = hx(S.alt);
    g.fillRect(cx - 100, 226, 200, 5);
  } else if (S.id === 'hivis') {
    g.fillStyle = hx(S.band);
    g.fillRect(cx - 100, 220, 200, 8);
    g.fillRect(cx - 100, 240, 200, 8);
  } else if (S.id === 'denim' || S.id === 'hoodie') {
    g.strokeStyle = shade(S.main, 0.7);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, 190);
    g.lineTo(cx, H);
    g.stroke();
  } else {
    // flannel checks
    g.globalAlpha = 0.55;
    g.fillStyle = hx(S.band);
    for (let x = -100; x < 100; x += 22) g.fillRect(cx + x, 186, 9, 80);
    for (let y = 190; y < H; y += 22) g.fillRect(cx - 100, y, 200, 9);
    g.globalAlpha = 0.3;
    g.fillStyle = '#000';
    for (let x = -100; x < 100; x += 22) for (let y = 190; y < H; y += 22) g.fillRect(cx + x, y, 9, 9);
    g.globalAlpha = 1;
  }
  g.restore();
  // collar and neck
  g.fillStyle = hx(c.skin);
  g.fillRect(cx - 17, 160, 34, 32);
  g.fillStyle = shade(S.main, 0.75);
  g.beginPath();
  g.moveTo(cx - 30, 186);
  g.lineTo(cx, 206);
  g.lineTo(cx + 30, 186);
  g.lineTo(cx + 20, 182);
  g.lineTo(cx, 196);
  g.lineTo(cx - 20, 182);
  g.fill();
  // head and ears
  g.fillStyle = hx(c.skin);
  g.beginPath();
  g.ellipse(cx, 128, 38, 46, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(cx - 38, 132, 8, 12, 0, 0, Math.PI * 2);
  g.ellipse(cx + 38, 132, 8, 12, 0, 0, Math.PI * 2);
  g.fill();
  // hair at the sides
  g.fillStyle = hx(c.hair);
  g.beginPath();
  g.ellipse(cx - 33, 112, 9, 20, 0.2, 0, Math.PI * 2);
  g.ellipse(cx + 33, 112, 9, 20, -0.2, 0, Math.PI * 2);
  g.fill();
  // eyes, brows and nose
  g.fillStyle = '#1d1712';
  g.beginPath();
  g.arc(cx - 14, 124, 3.6, 0, Math.PI * 2);
  g.arc(cx + 14, 124, 3.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(cx - 13, 123, 1.2, 0, Math.PI * 2);
  g.arc(cx + 15, 123, 1.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = hx(c.hair);
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 21, 113);
  g.lineTo(cx - 8, 111);
  g.moveTo(cx + 8, 111);
  g.lineTo(cx + 21, 113);
  g.stroke();
  g.fillStyle = hx(c.crease);
  g.beginPath();
  g.ellipse(cx, 138, 6, 8, 0, 0, Math.PI * 2);
  g.fill();
  // the beard, or a grin
  g.fillStyle = hx(c.hair);
  if (c.beard === 'full' || c.beard === 'lumber') {
    const long = c.beard === 'lumber' ? 26 : 0;
    g.beginPath();
    g.moveTo(cx - 37, 128);
    g.quadraticCurveTo(cx - 36, 182 + long, cx, 186 + long);
    g.quadraticCurveTo(cx + 36, 182 + long, cx + 37, 128);
    g.quadraticCurveTo(cx + 20, 150, cx, 148);
    g.quadraticCurveTo(cx - 20, 150, cx - 37, 128);
    g.fill();
    g.fillStyle = shade(c.skin, 0.55);
    g.beginPath();
    g.ellipse(cx, 160, 10, 4, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    if (c.beard === 'stubble') {
      g.globalAlpha = 0.35;
      g.beginPath();
      g.moveTo(cx - 36, 132);
      g.quadraticCurveTo(cx - 32, 174, cx, 176);
      g.quadraticCurveTo(cx + 32, 174, cx + 36, 132);
      g.quadraticCurveTo(cx, 152, cx - 36, 132);
      g.fill();
      g.globalAlpha = 1;
    }
    g.strokeStyle = shade(c.skin, 0.5);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, 150, 12, 0.2, Math.PI - 0.2);
    g.stroke();
    if (c.beard === 'stache') {
      g.fillStyle = hx(c.hair);
      g.beginPath();
      g.moveTo(cx, 146);
      g.quadraticCurveTo(cx - 16, 140, cx - 24, 150);
      g.quadraticCurveTo(cx - 27, 160, cx - 21, 163);
      g.quadraticCurveTo(cx - 18, 150, cx, 152);
      g.quadraticCurveTo(cx + 18, 150, cx + 21, 163);
      g.quadraticCurveTo(cx + 27, 160, cx + 24, 150);
      g.quadraticCurveTo(cx + 16, 140, cx, 146);
      g.fill();
    }
  }
  // the hat
  const Ht = c.hat;
  if (Ht.id === 'none') {
    g.fillStyle = hx(c.hair);
    g.beginPath();
    g.ellipse(cx, 92, 38, 22, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 38, 90, 76, 8);
  } else if (Ht.id === 'cap' || Ht.id === 'trucker') {
    g.fillStyle = hx(Ht.color);
    g.beginPath();
    g.ellipse(cx, 98, 41, 32, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 41, 94, 82, 8);
    g.beginPath();
    g.ellipse(cx + 8, 102, 46, 8, 0, 0, Math.PI * 2);
    g.fill();
    if (Ht.front) {
      g.fillStyle = hx(Ht.front);
      g.beginPath();
      g.ellipse(cx, 84, 22, 16, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.fillRect(cx - 22, 82, 44, 12);
      g.fillStyle = '#e86a1a';
      g.font = 'bold 10px sans-serif';
      g.textAlign = 'center';
      g.fillText('HOTROD', cx, 90);
    }
  } else if (Ht.id === 'beanie') {
    g.fillStyle = hx(Ht.color);
    g.beginPath();
    g.ellipse(cx, 98, 40, 38, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8e2d6';
    g.fillRect(cx - 41, 92, 82, 14);
    g.beginPath();
    g.arc(cx, 58, 9, 0, Math.PI * 2);
    g.fill();
  } else if (Ht.id === 'bucket') {
    g.fillStyle = hx(Ht.color);
    g.beginPath();
    g.moveTo(cx - 34, 98);
    g.lineTo(cx - 28, 66);
    g.lineTo(cx + 28, 66);
    g.lineTo(cx + 34, 98);
    g.fill();
    g.beginPath();
    g.ellipse(cx, 100, 56, 10, 0, 0, Math.PI * 2);
    g.fill();
  } else if (Ht.id === 'cowboy') {
    g.fillStyle = hx(Ht.color);
    g.beginPath();
    g.ellipse(cx, 100, 72, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - 32, 98);
    g.quadraticCurveTo(cx - 34, 56, cx - 10, 62);
    g.quadraticCurveTo(cx, 70, cx + 10, 62);
    g.quadraticCurveTo(cx + 34, 56, cx + 32, 98);
    g.fill();
    g.fillStyle = '#2a1a10';
    g.fillRect(cx - 32, 88, 64, 7);
  } else if (Ht.id === 'antler') {
    g.strokeStyle = hx(Ht.horn);
    g.fillStyle = hx(Ht.horn);
    g.lineWidth = 7;
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + sd * 26, 80);
      g.quadraticCurveTo(cx + sd * 60, 70, cx + sd * 84, 46);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + sd * 56, 66);
      g.quadraticCurveTo(cx + sd * 100, 60, cx + sd * 108, 26);
      g.lineTo(cx + sd * 92, 40);
      g.lineTo(cx + sd * 90, 18);
      g.lineTo(cx + sd * 76, 40);
      g.lineTo(cx + sd * 66, 26);
      g.quadraticCurveTo(cx + sd * 62, 52, cx + sd * 50, 62);
      g.fill();
    }
    g.fillStyle = hx(Ht.color);
    g.beginPath();
    g.ellipse(cx, 98, 41, 32, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 41, 94, 82, 8);
  }
  // a thumbs up in your gloves
  const gx = cx + 78;
  const gy = 222;
  g.fillStyle = hx(c.shirt.main);
  g.fillRect(gx - 14, gy + 16, 28, 30);
  g.fillStyle = hx(c.glove);
  g.beginPath();
  g.roundRect ? g.roundRect(gx - 16, gy - 4, 32, 26, 7) : g.rect(gx - 16, gy - 4, 32, 26);
  g.fill();
  g.beginPath();
  g.roundRect ? g.roundRect(gx - 7, gy - 26, 12, 26, 6) : g.rect(gx - 7, gy - 26, 12, 26);
  g.fill();
  if (c.gloves === 'wool') {
    g.fillStyle = hx(c.skin);
    g.fillRect(gx + 10, gy - 2, 7, 22);
  }
}

export class Screens {
  constructor(game) {
    this.game = game;
    this.overlay = $('overlay');
    this.sheet = $('sheet');
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
    if (was === 'shop' || was === 'wardrobe') this.game.save();
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
    // the map takes the whole screen
    this.sheet.classList.toggle('wide', n === 'map');
    if (n === 'map') this.renderMap();
    else if (n === 'journal') this.renderJournal();
    else if (n === 'shop') this.renderShop();
    else if (n === 'pause') this.renderPause();
    else if (n === 'settings') this.renderSettings();
    else if (n === 'howto') this.renderHowto();
    else if (n === 'privacy') this.renderPrivacy();
    else if (n === 'lure') this.renderLures();
    else if (n === 'dialog') this.renderDialog();
    else if (n === 'wardrobe') this.renderWardrobe();
  }

  // ------------------------------------------------------------- wardrobe
  renderWardrobe() {
    const g = this.game;
    const s = g.state;
    this.title.textContent = 'Wardrobe';
    this.tabs.innerHTML = '';
    const hexs = (c) => '#' + c.toString(16).padStart(6, '0');
    const opt = (part, item, label, swatch) => {
      const on = s.look[part] === item.id;
      const owned = s.ownsLook(part, item.id);
      const price = !owned && item.price ? `<em>${formatMoney(item.price)}</em>` : '';
      return `<button class="look-opt${on ? ' on' : ''}${owned ? '' : ' locked'}" data-part="${part}" data-id="${item.id}" aria-pressed="${on}">${
        swatch ? `<i style="background:${swatch}"></i>` : ''
      }${label ? `<span>${esc(label)}</span>` : ''}${price}</button>`;
    };
    const shirtSwatch = (x) => (x.alt ? `linear-gradient(135deg, ${hexs(x.main)} 40%, ${hexs(x.band)} 40% 65%, ${hexs(x.alt)} 65%)` : `linear-gradient(135deg, ${hexs(x.main)} 55%, ${hexs(x.band)} 55%)`);
    const row = (title, html) => `<div class="look-row"><small>${title}</small><div class="look-opts">${html}</div></div>`;
    this.body.innerHTML = `<div class="wardrobe">
      <div class="look-preview"><canvas id="look-canvas" width="240" height="260"></canvas><p>${formatMoney(s.money)}</p></div>
      <div class="look-list">
        ${row('Shirt', LOOKS.shirt.map((x) => opt('shirt', x, x.name, shirtSwatch(x))).join(''))}
        ${row('Hat', LOOKS.hat.map((x) => opt('hat', x, x.name, x.color ? hexs(x.color) : null)).join(''))}
        ${row('Beard', LOOKS.beard.map((x) => opt('beard', x, x.name)).join(''))}
        ${row('Hair and beard colour', LOOKS.hair.map((x) => opt('hair', x, '', hexs(x.color))).join(''))}
        ${row('Skin', LOOKS.skin.map((x) => opt('skin', x, '', hexs(x.color))).join(''))}
        ${row('Gloves', LOOKS.gloves.map((x) => opt('gloves', x, x.name, x.color ? hexs(x.color) : null)).join(''))}
      </div></div>`;
    drawPortrait($('look-canvas'), s.look);
    this.body.querySelectorAll('.look-opt').forEach((b) =>
      b.addEventListener('click', () => {
        const part = b.dataset.part;
        const id = b.dataset.id;
        const item = LOOKS[part].find((x) => x.id === id);
        if (!s.ownsLook(part, id)) {
          if (s.money < item.price) {
            g.hud.toast('Not enough money', 'bad');
            return;
          }
          s.money -= item.price;
          s.wardrobe.push(part + ':' + id);
          g.audio?.cash();
          g.hud.toast(`${item.name} bought. Looking sharp`, 'good');
        } else g.audio?.click();
        s.look[part] = id;
        g.viewmodel.applyLook(s.look);
        g.hotrod.setLook(s.look);
        const keep = this.body.scrollTop;
        this.render();
        this.body.scrollTop = keep;
      })
    );
  }

  // ------------------------------------------------------------------ map
  ensureMapImage() {
    if (this.mapImage) return this.mapImage;
    // sharp enough for the minimap's close view (about 0.43 px per metre)
    const size = 1024;
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

  // The full map fills the screen. Drag to pan; pinch, the wheel or the
  // buttons zoom; tap a place, or the lake, river or sea it fishes, to see
  // what lives there (only places you have been to).
  renderMap() {
    const g = this.game;
    this.title.textContent = 'Kenai Country';
    this.setTabs([], null);
    const places = g.world.places;
    const list = places
      .map((p) => {
        const known = g.state.discovered[p.id];
        const run = g.state.salmonRun && g.state.salmonRun.place === p.id ? ' · Salmon run!' : '';
        const kind = p.kind === 'fishing' ? 'Fishing' : p.kind === 'hunting' ? 'Hunting' : p.kind === 'service' ? 'Trading Post' : 'Landmark';
        return `<button class="place-btn ${known ? '' : 'unknown'} ${this.selPlace === p.id ? 'sel' : ''}" data-id="${p.id}"><b>${known ? esc(p.name) : 'Undiscovered'}</b><small>${kind}${known ? run : ''}</small></button>`;
      })
      .join('');
    this.body.innerHTML = `<div class="map-full">
      <canvas id="map-canvas"></canvas>
      <div class="map-card" id="place-info"></div>
      <div class="map-tools">
        <button class="btn icon" id="map-in" aria-label="Zoom in">+</button>
        <button class="btn icon" id="map-out" aria-label="Zoom out">&minus;</button>
        <button class="btn icon" id="map-fit" aria-label="The whole map">&#x2922;</button>
        <button class="btn icon" id="map-me" aria-label="Where you are">&#x25CE;</button>
        <button class="btn" id="map-list-btn">Places</button>
      </div>
      <div class="map-list" id="map-list" ${this.mapListOpen ? '' : 'hidden'}>${list}</div>
    </div>`;
    const canvas = $('map-canvas');
    this.mapCanvas = canvas;
    this.drawMap(canvas);
    clearInterval(this.mapTimer);
    this.mapTimer = setInterval(() => {
      if (this.current !== 'map') {
        clearInterval(this.mapTimer);
        return;
      }
      this.drawMap(canvas);
    }, 250);
    const redraw = () => requestAnimationFrame(() => this.current === 'map' && this.drawMap(canvas));
    const select = (id, center) => {
      this.selPlace = id;
      if (center && id) {
        const p = g.world.place(id);
        this.mapView.cx = p.x;
        this.mapView.cz = p.z;
      }
      g.audio?.click();
      this.body.querySelectorAll('.place-btn').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
      this.renderPlaceInfo();
      redraw();
    };
    this.body.querySelectorAll('.place-btn').forEach((b) => b.addEventListener('click', () => select(b.dataset.id, true)));
    $('map-list-btn').addEventListener('click', () => {
      this.mapListOpen = !this.mapListOpen;
      $('map-list').hidden = !this.mapListOpen;
    });
    const zoomBy = (k, ax, ay) => {
      const v = this.mapView;
      const W = canvas.width;
      const H = canvas.height;
      // keep the point under (ax, ay) where it is
      const wx = v.cx + (ax - W / 2) / v.scale;
      const wz = v.cz + (ay - H / 2) / v.scale;
      v.scale = clamp(v.scale * k, v.min, v.max);
      v.cx = wx - (ax - W / 2) / v.scale;
      v.cz = wz - (ay - H / 2) / v.scale;
      redraw();
    };
    $('map-in').addEventListener('click', () => zoomBy(1.5, canvas.width / 2, canvas.height / 2));
    $('map-out').addEventListener('click', () => zoomBy(1 / 1.5, canvas.width / 2, canvas.height / 2));
    $('map-fit').addEventListener('click', () => {
      this.mapView.scale = this.mapView.min;
      this.mapView.cx = 0;
      this.mapView.cz = 0;
      redraw();
    });
    $('map-me').addEventListener('click', () => {
      const P = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
      this.mapView.cx = P.x;
      this.mapView.cz = P.z;
      this.mapView.scale = Math.max(this.mapView.scale, this.mapView.fill);
      redraw();
    });
    // drag, pinch and wheel
    const pts = new Map();
    let drag = null;
    let pinch = null;
    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, toCanvas(e));
      if (pts.size === 1) {
        const q = pts.get(e.pointerId);
        drag = { x: q.x, y: q.y, cx: this.mapView.cx, cz: this.mapView.cz, moved: 0 };
        pinch = null;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: this.mapView.scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        drag = null;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, toCanvas(e));
      const v = this.mapView;
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        zoomBy((pinch.s * (d / pinch.d)) / v.scale, pinch.mx, pinch.my);
      } else if (drag) {
        const q = pts.get(e.pointerId);
        drag.moved = Math.max(drag.moved, Math.hypot(q.x - drag.x, q.y - drag.y));
        v.cx = drag.cx - (q.x - drag.x) / v.scale;
        v.cz = drag.cz - (q.y - drag.y) / v.scale;
        redraw();
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      const q = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
      if (drag && drag.moved < 10 * dpr && e.type === 'pointerup') {
        const id = this.mapPick(q.x, q.y);
        if (id !== undefined) select(id, false);
      }
      if (pts.size === 0) {
        drag = null;
        pinch = null;
      } else if (pts.size === 1) {
        const [r] = [...pts.values()];
        drag = { x: r.x, y: r.y, cx: this.mapView.cx, cz: this.mapView.cz, moved: 99 };
        pinch = null;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const q = toCanvas(e);
        zoomBy(Math.exp(-e.deltaY * 0.0015), q.x, q.y);
      },
      { passive: false }
    );
    this.renderPlaceInfo();
  }

  // What a tap at canvas point (x, y) picks: a place marker, or the place
  // that fishes the water there. undefined when there is nothing.
  mapPick(x, y) {
    const g = this.game;
    const W = g.world;
    const v = this.mapView;
    const c = this.mapCanvas;
    const dpr = c.width / Math.max(1, c.getBoundingClientRect().width);
    let best = null;
    let bd = 34 * dpr;
    for (const p of W.places) {
      const px = (p.x - v.cx) * v.scale + c.width / 2;
      const py = (p.z - v.cz) * v.scale + c.height / 2;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    if (best) return best;
    const wx = v.cx + (x - c.width / 2) / v.scale;
    const wz = v.cz + (y - c.height / 2) / v.scale;
    const w = W.waterAt(wx, wz);
    if (!w) return null;
    const fishing = W.places.filter((p) => p.kind === 'fishing' && p.water === w.kind);
    let pick = null;
    let pd = 1e9;
    for (const p of fishing) {
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d < pd) {
        pd = d;
        pick = p.id;
      }
    }
    return pick;
  }

  renderPlaceInfo() {
    const g = this.game;
    const box = $('place-info');
    if (!box) return;
    const p = this.selPlace ? g.world.place(this.selPlace) : null;
    if (!p) {
      box.innerHTML = `<div class="place-info"><p>Tap a place, or the lake, river or sea it fishes, to see what lives there. Drag to look around; pinch or use the buttons to zoom.</p></div>`;
      return;
    }
    const known = g.state.discovered[p.id];
    const pos = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    const dist = d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
    const hours = Math.max(0.25, d / 15000 + 0.25);
    const busy = g.fishing.state !== 'idle' || (g.bears && g.bears.threat) || g.player.mode === 'boat' || !!g.player.boat;
    let fish = '';
    if (p.kind === 'fishing') {
      if (known) {
        const s = g.state;
        const items = placeSpecies(g.world, p)
          .map((f) => {
            const F = FISH[f.id];
            const caught = s.journal[f.id];
            // when it bites best: night fish say so, the rest name their hour
            const when = f.night ? 'night' : bestTime(f.id);
            return `<span class="fish-chip r-${F.rarity}${caught ? ' caught' : ''}" title="${RARITY[F.rarity].name}">${esc(F.name)}${when ? ` <i>${when}</i>` : ''}</span>`;
          })
          .join('');
        const legend = Object.values(LEGENDS).find((L) => L.place === p.id);
        const lid = legend && Object.keys(LEGENDS).find((k) => LEGENDS[k] === legend);
        const run = s.salmonRun && s.salmonRun.place === p.id ? '<p class="run">Salmon run here now: salmon bite far more often.</p>' : '';
        const o = biteOutlook(g.env, p.water);
        const bite = `<p class="bite-now ${o.level.id}">Bite here now: <b>${o.level.label}</b> · ${esc(o.reasons.join(' · '))}</p>`;
        fish = `<div class="place-fish">${bite}<small>Fish here</small><div class="fish-chips">${items}</div>${run}${
          legend ? `<p class="legend">${s.legends[lid] ? `You landed ${esc(legend.name)} here.` : 'A legend lives in these waters.'}</p>` : ''
        }</div>`;
      } else fish = `<p>Fish here and its fish show up on the map.</p>`;
    }
    box.innerHTML = `<div class="place-info"><b>${known ? esc(p.name) : 'Undiscovered place'}</b><p>${known ? esc(p.blurb) : 'Explore to find it. Follow the roads and watch the compass.'}</p>${fish}<p>${dist} away</p>${
      known && d > 60
        ? `<button class="btn hot" id="travel-btn" ${busy ? 'disabled' : ''}>Drive there · about ${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + ' h'}</button>${busy ? `<p>${g.player.mode === 'boat' || g.player.boat ? 'Get ashore first. The boat stays where you leave it.' : 'Deal with the situation at hand first.'}</p>` : ''}`
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
    // the canvas matches its box on screen, in device pixels
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(64, Math.round(r.width * dpr));
    const ch = Math.max(64, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      if (this.mapView) this.mapView.min = this.mapView.fill = 0;
    }
    const W = canvas.width;
    const H = canvas.height;
    // the view: opens filling the width around you; the whole map fits at the least zoom
    const fit = Math.min(W, H) / SIZE;
    const fill = Math.max(W, H) / SIZE;
    if (!this.mapView) {
      const P = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
      this.mapView = { cx: P.x, cz: P.z, scale: fill, min: fit, fill, max: 4 * dpr };
    }
    const v = this.mapView;
    if (!v.min) {
      v.min = fit;
      v.fill = fill;
      v.max = 4 * dpr;
      v.scale = clamp(v.scale, v.min, v.max);
    }
    // keep some of the map on screen
    const half = SIZE / 2;
    v.cx = clamp(v.cx, -half, half);
    v.cz = clamp(v.cz, -half, half);
    const sx = (x) => (x - v.cx) * v.scale + W / 2;
    const sy = (z) => (z - v.cz) * v.scale + H / 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0e2a3a';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.ensureMapImage(), sx(-half), sy(-half), SIZE * v.scale, SIZE * v.scale);
    const s = g.state;
    const k = dpr;
    // places
    for (const p of g.world.places) {
      const known = s.discovered[p.id];
      const x = sx(p.x);
      const y = sy(p.z);
      if (x < -60 * k || y < -60 * k || x > W + 60 * k || y > H + 60 * k) continue;
      ctx.beginPath();
      ctx.arc(x, y, (this.selPlace === p.id ? 11 : 8) * k, 0, Math.PI * 2);
      ctx.fillStyle = !known ? 'rgba(20,20,20,0.6)' : p.kind === 'fishing' ? '#ff7a1a' : p.kind === 'hunting' ? '#c8231b' : p.kind === 'service' ? '#ffcc3a' : '#5fc8c0';
      ctx.fill();
      ctx.lineWidth = 2.5 * k;
      ctx.strokeStyle = this.selPlace === p.id ? '#ffffff' : '#0d1a1f';
      ctx.stroke();
      ctx.font = `700 ${16 * k}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4 * k;
      ctx.strokeStyle = 'rgba(10,20,24,0.85)';
      const label = known ? p.name : '?';
      ctx.strokeText(label, x, y - 14 * k);
      ctx.fillStyle = '#f4ead6';
      ctx.fillText(label, x, y - 14 * k);
      if (known && s.salmonRun && s.salmonRun.place === p.id) {
        ctx.fillStyle = '#ffcc3a';
        ctx.strokeText('SALMON RUN', x, y + 26 * k);
        ctx.fillText('SALMON RUN', x, y + 26 * k);
      }
    }
    // hot rod
    const car = g.hotrod;
    ctx.save();
    ctx.translate(sx(car.pos.x), sy(car.pos.z));
    ctx.rotate(-car.yaw + Math.PI);
    ctx.fillStyle = '#c8231b';
    ctx.fillRect(-5 * k, -9 * k, 10 * k, 18 * k);
    ctx.fillStyle = '#ffcc3a';
    ctx.fillRect(-5 * k, -9 * k, 10 * k, 5 * k);
    ctx.restore();
    // the boat, when it is in the water
    const B = g.boat;
    if (B && B.owned && B.where === 'water') {
      ctx.save();
      ctx.translate(sx(B.pos.x), sy(B.pos.z));
      ctx.rotate(-B.yaw + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -10 * k);
      ctx.lineTo(5 * k, -2 * k);
      ctx.lineTo(5 * k, 8 * k);
      ctx.lineTo(-5 * k, 8 * k);
      ctx.lineTo(-5 * k, -2 * k);
      ctx.closePath();
      ctx.fillStyle = '#e8ecef';
      ctx.fill();
      ctx.strokeStyle = '#2d6fb0';
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.restore();
    }
    // player arrow
    const inBoat = g.player.mode === 'boat';
    const P = g.player.mode === 'drive' ? car.pos : inBoat ? B.pos : g.player.pos;
    const yaw = g.player.mode === 'drive' ? car.yaw + Math.PI : inBoat ? B.yaw + Math.PI : g.player.yaw;
    ctx.save();
    ctx.translate(sx(P.x), sy(P.z));
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -14 * k);
    ctx.lineTo(9 * k, 10 * k);
    ctx.lineTo(0, 5 * k);
    ctx.lineTo(-9 * k, 10 * k);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0d1a1f';
    ctx.lineWidth = 2.5 * k;
    ctx.stroke();
    ctx.restore();
    // north
    ctx.fillStyle = 'rgba(13,26,31,0.75)';
    ctx.beginPath();
    ctx.arc(W - 30 * k, H - 30 * k, 20 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4ead6';
    ctx.font = `800 ${18 * k}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', W - 30 * k, H - 23 * k);
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
        ['photos', `Photos ${g.photo.count()}/${Object.keys(PHOTO_SUBJECTS).length}`],
        ['goals', 'Challenges'],
        ['stats', 'Stats'],
      ],
      tab
    );
    if (tab === 'fish') {
      // commonest first, rarest last
      const order = SPECIES_IDS.slice().sort((a, b) => RARITY_ORDER.indexOf(FISH[a].rarity) - RARITY_ORDER.indexOf(FISH[b].rarity));
      this.body.innerHTML = `<div class="grid">${order.map((id) => {
        const j = s.journal[id];
        const f = FISH[id];
        const tier = RARITY[f.rarity];
        return `<div class="fishcard ${j ? '' : 'unknown'}"><canvas data-fish="${id}"></canvas><h4>${j ? f.name : '??? ' + f.nick}</h4><span class="tier rarity r-${f.rarity}">${tier.name.toUpperCase()}</span><small>${
          j ? `Best ${j.best.toFixed(1)} kg · ${j.bestLen} cm · caught ${j.count}` : `Record range ${f.min}-${f.max} kg`
        }</small><small>${j ? esc(f.info) : ''}</small></div>`;
      }).join('')}</div>`;
      this.body.querySelectorAll('canvas[data-fish]').forEach((c) => drawFish2D(c, c.dataset.fish, !!s.journal[c.dataset.fish]));
    } else if (tab === 'legends') {
      this.body.innerHTML = `<h3>${Object.keys(LEGENDS).length} legendary fish swim these waters</h3><p class="catch-info" style="margin:-4px 0 10px">Every other fish is Common, Uncommon, Rare or Epic. Rarer fish bite less often and are worth more per kilogram; a gold hotspot and a perfect cast tempt them.</p><div class="list">${Object.entries(LEGENDS)
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
    } else if (tab === 'photos') {
      this.renderAlbum();
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

  // The photo album: a page per species, the best shot of each, and the
  // camera roll. Tap a picture to see it big.
  renderAlbum() {
    const g = this.game;
    const A = g.photo.album;
    const owned = g.photo.owned();
    const when = (p) => `Day ${p.day} · ${formatTime(p.hour)}${p.place ? ' · ' + esc(p.place) : ''}`;
    let html = owned
      ? `<p class="catch-info" style="margin:0 0 10px">Your best picture of each species. Raise the camera with the tool button, tap ZOOM, and SNAP. Close and centred earns three stars. Fish: tap PHOTO on the catch card.</p>`
      : `<p class="catch-info" style="margin:0 0 10px">Buy a camera at the Kenai Trading Post to fill this album with moose, bears, eagles, whales and your best fish.</p>`;
    for (const [group, title] of PHOTO_GROUPS) {
      const ids = Object.keys(PHOTO_SUBJECTS).filter((id) => PHOTO_SUBJECTS[id].group === group);
      const got = ids.filter((id) => A.shots[id]).length;
      html += `<h3>${title} ${got}/${ids.length}</h3><div class="album">${ids
        .map((id) => {
          const p = A.shots[id];
          const S = PHOTO_SUBJECTS[id];
          if (!p) return `<div class="photo empty"><div class="ph"><span>?</span></div><b>???</b></div>`;
          return `<button class="photo" data-photo="${id}"><div class="ph"><img src="${p.img}" alt="${esc(S.name)}"></div><b>${esc(S.name)}</b><small>${'★'.repeat(p.stars)}${'☆'.repeat(3 - p.stars)}</small></button>`;
        })
        .join('')}</div>`;
    }
    if (A.roll.length) html += `<h3>Camera roll</h3><div class="album">${A.roll.map((p, i) => `<button class="photo" data-roll="${i}"><div class="ph"><img src="${p.img}" alt="Photo ${i + 1}"></div><small>${when(p)}</small></button>`).join('')}</div>`;
    this.body.innerHTML = html;
    const show = (p, title) => {
      const v = document.createElement('div');
      v.className = 'photo-view';
      v.innerHTML = `<img src="${p.img}" alt="${esc(title)}"><p><b>${esc(title)}</b>${p.stars ? ` ${'★'.repeat(p.stars)}${'☆'.repeat(3 - p.stars)}` : ''}<br>${when(p)}${p.dist ? ` · ${p.dist} m away` : ''}</p><small>Tap to close</small>`;
      v.addEventListener('click', () => v.remove());
      this.body.appendChild(v);
    };
    this.body.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => show(A.shots[b.dataset.photo], PHOTO_SUBJECTS[b.dataset.photo].name)));
    this.body.querySelectorAll('[data-roll]').forEach((b) => b.addEventListener('click', () => show(A.roll[Number(b.dataset.roll)], 'Camera roll')));
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
        ['jobs', g.jobs.ready() ? 'Odd jobs ✓' : 'Odd jobs'],
        ['tackle', 'Tackle'],
        ['gear', 'Bow & gear'],
        ['garage', 'Garage'],
      ],
      tab
    );
    const head = `<div class="sell-bar"><span class="money-line">${formatMoney(s.money)}</span><span class="tag">Cooler ${s.cooler.length}/${s.coolerCap()}</span></div>`;
    if (tab === 'jobs') {
      // the notice board: one job at a time, three on offer each day
      const J = g.jobs;
      const cur = J.current();
      let html = '';
      if (cur) {
        const ok = J.ready();
        html += `<div class="job current"><small>Your job</small><h4>${esc(cur.who)}</h4><p>${esc(cur.text)}</p><p class="goal">${esc(jobGoal(cur))}</p><div class="row"><span class="price">${formatMoney(cur.reward)}</span><button class="btn ghost" data-job="drop">Give up</button><button class="btn ${ok ? 'hot' : ''}" data-job="turnin" ${ok ? '' : 'disabled'}>${ok ? 'Collect' : 'Not done yet'}</button></div></div>`;
      } else {
        const offers = J.offers();
        html += offers.length
          ? `<p class="catch-info" style="margin:0 0 10px">Pinned to the board by the door. New ones every morning.</p><div class="grid">${offers
              .map((j) => `<div class="item job"><h4>${esc(j.who)}</h4><p>${esc(j.text)}</p><p class="goal">${esc(jobGoal(j))}</p><div class="row"><span class="price">${formatMoney(j.reward)}</span><button class="btn hot" data-job="take" data-id="${j.id}">Take the job</button></div></div>`)
              .join('')}</div>`
          : '<p class="catch-info">The board is empty. You have done every odd job in Kenai Country. The locals are running out of problems.</p>';
      }
      html += `<p class="catch-info" style="margin-top:12px">${s.jobsDone.length} odd job${s.jobsDone.length === 1 ? '' : 's'} done.</p>`;
      this.body.innerHTML = `${head}${html}`;
      this.body.querySelectorAll('[data-job]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset.job;
          if (a === 'take') J.take(b.dataset.id);
          else if (a === 'drop') J.drop();
          else if (a === 'turnin') J.turnIn();
          g.audio?.click();
          this.render();
        })
      );
      return;
    }
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
      for (const r of RODS)
        card(
          r.id,
          r.name,
          `${r.desc} Line holds ${r.maxTension}, casts ${r.cast} m, reels ${Math.round(r.reel * 100)} %.${r.perk ? ' ' + r.perk : ''}`,
          r.price,
          s.gear.rods.includes(r.id),
          s.gear.rod === r.id,
          'rod',
          `<div class="swatch" style="background:linear-gradient(135deg, ${hex(r.look.blank)} 55%, ${hex(r.look.wrap)} 55%)"></div>`
        );
      for (const [id, l] of Object.entries(LURES).sort((a, b) => a[1].price - b[1].price))
        card(id, l.name, l.desc, l.price, s.gear.lures.includes(id), s.gear.lure === id, 'lure', `<div class="swatch" style="background:${hex(l.color)}"></div>`);
    } else if (tab === 'gear') {
      const consumable = (id, title, desc, price, have, max, extra = '') => {
        const can = s.money >= price && have < max;
        cards.push(
          `<div class="item">${extra}<h4>${esc(title)}</h4><p>${esc(desc)}</p><div class="row"><span class="price">${formatMoney(price)}</span><span class="tag">Have ${have}${
            max < 999 ? '/' + max : ''
          }</span><button class="btn ${can ? 'hot' : ''}" data-act="buy-item" data-id="${id}" ${can ? '' : 'disabled'}>Buy</button></div></div>`
        );
      };
      for (const k of ARROW_ORDER) {
        const A = ARROWS[k];
        consumable('arrow-' + k, `${A.name} (${A.pack})`, A.desc, A.price, s.arrowsLeft(k), s.arrowCap(k), `<div class="swatch" style="background:${hex(A.tint)}"></div>`);
      }
      consumable('spray', GEAR.spray.name, GEAR.spray.desc, GEAR.spray.price, s.gear.spray, 2);
      consumable('medkit', GEAR.medkit.name, GEAR.medkit.desc, GEAR.medkit.price, s.gear.medkit, 3);
      card('yew', GEAR.yew.name, GEAR.yew.desc, GEAR.yew.price, s.gear.yew, s.gear.yew, 'yew');
      card('sight', GEAR.sight.name, GEAR.sight.desc, GEAR.sight.price, s.gear.sight, s.gear.sight, 'sight');
      card('camera', 'Camera with zoom lens', 'Snap moose, bears, eagles and whales, and trophy shots of your catch. The first good shot of every animal sells to Alaska Outdoors magazine.', CAMERA_PRICE, s.gear.camera, s.gear.camera, 'camera');
      COOLERS.forEach((c, i) => {
        if (i === 0) return;
        card(String(i), c.name, `Holds ${c.cap} fish.`, c.price, s.gear.cooler >= i, s.gear.cooler === i, 'cooler');
      });
    } else if (tab === 'garage') {
      const B = g.boat;
      card('boat', 'Fishing boat on a trailer', 'A sixteen-foot aluminium skiff with a 25-horsepower outboard. Tow it behind the hot rod, back up to any lake, river or the bay and LAUNCH. Fish from it anywhere on the water.', BOAT.price, B.owned, B.owned, 'boat');
      if (B.owned)
        card('motor', '60-horsepower outboard', 'Swap the outboard for a big one: about half again as fast across the bay.', BOAT.motorPrice, B.motor > 0, B.motor > 0, 'motor');
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
        if (id.startsWith('arrow-')) {
          const k = id.slice(6);
          const A = ARROWS[k];
          if (!A || s.arrowsLeft(k) >= s.arrowCap(k)) break;
          if (pay(A.price)) {
            s.gear.quiver[k] = Math.min(s.arrowCap(k), s.arrowsLeft(k) + A.pack);
            // an empty string takes the new arrows straight away
            if (s.arrowsLeft() <= 0) s.gear.arrow = k;
            g.hud.toast(`${A.name} in the quiver`, 'good');
          }
          break;
        }
        const item = GEAR[id];
        if (pay(item.price)) {
          if (id === 'spray') s.gear.spray = Math.min(2, s.gear.spray + 1);
          if (id === 'medkit') s.gear.medkit = Math.min(3, s.gear.medkit + 1);
        }
        break;
      }
      case 'buy-boat':
        if (pay(BOAT.price)) {
          g.boat.setOwned(true, 0);
          g.boat.resetTrailer();
          g.hud.toast('Boat hitched to the hot rod. Back up to the water and LAUNCH', 'good');
          g.onEvent({ type: 'buy', kind: 'boat' });
        }
        break;
      case 'buy-motor':
        if (pay(BOAT.motorPrice)) {
          g.boat.setOwned(true, 1);
          g.hud.toast('Big outboard fitted. Hang on to your hat', 'good');
        }
        break;
      case 'buy-camera':
        if (pay(CAMERA_PRICE)) {
          s.gear.camera = true;
          g.hud.toast('Camera bought. Tap the tool button until the camera comes up', 'good');
        }
        break;
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
    this.body.innerHTML = `<div class="lure-grid">${Object.entries(LURES).sort((a, b) => a[1].price - b[1].price)
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
      <div class="setting"><label>Small map</label><div class="seg" id="s-minimap"><button data-v="0" class="${st.minimap === false ? 'on' : ''}">OFF</button><button data-v="1" class="${st.minimap === false ? '' : 'on'}">ON</button></div></div>
      <div class="setting"><label>Announcer voice</label><div class="seg" id="s-announcer"><button data-v="0" class="${st.announcer === false ? 'on' : ''}">OFF</button><button data-v="1" class="${st.announcer === false ? '' : 'on'}">ON</button></div></div>
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
    for (const key of ['minimap', 'announcer'])
      this.body.querySelectorAll(`#s-${key} button`).forEach((b) =>
        b.addEventListener('click', () => {
          st[key] = b.dataset.v === '1';
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
      <section><h4>Get around</h4><p>${touch ? 'Drag on the left side of the screen to walk. Tap <b>RUN</b> to run and tap it again to walk. Drag on the right side to look around.' : 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, hold <kbd>Shift</kbd> to jog, drag the mouse to look (click the view to lock the mouse).'}</p><p>Walk up to the hot rod and tap <b>DRIVE</b>. The compass shows places, your car and your current goal.</p><p>The small map in the top left corner turns with you and shows the land around you, the places you know, your car and your goal. Tap it to open the full map.</p></section>
      <section><h4>Casting</h4><p>Face the water with the rod out and tap <b>CAST</b>. A dashed line on the water marks out the throw, with a ring where the lure will land.</p>
        <p><b>Power:</b> a needle runs along the meter and the ring moves out over the water. Blue on the meter is water, gold is a fish hotspot. Tap to set the distance.</p>
        <div class="demo-meter"><i style="left:30%;width:40%;background:rgba(95,200,192,.3)"></i><i style="left:52%;width:9%;background:#ffcc3a"></i></div>
        <p><b>Timing:</b> a white marker sweeps back and forth across the timing bar. Tap when it is on the dark green line in the middle.</p>
        <div class="demo-meter timing" style="background:${timingGradient()}"><i class="demo-cursor" style="left:48%"></i></div>
        <ul><li>The dark green line: a <b>PERFECT CAST</b> into the ring and better bites.</li><li>Green: the lure lands in the ring.</li><li>Orange: left of the line hooks it left, right of it slices it right, and it falls short.</li><li>Red: a backlash to untangle.</li></ul></section>
      <section><h4>Bites</h4><p>Watch the float. Small twitches are nibbles, so wait. When it plunges under, tap <b>HOOK!</b> fast.</p><p>The <b>BITE</b> readout under the map button says how hungry the fish are: <b>SLOW</b>, <b>FAIR</b>, <b>GOOD</b> or <b>HOT</b>. Tap it to hear why. Fish feed hardest at dawn and dusk, when a front rolls in and with rain on the water; they sulk under a bright midday sun and go quiet at night. On the sea, fish a running tide. The map shows the bite at each place and when each fish bites best.</p><p>Tap <b>REEL</b> while waiting to twitch the lure, hold it to retrieve. The line only comes in when you reel: the current carries the float along but never back to your feet, and a lure that lands on the bank stays there until you hold <b>REEL</b>.</p></section>
      <section><h4>Rare fish</h4><p>Every fish is <b>common</b>, <b>uncommon</b>, <b>rare</b> or <b>epic</b>. Rarer fish bite less often and sell for more. A cast to a gold hotspot or a <b>PERFECT CAST</b> raises the odds of a rare one, and the right lure matters: each lure in the Trading Post says what it catches. The epic big skate and salmon shark live off Halibut Pier.</p></section>
      <section><h4>The fight</h4><ul><li>Hold <b>REEL</b> to bring the fish in. Keep the needle in the green. Only reeling brings it closer: let go and it stays out.</li><li>When it runs, let go before the line snaps, then reel again.</li><li>Steer the rod against the run: ${touch ? 'drag left or right on the left side' : 'press <kbd>A</kbd> or <kbd>D</kbd>'}.</li><li>When it jumps, release REEL or it throws the hook.</li></ul></section>
      <section><h4>Driving</h4><p>${touch ? 'Hold <b>GAS</b> and <b>BRAKE</b>, steer by dragging on the left side.' : '<kbd>W</kbd> gas, <kbd>S</kbd> brake and reverse, <kbd>A</kbd>/<kbd>D</kbd> steer.'} Tap the camera button to see the hot rod from behind, and the horn to say hello. Street tires slide on gravel and tundra.</p></section>
      <section><h4>The boat</h4><p>Buy the fishing boat in the garage. It rides on a trailer behind the hot rod. Stop near a lake, the river or the bay and tap <b>LAUNCH</b>, then walk up and <b>BOARD</b> it. <b>GAS</b> and steer like the car; the camera button switches between the seat and the chase view. Tap <b>FISH</b> to drop anchor and cast all round the boat: bears cannot reach you on the water. <b>ASHORE</b> steps off by the bank, and <b>LOAD BOAT</b> winches it back on the trailer.</p></section>
      <section><h4>The tool button</h4><p>It switches between the fishing rod, the longbow, the camera (once you have bought one) and empty hands, so you can put the rod away when you are not fishing.</p></section>
      <section><h4>The camera</h4><p>Raise it with the tool button. <b>ZOOM</b> steps through 1×, 2×, 4× and 8×, and <b>SNAP</b> takes the picture. The viewfinder names what it is on and gives the shot one to three stars: get close, or zoom in, and keep it in the middle. Fish: tap the camera on the catch card. Your best picture of each species goes in the photo album in the Journal, and the first good picture of each animal sells to a magazine.</p></section>
      <section><h4>The wardrobe</h4><p>Tap the T-shirt at the top for shirts, hats, beards, hair, skin and gloves. You see your sleeves and gloves while you fish and shoot, and Ruben wears the lot at the wheel.</p></section>
      <section><h4>Hunting with the longbow</h4><p>Hold <b>DRAW</b> to pull the string back and let go to shoot. A full draw flies fastest and flattest; arrows drop over distance, so aim a little high far away. <b>AIM</b> narrows your view. Holding a full draw for long makes your arms shake.</p><p>Walk over arrows that missed to pick them up. Walk up to downed game and tap <b>CLAIM</b>.</p><p>The Trading Post sells five kinds of arrow: cedar, fast carbon, heavy broadheads, glow-nock arrows and bear whistlers, which shriek in flight and send any bear they pass running. Tap the arrows chip in the top left to switch kinds.</p><p>Grizzlies and black bears only come for you when there is fish in your cooler: they smell it. With an empty cooler they fish, roam and leave you be. When one charges, the screen edge turns red: switch to the bow and shoot, or use bear spray up close.</p></section>
      <section><h4>Money and upgrades</h4><p>Sell fish and trophies at the Kenai Trading Post. Buy rods that can handle kings and halibut, new lures, arrows, a yew longbow and a bow sight, a bigger cooler, a better engine and new paint.</p><p>Sleep at Ruben's cabin to skip the night. Watch for the northern lights first.</p></section>
      <section><h4>Odd jobs</h4><p>The board in the Trading Post (<b>Odd jobs</b> tab) always has three jobs from the locals: a fish for someone's dinner, a picture for the paper, an errand. Take one, do it, and come back to collect. Fish jobs are handed in from your cooler. And keep your camera handy at dawn and dusk: some say Bigfoot walks the forest edges.</p></section>
      <section><h4>Places to find</h4><p><b>Steaming Springs</b> has fat trout in a warm pond, a hot pool to <b>SOAK</b> in (it heals you) and a geyser that blows every minute or two: stand back. <b>Mosquito Flats</b> has pike and sheefish in the bog and the World's Largest Mosquito; buy bug dope there or the real ones will have opinions. At <b>Shipwreck Cove</b>, walk the gangplank onto the old trawler, fish from her deck and look in the wheelhouse.</p></section>
      <section><h4>Saving</h4><p>The game saves by itself every 45 seconds and whenever you keep a fish, trade, sleep or travel. A <b>SAVED</b> note flashes under the clock. To save right now, open the pause menu${touch ? ' (top right)' : ' (<kbd>Esc</kbd>)'} and choose <b>Save game</b>. Next time, choose <b>Continue</b> on the title screen.</p></section>
      ${touch ? '' : '<section><h4>Keyboard</h4><p><kbd>Space</kbd> or click: cast and reel; hold and let go to shoot the bow. <kbd>Right click</kbd> aim. <kbd>E</kbd> interact, or keep a catch (<kbd>R</kbd> releases it). <kbd>Q</kbd> next tool, or <kbd>1</kbd> rod, <kbd>2</kbd> longbow, <kbd>4</kbd> camera, <kbd>3</kbd> empty hands. <kbd>T</kbd> switch arrows. <kbd>Z</kbd> zoom the camera. <kbd>V</kbd> the boat button (launch, board, ashore, load). <kbd>G</kbd> bear spray. <kbd>X</kbd> first aid kit. <kbd>L</kbd> lures. <kbd>M</kbd> map. <kbd>J</kbd> journal. <kbd>C</kbd> camera. <kbd>H</kbd> horn. <kbd>Esc</kbd> pause.</p></section>'}
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
