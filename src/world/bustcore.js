// A sculpted bust: head, neck and shoulders cut flat at the chest, on the
// lines of the busts in a museum's hall of scientists. One recipe, set by a
// look: the face (a man's or a woman's, young or old, the size of the nose),
// the hair (combed back, side-parted, wavy, curly, receding, bald on top,
// wild, long, an eighteenth-century wig, a bun, a bob, a turban, a wrap, a
// bonnet), the beard (a moustache, a full beard, a long one, a pointed one,
// side whiskers), glasses, and the clothes of the time (a coat and cravat, a
// suit and tie, a ruff, a falling band, a robe, a high-collared gown, a
// blouse, a turtleneck, a cardigan). Sculpted with distance fields
// (util/sdfcore.js), then given its finish in vertex colours: weathered
// bronze, dark bronze or white marble.
//
// Nothing here needs three.js: a worker sculpts the busts (workers/sculpt.js)
// and world/bust.js turns the arrays into geometry.
//
// The bust's own frame: y up from the cut at the chest, z out of the face,
// in metres at life size (scale shrinks it).
import { sphere, ellipsoid, cone, roundBox, torus, placed, frameAt, blend, carve, boxed, smax, meshSDFArraysSteps } from '../util/sdfcore.js';

const HEAD_AT = [0, 0.395, 0.012];
const HEAD_TILT = 0.06;

const withB = (fn, b) => {
  fn.b = b;
  return fn;
};

// The hairline: a plane sloping up over the brow (nothing in front of it).
// back moves it back over the crown (receding hair).
function hairline(d, x, y, z, back = 0) {
  return Math.max(d, -0.5 * (y - 0.068 - back * 0.6) + 0.866 * (z - 0.06 + back));
}

// ------------------------------------------------------------ hair
function hairSDF(L) {
  const st = L.hair || 'short';
  const fem = L.sex === 'f';
  const face = ellipsoid(0, -0.02, 0.075, 0.062, 0.095, 0.06);
  // keeps the hair off the face
  const clear = (fn) => {
    const out = (x, y, z) => smax(fn(x, y, z), -face(x, y, z), 0.012);
    out.b = fn.b;
    return out;
  };
  switch (st) {
    case 'none':
      return null;
    case 'short':
    case 'side':
    case 'wavy':
    case 'receding': {
      const grow = st === 'side' ? 0.005 : 0;
      const shell = ellipsoid(0, 0.034, -0.018, 0.082 + grow, 0.104 + grow, 0.104 + grow);
      const back = st === 'receding' ? 0.035 : 0;
      const partX = st === 'side' ? 0.032 : L.part === 'middle' ? 0 : null;
      return withB((x, y, z) => {
        let d = hairline(shell(x, y, z), x, y, z, back);
        if (st === 'wavy') d += 0.0035 * Math.sin(x * 95 + z * 40) * Math.sin(y * 85 + x * 20);
        else d += 0.0011 * Math.sin(x * 300);
        // the parting: a groove (positive inside it, so it is carved away)
        if (partX !== null) d = smax(d, 0.003 - Math.abs(x - partX) - Math.max(0, 0.05 - y) * 2, 0.003);
        return d;
      }, shell.b);
    }
    case 'curly': {
      const shell = ellipsoid(0, 0.036, -0.018, 0.088, 0.11, 0.11);
      return withB((x, y, z) => {
        const d = hairline(shell(x, y, z), x, y, z, 0.005);
        return d + 0.0055 * Math.sin(x * 150) * Math.sin(y * 150) * Math.sin(z * 150);
      }, shell.b);
    }
    case 'bald': {
      // a fringe round the back and over the ears, the crown bare
      const shell = ellipsoid(0, 0.025, -0.02, 0.08, 0.1, 0.1);
      return withB((x, y, z) => {
        let d = shell(x, y, z);
        d = Math.max(d, y - 0.045 + Math.max(0, -z - 0.04) * 0.2);
        d = Math.max(d, z - 0.015);
        return d + 0.0015 * Math.sin(y * 200 + x * 50);
      }, shell.b);
    }
    case 'wild': {
      // a halo of hair, high off the forehead and out over the ears
      const shell = ellipsoid(0, 0.045, -0.03, 0.1, 0.118, 0.12);
      return clear(
        withB((x, y, z) => {
          let d = hairline(shell(x, y, z), x, y, z, 0.03);
          d += 0.012 * Math.sin(x * 70 + y * 20) * Math.sin(y * 64 - z * 30) * Math.sin(z * 58 + x * 15);
          return d;
        }, [0, 0.045, -0.03, 0.14])
      );
    }
    case 'long':
    case 'wig':
    case 'newton': {
      // down past the ears to the shoulders; a wig curls, long hair waves
      const top = ellipsoid(0, 0.036, -0.02, 0.085, 0.108, 0.106);
      const sides = st === 'wig' ? null : [ellipsoid(0.07, -0.06, -0.035, 0.038, 0.12, 0.07), ellipsoid(-0.07, -0.06, -0.035, 0.038, 0.12, 0.07), ellipsoid(0, -0.06, -0.08, 0.08, 0.12, 0.045)];
      const curls = st === 'newton' ? 0.009 : st === 'long' ? 0.006 : 0.002;
      const parts = [[withB((x, y, z) => hairline(top(x, y, z), x, y, z, st === 'long' ? 0.02 : 0), top.b), 0]];
      if (sides) for (const s of sides) parts.push([s, 0.03]);
      if (st === 'wig') {
        // two rolled curls over each ear and the queue tied at the back
        for (const sx of [1, -1]) {
          parts.push([cone([sx * 0.082, -0.005, -0.055], [sx * 0.082, -0.005, 0.02], 0.017, 0.017), 0.006]);
          parts.push([cone([sx * 0.08, -0.04, -0.055], [sx * 0.08, -0.04, 0.012], 0.016, 0.016), 0.006]);
        }
        parts.push([ellipsoid(0, -0.07, -0.105, 0.022, 0.035, 0.018), 0.01]);
      }
      const joined = blend(parts);
      return clear(withB((x, y, z) => joined(x, y, z) + curls * Math.sin(x * 120) * Math.sin(y * 110) * Math.sin(z * 120), joined.b));
    }
    case 'bun': {
      // drawn back from a middle parting into a bun high at the back
      const shell = ellipsoid(0, 0.03, -0.018, 0.08, 0.1, 0.1);
      const bun = sphere(0, L.bunY ?? 0.055, -0.108, 0.036);
      const hair = withB((x, y, z) => {
        let d = hairline(shell(x, y, z), x, y, z, -0.004);
        d = smax(d, 0.0025 - Math.abs(x) - Math.max(0, 0.06 - y), 0.003);
        return d + 0.0008 * Math.sin(Math.atan2(x, z) * 60);
      }, shell.b);
      return blend([
        [hair, 0],
        [withB((x, y, z) => bun(x, y, z) + 0.002 * Math.sin(Math.atan2(y - 0.055, x) * 14), bun.b), 0.015],
      ]);
    }
    case 'bob': {
      // to the jaw, cut straight
      const shell = ellipsoid(0, 0.012, -0.022, 0.088, 0.118, 0.108);
      return clear(
        withB((x, y, z) => {
          let d = hairline(shell(x, y, z), x, y, z, -0.006);
          d = Math.max(d, -0.062 - y);
          if (L.part === 'side') d = smax(d, 0.003 - Math.abs(x - 0.03) - Math.max(0, 0.06 - y), 0.003);
          return d + 0.0012 * Math.sin(x * 250 + y * 40);
        }, shell.b)
      );
    }
    case 'turban': {
      // the dome, and the cloth wound round it in layers
      const dome = ellipsoid(0, 0.07, -0.012, 0.092, 0.078, 0.102);
      const parts = [[withB((x, y, z) => Math.max(dome(x, y, z), -y + 0.02), dome.b), 0]];
      for (let i = 0; i < 3; i++) {
        const ring = torus(0, 0, 0, 0.088 - i * 0.008, 0.016);
        parts.push([placed(ring, frameAt([0, 0.045 + i * 0.026, -0.012 - i * 0.004], [0.18 + i * 0.05, 0, 0])), 0.008]);
      }
      return blend(parts);
    }
    case 'wrap': {
      // a tall wrapped cloth, folded
      const w = ellipsoid(0, 0.085, -0.025, 0.094, 0.1, 0.108);
      return clear(
        withB((x, y, z) => {
          const d = Math.max(w(x, y, z), -y + 0.005);
          return d + 0.0035 * Math.sin((y + 0.4 * x) * 120);
        }, w.b)
      );
    }
    case 'bonnet': {
      // a bonnet open round the face, and its ribbon under the chin
      const b = ellipsoid(0, 0.04, -0.03, 0.096, 0.112, 0.11);
      const brim = placed(torus(0, 0, 0, 0.082, 0.012), frameAt([0, 0.005, 0.055], [Math.PI / 2 - 0.25, 0, 0]));
      return blend([
        [withB((x, y, z) => Math.max(b(x, y, z), z - 0.055 - y * 0.25), b.b), 0],
        [brim, 0.012],
        [cone([0.07, -0.03, 0.02], [0.02, -0.105, 0.07], 0.006, 0.005), 0.004],
        [cone([-0.07, -0.03, 0.02], [-0.02, -0.105, 0.07], 0.006, 0.005), 0.004],
      ]);
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------ beards
function beardSDF(L) {
  const st = L.beard || 'none';
  const parts = [];
  const tache = (droop = 1) => {
    parts.push([cone([0.003, -0.05, 0.096], [0.034, -0.062 - 0.008 * droop, 0.083], 0.0105, 0.006), 0.005]);
    parts.push([cone([-0.003, -0.05, 0.096], [-0.034, -0.062 - 0.008 * droop, 0.083], 0.0105, 0.006), 0.005]);
  };
  if (st === 'none') return null;
  if (st === 'mustache') tache(1);
  if (st === 'sideburns') {
    // side whiskers down the cheeks, the chin shaved
    for (const s of [1, -1]) parts.push([ellipsoid(s * 0.066, -0.035, 0.012, 0.016, 0.05, 0.03), 0.01]);
  }
  if (st === 'pointed') {
    tache(0.6);
    parts.push([cone([0, -0.092, 0.084], [0, -0.165, 0.098], 0.024, 0.005), 0.01]);
  }
  if (st === 'short' || st === 'full' || st === 'long') {
    tache(st === 'short' ? 0.4 : 1);
    const t = st === 'short' ? 0.007 : 0.014;
    const jaw = ellipsoid(0, -0.06, 0.04, 0.066 + t, 0.074 + t, 0.064 + t);
    parts.push([
      withB((x, y, z) => {
        // the jaw and chin, not above the cheekbones or over the mouth
        let d = Math.max(jaw(x, y, z), y + 0.03 - Math.abs(x) * 0.25);
        d = smax(d, -ellipsoid(0, -0.066, 0.095, 0.02, 0.009, 0.03)(x, y, z), 0.004);
        return d + 0.0022 * Math.sin(x * 160 + y * 60) * Math.sin(y * 140);
      }, jaw.b),
      0.008,
    ]);
    if (st === 'long') {
      const fall = ellipsoid(0, -0.15, 0.058, 0.058, 0.1, 0.05);
      parts.push([withB((x, y, z) => fall(x, y, z) + 0.004 * Math.sin(x * 90 + y * 30) * Math.sin(y * 70 - x * 40), fall.b), 0.03]);
    }
  }
  return parts.length ? blend(parts) : null;
}

// ------------------------------------------------------------ the head
function headSDF(L) {
  const fem = L.sex === 'f';
  const jw = fem ? 0.9 : 1;
  const ns = L.nose || 1;
  const age = L.age ?? 0.5;
  const parts = [
    [ellipsoid(0, 0.02, -0.01, fem ? 0.069 : 0.072, 0.1, 0.093), 0],
    [ellipsoid(0, -0.042, 0.026, 0.056 * jw, 0.072, 0.068), 0.035],
    [ellipsoid(0, fem ? -0.097 : -0.1, 0.055, 0.024 * jw, 0.022, 0.026), 0.03],
    [ellipsoid(0.03, 0.026, 0.072, 0.03, fem ? 0.009 : 0.012, 0.022), 0.016],
    [ellipsoid(-0.03, 0.026, 0.072, 0.03, fem ? 0.009 : 0.012, 0.022), 0.016],
    [cone([0, 0.012, 0.082], [0, -0.034, 0.104 + 0.004 * ns], 0.0085 * ns, 0.0135 * ns), 0.012],
    [ellipsoid(0.044, -0.014, 0.056, 0.022, 0.018, 0.02), 0.022],
    [ellipsoid(-0.044, -0.014, 0.056, 0.022, 0.018, 0.02), 0.022],
    [ellipsoid(0.073, -0.004, -0.008, 0.011, 0.029, 0.019), 0.008],
    [ellipsoid(-0.073, -0.004, -0.008, 0.011, 0.029, 0.019), 0.008],
    // the lips
    [ellipsoid(0, -0.06, 0.09, 0.019, 0.0055, 0.009), 0.006],
    [ellipsoid(0, -0.071, 0.088, 0.017, 0.0065, 0.009), 0.006],
  ];
  const hair = hairSDF(L);
  if (hair) parts.push([hair, 0.008]);
  const beard = beardSDF(L);
  if (beard) parts.push([beard, 0.006]);
  const face = blend(parts);
  // the eyes under the brows, the hollows of the cheeks (deeper with age),
  // the line of the mouth
  const cut = [
    [sphere(0.03, 0.008, 0.088, 0.016), 0.01],
    [sphere(-0.03, 0.008, 0.088, 0.016), 0.01],
    [ellipsoid(0, -0.0655, 0.098, 0.017, 0.0016, 0.006), 0.002],
  ];
  if (age > 0.4) {
    const k = 0.005 + age * 0.008;
    cut.push([ellipsoid(0.05, -0.05, 0.052 + k, 0.012, 0.018, 0.01), 0.016]);
    cut.push([ellipsoid(-0.05, -0.05, 0.052 + k, 0.012, 0.018, 0.01), 0.016]);
  }
  const carved = carve(face, cut);
  const eyes = [
    [carved, 0],
    [sphere(0.03, 0.006, 0.075, 0.0095), 0.004],
    [sphere(-0.03, 0.006, 0.075, 0.0095), 0.004],
  ];
  if (L.glasses) {
    // round rims on the nose, the arms back to the ears
    for (const s of [1, -1]) {
      eyes.push([placed(torus(0, 0, 0, 0.021, 0.0026), frameAt([s * 0.031, 0.006, 0.097], [Math.PI / 2, 0, 0])), 0]);
      eyes.push([cone([s * 0.052, 0.008, 0.094], [s * 0.074, 0.006, 0.0], 0.0022, 0.0022), 0.002]);
    }
    eyes.push([cone([0.01, 0.01, 0.1], [-0.01, 0.01, 0.1], 0.0022, 0.0022), 0.002]);
  }
  const head = blend(eyes);
  const s = fem ? 0.97 : 1;
  const k = 1 / s;
  const scaled = withB((x, y, z) => head(x * k, y * k, z * k) * s, [0, 0, 0, 0.2]);
  return placed(scaled, frameAt(HEAD_AT, [HEAD_TILT, 0, 0]));
}

// ------------------------------------------------------------ the shoulders
function torsoSDF(L) {
  const fem = L.sex === 'f';
  const w = fem ? 0.92 : 1;
  const P = [];
  const add = (fn, k) => P.push([fn, k]);
  add(ellipsoid(0, 0.105, -0.005, 0.19 * w, 0.15, 0.105), 0);
  for (const s of [1, -1]) add(sphere(s * 0.148 * w, 0.165, -0.015, 0.07 * w), 0.06);
  add(cone([0, 0.2, -0.012], [0, 0.335, 0.004], fem ? 0.047 : 0.053, fem ? 0.043 : 0.048), 0.03);
  const dress = L.dress || 'coat';
  // a coat's or jacket's lapels: two folds down from the collar in a V
  const lapels = (open = 0.05, low = 0.06) => {
    for (const s of [1, -1]) {
      add(
        placed(roundBox(0, 0, 0, 0.022, 0.085, 0.006, 0.004), frameAt([s * (0.045 + open * 0.3), low + 0.095, 0.09], [-0.25, s * 0.35, s * 0.42])),
        0.008
      );
    }
  };
  const collarAt = (h = 0.26, r = 0.06) => add(torus(0, h, 0.004, r, 0.012), 0.012);
  switch (dress) {
    case 'coat': {
      // a high collar standing behind the neck, the lapels, a cravat
      add(placed(torus(0, 0, 0, 0.067, 0.012), frameAt([0, 0.27, -0.01], [0.35, 0, 0])), 0.012);
      lapels(0.05, 0.05);
      add(ellipsoid(0, 0.235, 0.07, 0.042, 0.03, 0.022), 0.012);
      for (const s of [1, -1]) add(cone([s * 0.02, 0.26, 0.06], [s * 0.04, 0.31, 0.05], 0.007, 0.003), 0.004);
      break;
    }
    case 'suit': {
      lapels(0.04, 0.04);
      for (const s of [1, -1]) add(placed(roundBox(0, 0, 0, 0.02, 0.012, 0.004, 0.003), frameAt([s * 0.03, 0.262, 0.06], [-0.6, s * 0.5, s * 0.5])), 0.004);
      add(roundBox(0, 0.17, 0.085, 0.012, 0.08, 0.005, 0.004), 0.006);
      add(ellipsoid(0, 0.25, 0.066, 0.015, 0.012, 0.01), 0.004);
      break;
    }
    case 'cardigan': {
      // a soft knitted jacket open over a shirt and tie
      lapels(0.02, 0.0);
      add(roundBox(0, 0.17, 0.083, 0.012, 0.075, 0.005, 0.004), 0.006);
      collarAt(0.262, 0.056);
      break;
    }
    case 'ruff': {
      // a pleated ruff round the neck, the doublet buttoned below
      const ruff = torus(0, 0.262, 0.004, 0.078, 0.024);
      add(withB((x, y, z) => ruff(x, y, z) + 0.006 * Math.sin(Math.atan2(x, z - 0.004) * 36), ruff.b), 0.004);
      for (let i = 0; i < 4; i++) add(sphere(0, 0.2 - i * 0.04, 0.1 - i * 0.004, 0.006), 0.003);
      break;
    }
    case 'band': {
      // a plain white collar falling flat over the shoulders
      add(placed(roundBox(0, 0, 0, 0.11, 0.004, 0.06, 0.004), frameAt([0, 0.235, 0.035], [0.5, 0, 0])), 0.01);
      for (let i = 0; i < 4; i++) add(sphere(0, 0.18 - i * 0.04, 0.1 - i * 0.004, 0.006), 0.003);
      break;
    }
    case 'robe': {
      // a robe draped over one shoulder and across the chest
      const fold = cone([0.15, 0.2, 0.02], [-0.11, 0.03, 0.095], 0.05, 0.04);
      add(withB((x, y, z) => fold(x, y, z) + 0.004 * Math.sin((x - y) * 90), fold.b), 0.03);
      add(cone([0.14, 0.215, -0.02], [0.05, 0.06, 0.08], 0.03, 0.026), 0.02);
      break;
    }
    case 'eastern': {
      // a robe crossed over at the front, with a wide collar band
      add(cone([0.06, 0.27, 0.05], [-0.05, 0.05, 0.1], 0.016, 0.014), 0.01);
      add(cone([-0.06, 0.27, 0.05], [0.0, 0.12, 0.1], 0.014, 0.012), 0.01);
      break;
    }
    case 'gown': {
      // a high collar to the jaw, a gathered bodice, a brooch at the throat
      add(cone([0, 0.24, 0.0], [0, 0.31, 0.004], fem ? 0.055 : 0.06, 0.05), 0.02);
      add(sphere(0, 0.258, 0.058, 0.01), 0.002);
      for (let i = -2; i <= 2; i++) add(cone([i * 0.03, 0.2, 0.09], [i * 0.035, 0.03, 0.105], 0.006, 0.006), 0.012);
      break;
    }
    case 'shawl': {
      // a low neckline under a shawl over the shoulders
      for (const s of [1, -1]) add(cone([s * 0.16, 0.17, 0.02], [s * 0.03, 0.08, 0.1], 0.026, 0.02), 0.02);
      break;
    }
    case 'blouse': {
      // a blouse's collar and a jacket over it
      for (const s of [1, -1]) add(placed(roundBox(0, 0, 0, 0.026, 0.016, 0.004, 0.003), frameAt([s * 0.032, 0.262, 0.058], [-0.55, s * 0.45, s * 0.55])), 0.004);
      lapels(0.06, 0.02);
      break;
    }
    case 'turtleneck': {
      // a rolled neck under a jacket
      add(cone([0, 0.22, 0], [0, 0.3, 0.004], 0.06, 0.055), 0.015);
      for (let i = 0; i < 3; i++) add(torus(0, 0.24 + i * 0.022, 0.003, 0.055, 0.008), 0.006);
      lapels(0.07, 0.02);
      break;
    }
    case 'dashiki': {
      // a loose garment with an embroidered yoke round the neck
      add(torus(0, 0.25, 0.01, 0.075, 0.01), 0.01);
      add(torus(0, 0.235, 0.01, 0.095, 0.006), 0.008);
      break;
    }
    default:
      break;
  }
  const body = blend(P);
  // cut flat underneath, as busts are
  const out = (x, y, z) => smax(body(x, y, z), -y, 0.004);
  out.b = body.b;
  return out;
}

// ------------------------------------------------------------ the finish
// sRGB to the linear values three.js keeps colours in (its Color does the
// same with a hex value); the mixing below is done in linear light, as
// Color.lerp does it
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = (h) => [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)];
const BRONZE = hex(0x6e5230);
const DARK = hex(0x5c4634);
const VERDIGRIS = hex(0x5a8a74);
const MARBLE = hex(0xe8e2d6);
const VEIN = hex(0x9a9890);
const RUBBED = hex(0xc49a5c);

function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v),
    w
  );
}

// Vertex colours for the finish, in linear light.
function* finish(pos, nrm, kind) {
  const n = pos.length / 3;
  const col = new Float32Array(n * 3);
  const c = [0, 0, 0];
  const mix = (a, b, t) => {
    c[0] = a[0] + (b[0] - a[0]) * t;
    c[1] = a[1] + (b[1] - a[1]) * t;
    c[2] = a[2] + (b[2] - a[2]) * t;
  };
  for (let i = 0; i < n; i++) {
    if (i % 3000 === 2999) yield;
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const ny = nrm[i * 3 + 1];
    let k;
    if (kind === 'marble') {
      // white stone with faint grey veins, greyer where the rain does not
      // wash it
      const v = noise3(x * 30 + y * 12, y * 30, z * 30);
      const vein = Math.max(0, 1 - Math.abs(v - 0.5) * 18);
      mix(MARBLE, VEIN, vein * 0.35);
      k = 0.86 + 0.14 * Math.max(0, Math.min(1, (ny + 0.9) / 1.1));
    } else {
      // bronze: green where the rain runs and sits, brown in shelter
      const n1 = noise3(x * 9, y * 9, z * 9);
      const streak = noise3(x * 18, y * 4.5, z * 18);
      let g = Math.max(0, Math.min(1, (ny - 0.15) / 0.75)) * 0.55 + (n1 - 0.5) * 0.35 + (streak > 0.72 ? 0.2 : 0);
      if (kind === 'dark') g *= 0.45;
      g = Math.max(0, Math.min(0.8, g));
      mix(kind === 'dark' ? DARK : BRONZE, VERDIGRIS, g);
      k = 0.82 + 0.18 * Math.max(0, Math.min(1, (ny + 0.9) / 1.1));
      // the nose rubbed bright by people who touch it for luck
      const dy = y - 0.36;
      const dz = z - 0.12;
      if (x * x + dy * dy + dz * dz < 0.0004) {
        c[0] += (RUBBED[0] - c[0]) * 0.6;
        c[1] += (RUBBED[1] - c[1]) * 0.6;
        c[2] += (RUBBED[2] - c[2]) * 0.6;
      }
    }
    col[i * 3] = c[0] * k;
    col[i * 3 + 1] = c[1] * k;
    col[i * 3 + 2] = c[2] * k;
  }
  return col;
}

// Sculpt a bust, a little at a time: the head finely, the shoulders more
// coarsely, joined, finished. Yields often; returns { position, normal,
// color, index } arrays, scaled. coarse: a lighter copy (about a fifth of
// the triangles) for seeing from further off.
export function* bustArraysSteps(L, scale = 0.85, coarse = false) {
  const longBelow = L.beard === 'long' || ['long', 'newton', 'wig'].includes(L.hair);
  const hLo = [-0.14, longBelow ? 0.17 : 0.27, -0.16];
  const hHi = [0.14, 0.56, 0.16];
  const head = yield* meshSDFArraysSteps(boxed(headSDF(L), hLo, hHi), [hLo[0] - 0.01, hLo[1] - 0.01, hLo[2] - 0.01], [hHi[0] + 0.01, hHi[1] + 0.01, hHi[2] + 0.01], coarse ? 0.0135 : 0.0062);
  const torso = yield* meshSDFArraysSteps(torsoSDF(L), [-0.24, -0.01, -0.15], [0.24, 0.345, 0.16], coarse ? 0.022 : 0.011);
  yield;
  // the two pieces in one set of arrays
  const nh = head.position.length;
  const position = new Float32Array(nh + torso.position.length);
  position.set(head.position);
  position.set(torso.position, nh);
  const normal = new Float32Array(position.length);
  normal.set(head.normal);
  normal.set(torso.normal, nh);
  const index = new Uint32Array(head.index.length + torso.index.length);
  index.set(head.index);
  const off = nh / 3;
  for (let i = 0; i < torso.index.length; i++) index[head.index.length + i] = torso.index[i] + off;
  yield;
  const color = yield* finish(position, normal, L.finish || 'bronze');
  for (let i = 0; i < position.length; i++) position[i] *= scale;
  return { position, normal, color, index };
}

// A whole bust at once (in a worker, or for tools and tests).
export function bustArrays(L, scale, coarse = false) {
  const it = bustArraysSteps(L, scale, coarse);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Smaller arrays for the graphics chip and the trip from the worker:
// normals and colours as normalised 16-bit integers, indices 16-bit when
// they fit. (The placeholder in world/scientists.js has the same formats, so
// the drawing set up while loading fits the sculpted bust.)
export function packBust(a) {
  const n = a.normal.length;
  const normal = new Int16Array(n);
  const color = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    normal[i] = Math.round(Math.max(-1, Math.min(1, a.normal[i])) * 32767);
    color[i] = Math.round(Math.max(0, Math.min(1, a.color[i])) * 65535);
  }
  const index = a.position.length / 3 <= 65535 ? Uint16Array.from(a.index) : a.index;
  return { position: a.position, normal, color, index };
}
