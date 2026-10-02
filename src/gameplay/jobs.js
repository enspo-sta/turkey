// Odd jobs: the locals at the Kenai Trading Post always want something. Take
// one job at a time from the board (Trading Post > Odd jobs), do it, and come
// back for the money. Fish jobs are handed in from the cooler; picture jobs
// and errands finish by themselves.
import { FISH } from './data.js';

export const JOBS = [
  { id: 'casserole', who: 'Mrs. Henderson', text: 'wants a Northern Pike over 6 kg for her famous pike casserole. Nobody has the heart to tell her.', kind: 'fish', species: 'pike', minKg: 6, reward: 260 },
  { id: 'gazette', who: 'The Kenai Gazette', text: "needs a three-star picture of a bald eagle for Sunday's front page.", kind: 'photo', subject: 'eagle', stars: 3, reward: 200 },
  { id: 'bigfoot', who: 'Dale from the late-night radio show', text: 'swears Bigfoot walks the forest edges at dawn and dusk. Bring him a picture. Any picture.', kind: 'photo', subject: 'bigfoot', stars: 1, reward: 1000 },
  { id: 'cannery', who: 'The cannery foreman', text: 'is short of fish. Bring in three Sockeye Salmon before the boss notices.', kind: 'fish', species: 'sockeye', count: 3, reward: 300 },
  { id: 'luckylure', who: 'Old Earl', text: 'dropped his lucky lure at Salmon Bend in 1974. Cast there long enough and you might hook it.', kind: 'snag', place: 'bend', reward: 240 },
  { id: 'tourist', who: 'A tourist from Ohio', text: 'will pay good money for a picture of a moose. "A real one, not the mosquito."', kind: 'photo', subject: 'moose', stars: 2, reward: 150 },
  { id: 'chef', who: 'Chef Rosa at the lodge', text: 'needs a Pacific Halibut over 30 kg for the weekend special.', kind: 'fish', species: 'halibut', minKg: 30, reward: 480 },
  { id: 'scientist', who: 'A fisheries scientist', text: 'wants a Sheefish from Mosquito Flats for her study. She promises it will barely notice.', kind: 'fish', species: 'sheefish', reward: 520 },
  { id: 'orcas', who: 'Captain Gus', text: 'wants a picture of the orcas to prove the Unsinkable II never sailed alone.', kind: 'photo', subject: 'orca', stars: 1, reward: 350 },
  { id: 'dryfly', who: 'The fly-fishing club', text: 'bets you cannot catch an Arctic Grayling on the Mosquito Dry Fly. Prove them wrong.', kind: 'fish', species: 'grayling', lure: 'dryfly', reward: 180 },
  { id: 'ranger', who: 'The campground ranger', text: 'needs a bear moved along without anyone getting hurt. A bear whistler arrow should do it.', kind: 'event', event: 'scareOff', reward: 300 },
  { id: 'spa', who: 'Your aching back', text: 'demands a soak in the hot pool at Steaming Springs. It is not asking.', kind: 'event', event: 'soak', reward: 80 },
  { id: 'kings', who: 'The Bear Falls fish counter', text: 'needs a King Salmon over 20 kg to settle a bet with the bears.', kind: 'fish', species: 'king', minKg: 20, reward: 650 },
  { id: 'wolfeel', who: 'The aquarium in Seward', text: 'would love a Wolf Eel. Its face, mostly. Bring one from Shipwreck Cove.', kind: 'fish', species: 'wolfeel', reward: 900 },
  // science: the university, the observatory and the weather service
  { id: 'geologist', who: 'A geologist from the university in Fairbanks', text: 'wants a chip of the granite from the top of the big tor at the Granite Tors, to date the rock. Climb up and bring one down.', kind: 'event', event: 'sample', reward: 280 },
  { id: 'astronomer', who: 'Dr. Okafor at the Tundra Observatory', text: 'needs a two-star picture of the Moon for the school star night. A clear evening, the camera, the Moon.', kind: 'photo', subject: 'moon', stars: 2, reward: 240 },
  { id: 'auroracam', who: 'The weather service in Anchorage', text: 'collects pictures of the northern lights to check its aurora forecasts. Send one.', kind: 'photo', subject: 'aurora', stars: 1, reward: 320 },
];

const PHOTO_NAMES = { bigfoot: 'Bigfoot', orca: 'the orcas', eagle: 'a bald eagle', moose: 'a moose', moon: 'the Moon', aurora: 'the northern lights' };

export function jobById(id) {
  return JOBS.find((j) => j.id === id) || null;
}

// What the job asks for, in a few words.
export function jobGoal(j) {
  if (j.kind === 'fish') {
    const name = FISH[j.species].name;
    if (j.count) return `${j.count} × ${name} in the cooler`;
    if (j.lure) return `${name} caught on the Mosquito Dry Fly`;
    return `${name}${j.minKg ? ` over ${j.minKg} kg` : ''} in the cooler`;
  }
  if (j.kind === 'photo') return `A ${'★'.repeat(j.stars)} picture of ${PHOTO_NAMES[j.subject] || 'it'}`;
  if (j.kind === 'snag') return 'Keep casting at Salmon Bend';
  if (j.event === 'scareOff') return 'Send a bear running with a whistler';
  if (j.event === 'sample') return 'A chip of granite from the top of the big tor';
  return 'A soak in the hot pool';
}

export class Jobs {
  constructor(game) {
    this.game = game;
  }

  get state() {
    return this.game.state;
  }

  current() {
    const s = this.state;
    return s.job ? jobById(s.job.id) : null;
  }

  // Three jobs on the board, changing every day, never ones already done.
  offers() {
    const s = this.state;
    const open = JOBS.filter((j) => !s.jobsDone.includes(j.id));
    if (!open.length) return [];
    const day = this.game.env.day;
    const out = [];
    for (let i = 0; i < Math.min(3, open.length); i++) out.push(open[(day * 5 + i) % open.length]);
    return [...new Set(out)];
  }

  take(id) {
    const s = this.state;
    if (s.job) return false;
    s.job = { id, done: false, n: 0 };
    this.game.hud.toast(`Job taken: ${jobGoal(jobById(id))}`, 'good');
    return true;
  }

  drop() {
    this.state.job = null;
  }

  // The cooler fish that would do for a fish job (indices), the least
  // valuable first: a legend is never handed over while a plain fish will do.
  matching(j) {
    const out = [];
    const C = this.state.cooler;
    C.forEach((f, i) => {
      if (f.species !== j.species) return;
      if (j.minKg && f.weight < j.minKg) return;
      if (j.lure && f.lure !== j.lure) return;
      out.push(i);
    });
    return out.sort((a, b) => (C[a].legend ? 1 : 0) - (C[b].legend ? 1 : 0) || (C[a].value || 0) - (C[b].value || 0));
  }

  // The fish a turn-in would hand over, for the Collect button.
  handOver(j) {
    const C = this.state.cooler;
    return this.matching(j)
      .slice(0, j.count || 1)
      .map((i) => `${C[i].name} ${C[i].weight.toFixed(1)} kg`);
  }

  ready() {
    const j = this.current();
    if (!j) return false;
    if (j.kind === 'fish') return this.matching(j).length >= (j.count || 1);
    return !!this.state.job.done;
  }

  // Hand the job in at the Trading Post.
  turnIn() {
    const g = this.game;
    const s = this.state;
    const j = this.current();
    if (!j || !this.ready()) return false;
    if (j.kind === 'fish') {
      const idx = this.matching(j).slice(0, j.count || 1);
      s.cooler = s.cooler.filter((_, i) => !idx.includes(i));
    }
    s.addMoney(j.reward);
    s.jobsDone.push(j.id);
    s.job = null;
    g.audio?.cash();
    g.announcer?.say('jobDone', { banner: false });
    g.hud.toast(`${j.who} pays you $${j.reward}. "Pleasure doing business"`, 'money');
    g.onEvent({ type: 'job', id: j.id });
    return true;
  }

  finish() {
    const s = this.state;
    if (!s.job || s.job.done || !this.current()) return;
    s.job.done = true;
    const j = this.current();
    this.game.hud.toast(`Job done: ${jobGoal(j)}. Collect from ${j.who} at the Trading Post`, 'good');
    this.game.audio?.chime();
  }

  // Hooks from the rest of the game.
  onPhoto(id, stars) {
    const j = this.current();
    if (j && j.kind === 'photo' && j.subject === id && stars >= j.stars) this.finish();
  }

  onEvent(type) {
    const j = this.current();
    if (j && j.kind === 'event' && j.event === type) this.finish();
  }

  // Each cast at Salmon Bend has a small chance to bring up Old Earl's lure.
  onCastLanded(placeId) {
    const j = this.current();
    if (!j || j.kind !== 'snag' || this.state.job.done || placeId !== j.place) return false;
    this.state.job.n = (this.state.job.n || 0) + 1;
    if (Math.random() < 0.06 + this.state.job.n * 0.025) {
      this.game.announcer?.say('treasure', { sub: "OLD EARL'S LUCKY LURE!", kind: 'legend' });
      this.finish();
      return true;
    }
    return false;
  }
}
