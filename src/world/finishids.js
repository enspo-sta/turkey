// The surface finishes' names and the numbers the model builder stores for
// them (see world/finish.js), on their own so the builder carries nothing of
// the finishes' drawing (a worker builds models too, see workers/sculpt.js).
export const FINISHES = ['plank', 'batten', 'log', 'shingle', 'stone', 'metal', 'deck', 'concrete'];
export const FINISH_ID = Object.fromEntries(FINISHES.map((n, i) => [n, i + 1]));
