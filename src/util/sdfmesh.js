// Distance-field sculpting (see sdfcore.js) with three.js geometry out.
import * as THREE from 'three';
import { meshSDFArraysSteps } from './sdfcore.js';

export * from './sdfcore.js';

// Arrays from the mesher as an indexed BufferGeometry.
export function sdfGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  if (a.color) g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  g.setIndex(new THREE.BufferAttribute(a.position.length / 3 > 65535 ? a.index : Uint16Array.from(a.index), 1));
  return g;
}

// A mesh a little at a time: a generator that yields every so often, so it
// can be built over many frames without a hitch; returns the geometry.
export function* meshSDFSteps(sdf, lo, hi, h) {
  return sdfGeometry(yield* meshSDFArraysSteps(sdf, lo, hi, h));
}

// The same all at once.
export function meshSDF(sdf, lo, hi, h) {
  const it = meshSDFSteps(sdf, lo, hi, h);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
