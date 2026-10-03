// Every line the announcer says and every name it says after one, as JSON
// for make-voice.py: [{ key, say }]. The key is what the game shows (see
// voiceKey in src/audio/voice.js); say is what the voice reads, spelled out
// where the speech model would stumble (numbers, star names).
// Usage: node tools/voice/lines.mjs > tools/out/voice-lines.json
import { LINES } from '../../src/audio/lines.js';
import { voiceKey } from '../../src/audio/voicekey.js';
import { FISH, LEGENDS } from '../../src/gameplay/data.js';
import { TARGETS } from '../../src/gameplay/skytargets.js';
import { METEORITES } from '../../src/world/meteors.js';
import { KP_WORDS } from '../../src/world/spaceweather.js';

// "FISH ON! FISH ON!" reads as "Fish on! Fish on!": capitals make some
// speech models spell words out
const sentence = (t) => t.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
// names the model says wrongly as written, respelled as they sound
const RESPELL = {
  albireo: 'Al-beer-ee-oh',
  'mizar and alcor': 'My-zar and Al-core',
  "bode's galaxy and the cigar": "Bohda's Galaxy and the Cigar",
  kokanee: 'Koh-kuh-nee',
};

const out = new Map();
const add = (shown, say) => {
  const key = voiceKey(shown);
  if (!out.has(key)) out.set(key, { key, say: say || RESPELL[key] || sentence(shown) });
};
const bang = (s) => (/[.!?]$/.test(s) ? s : s + '!');

// the lines themselves
for (const list of Object.values(LINES)) for (const [text] of list) add(text);
// a new species, a legend, a personal best: the fish's name
for (const f of Object.values(FISH)) add(f.name, bang(RESPELL[voiceKey(f.name)] || sentence(f.name)));
for (const l of Object.values(LEGENDS)) add(l.name, bang(l.name));
// the sky: where a fireball came down, meteorites, telescope targets
for (const d of ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']) add(`IT CAME DOWN TO THE ${d.toUpperCase()}`, `It came down to the ${d}!`);
for (const m of Object.values(METEORITES)) add(m.name, bang(m.name));
for (const t of TARGETS) add(t.name, bang(RESPELL[voiceKey(t.name)] || t.name));
add('MERCURY TO SATURN', 'Mercury to Saturn!');
add('ROUND THE EARTH EVERY 92 MINUTES', 'Round the Earth every ninety-two minutes!');
for (let kp = 5; kp < KP_WORDS.length; kp++) add(`KP ${kp}: ${KP_WORDS[kp].toUpperCase()}`, `K-P ${NUM[kp]}, ${KP_WORDS[kp]}!`);
add('METEOR OUTBURST TONIGHT', 'Meteor outburst tonight!');
// bears, finds and speed records
add('GRIZZLY!', 'Grizzly!');
add('BLACK BEAR!', 'Black bear!');
add('BLURRY, AS TRADITION DEMANDS', 'Blurry, as tradition demands.');
add("OLD EARL'S LUCKY LURE!", "Old Earl's lucky lure!");
add('$600!', 'Six hundred dollars!');
add("GUS'S GOLD!", "Gus's gold!");
add('PROPERTY OF GUS', 'Property of Gus!');
add('GUS LEFT A NOTE', 'Gus left a note!');
add('IN THE MIDDLE OF THE WOODS', 'In the middle of the woods!');
for (const [kmh, words] of [[200, 'Two hundred'], [250, 'Two hundred and fifty'], [300, 'Three hundred']]) add(`${kmh} KM/H`, `${words} kilometres an hour!`);
// the sample in Settings
add('A BEAUTIFUL KING SALMON!', 'A beautiful king salmon!');

console.log(JSON.stringify([...out.values()], null, 1));
