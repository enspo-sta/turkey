// Statistics for tools/perf-compare.mjs: a least-squares fit of each run's
// average frame time on its round, its place in the round and its build, so
// that differences between builds are read within rounds (the machine's
// slow drift taken out) and with the place in the round taken out too.

// two-sided 95% points of Student's t, by degrees of freedom
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
export function t95(df) {
  if (!(df >= 1)) return NaN;
  if (df < T95.length) return T95[Math.floor(df)];
  // (within 0.005 of the true value from 31 degrees of freedom up)
  return 1.96 + 2.4 / df;
}

// Solve the normal equations (X'X) b = X'y by Gauss-Jordan elimination;
// gives the coefficients and the inverse of X'X (for their standard errors),
// or null when the design cannot tell the effects apart.
function solve(X, y) {
  const p = X[0].length;
  const M = [];
  for (let i = 0; i < p; i++) {
    const row = [];
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < X.length; k++) s += X[k][i] * X[k][j];
      row.push(s);
    }
    let r = 0;
    for (let k = 0; k < X.length; k++) r += X[k][i] * y[k];
    for (let j = 0; j < p; j++) row.push(i === j ? 1 : 0);
    row.push(r);
    M.push(row);
  }
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let i = c + 1; i < p; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
    if (Math.abs(M[piv][c]) < 1e-9) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    M[c] = M[c].map((v) => v / d);
    for (let i = 0; i < p; i++) {
      if (i === c) continue;
      const f = M[i][c];
      if (f) M[i] = M[i].map((v, j) => v - f * M[c][j]);
    }
  }
  return { beta: M.map((r) => r[2 * p]), inv: M.map((r) => r.slice(p, 2 * p)) };
}

// runs: [{ round, slot, build, value }] (slot from 0); builds: the build
// names, the first being the one the others are compared with. Gives each
// other build's difference from the first, and each later place's
// difference from the first place in the round, with 95% intervals.
export function fitRounds(runs, builds) {
  const rounds = [...new Set(runs.map((r) => r.round))].sort((a, b) => a - b);
  const slots = Math.max(...runs.map((r) => r.slot)) + 1;
  const cols = [() => 1];
  for (const rd of rounds.slice(1)) cols.push((r) => (r.round === rd ? 1 : 0));
  const slotCol = cols.length;
  for (let s = 1; s < slots; s++) cols.push((r) => (r.slot === s ? 1 : 0));
  const buildCol = cols.length;
  for (const b of builds.slice(1)) cols.push((r) => (r.build === b ? 1 : 0));
  const X = runs.map((r) => cols.map((f) => f(r)));
  const y = runs.map((r) => r.value);
  const df = runs.length - cols.length;
  const sol = df > 0 ? solve(X, y) : null;
  if (!sol) return null;
  let rss = 0;
  X.forEach((x, k) => {
    const e = y[k] - x.reduce((s, v, j) => s + v * sol.beta[j], 0);
    rss += e * e;
  });
  const s2 = rss / df;
  const est = (j) => {
    const b = sol.beta[j];
    const se = Math.sqrt(s2 * sol.inv[j][j]);
    return { diff: b, lo: b - t95(df) * se, hi: b + t95(df) * se };
  };
  return {
    df,
    sd: Math.sqrt(s2),
    builds: builds.slice(1).map((name, i) => ({ name, ...est(buildCol + i) })),
    places: Array.from({ length: slots - 1 }, (_, i) => ({ place: i + 2, ...est(slotCol + i) })),
  };
}

// Orders for the rounds: blocks of k rounds, each block a Latin square (the
// builds in a random order, then that order turned by one place each round,
// the rounds of the block shuffled), so that over a block every build runs
// once in every place.
export function balancedOrders(k, rounds, random = Math.random) {
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const out = [];
  while (out.length < rounds) {
    const base = shuffle([...Array(k).keys()]);
    const block = shuffle([...Array(k).keys()].map((t) => base.map((_, i) => base[(i + t) % k])));
    out.push(...block);
  }
  return out.slice(0, rounds);
}
