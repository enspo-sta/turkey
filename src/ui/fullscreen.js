// Full screen through the Fullscreen API, with the webkit prefix older Safari
// on iPad and Mac still needs. Safari on iPhone lets only videos fill the
// screen, so there the button says what does work: the game added to the
// Home Screen opens full screen, as its web app manifest asks.

const doc = () => (typeof document !== 'undefined' ? document : null);

// Can this page ask to fill the screen?
export function canFullscreen() {
  const d = doc();
  if (!d) return false;
  const el = d.documentElement;
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return false;
  // false where the page may not, such as a frame not allowed to
  const on = d.fullscreenEnabled ?? d.webkitFullscreenEnabled;
  return on !== false;
}

export function isFullscreen() {
  const d = doc();
  return !!(d && (d.fullscreenElement || d.webkitFullscreenElement));
}

// Filling the screen already by how it was started: from the Home Screen as
// a web app, or in the iOS app.
export function startedFullscreen() {
  if (typeof window === 'undefined') return false;
  const w = window;
  if (w.webkit && w.webkit.messageHandlers && w.webkit.messageHandlers.store) return true;
  if (w.navigator && w.navigator.standalone === true) return true;
  const mm = typeof w.matchMedia === 'function' ? (q) => w.matchMedia(q).matches : () => false;
  return mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)');
}

// In or out of full screen. Called from a tap or a click: browsers allow the
// request only then. Resolves when done, rejects when the browser says no.
export function toggleFullscreen() {
  const d = doc();
  if (!d) return Promise.reject(new Error('no document'));
  if (isFullscreen()) {
    const exit = d.exitFullscreen || d.webkitExitFullscreen;
    return Promise.resolve(exit ? exit.call(d) : undefined);
  }
  const el = d.documentElement;
  try {
    // (the old webkit method takes no options and returns nothing)
    return Promise.resolve(el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
  } catch (e) {
    return Promise.reject(e);
  }
}

export function onFullscreenChange(fn) {
  const d = doc();
  if (!d) return;
  d.addEventListener('fullscreenchange', fn);
  d.addEventListener('webkitfullscreenchange', fn);
}

// What to say where the page cannot fill the screen.
export function fullscreenHelp() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  let framed = false;
  try {
    framed = window.self !== window.top;
  } catch (e) {
    framed = true;
  }
  if (/iPhone|iPod/.test(ua)) {
    return framed
      ? 'An iPhone lets only videos fill the screen, and nothing inside another page or app. The game on its own page, added to the Home Screen (Share, in the \u00b7\u00b7\u00b7 menu on iOS 26, then Add to Home Screen) and started from its icon, opens full screen.'
      : 'An iPhone lets only videos fill the screen from Safari. Add the game to the Home Screen (Share, in the \u00b7\u00b7\u00b7 menu on iOS 26, then Add to Home Screen) and start it from its icon: it opens full screen.';
  }
  return framed ? 'Full screen is not allowed for the game inside this page or app.' : 'This browser does not let a web page fill the screen.';
}
