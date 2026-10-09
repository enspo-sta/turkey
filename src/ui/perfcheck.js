// The performance check (Settings, during a game): about 15 seconds of play
// measured on the device itself, to say what holds the frame rate back.
//
// It records, frame by frame, the time from one frame to the next and the
// processor's own work on each: first at the graphics as they are, then at
// the lowest resolution. From those it tells apart:
// - full speed: about 60 frames a second, nothing to fix;
// - the graphics chip: fewer pixels make the frames quicker;
// - the processor: the game's own work fills the frame, and fewer pixels
//   do not help;
// - a cap: frames held at a steady 30 a second while the processor idles
//   half the time, and fewer pixels do not help (Safari in Low Power Mode,
//   or a hot phone).
// The result ends in one line to copy and send, with the device, the
// graphics and the state of the sound in it.

const SETTLE = 2;
const MEASURE = 6;
const SETTLE_LOW = 1.5;
const MEASURE_LOW = 5;

export class PerfCheck {
  constructor(game) {
    this.game = game;
    this.run = null;
    this.result = null;
    // the longest a check may take, in ms
    this.maxWall = 90000;
  }

  get busy() {
    return !!this.run;
  }

  // The verdict for a record made elsewhere (the checks in tools/ use it).
  analyse(r) {
    return analyse(r, this.game);
  }

  // Starts the check; onDone(result) is called at the end (result.cancelled
  // when the player opened a menu or left the game meanwhile).
  start(onDone) {
    const g = this.game;
    if (this.run || !g.started) return false;
    const steady = { q: g.qualityName, d: g.dpr };
    const low = g.minDpr(g.qualityName);
    this.run = { phase: 'settle', t: 0, began: performance.now(), base: [], low: [], steady, lowDpr: low, onDone };
    g.adaptHold = true;
    this.status = g.hud.toast('Checking performance: stand still and look ahead for 15 seconds', '', 15);
    g.frameProbe = (dt, cpu) => this.sample(dt, cpu);
    return true;
  }

  sample(dt, cpu) {
    const g = this.game;
    const r = this.run;
    if (!r) return;
    if (g.menuOpen || !g.started) {
      this.finish(true);
      return;
    }
    if (!(dt > 0)) return;
    // (a frame held for seconds is the page hidden, not the game's work)
    if (dt > 2) return;
    r.t += dt;
    // never more than a minute and a half, however slow the device
    if (performance.now() - r.began > this.maxWall && r.base.length) {
      this.finish(false);
      return;
    }
    if (r.phase === 'settle') {
      if (r.t >= SETTLE) this.next('base');
    } else if (r.phase === 'base') {
      r.base.push([dt * 1000, cpu]);
      if (r.t >= MEASURE) {
        if (r.lowDpr < g.dpr - 0.01) {
          g.setLevel(g.qualityName, r.lowDpr);
          this.next('settleLow');
        } else this.finish(false);
      }
    } else if (r.phase === 'settleLow') {
      if (r.t >= SETTLE_LOW) this.next('low');
    } else if (r.phase === 'low') {
      r.low.push([dt * 1000, cpu]);
      if (r.t >= MEASURE_LOW) this.finish(false);
    }
  }

  next(phase) {
    this.run.phase = phase;
    this.run.t = 0;
  }

  finish(cancelled) {
    const g = this.game;
    const r = this.run;
    this.run = null;
    g.frameProbe = null;
    g.setLevel(r.steady.q, r.steady.d);
    g.adaptHold = false;
    if (this.status) {
      this.status.classList.add('out');
      this.status = null;
    }
    const res = cancelled ? { cancelled: true } : analyse(r, g);
    this.result = res;
    r.onDone?.(res);
  }
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

// The verdict from the two records.
export function analyse(r, g) {
  const iv = r.base.map((x) => x[0]);
  const cpu = r.base.map((x) => x[1]);
  const sum = iv.reduce((a, b) => a + b, 0);
  const fps = sum > 0 ? (iv.length * 1000) / sum : 0;
  const low1 = pct(iv, 0.99) > 0 ? 1000 / pct(iv, 0.99) : 0;
  const frameMs = sum / Math.max(1, iv.length);
  const cpuMs = median(cpu);
  const share = frameMs > 0 ? cpuMs / frameMs : 0;
  const near = (v, ms, tol) => Math.abs(v - ms) <= tol;
  const at30 = iv.filter((v) => near(v, 1000 / 30, 2.5)).length / Math.max(1, iv.length);
  const lowIv = r.low.map((x) => x[0]);
  const lowSum = lowIv.reduce((a, b) => a + b, 0);
  const lowFps = lowSum > 0 ? (lowIv.length * 1000) / lowSum : null;
  const gain = lowFps ? lowFps / fps - 1 : null;
  let kind;
  let verdict;
  if (iv.length < 60) {
    kind = 'too few frames';
    verdict = `Too few frames to tell (${iv.length} in a minute and a half): the game hardly drew. Run the check again during play, with the game in front.`;
  } else if (fps >= 57) {
    kind = 'full speed';
    verdict = 'Full speed: about 60 frames a second. Nothing holds the game back here.';
  } else if (gain !== null && gain >= 0.1) {
    kind = 'graphics chip';
    verdict = `The graphics chip: with fewer pixels the game ran ${Math.round(gain * 100)}% quicker. With "Adjust graphics automatically" on, the game lowers the resolution by itself when it needs to.`;
  } else if (cpuMs >= 15 || share >= 0.75) {
    // (15 ms is nine tenths of a frame at 60 a second: work that alone
    // leaves no room for 60, whatever the screen then rounds the frames to)
    kind = 'processor';
    verdict = `The processor: the game's own work takes ${cpuMs.toFixed(1)} of every ${frameMs.toFixed(1)} ms, and fewer pixels did not help. A cheaper preset (Medium or Low) does less of that work.`;
  } else if (at30 >= 0.7 && cpuMs < 12) {
    kind = 'cap';
    verdict =
      'A cap at 30 frames a second, not the game’s work: the processor is idle for much of each frame and fewer pixels did not help. Low Power Mode is the usual cause (iPhone Settings, Battery); a hot phone is another. Lowering the graphics would not help.';
  } else {
    kind = 'unclear';
    verdict =
      'Not clear: fewer pixels did not help, and the processor is not busy all the time. A hot phone is the likeliest cause; let it cool and run the check again.';
  }
  const a = g.audio;
  const ctx = a && a.ctx;
  const session = typeof navigator !== 'undefined' && navigator.audioSession ? navigator.audioSession.type : 'none';
  const inApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.store);
  const sound = `${ctx ? ctx.state : 'not started'}, session ${session}, ${inApp ? 'in the app' : 'in the browser'}`;
  const ua = (navigator.userAgent.match(/(iPhone|iPad|Mac|Android|Windows|Linux)[^;)]*/) || [''])[0];
  const ios = (navigator.userAgent.match(/OS (\d+[_.]\d+)/) || [, ''])[1].replace('_', '.');
  const build = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
  const res = {
    kind,
    verdict,
    fps,
    low1,
    frameMs,
    cpuMs,
    share,
    at30,
    lowFps,
    lowDpr: r.lowDpr,
    gain,
    preset: r.steady.q,
    dpr: r.steady.d,
    top: g.ceiling,
    sound,
    frames: iv.length,
  };
  res.line = [
    `Hotrod check ${build}`,
    `${fps.toFixed(1)} fps (1% low ${low1.toFixed(0)})`,
    `frame ${frameMs.toFixed(1)} ms, game work ${cpuMs.toFixed(1)} ms (${Math.round(share * 100)}%)`,
    `steady 30: ${Math.round(at30 * 100)}%`,
    lowFps ? `at ${r.lowDpr.toFixed(2)}x: ${lowFps.toFixed(1)} fps` : r.lowDpr < r.steady.d - 0.01 ? 'fewer pixels not tried (out of time)' : 'already at the lowest resolution',
    `running ${r.steady.q.toUpperCase()} ${r.steady.d.toFixed(2)}x of ${String(g.ceiling || 'high').toUpperCase()}`,
    `screen ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`,
    `verdict: ${kind}`,
    `sound: ${sound}`,
    `${ua}${ios ? ' ' + ios : ''}`,
  ].join(' · ');
  return res;
}
