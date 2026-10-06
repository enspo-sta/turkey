// The sculptor's worker's code (workers/sculpt.js), carried in the game's
// script as text (build.mjs), and the one blob URL workers are started from:
// named here only, so the text is in the game once however many start it
// (the busts, world/scientists.js, and Tesla's statue, world/tesla.js).
// Null where the browser cannot start a worker from it.
let url;
export function sculptorURL() {
  if (url !== undefined) return url;
  url = null;
  let src = null;
  try {
    src = typeof __SCULPT_WORKER__ === 'string' ? __SCULPT_WORKER__ : null;
  } catch (e) {
    src = null;
  }
  if (src && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    } catch (e) {
      url = null;
    }
  }
  return url;
}
