// Cloth for the shirts in the wardrobe: tileable canvas textures shared by
// the first-person sleeves and Ruben at the wheel. Flannel checks, denim
// twill, the hoodie's knit, camo blotches, the Hawaiian print, hi-vis tape
// and the racing jacket's stripes. One tile is about 12 cm of cloth.
import * as THREE from 'three';

const cache = new Map();

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

// A colour lightened (k > 0) or darkened (k < 0).
function shade(n, k) {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function shirtTexture(shirt) {
  if (cache.has(shirt.id)) return cache.get(shirt.id);
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d');
  const rand = seeded(1 + shirt.id.length * 977);
  g.fillStyle = hex(shirt.main);
  g.fillRect(0, 0, N, N);
  const id = shirt.id;
  if (id === 'red' || id === 'blue' || id === 'green') {
    // flannel: wide stripes of the dark colour both ways, darker still
    // where they cross, and fine light threads through the light squares
    const S = N / 4;
    g.globalAlpha = 0.78;
    g.fillStyle = hex(shirt.band);
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * S, 0, S / 2, N);
      g.fillRect(0, i * S, N, S / 2);
    }
    g.globalAlpha = 0.55;
    g.fillStyle = shade(shirt.band, -0.45);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(i * S, j * S, S / 2, S / 2);
    g.globalAlpha = 0.5;
    g.fillStyle = shade(shirt.main, 0.45);
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * S + S * 0.72, 0, 2, N);
      g.fillRect(0, i * S + S * 0.72, N, 2);
    }
    g.fillStyle = shade(shirt.band, -0.6);
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * S + S * 0.24, 0, 1, N);
      g.fillRect(0, i * S + S * 0.24, N, 1);
    }
  } else if (id === 'denim') {
    // twill: fine diagonal ribs
    for (let k = -N; k < N; k += 4) {
      g.strokeStyle = k % 8 ? shade(shirt.main, 0.18) : shade(shirt.main, -0.22);
      g.globalAlpha = 0.55;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + N, N);
      g.stroke();
    }
  } else if (id === 'hoodie') {
    // brushed knit: soft vertical ribs
    for (let x = 0; x < N; x += 3) {
      g.globalAlpha = 0.18;
      g.fillStyle = x % 6 ? '#000' : shade(shirt.main, 0.3);
      g.fillRect(x, 0, 1, N);
    }
  } else if (id === 'camo') {
    const cols = [shirt.band, shirt.alt, shade(shirt.main, -0.35)];
    for (let i = 0; i < 46; i++) {
      g.globalAlpha = 0.95;
      g.fillStyle = typeof cols[i % 3] === 'number' ? hex(cols[i % 3]) : cols[i % 3];
      const x = rand() * N;
      const y = rand() * N;
      const r = 10 + rand() * 22;
      // blotches wrap round the tile edges so the pattern tiles
      for (const ox of [-N, 0, N]) {
        for (const oy of [-N, 0, N]) {
          g.beginPath();
          for (let a = 0; a < 9; a++) {
            const ang = (a / 9) * Math.PI * 2;
            const rr = r * (0.6 + 0.5 * Math.sin(ang * 3 + i));
            const px = x + ox + Math.cos(ang) * rr * 1.4;
            const py = y + oy + Math.sin(ang) * rr;
            if (a) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          g.closePath();
          g.fill();
        }
      }
    }
  } else if (id === 'hivis') {
    // two bands of grey reflective tape with dark edges
    for (const y of [N * 0.18, N * 0.68]) {
      g.globalAlpha = 1;
      g.fillStyle = hex(shirt.band);
      g.fillRect(0, y, N, N * 0.14);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, y, N, 2);
      g.fillRect(0, y + N * 0.14 - 2, N, 2);
    }
  } else if (id === 'hawaii') {
    // hibiscus flowers with yellow centres and dark leaves
    for (let i = 0; i < 14; i++) {
      const x = rand() * N;
      const y = rand() * N;
      const r = 12 + rand() * 12;
      for (const ox of [-N, 0, N]) {
        for (const oy of [-N, 0, N]) {
          g.globalAlpha = 0.9;
          g.fillStyle = '#1d6b3a';
          g.beginPath();
          g.ellipse(x + ox + r * 0.9, y + oy + r * 0.5, r * 0.7, r * 0.28, 0.6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = hex(shirt.band);
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 + i;
            g.beginPath();
            g.ellipse(x + ox + Math.cos(a) * r * 0.55, y + oy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.34, a, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = hex(shirt.alt);
          g.beginPath();
          g.arc(x + ox, y + oy, r * 0.22, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  } else if (id === 'racing') {
    // the jacket's stripes run down the sleeve (along the tile's v)
    g.globalAlpha = 1;
    g.fillStyle = hex(shirt.band);
    g.fillRect(N * 0.38, 0, N * 0.12, N);
    g.fillStyle = hex(shirt.alt);
    g.fillRect(N * 0.52, 0, N * 0.05, N);
  }
  // the weave over everything
  g.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) {
    const x = rand() * N;
    const y = rand() * N;
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    g.fillRect(x, y, 1 + rand() * 3, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(shirt.id, t);
  return t;
}
