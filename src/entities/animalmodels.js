// Low-poly animal and bird models with limb ids for vertex-shader animation.
// Limbs: 1-4 legs (FL, FR, BL, BR), 5 head/neck, 6 tail, 7/8 left/right wing.
// Models face +z; left is +x.
import * as THREE from 'three';
import { fxPatch } from '../world/worldfx.js';
import { ModelBuilder } from '../util/builder.js';

function legs(b, { h, fx, bx, zf, zb, r0, r1, color, hoof = 0x222222, hoofH = 0.07 }) {
  const defs = [
    [1, fx, zf],
    [2, -fx, zf],
    [3, bx, zb],
    [4, -bx, zb],
  ];
  for (const [limb, x, z] of defs) {
    const pivot = [x, h, z];
    b.cyl(r1, r0, h - hoofH, 6, { pos: [x, (h + hoofH) / 2, z], color, limb, pivot });
    b.cyl(r1 * 0.9, r1 * 1.05, hoofH, 6, { pos: [x, hoofH / 2, z], color: hoof, limb, pivot });
  }
}

export function mooseModel(bull = true) {
  const b = new ModelBuilder({ limbs: true });
  const brown = 0x3a2a1e;
  const dark = 0x2a1d14;
  b.sphere(1, 8, 6, { pos: [0, 1.52, -0.1], scale: [0.52, 0.6, 1.2], color: brown, back: 0.82 });
  b.sphere(1, 7, 5, { pos: [0, 1.78, 0.5], scale: [0.46, 0.5, 0.62], color: dark });
  b.sphere(1, 8, 6, { pos: [0, 1.5, -0.95], scale: [0.45, 0.5, 0.45], color: brown });
  legs(b, { h: 1.34, fx: 0.25, bx: 0.26, zf: 0.72, zb: -0.95, r0: 0.12, r1: 0.06, color: 0x6a5a4a });
  const hp = [0, 1.75, 1.0];
  b.box(0.34, 0.5, 0.7, { pos: [0, 1.85, 1.25], rot: [-0.5, 0, 0], color: dark, limb: 5, pivot: hp });
  b.box(0.3, 0.34, 0.72, { pos: [0, 1.82, 1.72], rot: [0.35, 0, 0], color: 0x2e2118, limb: 5, pivot: hp });
  b.sphere(1, 8, 6, { pos: [0, 1.62, 2.02], scale: [0.18, 0.18, 0.2], color: 0x2a1d14, limb: 5, pivot: hp });
  b.box(0.1, 0.35, 0.12, { pos: [0, 1.4, 1.55], color: dark, limb: 5, pivot: hp }); // bell
  for (const s of [-1, 1]) b.cone(0.07, 0.22, 4, { pos: [s * 0.18, 2.12, 1.52], rot: [0, 0, s * -0.9], color: dark, limb: 5, pivot: hp });
  if (bull) {
    for (const s of [-1, 1]) {
      b.beam([s * 0.12, 2.12, 1.5], [s * 0.45, 2.22, 1.45], 0.05, 5, { color: 0xc8b490, limb: 5, pivot: hp });
      b.box(0.7, 0.07, 0.42, { pos: [s * 0.78, 2.35, 1.42], rot: [0, s * 0.2, s * 0.45], color: 0xc8b490, limb: 5, pivot: hp });
      for (let i = 0; i < 4; i++) {
        const x = s * (0.6 + i * 0.14);
        b.cone(0.035, 0.22, 4, { pos: [x + s * 0.05, 2.55 + i * 0.07, 1.42 + (i - 1.5) * 0.08], rot: [0, 0, s * -0.3], color: 0xd8c8a0, limb: 5, pivot: hp });
      }
    }
  }
  b.cone(0.07, 0.18, 4, { pos: [0, 1.62, -1.35], rot: [-2.2, 0, 0], color: dark, limb: 6, pivot: [0, 1.65, -1.3] });
  return b.build();
}

export function caribouModel(bull = true) {
  const b = new ModelBuilder({ limbs: true });
  const coat = 0x6d5a45;
  b.sphere(1, 8, 6, { pos: [0, 1.02, -0.05], scale: [0.36, 0.4, 0.88], color: coat, belly: [0xe8e0d0, 0.3, 0.1], back: 0.88 });
  b.sphere(1, 8, 6, { pos: [0, 0.98, -0.72], scale: [0.3, 0.3, 0.3], color: 0xe8e0d0 });
  b.sphere(1, 8, 6, { pos: [0, 0.82, 0.05], scale: [0.3, 0.2, 0.7], color: 0xe0d8c8 });
  legs(b, { h: 0.9, fx: 0.17, bx: 0.17, zf: 0.58, zb: -0.62, r0: 0.07, r1: 0.04, color: 0x3a3028, hoof: 0x1a1a1a, hoofH: 0.09 });
  const hp = [0, 1.2, 0.7];
  b.sphere(1, 8, 6, { pos: [0, 1.25, 0.82], scale: [0.26, 0.34, 0.3], color: 0xe8e0d0, limb: 5, pivot: hp });
  b.box(0.2, 0.42, 0.3, { pos: [0, 1.42, 0.98], rot: [-0.55, 0, 0], color: coat, limb: 5, pivot: hp });
  b.box(0.18, 0.22, 0.46, { pos: [0, 1.58, 1.22], rot: [0.35, 0, 0], color: 0x5a4838, limb: 5, pivot: hp });
  b.box(0.13, 0.13, 0.12, { pos: [0, 1.5, 1.44], color: 0x2a2018, limb: 5, pivot: hp });
  for (const s of [-1, 1]) b.cone(0.05, 0.16, 4, { pos: [s * 0.12, 1.74, 1.08], rot: [0, 0, s * -0.9], color: coat, limb: 5, pivot: hp });
  if (bull) {
    const ant = 0xd8c8a8;
    for (const s of [-1, 1]) {
      const base = [s * 0.07, 1.72, 1.1];
      const mid = [s * 0.32, 2.35, 0.82];
      const top = [s * 0.28, 2.85, 1.12];
      b.beam(base, mid, 0.035, 5, { color: ant, limb: 5, pivot: hp });
      b.beam(mid, top, 0.03, 5, { color: ant, limb: 5, pivot: hp });
      b.beam(mid, [s * 0.5, 2.6, 0.95], 0.02, 4, { color: ant, limb: 5, pivot: hp });
      b.beam(top, [s * 0.38, 3.0, 1.3], 0.02, 4, { color: ant, limb: 5, pivot: hp });
      b.beam(base, [s * 0.05, 1.9, 1.42], 0.025, 4, { color: ant, limb: 5, pivot: hp }); // brow tine
    }
    b.box(0.08, 0.16, 0.18, { pos: [0.04, 1.93, 1.48], color: ant, limb: 5, pivot: hp });
  }
  b.cone(0.07, 0.14, 4, { pos: [0, 1.08, -0.92], rot: [-2.0, 0, 0], color: 0xf0ece0, limb: 6, pivot: [0, 1.1, -0.88] });
  return b.build();
}

export function deerModel(buck = true) {
  const b = new ModelBuilder({ limbs: true });
  const coat = 0x7a5536;
  b.sphere(1, 8, 6, { pos: [0, 0.82, 0], scale: [0.26, 0.3, 0.62], color: coat, back: 0.85 });
  b.sphere(1, 8, 6, { pos: [0, 0.72, 0.05], scale: [0.22, 0.18, 0.5], color: 0xd8ccb8 });
  legs(b, { h: 0.72, fx: 0.12, bx: 0.12, zf: 0.42, zb: -0.44, r0: 0.05, r1: 0.028, color: 0x6a4a30, hoof: 0x1a1a1a, hoofH: 0.06 });
  const hp = [0, 0.98, 0.48];
  b.box(0.13, 0.36, 0.2, { pos: [0, 1.12, 0.6], rot: [-0.5, 0, 0], color: coat, limb: 5, pivot: hp });
  b.box(0.13, 0.15, 0.3, { pos: [0, 1.28, 0.78], rot: [0.4, 0, 0], color: 0x6a4a30, limb: 5, pivot: hp });
  b.box(0.07, 0.07, 0.07, { pos: [0, 1.2, 0.93], color: 0x1a1a1a, limb: 5, pivot: hp });
  for (const s of [-1, 1]) b.box(0.03, 0.16, 0.1, { pos: [s * 0.1, 1.42, 0.68], rot: [0, 0, s * -0.5], color: coat, limb: 5, pivot: hp });
  if (buck) {
    for (const s of [-1, 1]) {
      b.beam([s * 0.05, 1.38, 0.72], [s * 0.16, 1.62, 0.8], 0.018, 4, { color: 0xd8c8a8, limb: 5, pivot: hp });
      b.beam([s * 0.16, 1.62, 0.8], [s * 0.12, 1.75, 0.9], 0.014, 4, { color: 0xd8c8a8, limb: 5, pivot: hp });
      b.beam([s * 0.16, 1.62, 0.8], [s * 0.22, 1.74, 0.72], 0.014, 4, { color: 0xd8c8a8, limb: 5, pivot: hp });
    }
  }
  b.box(0.08, 0.16, 0.05, { pos: [0, 0.9, -0.63], rot: [-0.4, 0, 0], color: 0x151515, limb: 6, pivot: [0, 0.95, -0.6] });
  return b.build();
}

export function sheepModel() {
  const b = new ModelBuilder({ limbs: true });
  const white = 0xece8dc;
  b.sphere(1, 8, 6, { pos: [0, 0.78, 0], scale: [0.3, 0.32, 0.55], color: white });
  legs(b, { h: 0.62, fx: 0.13, bx: 0.13, zf: 0.35, zb: -0.35, r0: 0.05, r1: 0.035, color: 0xd8d4c8, hoof: 0x2a2a2a, hoofH: 0.07 });
  const hp = [0, 0.92, 0.42];
  b.box(0.16, 0.26, 0.2, { pos: [0, 1.02, 0.52], rot: [-0.4, 0, 0], color: white, limb: 5, pivot: hp });
  b.box(0.15, 0.16, 0.26, { pos: [0, 1.12, 0.66], rot: [0.4, 0, 0], color: white, limb: 5, pivot: hp });
  for (const s of [-1, 1]) {
    b.torus(0.12, 0.035, 5, 10, { pos: [s * 0.13, 1.18, 0.56], rot: [0, s * 1.2, 0], arc: Math.PI * 1.4, color: 0xc8a878, limb: 5, pivot: hp });
  }
  b.cone(0.05, 0.08, 4, { pos: [0, 0.84, -0.55], rot: [-2.2, 0, 0], color: white, limb: 6, pivot: [0, 0.86, -0.52] });
  return b.build();
}

export function bearModel() {
  const b = new ModelBuilder({ limbs: true });
  const fur = 0x5c412c;
  const tip = 0x7a5a3e;
  b.sphere(1, 8, 6, { pos: [0, 0.98, -0.1], scale: [0.6, 0.6, 1.0], color: fur, jitter: 0.12, back: 1.15 });
  b.sphere(1, 8, 6, { pos: [0, 1.2, 0.45], scale: [0.55, 0.5, 0.55], color: tip, jitter: 0.12, back: 1.15 }); // shoulder hump
  b.sphere(1, 8, 6, { pos: [0, 0.95, -0.85], scale: [0.5, 0.52, 0.45], color: fur });
  legs(b, { h: 0.78, fx: 0.32, bx: 0.33, zf: 0.52, zb: -0.82, r0: 0.17, r1: 0.14, color: 0x3e2a1c, hoof: 0x2a1c12, hoofH: 0.1 });
  const hp = [0, 1.1, 0.8];
  b.sphere(1, 8, 6, { pos: [0, 1.06, 1.08], scale: [0.34, 0.33, 0.34], color: fur, limb: 5, pivot: hp });
  b.box(0.22, 0.2, 0.3, { pos: [0, 0.98, 1.4], color: 0x7a5a3e, limb: 5, pivot: hp });
  b.box(0.1, 0.07, 0.06, { pos: [0, 1.02, 1.56], color: 0x111111, limb: 5, pivot: hp });
  for (const s of [-1, 1]) {
    b.sphere(0.09, 6, 5, { pos: [s * 0.22, 1.36, 1.02], color: fur, limb: 5, pivot: hp });
    b.sphere(0.035, 6, 4, { pos: [s * 0.13, 1.14, 1.37], color: 0x111111, limb: 5, pivot: hp });
  }
  b.sphere(0.07, 5, 4, { pos: [0, 1.05, -1.3], color: fur, limb: 6, pivot: [0, 1.05, -1.25] });
  return b.build();
}

export function wolfModel() {
  const b = new ModelBuilder({ limbs: true });
  const grey = 0x7d7a72;
  b.sphere(1, 7, 5, { pos: [0, 0.72, 0], scale: [0.22, 0.26, 0.6], color: grey, belly: [0xc8c2b4, 0.35, 0.12], back: 0.85 });
  b.sphere(1, 8, 6, { pos: [0, 0.76, 0.35], scale: [0.24, 0.28, 0.3], color: 0x9a968c });
  legs(b, { h: 0.6, fx: 0.1, bx: 0.1, zf: 0.38, zb: -0.4, r0: 0.045, r1: 0.03, color: 0x6a665e, hoof: 0x3a3a38, hoofH: 0.05 });
  const hp = [0, 0.85, 0.5];
  b.box(0.2, 0.2, 0.26, { pos: [0, 0.92, 0.66], color: grey, limb: 5, pivot: hp });
  b.box(0.1, 0.1, 0.2, { pos: [0, 0.86, 0.86], color: 0x8a867c, limb: 5, pivot: hp });
  for (const s of [-1, 1]) b.cone(0.05, 0.12, 4, { pos: [s * 0.07, 1.08, 0.6], color: grey, limb: 5, pivot: hp });
  b.cone(0.07, 0.45, 5, { pos: [0, 0.66, -0.72], rot: [-2.3, 0, 0], color: 0x5a5650, limb: 6, pivot: [0, 0.72, -0.58] });
  return b.build();
}

export function foxModel() {
  const b = new ModelBuilder({ limbs: true });
  const orange = 0xc8641e;
  b.sphere(1, 7, 5, { pos: [0, 0.34, 0], scale: [0.12, 0.13, 0.3], color: orange, belly: [0xf0e8dc, 0.3, 0.1] });
  b.sphere(1, 7, 5, { pos: [0, 0.32, 0.2], scale: [0.1, 0.11, 0.1], color: 0xf0e8dc });
  legs(b, { h: 0.28, fx: 0.06, bx: 0.06, zf: 0.2, zb: -0.2, r0: 0.025, r1: 0.018, color: 0x2a1a10, hoof: 0x1a1a1a, hoofH: 0.03 });
  const hp = [0, 0.4, 0.26];
  b.box(0.11, 0.1, 0.14, { pos: [0, 0.44, 0.34], color: orange, limb: 5, pivot: hp });
  b.cone(0.04, 0.12, 5, { pos: [0, 0.42, 0.47], rot: [Math.PI / 2, 0, 0], color: 0xf0e8dc, limb: 5, pivot: hp });
  for (const s of [-1, 1]) b.cone(0.03, 0.08, 4, { pos: [s * 0.04, 0.53, 0.32], color: 0x2a1a10, limb: 5, pivot: hp });
  b.cone(0.06, 0.34, 6, { pos: [0, 0.3, -0.42], rot: [-1.9, 0, 0], color: orange, limb: 6, pivot: [0, 0.34, -0.28] });
  b.sphere(0.04, 5, 4, { pos: [0, 0.25, -0.58], color: 0xf8f4ee, limb: 6, pivot: [0, 0.34, -0.28] });
  return b.build();
}

export function hareModel() {
  const b = new ModelBuilder({ limbs: true });
  const fur = 0x8a6a4a;
  b.sphere(1, 8, 6, { pos: [0, 0.2, 0], scale: [0.1, 0.12, 0.17], color: fur, belly: [0xf0ece4, 0.3, 0.12] });
  legs(b, { h: 0.12, fx: 0.05, bx: 0.07, zf: 0.1, zb: -0.1, r0: 0.03, r1: 0.025, color: 0xe8e0d0, hoof: 0xe8e0d0, hoofH: 0.02 });
  const hp = [0, 0.26, 0.12];
  b.sphere(1, 7, 5, { pos: [0, 0.3, 0.18], scale: [0.07, 0.07, 0.09], color: fur, limb: 5, pivot: hp });
  for (const s of [-1, 1]) b.box(0.03, 0.16, 0.05, { pos: [s * 0.03, 0.43, 0.14], rot: [-0.3, 0, s * 0.15], color: fur, limb: 5, pivot: hp });
  b.sphere(0.04, 5, 4, { pos: [0, 0.2, -0.17], color: 0xf8f4ee, limb: 6, pivot: [0, 0.2, -0.15] });
  return b.build();
}

// ---- birds: wings along +/-x, pivot at the shoulder
function wings(b, span, chord, color, tipColor, y = 0, under = null) {
  for (const s of [-1, 1]) {
    const limb = s > 0 ? 7 : 8;
    const pivot = [s * 0.05, y, 0.05];
    const half = span / 2;
    b.box(half * 0.55, 0.02, chord, { pos: [s * (0.05 + half * 0.275), y, 0.02], color, limb, pivot, under });
    b.box(half * 0.45, 0.018, chord * 0.75, { pos: [s * (0.05 + half * 0.55 + half * 0.225), y, -0.02], rot: [0, s * 0.12, 0], color: tipColor ?? color, limb, pivot, under: tipColor ? null : under });
  }
}

export function eagleModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 8, 6, { pos: [0, 0, 0], scale: [0.14, 0.13, 0.42], color: 0x3a2a1a });
  b.sphere(1, 8, 6, { pos: [0, 0.04, 0.38], scale: [0.09, 0.09, 0.11], color: 0xf4f2ea });
  b.cone(0.035, 0.1, 5, { pos: [0, 0.02, 0.52], rot: [Math.PI / 2, 0, 0], color: 0xe8b830 });
  b.box(0.2, 0.02, 0.22, { pos: [0, 0, -0.44], color: 0xf4f2ea, limb: 6, pivot: [0, 0, -0.34] });
  wings(b, 2.0, 0.34, 0x3a2a1a, 0x2a1c10);
  return b.build();
}

export function ravenModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.09, 0.09, 0.28], color: 0x111114 });
  b.sphere(0.07, 6, 5, { pos: [0, 0.03, 0.26], color: 0x111114 });
  b.cone(0.03, 0.09, 4, { pos: [0, 0.02, 0.36], rot: [Math.PI / 2, 0, 0], color: 0x0a0a0a });
  b.box(0.12, 0.015, 0.16, { pos: [0, 0, -0.32], color: 0x111114, limb: 6, pivot: [0, 0, -0.24] });
  wings(b, 1.15, 0.22, 0x141418);
  return b.build();
}

export function gullModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.09, 0.09, 0.26], color: 0xf4f4f0 });
  b.sphere(0.07, 6, 5, { pos: [0, 0.03, 0.24], color: 0xf4f4f0 });
  b.cone(0.022, 0.08, 4, { pos: [0, 0.02, 0.33], rot: [Math.PI / 2, 0, 0], color: 0xe8c030 });
  b.box(0.1, 0.015, 0.12, { pos: [0, 0, -0.28], color: 0xf4f4f0, limb: 6, pivot: [0, 0, -0.22] });
  wings(b, 1.25, 0.2, 0xa8b0b8, 0x1a1a1a, 0, 0xf4f4f0);
  return b.build();
}

export function gooseModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.14, 0.13, 0.36], color: 0x8a7a64 });
  b.beam([0, 0.02, 0.28], [0, 0.08, 0.58], 0.035, 5, { color: 0x151515 });
  b.sphere(0.06, 6, 5, { pos: [0, 0.09, 0.62], color: 0x151515 });
  b.box(0.1, 0.03, 0.05, { pos: [0, 0.07, 0.6], color: 0xf4f4f0 });
  b.box(0.12, 0.015, 0.14, { pos: [0, 0, -0.4], color: 0x151515, limb: 6, pivot: [0, 0, -0.33] });
  wings(b, 1.6, 0.28, 0x7a6a56, 0x4a4036, 0, 0xb8ae9c);
  return b.build();
}

export function duckModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.12, 0.1, 0.24], color: 0x9a948a });
  b.sphere(0.075, 6, 5, { pos: [0, 0.1, 0.2], color: 0x1f5a2a });
  b.box(0.05, 0.025, 0.08, { pos: [0, 0.08, 0.3], color: 0xe8c030 });
  b.box(0.12, 0.012, 0.1, { pos: [0, 0.02, -0.26], color: 0x2a2a2a, limb: 6, pivot: [0, 0.02, -0.2] });
  wings(b, 0.85, 0.16, 0x7a746a, 0x3a5a8a, 0.03, 0xd8d4cc);
  return b.build();
}

export function loonModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 8, 6, { pos: [0, 0, 0], scale: [0.14, 0.1, 0.36], color: 0x1a1a1a });
  for (let i = 0; i < 6; i++) b.box(0.18, 0.02, 0.03, { pos: [0, 0.09, -0.2 + i * 0.07], color: 0xe8e8e0 });
  b.beam([0, 0.02, 0.26], [0, 0.14, 0.4], 0.045, 5, { color: 0x15201a });
  b.sphere(0.06, 6, 5, { pos: [0, 0.16, 0.44], color: 0x15201a });
  b.cone(0.022, 0.12, 4, { pos: [0, 0.15, 0.55], rot: [Math.PI / 2, 0, 0], color: 0x111111 });
  b.box(0.1, 0.012, 0.1, { pos: [0, 0.02, -0.38], color: 0x1a1a1a, limb: 6, pivot: [0, 0.02, -0.32] });
  wings(b, 1.2, 0.2, 0x1a1a1a, 0x101010, 0.03);
  return b.build();
}

export function puffinModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.08, 0.08, 0.16], color: 0x141414 });
  b.sphere(0.06, 6, 5, { pos: [0, 0.03, 0.14], color: 0xf0ece4 });
  b.cone(0.03, 0.07, 4, { pos: [0, 0.02, 0.22], rot: [Math.PI / 2, 0, 0], color: 0xf06a1a });
  wings(b, 0.55, 0.1, 0x141414);
  return b.build();
}

export function ptarmiganModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.1, 0.1, 0.16], color: 0x8a7050 });
  b.sphere(0.06, 6, 5, { pos: [0, 0.06, 0.13], color: 0x7a6040 });
  b.box(0.1, 0.012, 0.08, { pos: [0, 0.01, -0.17], color: 0x2a2018, limb: 6, pivot: [0, 0.01, -0.13] });
  wings(b, 0.6, 0.12, 0xece8e0);
  return b.build();
}

export function whaleModel() {
  const b = new ModelBuilder({ limbs: true });
  const grey = 0x2a3038;
  b.sphere(1, 10, 6, { pos: [0, 0, 0], scale: [1.4, 1.2, 5.2], color: grey, jitter: 0.03 });
  b.sphere(1, 8, 6, { pos: [0, -0.2, 4.4], scale: [1.2, 0.95, 1.8], color: grey });
  b.sphere(1, 8, 6, { pos: [0, -0.5, 1.5], scale: [1.1, 0.6, 3.5], color: 0xd8dcd8 });
  for (const s of [-1, 1]) b.box(3.4, 0.14, 0.7, { pos: [s * 2.6, -0.45, 2.2], rot: [0, s * -0.35, s * -0.35], color: 0xe0e4e0 });
  b.cone(0.3, 0.7, 5, { pos: [0, 1.25, -1.8], rot: [-0.6, 0, 0], color: grey });
  const tp = [0, 0, -5.0];
  b.cyl(0.35, 0.9, 2.4, 8, { pos: [0, 0, -6.0], rot: [Math.PI / 2, 0, 0], color: grey, limb: 6, pivot: tp });
  for (const s of [-1, 1]) b.box(2.0, 0.12, 1.0, { pos: [s * 1.0, 0, -7.4], rot: [0, s * 0.35, 0], color: grey, limb: 6, pivot: tp });
  return b.build();
}

export function otterModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.16, 0.12, 0.45], color: 0x4a3222 });
  b.sphere(0.12, 7, 5, { pos: [0, 0.06, 0.42], color: 0xb8a890 });
  b.cone(0.07, 0.3, 5, { pos: [0, 0, -0.55], rot: [-Math.PI / 2, 0, 0], color: 0x3a2618, limb: 6, pivot: [0, 0, -0.4] });
  for (const s of [-1, 1]) b.box(0.05, 0.05, 0.14, { pos: [s * 0.1, 0.12, 0.2], rot: [0.6, 0, 0], color: 0x3a2618, limb: 5, pivot: [0, 0.05, 0.1] });
  return b.build();
}

// Material with limb animation driven by the per-instance aAnim attribute.
export function animatedMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLimb;
        attribute vec3 aPivot;
        attribute vec4 aAnim;
        mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
        mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
        mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
        mat3 limbRot() {
          float L = aLimb;
          if (L < 0.5) return mat3(1.0);
          float ph = aAnim.x;
          float amp = aAnim.y;
          if (L < 4.5) {
            float off = (L < 1.5 || L > 3.5) ? 0.0 : 3.14159;
            return rX(sin(ph + off) * amp * 0.62);
          }
          if (L < 5.5) return rX(aAnim.z * 0.95 + sin(ph * 0.5) * 0.05 * amp);
          if (L < 6.5) return rY(sin(ph * 1.7) * 0.35 * (0.25 + aAnim.w)) * rX(aAnim.w * sin(ph) * 0.4);
          if (L < 7.5) return rZ(sin(ph) * aAnim.w + aAnim.y * 0.15);
          return rZ(-sin(ph) * aAnim.w - aAnim.y * 0.15);
        }`
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = limbRot() * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aPivot + limbRot() * (transformed - aPivot);');
    fxPatch(shader, mat);
  };
  return mat;
}

// Instanced renderer for one species with per-instance animation data.
export class AnimatedHerd {
  constructor(geometry, capacity, { shadow = true, material } = {}) {
    this.capacity = capacity;
    const g = geometry;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAnim', this.anim);
    this.mesh = new THREE.InstancedMesh(g, material || animatedMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  // Write one instance: matrix from position/rotation/scale plus animation.
  push(matrix, phase, amp, head, extra) {
    if (this.n >= this.capacity) return;
    matrix.toArray(this.mesh.instanceMatrix.array, this.n * 16);
    const a = this.anim.array;
    a[this.n * 4] = phase;
    a[this.n * 4 + 1] = amp;
    a[this.n * 4 + 2] = head;
    a[this.n * 4 + 3] = extra;
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.anim.clearUpdateRanges();
      this.anim.addUpdateRange(0, this.n * 4);
      this.anim.needsUpdate = true;
    }
  }
}

// ---- more species -----------------------------------------------------------

export function blackBearModel() {
  const b = new ModelBuilder({ limbs: true });
  const fur = 0x1c1916;
  const sheen = 0x2a2520;
  b.sphere(1, 8, 6, { pos: [0, 0.82, -0.05], scale: [0.48, 0.5, 0.86], color: fur, jitter: 0.1 });
  b.sphere(1, 8, 6, { pos: [0, 0.84, 0.4], scale: [0.44, 0.44, 0.45], color: sheen, jitter: 0.1 });
  b.sphere(1, 8, 6, { pos: [0, 0.8, -0.72], scale: [0.42, 0.44, 0.4], color: fur });
  legs(b, { h: 0.64, fx: 0.26, bx: 0.27, zf: 0.45, zb: -0.7, r0: 0.13, r1: 0.11, color: 0x141210, hoof: 0x0e0c0a, hoofH: 0.08 });
  const hp = [0, 0.92, 0.66];
  b.sphere(1, 8, 6, { pos: [0, 0.92, 0.9], scale: [0.27, 0.27, 0.28], color: fur, limb: 5, pivot: hp });
  b.box(0.17, 0.15, 0.26, { pos: [0, 0.86, 1.15], color: 0x8a6a4a, limb: 5, pivot: hp }); // tan muzzle
  b.box(0.08, 0.06, 0.05, { pos: [0, 0.9, 1.29], color: 0x0a0a0a, limb: 5, pivot: hp });
  for (const s of [-1, 1]) {
    b.sphere(0.075, 6, 5, { pos: [s * 0.2, 1.17, 0.84], color: fur, limb: 5, pivot: hp });
    b.sphere(0.028, 6, 4, { pos: [s * 0.1, 0.98, 1.11], color: 0x050505, limb: 5, pivot: hp });
  }
  b.sphere(0.06, 5, 4, { pos: [0, 0.86, -1.1], color: fur, limb: 6, pivot: [0, 0.86, -1.05] });
  return b.build();
}

export function goatModel() {
  const b = new ModelBuilder({ limbs: true });
  const white = 0xf2efe6;
  const shade = 0xdcd6c8;
  b.sphere(1, 8, 6, { pos: [0, 0.86, 0], scale: [0.3, 0.36, 0.58], color: white, jitter: 0.1 });
  b.sphere(1, 8, 6, { pos: [0, 0.98, 0.28], scale: [0.3, 0.34, 0.3], color: white }); // shoulder hump
  // shaggy "pantaloons" over the upper legs
  legs(b, { h: 0.6, fx: 0.13, bx: 0.13, zf: 0.34, zb: -0.36, r0: 0.075, r1: 0.04, color: shade, hoof: 0x1a1a1a, hoofH: 0.07 });
  const hp = [0, 1.0, 0.45];
  b.box(0.16, 0.3, 0.22, { pos: [0, 1.1, 0.56], rot: [-0.35, 0, 0], color: white, limb: 5, pivot: hp });
  b.box(0.13, 0.15, 0.3, { pos: [0, 1.2, 0.74], rot: [0.5, 0, 0], color: white, limb: 5, pivot: hp });
  b.cone(0.05, 0.2, 5, { pos: [0, 0.98, 0.82], rot: [Math.PI, 0, 0], color: white, limb: 5, pivot: hp }); // beard
  b.box(0.06, 0.05, 0.05, { pos: [0, 1.13, 0.88], color: 0x1a1a1a, limb: 5, pivot: hp });
  for (const s of [-1, 1]) {
    b.cone(0.022, 0.2, 5, { pos: [s * 0.045, 1.4, 0.64], rot: [-0.5, 0, 0], color: 0x111111, limb: 5, pivot: hp });
    b.box(0.03, 0.1, 0.05, { pos: [s * 0.1, 1.33, 0.62], rot: [0, 0, s * -0.6], color: white, limb: 5, pivot: hp });
  }
  b.cone(0.04, 0.08, 4, { pos: [0, 0.94, -0.58], rot: [-2.3, 0, 0], color: white, limb: 6, pivot: [0, 0.96, -0.55] });
  return b.build();
}

export function muskoxModel() {
  const b = new ModelBuilder({ limbs: true });
  const coat = 0x2e2218;
  const skirt = 0x3a2a1c;
  b.sphere(1, 8, 6, { pos: [0, 0.98, -0.05], scale: [0.62, 0.6, 1.0], color: coat, jitter: 0.12 });
  b.sphere(1, 8, 6, { pos: [0, 1.12, 0.1], scale: [0.4, 0.22, 0.46], color: 0x8a7458 }); // pale saddle
  // long guard hair hanging almost to the ground
  b.cyl(0.7, 0.62, 0.55, 9, { pos: [0, 0.5, -0.05], scale: [1, 1, 1.45], color: skirt, jitter: 0.14 });
  legs(b, { h: 0.5, fx: 0.24, bx: 0.26, zf: 0.5, zb: -0.62, r0: 0.1, r1: 0.08, color: 0xb8a888, hoof: 0x1a1a1a, hoofH: 0.07 });
  const hp = [0, 1.02, 0.78];
  b.sphere(1, 7, 5, { pos: [0, 0.94, 1.05], scale: [0.3, 0.33, 0.36], color: coat, limb: 5, pivot: hp });
  b.box(0.22, 0.16, 0.2, { pos: [0, 0.78, 1.3], color: 0x2a2018, limb: 5, pivot: hp });
  // horns: a heavy boss that sweeps down past the eyes and hooks up
  for (const s of [-1, 1]) {
    b.box(0.26, 0.1, 0.22, { pos: [s * 0.12, 1.22, 1.02], rot: [0, 0, s * 0.2], color: 0xc8b890, limb: 5, pivot: hp });
    b.beam([s * 0.25, 1.2, 1.02], [s * 0.4, 0.9, 1.06], 0.05, 5, { color: 0xb8a880, r2: 0.035, limb: 5, pivot: hp });
    b.beam([s * 0.4, 0.9, 1.06], [s * 0.48, 1.05, 1.2], 0.035, 4, { color: 0x2a2420, r2: 0.015, limb: 5, pivot: hp });
  }
  b.cone(0.06, 0.12, 4, { pos: [0, 0.95, -1.05], rot: [-2.3, 0, 0], color: coat, limb: 6, pivot: [0, 0.98, -1.0] });
  return b.build();
}

export function porcupineModel() {
  const b = new ModelBuilder({ limbs: true });
  const fur = 0x2e2418;
  b.sphere(1, 8, 6, { pos: [0, 0.26, 0], scale: [0.22, 0.2, 0.34], color: fur });
  // quills: pale-tipped spikes over the back
  const rnd = (i) => Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453);
  for (let i = 0; i < 26; i++) {
    const a = rnd(i) * Math.PI - Math.PI / 2;
    const z = -0.3 + rnd(i + 50) * 0.55;
    const x = Math.sin(a) * 0.2;
    const y = 0.26 + Math.cos(a) * 0.18;
    b.cone(0.02, 0.2, 3, { pos: [x * 1.05, y + 0.05, z], rot: [-0.9 + rnd(i + 9) * 0.3, 0, -a * 0.9], color: i % 3 ? 0xd8ccb0 : 0x4a3c2c, jitter: 0.1 });
  }
  legs(b, { h: 0.14, fx: 0.1, bx: 0.1, zf: 0.16, zb: -0.16, r0: 0.04, r1: 0.035, color: 0x1a1410, hoof: 0x100c08, hoofH: 0.03 });
  const hp = [0, 0.26, 0.3];
  b.sphere(1, 7, 5, { pos: [0, 0.22, 0.38], scale: [0.1, 0.1, 0.12], color: 0x1c1610, limb: 5, pivot: hp });
  b.sphere(0.02, 5, 4, { pos: [0, 0.22, 0.5], color: 0x050505, limb: 5, pivot: hp });
  b.cone(0.07, 0.18, 5, { pos: [0, 0.22, -0.4], rot: [-2.2, 0, 0], color: 0x3a2e20, limb: 6, pivot: [0, 0.24, -0.32] });
  return b.build();
}

export function lynxModel() {
  const b = new ModelBuilder({ limbs: true });
  const coat = 0x9a8a72;
  b.sphere(1, 8, 6, { pos: [0, 0.52, 0], scale: [0.17, 0.19, 0.42], color: coat, belly: [0xe0d6c4, 0.32, 0.12] });
  legs(b, { h: 0.46, fx: 0.08, bx: 0.08, zf: 0.28, zb: -0.3, r0: 0.05, r1: 0.04, color: 0x8a7a64, hoof: 0x9a8a72, hoofH: 0.06 });
  const hp = [0, 0.62, 0.36];
  b.sphere(1, 8, 6, { pos: [0, 0.66, 0.48], scale: [0.13, 0.12, 0.12], color: coat, limb: 5, pivot: hp });
  b.sphere(1, 7, 5, { pos: [0, 0.6, 0.47], scale: [0.17, 0.1, 0.08], color: 0xd8ccb8, limb: 5, pivot: hp }); // facial ruff
  b.box(0.07, 0.05, 0.06, { pos: [0, 0.63, 0.59], color: 0xd8ccb8, limb: 5, pivot: hp });
  for (const s of [-1, 1]) {
    b.cone(0.035, 0.1, 4, { pos: [s * 0.07, 0.8, 0.46], color: 0x6a5a48, limb: 5, pivot: hp });
    b.box(0.008, 0.07, 0.008, { pos: [s * 0.07, 0.88, 0.46], color: 0x111111, limb: 5, pivot: hp }); // ear tufts
    b.sphere(0.018, 5, 4, { pos: [s * 0.045, 0.69, 0.58], color: 0xc8a030, limb: 5, pivot: hp });
  }
  b.cone(0.035, 0.1, 5, { pos: [0, 0.56, -0.44], rot: [-2.0, 0, 0], color: 0x2a2420, limb: 6, pivot: [0, 0.58, -0.4] });
  return b.build();
}

export function squirrelModel() {
  const b = new ModelBuilder({ limbs: true });
  const fur = 0x9a8058;
  b.sphere(1, 7, 5, { pos: [0, 0.12, 0], scale: [0.07, 0.07, 0.13], color: fur });
  b.sphere(1, 6, 5, { pos: [0, 0.11, 0.02], scale: [0.055, 0.05, 0.1], color: 0xd8c8a8 });
  legs(b, { h: 0.06, fx: 0.035, bx: 0.04, zf: 0.07, zb: -0.07, r0: 0.018, r1: 0.015, color: 0x8a7050, hoof: 0x6a5840, hoofH: 0.01 });
  const hp = [0, 0.15, 0.1];
  b.sphere(1, 6, 5, { pos: [0, 0.16, 0.14], scale: [0.045, 0.045, 0.055], color: fur, limb: 5, pivot: hp });
  b.sphere(0.012, 4, 3, { pos: [0, 0.16, 0.19], color: 0x111111, limb: 5, pivot: hp });
  b.cone(0.03, 0.12, 5, { pos: [0, 0.14, -0.17], rot: [-2.4, 0, 0], color: 0x7a6040, limb: 6, pivot: [0, 0.13, -0.12] });
  return b.build();
}

export function beaverModel() {
  const b = new ModelBuilder({ limbs: true });
  const fur = 0x4a3220;
  b.sphere(1, 8, 6, { pos: [0, 0, 0], scale: [0.2, 0.15, 0.42], color: fur });
  b.sphere(1, 7, 5, { pos: [0, 0.05, 0.38], scale: [0.13, 0.12, 0.14], color: 0x3e2a1a });
  b.box(0.06, 0.04, 0.03, { pos: [0, -0.01, 0.52], color: 0xd88a2a }); // orange incisors
  for (const s of [-1, 1]) b.sphere(0.03, 5, 4, { pos: [s * 0.09, 0.15, 0.34], color: 0x2a1a10 });
  // flat, scaly paddle tail
  b.box(0.2, 0.035, 0.34, { pos: [0, -0.02, -0.56], color: 0x2a2420, limb: 6, pivot: [0, 0, -0.4] });
  return b.build();
}

export function orcaModel() {
  const b = new ModelBuilder({ limbs: true });
  const black = 0x101214;
  const white = 0xf2f2ee;
  b.sphere(1, 10, 6, { pos: [0, 0, 0], scale: [1.0, 1.0, 3.6], color: black, jitter: 0.03 });
  b.sphere(1, 8, 6, { pos: [0, -0.3, 0.9], scale: [0.8, 0.55, 2.2], color: white }); // belly
  for (const s of [-1, 1]) b.sphere(1, 6, 4, { pos: [s * 0.62, 0.35, 2.3], scale: [0.12, 0.18, 0.42], color: white }); // eye patches
  b.sphere(1, 6, 4, { pos: [0, 0.55, -0.9], scale: [0.55, 0.2, 0.7], color: 0x8a9096 }); // saddle
  // the tall dorsal fin
  b.add(new THREE.ConeGeometry(0.25, 1.8, 4), { pos: [0, 1.6, -0.2], scale: [0.35, 1, 1], rot: [-0.2, 0, 0], color: black });
  for (const s of [-1, 1]) b.box(1.1, 0.1, 0.6, { pos: [s * 1.0, -0.45, 1.5], rot: [0, s * -0.4, s * -0.3], color: black });
  const tp = [0, 0, -3.3];
  b.cyl(0.25, 0.6, 1.6, 8, { pos: [0, 0, -4.0], rot: [Math.PI / 2, 0, 0], color: black, limb: 6, pivot: tp });
  for (const s of [-1, 1]) b.box(1.3, 0.08, 0.7, { pos: [s * 0.65, 0, -4.9], rot: [0, s * 0.35, 0], color: black, limb: 6, pivot: tp });
  return b.build();
}

export function seaLionModel() {
  const b = new ModelBuilder({ limbs: true });
  const brown = 0x7a5a3a;
  b.sphere(1, 8, 6, { pos: [0, 0.3, -0.2], scale: [0.4, 0.34, 1.05], color: brown });
  b.sphere(1, 8, 6, { pos: [0, 0.5, 0.65], scale: [0.3, 0.36, 0.4], color: 0x8a6a48 }); // chest
  const hp = [0, 0.7, 0.8];
  b.beam([0, 0.6, 0.8], [0, 0.95, 1.05], 0.16, 7, { color: 0x8a6a48, r2: 0.12, limb: 5, pivot: hp });
  b.sphere(1, 7, 5, { pos: [0, 1.0, 1.12], scale: [0.13, 0.12, 0.17], color: 0x6a4a2e, limb: 5, pivot: hp });
  b.box(0.08, 0.06, 0.1, { pos: [0, 0.97, 1.28], color: 0x3a2a1a, limb: 5, pivot: hp });
  // fore flippers prop the chest up; hind flippers trail
  for (const s of [-1, 1]) {
    b.box(0.12, 0.5, 0.22, { pos: [s * 0.3, 0.22, 0.75], rot: [0.3, 0, s * 0.35], color: 0x3e2c1c, limb: s > 0 ? 1 : 2, pivot: [s * 0.25, 0.45, 0.7] });
    b.box(0.14, 0.05, 0.36, { pos: [s * 0.18, 0.05, -1.3], rot: [0, s * 0.4, 0], color: 0x3e2c1c, limb: 6, pivot: [0, 0.1, -1.1] });
  }
  return b.build();
}

export function sealHeadModel() {
  const b = new ModelBuilder({ limbs: true });
  const grey = 0x6e6a62;
  b.sphere(1, 8, 6, { pos: [0, -0.1, -0.1], scale: [0.26, 0.26, 0.5], color: grey });
  b.sphere(1, 8, 6, { pos: [0, 0.18, 0.18], scale: [0.16, 0.16, 0.19], color: 0x7a766c });
  b.box(0.1, 0.07, 0.08, { pos: [0, 0.14, 0.34], color: 0x4a4640 });
  for (const s of [-1, 1]) b.sphere(0.035, 6, 4, { pos: [s * 0.08, 0.23, 0.3], color: 0x0a0a0a });
  return b.build();
}

export function swanModel() {
  const b = new ModelBuilder({ limbs: true });
  const white = 0xf6f6f2;
  b.sphere(1, 8, 6, { pos: [0, 0, 0], scale: [0.26, 0.2, 0.5], color: white });
  b.beam([0, 0.05, 0.38], [0, 0.42, 0.44], 0.05, 6, { color: white, r2: 0.04 });
  b.beam([0, 0.42, 0.44], [0, 0.6, 0.52], 0.04, 6, { color: white });
  b.sphere(0.07, 6, 5, { pos: [0, 0.62, 0.56], color: white });
  b.box(0.05, 0.035, 0.12, { pos: [0, 0.6, 0.66], rot: [0.3, 0, 0], color: 0x111111 });
  b.box(0.14, 0.02, 0.14, { pos: [0, 0.04, -0.5], color: white, limb: 6, pivot: [0, 0.04, -0.42] });
  wings(b, 2.2, 0.36, white, 0xeeeeea, 0.06);
  return b.build();
}

export function craneModel() {
  const b = new ModelBuilder({ limbs: true });
  const grey = 0x8a8a86;
  b.sphere(1, 8, 6, { pos: [0, 1.0, 0], scale: [0.16, 0.17, 0.36], color: grey });
  b.box(0.22, 0.12, 0.2, { pos: [0, 0.98, -0.38], rot: [0.5, 0, 0], color: 0x6e6c68, limb: 6, pivot: [0, 1.0, -0.3] }); // bustle
  // legs swing with the walk (limbs 1 and 2)
  for (const s of [-1, 1]) {
    const limb = s > 0 ? 1 : 2;
    b.cyl(0.015, 0.018, 0.9, 4, { pos: [s * 0.07, 0.48, 0.02], color: 0x2a2a2a, limb, pivot: [s * 0.07, 0.93, 0.02] });
  }
  const hp = [0, 1.08, 0.28];
  b.beam([0, 1.05, 0.28], [0, 1.52, 0.42], 0.04, 5, { color: grey, r2: 0.03, limb: 5, pivot: hp });
  b.sphere(0.06, 6, 5, { pos: [0, 1.56, 0.45], color: 0xd8d6d0, limb: 5, pivot: hp });
  b.box(0.05, 0.03, 0.05, { pos: [0, 1.61, 0.47], color: 0xc0201a, limb: 5, pivot: hp }); // red crown
  b.cone(0.018, 0.16, 4, { pos: [0, 1.54, 0.58], rot: [Math.PI / 2 + 0.2, 0, 0], color: 0x2a2a2a, limb: 5, pivot: hp });
  wings(b, 1.9, 0.3, grey, 0x5a5a58, 1.0);
  return b.build();
}

export function magpieModel() {
  const b = new ModelBuilder({ limbs: true });
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.07, 0.07, 0.16], color: 0x0e0e12 });
  b.sphere(1, 6, 5, { pos: [0, -0.02, 0.02], scale: [0.06, 0.05, 0.1], color: 0xf4f4f0 }); // white belly
  b.sphere(0.05, 6, 5, { pos: [0, 0.03, 0.16], color: 0x0e0e12 });
  b.cone(0.016, 0.06, 4, { pos: [0, 0.02, 0.23], rot: [Math.PI / 2, 0, 0], color: 0x0a0a0a });
  // the long, iridescent tail
  b.box(0.05, 0.012, 0.3, { pos: [0, 0, -0.3], color: 0x1a2a3a, limb: 6, pivot: [0, 0, -0.15] });
  wings(b, 0.6, 0.12, 0x101418, 0xf0f0ec);
  return b.build();
}

export function kingfisherModel() {
  const b = new ModelBuilder({ limbs: true });
  const blue = 0x44607e;
  b.sphere(1, 7, 5, { pos: [0, 0, 0], scale: [0.06, 0.06, 0.12], color: blue });
  b.sphere(0.055, 6, 5, { pos: [0, 0.04, 0.1], color: blue });
  b.cone(0.03, 0.06, 4, { pos: [0, 0.1, 0.06], rot: [-0.8, 0, 0], color: blue }); // ragged crest
  b.box(0.1, 0.03, 0.04, { pos: [0, 0.0, 0.1], color: 0xf4f4f0 }); // white collar
  b.cone(0.016, 0.09, 4, { pos: [0, 0.03, 0.2], rot: [Math.PI / 2, 0, 0], color: 0x1a1a1a });
  b.box(0.05, 0.01, 0.08, { pos: [0, 0, -0.14], color: blue, limb: 6, pivot: [0, 0, -0.1] });
  wings(b, 0.5, 0.1, blue, 0x2a3a4e);
  return b.build();
}

// Beaver lodge: a dome of gnawed sticks and mud at the water's edge.
export function beaverLodgeGeometry() {
  const b = new ModelBuilder();
  b.sphere(1, 9, 6, { pos: [0, -0.2, 0], scale: [2.6, 1.3, 2.3], color: 0x4a3a2a, jitter: 0.18 });
  const rnd = (i) => Math.sin(i * 78.233) * 43758.5453 - Math.floor(Math.sin(i * 78.233) * 43758.5453);
  for (let i = 0; i < 70; i++) {
    const a = rnd(i) * Math.PI * 2;
    const r = 0.6 + rnd(i + 3) * 2.0;
    const y = 1.1 * Math.sqrt(Math.max(0, 1 - (r / 2.6) ** 2)) - 0.1;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    const t = rnd(i + 11) * Math.PI;
    const len = 0.9 + rnd(i + 7) * 1.4;
    b.beam([x - Math.cos(t) * len * 0.5, y, z - Math.sin(t) * len * 0.5], [x + Math.cos(t) * len * 0.5, y + (rnd(i + 5) - 0.3) * 0.5, z + Math.sin(t) * len * 0.5], 0.035, 4, {
      color: i % 4 ? 0x7a6450 : 0xb8a888,
      jitter: 0.12,
    });
  }
  return b.build();
}
