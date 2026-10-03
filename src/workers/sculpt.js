// The sculptor's worker: busts carved from their looks off the main thread,
// so a phone's frames never wait for them (see world/scientists.js). It is
// built on its own and carried in the game's script as text (build.mjs).
import { bustArrays, packBust } from '../world/bustcore.js';

self.onmessage = (e) => {
  const { id, look, scale } = e.data;
  try {
    // the bust close up, and a lighter copy for further off
    const fine = packBust(bustArrays(look, scale));
    const coarse = packBust(bustArrays(look, scale, true));
    const bufs = [];
    for (const a of [fine, coarse]) bufs.push(a.position.buffer, a.normal.buffer, a.color.buffer, a.index.buffer);
    self.postMessage({ id, fine, coarse }, bufs);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
