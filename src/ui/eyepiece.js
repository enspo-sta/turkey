// What the telescope shows: a round eyepiece view of each target, drawn
// from the real sky at the game's date and hour. The Moon has its true phase
// and the sunlit side toward the Sun; Venus and Mercury their phases;
// Jupiter its belts, the Great Red Spot and its four big moons where they
// really are tonight; Saturn its rings at their true tilt; the Sun, through
// the solar filter, the day's sunspots. The deep-sky objects are drawn as
// they look to the eye at a telescope: grey glows, not the colours of long
// photographs. North is up and east to the left, as in the sky.
import { mulberry32, clamp, smoothstep } from '../util/math.js';

const DEG = Math.PI / 180;
const ARCSEC = Math.PI / 648000;

// Position angle of a body's sunlit limb (from north through east, radians),
// from its right ascension and declination and the Sun's (degrees).
export function brightLimb(ra, dec, sra, sdec) {
  const a = ra * DEG;
  const d = dec * DEG;
  const as = sra * DEG;
  const ds = sdec * DEG;
  return Math.atan2(Math.cos(ds) * Math.sin(as - a), Math.sin(ds) * Math.cos(d) - Math.cos(ds) * Math.sin(d) * Math.cos(as - a));
}

// The direction toward a position angle in the picture: north up, east left.
const paToImage = (pa) => Math.PI / 2 + pa;

function star(g, x, y, mag, rgb = [255, 255, 255], k = 1) {
  const r = Math.max(0.55, (3.4 - 0.48 * mag) * k);
  const a = clamp(1.25 - mag * 0.12, 0.25, 1);
  const glow = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
  glow.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
  glow.addColorStop(0.28, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.45})`);
  glow.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = glow;
  g.beginPath();
  g.arc(x, y, r * 3.2, 0, Math.PI * 2);
  g.fill();
  // the core: nearly white, keeping a little of the star's colour
  const t = (c) => Math.round(255 - (255 - c) * 0.45);
  g.fillStyle = `rgba(${t(rgb[0])},${t(rgb[1])},${t(rgb[2])},${a})`;
  g.beginPath();
  g.arc(x, y, r * 0.55, 0, Math.PI * 2);
  g.fill();
}

// A soft glow: an elliptical gradient.
function glow(g, x, y, rx, ry, rot, stops) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function backgroundStars(g, S, seed, n, maxMag = 11, day = 0) {
  if (day > 0.6) return;
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const m = maxMag - Math.pow(r(), 0.35) * 5;
    const tint = r();
    const rgb = tint < 0.2 ? [255, 214, 170] : tint < 0.35 ? [190, 210, 255] : [255, 250, 240];
    star(g, r() * S, r() * S, m, rgb, 0.8 * (1 - day));
  }
}

// Smooth value noise on a grid of cells s pixels across.
function hash2i(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, s, seed) {
  const fx = x / s;
  const fy = y / s;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  const a = hash2i(ix, iy, seed);
  const b = hash2i(ix + 1, iy, seed);
  const c = hash2i(ix, iy + 1, seed);
  const d = hash2i(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ------------------------------------------------------------------- Sun
function drawSun(g, cx, cy, r, seed) {
  const img = g.getImageData(cx - r, cy - r, r * 2, r * 2);
  const d = img.data;
  const W = img.width;
  const rnd = mulberry32(seed);
  // today's sunspot groups: in the two belts either side of the equator
  const groups = [];
  const n = 2 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const lat = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 26) * DEG;
    const lon = (rnd() * 150 - 75) * DEG;
    const spots = [];
    const m = 1 + Math.floor(rnd() * 6);
    for (let k = 0; k < m; k++) spots.push({ lat: lat + (rnd() - 0.5) * 3 * DEG, lon: lon + (k - m / 2) * (1.6 + rnd()) * DEG, s: (k === 0 ? 1.4 : 0.5 + rnd() * 0.8) * DEG });
    groups.push(spots);
  }
  const all = groups.flat();
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - r) / r;
      const ny = -(y - r) / r;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const mu = Math.sqrt(1 - q);
      // limb darkening, and the grain of the granulation
      let I = 1 - 0.62 * (1 - mu) - 0.12 * (1 - mu) * (1 - mu);
      // granules: bright cells of rising gas with dark lanes between
      const gr = valueNoise(x, y, 2.6, 7) * 0.65 + valueNoise(x, y, 1.3, 9) * 0.35;
      I *= 0.9 + 0.16 * gr;
      const lat = Math.asin(ny);
      const lon = Math.atan2(nx, mu);
      let spot = 0;
      let fac = 0;
      for (const s of all) {
        const dl = (lon - s.lon) * Math.cos(lat);
        const dd = Math.hypot(dl, lat - s.lat) / s.s;
        if (dd < 1) spot = Math.max(spot, dd < 0.45 ? 2 : 1);
        else if (dd < 4.5 && mu < 0.6) fac = Math.max(fac, (1 - dd / 4.5) * (0.6 - mu));
      }
      if (spot === 2) I *= 0.12;
      else if (spot === 1) I *= 0.48;
      I *= 1 + fac * 0.5;
      const o = (y * W + x) * 4;
      d[o] = clamp(255 * I * 1.05, 0, 255);
      d[o + 1] = clamp(225 * I * Math.pow(I, 0.2), 0, 255);
      d[o + 2] = clamp(165 * I * Math.pow(I, 0.6), 0, 255);
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, cx - r, cy - r);
  return all.length;
}

// ------------------------------------------------------------------ Moon
// The near side's seas and brightest craters (selenographic latitude and
// longitude, radius, all in degrees).
const MARIA = [
  [10, -55, 14], [25, -50, 14], [-2, -50, 12], [33, -16, 17], [28, 17, 10], [8.5, 31, 11], [17, 59, 7], [-8, 51, 9],
  [-15, 35, 5.5], [-21, -17, 10], [-24, -39, 6], [56, -20, 6], [57, 0, 6], [57, 20, 6], [55, 38, 5], [13, 4, 4],
  [-10, -23, 5], [2, 1, 3], [7, -31, 7], [45, -32, 4], [-38, -55, 4], [-13, -86, 3],
];
const CRATERS = [
  // lat, lon, radius, brightness (negative: a dark floor), rays
  [-43.3, -11.4, 1.6, 0.6, 1],
  [9.6, -20.1, 1.7, 0.45, 0.7],
  [8.1, -38, 1.0, 0.4, 0.5],
  [23.7, -47.4, 0.8, 0.9, 0.3],
  [51.6, -9.4, 1.8, -0.5, 0],
  [-5.2, -68.6, 2.8, -0.45, 0],
  [-8.9, 61, 2.1, 0.2, 0],
  [-11.4, 26.4, 1.7, 0.25, 0],
  [-58.4, -14.4, 3.5, 0.15, 0],
  [-24.4, 4, 2, 0.2, 0],
  [50, 15, 1, 0.2, 0],
];

function moonAlbedo(lat, lon, rays) {
  let a = 0.86;
  let sea = 0;
  for (const [la, lo, r] of MARIA) {
    const dl = (lon - lo) * Math.cos(lat * DEG);
    const dd = Math.hypot(dl, lat - la) / r;
    if (dd < 1.4) sea = Math.max(sea, 1 - smoothstep(0.75, 1.4, dd));
  }
  a -= sea * 0.42;
  for (const [la, lo, r, b, ray] of CRATERS) {
    const dl = (lon - lo) * Math.cos(lat * DEG);
    const dd = Math.hypot(dl, lat - la);
    if (dd < r) a += b * (1 - dd / r) * 0.5;
    // bright rays splashed out across the face
    if (ray && dd < 45 * ray) {
      const ang = Math.atan2(lat - la, dl);
      const k = Math.abs(Math.sin(ang * 7 + la)) * Math.abs(Math.sin(ang * 13 + lo));
      a += rays * ray * 0.22 * Math.pow(k, 6) * (1 - dd / (45 * ray));
    }
  }
  // the speckle of smaller craters in the highlands
  const n = Math.sin(lat * 1.7) * Math.sin(lon * 2.3) * Math.sin(lat * 3.1 + lon * 1.3);
  a += (1 - sea) * 0.06 * n;
  return clamp(a, 0.1, 1.3);
}

function drawMoon(g, cx, cy, r, phaseAngle, limbAngle, earthshine) {
  // at night the Moon hides the stars behind it; by day its light simply
  // adds to the blue of the sky in front of it
  if (earthshine > 0.4) {
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  const img = g.createImageData(r * 2, r * 2);
  const d = img.data;
  const W = img.width;
  const i = phaseAngle;
  const th = limbAngle;
  const sx = Math.sin(i) * Math.cos(th);
  const sy = Math.sin(i) * Math.sin(th);
  const sz = Math.cos(i);
  // rays wash out except near full
  const rays = 1 - smoothstep(0.6, 1.4, i);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - r) / r;
      const ny = -(y - r) / r;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz = Math.sqrt(1 - q);
      const lat = Math.asin(ny) / DEG;
      const lon = Math.atan2(nx, nz) / DEG;
      const alb = moonAlbedo(lat, lon, rays);
      // the terminator is ragged with crater shadows
      const rough = 0.05 * Math.sin(lat * 0.9 + lon * 0.4) * Math.sin(lat * 2.7 - lon * 1.9) + 0.03 * Math.sin(lat * 7 + lon * 5);
      const mu0 = nx * sx + ny * sy + nz * sz + rough * (1 - Math.abs(nx * sx + ny * sy + nz * sz));
      let B = 0;
      if (mu0 > 0) B = Math.min(1.35, (2 * mu0) / (mu0 + nz + 1e-3)) * smoothstep(0, 0.05, mu0);
      // grey Earthshine on the night side of a crescent
      B = B * alb + earthshine * alb * 0.07;
      const o = (y * W + x) * 4;
      const edge = smoothstep(1, 0.985, Math.sqrt(q));
      d[o] = clamp(232 * B, 0, 255);
      d[o + 1] = clamp(228 * B, 0, 255);
      d[o + 2] = clamp(218 * B, 0, 255);
      d[o + 3] = 255 * edge;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = W;
  tmp.getContext('2d').putImageData(img, 0, 0);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.drawImage(tmp, cx - r, cy - r);
  g.restore();
}

// --------------------------------------------------------------- planets
// A disc lit from one side: the phase, limb darkening and a colour that can
// depend on latitude and longitude (albedo(lat, lon) gives [r, g, b]).
function drawLitDisc(g, cx, cy, r, { phase = 0, limb = 0, flat = 0, albedo, darkening = 0.35, add = false }) {
  const ry = r * (1 - flat);
  const Wd = Math.ceil(r * 2) + 2;
  const img = g.createImageData(Wd, Wd);
  const d = img.data;
  const sx = Math.sin(phase) * Math.cos(limb);
  const sy = Math.sin(phase) * Math.sin(limb);
  const sz = Math.cos(phase);
  const h = Wd / 2;
  for (let y = 0; y < Wd; y++) {
    for (let x = 0; x < Wd; x++) {
      const nx = (x - h) / r;
      const ny = -(y - h) / ry;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz = Math.sqrt(1 - q);
      const mu0 = nx * sx + ny * sy + nz * sz;
      if (mu0 <= 0) continue;
      const lit = smoothstep(0, 0.08, mu0) * (1 - darkening * (1 - Math.sqrt(nz)));
      const c = albedo(Math.asin(ny), Math.atan2(nx, nz), nx, ny);
      const o = (y * Wd + x) * 4;
      d[o] = clamp(c[0] * lit, 0, 255);
      d[o + 1] = clamp(c[1] * lit, 0, 255);
      d[o + 2] = clamp(c[2] * lit, 0, 255);
      d[o + 3] = 255 * smoothstep(1, 0.96, Math.sqrt(q));
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = Wd;
  tmp.getContext('2d').putImageData(img, 0, 0);
  g.save();
  if (add) g.globalCompositeOperation = 'lighter';
  g.drawImage(tmp, cx - h, cy - h);
  g.restore();
}

function jupiterAlbedo(rot) {
  // planetographic latitude bands: [from, to, r, g, b]
  const bands = [
    [-90, -48, 168, 160, 152],
    [-48, -36, 200, 182, 160],
    [-36, -28, 178, 150, 120],
    [-28, -20, 226, 210, 182],
    [-20, -8, 168, 116, 80],
    [-8, 8, 238, 226, 200],
    [8, 19, 160, 108, 74],
    [19, 26, 228, 212, 186],
    [26, 33, 182, 150, 118],
    [33, 48, 206, 190, 166],
    [48, 90, 166, 160, 154],
  ];
  return (lat, lon) => {
    const L = lat / DEG;
    let c = bands[0];
    for (const b of bands) if (L >= b[0] && L < b[1]) c = b;
    // festoons and wisps along the belts
    const w = 1 + 0.07 * Math.sin(lon * 9 + L * 0.8 + rot) * Math.sin(L * 1.7);
    let rr = c[2] * w;
    let gg = c[3] * w;
    let bb = c[4] * w;
    // the Great Red Spot in the south tropical zone
    const glon = Math.atan2(Math.sin(lon - rot), Math.cos(lon - rot));
    const dd = Math.hypot(glon / 0.2, (L + 22) / 5.5);
    if (dd < 1) {
      const k = 1 - smoothstep(0.55, 1, dd);
      rr = rr * (1 - k) + 206 * k;
      gg = gg * (1 - k) + 128 * k;
      bb = bb * (1 - k) + 96 * k;
    }
    return [rr, gg, bb];
  };
}

const marsAlbedo = (lat, lon) => {
  const L = lat / DEG;
  // the polar cap
  if (L < -72) return [250, 248, 244];
  // dark markings: Syrtis Major and its neighbours, roughly
  const n = Math.sin(lon * 2 + 1) * Math.sin(lat * 3 + 0.5) + 0.6 * Math.sin(lon * 5 - lat * 2);
  const dark = smoothstep(0.35, 0.9, n) * (1 - smoothstep(40, 70, Math.abs(L)));
  return [226 - dark * 70, 128 - dark * 40, 78 - dark * 22];
};

const venusAlbedo = () => [252, 246, 226];
const mercuryAlbedo = (lat, lon) => {
  const n = 0.06 * Math.sin(lat * 9 + lon * 4) * Math.sin(lon * 7);
  return [205 * (1 + n), 192 * (1 + n), 180 * (1 + n)];
};

function drawSaturn(g, cx, cy, r, tilt, day) {
  const B = Math.max(0.035, Math.abs(Math.sin(tilt)));
  const north = tilt >= 0;
  const rings = (front) => {
    g.save();
    g.beginPath();
    // the near half of the rings is the lower half when we see their north
    // face
    if (front === north) g.rect(cx - r * 3, cy, r * 6, r * 3);
    else g.rect(cx - r * 3, cy - r * 3, r * 6, r * 3);
    g.clip();
    const ring = (a0, a1, col) => {
      g.beginPath();
      g.ellipse(cx, cy, r * a1, r * a1 * B, 0, 0, Math.PI * 2);
      g.ellipse(cx, cy, r * a0, r * a0 * B, 0, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill('evenodd');
    };
    ring(1.24, 1.53, 'rgba(150,138,118,0.45)');
    ring(1.53, 1.95, 'rgba(236,224,196,0.95)');
    ring(2.02, 2.27, 'rgba(206,194,170,0.9)');
    // the Encke gap, barely
    ring(2.2, 2.21, 'rgba(40,36,30,0.6)');
    g.restore();
  };
  rings(false);
  drawLitDisc(g, cx, cy, r, {
    flat: 0.098,
    darkening: 0.4,
    albedo: (lat) => {
      const L = lat / DEG;
      const band = 0.06 * Math.sin(L * 0.32) + (Math.abs(L) > 60 ? -0.1 : 0);
      return [236 * (1 + band), 214 * (1 + band), 166 * (1 + band)];
    },
  });
  // the rings' shadow across the globe
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, r * 0.99, r * 0.9, 0, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = 'rgba(30,24,16,0.55)';
  g.lineWidth = Math.max(1, r * 0.05);
  g.beginPath();
  g.ellipse(cx, cy + (north ? -1 : 1) * r * B * 0.35, r * 1.6, r * 1.6 * B, 0, Math.PI, Math.PI * 2);
  g.stroke();
  g.restore();
  rings(true);
}

// -------------------------------------------------------------- the view
// info: { astro, sunUp (0 to 1 daylight), cloud, day, jmoons, hours }
export function drawEyepiece(cv, T, info) {
  const S = cv.width;
  const g = cv.getContext('2d');
  const cx = S / 2;
  const cy = S / 2;
  const Rf = S * 0.47;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(cx, cy, Rf, 0, Math.PI * 2);
  g.clip();
  const A = info.astro;
  const day = T.id === 'sun' ? 0 : info.sunUp;
  // the sky behind: blue by day for the Moon and the planets, black at night
  const sky = g.createRadialGradient(cx, cy, 0, cx, cy, Rf);
  const k = day;
  sky.addColorStop(0, `rgb(${Math.round(4 + 116 * k)},${Math.round(5 + 152 * k)},${Math.round(9 + 200 * k)})`);
  sky.addColorStop(1, `rgb(${Math.round(2 + 96 * k)},${Math.round(3 + 132 * k)},${Math.round(6 + 186 * k)})`);
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  let caption = '';
  let fov = 0;
  const seed = [...T.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const planet = T.planet ? A.planets.find((p) => p.id === T.planet) : null;
  // pixels per arcsecond for a field of fov arcminutes
  const scale = (f) => (2 * Rf) / (f * 60);
  switch (T.id) {
    case 'sun': {
      fov = 40;
      g.fillStyle = '#000';
      g.fillRect(0, 0, S, S);
      const n = drawSun(g, Math.round(cx), Math.round(cy), Math.round(scale(fov) * 960), info.day * 7919 + 13);
      caption = `Through the solar filter. ${n} sunspots today`;
      break;
    }
    case 'moon': {
      fov = 40;
      backgroundStars(g, S, seed, 25, 10, day);
      const m = A.moon;
      const r = scale(fov) * ((1737.4 / m.km) / ARCSEC);
      const pa = brightLimb(m.ra, m.dec, A.sun.ra, A.sun.dec);
      const phase = Math.acos(clamp(2 * m.illum - 1, -1, 1));
      drawMoon(g, cx, cy, Math.round(r), phase, paToImage(pa), 1 - day);
      caption = `${Math.round(m.illum * 100)}% lit · ${Math.round(m.km).toLocaleString('en-GB')} km away`;
      break;
    }
    case 'mercury':
    case 'venus':
    case 'mars': {
      fov = 2;
      backgroundStars(g, S, seed, 6, 12, day);
      const R_KM = { mercury: 2439.7, venus: 6051.8, mars: 3389.5 }[T.id];
      const r = Math.max(4, scale(fov) * ((R_KM / (planet.dist * 149597870.7)) / ARCSEC));
      const pa = brightLimb(planet.ra, planet.dec, A.sun.ra, A.sun.dec);
      const phase = Math.acos(clamp(2 * planet.phase - 1, -1, 1));
      const alb = T.id === 'venus' ? venusAlbedo : T.id === 'mars' ? marsAlbedo : mercuryAlbedo;
      drawLitDisc(g, cx, cy, r, { phase, limb: paToImage(pa), albedo: alb, darkening: T.id === 'venus' ? 0.15 : 0.3, add: day > 0.3 });
      caption = `${Math.round(planet.phase * 100)}% lit · ${((2 * R_KM) / (planet.dist * 149597870.7) / ARCSEC).toFixed(1)} arcseconds across · ${(planet.dist * 149.6).toFixed(0)} million km away`;
      break;
    }
    case 'jupiter': {
      fov = 3;
      backgroundStars(g, S, seed, 5, 12, day);
      const r = Math.max(10, scale(fov) * ((71492 / (planet.dist * 149597870.7)) / ARCSEC));
      const rot = ((info.hours / 9.925) % 1) * Math.PI * 2;
      drawLitDisc(g, cx, cy, r, { flat: 0.065, darkening: 0.45, albedo: jupiterAlbedo(rot) });
      // the four moons on a line, squeezed in so all fit the field
      const sq = (x) => Math.sign(x) * (Math.abs(x) <= 1 ? Math.abs(x) * r : r + (Rf * 0.92 - r) * Math.sqrt((Math.abs(x) - 1) / 27));
      g.font = `600 ${Math.round(S * 0.026)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.textAlign = 'center';
      for (const mo of info.jmoons) {
        const x = cx - sq(mo.x);
        const y = cy - sq(mo.y) * 0.25;
        const inDisc = Math.hypot(mo.x, mo.y) < 1;
        if (inDisc && mo.behind) continue;
        if (inDisc) {
          // crossing in front: its shadow nearby, a dark dot
          g.fillStyle = 'rgba(20,14,10,0.85)';
          g.beginPath();
          g.arc(x + r * 0.12, y, Math.max(1.6, r * 0.05), 0, Math.PI * 2);
          g.fill();
        }
        star(g, x, y, 5.2, [240, 236, 226], 0.9);
        g.fillStyle = 'rgb(250,246,236)';
        g.beginPath();
        g.arc(x, y, Math.max(1.8, S * 0.0042), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = day > 0.5 ? 'rgba(20,30,50,0.85)' : 'rgba(200,200,200,0.75)';
        g.fillText(mo.name, x, y + S * 0.045);
      }
      caption = `Moons drawn closer in than they are, so all four fit · ${((2 * 71492) / (planet.dist * 149597870.7) / ARCSEC).toFixed(0)} arcseconds across`;
      break;
    }
    case 'saturn': {
      fov = 2.5;
      backgroundStars(g, S, seed, 5, 12, day);
      const r = Math.max(8, scale(fov) * ((60268 / (planet.dist * 149597870.7)) / ARCSEC));
      // Titan, every 15.95 days round, squeezed into the field
      const ang = ((info.hours / 24 / 15.945) % 1) * Math.PI * 2;
      const tx = Math.sin(ang);
      const tr = r * 2.4 + (Rf * 0.9 - r * 2.4) * Math.abs(tx);
      const tiltRad = (planet.ringTilt || 0) * DEG;
      if (Math.cos(ang) > 0 || Math.abs(tx) > 0.3) star(g, cx - Math.sign(tx) * tr, cy + tr * Math.sin(tiltRad) * 0.3, 6.5, [240, 220, 180], 0.9);
      drawSaturn(g, cx, cy, r, tiltRad, info.day);
      caption = `Rings tilted ${Math.abs(planet.ringTilt || 0).toFixed(1)}° toward us · Titan drawn closer in than it is`;
      break;
    }
    case 'm31': {
      fov = 90;
      backgroundStars(g, S, seed, 90, 11.5, day);
      const p = scale(fov) * 60;
      // the long axis at position angle 35 degrees: upper left to lower
      // right with north up and east to the left
      const rot = 55 * DEG;
      glow(g, cx, cy, p * 95, p * 26, rot, [
        [0, 'rgba(255,250,235,0.85)'],
        [0.06, 'rgba(230,226,210,0.5)'],
        [0.35, 'rgba(180,182,175,0.16)'],
        [1, 'rgba(150,150,150,0)'],
      ]);
      // the dust lane hugging the bulge on the north-west side
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.globalAlpha = 0.22;
      g.strokeStyle = '#000';
      g.lineWidth = p * 1.6;
      g.beginPath();
      g.ellipse(0, 0, p * 30, p * 7.5, 0, Math.PI * 1.22, Math.PI * 1.78);
      g.stroke();
      g.restore();
      // Messier 32 just south of the core, Messier 110 to the north-west
      glow(g, cx + p * 2, cy + p * 24, p * 5, p * 4, 0, [
        [0, 'rgba(240,236,224,0.7)'],
        [1, 'rgba(200,200,200,0)'],
      ]);
      glow(g, cx + p * 27, cy - p * 25, p * 13, p * 7, -0.45, [
        [0, 'rgba(220,218,210,0.35)'],
        [1, 'rgba(200,200,200,0)'],
      ]);
      caption = 'Messier 31 with Messier 32 (below) and Messier 110 (upper right)';
      break;
    }
    case 'm45': {
      fov = 90;
      backgroundStars(g, S, seed, 70, 11, day);
      const p = scale(fov) * 60;
      // the brightest Pleiades: offsets from Alcyone in arcminutes (east
      // is to the left), magnitudes
      const P = [
        ['Alcyone', 0, 0, 2.9],
        ['Atlas', 23, -3, 3.6],
        ['Electra', -36, 0.5, 3.7],
        ['Maia', -23, 16, 3.9],
        ['Merope', -16, -9, 4.2],
        ['Taygeta', -31, 22, 4.3],
        ['Pleione', 23, 2, 5.1],
        ['Celaeno', -37, 11, 5.5],
        ['Asterope', -22, 27, 5.8],
      ];
      // the blue reflection nebula round Merope and the others (the cluster
      // drawn centred: its brightest stars sit west and north of Alcyone)
      for (const [, x, y] of P.slice(0, 6)) glow(g, cx - x * p - p * 13, cy - y * p + p * 7.5, p * 16, p * 12, 0.4, [
        [0, 'rgba(120,150,230,0.16)'],
        [1, 'rgba(120,150,230,0)'],
      ]);
      g.font = `600 ${Math.round(S * 0.024)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.textAlign = 'left';
      for (const [name, x, y, m] of P) {
        const sx = cx - x * p - p * 13;
        const sy = cy - y * p + p * 7.5;
        star(g, sx, sy, m, [200, 215, 255], 1.6);
        if (m < 4.3) {
          g.fillStyle = 'rgba(190,200,220,0.6)';
          g.fillText(name, sx + 9, sy - 6);
        }
      }
      // the cluster's fainter members
      const r = mulberry32(45);
      for (let i = 0; i < 60; i++) star(g, cx + (r() - 0.5) * p * 75, cy + (r() - 0.5) * p * 60, 7 + r() * 3.5, [210, 220, 255]);
      caption = 'The Seven Sisters and many more';
      break;
    }
    case 'm42': {
      fov = 60;
      backgroundStars(g, S, seed, 60, 11, day);
      const p = scale(fov) * 60;
      glow(g, cx + p * 2, cy - p * 2, p * 34, p * 26, 0.5, [
        [0, 'rgba(210,235,225,0.75)'],
        [0.18, 'rgba(170,205,195,0.42)'],
        [0.55, 'rgba(120,150,145,0.15)'],
        [1, 'rgba(100,120,120,0)'],
      ]);
      // the wings sweeping south, and the dark bay of the Fish's Mouth
      glow(g, cx - p * 10, cy + p * 10, p * 22, p * 9, -0.7, [
        [0, 'rgba(160,190,182,0.25)'],
        [1, 'rgba(160,190,182,0)'],
      ]);
      glow(g, cx + p * 14, cy + p * 9, p * 22, p * 9, 0.8, [
        [0, 'rgba(160,190,182,0.22)'],
        [1, 'rgba(160,190,182,0)'],
      ]);
      glow(g, cx - p * 3, cy - p * 5, p * 5, p * 3.5, 0.2, [
        [0, 'rgba(0,0,0,0.6)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
      // Messier 43, the comma to the north-north-east
      glow(g, cx - p * 3, cy - p * 10, p * 4, p * 3.5, 0, [
        [0, 'rgba(190,215,205,0.45)'],
        [1, 'rgba(190,215,205,0)'],
      ]);
      // the Trapezium
      for (const [x, y, m] of [
        [0, 0, 5.1],
        [0.45, 0.35, 6.7],
        [-0.25, 0.55, 6.4],
        [0.3, -0.3, 7.9],
      ])
        star(g, cx + x * p, cy + y * p, m, [220, 230, 255]);
      caption = 'The Trapezium shines at the heart of the glowing cloud';
      break;
    }
    case 'm57': {
      fov = 10;
      backgroundStars(g, S, seed, 30, 13, day);
      const p = scale(fov);
      g.save();
      g.translate(cx, cy);
      g.rotate(0.9);
      g.scale(1, 0.78);
      const gr = g.createRadialGradient(0, 0, p * 12, 0, 0, p * 44);
      gr.addColorStop(0, 'rgba(160,190,180,0.1)');
      gr.addColorStop(0.45, 'rgba(190,215,205,0.6)');
      gr.addColorStop(0.62, 'rgba(170,190,185,0.45)');
      gr.addColorStop(1, 'rgba(150,160,160,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, p * 44, 0, Math.PI * 2);
      g.fill();
      g.restore();
      caption = 'A smoke ring of glowing gas, 2,500 light-years away';
      break;
    }
    case 'albireo': {
      fov = 3;
      backgroundStars(g, S, seed, 12, 12, day);
      const p = scale(fov);
      const sep = 35 * p;
      const a = paToImage(54 * DEG);
      star(g, cx - (Math.cos(a) * sep) / 2, cy + (Math.sin(a) * sep) / 2, 1.2, [255, 180, 80], 3.2);
      star(g, cx + (Math.cos(a) * sep) / 2, cy - (Math.sin(a) * sep) / 2, 3.2, [110, 150, 255], 3.2);
      caption = 'Gold and blue: 35 arcseconds apart';
      break;
    }
    case 'mizar': {
      fov = 20;
      backgroundStars(g, S, seed, 25, 12, day);
      const p = scale(fov);
      const mx = cx + p * 160;
      const my = cy + p * 120;
      // Mizar B at position angle 152 degrees (the pair drawn a little
      // wider apart than at this field's scale)
      star(g, mx, my, 2.2, [240, 245, 255], 1.1);
      star(g, mx - 5.6, my + 10.6, 3.9, [240, 245, 255], 1.0);
      // Alcor, 11 arcminutes east and 4 north, and the faint star between
      star(g, mx - p * 670, my - p * 230, 4.0, [240, 245, 255], 1.4);
      star(g, mx - p * 330, my - p * 150, 7.6, [255, 230, 200]);
      g.font = `600 ${Math.round(S * 0.026)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.fillStyle = 'rgba(200,205,215,0.7)';
      g.textAlign = 'left';
      g.fillText('Mizar A and B', mx + 14, my + 22);
      g.fillText('Alcor', mx - p * 670 + 12, my - p * 230 - 10);
      caption = 'Mizar splits into two, 14 arcseconds apart; Alcor sits beside them';
      break;
    }
    case 'double': {
      fov = 75;
      backgroundStars(g, S, seed, 120, 11.5, day);
      const p = scale(fov) * 60;
      const r = mulberry32(869);
      for (const [ox, oy] of [
        [-14, 2],
        [14, -2],
      ]) {
        for (let i = 0; i < 70; i++) {
          const a = r() * Math.PI * 2;
          const d = Math.pow(r(), 1.6) * 11;
          const m = 6.5 + r() * 4;
          const red = r() < 0.07;
          star(g, cx + (ox + Math.cos(a) * d) * p, cy + (oy + Math.sin(a) * d) * p, red ? 6.5 : m, red ? [255, 180, 110] : [220, 230, 255]);
        }
      }
      caption = 'NGC 869 and NGC 884, side by side';
      break;
    }
    case 'm13': {
      fov = 15;
      backgroundStars(g, S, seed, 25, 12.5, day);
      const p = scale(fov) * 60;
      // the unresolved glow of the core, and stars resolved out to the edge
      glow(g, cx, cy, p * 3.2, p * 3.2, 0, [
        [0, 'rgba(255,248,232,0.8)'],
        [0.35, 'rgba(235,230,215,0.3)'],
        [1, 'rgba(220,220,210,0)'],
      ]);
      const r = mulberry32(13);
      for (let i = 0; i < 520; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.pow(r(), 1.9) * 5.2;
        star(g, cx + Math.cos(a) * d * p, cy + Math.sin(a) * d * p, 9.6 + r() * 2.6, r() < 0.12 ? [255, 214, 170] : [255, 244, 225], 0.75);
      }
      caption = 'Hundreds of thousands of stars in one ball';
      break;
    }
    case 'm27': {
      fov = 15;
      backgroundStars(g, S, seed, 70, 12.5, day);
      const p = scale(fov) * 60;
      glow(g, cx, cy, p * 4, p * 3.2, 0.3, [
        [0, 'rgba(180,210,200,0.32)'],
        [1, 'rgba(180,210,200,0)'],
      ]);
      // the two bright lobes of the apple core
      for (const s of [-1, 1]) glow(g, cx + s * p * 1.6 * Math.cos(0.3 + Math.PI / 2), cy + s * p * 1.6 * Math.sin(0.3 + Math.PI / 2), p * 2.2, p * 1.7, 0.3, [
        [0, 'rgba(200,225,215,0.55)'],
        [1, 'rgba(200,225,215,0)'],
      ]);
      caption = 'The apple core of a dying star';
      break;
    }
    case 'polaris': {
      fov = 3;
      backgroundStars(g, S, seed, 8, 12, day);
      const p = scale(fov);
      star(g, cx, cy, 2.0, [255, 238, 200], 2.2);
      const a = paToImage(230 * DEG);
      star(g, cx + Math.cos(a) * 18 * p, cy - Math.sin(a) * 18 * p, 8.7, [230, 235, 255], 1.4);
      caption = 'Polaris and its faint companion, 18 arcseconds away';
      break;
    }
    case 'm81': {
      fov = 60;
      backgroundStars(g, S, seed, 50, 11.5, day);
      const p = scale(fov) * 60;
      glow(g, cx - p * 2, cy + p * 9, p * 13, p * 6.5, (90 - 157) * DEG, [
        [0, 'rgba(255,248,230,0.8)'],
        [0.12, 'rgba(225,220,205,0.4)'],
        [1, 'rgba(200,200,190,0)'],
      ]);
      glow(g, cx + p * 2, cy - p * 16, p * 9, p * 2.2, (90 - 65) * DEG, [
        [0, 'rgba(240,236,222,0.6)'],
        [1, 'rgba(210,208,200,0)'],
      ]);
      // the dark lane across the Cigar
      g.save();
      g.globalAlpha = 0.35;
      g.fillStyle = '#000';
      g.translate(cx + p * 2, cy - p * 16);
      g.rotate((90 - 65) * DEG + Math.PI / 2);
      g.fillRect(-p * 0.4, -p * 1.5, p * 0.8, p * 3);
      g.restore();
      caption = "Bode's Galaxy (bottom) and the Cigar (top)";
      break;
    }
    default:
      backgroundStars(g, S, seed, 40, 11, day);
  }
  // cloud drifting across the view
  if (info.cloud > 0.05) {
    const r = mulberry32((info.day * 131 + seed) >>> 0);
    for (let i = 0; i < 12; i++) {
      glow(g, r() * S, r() * S, S * (0.2 + r() * 0.3), S * (0.1 + r() * 0.2), r() * 3, [
        [0, `rgba(${day > 0.5 ? '230,235,240' : '30,32,36'},${0.6 * info.cloud})`],
        [1, 'rgba(0,0,0,0)'],
      ]);
    }
  }
  g.restore();
  // the edge of the field
  const vg = g.createRadialGradient(cx, cy, Rf * 0.84, cx, cy, Rf);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.9)');
  g.fillStyle = vg;
  g.beginPath();
  g.arc(cx, cy, Rf, 0, Math.PI * 2);
  g.fill();
  // which way is which
  g.fillStyle = 'rgba(160,170,185,0.8)';
  g.font = `700 ${Math.round(S * 0.032)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = 'center';
  g.fillText('N', S * 0.1, S * 0.08);
  g.fillText('E', S * 0.035, S * 0.145);
  g.strokeStyle = 'rgba(160,170,185,0.8)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(S * 0.1, S * 0.155);
  g.lineTo(S * 0.1, S * 0.095);
  g.moveTo(S * 0.1, S * 0.155);
  g.lineTo(S * 0.055, S * 0.155);
  g.stroke();
  return { caption, fov };
}
